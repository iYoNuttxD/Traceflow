# E8 — Inventário canônico final do schema Prisma

Snapshot final: branch `daniel-dev`, continuação iniciada no commit `def9c89284c55c4ab892c653b9082d9fb824db25`, 25/07/2026. O banco isolado `traceflow_test` possuía zero registros nos três models contratados. Produção ou banco compartilhado não foi acessado.

| Model/relação | Representação final | Integridade e uso | Classificação |
|---|---|---|---|
| User, Session, PasswordResetToken | identidade, sessões e reset | constraints E6 preservadas | CANÔNICO |
| ProjectMembership, ProjectInvitation | participação, papel e convite | unique/índices/cascades preservados | CANÔNICO |
| Project | agregado e configuração GitHub | aliases históricos permanecem transitórios | CANÔNICO COM CAMPOS TRANSITÓRIOS |
| Requirement → Task | `Task.requirementId` | 0..1 requisito por Task; várias Tasks por Requirement | CANÔNICO |
| Task → PullRequest | `Task.pullRequestId` opcional | Task 0..1 PR; PR 0..N Tasks; `onDelete: SetNull` | CANÔNICO |
| TaskCommit | unique `(taskId, commitId)` | relação específica N:N | CANÔNICO |
| TaskIssue | unique `(taskId, issueId)` | relação específica N:N | CANÔNICO |
| Commit | unique por projeto/hash | fonte GitHub específica | CANÔNICO |
| PullRequest | unique por projeto/githubId e número | fonte GitHub específica; relação `tasks` | CANÔNICO |
| Issue | unique por projeto/githubId e número | fonte GitHub específica | CANÔNICO |
| TaskMovement | histórico e atores | fallbacks textuais ainda transitórios | CANÔNICO COM FALLBACKS |
| ProjectMember | membership histórica | ainda possui consumidores Kanban | LEGADO ATIVO, FORA DESTE CONTRACT |
| AuditEvent, PrivacyRequest, PersonalDataExport | auditoria e governança | retenção e relações E7 preservadas | CANÔNICO |
| TaskPullRequest | removido por `20260725130000_e8_contract_remove_task_pull_request` | zero registros exclusivos/conflitos/órfãos | REMOVIDO |
| GithubArtifact | removido por `20260725131000_e8_contract_remove_github_artifact` | zero consumidores ativos e dados exclusivos | REMOVIDO |
| TraceLink | removido por `20260725132000_e8_contract_remove_trace_link` | relações específicas preservadas; placeholders 501 mantidos | REMOVIDO |

## Conceitos ausentes ou futuros

`Sprint`, `Comment`, `Notification`, `Alert`, `Indicator`, `Report`, `TestCase`, `Defect` e `GithubSyncRun` não foram inventados. FKs garantem existência; pertencimento ao mesmo projeto continua uma invariante dos services/transações.
