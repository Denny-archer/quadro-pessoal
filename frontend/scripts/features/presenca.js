import { classeCor } from "../core/cores.js";
import { req as api } from "../core/api.js";
import { $, esc } from "../core/dom.js";
export function iniciarPresenca(usuario) {
  const $ = s => document.querySelector(s);
  const GRUPOS = [["no_posto", "No posto", "var(--good)"], ["intervalo", "Em intervalo", "var(--c-banco)"], ["remoto", "Remoto / home office", "var(--c-ho-strong)"], ["planejado", "Home office previsto", "var(--muted)"], ["aguardando_integracao", "Sem sincronização", "var(--c-abono)"], ["afastado", "Afastados", "var(--c-ferias)"], ["sem_registro", "Sem registro", "var(--bad)"], ["aguardando", "Aguardando entrada", "var(--c-abono)"], ["saiu", "Já saíram", "var(--muted)"]];
  const GRUPO_DE = {
    no_posto: "no_posto",
    remoto: "remoto",
    home_office: "planejado",
    aguardando_integracao: "aguardando_integracao",
    intervalo: "intervalo",
    saiu: "saiu",
    afastado: "afastado",
    aguardando: "aguardando",
    sem_registro: "sem_registro",
    nao_util: "nao_util"
  };
  let dados = null,
    filtro = null,
    timer = null,
    ativa = false;
  const caixa = document.createElement("section");
  caixa.id = "presenca";
  caixa.className = "panel";
  caixa.hidden = true;
  $("#view").before(caixa);
  function minutosDesde(iso) {
    return iso ? Math.round((Date.now() - new Date(iso)) / 60000) : null;
  }
  function duracao(segundos) {
    const n = Math.abs(segundos),
      h = Math.floor(n / 3600),
      m = Math.floor(n % 3600 / 60);
    return `${segundos < 0 ? "−" : ""}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  function horas(p) {
    const a = p.apuracao;
    if (!a) return '<span class="hint">Aguardando apuração do ponto</span>';
    return `<strong>${duracao(a.segundos_registrados)} registradas</strong><br>
      <span class="hint">${duracao(a.segundos_oficiais)} oficiais · saldo ${duracao(a.saldo_segundos)}<br>
      presencial ${duracao(a.segundos_presenciais)} · remoto ${duracao(a.segundos_remotos)}
      ${a.segundos_nao_classificados ? `<br>${duracao(a.segundos_nao_classificados)} sem modalidade definida` : ""}
      ${a.segundos_periodo_aberto_estimados ? `<br>+ ${duracao(a.segundos_periodo_aberto_estimados)} em curso (estimativa)` : ""}
      ${a.pendencias.length ? `<br>${a.pendencias.map(esc).join(", ")}` : ""}</span>`;
  }
  function desenhar() {
    if (!dados) {
      caixa.innerHTML = `<div class="empty">Carregando presença…</div>`;
      return;
    }
    const r = dados.resumo,
      ult = minutosDesde(dados.ultima_recepcao);
    if (filtro === null) filtro = GRUPOS.find(([g]) => r[g] > 0)?.[0] || "no_posto";
    const lista = dados.pessoas.filter(p => GRUPO_DE[p.status] === filtro);
    const semIntegracao = dados.ultima_recepcao === null;
    caixa.innerHTML = `
      <div class="panel-head"><h2>Presença agora <span class="hint u-font-inherit" >· sistema de ponto</span></h2>
        <span class="hint">${semIntegracao ? '<span class="pr-off">Nenhuma batida recebida ainda — configure a integração do ponto.</span>' : `última atualização recebida ${ult <= 1 ? "agora" : `há ${ult} min`}`}
          ${dados.sincronizacao ? ` · sincronização: ${esc({
      em_dia: "em dia",
      pendente: "envios pendentes",
      atrasada: "sem sinal recente",
      sem_sinal: "aguardando sinal do ponto"
    }[dados.sincronizacao.estado] || dados.sincronizacao.estado)}` : ""}
          · atualiza a cada 15 s</span></div>
      <div class="pr-tiles">${GRUPOS.map(([g, rot, cor]) => `<button type="button" class="pr-tile ${classeCor(cor, "k")}"  data-pr="${g}" aria-pressed="${filtro === g}"><b>${r[g] || 0}</b><span>${rot}</span></button>`).join("")}</div>
      ${lista.length ? `<div class="scroll"><table class="data"><thead><tr><th>Funcionário</th><th>Situação</th><th>Previsto</th><th>Batidas de hoje</th><th>Horas do ponto</th><th>Observação</th></tr></thead><tbody>
        ${lista.map(p => `<tr class="click" data-ficha="${esc(p.id)}"><td><strong>${esc(p.nome)}</strong><br><span class="hint">${esc(p.setor || "")}</span></td>
          <td>${esc(p.rotulo)}${p.motivo ? `<br><span class="hint">${esc(p.motivo)}</span>` : ""}</td>
          <td class="num">${p.entrada_prevista || "—"}${p.escala ? ` <span class="hint">${{
      P: "presencial",
      H: "home office",
      M: "misto"
    }[p.escala]}</span>` : ""}</td>
          <td class="pr-bat">${p.marcacoes.join(" · ") || "—"}${p.atraso_min ? `<br><span class="pr-alerta">atraso ${p.atraso_min} min</span>` : ""}</td>
          <td class="num">${horas(p)}</td>
          <td>${p.alerta ? `<span class="pr-alerta">${esc(p.alerta)}</span>` : ""}</td></tr>`).join("")}
      </tbody></table></div>` : `<div class="empty">Ninguém nesta situação agora.</div>`}
      ${dados.matriculas_desconhecidas.length ? `<div class="note u-margin-top-10px" >Batidas de hoje com matrícula não cadastrada no RH: ${dados.matriculas_desconhecidas.map(esc).join(", ")}. Cadastre a matrícula no funcionário para vincular.</div>` : ""}`;
  }
  async function carregar() {
    try {
      dados = await api("GET", "/api/presenca");
      desenhar();
    } catch (e) {
      caixa.innerHTML = `<div class="empty">Não foi possível carregar a presença: ${esc(e.mensagem || e.message)}</div>`;
    }
  }
  function sincronizarAba() {
    const naPanorama = document.querySelector('[data-tab="panorama"]')?.getAttribute("aria-selected") === "true";
    caixa.hidden = !naPanorama;
    // Renderizações repetidas da aba não podem reiniciar o prazo da atualização.
    if (naPanorama === ativa) return;
    ativa = naPanorama;
    clearInterval(timer);
    if (naPanorama) {
      carregar();
      timer = setInterval(() => {
        if (!document.hidden) carregar();
      }, 15000);
    }
  }
  new MutationObserver(sincronizarAba).observe(document.querySelector(".tabs"), {
    attributes: true,
    subtree: true,
    attributeFilter: ["aria-selected"]
  });
  caixa.addEventListener("click", e => {
    const b = e.target.closest("[data-pr]");
    if (b) {
      filtro = b.dataset.pr;
      desenhar();
    }
  });

  /* ---------- chaves de integração (administrador) ---------- */
  async function abrirChaves() {
    const lista = await api("GET", "/api/integracao/chaves");
    let d = document.getElementById("dlg-chaves");
    if (!d) {
      d = document.createElement("dialog");
      d.id = "dlg-chaves";
      d.className = "dlg-wide";
      document.body.appendChild(d);
    }
    d.innerHTML = `<div class="kd">
      <div class="kd-head"><div><div class="eyebrow">Integrações</div><h2>Chaves de API do sistema de ponto</h2></div><button class="icon-btn" type="button" data-close aria-label="Fechar">×</button></div>
      <div class="note">O sistema de ponto envia a apuração diária para <code>POST /api/integracao/ponto/resumos</code> e informa a sincronização em <code>/api/integracao/ponto/sinal</code>, usando <code>Authorization: Bearer &lt;chave&gt;</code>. Crie uma chave por ambiente e revogue a que vazar.</div>
      <div class="scroll"><table class="data"><thead><tr><th>Nome</th><th>Início da chave</th><th>Criada</th><th>Último uso</th><th>Situação</th><th></th></tr></thead><tbody>
        ${lista.map(k => `<tr><td>${esc(k.nome)}</td><td class="num">${esc(k.prefixo)}…</td><td>${new Date(k.criado_em).toLocaleDateString("pt-BR")}</td>
          <td>${k.ultimo_uso ? new Date(k.ultimo_uso).toLocaleString("pt-BR") : "nunca"}</td><td>${k.ativo ? "ativa" : "revogada"}</td>
          <td>${k.ativo ? `<button class="btn small danger" type="button" data-revogar="${k.id}">Revogar</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="6" class="hint">Nenhuma chave criada.</td></tr>`}
      </tbody></table></div>
      <form id="ch-form" class="fields" novalidate><label>Nome da chave<input id="ch-nome" type="text" maxlength="80" placeholder="Sistema de ponto - produção"></label>
        <label class="u-align-self-end"><button class="btn primary" type="submit">Criar chave</button></label></form>
      <div id="ch-out" class="err" role="alert"></div></div>`;
    d.querySelector("[data-close]").addEventListener("click", () => d.close());
    d.querySelectorAll("[data-revogar]").forEach(b => b.addEventListener("click", async () => {
      if (!b.classList.contains("armed")) {
        b.classList.add("armed");
        b.textContent = "Confirmar";
        return;
      }
      await api("DELETE", `/api/integracao/chaves/${b.dataset.revogar}`);
      abrirChaves();
    }));
    d.querySelector("#ch-form").addEventListener("submit", async e => {
      e.preventDefault();
      const nome = d.querySelector("#ch-nome").value.trim(),
        out = d.querySelector("#ch-out");
      try {
        const r = await api("POST", "/api/integracao/chaves", {
          nome
        });
        await abrirChaves();
        const o = document.querySelector("#ch-out");
        o.classList.add("text-normal");
        o.innerHTML = `Chave criada. <strong>Copie agora</strong>, ela não aparece de novo:<br><code class="u-user-select-all">${esc(r.chave)}</code>`;
      } catch (x) {
        out.textContent = x.mensagem || x.message;
      }
    });
    if (!d.open) d.showModal();
  }
  function ativarPresenca(u) {
    sincronizarAba();
    if (u.papel !== "admin") return;
    const b = Object.assign(document.createElement("button"), {
      className: "btn small",
      type: "button",
      textContent: "Integrações"
    });
    b.addEventListener("click", abrirChaves);
    const ref = document.getElementById("qp-senha");
    (ref ? ref.parentNode : document.querySelector(".period")).insertBefore(b, ref);
  }
  ativarPresenca(usuario);
}
