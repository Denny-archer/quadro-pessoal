"""Contrato enxuto de apuração: o ponto é a fonte dos totais oficiais."""
from __future__ import annotations

import datetime as dt
import json
from typing import Literal

from fastapi import HTTPException
from ..schemas.ponto import Registro, Resumo, LoteResumos, Sinal

from ..core import db
from . import presenca


NORMALIZADA = "coalesce(nullif(ltrim(lower(trim(matricula)), '0'), ''), '0')"


def vincular(cur):
    """Matrícula identifica o primeiro vínculo; o ID externo mantém esse vínculo estável."""
    cur.execute(f"""INSERT INTO ponto_vinculos (sistema, colaborador_id, funcionario_id)
        SELECT r.sistema, r.colaborador_id, min(f.id)
        FROM ponto_resumos r JOIN funcionarios f
          ON coalesce(nullif(ltrim(lower(trim(r.matricula)), '0'), ''), '0') =
             coalesce(nullif(ltrim(lower(trim(f.matricula)), '0'), ''), '0')
        WHERE nullif(trim(r.matricula), '') IS NOT NULL AND nullif(trim(f.matricula), '') IS NOT NULL
        GROUP BY r.sistema, r.colaborador_id HAVING count(DISTINCT f.id) = 1
        ORDER BY r.sistema, r.colaborador_id ON CONFLICT DO NOTHING""")
    cur.execute("""UPDATE ponto_resumos r SET funcionario_id=v.funcionario_id
        FROM ponto_vinculos v WHERE r.sistema=v.sistema AND r.colaborador_id=v.colaborador_id
        AND r.funcionario_id IS DISTINCT FROM v.funcionario_id""")


def receber(lote, chave_id):
    aceitos = repetidos = antigos = 0
    with db.conexao() as c:
        cur = c.cursor()
        # Ordem comum evita deadlocks entre lotes simultâneos.
        for r in sorted(lote.resumos, key=lambda x: (x.sistema, x.colaborador_id, x.data, x.versao)):
            chave = (r.sistema, r.colaborador_id, r.data)
            cur.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))', ('resumo:' + '|'.join(map(str, chave)),))
            cur.execute('SELECT versao, dados FROM ponto_resumos WHERE sistema=%s AND colaborador_id=%s AND data=%s', chave)
            anterior = cur.fetchone()
            dados = r.model_dump(mode='json')
            if anterior:
                if r.versao < anterior[0]:
                    antigos += 1
                    continue
                if r.versao == anterior[0]:
                    if dados != anterior[1]:
                        raise HTTPException(409, 'A mesma versão contém dados diferentes. Gere uma nova versão no ponto.')
                    repetidos += 1
                    continue
            cur.execute("""INSERT INTO ponto_resumos (sistema, colaborador_id, data, versao, matricula, dados)
                VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (sistema,colaborador_id,data)
                DO UPDATE SET versao=EXCLUDED.versao, matricula=EXCLUDED.matricula, dados=EXCLUDED.dados, recebido_em=now()""",
                (*chave, r.versao, r.matricula, json.dumps(dados, ensure_ascii=False)))
            aceitos += 1
        vincular(cur)
        cur.execute('UPDATE integracao_chaves SET ultimo_uso=now() WHERE id=%s', (chave_id,))
        cur.execute('SELECT DISTINCT colaborador_id FROM ponto_resumos WHERE funcionario_id IS NULL AND colaborador_id=ANY(%s)',
                    ([r.colaborador_id for r in lote.resumos],))
        sem_vinculo = sorted(x[0] for x in cur.fetchall())
    return {'recebidos': len(lote.resumos), 'aceitos': aceitos, 'repetidos': repetidos, 'antigos': antigos, 'sem_vinculo': sem_vinculo}


