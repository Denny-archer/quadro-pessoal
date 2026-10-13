"""Regressões HTTP e PostgreSQL. Só executar em banco explicitamente descartável."""
import datetime as dt
import os
from urllib.parse import urlparse

import jwt
import pytest
from fastapi.testclient import TestClient

if os.getenv('RH_TEST_DB') != '1':
    pytest.skip('Requer RH_TEST_DB=1 e base descartável *_test.', allow_module_level=True)
if not urlparse(os.environ['DATABASE_URL']).path.endswith('_test'):
    raise RuntimeError('Recusado: testes de API exigem nome de banco terminado em _test.')

from app.core import seguranca as auth, config, db
from app.main import app

H = {'X-Requested-With': 'quadro-pessoal'}
SENHA = 'Senha-teste!12345'


@pytest.fixture
def cliente():
    with TestClient(app) as c:
        with db.conexao() as conn:
            conn.cursor().execute('TRUNCATE usuarios, funcionarios, ocorrencias, config, importacoes, auditoria, integracao_chaves, ponto_marcacoes, ponto_resumos, ponto_vinculos, ponto_sincronizacao, login_tentativas RESTART IDENTITY CASCADE')
            conn.cursor().execute("INSERT INTO usuarios(email,nome,papel,senha_hash) VALUES ('admin@test','Administrador Teste','admin',%s)", (auth.hash_senha(SENHA),))
        c.headers.update(H)
        yield c


def entrar(c):
    r = c.post('/api/auth/login', json={'email': 'admin@test', 'senha': SENHA})
    assert r.status_code == 200, r.text


def chave(c):
    entrar(c)
    r = c.post('/api/integracao/chaves', json={'nome': 'Ponto Teste'})
    assert r.status_code == 200, r.text
    return {'Authorization': 'Bearer ' + r.json()['chave']}


def funcionario(c, rid='f', matricula='1'):
    r = c.put('/api/dados/funcionarios/' + rid, json={'nome': 'Pessoa Teste', 'matricula': matricula, 'vinculo': 'efetivo', 'entrada': '08:00'})
    assert r.status_code == 200, r.text


def resumo(versao=1):
    agora = dt.datetime.now(dt.timezone.utc)
    dia = agora.astimezone(dt.timezone(dt.timedelta(hours=-3))).date() - dt.timedelta(days=1)
    return {'sistema': 'sistema-ponto', 'colaborador_id': '5', 'matricula': '001', 'data': dia.isoformat(),
        'versao': versao, 'gerado_em': agora.isoformat(), 'marcacoes': [], 'segundos_registrados': 0,
        'segundos_presenciais': 0, 'segundos_remotos': 0, 'segundos_nao_classificados': 0,
        'segundos_oficiais': 3600, 'carga_esperada_segundos': 28800, 'saldo_segundos': -25200,
        'situacao_ponto': 'Débito', 'pendencias': []}


def test_login_sessao_e_csrf(cliente):
    assert cliente.get('/api/auth/eu').status_code == 401
    entrar(cliente)
    assert cliente.get('/api/auth/eu').json()['papel'] == 'admin'
    cliente.headers.pop('X-Requested-With')
    assert cliente.post('/api/auth/logout').status_code == 403
    assert cliente.put('/api/dados/config/ponto', json={}).status_code == 403


def test_sinal_em_dia_nao_comprova_dia_de_pessoa_sem_resumo(cliente):
    h = chave(cliente)
    funcionario(cliente)
    assert cliente.post('/api/integracao/ponto/sinal', headers=h, json={'pendentes': 0}).status_code == 200
    # Dia útil passado sem apuração para esta pessoa, mesmo com sinal global recente.
    out = cliente.get('/api/presenca?data=2026-10-05').json()
    assert out['sincronizacao']['estado'] == 'em_dia'
    assert out['pessoas'][0]['status'] == 'aguardando_integracao'


def test_limite_persistido_entre_clientes(cliente):
    for _ in range(10):
        assert cliente.post('/api/auth/login', json={'email': 'admin@test', 'senha': 'errada'}).status_code == 401
    assert db.consultar('SELECT count(*) AS n FROM login_tentativas')[0]['n'] == 10
    with TestClient(app) as outro:
        assert outro.post('/api/auth/login', headers=H, json={'email': 'admin@test', 'senha': SENHA}).status_code == 429


def test_troca_senha_auditada_invalida_sessao_antiga(cliente):
    entrar(cliente)
    cookie_antigo = cliente.cookies.get(auth.COOKIE)
    r = cliente.post('/api/auth/senha', json={'atual': SENHA, 'nova': 'Nova-senha!12345'})
    assert r.status_code == 200
    assert cliente.get('/api/auth/eu').status_code == 200
    with TestClient(app) as outro:
        outro.cookies.set(auth.COOKIE, cookie_antigo)
        assert outro.get('/api/auth/eu').status_code == 401
    linha = db.consultar("SELECT depois FROM auditoria WHERE acao='alterar'")[-1]['depois']
    assert linha == {'senha_alterada': True}


