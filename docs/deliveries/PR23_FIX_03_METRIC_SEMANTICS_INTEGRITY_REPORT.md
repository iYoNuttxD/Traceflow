# PR23-FIX-03 — Metric Semantics Integrity

Data: 2026-10-05, America/Sao_Paulo. Escopo: ausência de GitHub, prazo civil de Tasks e coorte de retrabalho de PRs no Health. Sem capturas ou nova homologação visual.

## 1. Baseline

| Item | Valor observado antes de editar |
|---|---|
| Branch | `daniel-dev` |
| HEAD | `ba2652c079b371308fa15dfaed8c5f0c67b1b551` |
| Working tree | Limpa; `git status --short` e `git diff --stat` vazios |
| `git diff --check` | PASS |
| Node/npm padrão | 26.9.0 / 11.19.1 |
| Node/npm dos gates | **22.23.3 / 10.9.9** |

Gates executados com `PATH=/opt/homebrew/opt/node@22/bin:$PATH` e, nos testes, `NODE_OPTIONS=--no-experimental-webstorage`. Nenhum commit/push ou operação de integração/reset/clean/stash. Não houve schema, migration, mudança de dependência ou escrita no dataset de desenvolvimento.

## 2. Review findings addressed

| Achado | Causa verificada | Correção |
|---|---|---|
| GitHub ausente interpretado como STALE | A policy comparava status inexistente com ACTIVE; rastreabilidade propagava esse resultado | Ausência explícita, UNAVAILABLE/GITHUB_NOT_CONFIGURED; aplicabilidade no Health |
| I28 marca prazo de hoje como atrasado | SQL comparava deadline com o instante da request | Fronteira do dia civil no fuso IANA, compartilhada entre Tasks e Health |
| I04 fica não avaliado no Health padrão | Completude exigia sync posterior ou igual ao fim da janela/asOf | Coorte limitada ao último sync confirmado, com completeness separada de freshness |

Leitura incluiu freshness, traceability, dashboard, flow/task, Health policy/data/repository/service, GitHub repository/service/calculator, Task schema, Kanban, metadados e contratos. RF18 permanece com denominador de PRs fechadas; RF54, Sprint Analytics, pesos e thresholds não mudaram.

## 3. GitHub NOT_CONFIGURED semantics

`githubIntegration=null` produz `stale:false`, clocks externos nulos e `GITHUB_NOT_CONFIGURED`. Indicadores exclusivamente GitHub retornam `UNAVAILABLE` e `value:null`; não há sexta Data State. No agregado, essa razão tem precedência sobre PERIOD_REQUIRED para uma fonte exclusivamente GitHub não configurada.

I02 exige integração e fotografia confirmada da main. I03 permanece local; I05 preserva seu componente de Tasks, mantendo commits desconhecidos. A UI traduz a razão já existente no contrato de limitations, sem novo fluxo de produto.

## 4. STALE semantics

Decisão explicitamente confirmada pelo usuário: **preservar a policy atual; idade isolada não define STALE**. Com integração existente, falha/bloqueio de sync, integração inativa e divergência da main mantêm suas razões atuais. Não foi criado limite de idade.

O cenário de fonte STALE usa sync antigo **com FALHA**, não apenas uma data antiga. Valores calculáveis podem permanecer conhecidos com STALE; seus assessments não viram score zero.

## 5. Traceability applicability

| Indicadores | Dependência | Sem integração |
|---|---|---|
| I61, I63, I64, I67 | Vínculos/qualidade/progresso locais | Calculáveis com os fatos locais |
| I62 | Evidência técnica por Commit/PR via Tasks | UNAVAILABLE, valor/numerador nulos |
| I66 | Todas as Tasks concluídas e evidência Commit/PR | UNAVAILABLE, valor/numerador nulos |
| I65 | Conclusão da cadeia técnica e de qualidade | UNAVAILABLE, valor/numerador nulos |

O denominador local de Requirements é preservado. I63 mede Casos de teste localmente; somente sua comparação no Health depende de I66. Nenhuma Issue passou a contar como evidência técnica, e a projeção S1-09 continua sendo autoridade.

## 6. Project Health applicability

Sem configuração GitHub, I04/I15/I73/I62/I63/I65/I66 recebem `UNASSESSED`, `score:null`, `GITHUB_NOT_CONFIGURED` e saem do denominador de sinais aplicáveis. Integração técnica continua NOT_APPLICABLE. Qualidade mantém peso aplicável 85; Rastreabilidade mantém I61, peso aplicável 20.

