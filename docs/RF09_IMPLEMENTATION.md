# RF09 — Relacionar tarefas a pull requests

## Objetivo

Permitir que tarefas sejam vinculadas a pull requests importados do GitHub, criando a rastreabilidade mínima entre planejamento e implementação técnica.

## Decisão de escopo

No MVP, cada tarefa pode ter no máximo um pull request vinculado.

- Uma tarefa pode ter 0 ou 1 pull request vinculado.
- Um pull request pode estar vinculado a várias tarefas.
- O vínculo só é permitido quando tarefa e pull request pertencem ao mesmo projeto.

## Backend

- Campo opcional `pullRequestId` adicionado ao model `Task`.
- Relação `Task -> PullRequest` configurada com `onDelete: SetNull`.
- Endpoint `PATCH /api/tasks/:taskId/pull-request` para vincular ou substituir o pull request da tarefa.
- Endpoint `DELETE /api/tasks/:taskId/pull-request` para remover o vínculo.
- Endpoint `GET /api/projects/:projectId/traceability/pull-request-coverage` para o indicador do RF09.
- Listagens de tarefas e Kanban retornam dados básicos do pull request vinculado.

## Frontend

- O formulário de tarefa permite selecionar um pull request importado.
- A listagem de tarefas mostra o pull request vinculado, status e link para o GitHub.
- O Kanban mostra o pull request vinculado em formato compacto.
- A tela de tarefas permite remover o vínculo com o pull request.
- A tela de tarefas exibe a cobertura de rastreabilidade com pull requests.

## Métrica

```txt
(Tarefas com pull request vinculado / total de tarefas) x 100
```

Se o projeto não possuir tarefas, a cobertura retornada é `0`.

## Limitações

- Não há múltiplos pull requests por tarefa no MVP.
- Não há vínculo com commits ou issues neste requisito.
- Não há sugestão automática de vínculo.
- O RF09 usa pull requests já importados pela sincronização GitHub existente.
