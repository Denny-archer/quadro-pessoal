"""Somente homologação: identifica o processo para comprovar eventos entre workers."""
import os
from app.main import app

@app.middleware('http')
async def identificar(request,call_next):
    response=await call_next(request)
    response.headers['X-Worker-Teste']=str(os.getpid())
    return response
