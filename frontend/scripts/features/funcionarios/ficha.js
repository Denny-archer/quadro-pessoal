import { classeCor } from "../../core/cores.js";
/** Funcionalidade: funcionarios / ficha. */
import { S } from "../../core/estado.js";
import { byName, noQuadro, overlap, naoUtil } from "../../core/colecoes.js";
import { grupoDe, GRUPOS, periodoAquisitivo, fichaFerias } from "../ferias.js";
import { foraHoje, stats } from "../../core/estatisticas.js";
import { esc } from "../../core/dom.js";
import { VINC_TAG, TIPOS, VINC, FUNCAO_TIPO, AUSENCIAS, MESES } from "../../core/constantes.js";
import { prazoContrato, temContrato, duracaoTxt, passaDe2Anos, prazoPill, tempoCasa } from "../contratos.js";
import { semanaDe, intervaloDe, totaisSemana, DIAS_UTEIS, horasDia, mins, WD_NOME, hN, checaHibrido } from "../../core/jornada.js";
import { cap, fmt, parse, DAY, iso, HOJE } from "../../core/datas.js";
import { brl, fmtH } from "../../core/formatacao.js";
import { fichaAbonos } from "../abonos.js";
import { fichaRem } from "../remuneracao.js";
import { fichaExtras } from "../beneficios-extras.js";
import { indAtestados } from "../atestados.js";
import { legend } from "../panorama/indicadores.js";
import { tabelaLanc } from "../ocorrencias/listagem.js";
function viewFunc() {
  const fs = [...S.func].sort(byName);
  const q = S.fBusca.trim().toLowerCase();
  const lst = fs.filter(f => (!q || [f.nome, f.setor, f.cargo, f.matricula, f.funcao].some(x => (x || "").toLowerCase().includes(q))) && (!S.fGrupo || grupoDe(f) === S.fGrupo) && (!S.fSetor || f.setor === S.fSetor));
  const setores = [...new Set(fs.map(f => f.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (!S.sel || !fs.find(f => f.id === S.sel)) S.sel = (lst[0] || fs[0])?.id || null;
  const foraIds = Object.fromEntries(foraHoje().map(o => [o.func, o.tipo]));
  let h = `<div class="fwrap"><aside class="panel"><h3>Equipe · ${fs.filter(noQuadro).length} em exercício</h3>
    <input id="busca-func" type="search" placeholder="Buscar nome, cargo, setor, matrícula" value="${esc(S.fBusca)}" aria-label="Buscar funcionário">
    <div class="ffilt"><select id="f-grupo" aria-label="Filtrar por vínculo"><option value="">Todos os vínculos</option>${GRUPOS.map(([k, t]) => `<option value="${k}" ${S.fGrupo === k ? "selected" : ""}>${t}</option>`).join("")}</select>
    <select id="f-setorf" aria-label="Filtrar por setor"><option value="">Todos os setores</option>${setores.map(x => `<option ${S.fSetor === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>
    ${S.fGrupo || S.fSetor || q ? `<div class="hint u-margin-top-6px" >${lst.length} de ${fs.length}</div>` : ""}
    <div class="flist">`;
  h += lst.map(f => `<button type="button" data-sel="${f.id}" aria-current="${f.id === S.sel}"><span><span class="n">${esc(f.nome)}</span>${VINC_TAG[f.vinculo] ? `<span class="vinc-tag">${VINC_TAG[f.vinculo]}</span>` : ""}${f.situacao === "inativo" ? '<span class="chip-ex">inativo</span>' : ""}${f.situacao === "cedido" ? '<span class="chip-ex">cedido</span>' : ""}<br><span class="s">${esc(f.funcao || f.setor || f.cargo || "")}${(() => {
    const p = prazoContrato(f);
    return p && ["vencido", "critico", "atencao", "proximo", "semdata"].includes(p.sit) ? ` · <span class="u-font-weight-600 ${classeCor(p.cor, "color")}" >${p.txt}</span>` : "";
  })()}</span></span>${foraIds[f.id] ? `<span class="dot ${classeCor(TIPOS[foraIds[f.id]].cor, "c")}"  title="Hoje: ${TIPOS[foraIds[f.id]].nome}"></span>` : ""}</button>`).join("") || `<div class="empty">Nenhum resultado.</div>`;
  h += `</div></aside><section class="panel ficha-box">${S.sel ? ficha(S.func.find(f => f.id === S.sel)) : `<div class="empty">Cadastre um funcionário para ver a ficha. <button class="btn small primary" type="button" data-act="new-func">+ Funcionário</button></div>`}</section></div>`;
  return h;
}
function jornadaSemanal(f) {
  const s = semanaDe(f),
    iv = intervaloDe(f),
    t = totaisSemana(f);
  const faixa = (a, b) => a && b ? `<span class="num">${esc(a)}–${esc(b)}</span>` : `<span class="hint">—</span>`;
  let h = `<h3 class="u-margin-top-22px">Jornada semanal</h3><div class="scroll"><table class="jornada"><thead><tr><th>Dia</th><th>Formato</th><th>Presencial</th><th>Home office</th><th class="r">Horas</th></tr></thead><tbody>`;
  for (const d of DIAS_UTEIS) {
    const x = s[d] || {
        tipo: "P"
      },
      hd = horasDia(x, iv);
    const tag = x.tipo === "H" ? `<span class="ho-tag">HOME OFFICE</span>` : x.tipo === "M" ? `<span class="pres-tag">MISTO</span>` : `<span class="hint">Presencial</span>`;
    const ordem = x.tipo === "M" && mins(x.he) < mins(x.pe) ? ` <span class="hint">(home office antes)</span>` : "";
    h += `<tr><td><strong>${cap(WD_NOME[d])}</strong></td><td>${tag}</td><td>${x.tipo === "H" ? `<span class="hint">—</span>` : faixa(x.pe, x.ps)}</td><td>${x.tipo === "P" ? `<span class="hint">—</span>` : faixa(x.he, x.hs) + ordem}</td><td class="r num">${hN(hd.p + hd.h)}</td></tr>`;
  }
  const carga = Number(f.carga) || 0,
    bate = !carga || Math.abs(t.t - carga) < 0.01;
  h += `</tbody><tfoot><tr><td colspan="4">${hN(t.p)} presencial · ${hN(t.h)} home office${iv ? ` <span class="hint">(intervalo de ${iv} min descontado em períodos acima de 6h)</span>` : ""}</td><td class="r num ${classeCor(bate ? "inherit" : "var(--c-abono)", "color")}"  title="${bate ? "" : "Não bate com a carga cadastrada de " + carga + "h"}">${hN(t.t)}</td></tr></tfoot></table></div>`;
  return h;
}
function ficha(f) {
  const a = new Date(S.y, 0, 1),
    b = new Date(S.y, 11, 31);
  const mine = S.ocs.filter(o => o.func === f.id);
  const st = stats(mine, a, b);
  const saldoTotal = mine.filter(o => o.tipo === "banco").reduce((n, o) => n + (Number(o.horas) || 0), 0);
  const pa = periodoAquisitivo(f.admissao);
  let h = `<div class="ficha-head"><div><div class="eyebrow">${esc(f.matricula ? "Matrícula " + f.matricula : "Sem matrícula")}${f.exemplo ? '<span class="chip-ex">exemplo</span>' : ""}</div><h2>${esc(f.nome)}${f.nomeAbreviado ? ' <span class="chip-ex" title="Nome abreviado na planilha de origem — complete no cadastro">nome incompleto</span>' : ""}</h2><div class="sub">${esc(f.funcao ? `${f.funcao}${f.nivel ? " · Nível " + f.nivel : ""}` : [f.cargo, f.setor].filter(Boolean).join(" · ") || "Cargo e setor não informados")}</div>${f.funcao ? `<div class="sub u-margin-top-2px" >${esc([f.cargo, f.setor].filter(Boolean).join(" · "))}</div>` : ""}${f.situacao === "cedido" ? `<div class="sub u-margin-top-4px" ><span class="prazo u-pc-var-c-abono" >Cedido${f.cedidoPara ? " ao " + esc(f.cedidoPara) : " a outro órgão"}</span></div>` : ""}</div>
    <div class="u-display-flex-40"><button class="btn small" type="button" data-edit-func="${f.id}">Editar cadastro</button><button class="btn small primary" type="button" data-new-for="${f.id}">+ Lançamento</button></div></div>`;
  h += `<dl class="facts">
    <div><dt>Vínculo</dt><dd>${VINC[f.vinculo] || VINC.efetivo}${f.instituicao ? `<br><span class="hint">${esc(f.instituicao)}</span>` : ""}${f.orgaoOrigem ? `<br><span class="hint">origem: ${esc(f.orgaoOrigem)}</span>` : ""}</dd></div>
    ${f.funcao ? `<div><dt>${FUNCAO_TIPO[f.funcaoTipo] || "Cargo em comissão"}</dt><dd>${esc(f.funcao)}${f.nivel ? ` · Nível ${esc(f.nivel)}` : ""}${f.portariaFuncao ? `<br><span class="hint">${esc(f.portariaFuncao)}</span>` : ""}</dd></div>` : ""}
    ${f.cargo || f.ingresso ? `<div><dt>Cargo base</dt><dd>${esc(f.cargo || "—")}${f.ingresso ? `<br><span class="hint">ingresso: ${esc(f.ingresso)}</span>` : ""}</dd></div>` : ""}
    <div><dt>Jornada</dt><dd>${f.jornadaDiaria && temContrato(f) ? `${f.jornadaDiaria}h por dia · ` : ""}${esc(f.carga || "—")} h/semana</dd></div>
    ${temContrato(f) ? `<div><dt>Contrato</dt><dd>${fmt(f.contratoInicio)} a ${fmt(f.contratoFim)}${f.contratoInicio && f.contratoFim ? `<br><span class="hint">${duracaoTxt(f.contratoInicio, f.contratoFim)}${passaDe2Anos(f.contratoInicio, f.contratoFim) ? " · acima do limite de 2 anos" : ""}</span>` : ""}</dd></div>
    <div><dt>Situação do contrato</dt><dd>${prazoPill(prazoContrato(f))}${f.providencia ? `<br><span class="hint">providência: ${esc(f.providencia)}</span>` : ""}</dd></div>` : ""}
    <div><dt>Regime</dt><dd>${esc(f.regime || "—")}${f.regime === "Híbrido" ? `<br><span class="hint">${{
    diario: "misto todos os dias",
    dia: "1 dia home office + 1 dia misto"
  }[checaHibrido(semanaDe(f))] || "formato personalizado"}</span>` : ""}</dd></div>
    <div><dt>Admissão</dt><dd>${fmt(f.admissao)}${f.admissao ? `<br><span class="hint">${tempoCasa(f.admissao)} de casa</span>` : ""}</dd></div>
    <div><dt>Período aquisitivo atual</dt><dd>${pa ? `${fmt(pa[0])} a ${fmt(pa[1])}` : "—"}</dd></div>
    <div><dt>Auxílio-transporte</dt><dd>${f.usaTransporte ? `<span class="num">${brl(f.valorTransporte)}</span> <span class="hint">${S.cfg.atModo === "diario" ? "por dia" : "por mês"}</span>` : '<span class="hint">não utiliza</span>'}</dd></div>
    <div><dt>Banco de horas acumulado</dt><dd class="num ${classeCor(saldoTotal < 0 ? "var(--bad)" : saldoTotal > 0 ? "var(--good)" : "inherit", "color")}" >${fmtH(saldoTotal)}</dd></div>
  </dl>`;
  h += jornadaSemanal(f);
  h += fichaFerias(f);
  h += fichaAbonos(f);
  h += fichaRem(f);
  h += fichaExtras(f);
  {
    const i = indAtestados(f.id);
    if (i.n) h += `<h3 class="u-margin-top-22px">Atestados nos últimos 12 meses</h3><div class="fb-nums u-margin-top-4px" ><span><strong class="num">${i.n}</strong> atestados</span><span><strong class="num">${i.parc}</strong> sem afastamento (comparecimento)</span><span><strong class="num">${i.dias}</strong> dias perdidos</span><span title="nº de atestados² × dias perdidos">Bradford <strong class="num">${i.bradford.toLocaleString("pt-BR")}</strong></span></div>`;
  }
  h += `<h3 class="u-margin-top-22px">Em ${S.y}</h3><div class="stats">`;
  h += `<div class="stat u-c-var-c-ferias" ><div class="v">${st.ferias.dias}<span class="hint"> / 30</span></div><div class="l">${f.vinculo === "estagiario" ? "dias de recesso gozados" : "dias de férias gozados"}</div></div>`;
  for (const t of ["atestado", "abono", "viagem", "capacitacao"]) {
    const s = st[t];
    const extra = t === "capacitacao" && s.horas ? ` · ${s.horas} h` : "";
    h += `<div class="stat ${classeCor(TIPOS[t].cor, "c")}" ><div class="v">${s.dias}</div><div class="l">${s.dias === 1 ? "dia" : "dias"} de ${TIPOS[t].nome.toLowerCase()} · ${s.n}×${extra}</div></div>`;
  }
  h += `<div class="stat u-c-var-c-banco" ><div class="v">${fmtH(st.banco.horas).replace(" h", "")}</div><div class="l">horas no banco em ${S.y}</div></div></div>`;

  // faixa do ano
  const dias = {};
  for (const o of mine) {
    if (o.tipo === "banco" || !overlap(o, a, b)) continue;
    for (let t = Math.max(parse(o.inicio), a); t <= Math.min(parse(o.fim || o.inicio), b); t += DAY) {
      const k = iso(new Date(t));
      if (!dias[k] || AUSENCIAS.indexOf(o.tipo) < AUSENCIAS.indexOf(dias[k])) dias[k] = o.tipo;
    }
  }
  h += `<h3 class="u-margin-top-22px">Calendário de ${S.y}</h3><div class="scroll"><div class="yearstrip" aria-label="Calendário anual de afastamentos">`;
  h += `<span></span>` + Array.from({
    length: 31
  }, (_, i) => `<span class="u-text-align-center">${(i + 1) % 5 === 0 || i === 0 ? i + 1 : ""}</span>`).join("");
  for (let m = 0; m < 12; m++) {
    h += `<span class="ml">${MESES[m].slice(0, 3)}</span>`;
    const nd = new Date(S.y, m + 1, 0).getDate();
    for (let d = 1; d <= 31; d++) {
      if (d > nd) {
        h += `<i class="no"></i>`;
        continue;
      }
      const dt = new Date(S.y, m, d),
        k = iso(dt),
        wd = dt.getDay(),
        t = dias[k];
      h += `<i class="${t ? "on" : naoUtil(dt) ? "we" : ""} ${k === HOJE ? "t" : ""} ${t ? classeCor(TIPOS[t].cor, "c") : ""}"  title="${fmt(k)}${t ? " · " + TIPOS[t].nome : ""}"></i>`;
    }
  }
  h += `</div></div><div class="u-margin-top-10px">${legend()}</div>`;

  // lista de lançamentos
  const doAno = mine.filter(o => overlap(o, a, b)).sort((x, y) => y.inicio.localeCompare(x.inicio));
  h += `<h3 class="u-margin-top-22px">Lançamentos de ${S.y}</h3>`;
  h += doAno.length ? tabelaLanc(doAno, false) : `<div class="empty">Nenhum lançamento em ${S.y}.</div>`;
  return h;
}
export { viewFunc, jornadaSemanal, ficha };