Coverage continua sendo peso pontuado ÷ peso aplicável; não foi alterado o registry. Permanecem cobertura dimensional mínima 50%, cobertura global mínima 60%, quatro dimensões avaliadas e thresholds 80/60. Dados locais insuficientes ainda deixam a nota nula.

Teste de cálculo exato: com base local suficiente e sem integração, dimensões 100/80/não aplicável/71,18/100/não aplicável produzem score 85,99, coverage 100% e quatro dimensões avaliadas. O mesmo teste com integração mantém as notas anteriores 100/80/não avaliada/74/79/não avaliada, score 82,94 e coverage 94,12%. Isso comprova a preservação dos pesos quando os sinais são aplicáveis.

## 7. I28 civil-date semantics

`task-deadline.policy.js` define a fronteira civil compartilhada: dia local de `asOf` convertido em meia-noite UTC da mesma chave civil, para comparar com a parte de data persistida. O SQL não usa o fuso implícito do servidor ou do banco.

Prazo `2026-10-05` em São Paulo não é atraso durante 05/10, inclusive em `2026-10-06T02:59:59Z`; passa a ser atraso em `2026-10-06T03:00:00Z`. Tasks concluídas e sem prazo não contam. Aggregate e lista top 10 usam a mesma fronteira; `scope.timeZone` registra o fuso.

Não houve alteração do significado/persistência do deadline, nem workaround 23:59:59. A representação ISO existente continua compatível; o dia civil da parte UTC é a autoridade.

## 8. Kanban alignment

Kanban e seu resumo usam dia civil explícito por Intl/IANA; TaskList reutiliza o mesmo helper de overdue. Cards congelados continuam referenciados ao snapshot de fechamento.

A inspeção direta revelou que a lista de I28 formatava deadline como timestamp e podia mostrar o dia anterior. Ela agora apresenta data civil com ano e sem horário. Um teste do DashboardPanel fixa `2026-10-05T00:00:00Z` como `Prazo: 05/10/2026`. Nenhum layout/CSS foi redesenhado.

## 9. Timezone handling

O agregado aceita `timeZone` IANA sem datas para fotografia civil/Health; datas de evento continuam pareadas e exigem fuso válido. API sem fuso usa UTC. O cliente envia o fuso do navegador mesmo sem período.

Leituras auxiliares sem filtro de evento podem usar período interno UTC, mas preservam o fuso real da request para I28. GENERAL, TASK, PLANNING e CUSTOM foram cobertos nesse cenário. Não foi alterado o contexto global de filtros ou seu comportamento visual.

## 10. I04 cohort completeness

`pr-cohort.policy.js` é compartilhada pelo endpoint GitHub e pelo Health:

```text
fim efetivo = min(fim solicitado, lifecycleSyncedAt)
início efetivo = max(início solicitado, coverageFrom)
coorte completa = início solicitado coberto e intervalo efetivo positivo
```

Predicados de CLOSED/REOPENED/MERGED são aplicados no repository antes da agregação. A coorte permanece deduplicada por PR; reabertura deve ser posterior ao primeiro CLOSED elegível e anterior ao corte. I06/I11 compartilham esse mesmo intervalo.

`period` individual publica o recorte efetivo, `coverage` mantém os marcadores e `PR_COHORT_CUT_AT_LAST_SYNC` explica a cauda não observada. O envelope/requestedFilters e a janela geral do Health permanecem solicitados. Nenhum evento futuro ou posterior ao sync é considerado conhecido.

## 11. I04 freshness separation

Corte final no sync não torna uma coorte integralmente conhecida automaticamente PARTIAL; início não coberto continua PARTIAL, marcadores ausentes UNAVAILABLE e denominador zero NO_DATA. Com coorte completa e D positivo, sync cinco minutos antes do asOf permite assessment normal.

`basis` do assessment publica limites UTC efetivos e quantidades fechadas/reabertas. `sourceUpdatedAt` continua sendo o relógio externo de sync, sem substituição por generatedAt. Fonte STALE continua não pontuável, mesmo com taxa historicamente calculável. Não existia mínimo amostral adicional para I04; os mínimos de Flow/merge permanecem inalterados.

## 12. Tests — GitHub

Fixtures sem integração cobrem indicadores GitHub nulos/UNAVAILABLE, ausência de STALE, clocks nulos, rastreabilidade local, general sem 500 e aplicabilidade do Health. Fixtures configuradas preservam fonte realmente STALE e PERIOD_REQUIRED para eventos sem período.

