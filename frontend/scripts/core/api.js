"use strict";

import { iniciarControleSessao, encerrarTela, sessaoEncerrada } from "./sessao.js";
import { req, iniciarSessao, aplicarContexto, abrirEventos } from '../shared/http.js';
import { S } from './estado.js';
const ouvintes = new Map(); // chave -> Set(callback)
const cache = new Map(); // chave -> dados
const assinaturas = {};
let geracao=0;
async function carregar(chave) {
  const token=geracao;
  if (chave.startsWith("config/")) {
    const r = await req("GET", "/api/dados/" + chave);
    if(token!==geracao)return;
    cache.set(chave, {
      exists: r.existe,
      data: () => r.dados
    });
  } else {
    const docs = await req("GET", "/api/dados/" + chave);
    if(token!==geracao)return;
    cache.set(chave, {
      docs: docs.map(d => {
        const {
          id,
          ...resto
        } = d;
        return {
          id,
          data: () => ({
            ...resto
          })
        };
      })
    });
  }
  for (const cb of ouvintes.get(chave) || []) try {
    cb(cache.get(chave));
  } catch (e) {
    console.error(e);
  }
}
function ouvir(chave, cb, erro) {
  if (!ouvintes.has(chave)) ouvintes.set(chave, new Set());
  ouvintes.get(chave).add(cb);
  if (cache.has(chave)) cb(cache.get(chave));else carregar(chave).catch(e => erro && erro(e));
  return () => ouvintes.get(chave).delete(cb);
}
async function sondar() {
  if (document.hidden) return;
  try {
    const v = await req("GET", "/api/dados/versoes");
    for (const [chave, assinatura] of Object.entries(v)) {
      if (assinaturas[chave] !== undefined && assinaturas[chave] !== assinatura && ouvintes.has(chave)) carregar(chave).catch(() => {});
      assinaturas[chave] = assinatura;
    }
  } catch (e) {}
}
const novoId = () => {
  const a = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    b = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(b, x => a[x % a.length]).join("");
};
function doc(caminho) {
  const [colecao, id] = caminho.split("/");
  return {
    id,
    onSnapshot: (cb, erro) => ouvir(caminho, cb, erro),
    async set(dados) {
      if (colecao === "config") await req("PUT", "/api/dados/" + caminho, dados);else await req("PUT", `/api/dados/${colecao}/${encodeURIComponent(id)}`, dados);
      await carregar(colecao === "config" ? caminho : colecao);
      sondar();
    },
    async delete() {
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
  async save({
    filename,
    data
  }) {
    const blob = data instanceof Blob ? data : new Blob([data], {
      type: filename.endsWith(".csv") ? "text/csv;charset=utf-8" : "application/octet-stream"
    });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: filename
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
};

// sessão: confirma o login antes do painel iniciar

let sessao;
export function iniciarApi() {
  if(!sessao) sessao=iniciarSessao(()=>{geracao++;cache.clear();ouvintes.clear();S.func=[];S.ocs=[];window.dispatchEvent(new CustomEvent('qp-limpar-dados'));}).then(async u=>{
    const atualizar=async()=>{
      const ctx=await req('GET','/api/acesso/contexto');
      const papelAnterior=document.documentElement.dataset.papel;
      aplicarContexto(ctx);
      const permitidos=await req('GET','/api/dados/funcionarios');
      const ids=new Set(permitidos.map(f=>f.id));
      const perdeu=S.func.some(f=>!ids.has(f.id))||papelAnterior!==ctx.perfil;
      if(perdeu){
        geracao++;
        S.func=[];S.ocs=[];S.sel=null;
        document.querySelectorAll('dialog').forEach(d=>{d.close();d.replaceChildren();});
        window.dispatchEvent(new CustomEvent('qp-limpar-dados'));
        document.querySelector('#view')?.replaceChildren();
        location.reload();
        return;
      }
      geracao++;
      cache.clear();
      await Promise.all([...ouvintes.keys()].map(carregar));
    };
    const ctx=await req('GET','/api/acesso/contexto');
    aplicarContexto(ctx);
    abrirEventos(ctx.revisao_acesso,atualizar);
    setInterval(sondar,5000);
    return u;
  });
  return sessao;
}
export { req, sessao, db, downloads };
