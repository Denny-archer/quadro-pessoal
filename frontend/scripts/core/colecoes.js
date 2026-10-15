import { S } from "./estado.js";
import { DAY, cap, iso, parse } from "./datas.js";
import { MESES } from "./constantes.js";
const naoUtil = dt => dt.getDay() === 0 || dt.getDay() === 6 || (S.cfg.feriados || []).includes(iso(dt));
function range() {
  return S.mode === "mes" ? [new Date(S.y, S.m, 1), new Date(S.y, S.m + 1, 0)] : [new Date(S.y, 0, 1), new Date(S.y, 11, 31)];
}
function overlap(oc, a, b) {
  const s = parse(oc.inicio),
    e = parse(oc.fim || oc.inicio);
  const lo = s > a ? s : a,
    hi = e < b ? e : b;
  return hi < lo ? 0 : Math.round((hi - lo) / DAY) + 1;
}
const covers = (oc, dStr) => oc.inicio <= dStr && (oc.fim || oc.inicio) >= dStr;
const funcMap = () => Object.fromEntries(S.func.map(f => [f.id, f]));
const byName = (a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR");
const noQuadro = f => f.situacao !== "inativo" && f.situacao !== "cedido";
const periodoLabel = () => S.mode === "mes" ? `${cap(MESES[S.m])} de ${S.y}` : String(S.y);
function visiveis() {
  const [a, b] = range();
  const com = new Set(S.ocs.filter(o => overlap(o, a, b)).map(o => o.func));
  return S.func.filter(f => noQuadro(f) || com.has(f.id)).sort(byName);
}
const diasCorr = o => overlap(o, parse(o.inicio), parse(o.fim || o.inicio));
export { naoUtil, range, overlap, covers, funcMap, byName, noQuadro, periodoLabel, visiveis, diasCorr };
