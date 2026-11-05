"""Migrações ordenadas e transacionais; SQL completo, sem parser por ponto e vírgula."""
import hashlib
import importlib.util
from .paths import ROOT


def aplicar(cur):
    cur.execute('''CREATE TABLE IF NOT EXISTS migracoes_aplicadas (
        nome text PRIMARY KEY, checksum text NOT NULL, aplicado_em timestamptz NOT NULL DEFAULT now())''')
    for path in sorted((ROOT / 'db' / 'migrations').glob('[0-9]*.py')):
        checksum = hashlib.sha256(path.read_bytes()).hexdigest()
        cur.execute('SELECT checksum FROM migracoes_aplicadas WHERE nome=%s', (path.name,))
        row = cur.fetchone()
        if row:
            if row[0] != checksum:
                raise RuntimeError(f'Migração já aplicada foi modificada: {path.name}')
            continue
        spec = importlib.util.spec_from_file_location('migracao_' + path.stem, path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.aplicar(cur)
        cur.execute('INSERT INTO migracoes_aplicadas(nome,checksum) VALUES(%s,%s)', (path.name, checksum))
