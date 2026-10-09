# Project Health Model v1

**Natureza:** capacidade derivada de produto para apoiar RF55/UC14; não cria RF nem altera o TCC oficial. **Autoridade:** backend `health.registry.js` e `health.policy.js`. `healthModelVersion=1` é independente da `definitionVersion` de cada indicador.

## 1. Princípios e escopo

O índice sintetiza condições observadas do projeto. Não mede produtividade individual, não prevê sucesso e não é percentagem de projeto “saudável”. Volume de commits, conclusões por pessoa e atividade por responsável (I02/I03/I05) são apenas contexto. O modelo calcula uma nota de 0 a 100 somente quando os dados são suficientes. `score:null` significa **não avaliado**, jamais zero. O frontend apresenta a avaliação produzida no backend.

## 2. Classificação exaustiva

Todos os IDs I01–I74 do catálogo canônico estão no registry. `SCORING_SIGNAL` participa da nota; `CONTEXT_ONLY` informa sem pontuar; `REDUNDANT` evita dupla contagem; `UNIMPLEMENTED` descreve uma proposta sem indicador executável; `NOT_RECOMMENDED` registra exclusão deliberada. I07/I08 são capacidades, não KPIs. I19/I69/I70 não têm widget executável; I68 é rejeitado como funil cumulativo. O catálogo HTTP continua publicando somente os indicadores implementados.

| Dimensão | Sinais e pesos internos | Peso no projeto |
|---|---|---:|
| Planejamento | I28 40%, I29 30%, I30 30% | 20% |
| Fluxo | I20 40%, I21 60% | 20% |
| Sprint | I44 30%, I45 50%, I71 20% | 15% |
| Qualidade | I04 15%, I49 25%, I52 20%, I58 20%, I64 20% | 25% |
| Rastreabilidade | I61/I62/I63/I65/I66 20% cada | 15% |
| Integração técnica | I15 60%, I73 40% | 5% |

I50/I51 duplicam o universo de I49; I06 contém I04; I16 usa a mesma coorte de I15; I46 é contexto de I45. Por isso são `REDUNDANT`. I01, I10, I26 e I39 são bases auxiliares e permanecem `CONTEXT_ONLY`. Os demais IDs não citados como sinais/redundantes/propostas são `CONTEXT_ONLY`, com atribuição explícita por ID no registry e na [tabela do catálogo](S2_INDICATOR_CATALOG.md).

## 3. Período de avaliação e baseline

Sem período solicitado, eventos usam os últimos 30 dias corridos até `generatedAt`. Com período, usam o intervalo solicitado normalizado em fuso IANA e recortado em `generatedAt`; dias futuros não são ausência negativa. O baseline de I20/I21/I15 é o intervalo imediatamente anterior de **mesma duração**, sem sobreposição. Se o corte solicitado começar depois de `generatedAt`, eventos temporais não são pontuáveis. Estado corrente (Tasks, TestCases, Requirements, Sprint, fila de PRs) usa o corte atual e não recebe filtro temporal fictício. `projectHealth.window` publica os dois intervalos UTC.

I04 limita a coorte ao último sync de lifecycle confirmado, mesmo quando a janela termina em `generatedAt`. Um sync anterior à request não invalida uma coorte conhecida: exige-se cobertura desde o início solicitado e intervalo positivo. `basis` publica os limites efetivos e as quantidades de PRs fechadas/reabertas; eventos posteriores ao sync não entram. Cobertura inicial ausente continua parcial; denominador zero continua sem avaliação. O corte da coorte não muda o baseline de I15 nem a janela geral publicada.

Quando a janela recortada é vazia, `projectHealth.window` é `null`: leituras canônicas
de casos de teste e fila de PRs continuam independentes dos widgets selecionados,
e fontes temporais dos widgets não entram no Health nem em seus assessments.

I20/I21 usam os mesmos critérios de primeira conclusão e primeira entrada em andamento dos
indicadores de Flow. A leitura de movimentos vai até `generatedAt` exclusivo, mesmo quando o
período solicitado termina antes: uma conclusão conhecida fora da janela não representa
histórico ausente. Cada amostra continua restrita ao seu intervalo inclusivo/exclusivo, e fatos
futuros não entram. O cálculo auxiliar de saúde retorna somente medianas e contagens, sem
expandir séries diárias para a janela atual ou o baseline; isso mantém períodos longos na GENERAL
sem mudar filtros, fórmulas, mínimos amostrais ou o limite das views que exibem séries.

## 4. Regras de cada sinal

As fórmulas abaixo produzem uma nota limitada a `[0,100]`, arredondada a duas casas. Elas não alteram as fórmulas originais dos indicadores.

