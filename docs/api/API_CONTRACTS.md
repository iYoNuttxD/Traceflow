# Catálogo atual de contratos HTTP do TRACEFLOW

## Evidência e rastreabilidade

Os caminhos abaixo são relativos ao prefixo `/api`, exceto os endpoints de health. Autenticação e autorização por papel estão consolidadas em `docs/security/AUTHORIZATION_MATRIX.md`; a relação entre requisito funcional, fluxo, endpoint, service, persistência, frontend e testes está em `docs/traceability/RF_TECHNICAL_MATRIX.md`. A auditoria E15 reconciliou este catálogo com os arquivos `*.routes.js`: o único contrato ativo deliberadamente não implementado é `DELETE /api/projects/:id`, que permanece `501`.

## Atualização E10 — requisitos e rastreabilidade canônica

`Task.requirementId`, `Task.pullRequestId`, `TaskCommit` e `TaskIssue` são as únicas fontes dos vínculos. A matriz passou a ser paginada sem carregar conteúdo integral de artefatos e mantém um summary global independente da página. As perspectivas de requisito, tarefa e artefato usam o mesmo DTO `{projectId,perspective,summary,nodes,edges,pagination}`; IDs de node são namespaced e as arestas usam `REQUIREMENT_TASK`, `TASK_COMMIT`, `TASK_PULL_REQUEST` ou `TASK_ISSUE`.

Os cinco placeholders baseados em `TraceLink`/`GithubArtifact` foram removidos e seguem o `404` global. O único `501` restante é `DELETE /projects/:id`. O fechamento definitivo do RF41 adotou exclusivamente `[TASK-<ID>]`, persiste sugestões revisáveis e só cria `TaskCommit` após confirmação humana.

## Atualização E9 — Projetos e sincronização GitHub

O cadastro integrado usa a operação especializada `POST /projects/from-github` e revalida o repositório externo. A sincronização pagina commits, pull requests e issues, deduplica/upserta por identificadores externos dentro do projeto e só marca sucesso após todas as coleções. Falha parcial preserva lotes já confirmados, o último sucesso e os vínculos técnicos; a resposta de sucesso permanece `{message,summary,project}`.

O alias legado redundante `GET /projects/:projectId/github/artifacts` foi removido após confirmação de ausência de consumidores; ele agora segue o `404 ROUTE_NOT_FOUND`. A rota canônica RF06 permanece `GET /projects/:projectId/artifacts`.

## Atualização E8 — persistência canônica sem ruptura HTTP

A cardinalidade funcional confirmada é Task 0..1 PullRequest e PullRequest 0..N Tasks. `Task.pullRequestId` é a única fonte canônica; o join experimental N:N, o dual-write e o fallback foram removidos. Os endpoints continuam singulares e preservam paths, status, mensagens e payloads. Na E8, nenhum dos sete placeholders 501 então existentes foi implementado.

## Atualização E6 — identidade e privacidade dos endpoints

Health permanece público. Também são públicos `POST /api/auth/register`, `login`, `forgot-password` e `reset-password`. As demais rotas `/api` exigem cookie de sessão; mutations exigem `X-CSRF-Token`. `GET /api/auth/me` restaura a identidade, `GET /api/auth/csrf` rotaciona CSRF, `POST /api/auth/logout` revoga a sessão e `POST /api/auth/change-password` revoga todas as sessões.

Convites canônicos: `GET|POST /api/projects/:projectId/invitations`, `DELETE /api/projects/:projectId/invitations/:invitationId` e `POST /api/projects/invitations/accept`. O join por `accessCode` permanece autenticado e deprecado. Papéis: OWNER, MANAGER, MEMBER e VIEWER. Ausência de membership pode retornar 404; papel insuficiente, 403. Placeholders retornam 401 sem sessão e preservam 501 autenticados.

Na conclusão da E6, `GET /api/projects/:projectId/members` passou a representar a fonte canônica `ProjectMembership` e retorna `{projectId,currentMembership,members}`. OWNER recebe e-mail completo; demais papéis recebem valor mascarado. Administração canônica: `PATCH|DELETE /api/projects/:projectId/members/:membershipId`, `POST .../reactivate`, `DELETE .../members/me` e `POST /api/projects/:projectId/ownership/transfer`. Desativação/saída é lógica; o último OWNER recebe `409 LAST_PROJECT_OWNER`.

