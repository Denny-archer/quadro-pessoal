/** Funcionalidade: remuneracao. */
import { S } from "../core/estado.js";
import { hoje, parse, iso, DAY, fmt, pad } from "../core/datas.js";
import { r2, brl, n2 } from "../core/formatacao.js";
import { noQuadro } from "../core/colecoes.js";
import { calcBen } from "./beneficios.js";
import { grupoDe, GRUPOS } from "./ferias.js";
import { MESES, VINC } from "../core/constantes.js";
import { esc } from "../core/dom.js";
import { MESES3, nomeExtra } from "./beneficios-extras.js";
const CARREIRA = {
  analista: "Analista / Advogado",
  tecnico: "Técnico",
  apoio: "Apoio Operacional"
};
const CLASSES = "ABCDEF";
const BOLSA = {
  medio4: "Estágio · nível médio 4h",
  tecnico6: "Estágio · nível técnico 6h",
  advocacia6: "Estágio · advocacia 6h",
  superior6: "Estágio · nível superior 6h",
  pos6: "Estágio · pós-graduação 6h",
  aprendiz: "Jovem aprendiz 6h"
};
const FGN = {
  chefia: "FG Chefia",
  assessor2: "FG Assessor Nível II",
  assessor1: "FG Assessor Nível I"
};
function carreiraAuto(cargo) {
  const c = (cargo || "").toLowerCase();
  if (/analista|advogad|especialista/.test(c)) return "analista";
  if (/assistente|t[ée]cnico/.test(c)) return "tecnico";
  if (/auxiliar|motorista/.test(c)) return "apoio";
  return "";
}
function anosDeCasa(adm, ref = hoje) {
  if (!adm) return 0;
  const a = parse(adm);
  let n = ref.getFullYear() - a.getFullYear();
  if (ref.getMonth() < a.getMonth() || ref.getMonth() === a.getMonth() && ref.getDate() < a.getDate()) n--;
  return Math.max(0, n);
}
const nivelPorTempo = adm => Math.min(30, anosDeCasa(adm) + 1);
function fgAuto(f) {
  if (f.fgTipo) return f.fgTipo;
  const t = (f.funcao || "").toLowerCase();
  return /chef/.test(t) ? "chefia" : /n[íi]vel\s*ii\b|assessor.*ii/.test(t) ? "assessor2" : "assessor1";
}
function remun(f) {
  const R = S.rem;
  if (!R) return null;
  const v = f.vinculo || "efetivo",
    out = {
      vinculo: v,
      base: 0,
      grat: 0,
      rotBase: "",
      rotGrat: "",
      alertas: []
    };
  if (v === "estagiario" || v === "aprendiz") {
    const k = v === "aprendiz" ? "aprendiz" : f.bolsaTipo || "superior6";
    out.base = R.estagio[k] || 0;
    out.rotBase = BOLSA[k];
    if (v === "estagiario" && !f.bolsaTipo) out.alertas.push("bolsa pelo padrão (nível superior 6h) — confirme a escolaridade");
  } else if (v === "comissionado" || v === "cedido") {
    const c = R.comissao[f.nivel];
    if (!c) {
      out.alertas.push("cargo em comissão sem nível — informe o nível no cadastro");
    } else {
      out.base = c.salario;
      out.rotBase = `Emprego em comissão · Nível ${f.nivel}`;
    }
    if (v === "cedido") out.alertas.push("cedido de outro órgão: confirme quem paga (ônus)");
  } else {
    const car = f.carreira || carreiraAuto(f.cargo);
    out.carreira = car;
    out.previsto = nivelPorTempo(f.admissao);
    out.nivel = f.nivelSalarial || out.previsto;
    out.classe = CLASSES[Math.floor((out.nivel - 1) / 5)];
    if (!car) out.alertas.push("carreira não identificada pelo cargo — escolha no cadastro");else {
      out.base = R.carreiras[car][out.nivel - 1];
      out.rotBase = `${CARREIRA[car]} · Classe ${out.classe} · Nível ${out.nivel}`;
    }
    if (f.nivelSalarial && f.nivelSalarial < out.previsto) out.alertas.push(`${out.previsto - f.nivelSalarial} progressão(ões) não concedida(s) pelo tempo de casa`);
    if (out.nivel < 30 && f.admissao) {
      const a = parse(f.admissao);
      let d = new Date(hoje.getFullYear(), a.getMonth(), a.getDate());
      if (d <= hoje) d = new Date(hoje.getFullYear() + 1, a.getMonth(), a.getDate());
      out.proxima = {
        data: iso(d),
        nivel: out.nivel + 1,
        valor: car ? R.carreiras[car][out.nivel] : 0
      };
    }
    if (f.funcaoTipo === "fg") {
      const k = fgAuto(f);
      out.grat = R.fg[k] || 0;
      out.rotGrat = FGN[k];
    } else if (f.funcao && f.funcaoTipo === "comissao") {
      const c = R.comissao[f.nivel];
      if (c) {
        out.grat = c.gratificacao;
        out.rotGrat = `Gratificação ${R.gratificacaoPct}% · comissão Nível ${f.nivel}`;
      } else out.alertas.push("cargo em comissão sem nível — gratificação não calculada");
    }
    if (f.situacao === "cedido") out.alertas.push(`cedido${f.cedidoPara ? " ao " + f.cedidoPara : ""}: confirme se o COFFITO arca com o salário`);
  }
  out.total = r2(out.base + out.grat);
  out.aa = v === "estagiario" || v === "aprendiz" ? R.beneficios.alimentacao * (Number(S.cfg.pctTemp) || 50) / 100 : R.beneficios.alimentacao;
  return out;
}
function benDoMes(f) {
  if (!noQuadro(f)) return {
    aa: 0,
    at: 0,
    ex: 0,
    total: 0,
    extras: []
  };
  const b = calcBen(f, S.y, S.m);
  return {
    aa: b.aa,
    at: b.at,
    ex: b.ex,
    total: b.total,
    extras: b.extras
  };
}
function remLista() {
  const q = S.remBusca.trim().toLowerCase();
  return S.func.filter(f => f.situacao !== "inativo").filter(f => (!q || [f.nome, f.cargo, f.funcao, f.setor, f.matricula].some(x => (x || "").toLowerCase().includes(q))) && (!S.remGrupo || grupoDe(f) === S.remGrupo) && (!S.remSetor || f.setor === S.remSetor)).map(f => {
    const r = remun(f);
    if (!r) return null;
    const b = benDoMes(f);
    return {
      f,
      r,
      b,
      geral: r2((f.situacao === "cedido" ? 0 : r.total) + b.total)
    };
  }).filter(Boolean).sort((a, b) => b.geral - a.geral);
}
function viewRem() {
  if (!S.rem) return `<div class="panel empty">Carregando a tabela salarial…</div>`;
  const lst = remLista(),
    R = S.rem;
  const T = lst.reduce((t, {
    f,
    r,
    b,
    geral
  }) => {
    const fora = f.situacao === "cedido";
    if (!fora) {
      t.ex += b.ex;
      t.at += b.at;
      t.geral += geral;
      t.base += f.vinculo === "estagiario" || f.vinculo === "aprendiz" ? 0 : r.base;
      t.bolsa += f.vinculo === "estagiario" || f.vinculo === "aprendiz" ? r.base : 0;
      t.grat += r.grat;
      t.aa += b.aa;
      t.n++;
    }
    return t;
  }, {
    base: 0,
    bolsa: 0,
    grat: 0,
    aa: 0,
    at: 0,
    ex: 0,
    geral: 0,
    n: 0
  });
  const setores = [...new Set(S.func.map(f => f.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  let h = `<div class="kpis">
    <div class="kpi today"><span class="label">Total com benefícios</span><span class="value u-font-size-26px" >${brl(T.geral)}</span><span class="sub">${MESES[S.m]} de ${S.y} · ${T.n} pessoas · sem encargos</span></div>
    <div class="kpi u-k-var-brand" ><span class="label">Folha mensal</span><span class="value u-font-size-24px" >${brl(T.base + T.bolsa + T.grat)}</span><span class="sub">salários, gratificações e bolsas</span></div>
    <div class="kpi u-k-var-accent" ><span class="label">Salários</span><span class="value u-font-size-24px" >${brl(T.base)}</span><span class="sub">carreira e empregos em comissão</span></div>
    <div class="kpi u-k-var-c-abono" ><span class="label">Gratificações e FG</span><span class="value u-font-size-24px" >${brl(T.grat)}</span><span class="sub">${R.gratificacaoPct}% da comissão para efetivos</span></div>
    <div class="kpi u-k-var-c-capacitacao" ><span class="label">Bolsas</span><span class="value u-font-size-24px" >${brl(T.bolsa)}</span><span class="sub">estágio e aprendizagem</span></div>
    <div class="kpi u-k-var-c-ferias" ><span class="label">Benefícios no mês</span><span class="value u-font-size-24px" >${brl(T.aa + T.at + T.ex)}</span><span class="sub">alimentação ${brl(T.aa)} · transporte ${brl(T.at)} · adicionais ${brl(T.ex)}</span></div>
  </div>`;
  h += `<section class="panel"><div class="panel-head"><div><h2>Remuneração por funcionário</h2><div class="hint">Tabela ${esc(R.vigencia)} · ${esc(R.reajuste)} · total com benefícios = salário + gratificação + alimentação + transporte + adicionais de ${MESES[S.m]} (mês escolhido no topo) · clique na linha para abrir a ficha</div></div><button class="btn small" type="button" data-act="tabela-sal">Ver tabela salarial</button></div>
    <div class="filters"><label>Buscar<input id="rem-busca" type="search" value="${esc(S.remBusca)}" placeholder="nome, cargo, setor, matrícula"></label>
      <label>Vínculo<select id="rem-grupo"><option value="">Todos</option>${GRUPOS.map(([k, t]) => `<option value="${k}" ${S.remGrupo === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label>Setor<select id="rem-setor"><option value="">Todos</option>${setores.map(x => `<option ${S.remSetor === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label></div>
    <div class="scroll"><table class="data"><thead><tr><th>Funcionário</th><th>Enquadramento</th><th class="r">Salário / bolsa</th><th>Gratificação</th><th class="r">Remuneração</th><th class="r">Benefícios em ${MESES3[S.m]}</th><th class="r">Total com benefícios</th></tr></thead><tbody>`;
  h += lst.map(({
    f,
    r,
    b,
    geral
  }) => `<tr class="click" data-ficha="${f.id}"><td><strong>${esc(f.nome)}</strong>${f.matricula ? `<br><span class="hint">mat. ${esc(f.matricula)}</span>` : ""}</td>
    <td>${esc(r.rotBase || "—")}${r.previsto && r.nivel !== r.previsto ? `<br><span class="hint">previsto pelo tempo: nível ${r.previsto}</span>` : ""}${r.alertas.length ? `<br><span class="hint u-color-var-c-abono" >⚠ ${esc(r.alertas.join(" · "))}</span>` : ""}</td>
    <td class="money">${r.base ? brl(r.base) : "—"}</td><td>${r.grat ? `<span class="num">${brl(r.grat)}</span><br><span class="hint">${esc(r.rotGrat)}</span>` : '<span class="hint">—</span>'}</td>
    <td class="money">${brl(r.total)}</td>
    <td class="money">${b.total ? `${brl(b.total)}<br><span class="hint">${[b.aa ? "alim. " + brl(b.aa) : "", b.at ? "transp. " + brl(b.at) : "", b.ex ? esc(b.extras.map(nomeExtra).join(", ")) + " " + brl(b.ex) : ""].filter(Boolean).join(" · ")}</span>` : '<span class="hint">—</span>'}</td>
    <td class="money pagar u-font-size-15px" >${brl(geral)}${f.situacao === "cedido" ? '<br><span class="hint">cedido: fora da folha</span>' : ""}</td></tr>`).join("");
  h += `</tbody><tfoot><tr><th colspan="4">Total (${T.n} em exercício)</th><th class="money">${brl(T.base + T.bolsa + T.grat)}</th><th class="money">${brl(T.aa + T.at + T.ex)}</th><th class="money">${brl(T.geral)}</th></tr></tfoot></table></div></section>`;
  // progressões pelo tempo nos próximos 90 dias
  const lim = iso(new Date(hoje.getTime() + 90 * DAY));
  const prox = lst.filter(x => x.r.proxima && x.r.proxima.data <= lim && noQuadro(x.f)).sort((a, b) => a.r.proxima.data.localeCompare(b.r.proxima.data));
  h += `<section class="panel"><div class="panel-head"><h2>Progressões previstas nos próximos 90 dias</h2><span class="hint">1 nível por ano · depende da avaliação de desempenho</span></div>`;
  h += prox.length ? `<ul class="list">${prox.map(({
    f,
    r
  }) => `<li><button class="link" type="button" data-ficha="${f.id}">${esc(f.nome)}</button><span class="num u-font-weight-600" >+${brl(r2(r.proxima.valor - r.base))}</span><span class="meta">${fmt(r.proxima.data)} · nível ${r.nivel} → ${r.proxima.nivel} (${CARREIRA[r.carreira] || ""}) · ${brl(r.base)} → ${brl(r.proxima.valor)}</span></li>`).join("")}</ul>` : `<div class="empty">Nenhuma progressão por tempo nos próximos 90 dias.</div>`;
  return h + `</section>`;
}
function fichaRem(f) {
  const r = remun(f);
  if (!r) return "";
  let h = `<h3 class="u-margin-top-22px">Remuneração · tabela ${esc(S.rem.vigencia)}</h3><dl class="facts">`;
  h += `<div><dt>${f.vinculo === "estagiario" || f.vinculo === "aprendiz" ? "Bolsa-auxílio" : "Salário"}</dt><dd class="num">${r.base ? brl(r.base) : "—"}<br><span class="hint u-font-family-var-f-body" >${esc(r.rotBase || "")}</span></dd></div>`;
  if (r.grat) h += `<div><dt>Gratificação</dt><dd class="num">${brl(r.grat)}<br><span class="hint u-font-family-var-f-body" >${esc(r.rotGrat)}</span></dd></div>`;
  h += `<div><dt>Total (salário + gratificação)</dt><dd class="num u-font-size-18px" >${brl(r.total)}</dd></div>`;
  {
    const b = benDoMes(f),
      geral = r2((f.situacao === "cedido" ? 0 : r.total) + b.total);
    h += `<div><dt>Benefícios em ${MESES3[S.m]}/${S.y}</dt><dd class="num">${brl(b.total)}<br><span class="hint u-font-family-var-f-body" >alimentação ${brl(b.aa)} · transporte ${brl(b.at)}${b.ex ? ` · adicionais ${brl(b.ex)}` : ""}</span></dd></div>`;
    h += `<div><dt>Total com benefícios</dt><dd class="num u-font-size-18px-33" >${brl(geral)}</dd></div>`;
  }
  if (r.carreira) h += `<div><dt>Tempo de casa</dt><dd>${anosDeCasa(f.admissao)} anos · nível previsto ${r.previsto}${r.nivel !== r.previsto ? `<br><span class="hint">nível atual informado: ${r.nivel}</span>` : ""}</dd></div>`;
  if (r.proxima) h += `<div><dt>Próxima progressão</dt><dd>${fmt(r.proxima.data)} → nível ${r.proxima.nivel}<br><span class="hint">${brl(r.proxima.valor)} · se aprovada na avaliação de desempenho</span></dd></div>`;
  h += `</dl>`;
  if (r.alertas.length) h += `<div class="hint u-color-var-c-abono-34" >⚠ ${esc(r.alertas.join(" · "))}</div>`;
  return h;
}
function tabelaSalarial() {
  const R = S.rem;
  if (!R) return "";
  let h = `<div class="dlg-head"><h2>Estrutura remuneratória ${esc(R.vigencia)}</h2><button class="icon-btn" type="button" data-close aria-label="Fechar">×</button></div><p class="hint u-margin-0" >${esc(R.fonte)} · ${esc(R.reajuste)} · jornada de 40h</p>`;
  for (const [k, nome] of Object.entries(CARREIRA)) {
    h += `<h3 class="u-margin-top-14px">${nome}</h3><div class="scroll"><table class="data"><thead><tr><th>Classe</th>${[1, 2, 3, 4, 5].map(i => `<th class="r">${i}º nível</th>`).join("")}</tr></thead><tbody>` + [5, 4, 3, 2, 1, 0].map(c => `<tr><td><strong>${CLASSES[c]}</strong> <span class="hint">${c * 5 + 1}–${c * 5 + 5}</span></td>${[0, 1, 2, 3, 4].map(i => `<td class="money">${brl(R.carreiras[k][c * 5 + i])}</td>`).join("")}</tr>`).join("") + `</tbody></table></div>`;
  }
  h += `<div class="kd-grid u-margin-top-14px" ><div><h3>Emprego em comissão</h3><table class="data"><thead><tr><th>Nível</th><th class="r">Salário</th><th class="r">Gratificação ${R.gratificacaoPct}%</th></tr></thead><tbody>${["VI", "V", "IV", "III", "II", "I"].map(n => `<tr><td>${n}</td><td class="money">${brl(R.comissao[n].salario)}</td><td class="money">${brl(R.comissao[n].gratificacao)}</td></tr>`).join("")}</tbody></table></div>
    <div><h3>Funções gratificadas</h3><table class="data"><tbody>${Object.entries(FGN).map(([k, n]) => `<tr><td>${n}</td><td class="money">${brl(R.fg[k])}</td></tr>`).join("")}</tbody></table>
    <h3 class="u-margin-top-12px">Estágio e aprendizagem</h3><table class="data"><tbody>${Object.entries(BOLSA).map(([k, n]) => `<tr><td>${n}</td><td class="money">${brl(R.estagio[k])}</td></tr>`).join("")}</tbody></table>
    <h3 class="u-margin-top-12px">Benefícios ACT</h3><table class="data"><tbody><tr><td>Auxílio-alimentação</td><td class="money">${brl(R.beneficios.alimentacao)}</td></tr><tr><td>Auxílio-creche</td><td class="money">${brl(R.beneficios.creche)}</td></tr><tr><td>Abono de Natal</td><td class="money">${brl(R.beneficios.abonoNatal)}</td></tr><tr><td>Auxílio-funeral</td><td class="money">${brl(R.beneficios.funeral)}</td></tr></tbody></table></div></div>`;
  return h;
}
function csvRem() {
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Funcionário", "Matrícula", "Vínculo", "Enquadramento", "Nível previsto", "Salário/bolsa", "Gratificação", "Tipo de gratificação", "Remuneração (salário + gratificação)", `Auxílio-alimentação ${MESES3[S.m]}/${S.y}`, `Auxílio-transporte ${MESES3[S.m]}/${S.y}`, `Benefícios adicionais ${MESES3[S.m]}/${S.y}`, "Total com benefícios", "Observações"];
  const rows = remLista().map(({
    f,
    r,
    b,
    geral
  }) => [f.nome, f.matricula, VINC[f.vinculo] || VINC.efetivo, r.rotBase, r.previsto || "", n2(r.base), n2(r.grat), r.rotGrat, n2(r.total), n2(b.aa), n2(b.at), n2(b.ex), n2(geral), r.alertas.join("; ")]);
  return {
    nome: `coffito-remuneracao-${S.y}-${pad(S.m + 1)}.csv`,
    data: "﻿" + [head, ...rows].map(x => x.map(q).join(";")).join("\r\n")
  };
}
export function iniciarFeaturesRemuneracao() {
  S.rem = null;
  S.remBusca = "";
  S.remGrupo = "";
  S.remSetor = "";
}
export { CARREIRA, CLASSES, BOLSA, FGN, carreiraAuto, anosDeCasa, nivelPorTempo, fgAuto, remun, benDoMes, remLista, viewRem, fichaRem, tabelaSalarial, csvRem };