def test_token_assinado_com_sub_invalido_retorna_401(cliente):
    cliente.cookies.set(auth.COOKIE, jwt.encode({'sub': 'abc', 'exp': dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=1)}, config.JWT_SECRET, algorithm='HS256'))
    assert cliente.get('/api/auth/eu').status_code == 401


def test_perfis_e_configuracao(cliente):
    entrar(cliente)
    assert cliente.put('/api/dados/config/ponto', json={'tolerancia': -1}).status_code == 400
    assert cliente.put('/api/dados/config/ponto', json={'hora_padrao': '99:99'}).status_code == 400
    assert cliente.put('/api/dados/config/ponto', json={'tolerancia': 10, 'hora_padrao': '08:00'}).status_code == 200
    with db.conexao() as conn:
        conn.cursor().execute("UPDATE usuarios SET papel='leitor'")
    assert cliente.put('/api/dados/config/ponto', json={}).status_code == 403
    assert cliente.post('/api/integracao/chaves', json={'nome': 'Recusar'}).status_code == 403


def test_diagnostico_removido_da_gravacao_e_auditoria(cliente):
    entrar(cliente)
    funcionario(cliente)
    r = cliente.put('/api/dados/ocorrencias/o', json={'func': 'f', 'tipo': 'atestado', 'inicio': '2026-10-01', 'fim': '2026-10-01', 'CID-10': 'X', 'extra_novo': {'diagnóstico': 'X'}})
    assert r.status_code == 200, r.text
    assert 'CID' not in str(db.consultar('SELECT extra FROM ocorrencias'))
    assert 'diagnóstico' not in str(db.consultar('SELECT depois FROM auditoria'))


def test_matriculas_equivalentes_nao_duplicam(cliente):
    entrar(cliente)
    funcionario(cliente, 'f', '1')
    assert cliente.put('/api/dados/funcionarios/g', json={'nome': 'Outra Pessoa', 'matricula': '001'}).status_code == 409


def test_batida_legada_idempotencia_e_mudanca_origem(cliente):
    h = chave(cliente)
    funcionario(cliente)
    m = {'id': '1', 'matricula': '01', 'momento': '2026-10-06T08:00:00-03:00', 'origem': 'app'}
    url = '/api/integracao/ponto/marcacoes'
    assert cliente.post(url, headers=h, json={'marcacoes': [m]}).json()['novas'] == 1
    assert cliente.post(url, headers=h, json={'marcacoes': [m]}).json()['sem_alteracao'] == 1
    m['origem'] = 'ajuste'
    assert cliente.post(url, headers=h, json={'marcacoes': [m]}).json()['atualizadas'] == 1
    m['cancelada'] = True
    assert cliente.post(url, headers=h, json={'marcacoes': [m]}).json()['atualizadas'] == 1
    assert db.consultar('SELECT funcionario_id FROM ponto_marcacoes')[0]['funcionario_id'] == 'f'


def test_resumos_versionados_e_lote_atomico(cliente):
    h = chave(cliente)
    funcionario(cliente)
    url = '/api/integracao/ponto/resumos'
    d = resumo()
    assert cliente.post(url, headers=h, json={'resumos': [d]}).json()['aceitos'] == 1
    assert cliente.post(url, headers=h, json={'resumos': [d]}).json()['repetidos'] == 1
    novo = {**d, 'versao': 2, 'segundos_oficiais': 7200, 'saldo_segundos': -21600}
    assert cliente.post(url, headers=h, json={'resumos': [novo]}).json()['aceitos'] == 1
    assert cliente.post(url, headers=h, json={'resumos': [d]}).json()['antigos'] == 1
    conflito = {**novo, 'segundos_oficiais': 0}
    outro = {**novo, 'colaborador_id': '6'}
    assert cliente.post(url, headers=h, json={'resumos': [outro, conflito]}).status_code == 409
    assert db.consultar('SELECT count(*) AS n FROM ponto_resumos')[0]['n'] == 1
    assert cliente.post(url, headers=h, json={'resumos': [{**novo, 'segundos_registrados': 1}]}).status_code == 422


