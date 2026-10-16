import { req } from './http.js';
import { destinoAposLogin } from './sessao.js';
const form=document.getElementById('primeiro'),erro=document.getElementById('erro');
form.addEventListener('submit',async e=>{
  e.preventDefault();erro.textContent='';
  const {atual,nova,confirmacao}=form.elements;
  if(nova.value!==confirmacao.value){erro.textContent='A confirmação deve corresponder à nova senha.';return;}
  const botao=form.querySelector('button');botao.disabled=true;
  try {
    await req('POST','/api/auth/senha',{atual:atual.value,nova:nova.value});
    form.reset();location.replace(destinoAposLogin(new URLSearchParams(location.search).get('volta'),location.origin));
  }catch(e){erro.textContent=e.mensagem||e.message;botao.disabled=false;}
});
