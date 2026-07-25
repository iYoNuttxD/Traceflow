# E8 — Relatório final de reconciliação e contract

## Ambiente e decisão

- Branch: `daniel-dev`
- Commit inicial desta continuação: `def9c89284c55c4ab892c653b9082d9fb824db25`
- Banco: `traceflow_test`, isolado; nenhum banco compartilhado/produção foi consultado
- Cardinalidade confirmada: Task 0..1 PullRequest; PullRequest 0..N Tasks
- Fonte canônica: `Task.pullRequestId`

## Auditoria anterior ao contract

| Verificação | TaskPullRequest | GithubArtifact | TraceLink |
|---|---:|---:|---:|
| registros totais | 0 | 0 | 0 |
| registros reconciliados | 0 | 0 | 0 |
| registros exclusivos | 0 | 0 | 0 |
| conflitos/ambíguos | 0 | 0 | 0 |
| órfãos | 0 | 0 | 0 |
| duplicidades | 0 | 0 | 0 |
| consumidores ativos | 0 | 0 | 0 |
| relações dependentes externas | 0 | 0 | 0 |
| contract removível | sim | sim | sim |

Na auditoria Task–PR também foram zero: Tasks com mais de uma PR no join, joins sem `Task.pullRequestId`, joins diferentes da FK e FKs sem join correspondente. Checksums dos conjuntos vazios: `e3b0c442…b855`.

## Cenários artificiais verificados

- join singular preenche `Task.pullRequestId` e a segunda execução fica sem pendência;
- múltiplas PRs e divergência join/FK são classificadas como conflito e bloqueiam contract;
- artifact correspondente não é duplicado; Commit com `sha` suficiente é criado; artifact ambíguo bloqueia contract;
- TraceLink Requirement–Task, Task–Commit, Task–Issue e Task–PR é materializado nas relações específicas;
- tipo desconhecido, órfão, projeto divergente ou múltiplas PRs bloqueia contract;
- relatórios não contêm conteúdo, nome, e-mail ou payload legado;
- auditoria e contract permanecem idempotentes.

## Resultado

As migrations contract foram aplicadas após dry-run limpo. `TaskPullRequest`, `GithubArtifact` e `TraceLink` foram removidos. A auditoria posterior informa `tablePresent: false`, zero pendências e contract permitido. Tasks, PullRequests, Commits, Issues, TaskCommit, TaskIssue, auditoria e solicitações de privacidade foram preservados.

Durante a primeira montagem manual do cenário temporário de upgrade, um processo isolado herdou por engano a `DATABASE_URL` de desenvolvimento e inseriu cinco registros integralmente sintéticos, identificados por marcadores exclusivos. A execução falhou antes de tocar tabelas legadas; somente esses registros sintéticos foram removidos imediatamente por seus identificadores exatos. Nenhum registro preexistente, schema ou migration foi alterado e nenhum banco foi resetado. O cenário foi repetido com target temporário explícito e aprovado integralmente.

Estado definitivo: **CONCLUÍDA DEFINITIVAMENTE**.
