"""Regras do quadro de presença (sem banco)."""
import datetime as dt

from app.services import presenca as P

F = P.FUSO
SEG = dt.date(2026, 10, 5)            # segunda-feira


def bat(h, m, tipo="auto", local="presencial"):
    return {"momento": dt.datetime(2026, 10, 5, h, m, tzinfo=F), "tipo": tipo, "local": local, "cancelada": False}


def func(**k):
    base = {"id": "x", "nome": "Fulano", "situacao": "ativo", "vinculo": "efetivo", "regime": "Presencial",
            "entrada": "08:00", "saida": "17:00", "intervalo": 60}
    return {**base, **k}


def sit(f, marc=(), ocs=(), hora=(10, 0), data=SEG):
    agora = dt.datetime(2026, 10, 5, *hora, tzinfo=F)
    return P.situacao(f, data, agora, list(marc), list(ocs), set())


def test_no_posto_e_atraso():
    r = sit(func(), [bat(8, 40)])
    assert r["status"] == "no_posto" and r["atraso_min"] == 40


def test_intervalo_e_saida():
    assert sit(func(), [bat(8, 0), bat(12, 0)], hora=(12, 30))["status"] == "saiu"
    assert sit(func(), [bat(8, 0), bat(12, 0, 'saida_intervalo')], hora=(12, 30))["status"] == "intervalo"
    assert sit(func(), [bat(8, 0), bat(12, 0), bat(13, 0), bat(17, 0)], hora=(17, 30))["status"] == "saiu"
    assert sit(func(), [bat(8, 0), bat(12, 0, "saida_intervalo"), bat(13, 0, "retorno_intervalo")], hora=(14, 0))["status"] == "no_posto"


def test_sem_registro_e_aguardando():
    assert sit(func(), hora=(7, 50))["status"] == "aguardando"
    r = sit(func(), hora=(9, 0))
    assert r["status"] == "sem_registro" and r["alerta"]


def test_afastado_tem_prioridade():
    oc = {"tipo": "ferias", "inicio": "2026-10-01", "fim": "2026-10-15"}
    r = sit(func(), [bat(8, 0)], [oc])
    assert r["status"] == "afastado" and "férias" in r["alerta"]
    parcial = {"tipo": "atestado", "inicio": "2026-10-05", "fim": "2026-10-05", "parcial": True}
    assert sit(func(), [], [parcial], hora=(9, 0))["status"] == "sem_registro"


def test_hibrido_e_teletrabalho():
    semana = {str(d): {"tipo": "P", "pe": "08:00", "ps": "17:00", "he": "", "hs": ""} for d in range(1, 6)}
    semana["1"] = {"tipo": "H", "pe": "", "ps": "", "he": "09:00", "hs": "18:00"}
    assert sit(func(regime="Híbrido", semana=semana), hora=(11, 0))["status"] == "home_office"
    assert sit(func(regime="Teletrabalho"), [bat(9, 0, local="remoto")])["status"] == "remoto"


def test_fim_de_semana_e_fora_do_quadro():
    sab = dt.date(2026, 10, 3)
    assert P.situacao(func(), sab, dt.datetime(2026, 10, 3, 10, tzinfo=F), [], [], set())["status"] == "nao_util"
    assert not P.no_quadro(func(situacao="cedido"), "2026-10-05")
    assert not P.no_quadro(func(vinculo="estagiario", contratoFim="2026-09-30"), "2026-10-05")
