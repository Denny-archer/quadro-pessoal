from fastapi import HTTPException
from ..acesso.service import invalidar


def resolver(cur, doc, existente=None):
    """Não descarta IDs em gravações antigas; textos ambíguos exigem conferência."""
    out = {}
    for campo, tabela in (('setor','setores_aux'), ('cargo','cargos_aux')):
        chave = campo + '_id'
        camel = campo + 'Id'
        if chave in doc or camel in doc:
            rid = doc.get(chave, doc.get(camel))
            if (existente and str(rid or '')==str(existente.get(chave) or '') and campo in doc
                    and str(doc[campo] or '').strip()!=(existente.get(campo) or '')):
                out.update(resolver(cur,{campo:doc[campo]},existente))
                continue
            if rid in ('', None):
                out[chave] = None
                out[campo] = ''
                continue
            cur.execute(f'SELECT id,{campo} FROM {tabela} WHERE id=%s AND ativo', (rid,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(400, f'{campo.capitalize()} inexistente ou inativo.')
            out[chave], out[campo] = row
        elif campo in doc:
            texto = str(doc[campo] or '').strip()
            if not texto:
                out[chave], out[campo] = None, ''
                continue
            if existente and texto == (existente.get(campo) or ''):
                out[chave], out[campo] = existente.get(chave), texto
                continue
            cur.execute(f'SELECT id,{campo} FROM {tabela} WHERE {campo}=%s AND ativo', (texto,))
            rows = cur.fetchall()
            if len(rows) != 1:
                raise HTTPException(400, f'Cadastre ou confira o {campo} na administração antes de gravar.')
            out[chave], out[campo] = rows[0]
        elif existente:
            out[chave], out[campo] = existente.get(chave), existente.get(campo) or ''
    return out


NAO_INFORMADO=object()


def aplicar_referencias(cur, fid, valores, autor=None, anterior=NAO_INFORMADO):
    cur.execute('SELECT setor_id,cargo_id,setor,cargo FROM funcionarios WHERE id=%s FOR UPDATE', (fid,))
    row = cur.fetchone()
    if not row:
        return
    antigo = row[0] if anterior is NAO_INFORMADO else anterior
    for campo in ('setor','cargo'):
        chave = campo + '_id'
        if chave in valores:
            cur.execute(f'UPDATE funcionarios SET {chave}=%s,{campo}=%s,atualizado_em=now() WHERE id=%s',
                        (valores[chave], valores.get(campo) or '', fid))
    novo = valores.get('setor_id', row[0])
    if antigo != novo:
        cur.execute('UPDATE funcionario_lotacoes SET fim=now() WHERE funcionario_id=%s AND fim IS NULL', (fid,))
        if novo is not None:
            cur.execute('INSERT INTO funcionario_lotacoes(funcionario_id,setor_id,usuario_id) VALUES(%s,%s,%s)', (fid,novo,autor))
    invalidar(cur, funcionarios=[fid],setores=[antigo,novo])
