"""Conversão tolerante dos valores digitados em planilhas (datas BR, números BR, sim/não, apelidos)."""
from __future__ import annotations

import datetime as dt
import re
import unicodedata
from decimal import Decimal, InvalidOperation


class Invalido(ValueError):
    pass


def sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def chave(s) -> str:
    """'Data de Início ' -> 'data_de_inicio' (usado para cabeçalhos e apelidos)."""
    s = sem_acento(str(s or "")).lower().strip()
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")


def nome_chave(s) -> str:
    """Nome para comparação: sem acento, minúsculo, espaços simples."""
    return re.sub(r"\s+", " ", sem_acento(str(s or "")).lower()).strip()


def vazio(v) -> bool:
    return v is None or (isinstance(v, str) and v.strip() in ("", "-", "—"))


def texto(v, maximo=200) -> str | None:
    if vazio(v):
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = re.sub(r"\s+", " ", str(v)).strip()
    if len(s) > maximo:
        raise Invalido(f"texto com mais de {maximo} caracteres")
    return s


def data(v) -> dt.date | None:
    if vazio(v):
        return None
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    if isinstance(v, (int, float)) and 20000 < v < 80000:          # número de série do Excel
        return dt.date(1899, 12, 30) + dt.timedelta(days=int(v))
    s = str(v).strip()
    m = re.fullmatch(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})", s)
    if m:
        d, mth, a = int(m[1]), int(m[2]), int(m[3])
        a = a + 2000 if a < 100 else a
    else:
        m = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?", s)
        if not m:
            raise Invalido(f"data '{s}' — use dd/mm/aaaa")
        a, mth, d = int(m[1]), int(m[2]), int(m[3])
    try:
        r = dt.date(a, mth, d)
    except ValueError:
        raise Invalido(f"data '{s}' não existe")
    if not 1950 <= r.year <= 2100:
        raise Invalido(f"ano {r.year} fora do esperado")
    return r


def hora(v) -> dt.time | None:
    if vazio(v):
        return None
    if isinstance(v, dt.time):
        return v.replace(second=0, microsecond=0)
    if isinstance(v, dt.datetime):
        return v.time().replace(second=0, microsecond=0)
    if isinstance(v, float) and 0 <= v < 1:                         # fração de dia do Excel
        minutos = round(v * 1440)
        return dt.time(minutos // 60, minutos % 60)
    m = re.fullmatch(r"(\d{1,2})[:hH](\d{2})?", str(v).strip())
    if not m or int(m[1]) > 23 or int(m[2] or 0) > 59:
        raise Invalido(f"horário '{v}' — use HH:MM")
    return dt.time(int(m[1]), int(m[2] or 0))


def numero(v) -> Decimal | None:
    if vazio(v):
        return None
    if isinstance(v, (int, float, Decimal)):
        return Decimal(str(v))
    s = str(v).strip().replace("R$", "").replace(" ", "").replace("−", "-")
    if "," in s:                                                      # 1.234,56 -> 1234.56
        s = s.replace(".", "").replace(",", ".")
    try:
        return Decimal(s)
    except InvalidOperation:
        raise Invalido(f"número '{v}'")


def inteiro(v) -> int | None:
    n = numero(v)
    if n is None:
        return None
    if n != n.to_integral_value():
        raise Invalido(f"'{v}' precisa ser número inteiro")
    return int(n)


SIM = {"sim", "s", "x", "yes", "y", "true", "verdadeiro", "1", "utiliza"}
NAO = {"nao", "n", "no", "false", "falso", "0", "nao_utiliza"}


def booleano(v) -> bool | None:
    if vazio(v):
        return None
    k = chave(v)
    if k in SIM:
        return True
    if k in NAO:
        return False
    raise Invalido(f"'{v}' — use sim ou não")


def enum(v, opcoes: dict[str, str]) -> str | None:
    """opcoes: {apelido_normalizado: valor_canônico}."""
    if vazio(v):
        return None
    k = chave(v)
    if k in opcoes:
        return opcoes[k]
    raise Invalido(f"'{v}' não é um valor aceito ({', '.join(sorted(set(opcoes.values())))})")
