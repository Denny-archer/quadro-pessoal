import { S } from "../core/estado.js";
import { diasCorr, funcMap, noQuadro, overlap } from "../core/colecoes.js";
import { esc } from "../core/dom.js";
import { classeCor } from "../core/cores.js";
import { DAY, HOJE, addAnos, addDias, fmt, hoje, iso, parse } from "../core/datas.js";
import { remun } from "./remuneracao.js";
import { brl, r2 } from "../core/formatacao.js";
import { diasFerias, reciboParcela } from "../core/estatisticas.js";
import { MESES } from "../core/constantes.js";
import * as RegrasFolha from "./folha/regras.js";
const GRUPOS = [["efcom", "Efetivos com emprego em comissão"], ["effg", "Efetivos com função gratificada"], ["efsem", "Efetivos sem comissão ou FG"], ["comiss", "Emprego em comissão sem vínculo"], ["cedido", "Cedidos de outros órgãos"], ["estag", "Estagiários"], ["aprend", "Jovens aprendizes"], ["fora", "Cedidos a outros órgãos"], ["inativo", "Inativos"]];
function grupoDe(f) {
  if (f.situacao === "inativo") return "inativo";
  if (f.situacao === "cedido") return "fora";
  if (f.vinculo === "estagiario") return "estag";
  if (f.vinculo === "aprendiz") return "aprend";
  if (f.vinculo === "cedido") return "cedido";
  if (f.vinculo === "comissionado") return "comiss";
  return f.funcaoTipo === "fg" ? "effg" : f.funcao ? "efcom" : "efsem";
}
function painelFerias() {
  const fm = S.func.filter(noQuadro);
  const itens = [];
  for (const f of fm) for (const c of controleFerias(f)) if (c.alerta) itens.push({
    f,
    c
  });
  if (!itens.length) return "";
  const ord = {
    vencido: 0,
    prazo: 1,
    agendar: 2
  };
  itens.sort((a, b) => ord[a.c.alerta] - ord[b.c.alerta] || (a.c.pa.limite || "").localeCompare(b.c.pa.limite || ""));
  let h = `<section class="panel"><div class="panel-head"><h2>Férias: prazos e pendências</h2><span class="hint">${itens.length} ${itens.length === 1 ? "item" : "itens"}</span></div><ul class="list">`;
  h += itens.map(({
    f,
    c
  }) => `<li><button class="link" type="button" data-ficha="${f.id}">${esc(f.nome)}</button>${c.alerta === "agendar" ? `<span class="prazo u-pc-var-c-abono" >agendar em nov/2026</span>` : `<span class="prazo ${classeCor(c.alerta === "vencido" ? "var(--bad)" : "var(--c-abono)", "pc")}" >${c.aProgramar} dias a programar</span>`}
    <span class="meta">aquisitivo ${fmt(c.pa.inicio)} a ${fmt(c.pa.fim)} · gozar até ${fmt(c.pa.limite)}${c.diasLimite != null && c.alerta !== "agendar" ? ` (${c.diasLimite < 0 ? "vencido há " + -c.diasLimite : "faltam " + c.diasLimite} dias)` : ""}</span></li>`).join("");
  return h + `</ul></section>`;
}
function periodoAquisitivo(adm) {
  if (!adm) return null;
  const a = parse(adm);
  let ini = new Date(hoje.getFullYear(), a.getMonth(), a.getDate());
  if (ini > hoje) ini = new Date(hoje.getFullYear() - 1, a.getMonth(), a.getDate());
  if (ini < a) return null;
  const fim = new Date(ini.getFullYear() + 1, ini.getMonth(), ini.getDate() - 1);
  return [iso(ini), iso(fim)];
}
const temFerias = f => ["efetivo", "comissionado", "aprendiz", "estagiario"].includes(f.vinculo || "efetivo");
const situacaoFerias = o => (o.fim || o.inicio) < HOJE ? "gozado" : o.inicio <= HOJE ? "em gozo" : "programado";
function periodosDe(f) {
  const pas = (f.periodosAquisitivos || []).slice().sort((a, b) => a.inicio.localeCompare(b.inicio)).map(p => ({
    ...p
  }));
  if (!f.admissao || !temFerias(f)) return pas;
  let ini;
  if (pas.length) ini = addAnos(pas[pas.length - 1].inicio, 1);else {
    let k = 0;
    while (addAnos(f.admissao, k + 1) <= HOJE) k++;
    ini = addAnos(f.admissao, k);
  }
  const est = f.vinculo === "estagiario",
    cFim = est ? f.contratoFim : "";
  while (ini <= HOJE && (!cFim || ini <= cFim)) {
    const fim = addDias(addAnos(ini, 1), -1);
    const pa = {
      inicio: ini,
      fim,
      limite: addAnos(fim, 1),
      direito: 30,
      gerado: true
    };
    if (est && cFim) {
      pa.limite = cFim < pa.limite ? cFim : pa.limite; // o recesso é gozado durante o contrato
      if (cFim < fim) pa.direito = Math.round(30 * (Math.round((parse(cFim) - parse(ini)) / DAY) + 1) / 365);
    }
    pas.push(pa);
    ini = addAnos(ini, 1);
  }
  if (est && cFim) for (const pa of pas) if (pa.limite > cFim) pa.limite = cFim;
  return pas;
}
function validaFerias(f, c, ini, fim, abono, ignoraId) {
  const E = [],
    A = [],
    est = f.vinculo === "estagiario";
  const dias = Math.round((parse(fim) - parse(ini)) / DAY) + 1;
  let diasDobro = 0,
    saldo = null;
  const choque = S.ocs.find(o => o.func === f.id && o.tipo === "ferias" && o.id !== ignoraId && o.inicio <= fim && (o.fim || o.inicio) >= ini);
  if (choque) E.push(`Já existem férias lançadas de ${fmt(choque.inicio)} a ${fmt(choque.fim || choque.inicio)} nessas datas. Edite aquele lançamento em vez de criar outro.`);
  if (c) {
    const outras = c.parcelas.filter(o => o.id !== ignoraId);
    const usados = outras.reduce((n, o) => n + diasCorr(o) + (Number(o.abonoPecuniario) || 0), 0) + (Number(c.pa.abonoSemData) || 0);
    saldo = c.direito - usados;
    if (dias + abono > saldo) E.push(`O período aquisitivo tem ${saldo} dia(s) de saldo e este lançamento usa ${dias + abono}${abono ? ` (${dias} de gozo + ${abono} vendidos)` : ""}.`);
    if (!est) {
      const vendidos = outras.reduce((n, o) => n + (Number(o.abonoPecuniario) || 0), 0) + (Number(c.pa.abonoSemData) || 0) + abono;
      if (vendidos > Math.floor(c.direito / 3)) E.push(`O abono pecuniário é de no máximo ${Math.floor(c.direito / 3)} dias, 1/3 das férias (CLT art. 143).`);
      if (abono) A.push(`Abono: o pedido por escrito vale se feito até ${fmt(addDias(c.pa.fim, -15))}, 15 dias antes do fim do período aquisitivo. Depois disso, a venda depende de concordância da COFFITO (CLT art. 143, §1º).`);
      if (outras.length + 1 > 3) E.push("As férias podem ser divididas em no máximo 3 períodos (CLT art. 134, §1º).");
      if (dias < 5) E.push("Cada período precisa ter pelo menos 5 dias corridos (CLT art. 134, §1º).");
      const resta = saldo - dias - abono;
      const tem14 = dias >= 14 || outras.some(o => diasCorr(o) >= 14);
      if (resta > 0 && resta < 5) E.push(`Sobrariam ${resta} dia(s), menos que o mínimo de 5 de um período. Aumente este período ou venda esses dias como abono.`);else if (resta > 0 && outras.length + 1 >= 3) E.push(`Este seria o 3º período, mas sobrariam ${resta} dia(s) sem poder ser gozados.`);
      if (!tem14 && (resta < 14 || outras.length + 1 >= 3)) E.push("Um dos períodos precisa ter pelo menos 14 dias corridos (CLT art. 134, §1º).");
    }
    const janela = `de ${fmt(addDias(c.pa.fim, 1))} a ${fmt(c.pa.limite)}`;
    if (ini <= c.pa.fim) (est ? A : E).push(`${est ? "O recesso" : "As férias"} deste período aquisitivo só podem começar depois que ele se completa, ${janela} (CLT art. 134).`);
    if (c.pa.limite && fim > c.pa.limite) {
      diasDobro = Math.min(dias, Math.round((parse(fim) - parse(c.pa.limite)) / DAY));
      if (c.pa.limite >= HOJE && !est) E.push(`As férias deste período aquisitivo precisam terminar até ${fmt(c.pa.limite)}: o período permitido é ${janela} (CLT art. 134).`);else A.push(`Período concessivo vencido em ${fmt(c.pa.limite)}: ${diasDobro} dia(s) são pagos em dobro (CLT art. 137).`);
    }
  }
  if (!est) {
    const fer = S.cfg.feriados || [],
      dt = parse(ini);
    const dmais = n => {
      const d = new Date(dt);
      d.setDate(d.getDate() + n);
      return d;
    };
    const repouso = d => d.getDay() === 0 || fer.includes(iso(d));
    if (dt.getDay() === 0 || dt.getDay() === 6 || fer.includes(ini)) E.push("As férias não podem começar em sábado, domingo ou feriado.");else if (repouso(dmais(1)) || repouso(dmais(2))) E.push("As férias não podem começar nos 2 dias que antecedem feriado ou o repouso semanal (CLT art. 134, §3º).");else if (dt.getDay() === 4) A.push("Começa numa quinta-feira: se o sábado também é dia de repouso, a CLT veda (art. 134, §3º). Prefira de segunda a quarta.");
    const antes = Math.round((dt - hoje) / DAY);
    if (antes >= 0 && antes < 30) A.push(`Aviso de férias com ${antes} dia(s) de antecedência; a CLT pede 30 dias (art. 135).`);
  }
  return {
    E,
    A,
    dias,
    diasDobro,
    saldo
  };
}
function reciboFerias(f, dias, abono, diasDobro = 0, ini = HOJE) {
  if (f.vinculo === "estagiario") return {
    est: true
  };
  const r = remun(f, ini);
  if (!r || f.situacao === "cedido") return null;
  const tit = r2(r.base * (Number(f.titulacaoPct) || 0) / 100),
    anu = r2(r.base * (Number(f.anuenioPct) || 0) / 100);
  const rem = r2(r.base + r.grat + tit + anu),
    dia = rem / 30;
  const ferias = r2(dia * dias),
    dobro = r2(dia * diasDobro * 2),
    terco = r2((ferias + dobro) / 3);
  const abonoV = r2(dia * abono),
    tercoAb = r2(abonoV / 3);
  // A remuneração simples integra a base previdenciária; o adicional da dobra não.
  const baseSimples = r2(dia * (dias + diasDobro)),
    trib = r2(baseSimples + r2(baseSimples / 3)),
    F = RegrasFolha;
  const inssV = F.inss(trib),
    baseIR = r2(ferias + dobro + terco + tercoAb),
    irr = F.irrf(baseIR, inssV, Number(f.dependentesIR) || 0),
    ir = irr.ir;
  const bruto = r2(ferias + dobro + terco + abonoV + tercoAb);
  return {
    rem,
    dia: r2(dia),
    ferias,
    dobro,
    terco,
    abonoV,
    tercoAb,
    trib,
    baseIR,
    irBase: irr.base,
    inss: inssV,
    ir,
    bruto,
    liquido: r2(bruto - inssV - ir)
  };
}
function tabelaRecibo(rc, dias, abono, diasDobro, ini) {
  if (!rc) return `<span class="hint">Sem cálculo: cedido ou sem remuneração na tabela.</span>`;
  if (rc.est) return `<span class="hint">Recesso remunerado do estágio (Lei 11.788/2008, art. 13): a bolsa continua sendo paga normalmente, sem 1/3.</span>`;
  const l = (t, v, c = "") => `<tr><td>${t}</td><td class="${c}">${v}</td></tr>`;
  return `<table>${l(`Férias: ${dias} dia(s) × ${brl(rc.dia)}`, brl(rc.ferias))}${rc.dobro ? l(`Dobra (art. 137): ${diasDobro} dia(s)`, brl(rc.dobro)) : ""}${l("1/3 constitucional", brl(rc.terco))}
    ${abono ? l(`Abono pecuniário: ${abono} dia(s)`, brl(rc.abonoV)) + l("1/3 sobre o abono", brl(rc.tercoAb)) : ""}
    ${l("<strong>Total bruto</strong>", `<strong>${brl(rc.bruto)}</strong>`)}${l("INSS", "−" + brl(rc.inss))}${l("IRRF (em separado)", "−" + brl(rc.ir))}
    ${l("<strong>Líquido do recibo</strong>", `<strong>${brl(rc.liquido)}</strong>`)}</table>
    <div class="hint">Base: remuneração de ${brl(rc.rem)} vigente em ${fmt(ini)}, início das férias (CLT art. 142). INSS sobre ${brl(rc.trib)} (férias + 1/3). IRRF sobre ${brl(rc.irBase)} (${brl(rc.baseIR)} tributável${abono ? ", com o 1/3 do abono" : ""}, menos as deduções)${abono ? "; o abono não tem INSS, FGTS nem IR, e o 1/3 do abono só tem IR (Cosit 209/2021)" : ""}. Pagar até <strong>${fmt(addDias(ini, -2))}</strong> (2 dias antes do início, CLT art. 145). O INSS é acertado com a folha do mês.</div>`;
}
function controleFerias(f) {
  const pas = periodosDe(f);
  const mine = S.ocs.filter(o => o.func === f.id && o.tipo === "ferias");
  return pas.map(pa => {
    const parcelas = mine.filter(o => o.aquisitivo === pa.inicio).sort((a, b) => a.inicio.localeCompare(b.inicio));
    const dias = o => overlap(o, parse(o.inicio), parse(o.fim || o.inicio));
    const programado = parcelas.reduce((n, o) => n + dias(o), 0);
    const gozado = parcelas.reduce((n, o) => n + diasFerias([o], parse(o.inicio), parse(o.fim || o.inicio)).goz, 0);
    const vendido = parcelas.reduce((n, o) => n + (Number(o.abonoPecuniario) || 0), 0) + (Number(pa.abonoSemData) || 0);
    const direito = Number(pa.direito) || 30;
    const aProgramar = Math.max(0, direito - programado - vendido);
    const diasLimite = pa.limite ? Math.round((parse(pa.limite) - hoje) / DAY) : null;
    let alerta = "";
    if (pa.pendencia && !parcelas.length) alerta = "agendar"; // pendência da planilha some quando o período é lançado
    else if (aProgramar > 0 && diasLimite != null && diasLimite < 0) alerta = "vencido";else if (aProgramar > 0 && diasLimite != null && diasLimite <= 120) alerta = "prazo";
    return {
      pa,
      parcelas,
      programado,
      gozado,
      vendido,
      direito,
      aProgramar,
      diasLimite,
      alerta
    };
  });
}
function periodoVigente(cf) {
  const completos = cf.filter(c => c.pa.fim < HOJE);
  return completos.find(c => c.aProgramar > 0 || c.parcelas.some(o => (o.fim || o.inicio) >= HOJE)) || cf.find(c => c.pa.fim >= HOJE) || completos[completos.length - 1] || null;
}
function fichaFerias(f) {
  const todos = controleFerias(f),
    vig = periodoVigente(todos),
    cf = vig ? [vig] : [];
  const rec = f.vinculo === "estagiario";
  let h = `<h3 class="u-folha-margin-top-22px">Controle de ${rec ? "recesso" : "férias"} por período aquisitivo</h3>`;
  if (!cf.length) return temFerias(f) && !todos.length ? h + `<div class="hint">Informe a data de admissão no cadastro para controlar ${rec ? "o recesso" : "as férias"}.</div>` : "";
  S.recAbertos = S.recAbertos || new Set();
  for (const c of cf) {
    const tag = c.alerta === "agendar" ? `<span class="prazo u-folha-pc-var-c-abono" >${esc(c.pa.pendencia.toLowerCase())}</span>` : c.alerta === "vencido" ? `<span class="prazo u-folha-pc-var-bad" >prazo vencido com ${c.aProgramar} dias a programar</span>` : c.alerta === "prazo" ? `<span class="prazo u-folha-pc-var-c-abono" >${c.aProgramar} dias a programar até ${fmt(c.pa.limite)}</span>` : c.aProgramar ? `<span class="prazo u-folha-pc-var-c-viagem" >${c.aProgramar} dias a programar</span>` : `<span class="prazo u-folha-pc-var-good" >período concluído</span>`;
    const emCurso = c.pa.fim >= HOJE;
    h += `<div class="feriasbox"><div class="fb-head"><div><strong>Aquisitivo ${fmt(c.pa.inicio)} a ${fmt(c.pa.fim)}</strong><div class="hint">${emCurso ? "em aquisição · " : ""}gozar até ${fmt(c.pa.limite)}${c.pa.aba ? " · aba " + esc(c.pa.aba) : ""}${c.pa.analise ? " · " + esc(c.pa.analise) : ""}${c.pa.gerado ? " · período calculado pela admissão" : ""}</div></div>${tag}</div>`;
    const pc = v => `${Math.max(0, v) / Math.max(c.direito, 1) * 100}%`;
    h += `<div class="fb-bar" role="img" aria-label="${c.gozado} gozados, ${c.programado - c.gozado} programados, ${c.vendido} vendidos, ${c.aProgramar} a programar de ${c.direito}"><i class="u-folha-background-var-c-ferias" data-ui-width="${pc(c.gozado)}"></i><i class="u-folha-background-color-mix-in-srgb-var-c-ferias-45-" data-ui-width="${pc(c.programado - c.gozado)}"></i><i class="u-folha-background-var-c-abono" data-ui-width="${pc(c.vendido)}"></i></div>`;
    h += `<div class="fb-nums"><span><strong class="num">${c.gozado}</strong> gozados</span><span><strong class="num">${c.programado - c.gozado}</strong> programados</span><span><strong class="num">${c.vendido}</strong> vendidos</span><span><strong class="num">${c.aProgramar}</strong> a programar</span><span>de <strong class="num">${c.direito}</strong></span></div>`;
    c.parcelas.forEach((o, i) => {
      const dias = diasCorr(o),
        ab = Number(o.abonoPecuniario) || 0,
        fim = o.fim || o.inicio;
      const st = situacaoFerias(o);
      const dobro = c.pa.limite && fim > c.pa.limite ? Math.min(dias, Math.round((parse(fim) - parse(c.pa.limite)) / DAY)) : 0;
      const rc = reciboFerias(f, dias, ab, dobro, o.inicio),
        aberto = S.recAbertos.has(o.id);
      h += `<div class="fb-par"><div><button class="link" type="button" data-frec="${o.id}" aria-expanded="${aberto}"><span class="caret" aria-hidden="true">›</span> ${esc(o.parcela || i + 1 + "º")} período · ${fmt(o.inicio)} a ${fmt(fim)}</button>
        <div class="hint">${dias} dias${ab ? ` + ${ab} vendidos` : ""} · ${st}${rc && !rc.est ? ` · pagar até ${fmt(addDias(o.inicio, -2))}` : ""}${o.avisoFerias ? " · aviso: " + esc(o.avisoFerias) : ""}${o.statusPlanilha && o.statusPlanilha !== "OK" ? " · " + esc(o.statusPlanilha) : ""}</div></div>
        <span class="num u-folha-font-weight-600" >${rc && !rc.est ? brl(rc.liquido) : ""}</span>
        <button class="btn small" type="button" data-oc-open="${o.id}">Editar</button>
        ${aberto ? `<div class="fb-rec calc-ferias">${tabelaRecibo(rc, dias - dobro, ab, dobro, o.inicio)}</div>` : ""}</div>`;
    });
    if (c.pa.abonoSemData) h += `<div class="hint">${c.pa.abonoSemData} dias de abono pecuniário sem data${c.pa.obs ? " — " + esc(c.pa.obs) : ""}</div>`;
    if (c.aProgramar > 0) {
      const restam = 3 - c.parcelas.length,
        tem14 = c.parcelas.some(o => diasCorr(o) >= 14);
      const vendMax = Math.max(0, Math.floor(c.direito / 3) - c.vendido);
      const regra = rec ? `Restam ${c.aProgramar} dias de recesso, que podem ser divididos livremente e precisam ser gozados até ${fmt(c.pa.limite)}${f.contratoFim && c.pa.limite === f.contratoFim ? ", fim do contrato" : ""}.` : restam <= 0 ? `Restam ${c.aProgramar} dias, mas já há 3 períodos lançados: revise os lançamentos.` : `Restam ${c.aProgramar} dias em até ${restam} período(s)${tem14 ? "" : ", um deles com pelo menos 14 dias"}, cada um com pelo menos 5${vendMax ? `; até ${vendMax} dia(s) podem ser vendidos (abono)` : ""}.`;
      h += `<div class="fb-regra"><span>${regra}</span><button class="btn small primary" type="button" data-new-ferias="${f.id}|${c.pa.inicio}">+ Lançar período de ${rec ? "recesso" : "férias"}</button></div>`;
    } else h += `<div class="fb-regra"><span>Todos os ${c.direito} dias deste período estão lançados.</span></div>`;
    h += `</div>`;
  }
  const anteriores = todos.filter(c => vig && c.pa.inicio < vig.pa.inicio && (c.parcelas.length || c.vendido)).reverse();
  if (anteriores.length) {
    h += `<details class="fb-hist"><summary>Períodos anteriores (${anteriores.length})</summary><ul class="fb-list">${anteriores.map(c => `<li><strong>${fmt(c.pa.inicio)} a ${fmt(c.pa.fim)}</strong> · ${c.programado + c.vendido} de ${c.direito} dias usados (${c.gozado} gozados${c.vendido ? `, ${c.vendido} vendidos` : ""})${c.aProgramar ? ` · <span class="u-folha-color-var-c-abono">${c.aProgramar} sem lançar</span>` : ""}
        <div class="hint">${c.parcelas.map(o => `<button class="link" type="button" data-oc-open="${o.id}">${esc(o.parcela || "")} ${fmt(o.inicio)} a ${fmt(o.fim || o.inicio)}</button> (${diasCorr(o)} dias)`).join(" · ")}</div></li>`).join("")}</ul></details>`;
  }
  return h;
}
function painelFeriasMes() {
  const fm = funcMap(),
    a = new Date(S.y, S.m, 1),
    b = new Date(S.y, S.m + 1, 0),
    ini = iso(a),
    fim = iso(b);
  const lst = S.ocs.filter(o => o.tipo === "ferias" && fm[o.func] && overlap(o, a, b)).sort((x, y) => x.inicio.localeCompare(y.inicio));
  const d = diasFerias(lst, a, b);
  // recibos com pagamento previsto neste mês
  const pagar = S.ocs.filter(o => o.tipo === "ferias" && fm[o.func]).map(o => ({
    o,
    data: addDias(o.inicio, -2)
  })).filter(x => x.data >= ini && x.data <= fim);
  let tot = 0;
  for (const x of pagar) {
    const rc = reciboParcela(x.o, fm[x.o.func]);
    if (rc && !rc.est) tot += rc.liquido;
  }
  let h = `<section class="panel"><div class="panel-head"><div><h2>Férias em ${MESES[S.m]} de ${S.y}</h2><div class="hint">${d.pessoas.size} ${d.pessoas.size === 1 ? "pessoa" : "pessoas"} · ${d.total} dias no mês (${d.goz} gozados, ${d.prog} programados) · ${pagar.length} ${pagar.length === 1 ? "recibo" : "recibos"} a pagar no mês: ${brl(tot)}</div></div></div>`;
  if (!lst.length) return h + `<div class="empty">Nenhuma férias lançada neste mês.</div></section>`;
  h += `<div class="scroll"><table class="data"><thead><tr><th>Funcionário</th><th>Período</th><th class="r">Dias no mês</th><th>Situação</th><th>Pagar até</th><th class="r">Líquido do recibo</th></tr></thead><tbody>`;
  h += lst.map(o => {
    const f = fm[o.func],
      rc = reciboParcela(o, f),
      dm = overlap(o, a, b),
      sit = situacaoFerias(o);
    return `<tr class="click" data-ficha="${f.id}"><td><strong>${esc(f.nome)}</strong><br><span class="hint">${esc(o.parcela ? o.parcela + " período" : "")}${o.aquisitivo ? ` · aquisitivo ${fmt(o.aquisitivo)} a ${fmt(o.aquisitivoFim)}` : ""}</span></td>
      <td>${fmt(o.inicio)} a ${fmt(o.fim || o.inicio)}<br><span class="hint">${diasCorr(o)} dias${Number(o.abonoPecuniario) ? ` + ${o.abonoPecuniario} vendidos` : ""}</span></td>
      <td class="r num">${dm}</td><td><span class="prazo ${classeCor(sit === "gozado" ? "var(--muted)" : sit === "em gozo" ? "var(--c-ferias)" : "var(--c-viagem)", "pc")}" >${sit}</span></td>
      <td>${rc && !rc.est ? fmt(addDias(o.inicio, -2)) : "—"}</td><td class="money">${rc && !rc.est ? brl(rc.liquido) : rc?.est ? '<span class="hint">recesso</span>' : "—"}</td></tr>`;
  }).join("");
  return h + `</tbody></table></div></section>`;
}
export { GRUPOS, grupoDe, controleFerias, fichaFerias, painelFerias, periodoAquisitivo, temFerias, situacaoFerias, periodosDe, validaFerias, reciboFerias, tabelaRecibo, periodoVigente, painelFeriasMes };
