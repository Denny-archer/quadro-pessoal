"""Regras de importação: transforma linhas lidas da planilha num plano de operações (sem tocar no banco).

Funções puras — recebem os documentos atuais e devolvem o que será inserido/atualizado, com mensagens
de erro (linha recusada) e aviso (linha aceita, mas merece conferência).
"""
from __future__ import annotations

import datetime as dt
import secrets
from decimal import Decimal

from . import modelos
from . import normaliza as N
from ..schemas.folha import CamposFolha, CamposDiaria
from pydantic import ValidationError

TEMPORARIOS = ("estagiario", "aprendiz")

CAMPO_FUNC = {
    "matricula": "matricula", "nome": "nome", "vinculo": "vinculo", "situacao": "situacao", "admissao": "admissao",
    "cargo": "cargo", "setor": "setor", "regime": "regime", "carga_horaria": "carga", "intervalo_min": "intervalo",
    "entrada": "entrada", "saida": "saida", "entrada_ho": "entradaHO", "saida_ho": "saidaHO",
    "usa_transporte": "usaTransporte", "valor_transporte": "valorTransporte", "funcao": "funcao",
    "funcao_tipo": "funcaoTipo", "nivel": "nivel", "portaria": "portariaFuncao", "ingresso": "ingresso",
    "orgao_origem": "orgaoOrigem", "cedido_para": "cedidoPara", "jornada_diaria": "jornadaDiaria",
    "instituicao": "instituicao", "contrato_inicio": "contratoInicio", "contrato_fim": "contratoFim",
    "providencia": "providencia", "carreira": "carreira", "nivel_salarial": "nivelSalarial",
    "fg_tipo": "fgTipo", "bolsa_tipo": "bolsaTipo",
    "titulacao_pct": "titulacaoPct", "anuenio_pct": "anuenioPct", "dependentes_ir": "dependentesIR",
    "outros_descontos": "outrosDescontos", "sindicalizado": "sindicalizado",
}


def novo_id(prefixo: str) -> str:
    return f"{prefixo}{secrets.token_hex(8)}"


def _json(v):
    """Valor convertido -> formato do documento do painel."""
    if isinstance(v, dt.date):
        return v.isoformat()
    if isinstance(v, dt.time):
        return v.strftime("%H:%M")
    if isinstance(v, Decimal):
        f = float(v)
        return int(f) if f.is_integer() else f
    return v


def _mat(m) -> str:
    return str(m or "").strip().lstrip("0").lower()


class Resultado:
    def __init__(self, total):
        self.ops, self.msgs = [], []
        self.n = {"total": total, "inserir": 0, "atualizar": 0, "ignorados": 0, "erros": 0}

    def erro(self, linha, texto):
        self.msgs.append({"linha": linha, "nivel": "erro", "texto": texto})
        self.n["erros"] += 1

    def aviso(self, linha, texto):
        self.msgs.append({"linha": linha, "nivel": "aviso", "texto": texto})

    def ignorar(self, linha, texto):
        self.msgs.append({"linha": linha, "nivel": "info", "texto": texto})
        self.n["ignorados"] += 1

    def op(self, acao, colecao, rid, doc, linha, resumo, campos=None):
        self.ops.append({"acao": acao, "colecao": colecao, "id": rid, "doc": doc, "linha": linha, "resumo": resumo,
                         "campos": campos})
        self.n[acao] += 1

    def saida(self):
        return {"contagem": self.n, "operacoes": self.ops, "mensagens": self.msgs}


def _converter_linha(tipo, reg, res, n):
    espec = {c.nome: c for c in modelos.ESPEC[tipo]}
    out, ok = {}, True
    for col, bruto in reg.items():
        try:
            v = modelos.converter(espec[col], bruto)
        except N.Invalido as e:
            res.erro(n, f"Coluna '{col}': {e}.")
            ok = False
            continue
        if v is not None:
            out[col] = v
    return out if ok else None


