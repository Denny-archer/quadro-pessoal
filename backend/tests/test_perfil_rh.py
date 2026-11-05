"""Perfil RH: permissões reais, atualização por destinatário e saldos concorrentes."""
import hashlib
import os
import pytest
if os.getenv('RH_TEST_DB') != '1':
    pytest.skip('Requer PostgreSQL descartável.', allow_module_level=True)
from test_api import cliente, entrar, SENHA
from test_acesso_demandas import base, login, criar
from app.core import db, seguranca
from app.core.paths import ROOT


def preparar(c, setores=()):
    ids = base(c)
    with db.conexao() as cn:
        q = cn.cursor()
        q.execute('INSERT INTO usuarios(email,nome,papel,senha_hash) VALUES(%s,%s,%s,%s) RETURNING id',
                  ('rh@test', 'Equipe RH', 'rh', seguranca.hash_senha(SENHA)))
        uid = q.fetchone()[0]
        q.execute("DELETE FROM usuario_funcionario WHERE funcionario_id='c'")
        q.execute("INSERT INTO usuario_funcionario(usuario_id,funcionario_id) VALUES(%s,'c')", (uid,))
    assert c.put(f'/api/acesso/usuarios/{uid}/vinculo', json={'funcionario_id': 'c', 'setores': [ids[i] for i in setores]}).status_code == 200
    return uid, ids


def ficha(c):
    return next(f for f in c.get('/api/dados/funcionarios').json() if f['id'] == 'a')


@pytest.mark.parametrize('email,papel,quantidade,lancar', [('admin@test','admin',3,True), ('rh@test','rh',3,True), ('gestor@test','gestor',2,False), ('a@test','colaborador',1,False)])
def test_carregamento_e_capacidades_quatro_perfis(cliente, email, papel, quantidade, lancar):
    preparar(cliente)
    login(cliente, email)
    ctx = cliente.get('/api/acesso/contexto')
    assert ctx.status_code == 200, ctx.text
    ctx = ctx.json()
    assert ctx['perfil'] == papel
    assert ctx['capacidades']['lancar_rh'] is lancar
    assert ctx['capacidades']['alterar_rh'] is (papel == 'admin')
    assert ctx['capacidades']['administrar_acessos'] is (papel == 'admin')
    assert len(cliente.get('/api/dados/funcionarios').json()) == quantidade
    assert cliente.get('/api/dados/versoes').status_code == 200
    assert cliente.get('/api/dados/ocorrencias').status_code == 200
    assert cliente.get('/administracao').status_code == (200 if papel == 'admin' else 403)
    assert cliente.get('/api/acesso/administracao').status_code == (200 if papel == 'admin' else 403)


def test_rh_nao_altera_cadastro_configuracoes_usuarios_organizacao_integracao(cliente):
    uid, setores = preparar(cliente)
    antes = ficha(cliente)
    login(cliente, 'rh@test')
    assert cliente.put('/api/dados/funcionarios/novo', json={'nome':'Novo'}).status_code == 403
    assert cliente.put('/api/dados/funcionarios/a', json={**antes, 'nome':'Indevido'}).status_code == 403
    assert cliente.delete('/api/dados/funcionarios/a').status_code == 403
    for tipo in ['beneficios', 'remuneracao', 'ponto']:
        assert cliente.get('/api/dados/config/' + tipo).status_code == 200
        assert cliente.put('/api/dados/config/' + tipo, json={}).status_code == 403
    for url, body in [('/api/acesso/usuarios/1/vinculo', {'setores':setores}),
                      ('/api/acesso/funcionarios/a/organizacao', {'setor_id':setores[1], 'cargo_id':None}),
                      ('/api/acesso/organizacao/setores/0', {'nome':'Indevido'})]:
        assert cliente.put(url, json=body).status_code == 403
    assert cliente.post('/api/usuarios', json={'email':'novo@test','nome':'Novo'}).status_code == 403
    assert cliente.patch(f'/api/usuarios/{uid}', json={'papel':'admin'}).status_code == 403
    assert cliente.post('/api/integracao/chaves', json={'nome':'Indevido'}).status_code == 403
    assert ficha(cliente) == antes


