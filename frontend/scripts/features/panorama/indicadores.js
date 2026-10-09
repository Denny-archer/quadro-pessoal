import { classeCor } from "../../core/cores.js";
/** Funcionalidade: panorama / indicadores. */
import { range, noQuadro } from "../../core/colecoes.js";
import { stats, foraHoje, emHO } from "../../core/estatisticas.js";
import { S } from "../../core/estado.js";
import { hoje } from "../../core/datas.js";
import { AUSENCIAS, TIPOS } from "../../core/constantes.js";
import { fmtH } from "../../core/formatacao.js";
function kpis() {
  const [a, b] = range();
  const st = stats(S.ocs, a, b);
  const fora = foraHoje();
  const pessoasFora = new Set(fora.map(o => o.func)).size;
  const ativos = S.func.filter(f => noQuadro(f)).length;
  let h = `<div class="kpis">`;
  h += `<div class="kpi today" data-kpi="todos" role="button" tabindex="0" aria-label="Detalhar quem está fora do posto"><span class="label">Fora do posto hoje</span><span class="value">${pessoasFora}<small>de ${ativos}</small></span><span class="sub">${hoje.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "short"
  })}${emHO().length ? ` · ${emHO().length} em home office` : ""}${emHO("M").length ? ` · ${emHO("M").length} em dia misto` : ""}</span></div>`;
  for (const t of AUSENCIAS) {
    const s = st[t];
    const extra = t === "capacitacao" && s.horas ? ` · ${s.horas.toLocaleString("pt-BR")} h` : "";
    h += `<div class="kpi ${classeCor(TIPOS[t].cor, "k")}"  data-kpi="${t}" role="button" tabindex="0" aria-label="Detalhar ${TIPOS[t].nome}"><span class="label">${TIPOS[t].nome}</span><span class="value">${s.dias}<small>${s.dias === 1 ? "dia" : "dias"}</small></span><span class="sub">${s.n} ${s.n === 1 ? "lançamento" : "lançamentos"} · ${s.pessoas.size} ${s.pessoas.size === 1 ? "pessoa" : "pessoas"}${extra}</span></div>`;
  }
  const bh = st.banco.horas;
  h += `<div class="kpi u-k-var-c-banco"  data-kpi="banco" role="button" tabindex="0" aria-label="Detalhar banco de horas"><span class="label">Banco de horas</span><span class="value">${fmtH(bh).replace(" h", "")}<small>h</small></span><span class="sub">saldo lançado no período</span></div>`;
  return h + `</div>`;
}
const legend = () => `<div class="legend">${AUSENCIAS.map(t => `<span><i class="sw ${classeCor(TIPOS[t].cor, "c")}" ></i>${TIPOS[t].sigla} · ${TIPOS[t].nome}</span>`).join("")}<span><i class="sw u-c-var-c-banco-50" ></i>Banco de horas</span><span><i class="sw u-c-var-c-ho" ></i>h · Home office o dia todo</span><span><i class="sw u-background-linear-gradient-to-top-var-c-ho-0-" ></i>Dia misto</span></div>`;
export { kpis, legend };
