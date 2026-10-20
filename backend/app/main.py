"""Aplicação web: API + arquivos do painel."""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .core import db
from .core.seguranca import apagar_cookie
from .core.paths import FRONTEND
from .api import auth, dados as routes_dados, importacao as routes_importacao, ponto as routes_integracao, usuarios as routes_usuarios

log = logging.getLogger("quadro")
DOCS = os.getenv("API_DOCS", "false").lower() in ("1", "true", "sim")   # documentação interativa só se ligada

@asynccontextmanager
async def lifespan(app):
    db.aplicar_schema()
    log.info("Schema verificado.")
    yield


app = FastAPI(title="COFFITO Pass", version="1.3.1", lifespan=lifespan, redoc_url=None,
              docs_url="/api/docs" if DOCS else None, openapi_url="/api/openapi.json" if DOCS else None)
app.include_router(auth.router)
app.include_router(routes_usuarios.router)
app.include_router(routes_importacao.router)
app.include_router(routes_integracao.router)
app.include_router(routes_dados.router)


CSP = ("default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; "
       "frame-ancestors 'none'; base-uri 'self'; form-action 'self'")


@app.middleware("http")
async def cabecalhos_seguranca(request: Request, call_next):
    if (request.method not in ('GET', 'HEAD', 'OPTIONS') and request.url.path.startswith('/api/')
            and not request.url.path.startswith('/api/integracao/ponto/')
            and request.headers.get('x-requested-with') != 'quadro-pessoal'):
        resp = JSONResponse({'detail': 'Requisição recusada.'}, status_code=403)
    else:
        resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "same-origin"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Content-Security-Policy"] = CSP
    if resp.status_code == 401 and request.url.path.startswith('/api/') and request.url.path != '/api/auth/login' and not request.url.path.startswith('/api/integracao/'):
        apagar_cookie(resp)
    if request.url.path.startswith("/api/") or request.url.path in ('/', '/index.html', '/login', '/login.html', '/importacao.html'):
        resp.headers["Cache-Control"] = "no-store"
    return resp


@app.exception_handler(Exception)
async def erro_geral(request: Request, exc: Exception):
    log.exception("Erro não tratado em %s", request.url.path)
    return JSONResponse({"detail": "Erro interno. Tente novamente ou fale com o suporte."}, status_code=500)


@app.get("/saude", include_in_schema=False)
def saude():
    db.consultar("SELECT 1")
    return {"ok": True}


@app.get("/", include_in_schema=False)
@app.get("/index.html", include_in_schema=False)
def inicio():
    return FileResponse(FRONTEND / "index.html")


@app.get("/login", include_in_schema=False)
@app.get("/login.html", include_in_schema=False)
def pagina_login():
    return FileResponse(FRONTEND / "login.html")


@app.get("/importacao.html", include_in_schema=False)
def pagina_importacao():
    return FileResponse(FRONTEND / "importacao.html")


# Apenas assets de execução são públicos; package.json e testes ficam fora das rotas.
for pasta in ("styles", "scripts", "assets"):
    app.mount(f"/{pasta}", StaticFiles(directory=FRONTEND / pasta), name=pasta)
