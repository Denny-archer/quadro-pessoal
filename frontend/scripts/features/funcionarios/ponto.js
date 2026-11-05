/** Apuração recebida do ponto, independente da jornada prevista no cadastro do RH. */
import { S } from "../../core/estado.js";
import { req } from "../../core/api.js";
import { hN } from "../../core/jornada.js";
import { esc } from "../../core/dom.js";
import { iso, parse, fmt, fmtCurto } from "../../core/datas.js";

const horaBrasilia = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit"
});
const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const pendencias = {
  INTERVALO_ABERTO: "Intervalo em aberto: horas registradas incluem apenas pares fechados",
  MODALIDADES_DIVERGENTES: "Par de batidas com modalidades diferentes",
  JORNADA_INDEFINIDA: "Jornada não definida no ponto"
};

export function intervaloSemana(referencia) {
  const inicio = parse(referencia);
  inicio.setDate(inicio.getDate() - (inicio.getDay() + 6) % 7);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 6);
  return { de: iso(inicio), ate: iso(fim) };
}

export function duracaoPonto(segundos, sinal = false) {
  if (segundos == null || !Number.isFinite(Number(segundos))) return "—";
  const n = Math.abs(Number(segundos));
  const prefixo = Number(segundos) < 0 ? "−" : sinal && Number(segundos) > 0 ? "+" : "";
  return prefixo + String(Math.floor(n / 3600)).padStart(2, "0") + ":" +
    String(Math.floor(n % 3600 / 60)).padStart(2, "0");
}

/** Apenas soma valores enviados; não recalcula horas oficiais nem saldo do ponto. */
export function totalizarPonto(registros) {
  const campos = ["segundos_presenciais", "segundos_remotos", "segundos_registrados",
    "segundos_oficiais", "carga_esperada_segundos", "saldo_segundos"];
  return Object.fromEntries(campos.map(campo => [campo,
    registros.reduce((n, linha) => n + (Number(linha.dados?.[campo]) || 0), 0)]));
}

export function periodosPonto(ponto) {
  const periodos = { presencial: [], remoto: [], indefinidos: [] };
  const marcas = ponto.marcacoes || [];
  const hora = m => {
    const momento = new Date(m.momento);
    return Number.isNaN(momento.getTime()) ? "—" : horaBrasilia.format(momento);
  };
  for (let i = 0; i < marcas.length; i += 2) {
    const entrada = marcas[i], saida = marcas[i + 1];
    const faixa = `${hora(entrada)}–${saida ? hora(saida) : "em aberto"}`;
    const local = saida && entrada.local !== saida.local ? "indefinidos" : entrada.local;
    (periodos[local] || periodos.indefinidos).push(faixa);
  }
  periodos.formato = periodos.presencial.length && periodos.remoto.length ? "Misto" :
    periodos.presencial.length ? "Presencial" : periodos.remoto.length ? "Home office" :
    periodos.indefinidos.length ? "A verificar" : "Sem batidas";
  return periodos;
}

