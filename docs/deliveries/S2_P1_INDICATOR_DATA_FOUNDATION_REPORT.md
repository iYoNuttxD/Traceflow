# S2 P1 — Indicator Data Foundation: relatório local

## A. Baseline e escopo

`daniel-dev`, HEAD inicial `54ea185e42bc95d07c0ade91b89ace6f64375b99`; antes do P1 havia apenas `docs/indicators/` não rastreado do P0. Shell inicial Node 26; validações P1 usam Node 22.23.3. A fundação adiciona fatos, migrations e contratos; S2-04/S2-05 continuam abertos. Não há Indicator Engine, `/indicators`, dashboard, gráfico, biblioteca de chart, commit ou push.

## B. Decisões D01–D15

As quinze decisões foram promovidas a contrato aprovado no [catálogo](../indicators/S2_INDICATOR_CATALOG.md) e resumidas na [fundação](../indicators/S2_INDICATOR_DATA_FOUNDATION.md). D01 usa `main` literal; D02/D03 preservam responsável e deduplicação de conclusão; D04–D08 fixam relógios/fluxo/Sprint; D09 usa GitHub user ID; D10 usa eventos reais; D11 reutiliza policy S1-09; D12–D15 definem reteste, correção, período IANA e estados dos dados. A divergência RF18/RF54 do TCC segue explícita: fórmula RF18 é temporariamente canônica, sem cálculo nesta etapa.

## C. Pull Request lifecycle

O client da GitHub App lê `issues.listEventsForRepo` com paginação completa, filtrando `closed/reopened/merged` em PRs e mapeando ID/data oficiais. A permissão Issues read consta na documentação da API e no runbook da App; não houve validação ao vivo da instalação externa. O novo `PullRequestLifecycleEvent` é append-only, único por `(projectId,providerEventId)`, ligado por FK composta à PR do mesmo projeto. Após completar todas as páginas, o sync persiste eventos com deduplicação e marca `pullRequestLifecycleSyncedAt` na mesma transação, inclusive com zero eventos; falha parcial não avança o marcador nem apaga fatos existentes. A próxima sync importa o histórico que a API retornar. Custo: uma request por página de eventos do repositório, nenhuma request por PR.

## D. Commit identity

`item.author.id` do GitHub alimenta `Commit.authorGithubUserId` como string; ausência fica `null`. Sync preenche IDs nulos em commits já existentes sem duplicar hash/projeto. `GitHubIdentity.githubUserId` permite associação por igualdade apesar de mudança de login. Nenhum vínculo é fabricado por nome/e-mail. O primeiro sync completo pós-migration revarre branches legadas sem generation; resolução tardia de autoria após head inalterado ainda exige nova varredura/head novo.

## E. Main branch

O sync de commits varre o SHA do head observado, não o nome móvel da branch. Só depois da última página, uma transação com lock do projeto ativo valida a propriedade dos Commit IDs, marca generation, cria/atualiza vínculos `CommitBranch`, remove os não observados **na mesma branch** e confirma o head. Falha de paginação, Commit cross-project, projeto soft-deleted, head ausente ou alterado não aplica a fotografia. Commits canônicos e outras branches sobrevivem. Links legados só se tornam confiáveis após o primeiro scan completo P1.

## F. Responsabilidade histórica

`TaskMovement.responsibleUserIdSnapshot` guarda o responsável dentro da transação de status/movimento/histórico/reconciliação. `PATCH /tasks/:id/status` e `/tasks/:id/move` aceitam `responsibleUserId?`: a mudança conjunta usa o responsável resultante e registra `TaskHistoryEntry.RESPONSIBLE`. Reatribuição posterior não altera conclusão anterior; reabertura pode produzir nova conclusão com outro responsável. Movimentos antigos permanecem `null`, sem backfill inferido. Hard delete de Task mantém a limitação histórica já existente.

## G. Schema e migrations

Duas migrations incrementais: `20260924120000_s2_p1_indicator_data_foundation` e `20260924130000_s2_p1_lifecycle_coverage`. Acrescentam novo model PR e campos nullable em Commit/GitBranch/CommitBranch/TaskMovement/ProjectGitHubIntegration. A segunda foi criada para distinguir coleta vazia concluída de ausência de coleta, sem editar a primeira já aplicada ao schema de teste. Migrations anteriores não foram alteradas. `prisma validate` e `prisma generate` passaram; deploy integral vazio passou em schema descartável. O script `db:test:validate-s2-p1` aplicou as migrations anteriores, inseriu Project/ProjectGitHubIntegration/Task/TaskMovement/Commit/PullRequest/GitBranch/CommitBranch, aplicou ambas e verificou preservação das linhas, campos novos `null` e tabela de eventos vazia. `db:test:migrate/status` usa somente `traceflow_test`, distinto do banco de desenvolvimento. A CI recebeu o gate de upgrade representativo.

## H. Índices e performance