Convite duplicado ativo é substituído (o anterior é revogado). Em produção, criação retorna somente `{invitation}` e o token segue pelo adapter de e-mail; o campo `token` existe apenas em testes controlados. Forgot-password continua uniforme e nunca retorna token fora de testes.

Novos erros seguem `{message,code,requestId}`: `AUTHENTICATION_REQUIRED`, `INVALID_CREDENTIALS`, `ACCOUNT_DISABLED`, `CSRF_INVALID`, `FORBIDDEN` e `INVITATION_INVALID`. Respostas de recuperação são uniformes. O cookie nunca é exposto a JavaScript e CORS usa credenciais somente para a allowlist.

## Escopo e convenções

As seções abaixo preservam os contratos funcionais documentados na conclusão da E4, agora sujeitos à autenticação/autorização descrita na atualização E6. Este catálogo não é uma especificação OpenAPI definitiva.

Todas as respostas incluem o header `X-Request-Id`. Erros de domínio preservam `{ "message": "..." }`. Erros de validação usam HTTP `400`:

```json
{
  "message": "O título da tarefa é obrigatório.",
  "code": "VALIDATION_ERROR",
  "details": [{ "field": "title", "message": "O título da tarefa é obrigatório." }],
  "requestId": "identificador-seguro"
}
```

`details` nunca contém o valor recebido. Bodies mutáveis são estritos e rejeitam campos desconhecidos. Params numéricos aceitam somente inteiro decimal positivo e são convertidos para `number`. Datas de filtro usam `YYYY-MM-DD`; `deadline` aceita esse formato ou datetime ISO-8601 completo. Query `search` é opcional e limitada a 255 caracteres.

Na E5, respostas de sucesso permaneceram iguais. A API exige JSON para bodies, aplica limite padrão de 100kb, CORS por allowlist e rate limiting. Novos erros de infraestrutura usam o formato seguro `{message,code,requestId}`: origem proibida `403 CORS_ORIGIN_DENIED`, JSON malformado `400 MALFORMED_JSON`, payload excessivo `413 PAYLOAD_TOO_LARGE`, content type incompatível `415 UNSUPPORTED_MEDIA_TYPE` e limite excedido `429 RATE_LIMITED`. Respostas `/api` incluem `Cache-Control: no-store`; o limiter pode incluir `RateLimit` e `Retry-After`.

## Infraestrutura

| Método | Caminho | Entrada | Sucesso | Erros principais |
|---|---|---|---|---|
| GET | `/health` | Nenhuma | `200`, `{status,message}` histórico | `500` inesperado |
| GET | `/health/live` | Nenhuma | `200`, `{status:"ok"}` | `500` inesperado |
| GET | `/health/ready` | Nenhuma | `200`, `{status:"ready"}` | `503` dependência indisponível |
| qualquer | rota desconhecida | — | — | `404`, `ROUTE_NOT_FOUND` |

## Projects e membros

