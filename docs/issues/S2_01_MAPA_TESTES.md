# Mapa de testes do S2-01 — critérios, casos e suíte

Fase 1 da campanha descrita em `docs/issues/S2_01_PROMPT_TESTES_ALERTAS.md`. Liga cada caso do
catálogo (seção 3 do prompt) ao teste que já o prova ou à fase que vai criá-lo. Um caso coberto não é
reescrito: é citado.

**Base:**
- `HEAD` = `a81c93c` em 08/10/2026;
- 93 testes do S2-01 (65 no backend, 28 no frontend).

**Os cinco pontos ⚑ foram aprovados pelo João em 08/10/2026** ("pode seguir"):
1. registrar sem corrigir;
2. roteiro manual em vez de E2E;
3. GitHub real se houver repositório de teste;
4. esta campanha antes da de conformidade;
5. medir o desempenho sem reprovar.

## Instrumentação declarada

Na caixa preta, toda mutação **sob teste** passa pela API pública. Três coisas a API não oferece, e
entram por instrumentação, como nas suítes existentes:

| Instrumentação | Por quê |
|---|---|
| sessão (registro + verificação de e-mail) e `ProjectMembership` com o papel do caso | autenticar e atribuir papel não são o requisito sob teste |
| integração GitHub do projeto (`createProject` com repositório) | criar a integração exige a GitHub App real |
| commits, PRs e issues (`factories.js`), ou o sync com cliente GitHub simulado | esses dados só nascem do GitHub |

O oráculo é sempre a resposta HTTP, ou uma leitura posterior pela API. Leitura direta da tabela
`TraceabilityAlert` só entra nas Fases 3 e 4, que são caixa branca.

## Legenda

- **EXISTENTE:** coberto por teste já versionado (arquivo e título).
- **PARCIAL:** o teste existente prova parte; o resto entra na fase indicada.
- **NOVO (F*n*):** entra na fase *n* (2 = API, 3 = integração, 4 = unidade, 5 = frontend,
  7 = manual, 8 = inspeção).

Abreviações dos arquivos:
- `INT` = `test/integration/s201-traceability-alerts.test.js`;
- `API` = `test/api/s201-traceability-alerts.test.js`;
- `SYNC` = `test/api/s201-traceability-alerts-sync.test.js`;
- `POL` = `test/unit/traceability-alert.policy.test.js`;
- `SVC` = `test/unit/traceability-alert.service.test.js`;
- `PAGE` = `frontend/test/pages/TraceabilityAlertsPage.test.jsx`;
- `UNL` = `frontend/test/pages/UnlinkedTasksPage.test.jsx`;
- `VIEW` = `frontend/test/features/alert-view.test.js`.

## Bloco T — RF13

| Caso | Situação | Prova |
|---|---|---|
| AT-T-01 | PARCIAL → NOVO (F4, F2) | INT I1 e I2 cobrem duas combinações; as 24 entram em F4 e uma amostra por partição em F2 |
| AT-T-02 | PARCIAL → NOVO (F2) | INT I1 usa só a movimentação; `PATCH /tasks/:id/status` entra em F2. A criação não aceita `status` (`createTaskBodySchema` é estrito), e F2 prova a recusa |
| AT-T-03 | PARCIAL → NOVO (F2) | INT I3 e I17; a nova ocorrência depois do desvínculo pela API entra em F2 |
| AT-T-04 | PARCIAL → NOVO (F3) | INT I4 (confirmar); rejeitar sugestão entra em F3 |
| AT-T-05 | EXISTENTE | INT I5 |
| AT-T-06 | PARCIAL → NOVO (F2) | INT I6 e API "snapshot"; exclusão de alerta `DISMISSED` entra em F2 |
| AT-T-07 | PARCIAL → NOVO (F3) | POL "usa a última conclusão"; INT sem histórico; várias conclusões reais entram em F3 |
| AT-T-08 | PARCIAL → NOVO (F3) | API "detalha alerta de tarefa com PR vinculada"; vincular e desvincular PR e issue numa tarefa concluída entra em F3 |
| AT-T-09 | NOVO (F2) | hipótese H2 |
| AT-T-10 | NOVO (F8) | a troca de repositório é recusada em `github-app.service.js:402`; o caminho exige a GitHub App, e a prova é por inspeção |
| AT-T-11 | PARCIAL → NOVO (F3) | POL "trunca o título em 191". O título de tarefa já é limitado a 191 (`INPUT_LIMITS.shortText`): o truncamento só alcança títulos de PR e issue, e F3 prova com títulos do GitHub |
| AT-T-12 | NOVO (F3) | excluir o requisito só zera `requirementId` (`requirement.repository.js:108`): os alertas não mudam |

## Bloco G — RF39 e RF40

