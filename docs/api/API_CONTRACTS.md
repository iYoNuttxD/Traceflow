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

## S1-04 (RF10 e RF35) — Sprints, marcos, cronograma e evolução

Entrega completa do cartão S1-04: RF10 (cronograma) e RF35 (evolução por sprint).

O modelo desta seção segue o [ADR-010](../architecture/ADR-010-SPRINT-DOMAIN-CORRECTIONS.md),
que supersede parte do ADR-009. Três convenções valem para tudo abaixo:

- **Janela semiaberta.** O intervalo de uma sprint é `[startDate, endDate)`. A sprint seguinte
  pode começar exatamente no instante em que a anterior termina, e nunca antes.
- **Instantes, não dias.** `startDate`, `endDate` e `dueDate` guardam data **e hora**, em UTC.
  `YYYY-MM-DD` continua aceito na escrita e significa o início daquele dia em UTC. A leitura
  sempre devolve ISO-8601 UTC.
- **Sprint encerrada é registro.** `CONCLUIDA` e `CANCELADA` congelam composição e resultado.

### Sprints

| Método | Caminho | Entrada | Sucesso | Regras |
|---|---|---|---|---|
| POST | `/projects/:projectId/sprints` | `name`, `objective?`, `startDate`, `endDate` | `201` `{message, sprint}` | `startDate < endDate`; nome único no projeto; sem sobreposição com outra sprint do projeto |
| GET | `/projects/:projectId/sprints` | `status?`, `search?` | `200` `{total, sprints}` | ordenado por `startDate` asc |
| GET | `/sprints/:id` | — | `200` `{sprint}` | membership no projeto da sprint |
| PUT | `/sprints/:id` | subconjunto de `name`, `objective`, `startDate`, `endDate` | `200` `{message, sprint}` | bloqueado em estado terminal; revalida sobreposição; recusa a janela que empurraria para fora um marco que estava dentro |
| PATCH | `/sprints/:id/status` | `status` | `200` `{message, sprint}` | somente transições válidas; entrar em estado terminal congela a composição |
| DELETE | `/sprints/:id` | — | **`405 SPRINT_DELETE_NOT_SUPPORTED`** | sprint não é excluída em nenhum estado |
| GET | `/sprints/:id/tasks` | — | `200` `{sprintId, total, tasks}` | DTO minimizado + contexto da participação |
| PUT | `/sprints/:id/tasks` | `taskIds: number[]` | `200` `{message, sprintId, total, tasks}` | substituição atômica; máx. 100; sem duplicados; bloqueado em estado terminal |

**Por que o DELETE responde 405 e não some.** A rota removida devolveria `404`, indistinguível
de "sprint não existe". O `405` diz que a operação não existe para o recurso, sem informar nada
sobre ele. A recusa acontece antes de qualquer leitura ou mutação.

### Marcos

| Método | Caminho | Entrada | Sucesso | Regras |
|---|---|---|---|---|
| POST | `/projects/:projectId/milestones` | `title`, `description?`, `dueDate`, **`sprintId`** | `201` `{message, milestone}` | sprint do mesmo projeto e não encerrada; `dueDate` dentro de `[startDate, endDate)` |
| GET | `/projects/:projectId/milestones` | `status?` | `200` `{total, milestones}` | |
| GET | `/milestones/:id` | — | `200` `{milestone}` | |
| PUT | `/milestones/:id` | subconjunto de `title`, `description`, `dueDate`, `sprintId` | `200` `{message, milestone}` | bloqueado se a sprint atual ou a de destino estiver encerrada; a checagem é refeita com as sprints travadas |
| PATCH | `/milestones/:id/status` | `status` (`PENDENTE` ↔ `CONCLUIDO`) | `200` `{message, milestone}` | bloqueado em sprint encerrada |
| DELETE | `/milestones/:id` | — | `200` `{message}` | bloqueado em sprint encerrada |

`sprintId` é **obrigatório na criação**: todo marco pertence a um período de desenvolvimento.

### Associação tarefa ↔ sprint

| Método | Caminho | Entrada | Sucesso | Regras |
|---|---|---|---|---|
| PATCH | `/tasks/:id/sprint` | `sprintId` | `200` `{message, task}` | mesmo `projectId`; sprint não terminal; idempotente; respeita o limite de 100 |
| DELETE | `/tasks/:id/sprint` | — | `200` `{message, task}` | idempotente; **bloqueado em sprint terminal** |

Os três caminhos de escrita — `PUT /sprints/:id/tasks`, `PATCH` e `DELETE` do lado da tarefa —
passam pelo **mesmo plano de escopo**, para que não divirjam no histórico. Toda inclusão,
remoção ou troca gera `TaskHistoryEntry` com `field: SPRINT` e o `AuditEvent` correspondente, na
mesma transação da escrita. A ação auditada continua distinguindo a operação pedida:
`SPRINT_TASKS_REPLACED`, `TASK_SPRINT_LINKED` ou `TASK_SPRINT_UNLINKED`.