| Método | Caminho | Params/query | Body aceito | Sucesso |
|---|---|---|---|---|
| POST | `/projects` | — | `name`, `responsibleTeam`, `githubOwner`, `githubRepo`, `githubUrl`; opcionais `description`, `status` | `201`, `{message,project}` |
| POST | `/projects/from-github` | — | metadados `githubRepository*`, owner, branch; opcionais `name`/`nome`, descrição, equipe e boolean `githubAutoSyncEnabled` | `201`, `{message,project}` |
| GET | `/projects` | — | — | `200`, `{projects}` |
| GET | `/projects/:id` | `id` positivo | — | `200`, `{project}` |
| PUT | `/projects/:id` | `id` positivo | subconjunto de `name`, `description`, `responsibleTeam`, `status` e tripla GitHub legada | `200`, `{message,project}` |
| DELETE | `/projects/:id` | baseline placeholder | — | `501` inalterado |
| POST | `/projects/join` | — | `accessCode`, `name`; opcionais `email`, `role` | `201`, `{message,project,member}` |
| GET | `/projects/:projectId/members` | `projectId` positivo | — | `200`, `{projectId,currentMembership,members}` |
| POST | `/projects/:projectId/members` | `projectId` positivo | `name`; opcionais `email`, `role` | `201`, `{message,member}` |
| PATCH | `/projects/:projectId/members/:membershipId` | IDs positivos | `role`: OWNER/MANAGER/MEMBER/VIEWER | `200`, `{message,membership}` |
| DELETE | `/projects/:projectId/members/:membershipId` | IDs positivos | — | `204`, desativação lógica |
| POST | `/projects/:projectId/members/:membershipId/reactivate` | IDs positivos | body vazio | `200`, `{message,membership}` |
| DELETE | `/projects/:projectId/members/me` | `projectId` positivo | — | `204`, saída própria lógica |
| POST | `/projects/:projectId/ownership/transfer` | `projectId` positivo | `membershipId` positivo | `200`, `{message,membership}` |
| GET/POST | `/projects/:projectId/invitations` | `projectId` positivo | POST: `email`, `role` | `200` lista / `201` criação |
| DELETE | `/projects/:projectId/invitations/:invitationId` | IDs positivos | — | `204` |
| POST | `/projects/invitations/accept` | — | token opaco | `200`, `{message,membership}` |
| PATCH | `/projects/:projectId/github/sync-settings` | `projectId` positivo | boolean `githubAutoSyncEnabled` | `200`, `{message,project}` |

Status de projeto: `ATIVO`, `INATIVO`, `ARQUIVADO`. URLs GitHub precisam usar HTTP(S) e host `github.com`. E-mails são validados, mas continuam opcionais. `accessCode` mantém o mecanismo atual e não representa autenticação.

## Requirements

| Método | Caminho | Params/query | Body aceito | Sucesso |
|---|---|---|---|---|
| POST | `/projects/:projectId/requirements` | `projectId` positivo | `title`; opcionais `description`, `type` | `201`, `{message,requirement}` |
| GET | `/projects/:projectId/requirements` | `projectId`; `search?` | — | `200`, `{total,requirements}` |
| GET | `/requirements/:id` | `id` positivo | — | `200`, `{requirement}` |
| PUT | `/requirements/:id` | `id` positivo | subconjunto de `title`, `description`, `type` | `200`, `{message,requirement}` |
| DELETE | `/requirements/:id` | `id` positivo | — | `200`, `{message}` |
| PATCH | `/requirements/:id/status` | `id` positivo | `status` | `200`, `{message,requirement}` |
| PATCH | `/requirements/:id/confirm-completion` | `id` positivo | nenhum | `200`, `{message,requirement}` |
| GET | `/requirements/:id/tasks` | `id` positivo | — | `200`, `{requirementId,total,tasks}` |
| PUT | `/requirements/:id/tasks` | `id` positivo | `taskIds`: array único de até 100 IDs | `200`, `{message,requirement,reassignedTasks,changes}` |
| GET | `/projects/:projectId/traceability/requirement-task-coverage` | `projectId` positivo | — | `200`, métricas atuais |

Tipos preservados: `FUNCIONAL`, `NAO_FUNCIONAL`, `REGRA_NEGOCIO`. Status preservados: `CADASTRADO`, `APROVADO`, `EM_IMPLEMENTACAO`, `VALIDADO`, `CONCLUIDO`, `PENDENTE`, `EM_ANDAMENTO`, `CANCELADO`. As transições continuam sendo regra de domínio do service.

## Tasks, vínculos e Kanban

