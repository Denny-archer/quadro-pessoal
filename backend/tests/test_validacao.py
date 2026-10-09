import datetime as dt
import math

import pytest

from app.services import mapping
from app.core.privacidade import sem_diagnostico
from app.importacao import normaliza as N, leitor, validacao


@pytest.mark.parametrize('valor', ['NaN', 'Infinity', '-Infinity', float('nan')])
def test_numeros_nao_finitos_recusados(valor):
    with pytest.raises(N.Invalido):
        N.numero(valor)
    with pytest.raises(mapping.ErroValidacao):
        mapping.doc_para_linha('funcionarios', {'carga': valor})


def test_inteiro_e_booleano_nao_sao_convertidos_silenciosamente():
    with pytest.raises(mapping.ErroValidacao):
        mapping.doc_para_linha('funcionarios', {'carga': 7.5})
    with pytest.raises(mapping.ErroValidacao):
        mapping.doc_para_linha('funcionarios', {'usaTransporte': 'false'})


def test_diagnostico_nao_passa_por_campos_extras():
    doc = {'CID-10': 'X', 'extra': {'Diagnóstico': 'X', 'normal': 1}, 'lista': [{'doença': 'X'}]}
    assert sem_diagnostico(doc) == {'extra': {'normal': 1}, 'lista': [{}]}


def test_linha_sem_tipo_ou_inicio_vira_erro_de_previa():
    funcs = [{'id': 'f', 'nome': 'Pessoa Teste', 'matricula': '1'}]
    r = validacao.validar_lancamentos([(2, {'matricula': '1', 'tipo': '', 'inicio': ''})], funcs, [], 'teste.csv')
    assert r['contagem']['erros'] == 1 and not r['operacoes']


def test_nome_formado_so_por_preposicoes_nao_identifica_pessoa():
    idx = validacao.Indice([{'id': 'f', 'nome': 'Pessoa Teste', 'matricula': '1'}])
    assert idx.achar(None, 'da de')[0] is None
    assert idx.achar('999', 'Pessoa Teste')[0] is None


def test_matricula_ambigua_nao_escolhe_ultimo_cadastro():
    idx = validacao.Indice([{'id': 'a', 'nome': 'A', 'matricula': '1'}, {'id': 'b', 'nome': 'B', 'matricula': '01'}])
    assert idx.achar('001', None)[2]


def test_limites_sao_exibidos_na_previa():
    r = validacao.validar_funcionarios([(2, {'nome': 'Pessoa Teste', 'vinculo': 'efetivo', 'carga_horaria': 80})], [])
    assert r['contagem']['erros'] == 1 and not r['operacoes']
