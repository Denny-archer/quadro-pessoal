import { AUSENCIAS, TIPOS } from "./constantes.js";
import { byName, covers, diasCorr, funcMap, noQuadro, overlap } from "./colecoes.js";
import { S } from "./estado.js";
import { DAY, HOJE, hoje, parse } from "./datas.js";
import { modoDia } from "./jornada.js";
import { reciboFerias } from "../features/ferias.js";
function stats(ocs, a, b) {
  const out = {};
  for (const t of Object.keys(TIPOS)) out[t] = {
    dias: 0,
    n: 0,
    pessoas: new Set(),
    horas: 0
  };
  for (const o of ocs) {
    const d0 = overlap(o, a, b);
    if (!d0) continue;
    const d = o.parcial ? 0 : d0; // declaração de comparecimento: conta o atestado, não o dia
    const s = out[o.tipo];
    if (!s) continue;
    s.dias += d;
    s.n++;
    s.pessoas.add(o.func);
    s.horas += Number(o.horas) || 0;
  }
  return out;
}
function foraHoje() {
  const fm = funcMap();
  return S.ocs.filter(o => AUSENCIAS.includes(o.tipo) && !o.parcial && covers(o, HOJE) && fm[o.func]).sort((a, b) => AUSENCIAS.indexOf(a.tipo) - AUSENCIAS.indexOf(b.tipo));
}
function emHO(modo = "H") {
  const fora = new Set(foraHoje().map(o => o.func));
  return S.func.filter(f => noQuadro(f) && !fora.has(f.id) && modoDia(f, hoje.getDay()) === modo).sort(byName);
}
function diasFerias(ocs, a, b) {
  let goz = 0,
    prog = 0;
  const pessoas = new Set();
  for (const o of ocs) {
    if (o.tipo !== "ferias") continue;
    const t = overlap(o, a, b);
    if (!t) continue;
    const g = overlap(o, a, b < hoje ? b : hoje);
    goz += g;
    prog += t - g;
    pessoas.add(o.func);
  }
  return {
    goz,
    prog,
    total: goz + prog,
    pessoas
  };
}
function reciboParcela(o, f) {
  const dias = diasCorr(o),
    fim = o.fim || o.inicio;
  const dobro = o.limite && fim > o.limite ? Math.min(dias, Math.round((parse(fim) - parse(o.limite)) / DAY)) : 0;
  return reciboFerias(f, dias - dobro, Number(o.abonoPecuniario) || 0, dobro, o.inicio);
}
export { stats, foraHoje, emHO, diasFerias, reciboParcela };
