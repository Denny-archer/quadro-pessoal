# Perfil RH e implantação

## Permissões

| Ação | Admin | RH | Gestor | Colaborador |
|---|---|---|---|---|
| Consulta do Quadro, presença, remuneração, folha e exportações | Todos | Todos | Próprios dados e equipe autorizada | Próprios dados |
| Criar, alterar e excluir ocorrências | Sim | Sim | Não | Não |
| Ajustar abonos e períodos aquisitivos | Sim | Sim | Não | Não |
| Criar, alterar e inativar funcionários | Sim | Não | Não | Não |
| Usuários, organização, configurações e importações | Sim | Não | Não | Não |
| Gerenciar Demandas | Todos | Setores atribuídos | Setores atribuídos | Não |
| Manter metas e modelos | Sim | Não | Não | Não |

Em Administração, selecione RH no perfil e atribua os setores que essa conta gerenciará
no Painel de Demandas. Sem setores, ela consulta somente suas demandas pessoais, além
das metas e modelos compartilhados. Trocar entre RH e Gestor conserva as atribuições;
trocar para Colaborador ou Admin as remove. Novas contas têm Colaborador como padrão.

Na ficha do funcionário, **Ajustar saldos e períodos** permite corrigir as referências
de abonos e o controle dos períodos aquisitivos, sem editar cadastro ou remuneração.
A ausência ou as férias continuam sendo registradas em **Lançamentos**.
O botão Salvar ajustes conserva os dados digitados quando há erro ou conflito; em conflito,
reabra a ficha atualizada e confira os valores antes de reaplicar o ajuste.

## Contrato e manutenção

- `Contexto.funcionario_sql()` controla consultas do RH; `responsavel_sql()` controla
  responsáveis no Painel de Demandas. O alcance global de RH não amplia a gestão de Demandas.
- `lancar_rh` autoriza admin e RH; `alterar_rh` e `administrar_acessos` autorizam somente admin.
- `PUT /api/dados/funcionarios/{id}/saldos` aceita `revisao` (valor de `atualizadoEm` recebido na ficha)
  e pelo menos um dos campos `abonos` ou `periodosAquisitivos`. Campos desconhecidos são recusados.
  Cada campo informado substitui seu objeto/lista; campos omitidos e demais colunas são preservados.
- A gravação trava a linha, compara a revisão e responde 409 se outro ajuste já ocorreu.
  Auditoria usa a ação existente `alterar`, com antes/depois somente dos campos ajustados.
- O formulário de férias grava um período calculado pelo endpoint de saldos e depois grava
  a ocorrência. São duas operações: se a segunda falhar, o período fica salvo e a mensagem
  identifica que o lançamento ainda não foi concluído. O formulário permanece disponível.
- A invalidação usa `dominio='rh'` para alterações globais do Quadro e
  `dominio='demandas'` para destinatários autorizados de Demandas. SSE transmite apenas revisões.
  Alterações de papel, vínculo ou setores reavaliam a tela e descartam formulários incompatíveis.
- A página `/administracao` e suas APIs exigem admin no servidor.
- Falhas de carregamento exibem mensagem e ação Tentar novamente.

## Migração e publicação no servidor

O arquivo `db/migrations/002_perfil_rh.py` foi preservado byte a byte. Não altere a migração
nem seu checksum se ela já tiver sido aplicada. Na inicialização, a aplicação aplica as
migrações pendentes e reconhece as que já foram executadas. Não é necessário recriar banco,
reimportar dados ou mudar o `.env` para habilitar RH.

Depois de revisar e versionar **todos** os arquivos desta entrega, disponibilize essa revisão
no checkout do servidor. Preserve o `.env` existente. No servidor Linux, na pasta do RH:

```sh
set -eu
umask 077
mkdir -p backups
arquivo="backups/antes-perfil-rh-$(date +%Y%m%d-%H%M%S).dump"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$arquivo"
test -s "$arquivo"
docker compose exec -T db pg_restore --list < "$arquivo" > /dev/null
docker compose config --quiet
docker compose up -d --build --no-deps app
docker compose ps app
docker compose logs --tail=80 app
```

O dump inclui todas as tabelas e o schema de Demandas. Guarde também uma cópia protegida
da configuração e a identificação da revisão implantada. O backup acima não altera o banco.

Após a publicação, confirme `/saude`, entre com cada perfil e confira o contexto, o quadro,
uma consulta de remuneração e as restrições de cadastro. Um admin atribui os perfis RH reais;
os testes não criam nem modificam contas reais. Não execute scripts de homologação no banco da empresa.

Uma reversão deve usar uma versão **compatível com `rh`** e com o checksum da migração 002.
A versão que continha a classe `Contexto` duplicada não serve como retorno funcional.
Conserve as contas, os saldos, as auditorias e as migrações; não apague volumes nem restaure
um dump por cima do banco como parte de uma simples reversão de aplicação.

## Reproduzir os testes

Na raiz do projeto, com Docker disponível:

```sh
docker compose -p rh-perfil-validacao -f compose.validacao.yml run --build --rm testes
docker compose -p rh-perfil-validacao -f compose.validacao.yml run --rm testes python tests/integracao/preparar_demandas.py
docker compose -p rh-perfil-validacao -f compose.validacao.yml up -d web
docker compose -p rh-perfil-validacao -f compose.validacao.yml run --rm testes python tests/integracao/verificar_eventos.py
docker compose -p rh-perfil-validacao -f compose.validacao.yml run --rm testes python tests/integracao/verificar_perfil_rh.py
```

Esse projeto Compose usa banco descartável em memória e porta local 18043.
`preparar_demandas.py` aceita somente `rh_demandas_test` e substitui seus dados sintéticos.

Na pasta `frontend`, execute `npm test`. O teste `node tests/browser/perfil-rh.cjs` requer
Playwright disponível no ambiente Node (validado com 1.62.1). Use `BROWSER_EXECUTABLE` para
informar um Chrome/Chromium instalado, se necessário. As capturas vão para a pasta temporária,
ou para `BROWSER_OUTPUT` quando definido. Execute novamente a preparação sintética antes
de repetir o teste de navegador, pois ele inclui cadastros e alterações de permissões.

Para integração com o código do ponto, use as instruções de
[testes descartáveis](../../backend/tests/integracao/README.md). Ao terminar:

```sh
docker compose -p rh-perfil-validacao -f compose.validacao.yml down
```
