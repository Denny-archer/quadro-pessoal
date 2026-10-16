from dataclasses import dataclass
import os
from fastapi import HTTPException
from ..core import db


@dataclass(frozen=True)
class Contexto:
    usuario_id: int
    papel: str
    funcionario_id: str | None
    setores: tuple[int, ...]
    revisao: int

    @property
    def admin(self):
        return self.papel == 'admin'

    def funcionario_sql(self, alias='f'):
        if self.admin:
            return 'TRUE', ()
        return f'({alias}.id=%s OR {alias}.setor_id=ANY(%s::bigint[]))', (self.funcionario_id, list(self.setores))

    def demanda_sql(self, alias='d'):
        if self.admin:
            return 'TRUE', ()
        return f'({alias}.funcionario_id=%s OR {alias}.setor_id=ANY(%s::bigint[]))', (self.funcionario_id, list(self.setores))

    def gerir(self, setor_id):
        return self.admin or setor_id in self.setores


def contexto(u, cur=None):
    def ler(q):
        q.execute('''SELECT u.papel, uf.funcionario_id, coalesce(r.revisao,0) revisao
                     FROM usuarios u LEFT JOIN usuario_funcionario uf ON uf.usuario_id=u.id
                     LEFT JOIN acesso_revisoes r ON r.usuario_id=u.id WHERE u.id=%s AND u.ativo''', (u.id,))
        rows = db.linhas(q)
        if not rows:
            raise HTTPException(401, 'Sessão encerrada.')
        row = rows[0]
        q.execute('''SELECT g.setor_id FROM gestores_setores g JOIN setores_aux s ON s.id=g.setor_id
                     WHERE g.usuario_id=%s AND g.ativo AND s.ativo ORDER BY g.setor_id''', (u.id,))
        setores = tuple(x['setor_id'] for x in db.linhas(q)) if row['papel'] == 'gestor' else ()
        return Contexto(u.id, row['papel'], row['funcionario_id'], setores, row['revisao'])
    if cur is not None:
        return ler(cur)
    with db.conexao() as c:
        return ler(c.cursor())


def exigir_funcionario(u, fid):
    ctx = contexto(u)
    where, params = ctx.funcionario_sql()
    if not db.consultar(f'SELECT f.id FROM funcionarios f WHERE f.id=%s AND {where}', (fid, *params)):
        raise HTTPException(403, 'Funcionário fora do seu alcance.')


def invalidar(cur, *, funcionarios=(), setores=(), usuarios=(), todos=False):
    """Contadores por destinatário: locks em ordem fixa serializam a confirmação por usuário."""
    cur.execute('''SELECT u.id FROM usuarios u WHERE u.ativo AND
        (%s OR u.papel='admin' OR u.id=ANY(%s::bigint[])
         OR EXISTS(SELECT 1 FROM usuario_funcionario uf WHERE uf.usuario_id=u.id AND uf.funcionario_id=ANY(%s::text[]))
         OR (u.papel='gestor' AND EXISTS(SELECT 1 FROM gestores_setores g
             WHERE g.usuario_id=u.id AND g.ativo AND g.setor_id=ANY(%s::bigint[])))) ORDER BY u.id''',
        (todos, list(usuarios), [x for x in funcionarios if x], [x for x in setores if x]))
    ids = [x['id'] for x in db.linhas(cur)]
    for uid in ids:
        cur.execute('''INSERT INTO acesso_revisoes(usuario_id,revisao) VALUES(%s,1)
            ON CONFLICT(usuario_id) DO UPDATE SET revisao=acesso_revisoes.revisao+1,atualizado_em=now()''', (uid,))


def publico(u,ctx=None):
    ctx = ctx or contexto(u)
    return {'usuario': u.model_dump(), 'perfil': ctx.papel, 'funcionario_id': ctx.funcionario_id,
            'organizacao': {'nome':os.getenv('ORGANIZACAO_NOME','Conselho Federal de Fisioterapia e Terapia Ocupacional'),
                'sigla':os.getenv('ORGANIZACAO_SIGLA','COFFITO'), 'titulo':os.getenv('ORGANIZACAO_TITULO','COFFITO Pass'),
                'fuso':os.getenv('TZ','America/Sao_Paulo'),
                'logo_claro':os.getenv('ORGANIZACAO_LOGO_CLARO','/assets/images/logo-light.webp'),
                'logo_escuro':os.getenv('ORGANIZACAO_LOGO_ESCURO','/assets/images/logo-dark.webp')},
            'setores_geridos': list(ctx.setores), 'revisao_acesso': ctx.revisao,
            'capacidades': {'consultar_rh': True, 'alterar_rh': ctx.admin,
                'gerir_demandas': ctx.admin or bool(ctx.setores), 'manter_metas': ctx.admin,
                'manter_modelos': ctx.admin, 'administrar_acessos': ctx.admin}}
