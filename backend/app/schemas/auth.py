"""Contratos de sessão e autenticação."""
from pydantic import BaseModel, Field
from typing import Literal

class Usuario(BaseModel):
    id: int
    email: str
    nome: str
    papel: Literal['admin','gestor','colaborador']
    trocar_senha: bool = False


class Login(BaseModel):
    email: str = Field(max_length=200)
    senha: str = Field(max_length=200)


class TrocaSenha(BaseModel):
    atual: str = Field(max_length=200)
    nova: str = Field(max_length=200)