class Indice:
    """Localiza funcionários por matrícula ou nome."""

    def __init__(self, funcionarios: list[dict]):
        self.por_mat = {_mat(f.get("matricula")): f for f in funcionarios if _mat(f.get("matricula"))}
        self.ambiguas = {m for m in self.por_mat if sum(_mat(f.get('matricula')) == m for f in funcionarios) > 1}
        self.por_nome: dict[str, list[dict]] = {}
        for f in funcionarios:
            self.por_nome.setdefault(N.nome_chave(f.get("nome")), []).append(f)
        self.todos = funcionarios

    def achar(self, matricula, nome):
        """-> (funcionário | None, aviso | None, erro | None)"""
        if matricula:
            if _mat(matricula) in self.ambiguas:
                return None, None, f"matrícula {matricula} corresponde a mais de um cadastro"
            f = self.por_mat.get(_mat(matricula))
            if f:
                if nome and N.nome_chave(nome) != N.nome_chave(f["nome"]) and not self._contido(nome, f["nome"]):
                    return f, f"matrícula {matricula} é de '{f['nome']}', mas a planilha diz '{nome}' — usei a matrícula", None
                return f, None, None
            return None, None, f"matrícula {matricula} não cadastrada"
        if nome:
            exatos = self.por_nome.get(N.nome_chave(nome), [])
            if len(exatos) == 1:
                return exatos[0], None, None
            if len(exatos) > 1:
                return None, None, f"há {len(exatos)} funcionários chamados '{nome}': informe a matrícula"
            parecidos = [f for f in self.todos if self._contido(nome, f["nome"])]
            if len(parecidos) == 1:
                return parecidos[0], f"'{nome}' identificado como '{parecidos[0]['nome']}' — confira", None
            if len(parecidos) > 1:
                return None, None, f"'{nome}' corresponde a mais de um funcionário ({', '.join(p['nome'] for p in parecidos[:3])}): informe a matrícula"
            soltos = [f for f in self.todos if self._contido(nome, f["nome"], minimo=1)]
            if soltos:
                return None, None, (f"'{nome}' está incompleto ({', '.join(p['nome'] for p in soltos[:3])}"
                                    f"{'…' if len(soltos) > 3 else ''}): informe o nome completo ou a matrícula")
            return None, None, f"funcionário '{nome}'" + (f" / matrícula {matricula}" if matricula else "") + " não encontrado no cadastro"
        return None, None, "informe a matrícula ou o nome do funcionário"

    @staticmethod
    def _contido(curto, longo, minimo=2):
        a = [t for t in N.nome_chave(curto).split() if len(t) > 2]
        b = set(N.nome_chave(longo).split())
        return len(a) >= minimo and all(t in b for t in a)


