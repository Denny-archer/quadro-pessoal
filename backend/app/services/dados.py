"""Persistência dos documentos e tradução dos erros do PostgreSQL."""
import json
import re
from fastapi import HTTPException
from ..core import db
from . import mapping

TABELA = {"funcionarios": "funcionarios", "ocorrencias": "ocorrencias"}

ID_OK = re.compile(r"^[A-Za-z0-9_.:-]{1,64}$")

REGRAS = {  # nome da restrição no banco -> mensagem ao usuário
    "periodo_ordem": "O término não pode ser antes do início.",
    "contrato_ordem": "O término do contrato não pode ser antes do início.",
    "ocorrencias_tipo_check": "Tipo de lançamento inválido.",
    "abono_pecuniario": "O abono pecuniário vai de 0 a 10 dias.",
    "status_abono": "Situação do abono deve ser agendado ou gozado.",
    "vinculo": "Vínculo inválido.",
    "situacao": "Situação inválida.",
    "regime": "Regime de trabalho inválido.",
    "carga": "A carga horária semanal vai de 1 a 60 horas.",
    "intervalo": "O intervalo vai de 0 a 180 minutos.",
    "funcao_tipo": "Tipo de função inválido (comissão ou FG).",
    "nivel_salarial": "O nível salarial vai de 1 a 30.",
    "nivel": "O nível da comissão vai de I a VI.",
    "jornada_diaria": "A jornada diária do estágio é de 4 ou 6 horas.",
    "valor_transporte": "O valor do transporte não pode ser negativo.",
    "carreira": "Carreira inválida.",
    "fg_tipo": "Tipo de função gratificada inválido.",
    "bolsa_tipo": "Tipo de bolsa inválido.",
    "nome": "Informe o nome.",
}

def _colecao(colecao: str) -> str:
    if colecao not in TABELA:
        raise HTTPException(404, "Coleção inexistente.")
    return TABELA[colecao]


def _id(i: str) -> str:
    if not ID_OK.match(i):
        raise HTTPException(400, "Identificador inválido.")
    return i


def erro_banco(e: Exception) -> HTTPException:
    info = e.args[0] if e.args and isinstance(e.args[0], dict) else {}
    codigo, msg = info.get("C", ""), info.get("M", str(e))
    if codigo == "23503":
        return HTTPException(400, "Funcionário inexistente para este lançamento.")
    if codigo == "23505":
        return HTTPException(409, "Já existe outro funcionário com esta matrícula.")
    if codigo == "23514":
        regra = info.get("n", "")
        texto = REGRAS.get(regra) or next((t for chave, t in REGRAS.items() if chave in regra), None)
        return HTTPException(400, texto or f"Valor fora do permitido ({regra or 'regra do banco'}).")
    if codigo.startswith("22"):
        return HTTPException(400, f"Dado inválido: {msg}")
    return HTTPException(500, "Erro ao gravar no banco de dados.")


def gravar(cur, colecao: str, rid: str, doc: dict):
    """INSERT ... ON CONFLICT: substitui o documento inteiro (semântica de 'set')."""
    linha = mapping.doc_para_linha(colecao, doc)
    if colecao == 'funcionarios' and linha.get('matricula'):
        chave_mat = linha['matricula'].strip().lower().lstrip('0') or '0'
        cur.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))', ('matricula:' + chave_mat,))
        cur.execute("SELECT id FROM funcionarios WHERE id <> %s AND coalesce(nullif(ltrim(lower(trim(matricula)), '0'), ''), '0') = %s AND nullif(trim(matricula), '') IS NOT NULL LIMIT 1", (rid, chave_mat))
        if cur.fetchone():
            raise HTTPException(409, 'Já existe outro funcionário com esta matrícula (incluindo zeros à esquerda).')
    for col in mapping.colunas(colecao):
        linha.setdefault(col, None)
    for col, val in mapping.DEFAULTS[colecao].items():
        if linha[col] is None:
            linha[col] = val
    criado = linha.pop("criado_em", None)
    cols = list(linha)
    sql = (f"INSERT INTO {TABELA[colecao]} (id, {', '.join(cols)}, criado_em, atualizado_em) "
           f"VALUES (%s, {', '.join(['%s'] * len(cols))}, COALESCE(%s, now()), now()) "
           f"ON CONFLICT (id) DO UPDATE SET {', '.join(f'{c} = EXCLUDED.{c}' for c in cols)}, atualizado_em = now()")
    cur.execute(sql, (rid, *[linha[c] for c in cols], criado))
