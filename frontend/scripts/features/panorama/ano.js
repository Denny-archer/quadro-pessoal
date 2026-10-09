import { classeCor } from "../../core/cores.js";
/** Funcionalidade: panorama / ano. */
import { kpis, legend } from "./indicadores.js";
import { MESES, AUSENCIAS, TIPOS } from "../../core/constantes.js";
import { stats } from "../../core/estatisticas.js";
import { S } from "../../core/estado.js";
import { cap, hoje } from "../../core/datas.js";
import { range, visiveis } from "../../core/colecoes.js";
import { esc } from "../../core/dom.js";
import { fmtH } from "../../core/formatacao.js";
import { painelContratos } from "../contratos.js";
function panoramaAno() {
  let h = kpis();
  // gráfico: dias por mês, empilhado por tipo
  const meses = MESES.map((_, i) => stats(S.ocs, new Date(S.y, i, 1), new Date(S.y, i + 1, 0)));
  const tot = meses.map(s => AUSENCIAS.reduce((n, t) => n + s[t].dias, 0));
  const max = Math.max(4, ...tot);
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find(s => max / s <= 5) || 1000;
  const top = Math.ceil(max / step) * step;
  const W = 760,
    H = 260,
    L = 40,
    R = 8,
    T = 12,
    B = 30,
    cw = (W - L - R) / 12,
    bw = Math.min(38, cw * .62);
  const y = v => T + (H - T - B) * (1 - v / top);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Dias de afastamento por mês em ${S.y}">`;
  for (let v = 0; v <= top; v += step) svg += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  meses.forEach((s, i) => {
    const x = L + cw * i + (cw - bw) / 2;
    let acc = 0;
    AUSENCIAS.forEach(t => {
      const v = s[t].dias;
      if (!v) return;
      const y1 = y(acc + v),
        hh = y(acc) - y1;
      svg += `<rect x="${x}" y="${y1}" width="${bw}" height="${Math.max(0, hh - 1)}" rx="2" class="${classeCor(TIPOS[t].cor, "fill")}"><title>${cap(MESES[i])}: ${v} ${v === 1 ? "dia" : "dias"} de ${TIPOS[t].nome.toLowerCase()}</title></rect>`;
      acc += v;
    });
    if (tot[i]) svg += `<text class="axis u-fill-var-ink" x="${x + bw / 2}" y="${y(tot[i]) - 5}" text-anchor="middle" >${tot[i]}</text>`;
    const cur = S.y === hoje.getFullYear() && i === hoje.getMonth();
    svg += `<text class="axis ${cur ? "u-fill-var-accent" : ""}" x="${x + bw / 2}" y="${H - 10}" text-anchor="middle" >${MESES[i].slice(0, 3)}</text>`;
  });
  svg += `</svg>`;
  h += `<section class="panel chart"><div class="panel-head"><h2>Dias fora do posto, mês a mês</h2>${legend()}</div>${svg}</section>`;

  // tabela anual por funcionário
  const [a, b] = range();
  const fs = visiveis();
  h += `<section class="panel"><div class="panel-head"><h2>Consolidado de ${S.y} por funcionário</h2><span class="hint">dias corridos · clique na linha para abrir a ficha</span></div>`;
  if (!fs.length) return h + `<div class="empty">Nenhum funcionário cadastrado.</div></section>`;
  h += `<div class="scroll"><table class="data"><thead><tr><th>Funcionário</th><th>Setor</th><th class="r">Férias</th><th class="r">Atestado</th><th class="r">Abono</th><th class="r">Viagem</th><th class="r">Capacitação</th><th class="r">Banco (ano)</th></tr></thead><tbody>`;
  const somas = {
    ferias: 0,
    atestado: 0,
    abono: 0,
    viagem: 0,
    capacitacao: 0,
    bh: 0,
    ch: 0
  };
  for (const f of fs) {
    const st = stats(S.ocs.filter(o => o.func === f.id), a, b);
    AUSENCIAS.forEach(t => somas[t] += st[t].dias);
    somas.bh += st.banco.horas;
    somas.ch += st.capacitacao.horas;
    const fe = st.ferias.dias;
    h += `<tr class="click" data-ficha="${f.id}"><td><strong>${esc(f.nome)}</strong>${f.exemplo ? '<span class="chip-ex">exemplo</span>' : ""}</td><td class="muted">${esc(f.setor || "—")}</td>
      <td class="r num">${fe}/30<span class="bar-mini" aria-hidden="true"><i data-ui-width="${Math.min(100, fe / 30 * 100)}%"></i></span></td>
      <td class="r num">${st.atestado.dias || "—"}</td><td class="r num">${st.abono.dias || "—"}</td><td class="r num">${st.viagem.dias || "—"}</td>
      <td class="r num">${st.capacitacao.dias || "—"}${st.capacitacao.horas ? ` <span class="muted">(${st.capacitacao.horas} h)</span>` : ""}</td>
      <td class="r num ${classeCor(st.banco.horas < 0 ? "var(--bad)" : st.banco.horas > 0 ? "var(--good)" : "inherit", "color")}" >${st.banco.n ? fmtH(st.banco.horas) : "—"}</td></tr>`;
  }
  h += `</tbody><tfoot><tr><th>Total</th><th></th>${AUSENCIAS.map(t => `<th class="r num">${somas[t]}</th>`).join("")}<th class="r num">${fmtH(somas.bh)}</th></tr></tfoot></table></div></section>`;
  h += painelContratos();
  return h;
}
export { panoramaAno };
