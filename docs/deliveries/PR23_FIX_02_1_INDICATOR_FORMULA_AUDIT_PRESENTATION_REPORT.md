# PR23-FIX-02.1 — Indicator Formula Audit & Presentation

## 1. Baseline

2026-10-05, checkout `/Users/daniel/Coding/Traceflow`, branch `daniel-dev`, HEAD
`ebf60a9a4a2841e55ca911a84878555e12c73d9c`. Working tree inicialmente limpa;
`git diff --check` e `git diff --stat` sem saída. Runtime padrão Node 26.9.0/npm
11.19.1; gates executados com **Node 22.23.3/npm 10.9.9**.
Nenhum commit, push, merge, rebase, reset, clean ou stash.

## 2. Motivation

FIX-02 restaurou acesso a fórmula, fonte e horário. Seus textos ainda continham
notação de implementação e condições omitidas. Esta rodada auditou os cálculos
antes de mudar sua redação; não avaliou fidelidade pelo catálogo isoladamente.

## 3. Catalog size/current indicator count

| Universo recontado | Quantidade |
| --- | ---: |
| IDs oficiais na registry de Health | 74 |
| Definições implementadas/publicadas | 68 |
| IDs distintos nas oito views padrão | 66 |
| IDs personalizáveis | 66 |
| Definições com `formula` e `sources` não vazios | 68 |
| Resultados com `asOf` no mapper | 68 |
| Implementados sem widget isolado aprovado | 2: I03/I05 |
| Capacidades, não medidas | 2: I07/I08 |
| Não implementados | 3: I19/I69/I70 |
| Não recomendado | 1: I68 |

Por `category` vigente: GENERAL 1, GITHUB 15, FLOW 6, SPRINT 14, TASK 12,
QUALITY 13, TRACEABILITY 7. I03/I05 também foram auditados por serem públicos na
API/catalog. Os seis IDs sem cálculo executável são NOT_APPLICABLE nesta revisão;
nenhum texto ou widget foi inventado para eles.

## 4. Audit methodology

Para cada ID: texto anterior efetivamente apresentado → leitura persistida →
service → calculator/policy → RF/decisão vigente → nova descrição. A matriz
registra antes/depois, fatos e classificação; o [JSON completo](../design/validation/evidence/pr23-fix-02-1/audit-matrix.json)
contém cada caminho de implementação e autoridade. Nenhuma linha foi aceita apenas
porque já estava documentada. Os aliases da matriz identificam estes owners:

| Owner | Código conferido |
| --- | --- |
| BASE | `indicators.repository.js`, `indicators.service.js`, `calculators/project-progress.calculator.js`, `calculators/responsibility-activity.calculator.js` |
| GITHUB | `github-analytics.repository.js`, `github-analytics.service.js`, `calculators/github-analytics.calculator.js`, `calculators/statistics.calculator.js` |
| FLOW | `flow-task.repository.js`, `flow-task.service.js`, `calculators/flow-task.calculator.js` |
| TASK | `flow-task.repository.js`, `flow-task.service.js`, `calculators/task-current.calculator.js`; I23 utiliza estado instantâneo |
| SPRINT | `sprint-analytics.service.js`/repository e módulos Sprint: analytics, summary, progress, effort, estimate, Burndown/Burnup e shared historical projection; `sprints/repositories/sprint.repository.js` |
| QUALITY | `quality-analytics.repository.js`, `quality-analytics.service.js`, `calculators/quality-analytics.calculator.js` |
| LINKS | `traceability-analytics.service.js`, requirement projection/summary repository, `requirement-traceability.policy.js`, `traceability.calculator.js` |

Caminhos sem prefixo na tabela pertencem a `backend/src/modules/indicators`;
Sprint e Traceability são módulos irmãos. Dashboard aggregate, catálogo de views,
personalização, mapper, políticas de período/frescor e Health registry também foram
conferidos. Fontes canônicas: catálogo S2, Health Model v1, API Contracts, matriz RF,
Design System, FIX-02, PLANNING_HISTORY e D-B do ADR-010/PR23-FIX-01.

## 5. Formula presentation standard

Uma única autoridade: catálogo backend → `IndicatorResult.formula` → API → ajuda.
`formula` é descrição da regra, não expressão executável. Seus consumidores não a
avaliam. Não foi necessário novo campo nem incremento de `definitionVersion`:
algoritmos, N/D, unidades, clocks e critérios permanecem os mesmos.

Label global **Como é calculado**. Percentuais usam `(Numerador ÷ Denominador) × 100`;
contagens, somas, medianas/médias usam frases. As regras identificam eventos,
recorte, amostra, exclusões e unidades quando relevantes. A capitalização respeita
nomes de produto e a gramática da frase, sem misturar Tasks/task com Tarefas no cálculo.
Frontend não traduz nem escolhe fórmulas por ID. A antiga propriedade `how`, sem
consumidor, foi removida; copy comercial de significado/interpretação continua
separada da regra auditável, sem representar um segundo registry de fórmulas.

## 6. Indicator-by-indicator audit summary

Classificação prioritária do problema anterior, por ID; várias linhas tinham mais
de um problema de escrita. MATCH exigiria fidelidade **e** padrão de apresentação.

| Resultado | Quantidade |
| --- | ---: |
| Total auditado implementado | 68 |
| MATCH anterior | 0 |
| TEXT_INACCURATE corrigidos | 2 |
| TEXT_TOO_TECHNICAL corrigidos | 57 |
| TEXT_AMBIGUOUS corrigidos | 9 |
| SEMANTIC_MISMATCH novo contra decisão vigente | 0 |
| MATCH após correção | 68 |
| NOT_APPLICABLE oficiais, fora dos 68 | 6 |

