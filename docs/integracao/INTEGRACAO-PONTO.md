# Integração RH ↔ sistema de ponto

Contrato vigente em 07/10/2026. O ponto é responsável pela apuração. O RH consulta presença e horas,
sem manter cópia completa do sistema de ponto. Transporte servidor a servidor, com HTTPS na implantação.

## Consulta na ficha do colaborador

Na versão 1.2.2, a ficha usa a tabela **Jornada semanal** existente, com as colunas Dia,
Formato, Presencial, Home office e Horas. Os intervalos de batidas preenchem a modalidade
correspondente, e Horas conserva o total oficial informado pelo ponto. Há uma única tabela.
Os totais presenciais/remotos e oficiais são somados a partir dos resumos recebidos.

A consulta usa `GET /api/jornada/{func_id}?de=AAAA-MM-DD&ate=AAAA-MM-DD`, permite navegar entre
semanas e atualiza a cada quinze segundos. Os cinco dias úteis são exibidos; trabalho recebido
no sábado/domingo também aparece. Dias sem resumo não se tornam zero ou falta. O cadastro
de horários do RH não é sobrescrito pelas batidas. O vínculo tardio por matrícula continua suportado.

## Dados enviados

`POST /api/integracao/ponto/resumos`, `Authorization: Bearer qpk_…`, `Content-Type: application/json`.
Lote com chave `resumos`, de 1 a 100 objetos. Exemplo sintético:

```json
{"resumos":[{
  "sistema":"sistema-ponto", "colaborador_id":"42", "matricula":"00157",
  "data":"2026-10-05", "versao":1, "gerado_em":"2026-10-05T20:01:00Z",
  "marcacoes":[
    {"id":"101","momento":"2026-10-05T08:00:00-03:00","acao":"entrada","local":"presencial","origem":"registro"},
    {"id":"102","momento":"2026-10-05T17:00:00-03:00","acao":"saida","local":"presencial","origem":"registro"}
  ],
  "segundos_registrados":32400, "segundos_presenciais":32400, "segundos_remotos":0,
  "segundos_nao_classificados":0, "segundos_oficiais":32400,
  "carga_esperada_segundos":28800, "saldo_segundos":3600,
  "situacao_ponto":"Crédito", "pendencias":[]
}]}
```

O exemplo possui um intervalo contínuo; almoço só é descontado quando existir na apuração do ponto.
Não copiar horários fictícios para cadastros reais.

| Campo | Significado |
|---|---|
| `colaborador_id` | ID estável do usuário no ponto; matrícula só estabelece o vínculo inicial. |
| `data` | Dia em America/Sao_Paulo, não futuro. |
| `versao` | Inteiro positivo e crescente por usuário/dia; deve sobreviver a reinícios. |
| `gerado_em` | Instante com fuso; folga máxima de 10 min para relógio adiantado. |
| `marcacoes` | Até 1000 registros, IDs únicos, em ordem de instante e ID numérico, pares entrada/saída. Lista vazia remove todas as marcas anteriores do dia. |
| `local` | presencial/remoto, proveniente de PRESENCIAL/HOME_OFFICE do ponto. |
| `origem` | registro/justificativa; nenhum texto ou documento da justificativa. |
| `segundos_registrados` | Soma dos intervalos fechados; não inclui período aberto. |
| Totais por modalidade | Se as pontas divergirem, intervalo vai para não classificados. |
| `segundos_oficiais`, carga, saldo | Valores produzidos pelo ponto, incluindo ajustes/tolerância. Não recalculados no RH. |
| `situacao_ponto` | Estado informativo da apuração oficial. |
| `pendencias` | INTERVALO_ABERTO, MODALIDADES_DIVERGENTES, JORNADA_INDEFINIDA. |

Campos extras são recusados. Não enviar CPF, nome, foto, coordenadas, IP, biometria, CID, diagnóstico,
descrição livre, imagem ou arquivo de justificativa.

## Recepção e vínculo

