/** Funcionalidade: panorama / quadro. */
import { S } from "../../core/estado.js";
import { grupoDe, GRUPOS } from "../ferias.js";
import { noQuadro } from "../../core/colecoes.js";
function painelQuadro() {
  if (!S.func.length) return "";
  const c = {};
  S.func.forEach(f => {
    const g = grupoDe(f);
    c[g] = (c[g] || 0) + 1;
  });
  const exerc = S.func.filter(noQuadro).length,
    com = S.func.filter(f => noQuadro(f) && f.funcao).length;
  let h = `<section class="panel"><div class="panel-head"><h2>Composição do quadro</h2><span class="hint">${exerc} em exercício · ${com} com comissão ou FG</span></div><ul class="list">`;
  h += GRUPOS.filter(([k]) => c[k]).map(([k, t]) => `<li><button class="link" type="button" data-grupo="${k}">${t}</button><span class="num u-font-weight-600" >${c[k]}</span></li>`).join("");
  return h + `</ul></section>`;
}
export { painelQuadro };
