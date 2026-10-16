# RH e Painel de Demandas — contrato integrado

Implementação de 15/10/2026. Aplicação 1.4.0, PostgreSQL 16, FastAPI e JavaScript sem framework.

## Identidade e autorização

Uma sessão `qp_sessao` e `/api/auth/*` atendem aos dois módulos. Alterações continuam exigindo `X-Requested-With: quadro-pessoal`. Senhas provisórias não liberam dados antes da troca. Login, logout, troca de senha, versão e inatividade preservam os controles anteriores.

`GET /api/acesso/contexto` devolve `usuario`, `perfil`, `funcionario_id`, `setores_geridos`, `capacidades`, `revisao_acesso` e configuração `organizacao`. Listas vazias nunca significam alcance global. O contexto é resolvido no banco em cada operação.

| Perfil | RH | Demandas | Metas/modelos |
|---|---|---|---|
| colaborador | próprios dados | próprias, consulta | consulta |
| gestor | próprios + setores concedidos | gerencia setores concedidos, consulta as próprias | consulta |
| admin | administração completa | administração completa | administração completa |

`usuario_funcionario` pertence ao núcleo, com unicidade nas duas pontas. Gestão em `gestores_setores` não depende de cargo e admite vários setores. Lotação atual define o alcance do RH; a demanda mantém setor próprio. Contas sem vínculo não recebem dados pessoais automaticamente. Funcionários inativados conservam histórico; suas contas não administrativas são desativadas.

## Organização e migração

Evoluem-se `setores_aux` e `cargos_aux`, preservando nomes e IDs. Funcionários recebem `setor_id`/`cargo_id`; `funcionario_lotacoes` registra mudanças conhecidas. Nomes exatamente iguais são associados somente quando existe um único candidato. Duplicidades ficam para conferência na Administração. Não se infere histórico anterior à migração.

Leitores/editores antigos tornam-se colaboradores e suas sessões antigas são invalidadas; administradores permanecem administradores. A revisão administrativa de perfis, e-mails, vínculos e setores é obrigatória antes da liberação.

`core/migracoes.py` aplica arquivos Python numerados em `db/migrations`, com checksum e o lock transacional compartilhado da inicialização. Cada comando SQL é enviado completo; não se divide SQL de migrações por `;`. O schema legado continua como bootstrap de compatibilidade. Não editar uma migração já aplicada: criar a próxima.

## API do painel

- Página `/demandas/`; assets `/demandas/scripts/` e `/demandas/styles/`.
- `GET /api/demandas/estado`: contexto e coleções autorizadas em snapshot consistente.
- `GET /api/demandas/{colecao}/{id}`: detalhe autorizado; coleções `demandas`, `metas`, `modelos`.
- `PUT` e `PATCH` no mesmo recurso: `{ "versao": 0, "dados": { ... } }`; versão zero cria, versão atual altera. `PATCH` mescla campos aninhados.
- `DELETE` no recurso exige `?versao=N` e faz exclusão lógica.
- `401` encerra sessão; `403` proíbe a ação; `409` preserva o rascunho para revisão. Sucesso devolve o documento com a nova versão.
- Identificadores de responsáveis são de funcionários; autoria é de usuário. A atribuição exige funcionário do setor. Somente admin transfere setor; mudar lotação não transfere demandas.
- Checklist, versão do documento, auditoria e revisão do destinatário são gravados na mesma transação. Modelos são copiados na criação; mudanças posteriores não alteram processos existentes.

Todos os campos 5W2H e seus cronogramas são preservados. O módulo começa vazio. A pasta de referência `Painel de Demandas` permanece preservada; seu `db/init.sql` não é uma migração executável.

## Eventos e interface

`GET /api/acesso/eventos?desde=N` usa SSE e cursor por usuário. Revisões são incrementadas sob locks em ordem fixa na transação da alteração: confirmação e cursor não dependem de `max(id)` de uma sequência. O evento contém apenas a revisão; o cliente reconcilia o snapshot autorizado, inclusive ao reconectar.

Um observador por processo consulta revisões a cada segundo. Consultas síncronas usam threads, com conexões curtas. O stream revalida a sessão a cada ciclo e não conta como atividade. Revogações invalidam o usuário afetado; transferências invalidam os alcances antigo e novo. O navegador limpa dados perdidos, invalida respostas antigas e preserva formulários em atualizações comuns.

Código compartilhado em `frontend/scripts/shared/`; o adaptador de coleções do RH não é inicializado no painel. Preferências têm namespace por usuário/módulo; não contêm registros pessoais. `/administracao` reúne contas, vínculos, setores, cargos e conferência de lotação.

## Limites

Instalação dedicada ao COFFITO. Nome, sigla, título, logos e fuso são configuráveis. Uma instalação futura em outro órgão requer revisão das rubricas, remuneração e referências de SEI; não há administração de múltiplos órgãos na mesma aplicação.

Folha e recibos estimados existentes conservam sua identificação. Este módulo não importa folha efetivamente paga nem cria documentos oficiais. Exportação JSON da CLI cobre somente as coleções legadas e não substitui o dump completo.