export function tabelaPonto(registros, semana, hoje = iso(new Date())) {
  const porDia = new Map(registros.map(linha => [linha.data, linha]));
  let html = `<div class="scroll"><table class="jornada ponto-jornada"><thead><tr>
    <th scope="col">Dia</th><th scope="col">Formato</th><th scope="col">Presencial</th>
    <th scope="col">Home office</th><th scope="col" class="r" title="Horas oficiais informadas pelo ponto">Horas</th></tr></thead><tbody>`;
  const validos = [];
  for (let i = 0; i < 7; i++) {
    const dia = parse(semana.de);
    dia.setDate(dia.getDate() + i);
    const data = iso(dia), linha = porDia.get(data), ponto = linha?.dados;
    // Mantém os cinco dias da tabela original; inclui sábado/domingo se houver trabalho.
    if (i >= 5 && !(ponto?.marcacoes?.length || ponto?.segundos_registrados || ponto?.segundos_oficiais)) continue;
    const rotulo = `${dias[dia.getDay()]} · ${fmtCurto(data)}`;
    if (!ponto) {
      html += `<tr><th scope="row">${rotulo}</th><td colspan="4" class="hint">${data > hoje ? "Dia futuro" : "Sem apuração recebida"}</td></tr>`;
      continue;
    }
    validos.push(linha);
    const p = periodosPonto(ponto);
    const faixas = xs => xs.map(x => `<span class="ponto-batida num">${esc(x)}</span>`).join("") || `<span class="hint">—</span>`;
    const alertas = (ponto.pendencias || []).map(p => pendencias[p] || p).join(" · ");
    const detalhe = `${ponto.situacao_ponto} · Presencial: ${duracaoPonto(ponto.segundos_presenciais)} · Remoto: ${duracaoPonto(ponto.segundos_remotos)} · Registradas: ${duracaoPonto(ponto.segundos_registrados)} · Oficiais: ${duracaoPonto(ponto.segundos_oficiais)} · Saldo: ${duracaoPonto(ponto.saldo_segundos, true)}`;
    const tag = p.formato === "Home office" ? "ho-tag" : p.formato === "Misto" ? "pres-tag" : "hint";
    html += `<tr data-ponto-dia="${data}"><th scope="row">${rotulo}</th>
      <td><span class="${tag}">${p.formato}</span>${p.indefinidos.length ? `<br><span class="ponto-pendencia">${esc(p.indefinidos.join(" · "))} sem modalidade</span>` : ""}</td>
      <td>${faixas(p.presencial)}</td><td>${faixas(p.remoto)}</td>
      <td class="r num" title="${esc(detalhe)}">${ponto.segundos_oficiais == null ? "—" : hN(ponto.segundos_oficiais / 3600)}${alertas ? `<br><span class="ponto-pendencia" title="${esc(alertas)}">${esc(alertas)}</span>` : ""}</td></tr>`;
  }
  html += `</tbody>`;
  if (validos.length) {
    const t = totalizarPonto(validos);
    html += `<tfoot><tr><td colspan="4">${hN(t.segundos_presenciais / 3600)} presencial · ${hN(t.segundos_remotos / 3600)} home office</td>
      <td class="r num">${hN(t.segundos_oficiais / 3600)}</td></tr></tfoot>`;
  }
  return html + `</table></div><p class="hint ponto-nota">Batidas e horas recebidas do ponto, em horário de Brasília. Atualiza a cada 15 s.</p>`;
}

/** Descarta respostas antigas ao trocar de colaborador/semana ou sair da ficha. */
export function criarConsultaPonto(consultar, mudou) {
  let estado = { status: "inicial", registros: [], chave: null }, sequencia = 0, pendente = null;
  return {
    get estado() { return estado; },
    cancelar() {
      sequencia++;
      pendente = null;
      estado = { status: "inicial", registros: [], chave: null };
    },
    carregar(id, semana, forcar = false) {
      const chave = JSON.stringify([id, semana.de, semana.ate]);
      const mesma = estado.chave === chave;
      if (mesma && pendente) return pendente;
      if (mesma && !forcar && estado.status !== "inicial") return Promise.resolve();
      const token = ++sequencia;
      estado = { chave, semana, status: "carregando", registros: mesma ? estado.registros : [] };
      mudou(estado);
      const tarefa = (async () => {
        await Promise.resolve();
        try {
          const registros = await consultar(id, semana);
          if (!Array.isArray(registros)) throw new Error("Resposta de jornada inválida.");
          if (token !== sequencia) return;
          estado = { chave, semana, status: "pronto", registros };
        } catch (erro) {
          if (token !== sequencia) return;
          estado = { ...estado, status: "erro", erro: erro.mensagem || erro.message || "Falha ao consultar o ponto." };
        } finally {
          if (token === sequencia) {
            pendente = null;
            mudou(estado);
          }
        }
      })();
      pendente = tarefa;
      return tarefa;
    }
  };
}

let consulta, semanaEscolhida, periodo;
if(typeof window!=='undefined')window.addEventListener('qp-limpar-dados',()=>{
  consulta?.cancelar();semanaEscolhida=null;periodo=null;
  document.getElementById('ponto-ficha')?.replaceChildren();
});
function contexto(id) {
  const atual = `${S.y}-${S.m}`;
  if (periodo !== atual || !semanaEscolhida) {
    const agora = new Date();
    const referencia = S.y === agora.getFullYear() && S.m === agora.getMonth() ? iso(agora) : iso(new Date(S.y, S.m, 1));
    semanaEscolhida = intervaloSemana(referencia);
    periodo = atual;
  }
  return { id, semana: semanaEscolhida, chave: JSON.stringify([id, semanaEscolhida.de, semanaEscolhida.ate]) };
}

