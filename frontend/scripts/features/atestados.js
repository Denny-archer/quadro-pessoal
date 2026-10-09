/** Funcionalidade: atestados. */
import { iso, hoje, HOJE, parse, fmt } from "../core/datas.js";
import { S } from "../core/estado.js";
import { overlap, noQuadro } from "../core/colecoes.js";
import { esc } from "../core/dom.js";
function indAtestados(fid) {
  const ini = iso(new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate() + 1));
  const at = S.ocs.filter(o => o.func === fid && o.tipo === "atestado" && o.inicio >= ini && o.inicio <= HOJE);
  const dias = at.reduce((n, o) => n + (o.parcial ? 0 : overlap(o, parse(o.inicio), parse(o.fim || o.inicio))), 0);
  const parc = at.filter(o => o.parcial).length;
  return {
    n: at.length,
    dias,
    parc,
    bradford: at.length * at.length * dias,
    ultimo: at.map(o => o.inicio).sort().pop() || ""
  };
}
function painelAtestados() {
  const lst = S.func.filter(noQuadro).map(f => ({
    f,
    i: indAtestados(f.id)
  })).filter(x => x.i.n).sort((a, b) => b.i.bradford - a.i.bradford || b.i.n - a.i.n);
  if (!lst.length) return "";
  const tot = lst.reduce((s, {
    i
  }) => ({
    n: s.n + i.n,
    d: s.d + i.dias
  }), {
    n: 0,
    d: 0
  });
  let h = `<section class="panel"><div class="panel-head"><h2>Atestados · últimos 12 meses</h2><span class="hint">${tot.n} atestados · ${tot.d} dias perdidos</span></div>
    <div class="scroll"><table class="data"><thead><tr><th>Funcionário</th><th class="r">Atestados</th><th class="r">Sem afastamento</th><th class="r">Dias perdidos</th><th class="r" title="nº de atestados² × dias perdidos">Bradford</th></tr></thead><tbody>`;
  h += lst.slice(0, 10).map(({
    f,
    i
  }) => `<tr class="click" data-ficha="${f.id}"><td><strong>${esc(f.nome)}</strong><br><span class="hint">último em ${fmt(i.ultimo)}</span></td><td class="r num">${i.n}</td><td class="r num">${i.parc}</td><td class="r num">${i.dias}</td><td class="r num">${i.bradford.toLocaleString("pt-BR")}</td></tr>`).join("");
  h += `</tbody></table></div><p class="hint u-margin-10px-0-0" >O Fator de Bradford pesa mais a frequência que a duração. Use para priorizar uma conversa de cuidado — não é medida de desempenho nem base para sanção.</p></section>`;
  return h;
}
export { indAtestados, painelAtestados };