# ------------------------------------------------------------------ funcionários
def validar_funcionarios(linhas, funcionarios: list[dict], hoje: dt.date | None = None) -> dict:
    res = Resultado(len(linhas))
    idx = Indice(funcionarios)
    vistos_mat = {}
    for n, reg in linhas:
        v = _converter_linha("funcionarios", reg, res, n)
        if v is None:
            continue
        nome, mat = v.get("nome"), v.get("matricula")
        if not nome and not mat:
            res.erro(n, "Informe o nome (e, de preferência, a matrícula).")
            continue
        chave_dup = ("m", _mat(mat)) if mat else ("n", N.nome_chave(nome))
        if chave_dup in vistos_mat:
            res.erro(n, f"Funcionário repetido na planilha (já aparece na linha {vistos_mat[chave_dup]}).")
            continue
        vistos_mat[chave_dup] = n

        existente = None
        if mat:
            if _mat(mat) in idx.ambiguas:
                res.erro(n, f"Matrícula {mat} corresponde a mais de um cadastro: corrija antes de importar.")
                continue
            existente = idx.por_mat.get(_mat(mat))
        if existente is None and nome:
            homonimos = idx.por_nome.get(N.nome_chave(nome), [])
            if len(homonimos) > 1:
                res.erro(n, f"Há {len(homonimos)} cadastros com o nome '{nome}': informe a matrícula.")
                continue
            if homonimos:
                existente = homonimos[0]
                if mat and _mat(existente.get("matricula")) and _mat(existente["matricula"]) != _mat(mat):
                    res.erro(n, f"'{nome}' já está cadastrado com a matrícula {existente['matricula']} (planilha: {mat}).")
                    continue

        campos = {CAMPO_FUNC[k]: _json(x) for k, x in v.items()}
        if campos.get("valorTransporte") and "usaTransporte" not in campos:
            campos["usaTransporte"] = True
        if campos.get("usaTransporte") is False:
            campos["valorTransporte"] = 0
        if campos.get("jornadaDiaria"):
            campos["jornadaDiaria"] = int(campos["jornadaDiaria"])
        if campos.get("funcao") and not campos.get("funcaoTipo") and not (existente or {}).get("funcaoTipo"):
            campos["funcaoTipo"] = "comissao"

        if existente:
            doc = {k: x for k, x in existente.items() if k != "id"}
            mudou = {k: x for k, x in campos.items() if doc.get(k) != x}
            if not mudou:
                res.ignorar(n, f"{existente['nome']}: nada mudou.")
                continue
            doc.update(mudou)
        else:
            if not nome:
                res.erro(n, f"Matrícula {mat} não cadastrada: para incluir, informe o nome.")
                continue
            if not campos.get("vinculo"):
                res.erro(n, "Funcionário novo: informe o vínculo.")
                continue
            doc = {"nome": nome, "matricula": "", "situacao": "ativo", "regime": "Presencial", "intervalo": 60,
                   "usaTransporte": False, "valorTransporte": 0, "beneficiosExtras": [],
                   "carga": None if campos["vinculo"] in TEMPORARIOS else 40}
            doc.update(campos)
            doc["importado"] = "planilha"

        # regras de consistência
        try:
            doc.update(CamposFolha.model_validate(doc).model_dump(mode='json', exclude_unset=True))
        except ValidationError:
            res.erro(n, 'Confira os campos de folha: titulação, anuênio, dependentes, descontos e histórico.')
            continue
        limites = {'carga': (1, 60), 'intervalo': (0, 180), 'valorTransporte': (0, 9999999999.99)}
        invalidos = [k for k, (a, b) in limites.items() if doc.get(k) is not None and not a <= doc[k] <= b]
        if invalidos:
            res.erro(n, f"Valor fora do permitido: {', '.join(invalidos)}.")
            continue
        temp = doc.get("vinculo") in TEMPORARIOS
        if temp and not (doc.get("contratoInicio") and doc.get("contratoFim")):
            res.erro(n, f"{doc['nome']}: estagiário/aprendiz precisa de contrato_inicio e contrato_fim.")
            continue
        if doc.get("contratoInicio") and doc.get("contratoFim") and doc["contratoFim"] < doc["contratoInicio"]:
            res.erro(n, f"{doc['nome']}: término do contrato antes do início.")
            continue
        if temp and doc.get("carga") is None and doc.get("jornadaDiaria"):
            doc["carga"] = doc["jornadaDiaria"] * 5
        if doc.get("usaTransporte") and not doc.get("valorTransporte"):
            res.erro(n, f"{doc['nome']}: usa transporte, mas sem valor_transporte.")
            continue
        if doc.get("nivelSalarial") is not None and not 1 <= doc["nivelSalarial"] <= 30:
            res.erro(n, f"{doc['nome']}: nivel_salarial vai de 1 a 30.")
            continue
        if doc.get("situacao") == "cedido" and not doc.get("cedidoPara"):
            res.aviso(n, f"{doc['nome']}: situação cedido sem cedido_para.")
        if doc.get("regime") == "Híbrido" and not doc.get("semana"):
            res.aviso(n, f"{doc['nome']}: regime híbrido — defina a grade semanal na ficha.")

        if existente:
            res.op("atualizar", "funcionarios", existente["id"], doc, n,
                   f"{doc['nome']}: " + ", ".join(sorted(mudou)), campos=mudou)
        else:
            rid = novo_id("f-")
            res.op("inserir", "funcionarios", rid, doc, n, f"{doc['nome']} ({doc['vinculo']})")
            novo = {**doc, 'id': rid}
            if _mat(doc.get('matricula')):
                idx.por_mat[_mat(doc['matricula'])] = novo
            idx.por_nome.setdefault(N.nome_chave(doc['nome']), []).append(novo)
    return res.saida()


