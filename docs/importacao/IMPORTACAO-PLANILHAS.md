# Estrutura das planilhas de importação

> Gerado a partir de `backend/app/importacao/modelos.py` — a mesma definição que o sistema usa para validar.
> Com o sistema no ar, a versão sempre atualizada fica em **/importacao.html** e os modelos em
> **/api/importacao/modelos/<tipo>.xlsx|csv**. Cópias dos modelos: [`docs/importacao/modelos/`](modelos).

## Regras gerais

- **Formatos:** `.xlsx` (lê a aba com o nome do tipo — `funcionarios` ou `lancamentos` — ou a primeira aba que não seja
  `instrucoes`) e `.csv` (separador `;`, `,` ou tab, detectado sozinho; UTF-8 ou Windows-1252). `.xls` antigo não é aceito.
- **Cabeçalho:** na primeira linha (o sistema procura nas 10 primeiras). Ordem das colunas livre; maiúsculas, acentos,
  espaços e pontuação nos nomes das colunas são ignorados (`Data de Início` = `data_de_inicio` = `inicio`).
- **Colunas desconhecidas** são ignoradas e listadas no resultado.
- **Datas:** `dd/mm/aaaa`, `dd/mm/aa`, `aaaa-mm-dd` ou data nativa do Excel. **Números:** `1.234,56` ou `1234.56`.
  **Horários:** `HH:MM`. **Sim/não:** `sim`, `s`, `x`, `não`, `n`.
- **Célula vazia não apaga** informação que já existe no cadastro.
- **Duas etapas:** *Validar* (cadastros não são alterados; o plano e a auditoria da prévia ficam armazenados por até 24 h; mostra novos, atualizações, ignorados e erros por linha) → *Confirmar*
  (grava tudo numa única transação). Linhas com erro ficam de fora; o resto entra.
- **Limites:** 10 MB por arquivo (`TAMANHO_MAX_UPLOAD_MB`) e 20.000 linhas.
- **LGPD:** não informe CID nem diagnóstico. Colunas `cid`/`diagnostico` são descartadas com aviso.

## 1. Funcionários — `funcionarios`

Cada linha é um funcionário. **Chave:** `matricula`. Se a matrícula existe, o cadastro é **atualizado** só nas colunas
preenchidas. Sem matrícula, o sistema procura pelo **nome exato** (sem diferenciar acentos/maiúsculas). Se não achar,
**cria** um novo (exige `nome` e `vinculo`).

Regras de consistência:
- `estagiario` e `aprendiz` exigem `contrato_inicio` e `contrato_fim` (término não pode ser antes do início).
- `usa_transporte = sim` exige `valor_transporte`; informar só o valor já marca `usa_transporte`.
- Matrícula repetida na planilha → a segunda linha é recusada. Nome igual a cadastro com outra matrícula → recusada.
- A grade semanal do regime **Híbrido** (dias P/H/M e horários) é definida na ficha, não na planilha.
- Benefícios adicionais, saldos de abono e períodos aquisitivos de férias são mantidos pelo sistema/tela.