| Método | Caminho | Entrada principal | Sucesso |
|---|---|---|---|
| POST | `/projects/:projectId/tasks` | `projectId`; `title`; opcionais `description`, `priority`, `responsibleUserId`, `deadline`, efforts, `requirementId` | `201`, `{message,task}` |
| GET | `/projects/:projectId/tasks` | `projectId`, `search?` | `200`, `{total,tasks}` |
| GET | `/tasks/:id` | `id` positivo | `200`, `{task}` |
| PUT | `/tasks/:id` | `id`; subconjunto dos campos editáveis | `200`, `{message,task}` |
| DELETE | `/tasks/:id` | `id` positivo | `200`, `{message}` |
| PATCH | `/tasks/:id/status` | `status` | `200`, `{message,task}`; delega à transição canônica e cria movimento/histórico |
| PATCH/DELETE | `/tasks/:id/requirement` | `requirementId` no PATCH | `200`, `{message,task}` |
| PATCH/DELETE | `/tasks/:id/pull-request` | `pullRequestId` no PATCH; `null` continua aceito | `200`, `{message,task}` |
| GET | `/tasks/:id/commits` | `id` | `200`, `{total,commits}` |
| POST | `/tasks/:id/commits` | `commitId` | `201`, `{message,commits}` |
| DELETE | `/tasks/:id/commits/:commitId` | ambos positivos | `200`, `{message,commits}` |
| GET | `/tasks/:id/issues` | `id` | `200`, `{total,issues}` |
| POST | `/tasks/:id/issues` | `issueId` | `201`, `{message,issues}` |
| DELETE | `/tasks/:id/issues/:issueId` | ambos positivos | `200`, `{message,issues}` |
| GET | `/projects/:projectId/kanban` | `projectId` | `200`, quadro atual |
| PATCH | `/tasks/:id/move` | somente `toStatus`; o ator é obtido da sessão | `200`, `{message,task,movement}`; `409` em concorrência otimista |
| GET | `/projects/:projectId/kanban/movements` | datas, `taskId?`, `actorUserId?`, `movedBy?`, `page?`, `limit?` | `200`, `{projectId,total,movements,pagination}` |
| GET | `/projects/:projectId/tasks/history` | `taskId?`, `actorUserId?`, `field?`, datas, `page?`, `limit?` | `200`, `{projectId,total,items,pagination}` |
| GET | `/projects/:projectId/kanban/metrics` | mesmos filtros atuais | `200`, métricas atuais |
| GET | `/projects/:projectId/tasks/metrics` | `startDate?`, `endDate?` | `200`, métricas atuais |
| GET | `/projects/:projectId/traceability/{pull-request,commit,issue}-coverage` | `projectId` | `200`, cobertura atual |

Priority: `BAIXA`, `MEDIA`, `ALTA`, `CRITICA`. Status: `A_FAZER`, `EM_ANDAMENTO`, `CONCLUIDO`. Efforts são inteiros não negativos. `responsibleUserId` deve identificar usuário com membership ativa no projeto; respostas expõem apenas `{id,name}` em `responsibleUser`. `Task.responsible`, `TaskMovement.movedBy` e `projectMemberId` permanecem somente para dados históricos/compatibilidade de leitura. O histórico funcional usa `STATUS`, `DEADLINE`, `RESPONSIBLE`, `PRIORITY` e `SPRINT` (este último desde o RF10); mudanças sem efeito não geram entrada. O enum aceito em `field` espelha `TaskHistoryField` do Prisma — todo valor novo no schema precisa entrar também em `taskHistoryQuerySchema`, sob pena de o campo ficar gravável e não filtrável.

## GitHub e Artifacts

| Método | Caminho | Entrada | Sucesso |
|---|---|---|---|
| GET | `/github/auth/check` | — | `200`, estado sanitizado da credencial técnica configurada |
| GET | `/github/repositories` | — | `200`, `{repositories}` |
| POST | `/projects/:projectId/github/sync` | `projectId` positivo | `200`, `{message,summary,project}` |
| GET | `/projects/:projectId/commits` | `projectId`, `search?` | `200`, `{commits}` |
| GET | `/projects/:projectId/pull-requests` | `projectId`, `search?` | `200`, `{pullRequests}` |
| GET | `/projects/:projectId/issues` | `projectId`, `search?` | `200`, `{issues}` |
| GET | `/projects/:projectId/artifacts` | `projectId`; `type?`, `startDate?`, `endDate?` | `200`, projeto, filtros, resumo e artefatos |

Tipos de artifacts: `commit`, `pull_request`, `issue`. A paginação E9 ocorre somente na leitura externa do GitHub; os contratos públicos de listagem permanecem inalterados.

Coberturas preservam os campos históricos e acrescentam `coverage: {numerator,denominator,percentage,hasData}`. Quando não há denominador, `percentage` é `null` e `hasData` é `false`; o escalar histórico permanece `0` por compatibilidade.

## Traceability canônica

