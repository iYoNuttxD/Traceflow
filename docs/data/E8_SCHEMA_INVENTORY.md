# E8 — Inventário canônico do schema Prisma

Snapshot: branch `daniel-dev`, commit inicial `b4c682f22413c9ce6177e8d9997c462d0118e4f2`, 25/07/2026. O volume medido em `traceflow_test` antes do cenário artificial era zero em todos os models; volume do banco atual/produção é **NÃO CONFIRMADO**, pois nenhum banco compartilhado foi consultado. `?` significa nullable; `=valor` default; `U` unique; `I` índice.

| Model | Campos (tipo, nulabilidade, default/unique) | Relações, índices e cascatas | Consumidores / PII / retenção | Classe e decisão |
|---|---|---|---|---|
| User | `id Int PK`, `name String`, `email String U`, `passwordHash String?`, `isActive Boolean=true`, `emailVerifiedAt?`, `mustSetPassword=false`, `sessionVersion=1`, `lastLoginAt?`, `createdAt=now`, `updatedAt=@updatedAt` | sessões/tokens/memberships cascade; responsáveis/movimentos/joins PR SetNull; auditoria SetNull | auth, memberships, privacy; nome/e-mail/credencial; ciclo da conta | CANÔNICO |
| Session | `id`, `userId`, `tokenHash U`, `csrfTokenHash`, `sessionVersion`, `expiresAt`, `lastSeenAt=now`, `revokedAt?`, `createdAt` | I user/expires; User cascade | auth/cleanup; segredo; 30 dias pós-finalização | CANÔNICO |
| PasswordResetToken | `id`, `userId`, `tokenHash U`, `expiresAt`, `usedAt?`, `createdAt` | I user/expires; User cascade | auth/cleanup; segredo; 7 dias | CANÔNICO |
| ProjectMembership | `id`, `projectId`, `userId`, `role ProjectRole=MEMBER`, `isActive=true`, `joinedAt`, timestamps | U project+user; I user, project+role+active, user+active; cascades | auth/projects/audit; participação; ciclo do projeto/conta | CANÔNICO |
| ProjectInvitation | `id`, project/email/role, `tokenHash U`, expiração/revogação/aceite, atores, createdAt | I project/email/expires; Project cascade | convites; e-mail/token; 30 dias pós-finalização | CANÔNICO |
| Project | campos de domínio; aliases GitHub; status/sync; accessCode/inviteLink; timestamps | U repositoryId/fullName/accessCode; I status/sync/createdAt | quase todo runtime; equipe/repositório/segredos legados | CANÔNICO com CAMPOS TRANSITÓRIOS |
| Requirement | id/project/title/description, `type=FUNCIONAL`, `status=PENDENTE`, timestamps | I project+status/project+createdAt; Project cascade | requirements/traceability; texto livre; ciclo do projeto | CANÔNICO |
| Task | id/project/requirement, texto, priority/status, esforços, `pullRequestId?`, `responsibleUserId?`, timestamps | I PR/responsible/requirement/project+status/project+createdAt; responsible SetNull | tasks/Kanban/traceability; responsável/texto; ciclo do projeto | CANÔNICO; `pullRequestId` e `responsible` TRANSITÓRIOS |
| TaskPullRequest | id/task/PR, `linkedByUserId?`, `createdAt` | U task+PR; I task+createdAt/PR/ator; joins cascade, ator SetNull | task repository/traceability; ator potencial; acompanha vínculo | CANÔNICO EXPANDIDO |
| TaskCommit | id/task/commit/createdAt | U task+commit; I dois sentidos; cascade somente join | tasks/traceability; sem PII própria | CANÔNICO |
| TaskIssue | id/task/issue/createdAt | U task+issue; I dois sentidos; cascade somente join | tasks/traceability; sem PII própria | CANÔNICO |
| ProjectMember | id/project/name/email?/role/isActive/joinedAt/timestamps | U project+email; I project; Project Restrict histórico | projects legado/Kanban; nome/e-mail; até contract | LEGADO ATIVO |
| TaskMovement | id/project/task/statuses, `movedBy`, `projectMemberId?`, `movedByUserId?`, movedAt/sprintId?/createdAt | I project/task/member/user/movedAt e compostos; User SetNull | Kanban/audit; ator e histórico; ciclo do projeto | CANÔNICO com FALLBACKS TRANSITÓRIOS |
| GithubArtifact | id/project/type/externalId?/sha?/conteúdo/autor/status/branch/url/datas/importedAt | U project+type+externalId; I project+importedAt/type; Project Restrict | authorization placeholder; pode conter PII GitHub | LEGADO ATIVO, somente reconciliação |
| TraceLink | id/project/source/target/linkType/createdAt | I project+data e origem/destino; sem FKs tipadas | autorização/placeholders 501; sem consumer funcional | LEGADO/PLACEHOLDER |
| Commit | id/hash/message/autoria/date/branch/url/project/timestamps | U project+hash; I project+date/createdAt; Project cascade | sync/artifacts/tasks/traceability/privacy; autoria; ciclo do projeto | CANÔNICO |
| PullRequest | id/githubId/number/conteúdo/estado/autor/branches/url/datas/project/timestamps | U project+githubId e project+number; I datas; Project cascade | sync/artifacts/tasks/traceability; autor/conteúdo | CANÔNICO |
| Issue | id/githubId/number/conteúdo/estado/autor/assignee/labels/milestone/url/datas/project/timestamps | U project+githubId e project+number; I datas; Project cascade | sync/artifacts/tasks/traceability; autor/assignee/conteúdo | CANÔNICO |
| AuditEvent | id/occurredAt/actor/type/project/action/resource/result/reason/request/metadata/retention/createdAt | I ator/projeto/ação por data e retenção; SetNull | audit/privacy; identificador técnico; 365 dias default | CANÔNICO |
| PrivacyRequest | id/user/type/status/datas/reason/timestamps | I user+type+status/schedule/update; User cascade | privacy; dado do titular; 365 dias após finalização | CANÔNICO |
| PersonalDataExport | id/user/status/format/expiry/completion/failure/error/timestamps | I user+created/status+expires; User cascade | privacy; metadata técnica; TTL 15 min | CANÔNICO |

## Conceitos ausentes ou indefinidos

`Sprint`, `Comment`, `Notification`, `Alert`, `Indicator`, `Report`, `TestCase` e `Defect` não existem. São capacidades futuras dos RFs e permanecem **INDEFINIDAS nesta E8**; nenhum campo solto, inclusive `TaskMovement.sprintId`, autoriza inventar o model/cardinalidade. `GithubSyncRun` também foi adiado para E9.

## Pertencimento

FKs garantem existência, não igualdade de projeto entre Task e Requirement/Commit/PR/Issue nem membership ativa do responsável/ator. Essas invariantes permanecem em services e transações. A E8 não adicionou SQL CHECK ou trigger que o Prisma não represente de forma portátil.