A divergência acadêmica RF54 preexistente é detalhada na seção 8 e não é ocultada
pela contagem de conflitos novos com a decisão executável vigente.

| ID / nome | Implementação conferida | Texto exibido antes | Regra auditada apresentada | Classe anterior → final |
| --- | --- | --- | --- | --- |
| **I01 Progresso atual do projeto** | groupBy status CONCLUIDO; soma todas as Tasks existentes; hard delete excluído; zero universo → NO_DATA; owner **BASE** | (tarefas concluídas / total de tarefas) × 100 | (Tarefas concluídas ÷ Total de tarefas) × 100 | TEXT_AMBIGUOUS → MATCH |
| **I02 Commits na main por responsável** | CommitBranch última geração confirmada; main literal; identidade ID exata; membership atual ativa; COUNT DISTINCT; owner **BASE** | commits distintos na main no período, agrupados por identidade GitHub estável | Quantidade de Commits distintos da branch main no período, agrupados pelo responsável associado à identidade GitHub. Autores sem associação permanecem separados. | TEXT_AMBIGUOUS → MATCH |
| **I03 Tasks concluídas por responsável** | NOT EXISTS later movedAt<end, desempate ID; JOIN Task sobrevivente; snapshot responsável; owner **BASE** | tarefas distintas cuja última movimentação no corte é uma conclusão no período | Quantidade de tarefas distintas cuja última movimentação até o fim do período é uma conclusão ocorrida no período, agrupadas pelo responsável registrado nessa conclusão. | TEXT_TOO_TECHNICAL → MATCH |
| **I04 Taxa de retrabalho de PR** | coorte MIN CLOSED por PR; EXISTS REOPENED>firstClosed e <end; denominador coorte distinta; owner **GITHUB** | (PRs distintas da grupo fechadas com reabertas posterior / PRs distintas fechadas na grupo) × 100 | (Pull Requests distintas reabertas após seu primeiro fechamento no período ÷ Pull Requests distintas fechadas no período) × 100. Somente reaberturas anteriores ao fim do período são consideradas. | TEXT_TOO_TECHNICAL → MATCH |
| **I05 Atividade por responsável** | combineActivity vetor; fontes I02/I03; sem score; não selecionável; owner **BASE** | vetor (tarefas concluídas, commits na main); unidades não são somadas | Quantidade de tarefas concluídas e de Commits na main por responsável no período. Os dois totais são apresentados separadamente, sem soma ou nota. | TEXT_AMBIGUOUS → MATCH |
| **I06 Qualidade oficial de PR** | calculateClosedCohort same closedCount; rework mesma I04; merge evento MERGED ou timestamp<end; não GitHub review APPROVED; owner **GITHUB** | taxa de retrabalho de Pull Requests e (PRs distintas mescladas da grupo fechadas / PRs distintas fechadas na grupo) × 100 | Duas taxas para as Pull Requests distintas fechadas no período: (Pull Requests reabertas após o primeiro fechamento ÷ Total de Pull Requests fechadas) × 100 e (Pull Requests mescladas até o fim do período ÷ Total de Pull Requests fechadas) × 100. As taxas não são somadas. | TEXT_TOO_TECHNICAL → MATCH |
| **I09 Commits no período** | count Commit projectId/date intervalo; id único no modelo; owner **GITHUB** | Contagem distinta de commits no período | Quantidade de Commits distintos registrados no período, considerando todas as branches do projeto. | TEXT_TOO_TECHNICAL → MATCH |
| **I10 PRs abertas agora** | count PR state open; CURRENT_STATE; period null; owner **GITHUB** | Contagem de Pull Requests com estado=aberto | Quantidade de Pull Requests abertas na última sincronização do GitHub. | TEXT_TOO_TECHNICAL → MATCH |
| **I11 PRs fechadas no período** | coorte GROUP BY pullRequestId CLOSED período; owner **GITHUB** | Contagem distinta de Pull Requests com fechadas no período | Quantidade de Pull Requests distintas com fechamento registrado no período, mesmo que tenham sido reabertas depois. | TEXT_TOO_TECHNICAL → MATCH |
| **I12 PRs mescladas no período** | findMany mergedAtGithub período; sem filtro estado live; countlength; owner **GITHUB** | Contagem distinta de Pull Requests com merge no GitHub no período | Quantidade de Pull Requests cuja data de merge está no período. | TEXT_TOO_TECHNICAL → MATCH |
| **I13 Issues GitHub abertas agora** | count Issue state open; atual; owner **GITHUB** | Contagem de Issues com estado=aberto | Quantidade de Issues abertas na última sincronização do GitHub. | TEXT_TOO_TECHNICAL → MATCH |
| **I14 Issues atualmente fechadas no período** | Issue state closed e current closedAtGithub período; partial histórico; owner **GITHUB** | Contagem de Issues com estado=fechado com fechamento no GitHub no período | Quantidade de Issues atualmente fechadas cuja data de fechamento está no período. Fechamentos anteriores a reaberturas não são reconstruídos. | TEXT_TOO_TECHNICAL → MATCH |
| **I15 Mediana até merge** | durationSample createdAtGithub→mergedAtGithub/HOUR; median; exclusion; owner **GITHUB** | Mediana(merge no GitHub − abertura no GitHub) | Mediana do tempo entre a abertura e o merge das Pull Requests mescladas no período, em horas. Somente datas válidas e durações não negativas entram na amostra. | TEXT_TOO_TECHNICAL → MATCH |
| **I16 Média até merge** | mesma amostra I15; mean, não mediana; owner **GITHUB** | Média(merge no GitHub − abertura no GitHub) | Média do tempo entre a abertura e o merge das Pull Requests mescladas no período, em horas. Somente datas válidas e durações não negativas entram na amostra. | TEXT_TOO_TECHNICAL → MATCH |
| **I17 PRs abertas mais antigas** | value eligibleCount global; items oldestPrs take10; age asOf−createdAt; owner **GITHUB** | idade = instante do cálculo − abertura no GitHub; top 10 mais antigas | Idade de cada Pull Request aberta: tempo entre a abertura e a consulta, em dias. O total conta todas as abertas com data válida; a lista mostra até dez das mais antigas. | TEXT_INACCURATE → MATCH |
| **I18 Mediana até fechamento de Issue** | closedIssues mesma coorte I14; median/DAY; sem ciclos anteriores; owner **GITHUB** | Mediana(fechamento no GitHub − abertura no GitHub) | Mediana do tempo entre a abertura e o fechamento atual das Issues fechadas no período, em dias. Somente datas válidas e durações não negativas entram na amostra. | TEXT_TOO_TECHNICAL → MATCH |
| **I20 Lead time** | firstDone nãofromStatus done; initialCompletionUnknown exclui; createdAt→firstDone; median atual e daily; owner **FLOW** | Mediana(primeira conclusão − criação da tarefa) | Mediana do tempo entre a criação e a primeira conclusão verificável das tarefas concluídas pela primeira vez no período, em dias corridos. A série mostra a mediana dessas durações em cada dia. | TEXT_TOO_TECHNICAL → MATCH |
| **I21 Cycle time** | firstStart >=createdAt <=firstDone; elapsed; sem soma de sessões; daily; owner **FLOW** | Mediana(primeira conclusão − primeira entrada em andamento) | Mediana do tempo entre a primeira entrada em “Em andamento” e a primeira conclusão verificável das tarefas concluídas pela primeira vez no período, em dias corridos. Reentradas não reiniciam o relógio; a série mostra a mediana diária. | TEXT_TOO_TECHNICAL → MATCH |
| **I22 Throughput** | latestAtCut done !=fromDone movedAt>=start; dateKey; D03 sem count eventos; owner **FLOW** | Contagem distinta de tarefa da última conclusão vigente no corte | Quantidade de tarefas distintas cuja última movimentação até o fim do período é uma conclusão ocorrida no período. Cada tarefa é contada uma vez e agrupada pelo dia dessa conclusão. | TEXT_TOO_TECHNICAL → MATCH |
| **I23 WIP atual** | SQL status EM_ANDAMENTO no corte; fotografia Task atual; owner **TASK** | Contagem de tarefas com status=em andamento | Quantidade de tarefas atualmente em andamento. | TEXT_TOO_TECHNICAL → MATCH |
| **I24 Aging WIP** | at(-1) toStatus EM_ANDAMENTO; status live; asOf−movedAt; aging sorted descending slice10; value null; owner **FLOW** | instante do cálculo − última entrada em andamento ainda vigente | Tempo desde a última entrada registrada em “Em andamento” até a consulta, em dias, para tarefas que continuam nesse estado. A lista mostra até dez das mais antigas com histórico verificável. | TEXT_TOO_TECHNICAL → MATCH |
| **I25 Cumulative flow** | flowDeltas estado inicial first.fromStatus e cadeiacoerente latest=live; daySequence excluihoje; PARTIAL sempre; owner **FLOW** | estoque observado por status ao fim de cada dia civil | Quantidade de tarefas por status ao fim de cada dia completo no fuso escolhido. Considera somente tarefas ainda existentes com sequência de movimentações verificável. | TEXT_AMBIGUOUS → MATCH |
| **I26 Total de Tasks** | SQL COUNT Task project; removedhardexcluded; owner **TASK** | Contagem de tarefas | Quantidade de tarefas existentes no projeto. | TEXT_TOO_TECHNICAL → MATCH |
| **I27 Distribuição por status** | groupBystatus; unknown excluded partial; owner **TASK** | Contagem de tarefas agrupados por status | Quantidade de tarefas existentes em cada status: “A fazer”, “Em andamento” e “Concluído”. | TEXT_TOO_TECHNICAL → MATCH |
| **I28 Tasks atrasadas** | SQL deadline<asOf status!=CONCLUIDO; totalglobal top10 ascending; regra de prazo nãoalterada; owner **TASK** | Contagem de prazo < instante do cálculo e status != concluído | Quantidade de tarefas não concluídas cujo prazo é anterior ao instante da consulta. A lista mostra até dez tarefas, começando pelos prazos mais antigos. | TEXT_TOO_TECHNICAL → MATCH |
| **I29 Tasks sem responsável** | SQL responsibleUserId IS NULL; não infere por displayname; owner **TASK** | Contagem de responsável não informado | Quantidade de tarefas sem responsável registrado. | TEXT_TOO_TECHNICAL → MATCH |
| **I30 Tasks sem estimativa** | SQL estimatedEffort IS NULL; zero nãoausente; owner **TASK** | Contagem de estimativa de esforço não informado | Quantidade de tarefas sem estimativa de esforço informada. Uma estimativa registrada como zero não é considerada ausente. | TEXT_TOO_TECHNICAL → MATCH |
| **I31 Estimativa total conhecida** | SQL SUM e COUNT known; PARTIAL unknown; nenhum conhecido null; owner **TASK** | Soma estimativa de esforço não nulo | Soma das estimativas de esforço conhecidas das tarefas, em horas. Tarefas sem estimativa não entram no subtotal e tornam o resultado parcial. | TEXT_TOO_TECHNICAL → MATCH |
| **I32 Esforço realizado conhecido** | SUM Task.actualEffort; coverage; S1-06 derivado semrecálculo; owner **TASK** | Soma esforço realizado não nulo | Soma do esforço realizado conhecido das tarefas, em horas. Usa o total já consolidado de sessões e registros anteriores, sem somá-los novamente. | TEXT_TOO_TECHNICAL → MATCH |
| **I33 Desvio de esforço comparável** | SQLCASEcomparável SUM difference; não totalactual menosestimate de universosdiferentes; owner **TASK** | Soma(esforço realizado − estimativa de esforço) nas tarefas comparáveis | Soma de (Esforço realizado − Esforço estimado), em horas, somente nas tarefas com os dois valores conhecidos. | TEXT_TOO_TECHNICAL → MATCH |
| **I34 Tasks acima da estimativa** | SQL bothnotnull actual>estimate; countglobal listdesc difference; owner **TASK** | Contagem de esforço realizado > estimativa de esforço nas tarefas comparáveis | Quantidade de tarefas com esforço realizado maior que a estimativa, considerando somente valores conhecidos. A lista mostra até dez dos maiores excessos. | TEXT_TOO_TECHNICAL → MATCH |
| **I35 Tasks concluídas abaixo da estimativa** | SQLCONCLUIDO bothknown actual<estimate; listdesc estimate−actual; owner **TASK** | Contagem de concluído e esforço realizado < estimativa de esforço | Quantidade de tarefas concluídas com esforço realizado menor que a estimativa, considerando somente valores conhecidos. A lista mostra até dez das maiores diferenças. | TEXT_TOO_TECHNICAL → MATCH |
| **I36 Pontos planejados** | planningSprintEstimates baseline events newPoints se complete; legacy positive snapshot; subtotalunknown; owner **SPRINT** | Soma(estimativa no planejamento quando planejada no início) | Soma das estimativas conhecidas das tarefas planejadas no início da Sprint, em horas. Usa o planejamento preservado; estimativas ausentes deixam a cobertura parcial. | TEXT_TOO_TECHNICAL → MATCH |
| **I37 Pontos atuais** | activePoints removedAtnull; frozen summarytotalPoints; known subtotal; owner **SPRINT** | Soma(estimativas das participações ativas) | Soma das estimativas conhecidas das tarefas que compõem o escopo da Sprint, em horas. Usa o escopo atual enquanto aberta e o escopo preservado no encerramento quando encerrada. | TEXT_TOO_TECHNICAL → MATCH |
| **I38 Pontos entregues** | activePoints currentStatusdone ou frozen completedPoints; semtarefas removidas; owner **SPRINT** | Soma(estimativas das participações concluídas) | Soma das estimativas conhecidas das tarefas concluídas que pertencem ao escopo da Sprint, em horas. Em Sprints encerradas, usa os valores preservados no fechamento. | TEXT_TOO_TECHNICAL → MATCH |
| **I39 Tasks planejadas** | plannedAtStart true; planned length complanningKnown; owner **SPRINT** | Contagem de(planejada no início=sim) | Quantidade de tarefas que pertenciam ao planejamento inicial preservado da Sprint. | TEXT_TOO_TECHNICAL → MATCH |
| **I40 Tasks entregues** | progress.current numerator; terminal closingexitStatus; owner **SPRINT** | Contagem de(status no corte=concluído) | Quantidade de tarefas concluídas no escopo da Sprint. Em Sprints encerradas, considera o status preservado no fechamento. | TEXT_TOO_TECHNICAL → MATCH |
| **I41 Escopo adicionado** | !isPlanned removedAtnull; SCOPE_REENTRY_EVENTS_COLLAPSED; owner **SPRINT** | Contagem de(entradas de escopo) | Quantidade de tarefas fora do planejamento inicial que foram adicionadas e ainda pertencem ao escopo da Sprint. Reentradas não são contadas como eventos separados. | TEXT_TOO_TECHNICAL → MATCH |
| **I42 Escopo removido** | isPlanned removedAtnotnull; limitaçãocolapso; owner **SPRINT** | Contagem de(saídas de escopo) | Quantidade de tarefas do planejamento inicial que foram removidas do escopo da Sprint. Reentradas não são contadas como eventos separados. | TEXT_TOO_TECHNICAL → MATCH |
| **I43 Carry-over** | incoming removedAtnull carriedFrom!=null; outgoing frozen v4 oulive; quantities separadas; owner **SPRINT** | Contagem de(entradas), Contagem de(saídas) | Quantidade de tarefas recebidas de outras Sprints que permanecem no escopo e quantidade de tarefas transferidas para outras Sprints. Em Sprints encerradas, as saídas usam o registro congelado no fechamento. | TEXT_TOO_TECHNICAL → MATCH |
| **I44 Estimado × realizado** | buildSprintEffort known estimates/actual independent totals; differenceHours null incomplete; frozenrows; owner **SPRINT** | esforço estimado e realizado da Sprint | Soma do esforço estimado e soma do esforço realizado das tarefas da Sprint, em horas. O desvio é (Realizado − Estimado) quando a cobertura é completa. Sprints encerradas usam os registros preservados no fechamento. | TEXT_AMBIGUOUS → MATCH |
| **I45 Burndown** | sharedhistoricalprojection scope−done; baseline.scope ideal nominal days; legacy fallback limitações preservadas; owner **SPRINT** | trabalho restante(dia) a partir do histórico da Sprint | Trabalho restante em cada dia = Escopo estimado − Trabalho concluído, em horas. Com histórico capturado, respeita mudanças e usa o escopo inicial conhecido na linha ideal até o fim nominal. Sem esse histórico, usa uma aproximação legada do escopo disponível, sem reconstruir mudanças passadas. | TEXT_TOO_TECHNICAL → MATCH |
| **I46 Burnup** | sharedprojection contribution statusdone; unknown>0 null; alcance dias UTC; cutofffrozen; owner **SPRINT** | escopo(dia), trabalho concluído(dia) | Soma das estimativas do escopo e soma das estimativas das tarefas concluídas ao fim de cada dia UTC, em horas. Usa os fatos históricos da Sprint; dias com estimativa desconhecida ficam sem valor. | TEXT_TOO_TECHNICAL → MATCH |
| **I47 Velocity** | buildSprintVelocity excludes summarylimitations/completednull, onlyCONCLUIDA; últimaslimitpontos sem média; owner **SPRINT** | esforço concluído por Sprint concluída | Soma das estimativas das tarefas concluídas no fechamento de cada Sprint concluída, em horas. Somente Sprints com histórico íntegro entram; Sprints abertas ou canceladas são excluídas. | TEXT_TOO_TECHNICAL → MATCH |
| **I48 Execuções por resultado** | TestExecution.executedAt groupByresult; todas versões; não TestCase atual; owner **QUALITY** | Contagem de(execuções de teste) por aprovadas, falhas, bloqueadas | Quantidade de execuções de casos de teste realizadas no período, separadas em aprovadas, com falha e bloqueadas. | TEXT_TOO_TECHNICAL → MATCH |
| **I49 Pass rate** | ratesPASS/total; BLOCKEDentraD; owner **QUALITY** | aprovadas / (aprovadas + falhas + bloqueadas) × 100 | (Execuções aprovadas ÷ Total de execuções aprovadas, com falha ou bloqueadas no período) × 100 | TEXT_TOO_TECHNICAL → MATCH |
| **I50 Fail rate** | ratesFAIL/total; BLOCKEDentraD; owner **QUALITY** | falhas / (aprovadas + falhas + bloqueadas) × 100 | (Execuções com falha ÷ Total de execuções aprovadas, com falha ou bloqueadas no período) × 100 | TEXT_TOO_TECHNICAL → MATCH |
| **I51 Blocked rate** | ratesBLOCKED/total; owner **QUALITY** | bloqueadas / (aprovadas + falhas + bloqueadas) × 100 | (Execuções bloqueadas ÷ Total de execuções aprovadas, com falha ou bloqueadas no período) × 100 | TEXT_TOO_TECHNICAL → MATCH |
| **I52 Saúde atual dos TestCases** | leftlast execution WHEREversion current ORDERBYtimeID; totalativonaofakePASS; owner **QUALITY** | última execução da versão atual por caso de teste ativo | Quantidade de casos de teste ativos e não excluídos por resultado da última execução de sua versão atual. Casos sem execução dessa versão são classificados como nunca executados. | TEXT_TOO_TECHNICAL → MATCH |
| **I53 Defeitos por estado** | distribution live deletedAtnull; active=sum3nãoVALIDADO; owner **QUALITY** | Contagem de(defeito não excluído) por status | Quantidade de defeitos não excluídos por estado atual. O total de ativos reúne “Aberto”, “Em correção” e “Aguardando reteste”. | TEXT_TOO_TECHNICAL → MATCH |
| **I54 Defeitos por severidade** | groupByseverity deletedAtnull; owner **QUALITY** | Contagem de(defeito não excluído) por severidade | Quantidade de defeitos não excluídos por severidade: baixa, média, alta e crítica. | TEXT_TOO_TECHNICAL → MATCH |
| **I55 Defeitos criados** | createdAtperiod visible; hiddenexcluded PARTIAL; owner **QUALITY** | Contagem de(defeito não excluído criado no período) | Quantidade de defeitos não excluídos criados no período. | TEXT_TOO_TECHNICAL → MATCH |
| **I56 Defeitos validados** | COUNTDISTINCTdefectId actionVALIDATEDperiod; nãosnapshotstatus; owner **QUALITY** | Contagem de(distintos defeitos) com validação no período | Quantidade de defeitos distintos e não excluídos com uma validação registrada no período. Cada defeito é contado uma vez, mesmo com múltiplas validações. | TEXT_TOO_TECHNICAL → MATCH |
| **I57 Tempo de correção** | MINhistory VALIDATED; HAVINGfirsttimeperiod; durationSample; legacyunavailable excl; owner **QUALITY** | Mediana(primeiro instante da validação − criação do defeito) | Mediana do tempo entre a criação do defeito e sua primeira validação registrada, em dias corridos. Considera primeiras validações ocorridas no período, com datas válidas, de defeitos não excluídos. | TEXT_TOO_TECHNICAL → MATCH |
| **I58 Sucesso de reteste** | DefectRetest JOINTestExecution byexecutedAt; attemptsnotdistinctdefects; visible; owner **QUALITY** | retestes aprovadas / (aprovadas + falhas + bloqueadas) × 100 | (Tentativas de reteste aprovadas ÷ Total de tentativas aprovadas, com falha ou bloqueadas no período) × 100. Inclui todos os ciclos de correção de defeitos não excluídos. | TEXT_TOO_TECHNICAL → MATCH |
| **I59 Concentração por Requirement** | loadprojections uniondiretororigin, dedupeperreq; includesvalidated; sorttotaldesc slice10; owner **QUALITY** | defeitos distintos diretos ou via tarefa de origem por requisito | Quantidade de defeitos distintos e não excluídos ligados a cada requisito, diretamente ou por tarefas de origem. A lista mostra até dez requisitos com mais defeitos; o mesmo defeito pode aparecer em requisitos diferentes. | TEXT_TOO_TECHNICAL → MATCH |
| **I60 Concentração por Task de origem** | DefectTask ORIGIN COUNTDISTINCT GROUPBYtask top10; owner **QUALITY** | defeitos distintos por tarefa de origem | Quantidade de defeitos distintos e não excluídos por tarefa de origem. A lista mostra até dez tarefas com mais defeitos; vínculos de correção não entram. | TEXT_TOO_TECHNICAL → MATCH |
| **I61 Requirements com Tasks** | one row per Requirement existing; tasksTotal>0; harddeleteexcluded; owner **LINKS** | requisitos com tarefa / total requisitos × 100 | (Requisitos com ao menos uma tarefa vinculada ÷ Total de requisitos) × 100 | TEXT_AMBIGUOUS → MATCH |
| **I62 Requirements com evidência técnica** | technicalEvidence MAX pullRequestIdnotnull or TaskCommitexists; notissue; no main restriction; owner **LINKS** | requisitos com PR/commit via tarefa / total requisitos × 100 | (Requisitos com ao menos um Commit ou Pull Request vinculado por uma tarefa ÷ Total de requisitos) × 100 | TEXT_TOO_TECHNICAL → MATCH |
| **I63 Requirements com TestCase** | case_links UNION direct/viaTask; unique and currentVersionrelevance; owner **LINKS** | requisitos com caso de teste ativo relevante / total requisitos × 100 | (Requisitos com ao menos um caso de teste ativo e não excluído vinculado diretamente ou por uma tarefa ÷ Total de requisitos) × 100 | TEXT_AMBIGUOUS → MATCH |
| **I64 Requirements com Defect ativo** | defects3sum>0; UNION direct/origin; noCORRECTION; owner **LINKS** | requisitos com defeito ativo relevante / total requisitos × 100 | (Requisitos com ao menos um defeito ativo ligado diretamente ou por uma tarefa de origem ÷ Total de requisitos) × 100. Defeitos excluídos ou validados não são ativos. | TEXT_TOO_TECHNICAL → MATCH |
| **I65 Requirements validados** | deriveSituation CONCLUIDO needslegacyimplemented, teststotal>0,never0,allpass,noactive/untreatedFAIL; owner **LINKS** | requisitos com situação concluído / total requisitos × 100 | (Requisitos implementados com ao menos um caso de teste ativo relevante, todos os casos ativos relevantes aprovados na versão atual e nenhum defeito ativo ÷ Total de requisitos) × 100 | TEXT_TOO_TECHNICAL → MATCH |
| **I66 Cobertura de implementação** | getImplementationStageFromCounts tasksTotal>0 allDone technicalEvidence; independentquality D11; owner **LINKS** | requisitos com implementação marcada / total requisitos × 100 | (Requisitos com todas as tarefas concluídas e ao menos um Commit ou Pull Request vinculado a uma delas ÷ Total de requisitos) × 100. Falhas em testes e defeitos não apagam essa implementação técnica. | TEXT_AMBIGUOUS → MATCH |
| **I67 Progresso médio por Requirement** | buildMatrixSummary sumroundpercent/totalreq; zero semtasksD15 historicalspecific, notglobalI01; owner **LINKS** | média do percentual de progresso de cada requisito | Média dos percentuais de tarefas concluídas de cada requisito, com o mesmo peso para todos os requisitos. Requisitos sem tarefas contribuem com zero. | TEXT_AMBIGUOUS → MATCH |
| **I71 Sprint com mudança de escopo** | facts.added/removed sameI41/I42; changed=sum>0; counts não eventflux full; owner **SPRINT** | entradas de escopo e saídas de escopo | Quantidade de tarefas adicionadas fora do planejamento inicial e ainda no escopo, e quantidade de tarefas planejadas que foram removidas. Há mudança de escopo quando qualquer uma dessas quantidades é maior que zero. | TEXT_TOO_TECHNICAL → MATCH |
| **I72 Carry-over atual** | facts.incoming removedAtnull carriedFrom!=null independentstatus; frozenNO_DATA; owner **SPRINT** | Contagem de(participação corrente com transferência de Sprint anterior) | Quantidade de tarefas recebidas de outra Sprint que ainda pertencem ao escopo atual, incluindo as já concluídas. Não se aplica a Sprints encerradas. | TEXT_INACCURATE → MATCH |
| **I73 Idade média das PRs abertas** | SQLSUMTIMESTAMPDIFF/eligible, excludesfuture/null; round mean; owner **GITHUB** | Média(instante do cálculo − abertura no GitHub) das PRs abertas válidas | Média do tempo entre a abertura e a consulta de todas as Pull Requests atualmente abertas com data válida, em dias. | TEXT_TOO_TECHNICAL → MATCH |
| **I74 Tempo médio até fechamento de Issue** | sameI18cohort mean insteadmedian; nolegacycycles; owner **GITHUB** | Média(fechamento no GitHub − abertura no GitHub) | Média do tempo entre a abertura e o fechamento atual das Issues fechadas no período, em dias. Somente datas válidas e durações não negativas entram na amostra. | TEXT_TOO_TECHNICAL → MATCH |

