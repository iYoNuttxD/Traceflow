# Exclusão segura de tarefas e requisitos

## Objetivo

Permitir excluir tarefas e requisitos sem remover artefatos técnicos importados do GitHub.

## Exclusão de tarefa

- Remove a tarefa.
- Remove vínculos com commits e issues.
- Remove o vínculo com pull request junto com a tarefa.
- Remove movimentações do Kanban relacionadas à tarefa.
- Recalcula o status do requisito antigo, quando houver.
- Não remove requisito.
- Não remove pull requests, commits, issues ou artefatos GitHub importados.

## Exclusão de requisito

- Desvincula tarefas associadas ao requisito.
- Remove o requisito.
- Mantém as tarefas cadastradas.
- Não remove artefatos GitHub importados.

## Segurança

- Confirmação obrigatória no frontend.
- Exclusões executadas em transações no backend.
- Artefatos técnicos importados permanecem preservados.
