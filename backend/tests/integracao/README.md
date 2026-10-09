# Testes descartáveis de integração

O Compose usa nome próprio `coffito-organizacao-teste`, banco tmpfs e porta 18002. Não reutiliza volumes
de produção. Configure `PONTO_API_DIR` como caminho absoluto da pasta `sistema-ponto/api`.

```powershell
$env:PONTO_API_DIR = 'C:/Users/denilson.jose/Desktop/PONTO-PRODUÇÂO/sistema-ponto/api'
docker compose -f backend/tests/integracao/compose.yml up -d --build --wait db rh
docker compose -f backend/tests/integracao/compose.yml build testes
docker compose -f backend/tests/integracao/compose.yml run --rm testes
docker compose -f backend/tests/integracao/compose.yml exec -T db psql -U teste -d postgres -c 'CREATE DATABASE ponto_integracao_test'
docker compose -f backend/tests/integracao/compose.yml run --rm testes python /testes/verificar_integracao.py
docker compose -f backend/tests/integracao/compose.yml run --rm -e TEST_PG_URL= -w /ponto testes python -m unittest discover -s tests -p test_integracao_rh.py -v
docker compose -f backend/tests/integracao/compose.yml down
```

`verificar_integracao.py` recusa bancos com nomes diferentes de `rh_test` e `ponto_integracao_test`, e hosts fora de `db`, `localhost` e `127.0.0.1`.
Ele limpa **rh_test**, cria/remove schema exclusivo em **ponto_integracao_test**, gera dados sintéticos e
testa HTTP real. Não apontar para bancos reais. A suite de API também exige RH_TEST_DB=1 e nome *_test.

Para testes unitários comuns, `python -m pytest backend/tests` usa requirements-dev; a suite de API é pulada
sem a opção explícita do banco descartável. A suite do ponto depende das bibliotecas do seu pyproject e pypdf
(somente para os testes de relatório). Os testes PostgreSQL existentes exigem conexão localhost e banco *_test.

## Execução nativa alternativa

Use uma instância PostgreSQL separada, limitada a localhost, e crie nela `rh_test` e `ponto_integracao_test`.
Nunca use o banco do servidor de desenvolvimento ou da aplicação atual. Configure `DATABASE_URL`,
`JWT_SECRET`, `COOKIE_SEGURO=false` e `RH_TEST_DB=1`, execute a suite do RH e inicie `app.main:app`
pela pasta `backend` na porta 18002. O fluxo de integração também exige as dependências do ponto
listadas no Dockerfile de testes, em ambiente virtual próprio.

```powershell
$env:PONTO_API_DIR = 'C:/caminho/sistema-ponto/api'
$env:TEST_PG_URL = 'postgresql+psycopg2://teste@127.0.0.1:15432/ponto_integracao_test'
$env:DATABASE_URL = 'postgresql://teste@127.0.0.1:15432/rh_test'
$env:RH_TEST_URL = 'http://127.0.0.1:18002'
$env:PYTHONDONTWRITEBYTECODE = '1'
python backend/tests/integracao/verificar_integracao.py
```

O script lê o código e a migração do ponto; não altera seus arquivos. Depois da validação, pare a API
e a instância descartável. Dados e credenciais de teste devem permanecer fora do Git.