| Coluna | Obrigatória | Formato / valores aceitos | Exemplo | Também aceita como cabeçalho |
|---|---|---|---|---|
| `matricula` |  | Matrícula. É a chave: se já existir, o cadastro é atualizado. | 157 | mat, matricula_funcional |
| `nome` | sim | Nome completo. | Maria da Silva Souza | nome_completo, colaborador, funcionario, servidor |
| `vinculo` | sim | efetivo  /  comissionado  /  cedido  /  estagiario  /  aprendiz | efetivo | tipo_de_vinculo |
| `situacao` |  | ativo  /  cedido  /  inativo (padrão: ativo) | ativo |  |
| `admissao` |  | Data de admissão (dd/mm/aaaa). | 01/03/2016 | data_de_admissao, data_admissao |
| `cargo` |  | Cargo base (do concurso). | Assistente Administrativo | cargo_base |
| `setor` |  | Setor / lotação. | DAGEP | lotacao, unidade |
| `regime` |  | Presencial  /  Híbrido  /  Teletrabalho (padrão: Presencial). A grade semanal do híbrido é definida na tela. | Presencial |  |
| `carga_horaria` |  | Carga horária semanal em horas. | 40 | carga, carga_horaria_semanal, ch |
| `intervalo_min` |  | Intervalo de almoço em minutos (padrão 60). | 60 | intervalo |
| `entrada` |  | Horário de entrada presencial (HH:MM). | 08:00 |  |
| `saida` |  | Horário de saída presencial (HH:MM). | 17:00 |  |
| `entrada_ho` |  | Entrada no home office (teletrabalho). |  | entrada_home_office |
| `saida_ho` |  | Saída do home office (teletrabalho). |  | saida_home_office |
| `usa_transporte` |  | Utiliza auxílio-transporte? sim  /  não | sim | auxilio_transporte, vale_transporte |
| `valor_transporte` |  | Valor mensal do auxílio-transporte (R$). | 440,00 | valor_auxilio_transporte |
| `funcao` |  | Cargo em comissão ou função gratificada. | Chefe do Setor de Transportes |  |
| `funcao_tipo` |  | comissao  /  fg | comissao | tipo_funcao |
| `nivel` |  | Nível da comissão: I a VI. | II | nivel_comissao |
| `portaria` |  | Portaria de nomeação. | Port. 18/2026 | portaria_funcao, portaria_de_nomeacao |
| `ingresso` |  | Edital / portaria do concurso. | Edital nº 1/2024 |  |
| `orgao_origem` |  | Órgão de origem (cedidos). |  |  |
| `cedido_para` |  | Órgão de destino (situação cedido). |  |  |
| `jornada_diaria` |  | Estágio/aprendizagem: 4 ou 6 horas. |  |  |
| `instituicao` |  | Instituição de ensino (estágio/aprendizagem). |  | instituicao_de_ensino |
| `contrato_inicio` |  | Início do contrato (estágio/aprendizagem, obrigatório para eles). |  | inicio_contrato, inicio_do_contrato |
| `contrato_fim` |  | Término do contrato (estágio/aprendizagem, obrigatório para eles). |  | termino_contrato, fim_contrato, termino_do_contrato |
| `providencia` |  | Providência pendente do contrato. |  |  |
| `carreira` |  | analista  /  tecnico  /  apoio (vazio = automática pelo cargo). |  |  |
| `nivel_salarial` |  | Nível salarial 1 a 30 (vazio = pelo tempo de casa). |  |  |
| `fg_tipo` |  | chefia  /  assessor2  /  assessor1 (vazio = automática). |  |  |
| `bolsa_tipo` |  | Estagiário: medio4  /  tecnico6  /  advocacia6  /  superior6  /  pos6 |  |  |
| `titulacao_pct` |  | Adicional de titulação: 0  /  7,5  /  10  /  12,5 (%). | 0 | titulacao |
| `anuenio_pct` |  | Anuênio: percentual do salário base (0 a 50). | 0 | anuenio |
| `dependentes_ir` |  | Quantidade de dependentes para IR (0 a 20). | 0 |  |
| `outros_descontos` |  | Outros descontos fixos mensais (R$). | 0 |  |
| `sindicalizado` |  | Paga mensalidade sindical? sim  /  não. | não |  |

## 2. Lançamentos — `lancamentos`

Cada linha é uma ocorrência de um funcionário. **Identificação do funcionário:** `matricula` (preferencial) ou `nome`.
O nome pode ser parcial se identificar uma única pessoa (ex.: "Victor Diniz" → "Victor Diniz Felippe Ferrari"), e nesse caso sai um
aviso para conferência. Nome que serve a mais de uma pessoa é recusado.

| `tipo` | Como o sistema trata |
|---|---|
| `ferias` | período `inicio`–`fim` em dias corridos; aceita `parcela`, `abono_pecuniario` (0–10), `aviso_ferias` |
| `atestado` | `periodo`: `integral` (padrão, conta todos os dias), `matutino`/`vespertino` (meio período: não conta dia de afastamento nem desconta auxílio; grava 4 h) ou `comparecimento` (declaração: não conta dia) |
| `abono` | dia(s) de abono/folga; `referencia_abono` (ex.: `ref2025`) vincula ao saldo anual; `status_abono` padrão: `gozado` se a data já passou, `agendado` se é futura |
| `viagem` | `destino` e `diarias`; viagens acima do limite das regras descontam auxílio-alimentação; todas descontam transporte |
| `capacitacao` | `destino` = curso/evento; `horas` se for parcial |
| `banco_horas` | `horas` obrigatória (+ crédito, − débito); vale para o dia de `inicio` |

- **Duplicados:** mesma pessoa + mesmo tipo + mesmo início + mesmo término de um lançamento já existente → ignorado
  (pode reenviar a mesma planilha sem duplicar). Linha repetida dentro do arquivo também é ignorada.