| Método | Caminho | Entrada | Sucesso |
|---|---|---|---|
| GET | `/projects/:projectId/traceability/requirements-matrix` | IDs; `page?`, `limit?` | `200`, `{projectId,summary,requirements,pagination}` |
| GET | `/projects/:projectId/traceability/requirements/:requirementId` | IDs; `page?`, `limit?` paginam tarefas | `200`, DTO de grafo, perspectiva `REQUIREMENT` |
| GET | `/projects/:projectId/traceability/tasks/:taskId` | IDs; `page?`, `limit?` paginam artefatos | `200`, DTO de grafo, perspectiva `TASK` |
| GET | `/projects/:projectId/traceability/artifacts/:artifactType/:artifactId` | `commit`, `pull-request` ou `issue`; paginação de tarefas | `200`, DTO de grafo da perspectiva tipada |
| POST | `/projects/:projectId/traceability/commit-suggestions/scan` | body vazio | `200`, `{scannedCommits,detectedReferences,createdSuggestions,skippedSuggestions}` |
| GET | `/projects/:projectId/traceability/commit-suggestions` | `status?` = PENDING/CONFIRMED/REJECTED; `taskId?` positivo e pertencente ao projeto; `page?`, `limit?` | `200`, DTO minimizado, permissões e paginação |
| POST | `/projects/:projectId/traceability/commit-suggestions/:suggestionId/confirm` | IDs; body vazio | `200`, `{message,suggestion,changed}`; cria `TaskCommit` atomicamente |
| POST | `/projects/:projectId/traceability/commit-suggestions/:suggestionId/reject` | IDs; body vazio | `200`, `{message,suggestion,changed}`; não cria vínculo |

O summary da matriz é calculado sobre todo o projeto, não apenas sobre a página. A matriz seleciona somente dados resumidos e contagens. O grafo nunca expõe `Commit.authorEmail`. Recursos de outro projeto recebem `404`; consultas exigem VIEWER+ e a atualização atômica Requirement–Task exige MEMBER+.

O parser RF41 usa somente `/\[TASK-(\d+)\]/gi`: aceita caixa variada, múltiplos IDs e deduplica repetições na mesma mensagem. Não aceita `TASK-42`, `#42`, `ID 42`, `[ISSUE-42]` ou IDs não numéricos. Detecção e scan não criam vínculo; sugestões rejeitadas ou confirmadas nunca são reabertas.

Sem `taskId`, a consulta preserva a visão paginada do projeto. Com `taskId`, retorna somente sugestões da Task validada no mesmo projeto; ID inválido recebe `400` e Task inexistente ou de outro projeto recebe `404`. O DTO continua sem `Commit.authorEmail`.

## Conta, privacidade e auditoria (E7)

| Método | Caminho | Entrada | Sucesso |
|---|---|---|---|
| GET | `/account/personal-data` | sessão | `200`, `{data}` minimizado |
| PATCH | `/account/profile` | `name`, `email`, `currentPassword` | `200`, `{message,user}` |
| GET | `/account/sessions` | sessão | `200`, sessões sem hashes |
| DELETE | `/account/sessions/:sessionId` | ID próprio | `204` |
| DELETE | `/account/sessions` | sessão | `204`, revoga todas |
| POST | `/account/personal-data/export` | CSRF | `202`, metadata da exportação |
| GET | `/account/personal-data/export/:exportId` | ID próprio | `200`, status; `404` cruzado |
| GET | `/account/personal-data/export/:exportId/download` | ID próprio não expirado | `200`, JSON; `410 EXPORT_EXPIRED` |
| POST | `/account/deactivate` | `password` | `200`; `409 LAST_PROJECT_OWNER` |
| GET/POST/DELETE | `/account/deletion-request` | POST: `password` | status `200`/`202`/`200` |
| GET | `/account/audit-events` | `page`, `limit`, `action`, `result`, datas | `200`, página própria |
| GET | `/projects/:projectId/audit-events` | mesmos filtros | `200` OWNER; `403` demais papéis |

Exportação não contém hashes, cookies, segredos nem dados pessoais de outros membros. Todos os caminhos possuem prefixo `/api`.

## Atualização S1-04 (RF10) — Sprints, marcos e cronograma

