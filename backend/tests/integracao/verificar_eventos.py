"""HTTP real: destinatários, múltiplos processos, reconexão e encerramento."""
import concurrent.futures
import json
import queue
import threading
import time
import uuid
import httpx

URL='http://web:8000'
SUFIXO=uuid.uuid4().hex[:8]
PESSOAL='demanda-ana-'+SUFIXO
ALHEIA='fora-do-alcance-'+SUFIXO
H={'X-Requested-With':'quadro-pessoal'}
def cliente(email):
    c=httpx.Client(base_url=URL,headers=H,timeout=8)
    c.post('/api/auth/login',json={'email':email,'senha':'Validacao-local!2026'}).raise_for_status()
    return c


def stream(c,rev,out,parar):
    with c.stream('GET','/api/acesso/eventos',params={'desde':rev}) as r:
        r.raise_for_status()
        out.put(('worker',r.headers['x-worker-teste']))
        evento=''
        for line in r.iter_lines():
            if line.startswith('event: '):evento=line[7:]
            if line.startswith('data: '):out.put((evento,json.loads(line[6:])))
            if parar.is_set():return


admin=cliente('admin@teste.local')
ana=cliente('ana@teste.local')
gestor=cliente('gestor@teste.local')
rev=ana.get('/api/acesso/contexto').json()['revisao_acesso']
eventos=queue.Queue();parar=threading.Event()
t=threading.Thread(target=stream,args=(ana,rev,eventos,parar),daemon=True);t.start()
pid=eventos.get(timeout=5)[1]
# Garante que a gravação ocorre em outro processo, abrindo novas conexões até obtê-lo.
outro=None
def candidato(_):
    c=cliente('admin@teste.local')
    return c,c.get('/saude').headers['x-worker-teste']
with concurrent.futures.ThreadPoolExecutor(12) as pool:
    candidatos=list(pool.map(candidato,range(12)))
for c,worker in candidatos:
    if worker!=pid and outro is None:outro=c
    else:c.close()
assert outro is not None,'Não foi possível comprovar dois workers.'

def demanda(c,rid,sid,fid):
    r=c.put('/api/demandas/demandas/'+rid,json={'versao':0,'dados':{'titulo':'Processo de validação '+rid,'setorId':sid,'responsavelId':fid,'prioridade':'alta','status':'afazer','checklist':{'etapa1':{'texto':'Conferir documentação','feito':False}}}})
    r.raise_for_status();return r.json()

demanda(admin,ALHEIA,2,'bruno')
try:
    evento=eventos.get(timeout=2)
    assert evento[0]!='invalidar','Evento de demanda alheia vazou.'
except queue.Empty:pass
inicio=time.monotonic();d=demanda(outro,PESSOAL,1,'ana')
evento=eventos.get(timeout=4)
assert evento[0]=='invalidar',evento
latencia=time.monotonic()-inicio
assert latencia<=3,latencia
assert PESSOAL in [d['id'] for d in ana.get('/api/demandas/estado').json()['demandas']]
assert ALHEIA not in [d['id'] for d in ana.get('/api/demandas/estado').json()['demandas']]
# Concorrência real: exatamente um escritor vence sobre a mesma versão.
def editar(titulo):
    c=cliente('gestor@teste.local')
    try:
        return c.patch('/api/demandas/demandas/'+PESSOAL,json={'versao':1,'dados':{'titulo':titulo}}).status_code
    finally:
        c.close()
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    assert sorted(pool.map(editar,['Edição um','Edição dois']))==[200,409]
while not eventos.empty():eventos.get_nowait()
# Logout no servidor encerra até um stream em outra conexão.
ana.post('/api/auth/logout').raise_for_status()
fim=time.monotonic()+5
encerrado=False
while time.monotonic()<fim:
    evt=eventos.get(timeout=5)
    if evt[0]=='sessao':encerrado=True;break
assert encerrado,'Stream continuou após logout.'
parar.set();t.join(timeout=3)
assert not t.is_alive()
print(json.dumps({'workers_distintos':True,'latencia_segundos':round(latencia,3),'isolamento_eventos':True,'concorrencia':[200,409],'logout_stream':True}))
