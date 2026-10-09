# COFFITO Pass de Pessoal: documentação técnica para a TI

> Sistema de gestão de pessoas da DAGEP/COFFITO.
> Pasta do código: `quadro-pessoal/`. Nome exibido: COFFITO Pass de Pessoal.
> Cookie `qp_sessao`, chaves `qpk_` e banco `quadro` continuam sendo identificadores técnicos.
> Revisão de 07/10/2026: Docker e API validados com PostgreSQL isolado; schema v3.
> O produtor de resumos do ponto foi implementado, com ativação opcional e desabilitada por padrão.
> Evidências e limites: [REVISAO-2026-10-07.md](../historico/REVISAO-2026-10-07.md).

## Sumário

1. [O que é o sistema](#1-o-que-é-o-sistema)
2. [Como chegamos até aqui (histórico)](#2-como-chegamos-até-aqui-histórico)
3. [Arquitetura](#3-arquitetura)
4. [Estrutura do código](#4-estrutura-do-código)
5. [Banco de dados](#5-banco-de-dados)
6. [Funcionalidades do painel](#6-funcionalidades-do-painel)
7. [API REST](#7-api-rest)
8. [Importação de planilhas](#8-importação-de-planilhas)
9. [Integração com o sistema de ponto](#9-integração-com-o-sistema-de-ponto)
10. [Segurança e LGPD](#10-segurança-e-lgpd)
11. [Implantação passo a passo](#11-implantação-passo-a-passo)
12. [O que foi testado e o que ainda não foi](#12-o-que-foi-testado-e-o-que-ainda-não-foi)
13. [Pendências, riscos conhecidos e sugestões](#13-pendências-riscos-conhecidos-e-sugestões)
14. [Documentos complementares](#14-documentos-complementares)

---

## 1. O que é o sistema

É um painel web para a gestão de pessoal do COFFITO. Ele substitui o controle que hoje é feito em várias planilhas e
concentra num só lugar:

| Área | O que controla |
|---|---|
| **Cadastro** | 102 funcionários na carga inicial: efetivos, comissionados, cedidos, estagiários e aprendizes. Inclui cargo, setor, vínculo, função/comissão, contratos de estágio e cessões. |
| **Jornada** | Regimes Presencial, Híbrido (grade por dia da semana: P = presencial, H = home office, M = misto) e Teletrabalho. Também carga horária, horários e intervalo. |
| **Lançamentos** | Férias (com parcelas, abono pecuniário, período aquisitivo e data-limite), atestados (integral, meio período ou comparecimento), abonos/folgas com saldo anual, viagens com diárias, capacitações e banco de horas. |
| **Benefícios** | Auxílio-alimentação e auxílio-transporte, com descontos automáticos por afastamento e viagem; benefícios adicionais por pessoa; feriados. |
| **Remuneração** | Tabela da Estrutura Remuneratória (carreiras analista, técnico e apoio, níveis 1–30, comissões I–VI, FG, bolsas de estágio). Mostra o total por funcionário com benefícios. |
| **Importação** | Planilhas CSV/Excel de funcionários e de lançamentos, com validação antes de gravar. |
| **Presença** | Integração com o sistema de ponto: quem está no posto, em intervalo, remoto, afastado ou sem registro, em tempo quase real. |
| **Acesso** | Usuários com perfis (administrador, editor, leitor) e auditoria de tudo o que é alterado. |

**Público:** a equipe da DAGEP (edição) e as chefias (consulta). É um sistema interno e não deve ser exposto na internet
sem HTTPS e sem controle de rede.

---

## 2. Como chegamos até aqui (histórico)

1. **Protótipo.** O painel nasceu como uma página interativa (Artifact do claude.ai) que guardava os dados num banco
   de documentos da própria plataforma. Nessa fase foram construídos todos os cálculos e telas: férias, atestados,
   abonos, jornada híbrida, viagens, capacitações, benefícios, remuneração, o total com benefícios e o modo "nomes
   ocultos".
2. **Carga dos dados.** O protótipo foi alimentado com as planilhas da DAGEP, entre elas a planilha "Abono, Férias e
   Atestados – Colaboradores" (jun–set/2026). Os dados foram **importados uma vez**; não há ligação contínua com as
   planilhas.
3. **Versão de produção** (este repositório). Os passos foram:
   - Escrever um backend em **Python/FastAPI** com **PostgreSQL**, empacotado em **Docker Compose**.
   - Passar os dados do protótipo para um modelo relacional com tipos, chaves e restrições (o [§5](#5-banco-de-dados)
     descreve as tabelas).
   - Manter o painel original quase sem mudanças. Um arquivo de "ponte" (`frontend/scripts/core/api.js`) imita a interface de
     documentos do protótipo e conversa com a API REST. Assim, toda a lógica de tela já validada pela DAGEP foi
     reaproveitada.
   - Acrescentar o que o protótipo não tinha: login com perfis, auditoria, importação de planilhas com validação em
     duas etapas, backup diário, cabeçalhos de segurança e retirada dos dados de saúde.
   - Exportar os dados do protótipo para a pasta `seed/`, que faz a carga inicial (102 funcionários, 934 lançamentos,
     regras de benefícios e tabela salarial).
4. **Integração com o ponto** (schema v3). O ponto produz resumos diários versionados e os grava em uma outbox
   na mesma transação das alterações. Um processo separado entrega os resumos ao RH; exclusões e correções
   geram novas versões completas. O endpoint de batidas da v2 permanece compatível. Ver [§9](#9-integração-com-o-sistema-de-ponto).

---

## 3. Arquitetura

```
                 Usuários (navegador)
                        │  HTTPS
                        ▼
              ┌────────────────────┐
              │  Proxy reverso TI  │  Nginx / Traefik / balanceador (termina o TLS)
              └─────────┬──────────┘
                        │ HTTP 127.0.0.1:8000
   ┌────────────────────┼──────────────────── docker compose ─────────────┐
   │                    ▼                                                 │
   │  ┌──────────────────────────────┐        ┌──────────────────────┐    │
   │  │ app  (python:3.12-slim)      │  SQL   │ db  (postgres:16)    │    │
   │  │ FastAPI + uvicorn (2 workers)├───────▶│ volume dados_pg      │    │
   │  │ serve API /api/* e o painel  │        │ sem porta exposta    │    │
   │  └──────────────▲───────────────┘        └──────────▲───────────┘    │
   │                 │                                   │ pg_dump 02h    │
   │                 │                        ┌──────────┴───────────┐    │
   │                 │                        │ backup               │    │
   │                 │                        │ ./backups/*.dump     │    │
   │                 │                        └──────────────────────┘    │
   └─────────────────┼────────────────────────────────────────────────────┘
                     │ POST /api/integracao/ponto/resumos + /sinal (Bearer)
           Sistema de ponto (produção)
```

| Camada | Tecnologia | Observações |
|---|---|---|
| Backend | Python 3.12, FastAPI 0.115, uvicorn 0.34 | API REST síncrona e simples. |
| Driver do banco | **pg8000** 1.31 (Python puro) | Escolhido porque o binário do psycopg foi bloqueado pelo Windows Application Control na máquina de desenvolvimento. Funciona igual no Linux. Se a TI preferir, a troca para psycopg 3 é localizada em `backend/app/core/db.py`. |
| Banco | PostgreSQL 16 | Schema idempotente (`db/schema.sql`), aplicado na subida da aplicação com `pg_advisory_xact_lock`. |
| Frontend | HTML + JavaScript puro, sem build | `frontend/index.html` é o painel. Não há React ou build; Node é usado apenas nos testes dos cálculos. As fontes vêm do Google Fonts. |
| Autenticação | bcrypt + JWT (HS256) em cookie httpOnly | Perfis admin, editor e leitor. |
| Planilhas | openpyxl | Lê `.xlsx` e gera os modelos `.xlsx` com validação de lista. |
| Fuso | `America/Sao_Paulo` (zoneinfo + tzdata) | Todas as regras de presença usam o horário de Brasília. |
| Empacotamento | Dockerfile + docker-compose.yml | 3 serviços: `db`, `app` e `backup`. |

**Atualização entre usuários:** a cada 5 s, o painel consulta `GET /api/dados/versoes`, que devolve o último
`atualizado_em` de cada coleção, e recarrega só o que mudou. Não há WebSocket. O quadro de presença se atualiza a
cada 15 s.

---

## 4. Estrutura do código

```text
quadro-pessoal/
├── backend/
│   ├── app/
│   │   ├── main.py · cli.py
│   │   ├── api/          rotas HTTP e dependências de acesso
│   │   ├── core/         configuração, banco, segurança, privacidade e caminhos
│   │   ├── schemas/      contratos e validação de requisições
│   │   ├── services/     persistência, auditoria, mapping, presença e ponto
│   │   └── importacao/   leitura, normalização, modelos e validação de planilhas
│   ├── tests/            testes Python e ambiente descartável de integração
│   └── requirements*.txt
├── frontend/
│   ├── index.html · login.html · importacao.html
│   ├── styles/           base, layout, componentes, paleta e funcionalidades
│   ├── scripts/
│   │   ├── core/         API, estado, cálculos comuns, navegação e utilitários
│   │   └── features/     panorama, funcionários, ocorrências e demais telas
│   ├── assets/images/    logos versionados
│   └── tests/            regressões de cálculos com node --test
├── db/schema.sql         schema v3 preservado
├── docs/                 índice, arquitetura, operação, banco, importação e integração
├── ops/backup.sh
├── Dockerfile · docker-compose.yml · .env.example · pytest.ini
├── .gitignore · .dockerignore
├── seed/                 dados reais locais, ignorados pelo Git
└── backups/              dumps locais, ignorados pelo Git
```

Consulte [Arquitetura](../ARQUITETURA.md) para as responsabilidades de cada camada e
[Desenvolvimento](../DESENVOLVIMENTO.md) para os comandos. A reorganização 1.2 mantém as rotas,
o schema v3 e as regras; o [relatório](../historico/REORGANIZACAO-2026-10-09.md) registra a validação.

### Como o painel conversa com o banco (`mapping.py`)

O painel trabalha com documentos JSON em camelCase, por exemplo `{"nome": …, "entradaHO": "08:00", "usaTransporte": true}`.
O `mapping.py` traz uma tabela de campos com o formato `campo do painel → coluna → tipo` (text, date, time, int, num,
bool, json, ts) e faz a conversão:
- **Gravação:** `""` vira `NULL`, cada tipo é validado e campos desconhecidos vão para a coluna `extra` (jsonb), sem
  se perder.
- **Leitura:** `NULL` de texto volta como `""`, json nulo é omitido e `id` e `atualizadoEm` são acrescentados.

Assim o banco fica relacional e tipado, e o painel continua funcionando sem reescrita.

---

## 5. Banco de dados

O diagrama ER completo e o dicionário campo a campo estão em [`ESQUEMA-BANCO.md`](../banco/ESQUEMA-BANCO.md). As tabelas principais estão descritas abaixo.

| Tabela | Para que serve | Pontos importantes |
|---|---|---|
| `schema_versao` | controle de versão do schema | hoje há as versões 1, 2 e 3 |
| `usuarios` | quem acessa o sistema | e-mail único (sem diferenciar maiúsculas); `senha_hash` em bcrypt; `papel` admin/editor/leitor; `ativo` |
| `funcionarios` | cadastro | PK `id` texto; `matricula` única quando preenchida; CHECKs de vínculo, situação, regime, nível etc.; `semana` (grade do híbrido), `beneficios_extras`, `abonos` e `periodos_aquisitivos` em jsonb; restrição `contrato_ordem` |
| `ocorrencias` | lançamentos | FK para `funcionarios` com `ON DELETE CASCADE`; `tipo` ferias/atestado/abono/viagem/capacitacao/banco; restrição `periodo_ordem` (fim ≥ início); `importacao_id` liga ao lote importado. **Não há coluna de CID/diagnóstico.** |
| `config` | regras em JSON | chaves `beneficios` (valores, limites, feriados), `remuneracao` (tabela salarial) e `ponto` (tolerância, hora padrão) |
| `importacoes` | lotes de planilha | `status` pendente/concluida/descartada; o `plano` validado fica em jsonb até a confirmação; `mensagens` por linha |
| `auditoria` | rastreabilidade | quem (`usuario_id`), ação (criar/alterar/excluir/importar/login), tabela, registro, `antes` e `depois` em jsonb |
| `integracao_chaves` *(v2)* | chaves de API dos sistemas integrados | guarda **só o SHA-256** da chave e o prefixo para identificar na tela; `ativo` permite revogar; registra `ultimo_uso` |
| `ponto_marcacoes` *(v2)* | batidas recebidas do ponto | `id_externo` ÚNICO (idempotência); `matricula`; `funcionario_id` (NULL enquanto a matrícula não existir no RH); `momento` timestamptz; `tipo`; `local` presencial/remoto; `cancelada` |

**Schema v3:** acrescenta `usuarios.sessao_versao`, `login_tentativas`, `ponto_vinculos`, `ponto_resumos` e
`ponto_sincronizacao`. A aplicação serializa a aplicação do DDL com lock transacional. O arquivo contém também
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` e inserções idempotentes. A reexecução foi testada; alterações futuras
exigem revisão, backup e homologação. Não editar retroativamente blocos já implantados.

**Volume atual da carga inicial:** 102 funcionários, 934 ocorrências e 2 configurações.

---

## 6. Funcionalidades do painel

O painel tem cinco abas. No topo ficam o usuário logado, a troca de senha, a gestão de usuários (só admin), o botão
**Importar planilha**, o botão **Integrações** (só admin) e o botão **Nomes ocultos**.

### 6.1 Panorama
- Indicadores do dia e do mês: ativos por vínculo, afastados hoje, férias em curso e a vencer, atestados no mês,
  pessoas em viagem ou capacitação, estagiários com contrato perto do fim.
- Clicar num indicador mostra a lista de pessoas por trás do número.
- **Presença agora:** o quadro alimentado pelo sistema de ponto ([§9](#9-integração-com-o-sistema-de-ponto)).

### 6.2 Funcionários
- Lista com busca e filtros por vínculo, situação, setor e regime.
- Ficha completa:
  - Dados funcionais.
  - Jornada, com a grade semanal do híbrido dia a dia (P/H/M e horários).
  - Função ou comissão.
  - Dados de estágio.
  - Transporte e benefícios adicionais.
  - Enquadramento salarial.
  - Saldos de abono por ano de referência.
  - Períodos aquisitivos de férias.

### 6.3 Lançamentos
- Férias, atestados, abonos, viagens, capacitações e banco de horas, com filtros por tipo, período e pessoa.
- Regras aplicadas na tela:
  - Atestado de meio período ou comparecimento não conta dia de afastamento.
  - O abono desconta do saldo do ano de referência.
  - Avisos de sobreposição e de lançamento durante as férias.

### 6.4 Benefícios
- Cálculo mensal do auxílio-alimentação e do auxílio-transporte por pessoa:
  - Considera dias úteis, feriados, afastamentos e viagens acima do limite.
  - Usa um percentual diferenciado para temporários.
- Benefícios adicionais recorrentes ou em meses específicos.
- As regras ficam na configuração `beneficios` (editores podem alterar).

### 6.5 Remuneração
- Tabela da Estrutura Remuneratória (só administradores alteram).
- Remuneração de cada pessoa pela carreira e nível, comissão ou FG, ou bolsa de estágio, mais a coluna **total com
  benefícios**.

### 6.6 Recursos transversais
- **Nomes ocultos:** vem ligado por padrão e borra só os nomes, mantendo os dados visíveis, para projetar em reunião.
  A preferência fica no navegador.
- **Perfil leitor:** os botões de edição somem. Mesmo assim o backend recusa qualquer alteração (HTTP 403), então a
  proteção não depende da tela.
- **Exportações:** o painel gera relatórios para download (CSV/planilha) a partir dos dados carregados.
- **Mensagens de erro claras:** as violações de restrição do banco são traduzidas para português. Exemplo: "O término
  não pode ser antes do início."

---

## 7. API REST

Todas as rotas ficam sob `/api`. Com `API_DOCS=true` a documentação interativa (Swagger) aparece em `/api/docs`. Em
produção ela deve ficar **desligada**.

**Convenções:**
- Sessão por cookie `qp_sessao`.
- Toda requisição que altera dados (POST/PUT/PATCH/DELETE) exige o cabeçalho `X-Requested-With: quadro-pessoal`
  (proteção CSRF).
- Os erros vêm como `{"detail": "mensagem em português"}`.

| Método e rota | Perfil mínimo | Função |
|---|---|---|
| `POST /api/auth/login` | público | e-mail e senha → cookie de sessão (10 tentativas por IP a cada 15 min) |
| `POST /api/auth/logout` | — | apaga o cookie |
| `GET /api/auth/eu` | leitor | dados do usuário logado |
| `POST /api/auth/senha` | leitor | troca a própria senha (mínimo de 10 caracteres) |
| `GET /api/usuarios` | admin | lista os usuários |
| `POST /api/usuarios` | admin | cria um usuário; sem senha informada, gera uma **senha provisória mostrada uma vez** |
| `PATCH /api/usuarios/{id}` | admin | altera nome, perfil, ativo ou senha (o admin não pode tirar o próprio acesso) |
| `GET /api/dados/versoes` | leitor | marca de alteração de cada coleção (usada pelo polling) |
| `GET /api/dados/funcionarios` · `/ocorrencias` | leitor | lista os documentos |
| `PUT /api/dados/{colecao}/{id}` | editor | cria ou substitui um documento; remove campos estruturados de CID/diagnóstico recursivamente |
| `DELETE /api/dados/{colecao}/{id}` | editor | exclui um documento |
| `GET /api/dados/config/{chave}` | leitor | lê uma configuração |
| `PUT /api/dados/config/{chave}` | editor (`beneficios`, `ponto`) · admin (`remuneracao`) | grava uma configuração |
| `GET /api/importacao/modelos/{tipo}.csv\|.xlsx` | leitor | baixa o modelo de planilha |
| `GET /api/importacao/estrutura/{tipo}` | leitor | especificação das colunas (alimenta o `/importacao.html`) |
| `POST /api/importacao/{tipo}/validar` | editor | envio do arquivo (multipart); devolve a prévia e as mensagens sem alterar cadastros; a prévia é persistida |
| `POST /api/importacao/{id}/confirmar` | editor | grava o plano validado numa única transação |
| `POST /api/importacao/{id}/descartar` | editor | descarta a importação pendente |
| `GET /api/importacao/historico` | leitor | últimas importações |
| `POST /api/integracao/ponto/marcacoes` | **chave de API** | recebe as batidas do ponto ([§9](#9-integração-com-o-sistema-de-ponto)) |
| `GET /api/integracao/ponto/status` | **chave de API** | teste de conectividade |
| `GET /api/presenca?data=AAAA-MM-DD` | leitor | quadro de presença do dia |
| `GET /api/presenca/{func_id}?de=&ate=` | leitor | batidas de uma pessoa (até 62 dias) |
| `GET/POST /api/integracao/chaves` · `DELETE /api/integracao/chaves/{id}` | admin | lista, cria e revoga chaves de API |
| `GET /saude` | público | healthcheck (testa o banco) |

Todas as alterações feitas pelo painel, pela importação e pela gestão de chaves gravam uma linha em `auditoria`.

---

## 8. Importação de planilhas

A especificação completa, coluna por coluna, está em [`IMPORTACAO-PLANILHAS.md`](../importacao/IMPORTACAO-PLANILHAS.md). Os modelos
prontos ficam em [`docs/importacao/modelos/`](../importacao/modelos) e também são baixados pelo próprio sistema.

**Dois tipos:**
- **Funcionários** (32 colunas; obrigatórias: `nome` e `vinculo`). A chave é a `matricula`. Sem matrícula, o
  sistema procura pelo nome exato.
- **Lançamentos** (15 colunas; obrigatórias: `tipo` e `inicio`, mais `matricula` ou `nome`).

**Fluxo em duas etapas:**
1. **Validar.** O arquivo é lido; apenas a prévia e sua auditoria são persistidas, sem alterar cadastros.
   - O resultado mostra o que é **novo**, o que é **atualização**, o que será **ignorado** (duplicado) e os
     **erros** e **avisos** por linha.
   - O plano fica guardado na tabela `importacoes`.
2. **Confirmar.** O plano é aplicado numa única transação.
   - Nas atualizações, só os campos que vieram preenchidos na planilha são reaplicados sobre o cadastro atual.
     **Célula vazia não apaga informação.**

**Regras principais:**
- **Formatos de arquivo:** CSV em UTF-8 ou Windows-1252, separado por `;`, `,` ou tab, e XLSX. `.xls` antigo é
  recusado. Limites de 10 MB e 20.000 linhas.
- **Cabeçalho tolerante:** ignora acentos, maiúsculas e pontuação e aceita apelidos (`Data de Início` = `inicio`).
  Pode estar em qualquer uma das 10 primeiras linhas.
- **Formatos de valor:** datas `dd/mm/aaaa`, `aaaa-mm-dd` ou data nativa do Excel; números no formato brasileiro.
- **Identificação da pessoa:**
  - Pela matrícula, ignorando zeros à esquerda.
  - Pelo nome exato.
  - Por nome parcial, quando ele identifica uma única pessoa. Nesse caso sai um aviso para conferência.
  - Se o nome serve a mais de uma pessoa, a linha é recusada com a lista de candidatos.
- **Duplicado:** mesma pessoa, mesmo tipo, mesmo início e mesmo fim. Reenviar a mesma planilha não duplica.
- **Atestado:** `matutino`/`vespertino` vira meio período (4 h, não conta dia); `comparecimento` também não conta dia.
- **Colunas `cid` ou `diagnostico`:** são descartadas com aviso (LGPD).

Telas: o botão **Importar planilha** do painel e a página `/importacao.html`.

---

## 9. Integração com o sistema de ponto

O contrato vigente está em [INTEGRACAO-PONTO.md](../integracao/INTEGRACAO-PONTO.md). O ponto é a fonte da apuração oficial.
O RH recebe apenas o necessário para consultar presença e jornada: identificador, matrícula, dia, marcações
sem foto, modalidade, totais em segundos, carga, saldo e códigos de pendência. Não recebe CPF, imagem,
geolocalização, texto de justificativa nem documentos pessoais.

### 9.1 Fluxo e consistência

1. O ponto altera suas batidas/apuração e grava um resumo completo na mesma transação (`rh_outbox`).
2. O worker entrega a cada rodada (5 s, até 100 eventos), fora da requisição de registro de ponto.
3. O RH aceita a versão mais nova por `(sistema, colaborador_id, data)`. Versões antigas são ignoradas;
   repetição idêntica não duplica; mesma versão com conteúdo diferente retorna 409.
4. Exclusões geram outra versão, inclusive com lista vazia. Não existe marcador de envio na própria batida.
5. Uma reconciliação horária dos últimos 7 dias recupera alterações não capturadas e dias sem batidas.
   Períodos anteriores podem ser reprocessados explicitamente pelo worker.

### 9.2 Endpoints

| Endpoint | Autenticação | Finalidade |
|---|---|---|
| `POST /api/integracao/ponto/resumos` | Bearer de integração | 1 a 100 resumos completos, atomicamente |
| `POST /api/integracao/ponto/sinal` | Bearer de integração | última entrega e quantidade de pendências |
| `GET /api/integracao/ponto/status` | Bearer de integração | diagnóstico da recepção |
| `GET /api/jornada/{func_id}?de=AAAA-MM-DD&ate=AAAA-MM-DD` | sessão leitor | histórico diário, até 62 dias |
| `POST /api/integracao/ponto/marcacoes` | Bearer de integração | compatibilidade v2; não traz apuração oficial |

As chaves são criadas/revogadas por administrador na tela **Integrações**. Aparecem uma vez e apenas seu hash
é guardado. Não colocar a chave no frontend, em logs nem no repositório.

### 9.3 Presença e horas

Batidas são pareadas pela ordem cronológica e ID, seguindo `core.intervalos` do ponto. `tipo=J` indica origem
justificada, não entrada/saída. Uma segunda batida significa saída; o RH não presume almoço sem indicação
explícita. Home office previsto na escala fica separado de trabalho remoto comprovado por batida.

O painel mostra horas registradas, oficiais, por modalidade e saldo. Um intervalo aberto tem contador estimado,
separado dos valores oficiais. Ajustes e tolerância podem fazer o oficial diferir da soma dos intervalos;
o RH não recalcula nem reescreve esse resultado. Afastamentos do RH continuam contextualizando a presença.

Sem sinal, sinal com mais de 120 s ou fila pendente, ausência de marcação não é apresentada como falta.
O quadro consulta o backend a cada 15 s; isso é tempo quase real, sujeito à conectividade e ao tamanho da fila.

### 9.4 Vínculo e preparação dos dados

A matrícula faz o primeiro vínculo, ignorando zeros à esquerda, espaços externos e caixa. Depois o ID estável
do usuário do ponto conserva o vínculo. Matrículas desconhecidas ou ambíguas ficam pendentes, sem casamento por nome.
O RH não permite dois colaboradores com a mesma matrícula normalizada em novas gravações.

A carga inicial contém 21 pessoas sem matrícula e apenas uma com horário de entrada. A DAGEP precisa completar
esses dados; nenhum número foi inventado. Horários do RH contextualizam atrasos; os totais oficiais vêm do ponto.

### 9.5 Ativação no ponto

O código está em `api/ponto/integracao_rh/`; a migração aditiva é `api/migrations/002_integracao_rh.sql`.
`RH_INTEGRACAO_ENABLED=false` mantém o comportamento atual sem exigir essas tabelas. Com a flag ligada, a API
verifica o schema antes de aceitar uso. O serviço Compose `integracao-rh` só sobe com o perfil homônimo.

Primeiro homologar migração, matrícula, URL interna, TLS, chave e conectividade. A migração e a ativação NÃO
foram executadas no banco real do ponto durante esta revisão. O roteiro está em `docs/INTEGRACAO-RH.md` do ponto.

---

## 10. Segurança e LGPD

| Item | Como está |
|---|---|
| Autenticação | E-mail e senha, com senha em bcrypt (custo 12) e mínimo de 10 caracteres e no máximo 72 bytes UTF-8. |
| Sessão | JWT HS256 em cookie `httpOnly`, `SameSite=Strict` e `Secure`, com validade de 10 h (`SESSAO_HORAS`). Usuário desativado perde o acesso na próxima requisição, porque o status é consultado a cada chamada. Troca/reset de senha invalida sessões anteriores pela versão de sessão. |
| CSRF | Alterações exigem o cabeçalho `X-Requested-With: quadro-pessoal`, que outro site não consegue enviar com cookie em `SameSite=Strict`. |
| Força bruta | Limite de 10 falhas de login por IP a cada 15 min, persistido no PostgreSQL e compartilhado pelos workers. |
| Autorização | Perfis checados no **backend** em cada rota (`exige("editor")` etc.). |
| Cabeçalhos | CSP restritiva, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` e `Cache-Control: no-store` na API. |
| Erros | Erros internos não vazam detalhes (mensagem genérica e log no servidor). |
| Banco | Sem porta publicada (só na rede interna do Docker). |
| Contêiner | A aplicação roda como usuário sem privilégios (uid 10001). |
| Segredos | `JWT_SECRET` com 32 caracteres ou mais é obrigatório; a aplicação não sobe sem ele. O `.env` fica fora do git. |
| Chaves de integração | Só o hash é armazenado. São revogáveis e registram o último uso. |
| Auditoria | Login, criação, alteração, exclusão e importação, com antes/depois; troca de senha só registra o fato, nunca o segredo. |
| **Dados de saúde (LGPD art. 11)** | Não há coluna de CID/diagnóstico. A API remove recursivamente campos estruturados de saúde e a importação descarta essas colunas. Texto livre ainda exige cuidado humano; não é um detector de diagnóstico. |
| Dados do ponto | Identificador, matrícula, marcações, modalidade e apuração diária. Sem foto, geolocalização, biometria ou texto de justificativa. Retenção a definir pela TI/DAGEP. |
| Dados de carga | A pasta `seed/` tem **dados pessoais reais**. Ela está no `.gitignore` e deve ser **apagada do servidor depois da carga inicial**. |
| Exibição | O modo "Nomes ocultos" vem ligado por padrão. |

---

## 11. Implantação passo a passo

**Pré-requisitos do servidor:**
- Linux com Docker 24+ e o plugin Compose.
- Um proxy reverso com HTTPS: Nginx, Traefik, Caddy ou o balanceador da TI.
- Um DNS interno, por exemplo `pessoal.coffito.gov.br`.

**Recursos estimados:** 1 vCPU, 1–2 GB de RAM e 5 GB de disco são suficientes para o porte atual (cerca de 100 pessoas).

### 11.1 Primeira subida
```bash
# 1. copiar o projeto para o servidor (git clone ou cópia da pasta, SEM a pasta seed/ se não for fazer a carga)
cd quadro-pessoal

# 2. configurar
cp .env.example .env
openssl rand -hex 32          # cole o resultado em JWT_SECRET no .env
#    defina POSTGRES_PASSWORD (senha longa) no .env
#    PORTA=127.0.0.1:8000  (padrão: só local, o proxy encaminha)
#    FORWARDED_ALLOW_IPS deve conter o IP do proxy visto dentro do contêiner

# 3. construir e subir
docker compose up -d --build
docker compose ps             # app e db devem aparecer "healthy"
docker compose logs -f app    # deve mostrar "Schema verificado."

# 4. criar o primeiro administrador (pede a senha)
docker compose exec app python -m app.cli criar-admin email.do.admin@coffito.gov.br "Nome do Admin"

# 5. (opcional) carga inicial dos dados do protótipo
docker compose exec app python -m app.cli carregar-json /srv/seed
#    em seguida: apagar a pasta seed/ do servidor
```

### 11.2 Proxy reverso (exemplo Nginx)
```nginx
server {
    listen 443 ssl http2;
    server_name pessoal.coffito.gov.br;
    # ssl_certificate ...; ssl_certificate_key ...;
    client_max_body_size 12m;            # importação de planilhas (limite da app: 10 MB)
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

### 11.3 Variáveis de ambiente (`.env`)

| Variável | Padrão | Função |
|---|---|---|
| `POSTGRES_DB` / `POSTGRES_USER` | quadro / quadro | Banco e usuário. |
| `POSTGRES_PASSWORD` | **obrigatória** | Senha do banco. |
| `JWT_SECRET` | **obrigatória (≥32)** | Assina as sessões. Se for trocada, todos os usuários são deslogados. |
| `COOKIE_SEGURO` | true | Cookie só em HTTPS. Use `false` apenas em teste com http://localhost. |
| `SESSAO_HORAS` | 10 | Duração da sessão. |
| `TAMANHO_MAX_UPLOAD_MB` | 10 | Tamanho máximo da planilha. |
| `WEB_CONCURRENCY` | 2 | Processos do uvicorn. |
| `PORTA` | 127.0.0.1:8000 | Onde a app escuta no host. |
| `BACKUP_RETENCAO_DIAS` | 30 | Dias de retenção dos dumps. |
| `API_DOCS` | false | Liga o Swagger em `/api/docs`. Deve ficar desligado em produção. |
| `DB_POOL_MAX` | 10 | Conexões por processo. |
| `FORWARDED_ALLOW_IPS` | 127.0.0.1 | IPs reais do proxy confiável; configure o endereço visto pelo contêiner, sem `*`. |

### 11.4 Operação do dia a dia
```bash
# atualizar a versão
git pull && docker compose up -d --build app      # o schema é aplicado automaticamente

# backup manual
docker compose exec backup pg_dump -Fc -f /backups/manual-$(date +%Y%m%d-%H%M).dump

# restaurar (APAGA o conteúdo atual)
docker compose stop app
docker compose exec -T backup pg_restore --clean --if-exists -d quadro < backups/quadro-AAAAMMDD.dump
docker compose start app

# exportação legível em JSON
docker compose exec app python -m app.cli exportar-json /tmp/export && docker compose cp app:/tmp/export ./export

# reativar/criar admin se alguém perder o acesso
docker compose exec app python -m app.cli criar-admin email@coffito.gov.br "Nome"
```

- **Backup automático:** o serviço `backup` grava `backups/quadro-AAAAMMDD.dump` todo dia a partir das 02h, recuperando a execução pendente após reinício no mesmo dia. Dumps são validados antes da publicação, com nova tentativa em caso de erro. **A pasta
  `backups/` deve ser copiada para fora do servidor** (storage da TI).
- **Monitoração:** `GET /saude` devolve `{"ok": true}` quando a aplicação e o banco respondem.

### 11.5 Desenvolvimento local (sem Docker)
```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements-dev.txt
export DATABASE_URL=postgresql://usuario:senha@localhost:5432/quadro
export JWT_SECRET=$(openssl rand -hex 32) COOKIE_SEGURO=false
cd backend
python -m app.cli criar-admin admin@local "Admin"
python -m uvicorn app.main:app --reload --port 8000
# Em outro terminal, na raiz e com o mesmo ambiente virtual:
python -m pytest
node --test frontend/tests/*.test.js
```

---

## 12. O que foi testado e o que ainda não foi

A revisão inicial está em [REVISAO-2026-10-07.md](../historico/REVISAO-2026-10-07.md).
Foram testados Docker, PostgreSQL, 35 testes do RH, os 7 novos testes de outbox do ponto, 22 testes de jornada híbrida, 4 testes PostgreSQL do ponto e a integração
HTTP completa com dados sintéticos, incluindo falha/reenvio, correção e exclusão.

Continuam fora da validação local: infraestrutura HTTPS/DNS/firewall da TI, SSO, carga concorrente representativa,
copiar backups para storage externo e homologação com usuários/matrículas reais. O resultado histórico acima corresponde à revisão inicial; a ativação posterior do ponto não altera o contrato. A reorganização usa somente bancos descartáveis e está registrada no [relatório 1.2](../historico/REORGANIZACAO-2026-10-09.md).

## 13. Pendências, riscos conhecidos e sugestões

| Item | Situação / responsável |
|---|---|
| Matrículas e horários incompletos | DAGEP completa os cadastros antes de avaliar atrasos e ausência de registros. |
| Ativação do ponto | TI homologa migração 002, URL, TLS, chave e rede. Código preparado e testado isoladamente. |
| HTTPS e proxy confiável | TI configura `COOKIE_SEGURO=true` e `FORWARDED_ALLOW_IPS` corretamente no servidor. |
| Backup externo e retenção | TI define storage, retenção, rotina de restauração e descarte autorizado. |
| Fontes externas | Google Fonts é opcional; em bloqueio de rede há fontes locais de fallback. |
| Seed e protótipo compartilhado | Dados reais exigem controle de acesso e descarte/despublicação autorizado; não foram apagados nesta revisão. |
| SSO | Depende do provedor institucional e de requisitos de autenticação ainda não fornecidos. |
| PDFs do ponto | Dois testes preexistentes esperam `Saldo mensal*:` mas o PDF imprime `Saldo mensal:`; registrado fora da implementação do RH. |

Concluídos nesta revisão: nome das telas, CSP sem scripts inline, lifespan, limite de login persistente,
invalidação de sessões por senha, auditoria de usuários/importação, proteção recursiva de campos de saúde,
validação de planilhas, backup com recuperação após reinício e integração versionada.

---

## 14. Documentos complementares

| Arquivo | Conteúdo |
|---|---|
| [`../README.md`](../../README.md) | Resumo, deploy e operação |
| [`ESQUEMA-BANCO.md`](../banco/ESQUEMA-BANCO.md) | Diagrama ER e dicionário de dados (v1–v3) |
| [`IMPORTACAO-PLANILHAS.md`](../importacao/IMPORTACAO-PLANILHAS.md) | Especificação completa das planilhas |
| [`INTEGRACAO-PONTO.md`](../integracao/INTEGRACAO-PONTO.md) | Contrato vigente, consistência e ativação do produtor no ponto |
| [`modelos/`](../importacao/modelos) | Modelos `.csv` e `.xlsx` para preencher |
| `db/schema.sql` | DDL oficial do banco |
