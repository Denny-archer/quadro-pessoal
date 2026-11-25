import { req } from "../../shared/http.js";
import { sessaoEncerrada } from "../../shared/sessao.js";
import { criarTelaPonto, GRUPOS_PONTO } from "./tela.js";

/** Coordena consultas sem depender do DOM; relógio e transporte são substituíveis nos testes. */
export function criarControladorPonto({ consultar, apresentar, visivel = () => true,
  agendar = setInterval, cancelar = clearInterval }) {
  let ativo = false;
  let timer = null;
  let geracao = 0;
  let pendente = false;
  let estado = { status: "carregando", dados: null, filtro: null, erro: "" };

  async function carregar() {
    if (!ativo || !visivel() || pendente) return;
    const token = ++geracao;
    pendente = true;
    if (!estado.dados) apresentar({ ...estado, status: "carregando" });
    try {
      const dados = await consultar();
      if (!ativo || token !== geracao) return;
      const filtro = estado.filtro ?? GRUPOS_PONTO.find(([id]) => dados.resumo[id] > 0)?.[0] ?? "no_posto";
      estado = { status: "pronto", dados, filtro, erro: "" };
      apresentar(estado);
    } catch (erro) {
      if (!ativo || token !== geracao) return;
      estado = { ...estado, status: "erro", erro: erro.mensagem || erro.message };
      apresentar(estado);
    } finally {
      if (token === geracao) pendente = false;
    }
  }

  return {
    carregar,
    ativar(valor) {
      if (valor === ativo) return;
      ativo = valor;
      if (timer !== null) cancelar(timer);
      timer = null;
      geracao++;
      pendente = false;
      if (ativo) {
        apresentar(estado);
        carregar();
        timer = agendar(carregar, 15000);
      }
    },
    filtrar(filtro) {
      if (!ativo || !GRUPOS_PONTO.some(([id]) => id === filtro)) return;
      estado = { ...estado, filtro };
      apresentar(estado);
    },
    limpar() {
      this.ativar(false);
      geracao++;
      pendente = false;
      estado = { status: "carregando", dados: null, filtro: null, erro: "" };
      apresentar(estado);
    }
  };
}

let controlador;
let painel;
let bloqueado = false;

export function iniciarPonto() {
  if (controlador) return;
  painel = document.getElementById("presenca");
  const tela = criarTelaPonto(painel);
  controlador = criarControladorPonto({
    consultar: () => req("GET", "/api/presenca"),
    apresentar: tela.apresentar,
    visivel: () => !document.hidden && !sessaoEncerrada()
  });
  painel.addEventListener("click", evento => {
    const botao = evento.target.closest("[data-pr]");
    if (botao) controlador.filtrar(botao.dataset.pr);
  });
  document.addEventListener("visibilitychange", () => controlador.carregar());
  window.addEventListener("qp-limpar-dados", () => {
    // O fluxo de sessão/acesso recarrega a página; nenhuma resposta antiga pode reaparecer.
    bloqueado = true;
    controlador.limpar();
    painel.hidden = true;
  });
}

export function atualizarAbaPonto(aba, papel) {
  if (!controlador) return;
  const permitido = ["admin", "rh", "gestor"].includes(papel);
  const ativa = aba === "ponto" && permitido && !bloqueado && !sessaoEncerrada();
  painel.hidden = !ativa;
  controlador.ativar(ativa);
}