@pytest.mark.parametrize('tipo', ['abono','ferias','atestado','viagem','capacitacao','banco'])
def test_rh_opera_todos_os_lancamentos(cliente, tipo):
    preparar(cliente)
    login(cliente, 'rh@test')
    doc = {'func':'a', 'tipo':tipo, 'inicio':'2026-10-01', 'fim':'2026-10-02', 'horas':2}
    if tipo == 'ferias':
        f = ficha(cliente)
        pa = {'inicio':'2025-01-01','fim':'2025-12-31','limite':'2026-12-31','direito':30}
        r = cliente.put('/api/dados/funcionarios/a/saldos', json={'revisao':f['atualizadoEm'], 'periodosAquisitivos':[pa]})
        assert r.status_code == 200, r.text
        doc.update(aquisitivo=pa['inicio'], aquisitivoFim=pa['fim'])
    assert cliente.put('/api/dados/ocorrencias/o', json=doc).status_code == 200
    assert cliente.put('/api/dados/ocorrencias/o', json={**doc,'obs':'Conferido'}).status_code == 200
    assert cliente.delete('/api/dados/ocorrencias/o').status_code == 200
    assert db.consultar("SELECT count(*) n FROM auditoria WHERE tabela='ocorrencias' AND registro_id='o'")[0]['n'] == 3
    login(cliente, 'gestor@test')
    assert cliente.put('/api/dados/ocorrencias/o', json=doc).status_code == 403
    login(cliente, 'a@test')
    assert cliente.delete('/api/dados/ocorrencias/o').status_code == 403


def test_saldos_parciais_preservam_cadastro_revisao_e_auditoria(cliente):
    preparar(cliente)
    f = ficha(cliente)
    f.update(abonos={'ref2025': {'usados':None,'restantes':3,'semData':['2 dias na origem']}},
             periodosAquisitivos=[{'inicio':'2025-01-01','fim':'2025-12-31','direito':30}],
             beneficiosExtras=[{'tipo':'outro','valor':100}], nivelSalarial=5,
             campoLegado={'preservar':True})
    assert cliente.put('/api/dados/funcionarios/a', json=f).status_code == 200
    antes = ficha(cliente)
    login(cliente, 'rh@test')
    payload = {'revisao':antes['atualizadoEm'], 'abonos':{'ref2025':{'restantes':2,'usados':3}}}
    r = cliente.put('/api/dados/funcionarios/a/saldos', json=payload)
    assert r.status_code == 200, r.text
    depois = r.json()
    assert depois['atualizadoEm'] != antes['atualizadoEm']
    for k, v in antes.items():
        if k not in ('abonos','atualizadoEm'): assert depois[k] == v, k
    assert cliente.put('/api/dados/funcionarios/a/saldos', json=payload).status_code == 409
    assert ficha(cliente) == depois
    audit = db.consultar("SELECT antes,depois,usuario_id FROM auditoria WHERE tabela='funcionarios' AND registro_id='a' ORDER BY id DESC LIMIT 1")[0]
    assert audit['antes'] == {'abonos':antes['abonos']}
    assert audit['depois'] == {'abonos':payload['abonos']}
    assert audit['usuario_id'] == cliente.get('/api/auth/eu').json()['id']
    for email in ('a@test','gestor@test'):
        login(cliente, email)
        assert cliente.put('/api/dados/funcionarios/a/saldos', json=payload).status_code == 403


def test_saldos_rejeitam_payloads_indevidos_sem_mudar_banco(cliente):
    preparar(cliente)
    login(cliente, 'rh@test')
    f = ficha(cliente)
    pa = {'inicio':'2025-01-01','fim':'2025-12-31','direito':30}
    invalidos = [
        {'nome':'invasao'}, {'nivelSalarial':9}, {'setorId':1}, {'abonos':None},
        {'abonos':{'ref2025':{'nome':'invasao'}}}, {'abonos':{'ref2025':{'restantes':-1}}},
        {'abonos':{'ref2025':{'restantes':10**400}}}, {'abonos':{'ref2025':{'restantes':True}}}, {'abonos':{'ref2025':{'restantes':'2'}}},
        {'abonos':{'ref2025':{'semData':[{}]}}}, {'abonos':{'x':{}}},
        {'periodosAquisitivos':{}}, {'periodosAquisitivos':[pa,pa]},
        {'periodosAquisitivos':[{**pa,'fim':'2025-02-30'}]},
        {'periodosAquisitivos':[{**pa,'fim':'2024-01-01'}]},
        {'periodosAquisitivos':[{**pa,'limite':'2024-01-01'}]},
        {'periodosAquisitivos':[{**pa,'direito':False}]},
        {'periodosAquisitivos':[{**pa,'salario':100}]},
        {'revisao':'invalida','abonos':{}}, {'revisao':None,'abonos':{}},
    ]
    for invalido in invalidos:
        r = cliente.put('/api/dados/funcionarios/a/saldos', json={'revisao':f['atualizadoEm'],**invalido})
        assert r.status_code == 400, (invalido,r.text)
    assert ficha(cliente) == f


