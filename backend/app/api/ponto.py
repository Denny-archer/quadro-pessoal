"""Integração com o sistema de ponto.

- POST /api/integracao/ponto/marcacoes   o ponto envia as batidas (chave de API no cabeçalho Authorization)
- GET  /api/integracao/ponto/status      teste de conectividade do ponto
- GET  /api/presenca?data=AAAA-MM-DD     quem está no posto / fora do posto (painel)
- /api/integracao/chaves                 gestão das chaves (administrador)
"""
from __future__ import annotations

import datetime as dt
import hashlib
import secrets
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from ..schemas.ponto import Marcacao, Lote, NovaChave

from ..core import db
from ..services import mapping, presenca, ponto as resumos_ponto
from ..schemas.auth import Usuario
from ..core.seguranca import exige
from ..services.auditoria import auditar

router = APIRouter(tags=["integração ponto"])
MAX_LOTE = 1000


# ------------------------------------------------------------------ autenticação por chave
def _hash(chave: str) -> str:
    return hashlib.sha256(chave.encode()).hexdigest()


def chave_ponto(authorization: str = Header(default="")) -> int:
    esquema, _, chave = authorization.partition(" ")
    if esquema.lower() != "bearer" or not chave.startswith("qpk_"):
        raise HTTPException(401, "Envie 'Authorization: Bearer <chave>'.")
    r = db.consultar("SELECT id FROM integracao_chaves WHERE hash = %s AND ativo AND escopo = 'ponto'", (_hash(chave.strip()),))
    if not r:
        raise HTTPException(401, "Chave inválida ou revogada.")
    return r[0]["id"]


# ------------------------------------------------------------------ recebimento


VINCULAR = """UPDATE ponto_marcacoes m SET funcionario_id = f.id
              FROM (SELECT min(id) AS id, ltrim(lower(trim(matricula)), '0') AS matricula_normalizada
                    FROM funcionarios WHERE nullif(trim(matricula), '') IS NOT NULL
                    GROUP BY ltrim(lower(trim(matricula)), '0') HAVING count(*)=1) f
              WHERE m.funcionario_id IS NULL
                AND f.matricula_normalizada = ltrim(lower(trim(m.matricula)), '0')"""


@router.post("/api/integracao/ponto/marcacoes")
def receber(lote: Lote, chave_id: int = Depends(chave_ponto)):
    ins = upd = 0
    with db.conexao() as c:
        cur = c.cursor()
        for m in lote.marcacoes:
            cur.execute(
                """INSERT INTO ponto_marcacoes (id_externo, matricula, momento, tipo, local, cancelada, origem)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (id_externo) DO UPDATE SET matricula = EXCLUDED.matricula, momento = EXCLUDED.momento,
                     tipo = EXCLUDED.tipo, local = EXCLUDED.local, cancelada = EXCLUDED.cancelada, origem = EXCLUDED.origem,
                     funcionario_id = CASE WHEN ponto_marcacoes.matricula = EXCLUDED.matricula THEN ponto_marcacoes.funcionario_id END,
                     atualizado_em = now(), recebido_em = now()
                   WHERE (ponto_marcacoes.matricula, ponto_marcacoes.momento, ponto_marcacoes.tipo, ponto_marcacoes.local,
                          ponto_marcacoes.cancelada, ponto_marcacoes.origem) IS DISTINCT FROM
                         (EXCLUDED.matricula, EXCLUDED.momento, EXCLUDED.tipo, EXCLUDED.local, EXCLUDED.cancelada, EXCLUDED.origem)
                   RETURNING (xmax = 0) AS novo""",
                (m.id, m.matricula.strip(), m.momento, m.tipo, m.local, m.cancelada, m.origem))
            r = cur.fetchone()
            if r is not None:
                ins += 1 if r[0] else 0
                upd += 0 if r[0] else 1
        cur.execute(VINCULAR)
        cur.execute("SELECT DISTINCT matricula FROM ponto_marcacoes WHERE funcionario_id IS NULL AND matricula = ANY(%s)",
                    ([m.matricula.strip() for m in lote.marcacoes],))
        desconhecidas = sorted(x[0] for x in cur.fetchall())
        cur.execute("UPDATE integracao_chaves SET ultimo_uso = now() WHERE id = %s", (chave_id,))
    return {"recebidas": len(lote.marcacoes), "novas": ins, "atualizadas": upd,
            "sem_alteracao": len(lote.marcacoes) - ins - upd, "matriculas_desconhecidas": desconhecidas}


@router.post('/api/integracao/ponto/resumos')
def receber_resumos(lote: resumos_ponto.LoteResumos, chave_id: int = Depends(chave_ponto)):
    return resumos_ponto.receber(lote, chave_id)


@router.post('/api/integracao/ponto/sinal')
def receber_sinal(sinal: resumos_ponto.Sinal, chave_id: int = Depends(chave_ponto)):
    return resumos_ponto.sinalizar(sinal, chave_id)


@router.get("/api/integracao/ponto/status")
def status_integracao(chave_id: int = Depends(chave_ponto)):
    r = db.consultar("SELECT max(momento) AS ultima, count(*) AS total FROM ponto_marcacoes")[0]
    return {"ok": True, "ultima_marcacao": r["ultima"], "total_marcacoes": r["total"],
            'sincronizacao': resumos_ponto.sincronizacao(),
            'total_resumos': db.consultar('SELECT count(*) AS n FROM ponto_resumos')[0]['n']}


# ------------------------------------------------------------------ presença (painel)
def _feriados() -> set[str]:
    r = db.consultar("SELECT valor FROM config WHERE chave = 'beneficios'")
    return set((r[0]["valor"] or {}).get("feriados", [])) if r else set()


