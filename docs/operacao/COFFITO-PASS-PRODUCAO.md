# Coffito Pass — implantação interna e integração com o Ponto

Origem: `172.16.10.28` (desenvolvimento e testes). Destino: `172.16.10.18` (produção). A TI executa os blocos em Bash com Docker Compose v2. Pare no primeiro erro. A implantação não move o banco do Ponto.

## 1. Antes da janela

- RH confirma que a base do Pass no .28 é oficial, inclusive contas, matrículas, demandas, metas, resumos e vínculos recebidos do Ponto. Se houver dados de testes misturados, pare e aprove o tratamento antes da cópia integral.
- TI confirma DNS interno, certificado, porta livre, capacidade do .18, proxy e origem real dos cabeçalhos encaminhados. O exemplo assume proxy no host; se ele estiver em outro contêiner, defina com a TI a rede privada e a origem confiável. Não publique o PostgreSQL do Pass.
- Identifique as revisões homologadas dos dois projetos. Confira nomes e versões com `docker compose ls` e `docker compose ps`. Guarde a configuração anterior, o commit e a imagem em uso do Ponto para reversão; não registre segredos no chamado. No Ponto, confirme que o Compose real usa `api`, `dbpg` e `integracao-rh`.
- Faça backup protegido dos dois bancos e ensaie a restauração em ambiente separado. Na janela, atualize os backups finais. Combine a pausa nas gravações do Pass, a breve recriação da API do Ponto e os responsáveis pela validação do piloto.

## 2. No .28 — cópia final do Pass

No diretório do Pass, defina `PROJETO_DEV` como o nome confirmado do projeto Compose e `DUMP_PASS` como um caminho novo, protegido e fora do Git. Suspenda outros escritores (jobs ou CLI). Pare só o app, mantendo o banco.

```bash
set -euo pipefail
umask 077
: "${PROJETO_DEV:?informe o projeto Compose do .28}"
: "${DUMP_PASS:?informe o caminho novo do dump}"
test ! -e "$DUMP_PASS"
docker compose -p "$PROJETO_DEV" ps app db
docker compose -p "$PROJETO_DEV" stop app
docker compose -p "$PROJETO_DEV" exec -T db sh -ec \
  'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$DUMP_PASS"
test -s "$DUMP_PASS"
docker compose -p "$PROJETO_DEV" exec -T db pg_restore -l < "$DUMP_PASS" > /dev/null
sha256sum "$DUMP_PASS"
```

Transfira o dump pelo canal da TI e confira o SHA-256 no .18. Preserve a cópia original. Se a virada for abortada antes de o .18 aceitar gravações, a TI pode reabrir o Pass no .28. Depois da virada, mantenha o .28 com uma base separada para testes, sem chaves de produção.

## 3. No .18 — restaurar o Pass

No diretório do Pass na revisão aprovada, crie um `.env` privado a partir de [coffito-pass-producao.env.example](coffito-pass-producao.env.example). Aplique `chmod 600` e use senha de banco e chave de sessão novas. Confirme que `coffito-pass-prod` é um projeto novo, a porta é livre e `POSTGRES_DB=quadro` no bootstrap. Defina `DUMP_PASS` com o caminho do dump conferido.

```bash
set -euo pipefail
: "${DUMP_PASS:?informe o caminho do dump conferido}"
test -s "$DUMP_PASS"
docker compose -p coffito-pass-prod config --quiet
docker compose -p coffito-pass-prod up -d --wait db
docker compose -p coffito-pass-prod exec -T db sh -ec \
  'exec createdb -U "$POSTGRES_USER" -T template0 quadro_prod'
docker compose -p coffito-pass-prod exec -T db sh -ec \
  'exec pg_restore --exit-on-error --single-transaction --no-owner --no-acl \
    -U "$POSTGRES_USER" -d quadro_prod' < "$DUMP_PASS"
```

