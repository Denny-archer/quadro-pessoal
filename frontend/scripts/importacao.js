(async () => {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;"
  })[c]);
  const tit = {
    funcionarios: "1. Funcionários (cadastro)",
    lancamentos: "2. Lançamentos"
  };
  const regras = {
    funcionarios: "Identificação pela <code>matricula</code>; sem matrícula, pelo nome exato. Se existir, atualiza só as colunas preenchidas; se não existir, cria (exige nome e vínculo). Estagiário e aprendiz exigem início e término do contrato.",
    lancamentos: "Uma linha por ocorrência. O funcionário é localizado pela matrícula ou pelo nome. Linhas iguais a lançamentos existentes (mesmo funcionário, tipo, início e término) são ignoradas. Atestado <code>matutino</code>/<code>vespertino</code> conta como meio período; <code>comparecimento</code> não conta dia de afastamento. Banco de horas exige <code>horas</code> (+ crédito, − débito)."
  };
  let h = "";
  for (const t of ["funcionarios", "lancamentos"]) {
    const r = await fetch(`/api/importacao/estrutura/${t}`, {
      credentials: "same-origin"
    });
    if (r.status === 401) {
      location.href = "/login?volta=/importacao.html";
      return;
    }
    const cols = await r.json();
    h += `<h2>${tit[t]}</h2><p>${regras[t]} Modelos: <a href="/api/importacao/modelos/${t}.xlsx">Excel</a> · <a href="/api/importacao/modelos/${t}.csv">CSV</a></p>
      <div class="scroll"><table><thead><tr><th>Coluna</th><th>Obrig.</th><th>Formato / valores</th><th>Exemplo</th><th>Também aceita</th></tr></thead><tbody>
      ${cols.map(c => `<tr><td><code>${esc(c.coluna)}</code></td><td>${c.obrigatoria ? '<span class="ob">sim</span>' : ""}</td><td>${esc(c.descricao)}</td><td>${esc(c.exemplo)}</td><td>${c.aceita_tambem.map(a => `<code>${esc(a)}</code>`).join(", ")}</td></tr>`).join("")}
      </tbody></table></div>`;
  }
  document.getElementById("conteudo").innerHTML = h;
})();
