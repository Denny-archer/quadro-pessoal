"""API de dados usada pelo painel: listar, gravar e excluir funcionários, lançamentos e configurações."""
from __future__ import annotations

import json
import re
import math
import datetime as dt

import pg8000.dbapi
from fastapi import APIRouter, Body, Depends, HTTPException

from ..core import db
from ..services import mapping
from ..schemas.auth import Usuario
from ..core.seguranca import exige
from ..core.privacidade import sem_diagnostico
from ..services.auditoria import auditar
from ..services.dados import TABELA, _colecao, _id, erro_banco, gravar

router = APIRouter(prefix="/api/dados", tags=["dados"])
CONFIG_EDITOR = {"beneficios", "ponto"}   # editores mudam regras de benefícios e tolerância do ponto
CONFIG_ADMIN = {"remuneracao"}            # tabela salarial: só administradores


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
    if chave == 'beneficios':
        for campo, teto in (('vtPct', 100), ('sindical', None), ('diaria', None)):
            if campo not in valor:
                continue
            numero = valor[campo]
            if type(numero) not in (int, float) or not math.isfinite(numero) or numero < 0 or (teto is not None and numero > teto):
                raise HTTPException(400, f'Valor inválido para {campo}.')
    if chave == 'ponto':
        tolerancia, hora = valor.get('tolerancia', 15), valor.get('hora_padrao', '08:00')
        if type(tolerancia) is not int or not 0 <= tolerancia <= 240 or not re.fullmatch(r'\d{2}:\d{2}', str(hora)):
            raise HTTPException(400, 'Tolerância deve ser de 0 a 240 minutos e hora_padrao deve usar HH:MM.')
        try:
            dt.time.fromisoformat(hora)
        except ValueError:
            raise HTTPException(400, 'Hora padrão inválida.')
    try:
        json.dumps(valor, allow_nan=False)
    except (ValueError, TypeError):
        raise HTTPException(400, 'Configuração contém valor inválido.')
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
    doc = sem_diagnostico(doc)
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