def sinalizar(sinal, chave_id):
    if sinal.ultima_entrega and (sinal.ultima_entrega.tzinfo is None or sinal.ultima_entrega > dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=10)):
        raise HTTPException(422, 'ultima_entrega precisa de fuso e não pode estar no futuro.')
    with db.conexao() as c:
        cur = c.cursor()
        cur.execute("""INSERT INTO ponto_sincronizacao (sistema, pendentes, ultima_entrega) VALUES (%s,%s,%s)
            ON CONFLICT (sistema) DO UPDATE SET sinal_em=now(), pendentes=EXCLUDED.pendentes,
            ultima_entrega=EXCLUDED.ultima_entrega""", (sinal.sistema, sinal.pendentes, sinal.ultima_entrega))
        cur.execute('UPDATE integracao_chaves SET ultimo_uso=now() WHERE id=%s', (chave_id,))
    return {'ok': True}


def sincronizacao():
    sinais = db.consultar('SELECT * FROM ponto_sincronizacao ORDER BY sistema')
    agora = dt.datetime.now(dt.timezone.utc)
    if not sinais:
        return {'estado': 'sem_sinal', 'pendentes': None, 'sinal_em': None}
    s = sinais[0]
    estado = 'atrasada' if (agora - s['sinal_em']).total_seconds() > 120 else ('pendente' if s['pendentes'] else 'em_dia')
    return {'estado': estado, 'pendentes': s['pendentes'], 'sinal_em': s['sinal_em'].isoformat()}


def completar_quadro(out, funcs, ocorrencias, data, agora, feriados, tolerancia, padrao):
    rows = db.consultar('SELECT funcionario_id, dados, recebido_em FROM ponto_resumos WHERE data=%s AND funcionario_id=ANY(%s::text[])', (data,[f['id'] for f in funcs]))
    por_func = {f['id']: f for f in funcs}
    pessoas = {p['id']: p for p in out['pessoas']}
    for row in rows:
        fid, d = row['funcionario_id'], row['dados']
        if fid not in pessoas:
            continue
        marcacoes = [{'momento': dt.datetime.fromisoformat(m['momento']), 'tipo': m['acao'], 'local': m['local']}
                     for m in d['marcacoes']]
        ocs = [o for o in ocorrencias if o['func'] == fid]
        p = presenca.situacao(por_func[fid], data, agora, marcacoes, ocs, feriados, tolerancia, padrao)
        p['rotulo'] = presenca.STATUS[p['status']][0]
        p['apuracao'] = {k: d[k] for k in ('segundos_registrados', 'segundos_presenciais', 'segundos_remotos',
            'segundos_nao_classificados', 'segundos_oficiais', 'carga_esperada_segundos', 'saldo_segundos', 'situacao_ponto', 'pendencias')}
        p['apuracao']['gerado_em'] = d['gerado_em']
        p['apuracao']['versao'] = d['versao']
        # Contador em curso é estimativa e nunca altera as horas oficiais.
        estimativa = 0
        if data == agora.astimezone(presenca.FUSO).date() and len(marcacoes) % 2:
            estimativa = max(0, int((agora - marcacoes[-1]['momento']).total_seconds()))
        p['apuracao']['segundos_periodo_aberto_estimados'] = estimativa
        pessoas[fid] = p
    out['sincronizacao'] = sincronizacao()
    for p in pessoas.values():
        if p['status'] == 'sem_registro' and (out['sincronizacao']['estado'] != 'em_dia' or not p.get('apuracao')):
            p.update(status='aguardando_integracao', rotulo=presenca.STATUS['aguardando_integracao'][0],
                     alerta='Confirme o vínculo, a apuração e a sincronização antes de avaliar ausência de marcações.')
    out['pessoas'] = sorted(pessoas.values(), key=lambda p: p['nome'])
    out['resumo'] = {g: 0 for _, g in presenca.STATUS.values()}
    for p in out['pessoas']:
        out['resumo'][presenca.STATUS[p['status']][1]] += 1
    return out