| Caso | Situação | Prova |
|---|---|---|
| AT-G-01 | PARCIAL → NOVO (F4, F3) | INT e SYNC I10 cobrem −1 ms e o instante exato da issue; +1 ms e o instante exato da PR entram em F4 e F3 |
| AT-G-02 | PARCIAL → NOVO (F4) | INT I10 |
| AT-G-03 | PARCIAL → NOVO (F3) | INT e SYNC I9 (PR fechada sem merge, PR aberta, issue aberta); issue `closed` com `closedAtGithub` nulo entra em F3 |
| AT-G-04 | PARCIAL → NOVO (F2) | INT I8 (`PULL_REQUEST_LINKED`); a nova ocorrência depois de `DELETE /tasks/:id/pull-request` entra em F2 |
| AT-G-05 | NOVO (F2) | — |
| AT-G-06 | EXISTENTE | INT I8 |
| AT-G-07 | PARCIAL → NOVO (F3) | INT "vincular e desvincular issue", INT e SYNC I11; o fechamento seguinte entra em F3 |
| AT-G-08 | NOVO (F4) | `state_reason` não existe no modelo; F4 prova que só `state` importa |
| AT-G-09 | NOVO (F3) | — |
| AT-G-10 | NOVO (F2) | — |

## Bloco E — estados e motivos

| Caso | Situação | Prova |
|---|---|---|
| AT-E-01 | EXISTENTE | INT I17; API "é idempotente" |
| AT-E-02 | PARCIAL → NOVO (F2) | API 409; INT I17 (nova linha). A ausência de herança da dispensa entra em F2 |
| AT-E-03 | NOVO (F2) | — |
| AT-E-04 | EXISTENTE (unidade) → NOVO (F3) | POL "segue a precedência TASK_DELETED…"; os pares por mutação real entram em F3 |
| AT-E-05 | EXISTENTE | POL "segue a precedência ISSUE_LINKED…" |
| AT-E-06 | NOVO (F2) | — |

## Bloco D — dispensa

| Caso | Situação | Prova |
|---|---|---|
| AT-D-01 | EXISTENTE | API "aplica a matriz de papéis…" e "exige CSRF" |
| AT-D-02 | EXISTENTE | API "valida a justificativa com trim e limites" |
| AT-D-03 | PARCIAL → NOVO (F2) | API cobre ausente; os demais tipos entram em F2 |
| AT-D-04 | NOVO (F2, F5) | hipótese H3 |
| AT-D-05 | EXISTENTE | API (campo `extra`) |
| AT-D-06 | EXISTENTE | API "é idempotente…" |
| AT-D-07 | PARCIAL → NOVO (F3) | API (auditoria); os logs entram em F3 |
| AT-D-08 | NOVO (F2) | hipótese H4 |
| AT-D-09 | NOVO (F2) | `positiveInteger` aceita qualquer sequência de dígitos (`common.schemas.js:25`): `01` vira 1, e `99999999999999999999` vira `1e20`, que passa no Zod. Provar a resposta |

## Bloco Q — consultas e RF58

| Caso | Situação | Prova |
|---|---|---|
| AT-Q-01 | PARCIAL → NOVO (F2) | API cobre status inválido, parâmetro desconhecido e o padrão `OPEN`; minúsculas e tipo inválido entram em F2 |
| AT-Q-02 | NOVO (F2) | — |
| AT-Q-03 | PARCIAL → NOVO (F2) | API cobre `limit=101` e a página além da última; `page=0`, `limit=0` e valor não numérico entram em F2 |
| AT-Q-04 | NOVO (F2) | — |
| AT-Q-05 | PARCIAL → NOVO (F3) | API percorre 25 alertas; a reconciliação entre páginas entra em F3 |
| AT-Q-06 | PARCIAL → NOVO (F2) | API "filtra por situação e tipo… resume"; `byType` zerado entra em F2 |
| AT-Q-07 | EXISTENTE | API matriz de papéis |
| AT-Q-08 | PARCIAL → NOVO (F2) | API (contexto de tarefa); PR e issue entram em F2 |
| AT-Q-09 | PARCIAL → NOVO (F2, F3) | API "sem dados internos"; `dismissal.by` depois da exclusão da conta entra em F3 |
| AT-Q-10 | PARCIAL → NOVO (F2) | API "não revela alerta de outro projeto"; a igualdade com o id inexistente entra em F2 |
| AT-Q-11 | NOVO (F2) | — |
| AT-Q-12 | EXISTENTE | API RF58 |
| AT-Q-13 | PARCIAL → NOVO (F2) | API RF58 (filtro e paginação); ordem e outro projeto entram em F2 |
| AT-Q-14 | NOVO (F8, F7) | hipótese H9 |

## Bloco R — reprocessamento e script

