/** Coordenação entre abas. Não armazena credenciais no JavaScript ou localStorage. */
const EVENTO = "qp-evento-sessao";
const EVENTO_ATIVIDADE = "qp-atividade-sessao";
let encerrada = false;
let canal;
let iniciado = false;
let limpar = () => {};
export const sessaoEncerrada = () => encerrada;
export function encerrarTela(motivo = "expirada", avisar = false) {
  if (avisar) {
    try {
      canal?.postMessage({
        tipo: "logout"
      });
    } catch {}
    try {
      localStorage.setItem(EVENTO, JSON.stringify({
        instante: Date.now(),
        id: crypto.randomUUID()
      }));
    } catch {}
  }
  if (encerrada) return;
  encerrada = true;
  limpar();
  document.documentElement.classList.add("sessao-encerrada");
  document.body.inert = true;
  document.querySelectorAll('input[autocomplete="current-password"], input[autocomplete="new-password"]').forEach(c => c.value = "");
  document.body.appendChild(Object.assign(document.createElement("p"), {
    id: "sessao-aviso",
    className: "sessao-mensagem",
    textContent: "Sessão encerrada. Redirecionando para o login…"
  }));
  location.replace("/login?motivo=" + encodeURIComponent(motivo)+"&volta="+encodeURIComponent(location.pathname));
}
export function iniciarControleSessao({
  atividade,
  validar,
  inatividadeMinutos = 30,
  aoEncerrar = () => {}
}) {
  if (iniciado) return;
  iniciado = true;
  limpar = aoEncerrar;
  const limiteInativo = inatividadeMinutos * 60000;
  let ultimaAtividade = Date.now(),
    ultimaInteracaoLocal = Date.now(),
    ultimaTentativa = 0,
    pendente = false;
  const registrar = async () => {
    if (encerrada || pendente || document.hidden || Date.now() - ultimaTentativa < 60000) return;
    pendente = true;
    ultimaTentativa = Date.now();
    try {
      await atividade();
      try {
        canal?.postMessage({
          tipo: "atividade"
        });
      } catch {}
      try {
        localStorage.setItem(EVENTO_ATIVIDADE, String(Date.now()));
      } catch {}
    } catch {} finally {
      pendente = false;
    }
  };
  const interagiu = () => {
    ultimaAtividade = Date.now();
    ultimaInteracaoLocal = ultimaAtividade;
    registrar();
  };
  for (const evento of ["pointerdown", "keydown", "wheel", "touchstart"]) {
    document.addEventListener(evento, interagiu, {
      passive: true
    });
  }
  // Sem interação, não envia pulsos: o relógio do servidor continua correndo.
  setInterval(() => {
    if (Date.now() - ultimaInteracaoLocal < 60000) registrar();
  }, 15000);
  const conferir = async () => {
    if (!encerrada && !document.hidden) {
      try {
        await validar();
      } catch {
        // Sem rede, não conserva dados pessoais na tela após inatividade local.
        if (!encerrada && Date.now() - ultimaAtividade >= limiteInativo) encerrarTela("expirada");
      }
    }
  };
  document.addEventListener("visibilitychange", conferir);
  window.addEventListener("focus", conferir);
  window.addEventListener("pageshow", e => {
    if (e.persisted) location.reload();
  });
  window.addEventListener("pagehide", () => document.documentElement.classList.add("sessao-validando"));
  setInterval(conferir, 60000);
  setInterval(() => {
    if (Date.now() - ultimaAtividade >= limiteInativo) conferir();
  }, 15000);
  if (typeof BroadcastChannel !== "undefined") {
    try {
      canal = new BroadcastChannel("qp-sessao");
      canal.addEventListener("message", e => {
        if (e.data?.tipo === "logout") encerrarTela("saiu");
        if (e.data?.tipo === "atividade") ultimaAtividade = Date.now();
      });
    } catch {}
  }
  window.addEventListener("storage", e => {
    if (e.key === EVENTO && e.newValue) encerrarTela("saiu");
    if (e.key === EVENTO_ATIVIDADE && e.newValue) ultimaAtividade = Date.now();
  });
  registrar();
}

/** O retorno do login nunca pode navegar para outro site. */
export function destinoAposLogin(valor, origem) {
  try {
    if (!valor?.startsWith("/") || valor.startsWith("//") || valor.includes("\\")) return "/";
    const url = new URL(valor, origem);
    return url.origin === origem && ["/", "/index.html", "/importacao.html", "/demandas/", "/administracao"].includes(url.pathname) ? url.pathname + url.search + url.hash : "/";
  } catch {
    return "/";
  }
}
