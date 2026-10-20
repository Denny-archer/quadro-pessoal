import { $ } from "./dom.js";
import { renderKd } from "../features/panorama/detalhes.js";
import { periodoLabel } from "./colecoes.js";
import { S } from "./estado.js";
import { panoramaMes } from "../features/panorama/mes.js";
import { panoramaAno } from "../features/panorama/ano.js";
import { viewFunc } from "../features/funcionarios/ficha.js";
import { viewBen } from "../features/beneficios.js";
import { viewFolha } from "../features/folha.js";
import { viewRem } from "../features/remuneracao.js";
import { viewLanc } from "../features/ocorrencias/listagem.js";
import { atualizarPontoFicha } from "../features/funcionarios/ponto.js";
/** Infraestrutura compartilhada: render. */

function render() {
  if ($("#dlg-kpi")?.open) renderKd();
  $("#period-label").textContent = periodoLabel();
  $("#mode-mes").setAttribute("aria-pressed", S.mode === "mes");
  $("#mode-ano").setAttribute("aria-pressed", S.mode === "ano");
  document.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === S.tab));
  renderBanners();
  const v = $("#view");
  if (!S.ready) {
    atualizarPontoFicha();
    v.innerHTML = `<div class="panel empty">Carregando o quadro…</div>`;
    return;
  }
  if (S.tab === "panorama") v.innerHTML = S.mode === "mes" ? panoramaMes() : panoramaAno();else if (S.tab === "func") v.innerHTML = viewFunc();else if (S.tab === "ben") v.innerHTML = viewBen();else if (S.tab === "rem") v.innerHTML = viewRem();else if (S.tab === "folha") v.innerHTML = viewFolha();else v.innerHTML = viewLanc();
  atualizarPontoFicha();
  const busca = $("#busca-func");
  if (busca && S._focusBusca) {
    busca.focus();
    busca.setSelectionRange(busca.value.length, busca.value.length);
    S._focusBusca = false;
  }
}
function renderBanners() {
  let h = "";
  if (S.offline) h += `<div class="banner warn"><span><strong>Armazenamento indisponível nesta visualização.</strong> Não foi possível falar com o servidor. Recarregue a página; se persistir, avise o suporte.</span></div>`;
  const nEx = S.func.filter(f => f.exemplo).length + S.ocs.filter(o => o.exemplo).length;
  if (nEx) h += `<div class="banner"><span><strong>Dados de exemplo.</strong> Os funcionários marcados “exemplo” servem só para mostrar o painel funcionando. Cadastre sua equipe e remova-os quando quiser.</span><button class="btn small danger" type="button" id="rm-ex">Remover exemplos</button></div>`;
  $("#banners").innerHTML = h;
}
export { render, renderBanners };