| Caso | Situação | Prova |
|---|---|---|
| AT-R-01 | EXISTENTE | API "reprocessar duas vezes não duplica…" |
| AT-R-02 | NOVO (F2) | — |
| AT-R-03 | PARCIAL → NOVO (F2) | API matriz; as variantes de caminho entram em F2 |
| AT-R-04 | NOVO (F2) | app isolado com `rateLimitMax` próprio |
| AT-R-05 | EXISTENTE | API "registra auditoria com contagens" |
| AT-R-06 | PARCIAL → NOVO (F3) | INT I20 (dry-run) e o parser no teste de script; a guarda de produção entra em F3 |

## Bloco S — fim do sync

| Caso | Situação | Prova |
|---|---|---|
| AT-S-01 | EXISTENTE | `github-sync-run.alerts.test.js` (sucesso e falha); SYNC I9 |
| AT-S-02 | PARCIAL → NOVO (F3) | SVC I13; o conteúdo do log de falha entra em F3 |
| AT-S-03 | NOVO (F2) | hipótese H5 |
| AT-S-04 | EXISTENTE | INT "projeto excluído durante o sync" |
| AT-S-05 | EXISTENTE | SYNC I9 (segundo sync) |

## Bloco C — concorrência

| Caso | Situação | Prova |
|---|---|---|
| AT-C-01 | PARCIAL → NOVO (F3) | INT "cinco reprocessamentos simultâneos" (repositório); 10 requisições HTTP entram em F3 |
| AT-C-02 | PARCIAL → NOVO (F3) | INT I14 e I15; com o fim do sync, entra em F3 |
| AT-C-03 | NOVO (F3) | — |
| AT-C-04 | NOVO (F3) | — |
| AT-C-05 | NOVO (F3) | — |
| AT-C-06 | PARCIAL → NOVO (F3) | POL "ordena candidatos…" |

## Bloco V — ciclo de vida

| Caso | Situação | Prova |
|---|---|---|
| AT-V-01 | NOVO (F3) | — |
| AT-V-02 | EXISTENTE | INT I19 |
| AT-V-03 | NOVO (F3) | — |
| AT-V-04 | PARCIAL → NOVO (F2) | SVC "revalida o papel no serviço"; o rebaixamento real entra em F2 |

## Bloco U — interface

| Caso | Situação | Prova |
|---|---|---|
| AT-U-01 | EXISTENTE | PAGE F1 e F13 |
| AT-U-02 | PARCIAL → NOVO (F5) | PAGE F1 e F15; vazio por filtro, 429 e página de acesso negado entram em F5 |
| AT-U-03 | EXISTENTE (UI) + API | PAGE F6 e F7; a recusa do backend em API AT-D-01 |
| AT-U-04 | PARCIAL → NOVO (F5) | PAGE F2, F12 e F16; contexto de PR e issue, sujeito indisponível, `Esc` e fuso entram em F5 |
| AT-U-05 | PARCIAL → NOVO (F5) | PAGE F8 e VIEW "valida a justificativa…"; os emojis entram em F5 |
| AT-U-06 | EXISTENTE | PAGE F10 e F11 |
| AT-U-07 | EXISTENTE | PAGE "alerta de tarefa leva ao Kanban" |
| AT-U-08 | EXISTENTE | UNL (4 testes) |
| AT-U-09 | NOVO (F5) | — |
| AT-U-10 | NOVO (F7) | manual |

## Blocos X, A, M e O

- **Bloco X:** cada linha aponta para os casos acima. As linhas sem caso próprio entram assim:
  - V4.1.1 e V14.3.2: headers das seis rotas, em F2;
  - V14.2.1: inspeção da query, em F8;
  - V16.4.1: injeção em log, em F3;
  - V15.1.3 e V15.2.2: medição de custo, em F3.
- **Blocos A, M e O:** F8, por inspeção, com saída de comando quando houver.

## Classificação das versões do cartão (seção 0.2 do prompt)

| Ponto | Classe | Motivo |
|---|---|---|
| Dependência "Sprint 1" × "Sprint 1 concluída" | **DX** | o Kanban relaxa a dependência do roadmap, e o S2-01 começou com a Sprint 1 aberta em homologação (S1-04) e em revalidação (S1-09) |
| Critério 3: "artefatos técnicos" × "commit, PR ou issue" | DE | equivalentes pela definição do documento de dados; a ambiguidade com o motor de situações fica no AT-Q-14 |
| Critério 5: "conforme regra" × "conforme regra documentada" | DE | a regra está documentada (`TRACEABILITY_ALERTS.md`) |
| Checklist 5 sem "detecção" no Kanban | DE | o checklist do roadmap prevalece e é o testado |
| Estado: Kanban `[ ]` "Em andamento" × roadmap do repositório `[x]` | DE | o quadro é do João; a campanha entrega o veredito por critério |
