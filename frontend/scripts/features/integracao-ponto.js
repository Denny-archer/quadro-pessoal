import { req } from "../shared/http.js";

/** Administração de chaves; a estrutura do diálogo está no index.html. */
export function iniciarIntegracaoPonto(usuario) {
  if (usuario.papel !== "admin") return;
  const dialogo = document.getElementById("dlg-chaves");
  const saida = dialogo.querySelector("#ch-out");
  let geracao = 0;
  let bloqueado = false;
  const autorizado = () => !bloqueado && document.documentElement.dataset.papel === "admin";

  async function carregar() {
    const token = ++geracao;
    const lista = await req("GET", "/api/integracao/chaves");
    if (token !== geracao || !autorizado()) return;
    const corpo = dialogo.querySelector("tbody");
    corpo.replaceChildren();
    for (const chave of lista) {
      const linha = document.getElementById("integracao-chave-modelo").content.firstElementChild.cloneNode(true);
      const celulas = linha.querySelectorAll("td");
      [chave.nome, `${chave.prefixo}…`, new Date(chave.criado_em).toLocaleDateString("pt-BR"),
        chave.ultimo_uso ? new Date(chave.ultimo_uso).toLocaleString("pt-BR") : "nunca",
        chave.ativo ? "ativa" : "revogada"].forEach((valor, indice) => { celulas[indice].textContent = valor; });
      const revogar = linha.querySelector("button");
      revogar.hidden = !chave.ativo;
      revogar.dataset.revogar = chave.id;
      corpo.append(linha);
    }
    dialogo.querySelector('[data-chaves="vazio"]').hidden = !!lista.length;
  }

  async function abrir() {
    saida.replaceChildren();
    saida.classList.remove("text-normal");
    dialogo.querySelector("form").reset();
    try {
      await carregar();
      if (autorizado() && !dialogo.open) dialogo.showModal();
    } catch (erro) {
      saida.textContent = erro.mensagem || erro.message;
      if (autorizado() && !dialogo.open) dialogo.showModal();
    }
  }

  dialogo.querySelector("[data-close]").addEventListener("click", () => dialogo.close());
  dialogo.addEventListener("close", () => saida.replaceChildren());
  dialogo.addEventListener("click", async evento => {
    const botao = evento.target.closest("[data-revogar]");
    if (!botao || !autorizado()) return;
    if (!botao.classList.contains("armed")) {
      botao.classList.add("armed");
      botao.textContent = "Confirmar";
      return;
    }
    botao.disabled = true;
    try {
      await req("DELETE", `/api/integracao/chaves/${encodeURIComponent(botao.dataset.revogar)}`);
      await carregar();
    } catch (erro) {
      saida.textContent = erro.mensagem || erro.message;
    } finally {
      botao.disabled = false;
    }
  });
  dialogo.querySelector("form").addEventListener("submit", async evento => {
    evento.preventDefault();
    if (!autorizado()) return;
    const botao = evento.target.querySelector('[type="submit"]');
    botao.disabled = true;
    try {
      const resultado = await req("POST", "/api/integracao/chaves", { nome: dialogo.querySelector("#ch-nome").value.trim() });
      const token = geracao;
      await carregar();
      if (!autorizado() || token + 1 !== geracao || !dialogo.open) return;
      const mensagem = document.getElementById("integracao-chave-criada-modelo").content.cloneNode(true);
      mensagem.querySelector("code").textContent = resultado.chave;
      saida.classList.add("text-normal");
      saida.replaceChildren(mensagem);
      evento.target.reset();
    } catch (erro) {
      if (autorizado()) saida.textContent = erro.mensagem || erro.message;
    } finally {
      botao.disabled = false;
    }
  });
  const botao = document.getElementById("ponto-integracoes");
  botao.hidden = false;
  const referencia = document.getElementById("qp-senha");
  if (referencia) referencia.before(botao);
  botao.addEventListener("click", abrir);
  window.addEventListener("qp-limpar-dados", () => {
    bloqueado = true;
    geracao++;
    botao.hidden = true;
    dialogo.close();
    dialogo.querySelector("tbody")?.replaceChildren();
    saida.replaceChildren();
  });
}
