# RF12 — Relacionar tarefas a issues

## Objetivo

Permitir que tarefas sejam vinculadas a issues importadas do GitHub.

## Decisão de escopo

No MVP, uma tarefa pode ter várias issues vinculadas. Uma issue também pode estar vinculada a mais de uma tarefa, desde que pertença ao mesmo projeto.

## Backend

- Tabela associativa `TaskIssue`.
- Endpoint para listar issues vinculadas a uma tarefa.
- Endpoint para vincular issue à tarefa.
- Endpoint para remover vínculo entre tarefa e issue.
- Validação para impedir vínculo entre projetos diferentes.
- Bloqueio de vínculo duplicado entre a mesma tarefa e a mesma issue.
- Indicador de cobertura com issues.
- Busca de issues por número ou título, aceitando formatos como `1`, `01`, `#1` e `#01`.

## Frontend

- Busca dinâmica de issues por número ou título no formulário de tarefa.
- Vinculação de múltiplas issues por tarefa.
- Remoção individual de vínculos com issues.
- Exibição de issues vinculadas na tela de tarefas.
- Exibição resumida da rastreabilidade no Kanban.
- Exibição detalhada das issues no detalhe da tarefa no Kanban.
- Indicador de cobertura com issues na tela de tarefas.

## Métrica

`(Tarefas com pelo menos uma issue vinculada / total de tarefas) x 100`.

## Limitações

- Não há vínculo automático com issues.
- Não há sugestão automática.
- Não há análise automática de labels.
- Não há vínculo com casos de teste ou defeitos neste requisito.