| Sinal | Nota e base necessária |
|---|---|
| I28/I29/I30 | `100 − count / I26.totalTasks × 100`; I26 precisa ser positivo. |
| I20/I21 | Se mediana atual ≤ baseline, 100; senão `100 − (atual − baseline) / baseline × 100`. Ambas as janelas precisam de ≥3 amostras elegíveis e baseline >0. |
| I44 | `100 − abs(actualHours − estimatedHours) / estimatedHours × 100`; esforço completo, estimado >0. |
| I45 | Último ponto conhecido de burndown, ao menos dois pontos: `100 − max(0, remaining − ideal) / baselineScope × 100`; escopo base >0. |
| I71 | `100 − (addedCount + removedCount) / I39.plannedTasks × 100`; baseline planejado >0. |
| I04 | `100 − reworkRate`; apenas coorte de lifecycle completa. |
| I49 | `passRate`; I50/I51 não entram de novo. |
| I52 | `PASS` da versão atual / total de casos ativos ×100. `NEVER_EXECUTED` não é PASS. |
| I58 | `retestSuccessRate` de tentativas elegíveis. |
| I64 | `100 − percentual de Requirements com Defect ativo`. Sem penalidade universal por severidade crítica. |
| I61 | Cobertura direta de Requirements com Tasks. |
| I66/I62 | `100 − max(0, I01.progress − cobertura do sinal)`; estágio técnico e evidência comparados ao progresso do projeto. |
| I63/I65 | `100 − max(0, I66.implementation − cobertura do sinal)`; verificação e validação comparadas à implementação. |
| I15 | Comparação de mediana de tempo até merge com período anterior, regra e amostra de I20/I21. |
| I73 | Se I10=0 disponível, 100 mesmo que idade bruta seja `NO_DATA`. Se I10>0, comparar idade média aberta (dias convertidos em horas) à mediana I15 atual, com ≥3 merges elegíveis e baseline >0; regressão percentual reduz a nota. |

I28 interpreta `Task.deadline` como data civil: só conta prazo anterior ao dia de `generatedAt` no fuso da requisição. Usa a mesma fronteira civil da leitura de Tasks e o contrato de Kanban; prazo de hoje não é atraso. Sem período, o agregado também aceita `timeZone` IANA; cliente envia o fuso do navegador e API sem fuso usa UTC.

## 5. Estados de dados e avaliação

Somente `AVAILABLE` participa por padrão. `PARTIAL`, `STALE`, `NO_DATA` e `UNAVAILABLE` produzem `UNASSESSED`, `score:null` e reduzem cobertura dos sinais aplicáveis. A única exceção explícita de pontuação é I73 com **I10 disponível e igual a zero**, prova factual de fila vazia. Falta de dependência, denominador zero, período futuro ou amostra insuficiente também geram `UNASSESSED`. Métrica `CONTEXT_ONLY`, `REDUNDANT`, `UNIMPLEMENTED` ou `NOT_RECOMMENDED` recebe `NEUTRAL` e não afeta cobertura. Estado dos dados e status de saúde são campos separados; `STALE` nunca se torna uma nota baixa.

Status pontuado: `HEALTHY` para ≥80; `ATTENTION` para ≥60 e <80; `CRITICAL` para <60. `UNASSESSED` e `NEUTRAL` não têm nota.

## 6. Cobertura e nota dimensional

Em cada dimensão aplicável, `coverage = soma dos pesos dos sinais pontuados / soma dos pesos aplicáveis ×100`. A nota dimensional só existe com cobertura ≥50%, sendo média dos sinais pontuados ponderada pelos respectivos pesos. O peso dos sinais ausentes não é redistribuído no registro de cobertura. Sem Sprint ativa selecionada, Sprint é `NOT_APPLICABLE` no índice do projeto; uma Sprint terminal escolhida continua visível nos widgets, mas não transforma seu burndown histórico em saúde corrente. Sem integração GitHub configurada, Integração técnica é `NOT_APPLICABLE`. Dimensões não aplicáveis saem do denominador de cobertura do projeto.

Sem `githubIntegration`, os sinais I04/I15/I73/I62/I63/I65/I66 têm `UNASSESSED`, `score:null` e `GITHUB_NOT_CONFIGURED`, e saem do denominador de **sinais aplicáveis**. I63 mede casos de teste localmente, mas seu assessment compara com I66, dependente de GitHub. Qualidade mantém os sinais locais (peso aplicável 85); Rastreabilidade mantém I61 (peso aplicável 20). Pesos do registry, thresholds e mínimo de quatro dimensões permanecem iguais. Não aplicável não reduz cobertura como uma falha de coleta de uma fonte configurada, nem assegura uma nota sem base local suficiente.

