/** Funcionalidade: abonos. */
import { S } from "../core/estado.js";
import { overlap, noQuadro } from "../core/colecoes.js";
import { parse, HOJE } from "../core/datas.js";
import { esc } from "../core/dom.js";
const ABONO_REF = [["ref2025", "Abono anual · ref. 2025 (usar em 2026)", 5], ["folgas2026", "Folgas do Presidente · 2026", 3], ["ref2024", "Abono anual · ref. 2024 (usado em 2025)", 5]];
function saldoAbono(f, chave) {
  const s = (f.abonos || {})[chave];
  if (!s) return null;
  const mine = S.ocs.filter(o => o.func === f.id && o.tipo === "abono" && o.referenciaAbono === chave);
  const dias = o => overlap(o, parse(o.inicio), parse(o.fim || o.inicio));
  const agendados = mine.filter(o => o.statusAbono === "agendado" && o.inicio > HOJE).reduce((n, o) => n + dias(o), 0);
  return {
    ...s,
    agendados,
    lancados: mine.reduce((n, o) => n + dias(o), 0)
  };
}
function fichaAbonos(f) {
  if (!f.abonos) return "";
  let h = `<h3 class="u-margin-top-22px">Abonos e folgas</h3><div class="stats">`;
  for (const [k, rot, dir] of ABONO_REF) {
    const s = saldoAbono(f, k);
    if (!s) continue;
    const extra = [s.agendados ? `${s.agendados} agendado${s.agendados > 1 ? "s" : ""}` : "", (s.semData || []).length ? s.semData.join(", ").toLowerCase() : "", s.semDireito ? `${s.semDireito} sem direito` : "", s.falta ? `${s.falta} perdido${s.falta > 1 ? "s" : ""} por falta não justificada` : "", s.cedido ? "cedido" : ""].filter(Boolean).join(" · ");
    h += `<div class="stat u-c-var-c-abono" ><div class="v">${s.restantes ?? "—"}<span class="hint"> / ${dir}</span></div><div class="l">restantes · ${esc(rot)}${extra ? `<br>${esc(extra)}` : ""}</div></div>`;
  }
  return h + `</div>`;
}
function painelAbonos() {
  const lst = S.func.filter(noQuadro).map(f => ({
    f,
    a: saldoAbono(f, "ref2025"),
    b: saldoAbono(f, "folgas2026")
  })).filter(x => x.a && x.a.restantes > 0 || x.b && x.b.restantes > 0).sort((x, y) => (y.a?.restantes || 0) + (y.b?.restantes || 0) - ((x.a?.restantes || 0) + (x.b?.restantes || 0)));
  if (!lst.length) return "";
  const tA = lst.reduce((n, x) => n + (x.a?.restantes || 0), 0),
    tB = lst.reduce((n, x) => n + (x.b?.restantes || 0), 0);
  let h = `<section class="panel"><div class="panel-head"><h2>Abonos e folgas a usar em 2026</h2><span class="hint">${tA} dias de abono · ${tB} de folga</span></div><ul class="list">`;
  h += lst.slice(0, 12).map(({
    f,
    a,
    b
  }) => `<li><button class="link" type="button" data-ficha="${f.id}">${esc(f.nome)}</button><span class="num u-font-weight-600" >${(a?.restantes || 0) + (b?.restantes || 0)} dias</span>
    <span class="meta">${a ? `abono: ${a.restantes} de 5` : "sem abono"}${b ? ` · folgas: ${b.restantes} de 3` : ""}${(a?.agendados || 0) + (b?.agendados || 0) ? ` · ${(a?.agendados || 0) + (b?.agendados || 0)} já agendados` : ""}</span></li>`).join("");
  if (lst.length > 12) h += `<li><span class="hint">e mais ${lst.length - 12} pessoas — veja na ficha de cada uma</span></li>`;
  return h + `</ul></section>`;
}
export { ABONO_REF, saldoAbono, fichaAbonos, painelAbonos };
