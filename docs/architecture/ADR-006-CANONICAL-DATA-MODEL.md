# ADR-006 — Modelo de dados canônico e migração E8

- Estado: aceita na E8
- Data: 25/07/2026
- Estratégia: expand → backfill → switch compatível → contract separado

## Contexto

O schema pós-E7 contém identidade, sessão, autorização, privacidade e auditoria, mas preserva representações do MVP: `GithubArtifact` ao lado de `Commit`/`PullRequest`/`Issue`, `TraceLink` ao lado de relações tipadas, `ProjectMember` ao lado de `ProjectMembership`, campos GitHub duplicados e atores/responsáveis textuais. `Task.pullRequestId` também limita cada tarefa a uma única PR.

O Capítulo 3 do TCC e seus diagramas não estão presentes neste checkout. RF09 confirma vínculo Task–PR, mas não explicita cardinalidade. Por isso, a persistência é expandida para N:N sem mudar ainda o contrato HTTP singular.

## Decisão

- `Commit`, `PullRequest` e `Issue` são os artefatos GitHub canônicos. `GithubArtifact` é `LEGADO ATIVO` para reconciliação e para o placeholder 501; não recebe novos consumidores.
- `TaskCommit`, `TaskIssue` e o novo `TaskPullRequest` são vínculos técnicos canônicos. Todos usam unique composto; apagar a tarefa apaga somente o join, nunca o artefato.
- `TaskPullRequest` suporta N:N. `Task.pullRequestId` permanece alias legado e é escrito na mesma transação pelo contrato singular atual. A leitura prefere o campo histórico e usa o join como fallback, sem devolver coleção nova.
- `Requirement–Task` permanece 1:N por `Task.requirementId`; não existe evidência para alterar sua cardinalidade.
- `TraceLink` é `LEGADO/PLACEHOLDER`. Relações suportadas são materializadas de forma idempotente nos joins tipados, mas a origem não é apagada.
- `ProjectMembership` é a associação canônica de identidade. `ProjectMember` permanece legado até todos os registros e consumidores estarem reconciliados.
- `Task.responsibleUserId` e `TaskMovement.movedByUserId` são canônicos. `responsible`, `movedBy` e `projectMemberId` preservam histórico/fallback até cobertura integral.
- Para repositório GitHub, a identidade canônica é `githubRepositoryId`; apresentação e resolução usam `githubRepositoryFullName`, `githubRepositoryUrl` e `githubDefaultBranch`. `githubOwner`, `githubRepositoryName` e os aliases `githubRepo/githubUrl` permanecem transitórios porque contratos atuais os consomem.
- `GithubSyncRun` não foi criado: modelar execução sem implementar a semântica da E9 criaria tabela sem ownership operacional.
- Enums Prisma continuam restritos aos conjuntos estáveis já implantados (`ProjectRole`, auditoria e privacidade). Estados históricos de Project/Requirement/Task/GitHub permanecem strings validadas; conversão exige auditoria de valores reais.
- UTC continua padrão. Timestamps externos são separados dos locais. Nenhum timestamp foi adicionado sem consulta/retention real.

## Integridade e ownership

- `Project` é agregado de Requirement, Task e artefatos. A E8 explicita cascade Project→Requirement; joins tipados usam cascade para o vínculo.
- Auditoria usa `SetNull` para ator/projeto; identidade é anonimizada, não fisicamente apagada no fluxo comum.
- Regras “mesmo projeto” continuam garantidas no service/transação: FKs isoladas não expressam igualdade de `projectId` entre Task e artefato.
- Os novos índices cobrem consultas reais por projeto/status/data, histórico, artefatos, membership e os dois sentidos dos joins. Unique/PK não foram duplicados.

## Compatibilidade e contract

O switch da E8 é interno: dual-write transacional e dual-read sem mudança do JSON. Remoções ficam proibidas até contagens pendentes e conflitos chegarem a zero, consumidores antigos desaparecerem e uma migration contract separada possuir rollback por roll-forward. O plano verificável está em `docs/data/E8_CONTRACT_PLAN.md`.

## Consequências

Há redundância temporária e custo de dual-write. Em troca, a migração preserva dados, torna a futura cardinalidade N:N possível e permite comparar checksums/contagens antes de remover legado. E9 deve consolidar repositório/sync; E10 deve decidir o destino definitivo de `TraceLink`; E11 deve retirar fallbacks textuais somente após reconciliação real.
