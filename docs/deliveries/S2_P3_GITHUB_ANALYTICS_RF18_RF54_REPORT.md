# S2 P3 — GitHub Analytics + RF18/RF54 — relatório local

## 1. Baseline

Início em `daniel-dev`, HEAD `b10920f34510692f4a769fcca49a1296ea52de8c`, working tree limpa, `git diff --check` vazio. Gates em Node 22.23.3 e Prisma 6.12.0. Sem commit, push, merge, rebase, reset, clean ou stash.

## 2. Escopo

P3 implementa no backend I04/RF18, I06/RF54, I09–I18, I73 e I74. I19/Reviews, Flow, Task e Sprint Analytics, painel, gráficos e frontend permanecem fora desta etapa. S2-04 e S2-05 seguem abertos.

## 3. Reuso do Indicator Engine

O endpoint `GET /api/projects/:projectId/indicators/github` usa rota → controller → service → repository/Prisma, `indicatorResult`, catálogo, period/freshness/state policies e calculators puros. A extensão retrocompatível do mapper acrescenta `kind`, `items`, contagens de amostra e `coverage`. I01/I02/I03/I05 preservam o contrato P2. A agregação é sob demanda, sem cache.

## 4. RF18

I04 usa exclusivamente `PullRequestLifecycleEvent` para detectar reabertura. O numerador é o número de PRs distintas da coorte com `REOPENED` depois do primeiro `CLOSED` elegível e antes de `endExclusive`; o denominador é o número de PRs distintas com `CLOSED` no período. Duplicatas e múltiplos ciclos não multiplicam PRs. Com D>0/N=0: `0% AVAILABLE`; com D=0: `null NO_DATA`, se a cobertura for comprovada.

## 5. Coorte de retrabalho

O relógio é `CLOSED.occurredAt`, com período UTC `[startInclusive,endExclusive)` da policy P2. A migration `20260924234000_s2_p3_lifecycle_coverage_start` acrescenta `pullRequestLifecycleCoverageFrom` nullable. A primeira varredura completa registra esse início na mesma transação dos eventos e de `pullRequestLifecycleSyncedAt`, inclusive quando vazia; varreduras posteriores não o avançam. Registros legados permanecem `null` até a próxima coleta. I04/I06/I11 só afirmam completude quando `coverageFrom <= startInclusive` e `syncedAt >= endExclusive`; do contrário os valores conclusivos ficam `null`, com PARTIAL/UNAVAILABLE e `coverage`/limitation. Eventos antigos retornados pela API não provam cobertura histórica completa anterior à primeira varredura.

## 6. RF54

I06 reutiliza I04 e calcula, na mesma coorte fechada, PRs distintas com merge comprovado / PRs distintas fechadas. O DTO expõe `{reworkRate,mergedRate}`, `components` e N/D do merge. A taxa de merge não representa aprovação formal de reviewers. No contrato atual, as duas dimensões compartilham a mesma cobertura de CLOSED; estados diferentes só serão possíveis se fontes/garantias futuras divergirem. Nenhuma fórmula alternativa de retrabalho foi criada.

## 7. GitHub derived indicators

I09 conta `Commit.id` do projeto com `Commit.date` no período, sem restrição à main; difere do RF16. I11 conta PRs distintas com CLOSED; I12 usa `mergedAtGithub` canônico; I10/I13 são filas atuais de PR/Issue e têm `period:null`.

## 8. Pull Request metrics

I17 é lista top 10, da PR aberta válida mais antiga à mais nova, com ID, número, título, URL, criação e idade em dias. `value` informa quantas PRs abertas têm idade válida no conjunto completo. I73 calcula a média sobre **todas** as PRs abertas com criação válida, não só as dez listadas. Nenhuma autoria ou e-mail é retornado.

## 9. Issue metrics

I14 conta apenas Issues **atualmente fechadas** com `closedAtGithub` no período e sinaliza `ISSUE_LIFECYCLE_NOT_COLLECTED`/PARTIAL. Issue reaberta não conserva ciclo anterior em uma tabela de eventos. I13 conta Issues abertas na fotografia atual. Não foi criada coleta nova de Issue lifecycle.

## 10. Duration metrics

I15/I16 compartilham a amostra de PRs com merge no período e calculam mediana/média de `mergedAtGithub-createdAtGithub` em horas. I18/I74 compartilham a amostra corrente de Issues fechadas e calculam mediana/média em dias. Datas ausentes, inválidas ou invertidas são excluídas com `eligibleCount`/`excludedCount`; amostra vazia dá `NO_DATA`. Median e mean são funções puras; resultados têm até duas casas.

## 11. Freshness

