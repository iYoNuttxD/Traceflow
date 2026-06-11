# RF11 — Relacionar tarefas a commits

## Objetivo

Permitir que tarefas sejam vinculadas a commits importados do GitHub, ampliando a rastreabilidade técnica da tarefa.

## Decisão de escopo

No MVP, uma tarefa pode ter vários commits vinculados. Um commit também pode estar vinculado a mais de uma tarefa, desde que pertença ao mesmo projeto.

## Backend

- Tabela associativa `TaskCommit`.
- Endpoint para listar commits vinculados a uma tarefa.
- Endpoint para vincular commit a uma tarefa.
- Endpoint para remover vínculo entre tarefa e commit.
- Validação para impedir vínculo com commit de outro projeto.
- Validação para impedir vínculo duplicado entre a mesma tarefa e o mesmo commit.
- Indicador de cobertura com commits por projeto.
- Busca opcional de commits por SHA, mensagem, autor ou branch.

## Frontend

- Busca dinâmica de commits por SHA ou mensagem no formulário de tarefa.
- Vinculação de múltiplos commits por tarefa.
- Remoção individual de vínculos com commits.
- Busca dinâmica de pull requests por número ou título, mantendo PR único por tarefa.
- Exibição de PR, commits e issues vinculados na tela de tarefas após a evolução do RF12.
- Exibição resumida da rastreabilidade no Kanban.
- Exibição detalhada de PR, commits e issues no detalhe da tarefa no Kanban após a evolução do RF12.
- Indicador simples de cobertura com commits na tela de tarefas.

## Métrica

`(Tarefas com pelo menos um commit vinculado / total de tarefas) x 100`.

## Limitações

- Não há vínculo automático com commits.
- O vínculo com issues é tratado separadamente pelo RF12.
- Não há sugestão automática por branch, mensagem de commit ou IA.
