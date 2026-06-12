# Backend da rastreabilidade

## Objetivo

Consolidar dados de rastreabilidade dos requisitos do projeto para alimentar a futura aba de Rastreabilidade.

## Endpoints

- `GET /api/projects/:projectId/traceability/requirements-matrix`
- `GET /api/projects/:projectId/traceability/requirements/:requirementId`

## Regras

- Progresso = tarefas concluídas / tarefas vinculadas.
- Evidência técnica = existência de pull request ou commit nas tarefas vinculadas.
- Issues são exibidas como artefatos relacionados, mas não comprovam implementação sozinhas.
- A matriz retorna uma linha por requisito com totais de tarefas, issues, pull requests, commits, progresso e situação.
- A cadeia completa retorna requisito, tarefas e artefatos relacionados para montagem futura do fluxograma.

## Limitações

- Não cria novos vínculos.
- Não altera banco.
- Não implementa tela visual.