## 7. Text inaccuracies corrected

I17 agora distingue total da amostra de PRs abertas com idade válida da lista de
até dez itens; idade não é confundida com o total mostrado. I72 deixa de chamar
recebidas de “pendências”: Tasks recebidas que ainda pertencem à Sprint podem estar
concluídas. I66 explica derivação técnica, sem alegar marcação manual. A copy
comercial correspondente foi alinhada. I36–I38 descrevem esforço estimado em horas;
I41/I42/I71 explicam participações no corte, não quantidade de eventos de entrada/saída.

## 8. Semantic mismatches found

**Nenhum novo conflito de algoritmo com a decisão canônica vigente foi encontrado.**
Não se corrigiu algoritmo nem se escolheu redação para disfarçar um defeito.

Existe uma **divergência acadêmica já documentada**, não resolvida nesta rodada:
RF54/Quadro 348 cita total de PRs no período; RF18/Quadro 346 usa PRs fechadas.
P3 escolheu explicitamente a coorte fechada RF18 (D10 define a fonte de lifecycle) para I04/I06 e registra
`TCC_ALIGNMENT_NOTE`. Repository SQL, calculator e política atual correspondem a
essa decisão. A apresentação explicita o denominador realmente aprovado; não
apresenta merge como parecer GitHub APPROVED (I19 segue não implementado).
A nota de alinhamento com a orientadora é preservada no catálogo, sem alegar que
a inconsistência no documento acadêmico foi encerrada. Sua resolução requer
entrega semântica/acadêmica própria; não altera o aceite local desta auditoria da
regra vigente P3 nem autoriza iniciar FIX-03. Se o RF acadêmico passar a exigir
outro denominador, isso deve ser tratado como mudança de contrato, nunca só de copy.

