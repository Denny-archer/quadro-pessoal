# Validação da integração — 15/10/2026

Ambiente: cópia isolada do código, PostgreSQL 16 descartável, Python 3.12, FastAPI 0.115.12 e dois processos Uvicorn. Nenhum banco da instalação em uso foi usado para os testes.

## Resultados

- 85 testes Python passaram: regressões existentes, autorização de RH e demandas, conta sem vínculo, gestão multissetor, senha provisória, histórico de lotação, exclusão lógica, cópia de modelos, revogação em sessão existente, formulário legado e modo de manutenção administrativa.
- 45 testes JavaScript existentes passaram, incluindo folha estimada, férias, jornada, exportações e sessão.
- Todos os arquivos JavaScript passaram na verificação de sintaxe; módulos Python e migrações compilaram.
- Ensaio de migração legado sintético preservou IDs, matrículas e valores; converteu perfis de forma restritiva; deixou setores duplicados sem associação automática; reexecução não duplicou a migração.
- HTTP real comprovou processos distintos, notificação autorizada em aproximadamente um segundo, ausência de evento de demanda alheia, concorrência com resultados 200/409 e encerramento do stream após logout.
- Conferência no navegador: login único, demanda manual, meta 5W2H, administração compartilhada, retorno ao RH e visão pessoal de colaborador sem controles de alteração.

O dump completo foi restaurado em outra base descartável. A comparação integral confirmou conteúdo idêntico em 16 tabelas de RH, demandas, vínculos e histórico, incluindo metas, modelos e etapas.

## Limites da validação

Não foi validado o proxy HTTPS definitivo da empresa, o dimensionamento para a carga real nem o mapeamento de contas e lotações reais. A liberação depende dessas conferências. O backend e o frontend de produção não carregam os dados sintéticos: eles são criados somente pelo preparador nominalmente restrito à base de testes.

Há um aviso de depreciação na suíte Python; ele não impediu os testes. O inventário financeiro e os cálculos estimados existentes foram preservados, sem criação de contracheques oficiais.
