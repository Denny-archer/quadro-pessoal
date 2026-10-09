# Reorganização 1.2 — 09/10/2026

O checkout `quadro-pessoal` foi reorganizado para manter FastAPI, PostgreSQL e JavaScript puro,
separando infraestrutura, contratos, rotas, serviços, telas e estilos. As URLs públicas, os endpoints,
as regras de cálculo e o contrato com o ponto permanecem compatíveis. O schema v3 não foi alterado.

## Alterações

| Área | Resultado |
|---|---|
| Backend | `backend/app/api`, `core`, `schemas`, `services` e `importacao`; sessão/senha separados das rotas; gravação e auditoria compartilhadas em serviços |
| Caminhos | Resolução única em `core/paths.py`, independente do diretório corrente, com a mesma hierarquia no Windows e no Docker |
| Frontend | `public` realocado para `frontend`; 41 módulos ES com imports explícitos, estado e inicialização centralizados |
| Funcionalidades | Panorama, funcionários, ocorrências, benefícios, remuneração, contratos, importação, usuários, conta, presença e configurações em arquivos próprios |
| CSS | 15 folhas externas para tema, layout, componentes, paleta, funcionalidades, páginas e impressão; sem blocos `<style>`, atributos `style` no código ou CSS injetado pelo JavaScript |
| Estados e gráficos | Cores por classes; somente larguras calculadas por CSSOM. Preenchimentos SVG usam classes externas |
| Atualização | Dados a cada 5 s e presença a cada 15 s; troca de aba não reinicia o prazo continuamente, e o retorno ao Panorama recarrega a presença |
| Interface | Temas claro/escuro e preferências preservados; abas se reorganizam no celular; impressão da ficha remove controles de edição |
| Documentação | Índice e guias de arquitetura/desenvolvimento; documentos canônicos por assunto; modelos CSV/XLSX e diagramas SVG preservados e versionáveis |
| Docker | Imagem local `coffito/quadro-pessoal:1.2.0` construída e validada; contexto limitado aos arquivos de execução; usuário UID 10001 |

Os comandos continuam em `app.main` e `app.cli`. Na execução nativa, use a pasta `backend`;
no Docker, o diretório de trabalho já está configurado. As páginas `/`, `/login`, `/importacao.html`
e os endpoints `/api/` foram preservados. Também permanecem os aliases `/index.html` e `/login.html`.

## Inventário e proteção dos arquivos

O [inventário CSV](INVENTARIO-ARQUIVOS.csv) registra responsabilidade, destino e decisão de
versionamento por arquivo: 1105 arquivos existentes/gerados localmente e os destinos novos
ou extraídos. 1044 arquivos locais ficam ignorados e preservados no disco, incluindo `.env`,
cargas em `seed` e dumps em `backups`.

O `.gitignore` cobre variações de `.env`, credenciais de acesso local, chaves privadas, dumps,
uploads, anexos, exportações, logs, temporários, ambientes virtuais, caches e dependências.
`.env.example`, JSON de configuração, SQL de schema, modelos CSV/XLSX e diagramas continuam
versionáveis. Não foram usadas exclusões gerais por essas extensões.

Foram conferidos 11 casos de exclusão e 8 casos de inclusão.
Nenhum `.env`, seed, backup ou arquivo de acesso local estava rastreado no índice Git. Não houve
reescrita de histórico, commit, push ou alteração do índice. As cópias temporárias e o arquivo de
acesso da conversa estão protegidos pelo `.gitignore` do workspace desta tarefa.

Os 61 arquivos de código/documentação originais foram comparados com os hashes da cópia inicial
antes da aplicação. As alterações preexistentes do usuário foram usadas como base. Uma cópia de
recuperação desses arquivos permanece em `reorganizacao/original`, no workspace local da tarefa,
fora do Git. A aplicação confere os arquivos privados antes e depois da cópia, sem expor seu conteúdo.

## Validação

| Verificação | Resultado |
|---|---|
| RH com Python 3.12 e PostgreSQL 16 descartável no Docker | **35 testes passaram** |
| Regressões JavaScript com `node --test` | **13 testes passaram**: jornadas, benefícios proporcionais, híbrido, atestados, extras, admissão e contratos |
| Outbox do ponto | **7 testes passaram**, usando o código existente do ponto sem modificá-lo |
| Integração HTTP ponta a ponta | **Passou**: migração reexecutável no banco descartável, transação, modalidade, horas oficiais, indisponibilidade/reenvio, idempotência, correção/exclusão, versões antigas e sincronização |
| Navegador Edge | **17 grupos de cenários passaram**, sem erros JavaScript ou HTTP nas operações |
| Conferência complementar | **Passou**: Excel com linha inválida na prévia, confirmação das linhas válidas, contrato temporário e cores de prazo |
| Layout final | **Passou**: viewport de 390 px sem overflow horizontal, temas, impressão sem controles e SVG com preenchimento em CSS |
| Estrutura | **Passou**: 35 arquivos Python analisados, imports dos 41 módulos válidos, ausência de CSS embutido e links locais resolvidos |
| Imagem Docker | **Passou**: saúde, páginas, scripts, estilos e imagens; sem `.env`, seed, backups, docs, Git, testes ou `package.json` na imagem |
| Arquivos internos via HTTP | **404 esperado** para `.env`, `package.json`, testes e documentação interna |
| CLI | **Passou**: schema, exportação JSON e recarga do JSON em banco descartável |
| Preservação | Schema SQL idêntico à cópia inicial; dados e backups mantidos no disco; volume da aplicação atual preservado |

A conferência no navegador incluiu login de admin/editor/leitor, permissões, lista/ficha/cadastro
de funcionários, benefícios adicionais, lançamentos, regras de benefícios, remuneração e tabela
salarial, quatro exportações CSV, importação CSV e Excel, histórico, página das colunas, criação de
usuário, troca de senha, chaves da integração, presença com horas, panorama mensal/anual,
indicadores e preferências após recarregar.

Os testes também passaram em uma instância nativa PostgreSQL 18 descartável enquanto o Docker
era recuperado. A validação final de banco e imagem usou PostgreSQL 16. O único aviso da suite
RH foi uma depreciação de alias do AnyIO pelo TestClient do Starlette; não houve teste falhando.

Comandos reproduzíveis: [Desenvolvimento](../DESENVOLVIMENTO.md) e
[Integração descartável](../../backend/tests/integracao/README.md).

## Limites da entrega

A reorganização foi aplicada ao checkout local. O sistema de ponto e o servidor de desenvolvimento
não foram alterados. Não há migração nova ou recarga dos dados atuais. A imagem foi testada em
projeto Docker separado; a aplicação existente conserva seus contêineres e volume. Para executá-la
com o código reorganizado, use `docker compose up -d --build` na raiz, com o `.env` local existente.

Homologação com usuários, infraestrutura HTTPS e carga concorrente representativa continuam
dependendo do ambiente da TI; não fazem parte dos testes com dados sintéticos desta revisão.
