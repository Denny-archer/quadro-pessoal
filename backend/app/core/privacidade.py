"""Remove campos estruturados de diagnóstico em todos os caminhos de gravação."""
import re
import unicodedata


def sem_diagnostico(valor):
    if isinstance(valor, dict):
        return {k: sem_diagnostico(v) for k, v in valor.items() if not proibido(k)}
    if isinstance(valor, list):
        return [sem_diagnostico(v) for v in valor]
    return valor


def proibido(chave):
    chave = ''.join(c for c in unicodedata.normalize('NFD', str(chave).lower())
                    if unicodedata.category(c) != 'Mn')
    chave = re.sub(r'[^a-z0-9]', '', chave)
    return chave in {'cid', 'cid10', 'cid11', 'diagnostico', 'diagnosticos', 'doenca', 'doencas'}
