/** Infraestrutura compartilhada: navegacao. */
import { S } from "./estado.js";
import { render } from "./render.js";
import { $, toast, errMsg } from "./dom.js";
import { hoje } from "./datas.js";
import { openLanc } from "../features/ocorrencias/formulario.js";
import { openFunc } from "../features/funcionarios/formulario.js";
import { openKd } from "../features/panorama/detalhes.js";
import { store } from "./armazenamento.js";
import { openRegras } from "../features/configuracoes.js";
import { tabelaSalarial } from "../features/remuneracao.js";
function shift(n) {
  if (S.mode === "mes") {
    const d = new Date(S.y, S.m + n, 1);
    S.y = d.getFullYear();
    S.m = d.getMonth();
  } else S.y += n;
  render();
}
function setPriv(on) {
  document.documentElement.classList.toggle("privado", on);
  const b = $("#priv");
  b.setAttribute("aria-pressed", on);
  b.textContent = on ? "Nomes ocultos" : "Nomes visíveis";
  try {
    localStorage.setItem(`rh:${document.documentElement.dataset.usuario}:${'qp-priv'}`, on ? "1" : "0");
  } catch (e) {}
}
export function iniciarCoreNavegacao() {
  $("#prev").addEventListener("click", () => shift(-1));
  $("#next").addEventListener("click", () => shift(1));
  $("#go-today").addEventListener("click", () => {
    S.y = hoje.getFullYear();
    S.m = hoje.getMonth();
    render();
  });
  $("#mode-mes").addEventListener("click", () => {
    S.mode = "mes";
    render();
  });
  $("#mode-ano").addEventListener("click", () => {
    S.mode = "ano";
    render();
  });
  document.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => {
    S.tab = b.dataset.tab;
    try {
      localStorage.setItem(`rh:${document.documentElement.dataset.usuario}:${'qp-tab'}`, S.tab);
    } catch (e) {}
    render();
  }));
  $("#new-lanc").addEventListener("click", () => openLanc(null, S.tab === "func" && S.sel ? {
    func: S.sel
  } : {}));
  $("#new-func").addEventListener("click", () => openFunc());
  {
    let on = true;
    try {
      on = localStorage.getItem(`rh:${document.documentElement.dataset.usuario}:${'qp-priv'}`) !== "0";
    } catch (e) {}
    setPriv(on);
  }
  $("#priv").addEventListener("click", () => setPriv(!document.documentElement.classList.contains("privado")));
  document.addEventListener("click", async e => {
    const kp = e.target.closest("[data-kpi]");
    if (kp && !e.target.closest("dialog")) return openKd(kp.dataset.kpi);
    const t = e.target.closest("[data-f],[data-ficha],[data-sel],[data-oc-open],[data-edit-func],[data-new-for],[data-act],[data-ben],[data-grupo],#rm-ex");
    if (t && t.dataset.ficha && t.closest("#dlg-kpi")) $("#dlg-kpi").close();
    if (!t) return;
    if (t.id === "rm-ex") {
      if (!t.classList.contains("armed")) {
        t.classList.add("armed");
        t.textContent = "Confirmar: remover todos os exemplos";
        return;
      }
      t.disabled = true;
      try {
        for (const o of S.ocs.filter(o => o.exemplo)) await store.del("ocorrencias", o.id);
        for (const f of S.func.filter(f => f.exemplo)) await store.del("funcionarios", f.id);
        toast("Exemplos removidos");
      } catch (x) {
        toast(errMsg(x));
        t.disabled = false;
      }
      return;
    }
    if (t.dataset.f) return t.dataset.oc ? openLanc(t.dataset.oc) : openLanc(null, {
      func: t.dataset.f,
      inicio: t.dataset.d,
      fim: t.dataset.d
    });
    if (t.dataset.ficha) {
      S.sel = t.dataset.ficha;
      S.tab = "func";
      try {
        localStorage.setItem(`rh:${document.documentElement.dataset.usuario}:${'qp-tab'}`, "func");
      } catch (e) {}
      render();
      window.scrollTo({
        top: 0
      });
      return;
    }
    if (t.dataset.sel) {
      S.sel = t.dataset.sel;
      render();
      return;
    }
    if (t.dataset.grupo) {
      S.fGrupo = t.dataset.grupo;
      S.fSetor = "";
      S.sel = null;
      S.tab = "func";
      try {
        localStorage.setItem(`rh:${document.documentElement.dataset.usuario}:${'qp-tab'}`, "func");
      } catch (e) {}
      render();
      window.scrollTo({
        top: 0
      });
      return;
    }
    if (t.dataset.ocOpen) return openLanc(t.dataset.ocOpen);
    if (t.dataset.editFunc) return openFunc(t.dataset.editFunc);
    if (t.dataset.newFor) return openLanc(null, {
      func: t.dataset.newFor
    });
    if (t.dataset.act === "new-func") return openFunc();
    if (t.dataset.act === "regras") return openRegras();
    if (t.dataset.act === "tabela-sal") {
      $("#tabsal-body").innerHTML = tabelaSalarial();
      $("#tabsal-body [data-close]").addEventListener("click", () => $("#dlg-tabsal").close());
      $("#dlg-tabsal").showModal();
      return;
    }
    if (t.dataset.act === "todos-contratos") {
      S.verTodosContratos = !S.verTodosContratos;
      render();
      return;
    }
    if (t.dataset.ben) {
      const id = t.dataset.ben;
      S.benAbertos.has(id) ? S.benAbertos.delete(id) : S.benAbertos.add(id);
      render();
      return;
    }
  });
  document.addEventListener("keydown", e => {
    const kp = e.target.closest && e.target.closest("[data-kpi]");
    if (kp && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openKd(kp.dataset.kpi);
    }
  });
  document.addEventListener("input", e => {
    if (e.target.id === "rem-busca") {
      S.remBusca = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const el = $("#rem-busca");
      el.focus();
      el.setSelectionRange(pos, pos);
      return;
    }
    if (e.target.id === "busca-func") {
      S.fBusca = e.target.value;
      S._focusBusca = true;
      render();
    }
    if (e.target.id === "flt-busca") {
      S.fBuscaL = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const el = $("#flt-busca");
      el.focus();
      el.setSelectionRange(pos, pos);
    }
  });
  document.addEventListener("change", e => {
    if (e.target.id === "flt-tipo") {
      S.fTipo = e.target.value;
      render();
    }
    if (e.target.id === "flt-func") {
      S.fFunc = e.target.value;
      render();
    }
    if (e.target.id === "flt-per") {
      S.fPeriodo = e.target.checked;
      render();
    }
    if (e.target.id === "rem-grupo") {
      S.remGrupo = e.target.value;
      render();
    }
    if (e.target.id === "rem-setor") {
      S.remSetor = e.target.value;
      render();
    }
    if (e.target.id === "f-grupo") {
      S.fGrupo = e.target.value;
      render();
    }
    if (e.target.id === "f-setorf") {
      S.fSetor = e.target.value;
      render();
    }
  });
}
export { shift, setPriv };