`projectCoverage = Σ(dimensionWeight × dimensionCoverage) / Σ(dimensionWeight aplicável)`.
Nota geral existe somente com cobertura ≥60% **e** pelo menos quatro dimensões com nota. A média geral usa `dimensionWeight × dimensionCoverage` como peso efetivo das dimensões pontuadas. A resposta publica cobertura, número de sinais e dimensões aplicáveis/pontuados, motivos estruturados, `calculatedAt` e janelas com fuso. Sem base suficiente, `score:null,status:UNASSESSED`.

## 7. Drivers e explicação

Cada sinal pontuado pode fornecer `reasonCode` e `basis` com números/IDs de métricas e limites temporais da coorte, sem nomes, emails ou identificadores pessoais. I04 acrescenta `cohortStartInclusive`, `cohortEndExclusive`, `closedPullRequests` e `reopenedPullRequests`. Impacto negativo é `dimensionWeight × signalWeight × (100 − score)` na escala percentual do projeto. Até três sinais com score <80 e maior impacto aparecem como pontos de atenção; até três com score ≥80 e menor perda aparecem como positivos. A UI traduz as razões, sem calcular notas. Um driver não substitui a decomposição por dimensões.

## 8. Aplicabilidade, filtros e frescor

O health é uma leitura do projeto autorizado; filtro por responsável nunca restringe a nota. O filtro de Sprint seleciona a Sprint dos indicadores canônicos, quando fornecido. O período afeta apenas sinais de evento. GitHub sem sync confiável reduz cobertura; não há penalidade automática por ausência ou stale. O modelo usa services agregados existentes, sem consulta por sinal, sem cache persistido e sem alteração do schema. GENERAL, CUSTOM e as views solicitadas com `includeProjectHealth=true` leem as fontes auxiliares por grupo e dois baselines apenas para Flow e GitHub. CUSTOM avalia a saúde completa independentemente dos widgets selecionados; as demais views sem a opção não incluem Project Health.

Ausência de configuração e STALE são distintos. Com integração configurada, a policy vigente usa falha de sync, integração inativa ou divergência da main; idade isolada do sync não define STALE. Completude do lifecycle até o último sync é avaliada separadamente desse frescor. Uma coorte calculável pode ter fonte STALE e, nesse caso, não pontua no Health.

## 9. Contrato e evolução

`GET /indicators/catalog` adiciona `healthRole`, `healthDimension` e `healthModelVersion` a cada indicador executável. `GET /indicators/dashboard` adiciona `assessment` a cada resultado; GENERAL e CUSTOM adicionam `projectHealth`; nas demais views, o campo é solicitado por `includeProjectHealth=true`. `healthModelVersion` permite evolução sem mudar a definição dos indicadores nem reinterpretar scores antigos, que não são persistidos nesta versão. Os campos detalhados estão em [API Contracts](../api/API_CONTRACTS.md).

## 10. Pontos para validação acadêmica

Permanecem para discussão com a orientadora: pesos das seis dimensões, thresholds 80/60, cobertura mínima 60%, amostra mínima 3, seleção dos sinais primários, comparação com período anterior, possível guardrail futuro para Defects críticos e metas configuráveis. São decisões explícitas do produto v1, não requisitos oficiais adicionais.

## 11. Exemplos verificáveis

Com 15 Tasks, três atrasadas, nenhuma sem responsável e três sem estimativa, I28/I29/I30 recebem 80/100/80; Planejamento recebe `80×0,40 + 100×0,30 + 80×0,30 = 86`. Uma mediana de Cycle Time de 6 dias frente a 4 dias na janela anterior recebe 50; uma melhora de 6 para 4 dias recebe 100. Um caso atual PASS entre sete casos ativos produz I52 ≈14,29, mesmo que execuções PASS antigas existam em versões anteriores. Um projeto com cobertura de 42% e duas dimensões avaliadas retorna `score:null,status:UNASSESSED`, ainda que os sinais conhecidos sejam positivos.

## 12. Riscos de interpretação

O score pode mudar por melhoria da **cobertura dos dados**, sem alteração instantânea das condições reais; por isso cobertura e dimensões acompanham a nota. Comparações temporais não equivalem a metas organizacionais. Amostras pequenas e legado histórico podem deixar sinais sem avaliação. Um índice alto não anula um Defect crítico ou risco externo específico, que precisa continuar visível no domínio. A nota não deve ser usada para ranking de pessoas, decisões de emprego ou afirmação de qualidade garantida.
