import { classeCor } from "../../core/cores.js";
/** Funcionalidade: panorama / mes. */
import { range, visiveis, overlap, naoUtil, funcMap } from "../../core/colecoes.js";
import { S } from "../../core/estado.js";
import { parse, iso, HOJE, fmt, hoje, DAY } from "../../core/datas.js";
import { kpis, legend } from "./indicadores.js";
import { MESES, WD, AUSENCIAS, TIPOS } from "../../core/constantes.js";
import { stats, foraHoje, emHO } from "../../core/estatisticas.js";
import { esc } from "../../core/dom.js";
import { fmtH } from "../../core/formatacao.js";
import { modoDia, semanaDe, descDia } from "../../core/jornada.js";
import { painelProximos } from "./proximos.js";
import { painelFerias } from "../ferias.js";
import { painelAbonos } from "../abonos.js";
import { painelAtestados } from "../atestados.js";
import { painelQuadro } from "./quadro.js";
import { painelContratos } from "../contratos.js";
function panoramaMes() {
  const [a, b] = range();
  const nd = b.getDate();
  const fs = visiveis();
  const map = {}; // func -> dia -> [ocs]
  for (const o of S.ocs) {
    if (!overlap(o, a, b)) continue;
    const s = Math.max(1, parse(o.inicio) < a ? 1 : parse(o.inicio).getDate());
    const e = parse(o.fim || o.inicio) > b ? nd : parse(o.fim || o.inicio).getDate();
    for (let d = s; d <= e; d++) ((map[o.func] ??= {})[d] ??= []).push(o);
  }
  let h = kpis();
  h += `<section class="panel"><div class="panel-head"><h2>Escala de ${MESES[S.m]}</h2>${legend()}</div>`;
  if (!fs.length) {
    h += `<div class="empty">Nenhum funcionário cadastrado ainda. <button class="btn small primary" type="button" data-act="new-func">Cadastrar o primeiro</button></div></section>`;
  } else {
    h += `<div class="scroll"><table class="escala"><thead><tr><th class="name">Funcionário</th>`;
    for (let d = 1; d <= nd; d++) {
      const dt = new Date(S.y, S.m, d),
        wd = dt.getDay();
      h += `<th class="${naoUtil(dt) ? "we" : ""} ${iso(dt) === HOJE ? "hoje" : ""}" ${(S.cfg.feriados || []).includes(iso(dt)) ? 'title="Feriado / ponto facultativo"' : ""}><span class="d">${d}</span><span class="wd">${WD[wd]}</span></th>`;
    }
    AUSENCIAS.forEach((t, i) => h += `<th class="tot ${i ? "" : "first"} ${classeCor(TIPOS[t].cor, "c")}"  title="Dias de ${TIPOS[t].nome.toLowerCase()} no mês">${TIPOS[t].sigla}</th>`);
    h += `</tr></thead><tbody>`;
    for (const f of fs) {
      const st = stats(S.ocs.filter(o => o.func === f.id), a, b);
      h += `<tr><td class="name"><button type="button" data-ficha="${f.id}"><strong>${esc(f.nome)}${f.exemplo ? '<span class="chip-ex">exemplo</span>' : ""}</strong><span>${esc(f.setor || f.cargo || "")}</span></button></td>`;
      for (let d = 1; d <= nd; d++) {
        const dt = new Date(S.y, S.m, d),
          wd = dt.getDay(),
          ds = iso(dt);
        const list = map[f.id]?.[d] || [];
        const aus = list.filter(o => o.tipo !== "banco").sort((x, y) => AUSENCIAS.indexOf(x.tipo) - AUSENCIAS.indexOf(y.tipo));
        const bh = list.find(o => o.tipo === "banco");
        const top = aus[0];
        const tip = [...aus, ...(bh ? [bh] : [])].map(o => `${TIPOS[o.tipo].nome}${o.parcial ? " (comparecimento, sem afastamento)" : ""}${o.tipo === "banco" ? " " + fmtH(Number(o.horas) || 0) : ""}${o.destino ? " — " + o.destino : ""}`).join(" · ");
        const modo = top ? null : modoDia(f, wd),
          ho = modo === "H",
          mx = modo === "M";
        const dia = semanaDe(f)[wd];
        const label = `${f.nome}, ${d} de ${MESES[S.m]}: ${tip || (dia ? descDia(dia) : "sem lançamento")}`;
        const cls = ["cell", top ? "on" : "", top?.parcial ? "parc" : "", ho ? "ho" : "", mx ? "mx" : "", aus.length > 1 ? "multi" : "", bh ? "bh" : ""].join(" ");
        h += `<td class="day ${naoUtil(dt) ? "we" : ""}"><button type="button" class="${cls} ${top ? classeCor(TIPOS[top.tipo].cor, "c") : ""}"  data-f="${f.id}" data-d="${ds}" data-oc="${(top || bh)?.id || ""}" title="${esc(label)}" aria-label="${esc(label)}">${top ? TIPOS[top.tipo].sigla : ho ? "h" : ""}</button></td>`;
      }
      AUSENCIAS.forEach((t, i) => {
        const v = st[t].dias;
        h += `<td class="tot ${i ? "" : "first"} ${v ? "" : "zero"}">${v || "·"}</td>`;
      });
      h += `</tr>`;
    }
    h += `</tbody></table></div><p class="hint u-margin-10px-0-0" >Clique num dia vazio para lançar naquela data; clique num dia colorido para ver ou editar o lançamento. Totais em dias corridos no mês.</p></section>`;
  }
  h += `<div class="two">${painelHoje()}${painelProximos()}${painelFerias()}${painelAbonos()}${painelAtestados()}${painelQuadro()}</div>${painelContratos()}`;
  return h;
}
function painelHoje() {
  const fm = funcMap();
  const fora = foraHoje();
  let h = `<section class="panel"><div class="panel-head"><h2>Quem está fora hoje</h2><span class="hint">${fmt(HOJE)}</span></div>`;
  const wd = hoje.getDay();
  const ho = emHO(),
    mx = emHO("M");
  const linha = (tag, cls, arr) => arr.length ? `<div><span class="${cls}">${tag}</span>${arr.map(f => `<span class="nm">${esc(f.nome)}</span> <span class="num">(${esc(descDia(semanaDe(f)[wd]))})</span>`).join(" · ")}</div>` : "";
  const hoTxt = ho.length || mx.length ? `<div class="hint u-margin-10px-0-0-53" >${linha("HOME OFFICE", "ho-tag", ho)}${linha("MISTO", "pres-tag", mx)}</div>` : "";
  if (!fora.length) return h + `<div class="empty">Ninguém afastado hoje.</div>${hoTxt}</section>`;
  h += hoTxt.replace("u-margin-10px-0-0-53", "home-office-com-afastamentos") + `<ul class="list">` + fora.map(o => `<li><button class="link" type="button" data-oc-open="${o.id}">${esc(fm[o.func].nome)}</button><span class="pill ${classeCor(TIPOS[o.tipo].cor, "c")}" >${TIPOS[o.tipo].nome}</span><span class="meta">${o.inicio === o.fim ? "somente hoje" : `até ${fmt(o.fim)} · retorna ${fmt(iso(new Date(parse(o.fim).getTime() + DAY)))}`}${o.destino ? " · " + esc(o.destino) : ""}</span></li>`).join("") + `</ul>`;
  return h + `</section>`;
}
export { panoramaMes, painelHoje };