- **Avisos (entram, mas merecem conferência):** sobreposição com lançamento do mesmo tipo em outras datas,
  atestado/abono/viagem durante férias, funcionário inativo, coluna que não se aplica ao tipo.
- **Erros (ficam de fora):** funcionário não encontrado ou ambíguo, data inválida, término antes do início,
  período acima de 400 dias, banco de horas sem horas.

| Coluna | Obrigatória | Formato / valores aceitos | Exemplo | Também aceita como cabeçalho |
|---|---|---|---|---|
| `valor_diaria` |  | Valor unitário da diária de viagem (R$); vazio usa o padrão das regras. |  |  |
| `matricula` |  | Matrícula do funcionário (preferencial para identificar). | 157 | mat |
| `nome` |  | Nome do funcionário (usado se não houver matrícula). | Maria da Silva Souza | nome_completo, colaborador, funcionario, servidor |
| `tipo` | sim | ferias  /  atestado  /  abono  /  viagem  /  capacitacao  /  banco_horas | atestado | tipo_de_lancamento, ocorrencia |
| `inicio` | sim | Data de início (dd/mm/aaaa). | 10/06/2026 | data, data_inicio, data_de_inicio, de |
| `fim` |  | Data de término (vazio = mesmo dia do início). | 10/06/2026 | termino, data_fim, data_de_termino, ate |
| `periodo` |  | Só atestado: integral  /  matutino  /  vespertino  /  comparecimento (padrão integral). | integral | turno |
| `horas` |  | Banco de horas (obrigatório: + crédito, − débito) ou horas parciais de abono/capacitação. |  |  |
| `destino` |  | Viagem/capacitação: destino, evento ou curso. |  | curso, evento, local |
| `diarias` |  | Viagem: quantidade de diárias. |  | qtd_diarias |
| `parcela` |  | Férias: 1ª, 2ª ou 3ª parcela. |  |  |
| `abono_pecuniario` |  | Férias: dias vendidos (0 a 10). |  | dias_vendidos |
| `aviso_ferias` |  | Férias: aviso / número do processo. |  | processo |
| `referencia_abono` |  | Abono: ano de referência (ref2024, ref2025, folgas2026...). Vincula ao saldo. |  |  |
| `status_abono` |  | Abono: agendado  /  gozado (padrão: gozado se já passou). |  |  |
| `obs` |  | Observação livre. NÃO informe CID ou diagnóstico. |  | observacao, observacoes |

### Exemplo (CSV)

```csv
matricula;nome;tipo;inicio;fim;periodo;horas;destino;diarias;parcela;abono_pecuniario;aviso_ferias;referencia_abono;status_abono;obs
157;Maria da Silva Souza;ferias;06/07/2026;20/07/2026;;;;;1ª;0;;;;
157;;atestado;10/06/2026;;vespertino;;;;;;;;;
49;;abono;15/06/2026;;;;;;;;;ref2025;gozado;
49;;viagem;21/09/2026;23/09/2026;;;Fortaleza/CE;2,5;;;;;;
49;;banco_horas;18/09/2026;;;-8;;;;;;;;folga compensada
```


## Garantias adicionais da revisão

- Em lançamentos, `tipo` e `inicio` são obrigatórios em cada linha, além do cabeçalho.
- Matrícula informada e desconhecida não faz fallback por nome; matrículas normalizadas ambíguas são recusadas.
- Nome parcial precisa conter termos identificadores; somente preposições não identificam uma pessoa.
- Números devem ser finitos; valores de carga, intervalo, transporte e diárias respeitam os limites do cadastro.
- A confirmação revalida duplicatas de ocorrência e preserva campos alterados na tela após a prévia.
- Cadastro excluído depois da prévia causa conflito; não é recriado silenciosamente.
- Cada documento alterado tem antes/depois na auditoria, além do registro do lote.
- Prévia expira em 24 horas e precisa ser validada novamente. Confirmar é atômico; erros de banco desfazem o lote.


Os campos opcionais de folha são `titulacao_pct`, `anuenio_pct`, `dependentes_ir`, `outros_descontos` e `sindicalizado`. O histórico de progressões permanece no cadastro e não é substituído por uma planilha. Viagens também aceitam `valor_diaria`, combinado com `diarias`. Consulte [Folha e férias](../FOLHA-E-FERIAS.md).
