# Inventário vigente de legado do TRACEFLOW

Atualizado pela LR.2 em 20/08/2026. A auditoria detalhada, incluindo consumidores e
contagens pré-contract, está em [LR_2_LEGACY_AUDIT.md](LR_2_LEGACY_AUDIT.md).

## Estado executável

| Elemento | Estado LR.2 | Fonte canônica ou justificativa |
| --- | --- | --- |
| `ProjectMember` | `REMOVED` | `User` + `ProjectMembership`; a migration aborta se encontrar linha não reconciliada |
| `TaskMovement.projectMemberId` | `REMOVED` | `movedByUserId`; `movedBy` permanece apenas como snapshot textual |
| `POST /projects/:projectId/members` | `REMOVED` | convite, ingresso por código e administração de `ProjectMembership` |
| rotas antigas de privacidade `/api/account/*` | `REMOVED` | `/api/settings/*`; paths removidos chegam ao `404 ROUTE_NOT_FOUND` global |
| `/api/account/reactivation/start` e `/confirm` | `CANONICAL` | fluxo específico de reativação, sem equivalente duplicado |
| `Commit.branch` | `REMOVED` | `GitBranch` + `CommitBranch`; DTOs expõem `branches[]` |
| aliases e estado GitHub persistidos em `Project` | `REMOVED` | `ProjectGitHubIntegration` é a única autoridade da conexão |
| `Project.inviteLink` | `REMOVED` | o link é derivado de `FRONTEND_URL` + `accessCode` no DTO sensível |
| `Project.accessCode` e `accessCodeRole` | `CANONICAL` | capability atual de ingresso MEMBER/VIEWER, administrada por OWNER |
| `project-invite.service.js` | `REMOVED` | services de access code, invitation e membership |
| `projectMembersApi` e `listProjectMembers` | `REMOVED` | barrel e consumidores usam somente `membersApi` |
| redirect frontend `/account/privacy` | `REMOVED` | rota vigente `/settings/privacy` |
| wrappers `pages → features` | `CANONICAL` | fronteira arquitetural, não camada de compatibilidade |
| `Task.responsible` | `HISTORICAL_SNAPSHOT` | apresentação anterior à identidade; autorização usa `responsibleUserId` |
| `TaskMovement.movedBy` | `HISTORICAL_SNAPSHOT` | autoria apresentada no evento; identidade usa `movedByUserId` |
| `TraceLink`, `GithubArtifact`, `TaskPullRequest` | `HISTORICAL_ONLY` | ausentes de schema/runtime; nomes permitidos em migrations e relatos históricos |
| scripts E8 | `RECOVERY_ONLY` | auditoria/reconciliação de snapshots pré-E8; não são importados pelo runtime |
| fontes e testes E6/E11 dependentes do schema pré-LR.2 | `RECOVERY_ONLY` | usar antes do contract LR.2 com o checkout/schema correspondente; suites atuais são `N/A` |
| migrations anteriores à LR.2 | `HISTORICAL_ONLY` | histórico imutável do banco; não são reescritas para remover nomes antigos |
| `DELETE /api/projects/:id` | `CANONICAL_PLACEHOLDER` | permanece `501` até decisão própria de retenção e cascata; fora do contract LR.2 |

## Fontes canônicas

- identidade: `User`, `Session` e `GitHubIdentity`;
- participação e autorização: `ProjectMembership`;
- convites: `ProjectInvitation` e ingresso opcional por `Project.accessCode`;
- integração: `GitHubInstallation` + `ProjectGitHubIntegration`;
- branches: `GitBranch` + `CommitBranch`;
- rastreabilidade: `Requirement`, `Task`, `Commit`, `PullRequest`, `Issue` e relações tipadas;
- conta e privacidade: `/api/settings/*`, processador de exclusão e rotas específicas de reativação.

`RECOVERY_ONLY`, `HISTORICAL_ONLY` e `HISTORICAL_SNAPSHOT` não autorizam dependência de
runtime, fallback de identidade, dual-write ou reintrodução de contrato HTTP.
