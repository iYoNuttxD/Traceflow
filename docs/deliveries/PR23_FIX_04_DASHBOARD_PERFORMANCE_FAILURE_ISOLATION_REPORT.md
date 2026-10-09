# PR23-FIX-04 — Dashboard Performance & Failure Isolation

> **Retificação e encerramento do incidente:** a execução inicial do novo teste API apagou
> indevidamente dados de `traceflow`; os gates daquela execução não fundamentam este PASS.
> As 10.651 linhas foram recuperadas e verificadas. Depois das proteções adicionais, todos os
> gates abaixo foram **reexecutados** com credencial exclusiva de um novo schema de testes,
> sem acesso ao desenvolvimento. Os dumps de `traceflow` antes/depois desta revalidação são
> idênticos. O histórico permanece no [relatório do incidente](PR23_FIX_04_DATABASE_RECOVERY_INCIDENT_REPORT.md).

## 1. Baseline

- Data: 06/10/2026; checkout `/Users/daniel/Coding/Traceflow`.
- Branch: `daniel-dev`.
- HEAD: `409c76ad4fcbf0eb3c0f0acb524038d444ef3d03`.
- Working tree inicial: limpo; `git diff --check` e `git diff --stat` sem saída.
- Runtime inicialmente selecionado: Node 26.9.0 / npm 11.19.1.
- Runtime de execução/gates: **Node 22.23.3 / npm 10.9.9**.
- Nenhum commit, push, merge, rebase, reset, clean ou stash executado.
- Retomada final no mesmo HEAD/branch, com alterações FIX-04 e proteções do incidente já no
  working tree; foram preservadas. `git diff --check` passou antes e depois da conclusão.

## 2. Review findings addressed

1. Materialização repetida de Tasks/TaskMovement e projeção de Requirements entre widgets e
   Health; sources completos usados para produzir poucos indicadores; concorrência de transações.
2. Tratamento parcial restrito a `ExternalServiceError`, incapaz de isolar falhas Prisma
   transitórias reais, inclusive no read path do Health.

A correção não altera fórmulas, catálogo/formatação de cálculo, pesos/thresholds de Health,
RFs, histórico de Sprint, I28, I04 ou a policy GitHub NOT_CONFIGURED/STALE.

## 3. Dependency map

| View/consumer | IDs solicitados | Service/capability | Persistência necessária |
| --- | --- | --- | --- |
| GENERAL | I01, I23, I28, I61, I66, I53, I45, I46 | progress, task current, traceability, defect states, sprint | agregados Tasks, projeção Requirements, Defects, fatos Sprint |
| PLANNING | I26, I28–I34 | task current | agregados Tasks e listas limitadas; sem movimentos |
| TASK | I26–I35 | task current | agregados Tasks e listas limitadas; sem movimentos |
| FLOW | I20–I25 | task history + I23 current | Tasks mínimas, TaskMovement, agregado WIP |
| GITHUB | I02, I04, I06, I09–I18, I73/I74 | activity, GitHub analytics | commits/branch, PR lifecycle, PRs, Issues conforme IDs |
| SPRINT | I36–I47, I71/I72 | Sprint analytics | fatos canônicos selecionados; Sprints concluídas somente para I47 |
| QUALITY | I06, I48–I60 | GitHub, quality, requirement concentration | agregados de execuções/Defects/retests; projeção só para I59 |
| TRACEABILITY | I61–I67 | requirement projection | Requirements e evidências/projeção canônica |
| CUSTOM | IDs validados da seleção | união das capabilities solicitadas | mesmas fontes, sem calcular GENERAL inteira |
| Overview Health | sinais aplicáveis do modelo v1 | `GENERAL&healthOnly=true` | apenas dependências de Health; não produz widgets |

Health instantâneo requer progresso/denominadores, I26/I28/I29/I30, sinais de Sprint aplicável
e I61–I66 aplicáveis. Health temporal mantém I20/I21 nas janelas atual/anterior,
I49/I52/I58 e sinais GitHub I04/I10/I15/I73 quando a integração é aplicável. Os pesos e regras
continuam no registry/policy existentes. `includeProjectHealth=true` acrescenta essas dependências,
não todas as seções da GENERAL.

## 4. Previous read model

