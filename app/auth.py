"""Login com e-mail e senha, sessão em cookie httpOnly (JWT assinado) e perfis de acesso.

Perfis:
  admin  — tudo, inclusive gerenciar usuários
  editor — lê e altera funcionários, lançamentos, regras e importa planilhas
  leitor — só consulta
"""
from __future__ import annotations

import datetime as dt
import time
from collections import defaultdict

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from . import config, db

COOKIE = "qp_sessao"
NIVEL = {"leitor": 1, "editor": 2, "admin": 3}
router = APIRouter(prefix="/api/auth", tags=["autenticação"])

# limite simples de tentativas de login por IP (10 por 15 min)
_tentativas: dict[str, list[float]] = defaultdict(list)


def hash_senha(senha: str) -> str:
    return bcrypt.hashpw(senha.encode(), bcrypt.gensalt(rounds=12)).decode()


def confere_senha(senha: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(senha.encode(), h.encode())
    except ValueError:
        return False


def validar_senha_nova(senha: str):
    if len(senha) < 10:
        raise HTTPException(400, "A senha precisa ter pelo menos 10 caracteres.")


class Usuario(BaseModel):
    id: int
    email: str
    nome: str
    papel: str


def _emitir(resp: Response, u: dict):
    exp = dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=config.SESSAO_HORAS)
    token = jwt.encode({"sub": str(u["id"]), "papel": u["papel"], "exp": exp}, config.JWT_SECRET, algorithm="HS256")
    resp.set_cookie(COOKIE, token, httponly=True, secure=config.COOKIE_SEGURO, samesite="strict",
                    max_age=config.SESSAO_HORAS * 3600, path="/")


def usuario_atual(request: Request) -> Usuario:
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Sessão expirada. Entre novamente.")
    try:
        dados = jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Sessão expirada. Entre novamente.")
    r = db.consultar("SELECT id, email, nome, papel, ativo FROM usuarios WHERE id = %s", (int(dados["sub"]),))
    if not r or not r[0]["ativo"]:
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


class Login(BaseModel):
    email: str = Field(max_length=200)
    senha: str = Field(max_length=200)


@router.post("/login")
def login(dados: Login, request: Request, resp: Response):
    ip = request.client.host if request.client else "?"
    agora = time.time()
    _tentativas[ip] = [t for t in _tentativas[ip] if agora - t < 900]
    if len(_tentativas[ip]) >= 10:
        raise HTTPException(429, "Muitas tentativas. Aguarde 15 minutos.")
    r = db.consultar("SELECT * FROM usuarios WHERE lower(email) = lower(%s)", (dados.email.strip(),))
    if not r or not r[0]["ativo"] or not confere_senha(dados.senha, r[0]["senha_hash"]):
        _tentativas[ip].append(agora)
        raise HTTPException(401, "E-mail ou senha incorretos.")
    u = r[0]
    with db.conexao() as c:
        cur = c.cursor()
        cur.execute("UPDATE usuarios SET ultimo_acesso = now() WHERE id = %s", (u["id"],))
        cur.execute("INSERT INTO auditoria (usuario_id, acao, tabela, registro_id) VALUES (%s,'login','usuarios',%s)",
                    (u["id"], str(u["id"])))
    _tentativas.pop(ip, None)
    _emitir(resp, u)
    return {"id": u["id"], "nome": u["nome"], "email": u["email"], "papel": u["papel"]}


@router.post("/logout")
def logout(resp: Response):
    resp.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/eu")
def eu(u: Usuario = Depends(usuario_atual)):
    return u


class TrocaSenha(BaseModel):
    atual: str = Field(max_length=200)
    nova: str = Field(max_length=200)


@router.post("/senha")
def trocar_senha(dados: TrocaSenha, u: Usuario = Depends(usuario_atual)):
    r = db.consultar("SELECT senha_hash FROM usuarios WHERE id = %s", (u.id,))
    if not confere_senha(dados.atual, r[0]["senha_hash"]):
        raise HTTPException(400, "Senha atual incorreta.")
    validar_senha_nova(dados.nova)
    with db.conexao() as c:
        c.cursor().execute("UPDATE usuarios SET senha_hash = %s, atualizado_em = now() WHERE id = %s",
                           (hash_senha(dados.nova), u.id))
    return {"ok": True}
