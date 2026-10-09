import { classeCor } from "../core/cores.js";
/** Funcionalidade: importacao. */
import { dialogo, $, toast, esc } from "../core/dom.js";
import { req as api, db as banco } from "../core/api.js";
const NOME_TIPO = {
  funcionarios: "Funcionários",
  lancamentos: "Lançamentos (férias, atestados, abonos, viagens, capacitações, banco de horas)"
};
function abrirImportacao() {
  const d = dialogo("dlg-imp", `
      <form class="kd" id="imp-form" novalidate>
        <div class="kd-head"><div><div class="eyebrow">Planilhas</div><h2>Importar CSV ou Excel</h2></div>
          <button class="icon-btn" type="button" data-close aria-label="Fechar">×</button></div>
        <div class="fields">
          <label class="full">O que a planilha contém<select id="imp-tipo">
            <option value="lancamentos">${NOME_TIPO.lancamentos}</option>
            <option value="funcionarios">${NOME_TIPO.funcionarios}</option></select></label>
          <label class="full">Arquivo (.csv ou .xlsx)<input id="imp-arq" type="file" accept=".csv,.xlsx,.xlsm,.txt" required></label>
        </div>
        <div class="imp-links" id="imp-links"></div>
        <div class="note">Os cadastros e lançamentos só mudam após confirmar. Nesta etapa a prévia é guardada por até um dia. Linhas com erro ficam de fora; lançamentos existentes são ignorados.</div>
        <div class="err" id="imp-err" role="alert"></div>
        <div id="imp-res"></div>
        <div class="dlg-foot"><button class="btn small" type="button" id="imp-hist">Histórico de importações</button>
          <div class="r"><button class="btn" type="button" data-close>Fechar</button>
          <button class="btn primary" type="submit" id="imp-validar">Validar planilha</button>
          <button class="btn primary" type="button" id="imp-ok" hidden>Confirmar importação</button></div></div>
      </form>`);
  const links = () => {
    const t = $("#imp-tipo").value;
    $("#imp-links").innerHTML = `Modelo: <a href="/api/importacao/modelos/${t}.xlsx">Excel (.xlsx)</a><a href="/api/importacao/modelos/${t}.csv">CSV</a><a href="/importacao.html" target="_blank" rel="noopener">estrutura das colunas</a>`;
  };
  links();
  let atual = null;
  const limpar = () => {
    atual = null;
    $("#imp-res").innerHTML = "";
    $("#imp-ok").hidden = true;
    $("#imp-validar").hidden = false;
    $("#imp-err").textContent = "";
  };
  $("#imp-tipo").addEventListener("change", () => {
    links();
    limpar();
  });
  $("#imp-arq").addEventListener("change", limpar);
  $("#imp-form").addEventListener("submit", async e => {
    e.preventDefault();
    const arq = $("#imp-arq").files[0];
    if (!arq) return $("#imp-err").textContent = "Escolha o arquivo.";
    const fd = new FormData();
    fd.append("arquivo", arq);
    const b = $("#imp-validar");
    b.disabled = true;
    b.textContent = "Conferindo…";
    $("#imp-err").textContent = "";
    try {
      const r = await fetch(`/api/importacao/${$("#imp-tipo").value}/validar`, {
        method: "POST",
        body: fd,
        credentials: "same-origin",
        headers: {
          "X-Requested-With": "quadro-pessoal"
        }
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.detail || `Erro ${r.status}`);
      atual = j;
      mostrar(j);
    } catch (x) {
      $("#imp-err").textContent = x.message;
    } finally {
      b.disabled = false;
      b.textContent = "Validar planilha";
    }
  });
  $("#imp-ok").addEventListener("click", async () => {
    if (!atual) return;
    const b = $("#imp-ok");
    b.disabled = true;
    b.textContent = "Gravando…";
    try {
      const r = await api("POST", `/api/importacao/${atual.id}/confirmar`);
      const db = banco;
      await Promise.all([db.recarregar("funcionarios"), db.recarregar("ocorrencias")]);
      toast(`${r.gravados} registro(s) importado(s)`);
      d.close();
    } catch (x) {
      $("#imp-err").textContent = x.mensagem || x.message;
    } finally {
      b.disabled = false;
      b.textContent = "Confirmar importação";
    }
  });
  $("#imp-hist").addEventListener("click", historico);
  d.showModal();
}
function mostrar(j) {
  const c = j.contagem,
    ops = c.inserir + c.atualizar;
  const msgs = j.mensagens.slice().sort((a, b) => ({
    erro: 0,
    aviso: 1,
    info: 2
  })[a.nivel] - {
    erro: 0,
    aviso: 1,
    info: 2
  }[b.nivel] || a.linha - b.linha);
  $("#imp-res").innerHTML = `<div class="imp-res">
      <div class="imp-cont">
        <div><b>${c.total}</b><span>linhas lidas</span></div>
        <div><b>${c.inserir}</b><span>novos</span></div>
        <div><b>${c.atualizar}</b><span>atualizações</span></div>
        <div><b>${c.ignorados}</b><span>já existentes / sem mudança</span></div>
        <div><b class="${classeCor(c.erros ? "var(--bad)" : "inherit", "color")}">${c.erros}</b><span>com erro (ficam de fora)</span></div>
      </div>
      ${msgs.length ? `<div class="imp-msgs"><table class="data"><thead><tr><th>Linha</th><th>Tipo</th><th>Mensagem</th></tr></thead><tbody>
        ${msgs.map(m => `<tr><td class="num">${m.linha || "—"}</td><td class="nv-${m.nivel}">${m.nivel}</td><td>${esc(m.texto)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${j.previa.length ? `<details><summary class="hint u-cursor-pointer" >Ver o que será gravado (${ops})</summary><div class="imp-msgs u-margin-top-6px" ><table class="data"><tbody>
        ${j.previa.map(p => `<tr><td class="num">${p.linha}</td><td>${p.acao === "inserir" ? "novo" : "atualiza"}</td><td>${esc(p.resumo)}</td></tr>`).join("")}</tbody></table></div></details>` : ""}
    </div>`;
  $("#imp-ok").hidden = !ops;
  $("#imp-validar").hidden = !!ops;
  $("#imp-ok").textContent = `Confirmar importação (${ops})`;
  if (!ops) $("#imp-err").textContent = "Nenhuma linha válida para importar.";
}
async function historico() {
  const h = await api("GET", "/api/importacao/historico");
  const st = {
    concluida: "concluída",
    pendente: "não confirmada",
    descartada: "descartada"
  };
  $("#imp-res").innerHTML = `<div class="imp-msgs"><table class="data"><thead><tr><th>Quando</th><th>Arquivo</th><th>Tipo</th><th>Situação</th><th class="r">Novos</th><th class="r">Atualiz.</th><th class="r">Erros</th><th>Por</th></tr></thead><tbody>
      ${h.map(i => `<tr><td>${new Date(i.criado_em).toLocaleString("pt-BR")}</td><td>${esc(i.arquivo)}</td><td>${i.tipo}</td><td>${st[i.status]}</td><td class="r num">${i.inseridos}</td><td class="r num">${i.atualizados}</td><td class="r num">${i.com_erro}</td><td>${esc(i.usuario)}</td></tr>`).join("") || `<tr><td colspan="8" class="hint">Nenhuma importação ainda.</td></tr>`}
      </tbody></table></div>`;
}
export { NOME_TIPO, abrirImportacao, mostrar, historico };