Na fixture de volume, TASK/FLOW/PLANNING/CUSTOM com Health materializavam duas vezes
5.000 Tasks e 20.000 movimentos por request. CUSTOM também materializava duas vezes os 100
Requirements da projeção. GENERAL já evitava a duplicação de histórico nessa configuração,
mas abria até cinco callbacks de transação simultâneos e obtinha dados de widgets desnecessários
para consumidores que queriam somente Health.

O custo foi medido como **operações Prisma dentro de transações interativas**, linhas retornadas
por `findMany`, transações e pico de callbacks ativos. Não é contagem de SQL: autenticação/contexto
fora dessas transações, BEGIN/COMMIT e detalhes SQL internos de relações não entram no contador.

## 5. Selective execution strategy

`dashboard-read.plan.js` deriva grupos dos IDs de cada view/seleção e dos sinais aplicáveis.
Remove dependências de widgets temporais sem período e GitHub exclusivo não configurado.
Task current e task history são capabilities distintas. I24 continua precisando de histórico,
mesmo sendo um indicador atual; I23/I28 não passam a carregar movimentos por isso.

Flow calcula somente as séries/listas solicitadas; preserva os samples canônicos de primeira
conclusão para reutilização pelo Health. Task current mantém somas/agregados em SQL e carrega
somente as listas públicas necessárias. Activity separa histórico de conclusão de Tasks de
atividade de commits. Quality, GitHub e Sprint selecionam grupos coesos de fatos por IDs.
Indicadores não solicitados não são publicados com zeros das estruturas internas neutras.

## 6. Request-scoped deduplication

`indicator-read-context.js` é criado por invocação do aggregate. A primeira leitura cria uma
Promise; os demais consumidores recebem a mesma Promise, resultado ou rejeição. Uma request nova
faz novas leituras. Não há cache global, invalidação persistente ou retries automáticos.

Chaves de leitura incluem task current/history, projection e cortes de Quality. Cálculos Flow
equivalentes compartilham o resultado pelo intervalo; o projeto, fuso e asOf pertencem ao contexto
fixo da request. O snapshot GitHub da view pode fornecer coorte/merge samples de período equivalente
e idade atual ao Health. Janelas diferentes não reutilizam fatos temporais incorretamente.

QUALITY sem período agora carrega somente seus fatos atuais, sem consultar execuções/retests
numa janela de fallback que seria descartada. Health usa sua janela canônica. I52, que é atual,
reutiliza a mesma Promise de fatos mesmo quando os cortes temporais diferem; a união de IDs
periódicos só acontece quando os limites são iguais. Uma operação Prisma de Case Health por
request foi confirmada por teste de API sem período, com término futuro truncado e com período
inteiramente futuro. Não houve mudança de janela, fórmula ou coverage do modelo.

## 7. Project Health optimization

O caminho de Health compartilha o agregado Tasks, histórico e projeção já obtidos pela view.
Seleciona apenas os fatos Quality realmente usados pelo modelo. Ausência de GitHub evita fontes
exclusivas dessa integração. Seleção de Sprint terminal não força dependências atuais inaplicáveis.

A Visão Geral passou a pedir `healthOnly=true` no endpoint existente. Não muda markup, layout,
identidade da request, AbortController ou regra de refresh. O payload conserva `projectHealth`
completo, pois simplificar seu contrato não é necessário para eliminar os widgets descartados.
Na comparação controlada, o payload caiu de **28.180 para 18.532 bytes** (aproximadamente 34%).
Score/cobertura/dimensões permaneceram equivalentes à GENERAL. `viewState:NO_DATA` refere-se
às seções vazias deste modo, não ao Health.

O Indicators workspace mantém `includeProjectHealth:true`: seu Summary usa Health em todas as
categorias. Não existe request GENERAL adicional nesse workspace para obter o mesmo badge.

## 8. Requirement projection reuse

I59 foi separado da leitura de execuções/Defects. Quality/I59 e Traceability/Health usam a mesma
Promise de `readIndicatorSummary` e o mesmo cálculo de coverage dentro da request. CUSTOM passou
de 200 para 100 linhas de Requirements materializadas. Uma falha da projeção degrada seus
consumidores, mas preserva Pass Rate e contagem de Defects independentes.

Qualidade/I06 e Health/I04 também reutilizam a coorte de PRs encerradas quando os cortes são
iguais. O teste de API conta invocações reais da operação Prisma que lê essa coorte: uma leitura
no período equivalente, duas quando a janela solicitada futura e a janela truncada de Health
são diferentes. Não se trata de afirmar uma contagem total de SQL.