O teste P6 que possuía artefatos técnicos sem integração recebeu uma integração explícita para continuar verificando valores técnicos. P7 diferencia projeto vazio sem integração de uma fonte configurada sem período. Assertions de coverage futura foram alinhadas ao denominador aplicável, mantendo a impossibilidade de score com menos de quatro dimensões.

## 13. Tests — I28

Unit/API cobrem ontem/hoje/amanhã, Task concluída, sem deadline, lista/total/assessment coerentes, fotografia geral e views sem período. Em `2026-10-06T01:00Z`, a fixture tem uma atrasada em São Paulo e duas em UTC; na meia-noite local seguinte São Paulo passa a duas. O Health publica a mesma contagem usada por I28.

## 14. Tests — timezone

Testes diretos de `createIndicatorLocalDateKey` e de prazo civil cobrem São Paulo, divergência de dia UTC/local e Nova York na mudança de DST. Teste de contrato importa as implementações puras backend/frontend e compara Kanban, resumo e analytics nos mesmos instantes/fusos.

I20/I21/I22/I25 receberam regressão diária explícita com movimento UTC cruzando a meia-noite local de São Paulo. Seus algoritmos não foram reescritos.

## 15. Tests — I04

Fixture HTTP persistida: asOf 20:00, lifecycleSync 19:55; quatro PRs fechadas conhecidas, uma reaberta conhecida e fatos posteriores ao sync excluídos. Resultado: I04 25%, N=1, D=4, AVAILABLE, Health 75/ATTENTION, corte 19:55. I11 conta quatro, sem incluir a quinta PR posterior.

Também foram testados início parcial, ausência de denominador, fonte STALE e ausência de cobertura antiga fabricada. Os testes de regras/fórmulas existentes continuam exercitando o contrato auditável do FIX-02.1.

## 16. API/runtime validation

As seis situações exigidas foram executadas em Express/HTTP real com Prisma/MySQL no schema de testes isolado, via `test/api/metric-semantics.test.js`:

| Cenário | Resultado observado |
|---|---|
| A. GitHub integrado e sincronizado | Valores observáveis, sem STALE por idade isolada |
| B. GitHub integrado, sync antigo com FALHA | STALE, valor conhecido preservado, Health não avaliado |
| C. Sem githubIntegration | Locais disponíveis; técnicos indisponíveis; clocks nulos; HTTP 200 |
| D. Prazo hoje | Não conta como atrasado |
| E. Prazo ontem | Conta em lista/total/Health |
| F. I04 com sync recente | Coorte conhecida avaliável, cauda posterior excluída |

Pré-flight local: NODE_ENV=test, host localhost, schema `traceflow_test`, read_only=0, MySQL 26.7.0 e TEST_DATABASE_URL validada como distinta do banco de desenvolvimento. Valores de conexão/credenciais não foram registrados. Fixtures artificiais foram limpas pelos helpers canônicos; o Project 2 de desenvolvimento foi somente lido.

Inspeção direta no Chrome autenticado, com backend :3001 e Vite :5173: Kanban e I28 do Project 2 mostraram **6 de 42 Tasks atrasadas**; datas de I28 coincidiram com Kanban após a correção; Summary/Visão Geral mostraram Health 75/100 e Planejamento 93/100 arredondados. Kanban, Indicadores e Project Health foram inspecionados em Claro/Escuro por estado runtime/DOM, sem capturas. O tema Escuro original foi restaurado e a aba temporária foi fechada.

Na view GitHub real, período 01–05/10 em São Paulo: I04 mostrou 0% e a informação de corte no último sync; ajuda exibiu regra da coorte, fonte de lifecycle e fonte atualizada em 04/10, 23:39. Nenhuma mensagem de STALE por idade isolada e nenhum erro/warning nos logs da aba. Isso é inspeção runtime funcional, não uma nova aprovação visual binária.

## 17. Documentation changes

- Catálogo: ausência de integração, I28 civil, corte de I04/I06/I11 e aplicabilidade de I62/I63/I65/I66.
- Health Model v1: denominador aplicável, referência I63→I66, prazo civil, corte conhecido e basis temporal.
- API Contracts: razão NOT_CONFIGURED, clocks nulos, timeZone sem datas, civil-date/serialização preservada e período efetivo de lifecycle.

Fórmulas foram atualizadas na autoridade backend somente quando o corte/regra mudou; não foi criado registry paralelo no frontend. Fonte/asOf/sourceUpdatedAt e disclosure de RF55 permanecem disponíveis.

## 18. Full gates

