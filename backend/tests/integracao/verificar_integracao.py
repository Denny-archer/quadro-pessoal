"""PostgreSQL do ponto -> worker -> HTTP -> PostgreSQL do RH, só dados sintéticos."""
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
from urllib.parse import urlparse

PONTO_API = Path(os.getenv('PONTO_API_DIR', '/ponto')).resolve()
RH_ROOT = next(p for p in [Path(os.getenv('RH_PROJECT_DIR', '/rh')), *Path(__file__).resolve().parents]
               if (p / 'backend/app').is_dir())
sys.path[:0] = [str(PONTO_API / 'tests'), str(PONTO_API), str(RH_ROOT / 'backend')]
import support
import httpx
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session
from ponto.database import table_registry
from ponto.models.usuarios import Usuario
from ponto.models.jornadas import Jornada
from ponto.models.batidas import Batida
from ponto.models.pontos_diarios import PontoDiario
from ponto.models.integracao_rh import RHOutbox
from ponto.integracao_rh.outbox import verificar_schema
from ponto.integracao_rh.worker import enviar_pendentes, sinalizar
from ponto.settings import settings
from app.core import db, seguranca as auth

url = os.environ['TEST_PG_URL']
for endereco, base in ((url, 'ponto_integracao_test'), (os.environ['DATABASE_URL'], 'rh_test')):
    destino = urlparse(endereco)
    assert destino.path == '/' + base and destino.hostname in {'db', '127.0.0.1', 'localhost'}, 'Somente bancos locais descartáveis.'
RH_TEST_URL = os.getenv('RH_TEST_URL', 'http://rh:8000')
assert urlparse(RH_TEST_URL).hostname in {'rh', '127.0.0.1', 'localhost'}
schema = 'integracao_' + uuid4().hex
root = create_engine(url)
with root.begin() as c:
    c.execute(text('CREATE SCHEMA ' + schema))
