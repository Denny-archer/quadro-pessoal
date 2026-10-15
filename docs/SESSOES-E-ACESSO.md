# Sessões e troca de senha — 1.3.1

## O que estava acontecendo

O botão Sair chamava `POST /api/auth/logout`, mas essa rota usava `COOKIE` sem importá-la após a separação dos módulos. O servidor devolvia erro 500; o cookie permanecia válido e o frontend não mostrava uma falha compreensível.

O login usava um JWT assinado, guardado no cookie `qp_sessao` com HttpOnly e SameSite=Strict, além de Secure quando habilitado. O cookie tinha Max-Age de dez horas por padrão. Cada chamada protegida validava assinatura, expiração, existência do usuário, situação ativa, versão da senha e perfil no banco. Abrir uma nova aba reutilizava o cookie do mesmo navegador e endereço. Não era a senha gravada no JavaScript nem autenticação feita apenas no frontend.

Compartilhar uma sessão entre abas é o comportamento esperado de cookies. Exigir senha por aba costuma atrapalhar a navegação sem substituir os controles do servidor. Para um RH que trata dados pessoais e financeiros, devem existir revogação efetiva, expiração por inatividade e limite absoluto, além de HTTPS na operação. A [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) recomenda esses controles.

## Comportamento atual

| Situação | Resultado |
|---|---|
| Nova aba no mesmo endereço e navegador | Reutiliza a sessão válida; o servidor continua validando cada API |
| Sair | Revoga somente essa sessão no banco, expira o cookie e avisa as outras abas da mesma origem |
| Copiar e tentar reutilizar o cookie após Sair | Acesso recusado, pois o registro da sessão foi removido |
| Outro navegador/dispositivo com sessão própria | Permanece conectado ao sair do primeiro |
| 30 minutos sem interação | O servidor recusa o acesso; as consultas automáticas de dados e presença não renovam o prazo |
| 10 horas desde o login | Sessão expira mesmo com atividade |
| Trocar a senha | Revoga as sessões anteriores e emite uma nova para o navegador atual |
| Administrador redefinir senha ou desativar usuário | Sessões desse usuário são removidas; novo acesso exige autenticação válida |
| Rede indisponível ao clicar Sair | Mostra erro e permite tentar novamente, sem afirmar que o servidor encerrou a sessão |
| Voltar pelo histórico ou reabrir aba suspensa | Revalida o acesso; dados pessoais não devem reaparecer por cache do painel |

O cookie não tem mais Max-Age/Expires no login: é um cookie de sessão do navegador. Isso **não garante** que fechar o navegador encerre imediatamente o acesso: alguns navegadores restauram cookies de sessão junto com as abas. Os prazos e a revogação do servidor continuam sendo a garantia. Veja a [documentação de cookies da MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies).

## Validação e armazenamento

O JWT contém o identificador do usuário, versão de sessão, expiração e um identificador aleatório (`jti`). Cada login cria um registro individual em `auth_sessoes`; somente o SHA-256 do identificador é armazenado nessa tabela. A assinatura por si só não concede acesso: o registro precisa existir, estar dentro dos dois prazos e pertencer ao usuário ativo com a versão atual. O perfil é lido do banco em cada requisição.

GETs de dados, `/api/auth/eu` e sondagens de presença validam sem renovar a inatividade. Interações de teclado, toque, clique ou rolagem são agrupadas pelo frontend em `POST /api/auth/atividade`, no máximo uma vez por minuto por aba visível. Alterações autenticadas também renovam a atividade. Uma sessão já expirada não pode ser reativada por esse endpoint. Qualquer controle no navegador complementa a verificação obrigatória no servidor.

Tokens e senhas não são gravados em localStorage/sessionStorage. BroadcastChannel e os eventos de storage comunicam apenas logout e atividade, sem credenciais. A sessão é compartilhada por cookie; o aviso entre abas serve para retirar a tela imediatamente. O servidor decide o acesso mesmo se esse aviso estiver indisponível. Sem rede, o navegador também oculta os dados e retorna ao login após o limite de inatividade local. Atividade confirmada em outra aba é compartilhada para não encerrar uma tela enquanto o usuário trabalha em outra.

## Configuração e atualização

```dotenv
SESSAO_HORAS=10
SESSAO_INATIVIDADE_MINUTOS=30
COOKIE_SEGURO=true
```

Use `COOKIE_SEGURO=false` somente no ambiente de testes HTTP. Em produção, acessar por HTTPS e manter `true`. Os limites aceitos são 1–24 horas e 1–120 minutos. O limite absoluto não é prorrogado pelas interações.

O schema v4 cria `auth_sessoes` e permite o evento logout na auditoria, conservando os dados existentes. É aplicado automaticamente na inicialização, com o lock transacional já usado pelo projeto. Não é preciso restaurar banco nem remover volumes. Sessões da versão anterior não possuem registro individual e exigem um novo login após a atualização. A integração com o ponto continua usando suas próprias chaves e não muda.

```sh
docker compose up -d --no-deps --build --wait app
```

## Interface e manutenção

A troca de senha tem campos de senha atual, nova e confirmação, opções Mostrar/Ocultar, indicação de Caps Lock, erros associados ao campo, foco de teclado e bloqueio de envio repetido. Cancelar ou concluir limpa os campos. O limite continua sendo mínimo de dez caracteres e máximo de 72 bytes, conforme bcrypt. Nenhum gerenciador de senhas é bloqueado.

Código: `backend/app/core/seguranca.py`, `backend/app/api/auth.py`, `frontend/scripts/core/sessao.js`, `frontend/scripts/features/conta.js`, `features/conta/validacao.js` e `frontend/styles/features/conta.css`. Testes de API ficam em `backend/tests/test_api.py`; validação do formulário e retorno seguro em `frontend/tests/conta-sessao.test.js`.