function conteudoPonto(estado, semana) {
  let html = `<div class="ponto-cabecalho"><div><h3>Jornada semanal</h3>
    <p class="hint">${fmt(semana.de)} a ${fmt(semana.ate)} · apuração recebida do ponto</p></div>
    <div class="ponto-controles" role="group" aria-label="Semana da apuração">
      <button class="btn small" type="button" data-ponto-semana="-1" aria-label="Semana anterior do ponto">‹</button>
      <label>Data da semana<input type="date" data-ponto-data value="${semana.de}"></label>
      <button class="btn small" type="button" data-ponto-semana="1" aria-label="Próxima semana do ponto">›</button>
      <button class="btn small" type="button" data-ponto-hoje>Esta semana</button>
    </div></div>`;
  if (estado.status === "erro") {
    html += `<p class="err" role="alert">Não foi possível atualizar a apuração: ${esc(estado.erro)}.
      ${estado.registros.length ? "Exibindo a última consulta válida." : ""}
      <button class="btn small" type="button" data-ponto-recarregar>Tentar novamente</button></p>`;
    if (!estado.registros.length) return html;
  }
  if ((estado.status === "inicial" || estado.status === "carregando") && !estado.registros.length) {
    return html + `<p class="hint" role="status">Carregando apuração do ponto…</p>`;
  }
  return html + tabelaPonto(estado.registros, semana);
}

export function fichaPonto(f) {
  const ctx = contexto(f.id);
  const estado = consulta?.estado.chave === ctx.chave ? consulta.estado : { status: "inicial", registros: [] };
  return `<section id="ponto-ficha" class="ponto-ficha" data-ponto-chave="${esc(ctx.chave)}" aria-label="Apuração semanal do ponto">${conteudoPonto(estado, ctx.semana)}</section>`;
}

export function atualizarPontoFicha(forcar = false) {
  const caixa = document.getElementById("ponto-ficha");
  if (!caixa || S.tab !== "func" || !S.sel) {
    consulta?.cancelar();
    return;
  }
  if (!consulta) {
    consulta = criarConsultaPonto((id, s) => req("GET", `/api/jornada/${encodeURIComponent(id)}?de=${s.de}&ate=${s.ate}`), estado => {
      const alvo = document.getElementById("ponto-ficha");
      if (alvo?.dataset.pontoChave === estado.chave && S.tab === "func") {
        alvo.innerHTML = conteudoPonto(estado, estado.semana);
      }
    });
    document.addEventListener("click", e => {
      const botao = e.target.closest("[data-ponto-semana], [data-ponto-hoje], [data-ponto-recarregar]");
      if (!botao?.closest("#ponto-ficha")) return;
      if (botao.hasAttribute("data-ponto-hoje")) semanaEscolhida = intervaloSemana(iso(new Date()));
      if (botao.hasAttribute("data-ponto-semana")) {
        const ref = parse(semanaEscolhida.de);
        ref.setDate(ref.getDate() + Number(botao.dataset.pontoSemana) * 7);
        semanaEscolhida = intervaloSemana(iso(ref));
      }
      atualizarPontoFicha(true);
    });
    document.addEventListener("change", e => {
      if (e.target.matches("#ponto-ficha [data-ponto-data]") && e.target.value) {
        semanaEscolhida = intervaloSemana(e.target.value);
        atualizarPontoFicha(true);
      }
    });
    const atualizarVisivel = () => {
      if (!document.hidden && S.tab === "func") atualizarPontoFicha(true);
    };
    setInterval(atualizarVisivel, 15000);
    document.addEventListener("visibilitychange", atualizarVisivel);
  }
  const ctx = contexto(S.sel);
  caixa.dataset.pontoChave = ctx.chave;
  return consulta.carregar(ctx.id, ctx.semana, forcar);
}
