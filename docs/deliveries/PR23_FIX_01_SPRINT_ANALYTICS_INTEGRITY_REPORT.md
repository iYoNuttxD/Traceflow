# PR23-FIX-01 — Sprint Analytics Integrity

Data: 2026-10-05. Escopo: estimativa desconhecida, I31/I36–I38/I43–I47,
Burndown histórico e congelamento de carry-over. Sem redesign ou outros clusters da PR23.

## 1. Baseline

- Branch: `daniel-dev`.
- HEAD: `62690ecc355e6221050b09f400384600a86e1a67`.
- Working tree inicial: limpa; `git diff --check` e `git diff --stat` vazios.
- Host: Node 26.9.0 / npm 11.19.1; todos os gates foram executados com
  **Node 22.23.3 / npm 10.9.9**, PATH do Node 22 e webstorage experimental desabilitado.
- Sem commit, push, merge, rebase, reset, clean ou stash.

Fontes revistas: catálogo de indicadores, Planning History, API Contracts, ADR-010/011,
relatórios P5/P5.1/P5.2/P10 e os owners de Sprint/projection/analytics/repository/CRUD,
service de indicadores e componente tradicional de Burndown. A regra temporal da
referência ideal nesta entrega segue explicitamente a janela nominal solicitada; a
série real continua iniciando na captura/execução, sem dias reais retroativos.

## 2. Review findings addressed

| Achado | Severidade | Correção |
| --- | --- | --- |
| Burndown com Task sem estimativa produzia escala inválida | HIGH | Curva/escala finitas, buckets nulos preservados, estado parcial e guard frontend |
| Null convertido para zero em snapshots/indicadores | MEDIUM | Subtotal conhecido + cobertura, null persistido, legado ambíguo limitado |
| Ideal/escala usavam último escopo coberto | MEDIUM | Baseline integral inicial, relógio nominal e máximo histórico |
| I43 terminal dependia de memberships vivos | MEDIUM | Saída capturada no snapshot v4 da própria Sprint, na transação de fechamento |

## 3. Canonical estimate semantics

Decisão **D-B — Estimativa ausente = desconhecida** registrada no ADR-010 existente.
`null` é não informado; zero explícito é conhecido. `8 + 4 + null` publica subtotal
`12`, uma estimativa desconhecida e `PARTIAL`. Sem nenhuma estimativa conhecida em
universo não vazio, o valor é `null`; universo vazio é tratado separadamente.

O helper `sprint.estimate.calculator.js` concentra cobertura e leitura de estimativas
planejadas/congeladas. I31 com Tasks todas sem estimativa é `PARTIAL`, não `NO_DATA`.
I36–I38 publicam `knownEstimateCount`/`unknownEstimateCount`, e I44 marca a comparação
incompleta quando há estimativa ausente, viva ou congelada.

## 4. Missing estimate

Novos `pointsAtPlanning`/`pointsAtClose` preservam null. `BASELINE_TASK.newPoints`
conserva null versus zero explícito. No fechamento, `estimatedEffort` do JSON v3+
é autoridade. Agregados não contam ausência como zero e percentuais que exigem total
completo permanecem nulos. Cards tradicionais mostram `—`/Dados parciais; subtotal
congelado incompleto não vira total completo do Marco.

## 5. Burndown regression

Na Sprint coberta com `4h + null`, scope/completed/remaining ficam desconhecidos nos
buckets afetados. `hasData` exige escala positiva e curva numericamente válida;
`totalPoints`/`idealBaseline` são nulos quando o baseline não é conhecido. Os buckets
não desaparecem do IndicatorResult por `hasData=false`: I45 e I46 continuam honestos.

O frontend tradicional valida datas, valores e escala; segmentos não atravessam gaps.
O frontend de Indicadores usa a escala do backend e não chama bucket desconhecido de
“Sem amostras no período”. Nenhuma UI produz NaN/Infinity ou diz que uma Sprint ativa
com estimativa ausente ainda não começou.

## 6. Burndown ideal baseline

