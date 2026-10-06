"""Acesso ao PostgreSQL com pg8000 (driver 100% Python) e um pool simples de conexões."""
from __future__ import annotations

import contextlib
import pathlib
import queue
import threading

import pg8000.dbapi

from . import config

_pool: "queue.LifoQueue[pg8000.dbapi.Connection]" = queue.LifoQueue()
_vagas = threading.BoundedSemaphore(config.POOL_MAX)


def _nova():
    return pg8000.dbapi.connect(**config.parametros_conexao(), application_name="quadro-pessoal")


@contextlib.contextmanager
def conexao():
    """Entrega uma conexão em transação; faz COMMIT no fim ou ROLLBACK em erro."""
    if not _vagas.acquire(timeout=30):
        raise RuntimeError("Banco de dados ocupado: nenhuma conexão livre em 30 s.")
    c = None
    try:
        try:
            c = _pool.get_nowait()
        except queue.Empty:
            c = _nova()
        try:
            yield c
            c.commit()
        except Exception:
            try:
                c.rollback()
            except Exception:
                c = None          # conexão quebrada: descarta
            raise
    finally:
        if c is not None:
            _pool.put(c)
        _vagas.release()


def linhas(cur) -> list[dict]:
    nomes = [d[0] for d in cur.description]
    return [dict(zip(nomes, r)) for r in cur.fetchall()]


def consultar(sql: str, params=()) -> list[dict]:
    with conexao() as c:
        cur = c.cursor()
        cur.execute(sql, params)
        return linhas(cur)


def aplicar_schema():
    sql = (pathlib.Path(__file__).resolve().parent.parent / "db" / "schema.sql").read_text(encoding="utf-8")
    with conexao() as c:
        cur = c.cursor()
        cur.execute("SELECT pg_advisory_lock(424242)")
        try:
            for comando in _separar(sql):
                cur.execute(comando)
        finally:
            cur.execute("SELECT pg_advisory_unlock(424242)")


def _separar(sql: str):
    """Divide o arquivo em comandos (o schema não usa funções com ';' internos)."""
    sem_comentarios = "\n".join(l for l in sql.splitlines() if not l.strip().startswith("--"))
    for parte in sem_comentarios.split(";"):
        if parte.strip():
            yield parte
