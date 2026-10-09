import { classeCor } from "../core/cores.js";
/** Funcionalidade: contratos. */
import { SIT_C, SIT_CONTRATO, VINC } from "../core/constantes.js";
import { parse, hoje, DAY, HOJE, fmt } from "../core/datas.js";
import { S } from "../core/estado.js";
import { noQuadro } from "../core/colecoes.js";
import { esc } from "../core/dom.js";
const temContrato = f => f.vinculo === "estagiario" || f.vinculo === "aprendiz";
function prazoContrato(f) {
  if (!temContrato(f)) return null;
  if (!f.contratoFim || !f.contratoInicio) return {
    sit: "semdata",
    dias: null,
    txt: "sem data",
    cor: SIT_C.semdata.cor
  };
  const dias = Math.round((parse(f.contratoFim) - hoje) / DAY);
  if (f.contratoInicio > HOJE) return {
    sit: "naoinic",
    dias,
    txt: `começa em ${fmt(f.contratoInicio)}`,
    cor: SIT_C.naoinic.cor
  };
  const sit = dias < 0 ? "vencido" : dias <= 30 ? "critico" : dias <= 60 ? "atencao" : dias <= 90 ? "proximo" : "vigente";
  const txt = dias < 0 ? `vencido há ${-dias} ${dias === -1 ? "dia" : "dias"}` : dias === 0 ? "vence hoje" : `faltam ${dias} ${dias === 1 ? "dia" : "dias"}`;
  return {
    sit,
    dias,
    txt,
    cor: SIT_C[sit].cor
  };
}
const prazoPill = p => p ? `<span class="prazo ${classeCor(p.cor, "pc")}"  title="${SIT_C[p.sit].nome}: ${SIT_C[p.sit].desc}">${p.sit === "vigente" || p.sit === "naoinic" || p.sit === "semdata" ? "" : SIT_C[p.sit].nome + " · "}${p.txt}</span>` : "";
function duracaoTxt(a, b) {
  const A = parse(a),
    B = new Date(parse(b).getTime() + DAY);
  let m = (B.getFullYear() - A.getFullYear()) * 12 + B.getMonth() - A.getMonth();
  if (B.getDate() < A.getDate()) m--;
  if (m < 1) return `${Math.round((B - A) / DAY)} dias`;
  const y = Math.floor(m / 12),
    r = m % 12;
  return [y ? `${y} ${y === 1 ? "ano" : "anos"}` : "", r ? `${r} ${r === 1 ? "mês" : "meses"}` : ""].filter(Boolean).join(" e ");
}
const passaDe2Anos = (a, b) => parse(b) >= new Date(parse(a).getFullYear() + 2, parse(a).getMonth(), parse(a).getDate());
function painelContratos() {
  const ORDEM = ["semdata", "vencido", "critico", "atencao", "proximo", "naoinic", "vigente"];
  const cs = S.func.filter(f => temContrato(f) && noQuadro(f)).map(f => ({
    f,
    p: prazoContrato(f)
  })).sort((a, b) => ORDEM.indexOf(a.p.sit) - ORDEM.indexOf(b.p.sit) || (a.f.contratoFim || "").localeCompare(b.f.contratoFim || ""));
  if (!cs.length) return "";
  const cont = {};
  cs.forEach(({
    p
  }) => cont[p.sit] = (cont[p.sit] || 0) + 1);
  const est = cs.filter(x => x.f.vinculo === "estagiario").length,
    apr = cs.length - est;
  const LIM = 12,
    todos = S.verTodosContratos;
  let h = `<section class="panel u-grid-column-1-1" ><div class="panel-head"><h2>Vigência dos contratos de estágio e aprendizagem</h2><span class="hint">${est} ${est === 1 ? "estagiário" : "estagiários"} · ${apr} ${apr === 1 ? "jovem aprendiz" : "jovens aprendizes"}</span></div>
    <div class="sitbar">${SIT_CONTRATO.filter(([k]) => cont[k]).map(([k, n, c, d]) => `<span class="sitchip ${classeCor(c, "pc")}"  title="${d}"><strong class="num">${cont[k]}</strong> ${n}</span>`).join("")}</div>
    <div class="scroll"><table class="data"><thead><tr><th>Nome</th><th>Categoria</th><th>Início</th><th>Término</th><th>Duração</th><th>Situação</th><th>Providência</th></tr></thead><tbody>`;
  h += (todos ? cs : cs.slice(0, LIM)).map(({
    f,
    p
  }) => `<tr class="click" data-ficha="${f.id}"><td><strong>${esc(f.nome)}</strong></td><td>${VINC[f.vinculo]}</td>
    <td class="num">${fmt(f.contratoInicio)}</td><td class="num">${fmt(f.contratoFim)}</td>
    <td>${f.contratoInicio && f.contratoFim ? duracaoTxt(f.contratoInicio, f.contratoFim) + (passaDe2Anos(f.contratoInicio, f.contratoFim) ? ' <span class="prazo u-pc-var-bad"  title="Passa de 2 anos (Lei 11.788/2008, art. 11; CLT, art. 428)">+2 anos</span>' : "") : "—"}</td>
    <td>${prazoPill(p)}</td><td>${esc(f.providencia || "")}</td></tr>`).join("");
  h += `</tbody></table></div>`;
  if (cs.length > LIM) h += `<div class="u-margin-top-10px"><button class="btn small" type="button" data-act="todos-contratos">${todos ? "Mostrar só os mais urgentes" : `Ver todos os ${cs.length} contratos`}</button></div>`;
  return h + `</section>`;
}
function tempoCasa(adm) {
  if (!adm) return "";
  const a = parse(adm);
  let m = (hoje.getFullYear() - a.getFullYear()) * 12 + hoje.getMonth() - a.getMonth();
  if (hoje.getDate() < a.getDate()) m--;
  if (m < 0) return "";
  const y = Math.floor(m / 12),
    r = m % 12;
  return [y ? `${y} ${y === 1 ? "ano" : "anos"}` : "", r ? `${r} ${r === 1 ? "mês" : "meses"}` : ""].filter(Boolean).join(" e ") || "menos de 1 mês";
}
export { temContrato, prazoContrato, prazoPill, duracaoTxt, passaDe2Anos, painelContratos, tempoCasa };