Entrega parcial do cartão S1-04. O **RF35 (evolução por sprint) não faz parte desta entrega**: nenhum endpoint calcula planejado, concluído, percentual ou instante de corte. O cartão S1-04 permanece aberto.

### Sprints

| Método | Caminho | Entrada | Sucesso | Regras |
|---|---|---|---|---|
| POST | `/projects/:projectId/sprints` | `name`, `objective?`, `startDate`, `endDate` | `201` `{message, sprint}` | `startDate <= endDate`; nome único no projeto |
| GET | `/projects/:projectId/sprints` | `status?`, `search?` | `200` `{total, sprints}` | ordenado por `startDate` asc |
| GET | `/sprints/:id` | — | `200` `{sprint}` | membership no projeto da sprint |
| PUT | `/sprints/:id` | subconjunto de `name`, `objective`, `startDate`, `endDate` | `200` `{message, sprint}` | bloqueado em estado terminal |
| PATCH | `/sprints/:id/status` | `status` | `200` `{message, sprint}` | somente transições válidas |
| DELETE | `/sprints/:id` | — | `200` `{message}` | bloqueado com tarefa associada |
| GET | `/sprints/:id/tasks` | — | `200` `{sprintId, total, tasks}` | DTO minimizado |
| PUT | `/sprints/:id/tasks` | `taskIds: number[]` | `200` `{message, sprintId, total, tasks}` | substituição atômica; máx. 100; sem duplicados |

### Marcos

| Método | Caminho | Entrada | Sucesso |
|---|---|---|---|
| POST | `/projects/:projectId/milestones` | `title`, `description?`, `dueDate` | `201` `{message, milestone}` |
| GET | `/projects/:projectId/milestones` | `status?` | `200` `{total, milestones}` |
| GET | `/milestones/:id` | — | `200` `{milestone}` |
| PUT | `/milestones/:id` | subconjunto de `title`, `description`, `dueDate` | `200` `{message, milestone}` |
| PATCH | `/milestones/:id/status` | `status` (`PENDENTE` ↔ `CONCLUIDO`) | `200` `{message, milestone}` |
| DELETE | `/milestones/:id` | — | `200` `{message}` |

### Associação tarefa ↔ sprint

| Método | Caminho | Entrada | Sucesso | Regras |
|---|---|---|---|---|
| PATCH | `/tasks/:id/sprint` | `sprintId` | `200` `{message, task}` | mesmo `projectId`; sprint não terminal; idempotente |
| DELETE | `/tasks/:id/sprint` | — | `200` `{message, task}` | idempotente; permitido inclusive em sprint terminal |

Toda inclusão, remoção ou troca gera `TaskHistoryEntry` com `field: SPRINT` e o `AuditEvent` correspondente, na mesma transação da escrita.

**Convenção do histórico na troca de sprint.** Mover uma tarefa da sprint A para a B gera **uma única** entrada `fromValue: "A"` → `toValue: "B"`, nunca uma saída seguida de uma entrada, e nunca `fromValue: null`. Os dois caminhos produzem exatamente o mesmo registro: `PATCH /tasks/:id/sprint` e `PUT /sprints/B/tasks`. Isso é o que sustenta o critério de aceite "tarefas adicionadas ou removidas após o planejamento são identificáveis": a sprint de origem precisa sobreviver no histórico, porque é ela que distingue uma tarefa nova de uma tarefa realocada.

**Visibilidade decide o código de erro.** `TASK_SPRINT_PROJECT_MISMATCH` (400) só é devolvido quando o ator **enxerga os dois projetos** — tem membership ativa em ambos. Quando o recurso do outro lado pertence a um projeto que o ator não acessa, a resposta é `404` (`SPRINT_NOT_FOUND` ou `TASK_NOT_FOUND`) **byte a byte idêntica** à de um ID inexistente, exceto pelo `requestId`.

Sem isso os endpoints seriam oráculos de enumeração: a autorização de `PATCH /tasks/:id/sprint` resolve o projeto pela **tarefa**, e a de `PUT /sprints/:id/tasks` pelo **sprint**, então IDs do outro lado chegam ao service sem passar pelo middleware. O par 400/404 permitiria iterar o ID e mapear sprints e tarefas de projetos alheios. A verificação falha fechado: sem ator identificado, a resposta é sempre `404`.

