/** Funcionalidade: funcionarios / formulario. */
import { $, esc, toast, errMsg } from "../../core/dom.js";
import { DIAS_UTEIS, WD_NOME, mins, horasDia, hN, checaHibrido, addHoras, intervaloDe, semanaDe } from "../../core/jornada.js";
import { cap, fmt } from "../../core/datas.js";
import { prazoContrato, duracaoTxt, prazoPill, passaDe2Anos } from "../contratos.js";
import { nivelPorTempo } from "../remuneracao.js";
import { S } from "../../core/estado.js";
import { renderFx, nomeExtra } from "../beneficios-extras.js";
import { ajustaAT } from "../cadastro-transporte.js";
import { r2 } from "../../core/formatacao.js";
import { store } from "../../core/armazenamento.js";
import { render } from "../../core/render.js";
let df;
let editF = null;
const DIA_P = {
  tipo: "P",
  pe: "08:00",
  ps: "17:00",
  he: "",
  hs: ""
};
const DIA_M = {
  tipo: "M",
  pe: "08:00",
  ps: "14:00",
  he: "15:00",
  hs: "17:00"
};
const DIA_H = {
  tipo: "H",
  pe: "",
  ps: "",
  he: "08:00",
  hs: "17:00"
};
const PRESETS = {
  diario: {
    1: DIA_M,
    2: DIA_M,
    3: DIA_M,
    4: DIA_M,
    5: DIA_M
  },
  dia: {
    1: DIA_P,
    2: DIA_P,
    3: DIA_M,
    4: DIA_P,
    5: DIA_H
  }
};
function preencheGrade(s) {
  for (const d of DIAS_UTEIS) {
    const x = s[d] || DIA_P;
    $("#f-t-" + d).value = x.tipo;
    $("#f-pe-" + d).value = x.pe || "";
    $("#f-ps-" + d).value = x.ps || "";
    $("#f-he-" + d).value = x.he || "";
    $("#f-hs-" + d).value = x.hs || "";
  }
  syncGrade();
}
function leGrade() {
  const s = {};
  for (const d of DIAS_UTEIS) {
    const t = $("#f-t-" + d).value;
    s[d] = {
      tipo: t,
      pe: t === "H" ? "" : $("#f-pe-" + d).value,
      ps: t === "H" ? "" : $("#f-ps-" + d).value,
      he: t === "P" ? "" : $("#f-he-" + d).value,
      hs: t === "P" ? "" : $("#f-hs-" + d).value
    };
  }
  return s;
}
function problemasGrade(s) {
  const erros = [];
  for (const d of DIAS_UTEIS) {
    const x = s[d],
      n = cap(WD_NOME[d]);
    if (x.tipo !== "H" && !(mins(x.ps) > mins(x.pe))) erros.push(`${n}: confira o horário presencial.`);
    if (x.tipo !== "P" && !(mins(x.hs) > mins(x.he))) erros.push(`${n}: confira o horário de home office.`);
    if (x.tipo === "M" && mins(x.pe) < mins(x.hs) && mins(x.he) < mins(x.ps)) erros.push(`${n}: o presencial e o home office estão sobrepostos.`);
  }
  return erros;
}
function syncGrade() {
  const s = leGrade(),
    iv = Number($("#f-int").value) || 0;
  let p = 0,
    h = 0;
  for (const d of DIAS_UTEIS) {
    const t = s[d].tipo;
    $("#f-p-" + d).hidden = t === "H";
    $("#f-poff-" + d).hidden = t !== "H";
    $("#f-h-" + d).hidden = t === "P";
    $("#f-hoff-" + d).hidden = t !== "P";
    const x = horasDia(s[d], iv);
    p += x.p;
    h += x.h;
    $("#f-hr-" + d).textContent = hN(x.p + x.h);
  }
  const fmtoId = checaHibrido(s),
    carga = Number($("#f-carga").value) || 0,
    tot = p + h;
  document.querySelectorAll("[data-preset]").forEach(b => b.setAttribute("aria-pressed", b.dataset.preset === fmtoId));
  const linhas = [`<div><strong>${hN(p)}</strong> presencial · <strong>${hN(h)}</strong> home office · <strong>${hN(tot)}</strong> na semana</div>`];
  linhas.push(Math.abs(h - 10) < 0.01 ? `<div class="ok">✓ 10h de home office na semana</div>` : `<div class="warn">Home office soma ${hN(h)} — o previsto é 10h.</div>`);
  if (carga && Math.abs(tot - carga) >= 0.01) linhas.push(`<div class="warn">A semana soma ${hN(tot)}, mas a carga cadastrada é ${carga}h.</div>`);
  if (!fmtoId) linhas.push(`<div class="warn">Formato diferente das duas opções: misto todos os dias, ou 1 dia de home office + 1 dia misto.</div>`);
  problemasGrade(s).forEach(e => linhas.push(`<div class="warn">${esc(e)}</div>`));
  $("#f-resumo").innerHTML = linhas.join("");
}
const ehTemp = () => ["estagiario", "aprendiz"].includes($("#f-vinc").value);
function syncDur() {
  const ci = $("#f-ci").value,
    cf = $("#f-cf").value,
    out = $("#f-dur");
  if (!ci || !cf) {
    out.innerHTML = `<div class="hint">Informe início e término para acompanhar o prazo.</div>`;
    return;
  }
  if (cf < ci) {
    out.innerHTML = `<div class="warn">O término está antes do início.</div>`;
    return;
  }
  const p = prazoContrato({
    vinculo: "estagiario",
    contratoInicio: ci,
    contratoFim: cf
  });
  const linhas = [`<div>Duração de <strong>${duracaoTxt(ci, cf)}</strong> · ${prazoPill(p)}</div>`];
  if (passaDe2Anos(ci, cf)) linhas.push(`<div class="warn">Passa de 2 anos — o limite legal para ${$("#f-vinc").value === "aprendiz" ? "a aprendizagem (CLT, art. 428)" : "o estágio no mesmo órgão (Lei 11.788/2008, art. 11)"}.</div>`);
  out.innerHTML = linhas.join("");
}
function aplicaJornadaDiaria() {
  const jd = Number($("#f-jd").value);
  if (!jd) return;
  $("#f-carga").value = jd * 5;
  if ($("#f-regime").value === "Presencial") $("#f-sai").value = addHoras($("#f-ent").value || "08:00", jd);
  if ($("#f-regime").value === "Teletrabalho") $("#f-sai-ho").value = addHoras($("#f-ent-ho").value || "08:00", jd);
}
function ajustaVinculo() {
  const v = $("#f-vinc").value,
    temp = ehTemp();
  $("#f-contrato").hidden = !temp;
  $("#f-contrato-leg").textContent = v === "aprendiz" ? "Contrato de aprendizagem" : "Contrato de estágio";
  $("#lbl-inst").firstChild.textContent = v === "aprendiz" ? "Entidade formadora" : "Instituição de ensino";
  if (temp) syncDur();
  $("#lbl-origem").hidden = v !== "cedido";
}
const ajustaSit = () => {
  $("#lbl-cedpara").hidden = $("#f-sit").value !== "cedido";
};
function ajustaRem() {
  const v = $("#f-vinc").value,
    ef = v === "efetivo",
    temp = v === "estagiario";
  $("#lbl-carreira").hidden = $("#lbl-nivsal").hidden = !ef;
  $("#lbl-fgtipo").hidden = !ef;
  $("#lbl-bolsa").hidden = !temp;
  $("#f-rem").hidden = !(ef || temp);
  const adm = $("#f-adm").value;
  $("#f-rem-hint").textContent = ef ? adm ? `Pelo tempo de casa (admissão ${fmt(adm)}), o nível previsto é ${nivelPorTempo(adm)}. Deixe em branco para usar o previsto; preencha se a progressão não foi concedida na avaliação de desempenho.` : "Informe a admissão para calcular o nível pelo tempo de casa." : "";
}
function ajustaRegime() {
  const r = $("#f-regime").value;
  $("#f-hib").hidden = r !== "Híbrido";
  $("#lbl-ent").hidden = $("#lbl-sai").hidden = r !== "Presencial";
  $("#lbl-ent-ho").hidden = $("#lbl-sai-ho").hidden = r !== "Teletrabalho";
  if (r === "Híbrido") syncGrade();
}
function openFunc(id) {
  editF = id ? S.func.find(f => f.id === id) : null;
  const f = editF || {};
  $("#func-title").textContent = editF ? "Editar funcionário" : "Novo funcionário";
  $("#f-nome").value = f.nome || "";
  $("#f-mat").value = f.matricula || "";
  $("#f-adm").value = f.admissao || "";
  $("#f-cargo").value = f.cargo || "";
  $("#f-setor").value = f.setor || "";
  $("#f-regime").value = f.regime || "Presencial";
  $("#f-funcao").value = f.funcao || "";
  $("#f-ftipo").value = f.funcaoTipo || "";
  $("#f-nivel").value = f.nivel || "";
  $("#f-port").value = f.portariaFuncao || "";
  $("#f-ingresso").value = f.ingresso || "";
  $("#f-origem").value = f.orgaoOrigem || "";
  $("#f-cedpara").value = f.cedidoPara || "";
  $("#f-carga").value = f.carga || 40;
  $("#f-ent").value = f.entrada || "08:00";
  $("#f-sai").value = f.saida || "17:00";
  $("#f-ent-ho").value = f.entradaHO || f.entrada || "08:00";
  $("#f-sai-ho").value = f.saidaHO || f.saida || "17:00";
  $("#f-int").value = intervaloDe(f);
  $("#f-vinc").value = f.vinculo || "efetivo";
  $("#f-jd").value = f.jornadaDiaria ? String(f.jornadaDiaria) : "";
  $("#f-prov").value = f.providencia || "";
  $("#f-inst").value = f.instituicao || "";
  $("#f-ci").value = f.contratoInicio || "";
  $("#f-cf").value = f.contratoFim || "";
  ajustaVinculo();
  preencheGrade(f.regime === "Híbrido" ? semanaDe(f) : PRESETS.diario);
  ajustaRegime();
  $("#f-sit").value = f.situacao || "ativo";
  $("#f-err").textContent = "";
  ajustaSit();
  S.fxItens = JSON.parse(JSON.stringify(f.beneficiosExtras || []));
  renderFx();
  $("#f-carreira").value = f.carreira || "";
  $("#f-nivsal").value = f.nivelSalarial || "";
  $("#f-fgtipo").value = f.fgTipo || "";
  $("#f-bolsa").value = f.bolsaTipo || "";
  ajustaRem();
  $("#f-usa-at").checked = !!f.usaTransporte;
  $("#f-at").value = f.valorTransporte ?? "";
  ajustaAT();
  $("#setores").innerHTML = [...new Set(S.func.map(x => x.setor).filter(Boolean))].map(s => `<option value="${esc(s)}">`).join("");
  const del = $("#f-del");
  del.hidden = !editF;
  del.classList.remove("armed");
  del.textContent = "Excluir funcionário";
  df.showModal();
  $("#f-nome").focus();
}
export function iniciarFeaturesFuncionariosFormulario() {
  df = $("#dlg-func");
  $("#f-semana").innerHTML = DIAS_UTEIS.map(d => {
    const n = cap(WD_NOME[d]);
    return `<tr>
  <td>${n}</td>
  <td><select id="f-t-${d}" aria-label="${n}: formato"><option value="P">Presencial</option><option value="M">Misto</option><option value="H">Home office</option></select></td>
  <td><span class="pair" id="f-p-${d}"><input type="time" id="f-pe-${d}" aria-label="${n}: entrada presencial">–<input type="time" id="f-ps-${d}" aria-label="${n}: saída presencial"></span><span class="off" id="f-poff-${d}">—</span></td>
  <td><span class="pair" id="f-h-${d}"><input type="time" id="f-he-${d}" aria-label="${n}: entrada home office">–<input type="time" id="f-hs-${d}" aria-label="${n}: saída home office"></span><span class="off" id="f-hoff-${d}">—</span></td>
  <td class="r num" id="f-hr-${d}"></td></tr>`;
  }).join("");
  $("#f-semana").addEventListener("input", syncGrade);
  $("#f-semana").addEventListener("change", syncGrade);
  $("#f-int").addEventListener("input", syncGrade);
  $("#f-carga").addEventListener("input", syncGrade);
  document.querySelectorAll("[data-preset]").forEach(b => b.addEventListener("click", () => preencheGrade(PRESETS[b.dataset.preset])));
  $("#f-vinc").addEventListener("change", () => {
    ajustaVinculo();
    if (ehTemp()) {
      aplicaJornadaDiaria();
      syncGrade();
    }
  });
  $("#f-jd").addEventListener("change", () => {
    aplicaJornadaDiaria();
    syncGrade();
  });
  $("#f-ent").addEventListener("change", () => {
    if (ehTemp() && $("#f-jd").value) $("#f-sai").value = addHoras($("#f-ent").value, Number($("#f-jd").value));
  });
  $("#f-ent-ho").addEventListener("change", () => {
    if (ehTemp() && $("#f-jd").value) $("#f-sai-ho").value = addHoras($("#f-ent-ho").value, Number($("#f-jd").value));
  });
  $("#f-ci").addEventListener("change", syncDur);
  $("#f-sit").addEventListener("change", ajustaSit);
  $("#f-vinc").addEventListener("change", ajustaRem);
  $("#f-adm").addEventListener("change", ajustaRem);
  $("#f-cf").addEventListener("change", syncDur);
  $("#f-regime").addEventListener("change", () => {
    // ao virar híbrido sem grade definida, começa pelo modelo "misto todos os dias"
    if ($("#f-regime").value === "Híbrido" && !(editF?.regime === "Híbrido" && editF?.semana)) preencheGrade(PRESETS.diario);
    ajustaRegime();
  });
  $("#form-func").addEventListener("submit", async e => {
    e.preventDefault();
    const nome = $("#f-nome").value.trim();
    if (!nome) return $("#f-err").textContent = "Informe o nome.";
    const regime = $("#f-regime").value;
    const vinculo = $("#f-vinc").value,
      temp = ehTemp();
    if (temp) {
      if (!$("#f-ci").value || !$("#f-cf").value) return $("#f-err").textContent = "Informe o início e o término do contrato.";
      if ($("#f-cf").value < $("#f-ci").value) return $("#f-err").textContent = "O término do contrato está antes do início.";
    }
    let semana = null;
    if (regime === "Híbrido") {
      semana = leGrade();
      const erros = problemasGrade(semana);
      if (erros.length) return $("#f-err").textContent = erros[0];
      if (DIAS_UTEIS.every(d => semana[d].tipo === "P")) return $("#f-err").textContent = "Nenhum home office na semana — mude o regime para Presencial.";
      if (DIAS_UTEIS.every(d => semana[d].tipo === "H")) return $("#f-err").textContent = "Todos os dias em home office — mude o regime para Teletrabalho.";
    }
    if (regime === "Presencial" && $("#f-sai").value && $("#f-ent").value >= $("#f-sai").value) return $("#f-err").textContent = "A saída precisa ser depois da entrada.";
    if (regime === "Teletrabalho" && $("#f-sai-ho").value && $("#f-ent-ho").value >= $("#f-sai-ho").value) return $("#f-err").textContent = "A saída precisa ser depois da entrada.";
    const data = {
      nome,
      matricula: $("#f-mat").value.trim(),
      admissao: $("#f-adm").value,
      cargo: $("#f-cargo").value.trim(),
      setor: $("#f-setor").value.trim(),
      regime,
      carga: Number($("#f-carga").value) || null,
      intervalo: Number($("#f-int").value) || 0,
      entrada: regime === "Presencial" ? $("#f-ent").value : "",
      saida: regime === "Presencial" ? $("#f-sai").value : "",
      entradaHO: regime === "Teletrabalho" ? $("#f-ent-ho").value : "",
      saidaHO: regime === "Teletrabalho" ? $("#f-sai-ho").value : "",
      situacao: $("#f-sit").value,
      criadoEm: editF?.criadoEm || new Date().toISOString()
    };
    if (semana) data.semana = semana;
    Object.assign(data, {
      funcao: $("#f-funcao").value.trim(),
      funcaoTipo: $("#f-funcao").value.trim() ? $("#f-ftipo").value || "comissao" : "",
      nivel: $("#f-nivel").value,
      portariaFuncao: $("#f-port").value.trim(),
      ingresso: $("#f-ingresso").value.trim(),
      orgaoOrigem: vinculo === "cedido" ? $("#f-origem").value.trim() : "",
      cedidoPara: $("#f-sit").value === "cedido" ? $("#f-cedpara").value.trim() : ""
    });
    for (const k of ["nomeAbreviado", "importado", "linhaPlanilha", "importadoContrato", "periodosAquisitivos", "nomePlanilhaFerias", "abonos", "carreira", "nivelSalarial", "fgTipo", "bolsaTipo", "beneficiosExtras"]) if (editF && editF[k] != null) data[k] = editF[k];
    const fxRuim = S.fxItens.find(x => !(Number(x.valor) > 0) || x.recorrencia === "meses" && !(x.meses || []).length || x.inicio && x.fim && x.fim < x.inicio || x.tipo === "outro" && !(x.descricao || "").trim());
    if (fxRuim) return $("#f-err").textContent = `Confira o benefício "${nomeExtra(fxRuim)}": informe o valor${fxRuim.recorrencia === "meses" ? ", marque ao menos um mês" : ""}${fxRuim.tipo === "outro" ? " e a descrição" : ""}, e a vigência final não pode ser antes da inicial.`;
    data.beneficiosExtras = S.fxItens.map(x => ({
      tipo: x.tipo,
      descricao: x.tipo === "outro" ? (x.descricao || "").trim() : "",
      valor: r2(Number(x.valor)),
      recorrencia: x.recorrencia === "meses" ? "meses" : "mensal",
      meses: x.recorrencia === "meses" ? (x.meses || []).slice().sort((a, b) => a - b) : [],
      inicio: x.inicio || "",
      fim: x.fim || ""
    }));
    Object.assign(data, {
      carreira: $("#f-carreira").value,
      nivelSalarial: Number($("#f-nivsal").value) || null,
      fgTipo: $("#f-fgtipo").value,
      bolsaTipo: $("#f-bolsa").value
    });
    if (data.nivelSalarial && (data.nivelSalarial < 1 || data.nivelSalarial > 30)) return $("#f-err").textContent = "O nível salarial vai de 1 a 30.";
    data.usaTransporte = $("#f-usa-at").checked;
    data.valorTransporte = data.usaTransporte ? Number($("#f-at").value) || 0 : 0;
    if (data.usaTransporte && !data.valorTransporte) return $("#f-err").textContent = "Informe o valor do auxílio-transporte, ou desmarque se a pessoa não utiliza.";
    data.vinculo = vinculo;
    if (temp) {
      data.jornadaDiaria = Number($("#f-jd").value) || null;
      data.providencia = $("#f-prov").value.trim();
      data.instituicao = $("#f-inst").value.trim();
      data.contratoInicio = $("#f-ci").value;
      data.contratoFim = $("#f-cf").value;
    }
    if (editF?.exemplo) data.exemplo = true;
    const id = editF?.id || store.newId("funcionarios");
    const btn = $("#f-save");
    btn.disabled = true;
    try {
      await store.set("funcionarios", id, data);
      df.close();
      S.sel = id;
      toast(editF ? "Cadastro atualizado" : "Funcionário cadastrado");
      if (!editF && S.tab !== "func") {
        S.tab = "func";
        render();
      }
    } catch (x) {
      $("#f-err").textContent = errMsg(x);
    } finally {
      btn.disabled = false;
    }
  });
  $("#f-del").addEventListener("click", async e => {
    const b = e.currentTarget;
    const n = S.ocs.filter(o => o.func === editF.id).length;
    if (!b.classList.contains("armed")) {
      b.classList.add("armed");
      b.textContent = n ? `Excluir com ${n} ${n === 1 ? "lançamento" : "lançamentos"}?` : "Confirmar exclusão";
      return;
    }
    b.disabled = true;
    try {
      for (const o of S.ocs.filter(o => o.func === editF.id)) await store.del("ocorrencias", o.id);
      await store.del("funcionarios", editF.id);
      df.close();
      S.sel = null;
      toast("Funcionário excluído");
    } catch (x) {
      $("#f-err").textContent = errMsg(x);
    } finally {
      b.disabled = false;
    }
  });
  document.querySelectorAll("dialog [data-close]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));
}
export { df, editF, DIA_P, DIA_M, DIA_H, PRESETS, preencheGrade, leGrade, problemasGrade, syncGrade, ehTemp, syncDur, aplicaJornadaDiaria, ajustaVinculo, ajustaSit, ajustaRem, ajustaRegime, openFunc };
