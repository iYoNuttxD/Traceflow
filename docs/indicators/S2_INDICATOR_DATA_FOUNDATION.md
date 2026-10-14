# S2 — Fundação dos dados de indicadores (P1)

## 1. Baseline

P1 iniciou em `daniel-dev`, HEAD `54ea185e42bc95d07c0ade91b89ace6f64375b99`, com apenas `docs/indicators/` não rastreado do P0. O shell tinha Node 26; Prisma e testes P1 usam Node 22.23.3. O banco de desenvolvimento é `localhost:3306/traceflow`; migrações e fixtures foram aplicadas apenas a schemas de teste distintos e descartáveis. Esta etapa cria fatos, sem Indicator Engine, endpoint `/indicators`, gráfico ou painel. Os cartões S2-04/S2-05 permanecem abertos.

## 2. Contratos D01–D15

As quinze decisões da [tabela canônica](S2_INDICATOR_CATALOG.md) estão aprovadas. Resumo operacional:

| Decisão | Contrato para P2/P3 |
|---|---|
| D01 | `GitBranch.name='main'` literalmente; sem branch observável, `UNAVAILABLE`. |
| D02 | Conclusão atribuída ao responsável capturado no evento; mutação conjunta usa estado resultante. |
| D03 | RF17/throughput contam Task distinta no máximo uma vez por período, pela conclusão vigente no corte. |
| D04 | Lead time de `Task.createdAt` à primeira conclusão válida, tempo corrido. |
| D05 | Cycle time da primeira entrada `EM_ANDAMENTO` à primeira conclusão válida, tempo corrido. |
| D06 | Throughput de Tasks distintas concluídas no período, coerente com D03. |
| D07 | Velocity apenas de Sprint `CONCLUIDA` com snapshot íntegro; não usar atual/cancelada. |
| D08 | Burnup só com séries prováveis de escopo e conclusão; não fabricar histórico intermediário. |
| D09 | Autoria por ID GitHub estável igual a `GitHubIdentity.githubUserId`; sem correspondência, não associado. |
| D10 | PR lifecycle por evento oficial do GitHub, sem inferência por polling/`updatedAtGithub`. |
| D11 | Cobertura usa `implementation.implemented` da policy S1-09; qualidade é dimensão separada. |
| D12 | Reteste por tentativa: `PASS/(PASS+FAIL+BLOCKED)`; `BLOCKED` também separado. |
| D13 | Correção de `Defect.createdAt` ao primeiro `VALIDATED`, mediana. |
| D14 | Datas civis em fuso IANA explícito convertidas a UTC `[startInclusive,endExclusive)`, relógio por ficha. |
| D15 | `AVAILABLE`, `NO_DATA`, `PARTIAL`, `STALE`, `UNAVAILABLE`; ausência não vira zero. |

Para retrabalho, RF18 (`reabertas / PRs fechadas`) é a fórmula temporária para I04; RF54 reutilizará I04. O TCC também menciona “total de PRs no período” em RF54. A divergência fica registrada em `TCC_ALIGNMENT_NOTE` no catálogo e não foi ocultada.

## 3. Schema e migration

Duas migrations incrementais P1 foram criadas. `20260924120000_s2_p1_indicator_data_foundation` acrescenta `PullRequestLifecycleEvent`, `Commit.authorGithubUserId`, `GitBranch.lastSyncedGeneration`, `CommitBranch.lastObservedGeneration` e `TaskMovement.responsibleUserIdSnapshot`. `20260924130000_s2_p1_lifecycle_coverage` acrescenta `ProjectGitHubIntegration.pullRequestLifecycleSyncedAt` nullable para provar varredura concluída mesmo com zero eventos. Campos em registros existentes começam `null`; o novo model começa vazio. Nenhum movimento/commit legado recebeu valor estimado. `PullRequestLifecycleEvent` tem unicidade `(projectId,providerEventId)` e FK composta `(pullRequestId,projectId) → PullRequest(id,projectId)`, impedindo vínculo entre projetos. FKs `Cascade` removem eventos no hard purge; soft delete/restore não os alteram.

## 4. Pull Request lifecycle

