import { req } from './http.js';

const $ = s => document.querySelector(s);
const perfis = { colaborador: 'Colaborador', gestor: 'Gestor', admin: 'Administrador' };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normalizar = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
let base;
let dialogo;
let contaSenha;
let gerandoSenha = false;

function dadosConta(card) {
  const f = card.querySelector('form');
  const papel = f.elements.papel.value;
  return {
    papel,
    ativo: f.elements.ativo.checked,
    funcionario_id: f.elements.funcionario_id.value || null,
    setores: papel === 'gestor'
      ? [...f.querySelectorAll('[name="setores"]:checked')].map(x => Number(x.value)).sort((a, b) => a - b)
      : [],
  };
}

function cartao(u) {
  const f = base.funcionarios.find(x => String(x.id) === String(u.funcionario_id));
  const setores = base.setores.filter(s => s.ativo || u.setores.includes(s.id));
  const card = document.createElement('details');
  card.className = 'conta-card';
  card.dataset.conta = u.id;
  card.dataset.perfil = u.papel;
  card.dataset.busca = normalizar([u.nome, u.email, f?.nome].join(' '));
  card.innerHTML = `
    <summary class="conta-resumo">
      <span class="conta-avatar" aria-hidden="true">${esc(u.nome.trim().split(/\s+/).slice(0, 2).map(n => n[0]).join(''))}</span>
      <span class="conta-identidade"><strong>${esc(u.nome)}</strong><span>${esc(u.email)}</span>
        <small>${f ? `Vínculo: ${esc(f.nome)}` : 'Sem funcionário vinculado'}</small></span>
      <span class="conta-indicadores"><span class="conta-tag">${perfis[u.papel] || esc(u.papel)}</span>
        <span class="conta-status ${u.ativo ? 'conta-status-ativa' : ''}">${u.ativo ? 'Ativa' : 'Inativa'}</span>
        ${u.papel === 'gestor' ? `<small>${u.setores.length} setor(es) gerido(s)</small>` : ''}
        <small class="conta-pendente" hidden>Alterações pendentes</small></span>
      <span class="conta-editar" aria-hidden="true">Editar <span class="conta-chevron">⌄</span></span>
    </summary>
    <form class="conta-editor" aria-label="Editar conta de ${esc(u.nome)}">
      <div class="conta-campos">
        <label>Perfil de acesso<select name="papel">${Object.entries(perfis).map(([v, n]) => `<option value="${v}" ${v === u.papel ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label>Funcionário vinculado<select name="funcionario_id"><option value="">Sem vínculo</option>${base.funcionarios.map(x => `<option value="${esc(x.id)}" ${String(x.id) === String(u.funcionario_id) ? 'selected' : ''}>${esc(x.nome)}${x.situacao === 'inativo' ? ' (inativo)' : ''}</option>`).join('')}</select></label>
        <label class="conta-ativo"><input name="ativo" type="checkbox" ${u.ativo ? 'checked' : ''}><span>Conta ativa<small>Permite entrar no sistema</small></span></label>
      </div>
      <p class="contas-ajuda" data-perfil-ajuda></p>
      <fieldset class="conta-setores" ${u.papel !== 'gestor' ? 'hidden' : ''}>
        <legend>Setores sob gestão</legend>
        <div class="conta-setores-topo"><p class="contas-ajuda">Marque os setores que este gestor pode acompanhar.</p><span class="conta-tag" data-setores-total></span></div>
        <label class="conta-buscar-setor">Buscar setor<input type="search" data-buscar-setor placeholder="Digite o nome do setor" autocomplete="off"></label>
        <div class="conta-setores-lista">${setores.map(s => `<label class="conta-setor" data-setor-nome="${esc(normalizar(s.setor))}"><input type="checkbox" name="setores" value="${s.id}" ${u.setores.includes(s.id) ? 'checked' : ''}><span>${esc(s.setor)}${s.ativo ? '' : ' (inativo)'}</span></label>`).join('')}</div>
        <p class="contas-ajuda" data-setores-vazio ${setores.length ? 'hidden' : ''}>Nenhum setor encontrado.</p>
      </fieldset>
      <p class="conta-feedback" role="status"></p>
      <footer class="conta-acoes"><button type="button" class="btn" data-senha>Redefinir senha</button>
        <div><button type="button" class="btn" data-cancelar>Cancelar</button><button type="submit" class="btn primary" data-salvar-conta disabled>Salvar alterações</button></div>
      </footer>
    </form>`;
  card.dataset.original = JSON.stringify(dadosConta(card));
  atualizarEdicao(card);
  return card;
}

function atualizarEdicao(card) {
  const dados = dadosConta(card);
  const alterada = JSON.stringify(dados) !== card.dataset.original;
  card.dataset.alterada = String(alterada);
  card.querySelector('[data-salvar-conta]').disabled = !alterada;
  card.querySelector('.conta-pendente').hidden = !alterada;
  card.querySelector('.conta-setores').hidden = dados.papel !== 'gestor';
  card.querySelector('[data-setores-total]').textContent = `${dados.setores.length} selecionado(s)`;
  const textos = {
    admin: 'Administrador: administra o Quadro de Pessoal e as Demandas de todos os setores.',
    gestor: 'Gestor: consulta os dados da equipe e gerencia demandas dos setores selecionados.',
    colaborador: 'Colaborador: consulta os próprios dados e as demandas atribuídas a ele.',
  };
  card.querySelector('[data-perfil-ajuda]').textContent = textos[dados.papel] +
    (dados.papel !== 'gestor' && JSON.parse(card.dataset.original).setores.length ? ' Ao salvar, os setores de gestão anteriores serão removidos.' : '');
}

function filtrar() {
  const busca = normalizar($('#buscar-conta').value.trim());
  const perfil = $('#filtrar-perfil').value;
  const cards = [...$('#contas').children];
  let visiveis = 0;
  cards.forEach(card => {
    card.hidden = !card.dataset.busca.includes(busca) || Boolean(perfil && card.dataset.perfil !== perfil);
    if (!card.hidden) visiveis++;
  });
  $('#contas-contagem').textContent = `${visiveis} de ${cards.length} conta(s)`;
  $('#contas-vazio').hidden = visiveis > 0;
}

export function renderizarContas(dados) {
  base = dados;
  const atuais = new Map([...$('#contas').children].map(c => [c.dataset.conta, c]));
  // Atualizações de outros cadastros não descartam edições em andamento.
  $('#contas').replaceChildren(...base.usuarios.map(u => {
    const atual = atuais.get(String(u.id));
    if (atual?.dataset.alterada === 'true' || atual?.dataset.salvando === 'true') return atual;
    const novo = cartao(u);
    novo.open = atual?.open || false;
    return novo;
  }));
  $('#contas-total').textContent = `${base.usuarios.length} conta(s)`;
  filtrar();
}

$('#buscar-conta').addEventListener('input', filtrar);
$('#filtrar-perfil').addEventListener('change', filtrar);
$('#contas').addEventListener('input', e => {
  const card = e.target.closest('[data-conta]');
  if (!card) return;
  if (e.target.matches('[data-buscar-setor]')) {
    const busca = normalizar(e.target.value.trim());
    const linhas = [...card.querySelectorAll('[data-setor-nome]')];
    linhas.forEach(l => { l.hidden = !l.dataset.setorNome.includes(busca); });
    card.querySelector('[data-setores-vazio]').hidden = linhas.some(l => !l.hidden);
  } else {
    atualizarEdicao(card);
    card.querySelector('.conta-feedback').textContent = '';
  }
});

$('#contas').addEventListener('submit', async e => {
  e.preventDefault();
  const card = e.target.closest('[data-conta]');
  if (!card || card.dataset.salvando === 'true') return;
  const dados = dadosConta(card);
  const feedback = card.querySelector('.conta-feedback');
  const campos = [...card.querySelectorAll('input,select,button')];
  card.dataset.salvando = 'true';
  campos.forEach(c => { c.disabled = true; });
  feedback.textContent = 'Salvando alterações…';
  feedback.classList.remove('conta-erro');
  let perfilSalvo = false;
  try {
    await req('PATCH', '/api/usuarios/' + card.dataset.conta, { papel: dados.papel, ativo: dados.ativo });
    perfilSalvo = true;
    const salvo = base.usuarios.find(u => String(u.id) === card.dataset.conta);
    Object.assign(salvo, { papel: dados.papel, ativo: dados.ativo });
    if (dados.papel !== 'gestor') salvo.setores = [];
    await req('PUT', `/api/acesso/usuarios/${card.dataset.conta}/vinculo`, { funcionario_id: dados.funcionario_id, setores: dados.setores });
    const u = base.usuarios.find(u => String(u.id) === card.dataset.conta);
    Object.assign(u, dados);
    const novo = cartao(u);
    novo.open = true;
    novo.querySelector('.conta-feedback').textContent = 'Alterações salvas.';
    card.replaceWith(novo);
    novo.querySelector('[data-cancelar]').focus();
    filtrar();
  } catch (erro) {
    feedback.textContent = (perfilSalvo ? 'Perfil e acesso salvos; o vínculo não foi salvo. Revise e tente novamente. ' : '') + (erro.mensagem || erro.message);
    feedback.classList.add('conta-erro');
  } finally {
    card.dataset.salvando = 'false';
    campos.forEach(c => { c.disabled = false; });
    atualizarEdicao(card);
  }
});

$('#contas').addEventListener('click', e => {
  const card = e.target.closest('[data-conta]');
  if (!card) return;
  const u = base.usuarios.find(u => String(u.id) === card.dataset.conta);
  if (e.target.closest('[data-cancelar]')) {
    const novo = cartao(u);
    card.replaceWith(novo);
    novo.querySelector('summary').focus();
  }
  if (e.target.closest('[data-senha]')) abrirSenha(u);
});

function abrirSenha(u) {
  if (!dialogo) {
    dialogo = document.createElement('dialog');
    dialogo.className = 'conta-dialogo';
    dialogo.setAttribute('aria-labelledby', 'senha-titulo');
    dialogo.innerHTML = `<header><div><span class="contas-eyebrow">Segurança da conta</span><h2 id="senha-titulo">Redefinir senha</h2></div><button class="btn" type="button" data-fechar aria-label="Fechar">×</button></header>
      <p class="conta-senha-identidade"></p>
      <p data-senha-aviso>A senha atual será substituída por uma senha provisória. As sessões abertas serão encerradas e a pessoa deverá escolher uma nova senha no próximo acesso.</p>
      <div data-senha-resultado hidden><label for="senha-gerada">Senha provisória<input id="senha-gerada" readonly autocomplete="off" spellcheck="false"></label><p>Copie e entregue à pessoa por um canal seguro. Esta senha não será exibida novamente após fechar.</p></div>
      <p class="conta-feedback" role="status"></p><footer><button type="button" class="btn" data-fechar>Cancelar</button><button type="button" class="btn primary" data-gerar>Gerar senha provisória</button></footer>`;
    document.body.append(dialogo);
    dialogo.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', () => dialogo.close()));
    dialogo.addEventListener('cancel', e => { if (gerandoSenha) e.preventDefault(); });
    dialogo.addEventListener('close', () => { dialogo.querySelector('#senha-gerada').value = ''; contaSenha = null; });
    dialogo.querySelector('[data-gerar]').addEventListener('click', gerarSenha);
  }
  contaSenha = u;
  dialogo.querySelector('.conta-senha-identidade').textContent = `${u.nome} · ${u.email}`;
  dialogo.querySelector('[data-senha-resultado]').hidden = true;
  dialogo.querySelector('[data-senha-aviso]').hidden = false;
  dialogo.querySelector('[data-gerar]').hidden = false;
  dialogo.querySelector('footer [data-fechar]').textContent = 'Cancelar';
  dialogo.querySelector('.conta-feedback').textContent = '';
  dialogo.querySelector('#senha-gerada').value = '';
  dialogo.showModal();
  dialogo.querySelector('footer [data-fechar]').focus();
}

async function gerarSenha() {
  if (gerandoSenha || !contaSenha) return;
  const usuario = contaSenha;
  gerandoSenha = true;
  const feedback = dialogo.querySelector('.conta-feedback');
  dialogo.querySelectorAll('button').forEach(b => { b.disabled = true; });
  feedback.textContent = 'Gerando senha provisória…';
  try {
    const senha = Array.from(crypto.getRandomValues(new Uint8Array(18)), n => n.toString(16).padStart(2, '0')).join('');
    await req('PATCH', '/api/usuarios/' + usuario.id, { nova_senha: senha });
    if (!contaSenha) return;
    dialogo.querySelector('#senha-gerada').value = senha;
    dialogo.querySelector('[data-senha-resultado]').hidden = false;
    dialogo.querySelector('[data-senha-aviso]').hidden = true;
    dialogo.querySelector('[data-gerar]').hidden = true;
    dialogo.querySelector('footer [data-fechar]').textContent = 'Concluir';
    feedback.textContent = 'Senha redefinida.';
    dialogo.querySelector('#senha-gerada').focus();
    dialogo.querySelector('#senha-gerada').select();
  } catch (erro) {
    feedback.textContent = erro.mensagem || erro.message;
  } finally {
    gerandoSenha = false;
    dialogo?.querySelectorAll('button').forEach(b => { b.disabled = false; });
  }
}

export function limparContas() {
  base = null;
  contaSenha = null;
  if (dialogo) { dialogo.close(); dialogo.remove(); dialogo = null; }
}
