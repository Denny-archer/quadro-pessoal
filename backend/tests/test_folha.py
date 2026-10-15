import datetime as dt
import json

import pytest

from app.services.mapping import doc_para_linha, linha_para_doc, ErroValidacao


def mudanca(**campos):
    return {'id': 'h1', 'tipo': 'nivel', 'data': '2026-10-15', 'de': 1, 'para': 2,
            'ato': 'Portaria de teste', 'registradoEm': '2026-10-14T12:00:00Z', **campos}


def test_campos_folha_persistem_no_extra_sem_migracao():
    doc = {'nome': 'Teste', 'admissao': '2025-01-01', 'titulacaoPct': 7.5, 'anuenioPct': 2,
           'dependentesIR': 1, 'outrosDescontos': 123.45, 'sindicalizado': True,
           'historicoRem': [mudanca()], 'outroCampoAnterior': 'preservado'}
    linha = doc_para_linha('funcionarios', doc)
    extra = json.loads(linha['extra'])
    assert extra['titulacaoPct'] == 7.5
    assert extra['historicoRem'][0]['para'] == 2
    linha['id'] = 'teste'
    lido = linha_para_doc('funcionarios', linha)
    assert lido['historicoRem'] == extra['historicoRem']
    assert lido['outroCampoAnterior'] == 'preservado'


def test_documento_antigo_nao_recebe_defaults_novos_no_extra():
    linha = doc_para_linha('funcionarios', {'nome': 'Antigo'})
    assert json.loads(linha['extra']) == {}


@pytest.mark.parametrize('campo,valor', [
    ('titulacaoPct', 8), ('titulacaoPct', True), ('anuenioPct', -1), ('anuenioPct', 51),
    ('dependentesIR', 1.5), ('dependentesIR', True), ('dependentesIR', 21),
    ('outrosDescontos', -0.01), ('outrosDescontos', float('nan')), ('sindicalizado', 'false'),
])
def test_valores_financeiros_invalidos_recusados(campo, valor):
    with pytest.raises(ErroValidacao):
        doc_para_linha('funcionarios', {'nome': 'Teste', campo: valor})


@pytest.mark.parametrize('historico', [
    [mudanca(para=31)], [mudanca(de=True)], [mudanca(data='15/10/2026')],
    [mudanca(), mudanca(id='h2')], [mudanca(), mudanca(data='2026-11-01')],
    [mudanca(registradoEm='2026-10-14T12:00:00')],
    [mudanca(tipo='grat', de={}, para={'funcaoTipo': 'invalido'})],
])
def test_historico_invalido_recusado(historico):
    with pytest.raises(ErroValidacao):
        doc_para_linha('funcionarios', {'nome': 'Teste', 'historicoRem': historico})


def test_vigencia_deve_ser_posterior_a_admissao():
    with pytest.raises(ErroValidacao, match='admissão'):
        doc_para_linha('funcionarios', {'nome': 'Teste', 'admissao': '2026-10-15', 'historicoRem': [mudanca()]})


def test_gratificacao_com_estado_anterior_e_novo():
    linha = doc_para_linha('funcionarios', {'nome': 'Teste', 'historicoRem': [mudanca(tipo='grat',
        de={'funcaoTipo': '', 'nivel': ''}, para={'funcaoTipo': 'fg', 'fgTipo': 'chefia', 'funcao': 'Chefia', 'portariaFuncao': 'Ato 2'})]})
    h = json.loads(linha['extra'])['historicoRem'][0]
    assert h['para']['fgTipo'] == 'chefia'
    assert h['de']['funcaoTipo'] == ''


def test_valor_da_diaria_deve_ser_finito_e_nao_negativo():
    assert json.loads(doc_para_linha('ocorrencias', {'valorDiaria': 250})['extra'])['valorDiaria'] == 250
    for valor in (-1, float('inf'), True):
        with pytest.raises(ErroValidacao):
            doc_para_linha('ocorrencias', {'valorDiaria': valor})
