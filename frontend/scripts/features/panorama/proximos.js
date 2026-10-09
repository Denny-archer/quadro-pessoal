import { classeCor } from "../../core/cores.js";
/** Funcionalidade: panorama / proximos. */
import { funcMap, overlap } from "../../core/colecoes.js";
import { iso, hoje, DAY, HOJE, parse, fmt } from "../../core/datas.js";
import { S } from "../../core/estado.js";
import { esc } from "../../core/dom.js";
import { TIPOS } from "../../core/constantes.js";
function painelProximos() {
  const fm = funcMap();
  const lim = iso(new Date(hoje.getTime() + 30 * DAY));
  const prox = S.ocs.filter(o => o.tipo !== "banco" && o.inicio > HOJE && o.inicio <= lim && fm[o.func]).sort((a, b) => a.inicio.localeCompare(b.inicio));
  let h = `<section class="panel"><div class="panel-head"><h2>Próximos 30 dias</h2><span class="hint">afastamentos que começam</span></div>`;
  if (!prox.length) return h + `<div class="empty">Nada programado para os próximos 30 dias.</div></section>`;
  h += `<ul class="list">` + prox.map(o => {
    const n = overlap(o, parse(o.inicio), parse(o.fim || o.inicio));
    return `<li><button class="link" type="button" data-oc-open="${o.id}">${esc(fm[o.func].nome)}</button><span class="pill ${classeCor(TIPOS[o.tipo].cor, "c")}" >${TIPOS[o.tipo].nome}</span><span class="meta">${fmt(o.inicio)}${o.fim && o.fim !== o.inicio ? " a " + fmt(o.fim) : ""} · ${n} ${n === 1 ? "dia" : "dias"}${o.destino ? " · " + esc(o.destino) : ""}</span></li>`;
  }).join("") + `</ul>`;
  return h + `</section>`;
}
export { painelProximos };
