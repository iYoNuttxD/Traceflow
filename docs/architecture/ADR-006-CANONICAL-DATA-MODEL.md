# ADR-006 — Modelo de dados canônico e contract da E8

- Estado: aceita e concluída definitivamente
- Data: 25/07/2026
- Estratégia: expand → backfill → switch compatível → contract protegido

## Contexto

O schema pós-E7 mantinha `GithubArtifact` ao lado de `Commit`/`PullRequest`/`Issue`, `TraceLink` ao lado das relações tipadas e `Task.pullRequestId` ao lado do join experimental `TaskPullRequest`. A expansão N:N foi uma decisão conservadora tomada porque a cardinalidade funcional não estava confirmada no checkout usado na primeira execução da E8.

A equipe confirmou posteriormente o contrato funcional do MVP: uma Task pode estar vinculada a zero ou uma PullRequest; uma PullRequest pode estar vinculada a zero ou várias Tasks.

## Decisão de cardinalidade

No MVP do TRACEFLOW, uma tarefa pode estar associada a, no máximo, uma Pull Request. Uma Pull Request pode estar associada a várias tarefas. Portanto, a chave estrangeira opcional `Task.pullRequestId` é a representação canônica da relação.

`TaskPullRequest` não representa o contrato funcional do MVP e foi removido após auditoria e reconciliação. O contrato HTTP continua singular. Suporte futuro a múltiplas PRs por tarefa exigirá nova decisão funcional, novo ADR, migration e alteração contratual explícita.

## Demais decisões canônicas

- `Commit`, `PullRequest` e `Issue` são as fontes canônicas de artefatos GitHub; `GithubArtifact` foi descontinuado e removido.
- `Requirement → Task`, `TaskCommit`, `TaskIssue` e `Task.pullRequestId` são os vínculos canônicos; `TraceLink` foi descontinuado e removido.
- `ProjectMembership` continua canônico; `ProjectMember` permanece legado porque não faz parte deste contract.
- `Task.responsibleUserId` e `TaskMovement.movedByUserId` continuam canônicos, com fallbacks históricos ainda preservados.
- Identidade/configuração GitHub continua em `githubRepositoryId`, `githubRepositoryFullName`, `githubRepositoryUrl` e `githubDefaultBranch`; aliases históricos não foram tratados neste fechamento.
- Enums, timestamps, ownership, cascatas de auditoria e regras de mesmo projeto permaneceram inalterados.

## Contract e proteção de dados

Auditoria, reconciliação e contract são separados. O dry-run exige zero conflito, órfão, dado exclusivo, consumidor ativo e relação dependente. O apply requer banco de teste ou confirmação explícita por ambiente. Cada migration contract possui guard SQL que falha antes do `DROP TABLE` se qualquer registro residual existir.

Os relatórios contêm somente contagens, checksums e estado técnico. Nenhum título, descrição, nome, e-mail, token ou payload GitHub é emitido.

## Consequências

O runtime possui uma única fonte de verdade para Task–PR e relações específicas para rastreabilidade. O dual-write e os fallbacks foram removidos. As rotas genéricas antigas foram removidas na E10; somente `DELETE /api/projects/:id` permanece `501` e não depende desses models. Rollback operacional é por roll-forward e restauração de backup, nunca por edição de migration já aplicada.

## Evolução posterior

A LR.2 concluiu o contract que não fazia parte da E8: removeu `ProjectMember`,
`TaskMovement.projectMemberId`, `Commit.branch` e os aliases GitHub de `Project`. As fontes vigentes
são `User` + `ProjectMembership`, `GitBranch` + `CommitBranch` e
`ProjectGitHubIntegration`. As referências anteriores permanecem neste ADR apenas para registrar o
contexto histórico da decisão E8.
