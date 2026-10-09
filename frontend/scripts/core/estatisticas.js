/** Infraestrutura compartilhada: estatisticas. */
import { TIPOS, AUSENCIAS } from "./constantes.js";
import { overlap, funcMap, covers, noQuadro, byName } from "./colecoes.js";
import { S } from "./estado.js";
import { HOJE, hoje } from "./datas.js";
import { modoDia } from "./jornada.js";
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
export { stats, foraHoje, emHO };
