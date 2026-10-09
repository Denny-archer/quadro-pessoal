import { classeCor } from "../../core/cores.js";
/** Funcionalidade: ocorrencias / listagem. */
import { funcMap, range, overlap, byName } from "../../core/colecoes.js";
import { parse, fmt } from "../../core/datas.js";
import { esc } from "../../core/dom.js";
import { TIPOS, MESES } from "../../core/constantes.js";
import { fmtH } from "../../core/formatacao.js";
import { S } from "../../core/estado.js";
function tabelaLanc(rows, comFunc) {
  const fm = funcMap();
  const [a, b] = range();
  return `<div class="scroll"><table class="data"><thead><tr>${comFunc ? "<th>Funcionário</th>" : ""}<th>Tipo</th><th>Início</th><th>Término</th><th class="r">Dias</th><th class="r">Horas</th><th>Destino / curso / observação</th></tr></thead><tbody>` + rows.map(o => {
    const tot = overlap(o, parse(o.inicio), parse(o.fim || o.inicio));
    return `<tr class="click" data-oc-open="${o.id}">${comFunc ? `<td><strong>${esc(fm[o.func]?.nome || "(removido)")}</strong>${o.exemplo ? '<span class="chip-ex">exemplo</span>' : ""}</td>` : ""}
      <td><span class="pill ${classeCor(TIPOS[o.tipo]?.cor, "c")}" >${TIPOS[o.tipo]?.nome || o.tipo}</span></td>
      <td class="num">${fmt(o.inicio)}</td><td class="num">${o.tipo === "banco" ? "—" : fmt(o.fim)}</td>
      <td class="r num">${o.tipo === "banco" ? "—" : o.parcial ? '0 <span class="muted">(comparec.)</span>' : tot}</td>
      <td class="r num">${o.horas != null && o.horas !== "" ? o.tipo === "banco" ? fmtH(Number(o.horas)) : o.horas + " h" : "—"}</td>
      <td>${o.tipo === "ferias" && (o.parcela || o.abonoPecuniario) ? `<span>${[o.parcela ? o.parcela + " período" : "", o.abonoPecuniario ? o.abonoPecuniario + " dias vendidos" : ""].filter(Boolean).join(" · ")}</span>${o.obs ? " — " : ""}` : ""}${esc(o.destino || "")}${o.destino && o.obs ? " — " : ""}<span class="muted">${esc(o.obs || "")}</span></td></tr>`;
  }).join("") + `</tbody></table></div>`;
}
function filtrados() {
  const [a, b] = range();
  const q = S.fBuscaL?.trim().toLowerCase() || "";
  return S.ocs.filter(o => (!S.fTipo || o.tipo === S.fTipo) && (!S.fFunc || o.func === S.fFunc) && (!S.fPeriodo || overlap(o, a, b)) && (!q || [o.obs, o.destino].some(x => (x || "").toLowerCase().includes(q)))).sort((x, y) => y.inicio.localeCompare(x.inicio));
}
function viewLanc() {
  const rows = filtrados();
  const opts = [...S.func].sort(byName).map(f => `<option value="${f.id}" ${S.fFunc === f.id ? "selected" : ""}>${esc(f.nome)}</option>`).join("");
  let h = `<section class="panel"><div class="panel-head"><h2>Lançamentos</h2><span class="hint">${rows.length} ${rows.length === 1 ? "registro" : "registros"}</span></div>
  <div class="filters">
    <label>Tipo<select id="flt-tipo"><option value="">Todos</option>${Object.entries(TIPOS).map(([k, t]) => `<option value="${k}" ${S.fTipo === k ? "selected" : ""}>${t.nome}</option>`).join("")}</select></label>
    <label>Funcionário<select id="flt-func"><option value="">Todos</option>${opts}</select></label>
    <label>Buscar no texto<input id="flt-busca" type="search" value="${esc(S.fBuscaL || "")}" placeholder="destino, curso, observação"></label>
    <label class="check"><input id="flt-per" type="checkbox" ${S.fPeriodo ? "checked" : ""}> Somente ${S.mode === "mes" ? MESES[S.m] + " de " + S.y : S.y}</label>
  </div>`;
  h += rows.length ? tabelaLanc(rows, true) : `<div class="empty">Nenhum lançamento com esses filtros.</div>`;
  return h + `</section>`;
}
export { tabelaLanc, filtrados, viewLanc };
