/** Funcionalidade: beneficios. */
import { naoUtil, overlap, covers, noQuadro, byName } from "../core/colecoes.js";
import { iso, parse, DAY, fmt, pad } from "../core/datas.js";
import { S } from "../core/estado.js";
import { temContrato } from "./contratos.js";
import { modoDia } from "../core/jornada.js";
import { r2, brl } from "../core/formatacao.js";
import { extrasNoMes, totalExtras, nomeExtra, quandoExtra } from "./beneficios-extras.js";
import { MESES, TIPOS, VINC_TAG } from "../core/constantes.js";
import { esc } from "../core/dom.js";
function diasUteisMes(y, m) {
  const out = [],
    nd = new Date(y, m + 1, 0).getDate();
  for (let d = 1; d <= nd; d++) {
    const dt = new Date(y, m, d);
    if (!naoUtil(dt)) out.push(iso(dt));
  }
  return out;
}
function calcBen(f, y, m) {
  const cfg = S.cfg,
    uteis = diasUteisMes(y, m),
    nU = uteis.length || 1,
    temp = temContrato(f);
  // proporcional à admissão / início e término do contrato
  const ini = [f.admissao, temp ? f.contratoInicio : ""].filter(Boolean).sort().pop() || "0000-00-00";
  const fim = temp && f.contratoFim ? f.contratoFim : "9999-12-31";
  const eleg = uteis.filter(d => d >= ini && d <= fim);
  const mine = S.ocs.filter(o => o.func === f.id);

  // auxílio-alimentação: desconta dias úteis de viagem/atestado acima do limite
  const aaBase = Number(cfg.aa) * (temp ? Number(cfg.pctTemp) / 100 : 1),
    aaDia = aaBase / nU;
  const aaDias = new Map();
  for (const o of mine) {
    if (o.tipo !== "viagem" && o.tipo !== "atestado") continue;
    const dur = overlap(o, parse(o.inicio), parse(o.fim || o.inicio));
    if (dur <= Number(cfg.limite)) continue;
    for (const ds of eleg) {
      if (!covers(o, ds) || aaDias.has(ds)) continue;
      if (cfg.modo === "excedente" && Math.round((parse(ds) - parse(o.inicio)) / DAY) + 1 <= Number(cfg.limite)) continue;
      aaDias.set(ds, o);
    }
  }
  const aaOcs = [...new Set(aaDias.values())];

  // auxílio-transporte: desconta home office integral, atestado e viagem (e férias, se configurado)
  const usa = !!f.usaTransporte && Number(f.valorTransporte) > 0;
  const atDia = !usa ? 0 : cfg.atModo === "diario" ? Number(f.valorTransporte) : Number(f.valorTransporte) / nU;
  const atMot = {
    ho: 0,
    atestado: 0,
    viagem: 0,
    ferias: 0
  };
  let atN = 0;
  if (usa) for (const ds of eleg) {
    const oc = mine.find(o => covers(o, ds) && (o.tipo === "atestado" && !o.parcial || o.tipo === "viagem" || cfg.atFerias && o.tipo === "ferias"));
    const mot = oc ? oc.tipo : modoDia(f, parse(ds).getDay()) === "H" ? "ho" : null;
    if (mot) {
      atMot[mot]++;
      atN++;
    }
  }
  const aaBruto = r2(aaDia * eleg.length),
    aaDesc = r2(aaDia * aaDias.size);
  const atBruto = r2(atDia * eleg.length),
    atDesc = r2(atDia * atN);
  const aa = r2(aaBruto - aaDesc),
    at = r2(atBruto - atDesc);
  return {
    nU: uteis.length,
    eleg: eleg.length,
    ini,
    fim,
    temp,
    aaBase,
    aaDia,
    aaBruto,
    aaDescDias: aaDias.size,
    aaDesc,
    aa,
    aaOcs,
    usa,
    atDia,
    atBruto,
    atN,
    atMot,
    atDesc,
    at,
    extras: extrasNoMes(f, y, m),
    ex: totalExtras(f, y, m),
    total: r2(aa + at + totalExtras(f, y, m)),
    descontos: r2(aaDesc + atDesc)
  };
}
const benLista = (y, m) => S.func.filter(f => noQuadro(f)).sort(byName).map(f => ({
  f,
  b: calcBen(f, y, m)
})).filter(x => x.b.eleg > 0);
function memoria(f, b) {
  const mes = `${MESES[S.m]}`;
  const prop = b.eleg < b.nU ? ` Proporcional: ${b.eleg} de ${b.nU} dias úteis (${b.ini > "0000-00-00" && b.ini >= iso(new Date(S.y, S.m, 1)) ? "início em " + fmt(b.ini) : ""}${b.fim < "9999-12-31" && b.fim <= iso(new Date(S.y, S.m + 1, 0)) ? " término em " + fmt(b.fim) : ""}).` : "";
  let aa = `${brl(b.aaBase)}${b.temp ? ` (${S.cfg.pctTemp}% de ${brl(S.cfg.aa)})` : ""} ÷ ${b.nU} dias úteis = <strong>${brl(b.aaDia)}/dia</strong>.${prop}`;
  if (b.aaDescDias) {
    aa += ` Desconto: ${b.aaDescDias} ${b.aaDescDias === 1 ? "dia" : "dias"} × ${brl(b.aaDia)} = <span class="desc">−${brl(b.aaDesc)}</span>, por ` + b.aaOcs.map(o => `${TIPOS[o.tipo].nome.toLowerCase()} de ${fmt(o.inicio)} a ${fmt(o.fim)} (${overlap(o, parse(o.inicio), parse(o.fim))} dias)`).join("; ") + ".";
  } else aa += ` Sem viagem ou atestado acima de ${S.cfg.limite} dias em ${mes}: nada a descontar.`;
  let at;
  if (!f.usaTransporte) at = "Não utiliza auxílio-transporte.";else if (!b.usa) at = `<span class="warn u-color-var-c-abono" >Marcado como usuário, mas sem valor cadastrado — edite o cadastro.</span>`;else {
    at = S.cfg.atModo === "diario" ? `Valor diário de <strong>${brl(b.atDia)}</strong> × ${b.eleg} dias úteis = ${brl(b.atBruto)}.` : `${brl(f.valorTransporte)} ÷ ${b.nU} dias úteis = <strong>${brl(b.atDia)}/dia</strong>.${prop}`;
    const partes = [["ho", "de home office integral"], ["atestado", "de atestado"], ["viagem", "de viagem"], ["ferias", "de férias"]].filter(([k]) => b.atMot[k]).map(([k, t]) => `${b.atMot[k]} ${t}`);
    at += partes.length ? ` Desconto: ${partes.join(", ")} = ${b.atN} ${b.atN === 1 ? "dia" : "dias"} × ${brl(b.atDia)} = <span class="desc">−${brl(b.atDesc)}</span>.` : " Nenhum dia a descontar.";
  }
  return `<div class="memo-grid"><div><h4>Auxílio-alimentação</h4><p>${aa}</p><p><strong>A pagar: ${brl(b.aa)}</strong></p></div><div><h4>Auxílio-transporte</h4><p>${at}</p><p><strong>A pagar: ${brl(b.at)}</strong></p></div></div>`;
}
function viewBen() {
  const regras = `<button class="btn small" type="button" data-act="regras">Regras de cálculo</button>`;
  if (S.mode === "ano") {
    const linhas = S.func.filter(f => noQuadro(f)).sort(byName).map(f => {
      let aa = 0,
        at = 0,
        ex = 0,
        desc = 0;
      for (let m = 0; m < 12; m++) {
        const b = calcBen(f, S.y, m);
        aa += b.aa;
        at += b.at;
        ex += b.ex;
        desc += b.descontos;
      }
      return {
        f,
        aa: r2(aa),
        at: r2(at),
        ex: r2(ex),
        desc: r2(desc)
      };
    }).filter(x => x.aa || x.at || x.ex);
    const T = linhas.reduce((s, x) => ({
      aa: s.aa + x.aa,
      at: s.at + x.at,
      ex: s.ex + x.ex,
      desc: s.desc + x.desc
    }), {
      aa: 0,
      at: 0,
      ex: 0,
      desc: 0
    });
    let h = benKpis(T.aa, T.at, T.desc, `em ${S.y}`, T.ex);
    h += `<section class="panel"><div class="panel-head"><h2>Benefícios de ${S.y} por funcionário</h2>${regras}</div>`;
    if (!linhas.length) return h + `<div class="empty">Nenhum funcionário ativo.</div></section>`;
    h += `<div class="scroll"><table class="data"><thead><tr><th>Funcionário</th><th class="r">Alimentação</th><th class="r">Transporte</th><th class="r">Adicionais</th><th class="r">Total pago</th><th class="r">Descontado</th></tr></thead><tbody>`;
    h += linhas.map(x => `<tr class="click" data-ficha="${x.f.id}"><td><strong>${esc(x.f.nome)}</strong>${VINC_TAG[x.f.vinculo] ? `<span class="vinc-tag">${VINC_TAG[x.f.vinculo]}</span>` : ""}</td><td class="money">${brl(x.aa)}</td><td class="money">${brl(x.at)}</td><td class="money">${x.ex ? brl(x.ex) : "—"}</td><td class="money pagar">${brl(x.aa + x.at + x.ex)}</td><td class="money desc">${x.desc ? "−" + brl(x.desc) : "—"}</td></tr>`).join("");
    h += `</tbody><tfoot><tr><th>Total</th><th class="money">${brl(T.aa)}</th><th class="money">${brl(T.at)}</th><th class="money">${brl(T.ex)}</th><th class="money">${brl(T.aa + T.at + T.ex)}</th><th class="money">${T.desc ? "−" + brl(T.desc) : "—"}</th></tr></tfoot></table></div></section>`;
    return h;
  }
  const lista = benLista(S.y, S.m),
    uteis = diasUteisMes(S.y, S.m);
  const nFer = (S.cfg.feriados || []).filter(d => d.startsWith(`${S.y}-${pad(S.m + 1)}`) && ![0, 6].includes(parse(d).getDay())).length;
  const T = lista.reduce((s, {
    b
  }) => ({
    aa: s.aa + b.aa,
    at: s.at + b.at,
    ex: s.ex + b.ex,
    desc: s.desc + b.descontos,
    aaB: s.aaB + b.aaBruto,
    atB: s.atB + b.atBruto,
    aaD: s.aaD + b.aaDesc,
    atD: s.atD + b.atDesc
  }), {
    aa: 0,
    at: 0,
    ex: 0,
    desc: 0,
    aaB: 0,
    atB: 0,
    aaD: 0,
    atD: 0
  });
  let h = benKpis(T.aa, T.at, T.desc, `em ${MESES[S.m]}`, T.ex);
  h += `<section class="panel"><div class="panel-head"><div><h2>Benefícios de ${MESES[S.m]} de ${S.y}</h2><div class="hint">${uteis.length} dias úteis${nFer ? ` (${nFer} ${nFer === 1 ? "feriado descontado" : "feriados descontados"})` : ""} · alimentação ${brl(S.cfg.aa)} · estagiário/aprendiz ${S.cfg.pctTemp}% · clique na linha para ver o cálculo</div></div>${regras}</div>`;
  if (!lista.length) return h + `<div class="empty">Nenhum funcionário ativo neste mês.</div></section>`;
  h += `<div class="scroll"><table class="data"><thead>
    <tr><th rowspan="2">Funcionário</th><th class="grp" colspan="3">Auxílio-alimentação</th><th class="grp" colspan="3">Auxílio-transporte</th><th rowspan="2" class="r">Adicionais</th><th rowspan="2" class="r">Total</th></tr>
    <tr><th class="r">Base</th><th class="r">Desconto</th><th class="r">A pagar</th><th class="r">Base</th><th class="r">Desconto</th><th class="r">A pagar</th></tr></thead><tbody>`;
  for (const {
    f,
    b
  } of lista) {
    const open = S.benAbertos.has(f.id);
    const dd = (v, n) => v ? `<span class="desc">−${brl(v)}</span><br><span class="hint">${n} ${n === 1 ? "dia" : "dias"}</span>` : `<span class="hint">—</span>`;
    h += `<tr class="click" data-ben="${f.id}" aria-expanded="${open}"><td><span class="caret" aria-hidden="true">›</span> <strong>${esc(f.nome)}</strong>${VINC_TAG[f.vinculo] ? `<span class="vinc-tag">${VINC_TAG[f.vinculo]}</span>` : ""}${b.eleg < b.nU ? `<br><span class="hint">proporcional: ${b.eleg}/${b.nU} dias</span>` : ""}</td>
      <td class="money">${brl(b.aaBruto)}</td><td class="money">${dd(b.aaDesc, b.aaDescDias)}</td><td class="money pagar">${brl(b.aa)}</td>
      <td class="money">${b.usa ? brl(b.atBruto) : `<span class="hint">${f.usaTransporte ? "sem valor" : "não utiliza"}</span>`}</td><td class="money">${b.usa ? dd(b.atDesc, b.atN) : ""}</td><td class="money pagar">${b.usa ? brl(b.at) : "—"}</td>
      <td class="money">${b.ex ? `${brl(b.ex)}<br><span class="hint">${esc(b.extras.map(nomeExtra).join(", "))}</span>` : '<span class="hint">—</span>'}</td>
      <td class="money pagar">${brl(b.total)}</td></tr>`;
    if (open) h += `<tr class="memo"><td colspan="9">${memoria(f, b)}${b.extras.length ? `<div class="u-margin-top-10px"><h4 class="u-margin-0-0-4px">Benefícios adicionais</h4>${b.extras.map(x => `${esc(nomeExtra(x))}: <strong>${brl(x.valor)}</strong> <span class="hint">(${esc(quandoExtra(x))})</span>`).join("<br>")}</div>` : ""}</td></tr>`;
  }
  h += `</tbody><tfoot><tr><th>Total</th><th class="money">${brl(T.aaB)}</th><th class="money">${T.aaD ? "−" + brl(T.aaD) : "—"}</th><th class="money">${brl(T.aa)}</th><th class="money">${brl(T.atB)}</th><th class="money">${T.atD ? "−" + brl(T.atD) : "—"}</th><th class="money">${brl(T.at)}</th><th class="money">${brl(T.ex)}</th><th class="money">${brl(T.aa + T.at + T.ex)}</th></tr></tfoot></table></div></section>`;
  return h;
}
function benKpis(aa, at, desc, quando, ex = 0) {
  return `<div class="kpis">
    <div class="kpi today"><span class="label">Total de benefícios</span><span class="value u-font-size-26px" >${brl(aa + at + ex)}</span><span class="sub">${quando}</span></div>
    <div class="kpi u-k-var-c-ferias" ><span class="label">Auxílio-alimentação</span><span class="value u-font-size-24px" >${brl(aa)}</span><span class="sub">a pagar ${quando}</span></div>
    <div class="kpi u-k-var-c-viagem" ><span class="label">Auxílio-transporte</span><span class="value u-font-size-24px" >${brl(at)}</span><span class="sub">a pagar ${quando}</span></div>
    <div class="kpi u-k-var-c-abono" ><span class="label">Benefícios adicionais</span><span class="value u-font-size-24px" >${brl(ex)}</span><span class="sub">creche, Natal, funeral e outros ${quando}</span></div>
    <div class="kpi u-k-var-c-atestado" ><span class="label">Descontos aplicados</span><span class="value u-font-size-24px" >${brl(desc)}</span><span class="sub">afastamentos e home office</span></div>
  </div>`;
}
export { diasUteisMes, calcBen, benLista, memoria, viewBen, benKpis };
