import { classeCor } from "../core/cores.js";
/** Funcionalidade: ferias. */
import { S } from "../core/estado.js";
import { overlap, noQuadro } from "../core/colecoes.js";
import { parse, HOJE, hoje, DAY, fmt, iso } from "../core/datas.js";
import { esc } from "../core/dom.js";
const GRUPOS = [["efcom", "Efetivos com emprego em comissão"], ["effg", "Efetivos com função gratificada"], ["efsem", "Efetivos sem comissão ou FG"], ["comiss", "Emprego em comissão sem vínculo"], ["cedido", "Cedidos de outros órgãos"], ["estag", "Estagiários"], ["aprend", "Jovens aprendizes"], ["fora", "Cedidos a outros órgãos"], ["inativo", "Inativos"]];
function grupoDe(f) {
  if (f.situacao === "inativo") return "inativo";
  if (f.situacao === "cedido") return "fora";
  if (f.vinculo === "estagiario") return "estag";
  if (f.vinculo === "aprendiz") return "aprend";
  if (f.vinculo === "cedido") return "cedido";
  if (f.vinculo === "comissionado") return "comiss";
  return f.funcaoTipo === "fg" ? "effg" : f.funcao ? "efcom" : "efsem";
}
function controleFerias(f) {
  const pas = (f.periodosAquisitivos || []).slice().sort((a, b) => a.inicio.localeCompare(b.inicio));
  const mine = S.ocs.filter(o => o.func === f.id && o.tipo === "ferias");
  return pas.map(pa => {
    const parcelas = mine.filter(o => o.aquisitivo === pa.inicio).sort((a, b) => a.inicio.localeCompare(b.inicio));
    const dias = o => overlap(o, parse(o.inicio), parse(o.fim || o.inicio));
    const programado = parcelas.reduce((n, o) => n + dias(o), 0);
    const gozado = parcelas.filter(o => (o.fim || o.inicio) < HOJE).reduce((n, o) => n + dias(o), 0);
    const vendido = parcelas.reduce((n, o) => n + (Number(o.abonoPecuniario) || 0), 0) + (Number(pa.abonoSemData) || 0);
    const direito = Number(pa.direito) || 30;
    const aProgramar = Math.max(0, direito - programado - vendido);
    const diasLimite = pa.limite ? Math.round((parse(pa.limite) - hoje) / DAY) : null;
    let alerta = "";
    if (pa.pendencia) alerta = "agendar";else if (aProgramar > 0 && diasLimite != null && diasLimite < 0) alerta = "vencido";else if (aProgramar > 0 && diasLimite != null && diasLimite <= 120) alerta = "prazo";
    return {
      pa,
      parcelas,
      programado,
      gozado,
      vendido,
      direito,
      aProgramar,
      diasLimite,
      alerta
    };
  });
}
function fichaFerias(f) {
  const cf = controleFerias(f);
  if (!cf.length) return "";
  const rec = f.vinculo === "estagiario";
  let h = `<h3 class="u-margin-top-22px">Controle de ${rec ? "recesso" : "férias"} por período aquisitivo</h3>`;
  for (const c of cf) {
    const tag = c.alerta === "agendar" ? `<span class="prazo u-pc-var-c-abono" >${esc(c.pa.pendencia.toLowerCase())}</span>` : c.alerta === "vencido" ? `<span class="prazo u-pc-var-bad" >prazo vencido com ${c.aProgramar} dias a programar</span>` : c.alerta === "prazo" ? `<span class="prazo u-pc-var-c-abono" >${c.aProgramar} dias a programar até ${fmt(c.pa.limite)}</span>` : c.aProgramar ? `<span class="prazo u-pc-var-c-viagem" >${c.aProgramar} dias a programar</span>` : `<span class="prazo u-pc-var-good" >${c.direito} dias programados${c.programado + c.vendido > c.direito ? ` (${c.programado + c.vendido - c.direito} a mais)` : ""}</span>`;
    h += `<div class="feriasbox"><div class="fb-head"><div><strong>Aquisitivo ${fmt(c.pa.inicio)} a ${fmt(c.pa.fim)}</strong><div class="hint">gozar até ${fmt(c.pa.limite)}${c.pa.aba ? " · aba " + esc(c.pa.aba) : ""}${c.pa.analise ? " · " + esc(c.pa.analise) : ""}</div></div>${tag}</div>`;
    h += `<div class="fb-nums"><span><strong class="num">${c.gozado}</strong> gozados</span><span><strong class="num">${c.programado - c.gozado}</strong> programados</span><span><strong class="num">${c.vendido}</strong> vendidos</span><span><strong class="num">${c.aProgramar}</strong> a programar</span></div>`;
    if (c.parcelas.length) h += `<ul class="fb-list">${c.parcelas.map(o => `<li><button class="link" type="button" data-oc-open="${o.id}">${o.parcela ? o.parcela + " · " : ""}${fmt(o.inicio)} a ${fmt(o.fim)}</button> <span class="hint">${overlap(o, parse(o.inicio), parse(o.fim))} dias${o.abonoPecuniario ? ` + ${o.abonoPecuniario} vendidos` : ""}${o.avisoFerias ? " · aviso: " + esc(o.avisoFerias) : ""}${o.statusPlanilha && o.statusPlanilha !== "OK" ? " · " + esc(o.statusPlanilha) : ""}</span></li>`).join("")}</ul>`;
    if (c.pa.abonoSemData) h += `<div class="hint">${c.pa.abonoSemData} dias de abono pecuniário sem data${c.pa.obs ? " — " + esc(c.pa.obs) : ""}</div>`;
    h += `</div>`;
  }
  return h;
}
function painelFerias() {
  const fm = S.func.filter(noQuadro);
  const itens = [];
  for (const f of fm) for (const c of controleFerias(f)) if (c.alerta) itens.push({
    f,
    c
  });
  if (!itens.length) return "";
  const ord = {
    vencido: 0,
    prazo: 1,
    agendar: 2
  };
  itens.sort((a, b) => ord[a.c.alerta] - ord[b.c.alerta] || (a.c.pa.limite || "").localeCompare(b.c.pa.limite || ""));
  let h = `<section class="panel"><div class="panel-head"><h2>Férias: prazos e pendências</h2><span class="hint">${itens.length} ${itens.length === 1 ? "item" : "itens"}</span></div><ul class="list">`;
  h += itens.map(({
    f,
    c
  }) => `<li><button class="link" type="button" data-ficha="${f.id}">${esc(f.nome)}</button>${c.alerta === "agendar" ? `<span class="prazo u-pc-var-c-abono" >agendar em nov/2026</span>` : `<span class="prazo ${classeCor(c.alerta === "vencido" ? "var(--bad)" : "var(--c-abono)", "pc")}" >${c.aProgramar} dias a programar</span>`}
    <span class="meta">aquisitivo ${fmt(c.pa.inicio)} a ${fmt(c.pa.fim)} · gozar até ${fmt(c.pa.limite)}${c.diasLimite != null && c.alerta !== "agendar" ? ` (${c.diasLimite < 0 ? "vencido há " + -c.diasLimite : "faltam " + c.diasLimite} dias)` : ""}</span></li>`).join("");
  return h + `</ul></section>`;
}
function periodoAquisitivo(adm) {
  if (!adm) return null;
  const a = parse(adm);
  let ini = new Date(hoje.getFullYear(), a.getMonth(), a.getDate());
  if (ini > hoje) ini = new Date(hoje.getFullYear() - 1, a.getMonth(), a.getDate());
  if (ini < a) return null;
  const fim = new Date(ini.getFullYear() + 1, ini.getMonth(), ini.getDate() - 1);
  return [iso(ini), iso(fim)];
}
export { GRUPOS, grupoDe, controleFerias, fichaFerias, painelFerias, periodoAquisitivo };
