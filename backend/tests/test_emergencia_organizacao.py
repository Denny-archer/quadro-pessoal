import os
import pytest
if os.getenv('RH_TEST_DB')!='1':
    pytest.skip('Requer base descartável.',allow_module_level=True)
from test_api import cliente,entrar,SENHA
from test_acesso_demandas import base,login
from app.core import config,db


def test_formulario_legado_nao_descarta_nem_ignora_referencia_de_setor(cliente):
    sa,sb,sc=base(cliente)
    doc=next(f for f in cliente.get('/api/dados/funcionarios').json() if f['id']=='a')
    doc['setor']='Setor B'  # formulário legado mantém setorId anterior ao editar o texto
    r=cliente.put('/api/dados/funcionarios/a',json=doc)
    assert r.status_code==200,r.text
    assert db.consultar("SELECT setor_id FROM funcionarios WHERE id='a'")[0]['setor_id']==sb


def test_restricao_emergencial_preserva_admin_e_bloqueia_sessoes_comuns(cliente,monkeypatch):
    base(cliente)
    login(cliente,'a@test')
    monkeypatch.setattr(config,'ACESSO_SOMENTE_ADMIN',True)
    assert cliente.get('/api/demandas/estado').status_code==403
    assert cliente.post('/api/auth/login',json={'email':'a@test','senha':SENHA}).status_code==403
    entrar(cliente)
    assert cliente.get('/api/acesso/administracao').status_code==200