Resposta: `recebidos`, `aceitos`, `repetidos`, `antigos`, `sem_vinculo` (IDs externos pendentes).
O lote inteiro usa uma transação; mesmo número de versão com conteúdo diferente causa 409 e rollback.
Versão menor é reconhecida como antiga, sem sobrescrever a atual; repetição idêntica é segura.
Matrícula é normalizada sem zeros iniciais, caixa e espaços externos. Não há vínculo automático por nome.
ID externo já vinculado mantém a pessoa mesmo após mudança de matrícula. Matrícula vazia ou desconhecida
fica guardada para vínculo posterior; `sem_vinculo` precisa ser acompanhado pela equipe de cadastro.

## Produtor no ponto

Implementação: `api/ponto/integracao_rh/outbox.py`, `worker.py`, `models/integracao_rh.py` e migração
`api/migrations/002_integracao_rh.sql`. Hooks de sessão capturam inclusão, alteração e exclusão de batida,
apuração e ajuste. Mudança de dia republica ambos os dias. Alterações de jornada, afastamento, feriado,
escala e matrícula invalidam os dias conhecidos pertinentes. O commit salva o evento na mesma transação;
rollback desfaz tanto a alteração quanto a fila. Sem chamadas HTTP dentro do registro da batida.

O worker consulta a fila com `FOR UPDATE SKIP LOCKED`, envia payload imutável, confirma somente resposta
válida e tenta novamente com espera crescente (até 300 s) em caso de falha. A confirmação aceita também
eventos já recebidos ou superados. Eventos conflitantes ficam pendentes para diagnóstico, sem descarte automático.

A reconciliação horária dos últimos 7 dias recupera dias sem marcação e alterações feitas fora dos hooks.
Alterações diretas no banco em períodos mais antigos exigem reprocessamento explícito. A apuração existente
é lida, não recalculada: se o ponto mantiver um saldo desatualizado, corrija-o no próprio ponto.

## Sinal e consulta

`POST /api/integracao/ponto/sinal`:
```json
{"sistema":"sistema-ponto","pendentes":0,"ultima_entrega":"2026-10-05T20:01:02Z"}
```
`ultima_entrega` pode ser null. O sinal não substitui os dados dos dias. Sem sinal, sinal com mais de 120 s
ou pendências, o RH sinaliza sincronização incompleta. Falha de integração não comprova falta. Colaborador sem resumo individual também fica aguardando integração, mesmo com sinal global em dia.
`GET /api/integracao/ponto/status` usa a mesma chave. O painel consulta `/api/presenca` a cada 15 s;
`GET /api/jornada/{func_id}?de=AAAA-MM-DD&ate=AAAA-MM-DD` retorna até 62 dias para sessão leitor.

## Ativação e compatibilidade

1. Subir o RH atualizado, criar chave na tela Integrações e conferir matrículas.
2. Em homologação do ponto, executar a migração 002 após backup; a integração permanece desligada.
3. Configurar no ponto RH_INTEGRACAO_ENABLED=true, RH_URL, RH_API_KEY e RH_RECONCILIACAO_DIAS=7.
4. Reiniciar a API e iniciar `docker compose --profile integracao-rh up -d --build api integracao-rh`
   (o serviço da API no Compose real é `api`; confira o arquivo do ponto).
5. Conferir fila, sinal e totais conhecidos antes de repetir a implantação em produção.

A URL deve ser alcançável do contêiner do ponto; localhost é o próprio contêiner. Não publicar o PostgreSQL.
A opção --once processa uma rodada de até 100 eventos; mantenha o worker normal ativo para escoar o restante. Para carga histórica: `python -m ponto.integracao_rh.worker --once --de AAAA-MM-DD --ate AAAA-MM-DD`.
Para interromper entregas, parar o worker; para desativar também a geração, desligar a flag e reiniciar a API.
Não apagar as tabelas de versão nem a fila ao fazer rollback de aplicação: isso poderia reutilizar versões antigas.

O endpoint v2 `/api/integracao/ponto/marcacoes` permanece para emissores antigos (até 1000 batidas, IDs estáveis,
tipo entrada/saida/saida_intervalo/retorno_intervalo/auto, cancelada). Ele não contém totais oficiais.
Quando houver resumo diário, este prevalece sobre as marcas legadas na consulta daquele dia.

Migração e ativação NÃO executadas no ponto real nesta revisão. Roteiro complementar: `docs/INTEGRACAO-RH.md`
do sistema de ponto. Testes locais usaram somente bases descartáveis e dados sintéticos.
