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
from ..core.seguranca import exige, usuario_atual
from ..core.privacidade import sem_diagnostico
from ..services.auditoria import auditar
from ..acesso.service import contexto, invalidar
from ..services.dados import TABELA, _colecao, _id, erro_banco, gravar

router = APIRouter(prefix="/api/dados", tags=["dados"])
CONFIG_GERAIS = {"beneficios", "ponto"}
CONFIG_ADMIN = {"remuneracao"}            # tabela salarial: só administradores


@router.get("/versoes")
def versoes(_: Usuario = Depends(usuario_atual)):
    """Assinatura barata de cada coleção; o painel recarrega só o que mudou."""
    ctx = contexto(_)
    where, params = ctx.funcionario_sql()
    r = db.consultar(f"""
        SELECT 'funcionarios' AS c, count(*) AS n, max(f.atualizado_em) AS t FROM funcionarios f WHERE {where}
        UNION ALL SELECT 'ocorrencias', count(*), max(o.atualizado_em) FROM ocorrencias o
            JOIN funcionarios f ON f.id=o.funcionario_id WHERE {where}
        UNION ALL SELECT 'config/' || chave, 1, atualizado_em FROM config WHERE chave IN ('remuneracao','beneficios','ponto')""", (*params,*params))
    return {x["c"]: f"{ctx.revisao}|{x['n']}|{x['t'].isoformat() if x['t'] else ''}" for x in r}


@router.get("/config/{chave}")
def ler_config(chave: str, _: Usuario = Depends(usuario_atual)):
    if chave not in ("remuneracao","beneficios","ponto") and _.papel != "admin":
        raise HTTPException(403, "Configuração administrativa.")
    r = db.consultar("SELECT valor FROM config WHERE chave = %s", (_id(chave),))
    return {"existe": bool(r), "dados": r[0]["valor"] if r else None}


@router.put("/config/{chave}")
def gravar_config(chave: str, valor: dict = Body(...), u: Usuario = Depends(exige("admin"))):
    if chave not in CONFIG_GERAIS | CONFIG_ADMIN:
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
def listar(colecao: str, _: Usuario = Depends(usuario_atual)):
    t = _colecao(colecao)
    where, params = contexto(_).funcionario_sql()
    sql = (f'SELECT f.* FROM funcionarios f WHERE {where} ORDER BY f.id' if colecao=='funcionarios'
           else f'SELECT o.* FROM ocorrencias o JOIN funcionarios f ON f.id=o.funcionario_id WHERE {where} ORDER BY o.id')
    return [mapping.linha_para_doc(colecao,l) for l in db.consultar(sql,params)]


@router.put("/{colecao}/{rid}")
def gravar_doc(colecao: str, rid: str, doc: dict = Body(...), u: Usuario = Depends(exige("admin"))):
    t = _colecao(colecao)
    _id(rid)
    doc = sem_diagnostico(doc)
    try:
        with db.conexao() as c:
            cur = c.cursor()
            cur.execute(f"SELECT * FROM {t} WHERE id = %s", (rid,))
            antes = db.linhas(cur)
            gravar(cur, colecao, rid, doc, autor=u.id)
            auditar(cur, u.id, "alterar" if antes else "criar", t, rid,
                    mapping.linha_para_doc(colecao, antes[0]) if antes else None, doc)
    except mapping.ErroValidacao as e:
        raise HTTPException(400, str(e))
    except pg8000.dbapi.DatabaseError as e:
        raise erro_banco(e)
    return {"ok": True, "id": rid}


@router.delete("/{colecao}/{rid}")
def excluir(colecao: str, rid: str, u: Usuario = Depends(exige("admin"))):
    t = _colecao(colecao)
    with db.conexao() as c:
        cur = c.cursor()
        cur.execute(f"SELECT * FROM {t} WHERE id = %s", (_id(rid),))
        antes = db.linhas(cur)
        if not antes:
            return {"ok": True}
        if colecao == 'funcionarios':
            cur.execute("UPDATE funcionarios SET situacao='inativo',atualizado_em=now() WHERE id=%s",(rid,))
            cur.execute("UPDATE usuarios SET ativo=false WHERE id IN (SELECT usuario_id FROM usuario_funcionario WHERE funcionario_id=%s) AND papel<>'admin'",(rid,))
            invalidar(cur,funcionarios=[rid],setores=[antes[0]['setor_id']])
        else:
            cur.execute(f"DELETE FROM {t} WHERE id = %s", (rid,))
            cur.execute('SELECT setor_id FROM funcionarios WHERE id=%s',(antes[0]['funcionario_id'],))
            f=cur.fetchone()
            invalidar(cur,funcionarios=[antes[0]['funcionario_id']],setores=[f[0]] if f else [])
        auditar(cur, u.id, "excluir", t, rid, mapping.linha_para_doc(colecao, antes[0]))
    return {"ok": True}
