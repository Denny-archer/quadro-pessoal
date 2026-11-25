import { hoje } from "./datas.js";
/** Infraestrutura compartilhada: estado. */

const S = {
  mode: "mes",
  y: hoje.getFullYear(),
  m: hoje.getMonth(),
  tab: "panorama",
  func: [],
  ocs: [],
  sel: null,
  fTipo: "",
  fFunc: "",
  fBusca: "",
  fPeriodo: true,
  ready: false,
  db: null,
  offline: false
};
const CFG_PADRAO = {
  aa: 2100,
  pctTemp: 50,
  limite: 15,
  modo: "todos",
  atModo: "mensal",
  atFerias: false,
  vtPct: 0.1,
  sindical: 90.35,
  diaria: 0,
  feriados: []
};
S.fxItens = [];
export function iniciarCoreEstado() {
  hoje.setHours(0, 0, 0, 0);
  // A entrada sempre começa no Panorama; a navegação durante a sessão é preservada em S.tab.
  S.tab = document.documentElement.dataset.papel === "colaborador" ? "func" : "panorama";
  S.cfg = {
    ...CFG_PADRAO
  };
  S.benAbertos = new Set();
}
export { S, CFG_PADRAO };
