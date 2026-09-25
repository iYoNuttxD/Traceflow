# S2 P4 — Flow + Task Analytics — relatório local

## 1. Baseline

Início em `daniel-dev`, HEAD `4d1b1f2d7ab031701d585272ad2b7d08d5cacc48`, working tree limpa e `git diff --check` vazio. Node 22.23.3, Prisma 6.12.0. Sem commit, push, merge, rebase, reset, clean ou stash.

## 2. Scope

Implementação backend de I20–I35 em um endpoint agregado. Não foram criados frontend, painel, gráfico, migration, schema novo, cache ou analytics de Sprint, Quality e Traceability. S2-04/S2-05 permanecem abertos; P5–P10 continuam etapas futuras.

## 3. Indicator Engine reuse

`GET /api/projects/:projectId/indicators/tasks` usa rota, validação, controller, service, repository, catálogo e `indicatorResult` já estabelecidos em P2/P3. A policy de período P2 normaliza datas civis e fuso IANA. O mapper recebeu a extensão opcional `points` para séries; listas reutilizam `kind:LIST`/`items`. O endpoint entrega 16 fichas em uma leitura consistente `RepeatableRead`.

## 4. Lead Time

I20 usa `Task.createdAt` até a primeira entrada verificável em `CONCLUIDO`, selecionada pela data dessa primeira conclusão. Calcula mediana em dias corridos, com contagens de amostra. Reabertura e segunda conclusão não substituem a primeira. Se a trilha observada já começa com estado concluído, a primeira conclusão é desconhecida e a Task não recebe duração inventada.

## 5. Cycle Time

I21 usa a primeira entrada em `EM_ANDAMENTO` anterior à primeira conclusão verificável. Reentrada não reinicia o relógio. Sem essa entrada, a Task é excluída da mediana e sinalizada na cobertura; não se somam sessões de trabalho.

## 6. Throughput

I22 conta Tasks distintas cuja última transição antes do corte do período é uma conclusão dentro do período. Reabertura posterior ao corte não muda a fotografia histórica; reabertura antes do corte remove a conclusão anterior até nova conclusão. A série diária usa `{date,value}` no fuso pedido e inclui o dia corrente para eventos já registrados.

## 7. WIP

I23 lê `Task.status=EM_ANDAMENTO` atual; `period:null`. Não usa `Task.sprintId` para reconstruir Sprint terminal.

## 8. Aging WIP

I24 lista até dez Tasks em andamento por maior idade, a partir da última entrada em `EM_ANDAMENTO` ainda vigente. `agingDuration` está em dias; `value:null` evita atribuir uma duração agregada não definida, enquanto `eligibleCount` informa a quantidade verificável. Task em andamento sem movimento compatível é excluída e altera o estado para `PARTIAL`/`UNAVAILABLE`.

## 9. Cumulative Flow

I25 usa criação e transições de Tasks sobreviventes cuja cadeia observada é internamente consistente com o estado atual. Os pontos de fim de dia civil são `{date,todo,inProgress,done}`. A série é explicitamente `PARTIAL` e restrita à coorte observada; quando não há coorte ou dia completo, é `UNAVAILABLE`/sem pontos. Hard delete remove a Task e seus movimentos, e o estado inicial do projeto inteiro não tem prova global. Por isso I25 conserva `NEEDS_HISTORY` no catálogo; nenhum estoque histórico total foi afirmado nem houve backfill artificial.

## 10. Task current-state metrics

I26 total existente; I27 distribuição pelos três estados canônicos; I28 atrasadas (`deadline < asOf`, não concluídas) com lista de dez; I29 sem `responsibleUserId`; I30 sem `estimatedEffort`. Zero explícito de estimativa difere de `null`, e texto legado `responsible` não vira usuário.

## 11. Effort metrics

I31 soma estimativas conhecidas; I32 soma apenas `Task.actualEffort` derivado do S1-06. Sessões `TaskTimeEntry` e legado já entram nesse derivado quando aplicáveis; a API não os soma outra vez. I33 soma `actualEffort-estimatedEffort` só nas Tasks comparáveis. I34 conta/lista acima da estimativa e I35 conta/lista apenas Tasks concluídas abaixo. Ausência de estimativa/realizado não vira zero; `coverage`, `PARTIAL` e `NO_DATA` explicam o universo comparável.

## 12. Filters/timezone

