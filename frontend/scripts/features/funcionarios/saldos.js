import { req, db } from '../../core/api.js';
import { S } from '../../core/estado.js';
import { dialogo, esc, toast, errMsg } from '../../core/dom.js';
import { ABONO_REF } from '../abonos.js';

export async function salvarSaldos(f, campos) {
  const salvo = await req('PUT', `/api/dados/funcionarios/${encodeURIComponent(f.id)}/saldos`, {
    ...campos, revisao: f.atualizadoEm
  });
  const i = S.func.findIndex(x => x.id === f.id);
  if (i !== -1) S.func[i] = salvo;
  // A gravação confirmada não deve parecer falha se a consulta seguinte cair.
  db.recarregar('funcionarios').catch(() => toast('Saldos salvos. Não foi possível atualizar a lista; recarregue a página.'));
  return salvo;
}

const numerosAbono = [['usados', 'Dias usados'], ['restantes', 'Dias restantes'], ['semDireito', 'Sem direito'], ['falta', 'Perdidos por falta'], ['cedido', 'Dias cedidos']];
const camposPeriodo = [['inicio', 'Início', 'date'], ['fim', 'Fim', 'date'], ['limite', 'Limite para gozo', 'date'], ['direito', 'Dias de direito', 'number'], ['programadoPlanilha', 'Dias programados na origem', 'number'], ['abonoSemData', 'Dias vendidos sem data', 'number'], ['pendencia', 'Pendência', 'text'], ['analise', 'Análise', 'text'], ['aba', 'Referência da origem', 'text'], ['obs', 'Observações', 'text']];
const campo = (k, label, tipo, valor, required = false) => `<label>${label}<input data-campo="${k}" type="${tipo}" value="${esc(valor ?? '')}" ${required ? 'required' : ''} ${tipo === 'number' ? 'min="0" step="any"' : tipo === 'text' ? 'maxlength="2000"' : ''}></label>`;