## 9. Percentages

I01 divide Tasks atualmente concluídas pelo universo existente. I04/I06 usam PRs
distintas na coorte de fechamento, respeitando corte posterior de reabertura/merge.
I49–I51 e I58 incluem resultados bloqueados no denominador. I61–I66 contam
Requisitos, não vínculos ou artefatos. Ausência de denominador mantém valor ausente,
sem transformá-lo em zero. I67 é média com peso igual por Requisito, não divisão
sobre Tasks globais; Requisitos sem Tasks contribuem com zero pela policy aprovada.

## 10. Counts

Estado atual é descrito como quantidade. I23 considera somente “Em andamento”.
I29 usa atribuição canônica; I30 distingue estimativa ausente de zero explícito.
Listas limitadas a dez não redefinem a amostra total. Deduplicações e exclusões
lógicas/físicas estão explícitas onde relevantes. Nenhum COUNT/status= é enviado
como regra de uso.

## 11. Time-based metrics

I20/I21 descrevem criação/primeiro andamento até primeira conclusão verificável,
em dias corridos, com amostra de primeiras conclusões no período. Reentry não
reinicia Cycle Time. I22 conta uma Task na conclusão ainda válida no corte.
I24 usa última entrada no andamento atual; I25 usa fim de dia completo no fuso,
somente cadeia observável de Tasks ainda existentes. I28 preserva a regra vigente
de prazo anterior ao instante da consulta; nenhuma correção de deadline foi feita.