## 9. Transaction/concurrency changes

No máximo **dois loaders** de fonte ficam ativos por aggregate. Isso reduziu o pico local por
request de cinco para dois callbacks de transação, sem biblioteca adicional. Com cinco requests
simultâneas, o pico observado caiu de 19 para 10; o limite é por request, não um semáforo global
do pool.

Tasks + TaskMovement permanecem no mesmo `RepeatableRead` para a projeção histórica. Cada
capability conserva seu snapshot consistente; não se promete um snapshot SQL único entre
fontes independentes. Ao reutilizar fatos, os consumidores compartilham o snapshot da capability
original. Current summary não precisa materializar o histórico para manter sua consistência.

`maxWait:2000` e timeouts existentes foram explicitados: 5.000 ms nos paths leves que usavam
o default, 30.000 ms onde esse limite já existia. Nenhum timeout foi aumentado para encobrir custo.

## 10. Index audit

TaskMovement possui índices em `movedAt`, `(projectId,movedAt)` e `(taskId,movedAt)`, além dos
índices de autoria/responsável. A leitura histórica usa `projectId`, `movedAt < asOf` e ordenação
por `taskId,movedAt,id`. O EXPLAIN local na fixture de 20.000 movimentos escolheu scan/filter/sort.
Os índices atuais não garantem eliminação desse sort.

O candidato `(projectId,taskId,movedAt)` foi registrado: pode favorecer ordenação, mas tem
trade-off com o range de tempo e custo de escrita. Não houve comparação física suficiente
demonstrando benefício que justificasse adicioná-lo nesta rodada. A eliminação de leituras
duplicadas resolveu o custo comprovado e o ensaio terminou sem timeout. Não foi usado FORCE INDEX.

## 11. Migration, if any

**No migration required.** Schema e migrations não mudaram. Prisma validate/generate passaram;
as suítes API/integration aplicaram as 63 migrations existentes no novo schema inicialmente
vazio, e `db:test:status` confirmou a cadeia atualizada. Nenhuma migration foi criada ou editada.
Validação de uma migration incremental em banco limpo/atualizado não se aplica.

## 12. Transient error classification

O classifier central exige erro Prisma real, não um objeto com propriedade `code`:

| Erro | Policy |
| --- | --- |
| P2024 — aquisição/pool timeout | isolável |
| P2034 — conflito de escrita/deadlock | isolável, sem retry genérico |
| P2028 — aquisição, expiração ou timeout da transação | isolável |
| P2028 — transaction ID inválido/API misuse | não isolável |
| ExternalServiceError operacional | isolável |
| ValidationError, DomainError, TypeError, erro desconhecido, P2002 | não isolável |

