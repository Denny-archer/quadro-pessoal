import datetime as dt
import json
from fastapi import HTTPException
from ..core import db
from ..acesso.service import contexto, invalidar
from ..services.auditoria import auditar
from ..services.dados import _id

TABELAS={'demandas':'demandas.demandas','metas':'demandas.metas','modelos':'demandas.modelos'}
FUSO=__import__('zoneinfo').ZoneInfo('America/Sao_Paulo')


def data(v):
    if v in ('',None):
        return None
    try:
        return dt.date.fromisoformat(str(v))
    except ValueError:
        raise HTTPException(400,'Data inválida; use AAAA-MM-DD.') from None


def tabela(col):
    if col not in TABELAS:
        raise HTTPException(404,'Coleção inexistente.')
    return TABELAS[col]


def documentos(cur, col, ctx, rid=None):
    t=tabela(col)
    where, params=ctx.demanda_sql() if col=='demandas' else ('TRUE',())
    cur.execute(f'SELECT d.* FROM {t} d WHERE d.excluido_em IS NULL AND {where}'+(' AND d.id=%s' if rid else '')+' ORDER BY d.id', (*params,*([rid] if rid else [])))
    rows=db.linhas(cur)
    docs=[]
    for row in rows:
        doc={**row['dados'],'id':row['id'],'versao':row['versao']}
        if col=='demandas':
            doc.update(titulo=row['titulo'],responsavelId=row['funcionario_id'] or '',setorId=row['setor_id'],
                       processo=row['processo'],link=row['link'],prioridade=row['prioridade'],status=row['status'],
                       prazo=str(row['prazo'] or ''),inicio=str(row['inicio'] or ''),concluidoEm=str(row['concluido_em'] or '') or None,
                       modeloId=row['modelo_id'] or '',criadoEm=row['criado_em'].date().isoformat(),atualizadoEm=row['atualizado_em'].isoformat())
            cur.execute('SELECT * FROM demandas.checklist_itens WHERE demanda_id=%s ORDER BY ordem,id',(row['id'],))
            doc['checklist']={x['id']:{'texto':x['texto'],'prazo':str(x['prazo'] or ''),'feito':x['feito'],
                                      'feitoEm':str(x['feito_em'] or '') or None,'ordem':x['ordem']} for x in db.linhas(cur)}
        elif col=='modelos':
            doc['nome']=row['nome']
            cur.execute('SELECT texto,prazo_dias FROM demandas.modelo_etapas WHERE modelo_id=%s ORDER BY ordem',(row['id'],))
            doc['etapas']=[{'texto':x['texto'],'prazoDias':x['prazo_dias'] if x['prazo_dias'] is not None else ''} for x in db.linhas(cur)]
        else:
            doc.update(titulo=row['titulo'],setorId=row['setor_id'])
            cur.execute('SELECT setor FROM setores_aux WHERE id=%s',(row['setor_id'],))
            doc['setor']=cur.fetchone()[0]
            cur.execute('SELECT dados FROM demandas.meta_etapas WHERE meta_id=%s ORDER BY ordem',(row['id'],))
            doc['etapas']=[x['dados'] for x in db.linhas(cur)]
        docs.append(doc)
    return docs


def mesclar(a,b):
    result=dict(a)
    for k,v in b.items():
        result[k]=mesclar(result.get(k,{}) if isinstance(result.get(k),dict) else {},v) if isinstance(v,dict) else v
    return result


