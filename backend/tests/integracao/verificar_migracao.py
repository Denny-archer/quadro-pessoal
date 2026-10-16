"""Migração de instalação legada sintética, sem consulta a dados reais."""
import uuid
import pg8000.dbapi
from app.core import db,config,migracoes
from app.core.paths import SCHEMA
if not config.DATABASE_URL.endswith('/rh_demandas_test'):
    raise SystemExit('Somente ambiente descartável.')
nome='rh_migracao_'+uuid.uuid4().hex[:8]+'_test'
params=config.parametros_conexao()
cn=pg8000.dbapi.connect(**params);cn.autocommit=True
cn.cursor().execute('CREATE DATABASE '+nome)
params['database']=nome
c=pg8000.dbapi.connect(**params)
q=c.cursor()
for sql in db._separar(SCHEMA.read_text(encoding='utf-8')):q.execute(sql)
for papel in ('admin','editor','leitor'):
    q.execute('INSERT INTO usuarios(email,nome,senha_hash,papel) VALUES(%s,%s,%s,%s)',(papel+'@teste',papel,'hash-sintetico',papel))
q.execute("INSERT INTO setores_aux(setor) VALUES('Duplicado'),('Duplicado')")
q.execute("INSERT INTO funcionarios(id,nome,matricula,setor,cargo,extra) VALUES('preservado','Pessoa Teste','0001','Único','Analista','{\"outrosDescontos\":123.45}'),('ambiguo','Pessoa Ambígua','0002','Duplicado',NULL,'{}')")
migracoes.aplicar(q)
q.execute('SELECT papel,sessao_versao FROM usuarios ORDER BY id')
assert [tuple(r) for r in q.fetchall()]==[('admin',0),('colaborador',1),('colaborador',1)]
q.execute("SELECT id,matricula,setor_id,cargo_id,extra FROM funcionarios WHERE id='preservado'")
f=q.fetchone()
assert f[0]=='preservado' and f[1]=='0001' and f[2] and f[3] and f[4]['outrosDescontos']==123.45
q.execute("SELECT setor_id FROM funcionarios WHERE id='ambiguo'")
assert q.fetchone()[0] is None
q.execute('SELECT count(*) FROM funcionario_lotacoes')
assert q.fetchone()[0]==1
migracoes.aplicar(q)
q.execute('SELECT count(*) FROM migracoes_aplicadas')
assert q.fetchone()[0]==1
c.commit();c.close();cn.close()
print('Migração e reexecução verificadas: perfis restritivos, IDs/valores preservados, ambiguidades sem união automática.')
