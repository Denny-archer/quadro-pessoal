# Desenvolvimento

## Preparação no Windows

Use Python 3.12. Na raiz do projeto:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements-dev.txt
$env:DATABASE_URL = 'postgresql://usuario:senha@localhost:5432/quadro'
$env:JWT_SECRET = 'gere-um-segredo-local-com-pelo-menos-32-caracteres'
$env:COOKIE_SEGURO = 'false'
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

O backend lê variáveis de ambiente. O `.env` da raiz é carregado pelo Docker Compose; na execução Python nativa, configure as variáveis no terminal. Não use credenciais reais em exemplos versionados.

No Linux, ative `.venv/bin/activate` e use `export` para as mesmas variáveis.

O frontend é servido por essa API. Edite HTML em `frontend/`, estilos em `frontend/styles/` e módulos em `frontend/scripts/`. Não é necessário `npm run dev`, build ou instalação de dependências para abrir o painel.

## CLI

Na pasta `backend`, use `python -m app.cli schema`, `criar-admin`, `carregar-json` ou `exportar-json`. No Docker, os mesmos comandos são executados com `docker compose exec app ...`.

## Testes

Na raiz:

```powershell
python -m pytest
node --test frontend/tests/*.test.js
```

Ou, para os testes de JavaScript, entre em `frontend` e execute `npm test`. O Node é usado apenas pelos testes; não existem dependências npm de execução.

Os testes HTTP exigem PostgreSQL descartável e ficam desabilitados sem `RH_TEST_DB=1` e banco terminado em `_test`. O [guia de integração](../backend/tests/integracao/README.md) cria o ambiente isolado na porta 18002 e usa somente dados sintéticos.

## Alterações frequentes

- Tela: procure o módulo correspondente em `scripts/features` e a folha em `styles/features`.
- Cálculo: preserve as regras e adicione um cenário de regressão antes de mudar resultados.
- Endpoint: altere a rota em `backend/app/api`; mantenha persistência e funções compartilhadas nos serviços.
- Planilha: a definição oficial fica em `backend/app/importacao/modelos.py`; mantenha os arquivos em `docs/importacao/modelos` coerentes.
- Caminhos: use `backend/app/core/paths.py`, evitando caminhos absolutos de computadores dos desenvolvedores.

Antes de preparar um commit, confira `git status --short` e `git diff --check`. Não adicione `seed`, `.env`, dumps ou exportações.
