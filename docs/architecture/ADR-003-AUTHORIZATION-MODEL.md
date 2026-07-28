# ADR-003 — Modelo de autorização

- **Estado:** aceita na E6
- **Data:** 24/07/2026

## Decisão

`ProjectMembership` vincula `User` e `Project` com `OWNER`, `MANAGER`, `MEMBER` ou `VIEWER`. A política é deny-by-default e resolve o projeto antes de acessar recursos filhos (`Requirement`, `Task`, `Commit`, `PullRequest`, `Issue` e sugestões). Ausência de membership retorna `404` para reduzir enumeração; membership existente sem papel suficiente retorna `403`.

| Operação | VIEWER | MEMBER | MANAGER | OWNER |
|---|---:|---:|---:|---:|
| leitura do projeto e artefatos | sim | sim | sim | sim |
| requisitos, tarefas, vínculos e Kanban | não | sim | sim | sim |
| sincronização GitHub | não | não | sim | sim |
| membros, convites e configuração GitHub | não | não | não | sim |

Criação de projeto e membership OWNER são uma transação. Listagem de projetos é filtrada por membership. O ator de `TaskMovement` passa a ser o usuário da sessão. `ProjectMember`, `movedBy` e `projectMemberId` permanecem apenas para compatibilidade expand/backfill/switch; não são prova de identidade.

O único endpoint `501` restante é `DELETE /api/projects/:id`: sem sessão retorna `401`; autenticado continua `501`. O middleware não implementa a exclusão.

## Consequências e lacunas

As políticas são código central testado, não ABAC. Transferência e proteção do último OWNER, administração de memberships e auditoria persistente foram concluídas nas E6/E7. Rate limit continua por IP/projeto e precisa de store distribuído em implantação horizontal.
