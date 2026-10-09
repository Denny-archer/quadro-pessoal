/** Funcionalidade: ocorrencias / formulario. */
import { $, toast, esc, errMsg } from "../../core/dom.js";
import { TIPOS } from "../../core/constantes.js";
import { fmt, HOJE } from "../../core/datas.js";
import { S } from "../../core/estado.js";
import { openFunc } from "../funcionarios/formulario.js";
import { byName, noQuadro } from "../../core/colecoes.js";
import { store } from "../../core/armazenamento.js";
let dl;
let editOc = null;
function ajustaTipo() {
  const t = $("#l-tipo").value;
  const showFim = t !== "banco",
    showH = ["banco", "abono", "capacitacao"].includes(t),
    showD = ["viagem", "capacitacao"].includes(t);
  $("#lbl-fim").hidden = !showFim;
  $("#lbl-horas").hidden = !showH;
  $("#lbl-destino").hidden = !showD;
  $("#lbl-inicio").firstChild.textContent = t === "banco" ? "Data" : "Início";
  $("#lbl-horas").firstChild.textContent = t === "banco" ? "Horas (+ crédito, − débito)" : t === "abono" ? "Horas abonadas (se parcial)" : "Carga horária do curso (h)";
  $("#lbl-destino").firstChild.textContent = t === "viagem" ? "Destino / motivo da viagem" : "Curso ou evento";
  const notes = {
    atestado: "Registre apenas o período de afastamento. Não anote CID nem diagnóstico — dado de saúde é sensível (LGPD).",
    ferias: "Férias em dias corridos. Podem ser fracionadas: lance cada período separadamente.",
    abono: "Para abono de um dia inteiro, use a mesma data em início e término.",
    banco: "Use valores positivos para horas extras/crédito e negativos para compensação/débito.",
    viagem: "Viagens a serviço aparecem na escala como fora do posto.",
    capacitacao: "Informe a carga horária para acumular as horas de capacitação do ano."
  };
  $("#lbl-abpec").hidden = $("#lbl-aviso").hidden = t !== "ferias";
  $("#lbl-parcial").hidden = t !== "atestado";
  if (t === "atestado" && $("#l-parcial").checked) $("#lbl-fim").hidden = true;
  let nota = notes[t] || "";
  if (t === "ferias" && editOc && editOc.aquisitivo) nota = `${editOc.parcela ? editOc.parcela + " período · " : ""}aquisitivo ${fmt(editOc.aquisitivo)} a ${fmt(editOc.aquisitivoFim)}${editOc.limite ? " · gozar até " + fmt(editOc.limite) : ""}. ` + nota;
  $("#l-note").textContent = nota;
  $("#l-note").hidden = !nota;
}
function openLanc(id, pre = {}) {
  if (!S.func.length) {
    openFunc();
    toast("Cadastre um funcionário antes de lançar.");
    return;
  }
  editOc = id ? S.ocs.find(o => o.id === id) : null;
  const o = editOc || {
    tipo: "ferias",
    inicio: HOJE,
    fim: HOJE,
    ...pre
  };
  $("#lanc-title").textContent = editOc ? "Editar lançamento" : "Novo lançamento";
  $("#l-func").innerHTML = [...S.func].sort(byName).filter(f => noQuadro(f) || f.id === o.func).map(f => `<option value="${f.id}">${esc(f.nome)}</option>`).join("");
  $("#l-func").value = o.func || S.sel || $("#l-func").options[0]?.value;
  $("#l-tipo").value = o.tipo;
  $("#l-inicio").value = o.inicio || HOJE;
  $("#l-fim").value = o.fim || o.inicio || HOJE;
  $("#l-horas").value = o.horas ?? "";
  $("#l-destino").value = o.destino || "";
  $("#l-obs").value = o.obs || "";
  $("#l-abpec").value = o.abonoPecuniario || "";
  $("#l-aviso").value = o.avisoFerias || "";
  $("#l-parcial").checked = !!o.parcial;
  $("#l-err").textContent = "";
  const del = $("#l-del");
  del.hidden = !editOc;
  del.classList.remove("armed");
  del.textContent = "Excluir";
  ajustaTipo();
  dl.showModal();
}
export function iniciarFeaturesOcorrenciasFormulario() {
  dl = $("#dlg-lanc");
  $("#l-tipo").innerHTML = Object.entries(TIPOS).map(([k, t]) => `<option value="${k}">${t.nome}</option>`).join("");
  $("#l-tipo").addEventListener("change", ajustaTipo);
  $("#l-parcial").addEventListener("change", ajustaTipo);
  $("#l-inicio").addEventListener("change", () => {
    if ($("#l-fim").value < $("#l-inicio").value) $("#l-fim").value = $("#l-inicio").value;
  });
  $("#form-lanc").addEventListener("submit", async e => {
    e.preventDefault();
    const t = $("#l-tipo").value,
      ini = $("#l-inicio").value,
      parcial = t === "atestado" && $("#l-parcial").checked;
    const fim = t === "banco" || parcial ? ini : $("#l-fim").value || ini;
    const hr = $("#l-horas").value === "" ? null : Number($("#l-horas").value);
    const err = $("#l-err");
    if (!$("#l-func").value) return err.textContent = "Escolha o funcionário.";
    if (!ini) return err.textContent = "Informe a data de início.";
    if (fim < ini) return err.textContent = "O término não pode ser antes do início.";
    if (t === "banco" && (hr === null || !hr)) return err.textContent = "Informe as horas do banco (ex.: 2 ou −1,5).";
    const extras = editOc ? Object.fromEntries(Object.entries(editOc).filter(([k]) => k !== "id")) : {};
    const data = {
      ...extras,
      func: $("#l-func").value,
      tipo: t,
      inicio: ini,
      fim,
      horas: ["banco", "abono", "capacitacao"].includes(t) ? hr : null,
      parcial,
      abonoPecuniario: t === "ferias" ? Number($("#l-abpec").value) || 0 : 0,
      avisoFerias: t === "ferias" ? $("#l-aviso").value.trim() : "",
      destino: ["viagem", "capacitacao"].includes(t) ? $("#l-destino").value.trim() : "",
      obs: $("#l-obs").value.trim(),
      criadoEm: editOc?.criadoEm || new Date().toISOString(),
      atualizadoEm: new Date().toISOString()
    };
    if (editOc?.exemplo) data.exemplo = true;
    const btn = $("#l-save");
    btn.disabled = true;
    try {
      await store.set("ocorrencias", editOc?.id || store.newId("ocorrencias"), data);
      dl.close();
      toast(editOc ? "Lançamento atualizado" : "Lançamento salvo");
    } catch (x) {
      err.textContent = errMsg(x);
    } finally {
      btn.disabled = false;
    }
  });
  $("#l-del").addEventListener("click", async e => {
    const b = e.currentTarget;
    if (!b.classList.contains("armed")) {
      b.classList.add("armed");
      b.textContent = "Confirmar exclusão";
      return;
    }
    b.disabled = true;
    try {
      await store.del("ocorrencias", editOc.id);
      dl.close();
      toast("Lançamento excluído");
    } catch (x) {
      $("#l-err").textContent = errMsg(x);
    } finally {
      b.disabled = false;
    }
  });
}
export { dl, editOc, ajustaTipo, openLanc };
