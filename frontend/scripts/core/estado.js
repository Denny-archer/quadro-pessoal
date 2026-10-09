/** Infraestrutura compartilhada: estado. */
import { hoje } from "./datas.js";
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
  feriados: []
};
S.fxItens = [];
export function iniciarCoreEstado() {
  hoje.setHours(0, 0, 0, 0);
  try {
    const t = localStorage.getItem("qp-tab");
    if (t) S.tab = t;
  } catch (e) {}
  S.cfg = {
    ...CFG_PADRAO
  };
  S.benAbertos = new Set();
}
export { S, CFG_PADRAO };