**Convenção do histórico na troca de sprint.** Mover uma tarefa da sprint A para a B gera **uma
única** entrada `fromValue: "A"` → `toValue: "B"`, nunca uma saída seguida de uma entrada.

**Visibilidade decide o código de erro.** `TASK_SPRINT_PROJECT_MISMATCH` (400) só é devolvido
quando o ator **enxerga os dois projetos**. Quando o recurso do outro lado pertence a um projeto
que o ator não acessa, a resposta é `404` byte a byte idêntica à de um ID inexistente. Sem isso
o par 400/404 seria oráculo de enumeração.

**Concorrência.** Leitura, validação, cálculo do delta e escrita rodam na mesma transação, com a
linha travada. Duas substituições simultâneas produzem o payload de uma delas — nunca a união
das duas.

### Participação da tarefa na sprint

`GET /sprints/:id/tasks` devolve, além do DTO minimizado (`id`, `title`, `status`, `priority`,
`deadline`, `responsibleUserId`), o contexto da participação:

| Campo | Significado |
|---|---|
| `addedAt` | quando a tarefa entrou nesta sprint |
| `addedAfterStart` | entrou depois de `startedAt`; é o que o RF35 mede como mudança de escopo |
| `carriedFromSprintId` | sprint de onde a tarefa veio, quando houve continuidade |
| `exitStatus` | status congelado, presente quando a participação foi encerrada |

A composição vem da **participação**, e não de `Task.sprintId`: numa sprint encerrada a tarefa
pode ter seguido para a sprint seguinte, e ainda assim continua fazendo parte do que aconteceu
ali. O mesmo vale para `sprints[].tasks` no agregado do cronograma.

### Máquina de estados da sprint

```text
PLANEJADA    -> EM_ANDAMENTO | CANCELADA
EM_ANDAMENTO -> CONCLUIDA    | CANCELADA
CONCLUIDA    -> (terminal)
CANCELADA    -> (terminal)
```

Ao entrar em `EM_ANDAMENTO` grava-se `startedAt`; ao entrar em `CONCLUIDA`, `completedAt`.
Entrar em estado terminal congela, na mesma transação, o status de cada participação ativa.

**`startedAt` é linha de base, não trava.** O escopo continua alterável depois do início; o que
muda é que as inclusões passam a ser sinalizadas. Quem congela é o estado terminal.

### Evolução por sprint (RF35)

`GET /sprints/:id/progress` → `200`. Leitura; exige `VIEWER` no projeto da sprint.

```json
{
  "sprintId": 4, "projectId": 2, "status": "CONCLUIDA",
  "frozen": true,
  "cutoff": "2026-08-14T18:00:00.000Z",
  "baseline": { "kind": "STARTED_AT", "at": "2026-08-01T12:00:00.000Z" },
  "planned": { "numerator": 5, "denominator": 8, "percentage": 62.5, "hasData": true },
  "current": { "numerator": 6, "denominator": 9, "percentage": 66.67, "hasData": true },
  "scopeChange": {
    "added":   [{ "taskId": 12, "at": "...", "fromSprintId": 3 }],
    "removed": [{ "taskId": 7, "at": "...", "toSprintId": null,
                  "reason": "REMOVIDA", "exitStatus": "A_FAZER" }]
  },
  "carryOver": [{ "taskId": 9, "toSprintId": 5, "exitStatus": "EM_ANDAMENTO", "at": "..." }]
}
```

**Ficha da métrica** (seção 10.5 do documento de arquitetura):

| Item | Definição |
|---|---|
| Objetivo | acompanhar o avanço da sprint e tornar visível a mudança de escopo após o planejamento |
| Fórmula | `buildMetric(concluídas, total)` — a **mesma** de `traceability.calculator.js`. Concluída é `status === 'CONCLUIDO'`; percentual com duas casas |
| Dados de origem | `SprintTask` (participação, `addedAfterStart`, `exitStatus`, `carriedFromSprintId`), `Sprint.startedAt` e o status atual da tarefa |
| Status que vale | `exitStatus ?? status atual`. Sprint encerrada nunca lê o status atual: ele já foi congelado |
| Linha de base | `Sprint.startedAt`. Sem ele (`PLANEJADA`), a base é `OPEN`: o planejamento não fechou, `planned == current` e `scopeChange` é vazio |
| Escopo planejado | participações com `addedAfterStart: false`, inclusive as que já saíram |
| Mudança de escopo | saldo líquido. Quem entrou depois do início e já saiu não aparece em nenhuma das duas listas |
| `carryOver` | participações cuja tarefa continuou em outra sprint, com o status observado **aqui** |
| Instante de corte | `cutoff`. Em sprint aberta é o momento da consulta; em sprint encerrada é o encerramento, porque o resultado não depende de quando se perguntou |
| Interpretação | mede progresso do trabalho, **não** de pessoas. Não há recorte por responsável |
| Limitações | (a) corte no passado não é suportado — `at` responde `400`; (b) tarefa removida permanece no denominador de `planned`, por ter sido planejada; (c) sprints encerradas antes da migration do ADR-010 não têm `exitStatus` e caem no status atual |
| Atualização | calculado sob demanda; sem cache |

