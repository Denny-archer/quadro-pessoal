"""Login com e-mail e senha, sessão em cookie httpOnly (JWT assinado) e perfis de acesso.

Perfis:
  admin  — tudo, inclusive gerenciar usuários
  editor — lê e altera funcionários, lançamentos, regras e importa planilhas
  leitor — só consulta
"""
from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from ..core import config, db
from ..core.seguranca import COOKIE, apagar_cookie, dados_sessao, confere_senha, hash_senha, validar_senha_nova, _emitir, usuario_atual
from ..schemas.auth import Usuario, Login, TrocaSenha

router = APIRouter(prefix="/api/auth", tags=["autenticação"])


@router.post("/login")
def login(dados: Login, request: Request, resp: Response):
    ip = request.client.host if request.client else "?"
    u, bloqueado = None, False
    with db.conexao() as c:
        cur = c.cursor()
        cur.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", ('login:' + ip,))
        cur.execute("DELETE FROM login_tentativas WHERE momento < now() - interval '15 minutes'")
        cur.execute("SELECT count(*) FROM login_tentativas WHERE ip = %s", (ip,))
        bloqueado = cur.fetchone()[0] >= 10
        if not bloqueado:
            cur.execute("SELECT * FROM usuarios WHERE lower(email) = lower(%s)", (dados.email.strip(),))
            usuarios = db.linhas(cur)
            if usuarios and usuarios[0]['ativo'] and confere_senha(dados.senha, usuarios[0]['senha_hash']):
                u = usuarios[0]
                cur.execute("DELETE FROM login_tentativas WHERE ip = %s", (ip,))
                cur.execute("UPDATE usuarios SET ultimo_acesso = now() WHERE id = %s", (u['id'],))
                cur.execute("INSERT INTO auditoria (usuario_id, acao, tabela, registro_id) VALUES (%s,'login','usuarios',%s)",
                            (u['id'], str(u['id'])))
            else:
                cur.execute("INSERT INTO login_tentativas (ip) VALUES (%s)", (ip,))
    # A exceção vem depois do COMMIT, para não desfazer a contagem da tentativa.
    if bloqueado:
        raise HTTPException(429, "Muitas tentativas. Aguarde 15 minutos.")
    if u is None:
        raise HTTPException(401, "E-mail ou senha incorretos.")
    _emitir(resp, u)
    return {"id": u["id"], "nome": u["nome"], "email": u["email"], "papel": u["papel"]}


@router.post("/logout")
def logout(request: Request, resp: Response):
    token = request.cookies.get(COOKIE)
    if token:
        try:
            dados = dados_sessao(token, permitir_expirado=True)
        except HTTPException:
            dados = None
        if dados:
            with db.conexao() as c:
                cur = c.cursor()
                cur.execute('DELETE FROM auth_sessoes WHERE token_hash=%s AND usuario_id=%s RETURNING usuario_id',
                            (dados['token_hash'], dados['uid']))
                if cur.fetchone():
                    cur.execute("INSERT INTO auditoria(usuario_id,acao,tabela,registro_id) VALUES(%s,'logout','usuarios',%s)",
                                (dados['uid'], str(dados['uid'])))
    apagar_cookie(resp)
    return {"ok": True}


@router.get("/eu")
def eu(u: Usuario = Depends(usuario_atual)):
    return {**u.model_dump(), 'sessao': {'inatividade_minutos': config.SESSAO_INATIVIDADE_MINUTOS,
                                       'duracao_horas': config.SESSAO_HORAS}}


@router.post('/atividade')
def atividade(_: Usuario = Depends(usuario_atual)):
    """Atividade explícita do usuário; o polling automático não chama esta rota."""
    return {'ok': True}


@router.post("/senha")
def trocar_senha(dados: TrocaSenha, resp: Response, u: Usuario = Depends(usuario_atual)):
    r = db.consultar("SELECT senha_hash FROM usuarios WHERE id = %s", (u.id,))
    if not confere_senha(dados.atual, r[0]["senha_hash"]):
        raise HTTPException(400, "Senha atual incorreta.")
    validar_senha_nova(dados.nova)
    if dados.nova == dados.atual:
        raise HTTPException(400, 'Escolha uma senha diferente da atual.')
    with db.conexao() as c:
        cur = c.cursor()
        cur.execute("UPDATE usuarios SET senha_hash = %s, sessao_versao = sessao_versao + 1, atualizado_em = now() WHERE id = %s RETURNING sessao_versao",
                    (hash_senha(dados.nova), u.id))
        versao = cur.fetchone()[0]
        cur.execute('DELETE FROM auth_sessoes WHERE usuario_id=%s', (u.id,))
        cur.execute("INSERT INTO auditoria (usuario_id, acao, tabela, registro_id, depois) VALUES (%s,'alterar','usuarios',%s,%s)",
                    (u.id, str(u.id), '{"senha_alterada": true}'))
    _emitir(resp, {**u.model_dump(), 'sessao_versao': versao})
    return {"ok": True}