O PostgreSQL cria o schema inicial no banco de bootstrap; por isso o restore usa outro banco, vazio. Se `quadro_prod` já existir ou o restore falhar, pare; não restaure por cima. Depois, altere `POSTGRES_DB=quadro_prod` no `.env`. O app e o backup passam a usar o banco restaurado. O `--no-deps` evita recriar o contêiner de banco já em execução; enquanto ele mantiver as variáveis do bootstrap, use `-d quadro_prod` explicitamente em consultas e dumps manuais.

```bash
docker compose -p coffito-pass-prod config --quiet
docker compose -p coffito-pass-prod up -d --build --wait --no-deps app backup
docker compose -p coffito-pass-prod ps
docker compose -p coffito-pass-prod logs --tail 80 app
# PASS_URL: URL HTTPS interna sem barra final.
curl --fail --silent --show-error "$PASS_URL/saude"
```

Configure DNS e proxy HTTPS. Para `/api/acesso/eventos`, use o [exemplo de proxy e SSE](DEMANDAS.md#proxy-e-sse). Confira certificado, login administrativo, dados e perfis restaurados. Valide o destino e a retenção do backup; mantenha cópia fora do host. Em **Integrações**, revogue no destino as chaves herdadas do .28 e crie uma exclusiva para produção. Mantenha acesso só para administradores.

## 4. No .18 — ativar o Ponto

No diretório do **Ponto**, use sempre o projeto Compose em execução (`PROJETO_PONTO`). Mantenha `RH_INTEGRACAO_ENABLED=false` se a integração ainda não estiver ativa; se já estiver, interrompa o roteiro e confirme o destino atual com a TI. Confirme a base antes do backup:

```bash
set -euo pipefail
: "${PROJETO_PONTO:?informe o projeto Compose do Ponto}"
docker compose -p "$PROJETO_PONTO" ps api dbpg
docker compose -p "$PROJETO_PONTO" exec -T dbpg sh -ec \
  'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT current_database(), current_user,
       to_regclass('public.rh_integracao_dias') AS dias,
       to_regclass('public.rh_outbox') AS fila;
SQL
```

Para o backup final, defina `DUMP_PONTO` como caminho novo e protegido. Não pare a API ou o banco para tirar o dump:

```bash
umask 077
: "${DUMP_PONTO:?informe o caminho novo do dump do Ponto}"
test ! -e "$DUMP_PONTO"
docker compose -p "$PROJETO_PONTO" exec -T dbpg sh -ec \
  'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$DUMP_PONTO"
test -s "$DUMP_PONTO"
docker compose -p "$PROJETO_PONTO" exec -T dbpg pg_restore -l < "$DUMP_PONTO" > /dev/null
sha256sum "$DUMP_PONTO"
```

Se ambas as tabelas estiverem ausentes, aplique a migração aprovada na janela:

```bash
docker compose -p "$PROJETO_PONTO" exec -T dbpg sh -ec \
  'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < api/migrations/002_integracao_rh.sql
```

Se só uma existir, pare e investigue. Se ambas existirem, confira colunas, restrições e índice contra a migração. O SQL é aditivo e não recalcula saldos. Em timeout de lock, reavalie a janela.

No `.env` privado do Ponto, configure `RH_URL` com a URL HTTPS do Pass, `RH_API_KEY` com a nova chave e `RH_RECONCILIACAO_DIAS=7`. Construa previamente as imagens aprovadas e teste HTTPS com a mesma imagem e rede do worker:

```bash
docker compose -p "$PROJETO_PONTO" --profile integracao-rh build api integracao-rh
docker compose -p "$PROJETO_PONTO" --profile integracao-rh run --rm --no-deps \
  --entrypoint uv integracao-rh run -- python -c \
  'import os, urllib.request; u=os.environ["RH_URL"].rstrip("/")+"/saude"; print(urllib.request.urlopen(u, timeout=10).status)'
```

Se a cadeia TLS não for confiável, instale a cadeia aprovada pela TI na imagem e repita o teste. Na janela, defina `RH_INTEGRACAO_ENABLED=true` e recrie só a API e o worker, sem rebuild:

```bash
docker compose -p "$PROJETO_PONTO" --profile integracao-rh up -d \
  --no-build --no-deps --force-recreate api integracao-rh
docker compose -p "$PROJETO_PONTO" --profile integracao-rh ps api integracao-rh
docker compose -p "$PROJETO_PONTO" --profile integracao-rh logs --tail 100 integracao-rh
```

Confira o sinal e a fila de entregas. Compare uma marcação e uma correção autorizadas pelo RH, incluindo saldo, horas oficiais e vínculo por matrícula. Carga além da reconciliação de sete dias só com período aprovado pelo RH. Se a fila não escoar, não libere o piloto.

## 5. Piloto e reversão

- Inative no Pass as contas fora do piloto, revise perfis e setores, retire `ACESSO_SOMENTE_ADMIN` e recrie apenas o app. Valide em outra estação: login, escopo de colaborador e gestor, eventos ao vivo e consulta de ponto. Amplie após aceite de TI e RH.
- **Falha em marcações ou apuração:** pare `integracao-rh`, volte `RH_INTEGRACAO_ENABLED=false` e recrie apenas a API com `--no-build --no-deps --force-recreate`. Se a imagem nova for a causa, restaure a imagem e configuração anteriores registradas pela TI. Confirme uma marcação no Ponto. Preserve as tabelas, versões e a fila.
- **Falha só no Pass:** volte `ACESSO_SOMENTE_ADMIN=true` e recrie apenas o app, ou bloqueie acesso no proxy. Preserve a base do .18. Não redirecione o Ponto de produção para o .28 nem use `docker compose down -v`.

Comandos de reversão da integração, no projeto do Ponto:

```bash
docker compose -p "$PROJETO_PONTO" --profile integracao-rh stop integracao-rh
# Edite o .env do Ponto: RH_INTEGRACAO_ENABLED=false.
# Se necessário, selecione antes a imagem anterior com o Compose aprovado pela TI.
docker compose -p "$PROJETO_PONTO" up -d --no-build --no-deps --force-recreate api
```

Para diagnóstico, compartilhe só a etapa, estado dos serviços e linhas relevantes do log, sem segredos, dumps ou dados pessoais.

## 6. Registro de entrega — 05/11/2026

**Ensaio local aprovado em Docker Desktop, com dados sintéticos.** O script restaurou um dump em PostgreSQL 16 vazio, comparou o conteúdo de 16 tabelas de RH, demandas, acesso e histórico e iniciou a aplicação sobre a base restaurada. O worker do Ponto fez o envio HTTP, recuperou uma falha simulada, repetiu o mesmo resumo sem duplicá-lo e propagou uma correção. A meta restaurada permaneceu disponível. O ensaio removeu apenas sua pilha temporária.

| Item | Referência local validada |
| --- | --- |
| Pass, código de execução | `integracao` · `a13dc00533d02fe2502a4eba39c1d02cae56ee98` |
| Ponto, código do produtor e do worker | `jornada-hidrida` · `bb7fbcfb9a9a2f93e09912cd85dea07bff87ac4d` |

Essas referências são dos checkouts locais, não prova da revisão implantada no .28 ou .18. Se a revisão escolhida for outra, repita o ensaio. Da raiz do Pass, em PowerShell:

```powershell
./backend/tests/integracao/ensaio-implantacao.ps1 -PontoApiDir 'C:/caminho/sistema-ponto/api'
```

**Preencher na janela pela TI:** projeto Compose de cada sistema, revisões/imagens a implantar, DNS, porta e proxy, caminhos de backups, hash do dump transferido, imagem anterior do Ponto, responsáveis e aceite do piloto. Nenhum servidor foi acessado neste ensaio; TLS interno, backup real, dados oficiais, coexistência com os outros serviços e piloto seguem pendentes de verificação no destino.
