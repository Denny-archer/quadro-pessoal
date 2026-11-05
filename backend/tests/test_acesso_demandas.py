"""Contratos de autorização, identidade e concorrência dos dois módulos."""
import os
import pytest
if os.getenv('RH_TEST_DB')!='1':
    pytest.skip('Requer PostgreSQL descartável.',allow_module_level=True)
from test_api import cliente, entrar, SENHA
from app.core import db, seguranca


def base(c):
    entrar(c)
    setores=[]
    for nome in ('Setor A','Setor B','Setor C'):
        r=c.put('/api/acesso/organizacao/setores/0',json={'nome':nome})
        assert r.status_code==200,r.text
        setores.append(r.json()['id'])
    # O cadastro organizacional não é removido pelo fixture histórico.
    for i,(fid,sid) in enumerate(zip(('a','b','c'),setores)):
        r=c.put('/api/dados/funcionarios/'+fid,json={'nome':'Pessoa '+fid,'matricula':str(i+1),'setorId':sid,'nivelSalarial':i+1})
        assert r.status_code==200,r.text
    with db.conexao() as cn:
        q=cn.cursor()
        for email,papel,fid in [('a@test','colaborador','a'),('b@test','colaborador','b'),('gestor@test','gestor','c'),('sem@test','colaborador',None)]:
            q.execute('INSERT INTO usuarios(email,nome,papel,senha_hash) VALUES(%s,%s,%s,%s) RETURNING id',(email,email,papel,seguranca.hash_senha(SENHA)))
            uid=q.fetchone()[0]
            if fid:q.execute('INSERT INTO usuario_funcionario(usuario_id,funcionario_id) VALUES(%s,%s)',(uid,fid))
            if papel=='gestor':
                for sid in setores[:2]:q.execute('INSERT INTO gestores_setores(usuario_id,setor_id) VALUES(%s,%s)',(uid,sid))
    return setores


def login(c,email):
    r=c.post('/api/auth/login',json={'email':email,'senha':SENHA})
    assert r.status_code==200,r.text


def criar(c,rid,sid,fid):
    r=c.put('/api/demandas/demandas/'+rid,json={'versao':0,'dados':{'titulo':'Demanda '+rid,'setorId':sid,'responsavelId':fid,'prioridade':'media','status':'afazer','checklist':{'i':{'texto':'Conferir','feito':False}}}})
    assert r.status_code==200,r.text
    return r.json()


def test_colaborador_nao_recebe_outros_por_colecoes_ids_indicadores_ou_eventos(cliente):
    sa,sb,sc=base(cliente)
    criar(cliente,'da',sa,'a');criar(cliente,'db',sb,'b')
    login(cliente,'a@test')
    assert [x['id'] for x in cliente.get('/api/dados/funcionarios').json()]==['a']
    assert cliente.get('/api/presenca/b',params={'de':'2026-10-01','ate':'2026-10-02'}).status_code==403
    assert cliente.get('/api/jornada/b',params={'de':'2026-10-01','ate':'2026-10-02'}).status_code==403
    assert cliente.get('/api/demandas/demandas/db').status_code==404
    estado=cliente.get('/api/demandas/estado').json()
    assert [d['id'] for d in estado['demandas']]==['da']
    assert [c['id'] for c in estado['colaboradores']]==['a']
    assert cliente.patch('/api/demandas/demandas/da',json={'versao':1,'dados':{'status':'concluida'}}).status_code==403
    assert cliente.get('/api/importacao/historico').status_code in (403,404)
    assert cliente.put('/api/dados/funcionarios/a',json={'nome':'Alterado'}).status_code==403
    uid=cliente.get('/api/auth/eu').json()['id']
    antes=db.consultar('SELECT coalesce((SELECT revisao FROM acesso_revisoes WHERE usuario_id=%s),0) revisao',(uid,))[0]['revisao']
    entrar(cliente)
    criar(cliente,'db2',sb,'b')
    depois=db.consultar('SELECT coalesce((SELECT revisao FROM acesso_revisoes WHERE usuario_id=%s),0) revisao',(uid,))[0]['revisao']
    assert depois==antes


