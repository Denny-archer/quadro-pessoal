import { GRAT_CAMPOS, nivelPorTempo } from "../remuneracao.js";
import { addDias, parse } from "../../core/datas.js";
/** Exclusão coerente de uma mudança: mantém a cadeia e o estado atual. */

export function excluirMudanca(funcionario, id) {
  const f = structuredClone(funcionario);
  const historico = (f.historicoRem || []).sort((a, b) => a.data.localeCompare(b.data));
  const evento = historico.find(e => e.id === id);
  if (!evento) return f;
  const proximo = historico.find(e => e.tipo === evento.tipo && e.data > evento.data);
  if (proximo) {
    proximo.de = structuredClone(evento.de);
    if (evento.tipo === "nivel") {
      proximo.deAuto = !!evento.deAuto;
      if (proximo.deAuto) proximo.de = nivelPorTempo(f.admissao, parse(addDias(proximo.data, -1)));
    }
  } else if (evento.tipo === "nivel") {
    f.nivelSalarial = evento.deAuto ? null : evento.de;
  } else {
    for (const campo of GRAT_CAMPOS) f[campo] = evento.de?.[campo] || "";
  }
  f.historicoRem = historico.filter(e => e.id !== id);
  return f;
}
