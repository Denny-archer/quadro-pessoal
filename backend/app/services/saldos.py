"""Ajustes restritos de saldos, sem substituir o documento do funcionário."""
import datetime as dt
import json
import math
import re

from fastapi import HTTPException
from ..core import db
from ..acesso.service import invalidar
from .auditoria import auditar
from .mapping import linha_para_doc


def validar(dados):
    def erro(msg):
        raise HTTPException(400, msg)

    if set(dados) - {'abonos', 'periodosAquisitivos', 'revisao'}:
        erro('Este ajuste aceita somente abonos, períodos aquisitivos e revisão.')
    if not ({'abonos', 'periodosAquisitivos'} & dados.keys()):
        erro('Informe os saldos ou períodos a ajustar.')
    try:
        revisao = dt.datetime.fromisoformat(dados['revisao'].replace('Z', '+00:00'))
        if revisao.tzinfo is None:
            raise ValueError()
    except (KeyError, ValueError, TypeError, AttributeError):
        erro('Informe a revisão recebida na ficha do funcionário.')

    def numero(v, campo, nullable=False):
        if nullable and v is None:
            return
        if type(v) not in (int, float) or (type(v) is float and not math.isfinite(v)) or not 0 <= v <= 1000000:
            erro(f'{campo}: informe um número finito entre zero e 1000000.')

    def texto(v, campo):
        if not isinstance(v, str) or len(v) > 2000:
            erro(f'{campo}: texto inválido (máximo de 2000 caracteres).')

    def data(v, campo):
        try:
            if not isinstance(v, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', v):
                raise ValueError()
            return dt.date.fromisoformat(v)
        except ValueError:
            erro(f'{campo}: use uma data válida no formato AAAA-MM-DD.')

    if 'abonos' in dados:
        abonos = dados['abonos']
        if not isinstance(abonos, dict) or len(abonos) > 100:
            erro('Abonos deve conter saldos por referência.')
        for ref, saldo in abonos.items():
            if not re.fullmatch(r'(ref|folgas)\d{4}', ref) or not isinstance(saldo, dict):
                erro('Referência de abono inválida. Use refAAAA ou folgasAAAA.')
            if set(saldo) - {'usados', 'restantes', 'semData', 'semDireito', 'falta', 'cedido'}:
                erro(f'Campos desconhecidos no saldo {ref}.')
            for campo, valor in saldo.items():
                if campo == 'semData':
                    if not isinstance(valor, list) or len(valor) > 100:
                        erro('semData deve ser uma lista de anotações.')
                    for item in valor:
                        texto(item, 'semData')
                else:
                    numero(valor, f'{ref}.{campo}', nullable=campo == 'usados')
    if 'periodosAquisitivos' in dados:
        periodos = dados['periodosAquisitivos']
        if not isinstance(periodos, list) or len(periodos) > 200:
            erro('Períodos aquisitivos deve ser uma lista de até 200 períodos.')
        vistos = set()
        for p in periodos:
            if not isinstance(p, dict) or set(p) - {'inicio', 'fim', 'limite', 'direito', 'programadoPlanilha', 'abonoSemData', 'pendencia', 'analise', 'obs', 'aba'}:
                erro('Campos desconhecidos no período aquisitivo.')
            inicio, fim = data(p.get('inicio'), 'Início'), data(p.get('fim'), 'Fim')
            if fim < inicio:
                erro('O fim do período não pode anteceder o início.')
            if inicio in vistos:
                erro('Há períodos duplicados com o mesmo início.')
            vistos.add(inicio)
            if p.get('limite'):
                if data(p['limite'], 'Limite') < inicio:
                    erro('O limite não pode anteceder o início do período.')
            elif 'limite' in p and p['limite'] != '':
                erro('Limite deve ser uma data ou vazio.')
            for campo in ('direito', 'programadoPlanilha', 'abonoSemData'):
                if campo in p:
                    numero(p[campo], campo)
            for campo in ('pendencia', 'analise', 'obs', 'aba'):
                if campo in p:
                    texto(p[campo], campo)
    return revisao


def ajustar(fid, dados, usuario):
    revisao = validar(dados)
    campos = {'abonos': 'abonos', 'periodosAquisitivos': 'periodos_aquisitivos'}
    with db.conexao() as cn:
        q = cn.cursor()
        q.execute('SELECT * FROM funcionarios WHERE id=%s FOR UPDATE', (fid,))
        rows = db.linhas(q)
        if not rows:
            raise HTTPException(404, 'Funcionário inexistente.')
        linha = rows[0]
        if linha['atualizado_em'] != revisao:
            raise HTTPException(409, 'A ficha foi atualizada por outra pessoa. Reabra o ajuste e confira os valores antes de salvar.')
        chaves = [k for k in campos if k in dados]
        sets = ', '.join(f'{campos[k]}=%s' for k in chaves)
        q.execute(f'UPDATE funcionarios SET {sets}, atualizado_em=clock_timestamp() WHERE id=%s RETURNING *',
                  (*[json.dumps(dados[k], ensure_ascii=False, allow_nan=False) for k in chaves], fid))
        depois = linha_para_doc('funcionarios', db.linhas(q)[0])
        antes = linha_para_doc('funcionarios', linha)
        auditar(q, usuario.id, 'alterar', 'funcionarios', fid,
                {k: antes.get(k) for k in chaves}, {k: depois.get(k) for k in chaves})
        invalidar(q, dominio='rh', funcionarios=[fid], setores=[linha['setor_id']])
    return depois
