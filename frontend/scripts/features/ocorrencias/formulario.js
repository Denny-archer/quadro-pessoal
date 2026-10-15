import { $, errMsg, esc, toast } from "../../core/dom.js";
import { TIPOS } from "../../core/constantes.js";
import { S } from "../../core/estado.js";
import { ABONO_REF, saldoAbono } from "../abonos.js";
import { byName, noQuadro, overlap } from "../../core/colecoes.js";
import { DAY, HOJE, addDias, fmt, parse } from "../../core/datas.js";
import { store } from "../../core/armazenamento.js";
import { controleFerias, periodoVigente, reciboFerias, tabelaRecibo, validaFerias } from "../ferias.js";
import { openFunc } from "../funcionarios/formulario.js";
let dl;
let editOc = null;
function iniciarFeaturesOcorrenciasFormulario() {
  ["#l-inicio", "#l-fim", "#l-abpec", "#l-aq"].forEach(id => $(id).addEventListener("input", calcLanc));
  $("#l-aq").addEventListener("change", calcLanc);
  $("#l-func").addEventListener("change", () => {
    preencheAq("");
    if ($("#l-tipo").value === "abono") preencheRef();
    calcLanc();
  });
  dl = $("#dlg-lanc");
  $("#l-tipo").innerHTML = Object.entries(TIPOS).map(([k, t]) => `<option value="${k}">${t.nome}</option>`).join("");
  $("#l-tipo").addEventListener("change", ajustaTipo);
  $("#l-parcial").addEventListener("change", ajustaTipo);
  $("#l-inicio").addEventListener("change", () => {
    if ($("#l-fim").value < $("#l-inicio").value) $("#l-fim").value = $("#l-inicio").value;
    calcLanc();
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
    if (t === "viagem" && (Number($("#l-diarias").value) < 0 || Number($("#l-vdiaria").value) < 0)) return err.textContent = "Diárias e valor da diária não podem ser negativos.";
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
      diarias: t === "viagem" && $("#l-diarias").value !== "" ? Number($("#l-diarias").value) : null,
      valorDiaria: t === "viagem" ? Number($("#l-vdiaria").value) || 0 : 0,
      criadoEm: editOc?.criadoEm || new Date().toISOString(),
      atualizadoEm: new Date().toISOString()
    };
    if (editOc?.exemplo) data.exemplo = true;
    if (t === "abono") {
      const ref = $("#l-ref").value,
        f = S.func.find(x => x.id === data.func);
      if (ref) {
        const sd = saldoAbono(f, ref),
          meus = editOc && editOc.referenciaAbono === ref ? overlap(editOc, parse(editOc.inicio), parse(editOc.fim || editOc.inicio)) : 0;
        const disp = (sd ? sd.restantes : (ABONO_REF.find(r => r[0] === ref) || [0, 0, 0])[2]) + meus,
          usa = Math.round((parse(fim) - parse(ini)) / DAY) + 1;
        if (usa > disp) return err.textContent = `Saldo insuficiente: restam ${disp} dia(s) em "${ABONO_REF.find(r => r[0] === ref)[1]}" e este lançamento usa ${usa}.`;
      }
      data.referenciaAbono = ref;
      data.statusAbono = ini > HOJE ? "agendado" : "gozado";
    }
    let gravarPa = null;
    if (t === "ferias") {
      const k = calcLanc();
      if (k && k.v.E.length) return err.textContent = "Corrija antes de salvar: " + k.v.E[0];
      if (k && k.c) {
        Object.assign(data, {
          aquisitivo: k.c.pa.inicio,
          aquisitivoFim: k.c.pa.fim,
          limite: k.c.pa.limite || ""
        });
        if (!data.parcela) {
          const ord = [...k.c.parcelas.filter(o => o.id !== editOc?.id).map(o => o.inicio), ini].sort().indexOf(ini) + 1;
          data.parcela = `${ord}º`;
        }
        if (k.c.pa.gerado) gravarPa = k;
      } else if (!$("#l-aq").value) {
        delete data.aquisitivo;
        delete data.aquisitivoFim;
        delete data.limite;
      }
    }
    const btn = $("#l-save");
    btn.disabled = true;
    try {
      if (gravarPa) {
        // período calculado pela admissão passa a ficar gravado no cadastro
        const {
          id,
          ...doc
        } = gravarPa.f;
        const {
          gerado,
          ...pa
        } = gravarPa.c.pa;
        await store.set("funcionarios", id, {
          ...doc,
          periodosAquisitivos: [...(doc.periodosAquisitivos || []), pa].sort((a, b) => a.inicio.localeCompare(b.inicio))
        });
      }
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
function ajustaTipo() {
  const t = $("#l-tipo").value;
  const showFim = t !== "banco",
    showH = ["banco", "abono", "capacitacao"].includes(t),
    showD = ["viagem", "capacitacao"].includes(t);
  $("#lbl-fim").hidden = !showFim;
  $("#lbl-horas").hidden = !showH;
  $("#lbl-destino").hidden = !showD;
  $("#lbl-diarias").hidden = $("#lbl-vdiaria").hidden = t !== "viagem";
  $("#lbl-inicio").firstChild.textContent = t === "banco" ? "Data" : "Início";
  $("#lbl-horas").firstChild.textContent = t === "banco" ? "Horas (+ crédito, − débito)" : t === "abono" ? "Horas abonadas (se parcial)" : "Carga horária do curso (h)";
  $("#lbl-destino").firstChild.textContent = t === "viagem" ? "Destino / motivo da viagem" : "Curso ou evento";
  const notes = {
    atestado: "Registre apenas o período de afastamento. Não anote CID nem diagnóstico — dado de saúde é sensível (LGPD).",
    ferias: "Férias em dias corridos. Se forem fracionadas, lance cada período separadamente.",
    abono: "Para abono de um dia inteiro, use a mesma data em início e término.",
    banco: "Use valores positivos para horas extras/crédito e negativos para compensação/débito.",
    viagem: "Viagens a serviço aparecem na escala como fora do posto.",
    capacitacao: "Informe a carga horária para acumular as horas de capacitação do ano."
  };
  $("#lbl-abpec").hidden = $("#lbl-aviso").hidden = t !== "ferias";
  $("#lbl-aq").hidden = true;
  $("#lbl-parcial").hidden = t !== "atestado";
  $("#lbl-ref").hidden = t !== "abono";
  if (t === "abono") preencheRef();
  if (t === "atestado" && $("#l-parcial").checked) $("#lbl-fim").hidden = true;
  let nota = notes[t] || "";
  $("#l-note").textContent = nota;
  $("#l-note").hidden = !nota;
}
function preencheRef() {
  const f = S.func.find(x => x.id === $("#l-func").value),
    sel = $("#l-ref");
  const atual = editOc && editOc.tipo === "abono" ? editOc.referenciaAbono || "" : sel.value;
  const ops = ABONO_REF.filter(([k]) => f && saldoAbono(f, k) && (k !== "ref2024" || atual === "ref2024")).map(([k, rot]) => {
    const sd = f ? saldoAbono(f, k) : null,
      extra = editOc && editOc.referenciaAbono === k ? overlap(editOc, parse(editOc.inicio), parse(editOc.fim || editOc.inicio)) : 0;
    return `<option value="${k}">${esc(rot)} · saldo ${(sd ? sd.restantes : (ABONO_REF.find(r => r[0] === k) || [0, 0, 0])[2]) + extra} dia(s)</option>`;
  });
  sel.innerHTML = ops.join("") + `<option value="">Outro abono (não desconta de saldo)</option>`;
  sel.value = [...sel.options].some(o => o.value === atual) && (atual || editOc) ? atual : ABONO_REF.find(([k]) => k !== "ref2024" && f && (saldoAbono(f, k)?.restantes ?? 1) > 0)?.[0] || "";
}
function preencheAq(pref) {
  const f = S.func.find(x => x.id === $("#l-func").value),
    sel = $("#l-aq");
  const cf = f ? controleFerias(f) : [];
  const atual = pref ?? sel.value;
  const semVinculo = editOc && editOc.tipo === "ferias" && !editOc.aquisitivo;
  sel.innerHTML = (semVinculo || !cf.length ? `<option value="">${cf.length ? "Sem vínculo (lançamento antigo)" : "Nenhum período aquisitivo: informe a admissão"}</option>` : "") + cf.map(c => `<option value="${c.pa.inicio}">${fmt(c.pa.inicio)} a ${fmt(c.pa.fim)} · saldo ${c.aProgramar} dia(s)</option>`).join("");
  sel.value = cf.some(c => c.pa.inicio === atual) ? atual : semVinculo ? "" : periodoVigente(cf)?.pa.inicio || "";
}
const limite = (el, prop, v) => {
  if (el[prop] !== v) el[prop] = v;
};
function calcLanc() {
  const box = $("#l-calc");
  if ($("#l-tipo").value !== "ferias") {
    box.hidden = true;
    limite($("#l-inicio"), "min", "");
    limite($("#l-fim"), "max", "");
    return null;
  }
  const f = S.func.find(x => x.id === $("#l-func").value),
    ini = $("#l-inicio").value,
    fim = $("#l-fim").value || ini;
  if (!f || !ini || fim < ini) {
    box.hidden = true;
    return null;
  }
  const c = controleFerias(f).find(x => x.pa.inicio === $("#l-aq").value) || null;
  const abono = Number($("#l-abpec").value) || 0;
  // datas permitidas no calendário: depois do aquisitivo e até o fim do concessivo
  limite($("#l-inicio"), "min", c && f.vinculo !== "estagiario" ? addDias(c.pa.fim, 1) : "");
  limite($("#l-fim"), "max", c && f.vinculo !== "estagiario" && c.pa.limite >= HOJE ? c.pa.limite : "");
  const v = validaFerias(f, c, ini, fim, abono, editOc?.id);
  if (!c && !(editOc && editOc.tipo === "ferias" && !editOc.aquisitivo)) v.E.unshift("Escolha o período aquisitivo a que estas férias pertencem.");
  const rc = reciboFerias(f, v.dias - v.diasDobro, abono, v.diasDobro, ini);
  box.innerHTML = (c ? `<div>Período aquisitivo <strong>${fmt(c.pa.inicio)} a ${fmt(c.pa.fim)}</strong> · ${f.vinculo === "estagiario" ? `recesso até ${fmt(c.pa.limite)}` : `gozar de ${fmt(addDias(c.pa.fim, 1))} a ${fmt(c.pa.limite)}`}</div>` : "") + `<div><strong>${v.dias} dia(s) de gozo${abono ? ` + ${abono} vendidos` : ""}</strong>${v.saldo != null ? ` · saldo do período: ${v.saldo} dia(s)` : ""}</div>` + v.E.map(t => `<div class="e">✕ ${esc(t)}</div>`).join("") + v.A.map(t => `<div class="a">! ${esc(t)}</div>`).join("") + (v.E.length ? "" : tabelaRecibo(rc, v.dias - v.diasDobro, abono, v.diasDobro, ini));
  box.hidden = false;
  return {
    f,
    c,
    v
  };
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
  $("#l-diarias").value = o.diarias ?? "";
  $("#l-vdiaria").value = o.valorDiaria || "";
  $("#l-abpec").value = o.abonoPecuniario || "";
  $("#l-aviso").value = o.avisoFerias || "";
  $("#l-parcial").checked = !!o.parcial;
  $("#l-err").textContent = "";
  const del = $("#l-del");
  del.hidden = !editOc;
  del.classList.remove("armed");
  del.textContent = "Excluir";
  preencheAq(o.aquisitivo || "");
  ajustaTipo();
  calcLanc();
  dl.showModal();
}
export { iniciarFeaturesOcorrenciasFormulario, dl, editOc, ajustaTipo, openLanc, preencheRef, preencheAq, limite, calcLanc };
