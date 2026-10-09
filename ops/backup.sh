#!/bin/sh
set -u
retencao=${RETENCAO_DIAS:-30}
case "$retencao" in ''|*[!0-9]*) echo "RETENCAO_DIAS deve ser inteiro positivo" >&2; exit 1;; esac
[ "$retencao" -gt 0 ] || exit 1
mkdir -p /backups
while true; do
    destino="/backups/quadro-$(date +%Y%m%d).dump"
    # Se reiniciar depois das 02h, recupera o backup do dia que ficou pendente.
    if [ "$(date +%H)" -ge 2 ] || [ "${BACKUP_ONCE:-false}" = true ]; then
        if [ ! -s "$destino" ]; then
            temporario="${destino}.tmp"
            if pg_dump -Fc -f "$temporario" && pg_restore --list "$temporario" >/dev/null; then
                mv "$temporario" "$destino"
                echo "Backup concluido: $destino"
                find /backups -name 'quadro-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9].dump' -mtime +"$retencao" -delete
            else
                echo "Falha no backup; nova tentativa em 60 segundos" >&2
                [ "${BACKUP_ONCE:-false}" != true ] || exit 1
            fi
        fi
    fi
    [ "${BACKUP_ONCE:-false}" != true ] || exit 0
    sleep 60
done
