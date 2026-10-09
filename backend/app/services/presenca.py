"""Situação de cada funcionário no dia: no posto, em intervalo, remoto, afastado, sem registro...

Cruza três fontes: as batidas recebidas do ponto, os lançamentos do RH (férias, atestado, abono, viagem,
capacitação) e a jornada cadastrada (presencial, híbrido por dia da semana, teletrabalho). Funções puras.
"""
from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

FUSO = ZoneInfo("America/Sao_Paulo")
AUSENCIAS = ("atestado", "ferias", "abono", "viagem", "capacitacao")   # ordem de prioridade
NOME_TIPO = {"ferias": "Férias", "atestado": "Atestado", "abono": "Abono", "viagem": "Viagem", "capacitacao": "Capacitação"}
DENTRO = {"entrada", "retorno_intervalo"}

# status -> (rótulo, grupo do resumo)
STATUS = {
    "no_posto":        ("No posto", "no_posto"),
    "remoto":          ("Trabalhando remoto", "remoto"),
    "home_office":     ("Home office previsto, sem registro", "planejado"),
    "intervalo":       ("Em intervalo", "intervalo"),
    "saiu":            ("Saída registrada", "saiu"),
    "afastado":        ("Afastado", "afastado"),
    "aguardando":      ("Aguardando entrada", "aguardando"),
    "sem_registro":    ("Sem registro de ponto", "sem_registro"),
    "nao_util":        ("Dia não útil", "nao_util"),
    "aguardando_integracao": ("Aguardando sincronização", "aguardando_integracao"),
}


def _min(hhmm: str | None) -> int | None:
    if not hhmm:
        return None
    h, m = hhmm.split(":")[:2]
    return int(h) * 60 + int(m)


def _hhmm(minutos: int) -> str:
    return f"{minutos // 60:02d}:{minutos % 60:02d}"


def no_quadro(f: dict, dia: str) -> bool:
    if f.get("situacao") in ("inativo", "cedido"):
        return False
    if f.get("admissao") and f["admissao"] > dia:
        return False
    if f.get("vinculo") in ("estagiario", "aprendiz"):
        if (f.get("contratoInicio") and f["contratoInicio"] > dia) or (f.get("contratoFim") and f["contratoFim"] < dia):
            return False
    return True


def escala_do_dia(f: dict, data: dt.date, feriados: set[str]) -> dict | None:
    """{'tipo': P|H|M, 'pe','ps','he','hs'} ou None em fim de semana/feriado."""
    wd = data.isoweekday()                    # 1=seg … 7=dom
    if wd >= 6 or data.isoformat() in feriados:
        return None
    if f.get("regime") == "Híbrido" and f.get("semana"):
        d = f["semana"].get(str(wd)) or f["semana"].get(wd)
        if d:
            return d
    if f.get("regime") == "Teletrabalho":
        return {"tipo": "H", "pe": "", "ps": "", "he": f.get("entradaHO") or f.get("entrada") or "",
                "hs": f.get("saidaHO") or f.get("saida") or ""}
    return {"tipo": "P", "pe": f.get("entrada") or "", "ps": f.get("saida") or "", "he": "", "hs": ""}


def classificar(marcacoes: list[dict]) -> list[dict]:
    """Define se cada batida é de dentro (entrada/retorno) ou de fora (saída/intervalo).
    Batidas 'auto' alternam: 1ª entrada, 2ª saída, 3ª entrada, 4ª saída…"""
    out = []
    for i, m in enumerate(sorted(marcacoes, key=lambda x: (x["momento"], str(x.get('id_externo', x.get('id', '')))))):
        tipo = m.get("tipo") or "auto"
        if tipo == "auto":
            tipo = "entrada" if i % 2 == 0 else "saida"
            inferido = True
        else:
            inferido = False
        out.append({**m, "tipo_efetivo": tipo, "inferido": inferido})
    return out


