"""Configuração lida das variáveis de ambiente (ver .env.example)."""
import os
from urllib.parse import urlparse, unquote


def _bool(nome, padrao=False):
    v = os.getenv(nome)
    return padrao if v is None else v.strip().lower() in ("1", "true", "sim", "yes", "on")


DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://quadro:quadro@db:5432/quadro")
JWT_SECRET = os.getenv("JWT_SECRET", "")
SESSAO_HORAS = int(os.getenv("SESSAO_HORAS", "10"))
COOKIE_SEGURO = _bool("COOKIE_SEGURO", True)          # exige HTTPS para o cookie de sessão
TAMANHO_MAX_UPLOAD_MB = int(os.getenv("TAMANHO_MAX_UPLOAD_MB", "10"))
POOL_MAX = int(os.getenv("DB_POOL_MAX", "10"))
FUSO = os.getenv("TZ", "America/Sao_Paulo")

if not JWT_SECRET or len(JWT_SECRET) < 32:
    if _bool("PERMITIR_SEGREDO_FRACO", False):
        JWT_SECRET = JWT_SECRET or "desenvolvimento-apenas-nao-use-em-producao-0000"
    else:
        raise SystemExit("Defina JWT_SECRET com pelo menos 32 caracteres (ex.: openssl rand -hex 32).")


def parametros_conexao():
    if os.getenv('DB_HOST'):
        return {'host': os.environ['DB_HOST'], 'port': int(os.getenv('DB_PORT', '5432')),
                'user': os.environ['POSTGRES_USER'], 'password': os.environ['POSTGRES_PASSWORD'],
                'database': os.environ['POSTGRES_DB']}
    u = urlparse(DATABASE_URL)
    return {
        "user": unquote(u.username or "postgres"),
        "password": unquote(u.password or "") or None,
        "host": u.hostname or "localhost",
        "port": u.port or 5432,
        "database": (u.path or "/postgres").lstrip("/") or "postgres",
    }
