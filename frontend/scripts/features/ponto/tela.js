import { classeCor } from "../../core/cores.js";

export const GRUPOS_PONTO = [
  ["no_posto", "No posto", "good"], ["intervalo", "Em intervalo", "c-banco"],
  ["remoto", "Remoto / home office", "c-ho-strong"], ["planejado", "Home office previsto", "muted"],
  ["aguardando_integracao", "Sem sincronização", "c-abono"], ["afastado", "Afastados", "c-ferias"],
  ["sem_registro", "Sem registro", "bad"], ["aguardando", "Aguardando entrada", "c-abono"],
  ["saiu", "Já saíram", "muted"]
];
const GRUPO_DE = { home_office: "planejado" };
const ESCALAS = { P: "presencial", H: "home office", M: "misto" };
const SINCRONIZACAO = { em_dia: "em dia", pendente: "envios pendentes", atrasada: "sem sinal recente", sem_sinal: "aguardando sinal do ponto" };

export function duracaoPonto(segundos) {
  const valor = Math.abs(segundos);
  return `${segundos < 0 ? "−" : ""}${String(Math.floor(valor / 3600)).padStart(2, "0")}:${String(Math.floor(valor % 3600 / 60)).padStart(2, "0")}`;
}

/** Preenche modelos HTML; nenhum dado recebido é interpretado como marcação. */
export function criarTelaPonto(painel) {
  const doc = painel.ownerDocument;
  const clonar = id => doc.getElementById(id).content.firstElementChild.cloneNode(true);
  const campo = (raiz, nome, valor) => { raiz.querySelector(`[data-ponto="${nome}"]`).textContent = valor; };
  const indicadores = painel.querySelector(".pr-tiles");
  for (const [id, rotulo, cor] of GRUPOS_PONTO) {
    const botao = clonar("ponto-indicador-modelo");
    botao.dataset.pr = id;
    botao.classList.add(classeCor(`var(--${cor})`, "k"));
    botao.querySelector("span").textContent = rotulo;
    indicadores.append(botao);
  }

  function linha(pessoa) {
    const tr = clonar("ponto-linha-modelo");
    tr.dataset.ficha = pessoa.id;
    campo(tr, "nome", pessoa.nome);
    campo(tr, "setor", pessoa.setor?.trim() || "—");
    campo(tr, "situacao", pessoa.rotulo);
    campo(tr, "motivo", pessoa.motivo || "");
    campo(tr, "previsto", pessoa.entrada_prevista || "—");
    campo(tr, "escala", ESCALAS[pessoa.escala] || "");
    campo(tr, "batidas", pessoa.marcacoes.join(" · ") || "—");
    campo(tr, "atraso", pessoa.atraso_min ? `atraso ${pessoa.atraso_min} min` : "");
    campo(tr, "alerta", pessoa.alerta || "");
    const a = pessoa.apuracao;
    campo(tr, "horas", a ? `${duracaoPonto(a.segundos_registrados)} registradas` : "Aguardando apuração do ponto");
    tr.querySelector('[data-ponto="horas"]').classList.toggle("hint", !a);
    const detalhes = a ? [
      `${duracaoPonto(a.segundos_oficiais)} oficiais · saldo ${duracaoPonto(a.saldo_segundos)}`,
      `presencial ${duracaoPonto(a.segundos_presenciais)} · remoto ${duracaoPonto(a.segundos_remotos)}`,
      a.segundos_nao_classificados ? `${duracaoPonto(a.segundos_nao_classificados)} sem modalidade definida` : "",
      a.segundos_periodo_aberto_estimados ? `+ ${duracaoPonto(a.segundos_periodo_aberto_estimados)} em curso (estimativa)` : "",
      a.pendencias?.join(", ")
    ].filter(Boolean).join("\n") : "";
    campo(tr, "detalhes-horas", detalhes);
    return tr;
  }

  return {
    apresentar({ status, dados, filtro, erro }) {
      const pronto = status === "pronto" && dados;
      const mensagem = painel.querySelector('[data-ponto="mensagem"]');
      mensagem.hidden = !!pronto;
      mensagem.setAttribute("role", status === "erro" ? "alert" : "status");
      mensagem.textContent = status === "erro" ? `Não foi possível carregar a presença: ${erro}` : "Carregando presença…";
      painel.querySelector('[data-ponto="conteudo"]').hidden = !pronto;
      const corpo = painel.querySelector("tbody");
      corpo.replaceChildren();
      campo(painel, "sincronizacao", "");
      campo(painel, "desconhecidas", "");
      for (const botao of indicadores.children) {
        botao.querySelector("b").textContent = pronto ? dados.resumo[botao.dataset.pr] || 0 : 0;
        botao.setAttribute("aria-pressed", String(botao.dataset.pr === filtro));
      }
      if (!pronto) return;
      const minutos = dados.ultima_recepcao ? Math.round((Date.now() - new Date(dados.ultima_recepcao)) / 60000) : null;
      const atualizacao = minutos === null ? "Nenhuma batida recebida ainda — configure a integração do ponto." : `última atualização recebida ${minutos <= 1 ? "agora" : `há ${minutos} min`}`;
      const sincronizacao = dados.sincronizacao ? ` · sincronização: ${SINCRONIZACAO[dados.sincronizacao.estado] || dados.sincronizacao.estado}` : "";
      campo(painel, "sincronizacao", `${atualizacao}${sincronizacao} · atualiza a cada 15 s`);
      painel.querySelector('[data-ponto="sincronizacao"]').classList.toggle("pr-off", minutos === null);
      const pessoas = dados.pessoas.filter(p => (GRUPO_DE[p.status] || p.status) === filtro);
      corpo.replaceChildren(...pessoas.map(linha));
      painel.querySelector('[data-ponto="tabela"]').hidden = !pessoas.length;
      painel.querySelector('[data-ponto="vazio"]').hidden = !!pessoas.length;
      const desconhecidas = dados.matriculas_desconhecidas || [];
      painel.querySelector('[data-ponto="desconhecidas"]').hidden = !desconhecidas.length;
      campo(painel, "desconhecidas", desconhecidas.length ? `Batidas de hoje com matrícula não cadastrada no RH: ${desconhecidas.join(", ")}. Cadastre a matrícula no funcionário para vincular.` : "");
    }
  };
}