def salvar(u,col,rid,versao,doc=None,parcial=False,excluir=False):
    t=tabela(col)
    _id(rid)
    if doc is not None and len(json.dumps(doc,ensure_ascii=False))>200000:
        raise HTTPException(400,'Registro excede o tamanho permitido.')
    with db.conexao() as c:
        q=c.cursor()
        ctx=contexto(u,q)
        # Também serializa criações concorrentes do mesmo identificador.
        q.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',(t+':'+rid,))
        q.execute(f'SELECT * FROM {t} WHERE id=%s FOR UPDATE',(rid,))
        rows=db.linhas(q)
        old=rows[0] if rows else None
        if old and old['excluido_em']:
            raise HTTPException(404,'Registro excluído.')
        if col=='demandas':
            if old and not ctx.gerir(old['setor_id']):
                raise HTTPException(403,'Você não pode alterar demandas deste setor.')
            if not old and not (ctx.admin or ctx.setores):
                raise HTTPException(403,'Somente gestores cadastram demandas.')
        elif not ctx.admin:
            raise HTTPException(403,'Somente administradores mantêm metas e modelos.')
        if versao != (old['versao'] if old else 0):
            raise HTTPException(409,'O registro mudou. Reabra os dados atuais e revise suas alterações.')
        antes=documentos(q,col,ctx,rid)[0] if old else None
        if excluir:
            if not old:
                raise HTTPException(404,'Registro inexistente.')
            q.execute(f'UPDATE {t} SET excluido_em=now(),atualizado_em=now(),atualizado_por=%s,versao=versao+1 WHERE id=%s',(u.id,rid))
            invalidar(q,funcionarios=[old.get('funcionario_id')],setores=[old.get('setor_id')],todos=col!='demandas')
            auditar(q,u.id,'excluir',t,rid,antes)
            return {'ok':True,'versao':versao+1}
        d=mesclar(antes or {},doc) if parcial else dict(doc or {})
        for k in ('id','versao','criadoEm','atualizadoEm','exemplo'):
            d.pop(k,None)
        titulo=str(d.get('nome' if col=='modelos' else 'titulo') or '').strip()
        if not titulo or len(titulo)>500:
            raise HTTPException(400,'Informe um título de até 500 caracteres.')
        sid=None
        if col!='modelos':
            sid=d.get('setorId') or (old or {}).get('setor_id')
            fid=d.get('responsavelId') or None
            if not sid and col=='demandas' and fid:
                q.execute('SELECT setor_id FROM funcionarios WHERE id=%s',(fid,))
                f=q.fetchone()
                sid=f[0] if f else None
            if not sid and col=='metas' and d.get('setor'):
                q.execute('SELECT id FROM setores_aux WHERE setor=%s AND ativo',(d['setor'],))
                ss=q.fetchall()
                sid=ss[0][0] if len(ss)==1 else None
            q.execute('SELECT id FROM setores_aux WHERE id=%s AND ativo',(sid,))
            if not q.fetchone():
                raise HTTPException(400,'Selecione um setor ativo e cadastrado.')
        if col=='demandas':
            if not ctx.gerir(sid) or (old and old['setor_id']!=sid and not ctx.admin):
                raise HTTPException(403,'Transferência de setor exige administrador.')
            if fid:
                q.execute('SELECT setor_id,situacao FROM funcionarios WHERE id=%s',(fid,))
                f=q.fetchone()
                mudou=not old or fid!=old['funcionario_id'] or sid!=old['setor_id']
                if not f or (mudou and (f[0]!=sid or f[1]=='inativo')):
                    raise HTTPException(400,'O responsável deve ser um funcionário ativo do setor da demanda.')
            status=d.get('status','afazer')
            prioridade=d.get('prioridade','media')
            if status not in ('afazer','andamento','aguardando','concluida') or prioridade not in ('alta','media','baixa'):
                raise HTTPException(400,'Situação ou prioridade inválida.')
            link=str(d.get('link') or '').strip()
            if link and not link.lower().startswith(('https://','http://')):
                raise HTTPException(400,'Use um link HTTP ou HTTPS completo.')
            ck=d.pop('checklist',{}) or {}
            if not isinstance(ck,dict) or len(ck)>200:
                raise HTTPException(400,'Checklist inválido ou com mais de 200 itens.')
            if any(not isinstance(x,dict) for x in ck.values()):
                raise HTTPException(400,'Item de checklist inválido.')
            if ck and all(x.get('feito') is True for x in ck.values()):
                status='concluida'
            concluido=data(d.get('concluidoEm')) if status=='concluida' else None
            if status=='concluida' and not concluido:
                concluido=dt.datetime.now(FUSO).date()
            modelo=d.get('modeloId') or None
            if modelo:
                q.execute('SELECT id,nome FROM demandas.modelos WHERE id=%s AND excluido_em IS NULL',(modelo,))
                mod=q.fetchone()
                if not mod:
                    if not old or old['modelo_id']!=modelo:
                        raise HTTPException(400,'Modelo inexistente ou excluído.')
                else:
                    d['modeloNome']=mod[1]
                    if not old and not ck:
                        q.execute('SELECT texto,prazo_dias FROM demandas.modelo_etapas WHERE modelo_id=%s ORDER BY ordem',(modelo,))
                        inicio=data(d.get('inicio')) or dt.datetime.now(FUSO).date()
                        ck={f'etapa{i}':{'texto':e['texto'],'feito':False,
                            'prazo':(inicio+dt.timedelta(days=e['prazo_dias'])).isoformat() if e['prazo_dias'] is not None else ''}
                            for i,e in enumerate(db.linhas(q))}
            q.execute('''INSERT INTO demandas.demandas(id,funcionario_id,setor_id,titulo,processo,link,prioridade,prazo,status,inicio,concluido_em,modelo_id,dados,criado_por,atualizado_por)
                VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT(id) DO UPDATE SET funcionario_id=EXCLUDED.funcionario_id,setor_id=EXCLUDED.setor_id,titulo=EXCLUDED.titulo,
                    processo=EXCLUDED.processo,link=EXCLUDED.link,prioridade=EXCLUDED.prioridade,prazo=EXCLUDED.prazo,status=EXCLUDED.status,
                    inicio=EXCLUDED.inicio,concluido_em=EXCLUDED.concluido_em,modelo_id=EXCLUDED.modelo_id,dados=EXCLUDED.dados,
                    atualizado_por=EXCLUDED.atualizado_por,atualizado_em=now(),versao=demandas.demandas.versao+1''',
                (rid,fid,sid,titulo,str(d.get('processo') or ''),link,prioridade,data(d.get('prazo')),status,data(d.get('inicio')),concluido,modelo,json.dumps(d),u.id,u.id))
            q.execute('DELETE FROM demandas.checklist_itens WHERE demanda_id=%s',(rid,))
            for i,(iid,item) in enumerate(ck.items()):
                _id(iid)
                if not isinstance(item,dict) or not str(item.get('texto') or '').strip() or type(item.get('feito',False)) is not bool:
                    raise HTTPException(400,'Item de checklist inválido.')
                q.execute('INSERT INTO demandas.checklist_itens(demanda_id,id,ordem,texto,prazo,feito,feito_em,atualizado_por) VALUES(%s,%s,%s,%s,%s,%s,%s,%s)',
                    (rid,iid,i,str(item['texto']).strip(),data(item.get('prazo')),item.get('feito',False),data(item.get('feitoEm')) if item.get('feito') else None,u.id))
        else:
            etapas=d.pop('etapas',[]) or []
            if not isinstance(etapas,list) or len(etapas)>200:
                raise HTTPException(400,'Limite de 200 etapas por registro.')
            if col=='modelos':
                q.execute('''INSERT INTO demandas.modelos(id,nome,dados,criado_por,atualizado_por) VALUES(%s,%s,%s,%s,%s)
                    ON CONFLICT(id) DO UPDATE SET nome=EXCLUDED.nome,dados=EXCLUDED.dados,atualizado_por=EXCLUDED.atualizado_por,
                    atualizado_em=now(),versao=demandas.modelos.versao+1''',(rid,titulo,json.dumps(d),u.id,u.id))
                q.execute('DELETE FROM demandas.modelo_etapas WHERE modelo_id=%s',(rid,))
                for i,e in enumerate(etapas):
                    if not isinstance(e,dict):
                        raise HTTPException(400,'Etapa de modelo inválida.')
                    dias=e.get('prazoDias')
                    if not str(e.get('texto') or '').strip() or (dias not in ('',None) and (type(dias) is not int or dias<0)):
                        raise HTTPException(400,'Etapa ou prazo do modelo inválido.')
                    q.execute('INSERT INTO demandas.modelo_etapas(modelo_id,ordem,texto,prazo_dias) VALUES(%s,%s,%s,%s)',(rid,i,e['texto'],dias if dias!='' else None))
            else:
                q.execute('''INSERT INTO demandas.metas(id,setor_id,titulo,dados,criado_por,atualizado_por) VALUES(%s,%s,%s,%s,%s,%s)
                    ON CONFLICT(id) DO UPDATE SET setor_id=EXCLUDED.setor_id,titulo=EXCLUDED.titulo,dados=EXCLUDED.dados,
                    atualizado_por=EXCLUDED.atualizado_por,atualizado_em=now(),versao=demandas.metas.versao+1''',(rid,sid,titulo,json.dumps(d),u.id,u.id))
                q.execute('DELETE FROM demandas.meta_etapas WHERE meta_id=%s',(rid,))
                for i,e in enumerate(etapas):
                    if not isinstance(e,dict) or e.get('status','pendente') not in ('pendente','andamento','concluida','nao_concluida'):
                        raise HTTPException(400,'Situação de etapa inválida.')
                    data(e.get('prazo'))
                    q.execute('INSERT INTO demandas.meta_etapas(meta_id,ordem,dados) VALUES(%s,%s,%s)',(rid,i,json.dumps(e)))
        invalidar(q,funcionarios=[(old or {}).get('funcionario_id'),d.get('responsavelId')],setores=[(old or {}).get('setor_id'),sid],todos=col!='demandas')
        depois=documentos(q,col,ctx,rid)[0]
        auditar(q,u.id,'alterar' if old else 'criar',t,rid,antes,depois)
        return depois
