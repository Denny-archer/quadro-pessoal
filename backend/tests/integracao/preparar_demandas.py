"""Dados sintéticos para validação HTTP e visual; nunca executar em base real."""
from app.core import db,config,seguranca
if not config.DATABASE_URL.endswith('/rh_demandas_test'):
    raise SystemExit('Recusado: somente rh_demandas_test.')
db.aplicar_schema()
with db.conexao() as c:
    q=c.cursor()
    q.execute('TRUNCATE usuarios,funcionarios,ocorrencias,config,importacoes,auditoria,integracao_chaves,ponto_marcacoes,ponto_resumos,ponto_vinculos,ponto_sincronizacao,login_tentativas,setores_aux,cargos_aux RESTART IDENTITY CASCADE')
    for nome in ('Administração','Tecnologia','Financeiro'):
        q.execute('INSERT INTO setores_aux(setor,codigo) VALUES(%s,%s)',(nome,nome[:3].upper()))
    for fid,nome,setor in [('ana','Ana Teste',1),('bruno','Bruno Teste',2),('carla','Carla Teste',3)]:
        q.execute('INSERT INTO funcionarios(id,nome,matricula,setor_id,setor) SELECT %s,%s,%s,%s,setor FROM setores_aux WHERE id=%s',(fid,nome,fid,setor,setor))
        q.execute('INSERT INTO funcionario_lotacoes(funcionario_id,setor_id) VALUES(%s,%s)',(fid,setor))
    for email,nome,papel,fid in [('admin@teste.local','Admin Teste','admin',None),('ana@teste.local','Ana Teste','colaborador','ana'),('gestor@teste.local','Gestor Teste','gestor','carla')]:
        q.execute('INSERT INTO usuarios(email,nome,papel,senha_hash) VALUES(%s,%s,%s,%s) RETURNING id',(email,nome,papel,seguranca.hash_senha('Validacao-local!2026')))
        uid=q.fetchone()[0]
        if fid:q.execute('INSERT INTO usuario_funcionario(usuario_id,funcionario_id) VALUES(%s,%s)',(uid,fid))
        if papel=='gestor':
            for sid in (1,2):q.execute('INSERT INTO gestores_setores(usuario_id,setor_id) VALUES(%s,%s)',(uid,sid))
    q.execute("INSERT INTO acesso_revisoes(usuario_id) SELECT id FROM usuarios ON CONFLICT DO NOTHING")
from app.demandas.service import salvar
from app.schemas.auth import Usuario
admin=Usuario(id=1,email='admin@teste.local',nome='Admin Teste',papel='admin')
salvar(admin,'modelos','modelo-teste',0,{'nome':'Conferência de processo','descricao':'Modelo sintético de homologação',
    'etapas':[{'texto':'Conferir documentação','prazoDias':2},{'texto':'Registrar encaminhamento','prazoDias':5}]})
salvar(admin,'metas','meta-teste',0,{'titulo':'Organizar o fluxo de demandas da equipe','setorId':1,
    'oque':'Acompanhar as demandas diretamente no painel','porque':'Dar visibilidade aos prazos',
    'quem':'Equipe de teste','onde':'COFFITO','quando':'Até dezembro de 2026','como':'Revisar o fluxo com a equipe',
    'quanto':'Sem custo adicional','prazo':'2026-12-15',
    'etapas':[{'etapa':'Revisar o fluxo com a equipe','responsavel':'Ana Teste','status':'andamento','prazo':'2026-11-15','meses':{}}]})
print('Base sintética preparada; nenhum dado real.')
