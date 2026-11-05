"""Compara o dump restaurado dos dois módulos e seus vínculos."""
import pg8000.dbapi
from app.core import config
if not config.DATABASE_URL.endswith('/rh_demandas_test'):
    raise SystemExit('Somente ambiente descartável.')
params=config.parametros_conexao()
origem=pg8000.dbapi.connect(**params)
params['database']='rh_restauracao_test'
destino=pg8000.dbapi.connect(**params)
tabelas=['usuarios','funcionarios','usuario_funcionario','setores_aux','cargos_aux','gestores_setores',
         'funcionario_lotacoes','auditoria','acesso_revisoes','demandas.demandas','demandas.checklist_itens',
         'demandas.modelos','demandas.modelo_etapas','demandas.metas','demandas.meta_etapas','migracoes_aplicadas']
for tabela in tabelas:
    sql=f'SELECT row_to_json(t)::text FROM {tabela} t ORDER BY row_to_json(t)::text'
    a=origem.cursor();b=destino.cursor();a.execute(sql);b.execute(sql)
    assert a.fetchall()==b.fetchall(),tabela
print(f'Restauração conferida: conteúdo idêntico em {len(tabelas)} tabelas de RH, demandas, acesso e histórico.')
