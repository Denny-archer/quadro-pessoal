"""HTTP/SSE e concorrência do perfil RH entre processos, só na homologação."""
import concurrent.futures
import json
import queue
import threading
import time
import uuid
import httpx

URL = 'http://web:8000'
H = {'X-Requested-With':'quadro-pessoal'}
def cliente(email):
    c = httpx.Client(base_url=URL, headers=H, timeout=10)
    c.post('/api/auth/login', json={'email':email, 'senha':'Validacao-local!2026'}).raise_for_status()
    return c


def observar(c, rev, fila, parar):
    try:
        with c.stream('GET','/api/acesso/eventos',params={'desde':rev}) as r:
            r.raise_for_status()
            fila.put(('worker',r.headers['x-worker-teste']))
            evento = ''
            for linha in r.iter_lines():
                if linha.startswith('event: '): evento = linha[7:]
                if linha.startswith('data: '): fila.put((evento,json.loads(linha[6:])))
                if parar.is_set(): return
    except Exception as e:
        fila.put(('erro',str(e)))


admin, rh = cliente('admin@teste.local'), cliente('rh@teste.local')
uid = rh.get('/api/auth/eu').json()['id']
admin.put(f'/api/acesso/usuarios/{uid}/vinculo',json={'funcionario_id':'dora','setores':[]}).raise_for_status()
time.sleep(1.2)  # Permite ao observador refletir a atribuição anterior.
rev = rh.get('/api/acesso/contexto').json()['revisao_acesso']
fila, parar = queue.Queue(), threading.Event()
t = threading.Thread(target=observar,args=(rh,rev,fila,parar),daemon=True)
t.start()
tipo, pid = fila.get(timeout=5)
assert tipo == 'worker'
outro = None
for _ in range(20):
    c = cliente('admin@teste.local')
    if c.get('/saude').headers['x-worker-teste'] != pid:
        outro = c
        break
    c.close()
assert outro, 'Não foi possível obter outro processo.'
sufixo = uuid.uuid4().hex[:8]
try:
    # Não recebe sequer o anúncio de uma demanda de setor não concedido.
    outro.put('/api/demandas/demandas/rh-fora-'+sufixo,json={'versao':0,'dados':{'titulo':'Fora','setorId':3,'responsavelId':'carla'}}).raise_for_status()
    try:
        evento = fila.get(timeout=2)
        raise AssertionError(('Evento fora do alcance',evento))
    except queue.Empty:
        pass
    inicio = time.monotonic()
    outro.put('/api/dados/ocorrencias/rh-global-'+sufixo,json={'func':'carla','tipo':'atestado','inicio':'2026-10-20','fim':'2026-10-20'}).raise_for_status()
    evento = fila.get(timeout=4)
    assert evento[0] == 'invalidar',evento
    latencia = time.monotonic()-inicio
    assert latencia < 3,latencia
    parar.set();t.join(timeout=4)
    assert not t.is_alive()
    # Reconexão retoma a revisão persistida, mesmo em outro worker.
    parar.clear();fila=queue.Queue()
    t=threading.Thread(target=observar,args=(rh,rev,fila,parar),daemon=True);t.start()
    assert fila.get(timeout=5)[0]=='worker'
    assert fila.get(timeout=5)[0]=='invalidar'
    parar.set();t.join(timeout=4)
    # Duas gravações com a mesma revisão: exatamente uma vence.
    f=next(f for f in rh.get('/api/dados/funcionarios').json() if f['id']=='ana')
    def ajustar(n):
        c = cliente('rh@teste.local')
        try:
            return c.put('/api/dados/funcionarios/ana/saldos',json={'revisao':f['atualizadoEm'],'abonos':{'ref2025':{'restantes':n}}}).status_code
        finally:
            c.close()
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        resultados=sorted(pool.map(ajustar,[1,2]))
    assert resultados==[200,409],resultados
    # Grants e papel são reavaliados na mesma sessão, sem novo login.
    admin.put(f'/api/acesso/usuarios/{uid}/vinculo',json={'funcionario_id':'dora','setores':[3]}).raise_for_status()
    assert rh.get('/api/demandas/demandas/rh-fora-'+sufixo).status_code==200
    admin.put(f'/api/acesso/usuarios/{uid}/vinculo',json={'funcionario_id':'dora','setores':[]}).raise_for_status()
    assert rh.get('/api/demandas/demandas/rh-fora-'+sufixo).status_code==404
    admin.patch(f'/api/usuarios/{uid}',json={'papel':'colaborador'}).raise_for_status()
    assert not rh.get('/api/acesso/contexto').json()['capacidades']['lancar_rh']
    assert rh.put('/api/dados/funcionarios/ana/saldos',json={'revisao':f['atualizadoEm'],'abonos':{}}).status_code==403
    print(json.dumps({'rh_workers_distintos':True,'evento_rh_global_segundos':round(latencia,3),'sem_eventos_demandas_alheias':True,'reconexao':True,'saldos_concorrentes':resultados,'revogacao':True}))
finally:
    parar.set();t.join(timeout=4)
    admin.patch(f'/api/usuarios/{uid}',json={'papel':'rh'}).raise_for_status()
    admin.close();rh.close();outro.close()
