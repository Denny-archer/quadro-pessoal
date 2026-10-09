/** Funcionalidade: beneficios-extras. */
import { S } from "../core/estado.js";
import { MESES } from "../core/constantes.js";
import { pad, cap } from "../core/datas.js";
import { r2, brl } from "../core/formatacao.js";
import { $, esc } from "../core/dom.js";
const TIPOS_EXTRA = {
  creche: "Auxílio-creche",
  natal: "Abono de Natal",
  funeral: "Auxílio-funeral",
  outro: "Outro"
};
const valorPadraoExtra = t => S.rem ? {
  creche: S.rem.beneficios.creche,
  natal: S.rem.beneficios.abonoNatal,
  funeral: S.rem.beneficios.funeral
}[t] || "" : "";
const MESES3 = MESES.map(m => m.slice(0, 3));
function nomeExtra(x) {
  return x.tipo === "outro" ? x.descricao || "Outro benefício" : TIPOS_EXTRA[x.tipo] || x.tipo;
}
function quandoExtra(x) {
  const q = x.recorrencia === "meses" ? (x.meses || []).length ? "em " + x.meses.slice().sort((a, b) => a - b).map(m => MESES3[m]).join(", ") : "nenhum mês marcado" : "todo mês";
  const v = x.inicio || x.fim ? ` · ${x.inicio ? "de " + x.inicio.split("-").reverse().join("/") : ""}${x.fim ? " até " + x.fim.split("-").reverse().join("/") : ""}` : "";
  return q + v;
}
function extrasNoMes(f, y, m) {
  const ym = `${y}-${pad(m + 1)}`;
  return (f.beneficiosExtras || []).filter(x => (Number(x.valor) || 0) > 0 && (!x.inicio || x.inicio <= ym) && (!x.fim || x.fim >= ym) && (x.recorrencia !== "meses" || (x.meses || []).includes(m)));
}
const totalExtras = (f, y, m) => r2(extrasNoMes(f, y, m).reduce((n, x) => n + Number(x.valor), 0));
function renderFx() {
  const box = $("#fx-lista");
  if (!S.fxItens.length) {
    box.innerHTML = `<div class="hint">Nenhum benefício adicional cadastrado.</div>`;
    return;
  }
  box.innerHTML = S.fxItens.map((x, i) => `<div class="fx-item" data-fx="${i}">
    <div class="fx-row">
      <label>Benefício<select data-fxk="tipo">${Object.entries(TIPOS_EXTRA).map(([k, n]) => `<option value="${k}" ${x.tipo === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label>Valor (R$)<input data-fxk="valor" type="number" min="0" step="0.01" value="${x.valor ?? ""}"></label>
      <label>Recorrência<select data-fxk="recorrencia"><option value="mensal" ${x.recorrencia !== "meses" ? "selected" : ""}>Todo mês</option><option value="meses" ${x.recorrencia === "meses" ? "selected" : ""}>Meses específicos</option></select></label>
      <button class="btn small danger" type="button" data-fxdel="${i}" aria-label="Remover benefício">Remover</button>
    </div>
    ${x.tipo === "outro" ? `<div class="fx-row u-grid-template-columns-1fr" ><label>Descrição<input data-fxk="descricao" type="text" maxlength="80" value="${esc(x.descricao || "")}" placeholder="Ex.: auxílio-saúde"></label></div>` : ""}
    ${x.recorrencia === "meses" ? `<div class="fx-meses" role="group" aria-label="Meses">${MESES3.map((mn, m) => `<label><input type="checkbox" data-fxmes="${m}" ${(x.meses || []).includes(m) ? "checked" : ""}><span>${cap(mn)}</span></label>`).join("")}</div>` : ""}
    <div class="fx-vig"><label>Vigência de (opcional)<input data-fxk="inicio" type="month" value="${x.inicio || ""}"></label><label>até<input data-fxk="fim" type="month" value="${x.fim || ""}"></label><span class="hint">${esc(quandoExtra(x))}</span></div>
  </div>`).join("");
}
function fichaExtras(f) {
  const xs = f.beneficiosExtras || [];
  if (!xs.length) return "";
  const noMes = totalExtras(f, S.y, S.m);
  return `<h3 class="u-margin-top-22px">Benefícios adicionais</h3><ul class="list">${xs.map(x => `<li><span class="who">${esc(nomeExtra(x))}</span><span class="num u-font-weight-600" >${brl(x.valor)}</span><span class="meta">${esc(quandoExtra(x))}</span></li>`).join("")}</ul>
    <div class="hint u-margin-top-6px" >Em ${MESES[S.m]} de ${S.y}: <strong class="num">${brl(noMes)}</strong></div>`;
}
export function iniciarFeaturesBeneficiosExtras() {
  S.fxItens = [];
  $("#fx-add").addEventListener("click", () => {
    S.fxItens.push({
      tipo: "creche",
      valor: valorPadraoExtra("creche"),
      recorrencia: "mensal",
      meses: [],
      inicio: "",
      fim: "",
      descricao: ""
    });
    renderFx();
  });
  $("#fx-lista").addEventListener("change", e => {
    const it = e.target.closest("[data-fx]");
    if (!it) return;
    const x = S.fxItens[+it.dataset.fx];
    const k = e.target.dataset.fxk;
    if (k) {
      x[k] = e.target.value;
      if (k === "tipo") {
        const pv = valorPadraoExtra(x.tipo);
        if (pv) x.valor = pv;
        if (x.tipo === "natal" && !(x.meses || []).length) {
          x.recorrencia = "meses";
          x.meses = [11];
        }
      }
      renderFx();
    }
    if (e.target.dataset.fxmes != null) {
      const m = +e.target.dataset.fxmes;
      x.meses = e.target.checked ? [...new Set([...(x.meses || []), m])] : (x.meses || []).filter(v => v !== m);
      renderFx();
    }
  });
  $("#fx-lista").addEventListener("click", e => {
    const b = e.target.closest("[data-fxdel]");
    if (b) {
      S.fxItens.splice(+b.dataset.fxdel, 1);
      renderFx();
    }
  });
}
export { TIPOS_EXTRA, valorPadraoExtra, MESES3, nomeExtra, quandoExtra, extrasNoMes, totalExtras, renderFx, fichaExtras };