@pytest.mark.parametrize('indices', [(),(0,),(0,1)])
def test_rh_demandas_setores_explicitos_e_notificacoes(cliente, indices):
    uid, (sa,sb,sc) = preparar(cliente, indices)
    for rid,sid,fid in [('da',sa,'a'),('db',sb,'b'),('dc',sc,'c')]: criar(cliente,rid,sid,fid)
    login(cliente,'rh@test')
    ctx = cliente.get('/api/acesso/contexto').json()
    assert ctx['capacidades']['gerir_demandas'] is bool(indices)
    estado = cliente.get('/api/demandas/estado').json()
    esperados = {'dc'} | {['da','db'][i] for i in indices}
    assert {d['id'] for d in estado['demandas']} == esperados
    assert {c['id'] for c in estado['colaboradores']} == {'c'} | {['a','b'][i] for i in indices}
    assert len(cliente.get('/api/dados/funcionarios').json()) == 3
    for i,(rid,sid,fid) in enumerate([('da',sa,'a'),('db',sb,'b')]):
        assert cliente.get('/api/demandas/demandas/'+rid).status_code == (200 if i in indices else 404)
        assert cliente.patch('/api/demandas/demandas/'+rid,json={'versao':1,'dados':{'titulo':'Editada'}}).status_code == (200 if i in indices else 403)
        assert cliente.put('/api/demandas/demandas/nova'+fid,json={'versao':0,'dados':{'titulo':'Nova','setorId':sid,'responsavelId':fid}}).status_code == (200 if i in indices else 403)
        assert cliente.delete('/api/demandas/demandas/'+rid,params={'versao':2}).status_code == (200 if i in indices else 403)
    for col in ('metas','modelos'):
        assert cliente.put(f'/api/demandas/{col}/m',json={'versao':0,'dados':{'titulo':'Não','nome':'Não','setorId':sa}}).status_code == 403
    def revisao():
        return db.consultar('SELECT revisao FROM acesso_revisoes WHERE usuario_id=%s',(uid,))[0]['revisao']
    entrar(cliente)
    if not indices:
        antes = revisao()
        criar(cliente,'fora',sa,'a')
        assert revisao() == antes  # Não anuncia atividade alheia de Demandas.
    antes = revisao()
    assert cliente.put('/api/dados/ocorrencias/global',json={'tipo':'atestado','func':'a','inicio':'2026-10-01','fim':'2026-10-01'}).status_code == 200
    assert revisao() > antes  # RH recebe mudanças globais do Quadro.


def test_trocas_preservam_setores_e_revogam_acesso_na_sessao_aberta(cliente):
    uid, (sa,sb,sc) = preparar(cliente, (0,1))
    criar(cliente,'da',sa,'a')
    login(cliente,'rh@test')
    cookie = cliente.cookies.get('qp_sessao')
    entrar(cliente)
    for papel in ('gestor','rh'):
        assert cliente.patch(f'/api/usuarios/{uid}',json={'papel':papel}).status_code == 200
        ctx=cliente.get('/api/acesso/contexto',headers={'Cookie':'qp_sessao='+cookie}).json()
        assert ctx['perfil'] == papel and ctx['setores_geridos'] == [sa,sb]
    assert cliente.put(f'/api/acesso/usuarios/{uid}/vinculo',json={'funcionario_id':'c','setores':[]}).status_code == 200
    assert cliente.get('/api/demandas/demandas/da',headers={'Cookie':'qp_sessao='+cookie}).status_code == 404
    assert cliente.patch(f'/api/usuarios/{uid}',json={'papel':'colaborador'}).status_code == 200
    ctx=cliente.get('/api/acesso/contexto',headers={'Cookie':'qp_sessao='+cookie}).json()
    assert ctx['setores_geridos'] == [] and not ctx['capacidades']['lancar_rh']
    assert [f['id'] for f in cliente.get('/api/dados/funcionarios',headers={'Cookie':'qp_sessao='+cookie}).json()] == ['c']


def test_migracao_idempotente_e_conta_padrao_colaborador(cliente):
    antes=db.consultar("SELECT checksum,aplicado_em FROM migracoes_aplicadas WHERE nome='002_perfil_rh.py'")
    assert antes[0]['checksum'] == hashlib.sha256((ROOT/'db/migrations/002_perfil_rh.py').read_bytes()).hexdigest()
    db.aplicar_schema()
    assert db.consultar("SELECT checksum,aplicado_em FROM migracoes_aplicadas WHERE nome='002_perfil_rh.py'") == antes
    entrar(cliente)
    r=cliente.post('/api/usuarios',json={'nome':'Conta padrão','email':'padrao@test'})
    assert r.status_code == 200,r.text
    assert db.consultar('SELECT papel FROM usuarios WHERE id=%s',(r.json()['id'],))[0]['papel'] == 'colaborador'