# ------------------------------------------------------------------ lançamentos
PERIODO_OBS = {"matutino": "meio período (matutino)", "vespertino": "meio período (vespertino)",
               "comparecimento": "declaração de comparecimento"}


def validar_lancamentos(linhas, funcionarios: list[dict], ocorrencias: list[dict], arquivo: str,
                        hoje: dt.date | None = None, colunas_ignoradas=()) -> dict:
    hoje = hoje or dt.date.today()
    res = Resultado(len(linhas))
    for c in colunas_ignoradas:
        if N.chave(c) in ("cid", "cid_10", "diagnostico", "doenca"):
            res.aviso(0, f"A coluna '{c}' foi descartada: diagnóstico não é armazenado (LGPD).")
    idx = Indice(funcionarios)
    existentes = {(o["func"], o["tipo"], o["inicio"], o.get("fim") or o["inicio"]) for o in ocorrencias}
    por_func: dict[str, list[dict]] = {}
    for o in ocorrencias:
        por_func.setdefault(o["func"], []).append(o)
    na_planilha = {}
    agora = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")

    for n, reg in linhas:
        v = _converter_linha("lancamentos", reg, res, n)
        if v is None:
            continue
        if not v.get('tipo') or not v.get('inicio'):
            res.erro(n, "Informe tipo e inicio em cada linha de lançamento.")
            continue
        f, aviso, erro = idx.achar(v.get("matricula"), v.get("nome"))
        if erro:
            res.erro(n, erro[0].upper() + erro[1:] + ".")
            continue
        if aviso:
            res.aviso(n, aviso[0].upper() + aviso[1:] + ".")
        tipo, ini = v["tipo"], v["inicio"]
        fim = v.get("fim") or ini
        if fim < ini:
            res.erro(n, f"Término ({fim:%d/%m/%Y}) antes do início ({ini:%d/%m/%Y}).")
            continue
        if (fim - ini).days > 400:
            res.erro(n, f"Período de {(fim - ini).days + 1} dias: confira as datas.")
            continue
        doc = {"func": f["id"], "tipo": tipo, "inicio": ini.isoformat(), "fim": fim.isoformat(), "horas": None,
               "parcial": False, "destino": "", "obs": v.get("obs") or "", "abonoPecuniario": 0, "avisoFerias": "",
               "origem": f"Importação: {arquivo}"[:200], "criadoEm": agora}
        horas = _json(v["horas"]) if "horas" in v else None
        if horas is not None and (abs(horas) > 9999.99 or (tipo != 'banco' and horas < 0)):
            res.erro(n, "Horas fora do permitido para este lançamento.")
            continue
        if v.get('diarias') is not None and not 0 <= v['diarias'] <= 9999.99:
            res.erro(n, "Diárias fora do permitido.")
            continue

        if tipo == "atestado":
            per = v.get("periodo", "integral")
            if per != "integral":
                doc["parcial"] = True
                doc["obs"] = "; ".join(x for x in (PERIODO_OBS[per], doc["obs"]) if x)
                if per in ("matutino", "vespertino"):
                    doc["horas"] = horas if horas is not None else 4
                if fim != ini:
                    res.aviso(n, "Atestado parcial vale para um dia: considerei só a data de início.")
                    doc["fim"] = doc["inicio"]
        elif tipo == "banco":
            if not horas:
                res.erro(n, "Banco de horas: informe as horas (+ crédito, − débito).")
                continue
            doc["horas"], doc["fim"] = horas, doc["inicio"]
        elif tipo in ("abono", "capacitacao"):
            doc["horas"] = horas
        if tipo in ("viagem", "capacitacao"):
            doc["destino"] = v.get("destino") or ""
        if tipo == "viagem" and "diarias" in v:
            doc["diarias"] = _json(v["diarias"])
        if tipo == 'viagem' and 'valor_diaria' in v:
            try:
                doc.update(CamposDiaria.model_validate({'valorDiaria': _json(v['valor_diaria'])}).model_dump(mode='json'))
            except ValidationError:
                res.erro(n, 'Valor da diária deve ser finito e não negativo.')
                continue
        if tipo == "ferias":
            ap = v.get("abono_pecuniario") or 0
            if not 0 <= ap <= 10:
                res.erro(n, "abono_pecuniario vai de 0 a 10 dias.")
                continue
            doc.update(abonoPecuniario=ap, avisoFerias=v.get("aviso_ferias") or "", parcela=v.get("parcela") or "")
        if tipo == "abono":
            doc["referenciaAbono"] = v.get("referencia_abono") or ""
            doc["statusAbono"] = v.get("status_abono") or ("gozado" if fim < hoje else "agendado")
        for k in [k for k in ("periodo", "destino", "diarias", "valor_diaria", "parcela", "abono_pecuniario", "aviso_ferias",
                              "referencia_abono", "status_abono") if k in v]:
            usado = {"periodo": "atestado", "destino": ("viagem", "capacitacao"), "diarias": "viagem", "valor_diaria": "viagem",
                     "parcela": "ferias", "abono_pecuniario": "ferias", "aviso_ferias": "ferias",
                     "referencia_abono": "abono", "status_abono": "abono"}[k]
            if tipo not in (usado if isinstance(usado, tuple) else (usado,)):
                res.aviso(n, f"Coluna '{k}' não se aplica a {tipo} e foi desconsiderada.")

        chave = (doc["func"], tipo, doc["inicio"], doc["fim"])
        if chave in existentes:
            res.ignorar(n, f"{f['nome']}: {tipo} de {_br(doc['inicio'])} a {_br(doc['fim'])} já está lançado.")
            continue
        if chave in na_planilha:
            res.ignorar(n, f"Repetido na planilha (linha {na_planilha[chave]}).")
            continue
        na_planilha[chave] = n
        for o in por_func.get(f["id"], []):
            if o["inicio"] <= doc["fim"] and doc["inicio"] <= (o.get("fim") or o["inicio"]):
                if o["tipo"] == tipo and tipo != "banco":
                    res.aviso(n, f"{f['nome']}: sobrepõe {tipo} já lançado de {_br(o['inicio'])} a {_br(o['fim'])}.")
                elif o["tipo"] == "ferias" and tipo in ("atestado", "abono", "viagem"):
                    res.aviso(n, f"{f['nome']}: {tipo} durante férias ({_br(o['inicio'])} a {_br(o['fim'])}).")
        if f.get("situacao") == "inativo":
            res.aviso(n, f"{f['nome']} está inativo no cadastro.")
        res.op("inserir", "ocorrencias", novo_id("i-"), doc, n,
               f"{f['nome']}: {tipo} {_br(doc['inicio'])}" + ("" if doc["fim"] == doc["inicio"] else f" a {_br(doc['fim'])}"))
    return res.saida()


def _br(iso: str) -> str:
    return "/".join(reversed(iso.split("-")))
