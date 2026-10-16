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
  try {
    const t = localStorage.getItem(`rh:${document.documentElement.dataset.usuario}:${'qp-tab'}`);
    if (t) S.tab = t;
  } catch (e) {}
  if (document.documentElement.dataset.papel === "colaborador" && S.tab === "panorama") {
    S.tab = "func";
  }
  S.cfg = {
    ...CFG_PADRAO
  };
  S.benAbertos = new Set();
}
export { S, CFG_PADRAO };
