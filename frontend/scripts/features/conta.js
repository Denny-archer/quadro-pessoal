import { abrirImportacao } from "./importacao.js";
import { abrirUsuarios } from "./usuarios.js";
import { dialogo, $, esc, toast } from "../core/dom.js";
import { req as api } from "../core/api.js";
import { encerrarTela } from "../core/sessao.js";
import { problemaSenha } from "./conta/validacao.js";
function campoSenha(id, titulo, autocomplete, ajuda = "") {
  return `<div class="senha-campo">
    <label for="${id}">${titulo}</label>
    <div class="senha-input"><input id="${id}" name="${id}" type="password" autocomplete="${autocomplete}" required aria-describedby="${id}-erro${ajuda ? " " + id + "-ajuda" : ""}">
      <button class="senha-mostrar" type="button" data-mostrar="${id}" aria-controls="${id}" aria-pressed="false" aria-label="Mostrar ${titulo.toLowerCase()}">Mostrar</button></div>
    ${ajuda ? `<p class="senha-ajuda" id="${id}-ajuda">${ajuda}</p>` : ""}
    <p class="senha-erro" id="${id}-erro" role="alert"></p>
  </div>`;
}
function abrirSenha() {
  const d = dialogo("dlg-senha", `<form class="conta-senha" id="senha-form" novalidate>
    <div class="dlg-head"><div><span class="eyebrow">Segurança da conta</span><h2>Trocar senha</h2></div>
      <button class="icon-btn" type="button" data-close aria-label="Fechar troca de senha">×</button></div>
    <p class="conta-intro">Use uma senha exclusiva para sua conta. Após a alteração, os outros acessos serão encerrados.</p>
    ${campoSenha("s-atual", "Senha atual", "current-password")}
    ${campoSenha("s-nova", "Nova senha", "new-password", "Use pelo menos 10 caracteres. Prefira uma frase longa e fácil de lembrar.")}
    ${campoSenha("s-confirma", "Confirmar nova senha", "new-password")}
    <p class="senha-feedback" id="s-feedback" aria-live="polite"></p>
    <p class="senha-caps" id="s-caps" hidden>Caps Lock está ativado.</p>
    <div class="err" id="s-err" role="alert"></div>
    <div class="senha-acoes"><button class="btn" type="button" data-close>Cancelar</button>
      <button class="btn primary" id="s-salvar" type="submit">Salvar nova senha</button></div>
  </form>`);
  d.classList.remove("dlg-wide");
  const form = $("#senha-form");
  const salvar = $("#s-salvar");
  const inputs = [$("#s-atual"), $("#s-nova"), $("#s-confirma")];
  let salvando = false;
  for (const b of form.querySelectorAll("[data-mostrar]")) b.addEventListener("click", () => {
    const campo = document.getElementById(b.dataset.mostrar);
    const mostrar = campo.type === "password";
    campo.type = mostrar ? "text" : "password";
    b.textContent = mostrar ? "Ocultar" : "Mostrar";
    b.setAttribute("aria-pressed", String(mostrar));
    b.setAttribute("aria-label", `${mostrar ? "Ocultar" : "Mostrar"} ${form.querySelector(`label[for="${campo.id}"]`).textContent.toLowerCase()}`);
  });
  for (const campo of inputs) {
    campo.addEventListener("input", () => {
      campo.removeAttribute("aria-invalid");
      document.getElementById(campo.id + "-erro").textContent = "";
      $("#s-err").textContent = "";
      const nova = $("#s-nova").value,
        confirma = $("#s-confirma").value;
      $("#s-feedback").textContent = confirma ? nova === confirma ? "As novas senhas conferem." : "A confirmação ainda está diferente da nova senha." : "";
      $("#s-feedback").classList.toggle("conferem", !!confirma && nova === confirma);
    });
    campo.addEventListener("keyup", e => {
      $("#s-caps").hidden = !e.getModifierState?.("CapsLock");
    });
    campo.addEventListener("blur", () => {
      $("#s-caps").hidden = true;
    });
  }
  const erroCampo = (id, mensagem) => {
    const campo = document.getElementById(id);
    campo.setAttribute("aria-invalid", "true");
    document.getElementById(id + "-erro").textContent = mensagem;
    campo.focus();
  };
  d.addEventListener("close", () => form.reset(), {
    once: true
  });
  d.addEventListener("cancel", e => {
    if (salvando) e.preventDefault();
  });
  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (salvando) return;
    inputs.forEach(c => {
      c.removeAttribute("aria-invalid");
      document.getElementById(c.id + "-erro").textContent = "";
    });
    const atual = $("#s-atual").value,
      nova = $("#s-nova").value;
    const problema = problemaSenha(atual, nova, $("#s-confirma").value);
    if (problema) return erroCampo(problema.campo, problema.mensagem);
    salvando = true;
    const controles = [...form.querySelectorAll("button")];
    controles.forEach(b => b.disabled = true);
    salvar.textContent = "Salvando…";
    form.setAttribute("aria-busy", "true");
    $("#s-err").textContent = "";
    try {
      await api("POST", "/api/auth/senha", {
        atual,
        nova
      });
      form.reset();
      d.close();
      toast("Senha alterada. Outros acessos foram encerrados.");
    } catch (x) {
      if (x.code === "revoked") return;
      const mensagem = x.mensagem || "Não foi possível alterar a senha. Verifique a conexão e tente novamente.";
      if (mensagem === "Senha atual incorreta.") erroCampo("s-atual", mensagem);else $("#s-err").textContent = mensagem;
    } finally {
      salvando = false;
      controles.forEach(b => b.disabled = false);
      salvar.textContent = "Salvar nova senha";
      form.removeAttribute("aria-busy");
    }
  });
  d.showModal();
  $("#s-atual").focus();
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
  const box = document.createElement("div");
  box.className = "qp-user";
  box.innerHTML = `<span>Olá, <strong>${esc(u.nome.split(" ")[0])}</strong></span>
    <a class="btn small" href="/demandas/">Demandas</a>
    ${u.papel === "admin" ? `<a class="btn small" href="/administracao">Administração</a><button class="btn small" type="button" id="qp-usr">Usuários</button>` : ""}
    <button class="btn small" type="button" id="qp-senha">Senha</button>
    <button class="btn small" type="button" id="qp-sair">Sair</button>`;
  $(".period").appendChild(box);
  $("#qp-sair").addEventListener("click", async e => {
    const botao = e.currentTarget;
    botao.disabled = true;
    botao.textContent = "Saindo…";
    try {
      await api("POST", "/api/auth/logout");
      encerrarTela("saiu", true);
    } catch (erro) {
      if (erro.code === "revoked") return encerrarTela("saiu", true);
      if (erro.code !== "revoked") toast("Não foi possível sair. Verifique a conexão e tente novamente.");
      botao.disabled = false;
      botao.textContent = "Sair";
    }
  });
  $("#qp-senha").addEventListener("click", abrirSenha);
  if (u.papel === "admin") $("#qp-usr").addEventListener("click", abrirUsuarios);
}