## 12. Medians/averages

I15/I16: mediana/média abertura→merge em horas, PRs mescladas no período,
datas/durações válidas. I18/I74: fechamento **atual** de Issues, em dias, sem
inventar ciclo anterior. I57: criação→primeira validação, em dias, amostra de
primeiras validações no período. I73 usa todas as PRs abertas com idade válida,
sem limitar a média à lista I17. Não trocar média por mediana para ajustar um texto.

## 13. Sprint metrics

I36 usa baseline preservado; I37/I38/I40 distinguem Sprint aberta/encerrada;
I44 compara subtotais e publica desvio somente com cobertura integral. I45 explica
remaining = scope − completed no histórico capturado e qualifica expressamente o
fallback legado aproximado. I46 usa a mesma projeção e dias UTC; desconhecido
permanece lacuna. I47 descreve esforço entregue por Sprint concluída elegível,
não média de Velocity nem esforço realizado. I43 conserva saída congelada;
I72 permanece instantâneo/não aplicável a terminal. Nenhuma mudança de histórico,
carry-over, persistência ou estimativa nesta rodada.

## 14. GitHub metrics

Commits distintos, main literal e responsáveis associados são identificados.
I11 conta fechamento registrado mesmo depois de reopen; I14 não promete o mesmo
histórico para Issues. I04/I06 preservam coorte, relógio e cobertura parcial;
I19 não é inferido de merges. Dados GitHub consultados já estavam sincronizados;
nenhuma chamada ou escrita externa foi feita para a validação visual.