def _regras_ponto() -> tuple[int, str]:
    """config 'ponto': {"tolerancia": 15, "hora_padrao": "08:00"}"""
    r = db.consultar("SELECT valor FROM config WHERE chave = 'ponto'")
    v = (r[0]["valor"] or {}) if r else {}
    return int(v.get("tolerancia", 15)), str(v.get("hora_padrao", "08:00"))


@router.get("/api/presenca")
def quadro_presenca(data: dt.date | None = Query(default=None), _: Usuario = Depends(exige("leitor"))):
    agora = dt.datetime.now(dt.timezone.utc)
    data = data or agora.astimezone(presenca.FUSO).date()
    ini = dt.datetime.combine(data, dt.time.min, presenca.FUSO)
    fim = ini + dt.timedelta(days=1)
    with db.conexao() as c:
        c.cursor().execute(VINCULAR)
        resumos_ponto.vincular(c.cursor())
    funcs = [mapping.linha_para_doc("funcionarios", l) for l in db.consultar("SELECT * FROM funcionarios")]
    ocs = [mapping.linha_para_doc("ocorrencias", l) for l in db.consultar(
        "SELECT * FROM ocorrencias WHERE inicio <= %s AND fim >= %s AND tipo <> 'banco'", (data, data))]
    marc = db.consultar("""SELECT id_externo, funcionario_id, momento, tipo, local, cancelada FROM ponto_marcacoes
                           WHERE momento >= %s AND momento < %s AND funcionario_id IS NOT NULL""", (ini, fim))
    tol, padrao = _regras_ponto()
    out = presenca.quadro_do_dia(funcs, ocs, marc, data, agora, _feriados(), tol, padrao)
    ult = db.consultar("SELECT max(recebido_em) AS r FROM ponto_marcacoes")[0]["r"]
    out["ultima_recepcao"] = ult.isoformat() if ult else None
    out["matriculas_desconhecidas"] = [x["matricula"] for x in db.consultar(
        "SELECT DISTINCT matricula FROM ponto_marcacoes WHERE funcionario_id IS NULL AND momento >= %s AND momento < %s ORDER BY 1", (ini, fim))]
    sem_vinculo = db.consultar('SELECT DISTINCT matricula FROM ponto_resumos WHERE funcionario_id IS NULL AND data=%s', (data,))
    out['matriculas_desconhecidas'] = sorted(set(out['matriculas_desconhecidas']) | {x['matricula'] or '(sem matrícula)' for x in sem_vinculo})
    ult_resumo = db.consultar('SELECT max(recebido_em) AS r FROM ponto_resumos')[0]['r']
    if ult_resumo and (not ult or ult_resumo > ult):
        out['ultima_recepcao'] = ult_resumo.isoformat()
    return resumos_ponto.completar_quadro(out, funcs, ocs, data, agora, _feriados(), tol, padrao)


@router.get("/api/presenca/{func_id}")
def batidas_funcionario(func_id: str, de: dt.date, ate: dt.date, _: Usuario = Depends(exige("leitor"))):
    if not 0 <= (ate - de).days < 62:
        raise HTTPException(400, "Período máximo de 62 dias.")
    ini = dt.datetime.combine(de, dt.time.min, presenca.FUSO)
    fim = dt.datetime.combine(ate + dt.timedelta(days=1), dt.time.min, presenca.FUSO)
    return db.consultar("""SELECT momento, tipo, local, cancelada, origem FROM ponto_marcacoes
                           WHERE funcionario_id = %s AND momento >= %s AND momento < %s ORDER BY momento""",
                        (func_id, ini, fim))


@router.get('/api/jornada/{func_id}')
def jornada_funcionario(func_id: str, de: dt.date, ate: dt.date, _: Usuario = Depends(exige('leitor'))):
    if not 0 <= (ate - de).days < 62:
        raise HTTPException(400, 'Informe um período de 1 a 62 dias.')
    return db.consultar('SELECT data, dados, recebido_em FROM ponto_resumos WHERE funcionario_id=%s AND data BETWEEN %s AND %s ORDER BY data',
                        (func_id, de, ate))


# ------------------------------------------------------------------ chaves (admin)


@router.get("/api/integracao/chaves")
def listar_chaves(_: Usuario = Depends(exige("admin"))):
    return db.consultar("SELECT id, nome, prefixo, escopo, ativo, criado_em, ultimo_uso FROM integracao_chaves ORDER BY criado_em DESC")


@router.post("/api/integracao/chaves")
def criar_chave(dados: NovaChave, u: Usuario = Depends(exige("admin"))):
    chave = "qpk_" + secrets.token_urlsafe(32)
    with db.conexao() as c:
        cur = c.cursor()
        cur.execute("INSERT INTO integracao_chaves (nome, prefixo, hash, criado_por) VALUES (%s,%s,%s,%s) RETURNING id",
                    (dados.nome.strip(), chave[:10], _hash(chave), u.id))
        cid = cur.fetchone()[0]
        auditar(cur, u.id, "criar", "integracao_chaves", str(cid), None, {"nome": dados.nome})
    return {"id": cid, "chave": chave, "aviso": "Copie agora: a chave não será mostrada de novo."}


@router.delete("/api/integracao/chaves/{cid}")
def revogar_chave(cid: int, u: Usuario = Depends(exige("admin"))):
    with db.conexao() as c:
        cur = c.cursor()
        cur.execute("UPDATE integracao_chaves SET ativo = false WHERE id = %s", (cid,))
        auditar(cur, u.id, "excluir", "integracao_chaves", str(cid))
    return {"ok": True}
