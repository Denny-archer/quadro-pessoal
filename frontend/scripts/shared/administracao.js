import { renderizarContas, limparContas } from './contas-administracao.js';
import {
  req,
  iniciarSessao,
  aplicarContexto,
  abrirEventos,
} from './http.js';

const $ = s => document.querySelector(s);

const esc = v =>
  String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));

let base;

function opcoes(rows, valor, nome = 'nome', vazio = true) {
  return (
    (vazio ? '<option value="">Sem vínculo</option>' : '') +
    rows.map(x => `
      <option
        value="${esc(x.id)}"
        ${String(valor) === String(x.id) ? 'selected' : ''}
      >
        ${esc(x[nome])}${x.ativo === false ? ' (inativo)' : ''}
      </option>
    `).join('')
  );
}

const aviso = e => {
  $('#mensagem').textContent = e.mensagem || e.message;
};

async function carregar() {
  const ctx = await req('GET', '/api/acesso/contexto');

  aplicarContexto(ctx);

  if (!ctx.capacidades.administrar_acessos) {
    $('main').replaceChildren(
      Object.assign(document.createElement('p'), {
        textContent: 'Esta área é exclusiva da administração.',
      })
    );

    return;
  }

  base = await req('GET', '/api/acesso/administracao');

  $('#novo-funcionario').innerHTML = opcoes(
    base.funcionarios.filter(f => f.situacao !== 'inativo'),
    null
  );

  renderizarContas(base);

  $('#organizacao').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Tipo</th>
          <th>Nome</th>
          <th>Sigla</th>
          <th>Ativo</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${['setores', 'cargos'].flatMap(tipo =>
          base[tipo].map(x => `
            <tr data-tipo="${tipo}" data-id="${x.id}">
              <td>${tipo}</td>
              <td>
                <input
                  name="nome"
                  aria-label="Nome de ${esc(x.setor || x.cargo)}"
                  value="${esc(x.setor || x.cargo)}"
                >
              </td>
              <td>
                ${tipo === 'setores' ? `
                  <input
                    name="codigo"
                    aria-label="Sigla"
                    value="${esc(x.codigo)}"
                  >
                ` : ''}
              </td>
              <td>
                <input
                  type="checkbox"
                  name="ativo"
                  aria-label="Ativo"
                  ${x.ativo ? 'checked' : ''}
                >
              </td>
              <td>
                <button class="btn" data-salvar-organizacao>
                  Salvar
                </button>
              </td>
            </tr>
          `)
        ).join('')}
      </tbody>
    </table>
  `;

  $('#funcionarios').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Funcionário</th>
          <th>Texto atual</th>
          <th>Setor</th>
          <th>Cargo</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${base.funcionarios.map(f => `
          <tr data-funcionario="${esc(f.id)}">
            <td>
              ${esc(f.nome)}<br>
              ${esc(f.matricula)}
            </td>
            <td>${esc(f.setor)} / ${esc(f.cargo)}</td>
            <td>
              <select name="setor_id">
                ${opcoes(base.setores, f.setor_id, 'setor')}
              </select>
            </td>
            <td>
              <select name="cargo_id">
                ${opcoes(base.cargos, f.cargo_id, 'cargo')}
              </select>
            </td>
            <td>
              <button class="btn" data-salvar-funcionario>
                Salvar
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

document.addEventListener('click', async e => {
  const b = e.target.closest('button');

  if (!b) return;

  const row = b.closest('tr');

  if (!row) return;

  b.disabled = true;
  $('#mensagem').textContent = '';

  try {
    if (b.hasAttribute('data-salvar-organizacao')) {
      await req(
        'PUT',
        `/api/acesso/organizacao/${row.dataset.tipo}/${row.dataset.id}`,
        {
          nome: row.querySelector('[name=nome]').value,
          codigo: row.querySelector('[name=codigo]')?.value || null,
          ativo: row.querySelector('[name=ativo]').checked,
        }
      );
    } else if (b.hasAttribute('data-salvar-funcionario')) {
      const id = n =>
        Number(row.querySelector(`[name=${n}]`).value) || null;

      await req(
        'PUT',
        `/api/acesso/funcionarios/${encodeURIComponent(row.dataset.funcionario)}/organizacao`,
        {
          setor_id: id('setor_id'),
          cargo_id: id('cargo_id'),
        }
      );
    }

    $('#mensagem').textContent = 'Alteração salva.';

    await carregar();
  } catch (e) {
    aviso(e);
  } finally {
    b.disabled = false;
  }
});

$('#novo-cadastro').addEventListener('submit', async e => {
  e.preventDefault();

  const f = e.currentTarget;

  try {
    await req(
      'PUT',
      `/api/acesso/organizacao/${f.elements.tipo.value}/0`,
      {
        nome: f.elements.nome.value,
        codigo: f.elements.codigo.value || null,
      }
    );

    f.reset();

    await carregar();

    $('#mensagem').textContent = 'Cadastro adicionado.';
  } catch (e) {
    aviso(e);
  }
});

$('#criar-conta').addEventListener('submit', async e => {
  e.preventDefault();

  const f = e.currentTarget;
  const b = f.querySelector('button');

  b.disabled = true;

  try {
    const novo = await req(
      'POST',
      '/api/usuarios',
      {
        nome: f.elements.nome.value,
        email: f.elements.email.value,
        papel: f.elements.papel.value,
      }
    );

    $('#senha-provisoria').textContent =
      'Senha provisória (entrega manual): ' + novo.senha_provisoria;

    if (f.elements.funcionario_id.value) {
      await req(
        'PUT',
        `/api/acesso/usuarios/${novo.id}/vinculo`,
        {
          funcionario_id: f.elements.funcionario_id.value,
          setores: [],
        }
      );
    }

    f.reset();

    await carregar();

    $('#mensagem').textContent =
      'Conta criada. Confira o vínculo e configure os setores quando o perfil for gestor.';
  } catch (e) {
    aviso(e);
  } finally {
    b.disabled = false;
  }
});

try {
  await iniciarSessao(() => {
    limparContas();
    $('main').replaceChildren();
  });

  await carregar();

  const ctx = await req('GET', '/api/acesso/contexto');

  abrirEventos(ctx.revisao_acesso, async () => {
    const atual = await req('GET', '/api/acesso/contexto');

    if (!atual.capacidades.administrar_acessos) {
      base = null;
      limparContas();

      $('main').replaceChildren(
        Object.assign(document.createElement('p'), {
          textContent: 'O acesso à administração foi removido.',
        })
      );
    }
  });
} catch (e) {
  aviso(e);
}
