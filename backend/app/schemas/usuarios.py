"""Contratos de gestão de usuários."""
from pydantic import BaseModel, Field

class NovoUsuario(BaseModel):
    email: str = Field(max_length=200)
    nome: str = Field(min_length=2, max_length=120)
    papel: str = Field(pattern="^(admin|gestor|colaborador)$")
    senha: str | None = Field(default=None, max_length=200)


class AlteraUsuario(BaseModel):
    nome: str | None = Field(default=None, max_length=120)
    papel: str | None = Field(default=None, pattern="^(admin|gestor|colaborador)$")
    ativo: bool | None = None
    nova_senha: str | None = Field(default=None, max_length=200)
