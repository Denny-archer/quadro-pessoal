# Arquitetura e convenções

## Backend

`app.main` monta rotas, middleware de segurança e arquivos estáticos. `app.cli` oferece as rotinas administrativas.

O fluxo é **API → contratos e autorização → serviços → PostgreSQL**. Rotas não importam helpers de outras rotas. Os contratos Pydantic ficam em `schemas`; funções de sessão e senha em `core/seguranca`; persistência e auditoria em `services`.

O pool PostgreSQL continua usando pg8000, e a aplicação do schema preserva o lock transacional existente. `core/paths` resolve a raiz pelo local do código e usa a mesma hierarquia no Docker e no checkout.

Na versão 1.3.1, `auth_sessoes` (schema v4) controla revogação individual, prazo absoluto e inatividade. O JWT em cookie HttpOnly precisa corresponder a uma sessão ativa no banco. `core/sessao` coordena atividade explícita e logout entre abas; o polling não renova a sessão. Consulte [Sessões e acesso](SESSOES-E-ACESSO.md).

## Frontend

As páginas usam `<script type="module">`. `scripts/main.js` autentica a sessão, inicializa controles uma vez e assina os dados. Os módulos declaram suas dependências com imports; não há fachada global `window.claude` ou variáveis `window.qp*`.

`core/api` centraliza requisições, sessão, assinaturas e downloads. A sondagem dos dados continua a cada cinco segundos, respeitando a visibilidade da página. A presença do ponto é consultada a cada quinze segundos enquanto o Panorama está ativo.

`core/estado` guarda o estado compartilhado; `core/render` orquestra a tela selecionada. Os módulos de funcionalidades oferecem views, cálculos, formulários e inicializadores. Funções de renderização são declaradas antes da inicialização dos controles para evitar dependência de efeitos na ordem dos imports.

As preferências `qp-tab` e `qp-priv` no localStorage permanecem compatíveis.

## Estilos

`styles/base`, `layout` e `components` definem tema, estrutura e componentes compartilhados. As folhas em `styles/features` complementam as funcionalidades. Login e documentação de planilhas possuem folhas próprias.

`utilities.css` registra os overrides anteriormente definidos por atributos inline, com nomes descritivos e comentários. Novos estilos devem ser escritos em classes adequadas à funcionalidade.

O CSS fixo não é gerado pelo JavaScript. Larguras calculadas de gráficos são transportadas por `data-ui-width` e aplicadas via CSSOM pelo helper `core/estilos-dinamicos`. Ele observa nós inseridos pelo painel, sem criar tags de estilo. Cores e estados usam classes da paleta.

## Integração e dados

O contrato de resumos versionados permanece igual. O schema v4 acrescenta somente o controle de sessões e o evento de logout à auditoria. Outbox e worker pertencem ao sistema de ponto; a aplicação de RH apenas recebe e apresenta os resumos. Consulte o [contrato](integracao/INTEGRACAO-PONTO.md).

`seed` e `backups` continuam locais, fora do Git e da imagem. Os modelos de planilhas, diagramas e fixtures sintéticas são parte da manutenção e permanecem versionados.

A paleta de estados e tipos fica em `styles/cores.css`; `core/cores.js` seleciona classes existentes. Somente a largura calculada de barras é aplicada por CSSOM, por `core/estilos-dinamicos.js`.

A versão 1.3 adiciona os contratos `schemas/folha`, campos financeiros e histórico por vigência em `funcionarios.extra`, e `valorDiaria` em `ocorrencias.extra`. O frontend calcula as estimativas em `features/remuneracao` e `features/folha/regras`; `features/folha` apresenta o relatório e `features/ferias` os recibos. Consulte o [guia](FOLHA-E-FERIAS.md). Não há mudança no schema nem no contrato com o ponto.