## 15. Quality metrics

Execuções são tentativas, não Casos de teste: I48–I51 consideram o período e todas
as versões executadas. I52 considera última execução da **versão atual** de casos
ativos não excluídos, inclusive nunca executados. I56 deduplica defeitos por evento
de validação; I57 seleciona primeira validação; I58 mantém todos os ciclos de
reteste, com BLOCKED no denominador. I59/I60 usam vínculos de origem, não correção.
Defeitos validados continuam na concentração; excluídos não reaparecem.

## 16. Traceability metrics

I61 deduplica Requisitos com pelo menos uma Task; vínculos múltiplos não aumentam o
numerador. I62 requer Commit/PR via Task, não Issue. I63 considera casos ativos
relevantes diretos/via Task; I64 defeitos ativos diretos/via ORIGIN. I65 requer
implementação, casos relevantes todos aprovados na versão atual e ausência de
falha/defeito ativo. I66 exige todas as Tasks concluídas e evidência técnica em pelo
menos uma, independentemente de falhas/defeitos posteriores. Não é um flag manual,
uma contagem de Commits ou um estágio determinado apenas pelo progresso.

## 17. Sources

Sources da API não foram alteradas. Presenter semântico central continua removendo
raw keys. Labels de I65 e I66 foram refinados respectivamente para “Rastreabilidade,
casos de teste e defeitos dos requisitos” e “Tarefas e evidências técnicas dos
requisitos”. As 68 definições passaram pela conferência de fonte e teste contra
nomes internos. O JSON registra o owner de persistência/projeção conferido.