def test_resumo_sem_vinculo_liga_depois_e_mantem_identidade(cliente):
    h = chave(cliente)
    d = resumo()
    assert cliente.post('/api/integracao/ponto/resumos', headers=h, json={'resumos': [d]}).json()['sem_vinculo'] == ['5']
    funcionario(cliente)
    quadro = cliente.get('/api/presenca', params={'data': d['data']})
    assert quadro.status_code == 200, quadro.text
    assert quadro.json()['pessoas'][0]['apuracao']['segundos_oficiais'] == 3600
    assert cliente.get('/api/jornada/f', params={'de': d['data'], 'ate': d['data']}).json()[0]['dados']['versao'] == 1
    assert cliente.get('/api/presenca/f', params={'de': '2026-10-05', 'ate': '2026-10-01'}).status_code == 400


def test_sem_sinal_nao_classifica_falta(cliente):
    h = chave(cliente)
    funcionario(cliente)
    d = resumo()['data']
    assert cliente.get('/api/presenca', params={'data': d}).json()['pessoas'][0]['status'] in ('aguardando_integracao', 'nao_util')
    r = cliente.post('/api/integracao/ponto/sinal', headers=h, json={'pendentes': 0})
    assert r.status_code == 200
    assert cliente.get('/api/presenca').json()['sincronizacao']['estado'] == 'em_dia'


def validar_csv(c, texto):
    r = c.post('/api/importacao/lancamentos/validar', files={'arquivo': ('teste.csv', texto, 'text/csv')})
    assert r.status_code == 200, r.text
    return r.json()['id']


def test_importacoes_concorrentes_reconferem_duplicados(cliente):
    entrar(cliente)
    funcionario(cliente)
    csv = 'matricula;tipo;inicio\n1;abono;01/10/2026\n'
    a, b = validar_csv(cliente, csv), validar_csv(cliente, csv)
    assert cliente.post(f'/api/importacao/{a}/confirmar').json()['gravados'] == 1
    assert cliente.post(f'/api/importacao/{b}/confirmar').json()['gravados'] == 0
    assert db.consultar('SELECT count(*) AS n FROM ocorrencias')[0]['n'] == 1
    assert db.consultar("SELECT antes,depois FROM auditoria WHERE tabela='ocorrencias'")


def test_previa_expirada_nao_grava(cliente):
    entrar(cliente)
    funcionario(cliente)
    a = validar_csv(cliente, 'matricula;tipo;inicio\n1;abono;01/10/2026\n')
    with db.conexao() as conn:
        conn.cursor().execute("UPDATE importacoes SET criado_em=now()-interval '2 days'")
    assert cliente.post(f'/api/importacao/{a}/confirmar').status_code == 409
    assert not db.consultar('SELECT id FROM ocorrencias')


def test_schema_reexecutavel_e_csp_sem_script_inline(cliente):
    db.aplicar_schema()
    assert db.consultar('SELECT max(versao) AS v FROM schema_versao')[0]['v'] == 3
    r = cliente.get('/')
    assert "script-src 'self';" in r.headers['Content-Security-Policy']
    assert '<script>' not in r.text
    assert 'COFFITO Pass de Pessoal' in r.text


def test_jornada_vincula_matricula_sem_abrir_panorama_e_isola_colaboradores(cliente):
    h = chave(cliente)
    d = resumo()
    assert cliente.post('/api/integracao/ponto/resumos', headers=h, json={'resumos': [d]}).json()['sem_vinculo'] == ['5']
    funcionario(cliente)
    # Não depende de consultar /api/presenca para estabelecer o vínculo.
    r = cliente.get('/api/jornada/f', params={'de': d['data'], 'ate': d['data']})
    assert r.status_code == 200 and len(r.json()) == 1
    assert r.json()[0]['dados']['segundos_oficiais'] == 3600
    funcionario(cliente, 'outro', '2')
    assert cliente.get('/api/jornada/outro', params={'de': d['data'], 'ate': d['data']}).json() == []
    anterior = (dt.date.fromisoformat(d['data']) - dt.timedelta(days=1)).isoformat()
    assert cliente.get('/api/jornada/f', params={'de': anterior, 'ate': anterior}).json() == []


def test_jornada_conserva_vinculo_apos_mudar_matricula_e_recebe_correcao(cliente):
    h = chave(cliente)
    funcionario(cliente)
    d = resumo()
    cliente.post('/api/integracao/ponto/resumos', headers=h, json={'resumos': [d]}).raise_for_status()
    funcionario(cliente, 'f', '999')
    correcao = {**d, 'versao': 2, 'segundos_oficiais': 7200, 'saldo_segundos': -21600}
    cliente.post('/api/integracao/ponto/resumos', headers=h, json={'resumos': [correcao]}).raise_for_status()
    rows = cliente.get('/api/jornada/f', params={'de': d['data'], 'ate': d['data']}).json()
    assert len(rows) == 1 and rows[0]['dados']['versao'] == 2
    assert rows[0]['dados']['segundos_oficiais'] == 7200
    assert rows[0]['dados']['saldo_segundos'] == -21600
