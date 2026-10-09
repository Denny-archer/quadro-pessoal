import { abrirImportacao } from "./importacao.js";
import { esc } from "../core/dom.js";
import { abrirUsuarios } from "./usuarios.js";
/** Funcionalidade: conta. */
import { dialogo, $, toast } from "../core/dom.js";
import { req as api } from "../core/api.js";
function abrirSenha() {
  const d = dialogo("dlg-senha", `
      <form class="kd u-width-min-440px-100" id="senha-form" novalidate >
        <div class="kd-head"><h2>Trocar senha</h2><button class="icon-btn" type="button" data-close aria-label="Fechar">×</button></div>
        <label class="hint">Senha atual<input id="s-atual" type="password" autocomplete="current-password"></label>
        <label class="hint">Nova senha (mín. 10 caracteres)<input id="s-nova" type="password" autocomplete="new-password"></label>
        <div class="err" id="s-err" role="alert"></div>
        <div class="dlg-foot"><div class="r"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></div>
      </form>`);
  d.classList.remove("dlg-wide");
  $("#senha-form").addEventListener("submit", async e => {
    e.preventDefault();
    try {
      await api("POST", "/api/auth/senha", {
        atual: $("#s-atual").value,
        nova: $("#s-nova").value
      });
      d.close();
      toast("Senha alterada");
    } catch (x) {
      $("#s-err").textContent = x.mensagem || x.message;
    }
  });
  d.showModal();
}
export { abrirSenha };
export function iniciarConta(u) {
  const acoes = $(".actions");
  const imp = Object.assign(document.createElement("button"), {
    className: "btn",
    id: "qp-imp",
    type: "button",
    textContent: "Importar planilha"
  });
  imp.addEventListener("click", abrirImportacao);
  acoes.insertBefore(imp, $("#new-func"));
  const top = $(".period");
  const box = document.createElement("div");
  box.className = "qp-user";
  box.innerHTML = `<span>Olá, <strong>${esc(u.nome.split(" ")[0])}</strong></span>
      ${u.papel === "admin" ? `<button class="btn small" type="button" id="qp-usr">Usuários</button>` : ""}
      <button class="btn small" type="button" id="qp-senha">Senha</button>
      <button class="btn small" type="button" id="qp-sair">Sair</button>`;
  top.appendChild(box);
  $("#qp-sair").addEventListener("click", async () => {
    await api("POST", "/api/auth/logout");
    location.href = "/login";
  });
  $("#qp-senha").addEventListener("click", abrirSenha);
  if (u.papel === "admin") $("#qp-usr").addEventListener("click", abrirUsuarios);
}
