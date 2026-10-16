# Operação e homologação — versão 1.4.0

## Estado da entrega

Código integrado e validação com dados sintéticos. A instalação em uso e o banco real não são atualizados pelos testes. Conferir os vínculos e a correspondência organizacional antes de habilitar os colaboradores.

## Ensaios reproduzíveis

Na raiz do projeto, usando somente o Compose de validação:

```powershell
docker compose -f compose.validacao.yml build testes
docker compose -f compose.validacao.yml run --rm testes
node --test frontend/tests/*.test.js
docker compose -f compose.validacao.yml run --rm testes python tests/integracao/verificar_migracao.py
docker compose -f compose.validacao.yml run --rm testes python tests/integracao/preparar_demandas.py
docker compose -f compose.validacao.yml up -d web
docker compose -f compose.validacao.yml run --rm testes python tests/integracao/verificar_eventos.py
```

Esse ambiente usa `rh_demandas_test` em PostgreSQL descartável, sem portas do banco publicadas. A interface sintética fica em http://127.0.0.1:18043. O teste HTTP usa um cabeçalho de processo exclusivo do servidor de teste, ausente na aplicação de produção.

Contas sintéticas definidas no preparador: `admin@teste.local`, `ana@teste.local`, `gestor@teste.local`; senha de teste `Validacao-local!2026`. Não usar essas contas/senha na instalação real. A preparação apaga somente os dados do banco descartável nominalmente verificado. Não executar a suíte enquanto estiver usando a interface sintética: os fixtures reiniciam esse banco.

O script de eventos comprova processos distintos, atualização em até três segundos, ausência de evento para demanda alheia, concorrência 200/409 e encerramento do stream após logout. Para encerrar apenas os recursos de teste:

```powershell
docker compose -f compose.validacao.yml down
```

## Atualização da instalação

1. Homologar o código e conferir o acesso administrativo disponível. Fazer e ensaiar a restauração de um `pg_dump -Fc` completo.
2. Preparar o ambiente com `ACESSO_SOMENTE_ADMIN=true`, HTTPS, cookie seguro e proxy confiável. Não alterar a chave JWT existente sem uma decisão de encerrar todas as sessões.
3. Construir a imagem 1.4.0. Parar somente a aplicação durante a migração; manter PostgreSQL e seus volumes.
4. Aplicar schema/migrações usando a imagem nova e reiniciar a aplicação. Não executar o SQL da antiga pasta de referência do painel.
5. Em `/administracao`, conferir setores/cargos, resolver ambiguidades, revisar perfis, vincular contas aos funcionários e atribuir setores aos gestores. Nenhum vínculo por semelhança de nome.
6. Criar acessos elegíveis individualmente, conferir e-mail e entregar senha provisória pelo canal manual do RH. A troca é exigida antes de liberar dados.
7. Desativar a restrição administrativa apenas depois da conferência. Acompanhar saúde, falhas de login, conflitos e latência dos eventos sem registrar dados pessoais em logs adicionais.

O controle `ACESSO_SOMENTE_ADMIN` é uma medida de manutenção da nova aplicação, não substitui perfis/vínculos. Seu valor padrão é `false`; durante a homologação inicial da instalação real, configurar explicitamente `true`.

## Proxy e SSE

Aplicar o HTTPS e a política de proxy já adotados pela TI. Para a rota `/api/acesso/eventos`, desabilitar cache/buffering e admitir conexões longas. Exemplo de trecho Nginx a incorporar ao virtual host existente:

```nginx
location = /api/acesso/eventos {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 75s;
}
```

A porta deve corresponder à publicação local configurada no servidor; o exemplo não altera o proxy automaticamente. Testar os eventos pelo HTTPS definitivo antes da liberação.

## Backup e reversão

Preservar o dump completo do banco, incluindo schema `demandas`, vínculos, organização, sessões e auditoria. O usuário de backup precisa poder ler todos esses objetos. Ensaiar `pg_restore --exit-on-error` em outra base e conferir dados dos dois módulos. O JSON da CLI não é backup completo.

Em falha de implantação, manter `ACESSO_SOMENTE_ADMIN=true` na nova versão ou retornar somente a uma versão que já aplique o alcance por pessoa/setor. Não usar a antiga leitura global como reversão com colaboradores habilitados. Conservar as novas tabelas; restaurar o banco inteiro somente em recuperação deliberada, pois isso descarta alterações posteriores ao backup.

## Configuração organizacional

`ORGANIZACAO_NOME`, `ORGANIZACAO_SIGLA`, `ORGANIZACAO_TITULO`, `ORGANIZACAO_LOGO_CLARO`, `ORGANIZACAO_LOGO_ESCURO` e `TZ` personalizam a instalação. Logos devem apontar para assets existentes e autorizados pela CSP. Parametrizações de remuneração continuam na configuração do RH e precisam de revisão para cada adoção futura.
