"""Auditoria de alterações com remoção de dados de diagnóstico."""
import json
from ..core.privacidade import sem_diagnostico

def auditar(cur, usuario_id, acao, tabela, registro_id, antes=None, depois=None):
    cur.execute("INSERT INTO auditoria (usuario_id, acao, tabela, registro_id, antes, depois) VALUES (%s,%s,%s,%s,%s,%s)",
                (usuario_id, acao, tabela, registro_id,
                 None if antes is None else json.dumps(sem_diagnostico(antes), ensure_ascii=False, default=str),
                 None if depois is None else json.dumps(sem_diagnostico(depois), ensure_ascii=False, default=str)))
