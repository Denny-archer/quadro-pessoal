"""Testes das regras de importação (não precisam de banco). Rode: PERMITIR_SEGREDO_FRACO=1 python -m pytest tests"""
import datetime as dt
import os

os.environ.setdefault("PERMITIR_SEGREDO_FRACO", "1")

from app.importacao import leitor, modelos, normaliza as N, validacao  # noqa: E402

FUNCS = [
    {"id": "p-004", "nome": "Andre Salomão", "matricula": "47", "vinculo": "efetivo", "situacao": "ativo"},
    {"id": "p-033", "nome": "Victor Diniz Felippe Ferrari", "matricula": "38", "vinculo": "efetivo", "situacao": "ativo"},
    {"id": "p-008", "nome": "Danielle Araujo Cesar", "matricula": "60", "vinculo": "efetivo", "situacao": "ativo"},
    {"id": "p-041", "nome": "Danielle Cavalcanti de A.", "matricula": "", "vinculo": "comissionado", "situacao": "ativo"},
]
OCS = [{"id": "f1", "func": "p-004", "tipo": "ferias", "inicio": "2026-07-15", "fim": "2026-07-29"}]


def test_normaliza():
    assert N.data("05/10/2026") == dt.date(2026, 10, 5)
    assert N.data("2026-10-05") == dt.date(2026, 10, 5)
    assert N.data(46300) == dt.date(2026, 10, 5)      # número de série do Excel
    assert N.numero("1.234,56") == N.numero("1234.56")
    assert N.booleano("Não") is False and N.booleano("x") is True
    assert N.chave("Data de Início ") == "data_de_inicio"


def _csv(texto, tipo="lancamentos"):
    return leitor.ler(texto.encode("cp1252"), "t.csv", tipo)


def test_lancamentos():
    _, ign, linhas = _csv("Matrícula;Nome;Tipo;Início;Fim;Período;Horas;CID\n"
                          "47;;Atestado;05/10/2026;;vespertino;;J11\n"
                          ";Victor Diniz;atestado;06/10/2026;07/10/2026;;;\n"
                          "47;;ferias;15/07/2026;29/07/2026;;;\n"
                          ";Danielle;abono;03/10/2026;;;;\n"
                          "47;;banco de horas;02/10/2026;;;;\n"
                          "47;;viagem;10/10/2026;08/10/2026;;;\n")
    r = validacao.validar_lancamentos(linhas, FUNCS, OCS, "t.csv", hoje=dt.date(2026, 10, 6), colunas_ignoradas=ign)
    assert r["contagem"] == {"total": 6, "inserir": 2, "atualizar": 0, "ignorados": 1, "erros": 3}
    meio = r["operacoes"][0]["doc"]
    assert meio["parcial"] is True and meio["horas"] == 4 and "cid" not in str(meio).lower()
    assert r["operacoes"][1]["doc"]["func"] == "p-033"
    textos = " ".join(m["texto"] for m in r["mensagens"])
    assert "LGPD" in textos and "incompleto" in textos and "Banco de horas" in textos and "antes do início" in textos


def test_funcionarios():
    _, _, linhas = _csv("matricula;nome;vinculo;setor;valor_transporte;contrato_inicio;contrato_fim\n"
                        "47;;;DAGEP;440,00;;\n"
                        "E-1;Novo Estagiário;estagiario;DAGEP;;01/03/2026;28/02/2027\n"
                        "E-2;Sem Contrato;estagiario;;;;\n", "funcionarios")
    r = validacao.validar_funcionarios(linhas, FUNCS)
    assert r["contagem"]["atualizar"] == 1 and r["contagem"]["inserir"] == 1 and r["contagem"]["erros"] == 1
    upd = r["operacoes"][0]
    assert upd["campos"] == {"setor": "DAGEP", "valorTransporte": 440, "usaTransporte": True}


def test_modelos_releem():
    """O modelo XLSX gerado pelo sistema precisa ser lido de volta sem erro."""
    for t in ("funcionarios", "lancamentos"):
        cols, ign, linhas = leitor.ler(modelos.modelo_xlsx(t), f"m.xlsx", t)
        assert not ign and len(linhas) == len(modelos.EXEMPLOS[t])
        cols, ign, linhas = leitor.ler(modelos.modelo_csv(t), f"m.csv", t)
        assert not ign and len(linhas) == len(modelos.EXEMPLOS[t])


def test_importacao_campos_folha_preserva_historico_existente():
    _, ign, linhas = _csv('matricula;nome;vinculo;titulacao_pct;anuenio_pct;dependentes_ir;outros_descontos;sindicalizado\n'
                        '47;;;7,5;2;1;123,45;sim\n', 'funcionarios')
    assert not ign
    existentes = [{**FUNCS[0], 'historicoRem': []}]
    plano = validacao.validar_funcionarios(linhas, existentes)
    doc = plano['operacoes'][0]['doc']
    assert doc['titulacaoPct'] == 7.5 and doc['sindicalizado'] is True
    assert doc['outrosDescontos'] == 123.45 and doc['historicoRem'] == []


def test_importacao_recusa_titulacao_invalida_na_previa():
    _, _, linhas = _csv('matricula;nome;vinculo;titulacao_pct\n47;;;8\n', 'funcionarios')
    plano = validacao.validar_funcionarios(linhas, FUNCS)
    assert plano['contagem']['erros'] == 1 and not plano['operacoes']


def test_importacao_valor_unitario_diaria():
    _, ign, linhas = _csv('matricula;tipo;inicio;fim;diarias;valor_diaria\n'
                        '47;viagem;20/10/2026;21/10/2026;1,5;250,00\n')
    assert not ign
    plano = validacao.validar_lancamentos(linhas, FUNCS, [], 'teste.csv')
    assert plano['operacoes'][0]['doc']['valorDiaria'] == 250
