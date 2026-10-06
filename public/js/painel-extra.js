/* Recursos da versão servidor: usuário logado, perfis, importação de planilhas e gestão de usuários. */
(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const api = (m, u, c) => window.qpApi(m, u, c);
  const NOME_TIPO = {funcionarios: "Funcionários", lancamentos: "Lançamentos (férias, atestados, abonos, viagens, capacitações, banco de horas)"};

  const css = document.createElement("style");
  css.textContent = `
    .qp-user{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)}
    .qp-user strong{color:var(--ink)}
    html[data-papel="leitor"] #new-func, html[data-papel="leitor"] #new-lanc, html[data-papel="leitor"] #qp-imp{display:none!important}
    .imp-res{display:flex;flex-direction:column;gap:10px}
    .imp-cont{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}
    .imp-cont div{background:var(--sunk);border-radius:8px;padding:8px 10px}
    .imp-cont b{display:block;font:800 22px/1.1 var(--f-display)}
    .imp-cont span{font-size:12px;color:var(--muted)}
    .imp-msgs{max-height:240px;overflow:auto;border:1px solid var(--line);border-radius:8px}
    .imp-msgs td{font-size:13px}
    .nv-erro{color:var(--bad);font-weight:600}.nv-aviso{color:var(--c-abono);font-weight:600}.nv-info{color:var(--muted)}
    .imp-links{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px}
    .imp-links a{color:var(--accent);font-weight:600}
  `;
  document.head.appendChild(css);

  function dialogo(id, html){
    let d = document.getElementById(id);
    if (!d){ d = document.createElement("dialog"); d.id = id; d.className = "dlg-wide"; document.body.appendChild(d); }
    d.innerHTML = html;
    d.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => d.close()));
    return d;
  }
  const toast = t => { const el = document.createElement("div"); el.className = "toast"; el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 3200); };

  /* ---------- importação ---------- */
  function abrirImportacao(){
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
        <div class="note">Nada é gravado nesta etapa: o sistema confere cada linha e mostra o que vai entrar. Linhas com erro ficam de fora; lançamentos já existentes (mesmo funcionário, tipo e datas) são ignorados.</div>
        <div class="err" id="imp-err" role="alert"></div>
        <div id="imp-res"></div>
        <div class="dlg-foot"><button class="btn small" type="button" id="imp-hist">Histórico de importações</button>
          <div class="r"><button class="btn" type="button" data-close>Fechar</button>
          <button class="btn primary" type="submit" id="imp-validar">Validar planilha</button>
          <button class="btn primary" type="button" id="imp-ok" hidden>Confirmar importação</button></div></div>
      </form>`);
    const links = () => { const t = $("#imp-tipo").value;
      $("#imp-links").innerHTML = `Modelo: <a href="/api/importacao/modelos/${t}.xlsx">Excel (.xlsx)</a><a href="/api/importacao/modelos/${t}.csv">CSV</a><a href="/importacao.html" target="_blank" rel="noopener">estrutura das colunas</a>`; };
    links();
    let atual = null;
    const limpar = () => { atual = null; $("#imp-res").innerHTML = ""; $("#imp-ok").hidden = true; $("#imp-validar").hidden = false; $("#imp-err").textContent = ""; };
    $("#imp-tipo").addEventListener("change", () => { links(); limpar(); });
    $("#imp-arq").addEventListener("change", limpar);
    $("#imp-form").addEventListener("submit", async e => {
      e.preventDefault();
      const arq = $("#imp-arq").files[0];
      if (!arq) return $("#imp-err").textContent = "Escolha o arquivo.";
      const fd = new FormData(); fd.append("arquivo", arq);
      const b = $("#imp-validar"); b.disabled = true; b.textContent = "Conferindo…"; $("#imp-err").textContent = "";
      try {
        const r = await fetch(`/api/importacao/${$("#imp-tipo").value}/validar`, {method: "POST", body: fd, credentials: "same-origin", headers: {"X-Requested-With": "quadro-pessoal"}});
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.detail || `Erro ${r.status}`);
        atual = j; mostrar(j);
      } catch(x){ $("#imp-err").textContent = x.message; }
      finally { b.disabled = false; b.textContent = "Validar planilha"; }
    });
    $("#imp-ok").addEventListener("click", async () => {
      if (!atual) return;
      const b = $("#imp-ok"); b.disabled = true; b.textContent = "Gravando…";
      try {
        const r = await api("POST", `/api/importacao/${atual.id}/confirmar`);
        const db = await window.claude.use("db");
        await Promise.all([db.recarregar("funcionarios"), db.recarregar("ocorrencias")]);
        toast(`${r.gravados} registro(s) importado(s)`); d.close();
      } catch(x){ $("#imp-err").textContent = x.mensagem || x.message; }
      finally { b.disabled = false; b.textContent = "Confirmar importação"; }
    });
    $("#imp-hist").addEventListener("click", historico);
    d.showModal();
  }

  function mostrar(j){
    const c = j.contagem, ops = c.inserir + c.atualizar;
    const msgs = j.mensagens.slice().sort((a,b) => ({erro:0,aviso:1,info:2})[a.nivel] - ({erro:0,aviso:1,info:2})[b.nivel] || a.linha - b.linha);
    $("#imp-res").innerHTML = `<div class="imp-res">
      <div class="imp-cont">
        <div><b>${c.total}</b><span>linhas lidas</span></div>
        <div><b>${c.inserir}</b><span>novos</span></div>
        <div><b>${c.atualizar}</b><span>atualizações</span></div>
        <div><b>${c.ignorados}</b><span>já existentes / sem mudança</span></div>
        <div><b style="color:${c.erros ? "var(--bad)" : "inherit"}">${c.erros}</b><span>com erro (ficam de fora)</span></div>
      </div>
      ${msgs.length ? `<div class="imp-msgs"><table class="data"><thead><tr><th>Linha</th><th>Tipo</th><th>Mensagem</th></tr></thead><tbody>
        ${msgs.map(m => `<tr><td class="num">${m.linha || "—"}</td><td class="nv-${m.nivel}">${m.nivel}</td><td>${esc(m.texto)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${j.previa.length ? `<details><summary class="hint" style="cursor:pointer">Ver o que será gravado (${ops})</summary><div class="imp-msgs" style="margin-top:6px"><table class="data"><tbody>
        ${j.previa.map(p => `<tr><td class="num">${p.linha}</td><td>${p.acao === "inserir" ? "novo" : "atualiza"}</td><td>${esc(p.resumo)}</td></tr>`).join("")}</tbody></table></div></details>` : ""}
    </div>`;
    $("#imp-ok").hidden = !ops; $("#imp-validar").hidden = !!ops;
    $("#imp-ok").textContent = `Confirmar importação (${ops})`;
    if (!ops) $("#imp-err").textContent = "Nenhuma linha válida para importar.";
  }

  async function historico(){
    const h = await api("GET", "/api/importacao/historico");
    const st = {concluida: "concluída", pendente: "não confirmada", descartada: "descartada"};
    $("#imp-res").innerHTML = `<div class="imp-msgs"><table class="data"><thead><tr><th>Quando</th><th>Arquivo</th><th>Tipo</th><th>Situação</th><th class="r">Novos</th><th class="r">Atualiz.</th><th class="r">Erros</th><th>Por</th></tr></thead><tbody>
      ${h.map(i => `<tr><td>${new Date(i.criado_em).toLocaleString("pt-BR")}</td><td>${esc(i.arquivo)}</td><td>${i.tipo}</td><td>${st[i.status]}</td><td class="r num">${i.inseridos}</td><td class="r num">${i.atualizados}</td><td class="r num">${i.com_erro}</td><td>${esc(i.usuario)}</td></tr>`).join("") || `<tr><td colspan="8" class="hint">Nenhuma importação ainda.</td></tr>`}
      </tbody></table></div>`;
  }

  /* ---------- usuários (admin) ---------- */
  async function abrirUsuarios(){
    const lista = await api("GET", "/api/usuarios");
    const PAP = {admin: "Administrador", editor: "Editor", leitor: "Leitor"};
    const d = dialogo("dlg-usr", `
      <div class="kd">
        <div class="kd-head"><div><div class="eyebrow">Acesso</div><h2>Usuários do sistema</h2></div><button class="icon-btn" type="button" data-close aria-label="Fechar">×</button></div>
        <div class="note">Administrador: tudo, inclusive usuários e tabela salarial. Editor: cadastra, lança e importa. Leitor: só consulta.</div>
        <div class="scroll"><table class="data"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Ativo</th><th>Último acesso</th></tr></thead><tbody>
          ${lista.map(u => `<tr><td>${esc(u.nome)}</td><td>${esc(u.email)}</td>
            <td><select data-u="${u.id}" data-k="papel">${Object.entries(PAP).map(([k,v]) => `<option value="${k}" ${u.papel===k?"selected":""}>${v}</option>`).join("")}</select></td>
            <td><input type="checkbox" data-u="${u.id}" data-k="ativo" ${u.ativo?"checked":""}></td>
            <td>${u.ultimo_acesso ? new Date(u.ultimo_acesso).toLocaleString("pt-BR") : "—"}</td></tr>`).join("")}
        </tbody></table></div>
        <form id="usr-novo" class="fields" novalidate>
          <label>Nome<input id="u-nome" type="text" maxlength="120" required></label>
          <label>E-mail<input id="u-email" type="text" maxlength="200" required></label>
          <label>Perfil<select id="u-papel"><option value="leitor">Leitor</option><option value="editor">Editor</option><option value="admin">Administrador</option></select></label>
          <label style="align-self:end"><button class="btn primary" type="submit">Criar usuário</button></label>
        </form>
        <div class="err" id="usr-err" role="alert"></div>
      </div>`);
    d.querySelectorAll("[data-u]").forEach(el => el.addEventListener("change", async () => {
      try { await api("PATCH", `/api/usuarios/${el.dataset.u}`, {[el.dataset.k]: el.type === "checkbox" ? el.checked : el.value}); toast("Usuário atualizado"); }
      catch(x){ $("#usr-err").textContent = x.mensagem || x.message; }
    }));
    $("#usr-novo").addEventListener("submit", async e => {
      e.preventDefault();
      try {
        const r = await api("POST", "/api/usuarios", {nome: $("#u-nome").value.trim(), email: $("#u-email").value.trim(), papel: $("#u-papel").value});
        await abrirUsuarios();
        $("#usr-err").style.color = "var(--ink)";
        $("#usr-err").textContent = `Usuário criado. Senha provisória (mostrada só agora, envie por canal seguro): ${r.senha_provisoria}`;
      } catch(x){ $("#usr-err").textContent = x.mensagem || x.message; }
    });
    if (!d.open) d.showModal();
  }

  /* ---------- troca de senha ---------- */
  function abrirSenha(){
    const d = dialogo("dlg-senha", `
      <form class="kd" id="senha-form" novalidate style="width:min(440px,100%)">
        <div class="kd-head"><h2>Trocar senha</h2><button class="icon-btn" type="button" data-close aria-label="Fechar">×</button></div>
        <label class="hint">Senha atual<input id="s-atual" type="password" autocomplete="current-password"></label>
        <label class="hint">Nova senha (mín. 10 caracteres)<input id="s-nova" type="password" autocomplete="new-password"></label>
        <div class="err" id="s-err" role="alert"></div>
        <div class="dlg-foot"><div class="r"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="submit">Salvar</button></div></div>
      </form>`);
    d.classList.remove("dlg-wide");
    $("#senha-form").addEventListener("submit", async e => {
      e.preventDefault();
      try { await api("POST", "/api/auth/senha", {atual: $("#s-atual").value, nova: $("#s-nova").value}); d.close(); toast("Senha alterada"); }
      catch(x){ $("#s-err").textContent = x.mensagem || x.message; }
    });
    d.showModal();
  }

  /* ---------- barra do usuário ---------- */
  window.qpSessao.then(u => {
    const acoes = $(".actions");
    const imp = Object.assign(document.createElement("button"), {className: "btn", id: "qp-imp", type: "button", textContent: "Importar planilha"});
    imp.addEventListener("click", abrirImportacao);
    acoes.insertBefore(imp, $("#new-func"));
    const top = $(".period");
    const box = document.createElement("div"); box.className = "qp-user";
    box.innerHTML = `<span>Olá, <strong>${esc(u.nome.split(" ")[0])}</strong></span>
      ${u.papel === "admin" ? `<button class="btn small" type="button" id="qp-usr">Usuários</button>` : ""}
      <button class="btn small" type="button" id="qp-senha">Senha</button>
      <button class="btn small" type="button" id="qp-sair">Sair</button>`;
    top.appendChild(box);
    $("#qp-sair").addEventListener("click", async () => { await api("POST", "/api/auth/logout"); location.href = "/login"; });
    $("#qp-senha").addEventListener("click", abrirSenha);
    if (u.papel === "admin") $("#qp-usr").addEventListener("click", abrirUsuarios);
  }).catch(() => {});
})();
