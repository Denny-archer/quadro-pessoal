import { classeCor } from "../core/cores.js";
import { S } from "../core/estado.js";
import { HOJE, addDias, cap, fmt, iso, pad } from "../core/datas.js";
import { estadoEm, folhaMes, remun } from "./remuneracao.js";
import { brl, n2, r2 } from "../core/formatacao.js";
import { byName, diasCorr, funcMap, noQuadro } from "../core/colecoes.js";
import { esc, toast } from "../core/dom.js";
import { MESES, VINC } from "../core/constantes.js";
import { reciboParcela } from "../core/estatisticas.js";
import { downloads } from "../core/api.js";
import { gerarXlsx } from "./folha/xlsx.js";
import { render } from "../core/render.js";
import * as RegrasFolha from "./folha/regras.js";
const RUB = {
  "000": "Bolsa-auxílio",
  "001": "Salário base",
  "019": "Gratificação por substituição",
  "022": "Auxílio-creche",
  "039": "Devolução de desconto indevido",
  "081": "Chefe de Setor - Nível II",
  "082": "Chefe de Setor - Nível III",
  "083": "Chefe de Setor - Nível IV",
  "084": "Assessor Especial - Nível III",
  "085": "Assessor Especial - Nível IV",
  "087": "Assessor - Nível I",
  "088": "Assessor - Nível II",
  "092": "FG Chefia",
  "093": "Adicional noturno 20%",
  "107": "Titulação 7,5%",
  "108": "Titulação 10%",
  "109": "Titulação 12,5%",
  "126": "Auxílio-alimentação",
  "127": "Auxílio-transporte",
  "401": "Hora extra 50%",
  "420": "Repouso remunerado (DSR)",
  "602": "Mensalidade sindical",
  "604": "Vale-transporte",
  "605": "Assistência médica",
  "609": "Insuficiência de saldo",
  "626": "Depósito judicial",
  "628": "Plano odontológico",
  "629": "Consignado Caixa",
  "631": "Regime próprio de previdência",
  "673": "Devolução de valores indevidos",
  "903": "INSS",
  "914": "IRRF",
  "998": "Insuficiência de saldo (crédito)"
};
const RUB_DESC = new Set(["602", "604", "605", "609", "626", "628", "629", "631", "673", "903", "914"]);
const folhaDoMes = (y, m) => (S.folhas || {})[`${y}-${pad(m + 1)}`] || null;
const TIT_COD = {
  "7.5": "107",
  "10": "108",
  "12.5": "109"
};
const ANU_COD = {
  1: "110",
  8: "111",
  10: "112",
  11: "113",
  12: "114",
  16: "115",
  18: "116",
  20: "117",
  25: "118",
  28: "119",
  30: "120",
  34: "121"
};
function codGrat(f0, rot, d) {
  if (/^FG Chefia/.test(rot || "")) return "092";
  if (/^FG/.test(rot || "")) return "";
  const f = estadoEm(f0, d),
    fn = f.funcao || "";
  const tipo = /assessor[a]? especial/i.test(fn) ? "Assessor Especial" : /assessor/i.test(fn) ? "Assessor" : /chef/i.test(fn) ? "Chefe de Setor" : "";
  return Object.keys(RUB).find(k => RUB[k] === `${tipo} - Nível ${f.nivel}`) || "";
}
const pctTxt = v => String(r2(Number(v) || 0)).replace(".", ",") + "%";
function folhaKpis(k) {
  return `<div class="kpis">
    <div class="kpi today"><span class="label">Líquido ${k.real ? "pago" : "estimado"}</span><span class="value u-folha-font-size-26px" >${brl(k.liq)}</span><span class="sub">${k.quando} · ${k.n} pessoas</span></div>
    <div class="kpi u-folha-k-var-brand" ><span class="label">Proventos</span><span class="value u-folha-font-size-24px" >${brl(k.prov)}</span><span class="sub">salários, adicionais e benefícios</span></div>
    <div class="kpi u-folha-k-var-c-atestado" ><span class="label">Descontos</span><span class="value u-folha-font-size-24px" >${brl(k.desc)}</span><span class="sub">INSS ${brl(k.inss)} · IRRF ${brl(k.ir)}</span></div>
    <div class="kpi u-folha-k-var-c-viagem" ><span class="label">FGTS</span><span class="value u-folha-font-size-24px" >${brl(k.fgts)}</span><span class="sub">encargo do COFFITO, não sai do salário</span></div>
    ${k.custo ? `<div class="kpi u-folha-k-var-c-abono" ><span class="label">Custo total</span><span class="value u-folha-font-size-24px" >${brl(k.custo)}</span><span class="sub">proventos + INSS patronal, RAT, FGTS e PIS</span></div>` : ""}
  </div>`;
}
function viewFolha() {
  if (!S.rem) return `<section class="panel"><div class="empty">Cadastre a tabela salarial para estimar a folha.</div></section>`;
  const fm = funcMap(),
    q = S.folBusca.trim().toLowerCase();
  const busca = `<div class="filters"><label>Buscar<input id="fol-busca" type="search" value="${esc(S.folBusca)}" placeholder="nome, código, função"></label></div>`;
  if (S.mode === "ano") {
    let h = `<section class="panel"><div class="panel-head"><h2>Folhas de ${S.y}</h2><span class="hint">estimativa baseada no cadastro, na tabela salarial e nos lançamentos nos demais meses</span></div><div class="scroll"><table class="data"><thead><tr><th>Mês</th><th>Origem</th><th class="r">Proventos</th><th class="r">Descontos</th><th class="r">Líquido</th></tr></thead><tbody>`;
    const ym0 = S.m,
      T = {
        p: 0,
        d: 0,
        l: 0
      };
    for (let m = 0; m < 12; m++) {
      const F = folhaDoMes(S.y, m);
      let p = 0,
        d = 0,
        l = 0,
        orig;
      if (F) {
        for (const x of F.pessoas) {
          p += x.a;
          d += x.d;
          l += x.l;
        }
        orig = "Folha importada";
      } else {
        S.m = m;
        for (const f of S.func) if (noQuadro(f)) {
          const fo = folhaMes(f);
          if (fo) {
            p += fo.bruto;
            d += fo.descontos;
            l += fo.liquido;
          }
        }
        orig = "Estimativa";
      }
      T.p += p;
      T.d += d;
      T.l += l;
      h += `<tr><td>${cap(MESES[m])}</td><td>${F ? '<span class="pill u-folha-c-var-good" >Folha importada</span>' : '<span class="hint">Estimativa</span>'}</td><td class="money">${brl(p)}</td><td class="money desc">−${brl(d)}</td><td class="money pagar">${brl(l)}</td></tr>`;
    }
    S.m = ym0;
    return h + `</tbody><tfoot><tr><th colspan="2">Total do ano</th><th class="money">${brl(T.p)}</th><th class="money">−${brl(T.d)}</th><th class="money">${brl(T.l)}</th></tr></tfoot></table></div></section>`;
  }
  const F = folhaDoMes(S.y, S.m),
    quando = `${MESES[S.m]} de ${S.y}`;
  if (!F) {
    const lst = S.func.filter(f => noQuadro(f)).map(f => ({
      f,
      fo: folhaMes(f)
    })).filter(x => x.fo).sort((a, b) => byName(a.f, b.f));
    const k = lst.reduce((t, {
      f,
      fo
    }) => ({
      prov: t.prov + fo.bruto,
      desc: t.desc + fo.descontos,
      liq: t.liq + fo.liquido,
      inss: t.inss + fo.inss,
      ir: t.ir + fo.ir.ir,
      fgts: t.fgts + fo.fgts
    }), {
      prov: 0,
      desc: 0,
      liq: 0,
      inss: 0,
      ir: 0,
      fgts: 0
    });
    let h = `<div class="banner warn"><span><strong>Estimativa da folha de ${quando}.</strong> Valores calculados a partir do cadastro, da tabela salarial e dos lançamentos (INSS e IRRF de 2026, férias, titulação, anuênio, vale-transporte). Hora extra, substituição e consignados variáveis precisam ser conferidos separadamente.</span></div>`;
    h += folhaKpis({
      ...k,
      real: false,
      quando,
      n: lst.length
    });
    const C = relContabil();
    h += secaoContabil(C) + secaoRubricas(C);
    h += `<section class="panel"><div class="panel-head"><h2>Folha estimada de ${quando}</h2><span class="hint">clique na linha para ver o contracheque por rubrica</span></div>${busca}<div class="scroll"><table class="data"><thead><tr><th>Funcionário</th><th class="r">Proventos</th><th class="r">INSS</th><th class="r">IRRF</th><th class="r">Outros descontos</th><th class="r">Líquido</th><th class="r">FGTS</th></tr></thead><tbody>`;
    h += lst.filter(({
      f
    }) => !q || [f.nome, f.matricula, f.funcao, f.cargo].some(x => (x || "").toLowerCase().includes(q))).map(({
      f,
      fo
    }) => `<tr class="click" data-fol="${f.id}" aria-expanded="${S.folAbertos.has(f.id)}"><td><span class="caret" aria-hidden="true">›</span> <strong>${esc(f.nome)}</strong>${f.matricula ? `<br><span class="hint">mat. ${esc(f.matricula)}</span>` : ""}${fo.ferias ? `<br><span class="hint">${fo.ferias} dia(s) de férias</span>` : ""}</td>
      <td class="money">${brl(fo.bruto)}</td><td class="money desc">${fo.inss ? "−" + brl(fo.inss) : "—"}</td><td class="money desc">${fo.ir.ir ? "−" + brl(fo.ir.ir) : "—"}</td><td class="money desc">${fo.descontos - fo.inss - fo.ir.ir > 0.004 ? "−" + brl(fo.descontos - fo.inss - fo.ir.ir) : "—"}</td><td class="money pagar">${brl(fo.liquido)}</td><td class="money">${fo.fgts ? brl(fo.fgts) : "—"}</td></tr>${S.folAbertos.has(f.id) ? memoContracheque(C.pessoas.find(p => p.id === f.id), 7) : ""}`).join("");
    return h + `</tbody><tfoot><tr><th>Total</th><th class="money">${brl(k.prov)}</th><th class="money">−${brl(k.inss)}</th><th class="money">−${brl(k.ir)}</th><th class="money">−${brl(k.desc - k.inss - k.ir)}</th><th class="money">${brl(k.liq)}</th><th class="money">${brl(k.fgts)}</th></tr></tfoot></table></div></section>` + secaoFeriasPag(C) + secaoDiarias(C);
  }

  // folha real importada
  const pessoas = F.pessoas.slice().sort((a, b) => (fm[a.f]?.nome || a.n).localeCompare(fm[b.f]?.nome || b.n, "pt-BR"));
  const fgtsDe = x => r2(x.bf * (/APRENDIZ/i.test(x.fn) ? 0.02 : 0.08));
  const k = pessoas.reduce((t, x) => ({
    prov: t.prov + x.a,
    desc: t.desc + x.d,
    liq: t.liq + x.l,
    inss: t.inss + (x.r["903"] || 0),
    ir: t.ir + (x.r["914"] || 0),
    fgts: t.fgts + fgtsDe(x)
  }), {
    prov: 0,
    desc: 0,
    liq: 0,
    inss: 0,
    ir: 0,
    fgts: 0
  });
  const G = F.resumoGeral || {};
  const enc = G.inssPatronal ? r2(G.inssPatronal + G.rat + G.fgts + G.pis) : 0;
  let h = `<div class="banner"><span><strong>Folha de ${quando} importada</strong> · ${esc(F.fonte || "")}${F.emissao ? ` · emitida em ${esc(F.emissao)}` : ""}. Clique numa linha para ver o contracheque e a comparação com a estimativa do sistema.</span></div>`;
  h += folhaKpis({
    ...k,
    real: true,
    quando,
    n: pessoas.length,
    custo: enc ? r2((G.proventos || k.prov) + enc) : 0
  });
  const C = relContabil();
  h += secaoContabil(C);
  if ((F.divergencias || []).length) h += `<section class="panel"><div class="panel-head"><h2>Pontos para conferir</h2><span class="hint">${F.divergencias.length} itens encontrados na análise da folha</span></div><ul class="list">${F.divergencias.map(d => `<li><span>${esc(d.texto)}</span><span class="prazo ${classeCor(d.nivel === "alta" ? "var(--bad)" : "var(--c-abono)", "pc")}" >${d.nivel === "alta" ? "Prioridade" : "Conferir"}</span>${d.detalhe ? `<span class="meta">${esc(d.detalhe)}</span>` : ""}</li>`).join("")}</ul></section>`;
  if (enc) h += `<section class="panel"><div class="panel-head"><h2>Encargos do empregador</h2><span class="hint">Resumo Geral da folha</span></div><div class="scroll"><table class="data"><tbody>
    <tr><td>INSS patronal (20% sobre ${brl(G.baseInss)})</td><td class="money">${brl(G.inssPatronal)}</td></tr>
    <tr><td>RAT × FAP (3,58%)</td><td class="money">${brl(G.rat)}</td></tr>
    <tr><td>FGTS (8%; 2% para aprendiz)</td><td class="money">${brl(G.fgts)}</td></tr>
    <tr><td>PIS sobre a folha (1%)</td><td class="money">${brl(G.pis)}</td></tr></tbody>
    <tfoot><tr><th>Total de encargos</th><th class="money">${brl(enc)}</th></tr></tfoot></table></div>
    ${G.proventos && Math.abs(G.proventos - k.prov) > 0.01 ? `<p class="hint u-folha-margin-10px-0-0" >O Resumo Geral soma ${brl(G.proventos)} de proventos e ${brl(G.liquido)} de líquido; a folha analítica soma ${brl(k.prov)} e ${brl(k.liq)}. Diferença de ${brl(G.proventos - k.prov)} nos proventos.</p>` : ""}</section>`;

  // resumo por rubrica
  const rub = {};
  for (const x of pessoas) for (const [c, v] of Object.entries(x.r)) {
    const o = rub[c] || (rub[c] = {
      v: 0,
      n: 0
    });
    o.v += v;
    o.n++;
  }
  h += `<section class="panel"><div class="panel-head"><h2>Resumo por rubrica</h2><span class="hint">soma dos contracheques</span></div><div class="scroll"><table class="data"><thead><tr><th>Código</th><th>Rubrica</th><th class="r">Proventos</th><th class="r">Descontos</th><th class="r">Pessoas</th></tr></thead><tbody>`;
  h += Object.keys(rub).sort().map(c => `<tr><td class="num">${c}</td><td>${esc(RUB[c] || c)}</td><td class="money">${RUB_DESC.has(c) ? "" : brl(rub[c].v)}</td><td class="money desc">${RUB_DESC.has(c) ? "−" + brl(rub[c].v) : ""}</td><td class="money">${rub[c].n}</td></tr>`).join("");
  h += `</tbody><tfoot><tr><th colspan="2">Total</th><th class="money">${brl(k.prov)}</th><th class="money">−${brl(k.desc)}</th><th></th></tr></tfoot></table></div></section>`;

  // por funcionário
  const vis = pessoas.filter(x => !q || [fm[x.f]?.nome, x.n, x.c, x.fn].some(v => (v || "").toLowerCase().includes(q)));
  const batem = pessoas.filter(x => {
    const f = fm[x.f],
      fo = f ? folhaMes(f) : null;
    return fo && Math.abs(fo.liquido - x.l) < 1;
  }).length;
  h += `<section class="panel"><div class="panel-head"><div><h2>Contracheques de ${quando}</h2><div class="hint">${batem} de ${pessoas.length} batem com a estimativa do sistema (diferença menor que R$ 1). As diferenças apontam o que revisar no cadastro: nível salarial, creche, viagens não lançadas, transporte, consignados.</div></div><span class="hint">${vis.length} de ${pessoas.length}</span></div>${busca}<div class="scroll"><table class="data"><thead><tr><th>Funcionário</th><th>Função</th><th class="r">Proventos</th><th class="r">Descontos</th><th class="r">Líquido pago</th><th class="r">Estimativa</th></tr></thead><tbody>`;
  for (const x of vis) {
    const f = fm[x.f],
      fo = f ? folhaMes(f) : null,
      dif = fo ? r2(fo.liquido - x.l) : null,
      aberto = S.folAbertos.has(x.c);
    h += `<tr class="click" data-fol="${x.c}" aria-expanded="${aberto}"><td><span class="caret" aria-hidden="true">›</span> <strong>${esc(f?.nome || x.n)}</strong><br><span class="hint">cód. ${esc(x.c)}${x.fer ? ` · ${x.fer} dia(s) de férias` : ""}${!f ? " · sem cadastro no painel" : ""}</span></td>
      <td>${esc(x.fn)}</td><td class="money">${brl(x.a)}</td><td class="money desc">${x.d ? "−" + brl(x.d) : "—"}</td><td class="money pagar">${brl(x.l)}</td>
      <td class="money">${fo ? `${brl(fo.liquido)}<br><span class="hint ${classeCor(Math.abs(dif) < 1 ? "var(--good)" : "var(--c-abono)", "color")}" >${Math.abs(dif) < 0.01 ? "igual" : (dif > 0 ? "+" : "−") + brl(Math.abs(dif))}</span>` : "—"}</td></tr>`;
    if (aberto) {
      const linhas = filt => Object.entries(x.r).filter(([c]) => filt(c)).sort().map(([c, v]) => `<tr><td><span class="num hint">${c}</span> ${esc(RUB[c] || c)}</td><td class="money">${brl(v)}</td></tr>`).join("") || `<tr><td colspan="2" class="hint">—</td></tr>`;
      h += `<tr class="memo"><td colspan="6"><div class="memo-grid">
        <div><h4>Proventos</h4><table class="data"><tbody>${linhas(c => !RUB_DESC.has(c))}</tbody><tfoot><tr><th>Total</th><th class="money">${brl(x.a)}</th></tr></tfoot></table></div>
        <div><h4>Descontos</h4><table class="data"><tbody>${linhas(c => RUB_DESC.has(c))}</tbody><tfoot><tr><th>Total</th><th class="money">${brl(x.d)}</th></tr><tr><th>Líquido</th><th class="money">${brl(x.l)}</th></tr></tfoot></table></div>
        <div><h4>Bases e cadastro</h4><p>Salário contratual ${brl(x.sal)} · base FGTS ${brl(x.bf)} (FGTS ${brl(fgtsDe(x))}) · dependentes de IR: ${x.dep}${x.fer ? ` · ${x.fer} dia(s) de férias no mês` : ""}.</p>
          ${fo ? `<p class="u-folha-margin-top-6px">Estimativa do sistema: proventos ${brl(fo.bruto)}, descontos ${brl(fo.descontos)}, líquido ${brl(fo.liquido)}. ${Math.abs(dif) < 1 ? "Bate com a folha." : "A diferença costuma vir de viagens, transporte, hora extra ou consignados que mudam no mês, ou do INSS acertado no recibo de férias."}</p>` : ""}</div>
      </div></td></tr>`;
    }
  }
  return h + `</tbody><tfoot><tr><th colspan="2">Total</th><th class="money">${brl(k.prov)}</th><th class="money">−${brl(k.desc)}</th><th class="money">${brl(k.liq)}</th><th></th></tr></tfoot></table></div></section>` + secaoFeriasPag(C) + secaoDiarias(C);
}
const ENC = {
  inssPatronal: 0.20,
  rat: 0.0358,
  pis: 0.01
};
function relContabil() {
  const fm = funcMap(),
    y = S.y,
    m = S.m,
    ini = iso(new Date(y, m, 1)),
    fim = iso(new Date(y, m + 1, 0));
  const F = folhaDoMes(y, m),
    real = !!F;
  const cad = f => ({
    mat: f.matricula || "",
    nome: f.nome,
    setor: f.setor || "",
    funcao: f.funcao || "",
    cargo: f.cargo || "",
    vinc: VINC[f.vinculo] || VINC.efetivo,
    adm: f.admissao || "",
    dep: Number(f.dependentesIR) || 0
  });
  let pessoas;
  if (real) {
    pessoas = F.pessoas.map(x => {
      const f = fm[x.f],
        ls = Object.entries(x.r).sort().map(([c, v]) => ({
          c,
          n: RUB[c] || c,
          ref: "",
          v
        }));
      return {
        ...(f ? cad(f) : {
          nome: x.n,
          setor: "",
          cargo: "",
          vinc: "",
          adm: ""
        }),
        mat: x.c,
        funcao: x.fn || f?.funcao || "",
        dep: x.dep ?? (f ? Number(f.dependentesIR) || 0 : 0),
        sal: x.sal,
        prov: ls.filter(l => !RUB_DESC.has(l.c)),
        desc: ls.filter(l => RUB_DESC.has(l.c)),
        tp: x.a,
        td: x.d,
        liq: x.l,
        baseInss: x.bf,
        baseFgts: x.bf,
        baseIr: null,
        fgts: r2(x.bf * (/APRENDIZ/i.test(x.fn) ? 0.02 : 0.08)),
        ferias: x.fer || 0,
        id: x.c,
        fid: f?.id || ""
      };
    });
  } else {
    pessoas = S.func.filter(noQuadro).map(f => ({
      f,
      fo: folhaMes(f)
    })).filter(x => x.fo).map(({
      f,
      fo
    }) => {
      const r = remun(f, fim),
        L = ([n, v, c, ref]) => ({
          c: c || "",
          n,
          ref: ref || "",
          v
        }),
        est = f.vinculo === "estagiario";
      return {
        ...cad(f),
        sal: r ? r.total : 0,
        prov: fo.prov.map(L),
        desc: fo.desc.map(L),
        tp: fo.bruto,
        td: fo.descontos,
        liq: fo.liquido,
        baseInss: est ? 0 : fo.tributavel,
        baseFgts: est ? 0 : fo.tributavel,
        baseIr: est ? null : fo.ir.base,
        fgts: fo.fgts,
        ferias: fo.ferias,
        id: f.id,
        fid: f.id
      };
    });
  }
  pessoas.sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  // recibos de férias pagos no mês (até 2 dias antes do início, CLT art. 145)
  const ferias = S.ocs.filter(o => o.tipo === "ferias" && fm[o.func]).map(o => ({
    o,
    pag: addDias(o.inicio, -2)
  })).filter(x => x.pag >= ini && x.pag <= fim).map(({
    o,
    pag
  }) => {
    const f = fm[o.func],
      rc = reciboParcela(o, f);
    if (!rc || rc.est) return null;
    return {
      f,
      o,
      pag,
      mat: f.matricula || "",
      nome: f.nome,
      setor: f.setor || "",
      dias: diasCorr(o),
      abono: Number(o.abonoPecuniario) || 0,
      rc,
      fgts: RegrasFolha.fgts(rc.trib, f.vinculo === "aprendiz")
    };
  }).filter(Boolean).sort((a, b) => a.pag.localeCompare(b.pag) || a.nome.localeCompare(b.nome, "pt-BR"));
  // diárias das viagens que começam no mês
  const diarias = S.ocs.filter(o => o.tipo === "viagem" && fm[o.func] && o.inicio >= ini && o.inicio <= fim).map(o => {
    const f = fm[o.func],
      qtd = Number(o.diarias) || 0,
      proprio = Number(o.valorDiaria) || 0,
      unit = proprio || Number(S.cfg.diaria) || 0;
    return {
      f,
      o,
      mat: f.matricula || "",
      nome: f.nome,
      setor: f.setor || "",
      destino: o.destino || o.obs || "",
      qtd,
      unit,
      proprio: !!proprio,
      total: r2(qtd * unit)
    };
  }).sort((a, b) => a.o.inicio.localeCompare(b.o.inicio) || a.nome.localeCompare(b.nome, "pt-BR"));
  const soma = (xs, g) => r2(xs.reduce((n, x) => n + (Number(g(x)) || 0), 0));
  const rubSoma = c => soma(pessoas, p => p.desc.filter(l => l.c === c).reduce((n, l) => n + l.v, 0));
  const T = {
    n: pessoas.length,
    prov: soma(pessoas, p => p.tp),
    desc: soma(pessoas, p => p.td),
    liq: soma(pessoas, p => p.liq),
    inss: rubSoma("903"),
    irrf: rubSoma("914"),
    baseInss: soma(pessoas, p => p.baseInss),
    fgts: soma(pessoas, p => p.fgts),
    fBruto: soma(ferias, x => x.rc.bruto),
    fInss: soma(ferias, x => x.rc.inss),
    fIr: soma(ferias, x => x.rc.ir),
    fLiq: soma(ferias, x => x.rc.liquido),
    fBase: soma(ferias, x => x.rc.trib),
    fFgts: soma(ferias, x => x.fgts),
    dQtd: soma(diarias, x => x.qtd),
    dTotal: soma(diarias, x => x.total),
    dSemValor: diarias.filter(x => x.qtd && !x.unit).length,
    dSemQtd: diarias.filter(x => !x.qtd).length
  };
  T.outros = r2(T.desc - T.inss - T.irrf);
  const G = real && F.resumoGeral && F.resumoGeral.inssPatronal ? F.resumoGeral : null;
  const enc = (base, fg) => ({
    base,
    inssPatronal: r2(base * ENC.inssPatronal),
    rat: r2(base * ENC.rat),
    pis: r2(base * ENC.pis),
    fgts: fg
  });
  const E = {
    folha: G ? {
      base: G.baseInss,
      inssPatronal: G.inssPatronal,
      rat: G.rat,
      pis: G.pis,
      fgts: G.fgts
    } : enc(T.baseInss, T.fgts),
    ferias: enc(T.fBase, T.fFgts)
  };
  for (const k of ["base", "inssPatronal", "rat", "pis", "fgts"]) E[k] = r2(E.folha[k] + E.ferias[k]);
  E.total = r2(E.inssPatronal + E.rat + E.pis + E.fgts);
  T.pagoFunc = r2(T.liq + T.fLiq + T.dTotal);
  T.custo = r2(T.prov + T.fBruto + T.dTotal + E.total);
  // resumo por rubrica: soma dos contracheques (a linha dividida por mudança no mês volta a ser uma rubrica só)
  const rub = {};
  for (const p of pessoas) for (const [tipo, ls] of [["P", p.prov], ["D", p.desc]]) for (const l of ls) {
    const n = l.c && RUB[l.c] ? RUB[l.c] : l.n.replace(/\s*\(\d{2} a .*\)$/, "");
    l.k = `${tipo}|${l.c}|${n}`;
    const o = rub[l.k] || (rub[l.k] = {
      k: l.k,
      tipo,
      c: l.c,
      n,
      v: 0,
      ids: new Set()
    });
    o.v += l.v;
    o.ids.add(p.id);
  }
  const rubricas = Object.values(rub).map(o => ({
    k: o.k,
    tipo: o.tipo,
    c: o.c,
    n: o.n,
    v: r2(o.v),
    q: o.ids.size
  })).sort((a, b) => (a.tipo === "P" ? 0 : 1) - (b.tipo === "P" ? 0 : 1) || (a.c || "999").localeCompare(b.c || "999") || a.n.localeCompare(b.n, "pt-BR"));
  return {
    real,
    F,
    G,
    quando: `${MESES[m]} de ${y}`,
    ym: `${y}-${pad(m + 1)}`,
    pessoas,
    ferias,
    diarias,
    T,
    E,
    rubricas
  };
}
function secaoContabil(C) {
  const {
      T,
      E
    } = C,
    l = (t, v, sub = "", cls = "") => `<tr><td>${t}${sub ? `<br><span class="hint">${sub}</span>` : ""}</td><td class="money ${cls}">${v}</td></tr>`;
  return `<section class="panel"><div class="panel-head"><div><h2>Relatório contábil · ${C.quando}</h2><div class="hint">Folha ${C.real ? "importada" : "estimada pelo sistema"}, recibos de férias pagos no mês, diárias de viagem e encargos do empregador, no molde da folha analítica: resumo geral, resumo por rubrica e contracheque de cada funcionário.</div></div>
    <div class="u-folha-display-flex-22"><button class="btn primary" type="button" data-act="rel-xlsx">Baixar Excel (.xlsx)</button><button class="btn" type="button" data-act="rel-print">Imprimir / PDF</button></div></div>
    <div class="kd-grid">
      <div><h3>Pagamentos aos funcionários</h3><table class="data"><tbody>
        ${l(`Folha mensal · proventos (${T.n} pessoas)`, brl(T.prov), "salários, gratificações, adicionais, bolsas e benefícios")}
        ${l("Folha mensal · descontos", "−" + brl(T.desc), `INSS ${brl(T.inss)} · IRRF ${brl(T.irrf)} · outros ${brl(T.outros)}`, "desc")}
        ${l("Folha mensal · líquido", brl(T.liq))}
        ${l(`Recibos de férias · líquido (${C.ferias.length})`, brl(T.fLiq), `bruto ${brl(T.fBruto)} · INSS ${brl(T.fInss)} · IRRF ${brl(T.fIr)}`)}
        ${l(`Diárias de viagem (${C.diarias.length} ${C.diarias.length === 1 ? "viagem" : "viagens"} · ${n2(T.dQtd).replace(",00", "")} diárias)`, brl(T.dTotal), T.dSemValor || T.dSemQtd ? `<span class="u-folha-color-var-c-abono">${[T.dSemQtd ? `${T.dSemQtd} sem quantidade` : "", T.dSemValor ? `${T.dSemValor} sem valor da diária` : ""].filter(Boolean).join(" · ")}</span>` : "indenizatórias: sem INSS, FGTS e IR")}
      </tbody><tfoot><tr><th>Total líquido pago aos funcionários</th><th class="money">${brl(T.pagoFunc)}</th></tr></tfoot></table></div>
      <div><h3>Encargos e recolhimentos</h3><table class="data"><tbody>
        ${l("INSS patronal (20%)", brl(E.inssPatronal), `base ${brl(E.base)}${E.ferias.base ? ` (férias ${brl(E.ferias.base)})` : ""}`)}
        ${l("RAT × FAP (3,58%)", brl(E.rat))}${l("PIS sobre a folha (1%)", brl(E.pis))}${l("FGTS (8%; aprendiz 2%)", brl(E.fgts), E.ferias.fgts ? `férias ${brl(E.ferias.fgts)}` : "")}
        ${l("INSS retido dos funcionários (GPS)", brl(r2(T.inss + T.fInss)), "folha + recibos de férias")}${l("IRRF retido (DARF)", brl(r2(T.irrf + T.fIr)), "folha + recibos de férias")}
      </tbody><tfoot><tr><th>Encargos do empregador</th><th class="money">${brl(E.total)}</th></tr><tr><th>Custo total do mês</th><th class="money u-folha-color-var-accent" >${brl(T.custo)}</th></tr></tfoot></table>
      <div class="hint u-folha-margin-top-6px" >Custo total = proventos da folha + recibos de férias (bruto) + diárias + encargos. ${C.G ? "Encargos da folha conforme o Resumo Geral importado; os das férias são calculados." : "Encargos estimados com as alíquotas do Resumo Geral de agosto/2026."}</div></div>
    </div></section>`;
}
function secaoRubricas(C) {
  let h = `<section class="panel"><div class="panel-head"><h2>Resumo por rubrica</h2><span class="hint">soma dos contracheques estimados · códigos da folha do COFFITO</span></div><div class="scroll"><table class="data"><thead><tr><th>Código</th><th>Rubrica</th><th class="r">Proventos</th><th class="r">Descontos</th><th class="r">Pessoas</th></tr></thead><tbody>`;
  h += C.rubricas.map(x => `<tr><td class="num">${esc(x.c || "—")}</td><td>${esc(x.n)}</td><td class="money">${x.tipo === "P" ? brl(x.v) : ""}</td><td class="money desc">${x.tipo === "D" ? "−" + brl(x.v) : ""}</td><td class="money">${x.q}</td></tr>`).join("");
  return h + `</tbody><tfoot><tr><th colspan="2">Total</th><th class="money">${brl(C.T.prov)}</th><th class="money">−${brl(C.T.desc)}</th><th></th></tr></tfoot></table></div></section>`;
}
function memoContracheque(p, cols) {
  if (!p) return "";
  const ls = xs => xs.map(l => `<tr><td><span class="num hint">${esc(l.c || "—")}</span> ${esc(l.n)}${l.ref ? ` <span class="hint">· ${esc(l.ref)}</span>` : ""}</td><td class="money">${brl(l.v)}</td></tr>`).join("") || `<tr><td colspan="2" class="hint">—</td></tr>`;
  return `<tr class="memo"><td colspan="${cols}"><div class="memo-grid">
    <div><h4>Proventos</h4><table class="data"><tbody>${ls(p.prov)}</tbody><tfoot><tr><th>Total</th><th class="money">${brl(p.tp)}</th></tr></tfoot></table></div>
    <div><h4>Descontos</h4><table class="data"><tbody>${ls(p.desc)}</tbody><tfoot><tr><th>Total</th><th class="money">${brl(p.td)}</th></tr><tr><th>Líquido</th><th class="money">${brl(p.liq)}</th></tr></tfoot></table></div>
    <div><h4>Bases e cadastro</h4><p>Matrícula ${esc(p.mat || "—")} · ${esc(p.vinc)}${p.cargo ? " · " + esc(p.cargo) : ""}${p.adm ? ` · admissão ${fmt(p.adm)}` : ""}</p>
      <p class="u-folha-margin-top-6px">Remuneração contratual ${brl(p.sal)} · base de INSS ${brl(p.baseInss)} · base de FGTS ${brl(p.baseFgts)} (FGTS ${brl(p.fgts)})${p.baseIr != null ? ` · base de cálculo do IRRF ${brl(p.baseIr)}` : ""} · dependentes de IR: ${p.dep}${p.ferias ? ` · ${p.ferias} dia(s) de férias no mês` : ""}.</p>
      ${p.fid ? `<p class="u-folha-margin-top-6px"><button class="link" type="button" data-ficha="${p.fid}">Abrir a ficha</button></p>` : ""}</div></div></td></tr>`;
}
function secaoFeriasPag(C) {
  const T = C.T;
  let h = `<section class="panel"><div class="panel-head"><div><h2>Recibos de férias pagos em ${C.quando}</h2><div class="hint">pagamento até 2 dias antes do início (CLT art. 145) · remuneração vigente no início do gozo (art. 142) · abono sem INSS e FGTS; o 1/3 do abono entra no IRRF (Cosit 209/2021)</div></div></div>`;
  if (!C.ferias.length) return h + `<div class="empty">Nenhum recibo de férias com pagamento neste mês.</div></section>`;
  h += `<div class="scroll"><table class="data"><thead><tr><th>Funcionário</th><th>Gozo</th><th class="r">Férias</th><th class="r">1/3</th><th class="r">Abono + 1/3</th><th class="r">Bruto</th><th class="r">INSS</th><th class="r">IRRF</th><th class="r">Líquido</th><th class="r">FGTS</th></tr></thead><tbody>`;
  h += C.ferias.map(x => `<tr class="click" data-ficha="${x.f.id}"><td><strong>${esc(x.nome)}</strong><br><span class="hint">mat. ${esc(x.mat || "—")} · pagar até ${fmt(x.pag)}</span></td>
    <td>${fmt(x.o.inicio)} a ${fmt(x.o.fim || x.o.inicio)}<br><span class="hint">${x.dias} dias${x.abono ? ` + ${x.abono} vendidos` : ""}</span></td>
    <td class="money">${brl(r2(x.rc.ferias + x.rc.dobro))}</td><td class="money">${brl(x.rc.terco)}</td><td class="money">${x.abono ? brl(r2(x.rc.abonoV + x.rc.tercoAb)) : "—"}</td><td class="money">${brl(x.rc.bruto)}</td>
    <td class="money desc">−${brl(x.rc.inss)}</td><td class="money desc">${x.rc.ir ? "−" + brl(x.rc.ir) : "—"}</td><td class="money pagar">${brl(x.rc.liquido)}</td><td class="money">${brl(x.fgts)}</td></tr>`).join("");
  return h + `</tbody><tfoot><tr><th colspan="5">Total</th><th class="money">${brl(T.fBruto)}</th><th class="money">−${brl(T.fInss)}</th><th class="money">−${brl(T.fIr)}</th><th class="money">${brl(T.fLiq)}</th><th class="money">${brl(T.fFgts)}</th></tr></tfoot></table></div></section>`;
}
function secaoDiarias(C) {
  const T = C.T;
  let h = `<section class="panel"><div class="panel-head"><div><h2>Diárias de viagem · ${C.quando}</h2><div class="hint">viagens que começam no mês · indenizatórias (CLT art. 457, §2º): sem INSS, FGTS e IR · valor do lançamento ou, se vazio, o padrão das regras (${S.cfg.diaria ? brl(S.cfg.diaria) : "não informado"}) · clique para completar o lançamento</div></div></div>`;
  if (!C.diarias.length) return h + `<div class="empty">Nenhuma viagem começando neste mês.</div></section>`;
  if (T.dSemValor || T.dSemQtd) h += `<div class="banner warn u-folha-margin-0-0-10px" ><span>${[T.dSemQtd ? `${T.dSemQtd} ${T.dSemQtd === 1 ? "viagem" : "viagens"} sem a quantidade de diárias` : "", T.dSemValor ? `${T.dSemValor} ${T.dSemValor === 1 ? "viagem" : "viagens"} sem o valor da diária` : ""].filter(Boolean).join(" · ")}. Complete no lançamento ou informe o valor padrão em Benefícios → Regras de cálculo.</span></div>`;
  const q = v => v ? n2(v).replace(",00", "") : "—";
  h += `<div class="scroll"><table class="data"><thead><tr><th>Funcionário</th><th>Período</th><th>Destino / motivo</th><th class="r">Diárias</th><th class="r">Valor da diária</th><th class="r">Total</th></tr></thead><tbody>`;
  h += C.diarias.map(x => `<tr class="click" data-oc-open="${x.o.id}"><td><strong>${esc(x.nome)}</strong><br><span class="hint">mat. ${esc(x.mat || "—")} · ${esc(x.setor)}</span></td>
    <td>${fmt(x.o.inicio)}${x.o.fim && x.o.fim !== x.o.inicio ? " a " + fmt(x.o.fim) : ""}</td><td>${esc(x.destino || "—")}</td><td class="r num">${q(x.qtd)}</td>
    <td class="money">${x.unit ? brl(x.unit) + (x.proprio ? "" : '<br><span class="hint">padrão</span>') : "—"}</td><td class="money pagar">${x.total ? brl(x.total) : "—"}</td></tr>`).join("");
  return h + `</tbody><tfoot><tr><th colspan="3">Total</th><th class="r num">${q(T.dQtd)}</th><th></th><th class="money">${brl(T.dTotal)}</th></tr></tfoot></table></div></section>`;
}
function abasContabeis(C) {
  const {
      T,
      E
    } = C,
    d = s => s ? fmt(s) : "",
    B = v => ({
      b: true,
      v
    });
  const resumo = [B(["COFFITO · Relatório contábil de pessoal"]), ["Competência", cap(C.quando)], ["Origem da folha", C.real ? `Folha importada${C.F.fonte ? " · " + C.F.fonte : ""}` : "Estimativa do sistema (regras da folha de agosto/2026)"], ["Emitido em", fmt(HOJE)], [], B(["Pagamentos aos funcionários", "Valor", "Observação"]), [`Folha mensal · proventos (${T.n} pessoas)`, T.prov, "salários, gratificações, adicionais, bolsas e benefícios"], ["Folha mensal · descontos", T.desc, `INSS ${n2(T.inss)} · IRRF ${n2(T.irrf)} · outros ${n2(T.outros)}`], ["Folha mensal · líquido", T.liq], [`Recibos de férias · bruto (${C.ferias.length})`, T.fBruto], ["Recibos de férias · INSS", T.fInss], ["Recibos de férias · IRRF", T.fIr], ["Recibos de férias · líquido", T.fLiq], [`Diárias de viagem (${C.diarias.length} viagens · ${T.dQtd} diárias)`, T.dTotal, T.dSemValor || T.dSemQtd ? `${T.dSemQtd} sem quantidade · ${T.dSemValor} sem valor` : "indenizatórias: sem INSS, FGTS e IR"], B(["Total líquido pago aos funcionários", T.pagoFunc]), [], B(["Encargos do empregador", "Valor", "Observação"]), ["INSS patronal (20%)", E.inssPatronal, `base ${n2(E.base)} (folha ${n2(E.folha.base)} · férias ${n2(E.ferias.base)})`], ["RAT × FAP (3,58%)", E.rat], ["PIS sobre a folha (1%)", E.pis], ["FGTS (8%; aprendiz 2%)", E.fgts, `folha ${n2(E.folha.fgts)} · férias ${n2(E.ferias.fgts)}`], B(["Total de encargos", E.total]), [], B(["Retenções a recolher", "Valor"]), ["INSS retido dos funcionários (GPS)", r2(T.inss + T.fInss)], ["IRRF retido (DARF)", r2(T.irrf + T.fIr)], [], B(["Custo total do mês", T.custo, "proventos da folha + recibos de férias (bruto) + diárias + encargos"]), [], [C.G ? "Encargos da folha conforme o Resumo Geral importado; os das férias são calculados." : "Valores estimados pelo sistema: hora extra, substituição e consignados variáveis não entram. Confira com a folha emitida."]];
  const rubs = [["Código", "Rubrica", "Tipo", "Valor", "Pessoas"], ...C.rubricas.map(x => [x.c || "—", x.n, x.tipo === "P" ? "Provento" : "Desconto", x.v, x.q]), B(["", "Total de proventos", "", T.prov]), B(["", "Total de descontos", "", T.desc]), B(["", "Líquido", "", T.liq])];
  const ana = [["Matrícula", "Funcionário", "Setor", "Função", "Vínculo", "Código", "Rubrica", "Referência", "Tipo", "Valor"]];
  for (const p of C.pessoas) {
    const id = [p.mat, p.nome, p.setor, p.funcao, p.vinc];
    for (const l of p.prov) ana.push([...id, l.c || "—", l.n, l.ref, "Provento", l.v]);
    for (const l of p.desc) ana.push([...id, l.c || "—", l.n, l.ref, "Desconto", l.v]);
    ana.push([...id, "", "Total de proventos", "", "Total", p.tp], [...id, "", "Total de descontos", "", "Total", p.td], B([...id, "", "Líquido", "", "Total", p.liq]), [...id, "", "Base de INSS", "", "Base", p.baseInss], [...id, "", "Base de FGTS", "", "Base", p.baseFgts], [...id, "", "FGTS (encargo)", "", "Base", p.fgts]);
    if (p.baseIr != null) ana.push([...id, "", "Base de cálculo do IRRF", "", "Base", p.baseIr]);
  }
  const fer = {},
    dia = {};
  for (const x of C.ferias) {
    const o = fer[x.f.id] || (fer[x.f.id] = {
      b: 0,
      l: 0
    });
    o.b += x.rc.bruto;
    o.l += x.rc.liquido;
  }
  for (const x of C.diarias) {
    dia[x.f.id] = (dia[x.f.id] || 0) + x.total;
  }
  const cols = C.rubricas.map(x => x.k);
  const por = [["Matrícula", "Funcionário", "Setor", "Função", "Cargo", "Vínculo", "Admissão", "Dep. IR", "Remuneração contratual", "Dias de férias no mês", ...C.rubricas.map(x => `${x.c ? x.c + " " : ""}${x.n}${x.tipo === "D" ? " (desconto)" : ""}`), "Total de proventos", "Total de descontos", "Líquido da folha", "Base de INSS", "Base de FGTS", "FGTS (encargo)", "Férias · bruto do recibo", "Férias · líquido do recibo", "Diárias", "Total líquido no mês"]];
  for (const p of C.pessoas) {
    const v = {};
    for (const l of [...p.prov, ...p.desc]) v[l.k] = r2((v[l.k] || 0) + l.v);
    const fr = fer[p.fid] || {
        b: 0,
        l: 0
      },
      dr = r2(dia[p.fid] || 0);
    por.push([p.mat, p.nome, p.setor, p.funcao, p.cargo, p.vinc, d(p.adm), p.dep, p.sal, p.ferias, ...cols.map(k => v[k] ?? ""), p.tp, p.td, p.liq, p.baseInss, p.baseFgts, p.fgts, r2(fr.b), r2(fr.l), dr, r2(p.liq + fr.l + dr)]);
  }
  // quem recebe férias ou diárias sem estar na folha do mês também entra na conta
  const naFolha = new Set(C.pessoas.map(p => p.fid));
  for (const f of [...new Set([...C.ferias, ...C.diarias].map(x => x.f))].filter(f => !naFolha.has(f.id))) {
    const fr = fer[f.id] || {
        b: 0,
        l: 0
      },
      dr = r2(dia[f.id] || 0);
    por.push([f.matricula || "", f.nome, f.setor || "", f.funcao || "", f.cargo || "", VINC[f.vinculo] || VINC.efetivo, d(f.admissao), Number(f.dependentesIR) || 0, "", "", ...cols.map(() => ""), "", "", "", "", "", "", r2(fr.b), r2(fr.l), dr, r2(fr.l + dr)]);
  }
  const nc = por[0].length;
  por.push(B(["", "Total", "", "", "", "", "", "", "", "", ...cols.map((k, i) => r2(por.slice(1).reduce((n, l) => n + (Number(l[10 + i]) || 0), 0))), ...Array.from({
    length: nc - 10 - cols.length
  }, (_, j) => r2(por.slice(1).reduce((n, l) => n + (Number(l[10 + cols.length + j]) || 0), 0)))]));
  const fe = [["Matrícula", "Funcionário", "Setor", "Início", "Fim", "Dias de gozo", "Dias vendidos", "Pagar até", "Remuneração base", "Valor do dia", "Férias", "Dobra (art. 137)", "1/3 constitucional", "Abono pecuniário", "1/3 sobre o abono", "Bruto", "Base de INSS", "INSS", "Base tributável do IRRF", "IRRF", "Líquido", "FGTS (encargo)"], ...C.ferias.map(x => [x.mat, x.nome, x.setor, d(x.o.inicio), d(x.o.fim || x.o.inicio), x.dias, x.abono, d(x.pag), x.rc.rem, x.rc.dia, x.rc.ferias, x.rc.dobro, x.rc.terco, x.rc.abonoV, x.rc.tercoAb, x.rc.bruto, x.rc.trib, x.rc.inss, x.rc.baseIR, x.rc.ir, x.rc.liquido, x.fgts]), B(["", "Total", "", "", "", "", "", "", "", "", ...[10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map(i => r2(C.ferias.reduce((n, x) => n + [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, x.rc.ferias, x.rc.dobro, x.rc.terco, x.rc.abonoV, x.rc.tercoAb, x.rc.bruto, x.rc.trib, x.rc.inss, x.rc.baseIR, x.rc.ir, x.rc.liquido, x.fgts][i], 0)))])];
  const di = [["Matrícula", "Funcionário", "Setor", "Início", "Fim", "Destino / motivo", "Diárias", "Valor da diária", "Origem do valor", "Total"], ...C.diarias.map(x => [x.mat, x.nome, x.setor, d(x.o.inicio), d(x.o.fim || x.o.inicio), x.destino, x.qtd, x.unit, x.proprio ? "lançamento" : x.unit ? "padrão das regras" : "a informar", x.total]), B(["", "Total", "", "", "", "", T.dQtd, "", "", T.dTotal])];
  const faixa = (a, b) => Array.from({
    length: b - a + 1
  }, (_, i) => a + i);
  return [{
    nome: "Resumo Geral",
    linhas: resumo,
    larguras: [52, 18, 70],
    moeda: [1]
  }, {
    nome: "Resumo por Rubrica",
    linhas: rubs,
    larguras: [10, 44, 12, 16, 10],
    moeda: [3],
    cab: 1
  }, {
    nome: "Folha Analítica",
    linhas: ana,
    larguras: [11, 36, 34, 34, 22, 9, 44, 22, 10, 15],
    moeda: [9],
    cab: 1
  }, {
    nome: "Por Funcionário",
    linhas: por,
    larguras: [11, 36, 34, 34, 28, 22, 12, 8, ...Array(nc - 8).fill(16)],
    moeda: [8, ...faixa(10, nc - 1)],
    cab: 1
  }, {
    nome: "Recibos de Férias",
    linhas: fe,
    larguras: [11, 36, 30, 12, 12, 9, 9, 12, ...Array(14).fill(15)],
    moeda: faixa(8, 21),
    cab: 1
  }, {
    nome: "Diárias",
    linhas: di,
    larguras: [11, 36, 30, 12, 12, 40, 9, 15, 18, 15],
    moeda: [7, 9],
    cab: 1
  }];
}
async function baixarRelatorio() {
  if (!downloads) return toast("Download indisponível nesta visualização.");
  const C = relContabil();
  try {
    await downloads.save({
      filename: `coffito-relatorio-contabil-${C.ym}.xlsx`,
      data: gerarXlsx(abasContabeis(C))
    });
    toast("Relatório baixado");
  } catch (x) {
    if (x?.code !== "declined") toast(x?.code === "rate_limited" ? "Já há uma exportação aberta." : "Exportação indisponível aqui.");
  }
}
function imprimirRelatorio() {
  const antes = new Set(S.folAbertos);
  for (const p of relContabil().pessoas) S.folAbertos.add(p.id);
  render();
  const volta = () => {
    window.removeEventListener("afterprint", volta);
    S.folAbertos = antes;
    render();
  };
  window.addEventListener("afterprint", volta);
  setTimeout(() => window.print(), 60);
}
function csvFolha() {
  const q = v => {
      let texto = String(v ?? "");
      if (typeof v === "string" && /^\s*[=+@-]/.test(texto)) texto = "'" + texto;
      return `"${texto.replace(/"/g, '""')}"`;
    },
    F = folhaDoMes(S.y, S.m),
    fm = funcMap(),
    ym = `${S.y}-${pad(S.m + 1)}`;
  if (!F) {
    const head = ["Funcionário", "Matrícula", "Proventos (estimado)", "INSS", "IRRF", "Total de descontos", "Líquido (estimado)", "FGTS"];
    const rows = S.func.filter(f => noQuadro(f)).sort(byName).map(f => ({
      f,
      fo: folhaMes(f)
    })).filter(x => x.fo).map(({
      f,
      fo
    }) => [f.nome, f.matricula, n2(fo.bruto), n2(fo.inss), n2(fo.ir.ir), n2(fo.descontos), n2(fo.liquido), n2(fo.fgts)]);
    return {
      nome: `coffito-folha-estimada-${ym}.csv`,
      data: "﻿" + [head, ...rows].map(r => r.map(q).join(";")).join("\r\n")
    };
  }
  const cods = [...new Set(F.pessoas.flatMap(x => Object.keys(x.r)))].sort();
  const head = ["Código", "Funcionário", "Função", "Salário contratual", "Dias de férias", ...cods.map(c => `${c} ${RUB[c] || ""}`), "Proventos", "Descontos", "Líquido", "Base FGTS", "Líquido estimado"];
  const rows = F.pessoas.map(x => {
    const f = fm[x.f],
      fo = f ? folhaMes(f) : null;
    return [x.c, f?.nome || x.n, x.fn, n2(x.sal), x.fer, ...cods.map(c => x.r[c] != null ? n2(x.r[c]) : ""), n2(x.a), n2(x.d), n2(x.l), n2(x.bf), fo ? n2(fo.liquido) : ""];
  });
  return {
    nome: `coffito-folha-${ym}.csv`,
    data: "﻿" + [head, ...rows].map(r => r.map(q).join(";")).join("\r\n")
  };
}
export { RUB, RUB_DESC, folhaDoMes, TIT_COD, ANU_COD, codGrat, pctTxt, folhaKpis, viewFolha, ENC, relContabil, secaoContabil, secaoRubricas, memoContracheque, secaoFeriasPag, secaoDiarias, abasContabeis, baixarRelatorio, imprimirRelatorio, csvFolha };
