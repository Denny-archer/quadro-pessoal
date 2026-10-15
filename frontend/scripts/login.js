import { destinoAposLogin } from "./core/sessao.js";
const motivos = {
  saiu: "Você saiu da sua conta.",
  expirada: "Sua sessão foi encerrada ou expirou. Entre novamente."
};
const motivo = motivos[new URLSearchParams(location.search).get("motivo")];
if (motivo) {
  document.getElementById("sessao-info").textContent = motivo;
  document.getElementById("sessao-info").hidden = false;
}
document.getElementById("f").addEventListener("submit", async e => {
  e.preventDefault();
  const b = document.getElementById("b"),
    err = document.getElementById("err");
  b.disabled = true;
  err.textContent = "";
  try {
    const r = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "quadro-pessoal"
      },
      body: JSON.stringify({
        email: document.getElementById("email").value,
        senha: document.getElementById("senha").value
      })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || "Não foi possível entrar.");
    const volta = new URLSearchParams(location.search).get("volta");
    location.replace(destinoAposLogin(volta, location.origin));
  } catch (x) {
    err.textContent = x.message;
    b.disabled = false;
  }
});
