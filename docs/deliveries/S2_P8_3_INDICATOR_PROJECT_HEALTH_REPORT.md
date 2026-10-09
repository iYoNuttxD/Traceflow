# S2 P8.3 — Indicator Health + Project Health

> Legacy label: S2 P8.3. Canonical phase: **IND-P8.3**.
> Fase interna de indicadores vinculada a S2-04/S2-05; não é o cartão S2-08.
> [Mapeamento canônico](../../TRACEFLOW_ROADMAP_INCREMENTAL.md#fases-internas-de-indicadores-ind).

**Estado local:** PASS LOCAL para o escopo P8.3. **Capacidade:** derivada de RF55/UC14, sem RF novo. **Modelo:** Project Health Model v1. Os gates e seus limites estão nas seções 24–27.

## 1. Baseline

Checkout `/Users/daniel/Coding/Traceflow`, branch `daniel-dev`, Node 22.23.3. O trabalho começou com HEAD `1982633` e alterações locais P8.2; durante esta rodada o HEAD passou a `2b85c08` por uma ação externa a esta implementação. Nenhum commit, push, merge, rebase, reset, clean ou stash foi executado nesta rodada. O diff P8.3 permanece local. Não houve migration nem alteração de schema.

## 2. Motivation

Os 74 IDs do catálogo davam valores e estados de dados, mas não uma interpretação composta e explicável das condições do projeto. A visão Geral agora sintetiza somente sinais primários com base suficiente e revela sua cobertura.

## 3. Health Model v1

`healthModelVersion: 1` é independente de `definitionVersion`. [PROJECT_HEALTH_MODEL_V1.md](../indicators/PROJECT_HEALTH_MODEL_V1.md) fixa sinais, fórmulas, períodos, limites e riscos. `health.registry.js` e `health.policy.js` são as autoridades executáveis. A avaliação não é persistida.

## 4. Principles

O índice apoia gestão; não representa uma porcentagem absoluta de qualidade, previsão de sucesso ou desempenho de pessoas. `score:null` expressa falta de base, nunca nota zero. Estado de dado e estado de saúde permanecem distintos. O backend calcula todas as notas; o frontend somente as apresenta.

## 5. Indicator classification

I01–I74 têm papel explícito no registry e na tabela do [catálogo S2](../indicators/S2_INDICATOR_CATALOG.md): `SCORING_SIGNAL`, `CONTEXT_ONLY`, `REDUNDANT`, `NOT_RECOMMENDED` ou `UNIMPLEMENTED`. I02/I03/I05, volume por pessoa, ficam somente como contexto. I50/I51 não duplicam I49. I19/I69/I70 continuam não implementados; I68 continua não recomendado. Teste compara os 74 IDs e exige pesos internos completos.

## 6. Dimensions

Planejamento, Fluxo, Sprint, Qualidade, Rastreabilidade e Integração técnica são as seis dimensões. Sprint fica `NOT_APPLICABLE` sem Sprint ativa selecionada; Integração técnica fica `NOT_APPLICABLE` sem GitHub configurado. Sinais de dimensão não aplicável não contam como avaliados nem aparecem como drivers do índice.

## 7. Weights

Pesos de projeto: Planejamento 20%, Fluxo 20%, Sprint 15%, Qualidade 25%, Rastreabilidade 15% e Integração técnica 5%; soma 100%. Os pesos dos sinais internos também somam 100% por dimensão. Não são configuráveis nesta versão.

## 8. Assessment period

Sem filtro, eventos usam os 30 dias anteriores a `generatedAt`; com filtro, usam o período solicitado recortado em `generatedAt`. Estado corrente não recebe recorte temporal artificial. `projectHealth.window` informa limites UTC das janelas atual e de comparação.

## 9. Baseline comparison

I20/I21 e I15 usam a janela imediatamente anterior de igual duração, sem sobreposição, e exigem ao menos três observações elegíveis em cada janela. A nota é 100 se a mediana atual não piorou; regressão percentual reduz a nota, com limite 0–100. Período futuro, baseline nulo ou amostra menor que três produzem `UNASSESSED`.

## 10. Planning

I28/I29/I30 pontuam as frações de Tasks atrasadas, sem responsável e sem estimativa sobre I26. Com universo zero, não há nota. Os fatos usam o agregado canônico de Tasks e o mesmo corte de `asOf`.

## 11. Flow

I20 Lead Time (40%) e I21 Cycle Time (60%) usam cálculo canônico de histórico de movimentações e baseline do próprio projeto. Amostras insuficientes não viram saúde ruim.

## 12. Sprint

I44 usa desvio absoluto entre horas estimadas e realizadas com esforço completo. I45 usa último bucket comparável do Burndown v2, somente em Sprint ativa com estado `AVAILABLE`, pelo menos dois pontos e linha ideal. I71 mede mudança de escopo sobre I39 planejado. I47 Velocity permanece neutro.

## 13. Quality

I04 rework de PR, I49 taxa PASS, I52 estado PASS da versão atual dos casos ativos, I58 sucesso de reteste e I64 percentual de Requirements com Defect ativo compõem Qualidade. O helper de fatos de qualidade foi extraído do calculator canônico para a leitura agrupada, sem alterar as fórmulas dos indicadores.

## 14. Traceability

I61 mede vínculo Requirement–Task. I66/I62 medem lacuna em relação ao progresso I01. I63/I65 medem lacuna em relação à implementação I66. Ausência de estágio posterior à implementação afeta a nota somente quando a base esperada está disponível.

## 15. Technical integration

I15 compara mediana de tempo até merge com a janela anterior. I73 compara idade média dos PRs abertos à mediana de merge atual. I10=0 disponível prova fila vazia e pontua I73 como 100 mesmo sem idade observável. Sync stale ou coorte insuficiente reduzem cobertura.

## 16. Data-state interaction

Por padrão apenas `AVAILABLE` entra no índice. `PARTIAL`, `STALE`, `NO_DATA` e `UNAVAILABLE` dão `UNASSESSED` e reduzem cobertura, sem penalidade direta. A exceção factual de I73 com fila vazia está documentada. `NEUTRAL` identifica indicadores informativos ou excluídos da pontuação.

## 17. Coverage

Cobertura dimensional é peso pontuado dividido pelo peso aplicável dos sinais. Cobertura geral é média das coberturas dimensionais ponderada pelos pesos das dimensões aplicáveis. A resposta inclui percentual, sinais e dimensões avaliados/aplicáveis. Uma dimensão precisa de 50% de cobertura para ter nota.

## 18. Project score

Nota geral requer cobertura ≥60% e pelo menos quatro dimensões pontuadas. Ela é a média das notas dimensionais com peso efetivo `dimensionWeight × dimensionCoverage`. Estado é `HEALTHY` ≥80, `ATTENTION` ≥60, `CRITICAL` abaixo de 60; caso não avaliável, `UNASSESSED` com nota nula. Exemplo unitário verificável: 82,94 com quatro dimensões e cobertura de 100%.

## 19. Drivers

Até três sinais com maior perda ponderada aparecem como pontos de atenção; até três sinais com nota ≥80 e menor perda aparecem como positivos. A resposta traz `metricId`, dimensão, nota, impacto, `reasonCode` e base numérica, sem nomes ou emails. A UI usa títulos do catálogo e explica os valores. Drivers de dimensões não aplicáveis ou sem nota dimensional não entram.

## 20. API contract

`GET /indicators/catalog` inclui `healthRole`, `healthDimension` e `healthModelVersion` nos indicadores executáveis. `GET /indicators/dashboard` inclui `assessment` em cada indicador; apenas GENERAL inclui `projectHealth`, com score, status, cobertura, contagens, dimensões, drivers, `calculatedAt` e janela com fuso. Os filtros e o controle de acesso existentes permanecem. Detalhes em [API_CONTRACTS.md](../api/API_CONTRACTS.md).

## 21. Frontend

Saúde do projeto aparece acima do Panorama na visão Geral. Nota, barra, status textual, cobertura, dimensões e drivers mantêm o padrão P8.2. Cards de sinal mostram avaliação individual sem ocultar valor bruto ou estado de dado. Contexto neutro não recebe badge de saúde. O help explica propósito, pesos, janela, cobertura, versão e limitações.

## 22. Accessibility

Nota/status/cobertura usam texto além de cor; a barra tem `role=meter` e valor acessível. O help é `details/summary`, operável por teclado, e os estilos incluem foco visível. Os componentes foram inspecionados em Light/Dark e 1440/768/390 px. Não foi feita auditoria WCAG instrumental ou homologação de leitor de tela real.

## 23. Performance

Leitura sem N+1 por sinal: fontes auxiliares agrupadas por Flow/Planning, Quality e GitHub; baselines somente para duração temporal. Reutilização de resultados do agregado nas views específicas quando o período coincide. Smoke local em projeto artificial vazio no banco de teste, cinco leituras por variante após a última alteração: caminho P7 de referência com 16 operações de leitura Prisma e mediana 1,86 ms; GENERAL P8.3 com 25 operações e mediana 3,43 ms. Contagem inclui delegates/`$queryRaw` instrumentados, **não** statements SQL. Payload P8.3 ~19.020 bytes no cenário. Isto não é benchmark de carga ou comparação de produção; o aumento fixo foi aceito após reduzir a primeira composição de 80 para 25 operações. Nenhum cache ou persistência nova.

## 24. Tests

Teste unitário de registry, fórmulas, estados, cobertura, limites, drivers, janela e score exato; teste API P7 estendido com projeto real de teste e assessment. Backend: 836 testes unitários e 608 testes integração/API aprovados; 5 skips preexistentes em 2 arquivos. Frontend: 1.258 testes aprovados com cobertura, incluindo estados de saúde, help e badges. Projeto artificial do smoke foi removido do banco `traceflow_test` ao final; o banco de desenvolvimento não foi escrito.

## 25. Gates

Node 22.23.3: backend unit (836), integração/API (608; 5 skips preexistentes) e cobertura final estável (1.444 aprovados; statements 91,72%, branches 84,04%, functions 95,18%, lines 94,2%), lint, format, architecture e secret scan aprovados. Frontend test e test:coverage final (1.258; statements 83,85%, branches 78,05%, functions 79,35%, lines 86,25%), lint, format e build aprovados. Após o ajuste de `assessment` explícito nos placeholders, os testes focados unitário/API passaram (20 casos). Prisma validate e generate (v6.12.0) passaram. Validação da política CI local: 8 testes aprovados; política de audit: 5 testes aprovados; formatação dos arquivos de política aprovada. Auditorias de dependências backend/frontend: zero high/critical, sem exceção. `git diff --check` aprovado. A CI remota não foi executada.

## 26. Visual validation

Chrome local autenticado em `projects/2` exibiu `73/100 · Atenção`, cobertura 69%, 16/20 sinais, cinco dimensões e drivers explicáveis com API real; o help mostrou pesos e janela. Fixtures sintéticas HEALTHY/ATTENTION/CRITICAL/UNASSESSED foram verificadas nas 16 combinações 1440/390 × Light/Dark, sem overflow horizontal; capturas representativas e tablet 768 Dark foram inspecionados. Evidência e limites em [VISUAL_VALIDATION_LOG.md](../design/validation/VISUAL_VALIDATION_LOG.md). O viewport temporário voltou a 1710 px e o tema original Escuro foi mantido.

## 27. Limitations

I19/I69/I70 não têm implementação; I68 permanece excluído. Série temporal pequena, histórico parcial, Sprint terminal e GitHub stale podem diminuir cobertura; o score pode mudar quando a cobertura melhora. Não houve CI remota, teste cross-browser, auditoria WCAG instrumental nem benchmark com carga real. O modelo não guarda histórico de scores nem permite pesos/thresholds customizados. P9 não foi implementado.

## 28. Items for advisor validation

Discutir com a orientadora os pesos das dimensões, thresholds 80/60, cobertura mínima 60%, amostra mínima de três, seleção dos sinais primários, baseline pelo período anterior, possível guardrail para Defects críticos e targets configuráveis futuros. Essas são decisões explícitas do produto v1 e não alterações ao documento oficial do TCC.

**Sugestão de commit (não executado):** `feat: add explainable project health scoring`.
