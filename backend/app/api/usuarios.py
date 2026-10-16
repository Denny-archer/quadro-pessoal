"""Gestão de usuários do sistema (somente administradores)."""
from __future__ import annotations

import json
import secrets
import pg8000.dbapi

from fastapi import APIRouter, Depends, HTTPException

from ..core import db
from ..schemas.auth import Usuario
from ..schemas.usuarios import NovoUsuario, AlteraUsuario
from ..core.seguranca import exige, hash_senha, validar_senha_nova
from ..services.auditoria import auditar

router = APIRouter(prefix="/api/usuarios", tags=["usuários"])
CAMPOS = "id, email, nome, papel, ativo, ultimo_acesso, criado_em"


@router.get("")
def listar(_: Usuario = Depends(exige("admin"))):
    return db.consultar(f"SELECT {CAMPOS} FROM usuarios ORDER BY nome")


@router.post("")
def criar(dados: NovoUsuario, adm: Usuario = Depends(exige("admin"))):
    senha = dados.senha or secrets.token_urlsafe(12)
    validar_senha_nova(senha)
    dados.email = dados.email.strip().lower()
    dados.nome = dados.nome.strip()
    if "@" not in dados.email or not dados.nome:
        raise HTTPException(400, "E-mail inválido.")
    with db.conexao() as c:
        cur = c.cursor()
        cur.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))', ('usuario:' + dados.email,))
        cur.execute('SELECT 1 FROM usuarios WHERE lower(email)=lower(%s)', (dados.email,))
        if cur.fetchone():
            raise HTTPException(409, 'Já existe usuário com este e-mail.')
        cur.execute("INSERT INTO usuarios (email, nome, papel, senha_hash,trocar_senha) VALUES (%s,%s,%s,%s,true) RETURNING id",
                    (dados.email.strip(), dados.nome.strip(), dados.papel, hash_senha(senha)))
        novo = cur.fetchone()[0]
        cur.execute("INSERT INTO auditoria (usuario_id, acao, tabela, registro_id, depois) VALUES (%s,'criar','usuarios',%s,%s)",
                    (adm.id, str(novo), json.dumps({"email": dados.email, "papel": dados.papel})))
    return {"id": novo, "senha_provisoria": None if dados.senha else senha}


@router.patch("/{uid}")
def alterar(uid: int, dados: AlteraUsuario, adm: Usuario = Depends(exige("admin"))):
    if uid == adm.id and (dados.ativo is False or (dados.papel and dados.papel != "admin")):
        raise HTTPException(400, "Você não pode remover o próprio acesso de administrador.")
    sets, params = [], []
    for col in ("nome", "papel", "ativo"):
        v = getattr(dados, col)
        if v is not None:
            if col == 'nome':
                v = v.strip()
                if len(v) < 2:
                    raise HTTPException(400, 'Informe o nome com pelo menos 2 caracteres.')
            sets.append(f"{col} = %s")
            params.append(v)
    if dados.nova_senha:
        validar_senha_nova(dados.nova_senha)
        sets.append("senha_hash = %s")
        params.append(hash_senha(dados.nova_senha))
        sets.append('sessao_versao = sessao_versao + 1')
        sets.append('trocar_senha = true')
    if not sets:
        return {"ok": True}
    with db.conexao() as c:
        cur = c.cursor()
        cur.execute(f'SELECT {CAMPOS} FROM usuarios WHERE id = %s FOR UPDATE', (uid,))
        antes = db.linhas(cur)
        if not antes:
            raise HTTPException(404, 'Usuário não encontrado.')
        cur.execute(f"UPDATE usuarios SET {', '.join(sets)}, atualizado_em = now() WHERE id = %s", (*params, uid))
        from ..acesso.service import invalidar
        if dados.papel and dados.papel != 'gestor':
            cur.execute('UPDATE gestores_setores SET ativo=false WHERE usuario_id=%s', (uid,))
        invalidar(cur,usuarios=[uid])
        if dados.nova_senha or dados.ativo is False:
            cur.execute('DELETE FROM auth_sessoes WHERE usuario_id=%s', (uid,))
        cur.execute(f'SELECT {CAMPOS} FROM usuarios WHERE id = %s', (uid,))
        depois = db.linhas(cur)[0]
        if dados.nova_senha:
            depois['senha_alterada'] = True
        auditar(cur, adm.id, 'alterar', 'usuarios', str(uid), antes[0], depois)
    return {"ok": True}
