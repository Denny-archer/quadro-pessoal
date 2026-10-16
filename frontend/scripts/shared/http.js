import { iniciarControleSessao, encerrarTela, sessaoEncerrada } from './sessao.js';
let sessao;
export async function req(metodo,url,corpo) {
  if (sessaoEncerrada()) throw Object.assign(new Error('Sessão encerrada'),{code:'revoked'});
  const r=await fetch(url,{method:metodo,credentials:'same-origin',headers:{
    'Content-Type':'application/json','X-Requested-With':'quadro-pessoal'},
    body:corpo===undefined?undefined:JSON.stringify(corpo)});
  const dados=await r.json().catch(()=>null);
  if(r.status===401) {encerrarTela('expirada',true);throw Object.assign(new Error('Sessão encerrada'),{code:'revoked'});}
  if(!r.ok) {
    const msg=typeof dados?.detail==='string'?dados.detail:`Erro ${r.status}`;
    if(r.status===403 && msg.startsWith('Troque a senha')) location.replace('/primeiro-acesso');
    throw Object.assign(new Error(msg),{mensagem:msg,status:r.status,
      code:({400:'validation',403:'forbidden',404:'not_found',409:'conflict',422:'validation'})[r.status]||'server'});
  }
  if(sessaoEncerrada()) throw Object.assign(new Error('Sessão encerrada'),{code:'revoked'});
  return dados;
}
export function iniciarSessao(aoEncerrar=()=>{}) {
  if(!sessao) sessao=req('GET','/api/auth/eu').then(u=>{
    if(u.trocar_senha) {location.replace('/primeiro-acesso');throw Object.assign(new Error('Troca de senha obrigatória'),{code:'revoked'});}
    document.documentElement.dataset.usuario=u.id;
    document.documentElement.dataset.papel=u.papel;
    iniciarControleSessao({inatividadeMinutos:u.sessao?.inatividade_minutos??30,
      atividade:()=>req('POST','/api/auth/atividade'),validar:()=>req('GET','/api/auth/eu'),aoEncerrar});
    return u;
  });
  return sessao;
}
export function aplicarContexto(ctx) {
  document.documentElement.dataset.usuario=ctx.usuario.id;
  if(ctx.organizacao){
    for(const [cls,key] of [['logo-l','logo_claro'],['logo-d','logo_escuro']]){
      document.querySelectorAll('img.'+cls).forEach(img=>{img.src=ctx.organizacao[key];img.alt=ctx.organizacao.nome;});
    }
    if(location.pathname==='/'){
      const titulo=document.querySelector('h1');if(titulo)titulo.textContent=ctx.organizacao.titulo;
    }
  }
  document.documentElement.dataset.papel=ctx.perfil;
  document.documentElement.dataset.alterarRh=String(!!ctx.capacidades.alterar_rh);
  document.documentElement.dataset.metas=String(!!ctx.capacidades.manter_metas);
  document.documentElement.dataset.gestao=String(!!ctx.capacidades.gerir_demandas);
  window.dispatchEvent(new CustomEvent('qp-contexto',{detail:ctx}));
}
export function abrirEventos(revisao,aoMudar) {
  const es=new EventSource('/api/acesso/eventos?desde='+encodeURIComponent(revisao));
  let pendente=false,novamente=false;
  const atualizar=async()=>{
    if(pendente) {novamente=true;return;}
    pendente=true;
    try {do {novamente=false;await aoMudar();}while(novamente);}catch(e){if(e.code!=='revoked') {console.error(e);setTimeout(()=>{if(!sessaoEncerrada())atualizar();},2000);}}
    finally {pendente=false;}
  };
  es.addEventListener('invalidar',atualizar);
  es.addEventListener('open',atualizar);
  es.addEventListener('sessao',async()=>{
    es.close();
    try {
      // A troca de senha pode ter emitido um novo cookie para esta mesma aba.
      await req('GET','/api/auth/eu');
      location.reload();
    }catch{encerrarTela('expirada',true);}
  });
  return es;
}