Fonte: [endpoint oficial repository-wide](https://docs.github.com/en/rest/issues/events#list-issue-events-for-a-repository) `GET /repos/{owner}/{repo}/issues/events`, via installation token da GitHub App, com permissão mínima Issues read já documentada no [runbook](../runbooks/GITHUB_INTEGRATION.md). Os [tipos de evento oficiais](https://docs.github.com/en/rest/using-the-rest-api/issue-event-types) incluem `closed`, `reopened` e `merged` para PR. O client pagina em lotes de até 100 com `paginateGithub`/`executeGithubRequest`, reutilizando timeout, retry limitado e tratamento de rate limit. É uma chamada por página de eventos do repositório, zero chamadas por PR. O mapper aceita apenas esses tipos com `id`, `created_at` e `issue.pull_request`; outros eventos/issues não geram linha. ID e horário são do provider.

O sync percorre todas as páginas de PRs e todas as páginas de eventos antes de gravar os eventos coletados. Cada página atualiza o heartbeat do run; eventos e `pullRequestLifecycleSyncedAt` são gravados na mesma transação, inclusive quando a lista está vazia. A gravação usa lotes de até 500. Falha da página seguinte não apaga histórico nem avança o marcador; o run fica `FAILED` e o último sucesso permanece anterior. `createMany(skipDuplicates)` torna reprocessamento idempotente; um novo provider ID acrescenta um fato. Não há `delete all + recreate`. A próxima sincronização pode importar eventos históricos ainda retornados pela API. O marcador prova **que a varredura terminou**, não que o GitHub devolveu todo o passado; sem confirmação da abrangência temporal efetiva de uma instalação/repositório, o Engine futuro deve usar `PARTIAL/UNAVAILABLE`, jamais inferir ausência de reabertura do estado corrente. A permissão foi confirmada na documentação oficial e no runbook local; validação ao vivo da instalação externa ainda depende de sync real.

## 5. Commit identity

`mapGithubCommit` guarda `item.author.id` como string em `authorGithubUserId`, ou `null` se o GitHub não resolver a conta. O `Commit` canônico não recebe FK para `User`. Em sync de commit já existente com ID antes nulo, `fillGithubAuthorIds` preenche somente nulos; hash/projeto não duplicam. A igualdade futura com `GitHubIdentity.githubUserId` sobrevive a mudança de login. Nome, e-mail e login aproximado não são prova. O primeiro sync completo após a migration força revarredura de branches sem generation, permitindo backfill quando o provider devolver ID; syncs posteriores com head inalterado pulam a varredura e não descobrem mudanças tardias da resolução do autor até um novo head/varredura explícita.

## 6. Semântica de membership da branch main

O P0 encontrou links `CommitBranch` acumulativos. P1 usa `GitBranch.headSha` observado como `sha` da paginação GitHub; isso ancora a varredura a um commit imutável. Apenas após todas as páginas, a transação de projeto ativo valida que todos os Commit IDs pertencem ao projeto, cria/atualiza links da branch com uma generation UUID, remove links da mesma branch que não foram observados e grava `lastSyncedHeadSha/lastSyncedGeneration`. Falha de página, soft delete, head alterado, Commit cross-project ou transação incompleta não removem links. Outras branches e o `Commit` canônico permanecem. Branch sem head SHA recusa confirmação. O primeiro sync P1 reconcilia links legados `lastObservedGeneration=null`; antes dele, RF16 não pode afirmar membership corrente. Sync com head já confirmado pula a varredura. A fotografia é do SHA observado no início do sync, não uma alegação de tempo real.

## 7. Responsável histórico da Task

`TaskMovement.responsibleUserIdSnapshot` é nullable e aponta para `User` com `SetNull` em remoção. Na mesma transação que trava projeto/Sprint/Task, altera status, cria movement, TaskHistoryEntry e reconcilia defeitos, o repository lê o responsável e grava o ID no movement. `PATCH /tasks/:id/status` e o movimento Kanban aceitam opcionalmente `responsibleUserId` com a mesma validação de membership do CRUD; quando status e responsável mudam juntos, ambos são escritos atomicamente e o snapshot recebe o responsável **resultante**. A mudança também cria `TaskHistoryEntry.RESPONSIBLE`. Reatribuição posterior não altera movimentos anteriores. IDs antigos continuam `null`; não houve backfill por nome nem pelo responsável atual. Hard delete de Task ainda remove seus movimentos pela política existente, limitando séries antigas.

## 8. Backfill e limites históricos

PR: importar apenas eventos retornados pelo GitHub em sync completo; não converter `closedAtGithub/updatedAtGithub` em lifecycle. Commit: preencher ID quando provider fornecer em varredura, sem heurística. Main: reconciliar somente após scan completo. Task: não reconstruir snapshots legados. Cumulative flow, burnup, lead time legado, tempo de correção legado e GitHub Reviews continuam limitados conforme catálogo. Disponibilidade futura precisa considerar data do primeiro sync P1, sucesso da coleta, source status e `null` legado; schema existente por si não garante `AVAILABLE`.

## 9. Privacidade e autorização

Novos campos pessoais constam no [inventário](../privacy/PERSONAL_DATA_INVENTORY.md) e na [retenção](../privacy/DATA_RETENTION_POLICY.md). Não armazenamos nome/e-mail adicional no snapshot; PR events não guardam payload integral. ID GitHub é identificador técnico externo do autor, usado só para associação por igualdade no projeto, sem ranking/perfil. Unlink e anonimização removem `GitHubIdentity` local; artefato técnico do projeto permanece, conforme política documentada. Exportação pessoal inclui movimentos cujo snapshot pertence ao titular e commits cujo ID GitHub coincide exatamente com a identidade vinculada, sempre limitados a projetos ativos com membership ativa. Todas as novas escritas de sync passam por `withActiveProjectWrite`; FK composta e consultas filtram `projectId`.

## 10. Índices e performance

Os índices novos atendem unicidade, FK e leitura temporal do novo model: `PullRequestLifecycleEvent(projectId,providerEventId)` único, `(projectId,occurredAt)`, `(pullRequestId,occurredAt)` e índice de FK composta; `TaskMovement.responsibleUserIdSnapshot` atende FK. `CommitBranch(branchId)` e `TaskMovement(projectId,movedAt)` já existiam. Não foram criados índices especulativos em Commit/TaskHistoryEntry/PullRequest/Issue/Defect.

`EXPLAIN` read-only no banco local de desenvolvimento (projeto 2, volume pequeno) escolheu `TaskHistoryEntry_field_occurredAt_idx` (~5 linhas estimadas), `PullRequest_projectId_githubId_key` (~20), `Issue_projectId_githubId_key` (~1), `Defect_projectId_deletedAt_status_idx` (~4) e `TaskMovement_projectId_movedAt_idx` (~25). O plano pequeno não justifica novas estruturas; P2 deve medir consultas finais com volume representativo. Sync de PR custa `ceil(eventos/100)` requests adicionais, sem N+1 por PR. O scan completo de commits e a finalização transacional de membership podem custar mais em repositórios grandes; a transação tem timeout limitado de 120 s e falha sem aplicar fotografia incompleta. Eventos de PR são coletados em memória até a última página: monitorar tamanho/latência e paginar persistência com marcador de completude se volume real exigir.

## 11. Testes e migration

Testes P1 cobrem mapper/provider ID, paginação repository-wide, lifecycle idempotente e cross-project, varredura vazia marcada como concluída, falha parcial sem avanço do marcador, commit antigo nulo preenchido, main `A B C → A D`, falha incompleta, multibranch, link legado nulo, snapshot/reabertura/reatribuição, FK cascade. `prisma validate`, `prisma generate`, deploy vazio descartável e upgrade representativo com Project/ProjectGitHubIntegration/Task/TaskMovement/Commit/PullRequest/GitBranch/CommitBranch passaram. O [relatório P1](../deliveries/S2_P1_INDICATOR_DATA_FOUNDATION_REPORT.md) registra os gates completos e eventuais bloqueios.

## 12. Prontidão após P1 e próximos gaps

| Status | P0 | P1 |
|---|---:|---:|
| READY | 16 | 16 |
| DERIVABLE | 39 | 48 |
| NEEDS_HISTORY | 6 | 5 |
| NEEDS_SCHEMA | 0 | 0 |
| NEEDS_GITHUB_DATA | 1 | 1 |
| NEEDS_PRODUCT_DECISION | 11 | 3 |
| NOT_RECOMMENDED | 1 | 1 |

I02/I03/I04/I06/I21/I22/I47/I58/I66 passaram a DERIVABLE; I46 passou a NEEDS_HISTORY, pois D08 já decide não fabricar a série. I20/I24/I25/I57 ainda carecem de baseline completo; I19 carece de Reviews; I05/I07/I08 ainda pedem composição de produto. `DERIVABLE` indica que o fato e o contrato permitem cálculo futuro **sob as condições de cobertura**. Não significa RF implementado. P2 é o Indicator Engine; P3 cobre qualidade/painel/filtros conforme planejamento posterior. P1 termina aqui para revisão humana.
