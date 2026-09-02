# Catálogo de casos — campanha de caixa preta RF08, RF10 e RF35

> Fase 1 de [RF08_RF10_RF35_PROMPT_CAIXA_PRETA.md](RF08_RF10_RF35_PROMPT_CAIXA_PRETA.md),
> executada em 31/08/2026 sobre a branch `joao-dev-v2`. Casos projetados **somente** das fontes da
> seção 0.1 do enunciado (Cap. 3 do TCC; critérios A1–A6 do S1-04; ADRs 011 > 010 > 009 como
> regras publicadas; `API_CONTRACTS.md` §"S1-04", §"Tasks, vínculos e Kanban", §"Projects";
> `AUTHORIZATION_MATRIX.md`), sem consulta a código de produção.
>
> **Instrumentação declarada (exceções da regra 2/3):** identidade — usuários e sessões criados
> pela API real (`POST /api/auth/register`, cookie + CSRF da resposta); a **membership com papel**
> (VIEWER) é criada por `prisma.projectMembership.create`, o mesmo padrão da suíte de autorização
> da casa — papéis são RF24–RF26, fora do escopo desta campanha. Nenhuma outra escrita de banco;
> nenhuma leitura de banco como oráculo.
>
> Nível **API** = `backend/test/api/rf08-rf10-rf35-caixa-preta.test.js`. Nível **UI** = roteiro da
> seção 3, no ambiente completo do João (aguardando aval). `Veredito` ∈ {APROVADO, ACHADO,
> PENDENTE}.

## 1. Casos de API

### 1.1 TE — máquina de estados da sprint (RF10)

| ID | Cenário | Esperado (fonte) | Resultado | Veredito |
|---|---|---|---|---|
| CP-TE-01 | PLANEJADA → EM_ANDAMENTO | 200, sprint EM_ANDAMENTO (contrato §máquina) | | |
| CP-TE-02 | iniciar 2ª sprint com outra ativa (janelas disjuntas) | 409 `SPRINT_ALREADY_ACTIVE` (ADR-011 D06) | | |
| CP-TE-03 | PLANEJADA → CONCLUIDA | 409 `SPRINT_INVALID_TRANSITION` | | |
| CP-TE-04 | PLANEJADA → CANCELADA | 200 | | |
| CP-TE-05 | EM_ANDAMENTO → CONCLUIDA com 3 tarefas (1 concluída) | 200, `returnedToBacklog: 2`; quadro mostra as 2 sem sprint e a concluída com a sprint (ADR-011 D07) | | |
| CP-TE-06 | EM_ANDAMENTO → CANCELADA | 200 (mesmo tratamento de devolução) | | |
| CP-TE-07 | EM_ANDAMENTO → PLANEJADA | 409 `SPRINT_INVALID_TRANSITION` | | |
| CP-TE-08 | CONCLUIDA → EM_ANDAMENTO e `PUT` de edição | 409 transição inválida; 409 `SPRINT_LOCKED` na edição (ADR-010 D04) | | |
| CP-TE-09 | CANCELADA → EM_ANDAMENTO | 409 `SPRINT_INVALID_TRANSITION` | | |
| CP-TE-10 | `DELETE /sprints/:id` | 405 `SPRINT_DELETE_NOT_SUPPORTED` | | |
| CP-TE-11 | concluir a única sprint do marco | 200 com `milestoneCompleted {id, status}`; `GET` do marco = CONCLUIDO (ADR-011 D05) | | |
| CP-TE-30* | marco: PENDENTE → CONCLUIDO → PENDENTE manual | 200 nos dois sentidos (conclusão manual convive; reabertura garantida) | | |

### 1.2 TD — mover tarefa no quadro (RF08)

| ID | C1 existe | C2 status válido | C3 destino difere | C4 não congelada | Esperado | Resultado | Veredito |
|---|---|---|---|---|---|---|---|
| CP-TD-01 | N | – | – | – | 404 | | |
| CP-TD-02 | S | N | – | – | 400 com os status permitidos | | |
| CP-TD-03 | S | S | S ou N | N | 409 `TASK_SPRINT_LOCKED` nos dois casos (congelada vence mesma-coluna); quadro intacto no `GET` | | |
| CP-TD-04 | S | S | N | S | 400 "já está nesta coluna" | | |
| CP-TD-05 | S | S | S | S | 200; `GET` do quadro com a tarefa na coluna nova e totais ajustados | | |
| CP-TD-06 | 6 transições válidas de status, todas as direções | | | | 200 em todas; quadro coerente ao final | | |
| CP-TD-28* | `PATCH /tasks/:id/status` (caminho irmão) em congelada | | | N | 409 `TASK_SPRINT_LOCKED` (delega à transição canônica) | | |

### 1.3 PE/VL — cadastro e janelas do cronograma (RF10)

