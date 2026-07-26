# E11 — Tarefas, Kanban e histórico

## Estado

**PARCIAL — RECONCILIAÇÃO DE RESPONSÁVEL BLOQUEADA em 26/07/2026.** A parte funcional da E11 está concluída, mas o fechamento definitivo depende do mapeamento manual dos responsáveis textuais legados. Branch `daniel-dev`; continuação iniciada no commit `6470645 refactor(tasks): finalize E11 atomic Kanban and task history`. Nenhuma associação automática ou parcial foi aplicada e a E12 não foi iniciada.

Baseline herdado: 185 testes backend, 48 frontend e 24 migrations. Cobertura informada: backend 85,61% statements, 71,71% branches, 87,54% functions e 88,26% lines; frontend 33,72%, 32,90%, 28,42% e 34,64%, respectivamente.

## RFs homologados

| RF | Resultado |
|---|---|
| RF07 | REFATORADO e HOMOLOGADO; CRUD preservado com auditoria transacional |
| RF08 | APRIMORADO; status, movimento, histórico, Requirement e auditoria são atômicos |
| RF09, RF11 e RF12 | PRESERVADOS; vínculos específicos e auditoria executam na mesma transação |
| RF38 | CONCLUÍDO para status, prazo, responsável e prioridade |
| RF41 | PRESERVADO, inclusive `TaskCommitSuggestion` e fluxo de revisão humana |
| RF48 | PRESERVADO conforme operação atômica da E10 |
| RF51 | CONCLUÍDO com `Task.responsibleUserId` e membership ativa |
| RF52 | PRESERVADO conforme perspectiva canônica da E10 |

## Arquitetura final

O fluxo continua `route → controller → service → repository → Prisma`. O controller passa `actorUserId` e `requestId`; o service decide regra/transação; repositories coesos cuidam de movimento, vínculos e histórico. `task.repository.js` ficou restrito ao CRUD e consultas centrais. Não foram recriados `TraceLink`, `GithubArtifact` ou `TaskPullRequest`.

Arquivos especializados:

- `repositories/task-movement.repository.js`: transição otimista, `TaskMovement`, histórico, Requirement e auditoria;
- `repositories/task-history.repository.js`: consulta project-scoped paginada;
- `repositories/task-link.repository.js`: persistência e auditoria atômica dos vínculos;
- `services/task-history.service.js`: filtros e DTO mínimo do histórico.

## Responsável e campos legados

Novas escritas usam `Task.responsibleUserId`, validado contra `ProjectMembership.isActive` do mesmo projeto. O frontend seleciona o `User`, envia o ID e recebe `{id,name}`; e-mail não integra o DTO.

Foi executada auditoria somente de contagens no banco local: 8 Tasks possuem apenas `responsible` textual, nenhuma possui `responsibleUserId`; 10 movimentos possuem apenas ator textual e `projectMemberId`, nenhum possui `movedByUserId`. Não houve exposição de nomes/e-mails. Assim, `Task.responsible`, `TaskMovement.movedBy` e `projectMemberId` permanecem como fallback histórico; não são fonte canônica nem controlam novas movimentações. Remoção exige reconciliação explícita futura, sem associação ambígua por nome.

### Reconciliação controlada

Foram adicionados os comandos `e11:legacy:audit`, `e11:legacy:reconcile:dry-run` e `e11:legacy:reconcile`. Os scripts são dry-run por padrão, sanitizam a saída, validam o datasource e aplicam Tasks e movimentos em uma única transação. O apply requer `--confirm-development` ou `--confirm-production` e é bloqueado quando qualquer Task não possui `selectedUserId` manual válido. Não existe associação por nome, similaridade, ordem, e-mail inferido ou primeiro resultado.

A auditoria no datasource local registrou somente contagens:

| Verificação | Contagem |
|---|---:|
| Tasks somente com texto | 8 |
| Tasks com `responsibleUserId` | 0 |
| Tasks com texto e ID | 0 |
| divergências potenciais | 0 |
| mappings manuais preenchidos | 0 |
| memberships ativas candidatas | 0 |
| movimentos somente com texto | 10 |
| movimentos com `projectMemberId` | 10 |
| movimentos com `movedByUserId` | 0 |
| movimentos tecnicamente reconciliáveis | 0 |
| movimentos preservados sem autoria comprovada | 10 |

O arquivo `backend/.local/e11-task-responsibility-mapping.json` foi gerado com permissão local restrita e está ignorado pelo Git. Ele pode conter os dados necessários à decisão local; nenhum nome, e-mail ou texto foi versionado. Como não há membership ativa candidata no projeto, os oito mappings continuam bloqueados e o apply não foi executado. As contagens permaneceram inalteradas.

