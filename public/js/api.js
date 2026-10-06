/* Ponte entre o painel e a API do servidor.
 * O painel foi escrito sobre uma interface de documentos (collection/doc/onSnapshot/set/delete).
 * Este arquivo implementa essa mesma interface sobre a API REST, para o painel funcionar sem alterações.
 * Atualização em tempo real: consulta /api/dados/versoes a cada 5 s e recarrega só o que mudou.
 */
(() => {
  "use strict";
  const H = {"Content-Type": "application/json", "X-Requested-With": "quadro-pessoal"};

  async function req(metodo, url, corpo){
    const r = await fetch(url, {method: metodo, headers: H, credentials: "same-origin",
                                body: corpo === undefined ? undefined : JSON.stringify(corpo)});
    if (r.status === 401){ location.href = "/login?volta=" + encodeURIComponent(location.pathname); throw {code: "revoked"}; }
    let dados = null;
    try { dados = await r.json(); } catch(e){}
    if (!r.ok){
      const msg = (dados && typeof dados.detail === "string") ? dados.detail : `Erro ${r.status}`;
      const e = new Error(msg); e.code = r.status === 403 || r.status === 400 || r.status === 409 ? "invalid_argument" : "server"; e.mensagem = msg;
      throw e;
    }
    return dados;
  }
  window.qpApi = req;

  const ouvintes = new Map();        // chave -> Set(callback)
  const cache = new Map();           // chave -> dados
  const assinaturas = {};

  async function carregar(chave){
    if (chave.startsWith("config/")){
      const r = await req("GET", "/api/dados/" + chave);
      cache.set(chave, {exists: r.existe, data: () => r.dados});
    } else {
      const docs = await req("GET", "/api/dados/" + chave);
      cache.set(chave, {docs: docs.map(d => { const {id, ...resto} = d; return {id, data: () => ({...resto})}; })});
    }
    for (const cb of ouvintes.get(chave) || []) try { cb(cache.get(chave)); } catch(e){ console.error(e); }
  }

  function ouvir(chave, cb, erro){
    if (!ouvintes.has(chave)) ouvintes.set(chave, new Set());
    ouvintes.get(chave).add(cb);
    if (cache.has(chave)) cb(cache.get(chave));
    else carregar(chave).catch(e => erro && erro(e));
    return () => ouvintes.get(chave).delete(cb);
  }

  async function sondar(){
    if (document.hidden) return;
    try {
      const v = await req("GET", "/api/dados/versoes");
      for (const [chave, assinatura] of Object.entries(v)){
        if (assinaturas[chave] !== undefined && assinaturas[chave] !== assinatura && ouvintes.has(chave)) carregar(chave).catch(() => {});
        assinaturas[chave] = assinatura;
      }
    } catch(e){}
  }
  setInterval(sondar, 5000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) sondar(); });

  const novoId = () => {
    const a = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", b = crypto.getRandomValues(new Uint8Array(20));
    return Array.from(b, x => a[x % a.length]).join("");
  };

  function doc(caminho){
    const [colecao, id] = caminho.split("/");
    return {
      id,
      onSnapshot: (cb, erro) => ouvir(caminho, cb, erro),
      async set(dados){
        if (colecao === "config") await req("PUT", "/api/dados/" + caminho, dados);
        else await req("PUT", `/api/dados/${colecao}/${encodeURIComponent(id)}`, dados);
        await carregar(colecao === "config" ? caminho : colecao);
        sondar();
      },
      async delete(){
        await req("DELETE", `/api/dados/${colecao}/${encodeURIComponent(id)}`);
        await carregar(colecao);
        sondar();
      }
    };
  }

  const db = {
    collection: nome => ({
      onSnapshot: (cb, erro) => ouvir(nome, cb, erro),
      doc: id => doc(`${nome}/${id || novoId()}`)
    }),
    doc,
    recarregar: chave => carregar(chave)
  };

  const downloads = {
    async save({filename, data}){
      const blob = data instanceof Blob ? data : new Blob([data], {type: filename.endsWith(".csv") ? "text/csv;charset=utf-8" : "application/octet-stream"});
      const a = Object.assign(document.createElement("a"), {href: URL.createObjectURL(blob), download: filename});
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
  };

  // sessão: confirma o login antes do painel iniciar
  const sessao = req("GET", "/api/auth/eu").then(u => { window.qpUsuario = u; document.documentElement.dataset.papel = u.papel; return u; });
  window.qpSessao = sessao;

  window.claude = {
    use: async nome => {
      await sessao;
      if (nome === "db") return db;
      if (nome === "downloads") return downloads;
      throw new Error("capacidade indisponível");
    }
  };
})();