## 18. Freshness/asOf

FIX-02 preservado: fonte externa usa `sourceUpdatedAt`; local usa `asOf`.
STALE usa “Última atualização da fonte”; ausência de clock/fonte indisponível não
recebe `generatedAt` como substituto. Testes percorrem todos os Data States;
NO_DATA não fabrica valor. GitHub e projeções dependentes identificam a fonte
externa, inclusive I62/I65/I66. Nenhuma regra de clock alterada.

## 19. Responsive formula rendering

Bloco proporcional com tokens de surface/border/padding, `width:fit-content` e
`max-width:100%`. Wrapping natural da regra completa; spans mínimos preservam
operador/termo e `× 100` com a última palavra do denominador. Não há nowrap global,
monospace ou background de código. O bloco curto não ocupa toda largura disponível.
Observações de DOM e inspeção renderizada confirmam ausência de overflow horizontal
nas amostras e legibilidade da fórmula longa I66 e da explicação histórica I45.

## 20. Accessibility

Disclosure existente fechado por padrão, botão/aria-expanded/aria-controls;
Enter/Space, Escape, retorno de foco e scroll interno preservados. A matemática
continua texto na ordem de leitura; spans não duplicam ou ocultam conteúdo.
Abertura em viewport móvel funciona por clique sem hover. Isso não é prova de
touch físico, certificação WCAG ou execução com leitor de tela.

