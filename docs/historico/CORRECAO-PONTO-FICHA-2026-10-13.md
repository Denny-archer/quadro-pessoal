# Ponto na ficha do colaborador — 13/10/2026

As batidas eram exibidas no Panorama, mas a ficha apresentava apenas a jornada prevista no cadastro.
A ficha não consumia a rota de apuração diária já existente. Com horários de cadastro vazios,
essa tabela mostrava zero horas mesmo quando o ponto tinha registrado um dia trabalhado.

A versão 1.2.1 acrescenta **Jornada semanal · ponto realizado** antes da jornada prevista. São exibidos
os sete dias da semana, as batidas no horário de Brasília, horas por modalidade, horas registradas,
horas oficiais, carga informada pelo ponto, saldo e pendências. O usuário pode escolher a semana.
Os totais oficiais permanecem os do ponto, mesmo quando diferem da duração entre batidas.

A consulta atualiza a cada quinze segundos enquanto a ficha está ativa e visível. Respostas antigas
são descartadas ao trocar de colaborador ou semana. Falhas de rede exibem aviso e permitem tentar
novamente; dados ausentes não se tornam falta ou zero horas. Os horários previstos do RH continuam
independentes e identificados como **Jornada semanal prevista**.

O endpoint de jornada resolve o vínculo por matrícula antes da consulta, usando a regra existente
de identificação estável. Isso cobre resumos que chegaram antes do cadastro da matrícula, mesmo
quando o colaborador é aberto diretamente na aba Funcionários.

Validação em Docker e PostgreSQL 16 descartável: **37 testes do backend e 22 testes JavaScript
passaram**, incluindo vínculo tardio, correções versionadas, horários em Brasília, conservação dos
totais do ponto, dias sem apuração, resposta atrasada e falha de rede. O navegador reproduziu o caso
de 08:34 a 14:34 com 06:00 registradas, sem horários previstos no cadastro; também foram conferidos
o clique na presença, troca de colaborador, navegação semanal, atualização automática, perfil leitor,
tema escuro, celular e impressão. Todos os cadastros usados na validação eram sintéticos.

Não há migração de schema, alteração do sistema de ponto ou recarga dos dados existentes. A
atualização local recria somente o aplicativo do RH; o banco e o serviço de backup permanecem ativos.

## Ajuste de apresentação — versão 1.2.2

Após esclarecer o formato desejado, foi removida a tabela adicional da versão 1.2.1.
A única tabela Jornada semanal mantém as cinco colunas originais: Dia, Formato, Presencial,
Home office e Horas. Os períodos de entrada/saída recebidos do ponto preenchem Presencial e
Home office; Horas mostra o valor oficial do ponto. Os períodos de cadastro não são alterados.
A navegação por semana, atualização automática e tratamento de falhas continuam disponíveis.