| ID | Cenário | Esperado (fonte: contrato §Sprints/§Marcos/§Associação/§Cronograma) | Resultado | Veredito |
|---|---|---|---|---|
| CP-PE-01 | criar sprint sem `milestoneId` | 400 `SPRINT_MILESTONE_REQUIRED` | | |
| CP-PE-02 | marco de outro projeto (ator vê os dois) | 400 `SPRINT_MILESTONE_PROJECT_MISMATCH` | | |
| CP-PE-03 | nome de sprint repetido no projeto | 409 `SPRINT_NAME_IN_USE` | | |
| CP-PE-04 | mesmo nome em outro projeto | 201 (unicidade por projeto) | | |
| CP-VL-05 | `startDate == endDate` | 400 `SPRINT_DATE_RANGE_INVALID` | | |
| CP-VL-06 | sprint de 1 dia | 201 | | |
| CP-VL-07 | B começa no instante exato do fim de A | 201 (janela semiaberta) | | |
| CP-VL-08 | B sobrepõe A em 1 dia | 409 `SPRINT_OVERLAP` | | |
| CP-VL-09 | sobreposição com sprint CANCELADA | 201 (cancelada libera datas) | | |
| CP-PE-10 | marco com prazo fora de qualquer janela; e `PUT` para outro prazo livre | 201/200 (prazo livre — ADR-011 D03) | | |
| CP-PE-11 | `DELETE` de marco com sprint apontando | 409 `MILESTONE_HAS_SPRINTS` | | |
| CP-PE-12 | `DELETE` de marco sem sprints | 200; `GET` seguinte 404 `MILESTONE_NOT_FOUND` | | |
| CP-VL-13 | substituição com exatamente 100 tarefas | 200, `total: 100` | | |
| CP-VL-14 | substituição com 101 | 409 `SPRINT_TASK_LIMIT_REACHED`; composição anterior intacta no `GET` | | |
| CP-PE-15 | associar tarefa de outro projeto | 400 `TASK_SPRINT_PROJECT_MISMATCH` | | |
| CP-PE-16 | associar tarefa a sprint CONCLUIDA | 409 `SPRINT_SCOPE_LOCKED` | | |
| CP-VL-17 | `schedule?from/to` com deadlines no dia `to` e no seguinte | a do dia `to` entra em `unassignedTasks` (inclusivo em UTC); a do dia seguinte não; `range.to` ecoa o pedido | | |
| CP-VL-29* | tarefa sem sprint e sem deadline | aparece no agregado sem filtro; some com filtro | | |

### 1.4 PE/VL/TE — evolução por sprint (RF35)

| ID | Cenário | Esperado (fonte: contrato §Evolução + ficha da métrica) | Resultado | Veredito |
|---|---|---|---|---|
| CP-PE-18 | iniciada com 4 tarefas, 1 concluída | `current {1, 4, 25}`, `cutoff` presente, `frozen: false` | | |
| CP-PE-19 | iniciada sem tarefas | `percentage: null` (nunca 0), `hasData: false` | | |
| CP-PE-20 | tarefa associada após o início | `addedAfterStart: true` em `/sprints/:id/tasks`; `scopeChange.added` com o id; `planned` 2, `current` 3 | | |
| CP-PE-21 | tarefa removida após o início | `planned.denominator` preservado; `scopeChange.removed` com `exitStatus` | | |
| CP-TE-22 | concluir e reconsultar; mover a devolvida; reconsultar | `frozen: true`, corpo idêntico nas três consultas (imutabilidade) | | |
| CP-PE-23 | com pontos (3+5) vs sem pontos | `burndown {hasData: true, totalPoints: 8}` vs `{hasData: false, days: []}` | | |

### 1.5 TD — autorização nas três interfaces (matriz de papéis)

| ID | Cenário | Esperado (fonte: `AUTHORIZATION_MATRIX.md`; contrato §404) | Resultado | Veredito |
|---|---|---|---|---|
| CP-TD-24 | VIEWER: `GET` quadro, cronograma, progresso | 200 nos três | | |
| CP-TD-25 | VIEWER: mover tarefa, criar sprint, concluir marco | 403 nos três | | |
| CP-TD-26 | não-membro: `GET` progresso e quadro | resposta **idêntica** (status/código/mensagem) à de ID inexistente — sem oráculo de existência | | |

### 1.6 CU — fluxo central (RF10 → RF08 → RF35)

| ID | Cenário | Esperado | Resultado | Veredito |
|---|---|---|---|---|
| CP-CU-27 | criar projeto → marco → sprint vinculada → 3 tarefas associadas → iniciar → mover 2 até CONCLUIDO → progresso 2/3 (66.67) → concluir → devolvida no backlog → marco CONCLUIDO → progresso congelado → mover a concluída remanescente | cada etapa com a resposta do contrato; a última recusa 409 `TASK_SPRINT_LOCKED` | | |

\* casos além dos obrigatórios do enunciado, com a técnica que os gerou.

## 2. Rastreabilidade técnica × requisito

| Técnica | RF08 | RF10 | RF35 |
|---|---|---|---|
| Partição de equivalência | TD-02 | PE-01..04, PE-10..12, PE-15, PE-16 | PE-18..21, PE-23 |
| Valor limite | — | VL-05..09, VL-13/14, VL-17, VL-29 | — |
| Transição de estados | TD-06 | TE-01..11, TE-30 | TE-22 |
| Tabela de decisão | TD-01..05, TD-28, TD-24..26 | — | TD-24..26 |
| Caso de uso | CU-27 | CU-27 | CU-27 |

