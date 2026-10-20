# Folha estimada, histórico e férias

Disponível a partir da versão 1.3.0. A jornada semanal continua exibindo as batidas e horas recebidas do sistema de ponto, com atualização a cada quinze segundos. Esta atualização não modifica o contrato da integração nem cria horários previstos a partir das batidas.

## Cadastro e histórico

Editar funcionário permite informar titulação (0, 7,5, 10 ou 12,5%), anuênio (0 a 50%), dependentes para IR (0 a 20), outros descontos mensais e participação sindical. Ausência desses campos mantém os cadastros anteriores compatíveis.

Ao alterar nível salarial ou gratificação de um funcionário existente, informe a vigência e o ato. A ficha exibe o histórico; o cálculo consulta o estado vigente em cada data. Uma mudança futura não altera os valores anteriores. O mês da mudança distribui salário e gratificação por dias comerciais, totalizando trinta dias. Excluir uma mudança exige confirmação e restaura o valor anterior, ou corrige a sequência quando houver mudança posterior.

As regras de benefícios conservam os valores cadastrados e acrescentam desconto percentual de transporte, mensalidade sindical e diária padrão. O valor unitário de uma viagem pode substituir a diária padrão. A importação de funcionários aceita os novos campos financeiros; a de lançamentos aceita valor da diária.

## Férias e recesso

A ficha mostra os períodos aquisitivos existentes e gera os posteriores com base na admissão. Exibe dias gozados, programados, vendidos e saldo a programar. O cadastro de férias verifica sobreposição, saldo, fracionamento e janela concessiva. Registros antigos sem período aquisitivo continuam editáveis. Recesso de estágio conserva suas regras próprias e a bolsa remunerada.

Expandir uma parcela mostra a memória do recibo estimado: remuneração na data de início, férias, adicional de um terço, abono, descontos e líquido. O recibo é uma simulação; não registra pagamento. A folha do mês desconta o gozo das férias para evitar somar a mesma remuneração ao recibo separado. Dias vencidos são remunerados em dobro; o adicional da dobra fica fora da base previdenciária, conforme a [tabela de incidência da Receita](https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/pagamentos-e-parcelamentos/emissao-e-pagamento-de-darf-das-gps-e-dae/calculo-de-contribuicoes-previdenciarias-e-emissao-de-gps/tabela-de-incidencia-de-contribuicao) e o [art. 137 da CLT](https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452compilado.htm).

## Relatório

A aba Relatório de folha apresenta proventos, descontos, bases, encargos estimados, férias e diárias. A ficha também apresenta contracheque estimado. CSV exporta o resumo; XLSX contém as abas contábeis e valores numéricos; impressão expande os contracheques. Esta versão não importa folha efetivamente paga nem substitui a conferência da contabilidade. Horas extras do ponto não se transformam automaticamente em rubricas de pagamento.

Os cálculos usam os parâmetros do HTML de referência: tabelas de INSS e IRRF de 2026, FGTS de 8% (2% para aprendiz), além dos encargos informados no modelo. O truncamento do INSS por faixa reproduz o documento fornecido. Para outra competência fiscal, revisar `frontend/scripts/features/folha/regras.js` e os testes antes de utilizar os resultados.

Fontes oficiais consultadas para os parâmetros de 2026: [INSS](https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal), [tabelas da Receita Federal](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026) e [exemplos da Receita](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/exemplos-de-aplicacao-da-lei-15-270-2025).

## Manutenção e armazenamento

| Parte | Arquivo ou pasta |
|---|---|
| Validação dos novos campos | `backend/app/schemas/folha.py` |
| Persistência no documento do funcionário | `backend/app/services/mapping.py` |
| Histórico e cálculos por vigência | `frontend/scripts/features/remuneracao.js` |
| Exclusão consistente do histórico | `frontend/scripts/features/funcionarios/historico.js` |
| Férias, recesso e recibos | `frontend/scripts/features/ferias.js` |
| Relatório e exportações | `frontend/scripts/features/folha.js` e `features/folha/` |
| CSS externo | `frontend/styles/features/folha.css` |
| Regressões | `backend/tests/test_folha.py`, `test_api.py`, `test_importacao.py` e `frontend/tests/folha.test.js` |

Campos financeiros e histórico são armazenados em `funcionarios.extra`; o valor da diária em `ocorrencias.extra`. As regras ficam em `config/beneficios`. A API mantém os mesmos endpoints, permissões e auditoria. Não há migração de banco; não é necessário executar schema nem restaurar dados para atualizar a aplicação. Administradores e editores podem alterar cadastros; leitores somente consultam e exportam.