Na fundação histórica P5.1/P5.2, o baseline vem apenas dos eventos iniciais capturados
com cobertura integral desde `startedAt`. A linha ideal conserva esse escopo; não usa
`lastKnown.scope`. Distribuição: início nominal até último dia de `endDate` exclusivo,
final ideal zero. Início real tardio não reinicia o relógio. Teto de 180 buckets não
transforma o 180º dia no final nominal de uma Sprint mais longa.

Baseline desconhecido ou cobertura tardia: ideal nulo e
`BURNDOWN_BASELINE_UNAVAILABLE`. Não há interpolação de um início não capturado.

## 7. Historical scale

`chartMax=max(scope histórico, remaining histórico, ideal finito, 0)`. Os dois
componentes de Burndown respeitam essa escala. A redução posterior de escopo não
corta valores históricos; o denominador gráfico nunca é zero com `hasData=true`.

## 8. Scope additions

Regressão unit/API: baseline `20h`, depois entrada de `20h`; scope atual `40h`, ideal
inicial `20h` e escala `40h`. Buckets anteriores não passam a usar baseline 40.
No projeto local, Sprint 17 tem baseline 24h e escopo final 28h; as duas UIs exibem
ideal inicial 24h e escala 28h. Teclado no chart confirmou dia seguinte com ideal 20,6h.

## 9. Scope removals

Regressão unit/API: baseline `40h`, depois saída de `20h`; escala continua contendo
40h e a linha ideal conserva o baseline 40h. Fatos foram capturados pelo domínio;
as datas controladas são fixtures apenas do schema de testes, nunca histórico legado
fabricado no banco de desenvolvimento.

## 10. Burnup compatibility

I46 mantém o mesmo owner/shared projection, os mesmos eventos, ordenação e relógio UTC.
Não foi criada uma projeção paralela. Buckets futuros/desconhecidos permanecem nulos;
limitações de cobertura continuam explícitas. A suite P5.1 e a suite histórica passaram.

## 11. I45/I46 invariant

Nos dias conhecidos, `remaining + completed = scope`. Regressões verificam conclusão,
reopen, re-complete sem contagem dupla, `4→6`, `4→null`, `null→4`, entradas e saídas.
Mudanças afetam apenas buckets a partir do fato, sem reestimar dias anteriores.

## 12. Velocity

I47 só aceita Sprints concluídas com baseline/status/corte/estimativas terminais íntegros.
Exclui toda amostra incompleta, inclusive quando a entrega conhecida é um subtotal.
Não publica estimativa desconhecida como velocity zero. Cancelada e atual continuam fora.

Policy: sem concluídas → `NO_DATA`; somente incompletas → `UNAVAILABLE`; mistura de
amostras elegíveis e excluídas → `PARTIAL`. A fixture rica passou a ter duas elegíveis
mais uma excluída; a expectativa antiga de três foi corrigida sem alterar o seed para
esconder a ausência. No banco de desenvolvimento há três elegíveis e uma excluída.

## 13. Frozen carry-over / I43

`closingTaskSnapshot.version=4` inclui `outgoingCarryOver:{toSprintId,at}|null`.
Cada participação ativa conserva a própria saída, antes da transferência e na mesma
transação de fechamento. Sem destino, Task concluída ou cancelamento sem transferência,
o fato é null. Quantidade é derivada dos fatos congelados da origem.

Leitura terminal não consulta continuations vivos. O ID capturado sobrevive à exclusão
física da Task. Regressão de integração compara o IndicatorResult completo, exceto
`asOf` de leitura, antes/depois de S→D→E→D e exclusão da Task: I43(S) permanece igual.
Rollback de fechamento/transferência continua coberto pela suite canônica.

## 14. Migration, if any

**Nenhuma migration e nenhuma alteração de schema.** O owner mínimo correto é o JSON
nullable já existente. Prisma validate/generate passaram; deploy/status no schema de
testes confirmou as 63 migrations existentes aplicadas. Nenhuma migration aplicada foi
editada, nenhum reset/backfill executado.

## 15. Legacy data handling