engine = create_engine(url, connect_args={'options': '-csearch_path=' + schema})
settings.RH_INTEGRACAO_ENABLED = False
try:
    tables = [t for t in table_registry.metadata.sorted_tables if not t.name.startswith('rh_')]
    table_registry.metadata.create_all(engine, tables=tables)
    with engine.begin() as c:
        for tabela in ('tipos_usuarios', 'departamentos', 'cargos'):
            c.execute(text(f"INSERT INTO {tabela}(id,nome) VALUES(1,'Teste')"))
    sql = (PONTO_API / 'migrations/002_integracao_rh.sql').read_text(encoding='utf-8')
    with engine.connect().execution_options(isolation_level='AUTOCOMMIT') as c:
        c.exec_driver_sql(sql); c.exec_driver_sql(sql)
    settings.RH_INTEGRACAO_ENABLED = True
    verificar_schema(engine)
    db.aplicar_schema()
    with db.conexao() as c:
        c.cursor().execute('TRUNCATE usuarios, funcionarios, ocorrencias, config, importacoes, auditoria, integracao_chaves, ponto_marcacoes, ponto_resumos, ponto_vinculos, ponto_sincronizacao, login_tentativas RESTART IDENTITY CASCADE')
    senha, email, matricula = 'Teste-isolado!123456', uuid4().hex + '@test', uuid4().hex[:8]
    with db.conexao() as c:
        c.cursor().execute('INSERT INTO usuarios(email,nome,papel,senha_hash) VALUES(%s,%s,%s,%s)',
            (email, 'Teste Integração', 'admin', auth.hash_senha(senha)))
    cliente = httpx.Client(base_url=RH_TEST_URL, headers={'X-Requested-With': 'quadro-pessoal'})
    cliente.post('/api/auth/login', json={'email':email, 'senha':senha}).raise_for_status()
    fid = uuid4().hex
    cliente.put('/api/dados/funcionarios/'+fid, json={'nome':'Pessoa Sintética','vinculo':'efetivo','matricula':matricula}).raise_for_status()
    r = cliente.post('/api/integracao/chaves', json={'nome':'Integração descartável'}); r.raise_for_status()
    cabecalho = {'Authorization':'Bearer '+r.json()['chave']}
    def transporte(caminho, corpo):
        resposta = cliente.post(caminho, headers=cabecalho, json=corpo)
        resposta.raise_for_status()
        return resposta.json()
    dia = date(2026,10,5)
    with Session(engine) as sessao:
        settings.RH_INTEGRACAO_ENABLED = False
        u = Usuario(nome='Pessoa Sintética', tipo_usuario=1, matricula=matricula, departamento=1, cargo=1,
            cpf='99999999999', email=email, password='sem-uso', data_admissao=date(2025,11,26), criado_por=None, atualizado_por=None)
        sessao.add(u); sessao.flush()
        sessao.add(Jornada(id_usuario=u.id, inicio_vigencia=date(2025,11,26), fim_vigencia=date(9999,1,1),
            carga_horaria_diaria=timedelta(hours=8), criado_por=u.id, atualizado_por=u.id))
        sessao.commit(); settings.RH_INTEGRACAO_ENABLED = True
        for hora, modalidade in [(8,'PRESENCIAL'),(12,'PRESENCIAL'),(13,'HOME_OFFICE'),(17,'HOME_OFFICE')]:
            sessao.add(Batida(id_usuario=u.id, data_batida=datetime(2026,10,5,hora), caminho_imagem=None,
                nome_imagem=None, tipo='E', descricao=None, modalidade=modalidade))
        oficial = PontoDiario(id_usuario=u.id, data=dia, carga_horaria_esperada=timedelta(hours=8),
            tempo_trabalhado=timedelta(hours=9), saldo_dia=timedelta(hours=1), status='Crédito', qtd_batidas=4)
        sessao.add(oficial); sessao.commit()
        evento = sessao.scalar(select(RHOutbox)); original = evento.payload.copy()
        assert original['segundos_registrados'] == 28800 and original['segundos_oficiais'] == 32400
        assert original['segundos_remotos'] == 14400
        def falha(*args): raise ConnectionError('simulada')
        assert enviar_pendentes(sessao, falha) == 0
        evento.proxima_tentativa = datetime.now(timezone.utc)-timedelta(seconds=1); sessao.commit()
        assert enviar_pendentes(sessao, transporte) == 1
        assert transporte('/api/integracao/ponto/resumos', {'resumos':[original]})['repetidos'] == 1
        ultima = sessao.scalar(select(Batida).order_by(Batida.data_batida.desc()).limit(1))
        sessao.delete(ultima)
        oficial.tempo_trabalhado = timedelta(hours=4); oficial.saldo_dia = timedelta(hours=-4); oficial.qtd_batidas = 3
        sessao.commit()
        assert enviar_pendentes(sessao, transporte) == 1
        assert transporte('/api/integracao/ponto/resumos', {'resumos':[original]})['antigos'] == 1
        sinalizar(sessao, transporte)
        r = cliente.get('/api/jornada/'+fid, params={'de':str(dia),'ate':str(dia)}); r.raise_for_status()
        dados = r.json()
        assert len(dados) == 1 and dados[0]['dados']['versao'] == 2, dados
        assert dados[0]['dados']['segundos_oficiais'] == 14400 and len(dados[0]['dados']['marcacoes']) == 3
        assert sessao.scalar(select(PontoDiario.saldo_dia)) == timedelta(hours=-4)
        r = cliente.get('/api/integracao/ponto/status', headers=cabecalho); r.raise_for_status()
        assert r.json()['sincronizacao']['estado'] == 'em_dia'
    print('PASSOU: migração reexecutável; transação; HTTP real; modalidade; horas oficiais; indisponibilidade/reenvio; idempotência; exclusão; versão antiga; sincronização.')
finally:
    settings.RH_INTEGRACAO_ENABLED = False
    engine.dispose()
    with root.begin() as c:
        c.execute(text('DROP SCHEMA '+schema+' CASCADE'))
    root.dispose()

