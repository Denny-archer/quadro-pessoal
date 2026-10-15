import { DAY, HOJE, addDias, fmt, hoje, iso, pad, parse } from "../core/datas.js";
import { S } from "../core/estado.js";
import { esc } from "../core/dom.js";
import { brl, n2, r2 } from "../core/formatacao.js";
import { noQuadro, overlap } from "../core/colecoes.js";
import { calcBen } from "./beneficios.js";
import { ANU_COD, TIT_COD, codGrat, pctTxt } from "./folha.js";
import { MESES3, nomeExtra } from "./beneficios-extras.js";
import { GRUPOS, grupoDe } from "./ferias.js";
import { MESES, VINC } from "../core/constantes.js";
import * as RegrasFolha from "./folha/regras.js";
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
function fgAuto(f) {
  if (f.fgTipo) return f.fgTipo;
  const t = (f.funcao || "").toLowerCase();
  return /chef/.test(t) ? "chefia" : /n[íi]vel\s*ii\b|assessor.*ii/.test(t) ? "assessor2" : "assessor1";
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
function iniciarFeaturesRemuneracao() {
  S.rem = null;
  S.remBusca = "";
  S.remGrupo = "";
  S.remSetor = "";
}
const nivelPorTempo = (adm, ref = hoje) => Math.min(30, anosDeCasa(adm, ref) + 1);
const GRAT_CAMPOS = ["funcaoTipo", "fgTipo", "nivel", "funcao", "portariaFuncao"];
const TIPO_HIST = {
  nivel: "Progressão de nível",
  grat: "Gratificação / cargo em comissão"
};
function estadoEm(f, d) {
  const hs = f.historicoRem;
  if (!hs || !hs.length) return f;
  const g = {
    ...f
  };
  for (const t of ["nivel", "grat"]) {
    const prox = hs.filter(e => e.tipo === t && e.data > d).sort((a, b) => a.data.localeCompare(b.data))[0];
    if (!prox) continue;
    if (t === "nivel") g.nivelSalarial = prox.deAuto ? null : prox.de;else for (const k of GRAT_CAMPOS) if (prox.de && k in prox.de) g[k] = prox.de[k] || "";
  }
  return g;
}
const gratDe = x => ({
  funcaoTipo: x.funcaoTipo || "",
  fgTipo: x.fgTipo || "",
  nivel: x.nivel || "",
  funcao: x.funcao || "",
  portariaFuncao: x.portariaFuncao || ""
});
const gratChave = (x, vinc) => {
  const t = x.funcaoTipo || "";
  return [t, t === "fg" ? fgAuto(x) : "", t === "comissao" && x.funcao || vinc === "comissionado" || vinc === "cedido" ? x.nivel || "" : ""].join("|");
};
function descGrat(x) {
  if (!x) return "—";
  if (x.funcaoTipo === "fg") return FGN[fgAuto(x)] || "Função gratificada";
  if (x.funcaoTipo === "comissao" && x.funcao) return `Comissão nível ${x.nivel || "?"} (${x.funcao})`;
  return x.nivel ? `Nível ${x.nivel}` : x.portariaFuncao ? "Sem cargo em comissão (exonerado)" : "Sem gratificação";
}
const refMes = () => {
  const a = iso(new Date(S.y, S.m, 1)),
    b = iso(new Date(S.y, S.m + 1, 0));
  return HOJE >= a && HOJE <= b ? HOJE : b;
};
function remun(f0, d = HOJE) {
  const R = S.rem;
  if (!R) return null;
  const f = estadoEm(f0, d);
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
    out.previsto = nivelPorTempo(f.admissao, parse(d));
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
    const futura = (f0.historicoRem || []).filter(e => e.tipo === "nivel" && e.data > d).sort((a, b) => a.data.localeCompare(b.data))[0];
    if (futura && car) out.proxima = {
      data: futura.data,
      nivel: futura.para,
      valor: R.carreiras[car][futura.para - 1],
      registrada: true
    };
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
function feriasNoMes(f, y, m) {
  const a = new Date(y, m, 1),
    b = new Date(y, m + 1, 0),
    nd = b.getDate();
  const dias = S.ocs.filter(o => o.func === f.id && o.tipo === "ferias").reduce((n, o) => n + overlap(o, a, b), 0);
  return dias >= nd ? 30 : Math.min(dias, 30);
}
function descFerias(f, r) {
  if (f.vinculo === "estagiario") return {
    dias: 0,
    valor: 0
  };
  const dias = feriasNoMes(f, S.y, S.m);
  return {
    dias,
    valor: r2(r.total / 30 * dias)
  };
}
function partesMes(f, y, m) {
  const nd = new Date(y, m + 1, 0).getDate(),
    est = f.vinculo === "estagiario";
  const fers = est ? [] : S.ocs.filter(o => o.func === f.id && o.tipo === "ferias");
  const partes = [];
  for (let d = 1; d <= nd; d++) {
    const r = remun(f, iso(new Date(y, m, d))),
      k = `${r.base}|${r.grat}|${r.rotBase}|${r.rotGrat}`,
      ult = partes[partes.length - 1];
    if (ult && ult.k === k) ult.fim = d;else partes.push({
      k,
      r,
      ini: d,
      fim: d
    });
  }
  const dd = n => String(n).padStart(2, "0");
  partes.forEach((p, i) => {
    const a = new Date(y, m, p.ini),
      b = new Date(y, m, p.fim),
      cal = p.fim - p.ini + 1;
    p.com = Math.max(0, cal + (i === partes.length - 1 ? 30 - nd : 0));
    const fc = fers.reduce((n, o) => n + overlap(o, a, b), 0);
    p.trab = fc >= cal ? 0 : Math.max(0, p.com - fc);
    p.sal = r2(p.r.base * p.trab / 30);
    p.grat = r2(p.r.grat * p.trab / 30);
    p.desde = iso(a);
    p.rot = `${dd(p.ini)} a ${dd(p.fim)}/${dd(m + 1)}`;
  });
  return partes;
}
function folhaMes(f) {
  const r = remun(f);
  if (!r || f.situacao === "cedido") return null;
  const F = RegrasFolha,
    est = f.vinculo === "estagiario",
    apr = f.vinculo === "aprendiz";
  const partes = partesMes(f, S.y, S.m),
    fe = {
      dias: partes.reduce((n, p) => n + p.com - p.trab, 0)
    };
  const salario = r2(partes.reduce((n, p) => n + p.sal, 0)),
    grat = r2(partes.reduce((n, p) => n + p.grat, 0));
  // junta as partes seguidas em que a verba não mudou; se sobrar um grupo só, a linha sai sem datas
  const dd = n => String(n).padStart(2, "0");
  const grupos = (chave, val) => partes.reduce((gs, p) => {
    const k = chave(p),
      u = gs[gs.length - 1];
    if (u && u.k === k) {
      u.fim = p.fim;
      u.trab += p.trab;
      u.v = r2(u.v + val(p));
    } else gs.push({
      k,
      r: p.r,
      ini: p.ini,
      fim: p.fim,
      trab: p.trab,
      v: val(p)
    });
    return gs;
  }, []);
  const quando = g => `${dd(g.ini)} a ${dd(g.fim)}/${dd(S.m + 1)}, ${g.trab} dia${g.trab === 1 ? "" : "s"}`;
  const gB = grupos(p => `${p.r.base}|${p.r.rotBase}`, p => p.sal),
    gG = grupos(p => `${p.r.grat}|${p.r.rotGrat}`, p => p.grat);
  const trabT = partes.reduce((n, p) => n + p.trab, 0),
    cBase = est ? "000" : "001",
    diaG = g => iso(new Date(S.y, S.m, g.ini));
  const linhasBase = gB.length > 1 ? gB.filter(g => g.v).map(g => [`${est ? "Bolsa-auxílio" : "Salário base"} · ${g.r.nivel ? "nível " + g.r.nivel : g.r.rotBase} (${quando(g)})`, g.v, cBase, `${g.trab} dias`]) : [[est ? "Bolsa-auxílio" : "Salário base", salario, cBase, `${trabT} dias`]];
  const linhasGrat = gG.length > 1 ? gG.filter(g => g.v).map(g => [`${g.r.rotGrat || "Gratificação"} (${quando(g)})`, g.v, codGrat(f, g.r.rotGrat, diaG(g)), `${g.trab} dias`]) : [[gG[0].r.rotGrat || "Gratificação", grat, codGrat(f, gG[0].r.rotGrat, diaG(gG[0])), `${trabT} dias`]];
  const tit = est ? 0 : r2(salario * (Number(f.titulacaoPct) || 0) / 100);
  const anu = est ? 0 : r2(salario * (Number(f.anuenioPct) || 0) / 100);
  const b = noQuadro(f) ? calcBen(f, S.y, S.m) : {
    aa: 0,
    at: 0,
    ex: 0,
    extras: []
  };
  const titP = Number(f.titulacaoPct) || 0,
    anuP = Number(f.anuenioPct) || 0;
  const prov = [...linhasBase, ...linhasGrat, ["Adicional de titulação", tit, TIT_COD[String(titP)] || "", pctTxt(titP)], ["Anuênio", anu, ANU_COD[anuP] || "", pctTxt(anuP)], ["Auxílio-alimentação", b.aa, "126"], ["Auxílio-transporte", b.at, "127"], ...b.extras.map(x => [nomeExtra(x), Number(x.valor), x.tipo === "creche" ? "022" : ""])].filter(([, v]) => v);
  const tributavel = r2(salario + grat + tit + anu);
  const inssV = est ? 0 : F.inss(tributavel);
  const ir = F.irrf(tributavel, inssV, Number(f.dependentesIR) || 0);
  const desc = [["INSS", inssV, "903"], ["IRRF", ir.ir, "914", ir.aliq ? pctTxt(ir.aliq * 100) : ""], ["Vale-transporte", !est && b.at ? r2(salario * (Number(S.cfg.vtPct) || 0) / 100) : 0, "604", pctTxt(S.cfg.vtPct) + " do salário"], ["Mensalidade sindical", f.sindicalizado ? Number(S.cfg.sindical) || 0 : 0, "602"], ["Outros descontos fixos", Number(f.outrosDescontos) || 0, ""]].filter(([, v]) => v);
  const tp = r2(prov.reduce((n, [, v]) => n + v, 0)),
    td = r2(desc.reduce((n, [, v]) => n + v, 0));
  return {
    prov,
    desc,
    tributavel,
    inss: inssV,
    ir,
    fgts: est ? 0 : F.fgts(tributavel, apr),
    bruto: tp,
    descontos: td,
    liquido: r2(tp - td),
    ferias: fe.dias,
    partes
  };
}
function remLista() {
  const q = S.remBusca.trim().toLowerCase();
  return S.func.filter(f => f.situacao !== "inativo").filter(f => (!q || [f.nome, f.cargo, f.funcao, f.setor, f.matricula].some(x => (x || "").toLowerCase().includes(q))) && (!S.remGrupo || grupoDe(f) === S.remGrupo) && (!S.remSetor || f.setor === S.remSetor)).map(f => {
    const r = remun(f, refMes());
    if (!r) return null;
    const b = benDoMes(f),
      fe = descFerias(f, r);
    const fo = folhaMes(f),
      mes = fo ? fo.tributavel : r2(r.total - fe.valor);
    return {
      f,
      r,
      b,
      fe,
      fo,
      mes,
      geral: r2((f.situacao === "cedido" ? 0 : mes) + b.total)
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
    fe,
    fo,
    mes,
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
      t.fer += fe.valor;
      if (fe.dias) t.nf++;
      t.mes += mes;
      t.aa += b.aa;
      t.n++;
      if (fo) {
        t.inss += fo.inss;
        t.ir += fo.ir.ir;
        t.fgts += fo.fgts;
        t.desc += fo.descontos;
        t.liq += fo.liquido;
      }
    }
    return t;
  }, {
    base: 0,
    bolsa: 0,
    grat: 0,
    fer: 0,
    nf: 0,
    mes: 0,
    aa: 0,
    at: 0,
    ex: 0,
    geral: 0,
    n: 0,
    inss: 0,
    ir: 0,
    fgts: 0,
    desc: 0,
    liq: 0
  });
  const setores = [...new Set(S.func.map(f => f.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  let h = `<div class="kpis">
    <div class="kpi today"><span class="label">Total com benefícios</span><span class="value u-folha-font-size-26px" >${brl(T.geral)}</span><span class="sub">${MESES[S.m]} de ${S.y} · ${T.n} pessoas · sem encargos</span></div>
    <div class="kpi u-folha-k-var-brand" ><span class="label">Folha do mês</span><span class="value u-folha-font-size-24px" >${brl(T.mes)}</span><span class="sub">salários, gratificações, titulação, anuênio e bolsas${T.fer ? ` · −${brl(T.fer)} de férias (${T.nf} ${T.nf === 1 ? "pessoa" : "pessoas"})` : ""}</span></div>
    <div class="kpi u-folha-k-var-accent" ><span class="label">Salários</span><span class="value u-folha-font-size-24px" >${brl(T.base)}</span><span class="sub">carreira e empregos em comissão</span></div>
    <div class="kpi u-folha-k-var-c-abono" ><span class="label">Gratificações e FG</span><span class="value u-folha-font-size-24px" >${brl(T.grat)}</span><span class="sub">${R.gratificacaoPct}% da comissão para efetivos</span></div>
    <div class="kpi u-folha-k-var-c-capacitacao" ><span class="label">Bolsas</span><span class="value u-folha-font-size-24px" >${brl(T.bolsa)}</span><span class="sub">estágio e aprendizagem</span></div>
    <div class="kpi u-folha-k-var-c-ferias" ><span class="label">Benefícios no mês</span><span class="value u-folha-font-size-24px" >${brl(T.aa + T.at + T.ex)}</span><span class="sub">alimentação ${brl(T.aa)} · transporte ${brl(T.at)} · adicionais ${brl(T.ex)}</span></div>
    <div class="kpi u-folha-k-var-c-atestado" ><span class="label">Descontos estimados</span><span class="value u-folha-font-size-24px" >${brl(T.desc)}</span><span class="sub">INSS ${brl(T.inss)} · IRRF ${brl(T.ir)} · VT, sindical e outros</span></div>
    <div class="kpi u-folha-k-var-c-viagem" ><span class="label">Líquido estimado</span><span class="value u-folha-font-size-24px" >${brl(T.liq)}</span><span class="sub">FGTS a recolher ${brl(T.fgts)} (encargo)</span></div>
  </div>`;
  h += `<section class="panel"><div class="panel-head"><div><h2>Remuneração por funcionário</h2><div class="hint">Tabela ${esc(R.vigencia)} · ${esc(R.reajuste)} · total com benefícios = salário + gratificação + titulação + anuênio − dias de férias gozados + alimentação + transporte + adicionais de ${MESES[S.m]} (mês escolhido no topo) · descontos e líquido são estimativas pelas regras da folha · clique na linha para abrir a ficha</div></div><button class="btn small" type="button" data-act="tabela-sal">Ver tabela salarial</button></div>
    <div class="filters"><label>Buscar<input id="rem-busca" type="search" value="${esc(S.remBusca)}" placeholder="nome, cargo, setor, matrícula"></label>
      <label>Vínculo<select id="rem-grupo"><option value="">Todos</option>${GRUPOS.map(([k, t]) => `<option value="${k}" ${S.remGrupo === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label>Setor<select id="rem-setor"><option value="">Todos</option>${setores.map(x => `<option ${S.remSetor === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label></div>
    <div class="scroll"><table class="data"><thead><tr><th>Funcionário</th><th>Enquadramento</th><th class="r">Salário / bolsa</th><th>Gratificação</th><th class="r">Remuneração no mês</th><th class="r">Benefícios em ${MESES3[S.m]}</th><th class="r">Total com benefícios</th><th class="r">Descontos</th><th class="r">Líquido estimado</th></tr></thead><tbody>`;
  h += lst.map(({
    f,
    r,
    b,
    fe,
    fo,
    mes,
    geral
  }) => `<tr class="click" data-ficha="${f.id}"><td><strong>${esc(f.nome)}</strong>${f.matricula ? `<br><span class="hint">mat. ${esc(f.matricula)}</span>` : ""}</td>
    <td>${esc(r.rotBase || "—")}${r.previsto && r.nivel !== r.previsto ? `<br><span class="hint">previsto pelo tempo: nível ${r.previsto}</span>` : ""}${r.alertas.length ? `<br><span class="hint u-folha-color-var-c-abono" >⚠ ${esc(r.alertas.join(" · "))}</span>` : ""}</td>
    <td class="money">${r.base ? brl(r.base) : "—"}</td><td>${r.grat ? `<span class="num">${brl(r.grat)}</span><br><span class="hint">${esc(r.rotGrat)}</span>` : '<span class="hint">—</span>'}</td>
    <td class="money">${brl(mes)}${fo && fo.tributavel !== r2(r.total - fe.valor) ? `<br><span class="hint">com titulação/anuênio</span>` : ""}${fe.dias ? `<br><span class="hint">${brl(r.total)} <span class="desc">−${brl(fe.valor)}</span> (${fe.dias} ${fe.dias === 1 ? "dia" : "dias"} de férias)</span>` : f.vinculo === "estagiario" && feriasNoMes(f, S.y, S.m) ? '<br><span class="hint">recesso remunerado</span>' : ""}</td>
    <td class="money">${b.total ? `${brl(b.total)}<br><span class="hint">${[b.aa ? "alim. " + brl(b.aa) : "", b.at ? "transp. " + brl(b.at) : "", b.ex ? esc(b.extras.map(nomeExtra).join(", ")) + " " + brl(b.ex) : ""].filter(Boolean).join(" · ")}</span>` : '<span class="hint">—</span>'}</td>
    <td class="money pagar u-folha-font-size-15px" >${brl(geral)}${f.situacao === "cedido" ? '<br><span class="hint">cedido: fora da folha</span>' : ""}</td>
    <td class="money">${fo && fo.descontos ? `<span class="desc">−${brl(fo.descontos)}</span><br><span class="hint">INSS ${brl(fo.inss)} · IR ${brl(fo.ir.ir)}</span>` : '<span class="hint">—</span>'}</td>
    <td class="money pagar">${fo ? brl(fo.liquido) : "—"}</td></tr>`).join("");
  h += `</tbody><tfoot><tr><th colspan="4">Total (${T.n} em exercício)</th><th class="money">${brl(T.mes)}</th><th class="money">${brl(T.aa + T.at + T.ex)}</th><th class="money">${brl(T.geral)}</th><th class="money">−${brl(T.desc)}</th><th class="money">${brl(T.liq)}</th></tr></tfoot></table></div></section>`;
  // progressões pelo tempo nos próximos 90 dias
  const lim = iso(new Date(hoje.getTime() + 90 * DAY));
  const prox = lst.filter(x => x.r.proxima && x.r.proxima.data <= lim && noQuadro(x.f)).sort((a, b) => a.r.proxima.data.localeCompare(b.r.proxima.data));
  h += `<section class="panel"><div class="panel-head"><h2>Progressões previstas nos próximos 90 dias</h2><span class="hint">1 nível por ano · depende da avaliação de desempenho</span></div>`;
  h += prox.length ? `<ul class="list">${prox.map(({
    f,
    r
  }) => `<li><button class="link" type="button" data-ficha="${f.id}">${esc(f.nome)}</button><span class="num u-folha-font-weight-600" >+${brl(r2(r.proxima.valor - r.base))}</span><span class="meta">${fmt(r.proxima.data)} · nível ${r.nivel} → ${r.proxima.nivel} (${CARREIRA[r.carreira] || ""}) · ${brl(r.base)} → ${brl(r.proxima.valor)}</span></li>`).join("")}</ul>` : `<div class="empty">Nenhuma progressão por tempo nos próximos 90 dias.</div>`;
  return h + `</section>`;
}
function fichaRem(f) {
  const r = remun(f, refMes());
  if (!r) return "";
  let h = `<h3 class="u-folha-margin-top-22px">Remuneração · tabela ${esc(S.rem.vigencia)}</h3><dl class="facts">`;
  h += `<div><dt>${f.vinculo === "estagiario" || f.vinculo === "aprendiz" ? "Bolsa-auxílio" : "Salário"}</dt><dd class="num">${r.base ? brl(r.base) : "—"}<br><span class="hint u-folha-font-family-var-f-body" >${esc(r.rotBase || "")}</span></dd></div>`;
  if (r.grat) h += `<div><dt>Gratificação</dt><dd class="num">${brl(r.grat)}<br><span class="hint u-folha-font-family-var-f-body" >${esc(r.rotGrat)}</span></dd></div>`;
  h += `<div><dt>Total (salário + gratificação)</dt><dd class="num u-folha-font-size-18px" >${brl(r.total)}</dd></div>`;
  const fe = descFerias(f, r);
  if (fe.dias) h += `<div><dt>Remuneração em ${MESES3[S.m]}/${S.y}</dt><dd class="num">${brl(r2(r.total - fe.valor))}<br><span class="hint u-folha-font-family-var-f-body" >−${brl(fe.valor)} por ${fe.dias} ${fe.dias === 1 ? "dia" : "dias"} de férias (${brl(r.total)} ÷ 30 × ${fe.dias})</span></dd></div>`;
  {
    const b = benDoMes(f),
      geral = r2((f.situacao === "cedido" ? 0 : r.total - fe.valor) + b.total);
    h += `<div><dt>Benefícios em ${MESES3[S.m]}/${S.y}</dt><dd class="num">${brl(b.total)}<br><span class="hint u-folha-font-family-var-f-body" >alimentação ${brl(b.aa)} · transporte ${brl(b.at)}${b.ex ? ` · adicionais ${brl(b.ex)}` : ""}</span></dd></div>`;
    h += `<div><dt>Total com benefícios</dt><dd class="num u-folha-font-size-18px-31" >${brl(geral)}</dd></div>`;
  }
  if (r.carreira) h += `<div><dt>Tempo de casa</dt><dd>${anosDeCasa(f.admissao)} anos · nível previsto ${r.previsto}${r.nivel !== r.previsto ? `<br><span class="hint">nível atual informado: ${r.nivel}</span>` : ""}</dd></div>`;
  if (r.proxima) h += `<div><dt>Próxima progressão</dt><dd>${fmt(r.proxima.data)} → nível ${r.proxima.nivel}<br><span class="hint">${brl(r.proxima.valor)} · ${r.proxima.registrada ? "registrada no histórico" : "se aprovada na avaliação de desempenho"}</span></dd></div>`;
  h += `</dl>`;
  if (r.alertas.length) h += `<div class="hint u-folha-color-var-c-abono-32" >⚠ ${esc(r.alertas.join(" · "))}</div>`;
  const fo = folhaMes(f);
  if (fo) {
    const linha = (rot, v, cls = "") => `<tr><td>${esc(rot)}</td><td class="money ${cls}">${brl(v)}</td></tr>`;
    h += `<h3 class="u-folha-margin-top-22px">Contracheque estimado · ${MESES[S.m]}/${S.y}</h3><div class="kd-grid">
      <div><table class="data"><thead><tr><th>Proventos</th><th class="r">Valor</th></tr></thead><tbody>${fo.prov.map(([k, v]) => linha(k, v)).join("")}</tbody>
        <tfoot><tr><th>Total bruto</th><th class="money">${brl(fo.bruto)}</th></tr></tfoot></table></div>
      <div><table class="data"><thead><tr><th>Descontos</th><th class="r">Valor</th></tr></thead><tbody>${fo.desc.length ? fo.desc.map(([k, v]) => linha(k, v, "desc")).join("") : `<tr><td colspan="2" class="hint">Sem descontos</td></tr>`}</tbody>
        <tfoot><tr><th>Total de descontos</th><th class="money">${brl(fo.descontos)}</th></tr><tr><th>Líquido estimado</th><th class="money u-folha-color-var-accent" >${brl(fo.liquido)}</th></tr></tfoot></table></div></div>`;
    const anos = f.vinculo === "efetivo" && f.admissao ? Math.floor(anosDeCasa(f.admissao)) : 0;
    const notas = [`Base de INSS, FGTS e IR: ${brl(fo.tributavel)} (alimentação, transporte e creche não entram)`, fo.ir.simplificado ? `IR com o desconto simplificado de ${brl(RegrasFolha.IRRF_2026.simplificado)}` : `IR com dedução do INSS${Number(f.dependentesIR) ? ` e de ${f.dependentesIR} dependente(s)` : ""}`, fo.fgts ? `FGTS a recolher pelo COFFITO: ${brl(fo.fgts)} (${f.vinculo === "aprendiz" ? "2%" : "8%"}, não sai do salário)` : ""];
    if (fo.partes.length > 1) notas.push(`mudança de nível ou gratificação no mês: salário e gratificação proporcionais aos dias (${fo.partes.map(p => `${p.rot}: ${p.trab} dias × ${brl(p.r.total)} ÷ 30`).join("; ")})`);
    if (fo.ferias) notas.push(`mês com ${fo.ferias} ${fo.ferias === 1 ? "dia" : "dias"} de férias: o INSS e o IR do mês são acertados junto com o recibo de férias, então o valor real pode ser menor`);
    if (anos && (Number(f.anuenioPct) || 0) < anos) notas.push(`anuênio informado ${Number(f.anuenioPct) || 0}%, mas pelo tempo de casa seriam ${anos}%: confira`);
    h += `<div class="hint u-folha-margin-top-6px" >${notas.filter(Boolean).map(esc).join(" · ")}. Hora extra, adicional noturno, substituição e consignados variáveis não entram na estimativa.</div>`;
  }
  h += fichaHistRem(f);
  return h;
}
function fichaHistRem(f) {
  const hs = (f.historicoRem || []).slice().sort((a, b) => b.data.localeCompare(a.data));
  let h = `<h3 class="u-folha-margin-top-22px">Histórico de nível e gratificação</h3>`;
  if (!hs.length) return h + `<div class="hint">Nenhuma mudança registrada. Ao mudar no cadastro o nível salarial, a função gratificada ou o cargo em comissão, informe a vigência: a mudança fica registrada aqui e o mês dela sai proporcional aos dias.</div>`;
  h += `<div class="scroll"><table class="data"><thead><tr><th>Vigência</th><th>Mudança</th><th class="r">Valor mensal</th><th>Ato / observação</th><th></th></tr></thead><tbody>`;
  h += hs.map(e => {
    const a = remun(f, addDias(e.data, -1)),
      b = remun(f, e.data),
      so = e.tipo === "nivel" ? "base" : f.vinculo === "comissionado" || f.vinculo === "cedido" ? "total" : "grat";
    const va = a ? a[so] : 0,
      vb = b ? b[so] : 0,
      dif = r2(vb - va);
    const port = x => x && x.portariaFuncao ? ` · ${x.portariaFuncao}` : "";
    const de = e.tipo === "nivel" ? `nível ${e.de ?? "—"}` : descGrat(e.de) + port(e.de),
      para = e.tipo === "nivel" ? `nível ${e.para}` : descGrat(e.para) + port(e.para);
    return `<tr><td>${fmt(e.data)}${e.data > HOJE ? '<br><span class="prazo u-folha-pc-var-c-viagem" >programada</span>' : ""}</td>
      <td><strong>${TIPO_HIST[e.tipo] || esc(e.tipo)}</strong><br>${esc(de)} → ${esc(para)}</td>
      <td class="money">${a && b ? `${brl(va)} → ${brl(vb)}<br><span class="hint">${so === "base" ? "salário" : so === "grat" ? "gratificação" : "remuneração"} ${dif >= 0 ? "+" : "−"}${brl(Math.abs(dif))}</span>` : "—"}</td>
      <td>${esc(e.ato || "")}${e.registradoEm ? `<br><span class="hint">registrado em ${fmt(iso(new Date(e.registradoEm)))}</span>` : ""}</td>
      <td><button class="btn small" type="button" data-hist-del="${f.id}|${e.id}">Excluir</button></td></tr>`;
  }).join("");
  return h + `</tbody></table></div><div class="hint">A vigência é o primeiro dia com o novo valor. No mês da mudança, salário e gratificação saem proporcionais: dias antes × valor antigo ÷ 30 + dias a partir da vigência × valor novo ÷ 30. O recibo de férias usa a remuneração vigente no início do gozo (CLT art. 142).</div>`;
}
function csvRem() {
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["Funcionário", "Matrícula", "Vínculo", "Enquadramento", "Nível previsto", "Salário/bolsa", "Gratificação", "Tipo de gratificação", "Remuneração (salário + gratificação)", "Dias de férias no mês", "Desconto de férias", "Titulação %", "Anuênio %", "Remuneração no mês", `Auxílio-alimentação ${MESES3[S.m]}/${S.y}`, `Auxílio-transporte ${MESES3[S.m]}/${S.y}`, `Benefícios adicionais ${MESES3[S.m]}/${S.y}`, "Total com benefícios", "INSS (estimado)", "IRRF (estimado)", "Total de descontos (estimado)", "Líquido (estimado)", "FGTS (encargo)", "Observações"];
  const rows = remLista().map(({
    f,
    r,
    b,
    fe,
    fo,
    mes,
    geral
  }) => [f.nome, f.matricula, VINC[f.vinculo] || VINC.efetivo, r.rotBase, r.previsto || "", n2(r.base), n2(r.grat), r.rotGrat, n2(r.total), fe.dias, n2(fe.valor), n2(f.titulacaoPct || 0), n2(f.anuenioPct || 0), n2(mes), n2(b.aa), n2(b.at), n2(b.ex), n2(geral), n2(fo ? fo.inss : 0), n2(fo ? fo.ir.ir : 0), n2(fo ? fo.descontos : 0), n2(fo ? fo.liquido : 0), n2(fo ? fo.fgts : 0), r.alertas.join("; ")]);
  return {
    nome: `coffito-remuneracao-${S.y}-${pad(S.m + 1)}.csv`,
    data: "﻿" + [head, ...rows].map(x => x.map(q).join(";")).join("\r\n")
  };
}
export { iniciarFeaturesRemuneracao, CARREIRA, CLASSES, BOLSA, FGN, carreiraAuto, anosDeCasa, nivelPorTempo, fgAuto, remun, benDoMes, remLista, viewRem, fichaRem, tabelaSalarial, csvRem, GRAT_CAMPOS, TIPO_HIST, estadoEm, gratDe, gratChave, descGrat, refMes, feriasNoMes, descFerias, partesMes, folhaMes, fichaHistRem };
