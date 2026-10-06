"""Comandos de administração.

  python -m app.cli schema                         aplica/atualiza o schema
  python -m app.cli criar-admin EMAIL "NOME"       cria (ou reativa) um administrador; pede a senha
  python -m app.cli carregar-json PASTA            carga inicial a partir de uma exportação JSON
  python -m app.cli exportar-json PASTA            exporta tudo para JSON (backup legível)
"""
from __future__ import annotations

import getpass
import json
import os
import pathlib
import sys

from . import db, mapping
from .auth import hash_senha
from .routes_dados import gravar


def schema():
    db.aplicar_schema()
    print("Schema aplicado.")


def criar_admin(email: str, nome: str):
    senha = os.getenv("ADMIN_SENHA") or getpass.getpass("Senha (mín. 10 caracteres): ")
    if len(senha) < 10:
        sys.exit("A senha precisa ter pelo menos 10 caracteres.")
    db.aplicar_schema()
    with db.conexao() as c:
        c.cursor().execute(
            """INSERT INTO usuarios (email, nome, papel, senha_hash) VALUES (%s,%s,'admin',%s)
               ON CONFLICT (lower(email)) DO UPDATE SET papel='admin', ativo=true, senha_hash=EXCLUDED.senha_hash, nome=EXCLUDED.nome""",
            (email, nome, hash_senha(senha)))
    print(f"Administrador {email} pronto.")


def carregar_json(pasta: str):
    """Espera PASTA/funcionarios/*.json, PASTA/ocorrencias/*.json e PASTA/config/*.json (id = nome do arquivo)."""
    base = pathlib.Path(pasta)
    db.aplicar_schema()
    cont = {}
    with db.conexao() as c:
        cur = c.cursor()
        for arq in sorted((base / "config").glob("*.json")):
            cur.execute("INSERT INTO config (chave, valor) VALUES (%s,%s) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()",
                        (arq.stem, arq.read_text(encoding="utf-8")))
            cont["config"] = cont.get("config", 0) + 1
        for colecao in ("funcionarios", "ocorrencias"):
            for arq in sorted((base / colecao).glob("*.json")):
                doc = json.loads(arq.read_text(encoding="utf-8"))
                doc.pop("id", None)
                gravar(cur, colecao, arq.stem, doc)
                cont[colecao] = cont.get(colecao, 0) + 1
    print("Carregados:", cont)


def exportar_json(pasta: str):
    base = pathlib.Path(pasta)
    for colecao in ("funcionarios", "ocorrencias"):
        (base / colecao).mkdir(parents=True, exist_ok=True)
        for l in db.consultar(f"SELECT * FROM {colecao}"):
            d = mapping.linha_para_doc(colecao, l)
            (base / colecao / f"{d.pop('id')}.json").write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    (base / "config").mkdir(parents=True, exist_ok=True)
    for l in db.consultar("SELECT chave, valor FROM config"):
        (base / "config" / f"{l['chave']}.json").write_text(json.dumps(l["valor"], ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Exportado para {base}")


if __name__ == "__main__":
    cmd, *args = sys.argv[1:] or ["ajuda"]
    acoes = {"schema": schema, "criar-admin": criar_admin, "carregar-json": carregar_json, "exportar-json": exportar_json}
    if cmd not in acoes:
        sys.exit(__doc__)
    acoes[cmd](*args)