P2028 é uma família ampla de erros de Transaction API no
[código oficial Prisma 6.12](https://github.com/prisma/prisma-engines/blob/6.12.0/libs/user-facing-errors/src/query_engine/mod.rs).
Converter qualquer P2028 em indisponibilidade esconderia uso inválido da API. O subset aceito
é coberto por testes de aquisição/expiração; nenhum novo Data State foi criado.

## 13. Partial source degradation

Fontes classificadas retornam placeholders `UNAVAILABLE`, `value:null`,
`SOURCE_UNAVAILABLE`. Warnings são deduplicados pela origem da leitura, inclusive quando view
e Health recebem a mesma rejeição. Logs internos incluem source, errorCode e requestId;
detalhes Prisma/SQL não entram no payload público.

API real GENERAL/TASK/FLOW/CUSTOM foi exercitada com P2024 injetado na capability histórica.
HTTP permanece 200; os widgets dependentes ficam indisponíveis; current summary, GitHub e
outras fontes independentes permanecem. Rejeições compartilhadas não provocam nova tentativa.

## 14. Non-transient error behavior

Dados inválidos causando TypeError no calculator continuam produzindo HTTP 500 nas quatro
views testadas. Erros de domínio/validação e erros desconhecidos não viram SOURCE_UNAVAILABLE.
Os catch paths tratam somente falhas isoláveis; bugs de cálculo permanecem observáveis.

## 15. Health failure isolation

Falha de task history deixa FLOW sem score e com coverage zero, sem transformá-lo em CRITICAL
ou atribuir zero ao seu desempenho. O total é recalculado pela policy vigente. Quality/GitHub
compartilham a mesma falha de snapshot com Health sem retry e sem derrubar fontes locais.
P2028 de expiração e P2034 também foram injetados no caminho de Health com resposta HTTP válida.
Se somente a leitura temporal de Quality falhar, I52 já conhecido continua disponível para a
avaliação; a falha não sobrescreve o estado atual independente dos Casos de teste.

## 16. Focused tests

- Plano de dependências por IDs/período/applicability; current paths sem TaskMovement.
- Promise/calculation dedupe, rejeição retida, contexto novo e concorrência limitada a dois.
- Classifier Prisma/erros funcionais e P2028 de API misuse.
- API GENERAL/TASK/FLOW/CUSTOM: sucesso, fonte transitória e TypeError funcional.
- Quality/projection independentes; coorte GitHub compartilhada somente com cortes iguais.
- Quality/I52 reutilizado com períodos diferentes; nenhuma consulta temporal descartada na
  janela de fallback; falha temporal preserva I52 conhecido; alias retém a mesma rejeição.
- Datasource de teste fixado na construção; conexão efetiva validada na transação da limpeza;
  benchmark recusa execução sem `--apply`, IDs inválidos ou fixtures de outra invocação.
- Equivalência de Health-only e rejeição desse modo em view diferente de GENERAL.
- Flow seletivo mantém duração/trend canônicos; endpoints completos preservam defaults.
- Frontend: ProjectHealthSummary usa o modo leve e conserva guards de contexto/refresh.

Os números finais das suítes estão registrados na seção 23.

## 17. Full tests

Foram executadas as suítes completas, coverage, lint e format dos dois projetos com Node 22,
além de build frontend. A cobertura backend inclui unit, integration e API; os cinco skips
legados não foram criados/modificados para esta entrega. Os thresholds canônicos não mudaram.

## 18. Volume dataset

Script dedicado: `backend/scripts/benchmark-indicators.js`. Não integra o seed normal.

| Entidade artificial | Quantidade |
| --- | ---: |
| Tasks | 5.000 |
| TaskMovements | 20.000 |
| Requirements | 100 |
| Pull Requests | 200 |
| Commits | 100 |
| Issues | 100 |

Movimentos incluem conclusão, reabertura/reconclusão e WIP. Estimativa/realizado ausentes
continuam ausentes. Artefatos GitHub são fixtures declaradamente artificiais; não há sync ou
escrita externa. A fixture de volume não cria Sprints nem uma amostra Quality grande: mede
principalmente materialização Tasks/histórico/projeção e fontes GitHub moderadas. A integridade
dos fatos Sprint/Quality permanece coberta pelas suítes de domínio/API existentes.

Safety: rejeita produção e Node diferente de 22; exige `--apply` antes de conectar,
TEST_DATABASE_URL de teste em host local, e confirma DATABASE()/read_only antes de escrever.
Nesta revalidação o alvo foi `127.0.0.1:3306/traceflow_pr23_fix04_test_20261006`,
NODE_ENV=test, read_only=0. Foi usado um usuário MySQL novo com permissão **somente** nesse
schema. A recusa real de leitura de `traceflow.Project` foi comprovada antes e depois dos gates.
Os processos de teste receberam essa credencial restrita; o DATABASE_URL implícito apontava
para um schema inexistente, nunca para desenvolvimento.

O benchmark cria Project/usuário próprios por UUID. A limpeza valida schema real e ownership
na mesma transação antes de remover somente essas fixtures; sem reset/truncate global.
Autenticação HTTP é real, com sessão artificial local; cookies/segredos não são impressos.
Os dois ensaios terminaram com exit code zero, incluindo a limpeza. O seed normal não mudou.

O dump de desenvolvimento obtido antes/depois desta rodada final foi **byte-for-byte idêntico**:
SHA-256 `7ccad6b521ca32d6ea6ee34ad82b4ce53c427d42b215022869427ec510db901e`.
Backups, credencial restrita e logs ficam privados em
`backend/.local/pr23-fix04-final-validation/`, ignorado pelo Git; não são evidência visual.
Isso comprova preservação nesta reexecução, sem apagar o incidente da tentativa anterior.

Reexecução, em `backend`, com TEST_DATABASE_URL local configurado com credencial exclusiva de testes, sem acesso ao
banco de desenvolvimento, e migrations aplicadas:

```bash
env PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/benchmark-indicators.js /tmp/indicators-performance.json --health-only --apply
```

Relógio de domínio fixado em `2026-10-06T20:00:00Z`; wall-clock usa performance.now. A baseline
foi executada com o código de HEAD 409c76a extraído para diretório temporário, usando o mesmo
script, dependências finais instaladas, fixture e relógio. O override de source root permite
essa comparação sem trocar branch ou modificar o histórico Git.

## 19. Performance before/after

Ensaio HTTP local controlado. TASK/FLOW/PLANNING incluem Health; TASK_ONLY não inclui.
CUSTOM usa a seleção padrão I01/I23/I49/I66/I21/I28. Cada número de tempo é uma observação
local, não p95, SLO ou benchmark de produção.

| View | ms antes → depois | Operações Prisma instrumentadas | Transações | Tasks materializadas | Movimentos materializados |
| --- | ---: | ---: | ---: | ---: | ---: |
| GENERAL | 155 → 126 | 25 → 24 | 8 → 7 | 5.000 → 5.000 | 20.000 → 20.000 |
| TASK + Health | 281 → 103 | 29 → 24 | 8 → 6 | 10.000 → 5.000 | 40.000 → 20.000 |
| TASK_ONLY | 175 → 31 | 8 → 6 | 1 → 1 | 5.000 → 0 | 20.000 → 0 |
| FLOW + Health | 279 → 212 | 29 → 22 | 8 → 6 | 10.000 → 5.000 | 40.000 → 20.000 |
| PLANNING + Health | 267 → 83 | 29 → 23 | 8 → 6 | 10.000 → 5.000 | 40.000 → 20.000 |
| CUSTOM | 272 → 121 | 37 → 22 | 7 → 6 | 10.000 → 5.000 | 40.000 → 20.000 |
| Overview | 102 → 79 | 25 → 22 | 8 → 6 | 5.000 → 5.000 | 20.000 → 20.000 |

Os valores, Data States, numeradores/denominadores e séries dos widgets comparáveis permaneceram
iguais. Score **87,9** e coverage **80,88%** de Health foram preservados. IDs de
entidades das fixtures variam entre execuções; não se afirma igualdade byte-for-byte das listas
com esses IDs. Payloads das views normais mantiveram o tamanho; Overview remove somente widgets.

A última execução usa todo o working tree final. As observações locais da tabela foram menores
após a mudança, mas uma observação por view não prova distribuição de latência nem efeito em
produção. Não há threshold de tempo inventado nem promessa de redução uniforme em outros cenários.
A evidência determinística é a redução de trabalho/volume e a ausência de falhas neste cenário.
Economias adicionais de activity/coorte, não solicitadas nessa seleção, são comprovadas por
testes e não atribuídas artificialmente aos tempos da tabela.

## 20. Concurrent request validation

Cinco requests FLOW + Health simultâneas, por HTTP real:

| Medida | Antes | Depois |
| --- | ---: | ---: |
| HTTP 200 / falhas | 5 / 0 | 5 / 0 |
| Tempos locais (ms) | 790, 792, 791, 790, 790 | 647, 640, 645, 646, 646 |
| Operações Prisma instrumentadas | 145 | 110 |
| Transações | 40 | 30 |
| Pico de callbacks de transação | 19 | 10 |
| Tasks materializadas | 50.000 | 25.000 |
| TaskMovements materializados | 200.000 | 100.000 |

Os tempos concorrentes foram menores nesta amostra local; isso não estabelece um benchmark
de produção nem distribuição de latência.
Sem P2024/P2028/P2034, deadlock ou HTTP 500 observado no ensaio. O script contabiliza os três
códigos em rejeições de transações e retorna exit code não zero se encontrar falha, sem retry.
Falhas Prisma foram
testadas separadamente por injeção na API; não se afirma que um outage real do pool foi induzido.
Não houve retry para alcançar o resultado.

## 21. Remaining scale limitations

- Histórico Flow/Health permanece O(Tasks + TaskMovements) em memória; carrega fatos anteriores
  ao asOf para respeitar primeira conclusão, reabertura e estado atual. Não foi truncado por período.
- Projeção de Requirements continua O(n) e os reads são set-based; não há query por Task/dia/evento.
- Agregados SQL ainda dependem do volume/índices do banco. Current summary é leve em materialização,
  não uma operação de custo constante no servidor SQL.
- Janelas atuais/anteriores diferentes exigem cálculos e leituras próprias; não são duplicação
  semântica. GitHub só reutiliza coorte/merge quando os cortes correspondem e idade no mesmo asOf.
- Dois loaders por request não limitam globalmente todas as requests do processo/pool.
- O índice candidato não foi criado; sort histórico segue sendo um limite conhecido.
- O ensaio é determinístico no dataset/relógio, não no tempo do sistema operacional.
- Não se declara escalabilidade ilimitada nem revisão visual de layout nesta rodada backend.

## 22. Documentation changes

- API_CONTRACTS: seleção de fontes, request-owned reuse, falhas parciais/Health e healthOnly.
- Este relatório: mapa, instrumentation, safety, comparação e limites.
- DEPENDENCY_RISK_REGISTER: patches transitivos necessários para o gate de segurança corrente.
- README/runbook de banco: datasource explícito, conferência da conexão/ownership e credencial
  de testes sem acesso a desenvolvimento; relatório do incidente preservado e atualizado.
- Sem alterações de Design System, fórmulas, Health Model ou logs/evidências visuais.

## 23. Full gates

| Gate com Node 22 | Resultado |
| --- | --- |
| Backend focused reads/Health/Flow/Quality/API e proteções | 10 suites / 119 testes PASS; caso adicional de período futuro coberto no full |
| Frontend focused Summary/DashboardPanel/PersonalizedDashboard | 3 suites / 87 testes PASS |
| Backend full `npm test` | 144 suites PASS, 2 suites com skips legados; 1.683 testes PASS / 5 skips |
| Backend full coverage | PASS; statements 92,42%, branches 86,61%, functions 95,59%, lines 94,72%; 1.683 testes / 5 skips |
| Backend lint / format:check | PASS |
| Frontend full `npm test` | 116 suites / 1.409 testes PASS |
| Frontend full coverage | PASS; statements 85,84%, branches 80,42%, functions 81,68%, lines 88,32% |
| Frontend lint / format:check / build | PASS |
| Prisma validate / generate 6.12.0 / migration status | PASS; 63 migrations existentes aplicadas no schema isolado |
| Architecture check | PASS, nenhuma violação |
| Local CI validation | validateRepositoryCi=true; 83 testes de workflow/audit policy PASS |
| Security secrets | PASS, 615 arquivos verificados pelo gate canônico |
| Canonical security gate / npm audit completo | PASS nos dois projetos; 0 vulnerabilidades, 0 exceções |
| API de volume / cinco requests concorrentes | PASS, HTTP 200 e zero P2024/P2028/P2034 |
| Proteção de desenvolvimento | Acesso negado à credencial de testes; dumps antes/depois idênticos |
| git diff --check | PASS |

Build mantém o aviso preexistente de chunk grande do ELK; não houve alteração desse módulo.
"Local CI" registra a validação da configuração e a execução local dos gates acima; não é
uma declaração de execução/aprovação de GitHub Actions ou benchmark de produção. Nenhuma
captura ou pasta de evidência visual foi gerada/exigida.

Dois novos advisories encontrados no audit durante a rodada foram fechados para cumprir o gate:
`proxy-addr` 2.0.7 → 2.0.8 no backend
([GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)) e
`source-map-js` 1.2.1 → 1.2.2 nos dois projetos
([GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)).
Lockfiles mudaram somente nesses nós/metadata do patch. Sem alterações de manifest, override,
downgrade, exceção ou omissão de devDependencies. Audit bruto completo e gate canônico retornaram
zero vulnerabilidades; a regressão foi executada com os patches instalados.

## 24. Final verdict

**PR23-FIX-04 DASHBOARD PERFORMANCE & FAILURE ISOLATION — PASS LOCAL**

Leituras seletivas, deduplicação view/Health e isolamento de falhas transitórias foram validados
com API real e regressão completa. A pendência QUALITY foi concluída e testada. Os gates usados
neste veredito foram reexecutados após o reforço de proteção, com credencial isolada; desenvolvimento
permaneceu idêntico ao backup anterior à revalidação. O incidente anterior continua registrado.
Sem nova migration, alteração de fórmulas/pesos/thresholds, screenshots, commit ou push.
Não iniciar PR23-FIX-05.
