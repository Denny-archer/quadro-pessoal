# COFFITO Pass de Pessoal

Gestão de pessoas da DAGEP: cadastros, afastamentos, jornada, benefícios, remuneração e integração com o sistema de ponto.

**Stack:** Python 3.12, FastAPI, PostgreSQL 16 e JavaScript com módulos ES. O próprio backend serve o frontend; não há bundler ou servidor Node em produção.

## Onde encontrar cada parte

| Pasta | Responsabilidade |
|---|---|
| `backend/app/api` | Endpoints HTTP e permissões por operação |
| `backend/app/core` | Configuração, conexão com banco, caminhos, sessão e privacidade |
| `backend/app/schemas` | Contratos das requisições e da integração |
| `backend/app/services` | Persistência, auditoria, mapeamento e apuração recebida do ponto |
| `backend/app/importacao` | Leitura, normalização, modelos e validação de planilhas |
| `backend/tests` | Regressões e ambiente descartável de integração |
| `frontend/scripts/core` | API, estado, utilitários, navegação e renderização |
| `frontend/scripts/features` | Funcionalidades, telas e formulários por assunto |
| `frontend/styles` | Estilos compartilhados, das páginas e das funcionalidades |
| `frontend/assets/images` | Logos e imagens públicas |
| `db` | Schema PostgreSQL idempotente |
| `docs` | Guias, contratos, diagramas e modelos de planilhas |
| `ops` | Rotinas operacionais de backup |

## Executar com Docker

Na raiz, copie `.env.example` para `.env` e configure as credenciais e `JWT_SECRET`. Em produção, use HTTPS e `COOKIE_SEGURO=true`.

```bash
docker compose up -d --build
docker compose ps
docker compose exec app python -m app.cli criar-admin seu.email@coffito.gov.br "Seu Nome"
```

A porta é definida no `.env`. As URLs `/`, `/login`, `/importacao.html` e `/api/` foram preservadas. A imagem 1.3.0 usa o mesmo schema v3 e volume PostgreSQL. A ficha do colaborador preenche a tabela Jornada semanal existente com as batidas e horas recebidas do ponto.

A versão 1.3.0 acrescenta campos de folha, histórico de remuneração por vigência, controle e recibos de férias/recesso e relatório estimado com exportação. Veja o [guia de folha e férias](docs/FOLHA-E-FERIAS.md). A atualização não exige migração de banco.

Para carga opcional dos dados locais, conserve `seed/` na raiz e execute `docker compose exec app python -m app.cli carregar-json /srv/seed`. Os arquivos de seed, `.env`, exportações e backups ficam fora do Git e da imagem da aplicação.

## Desenvolvimento e manutenção

- [Começar no Windows ou Linux e executar os testes](docs/DESENVOLVIMENTO.md)
- [Arquitetura, módulos e convenções](docs/ARQUITETURA.md)
- [Índice completo da documentação](docs/README.md)
- [Operação, segurança e implantação](docs/operacao/DOCUMENTACAO-TI.md)
- [Contrato com o sistema de ponto](docs/integracao/INTEGRACAO-PONTO.md)
- [Testes HTTP e PostgreSQL descartáveis](backend/tests/integracao/README.md)

## Regras para arquivos

Versione código, documentação, schema, modelos de planilha e fixtures sintéticas. Não versione credenciais, dados reais, dumps, exportações, logs e caches. O inventário detalhado e a revisão 1.2 ficam em `docs/historico/`.

Os backups diários continuam em `backups/`; preservá-los fora do Git não substitui armazenamento seguro fora do servidor.