def test_gestor_multissetor_consulta_proprios_dados_e_nao_edita_rh(cliente):
    sa,sb,sc=base(cliente)
    login(cliente,'gestor@test')
    assert {x['id'] for x in cliente.get('/api/dados/funcionarios').json()}=={'a','b','c'}
    criar(cliente,'gestao',sa,'a')
    assert cliente.put('/api/dados/funcionarios/a',json={'nome':'Tentativa'}).status_code==403
    assert cliente.put('/api/demandas/demandas/fora',json={'versao':0,'dados':{'titulo':'Não autorizado','setorId':sc,'responsavelId':'c'}}).status_code==403
    assert cliente.put('/api/demandas/metas/m',json={'versao':0,'dados':{'titulo':'Meta','setorId':sa}}).status_code==403
    assert cliente.put('/api/demandas/modelos/m',json={'versao':0,'dados':{'nome':'Modelo'}}).status_code==403


def test_conflito_checklist_e_exclusao_exigem_versao_com_auditoria(cliente):
    sa,*_=base(cliente)
    d=criar(cliente,'d',sa,'a')
    atualizado=cliente.patch('/api/demandas/demandas/d',json={'versao':1,'dados':{'checklist':{'i':{'feito':True,'feitoEm':'2026-10-15'}}}})
    assert atualizado.status_code==200,atualizado.text
    assert atualizado.json()['status']=='concluida'
    assert atualizado.json()['versao']==2
    assert cliente.patch('/api/demandas/demandas/d',json={'versao':1,'dados':{'titulo':'Sobrescrita'}}).status_code==409
    assert cliente.delete('/api/demandas/demandas/d?versao=1').status_code==409
    assert cliente.delete('/api/demandas/demandas/d?versao=2').status_code==200
    assert cliente.get('/api/demandas/demandas/d').status_code==404
    assert db.consultar("SELECT excluido_em,versao FROM demandas.demandas WHERE id='d'")[0]['versao']==3
    assert db.consultar("SELECT count(*) n FROM auditoria WHERE tabela='demandas.demandas' AND registro_id='d'")[0]['n']==3


def test_lotacao_muda_rh_sem_transferir_demanda_e_transferencia_exige_admin(cliente):
    sa,sb,sc=base(cliente)
    criar(cliente,'antiga',sa,'a')
    uid=db.consultar("SELECT id FROM usuarios WHERE email='gestor@test'")[0]['id']
    assert cliente.put(f'/api/acesso/usuarios/{uid}/vinculo',json={'funcionario_id':'c','setores':[sa]}).status_code==200
    r=cliente.put('/api/acesso/funcionarios/a/organizacao',json={'setor_id':sb,'cargo_id':None})
    assert r.status_code==200,r.text
    login(cliente,'gestor@test')
    assert {x['id'] for x in cliente.get('/api/dados/funcionarios').json()}=={'c'}
    assert cliente.get('/api/demandas/demandas/antiga').status_code==200
    assert cliente.patch('/api/demandas/demandas/antiga',json={'versao':1,'dados':{'setorId':sb}}).status_code==403
    entrar(cliente)
    r=cliente.patch('/api/demandas/demandas/antiga',json={'versao':1,'dados':{'setorId':sb}})
    assert r.status_code==200,r.text
    assert db.consultar("SELECT count(*) n FROM funcionario_lotacoes WHERE funcionario_id='a'")[0]['n']==2


def test_sem_vinculo_metas_globais_e_admin_sem_vinculo(cliente):
    sa,*_=base(cliente)
    assert cliente.get('/api/acesso/contexto').json()['funcionario_id'] is None
    r=cliente.put('/api/demandas/metas/m',json={'versao':0,'dados':{'titulo':'Meta pública autenticada','setorId':sa,'etapas':[]}})
    assert r.status_code==200,r.text
    login(cliente,'sem@test')
    assert cliente.get('/api/dados/funcionarios').json()==[]
    s=cliente.get('/api/demandas/estado').json()
    assert not s['demandas'] and not s['colaboradores']
    assert len(s['metas'])==1


