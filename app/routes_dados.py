"""API de dados usada pelo painel: listar, gravar e excluir funcionários, lançamentos e configurações."""
from __future__ import annotations

import json
import re

import pg8000.dbapi
from fastapi import APIRouter, Body, Depends, HTTPException

from . import db, mapping
from .auth import Usuario, exige

router = APIRouter(prefix="/api/dados", tags=["dados"])
TABELA = {"funcionarios": "funcionarios", "ocorrencias": "ocorrencias"}
ID_OK = re.compile(r"^[A-Za-z0-9_.:-]{1,64}$")
CONFIG_EDITOR = {"beneficios"}            # editores mudam as regras de benefícios
CONFIG_ADMIN = {"remuneracao"}            # tabela salarial: só administradores


def _colecao(colecao: str) -> str:
    if colecao not in TABELA:
        raise HTTPException(404, "Coleção inexistente.")
    return TABELA[colecao]


def _id(i: str) -> str:
    if not ID_OK.match(i):
        raise HTTPException(400, "Identificador inválido.")
    return i


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


def auditar(cur, usuario_id, acao, tabela, registro_id, antes=None, depois=None):
    cur.execute("INSERT INTO auditoria (usuario_id, acao, tabela, registro_id, antes, depois) VALUES (%s,%s,%s,%s,%s,%s)",
                (usuario_id, acao, tabela, registro_id,
                 None if antes is None else json.dumps(antes, ensure_ascii=False, default=str),
                 None if depois is None else json.dumps(depois, ensure_ascii=False, default=str)))


def gravar(cur, colecao: str, rid: str, doc: dict):
    """INSERT ... ON CONFLICT: substitui o documento inteiro (semântica de 'set')."""
    linha = mapping.doc_para_linha(colecao, doc)
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


@router.get("/versoes")
def versoes(_: Usuario = Depends(exige("leitor"))):
    """Assinatura barata de cada coleção; o painel recarrega só o que mudou."""
    r = db.consultar("""
        SELECT 'funcionarios' AS c, count(*) AS n, max(atualizado_em) AS t FROM funcionarios
        UNION ALL SELECT 'ocorrencias', count(*), max(atualizado_em) FROM ocorrencias
        UNION ALL SELECT 'config/' || chave, 1, atualizado_em FROM config""")
    return {x["c"]: f"{x['n']}|{x['t'].isoformat() if x['t'] else ''}" for x in r}


@router.get("/config/{chave}")
def ler_config(chave: str, _: Usuario = Depends(exige("leitor"))):
    r = db.consultar("SELECT valor FROM config WHERE chave = %s", (_id(chave),))
    return {"existe": bool(r), "dados": r[0]["valor"] if r else None}


@router.put("/config/{chave}")
def gravar_config(chave: str, valor: dict = Body(...), u: Usuario = Depends(exige("editor"))):
    if chave not in CONFIG_EDITOR | CONFIG_ADMIN:
        raise HTTPException(404, "Configuração inexistente.")
    if chave in CONFIG_ADMIN and u.papel != "admin":
        raise HTTPException(403, "Somente administradores alteram a tabela salarial.")
    with db.conexao() as c:
        cur = c.cursor()
        cur.execute("SELECT valor FROM config WHERE chave = %s", (chave,))
        antes = cur.fetchone()
        cur.execute("INSERT INTO config (chave, valor, atualizado_em) VALUES (%s, %s, now()) "
                    "ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()",
                    (chave, json.dumps(valor, ensure_ascii=False)))
        auditar(cur, u.id, "alterar", "config", chave, antes[0] if antes else None, valor)
    return {"ok": True}


@router.get("/{colecao}")
def listar(colecao: str, _: Usuario = Depends(exige("leitor"))):
    t = _colecao(colecao)
    return [mapping.linha_para_doc(colecao, l) for l in db.consultar(f"SELECT * FROM {t} ORDER BY id")]


@router.put("/{colecao}/{rid}")
def gravar_doc(colecao: str, rid: str, doc: dict = Body(...), u: Usuario = Depends(exige("editor"))):
    t = _colecao(colecao)
    _id(rid)
    if colecao == "ocorrencias" and doc.get("tipo") == "atestado":
        for proibido in ("cid", "CID", "diagnostico", "diagnóstico"):
            doc.pop(proibido, None)   # LGPD: diagnóstico não é armazenado
    try:
        with db.conexao() as c:
            cur = c.cursor()
            cur.execute(f"SELECT * FROM {t} WHERE id = %s", (rid,))
            antes = db.linhas(cur)
            gravar(cur, colecao, rid, doc)
            auditar(cur, u.id, "alterar" if antes else "criar", t, rid,
                    mapping.linha_para_doc(colecao, antes[0]) if antes else None, doc)
    except mapping.ErroValidacao as e:
        raise HTTPException(400, str(e))
    except pg8000.dbapi.DatabaseError as e:
        raise erro_banco(e)
    return {"ok": True, "id": rid}


@router.delete("/{colecao}/{rid}")
def excluir(colecao: str, rid: str, u: Usuario = Depends(exige("editor"))):
    t = _colecao(colecao)
    with db.conexao() as c:
        cur = c.cursor()
        cur.execute(f"SELECT * FROM {t} WHERE id = %s", (_id(rid),))
        antes = db.linhas(cur)
        if not antes:
            return {"ok": True}
        cur.execute(f"DELETE FROM {t} WHERE id = %s", (rid,))
        auditar(cur, u.id, "excluir", t, rid, mapping.linha_para_doc(colecao, antes[0]))
    return {"ok": True}
