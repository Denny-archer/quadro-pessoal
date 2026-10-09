/** Funcionalidade: exportacao. */
import { S } from "../core/estado.js";
import { MESES, VINC, TIPOS } from "../core/constantes.js";
import { noQuadro, byName, funcMap, range, overlap } from "../core/colecoes.js";
import { calcBen, benLista } from "./beneficios.js";
import { n2 } from "../core/formatacao.js";
import { pad, fmt } from "../core/datas.js";
import { $, toast } from "../core/dom.js";
import { downloads } from "../core/api.js";
import { csvRem } from "./remuneracao.js";
function csvBen() {
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  let head, rows;
  if (S.mode === "ano") {
    head = ["Funcionário", "Matrícula", "Vínculo", ...MESES.map(m => `Alimentação ${m.slice(0, 3)}`), ...MESES.map(m => `Transporte ${m.slice(0, 3)}`), "Total alimentação", "Total transporte", "Total"];
    rows = S.func.filter(f => noQuadro(f)).sort(byName).map(f => {
      const bs = MESES.map((_, m) => calcBen(f, S.y, m));
      const aa = bs.reduce((s, b) => s + b.aa, 0),
        at = bs.reduce((s, b) => s + b.at, 0);
      return [f.nome, f.matricula, VINC[f.vinculo] || VINC.efetivo, ...bs.map(b => n2(b.aa)), ...bs.map(b => n2(b.at)), n2(aa), n2(at), n2(aa + at)];
    });
  } else {
    head = ["Funcionário", "Matrícula", "Vínculo", "Dias úteis do mês", "Dias úteis devidos", "Alimentação base", "Alimentação valor/dia", "Alimentação dias descontados", "Alimentação desconto", "Alimentação a pagar", "Utiliza transporte", "Transporte valor/dia", "Dias home office integral", "Dias atestado", "Dias viagem", "Dias férias", "Transporte desconto", "Transporte a pagar", "Total a pagar"];
    rows = benLista(S.y, S.m).map(({
      f,
      b
    }) => [f.nome, f.matricula, VINC[f.vinculo] || VINC.efetivo, b.nU, b.eleg, n2(b.aaBruto), n2(b.aaDia), b.aaDescDias, n2(b.aaDesc), n2(b.aa), f.usaTransporte ? "Sim" : "Não", n2(b.atDia), b.atMot.ho, b.atMot.atestado, b.atMot.viagem, b.atMot.ferias, n2(b.atDesc), n2(b.at), n2(b.total)]);
  }
  return {
    nome: `coffito-beneficios-${S.mode === "mes" ? `${S.y}-${pad(S.m + 1)}` : S.y}.csv`,
    data: "﻿" + [head, ...rows].map(r => r.map(q).join(";")).join("\r\n")
  };
}
export function iniciarFeaturesExportacao() {
  $("#export").addEventListener("click", async () => {
    if (!downloads) return;
    if (S.tab === "rem") {
      const {
        nome,
        data
      } = csvRem();
      try {
        await downloads.save({
          filename: nome,
          data
        });
        toast("Arquivo exportado");
      } catch (x) {
        if (x?.code !== "declined") toast(x?.code === "rate_limited" ? "Já há uma exportação aberta." : "Exportação indisponível aqui.");
      }
      return;
    }
    if (S.tab === "ben") {
      const {
        nome,
        data
      } = csvBen();
      try {
        await downloads.save({
          filename: nome,
          data
        });
        toast("Arquivo exportado");
      } catch (x) {
        if (x?.code !== "declined") toast(x?.code === "rate_limited" ? "Já há uma exportação aberta." : "Exportação indisponível aqui.");
      }
      return;
    }
    const fm = funcMap();
    const [a, b] = range();
    const rows = S.ocs.filter(o => overlap(o, a, b)).sort((x, y) => (fm[x.func]?.nome || "").localeCompare(fm[y.func]?.nome || "", "pt-BR") || x.inicio.localeCompare(y.inicio));
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Funcionário", "Matrícula", "Setor", "Tipo", "Início", "Término", "Dias no período", "Horas", "Destino/curso", "Observação"];
    const lines = [head.map(q).join(";")].concat(rows.map(o => {
      const f = fm[o.func] || {};
      return [f.nome, f.matricula, f.setor, TIPOS[o.tipo]?.nome, fmt(o.inicio), fmt(o.fim), o.tipo === "banco" ? "" : overlap(o, a, b), o.horas == null ? "" : String(o.horas).replace(".", ","), o.destino, o.obs].map(q).join(";");
    }));
    const nome = `coffito-quadro-pessoal-${S.mode === "mes" ? `${S.y}-${pad(S.m + 1)}` : S.y}.csv`;
    try {
      await downloads.save({
        filename: nome,
        data: "﻿" + lines.join("\r\n")
      });
      toast("Arquivo exportado");
    } catch (x) {
      if (x?.code !== "declined") toast(x?.code === "rate_limited" ? "Já há uma exportação aberta." : "Exportação indisponível aqui.");
    }
  });
}
export { csvBen };