export function abrirSaldos(id) {
  if (document.documentElement.dataset.lancarRh !== 'true') return;
  const original = S.func.find(f => f.id === id);
  if (!original) return;
  const f = structuredClone(original);
  const refs = new Map(ABONO_REF.map(([k, rot]) => [k, rot]));
  Object.keys(f.abonos || {}).forEach(k => { if (!refs.has(k)) refs.set(k, k); });
  const d = dialogo('dlg-saldos', `<form class="kd saldos-form">
    <div class="kd-head"><div><div class="eyebrow">${esc(f.nome)}</div><h2>Ajustar saldos e períodos</h2></div><button class="icon-btn" type="button" data-close aria-label="Fechar">×</button></div>
    <p class="hint">Ajuste os saldos de referência e os períodos aquisitivos. Férias e afastamentos devem ser registrados em Lançamentos.</p>
    <h3>Abonos e folgas</h3><div data-abonos></div>
    <div class="saldos-referencia"><label>Nova referência<input name="novaReferencia" placeholder="ref2027 ou folgas2027" maxlength="10"></label><button class="btn" type="button" data-add-ref>Adicionar referência</button></div>
    <div class="panel-head"><h3>Períodos aquisitivos</h3><button class="btn small" type="button" data-add-periodo>Adicionar período</button></div>
    <div data-periodos></div>
    <footer class="saldos-acoes"><p class="err" role="alert" data-erro></p><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar ajustes</button></footer>
  </form>`);
  const abonos = d.querySelector('[data-abonos]'), periodos = d.querySelector('[data-periodos]');
  const erro = d.querySelector('[data-erro]');
  function adicionarAbono(ref, rot, saldo) {
    const box = document.createElement('fieldset');
    box.className = 'saldos-grupo'; box.dataset.ref = ref;
    box.innerHTML = `<legend>${esc(rot)}</legend><label class="saldos-check"><input type="checkbox" data-incluir ${saldo ? 'checked' : ''}>Manter esta referência</label>
      <div class="saldos-campos">${numerosAbono.map(([k, label]) => campo(k, label, 'number', saldo?.[k])).join('')}
      <label class="saldos-largo">Anotações sem data (uma por linha)<textarea data-campo="semData" rows="2">${esc((saldo?.semData || []).join('\n'))}</textarea></label></div>`;
    const habilitar = () => {
      const incluir = box.querySelector('[data-incluir]').checked;
      box.querySelector('.saldos-campos').hidden = !incluir;
      box.querySelectorAll('[data-campo]').forEach(el => el.disabled = !incluir);
    };
    box.querySelector('[data-incluir]').addEventListener('change', habilitar); habilitar(); abonos.append(box);
  }
  function adicionarPeriodo(p = {}) {
    const box = document.createElement('fieldset'); box.className = 'saldos-grupo';
    box.innerHTML = `<legend>Período aquisitivo</legend><div class="saldos-campos">${camposPeriodo.map(([k, label, tipo]) => campo(k, label, tipo, p[k], ['inicio', 'fim'].includes(k))).join('')}</div><button class="btn small danger" type="button" data-remover>Remover período</button>`;
    box.querySelector('[data-remover]').addEventListener('click', () => box.remove()); periodos.append(box);
  }
  refs.forEach((rot, ref) => adicionarAbono(ref, rot, f.abonos?.[ref]));
  (f.periodosAquisitivos || []).forEach(adicionarPeriodo);
  d.querySelector('[data-add-periodo]').onclick = () => { adicionarPeriodo(); periodos.lastElementChild.querySelector('input').focus(); };
  d.querySelector('[data-add-ref]').onclick = () => {
    const input = d.querySelector('[name="novaReferencia"]'), ref = input.value.trim();
    if (!/^(ref|folgas)\d{4}$/.test(ref)) { erro.textContent = 'Use refAAAA ou folgasAAAA para a referência.'; return; }
    if (refs.has(ref)) { erro.textContent = 'Essa referência já está listada.'; return; }
    refs.set(ref, ref); adicionarAbono(ref, ref, {}); input.value = ''; erro.textContent = '';
  };
  d.querySelector('form').onsubmit = async e => {
    e.preventDefault();
    if (document.documentElement.dataset.lancarRh !== 'true') return;
    const novosAbonos = {};
    abonos.querySelectorAll('[data-ref]').forEach(box => {
      if (!box.querySelector('[data-incluir]').checked) return;
      const ref = box.dataset.ref, saldo = { ...(f.abonos?.[ref] || {}) };
      box.querySelectorAll('[data-campo]').forEach(el => {
        const k = el.dataset.campo;
        if (k === 'semData') {
          if (el.value || k in saldo) saldo[k] = el.value.split('\n').map(s => s.trim()).filter(Boolean);
        } else if (el.value !== '') saldo[k] = Number(el.value);
        else if (k === 'usados' && saldo[k] === null) saldo[k] = null;
        else delete saldo[k];
      });
      novosAbonos[ref] = saldo;
    });
    const novosPeriodos = [...periodos.children].map(box => Object.fromEntries([...box.querySelectorAll('[data-campo]')].filter(el => el.value !== '').map(el => [el.dataset.campo, el.type === 'number' ? Number(el.value) : el.value])));
    const campos = {};
    if (JSON.stringify(novosAbonos) !== JSON.stringify(f.abonos || {})) campos.abonos = novosAbonos;
    if (JSON.stringify(novosPeriodos) !== JSON.stringify(f.periodosAquisitivos || [])) campos.periodosAquisitivos = novosPeriodos;
    if (!Object.keys(campos).length) { erro.textContent = 'Nenhum ajuste informado.'; return; }
    const btn = d.querySelector('[type="submit"]'); btn.disabled = true; erro.textContent = '';
    try { await salvarSaldos(f, campos); d.close(); toast('Saldos e períodos atualizados.'); }
    catch (x) { erro.textContent = errMsg(x); }
    finally { btn.disabled = false; }
  };
  d.showModal();
}
