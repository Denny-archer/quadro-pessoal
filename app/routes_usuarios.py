"""Gestão de usuários do sistema (somente administradores)."""
from __future__ import annotations

import json
import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import db
from .auth import Usuario, exige, hash_senha, validar_senha_nova

router = APIRouter(prefix="/api/usuarios", tags=["usuários"])
CAMPOS = "id, email, nome, papel, ativo, ultimo_acesso, criado_em"


@router.get("")
def listar(_: Usuario = Depends(exige("admin"))):
    return db.consultar(f"SELECT {CAMPOS} FROM usuarios ORDER BY nome")


class NovoUsuario(BaseModel):
    email: str = Field(max_length=200)
    nome: str = Field(min_length=2, max_length=120)
    papel: str = Field(pattern="^(admin|editor|leitor)$")
    senha: str | None = Field(default=None, max_length=200)


@router.post("")
def criar(dados: NovoUsuario, adm: Usuario = Depends(exige("admin"))):
    senha = dados.senha or secrets.token_urlsafe(12)
    validar_senha_nova(senha)
    if "@" not in dados.email:
        raise HTTPException(400, "E-mail inválido.")
    if db.consultar("SELECT 1 FROM usuarios WHERE lower(email) = lower(%s)", (dados.email,)):
        raise HTTPException(409, "Já existe usuário com este e-mail.")
    with db.conexao() as c:
        cur = c.cursor()
        cur.execute("INSERT INTO usuarios (email, nome, papel, senha_hash) VALUES (%s,%s,%s,%s) RETURNING id",
                    (dados.email.strip(), dados.nome.strip(), dados.papel, hash_senha(senha)))
        novo = cur.fetchone()[0]
        cur.execute("INSERT INTO auditoria (usuario_id, acao, tabela, registro_id, depois) VALUES (%s,'criar','usuarios',%s,%s)",
                    (adm.id, str(novo), json.dumps({"email": dados.email, "papel": dados.papel})))
    return {"id": novo, "senha_provisoria": None if dados.senha else senha}


class AlteraUsuario(BaseModel):
    nome: str | None = Field(default=None, max_length=120)
    papel: str | None = Field(default=None, pattern="^(admin|editor|leitor)$")
    ativo: bool | None = None
    nova_senha: str | None = Field(default=None, max_length=200)


@router.patch("/{uid}")
def alterar(uid: int, dados: AlteraUsuario, adm: Usuario = Depends(exige("admin"))):
    if uid == adm.id and (dados.ativo is False or (dados.papel and dados.papel != "admin")):
        raise HTTPException(400, "Você não pode remover o próprio acesso de administrador.")
    sets, params = [], []
    for col in ("nome", "papel", "ativo"):
        v = getattr(dados, col)
        if v is not None:
            sets.append(f"{col} = %s")
            params.append(v)
    if dados.nova_senha:
        validar_senha_nova(dados.nova_senha)
        sets.append("senha_hash = %s")
        params.append(hash_senha(dados.nova_senha))
    if not sets:
        return {"ok": True}
    with db.conexao() as c:
        cur = c.cursor()
        cur.execute(f"UPDATE usuarios SET {', '.join(sets)}, atualizado_em = now() WHERE id = %s", (*params, uid))
        if cur.rowcount == 0:
            raise HTTPException(404, "Usuário não encontrado.")
        cur.execute("INSERT INTO auditoria (usuario_id, acao, tabela, registro_id) VALUES (%s,'alterar','usuarios',%s)",
                    (adm.id, str(uid)))
    return {"ok": True}
