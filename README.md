# Quadro de Pessoal COFFITO

Painel de gestão de pessoas da DAGEP: férias, atestados, abonos, jornada (presencial, híbrida, teletrabalho), viagens,
capacitações, banco de horas, benefícios (alimentação, transporte e adicionais) e remuneração. Também importa planilhas
CSV/Excel.

**Stack:** Python 3.12 · FastAPI · PostgreSQL 16 · painel em HTML/JS servido pela própria API · Docker Compose.

```
quadro-pessoal/
├── app/
│   ├── main.py               aplicação FastAPI (API + arquivos do painel, cabeçalhos de segurança)
│   ├── config.py             variáveis de ambiente
│   ├── db.py                 pool de conexões (pg8000) e aplicação do schema
│   ├── auth.py               login, sessão (cookie httpOnly + JWT), perfis admin/editor/leitor
│   ├── mapping.py            documento do painel (camelCase) <-> colunas do banco
│   ├── routes_dados.py       /api/dados: funcionários, lançamentos, configurações (com auditoria)
│   ├── routes_importacao.py  /api/importacao: modelos, validar, confirmar, histórico
│   ├── routes_usuarios.py    /api/usuarios (admin)
│   ├── cli.py                comandos: schema, criar-admin, carregar-json, exportar-json
│   └── importacao/
│       ├── modelos.py        ESTRUTURA OFICIAL DAS PLANILHAS + geração dos modelos .csv/.xlsx
│       ├── leitor.py         leitura de CSV (UTF-8/Windows-1252, ; , tab) e XLSX
│       ├── normaliza.py      datas BR, números BR, sim/não, apelidos de valores
│       └── validacao.py      regras: casamento por matrícula/nome, duplicados, consistência
├── db/schema.sql             DDL do PostgreSQL (idempotente)
├── public/
│   ├── index.html            o painel
│   ├── login.html            tela de login
│   ├── importacao.html       estrutura das planilhas (gerada da definição oficial)
│   ├── js/api.js             ponte painel <-> API (atualiza a cada 5 s se outra pessoa alterar algo)
│   ├── js/painel-extra.js    importação, usuários, troca de senha, sair
│   └── img/                  logos COFFITO
├── docs/
│   ├── ESQUEMA-BANCO.md      modelo de dados (diagrama + dicionário)
│   ├── IMPORTACAO-PLANILHAS.md  especificação das planilhas
│   └── modelos/              modelos .csv e .xlsx prontos para preencher
├── tests/                    testes das regras de importação
├── Dockerfile · docker-compose.yml · .env.example · requirements.txt
└── seed/                     (fora do git) exportação dos dados atuais para a carga inicial
```

## Subir em produção

Pré-requisitos no servidor: Docker 24+ com o plugin Compose e um proxy reverso com HTTPS (Nginx, Traefik, Caddy ou o
balanceador da TI do COFFITO).

```bash
# 1. configurar
cp .env.example .env
#    edite .env: POSTGRES_PASSWORD (senha longa) e JWT_SECRET (gere com o comando abaixo)
openssl rand -hex 32

# 2. construir e subir (banco, aplicação e backup diário)
docker compose up -d --build
docker compose ps            # app e db devem ficar "healthy"

# 3. criar o primeiro administrador (pede a senha)
docker compose exec app python -m app.cli criar-admin seu.email@coffito.gov.br "Seu Nome"

# 4. (opcional) carregar os dados atuais do painel: 102 funcionários, 934 lançamentos, regras e tabela salarial
docker compose exec app python -m app.cli carregar-json /srv/seed
```

A aplicação escuta em `127.0.0.1:8000`. Aponte o proxy HTTPS para ela. Exemplo com Nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name quadro.coffito.gov.br;
    # ssl_certificate ... ; ssl_certificate_key ... ;
    client_max_body_size 12m;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

Depois, os demais usuários são criados no próprio sistema (botão **Usuários**, visível para administradores). A senha
provisória aparece uma única vez na tela.

**Perfis:**
- **Administrador:** tudo, inclusive usuários e tabela salarial.
- **Editor:** cadastra, lança, importa e altera as regras de benefícios.
- **Leitor:** só consulta.

### Atualizar a versão

```bash
git pull   # ou copie os arquivos novos
docker compose up -d --build app
```

O schema é aplicado automaticamente na subida, e as alterações são compatíveis com os dados existentes.

### Backup e restauração

O serviço `backup` grava todo dia, às 02h, `backups/quadro-AAAAMMDD.dump`, e mantém os últimos 30 dias
(`BACKUP_RETENCAO_DIAS`). **Copie a pasta `backups/` para fora do servidor** (storage da TI).

```bash
# backup manual agora
docker compose exec backup pg_dump -Fc -f /backups/manual-$(date +%Y%m%d-%H%M).dump
# restaurar (APAGA o conteúdo atual)
docker compose stop app
docker compose exec -T backup pg_restore --clean --if-exists -d quadro < backups/quadro-20261006.dump
docker compose start app
# exportação legível em JSON (além do dump)
docker compose exec app python -m app.cli exportar-json /tmp/export && docker compose cp app:/tmp/export ./export
```

## Importar planilhas

No painel, clique em **Importar planilha** e escolha o tipo:
- **Funcionários:** cadastro novo ou atualização pela matrícula.
- **Lançamentos:** férias, atestados, abonos, viagens, capacitações e banco de horas.

A importação tem duas etapas. **Validar** mostra quantos registros são novos, quantos são atualizações, quantos já
existem e os erros de cada linha, sem gravar nada. **Confirmar** grava tudo de uma vez. Reenviar a mesma planilha não
duplica lançamentos. Modelos e especificação completa:
- no sistema: `/importacao.html` e os links de modelo na tela de importação;
- no repositório: [`docs/IMPORTACAO-PLANILHAS.md`](docs/IMPORTACAO-PLANILHAS.md) e [`docs/modelos/`](docs/modelos/).

## Desenvolvimento local (sem Docker)

```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt pytest   # Windows: .venv\Scripts\pip
export DATABASE_URL=postgresql://usuario:senha@localhost:5432/quadro
export JWT_SECRET=$(openssl rand -hex 32) COOKIE_SEGURO=false
python -m app.cli criar-admin admin@local "Admin"
uvicorn app.main:app --reload --port 8000
python -m pytest tests
```

Com `API_DOCS=true`, a documentação interativa da API fica em `/api/docs`. Mantenha desligada em produção.

## Segurança e LGPD

- **Acesso:** só com login. Senhas em bcrypt, mínimo de 10 caracteres. Limite de 10 tentativas de login por IP a cada 15 minutos.
- **Sessão:** cookie `httpOnly`, `SameSite=Strict` e `Secure` (HTTPS), válido por 10 h (`SESSAO_HORAS`). Toda
  alteração exige o cabeçalho `X-Requested-With` (proteção CSRF).
- **Banco:** não fica exposto fora da rede do Docker. A aplicação roda como usuário sem privilégios no contêiner.
- **Auditoria:** a tabela `auditoria` guarda quem criou, alterou, excluiu ou importou o quê, com o antes e o depois.
- **Dados de saúde:** CID ou diagnóstico **não são armazenados**, nem pela tela nem pela importação.
- **Modo "nomes ocultos":** vem ligado por padrão, para projetar o painel em reuniões.
- **Pasta `seed/`:** contém dados pessoais reais (exportação do painel anterior). Ela está no `.gitignore`. Depois da carga
  inicial, apague-a do servidor.