## 21. Tests

| Teste | Resultado |
| --- | --- |
| Backend unit focados: metadata, services/calculators e policy | 71 PASS, incluindo quatro novos |
| APIs P3/P4/P5/P6/P7/P9 | 76 PASS |
| Frontend focused: DashboardPanel, PersonalizedDashboard, audit display | 83 PASS |
| Backend full | 1.578 PASS; cinco skips legados em duas suites |
| Backend coverage | 1.578 PASS; St 92,41%, Br 86,16%, Fn 95,73%, Li 94,80% |
| Frontend full final | 1.400 PASS, 115 arquivos |
| Frontend coverage final | 1.400 PASS; St 85,86%, Br 80,42%, Fn 81,67%, Li 88,32% |

Testes novos verificam regra/fonte publicada em todas as views, manutenção de
metadata por Data State, amostras dos tipos principais, policy S1-09 com/sem
conclusão/evidência/defeitos e ajuda do Meu painel. Componente cobre grupos de wrap
e remove “implementação marcada”. Não foram relaxadas asserts numéricas, adicionados
retries ou criados skips. Os skips preexistentes exigem banco anterior a LR.2.

## 22. Visual validation

Inspeção atual com Chrome autenticado e API real do Project 2, período setembro,
sem seed, mocks de rede ou escrita no banco de desenvolvimento. Todas as sete
famílias expostas possuem amostra real; matriz exata e capturas próprias:
[evidence/pr23-fix-02-1](../design/validation/evidence/pr23-fix-02-1/README.md).
1440 Light/Dark, 390 Light/Dark e tablet 768×1024 foram conferidos em amostra;
Meu painel reutiliza a mesma ajuda na API real. Space/Enter, Escape e retorno de
foco também foram exercitados. Console capturado sem warn/error. Camada principal
continua simples; detalhe inicia fechado, abre regra/fonte/horário sem reflow.
ESTADOS encontrados na amostra: AVAILABLE e PARTIAL; STALE/NO_DATA/UNAVAILABLE
recebem cobertura de componente/mapper, sem envelhecer ou fabricar dados locais.
Registro e limites: [Visual Validation Log](../design/validation/VISUAL_VALIDATION_LOG.md).

## 23. Full gates

| Gate | Resultado local |
| --- | --- |
| Focused + full backend/frontend e cobertura | PASS conforme seção 21 |
| Backend/frontend lint | PASS |
| Backend/frontend format:check | PASS |
| Frontend build | PASS; warning preexistente de chunks >500 kB |
| Prisma validate/generate | PASS; sem schema/migration novo |
| Architecture | PASS; zero violações |
| Local CI validator + 83 testes de policy CI/security | PASS |
| Canonical security gate backend/frontend | PASS; zero exceções acionadas |
| npm audit completo backend/frontend | zero vulnerabilidades de qualquer severidade |
| Secrets scan | PASS |
| git diff --check | PASS |

Os comandos de API/MySQL e audit precisaram sair do sandbox para conexão local e
registro npm; não se ignorou falha de rede como resultado de segurança. Banco
`localhost:3306/traceflow_test`, NODE_ENV=test, distinct TEST_DATABASE_URL validada,
read_only=0, MySQL local 26.7.0. Não equivale ao serviço MySQL 8.4.8 da CI remota.
Local CI significa validator e gates locais, não nova execução de GitHub Actions.

## 24. Remaining limitations

- Alinhamento acadêmico RF54/TCC já registrado; autoridade executável P3 preservada.
- Históricos parciais, filtros incompatíveis e I03/I05 sem widget isolado continuam
  com os limites existentes; esta rodada não acrescentou indicadores ou algoritmos.
- Inspeção em Chrome local, sem cross-browser, leitor de tela ou touch físico.
- Evidências novas no working tree para revisão/versionamento; nenhuma aprovação
  histórica P8.4 foi promovida ou fabricada.

## 25. Final verdict

**PR23-FIX-02.1 INDICATOR FORMULA AUDIT & PRESENTATION — PASS LOCAL**

68 regras auditadas, 66 expostas/personalizáveis; apresentação e fontes claras,
RF55 preservado, gates completos e inspeção real atual. Nenhum algoritmo, filtro,
Health weight, contrato estrutural, domínio, schema, banco, autorização ou dependência
alterado. Não iniciar FIX-03.

Sugestão de commit para revisão futura: `fix: audit and clarify indicator calculation details`.
