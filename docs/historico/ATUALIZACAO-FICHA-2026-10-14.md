# Atualização da ficha e da folha — 1.3.0

Implementação das funcionalidades do HTML de referência, conservando os horários e horas provenientes do sistema de ponto na mesma tabela Jornada semanal.

Entregue: campos de titulação, anuênio, dependentes e descontos; histórico de nível e gratificação por vigência; contracheque estimado; férias/recesso por período com saldo e memória do recibo; diária por viagem; relatório estimado com CSV, XLSX e impressão. Campos novos e histórico persistem nos JSONB extras já existentes. Modelos CSV/XLSX e documentação foram atualizados. Consulte [Folha e férias](../FOLHA-E-FERIAS.md).

## Verificação

- 65 testes Python passaram, incluindo API com PostgreSQL descartável, auditoria, validação de campos e regras, importação e regressões existentes.
- 41 testes JavaScript passaram, incluindo vigência futura, proporcionalidade comercial, histórico intermediário, recibos simples/em dobro, exportações e 12 regressões da ficha com ponto.
- Integração HTTP real com o worker do ponto aprovada em dois bancos isolados: eventos versionados, modalidades, horas oficiais, reenvio após indisponibilidade, idempotência e exclusão. As sete regressões do worker também passaram.
- Navegador aprovado com dados sintéticos: gravar e recarregar campos, cadastrar/excluir mudança, editar férias e diária, recusar fracionamento inválido, consultar recesso, exportar CSV/XLSX, imprimir, tema claro/escuro, largura de 390 px e perfil leitor.
- XLSX aberto com openpyxl: seis abas legíveis, valores numéricos e ausência de fórmulas. CSV neutraliza nomes iniciados por operadores de fórmula.
- Imports dos módulos e links locais da documentação conferidos; CSS fixo externo. A única aplicação de largura calculada continua por CSSOM.
- Imagem Docker construída e aplicação saudável com dois processos no ambiente isolado.

O cálculo de férias vencidas foi corrigido em relação ao HTML: remuneração dobrada para os dias vencidos, com base previdenciária sobre a parte simples. O schema, as rotas e o módulo da integração com ponto e os cálculos existentes de benefícios foram preservados. Os testes não usaram bancos de desenvolvimento nem dados pessoais reais. `.env`, dados, backups e arquivos do sistema de ponto não foram alterados.

## Aplicar no servidor

Depois de publicar estas alterações no Git e atualizar o checkout do servidor, reconstruir apenas a aplicação:

```sh
docker compose up -d --no-deps --build --wait app
```

Não restaurar banco nem remover volumes para esta atualização. Esta entrega modifica o checkout local; publicação Git e implantação no servidor são etapas separadas.
