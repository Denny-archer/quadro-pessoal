from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from ..core import db
from ..core.seguranca import exige, usuario_atual
from ..schemas.auth import Usuario
from ..services.auditoria import auditar
from .service import publico, invalidar

router = APIRouter(prefix='/api/acesso', tags=['acesso e organização'])


@router.get('/contexto')
def ler_contexto(u: Usuario = Depends(usuario_atual)):
    return publico(u)


class Vinculo(BaseModel):
    funcionario_id: str | None = None
    setores: list[int] = Field(default_factory=list, max_length=100)


@router.get('/administracao')
def administracao(_: Usuario = Depends(exige('admin'))):
    return {
        'usuarios': db.consultar('''SELECT u.id,u.nome,u.email,u.papel,u.ativo,uf.funcionario_id,
            coalesce((SELECT jsonb_agg(g.setor_id ORDER BY g.setor_id) FROM gestores_setores g
                WHERE g.usuario_id=u.id AND g.ativo),'[]'::jsonb) setores
            FROM usuarios u LEFT JOIN usuario_funcionario uf ON uf.usuario_id=u.id ORDER BY u.nome'''),
        'funcionarios': db.consultar('SELECT id,nome,matricula,setor,setor_id,cargo,cargo_id,situacao FROM funcionarios ORDER BY nome'),
        'setores': db.consultar('SELECT * FROM setores_aux ORDER BY setor'),
        'cargos': db.consultar('SELECT * FROM cargos_aux ORDER BY cargo')}


@router.get('/organizacao')
def organizacao(_:Usuario=Depends(usuario_atual)):
    return {'setores':db.consultar('SELECT id,setor,codigo,ativo FROM setores_aux ORDER BY setor'),
            'cargos':db.consultar('SELECT id,cargo,ativo FROM cargos_aux ORDER BY cargo')}


@router.put('/usuarios/{uid}/vinculo')
def vincular(uid: int, dados: Vinculo, adm: Usuario = Depends(exige('admin'))):
    with db.conexao() as c:
        q = c.cursor()
        q.execute('SELECT id,papel FROM usuarios WHERE id=%s FOR UPDATE', (uid,))
        row = q.fetchone()
        if not row:
            raise HTTPException(404, 'Conta inexistente.')
        if dados.setores and row[1] != 'gestor':
            raise HTTPException(400, 'Somente o perfil gestor recebe setores de gestão.')
        if dados.funcionario_id:
            q.execute('SELECT id,situacao FROM funcionarios WHERE id=%s FOR UPDATE', (dados.funcionario_id,))
            f = q.fetchone()
            if not f:
                raise HTTPException(400, 'Funcionário inexistente.')
            if f[1] == 'inativo':
                raise HTTPException(400, 'Reative o funcionário antes de conceder acesso individual.')
            q.execute('SELECT usuario_id FROM usuario_funcionario WHERE funcionario_id=%s AND usuario_id<>%s', (f[0], uid))
            if q.fetchone():
                raise HTTPException(409, 'Funcionário já vinculado a outra conta.')
        setores = sorted(set(dados.setores))
        q.execute('SELECT id FROM setores_aux WHERE ativo AND id=ANY(%s::bigint[])', (setores,))
        if len(q.fetchall()) != len(setores):
            raise HTTPException(400, 'Setor inexistente ou inativo.')
        q.execute('SELECT funcionario_id FROM usuario_funcionario WHERE usuario_id=%s', (uid,))
        anterior = q.fetchone()
        q.execute('DELETE FROM usuario_funcionario WHERE usuario_id=%s', (uid,))
        if dados.funcionario_id:
            q.execute('INSERT INTO usuario_funcionario(usuario_id,funcionario_id,concedido_por) VALUES(%s,%s,%s)',
                      (uid, dados.funcionario_id, adm.id))
        q.execute('UPDATE gestores_setores SET ativo=false,atualizado_em=now() WHERE usuario_id=%s', (uid,))
        for sid in setores:
            q.execute('''INSERT INTO gestores_setores(usuario_id,setor_id,concedido_por) VALUES(%s,%s,%s)
                ON CONFLICT(usuario_id,setor_id) DO UPDATE SET ativo=true,concedido_por=EXCLUDED.concedido_por,atualizado_em=now()''', (uid, sid, adm.id))
        invalidar(q, usuarios=[uid])
        auditar(q, adm.id, 'alterar', 'usuario_funcionario', str(uid),
                {'funcionario_id': anterior[0] if anterior else None}, dados.model_dump())
    return {'ok': True}


class Cadastro(BaseModel):
    nome: str = Field(min_length=1, max_length=150)
    descricao: str = Field(default='', max_length=2000)
    codigo: str | None = Field(default=None, max_length=30)
    ativo: bool = True


@router.put('/organizacao/{tipo}/{rid}')
def salvar_cadastro(tipo: str, rid: int, dados: Cadastro, adm: Usuario = Depends(exige('admin'))):
    if tipo not in ('setores', 'cargos') or rid < 0:
        raise HTTPException(404, 'Cadastro inexistente.')
    tabela, campo = ('setores_aux', 'setor') if tipo == 'setores' else ('cargos_aux', 'cargo')
    nome = dados.nome.strip()
    if not nome:
        raise HTTPException(400, 'Informe o nome.')
    with db.conexao() as c:
        q = c.cursor()
        q.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))',(tabela+':'+nome.casefold(),))
        q.execute(f'SELECT * FROM {tabela} WHERE id=%s FOR UPDATE', (rid,))
        rows = db.linhas(q)
        antes = rows[0] if rows else None
        if rid and not antes:
            raise HTTPException(404, 'Cadastro inexistente.')
        q.execute(f'SELECT id FROM {tabela} WHERE lower(trim({campo}))=lower(%s) AND id<>%s', (nome,rid))
        if q.fetchone():
            raise HTTPException(409, 'Nome já cadastrado. Revise os registros existentes.')
        if rid:
            q.execute(f'UPDATE {tabela} SET {campo}=%s,descricao=%s,ativo=%s,atualizado_em=now() WHERE id=%s',
                      (nome,dados.descricao,dados.ativo,rid))
        else:
            q.execute(f'INSERT INTO {tabela}({campo},descricao,ativo) VALUES(%s,%s,%s) RETURNING id', (nome,dados.descricao,dados.ativo))
            rid = q.fetchone()[0]
        if tipo == 'setores':
            q.execute('UPDATE setores_aux SET codigo=%s WHERE id=%s', (dados.codigo,rid))
        q.execute(f'UPDATE funcionarios SET {campo}=%s,atualizado_em=now() WHERE {campo}_id=%s', (nome,rid))
        invalidar(q, todos=True)
        auditar(q, adm.id,'alterar' if antes else 'criar',tabela,str(rid),antes,dados.model_dump())
    return {'id': rid}


class Referencias(BaseModel):
    setor_id: int | None
    cargo_id: int | None


@router.put('/funcionarios/{fid}/organizacao')
def referencias(fid: str, dados: Referencias, adm: Usuario = Depends(exige('admin'))):
    from ..organizacao.service import aplicar_referencias
    with db.conexao() as c:
        q = c.cursor()
        q.execute('SELECT id,setor_id,cargo_id FROM funcionarios WHERE id=%s FOR UPDATE', (fid,))
        antes = db.linhas(q)
        if not antes:
            raise HTTPException(404, 'Funcionário inexistente.')
        from ..organizacao.service import resolver
        aplicar_referencias(q,fid,resolver(q,dados.model_dump()),adm.id)
        auditar(q,adm.id,'alterar','funcionarios',fid,antes[0],dados.model_dump())
    return {'ok': True}
