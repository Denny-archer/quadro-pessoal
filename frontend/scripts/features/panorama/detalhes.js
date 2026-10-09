import { classeCor } from "../../core/cores.js";
/** Funcionalidade: panorama / detalhes. */
import { S } from "../../core/estado.js";
import { hoje, parse, fmt, iso, cap, HOJE, fmtCurto } from "../../core/datas.js";
import { AUSENCIAS, TIPOS, MESES } from "../../core/constantes.js";
import { overlap, funcMap, covers } from "../../core/colecoes.js";
import { esc, $ } from "../../core/dom.js";
import { fmtH } from "../../core/formatacao.js";
import { legend } from "./indicadores.js";
import { foraHoje } from "../../core/estatisticas.js";
const KD_TIPOS = t => t === "todos" ? AUSENCIAS : [t];
const kdNome = t => t === "todos" ? "Fora do posto (todos os afastamentos)" : TIPOS[t].nome;
const kdCor = t => t === "todos" ? "var(--accent)" : TIPOS[t].cor;
const kdUn = (t, n) => t === "banco" ? `${(Math.round(n * 10) / 10).toLocaleString("pt-BR")} h` : `${n} ${n === 1 ? "dia" : "dias"}`;
const kdOcs = t => S.ocs.filter(o => KD_TIPOS(t).includes(o.tipo));
function kdMede(o, a, b, t) {
  if (t === "banco") {
    const d = parse(o.inicio);
    return d >= a && d <= b ? Number(o.horas) || 0 : 0;
  }
  const d = overlap(o, a, b);
  return o.parcial ? 0 : d;
}
const kdDentro = (o, a, b, t) => t === "banco" ? (d => d >= a && d <= b)(parse(o.inicio)) : overlap(o, a, b) > 0;
function kdResumo(t, a, b) {
  const os = kdOcs(t).filter(o => kdDentro(o, a, b, t));
  const total = os.reduce((n, o) => n + kdMede(o, a, b, t), 0);
  const pessoas = new Set(os.map(o => o.func));
  return {
    os,
    total,
    n: os.length,
    pessoas,
    parc: os.filter(o => o.parcial).length
  };
}
function kdRank(os, a, b, t, chave) {
  const fm = funcMap(),
    m = new Map();
  for (const o of os) {
    const f = fm[o.func];
    const k = chave === "setor" ? f?.setor || "Sem setor" : o.func;
    const x = m.get(k) || {
      k,
      total: 0,
      n: 0
    };
    x.total += kdMede(o, a, b, t);
    x.n++;
    m.set(k, x);
  }
  return [...m.values()].sort((x, y) => Math.abs(y.total) - Math.abs(x.total) || y.n - x.n);
}
function kdRankHtml(lista, t, chave, lim = 12) {
  if (!lista.length) return `<div class="empty">Nada no período.</div>`;
  const fm = funcMap(),
    max = Math.max(...lista.map(x => Math.abs(x.total)), 1);
  return `<ol class="rank">` + lista.slice(0, lim).map(x => {
    const nome = chave === "setor" ? esc(x.k) : esc(fm[x.k]?.nome || "(removido)");
    const alvo = chave === "setor" ? "" : ` data-ficha="${x.k}"`;
    return `<li><button class="link" type="button"${alvo}>${nome}</button><span class="num">${kdUn(t, x.total)} <span class="hint">· ${x.n}×</span></span><span class="rb ${classeCor(kdCor(t), "c")}" ><i data-ui-width="${Math.max(2, Math.abs(x.total) / max * 100)}%"></i></span></li>`;
  }).join("") + `</ol>${lista.length > lim ? `<div class="hint u-margin-top-6px" >e mais ${lista.length - lim}</div>` : ""}`;
}
function kdChips(t, r, rAnt, rot) {
  const med = r.pessoas.size ? r.total / r.pessoas.size : 0;
  const delta = rAnt ? r.total - rAnt.total : null;
  let h = `<div class="kd-chips">
    <div class="kd-chip"><div class="v">${kdUn(t, r.total)}</div><div class="l">total ${rot}</div>${delta != null ? `<div class="d ${classeCor(delta > 0 ? "var(--bad)" : delta < 0 ? "var(--good)" : "var(--muted)", "color")}" >${delta > 0 ? "+" : ""}${t === "banco" ? (Math.round(delta * 10) / 10).toLocaleString("pt-BR") + " h" : delta} vs. anterior</div>` : ""}</div>
    <div class="kd-chip"><div class="v">${r.n}</div><div class="l">${r.n === 1 ? "lançamento" : "lançamentos"}</div></div>
    <div class="kd-chip"><div class="v">${r.pessoas.size}</div><div class="l">${r.pessoas.size === 1 ? "pessoa" : "pessoas"}</div></div>
    <div class="kd-chip"><div class="v">${t === "banco" ? (Math.round(med * 10) / 10).toLocaleString("pt-BR") + " h" : (Math.round(med * 10) / 10).toLocaleString("pt-BR")}</div><div class="l">média por pessoa</div></div>`;
  if (t === "atestado" || t === "todos") h += `<div class="kd-chip"><div class="v">${r.parc}</div><div class="l">comparecimentos (0 dia)</div></div>`;
  return h + `</div>`;
}
function kdTabela(os, t, a, b) {
  const fm = funcMap();
  if (!os.length) return `<div class="empty">Nenhum registro.</div>`;
  return `<div class="scroll"><table class="data"><thead><tr><th>Funcionário</th>${t === "todos" ? "<th>Tipo</th>" : ""}<th>Início</th><th>Término</th><th class="r">${t === "banco" ? "Horas" : "Dias"}</th><th>Observação</th></tr></thead><tbody>` + os.map(o => `<tr class="click" data-oc-open="${o.id}"><td><strong>${esc(fm[o.func]?.nome || "(removido)")}</strong><br><span class="hint">${esc(fm[o.func]?.setor || "")}</span></td>${t === "todos" ? `<td><span class="pill ${classeCor(TIPOS[o.tipo].cor, "c")}" >${TIPOS[o.tipo].nome}</span></td>` : ""}
      <td class="num">${fmt(o.inicio)}</td><td class="num">${o.tipo === "banco" ? "—" : fmt(o.fim)}</td>
      <td class="r num">${o.tipo === "banco" ? fmtH(Number(o.horas) || 0) : o.parcial ? '0 <span class="hint">(comparec.)</span>' : overlap(o, parse(o.inicio), parse(o.fim || o.inicio))}</td>
      <td><span class="muted">${esc([o.destino, o.obs].filter(Boolean).join(" — "))}</span></td></tr>`).join("") + `</tbody></table></div>`;
}
function kdBarras(itens, opts = {}) {
  const W = 760,
    H = 220,
    L = 34,
    R = 6,
    T = 14,
    B = 26,
    n = itens.length,
    cw = (W - L - R) / n,
    bw = Math.min(opts.bw || 34, cw * 0.66);
  const tot = i => i.partes.reduce((s, p) => s + Math.max(0, p.v), 0);
  const max = Math.max(1, ...itens.map(tot), ...itens.map(i => i.fantasma || 0));
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find(s => max / s <= 4) || 2000,
    top = Math.ceil(max / step) * step;
  const y = v => T + (H - T - B) * (1 - v / top);
  let g = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria || "gráfico")}">`;
  for (let v = 0; v <= top; v += step) g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  itens.forEach((it, i) => {
    const x = L + cw * i + (cw - bw) / 2;
    let acc = 0;
    g += `<g class="${it.alvo ? "hit" : ""}" ${it.alvo || ""}>`;
    g += `<rect class="grafico-alvo" x="${L + cw * i}" y="${T}" width="${cw}" height="${H - T - B}"/>`;
    if (it.fantasma) g += `<rect x="${x - 3}" y="${y(it.fantasma)}" width="${bw + 6}" height="${y(0) - y(it.fantasma)}" rx="2" class="u-fill-none"><title>ano anterior: ${it.fantasma}</title></rect>`;
    for (const p of it.partes) {
      if (p.v <= 0) continue;
      const y1 = y(acc + p.v);
      g += `<rect class="bar ${classeCor(p.cor, "fill")}" x="${x}" y="${y1}" width="${bw}" height="${Math.max(0, y(acc) - y1 - 1)}" rx="2" ><title>${esc(p.tip)}</title></rect>`;
      acc += p.v;
    }
    if (opts.rotulos !== false && tot(it)) g += `<text class="axis u-fill-var-ink" x="${x + bw / 2}" y="${y(tot(it)) - 4}" text-anchor="middle" >${Math.round(tot(it) * 10) / 10}</text>`;
    if (!opts.cadaN || i % opts.cadaN === 0 || i === n - 1) g += `<text class="axis" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${it.rot}</text>`;
    g += `</g>`;
  });
  return g + `</svg>`;
}
function kdMensal(t) {
  const {
      y,
      m
    } = S.kd,
    a = new Date(y, m, 1),
    b = new Date(y, m + 1, 0),
    nd = b.getDate();
  const aAnt = new Date(y, m - 1, 1),
    bAnt = new Date(y, m, 0);
  const r = kdResumo(t, a, b),
    rAnt = kdResumo(t, aAnt, bAnt);
  let h = kdChips(t, r, rAnt, `em ${MESES[m]}`);
  // por dia: pessoas fora (ou horas lançadas no banco)
  const itens = [];
  for (let d = 1; d <= nd; d++) {
    const ds = iso(new Date(y, m, d)),
      wd = new Date(y, m, d).getDay();
    const partes = t === "banco" ? [{
      v: r.os.filter(o => o.inicio === ds).reduce((n, o) => n + (Number(o.horas) || 0), 0),
      cor: TIPOS.banco.cor,
      tip: `${d}/${m + 1}: horas lançadas`
    }] : KD_TIPOS(t).map(tp => {
      const q = new Set(r.os.filter(o => o.tipo === tp && !o.parcial && covers(o, ds)).map(o => o.func)).size;
      return {
        v: q,
        cor: TIPOS[tp].cor,
        tip: `${d}/${m + 1}: ${q} ${q === 1 ? "pessoa" : "pessoas"} em ${TIPOS[tp].nome.toLowerCase()}`
      };
    });
    itens.push({
      rot: String(d),
      partes,
      alvo: "",
      fim: wd === 0 || wd === 6
    });
  }
  h += `<div class="kd-box kd-chart"><h3>${t === "banco" ? "Horas lançadas por dia" : "Pessoas fora do posto por dia"} · ${MESES[m]} de ${y}</h3>${kdBarras(itens, {
    bw: 16,
    rotulos: false,
    cadaN: 2,
    aria: "por dia"
  })}${t === "todos" ? `<div class="u-margin-top-8px">${legend()}</div>` : ""}</div>`;
  h += `<div class="kd-grid"><div class="kd-box"><h3>Por funcionário</h3>${kdRankHtml(kdRank(r.os, a, b, t, "func"), t, "func")}</div><div class="kd-box"><h3>Por setor</h3>${kdRankHtml(kdRank(r.os, a, b, t, "setor"), t, "setor")}</div></div>`;
  h += `<div class="kd-box"><h3>Registros de ${MESES[m]} (${r.n})</h3>${kdTabela(r.os.slice().sort((x, z) => x.inicio.localeCompare(z.inicio)), t, a, b)}</div>`;
  return h;
}
function kdAnual(t) {
  const y = S.kd.y,
    a = new Date(y, 0, 1),
    b = new Date(y, 11, 31);
  const r = kdResumo(t, a, b),
    rAnt = kdResumo(t, new Date(y - 1, 0, 1), new Date(y - 1, 11, 31));
  let h = kdChips(t, r, rAnt.n ? rAnt : null, `em ${y}`);
  const itens = MESES.map((mn, i) => {
    const ai = new Date(y, i, 1),
      bi = new Date(y, i + 1, 0),
      aP = new Date(y - 1, i, 1),
      bP = new Date(y - 1, i + 1, 0);
    const partes = KD_TIPOS(t).map(tp => {
      const v = kdOcs(tp).reduce((n, o) => n + kdMede(o, ai, bi, tp), 0);
      return {
        v,
        cor: TIPOS[tp].cor,
        tip: `${mn}: ${kdUn(tp, v)} de ${TIPOS[tp].nome.toLowerCase()}`
      };
    });
    const fantasma = kdOcs(t).reduce((n, o) => n + kdMede(o, aP, bP, t), 0);
    return {
      rot: mn.slice(0, 3),
      partes,
      fantasma: rAnt.n ? fantasma : 0,
      alvo: `data-kmes="${i}"`
    };
  });
  h += `<div class="kd-box kd-chart"><h3>${t === "banco" ? "Horas" : "Dias"} por mês em ${y}${rAnt.n ? ` <span class="hint u-text-transform-none" >— contorno tracejado: ${y - 1}</span>` : ""} <span class="hint u-text-transform-none" >· clique num mês para abrir</span></h3>${kdBarras(itens, {
    aria: "por mês"
  })}${t === "todos" ? `<div class="u-margin-top-8px">${legend()}</div>` : ""}</div>`;
  h += `<div class="kd-grid"><div class="kd-box"><h3>Por funcionário em ${y}</h3>${kdRankHtml(kdRank(r.os, a, b, t, "func"), t, "func", 15)}</div><div class="kd-box"><h3>Por setor em ${y}</h3>${kdRankHtml(kdRank(r.os, a, b, t, "setor"), t, "setor", 15)}</div></div>`;
  h += `<div class="kd-box"><h3>Mês a mês</h3><div class="scroll"><table class="data"><thead><tr><th>Mês</th><th class="r">${t === "banco" ? "Horas" : "Dias"}</th><th class="r">Lançamentos</th><th class="r">Pessoas</th>${rAnt.n ? `<th class="r">${y - 1}</th>` : ""}</tr></thead><tbody>` + MESES.map((mn, i) => {
    const ri = kdResumo(t, new Date(y, i, 1), new Date(y, i + 1, 0)),
      rp = kdResumo(t, new Date(y - 1, i, 1), new Date(y - 1, i + 1, 0));
    return `<tr class="click" data-kmes="${i}"><td>${cap(mn)}</td><td class="r num">${kdUn(t, ri.total)}</td><td class="r num">${ri.n}</td><td class="r num">${ri.pessoas.size}</td>${rAnt.n ? `<td class="r num muted">${kdUn(t, rp.total)}</td>` : ""}</tr>`;
  }).join("") + `</tbody><tfoot><tr><th>Total</th><th class="r num">${kdUn(t, r.total)}</th><th class="r num">${r.n}</th><th class="r num">${r.pessoas.size}</th>${rAnt.n ? `<th class="r num">${kdUn(t, rAnt.total)}</th>` : ""}</tr></tfoot></table></div></div>`;
  return h;
}
function kdRegistros(t) {
  const k = S.kd,
    q = k.busca.trim().toLowerCase(),
    fm = funcMap();
  const [a, b] = k.per === "mes" ? [new Date(k.y, k.m, 1), new Date(k.y, k.m + 1, 0)] : k.per === "ano" ? [new Date(k.y, 0, 1), new Date(k.y, 11, 31)] : [new Date(2000, 0, 1), new Date(2100, 0, 1)];
  let os = kdOcs(t).filter(o => kdDentro(o, a, b, t) && (!q || [fm[o.func]?.nome, fm[o.func]?.setor, o.obs, o.destino].some(x => (x || "").toLowerCase().includes(q)))).sort((x, z) => z.inicio.localeCompare(x.inicio));
  const total = os.length;
  if (k.amostra) {
    const ids = new Set(k.amostra);
    os = os.filter(o => ids.has(o.id));
  }
  const POR = 50,
    pags = Math.max(1, Math.ceil(os.length / POR));
  if (k.pag >= pags) k.pag = 0;
  let h = `<div class="kd-tools">
    <input id="kd-busca" type="search" placeholder="Buscar nome, setor, observação" value="${esc(k.busca)}" aria-label="Buscar registros">
    <select id="kd-per-sel" aria-label="Período"><option value="mes" ${k.per === "mes" ? "selected" : ""}>${cap(MESES[k.m])} de ${k.y}</option><option value="ano" ${k.per === "ano" ? "selected" : ""}>Ano de ${k.y}</option><option value="tudo" ${k.per === "tudo" ? "selected" : ""}>Todo o histórico</option></select>
    <button class="btn small" type="button" data-kamostra="1">${k.amostra ? "Mostrar todos" : "Sortear amostra de 20"}</button>
    <span class="hint">${k.amostra ? `amostra aleatória de ${os.length} entre ${total}` : `${total} ${total === 1 ? "registro" : "registros"}`}</span></div>`;
  h += kdTabela(os.slice(k.pag * POR, k.pag * POR + POR), t, a, b);
  if (pags > 1) h += `<div class="kd-pag"><button class="btn small" type="button" data-kpag="-1" ${k.pag ? "" : "disabled"}>‹ Anteriores</button><span>página ${k.pag + 1} de ${pags}</span><button class="btn small" type="button" data-kpag="1" ${k.pag < pags - 1 ? "" : "disabled"}>Próximos ›</button></div>`;
  return h;
}
function renderKd() {
  const k = S.kd,
    t = k.t;
  if (!t) return;
  $("#kd-eyebrow").textContent = t === "todos" ? "Afastamentos" : "Detalhamento";
  $("#kd-title").innerHTML = `<i class="sw ${classeCor(kdCor(t), "c")}" ></i>${esc(kdNome(t))}`;
  document.querySelectorAll("[data-kv]").forEach(b => b.setAttribute("aria-pressed", b.dataset.kv === k.v));
  $("#kd-nav").hidden = k.v === "reg" && k.per === "tudo";
  $("#kd-per").textContent = k.v === "mes" || k.v === "reg" && k.per === "mes" ? `${cap(MESES[k.m])} de ${k.y}` : String(k.y);
  const body = $("#kd-body");
  let h = "";
  if (t === "todos" && k.v !== "reg") {
    const fora = foraHoje(),
      fm = funcMap();
    h += `<div class="kd-box"><h3>Fora do posto hoje · ${fmt(HOJE)} (${new Set(fora.map(o => o.func)).size})</h3>${fora.length ? `<ol class="rank">${fora.map(o => `<li><button class="link" type="button" data-ficha="${o.func}">${esc(fm[o.func].nome)}</button><span class="pill ${classeCor(TIPOS[o.tipo].cor, "c")}" >${TIPOS[o.tipo].nome} até ${fmtCurto(o.fim)}</span></li>`).join("")}</ol>` : `<div class="empty">Ninguém afastado hoje.</div>`}</div>`;
  }
  h += k.v === "mes" ? kdMensal(t) : k.v === "ano" ? kdAnual(t) : kdRegistros(t);
  body.innerHTML = h;
}
function openKd(t) {
  S.kd.t = t;
  S.kd.v = S.mode === "ano" ? "ano" : "mes";
  S.kd.y = S.y;
  S.kd.m = S.m;
  S.kd.pag = 0;
  S.kd.amostra = null;
  S.kd.busca = "";
  S.kd.per = S.mode === "ano" ? "ano" : "mes";
  renderKd();
  $("#dlg-kpi").showModal();
}
export function iniciarFeaturesPanoramaDetalhes() {
  S.kd = {
    t: null,
    v: "mes",
    y: hoje.getFullYear(),
    m: hoje.getMonth(),
    busca: "",
    per: "ano",
    pag: 0,
    amostra: null
  };
  {
    const dk = $("#dlg-kpi");
    dk.addEventListener("click", e => {
      const b = e.target.closest("[data-kv],[data-kn],[data-kmes],[data-kpag],[data-kamostra]");
      if (!b) return;
      const k = S.kd;
      if (b.dataset.kv) {
        k.v = b.dataset.kv;
        k.pag = 0;
      }
      if (b.dataset.kn) {
        const n = +b.dataset.kn;
        if (k.v === "mes" || k.v === "reg" && k.per === "mes") {
          const d = new Date(k.y, k.m + n, 1);
          k.y = d.getFullYear();
          k.m = d.getMonth();
        } else k.y += n;
        k.pag = 0;
        k.amostra = null;
      }
      if (b.dataset.kmes != null && b.dataset.kmes !== "") {
        k.m = +b.dataset.kmes;
        k.v = "mes";
      }
      if (b.dataset.kpag) {
        k.pag += +b.dataset.kpag;
      }
      if (b.dataset.kamostra) {
        if (k.amostra) k.amostra = null;else {
          const [a, bb] = k.per === "mes" ? [new Date(k.y, k.m, 1), new Date(k.y, k.m + 1, 0)] : k.per === "ano" ? [new Date(k.y, 0, 1), new Date(k.y, 11, 31)] : [new Date(2000, 0, 1), new Date(2100, 0, 1)];
          const pool = kdOcs(k.t).filter(o => kdDentro(o, a, bb, k.t)).map(o => o.id);
          for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
          }
          k.amostra = pool.slice(0, 20);
        }
        k.pag = 0;
      }
      renderKd();
    });
    dk.addEventListener("input", e => {
      if (e.target.id === "kd-busca") {
        S.kd.busca = e.target.value;
        S.kd.pag = 0;
        const pos = e.target.selectionStart;
        renderKd();
        const el = $("#kd-busca");
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
    dk.addEventListener("change", e => {
      if (e.target.id === "kd-per-sel") {
        S.kd.per = e.target.value;
        S.kd.pag = 0;
        S.kd.amostra = null;
        renderKd();
      }
    });
  }
}
export { KD_TIPOS, kdNome, kdCor, kdUn, kdOcs, kdMede, kdDentro, kdResumo, kdRank, kdRankHtml, kdChips, kdTabela, kdBarras, kdMensal, kdAnual, kdRegistros, renderKd, openKd };
