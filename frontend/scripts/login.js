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
    location.href = volta && volta.startsWith("/") && !volta.startsWith("//") ? volta : "/";
  } catch (x) {
    err.textContent = x.message;
    b.disabled = false;
  }
});