def situacao(f: dict, data: dt.date, agora: dt.datetime, marcacoes: list[dict], ocorrencias: list[dict],
             feriados: set[str], tolerancia: int = 15, hora_padrao: str = "08:00") -> dict:
    dia = data.isoformat()
    hoje = agora.astimezone(FUSO).date()
    min_agora = None if data != hoje else agora.astimezone(FUSO).hour * 60 + agora.astimezone(FUSO).minute
    escala = escala_do_dia(f, data, feriados)
    batidas = classificar([m for m in marcacoes if not m.get("cancelada")])
    horas = [m["momento"].astimezone(FUSO).strftime("%H:%M") for m in batidas]
    r = {"id": f["id"], "nome": f.get("nome", ""), "matricula": f.get("matricula", ""), "setor": f.get("setor", ""),
         "escala": escala["tipo"] if escala else None, "marcacoes": horas, "status": None, "motivo": "",
         "entrada_prevista": None, "primeira_entrada": None, "atraso_min": 0, "alerta": ""}

    ocs = [o for o in ocorrencias if o["inicio"] <= dia <= (o.get("fim") or o["inicio"])]
    afast = next((o for t in AUSENCIAS for o in ocs if o["tipo"] == t
                  and not (t == "atestado" and o.get("parcial"))
                  and not (t in ("abono", "capacitacao") and o.get("horas"))), None)

    if escala:
        prev = escala.get("pe") if escala["tipo"] in ("P", "M") else escala.get("he")
        if escala["tipo"] == "M" and _min(escala.get("he")) is not None and _min(escala.get("pe")) is not None:
            prev = escala["he"] if _min(escala["he"]) < _min(escala["pe"]) else escala["pe"]
        r["entrada_prevista"] = prev or None

    if afast:
        r["status"], r["motivo"] = "afastado", NOME_TIPO[afast["tipo"]] + (f" até {_br(afast['fim'])}" if afast.get("fim") and afast["fim"] != dia else "")
        if batidas:
            r["alerta"] = f"registrou ponto durante {NOME_TIPO[afast['tipo']].lower()}"
        return r

    if batidas:
        primeira = next((m for m in batidas if m["tipo_efetivo"] in DENTRO), batidas[0])
        r["primeira_entrada"] = primeira["momento"].astimezone(FUSO).strftime("%H:%M")
        ult = batidas[-1]
        if ult["tipo_efetivo"] in DENTRO:
            r["status"] = "remoto" if ult.get("local") == "remoto" else "no_posto"
        elif ult["tipo_efetivo"] == "saida_intervalo":
            fim_previsto = _min((escala or {}).get("ps") or (escala or {}).get("hs"))
            fim_dia = min_agora is None or (fim_previsto is not None and min_agora >= fim_previsto)
            r["status"] = "saiu" if (ult["inferido"] and fim_dia) else "intervalo"
            if r["status"] == "intervalo" and min_agora is not None:
                minutos = min_agora - (ult["momento"].astimezone(FUSO).hour * 60 + ult["momento"].astimezone(FUSO).minute)
                r["motivo"] = f"há {minutos} min"
                if minutos > int(f.get("intervalo") or 60) + 30:
                    r["alerta"] = "intervalo acima do previsto"
        else:
            r["status"] = "saiu"
        prev = _min(r["entrada_prevista"])
        ent = _min(r["primeira_entrada"])
        if prev is not None and ent is not None and ent > prev + tolerancia:
            r["atraso_min"] = ent - prev
        if len(batidas) % 2 == 1 and min_agora is None:
            r["alerta"] = "número ímpar de batidas no dia"
        if not escala:
            r["motivo"] = "registrou em dia não útil"
        return r

    if not escala:
        r["status"] = "nao_util"
        return r
    if escala["tipo"] == "H":
        r["status"] = "home_office"
        return r
    prev = _min(r["entrada_prevista"] or hora_padrao)
    padrao = "" if r["entrada_prevista"] else f" (sem horário no cadastro: considerado {hora_padrao})"
    if min_agora is not None and min_agora < prev + tolerancia:
        r["status"] = "aguardando"
        r["motivo"] = f"entrada prevista {_hhmm(prev)}" + padrao
    else:
        r["status"] = "sem_registro"
        r["alerta"] = "sem batida e sem afastamento lançado; requer conferência"
        r["motivo"] = padrao.strip(" ()")
    return r


def _br(iso: str) -> str:
    return "/".join(reversed(iso.split("-")))


def quadro_do_dia(funcionarios, ocorrencias, marcacoes, data: dt.date, agora: dt.datetime, feriados, tolerancia=15,
                  hora_padrao="08:00") -> dict:
    por_func_m, por_func_o = {}, {}
    for m in marcacoes:
        por_func_m.setdefault(m["funcionario_id"], []).append(m)
    for o in ocorrencias:
        por_func_o.setdefault(o["func"], []).append(o)
    dia = data.isoformat()
    pessoas = [situacao(f, data, agora, por_func_m.get(f["id"], []), por_func_o.get(f["id"], []), feriados, tolerancia, hora_padrao)
               for f in funcionarios if no_quadro(f, dia)]
    pessoas.sort(key=lambda p: p["nome"])
    resumo = {g: 0 for g in dict.fromkeys(v[1] for v in STATUS.values())}
    for p in pessoas:
        p["rotulo"] = STATUS[p["status"]][0]
        resumo[STATUS[p["status"]][1]] += 1
    return {"data": dia, "agora": agora.astimezone(FUSO).isoformat(), "resumo": resumo, "pessoas": pessoas}