`sourceUpdatedAt`, `sourceSyncStatus`, `asOf` e `limitations` usam a policy P2. Sem fotografia anterior: `UNAVAILABLE`, valor `null`. Falha de sync com fotografia conhecida: `STALE` quando não existe limite de cobertura mais forte. Cobertura parcial de lifecycle e falha de sync podem coexistir: o estado primário é PARTIAL, e a falha persiste em `limitations`/`sourceSyncStatus`.

## 12. Data states

Zero medido não vira ausência. Ratios com D=0 e durações sem amostra retornam `NO_DATA`; contagens íntegras vazias retornam `0 AVAILABLE`. Cobertura histórica não comprovada não vira `0%`. Timestamps excluídos marcam amostra parcial quando há valores elegíveis. `I14` permanece parcial pela ausência de ciclos de Issue.

## 13. Authorization/privacy

O middleware comum exige sessão e membership ativa VIEWER+; sessão ausente retorna 401, projeto alheio ou soft-deleted retorna 404 opaco. O endpoint retorna agregados e uma lista limitada de PRs, sem lifecycle bruto, dados de autor, e-mails, tokens, installation IDs ou ranking de pessoas.

## 14. Performance/query plans

Leitura em transação `RepeatableRead`: uma consulta de projeto, oito consultas set-based/batched para contagens, coorte, durações, idade agregada e lista limitada; o relacionamento de integração pode gerar leitura adicional conforme Prisma. Não há consulta por PR, evento ou Issue. A coorte agrupa por `pullRequestId` antes de `EXISTS` para reabertura/merge; I17 usa `LIMIT 10`. `scripts/explain-s2-p3.js` roda somente em `traceflow_test`; `EXPLAIN` no schema de teste vazio escolheu índice por projeto para a coorte, lookup por projeto para reabertura/merge e `PullRequest_projectId_createdAtGithub_idx` para a lista. O plano vazio não representa volume de produção; não foi criado índice novo sem profiling representativo. Durações carregam apenas IDs/datas da coorte em memória, portanto o custo cresce com o número de merges/fechamentos no intervalo, enquanto o payload é limitado.

## 15. Tests

Unitários cobrem medianas ímpares/pares, média, percentuais zero/ausência, exclusões e relógio controlado. API persistida cobre casos de coorte CLOSED/REOPENED, ciclos duplicados, reabertura fora do período, merge/CLOSED, limites UTC, zero/NO_DATA, cobertura legado/parcial, commits de qualquer branch, idade/lista top 10, durações, Issues, freshness, papéis VIEWER/MEMBER/MANAGER/OWNER, 401/404 e query inválida. Integração P1 verifica marcador inicial, preservação em repetição/falha e varredura vazia. Focado P1/P2/P3: 34 testes passaram antes do último acréscimo de casos; a suíte integral posterior inclui os testes atualizados.

## 16. Gates

| Gate | Resultado local |
|---|---|
| Backend unit | 803 PASS |
| Backend integração/API, execução isolada | 575 PASS; 5 skips preexistentes |
| Backend full com coverage | 1.378 PASS; 5 skips preexistentes; 91,17% statements / 93,74% lines |
| Backend lint/format, Prisma validate/generate, arquitetura | PASS |
| Frontend full/coverage | 1.231 PASS; 83,87% statements / 86,30% lines |
| Frontend lint/format/build | PASS; avisos conhecidos de IIFE/chunk no build |
| Migration vazia e upgrade P3 representativo | PASS; dados/evento legados preservados, novo marcador `null` |
| Política npm audit backend/frontend e testes da policy | PASS; 0 high/critical |
| Varredura de segredos backend, sintaxe YAML CI e `git diff --check` | PASS |

Uma chamada da suíte de integração colidiu com outra no mesmo `traceflow_test` por erro operacional desta execução e gerou falhas de fixtures de Sprint/Auth. A repetição única e isolada passou integralmente; nenhuma falha foi ocultada ou teste relaxado. A suíte unitária no sandbox também sofreu `listen EPERM 127.0.0.1`; fora do sandbox passou.

## 17. Documentation

Catálogo, API Contracts e matriz RF foram atualizados. RF18/RF54 constam como backend parcial, condicionado a cobertura de lifecycle e visualização/homologação externa. I19 permanece `NEEDS_GITHUB_DATA`. A divergência entre o denominador RF18 do Quadro 346 e a redação RF54 do Quadro 348 permanece como `TCC_ALIGNMENT_NOTE` para alinhamento acadêmico.

## 18. Remaining limitations

Períodos anteriores à primeira varredura P3 não recebem percentual conclusivo mesmo se há eventos importados. Issues não possuem lifecycle completo. Planos SQL foram observados em schema de teste vazio; medir volume representativo antes de índice/cache. Instalação GitHub externa e painel visual não foram homologados nesta rodada. S2-04/S2-05 continuam abertos; P4 não foi iniciado.
