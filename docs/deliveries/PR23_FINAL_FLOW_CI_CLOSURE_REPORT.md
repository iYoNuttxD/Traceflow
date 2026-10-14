# PR23 — Final Flow & CI check

## 1. Baseline

- Verificação em 09/10/2026; branch `daniel-dev`; HEAD local e remoto `d1fd658e22a97faac5aa2cc9a565e8ba592be7d5`.
- Working tree inicialmente limpo; `git diff --check` aprovado. Node dos checks: **22.23.3**, npm **10.9.9** (shell padrão: Node 26.10.0/npm 11.19.1).
- Escopo: diagnóstico de FLOW e uma reexecução dos jobs falhos da CI. Sem alteração de aplicação, policy, workflow ou dados; sem screenshots, commit, push ou merge.

## 2. FLOW investigation

Resposta do controller real `indicatorsController.dashboard` reproduzida por invocação direta, com os services/repositories atuais e dados reais de `localhost:3306/traceflow`. A rota HTTP autenticada não foi chamada, evitando atualização de sessão. Não houve mock dos fatos nem execução de testes contra desenvolvimento.

A conexão de diagnóstico usou pool de uma conexão, `SET SESSION TRANSACTION READ ONLY` e middleware que recusava mutações Prisma/SQL. `@@session.transaction_read_only=1`, mesmo `CONNECTION_ID()` antes/depois. Nenhum seed, migration, cleanup ou DML executado. Foram lidas **42 Tasks e 75 TaskMovements** do projeto 2.

| Corte | Valor UTC, início inclusivo/fim exclusivo |
| --- | --- |
| Solicitado | `[2026-09-09T03:00:00.000Z, 2026-10-31T03:00:00.000Z)` |
| `asOf` | `2026-10-09T23:09:13.401Z` |
| Health atual | `[2026-09-09T03:00:00.000Z, 2026-10-09T23:09:13.401Z)` |
| Health anterior | `[2026-08-09T06:50:46.599Z, 2026-09-09T03:00:00.000Z)` |

Fuso: `America/Sao_Paulo`; datas solicitadas: 09/09–30/10/2026. O fim efetivo é exatamente `asOf`; ambas as janelas têm **30 dias, 20:09:13.401**, sem sobreposição. Não há ausência artificial de eventos futuros no Health.

## 3. I20 — current/previous evidence

| Janela Health | State | Mediana em dias | Elegíveis | Excluídas | Pontos diários / com amostra |
| --- | --- | ---: | ---: | ---: | --- |
| Atual | AVAILABLE | 9 | 11 | 0 | 31 / 8 |
| Anterior | AVAILABLE | 3,5 | 18 | 0 | 31 / 13 |

Tasks atuais: **3, 22–28, 33, 34, 48**. Tasks anteriores: **2, 9–12, 17, 35–46**. Conferidos `createdAt`, primeira conclusão verificável e duração por Task; medianas recalculadas independentemente dos samples retornados.

I20 é avaliado: regressão de **157,14%**, score **0**, `BASELINE_REGRESSION`. Esse zero decorre da comparação válida; não substitui dado ausente.

## 4. I21 — current/previous evidence

| Janela Health | State | Mediana em dias | Elegíveis | Excluídas | Pontos diários / com amostra |
| --- | --- | ---: | ---: | ---: | --- |
| Atual | AVAILABLE | 1 | 11 | 0 | 31 / 8 |
| Anterior | PARTIAL | 2 | 17 | 1 | 31 / 12 |

Mesmas Tasks candidatas de I20, mas **Task 9 não é elegível para I21**:

- Criação: `2026-09-06T22:16:41.110Z`.
- Único movimento observado: **19**, `A_FAZER → CONCLUIDO`, em `2026-09-06T22:18:15.470Z`.
- Não existe entrada verificável em `EM_ANDAMENTO`; nenhuma duração foi inferida do status atual.

O mínimo de três elegíveis é atendido em todas as amostras. O impedimento concreto é **baseline anterior PARTIAL**, não quantidade insuficiente nem baseline inexistente. A policy exige ambos os estados `AVAILABLE`, valores finitos e baseline positivo, além do mínimo amostral. I21 recebe `UNASSESSED / INSUFFICIENT_BASIS`.

O DTO interno de Health publica state/value/eligibleCount/excludedCount; não publica `points`, `limitations` ou `appliedFilters` por sample. Os pontos da tabela foram obtidos do calculator compartilhado nas janelas efetivas. A exclusão corresponde à limitação pública `MISSING_FIRST_IN_PROGRESS_OR_COMPLETION`.

