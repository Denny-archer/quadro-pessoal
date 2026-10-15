# Conta e sessão — versão 1.3.1

O botão Sair falhava com erro 500 porque a rota de logout usava uma constante sem importá-la. A troca de senha renderizava inputs com o estilo padrão do navegador. O cookie anterior durava dez horas e era compartilhado entre abas, sem controle individual de revogação ou inatividade.

## Alterações

- Formulário com três campos alinhados, confirmação, mostrar/ocultar, aviso de Caps Lock, erros por campo, foco acessível, layout móvel e proteção contra envio repetido. Campos são limpos ao cancelar ou concluir.
- Logout revoga o registro individual no servidor, limpa o cookie e informa outras abas, inclusive a página de importação. Falha de rede mantém opção de tentar novamente.
- Cookie HttpOnly, SameSite=Strict, Secure conforme ambiente e sem persistência explícita. JWT assinado e registro de sessão no banco são obrigatórios em cada API.
- Expiração padrão de 30 minutos sem interação e limite absoluto de dez horas. Polling, checagem de sessão e presença não renovam a inatividade. Uma sessão já expirada não é reativada por atividade.
- Troca de senha revoga sessões antigas; o navegador atual recebe uma nova. Outros navegadores não são encerrados por um logout simples.
- HTML e APIs não armazenam respostas em cache. Retorno pelo histórico revalida a sessão. Tokens não são armazenados em localStorage/sessionStorage.
- Schema v4 acrescenta `auth_sessoes` e o evento de auditoria `logout`; não remove cadastros nem altera a integração com o ponto. Sessões anteriores exigem novo login.

## Validação

- 74 testes Python aprovados, incluindo logout, cookie copiado, sessões independentes, prazo absoluto, inatividade, polling, senha, perfis, auditoria e reexecução do schema.
- 45 testes JavaScript aprovados, incluindo limites Unicode de senha, confirmação, retorno seguro do login e prevenção de renovação em ciclo entre abas, além das regressões de folha, benefícios e ponto.
- Integração HTTP com o worker do ponto aprovada em bancos descartáveis: versões, horas, modalidades, reenvio, idempotência e exclusão.
- Navegador aprovado com usuários sintéticos: tema claro/escuro, 390 px, validações, mostrar/ocultar, Caps Lock, cancelamento, gravação única, senha alterada, cookie de sessão, nova aba, logout simultâneo em painel/importação, fallback sem BroadcastChannel, rede indisponível e expiração com formulário aberto.
- Relógio do navegador acelerado para confirmar que dois minutos de polling sem interação não enviam atividade; uma interação posterior envia um único registro. Sem rede nas APIs, trinta e um minutos de inatividade local retiram o painel da tela e levam ao login.

Implementação e orientação operacional: [Sessões e acesso](../SESSOES-E-ACESSO.md). Os testes usam somente PostgreSQL temporário; `.env`, dados do RH e arquivos do ponto são preservados. A publicação Git e a implantação no servidor são etapas separadas da atualização local.