- Sem diário integral, zero antigo de planejamento não distingue ausência de zero explícito:
  `LEGACY_PLANNING_ESTIMATE_UNKNOWN`, cobertura parcial; positivos continuam conhecidos.
- Snapshot v3+ distingue null/zero; zero anterior ambíguo não recebe estimativa presumida.
- Sem v4, I43 terminal tem `outgoing:null`, `PARTIAL`, `UNKNOWN_LEGACY_CARRY_OVER`.
  O destino vivo não é usado para preencher o passado, mesmo que pareça reconstruível.
- Burndown sem diário conserva a aproximação legada documentada; não ganha precisão
  de mudanças de escopo/revisões que nunca foram capturadas. Burnup sem captura segue
  indisponível. Nenhum histórico antigo foi inventado por esta entrega.

## 16. Backend tests

Focados finais: **336 PASS / 15 arquivos** (Sprint unit, histórico compartilhado,
esforço/summary/service, P4/I31, P5, P5.1/Burnup, RF35, Schedule, carry-over,
frozen Kanban, Planning history e dataset de homologação).

Casos novos cobrem estimate missing, zero explícito, denominator inválido, baseline
ideal/escala, adição/remoção, changes/null/reopen/re-complete, API ativa `4+null`,
fechamento com null, velocity incompleta e carry-over congelado após movimentações.

## 17. Frontend tests

Focados finais: **54 PASS / 6 arquivos**. Burndown defensivo mesmo com resposta antiga
`hasData=true,totalPoints=0`; SVG sem NaN/Infinity; gaps; escala histórica; I45/I46
parciais sem falsa ausência; summary sem null/zero presumido; cards/progresso live e
frozen parciais; totais de Marco não fingem completude.

Regressão completa: **1.386 PASS / 114 arquivos**, incluindo coverage.
A inspeção revelou `null pts` e “Sem pontos” derivados da nova ausência explícita;
foram corrigidos e os gates completos do frontend repetidos após essas correções.

## 18. Runtime validation

Somente leitura no banco de desenvolvimento. Segurança confirmada: NODE_ENV development,
MySQL em localhost, schema `traceflow`, read_only=0; `TEST_DATABASE_URL` distinto,
schema `traceflow_test`, validado pelo helper canônico. Nenhuma credencial foi registrada.
Project 2: TraceFlow, descrição “Projeto artificial para homologação manual de L1, L2 e L1.1.”

QA isolado: frontend 5174, backend Node 22 na porta 3002, API real autenticada. Servidores
existentes 5173/3001 preservados. Nenhuma Task/Sprint do desenvolvimento foi criada,
movida, estimada ou encerrada para obter evidência. Escritas de teste ocorreram somente
no schema isolado e foram limpas pelo helper canônico.

Chrome desktop 1440×1000, Light/Dark: Sprint 15 ativa com uma estimativa ausente;
Sprint 17 concluída, estimates íntegros e mudança de escopo; Indicadores/Sprint com
Burndown/Burnup de oito buckets, Velocity e I43 legado explicitamente parcial.
Listagem/summary/evolução e API agregada apresentaram semântica compatível.
Console final zero warnings/errors; inspeção DOM sem NaN/Infinity ou overflow horizontal.
Uma captura escura feita durante loading foi descartada e refeita com conteúdo final.
Tema Escuro e viewport original restaurados ao encerrar QA.

Evidências locais em `/private/tmp/traceflow-pr23-fix01-20261005/`:
`sprint-partial-{light,dark}.jpg`, `sprint-closed-{light,dark}.jpg`,
`indicators-partial-{light,dark}.jpg`, `indicators-closed-{light,dark}.jpg`,
`runtime-data.json`, `runtime-baseline-data.json`, `console-final.json` e logs dos gates.

## 19. Performance impact

Instrumentação Prisma middleware, **operações Prisma, não SQL query count**.
Comparação read-only entre cópia temporária de HEAD e working tree, no mesmo dataset:

| Sprint | Antes | Depois | Payload depois |
| --- | ---: | ---: | ---: |
| 15 ativa | 9 | 10 | 9.452 bytes |
| 13 terminal sem diário | 8 | 8 | 8.443 bytes |
| 14 terminal coberta | 9 | 9 | 9.119 bytes |
| 16 terminal coberta | 9 | 9 | 8.925 bytes |
| 17 terminal coberta | 9 | 9 | 9.087 bytes |

Uma leitura em lote de BASELINE_TASK para o histórico de Velocity é adicionada; terminal
elimina a leitura de continuations vivos, compensando essa operação. Listagem/Schedule
carregam eventos dos terminais em lote; Velocity agrupa participações/eventos por Sprint.
Nenhuma consulta nova por Task, dia ou evento. Leituras locais depois: 4,58–22,61ms;
antes: 2,76–13,73ms. São amostras únicas com aquecimento/ordem distintos, insuficientes
para inferir mudança de latência; não são benchmark de produção. API HTTP do QA e
interações/gráficos responderam sem travamento perceptível nesta amostra.

## 20. Documentation

Atualizados: ADR-010 D-B, Planning History, API Contracts, entradas afetadas do catálogo,
UI Surface Inventory e Visual Validation Log. Este relatório reúne resultado e limites.
Sem mudança do Health Model, RF55/source UI, CSS, filtros, preferências ou próximos clusters.

## 21. Full gates

| Gate Node 22 | Resultado |
| --- | --- |
| Backend unit | 909 PASS / 85 arquivos |
| Backend integration/API | 665 PASS / 52 arquivos; 5 skips legados em 2 arquivos |
| Backend coverage | 1.574 PASS; statements 92,42%, branches 86,16%, functions 95,73%, lines 94,80% |
| Backend lint / format | PASS |
| Frontend focused | 54 PASS / 6 arquivos |
| Frontend full / coverage | 1.386 PASS / 114 arquivos |
| Frontend coverage | statements 85,83%, branches 80,37%, functions 81,65%, lines 88,30% |
| Frontend lint / format / build | PASS |
| Prisma validate / generate | PASS |
| Existing test migrations deploy/status | PASS; 63 aplicadas, sem nova migration |
| Architecture check | PASS |
| Local CI policy tests | 83 PASS |
| Local CI validator / CI script format | PASS |
| Canonical security gate backend/frontend | PASS; zero exceções utilizadas |
| npm audit completo backend/frontend | 0 vulnerabilidades, incluindo dev; 0 HIGH/CRITICAL |
| Security secrets scan | PASS |
| git diff --check | PASS |

Os cinco skips pré-existentes são suites E6/E11 exclusivas de banco pré-LR.2, sem novos
skips nesta entrega. Primeira regressão detectou expectativas antigas de velocity,
ideal tardio, carry-over.at e soma de estimativas; foram reconciliadas com a decisão
canônica e a execução final passou. Audit inicialmente sem DNS no sandbox foi
reexecutado com acesso autorizado ao registry; erro de rede não foi contado como PASS.

## 22. Remaining limitations

Legado ambíguo continua parcial/indisponível; não há backfill de estimativas/destinos.
A captura v4 só se aplica a novos fechamentos. O teste de sua imutabilidade é API/integration
no schema isolado; dados terminais anteriores do desenvolvimento foram preservados.

MySQL local reporta versão 26.7.0, diferente de MySQL 8.4.8 da CI. Evidência é local,
não substitui CI remota. Sem certificação WCAG, teste cross-browser ou touch físico;
o escopo visual desta entrega foi desktop Light/Dark nas superfícies de Sprint afetadas.
Nenhum achado de outros clusters da PR23 foi promovido a corrigido por este relatório.

## 23. Final verdict

**PR23-FIX-01 SPRINT ANALYTICS INTEGRITY — PASS LOCAL**

Os quatro achados do cluster foram corrigidos, com semântica documentada, regressão
completa e inspeção real pós-correção. Histórico não capturado continua desconhecido.
Sem commit/push. Sugestão baseada no diff:
`fix: preserve sprint analytics integrity with unknown estimates`.
Encerramento desta entrega; não iniciar PR23-FIX-02 automaticamente.