**Estado terminal e o conjunto de tarefas.** `PUT /sprints/:id/tasks` avalia a lista recebida contra o conjunto atual e só rejeita com `409 SPRINT_ASSOCIATION_BLOCKED` quando a operação **acrescenta** tarefa a uma sprint `CONCLUIDA` ou `CANCELADA`. Uma lista que apenas remove é aceita em qualquer status; uma lista que remove e acrescenta ao mesmo tempo é rejeitada por inteiro, sem persistir nada.

### Máquina de estados da sprint

```text
PLANEJADA    -> EM_ANDAMENTO | CANCELADA
EM_ANDAMENTO -> CONCLUIDA    | CANCELADA
CONCLUIDA    -> (terminal)
CANCELADA    -> (terminal)
```

Ao entrar em `EM_ANDAMENTO` grava-se `startedAt`; ao entrar em `CONCLUIDA`, `completedAt`. `startedAt` é a **linha de base do planejamento** consumida pelo RF35.

### Evolução por sprint (RF35)

`GET /sprints/:id/progress` → `200`. Leitura; exige `VIEWER` no projeto da sprint.

```json
{
  "sprintId": 4, "projectId": 2, "status": "EM_ANDAMENTO",
  "cutoff": "2026-08-09T03:00:00.000Z",
  "baseline": { "kind": "STARTED_AT", "at": "2026-08-01T12:00:00.000Z" },
  "planned": { "numerator": 5, "denominator": 8, "percentage": 62.5, "hasData": true },
  "current": { "numerator": 6, "denominator": 9, "percentage": 66.67, "hasData": true },
  "scopeChange": {
    "added":   [{ "taskId": 12, "at": "...", "fromSprintId": 3 }],
    "removed": [{ "taskId": 7, "at": "...", "toSprintId": null }]
  }
}
```

**Ficha da métrica** (seção 10.5 do documento de arquitetura):

| Item | Definição |
|---|---|
| Objetivo | acompanhar o avanço da sprint e tornar visível a mudança de escopo após o planejamento |
| Fórmula | `buildMetric(concluídas, total)` — a **mesma** de `traceability.calculator.js`. Concluída é `status === 'CONCLUIDO'`; percentual com duas casas |
| Dados de origem | `Task.status`, `Task.sprintId`, `Sprint.startedAt` e `TaskHistoryEntry` com `field: SPRINT` |
| Linha de base | `Sprint.startedAt`. Sem ele (`PLANEJADA`), a base é `OPEN`: o planejamento não fechou, `planned == current` e `scopeChange` é vazio |
| Escopo planejado | membros no instante da base, reconstruídos do histórico: para tarefa movimentada depois da base, o `fromValue` da **primeira** movimentação posterior descreve onde ela estava; sem movimentação posterior, vale o estado atual |
| Mudança de escopo | saldo líquido entre base e corte. Tarefa que saiu e voltou **não** conta como entrada nem saída |
| Instante de corte | `cutoff`, sempre o momento da consulta, devolvido na resposta |
| Interpretação | mede progresso do trabalho, **não** de pessoas. Não há recorte por responsável |
| Limitações | (a) corte no passado não é suportado — `at` responde `400`, porque `Task.status` guarda apenas o estado atual e reconstruí-lo exigiria varrer `field: STATUS`; (b) tarefa removida permanece no denominador de `planned`, por ter sido planejada; (c) escopo depende do histórico: movimentação feita fora da API não aparece |
| Atualização | calculado sob demanda; sem cache |

`percentage` é `null` — nunca `0` — quando `denominator` é zero: "nada concluído" e "não há o que medir" são estados diferentes, e `hasData` distingue os dois.

Consulta não gera `AuditEvent`: a seção 13.9 lista exportação de dados e relatórios como auditáveis, e leitura de indicador não é exportação.

### Cronograma

`GET /projects/:projectId/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD` → `200` com `projectId`, `range`, `generatedAt` (ISO-8601 UTC), `sprints[]`, `milestones[]` e `unassignedTasks[]`.

