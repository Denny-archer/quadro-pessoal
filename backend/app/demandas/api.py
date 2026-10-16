from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from ..core import db
from ..core.seguranca import usuario_atual
from ..schemas.auth import Usuario
from ..acesso.service import contexto, publico
from .service import documentos, salvar

router=APIRouter(prefix='/api/demandas',tags=['demandas'])


@router.get('/estado')
def estado(u: Usuario=Depends(usuario_atual)):
    with db.conexao() as c:
        q=c.cursor()
        # Um snapshot consistente para contexto, coleções e revisão.
        q.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
        ctx=contexto(u,q)
        where, params=ctx.funcionario_sql()
        dw, dp=ctx.demanda_sql('d')
        q.execute(f'''SELECT f.id,f.nome,f.cargo AS funcao,f.setor_id AS "setorId",f.situacao
            FROM funcionarios f WHERE {where} OR EXISTS(SELECT 1 FROM demandas.demandas d
                WHERE d.funcionario_id=f.id AND d.excluido_em IS NULL AND {dw}) ORDER BY f.nome''',(*params,*dp))
        colaboradores=db.linhas(q)
        q.execute('SELECT id,setor AS nome,codigo,ativo FROM setores_aux ORDER BY setor')
        setores=db.linhas(q)
        return {'contexto': publico(u,ctx),
                'colaboradores':colaboradores,'setores':setores,
                **{col:documentos(q,col,ctx) for col in ('demandas','metas','modelos')}}


@router.get('/{col}/{rid}')
def detalhe(col:str,rid:str,u:Usuario=Depends(usuario_atual)):
    with db.conexao() as c:
        q=c.cursor()
        docs=documentos(q,col,contexto(u,q),rid)
        if not docs:
            raise HTTPException(404,'Registro inexistente ou fora do alcance.')
        return docs[0]


class Alteracao(BaseModel):
    versao: int=Field(ge=0)
    dados: dict


@router.put('/{col}/{rid}')
def gravar(col:str,rid:str,dados:Alteracao,u:Usuario=Depends(usuario_atual)):
    return salvar(u,col,rid,dados.versao,dados.dados)


@router.patch('/{col}/{rid}')
def atualizar(col:str,rid:str,dados:Alteracao,u:Usuario=Depends(usuario_atual)):
    return salvar(u,col,rid,dados.versao,dados.dados,parcial=True)


@router.delete('/{col}/{rid}')
def excluir(col:str,rid:str,versao:int=Query(ge=1),u:Usuario=Depends(usuario_atual)):
    return salvar(u,col,rid,versao,excluir=True)
