"""Importação em duas etapas: prévia persistida sem alterar cadastros e confirmação atômica."""
from __future__ import annotations

import json

import pg8000.dbapi
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response

from ..core import config, db
from ..services import mapping
from ..schemas.auth import Usuario
from ..core.seguranca import exige
from ..importacao import leitor, modelos, validacao
from ..services.auditoria import auditar
from ..services.dados import erro_banco, gravar

router = APIRouter(prefix="/api/importacao", tags=["importação"])
TIPOS = ("funcionarios", "lancamentos")


def _tipo(t):
    if t not in TIPOS:
        raise HTTPException(404, "Tipo de importação inexistente (funcionarios ou lancamentos).")
    return t


@router.get("/modelos/{arquivo}")
def baixar_modelo(arquivo: str, _: Usuario = Depends(exige("leitor"))):
    tipo, _, ext = arquivo.partition(".")
    _tipo(tipo)
    if ext == "csv":
        return Response(modelos.modelo_csv(tipo), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="modelo-{tipo}.csv"'})
    if ext == "xlsx":
        return Response(modelos.modelo_xlsx(tipo),
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": f'attachment; filename="modelo-{tipo}.xlsx"'})
    raise HTTPException(404, "Use .csv ou .xlsx.")


@router.get("/estrutura/{tipo}")
def estrutura(tipo: str, _: Usuario = Depends(exige("leitor"))):
    return [{"coluna": c.nome, "obrigatoria": c.obrigatoria, "descricao": c.descricao, "exemplo": c.exemplo,
             "aceita_tambem": c.apelidos} for c in modelos.ESPEC[_tipo(tipo)]]


def _docs(colecao):
    return [mapping.linha_para_doc(colecao, l) for l in db.consultar(f"SELECT * FROM {colecao}")]


@router.post("/{tipo}/validar")
async def validar(tipo: str, arquivo: UploadFile = File(...), u: Usuario = Depends(exige("editor"))):
    _tipo(tipo)
    dados = await arquivo.read(config.TAMANHO_MAX_UPLOAD_MB * 1024 * 1024 + 1)
    if len(dados) > config.TAMANHO_MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"Arquivo maior que {config.TAMANHO_MAX_UPLOAD_MB} MB.")
    nome = (arquivo.filename or "planilha").replace("\\", "/").split("/")[-1][:150]
    try:
        cols, ignoradas, linhas = leitor.ler(dados, nome, tipo)
    except leitor.ArquivoInvalido as e:
        raise HTTPException(400, str(e))
    if not linhas:
        raise HTTPException(400, "A planilha não tem linhas de dados abaixo do cabeçalho.")
    funcs = _docs("funcionarios")
    if tipo == "funcionarios":
        plano = validacao.validar_funcionarios(linhas, funcs)
    else:
        plano = validacao.validar_lancamentos(linhas, funcs, _docs("ocorrencias"), nome, colunas_ignoradas=ignoradas)
    if ignoradas:
        plano["mensagens"].insert(0, {"linha": 0, "nivel": "info",
                                      "texto": "Colunas desconhecidas ignoradas: " + ", ".join(ignoradas)})
    n = plano["contagem"]
    with db.conexao() as c:
        cur = c.cursor()
        cur.execute("UPDATE importacoes SET status = 'descartada', plano = NULL WHERE status = 'pendente' AND criado_em < now() - interval '1 day'")
        cur.execute("""INSERT INTO importacoes (tipo, arquivo, usuario_id, total_linhas, inseridos, atualizados, ignorados, com_erro, plano, mensagens)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                    (tipo, nome, u.id, n["total"], n["inserir"], n["atualizar"], n["ignorados"], n["erros"],
                     json.dumps(plano["operacoes"], ensure_ascii=False), json.dumps(plano["mensagens"], ensure_ascii=False)))
        imp_id = cur.fetchone()[0]
        auditar(cur, u.id, 'criar', 'importacoes', str(imp_id), None, {'arquivo': nome, 'tipo': tipo, 'contagem': n})
    return {"id": imp_id, "arquivo": nome, "colunas": cols, "contagem": n, "mensagens": plano["mensagens"],
            "previa": [{"linha": o["linha"], "acao": o["acao"], "resumo": o["resumo"]} for o in plano["operacoes"][:500]]}


@router.post("/{imp_id}/confirmar")
def confirmar(imp_id: int, u: Usuario = Depends(exige("editor"))):
    r = db.consultar("SELECT *, criado_em < now() - interval '1 day' AS expirado FROM importacoes WHERE id = %s", (imp_id,))
    if not r:
        raise HTTPException(404, "Importação não encontrada.")
    imp = r[0]
    if imp['expirado']:
        raise HTTPException(409, 'Esta prévia expirou: valide a planilha de novo.')
    if imp["status"] != "pendente":
        raise HTTPException(409, "Esta importação já foi " + {"concluida": "concluída.", "descartada": "descartada: valide a planilha de novo."}[imp["status"]])
    ops = imp["plano"] or []
    if not ops:
        raise HTTPException(400, "Nada a importar.")
    try:
        with db.conexao() as c:
            cur = c.cursor()
            cur.execute("SELECT status FROM importacoes WHERE id = %s FOR UPDATE", (imp_id,))
            if cur.fetchone()[0] != "pendente":
                raise HTTPException(409, "Esta importação já foi processada.")
            cur.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", ('importacao:' + imp['tipo'],))
            gravados = inseridos = atualizados = ignorados = 0
            for o in ops:
                doc = dict(o["doc"])
                cur.execute(f"SELECT * FROM {o['colecao']} WHERE id = %s FOR UPDATE", (o['id'],))
                atual = db.linhas(cur)
                antes = mapping.linha_para_doc(o['colecao'], atual[0]) if atual else None
                if o["acao"] == "atualizar":
                    # reaplica só os campos alterados sobre a versão atual (preserva edições feitas
                    # na tela entre a validação e a confirmação)
                    if not atual:
                        raise HTTPException(409, 'Um cadastro foi excluído depois da prévia: valide novamente.')
                    doc = {k: v for k, v in antes.items() if k != "id"}
                    doc.update(o.get("campos") or {})
                if o['colecao'] == 'ocorrencias':
                    cur.execute('SELECT id FROM ocorrencias WHERE funcionario_id=%s AND tipo=%s AND inicio=%s AND fim=%s LIMIT 1',
                                (doc['func'], doc['tipo'], doc['inicio'], doc['fim']))
                    if cur.fetchone():
                        ignorados += 1
                        continue
                gravar(cur, o["colecao"], o["id"], doc)
                gravados += 1
                atualizados += bool(antes)
                inseridos += not bool(antes)
                auditar(cur, u.id, 'alterar' if antes else 'criar', o['colecao'], o['id'], antes, doc)
                if o["colecao"] == "ocorrencias":
                    cur.execute("UPDATE ocorrencias SET importacao_id = %s WHERE id = %s", (imp_id, o["id"]))
            cur.execute("UPDATE importacoes SET status = 'concluida', concluido_em = now(), plano = NULL, inseridos=%s, atualizados=%s, ignorados=ignorados+%s WHERE id = %s",
                        (inseridos, atualizados, ignorados, imp_id))
            auditar(cur, u.id, "importar", "importacoes", str(imp_id), None,
                    {"arquivo": imp["arquivo"], "tipo": imp["tipo"], "operacoes": gravados, 'ignorados_na_confirmacao': ignorados})
    except mapping.ErroValidacao as e:
        raise HTTPException(400, str(e))
    except pg8000.dbapi.DatabaseError as e:
        raise erro_banco(e)
    return {"ok": True, "gravados": gravados, 'ignorados': ignorados}


@router.post("/{imp_id}/descartar")
def descartar(imp_id: int, u: Usuario = Depends(exige("editor"))):
    with db.conexao() as c:
        cur = c.cursor()
        cur.execute("UPDATE importacoes SET status = 'descartada', plano = NULL WHERE id = %s AND status = 'pendente'", (imp_id,))
        if cur.rowcount:
            auditar(cur, u.id, 'alterar', 'importacoes', str(imp_id), {'status': 'pendente'}, {'status': 'descartada'})
    return {"ok": True}


@router.get("/historico")
def historico(_: Usuario = Depends(exige("leitor"))):
    return db.consultar("""SELECT i.id, i.tipo, i.arquivo, i.status, i.total_linhas, i.inseridos, i.atualizados,
                                  i.ignorados, i.com_erro, i.criado_em, i.concluido_em, u.nome AS usuario
                           FROM importacoes i LEFT JOIN usuarios u ON u.id = i.usuario_id
                           ORDER BY i.criado_em DESC LIMIT 50""")
