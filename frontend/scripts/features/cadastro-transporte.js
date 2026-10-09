/** Funcionalidade: cadastro-transporte. */
import { $ } from "../core/dom.js";
import { S } from "../core/estado.js";
function ajustaAT() {
  const usa = $("#f-usa-at").checked,
    diario = S.cfg.atModo === "diario";
  $("#lbl-at").hidden = !usa;
  $("#lbl-at-txt").textContent = diario ? "Valor diário (R$, ida e volta)" : "Valor mensal (R$)";
  $("#f-at-hint").textContent = !usa ? "Sem auxílio-transporte: nada a pagar nem descontar." : diario ? "Pago por dia útil trabalhado; home office integral, atestado e viagem não contam." : "Dividido pelos dias úteis do mês; home office integral, atestado e viagem são descontados.";
}
export function iniciarFeaturesCadastroTransporte() {
  $("#f-usa-at").addEventListener("change", ajustaAT);
}
export { ajustaAT };
