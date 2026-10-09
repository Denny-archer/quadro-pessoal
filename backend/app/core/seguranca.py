"""Senhas, cookies de sessão e autorização compartilhada."""
import datetime as dt
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
    token = jwt.encode({"sub": str(u["id"]), "papel": u["papel"], "v": u.get('sessao_versao', 0), "exp": exp}, config.JWT_SECRET, algorithm="HS256")
    resp.set_cookie(COOKIE, token, httponly=True, secure=config.COOKIE_SEGURO, samesite="strict",
                    max_age=config.SESSAO_HORAS * 3600, path="/")


def usuario_atual(request: Request) -> Usuario:
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Sessão expirada. Entre novamente.")
    try:
        dados = jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"])
        uid = int(dados['sub'])
    except (jwt.PyJWTError, ValueError, TypeError, KeyError):
        raise HTTPException(401, "Sessão expirada. Entre novamente.")
    r = db.consultar("SELECT id, email, nome, papel, ativo, sessao_versao FROM usuarios WHERE id = %s", (uid,))
    if not r or not r[0]["ativo"] or dados.get('v', 0) != r[0]['sessao_versao']:
        raise HTTPException(401, "Usuário desativado.")
    u = r[0]
    # proteção CSRF: alterações exigem o cabeçalho enviado só pelo próprio painel
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get("x-requested-with") != "quadro-pessoal":
        raise HTTPException(403, "Requisição recusada.")
    return Usuario(id=u["id"], email=u["email"], nome=u["nome"], papel=u["papel"])


def exige(papel: str):
    def dep(u: Usuario = Depends(usuario_atual)) -> Usuario:
        if NIVEL[u.papel] < NIVEL[papel]:
            raise HTTPException(403, "Seu perfil não permite esta ação.")
        return u
    return dep
