"""Aplicação web: API + arquivos do painel."""
from __future__ import annotations

import logging
import pathlib

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import os

from . import auth, db, routes_dados, routes_importacao, routes_usuarios

PUBLICO = pathlib.Path(__file__).resolve().parent.parent / "public"
log = logging.getLogger("quadro")
DOCS = os.getenv("API_DOCS", "false").lower() in ("1", "true", "sim")   # documentação interativa só se ligada

app = FastAPI(title="Quadro de Pessoal COFFITO", version="1.0.0", redoc_url=None,
              docs_url="/api/docs" if DOCS else None, openapi_url="/api/openapi.json" if DOCS else None)
app.include_router(auth.router)
app.include_router(routes_usuarios.router)
app.include_router(routes_importacao.router)
app.include_router(routes_dados.router)


@app.on_event("startup")
def iniciar():
    db.aplicar_schema()
    log.info("Schema verificado.")


CSP = ("default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; "
       "frame-ancestors 'none'; base-uri 'self'; form-action 'self'")


@app.middleware("http")
async def cabecalhos_seguranca(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "same-origin"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Content-Security-Policy"] = CSP
    if request.url.path.startswith("/api/"):
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
def inicio():
    return FileResponse(PUBLICO / "index.html")


@app.get("/login", include_in_schema=False)
def pagina_login():
    return FileResponse(PUBLICO / "login.html")


app.mount("/", StaticFiles(directory=PUBLICO), name="estaticos")