| Gate, com Node 22 | Resultado final |
|---|---|
| Backend focused | PASS: regras unitárias de semântica/Health/Flow; 18 testes API de fechamento em P7 + metric-semantics |
| Frontend focused | 56 PASS em DashboardPanel, contrato de prazo e adapter de API |
| Backend full (`npm test`) | **1.603 PASS**, cinco skips legados; 140 arquivos PASS, dois skipped |
| Backend coverage (`npm run test:coverage`) | Mesmos 1.603 PASS; thresholds aprovados |
| Backend lint / format:check | PASS |
| Frontend full (`npm test`) | **1.409 PASS**, 116 arquivos |
| Frontend coverage (`npm run test:coverage`) | Mesmos 1.409 PASS; thresholds aprovados |
| Frontend lint / format:check / build | PASS |
| Prisma validate / generate | PASS, client 6.12.0 |
| db:test:migrate / db:test:status | PASS, 63 migrations existentes, nenhuma pendente |
| Architecture check | PASS, nenhuma violação |
| Local CI validator | `validateRepositoryCi()` retorna true |
| Testes da policy CI/security | 83 PASS |
| Security secrets | PASS |
| Gate canônico npm audit, backend e frontend | PASS, zero exceções usadas, zero HIGH/CRITICAL |
| npm audit completo, incluindo dev, backend e frontend | **Zero vulnerabilidades** em ambos |
| git diff --check | PASS |

| Cobertura | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| Backend | 92,44% | 86,28% | 95,70% | 94,82% |
| Frontend | 85,84% | 80,42% | 81,68% | 88,32% |

Todos os resultados acima foram obtidos depois dos ajustes correspondentes. A primeira
regressão expôs assertions/fixtures antigas incompatíveis com NOT_CONFIGURED e a nova
aplicabilidade, além de um erro de nome do modelo Prisma na fixture durante a correção; foram
corrigidos e reexecutados, sem relaxar assertions ou adicionar retry/skip. A inspeção runtime
também motivou a correção da apresentação civil e da propagação de fuso em views sem período.

Comandos canônicos adicionais: `npm run architecture:check`, `npm run security:secrets`,
`node scripts/check-npm-audit.mjs <backend|frontend> docs/security/npm-audit-exceptions.json`,
`node --test scripts/validate-ci.test.mjs scripts/check-npm-audit.test.mjs` e
`npm audit --json` em cada pacote. O npm audit usa toda a árvore, sem omit=dev, nova exceção,
override ou alteração de lockfile. A restrição de rede/HTTP/MySQL do sandbox exigiu execução
autorizada fora dele para esses checks.

Local CI aqui significa validator estrutural, seus testes e os gates locais listados; não é
um run remoto nem repetição da matriz de migrations em schemas vazios/legados. Não houve
mudança de schema/migration nesta entrega. Logs ficam em `/private/tmp/traceflow-fix03-*`;
não são evidência visual versionada.

## 19. Remaining limitations

Idade isolada não define STALE, conforme decisão do usuário; não há SLA de freshness novo. Lifecycle sem cobertura inicial continua inconclusivo. Sem dados locais suficientes, Health continua UNASSESSED. O relógio civil da API sem fuso é UTC; o cliente oficial envia IANA.

O ambiente local MySQL 26.7.0 não equivale à execução de CI remota em MySQL 8.4.8. Os cinco skips legados de duas suites preexistentes requerem schema anterior à recuperação LR.2; nenhum skip foi criado. Build conserva avisos preexistentes sobre ELK/IIFE e chunks grandes, sem mexer em bundling/performance nesta rodada.

## 20. Explicitly deferred GitHub connection flow

Não foi implementada criação de Project sem GitHub pela UI, CTA Conectar GitHub, seleção posterior de instalação/repositório ou endpoint de conexão. Performance, partial failure, 429, FeedbackRegion, preferências órfãs, documentação de autorização/privacidade e demais achados continuam fora desta entrega. Não houve sincronização ou escrita externa GitHub.

## 21. Final verdict

**PR23-FIX-03 METRIC SEMANTICS INTEGRITY — PASS LOCAL**

Os três achados foram corrigidos, com API persistida, regressão completa e inspeção runtime
direta. Sem screenshots, capturas, imagens ou pasta de evidência visual. Nenhum blocker desta
entrega permanece; limitações e escopo diferido estão separados acima.

Sem commit/push. Sugestão baseada no diff: `fix: align indicator semantics for github deadlines and pr rework`.
Encerrado neste fix; não iniciar PR23-FIX-04 automaticamente.
