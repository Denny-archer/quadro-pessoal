"""SSE de invalidação por destinatário, compartilhando observação entre abas."""
import asyncio
import json
import logging
import anyio
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from ..core import db
from ..core.seguranca import usuario_atual
from ..schemas.auth import Usuario

router=APIRouter(prefix='/api/acesso',tags=['atualizações'])
revisoes={}
sinal=None
log=logging.getLogger('quadro.eventos')


async def observar():
    global revisoes,sinal
    sinal=asyncio.Condition()
    while True:
        try:
            rows=await anyio.to_thread.run_sync(lambda: db.consultar('SELECT usuario_id,revisao FROM acesso_revisoes'))
            revisoes={r['usuario_id']:r['revisao'] for r in rows}
            async with sinal:
                sinal.notify_all()
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception('Falha ao observar revisões; nova tentativa em um segundo.')
        await asyncio.sleep(1)


@router.get('/eventos')
async def eventos(request:Request,desde:int=0,u:Usuario=Depends(usuario_atual)):
    try:
        cursor=int(request.headers.get('last-event-id',desde))
    except ValueError:
        cursor=-1
    async def stream():
        nonlocal cursor
        yield 'retry: 1000\n\n'
        while not await request.is_disconnected():
            try:
                await anyio.to_thread.run_sync(lambda:usuario_atual(request))
            except HTTPException:
                yield 'event: sessao\ndata: {}\n\n'
                return
            rev=revisoes.get(u.id,0)
            if rev!=cursor:
                cursor=rev
                yield f'id: {rev}\nevent: invalidar\ndata: '+json.dumps({'revisao':rev})+'\n\n'
            else:
                yield ': conectado\n\n'
            if sinal is None:
                await asyncio.sleep(1)
            else:
                async with sinal:
                    try:
                        await asyncio.wait_for(sinal.wait(),timeout=2)
                    except TimeoutError:
                        pass
    return StreamingResponse(stream(),media_type='text/event-stream',headers={
        'Cache-Control':'no-store','X-Accel-Buffering':'no'})