def test_vinculo_unico_revogacao_e_exclusao_funcionario_preservam_historico(cliente):
    sa,*_=base(cliente)
    criar(cliente,'preservada',sa,'a')
    b=db.consultar("SELECT id FROM usuarios WHERE email='b@test'")[0]['id']
    assert cliente.put(f'/api/acesso/usuarios/{b}/vinculo',json={'funcionario_id':'a','setores':[]}).status_code==409
    assert cliente.delete('/api/dados/funcionarios/a').status_code==200
    assert db.consultar("SELECT situacao FROM funcionarios WHERE id='a'")[0]['situacao']=='inativo'
    assert db.consultar("SELECT funcionario_id FROM demandas.demandas WHERE id='preservada'")[0]['funcionario_id']=='a'
    assert cliente.post('/api/auth/login',json={'email':'a@test','senha':SENHA}).status_code==401


def test_provisoria_bloqueia_dados_ate_troca(cliente):
    entrar(cliente)
    r=cliente.post('/api/usuarios',json={'nome':'Novo Acesso','email':'novo@test','papel':'colaborador'})
    assert r.status_code==200,r.text
    senha=r.json()['senha_provisoria']
    assert cliente.post('/api/auth/login',json={'email':'novo@test','senha':senha}).status_code==200
    assert cliente.get('/api/auth/eu').json()['trocar_senha'] is True
    assert cliente.get('/api/demandas/estado').status_code==403
    r=cliente.post('/api/auth/senha',json={'atual':senha,'nova':'Minha-senha-definitiva!123'})
    assert r.status_code==200,r.text
    assert cliente.get('/api/demandas/estado').status_code==200


def test_modelo_instanciado_preserva_copia_apos_edicao_e_inativacao(cliente):
    sa,*_=base(cliente)
    r=cliente.put('/api/demandas/modelos/modelo',json={'versao':0,'dados':{'nome':'Modelo inicial','etapas':[{'texto':'Etapa original','prazoDias':2}]}})
    assert r.status_code==200,r.text
    r=cliente.put('/api/demandas/demandas/instancia',json={'versao':0,'dados':{'titulo':'Instância','setorId':sa,'responsavelId':'a','modeloId':'modelo','inicio':'2026-10-15'}})
    assert r.status_code==200,r.text
    assert r.json()['checklist']['etapa0']['texto']=='Etapa original'
    assert r.json()['checklist']['etapa0']['prazo']=='2026-10-17'
    assert cliente.put('/api/demandas/modelos/modelo',json={'versao':1,'dados':{'nome':'Modelo atualizado','etapas':[{'texto':'Outra etapa','prazoDias':9}]}}).status_code==200
    assert cliente.get('/api/demandas/demandas/instancia').json()['checklist']['etapa0']['texto']=='Etapa original'
    assert cliente.delete('/api/demandas/modelos/modelo?versao=2').status_code==200
    assert cliente.get('/api/demandas/demandas/instancia').status_code==200


def test_revogar_gestao_muda_alcance_na_sessao_existente(cliente):
    sa,sb,sc=base(cliente)
    login(cliente,'gestor@test')
    u=cliente.get('/api/auth/eu').json()
    cookie=cliente.cookies.get('qp_sessao')
    assert {x['id'] for x in cliente.get('/api/dados/funcionarios').json()}=={'a','b','c'}
    entrar(cliente)
    assert cliente.put(f"/api/acesso/usuarios/{u['id']}/vinculo",json={'funcionario_id':'c','setores':[]}).status_code==200
    r=cliente.get('/api/dados/funcionarios',headers={'Cookie':'qp_sessao='+cookie})
    assert r.status_code==200,r.text
    assert [x['id'] for x in r.json()]==['c']
    assert cliente.get('/api/acesso/contexto',headers={'Cookie':'qp_sessao='+cookie}).json()['setores_geridos']==[]
