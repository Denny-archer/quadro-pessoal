"""Caminhos comuns ao checkout e à imagem Docker; independentes do diretório corrente."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FRONTEND = ROOT / "frontend"
SCHEMA = ROOT / "db" / "schema.sql"
