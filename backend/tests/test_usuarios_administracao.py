"""Regressões das ações de conta, sempre em PostgreSQL descartável."""
from test_api import cliente, entrar, SENHA
from app.core import db


def test_redefinir_senha_sem_sessao_aberta(cliente):
    entrar(cliente)
    criado = cliente.post('/api/usuarios', json={
        'nome': 'Conta sem sessão', 'email': 'sem-sessao@test', 'papel': 'colaborador',
    })
    assert criado.status_code == 200, criado.text
    uid = criado.json()['id']
    antiga = criado.json()['senha_provisoria']
    assert db.consultar('SELECT count(*) n FROM auth_sessoes WHERE usuario_id=%s', (uid,))[0]['n'] == 0
    nova = 'Senha-provisoria-teste!2026'
    r = cliente.patch(f'/api/usuarios/{uid}', json={'nova_senha': nova})
    assert r.status_code == 200, r.text
    assert db.consultar('SELECT trocar_senha FROM usuarios WHERE id=%s', (uid,))[0]['trocar_senha']
    assert db.consultar("SELECT count(*) n FROM auditoria WHERE tabela='usuarios' AND acao='alterar' AND registro_id=%s", (str(uid),))[0]['n'] == 1
    cliente.post('/api/auth/logout')
    assert cliente.post('/api/auth/login', json={'email': 'sem-sessao@test', 'senha': antiga}).status_code == 401
    assert cliente.post('/api/auth/login', json={'email': 'sem-sessao@test', 'senha': nova}).status_code == 200
    assert cliente.get('/api/auth/eu').json()['trocar_senha'] is True


def test_desativar_sem_sessao_e_rejeitar_id_inexistente(cliente):
    entrar(cliente)
    criado = cliente.post('/api/usuarios', json={
        'nome': 'Conta inativa', 'email': 'inativa@test', 'papel': 'colaborador',
    })
    uid = criado.json()['id']
    r = cliente.patch(f'/api/usuarios/{uid}', json={'ativo': False})
    assert r.status_code == 200, r.text
    assert not db.consultar('SELECT ativo FROM usuarios WHERE id=%s', (uid,))[0]['ativo']
    assert cliente.patch('/api/usuarios/999999', json={'nova_senha': SENHA}).status_code == 404
