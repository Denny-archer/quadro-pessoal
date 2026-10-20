import { $, toast, errMsg } from "../core/dom.js";
import { S, CFG_PADRAO } from "../core/estado.js";
import { fmt, iso } from "../core/datas.js";
import { render } from "../core/render.js";
/** Funcionalidade: configuracoes. */

let dr;
function openRegras() {
  const c = S.cfg;
  $("#r-aa").value = c.aa;
  $("#r-pct").value = c.pctTemp;
  $("#r-lim").value = c.limite;
  $("#r-modo").value = c.modo;
  $("#r-atmodo").value = c.atModo;
  $("#r-atferias").checked = !!c.atFerias;
  $("#r-vt").value = c.vtPct;
  $("#r-sind").value = c.sindical;
  $("#r-diaria").value = c.diaria;
  $("#r-fer").value = (c.feriados || []).slice().sort().map(fmt).join("\n");
  $("#r-err").textContent = "";
  dr.showModal();
}
export function iniciarFeaturesConfiguracoes() {
  dr = $("#dlg-regras");
  $("#form-regras").addEventListener("submit", async e => {
    e.preventDefault();
    const err = $("#r-err"),
      fer = [],
      ruins = [];
    for (const l of $("#r-fer").value.split(/[\n,;]+/).map(x => x.trim()).filter(Boolean)) {
      const m = l.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      const d = m && new Date(+m[3], +m[2] - 1, +m[1]);
      if (!d || d.getDate() !== +m[1] || d.getMonth() !== +m[2] - 1) ruins.push(l);else fer.push(iso(d));
    }
    if (ruins.length) return err.textContent = `Data inválida nos feriados: ${ruins.slice(0, 3).join(", ")}. Use dd/mm/aaaa.`;
    const aa = Number($("#r-aa").value),
      pct = Number($("#r-pct").value),
      lim = Number($("#r-lim").value);
    if (!(aa >= 0) || $("#r-aa").value === "") return err.textContent = "Informe o valor do auxílio-alimentação.";
    if (!(pct >= 0 && pct <= 100)) return err.textContent = "O percentual precisa estar entre 0 e 100.";
    if (!(lim >= 0)) return err.textContent = "Informe o limite de dias.";
    const vtPct = Number($("#r-vt").value),
      sindical = Number($("#r-sind").value),
      diaria = Number($("#r-diaria").value);
    if (![vtPct, sindical, diaria].every(Number.isFinite) || vtPct < 0 || vtPct > 100 || sindical < 0 || diaria < 0) return err.textContent = "Confira o desconto de transporte, a mensalidade sindical e o valor da diária.";
    const cfg = {
      ...S.cfg,
      vtPct,
      sindical,
      diaria,
      aa,
      pctTemp: pct,
      limite: lim,
      modo: $("#r-modo").value,
      atModo: $("#r-atmodo").value,
      atFerias: $("#r-atferias").checked,
      feriados: [...new Set(fer)].sort()
    };
    const btn = $("#r-save");
    btn.disabled = true;
    try {
      if (S.db) await S.db.doc("config/beneficios").set(cfg);else {
        S.cfg = {
          ...CFG_PADRAO,
          ...cfg
        };
        render();
      }
      dr.close();
      toast("Regras atualizadas");
    } catch (x) {
      err.textContent = errMsg(x);
    } finally {
      btn.disabled = false;
    }
  });
}
export { dr, openRegras };