`percentage` é `null` — nunca `0` — quando `denominator` é zero: "nada concluído" e "não há o
que medir" são estados diferentes, e `hasData` distingue os dois.

**Imutabilidade.** Concluir a tarefa depois do encerramento, movê-la para a sprint seguinte ou
excluí-la **não altera** nenhum número de uma sprint encerrada.

Consulta não gera `AuditEvent`: leitura de indicador não é exportação (seção 13.9).

### Cronograma

`GET /projects/:projectId/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD` → `200` com `projectId`,
`range`, `generatedAt` (ISO-8601 UTC), `sprints[]`, `milestones[]` e `unassignedTasks[]`.

**Semântica do filtro:** sem `from`/`to` retorna tudo do projeto. A janela continua sendo **dia
de calendário, interpretado em UTC**: `from` é o início do dia pedido e `to` é convertido para o
início do dia seguinte, exclusivo, de modo que "até 14/08" inclua o dia 14 inteiro. `from <= to`
é obrigatório, e `range` devolve o que foi pedido (`to` inclusivo).

Incluem-se sprints cuja janela intersecta o período; marcos com `dueDate` dentro dele; e, em
`unassignedTasks`, tarefas sem sprint com `deadline` na janela — tarefas sem sprint e sem
`deadline` só aparecem quando não há filtro.

**Campos derivados:** `durationInDays`, `deadlineOutsideWindow`, `overdue`, `taskCount`,
`generatedAt`.

`durationInDays` conta os dias abrangidos pela janela semiaberta, arredondando para cima: de
01/08 00:00 a 14/08 00:00 são **13 dias**, porque o dia 14 pertence à sprint seguinte.

**Limitação de fuso aceita.** A janela é interpretada em UTC. Para UTC−3, "até 14/08" recorta em
`15/08T00:00Z`, ou seja `14/08 21:00` em Brasília.

O DTO de tarefa é minimizado: nunca e-mail, descrição ou esforço.

### Códigos de erro

| Código | Status | Quando |
|---|---|---|
| `SPRINT_NOT_FOUND` | 404 | sprint inexistente **ou** de projeto que o ator não enxerga |
| `MILESTONE_NOT_FOUND` | 404 | idem, para marco |
| `SPRINT_NAME_IN_USE` | 409 | nome repetido no projeto |
| `SPRINT_OVERLAP` | 409 | janela cruza outra sprint do projeto |
| `SPRINT_WINDOW_MILESTONE_CONFLICT` | 409 | a janela informada empurraria para fora um marco que estava dentro da sprint |
| `SPRINT_INVALID_TRANSITION` | 409 | transição de status não permitida |
| `SPRINT_LOCKED` | 409 | edição de sprint encerrada, ou de marco de sprint encerrada |
| `SPRINT_SCOPE_LOCKED` | 409 | alteração de escopo de sprint encerrada, em qualquer direção |
| `SPRINT_TASK_LIMIT_REACHED` | 409 | conjunto resultante acima de 100 tarefas |
| `SPRINT_DELETE_NOT_SUPPORTED` | 405 | tentativa de excluir sprint |
| `SPRINT_DATE_RANGE_INVALID` | 400 | `startDate >= endDate`, ou `from > to` no filtro |
| `TASK_SPRINT_PROJECT_MISMATCH` | 400 | tarefa de outro projeto, visível ao ator |
| `MILESTONE_SPRINT_REQUIRED` | 400 | criação de marco sem sprint |
| `MILESTONE_SPRINT_PROJECT_MISMATCH` | 400 | sprint de outro projeto, visível ao ator |
| `MILESTONE_DUE_DATE_OUTSIDE_SPRINT` | 400 | data prevista fora da janela da sprint |
| `MILESTONE_SPRINT_CHANGED` | 409 | o marco mudou de sprint entre a leitura e a escrita; refazer a operação |

**Aposentados nesta revisão:** `SPRINT_HAS_TASKS` (não existe mais exclusão) e
`SPRINT_ASSOCIATION_BLOCKED` (substituído por `SPRINT_SCOPE_LOCKED`, que cobre as duas direções).

### 404 de recurso endereçado por ID

Para `/projects/:id`, `/requirements/:id`, `/tasks/:id`, `/sprints/:id` e `/milestones/:id`, a
resposta de **"não existe"** e a de **"existe, mas em projeto que você não acessa"** são
idênticas em status, código e mensagem — só `requestId` difere. Antes elas divergiam, e o par
permitia iterar o ID para descobrir o que existe fora do alcance do ator.

A exposição de `code` segue o contrato de cada recurso: sprint e marco expõem; projeto,
requisito e tarefa devolvem apenas `{ message }`. O que a garantia exige é que os dois caminhos
do **mesmo recurso** respondam igual.

### Mudança de contrato em tarefas

`Task.sprintId` aparece no payload de todos os endpoints de tarefa. É o ponteiro da participação
ativa; o histórico completo vive em `SprintTask` e é exposto por `/sprints/:id/tasks` e
`/sprints/:id/progress`.


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