Na view FLOW com o período original, I20/I21 são **PARTIAL**, valores 9/1, 11 elegíveis cada, zero excluídas e 31 pontos cada. Limitações reais: `HARD_DELETED_TASK_HISTORY_NOT_RECOVERABLE`, `PERIOD_NOT_COMPLETE`, `SPRINT_FILTER_UNSAFE_NOT_APPLIED`. O período futuro deixa os widgets parciais; o Health usa sua janela recortada. Portanto, o assessment do widget não deve ser confundido com o assessment interno da dimensão.

## 5. Sprint/filter applicability

`sprintId=16` é recebido e validado, mas **não aplicado a I20/I21**. Ambos retornam `filterCompatibility={period:SUPPORTED,sprint:UNSAFE,responsible:NOT_APPLICABLE}` e `appliedFilters={period:true,sprint:false,responsible:false}`. A leitura de histórico do Health usa projeto e corte temporal, sem predicado de Sprint. A amostra é do projeto, não apenas da Sprint 16.

Autoridades conferidas: `health.policy.js`, `health.data.js`, `health.registry.js`, `health.service.js`, `flow-task.service.js`, `flow-task.repository.js`, `flow-task.calculator.js`, `dashboard-view.catalog.js` e `PROJECT_HEALTH_MODEL_V1.md`.

## 6. FLOW verdict

**FLOW HEALTH — EXPECTED DATA LIMITATION**

I20 cobre **40%** dos sinais de FLOW; I21 (peso **60%**) não pode ser avaliado com baseline parcial. A dimensão exige cobertura **≥50%**, logo retorna **coverage 40, score null, UNASSESSED**. Health geral reproduzido: **72,79**, cobertura **81,47%**, compatível com a observação.

Nenhum bug demonstrado. Para avaliar FLOW, uma janela comparável precisa ter histórico verificável suficiente e completo conforme a policy; adicionar mais Tasks não elimina automaticamente a exclusão existente. Não foi inventado ou alterado o histórico da Task 9.

Checks focados existentes: `project-health.test.js` e `health-data.test.js`, **20/20 PASS**, Node 22, unidade pura/repository mockado, sem conexão com banco e com `DATABASE_URL`/`TEST_DATABASE_URL` removidas do processo. Cobrem amostras elegíveis, exclusões, estados parciais, mínimo amostral e janelas futuras. Não foram adicionados testes redundantes nem repetidos os gates completos locais.

## 7. PR #23 current head

[PR #23](https://github.com/iYoNuttxD/Traceflow/pull/23): `daniel-dev`, HEAD **d1fd658e22a97faac5aa2cc9a565e8ba592be7d5**. [CI #135 / run 37992092592](https://github.com/iYoNuttxD/Traceflow/actions/runs/37992092592) é a execução mais recente desse HEAD.

## 8. Remote CI failure

Tentativa 1: [Backend Tests / 114028614338](https://github.com/iYoNuttxD/Traceflow/actions/runs/37992092592/job/114028614338) falhou em **Initialize containers**, antes de Checkout. `docker pull mysql:8.4.8` recebeu três vezes `toomanyrequests: You have reached your unauthenticated pull rate limit.` Checkout, migrations e testes backend foram pulados. Os quatro outros jobs passaram.

**CI FAILURE — TRANSIENT EXTERNAL INFRASTRUCTURE**

## 9. Rerun result

Executado **uma única vez**: `gh run rerun 37992092592 --failed --repo iYoNuttxD/Traceflow`. Tentativa **2**, conclusão **success**, mesmo HEAD. Nenhuma alteração de workflow, versão MySQL, secrets ou regra de testes.

| Job | Resultado remoto final |
| --- | --- |
| Backend Tests | SUCCESS — [job 114063413197](https://github.com/iYoNuttxD/Traceflow/actions/runs/37992092592/job/114063413197) |
| Frontend Tests | SUCCESS |
| Quality | SUCCESS |
| Dependency Review | SUCCESS |
| Supply Chain | SUCCESS |

Backend: 146 arquivos de teste passaram, dois arquivos foram pulados pela suíte existente; cobertura de statements **92,48%**, branches **86,68%**, functions **95,67%**, lines **94,78%**. O gate completo foi aprovado.

**CI RERUN — PASS** · **REMOTE CI — PASS**

## 10. Final verdict

**PR23 FINAL FLOW & CI CHECK — PASS**

Razão de FLOW determinada com fatos reais; policy preservada; nenhuma mutação no desenvolvimento; CI remota verde. Única alteração versionável nesta tarefa: este relatório. `git diff --check` aprovado.

Suggested commit: **N/A**. Nenhuma rodada adicional iniciada.
