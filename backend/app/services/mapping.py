"""Conversão entre o documento JSON usado pelo painel (camelCase) e as linhas do PostgreSQL.

O painel trabalha com documentos no formato {campo: valor}. Cada coleção tem uma tabela; os
campos conhecidos viram colunas tipadas e qualquer campo desconhecido vai para a coluna `extra`
(jsonb), para que nada se perca e o painel continue recebendo o documento como o enviou.
"""
from __future__ import annotations

import datetime as dt
import json
from decimal import Decimal

from ..core.privacidade import sem_diagnostico

# (campo no documento, coluna, tipo)
FUNCIONARIOS = [
    ("nome", "nome", "text"),
    ("matricula", "matricula", "text"),
    ("admissao", "admissao", "date"),
    ("cargo", "cargo", "text"),
    ("setor", "setor", "text"),
    ("vinculo", "vinculo", "text"),
    ("situacao", "situacao", "text"),
    ("regime", "regime", "text"),
    ("carga", "carga", "int"),
    ("intervalo", "intervalo", "int"),
    ("entrada", "entrada", "time"),
    ("saida", "saida", "time"),
    ("entradaHO", "entrada_ho", "time"),
    ("saidaHO", "saida_ho", "time"),
    ("semana", "semana", "json"),
    ("funcao", "funcao", "text"),
    ("funcaoTipo", "funcao_tipo", "text"),
    ("nivel", "nivel", "text"),
    ("portariaFuncao", "portaria_funcao", "text"),
    ("ingresso", "ingresso", "text"),
    ("orgaoOrigem", "orgao_origem", "text"),
    ("cedidoPara", "cedido_para", "text"),
    ("jornadaDiaria", "jornada_diaria", "int"),
    ("instituicao", "instituicao", "text"),
    ("contratoInicio", "contrato_inicio", "date"),
    ("contratoFim", "contrato_fim", "date"),
    ("providencia", "providencia", "text"),
    ("usaTransporte", "usa_transporte", "bool"),
    ("valorTransporte", "valor_transporte", "num"),
    ("beneficiosExtras", "beneficios_extras", "json"),
    ("abonos", "abonos", "json"),
    ("periodosAquisitivos", "periodos_aquisitivos", "json"),
    ("carreira", "carreira", "text"),
    ("nivelSalarial", "nivel_salarial", "int"),
    ("fgTipo", "fg_tipo", "text"),
    ("bolsaTipo", "bolsa_tipo", "text"),
    ("criadoEm", "criado_em", "ts"),
]

OCORRENCIAS = [
    ("func", "funcionario_id", "text"),
    ("tipo", "tipo", "text"),
    ("inicio", "inicio", "date"),
    ("fim", "fim", "date"),
    ("horas", "horas", "num"),
    ("parcial", "parcial", "bool"),
    ("destino", "destino", "text"),
    ("obs", "obs", "text"),
    ("diarias", "diarias", "num"),
    ("parcela", "parcela", "text"),
    ("aquisitivo", "aquisitivo", "date"),
    ("aquisitivoFim", "aquisitivo_fim", "date"),
    ("limite", "limite", "date"),
    ("abonoPecuniario", "abono_pecuniario", "int"),
    ("avisoFerias", "aviso_ferias", "text"),
    ("statusPlanilha", "status_planilha", "text"),
    ("referenciaAbono", "referencia_abono", "text"),
    ("statusAbono", "status_abono", "text"),
    ("origem", "origem", "text"),
    ("criadoEm", "criado_em", "ts"),
]

SPECS = {"funcionarios": FUNCIONARIOS, "ocorrencias": OCORRENCIAS}
# campos que o servidor controla e nunca vão para `extra`
CONTROLADOS = {"id", "atualizadoEm", "criadoEm"}
# defaults das colunas NOT NULL quando o documento não traz o campo
DEFAULTS = {
    "funcionarios": {"vinculo": "efetivo", "situacao": "ativo", "regime": "Presencial", "intervalo": 60,
                     "usa_transporte": False, "valor_transporte": 0, "beneficios_extras": "[]"},
    "ocorrencias": {"parcial": False, "abono_pecuniario": 0},
}