**Semântica do filtro:** sem `from`/`to` retorna tudo do projeto. Com período, incluem-se sprints cujo intervalo `[startDate, endDate]` **intersecta** a janela; marcos com `dueDate` na janela; e, em `unassignedTasks`, tarefas sem sprint com `deadline` na janela — tarefas sem sprint e sem `deadline` só aparecem quando não há filtro. `from <= to` é obrigatório.

**Campos derivados:** `durationInDays` (inclusivo, em dias UTC), `deadlineOutsideWindow`, `overdue` (pendente com `dueDate` anterior a hoje; vencer hoje não é atraso), `taskCount`, `generatedAt`.

O DTO de tarefa é minimizado: `id`, `title`, `status`, `priority`, `deadline`, `responsibleUserId` e, dentro de sprint, `deadlineOutsideWindow`. Nunca e-mail.

### Novos códigos de erro

`SPRINT_NOT_FOUND` (404), `MILESTONE_NOT_FOUND` (404), `SPRINT_NAME_IN_USE` (409), `SPRINT_HAS_TASKS` (409), `SPRINT_INVALID_TRANSITION` (409), `SPRINT_LOCKED` (409), `SPRINT_DATE_RANGE_INVALID` (400), `TASK_SPRINT_PROJECT_MISMATCH` (400), `SPRINT_ASSOCIATION_BLOCKED` (409).

### Mudança de contrato em tarefas

`Task.sprintId` passou a existir e, como `formatTask()` faz spread do registro, o campo **aparece automaticamente no payload de todos os endpoints de tarefa**. É dado do próprio projeto, sem informação pessoal adicional. `mvp-contracts.test.js` permanece verde.

### Decisões

- **(a)** Marcos pertencem ao **projeto**, sem `sprintId` nesta fase. O vínculo pode ser adicionado depois sem quebra de contrato.
- **(b)** Nome de sprint é **único por projeto** (`@@unique([projectId, name])`); a violação Prisma `P2002` vira `409 SPRINT_NAME_IN_USE`.
- **(c)** Edição da sprint é **bloqueada em estado terminal** (`CONCLUIDA`/`CANCELADA`). Quanto às tarefas, o bloqueio vale apenas para **adicionar**: remover continua permitido em qualquer status. Bloquear a remoção criaria um impasse sem saída — `DELETE /sprints/:id` exige conjunto vazio e estados terminais não transicionam de volta, então a sprint ficaria presa para sempre. Toda remoção continua gerando `TaskHistoryEntry` e `AuditEvent`.
- **(d)** **Sobreposição de sprints é permitida.** Com `Task.sprintId` como FK singular, uma tarefa pertence a no máximo uma sprint, então janelas cruzadas não geram ambiguidade.
- **(e)** `TaskMovement.sprintId` legado permanece **intocado** — sem FK, sem popular, sem remover. Follow-up registrado no backlog técnico.
- **(f)** **Sem paginação** nestas coleções. A seção 12.1 do `TRACEFLOW_CONTEXTO_ARQUITETURA.md` pede paginação obrigatória em coleções potencialmente grandes, mas `tasks` e `requirements` na branch principal retornam `{total, itens}` sem paginar. Pela regra de precedência da seção 3 daquele documento, o código vence. A paginação deve ser reavaliada em conjunto para os três recursos, não isoladamente para sprints.
- **(g)** `DELETE` de sprint com tarefas é **bloqueado no service** (`409 SPRINT_HAS_TASKS`). O `onDelete: SetNull` da FK é apenas rede de segurança contra cascata acidental: se fosse o caminho normal, apagaria vínculos sem gerar `TaskHistoryEntry` nem `AuditEvent`.

## Limites e erros

- Strings persistidas em campos Prisma `String` sem `@db.Text`: até 191 caracteres.
- URLs persistidas: até 191 caracteres.
- Busca: até 255 caracteres.
- Código de acesso recebido: até 32 caracteres.
- IDs: inteiros positivos.
- Datas: datas civis reais, sem correção automática.
- Campos desconhecidos em bodies/query validados: `400 VALIDATION_ERROR`.
- Erros de recurso e conflito permanecem `404` e `409` com mensagens atuais.
- Erros inesperados permanecem seguros e carregam `INTERNAL_ERROR` e request ID.