Novos índices: identidade única e datas de `PullRequestLifecycleEvent`, FK composta PR/projeto, e FK do snapshot para User. Índices especulativos em TaskHistoryEntry/PullRequest/Issue/Defect/Commit não foram criados. `EXPLAIN` read-only no banco local pequeno escolheu índices existentes para as cinco consultas candidatas; estimativas de 1 a 25 linhas não justificam índice novo. O sync completo de branch e coleção de eventos em memória podem custar mais em repositórios grandes; a finalização é transacional com timeout de 120 s, sem fallback destrutivo.

## I. Privacidade e segurança

Inventário e retenção foram atualizados. Exportação pessoal inclui apenas snapshots de responsabilidade do titular e commits com GitHub ID exato em projetos ativos com membership ativa. Unlink/anonimização removem a identidade local, enquanto o ID técnico externo permanece no artefato do projeto conforme política registrada; uma mudança dessa retenção exigiria tratar ressincronização. Não foi adicionado nome/e-mail ao snapshot, payload integral de evento, ranking ou perfil. Novas escritas do sync são project-scoped com lock de projeto ativo; FK composta impede evento cross-project; purge remove eventos por cascade.

## J. Testes focados

Passaram: mapper de ID estável e lifecycle, paginação repository-wide, eventos CLOSED/REOPENED/CLOSED/MERGED e idempotência, novo evento em sync posterior, provider ID igual em projetos distintos, varredura vazia marcada, falha da segunda página sem avançar marcador, autoria nula→ID sem duplicação, membership `A B C → A D`, falha incompleta sem remoção, outra branch preservada, link legado com generation nula, snapshot na transição, reatribuição, reabertura, mutação conjunta por HTTP, exportação restrita, soft delete e cascade de projeto. A suíte de GitHub App/API já existente também passou após atualizar os fixtures para SHA ancorado e eventos.

## K. Regressão e gates

| Gate | Resultado local |
|---|---|
| Backend full, unit, integration/API e coverage | PASS: suíte completa com coverage 1.353 testes; unit 792; integração/API 561; 5 skips existentes. Cobertura: 91,02% statements / 93,57% lines. |
| Backend lint, format, architecture | PASS. |
| Frontend full e coverage | PASS: 1.231 testes; coverage 83,87% statements / 86,3% lines. |
| Frontend lint, format, build | PASS; build mantém avisos conhecidos de tamanho de chunks/IIFE. |
| Prisma validate/generate, empty deploy, representative upgrade | PASS. |
| CI manifest validation, secret/dependency checks | PASS: contrato da CI e 13 testes da policy; scanner de segredos (530 arquivos); auditoria npm backend/frontend com 0 high e 0 critical. |
| `git diff --check` e arquivos não rastreados | PASS: diff versionado sem whitespace; 4 documentos novos com links relativos existentes e sem whitespace final. |

Os skips existentes não foram adicionados/relaxados nesta rodada. Uma tentativa isolada de integração falhou na preparação do banco por restrição de acesso local no sandbox; `db:test:status` e a execução final de integração passaram fora dele, usando somente `traceflow_test`. Testes com mocks e fixtures locais não substituem validação ao vivo dos dados da instalação GitHub nem medição em volume real.

## L. Prontidão antes/depois

| Status | P0 | P1 |
|---|---:|---:|
| READY | 16 | 16 |
| DERIVABLE | 39 | 48 |
| NEEDS_HISTORY | 6 | 5 |
| NEEDS_SCHEMA | 0 | 0 |
| NEEDS_GITHUB_DATA | 1 | 1 |
| NEEDS_PRODUCT_DECISION | 11 | 3 |
| NOT_RECOMMENDED | 1 | 1 |

I02/I03/I04/I06/I21/I22/I47/I58/I66 tornaram-se `DERIVABLE` sob as condições de cobertura; I46 passou de decisão de produto a `NEEDS_HISTORY`. Nenhum RF foi marcado IMPLEMENTADO.

## M. Lacunas para P2/P3

Implementar cálculos/DTOs/estados e testes de período IANA no P2; validar cobertura temporal real de PR lifecycle e GitHub App; definir composição/"ativo no período" de I05/I07/I08; manter I19 sem Reviews, I20/I24/I25/I46/I57 limitados. Medir consultas finais com volume antes de índices/cache. Nenhuma dessas lacunas autoriza inferir dado ausente como zero.

## N. Diff e estado Git

`git status --short` mostra somente alterações locais da fundação e os documentos P0/P1 não rastreados; nenhuma operação de commit/push/merge/rebase/reset/clean/stash ocorreu. `git diff --stat` exclui untracked, listados separadamente no status. Os documentos P0 de `docs/indicators/` permanecem não rastreados por origem e foram atualizados nesta rodada.

## O. Mensagem sugerida

`feat: establish indicator data foundation`

## Resultado

**S2 P1 INDICATOR DATA FOUNDATION — PASS LOCAL.** A validação ao vivo da instalação GitHub e a medição em repositórios de grande volume permanecem pendentes para as etapas seguintes. S2-04 e S2-05 continuam abertos.