Período obrigatório e limitado a 366 dias civis, com limites UTC `[startInclusive,endExclusive)` no fuso IANA solicitado. I20–I22/I25 aplicam período; I23–I24/I26–I35 são fotografia atual e devolvem `period:null`. Intervalo ainda aberto em `asOf` marca I20–I22 como `PARTIAL` com `PERIOD_NOT_COMPLETE`. Filtros `sprintId` e `responsibleUserId` são rejeitados pela validação estrita porque o vínculo corrente não prova a atribuição histórica de uma conclusão; P5 tratará Sprint por `SprintTask`.

## 13. Data states

Contagem atual zero conhecida é `0 AVAILABLE`. Duração sem amostra é `NO_DATA`, ou `UNAVAILABLE` quando há histórico faltante conhecido. Amostra conhecida incompleta é `PARTIAL`. I25 nunca é `AVAILABLE` nesta implementação. `eligibleCount`, `excludedCount`, `scope` e `limitations` acompanham as séries/listas onde necessários.

## 14. Authorization/privacy

Requer sessão e membership ativa VIEWER+; sem sessão retorna 401 e projeto alheio, inexistente ou excluído retorna 404 opaco. Listas são limitadas a dez Tasks e exibem somente ID, título, status, prazo/esforço pertinente e responsável ativo mínimo. Sem e-mail, credenciais, histórico bruto ou ranking de pessoas.

## 15. Performance/query plans

Uma transação faz lookup do projeto e sete grupos de leitura: agregado SQL de estado/esforço, `groupBy` status, leitura em lote de Tasks e movimentos e três listas SQL `LIMIT 10` (o relacionamento de usuário pode gerar consulta Prisma adicional); não há N+1 nem consulta por Task. O cálculo histórico é linear em Tasks, movimentos e buckets civis, com ordenação dos movimentos pela consulta. A fixture API de três Tasks e sete movimentos levou aproximadamente **26 ms** em uma requisição local, incluindo HTTP/autorização; é apenas uma medição pequena, não benchmark de carga. `scripts/explain-s2-p4.js` só aceita `traceflow_test`. No schema de teste vazio, o agregado e listas fizeram lookup por projeto; movimentos fizeram range scan de `movedAt` com sort por Task/data. Esse plano não mede volume de produção. Nenhum índice/cache novo foi proposto sem amostra representativa; o custo de carregar a trilha completa do projeto permanece risco de volume.

## 16. Tests

Testes unitários cobrem primeira conclusão, reentrada, mediana, coortes distintas, throughput vigente, aging e cadeia parcial, além de `null` versus zero e status desconhecido. API persistida cobre 16 DTOs, contagens, esforço sem dupla soma de sessão, I35 só concluída, exclusão de legado, timezone, validação estrita, isolamento de projeto, projeto soft-deleted e autorização. `EXPLAIN` foi executado só no banco de teste.

## 17. Gates

| Gate | Resultado local |
|---|---|
| Backend unit isolado | 808 PASS |
| Backend integração/API isolada | 579 PASS; 5 skips preexistentes |
| Backend full com coverage | 1.387 PASS; 5 skips preexistentes; 91,30% statements / 93,84% lines |
| Frontend full com coverage | 1.231 PASS; 83,87% statements / 86,30% lines |
| Backend/frontend lint, format; frontend build | PASS; avisos já conhecidos de IIFE/chunk no build |
| Arquitetura, segredos, CI policy/format, npm audit backend/frontend | PASS; 0 high/critical |
| Prisma validate/generate e `git diff --check` | PASS |

A execução unitária inicial dentro do sandbox falhou em testes que abrem servidor local (`listen EPERM 127.0.0.1`); a repetição autorizada fora do sandbox passou integralmente. Isso não foi defeito do produto.

## 18. Documentation

API Contracts, catálogo I20–I35, auditoria de prontidão e matriz RF receberam a decisão P4. O catálogo preserva I25 como `NEEDS_HISTORY / PARTIAL BACKEND`. Indicadores DPI não alteram RF oficial nem promovem S2-04/S2-05.

## 19. Remaining limitations

História de Task fisicamente excluída não é recuperável; o baseline anterior à trilha não prova estoque total por dia. I20/I21/I24 podem ter amostras parciais em legado. Filtros históricos de Sprint/pessoa permanecem fora do endpoint. Plano SQL do banco vazio não prediz carga real. Ainda faltam painel, gráficos, P5–P10 e homologação visual/externa.
