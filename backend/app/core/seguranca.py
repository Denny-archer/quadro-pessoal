"""Senhas, cookies de sessão e autorização compartilhada."""
import datetime as dt
import hashlib
import secrets
import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, Response
from . import config, db
from ..schemas.auth import Usuario
COOKIE = "qp_sessao"
NIVEL = {"leitor": 1, "editor": 2, "admin": 3}

def hash_senha(senha: str) -> str:
    validar_senha_nova(senha)
    return bcrypt.hashpw(senha.encode(), bcrypt.gensalt(rounds=12)).decode()


def confere_senha(senha: str, h: str) -> bool:
    if len(senha.encode()) > 72:
        return False
    try:
        return bcrypt.checkpw(senha.encode(), h.encode())
    except ValueError:
        return False


def validar_senha_nova(senha: str):
    if len(senha) < 10:
        raise HTTPException(400, "A senha precisa ter pelo menos 10 caracteres.")
    if len(senha.encode()) > 72:
        raise HTTPException(400, "A senha deve ter no máximo 72 bytes em UTF-8.")


def _emitir(resp: Response, u: dict):
    exp = dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=config.SESSAO_HORAS)
    identificador = secrets.token_urlsafe(32)
    with db.conexao() as c:
        cur = c.cursor()
        cur.execute("DELETE FROM auth_sessoes WHERE expira_em <= now() OR ultimo_uso_em <= now() - (%s * interval '1 minute')",
                    (config.SESSAO_INATIVIDADE_MINUTOS,))
        cur.execute('INSERT INTO auth_sessoes(token_hash,usuario_id,expira_em) VALUES(%s,%s,%s)',
                    (hash_sessao(identificador), u['id'], exp))
    token = jwt.encode({"sub": str(u["id"]), "v": u.get('sessao_versao', 0), "jti": identificador, "exp": exp}, config.JWT_SECRET, algorithm="HS256")
    # Cookie de sessão do navegador; expiração real e inatividade são verificadas no servidor.
    resp.set_cookie(COOKIE, token, httponly=True, secure=config.COOKIE_SEGURO, samesite="strict",
                    path="/")


def hash_sessao(identificador: str) -> str:
    return hashlib.sha256(identificador.encode()).hexdigest()


def dados_sessao(token: str, *, permitir_expirado=False) -> dict:
    try:
        dados = jwt.decode(token, config.JWT_SECRET, algorithms=['HS256'],
                           options={'require': ['sub', 'exp', 'v', 'jti'], 'verify_exp': not permitir_expirado})
        uid = int(dados['sub'])
        if uid < 1 or type(dados['v']) is not int or not isinstance(dados['jti'], str) or not 40 <= len(dados['jti']) <= 64:
            raise ValueError('Sessão inválida.')
        return {**dados, 'uid': uid, 'token_hash': hash_sessao(dados['jti'])}
    except (jwt.PyJWTError, ValueError, TypeError, KeyError):
        raise HTTPException(401, 'Sessão encerrada ou expirada. Entre novamente.') from None


def apagar_cookie(resp: Response):
    resp.delete_cookie(COOKIE, path='/', httponly=True, secure=config.COOKIE_SEGURO, samesite='strict')


def usuario_atual(request: Request) -> Usuario:
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Sessão expirada. Entre novamente.")
    dados = dados_sessao(token)
    # proteção CSRF: alterações exigem o cabeçalho enviado só pelo próprio painel
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get("x-requested-with") != "quadro-pessoal":
        raise HTTPException(403, "Requisição recusada.")
    # GETs de polling apenas validam: não prolongam a sessão de um computador abandonado.
    # Atividade explícita e alterações autenticadas atualizam o relógio no servidor.
    condicao = """u.id = s.usuario_id AND u.id = %s AND s.token_hash = %s
                  AND u.ativo AND u.sessao_versao = %s AND s.expira_em > now()
                  AND s.ultimo_uso_em > now() - (%s * interval '1 minute')"""
    campos = 'u.id, u.email, u.nome, u.papel'
    if request.method not in ('GET', 'HEAD', 'OPTIONS'):
        sql = f'UPDATE auth_sessoes s SET ultimo_uso_em = now() FROM usuarios u WHERE {condicao} RETURNING {campos}'
    else:
        sql = f'SELECT {campos} FROM usuarios u, auth_sessoes s WHERE {condicao}'
    with db.conexao() as c:
        cur = c.cursor()
        cur.execute(sql, (dados['uid'], dados['token_hash'], dados['v'], config.SESSAO_INATIVIDADE_MINUTOS))
        r = db.linhas(cur)
    if not r:
        raise HTTPException(401, 'Sessão encerrada ou expirada. Entre novamente.')
    u = r[0]
    return Usuario(id=u["id"], email=u["email"], nome=u["nome"], papel=u["papel"])


def exige(papel: str):
    def dep(u: Usuario = Depends(usuario_atual)) -> Usuario:
        if NIVEL[u.papel] < NIVEL[papel]:
            raise HTTPException(403, "Seu perfil não permite esta ação.")
        return u
    return dep