Movimentos só são reconciliados pela cadeia `projectMemberId → ProjectMember do mesmo projeto → e-mail preenchido → exatamente um User → ProjectMembership ativa no mesmo projeto`. Os dez movimentos não satisfazem integralmente essa evidência e foram classificados como `UNRESOLVED_PRESERVED`; seus snapshots e referências históricas foram mantidos.

## Movimento, atomicidade e concorrência

`PATCH /tasks/:id/status` e `PATCH /tasks/:id/move` delegam à mesma regra. O body canônico de move contém apenas `toStatus`; `movedBy` e `projectMemberId` são rejeitados. O ator é sempre `req.auth.user`.

Uma única transação executa update condicional `id + projectId + status anterior`, cria `TaskMovement`, cria `TaskHistoryEntry(STATUS)`, recalcula o Requirement e cria `AuditEvent`. Update condicional sem linha afetada retorna `409`, sem movimento, histórico ou auditoria. Mudança para o mesmo estado continua inválida; as três colunas do TCC foram preservadas sem novas regras de transição.

## Histórico RF38 e paginação

A migration aditiva `20260726120000_e11_add_task_history` cria `TaskHistoryEntry` e o enum `TaskHistoryField` (`STATUS`, `DEADLINE`, `RESPONSIBLE`, `PRIORITY`) com índices por projeto, tarefa, ator e campo/data. Valores de responsável são IDs técnicos.

`GET /api/projects/:projectId/tasks/history` aceita `taskId`, `actorUserId`, `field`, `startDate`, `endDate`, `page` e `limit`. `GET /kanban/movements` foi mantido para compatibilidade/métricas e também pagina no backend. O frontend deixou de carregar todo o histórico e oferece filtros e paginação. Atualização sem mudança efetiva não cria histórico.

## Vínculos e exclusão

`Task.requirementId`, `Task.pullRequestId`, `TaskCommit` e `TaskIssue` permanecem canônicos. Persistência e `AuditEvent` ocorrem na mesma transação; pertencimento ao projeto e idempotência existentes foram preservados. RF41 não foi reimplementado.

O hard delete vigente remove joins, movimentos e histórico funcional na transação, recalcula o Requirement, cria auditoria e preserva Commit, PullRequest e Issue importados. `AuditEvent` não é apagado.

## Frontend

`TaskForm` lista somente memberships ativas e envia `responsibleUserId`. `TasksPage` e Kanban preferem o DTO do usuário, mantendo fallback visual legado. O Kanban não envia ator, recarrega o quadro após `409`, preserva drag-and-drop e passou a consumir o histórico paginado. A experiência RF41 (`Buscar commits`, `Sugestões automáticas`, `Commits vinculados`) foi preservada sem redesign.

## Testes e validação

Foram acrescentados testes para autoria da sessão, rejeição de ator no body, transição direta com histórico, concorrência/409, responsável fora do projeto ou inativo, quatro campos RF38, no-op, paginação/filtros, exclusão sem órfãos, payload frontend sem ator, membership ativa, rollback visual e paginação do Kanban.

Resultados da continuação: 198 testes backend em 27 arquivos e 52 frontend em 16 arquivos. Os 9 testes backend acrescentados cobrem validação do mapa manual, ausência/inatividade/divergência de membership, atomicidade sem aplicação parcial, evidência técnica de movimentos, preservação, idempotência e saída sem PII. Architecture check, scanner de segredos (211 arquivos) e build passaram. A migration E11 já havia sido aplicada pela equipe e não foi reaplicada nesta correção.

Cobertura final backend: 86,29% statements, 73,31% branches, 88,39% functions e 89,04% lines. Cobertura frontend: 42,55%, 40,30%, 35,20% e 44,29%, respectivamente. Ambas superam o baseline, sem exclusões artificiais.

`npm audit` backend: zero vulnerabilidades. Frontend: duas entradas altas do mesmo advisory React Router RSC, não aplicável ao uso atual como SPA sem RSC/actions; a correção sugerida é incompatível e não foi executada. A migration foi aplicada apenas ao banco isolado `traceflow_test`; nenhum reset ou alteração destrutiva ocorreu no banco de desenvolvimento.

## Riscos para E12

- o fechamento definitivo está bloqueado até existirem memberships ativas válidas e o operador preencher manualmente os 8 `selectedUserId`; a E12 não foi iniciada;
- reconciliar os campos textuais legados requer política e dados confiáveis; contract permanece bloqueado pelos registros exclusivos;
- limiter/controle distribuído de concorrência não foi introduzido; a proteção é otimista no MySQL e suficiente ao caso de uso atual;
- o frontend mantém a estrutura existente, pois decomposição visual ampla pertence à E12;
- a verificação do fluxo GitHub herdada da E9 foi informada pela equipe como concluída e não foi repetida nesta correção.