## 3. Roteiro de UI (nível UI — ambiente completo, aguardando aval)

Formato do RF42: pré-condições, passos, resultado esperado; capturar cada passo; executar nos
dois extremos (projeto zerado e seed em escala). Status inicial: **PENDENTE DE AVAL**.

| ID | Tela | Passos (resumo) | Esperado | Status |
|---|---|---|---|---|
| CP-UI-01 | Kanban | abrir quadro do seed | colunas com contagens; cartões sem seletor | PENDENTE |
| CP-UI-02 | Kanban | arrastar tarefa entre colunas | coluna e contagens atualizam; toast de sucesso | PENDENTE |
| CP-UI-03 | Kanban | Enter no cartão → seletor do diálogo | quadro e diálogo refletem sem reabrir | PENDENTE |
| CP-UI-04 | Kanban | cartão de sprint congelada | sem arrasto; seletor do diálogo travado com `title`; mover pré-bloqueado com mensagem amigável | PENDENTE |
| CP-UI-05 | Kanban | filtro por sprint | backlog sai do quadro; contagem "visíveis de totais" | PENDENTE |
| CP-UI-06 | Sprints/Marcos | criar com nome duplicado, datas invertidas, sobreposição | erros do contrato exibidos na tela | PENDENTE |
| CP-UI-07 | Sprints | "Mais ações": iniciar/concluir/cancelar | máquina de estados refletida; segunda ativa recusada com mensagem | PENDENTE |
| CP-UI-08 | Cronograma | calendário do seed | faixas; marco estendido até o fim da 1ª sprint agrupada com `· prazo DD/MM`; abas Todos/Marcos/Sprints/Tarefas filtrando; navegação presa ao intervalo | PENDENTE |
| CP-UI-09 | Sprints | painel de evolução | planejado/concluído/percentual; burndown com pontos; fallback textual sem pontos; encerrada no passado | PENDENTE |
| CP-UI-10 | ponta a ponta | CP-CU-27 pela tela | fluxo completo com captura por etapa | PENDENTE |

## 4. Resultados

### 4.1 Nível API (Fase 2 — executada em 31/08/2026, `rf08-rf10-rf35-caixa-preta.test.js`, 46 verdes)

| Casos | Resultado | Veredito |
|---|---|---|
| CP-TE-01..11, CP-TE-30 | comportamento idêntico ao esperado, incluindo `returnedToBacklog: 2` (TE-05), `milestoneCompleted` (TE-11) e os 409 de transição/edição/exclusão | APROVADO |
| CP-TD-01..06, CP-TD-28 | idem; a congelada vence a mesma-coluna com `409 TASK_SPRINT_LOCKED` nos dois caminhos (move e status) | APROVADO |
| CP-PE-02..04, CP-VL-05..09, CP-PE-10..12, CP-PE-15..16, CP-VL-17, CP-VL-29 | códigos e efeitos exatamente os do contrato | APROVADO |
| **CP-PE-01** | a recusa acontece (400) nas duas formas — campo ausente **e** `milestoneId: null` — e desde 01/09/2026 com o `SPRINT_MILESTONE_REQUIRED` prometido pelo contrato; `milestoneId` malformado segue em `VALIDATION_ERROR` | APROVADO (ACHADO CP-A1 fechado na parte da sprint) |
| **CP-VL-13/14** | refinado pela releitura do contrato: payload com 101 ids → `400` (regra "máx. 100" da camada de payload, também `VALIDATION_ERROR`); excedente **incremental** (100 na sprint + `PATCH /tasks/:id/sprint` da 101ª) → `409 SPRINT_TASK_LIMIT_REACHED`; composição de 100 intacta no `GET` | APROVADO (com a camada de payload anotada em CP-A1) |
| CP-PE-18..21, CP-TE-22, CP-PE-23 | percentuais exatos (25; 66.67 no CU), `null ≠ 0`, escopo sinalizado/preservado, congelamento com corpos idênticos em três consultas, burndown 8 pontos vs `hasData: false` | APROVADO |
| CP-TD-24..26 | VIEWER lê as três interfaces e recebe 403 nas três mutações; não-membro recebe resposta idêntica à de recurso inexistente no progresso e no quadro | APROVADO |
| CP-CU-27 | fluxo central inteiro conforme o contrato, encerrando na recusa `409 TASK_SPRINT_LOCKED` | APROVADO |

Observação de execução (**CP-A2**): na primeira rodada da suíte completa com a campanha, o teste
pré-existente de corrida `'protege atualização concorrente do mesmo status…'` falhou uma vez e
passou nas rodadas 2 e 3 (550/550 idênticas) — flake de concorrência alheio à campanha,
registrado no backlog.

### 4.2 Nível UI (Fase 3)

**PENDENTE DE AVAL** — roteiro da seção 3 aguardando o ambiente completo do João. Resumo e
veredito por requisito na seção "Campanha de caixa preta" do
[RF10_RF35_RELATORIO_TESTES.md](RF10_RF35_RELATORIO_TESTES.md).
