import { S } from "../../core/estado.js";
import { render } from "../../core/render.js";
import { $, toast, errMsg } from "../../core/dom.js";
import { store } from "../../core/armazenamento.js";
import { openLanc } from "../ocorrencias/formulario.js";
import { controleFerias, periodoVigente } from "../ferias.js";
import { addDias, HOJE } from "../../core/datas.js";
import { baixarRelatorio, imprimirRelatorio } from "../folha.js";
import { excluirMudanca } from "../funcionarios/historico.js";
export function iniciarFolha() {
  S.folBusca = "";
  S.folAbertos = new Set();
  S.recAbertos = new Set();
  document.addEventListener("click", async e => {
    const t = e.target.closest("[data-fol],[data-frec],[data-new-ferias],[data-hist-del],[data-act]");
    if (!t) return;
    if (t.dataset.fol) {
      S.folAbertos.has(t.dataset.fol) ? S.folAbertos.delete(t.dataset.fol) : S.folAbertos.add(t.dataset.fol);
      render();
    } else if (t.dataset.frec) {
      S.recAbertos.has(t.dataset.frec) ? S.recAbertos.delete(t.dataset.frec) : S.recAbertos.add(t.dataset.frec);
      render();
    } else if (t.dataset.newFerias) {
      const [id, aquisitivo] = t.dataset.newFerias.split("|");
      const f = S.func.find(f => f.id === id);
      const c = controleFerias(f).find(c => c.pa.inicio === aquisitivo) || periodoVigente(controleFerias(f));
      const inicio = f.vinculo === "estagiario" ? HOJE : [HOJE, addDias(c.pa.fim, 1)].sort().pop();
      openLanc(null, {
        func: id,
        tipo: "ferias",
        aquisitivo,
        inicio,
        fim: addDias(inicio, Math.min(14, c.aProgramar) - 1)
      });
    } else if (t.dataset.histDel) {
      if (document.documentElement.dataset.alterarRh !== "true") return;
      if (!t.classList.contains("armed")) {
        t.classList.add("armed");
        t.textContent = "Confirmar exclusão";
        return;
      }
      const [id, evento] = t.dataset.histDel.split("|");
      const f = S.func.find(f => f.id === id);
      if (!f) return toast("Funcionário não encontrado.");
      const {
        id: _,
        ...doc
      } = excluirMudanca(f, evento);
      t.disabled = true;
      try {
        await store.set("funcionarios", id, doc);
        toast("Mudança removida e remuneração recalculada");
      } catch (erro) {
        toast(errMsg(erro));
        t.disabled = false;
      }
    } else if (t.dataset.act === "rel-xlsx") {
      t.disabled = true;
      try {
        await baixarRelatorio();
      } finally {
        t.disabled = false;
      }
    } else if (t.dataset.act === "rel-print") {
      imprimirRelatorio();
    }
  });
  document.addEventListener("input", e => {
    if (e.target.id !== "fol-busca") return;
    S.folBusca = e.target.value;
    const posicao = e.target.selectionStart;
    render();
    const busca = $("#fol-busca");
    busca.focus();
    busca.setSelectionRange(posicao, posicao);
  });
}
