/** Funcionalidade: usuarios. */
import { req as api } from "../core/api.js";
import { dialogo, esc, toast, $ } from "../core/dom.js";
async function abrirUsuarios() {
  const lista = await api("GET", "/api/usuarios");
  const PAP = {
    admin: "Administrador",
    gestor: "Gestor",
    colaborador: "Colaborador"
  };
  const d = dialogo("dlg-usr", `
      <div class="kd">
        <div class="kd-head"><div><div class="eyebrow">Acesso</div><h2>Usuários do sistema</h2></div><button class="icon-btn" type="button" data-close aria-label="Fechar">×</button></div>
        <div class="note">Administrador: administra o RH e demandas. Gestor: consulta sua equipe e gerencia demandas dos setores atribuídos. Colaborador: consulta os próprios dados e demandas. Configure os vínculos na Administração.</div>
        <div class="scroll"><table class="data"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Ativo</th><th>Último acesso</th></tr></thead><tbody>
          ${lista.map(u => `<tr><td>${esc(u.nome)}</td><td>${esc(u.email)}</td>
            <td><select data-u="${u.id}" data-k="papel">${Object.entries(PAP).map(([k, v]) => `<option value="${k}" ${u.papel === k ? "selected" : ""}>${v}</option>`).join("")}</select></td>
            <td><input type="checkbox" data-u="${u.id}" data-k="ativo" ${u.ativo ? "checked" : ""}></td>
            <td>${u.ultimo_acesso ? new Date(u.ultimo_acesso).toLocaleString("pt-BR") : "—"}</td></tr>`).join("")}
        </tbody></table></div>
        <form id="usr-novo" class="fields" novalidate>
          <label>Nome<input id="u-nome" type="text" maxlength="120" required></label>
          <label>E-mail<input id="u-email" type="text" maxlength="200" required></label>
          <label>Perfil<select id="u-papel"><option value="colaborador">Colaborador</option><option value="gestor">Gestor</option><option value="admin">Administrador</option></select></label>
          <label class="u-align-self-end"><button class="btn primary" type="submit">Criar usuário</button></label>
        </form>
        <div class="err" id="usr-err" role="alert"></div>
      </div>`);
  d.querySelectorAll("[data-u]").forEach(el => el.addEventListener("change", async () => {
    try {
      await api("PATCH", `/api/usuarios/${el.dataset.u}`, {
        [el.dataset.k]: el.type === "checkbox" ? el.checked : el.value
      });
      toast("Usuário atualizado");
    } catch (x) {
      $("#usr-err").textContent = x.mensagem || x.message;
    }
  }));
  $("#usr-novo").addEventListener("submit", async e => {
    e.preventDefault();
    try {
      const r = await api("POST", "/api/usuarios", {
        nome: $("#u-nome").value.trim(),
        email: $("#u-email").value.trim(),
        papel: $("#u-papel").value
      });
      await abrirUsuarios();
      $("#usr-err").classList.add("text-normal");
      $("#usr-err").textContent = `Usuário criado. Senha provisória (mostrada só agora, envie por canal seguro): ${r.senha_provisoria}`;
    } catch (x) {
      $("#usr-err").textContent = x.mensagem || x.message;
    }
  });
  if (!d.open) d.showModal();
}
export { abrirUsuarios };