class ErroValidacao(ValueError):
    pass


def _data(v, campo):
    if v in (None, ""):
        return None
    try:
        return dt.date.fromisoformat(str(v)[:10])
    except ValueError:
        raise ErroValidacao(f"Data inválida em '{campo}': {v!r} (use AAAA-MM-DD).")


def _hora(v, campo):
    if v in (None, ""):
        return None
    try:
        return dt.time.fromisoformat(str(v)[:5])
    except ValueError:
        raise ErroValidacao(f"Horário inválido em '{campo}': {v!r} (use HH:MM).")


def _num(v, campo, inteiro=False):
    if v in (None, ""):
        return None
    try:
        n = Decimal(str(v).replace(",", "."))
    except Exception:
        raise ErroValidacao(f"Número inválido em '{campo}': {v!r}.")
    if not n.is_finite() or (inteiro and n != n.to_integral_value()):
        raise ErroValidacao(f"Número inválido em '{campo}': use {'inteiro' if inteiro else 'valor finito'}.")
    return int(n) if inteiro else n


def doc_para_linha(colecao: str, doc: dict) -> dict:
    """Documento do painel -> {coluna: valor} pronto para INSERT/UPDATE."""
    doc = sem_diagnostico(doc)
    linha, conhecidos = {}, set(CONTROLADOS)
    for campo, col, tipo in SPECS[colecao]:
        conhecidos.add(campo)
        if campo not in doc:
            continue
        v = doc[campo]
        if tipo == "text":
            linha[col] = None if v in (None, "") else str(v)
        elif tipo == "date":
            linha[col] = _data(v, campo)
        elif tipo == "time":
            linha[col] = _hora(v, campo)
        elif tipo == "int":
            linha[col] = _num(v, campo, inteiro=True)
        elif tipo == "num":
            linha[col] = _num(v, campo)
        elif tipo == "bool":
            if v is not None and not isinstance(v, bool):
                raise ErroValidacao(f"Valor inválido em '{campo}': use true ou false.")
            linha[col] = v
        elif tipo == "json":
            linha[col] = None if v is None else json.dumps(v, ensure_ascii=False)
        elif tipo == "ts":
            if v:
                try:
                    linha[col] = dt.datetime.fromisoformat(str(v).replace("Z", "+00:00"))
                except ValueError:
                    pass
    linha["extra"] = json.dumps({k: v for k, v in doc.items() if k not in conhecidos}, ensure_ascii=False)
    for col, val in DEFAULTS[colecao].items():
        if linha.get(col) is None:
            linha[col] = val
    if colecao == "funcionarios" and linha.get("beneficios_extras") is None:
        linha["beneficios_extras"] = "[]"
    return linha


def linha_para_doc(colecao: str, linha: dict) -> dict:
    """Linha do banco -> documento no formato que o painel espera."""
    doc = {}
    extra = linha.get("extra") or {}
    if isinstance(extra, str):
        extra = json.loads(extra)
    doc.update(extra)
    for campo, col, tipo in SPECS[colecao]:
        v = linha.get(col)
        if tipo in ("text",):
            doc[campo] = "" if v is None else v
        elif tipo == "date":
            doc[campo] = "" if v is None else v.isoformat()
        elif tipo == "time":
            doc[campo] = "" if v is None else v.strftime("%H:%M")
        elif tipo in ("int", "num"):
            if v is None:
                doc[campo] = None
            else:
                f = float(v)
                doc[campo] = int(f) if f.is_integer() else f
        elif tipo == "bool":
            doc[campo] = bool(v)
        elif tipo == "json":
            if v is None:
                doc.pop(campo, None)
            else:
                doc[campo] = json.loads(v) if isinstance(v, str) else v
        elif tipo == "ts":
            doc[campo] = v.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z") if v else ""
    at = linha.get("atualizado_em")
    if at:
        doc["atualizadoEm"] = at.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    doc["id"] = linha["id"]
    return doc


def colunas(colecao: str) -> list[str]:
    return [c for _, c, _ in SPECS[colecao]]
