# Prompt de teste — RF10 (cronograma) e RF35 (evolução por sprint)

> **Como usar este documento.** Ele é o enunciado completo de uma bateria de testes sobre o que já
> está implementado do RF10 e do RF35 na branch `joao-dev-v2`. Não é um pedido de refatoração: o
> objetivo é **provar que o comportamento entregue é o comportamento especificado** — pelos
> documentos normativos da seção 0.1 — e expor, com evidência, onde ele não é. Leia as seções 0 a 3
> antes de abrir qualquer arquivo; execute as fases 1 a 8 na ordem; encerre pelas seções 12 a 14.
> Cada fase é um commit próprio.
>
> A Fase 7 (bateria de mutação) é a que separa cobertura real de cobertura nominal. **Nenhuma fase
> anterior pode ser dada por concluída sem ela.**

---

## 0. Regras de trabalho (invioláveis)

1. **Teste prova comportamento observável, não implementação.** Asserte sobre resposta HTTP, estado
   persistido e o que a tela renderiza. Espionar chamada interna de função privada acopla o teste ao
   desenho atual e quebra na primeira refatoração legítima.
2. **Teste que falha achou um defeito — pare e registre.** É proibido alterar código de produção
   para fazer um teste novo passar. Se o comportamento diverge da especificação, registre o achado
   (seção 13), deixe o teste escrito e marcado, e **não corrija nesta bateria**. Corrigir e testar no
   mesmo passo destrói a evidência de que o defeito existia.
3. **Funções puras continuam puras.** `sprint.calculator.js`, `sprint.progress.calculator.js` e
   `sprint.burndown.calculator.js` não chamam `new Date()`, não importam Prisma nem Express. Todo
   teste delas injeta o `cutoff`. Um teste que depende do relógio do processo ou do fuso da máquina é
   flaky por construção e será rejeitado (CONTEXTO §15.4: testes determinísticos).
4. **Ambiente é do João.** Toda operação de banco ou serviço (`migrate dev`, `migrate reset`,
   `db push`, restart de MySQL) deve ser **proposta como comando e aguardar aval**. Não execute
   comando destrutivo por conta própria.
5. **Cobertura nominal não é cobertura** (CONTEXTO §15.4: "cobertura é um indicador, não substitui
   qualidade"). Percentual de linha não prova nada sozinho: uma linha pode ser executada por um
   teste que não afirma nada sobre ela. A prova é a Fase 7.
6. **Evidência, não afirmação.** Toda alegação de "verde" vem acompanhada da saída real do comando
   (contagem de testes, arquivos, tempo). "Todos os testes passam" sem saída colada é considerado
   não verificado.
7. **Não amplie o escopo.** Achado fora de RF10/RF35 vai para `docs/issues/TECHNICAL_BACKLOG.md`, não
   vira correção nesta bateria.
8. **Fixtures sem dados pessoais reais** (CONTEXTO §15.4). Nome, e-mail e usuário de teste são
   sintéticos. Um fixture com dado real é achado de privacidade, não detalhe.
9. **Sem mocks no caminho de produção** (CONTEXTO §6.2). Mocks só em teste. Se a bateria encontrar
   resposta estática ou dado simulado servindo o RF10/RF35 em produção, é achado HIGH.
10. **Idioma e tom.** Testes, `describe`/`it` e comentários em pt-BR, no registro dos arquivos já
    existentes no módulo. Nome de teste descreve a regra, não o mecanismo: `it('recusa janela que
    cruza sprint do mesmo projeto')`, não `it('testa ensureNoOverlap')`.
11. **Não edite migration já aplicada.** Se um teste exigir mudança de schema, ele está errado ou o
    achado é de schema — registre, não altere.

### 0.1 Fontes normativas e precedência

| Ordem | Fonte | Papel nesta bateria |
|---|---|---|
| 1 | Documento oficial do TCC (Cap. 3) | define o que RF10 e RF35 **são** |
| 2 | `TRACEFLOW_ROADMAP_INCREMENTAL.md`, cartão **S1-04** | critérios de aceite oficiais da entrega (seção 3.0) e DoD comum (§4) |
| 3 | `TRACEFLOW_CONTEXTO_ARQUITETURA.md` | §12 contratos, §13 segurança, §14 LGPD, §15 estratégia de testes |
| 4 | **OWASP ASVS 5.0.0** (PDF oficial) | requisitos verificáveis de segurança; meta **L2** (CONTEXTO §13.1) |
| 5 | ADRs do repo: **ADR-011 > ADR-010 > ADR-009** | regras de domínio vigentes |
| 6 | `docs/api/API_CONTRACTS.md`, `docs/security/ASVS_BASELINE.md`, `docs/security/AUTHORIZATION_MATRIX.md`, `docs/traceability/RF_TECHNICAL_MATRIX.md` | estado declarado — a bateria **verifica** essas declarações |

Duas ressalvas de leitura, para não fabricar achado falso:

- O CONTEXTO §12.2 mostra um envelope `{data, meta}` como **exemplo**, e o próprio documento manda
  usar `docs/api/API_CONTRACTS.md` para contratos ativos. Divergência do exemplo **não** é achado;
  divergência do contrato ativo é.
- O CONTEXTO descreve capacidades futuras (nota do cabeçalho). O que vale como especificação de
  comportamento atual são o cartão S1-04, os ADRs e os contratos ativos. O CONTEXTO vale integral
  para **transversais**: segurança, LGPD, qualidade de teste, tratamento de erro.
- Os ADRs registram decisões em camadas: o ADR-009 aceita coisas que o ADR-010 corrigiu, e o
  ADR-010 aceita três que o ADR-011 reverteu. Quando um teste antigo contradisser o ADR-011, o
  **teste** está desatualizado — achado a registrar, não licença para apagá-lo em silêncio.

### Comandos de verificação (rodar ao fim de cada fase)

```bash
cd backend && npx prisma validate && npm run lint && npm run format:check && npm test
```

```bash
cd frontend && npm run lint && npm run format:check && npm run build && npm test
```

```bash
cd backend && npm run architecture:check && npm run security:secrets && npm run test:coverage
```

```bash
cd frontend && npm run test:coverage
```

### Pré-requisitos conhecidos deste ambiente

> Os testes de API do backend exigem `backend/.env.test`; sem ele as suítes falham por **429**, e o
> sintoma parece bug de rate limit — não é.
>
> Se o MySQL recusar credencial válida, verifique antes se há **duas instâncias disputando a porta
> 3306**: o erro se apresenta como senha errada, mas é banco errado.
>
> As suítes de `test/integration` e `test/api` exigem MySQL de pé e migrations aplicadas
> (`npm run db:test:migrate`, `npm run db:test:status`). `test/unit` roda sem banco.

---

## 1. Superfície sob teste

### 1.1 RF10 — definir o cronograma do projeto

Rotas registradas em `backend/src/modules/sprints/sprint.routes.js`, servidas sob o prefixo `/api`:

| Método | Rota | Observação |
|---|---|---|
| POST | `/projects/:projectId/sprints` | marco obrigatório na criação |
| GET | `/projects/:projectId/sprints` | filtros em `sprintSearchQuerySchema` |
| GET | `/sprints/:id` | |
| PUT | `/sprints/:id` | recusa sprint terminal |
| PATCH | `/sprints/:id/status` | única porta das transições |
| DELETE | `/sprints/:id` | **sempre 405**, antes de qualquer leitura |
| GET | `/sprints/:id/tasks` | composição registrada |
| PUT | `/sprints/:id/tasks` | substituição atômica, teto de 100 |
| POST | `/projects/:projectId/milestones` | sem campo de sprint |
| GET | `/projects/:projectId/milestones` | |
| GET | `/milestones/:id` | |
| PUT | `/milestones/:id` | marco é editável enquanto o projeto existir |
| PATCH | `/milestones/:id/status` | conclusão/reabertura manual |
| DELETE | `/milestones/:id` | 409 se houver sprints apontando |
| GET | `/projects/:projectId/schedule` | agregado; janela `from`/`to` |
| PATCH | `/tasks/:id/sprint` | vínculo pelo lado da tarefa |
| DELETE | `/tasks/:id/sprint` | |

Camadas: `sprint.controller.js` → `services/{sprint-crud,sprint-status,milestone,schedule}.service.js`
→ `repositories/{sprint,milestone}.repository.js`. Regra de forma e vocabulário em
`sprint.schema.js`; cálculo puro em `sprint.calculator.js`.

Autorização: leitura exige `VIEWER`; mutação de cronograma exige `MEMBER` ou acima
(`backend/src/modules/authorization/authorization.service.js`, níveis
`VIEWER < MEMBER < MANAGER < OWNER`). A resolução do projeto dono para `/sprints/:id` e
`/milestones/:id` vive no mesmo serviço — é a extensão registrada na `ASVS_BASELINE.md`.

Frontend: `frontend/src/features/schedule/` — `pages/{SprintsScreen,MilestonesScreen,ScheduleScreen}.jsx`,
`components/{SprintList,MilestoneList,SprintForm,MilestoneForm,SprintTasksPanel,SprintActionsMenu,ScheduleCalendar}.jsx`,
puros em `components/{schedule-display,schedule-calendar}.js`.

### 1.2 RF35 — evolução por sprint

| Método | Rota | Observação |
|---|---|---|
| GET | `/sprints/:id/progress` | devolve `planned`, `current`, `scopeChange`, `carryOver` e `burndown` |

Camadas: `services/sprint-progress.service.js` → `sprint.progress.calculator.js` +
`sprint.burndown.calculator.js` (os dois puros). A fonte do cálculo é a **participação**
(`SprintTask`), nunca `TaskHistoryEntry`.

Frontend: `components/{SprintProgressPanel,SprintBurndownChart,SprintBoardPanel}.jsx`.

---

## 2. Estado de partida — inventário da suíte

| Arquivo | Casos | Cobre |
|---|---|---|
| `backend/test/unit/sprint.service.test.js` | 80 | regras de serviço, transições, sobreposição, unicidade |
| `backend/test/unit/sprint.calculator.test.js` | 24 | duração, janela, atraso de marco |
| `backend/test/unit/sprint.progress.calculator.test.js` | 18 | baseline, métricas, escopo, congelamento |
| `backend/test/unit/sprint.burndown.calculator.test.js` | 16 | janela, linha ideal, linha real, congelamento |
| `backend/test/unit/adr011-milestone-sprint-audit.test.js` | — | script de auditoria da inversão |
| `backend/test/unit/s104-legacy-schedule-dates.test.js` | — | script de datas legadas |
| `backend/test/api/schedule-contracts.test.js` | 72 | contratos HTTP, papéis, IDOR, auditoria, limites |
| `backend/test/integration/rf10-sprint-schedule.test.js` | 19 | migration, integridade, transações, concorrência |
| `frontend/test/features/SprintsScreen.test.jsx` | — | lista, menu de ações, formulário, painéis, VIEWER |
| `frontend/test/features/MilestonesScreen.test.jsx` | — | progresso, conclusão manual, exclusão, VIEWER |
| `frontend/test/features/ScheduleScreen.test.jsx` | — | calendário, faixas, agenda, cartões |
| `frontend/test/components/TaskHistorySprint.test.jsx` | — | histórico de vínculo |

**A bateria não começa do zero.** O trabalho é (a) mapear cada critério e invariante da seção 3 ao
teste que a prova, (b) escrever teste para a que não tiver nenhum, e (c) provar pela mutação que os
que existem realmente falham quando a regra é quebrada.

As camadas exigidas pelo CONTEXTO §15.1–15.2 — unidade, integração com Prisma real, API, segurança,
migração, componentes e páginas — existem todas na tabela acima **exceto E2E de navegador**, que
permanece registrada no backlog como `S104-F02` (decisão de não bloquear, já tomada). A bateria não
reabre essa decisão; declara-a na seção 13.6.

---

## 3. O que precisa estar provado

### 3.0 Critérios de aceite oficiais do S1-04 (ROADMAP §6)

Estes seis critérios são a definição de pronto da entrega do RF10+RF35. Cada um precisa terminar a
bateria com prova nomeada:

| # | Critério do cartão S1-04 | Onde se prova |
|---|---|---|
| A1 | sprint possui projeto, nome, objetivo, início, fim e status | Fase 3 (contrato de criação/leitura) + Fase 4 (schema) |
| A2 | tarefa só pode ser associada a sprint do mesmo projeto | Fase 3 (`TASK_SPRINT_PROJECT_MISMATCH`) + Fase 4 (integridade) |
| A3 | cronograma apresenta tarefas, sprints, prazos e marcos | Fase 3 (forma do agregado) + Fase 5 (calendário) |
| A4 | evolução informa planejado, concluído, percentual e instante de corte | Fase 2 (I23–I30) + Fase 3 (payload do progress) |
| A5 | tarefas adicionadas ou removidas após o planejamento são identificáveis | Fase 2 (I27–I28) + Fase 3 (`scopeChange`) |
| A6 | permissões, fórmulas, fusos e limites de data são testados | Fases 2, 3 e 6 — este critério é literalmente o mandato desta bateria |

### 3.1 RF10 — janela, ciclo e agrupamento

| # | Invariante | Origem |
|---|---|---|
| I01 | Sprints do mesmo projeto não se sobrepõem; a janela é semiaberta `[startDate, endDate)` — a seguinte pode começar no instante exato em que a anterior termina | ADR-010 D03 |
| I02 | Duração zero não é sprint: `startDate >= endDate` recusa com `SPRINT_DATE_RANGE_INVALID` | ADR-010 D03 |
| I03 | Sprint `CANCELADA` **não conta** na checagem de sobreposição — cancelar libera as datas | ADR-010 D03, refinamento de 24/08/2026 |
| I04 | Sprint terminal (`CONCLUIDA`/`CANCELADA`) é registro imutável: status, composição e resultado congelados | ADR-010 D04 |
| I05 | Datas preservam o instante exato; `YYYY-MM-DD` significa início daquele dia em UTC, e não normalização de quem informou hora | ADR-010 D05 |
| I06 | Sprint nunca é excluída: `DELETE /sprints/:id` responde `405 SPRINT_DELETE_NOT_SUPPORTED` **antes** de qualquer leitura ou mutação | ADR-010 D06/D13 |
| I07 | Limite único de 100 tarefas por sprint, igual na substituição em lote e na associação individual | ADR-010 D14 |
| I08 | A janela `from`/`to` do cronograma é dia de calendário em UTC, com `to` **inclusivo** (filtrar "até 14/08" inclui o dia 14 inteiro) | ADR-010 D15 |
| I09 | Locks antes das leituras; validação sobre o retrato travado, nunca sobre leitura pré-transacional | ADR-010 D17 |
| I10 | O marco **agrupa** sprints; o vínculo é `Sprint.milestoneId`. `Milestone.sprintId` não existe mais | ADR-011 D01 |
| I11 | Marco com sprints apontando para ele não é excluído: `409 MILESTONE_HAS_SPRINTS` (a FK é `SetNull`; a recusa é a única proteção) | ADR-011 D01 |
| I12 | Marco é obrigatório na criação da sprint e alterável depois, **inclusive para `null`** | ADR-011 D02 |
| I13 | O prazo do marco é livre: não é conferido contra janela de sprint nenhuma | ADR-011 D03 |
| I14 | Marco é editável enquanto o projeto existir — não congela junto com a sprint | ADR-011 D04 |
| I15 | Conclusão automática do marco: existe ≥1 sprint não cancelada **e** todas as não canceladas estão `CONCLUIDA`. `CANCELADA` não bloqueia nem conclui sozinha | ADR-011 D05 |
| I16 | A nota "concluído automaticamente" é **derivada**, não persistida — não há coluna que distinga automático de manual | ADR-011 D05 |
| I17 | Conclusão manual do marco permanece e **pode ser reaberta** | ADR-011 D05 |
| I18 | Só uma sprint `EM_ANDAMENTO` por projeto: `409 SPRINT_ALREADY_ACTIVE`, verificado **depois** do lock | ADR-011 D06 |
| I19 | Concluir a sprint devolve ao backlog o que não foi concluído (`Task.sprintId = null` + `TaskHistoryEntry` de `SPRINT`), **sem tocar a participação congelada** | ADR-011 D07 |
| I20 | Transições permitidas: `PLANEJADA→{EM_ANDAMENTO, CANCELADA}`, `EM_ANDAMENTO→{CONCLUIDA, CANCELADA}`. Terminais não transicionam: `409 SPRINT_INVALID_TRANSITION` | `sprint.schema.js` |
| I21 | Nome de sprint é único por projeto: `409 SPRINT_NAME_IN_USE` (P2002 traduzido) | `sprint.schema.js` |
| I22 | `404` de recurso alheio é indistinguível de `404` de recurso inexistente | ADR-010 D16 |

### 3.2 RF35 — evolução e burndown

| # | Invariante | Origem |
|---|---|---|
| I23 | A fonte é a participação (`SprintTask`), não o histórico de eventos: concluir a tarefa depois **não** muda o resultado de uma sprint já encerrada | `sprint.progress.calculator.js` |
| I24 | `effectiveStatus = exitStatus ?? currentStatus` — o congelado vence o atual | idem |
| I25 | Baseline: com `startedAt` → `STARTED_AT`; sem ele → `OPEN`. `startDate` foi **rejeitado** como base (é data planejada, não execução) | ADR-009 §6 |
| I26 | Base `OPEN`: `planned === current` por definição e `scopeChange` é vazio — o vaivém durante o planejamento não conta | `sprint.progress.calculator.js` |
| I27 | Base `STARTED_AT`: `planned` inclui as **removidas** (elas foram planejadas; tirá-las esconderia escopo não entregue); `current` é `removedAt === null` | idem |
| I28 | `scopeChange` é saldo líquido: quem entrou depois do início e saiu não aparece em nenhuma das duas listas | idem |
| I29 | `percentage` é `null` quando o denominador é zero — "nada concluído" não é "não há o que concluir" | idem |
| I30 | Sprint terminal devolve `frozen: true` e `cutoff` no `completedAt`, não no momento da consulta | idem |
| I31 | `carryOver` lista as tarefas que seguiram para outra sprint, preservando `exitStatus` | idem |
| I32 | Burndown: janela semiaberta em dias UTC; o último dia é o anterior a `endDate` quando o fim cai à meia-noite | ADR-010 D03/D15 |
| I33 | Burndown: `remaining` é `null` nos dias posteriores ao corte — desenhar a linha até o fim afirmaria um futuro que ninguém mediu | `sprint.burndown.calculator.js` |
| I34 | Burndown: a linha ideal é planejamento, não previsão — vai de `totalPoints` a zero e não reage ao que aconteceu | idem |
| I35 | Teto de 180 dias de série | idem |
| I36 | Pureza e determinismo: mesmo retrato + mesmo `cutoff` ⇒ mesma resposta, em qualquer fuso | Regra 3 |

### 3.3 Mudanças recentes ainda sem prova consolidada (24/08/2026)

Estas entraram com a segunda iteração do design e **precisam de atenção específica** — são o ponto
mais provável de cobertura fraca:

- **I03** (cancelada libera datas) — nasceu com um único teste unitário.
- Calendário do cronograma omite sprint cancelada em faixa, legenda, eventos e contagem.
- Menu "Mais ações" da sprint: fecha por clique fora, `Escape` (devolvendo o foco) e **rolagem**;
  Editar/Cancelar somem em sprint terminal em vez de aparecerem desabilitados.
- Marco: rodapé com "Concluir marco"/"Reabrir marco", Editar/Excluir como ações-texto, Excluir
  desabilitado com sprints, nota que distingue conclusão automática de manual, barra cheia em marco
  concluído, aviso "Nenhuma sprint associada".
- Diálogo compartilhado: botão de recusa diz **"Voltar"**; confirmar não destrutivo é `button-primary`.
  **Atenção: isso vale para todas as telas do app**, não só cronograma — verifique que nenhuma outra
  suíte dependia do texto "Cancelar".

---

## 4. Fase 1 — Auditoria: mapa critério/invariante ↔ teste

Antes de escrever qualquer teste novo, produza `docs/issues/RF10_RF35_MAPA_TESTES.md` com uma linha
por item A1–A6 e I01–I36:

| Item | Arquivo::caso que o prova | Camada | Situação |
|---|---|---|---|

`Situação` ∈ { `PROVADA`, `PARCIAL`, `AUSENTE`, `CONTRADITA` }.

- **PARCIAL** exige dizer o que falta em uma frase (ex.: "prova o feliz, não prova o limite").
- **CONTRADITA** significa que existe teste verde afirmando o oposto da norma vigente — achado
  grave, vai para a seção 13 com severidade **HIGH**.
- Um item coberto só por teste de unidade sobre função pura **não é PROVADO** se o caminho HTTP
  correspondente nunca é exercitado: a função pode estar certa e não ser chamada.

Esse mapa é o insumo das fases 2 a 6. Sem ele, as fases seguintes viram escrita de teste ao acaso.

---

## 5. Fase 2 — Unidade: as calculadoras puras

Alvos: `sprint.calculator.js`, `sprint.progress.calculator.js`, `sprint.burndown.calculator.js`,
e as funções de regra de `sprint.schema.js` (`sprintsOverlap`, `ensureNoOverlap`,
`ensureTransitionAllowed`, `ensureSingleActiveSprint`, `allMilestoneSprintsConcluded`,
`parseInstant`, `parseWindowDay`, `nextUtcDay`, `ensureDateRange`).

Cobrir obrigatoriamente:

1. **Fronteiras da janela semiaberta** (I01, I02, I32): fim == início da seguinte (aceita); um
   milissegundo antes (recusa); duração zero (recusa); fim à meia-noite versus fim com hora.
2. **Cancelada fora da sobreposição** (I03): candidata sobre o período de uma cancelada passa;
   sobre o de uma `PLANEJADA` no mesmo período recusa. Os dois casos no mesmo teste, para a
   diferença ficar explícita.
3. **Datas** (I05): `YYYY-MM-DD` vira início do dia em UTC; ISO com offset preserva o instante;
   `2026-02-30` recusa; `Date` inválido recusa.
4. **Janela do cronograma** (I08): `to` inclusivo via `nextUtcDay`; `from == to` é janela de um dia
   válida; `from > to` recusa.
5. **Conclusão automática** (I15): zero sprints → `false`; só canceladas → `false`; uma concluída +
   uma cancelada → `true`; uma concluída + uma em andamento → `false`.
6. **Baseline e escopo** (I25–I28, A4, A5): os quatro cruzamentos de `addedAfterStart` × `removedAt`
   para base `STARTED_AT`, e a coincidência `planned === current` para base `OPEN`.
7. **Zero versus nulo** (I29): denominador zero devolve `percentage: null` — asserte `toBeNull()`,
   nunca `toBe(0)`.
8. **Congelamento** (I30, I23): sprint terminal devolve `frozen: true` e `cutoff` no `completedAt`;
   mudar `currentStatus` da participação depois **não** altera o resultado quando há `exitStatus`.
9. **Burndown** (I33–I35): `remaining` nulo após o corte; linha ideal indiferente ao real; série de
   181 dias truncada ou recusada conforme o contrato atual — **documente qual é**.
10. **Determinismo** (I36, A6 "fusos"): mesma entrada duas vezes ⇒ `toEqual`; rodar com `TZ=UTC` e
    com `TZ=America/Sao_Paulo` ⇒ mesmo resultado.

> Um teste de calculadora que constrói o retrato com `new Date()` sem congelar o valor é
> automaticamente rejeitado, mesmo passando.

---

## 6. Fase 3 — Serviço e contrato HTTP

Alvo: `backend/test/api/schedule-contracts.test.js` e `backend/test/unit/sprint.service.test.js`.

Para **cada** rota da seção 1.1 e 1.2, a suíte precisa ter:

- **Feliz**: status, forma do corpo e efeito persistido.
- **Recusa de domínio**: o código de erro exato do Anexo A, não só o status (CONTEXTO §12.3: código
  estável + mensagem segura).
- **Autorização**: `VIEWER` recebe `403` em toda mutação e `200` na leitura; `MEMBER` muta.
- **Isolamento**: recurso de outro projeto responde `404`, indistinguível de inexistente (I22).
- **Validação**: id não numérico, corpo vazio onde é exigido, campo de tipo errado.

Casos que exigem atenção específica:

| Caso | O que precisa ser afirmado |
|---|---|
| `POST /projects/:id/sprints` | corpo devolvido carrega projeto, nome, objetivo, início, fim e status (A1) |
| `DELETE /sprints/:id` | `405 SPRINT_DELETE_NOT_SUPPORTED` mesmo com id **inexistente** — a recusa precede a leitura (I06). Um teste que só usa id válido não prova a precedência |
| `PATCH /sprints/:id/status` | matriz completa de transições, incluindo as recusadas (I20) |
| `PATCH /sprints/:id/status` → `CONCLUIDA` | devolução ao backlog: `Task.sprintId` nulo, `TaskHistoryEntry` de `SPRINT` criado, participação **intacta** com `exitStatus`/`closedAt` (I19) |
| `PATCH /sprints/:id/status` → `CONCLUIDA` | `milestoneCompleted` no corpo quando a regra I15 se satisfaz, e ausente quando não |
| `PUT /sprints/:id` em terminal | `409 SPRINT_LOCKED` (I04) |
| `PUT /sprints/:id/tasks` em terminal | `409 SPRINT_SCOPE_LOCKED` — escopo não muda em **nenhuma** direção, nem removendo (I04) |
| `PUT /sprints/:id/tasks` com 101 | `409 SPRINT_TASK_LIMIT_REACHED`; e o mesmo teto pela associação individual (I07) |
| `POST /projects/:id/sprints` sem marco | `400 SPRINT_MILESTONE_REQUIRED` (I12) |
| `PUT /sprints/:id` com `milestoneId: null` | aceita — desvincular é legítimo depois da criação (I12) |
| Marco de outro projeto | `SPRINT_MILESTONE_PROJECT_MISMATCH` |
| Tarefa de outro projeto | `TASK_SPRINT_PROJECT_MISMATCH` (A2) |
| `DELETE /milestones/:id` com sprints | `409 MILESTONE_HAS_SPRINTS` (I11) |
| `PATCH /milestones/:id/status` | conclui e **reabre** (I17) |
| `PUT /milestones/:id` com sprint terminal apontando | aceita — o marco não congela junto (I14) |
| `POST /projects/:id/milestones` com prazo fora de toda janela | aceita (I13) |
| `GET /projects/:id/schedule?from&to` | `to` inclusivo (I08); janela invertida recusa; forma traz tarefas, sprints, prazos e marcos (A3) |
| `GET /sprints/:id/progress` | forma completa do corpo — `planned`, `current`, `percentage`, `cutoff`, `scopeChange`, `carryOver`, `burndown` (A4, A5); sprint sem tarefas devolve `percentage: null` |
| `GET /sprints/:id/progress` em terminal | `frozen: true` e `cutoff` estável entre duas chamadas (I30) |

**Auditoria** (`AuditEvent`) e **histórico** (`TaskHistoryEntry`) devem ser afirmados na mesma
transação da mutação que os originou — teste que verifica só o efeito principal deixa passar a
regressão em que o registro some. Isto é o ASVS 16.3.3 aplicado (eventos de segurança definidos são
de fato registrados).

---

## 7. Fase 4 — Integração: MySQL real

Alvo: `backend/test/integration/rf10-sprint-schedule.test.js`.

1. **Migrations** (CONTEXTO §15.1: testes de migração) — `deployTestMigrations` idempotente;
   tabelas presentes; **`Milestone.sprintId` ausente** e `Sprint.milestoneId` presente (I10). A
   asserção negativa é a que prova a inversão.
2. **Integridade** — FK `SetNull` no marco: excluir o projeto cascateia; a recusa de I11 é da
   aplicação, não do banco. Prove os dois lados. Schema da sprint carrega os campos de A1.
3. **Unicidade** — `[projectId, name]` viola com P2002 e vira `409` (I21); o mesmo nome passa em
   outro projeto.
4. **Concorrência sob lock** (I09, I18 — ASVS **2.3.4**: recurso de quantidade limitada não pode
   ser duplamente reservado manipulando a lógica; a "vaga única" aqui é a janela de datas e o posto
   de sprint ativa) — cada cenário com duas requisições simultâneas:
   - duas criações de sprints sobrepostas → uma passa, uma `409 SPRINT_OVERLAP`;
   - dois `PATCH .../status → EM_ANDAMENTO` em sprints diferentes → uma passa, uma
     `409 SPRINT_ALREADY_ACTIVE`;
   - dois `PATCH .../status` na **mesma** sprint terminal → nenhuma reabre;
   - duas edições parciais de janela na mesma sprint → nenhuma janela inválida persiste;
   - dois `PUT /sprints/:id/tasks` na mesma sprint → nenhuma tarefa com duas participações abertas.
5. **Transação de negócio** (ASVS **2.3.3**): provocar falha no meio de `PUT /sprints/:id/tasks`
   (ex.: uma tarefa inexistente no lote) e provar que **nada** persistiu — nem participação, nem
   ponteiro, nem auditoria órfã. Ou tudo, ou o estado anterior.
6. **Estado impossível** — depois de qualquer cenário acima, uma consulta de invariante no banco:
   nenhuma tarefa com duas participações com `removedAt IS NULL`; nenhuma sprint `EM_ANDAMENTO`
   duplicada por projeto; nenhuma janela com `startDate >= endDate`.

> Concorrência simulada com `await` sequencial **não é concorrência**. Use `Promise.all` sobre
> requisições reais, e afirme sobre o par de resultados, não sobre um deles.

---

## 8. Fase 5 — Frontend

Alvos: `frontend/test/features/{SprintsScreen,MilestonesScreen,ScheduleScreen}.test.jsx`.

Regra de ouro: **consultar pelo papel acessível**, nunca por classe CSS ou ordem de DOM. Um teste que
usa `container.querySelector('.sprint-menu-item')` não prova o que o usuário alcança.

1. **Menu "Mais ações"** — abre e fecha pelo gatilho; fecha por clique fora, por `Escape` **com o
   foco voltando ao gatilho**, e por **rolagem**; `aria-haspopup` e `aria-expanded` corretos; itens
   têm `aria-label` que nomeia a sprint (a lista tem rótulos idênticos repetidos).
2. **Ausência é ausência** — em sprint terminal, "Editar sprint" e "Cancelar sprint" **não existem**
   no menu aberto. Afirmar ausência com o menu fechado é trivialmente verdadeiro e não prova nada.
3. **VIEWER** — nenhuma ação de mutação, nem no rodapé nem dentro do menu; leitura preservada.
   Lembrete do CONTEXTO §13.5: esconder botão é UX; a autoridade é o backend — os dois lados têm
   teste próprio (este aqui e o `403` da Fase 3).
4. **Marcos** — "Concluir marco" confirma sempre; "Reabrir marco" não confirma; "Excluir"
   desabilitado com sprints, com `title` explicando; nota distingue automático de manual (I16);
   barra cheia em marco concluído manualmente; aviso "Nenhuma sprint associada".
5. **Calendário** — sprint cancelada fora da faixa, da legenda, dos eventos e da contagem; faixa
   arredondada só nas pontas reais; dia com prazo de marco marcado; clique em dia de outro mês
   navega (A3).
6. **Diálogo** — "Voltar" recusa; confirmar destrutivo usa `button-danger` e o não destrutivo
   `button-primary`; texto de cancelamento cita "deixa de ocupar o cronograma".
7. **Respostas fora de ordem** — abrir sprint A e logo B: a resposta lenta de A não pode sobrescrever
   o painel de B, e o salvamento seguinte precisa ir para B com os IDs de B. Já existe cobertura —
   confirme que ela sobreviveu à mudança do menu.
8. **Estados obrigatórios** (ROADMAP §4: carregamento, vazio, erro e acesso negado) — as três telas
   renderizam `LoadingState`, estado vazio com orientação, `ErrorState` com retry e
   `ForbiddenState`. Os quatro, por tela.
9. **Extremos de dados** — lista com uma sprint e lista com dezenas; marco sem sprint e marco com
   muitas; sprint sem tarefas pontuadas (burndown sem dados). O produto é avaliado nos dois extremos.
10. **RF35 na tela** — `SprintProgressPanel` distingue "Escopo atual" de "Escopo no encerramento";
    "Sem tarefas para medir" no lugar de `0%`; burndown com `role="img"`, descrição textual e legenda
    em texto — quem não enxerga o desenho não pode perder a informação.

---

## 9. Fase 6 — Segurança: ASVS 5.0.0 e LGPD

O CONTEXTO §13.1 fixa o ASVS 5.0.0 como referência, meta **L2**, e exige matriz própria com
identificador, aplicabilidade, implementação, evidência, status e justificativa. Essa matriz existe:
`docs/security/ASVS_BASELINE.md`, que declara **14 controles verificados no S1-04**. Esta fase tem
três trabalhos: **verificar adversarialmente o que a matriz declara**, **testar os controles
aplicáveis que ela ainda não cobre para o RF10/RF35**, e **atualizar a matriz com o resultado**.

### 9.1 Verificar as declarações existentes da `ASVS_BASELINE.md`

Para cada linha da seção "Controles verificados no S1-04 (RF10)" da baseline, confirme que a
evidência citada existe, exercita o controle e **fica vermelha quando o controle é neutralizado**
(as mutações M30–M37 da Fase 7 fazem a segunda metade). Declaração sem evidência viva é achado —
a matriz afirmando conformidade falsa é pior que a matriz admitindo lacuna.

| Controle (L) | O que a baseline declara | Verificação mínima |
|---|---|---|
| 1.2.4 (L1) | Prisma parametrizado; único `$queryRaw` é o lock, com template parametrizado e só IDs internos | inspecionar os repositories; injetar `name` com aspas/`;--` via API e provar que vira dado, não SQL |
| 2.2.1 (L1) | Zod estrito, enums, datas tipadas, `taskIds` ≤ 100 sem duplicados | payloads fora da allowlist recusam com `VALIDATION_ERROR`; duplicatas no lote recusam |
| 2.2.2 (L1) | invariantes no service; frontend valida só por UX | requisição direta à API com payload que o formulário barraria — o backend recusa sozinho |
| 2.2.3 (L2) | consistência entre dados relacionados: janela, mesmo projeto | I02 + A2 já cobrem; confirmar que os testes existem e mordem |
| 2.3.1 (L1) | máquina de estados na ordem esperada | matriz de transições da Fase 3 (I20) |
| 2.3.3 (L2) | transação de negócio completa ou rollback | cenário 5 da Fase 4 |
| 4.1.1 (L1) | `Content-Type` com charset correto | asserção de header nas respostas do módulo |
| 8.2.1 (L1) | acesso a função por permissão explícita | `403` para VIEWER em toda mutação (Fase 3) |
| 8.2.2 (L1) | IDOR/BOLA: `resolveProjectId` estendido a `/sprints/:id` e `/milestones/:id` | isolamento entre projetos em **todos** os métodos, incluindo `GET /sprints/:id/progress` |
| 8.3.1 (L1) | autorização em camada confiável, nada depende da UI | teste de API puro, sem frontend |
| 16.2.2 (L2) | timestamps em UTC | `generatedAt`/`startedAt`/`completedAt`/`occurredAt` normalizados |
| 16.3.2 (L2) | falhas de autorização registradas | `403`/`404` chegam ao logger sem dado sensível |
| 16.3.3 (L2) | `AuditEvent` em toda mutação de sprint, marco e vínculo | asserções de auditoria da Fase 3, na mesma transação |
| 16.5.1 (L2) | mensagem genérica em erro inesperado; `details` sem eco do valor recebido | provocar erro interno e inspecionar o corpo: sem stack, sem SQL, sem valor ecoado (CONTEXTO §12.3) |

### 9.2 Controles aplicáveis ainda não declarados para o S1-04

Testar e acrescentar à matriz (todos L1/L2, coerentes com a meta L2). A referência normativa é o
PDF oficial — confira o texto exato de cada um antes de escrever o teste:

| Controle (L) | Aplicação no RF10/RF35 | Teste |
|---|---|---|
| **2.1.3** (L2) | limites de negócio documentados | `SPRINT_MAX_TASKS = 100`, teto de 180 dias do burndown e demais limites aparecem em `docs/api/API_CONTRACTS.md`; divergência doc↔código é achado |
| **2.3.2** (L2) | limites de negócio implementados como documentados | os mesmos limites recusam na API com o código certo (já na Fase 3 — aqui, cruzar com a doc) |
| **2.3.4** (L2) | lock de recurso limitado contra dupla reserva | cenários de concorrência da Fase 4 — janela de datas e posto de sprint ativa são a "vaga única" |
| **2.4.1** (L2) | anti-automação nas funções do módulo | rate limiter geral cobre `/api`; provar com teste dedicado (isolado do resto da suíte) que estouro devolve `429` — e que a suíte normal **não** depende dele |
| **3.3.1/3.3.2/3.3.4** (L1–L2) | cookie de sessão usado pelas rotas do módulo | `Secure` conforme ambiente, `SameSite` configurado, `HttpOnly` presente — asserção sobre `Set-Cookie` |
| **3.5.1** (L1) | CSRF nas mutações | mutação de sprint/marco **sem** token CSRF recusa; leitura não exige |
| **3.5.3** (L1) | método seguro não muta | nenhuma rota `GET`/`HEAD`/`OPTIONS` do módulo altera estado — conferido por inspeção das rotas + teste de que `GET` não dispara auditoria de mutação |
| **7.4.1** (L1) | sessão encerrada não usa mais o módulo | logout e requisição em seguida com o cookie antigo → `401` |
| **14.2.1** (L1) | nada sensível em URL/query | as query strings do módulo carregam apenas datas, status e paginação — inspeção + teste de que token/sessão nunca viajam por query |
| **14.3.2** (L2) | anti-cache em resposta com dado do projeto | `Cache-Control: no-store` nas respostas de `/api` do módulo (middleware `noStoreApiResponses`) — asserção de header |
| **16.2.1** (L2) | metadado suficiente no log | evento de auditoria carrega quem, quando, o quê (allowlist de metadata) |
| **16.4.1** (L2) | codificação contra log injection | criar sprint com nome contendo `\r\n`, caracteres de controle e payload ANSI; o log/auditoria não quebra linha nem executa — o nome vira dado inerte |
| **16.5.3** (L2) | falha segura, sem fail-open | erro de validação **nunca** deixa a mutação prosseguir; provocar exceção no meio do fluxo e provar que nada persistiu (cruza com 2.3.3) |

Justifique como **NÃO APLICÁVEL** — com uma frase cada, na matriz — os capítulos que não tocam esta
superfície (ex.: V5 upload, V9/V10 tokens autocontidos e OAuth, V17 WebRTC, V4.3 GraphQL). Não
teste o que não existe; declare por que não existe.

### 9.3 LGPD (CONTEXTO §14)

O domínio de cronograma quase não carrega dado pessoal — e é isso que precisa ser provado, não
assumido:

1. **Minimização no payload**: `GET /sprints/:id/progress` e o agregado do cronograma expõem IDs de
   tarefa e métricas — **não** expõem nome, e-mail ou qualquer identificador de pessoa além do
   necessário. Asserção sobre a forma do corpo.
2. **Logs e auditoria sem dado pessoal desnecessário** (CONTEXTO §13.9): os eventos de auditoria do
   módulo carregam `userId` interno e metadata allowlist — nunca e-mail, nome ou corpo integral da
   requisição. Teste sobre o registro persistido.
3. **Fixtures sintéticas** (Regra 8): varrer os fixtures/factories do módulo por e-mail e nome
   reais.
4. **Métricas agregadas por sprint, não por pessoa** (CONTEXTO §14.3): o RF35 mede escopo da
   sprint. Confirmar que nenhum endpoint do módulo produz ranking individual de produtividade — se
   produzir, é achado de privacidade a registrar (a avaliação individual pertence ao RF36, com as
   cautelas próprias).

### 9.4 Entregável da fase

Atualizar `docs/security/ASVS_BASELINE.md`: seção S1-04 com os controles de 9.2 acrescentados
(estado + evidência apontando para os testes novos), correções nas linhas de 9.1 que a verificação
desmentir, e os NÃO APLICÁVEIS justificados. O formato da matriz segue o CONTEXTO §13.1.

---

## 10. Fase 7 — Bateria de mutação (obrigatória)

Neutralize cada correção/regra **uma por vez** no `HEAD` atual, reexecute a suíte, anote quantos
testes ficam vermelhos e **reverta antes da mutação seguinte**. Uma regra cuja suíte continua verde
depois de removida **não está coberta** — é o único jeito de distinguir cobertura real de nominal.

Preencha esta tabela (as mutações abaixo são o mínimo; acrescente as que o mapa da Fase 1 sugerir):

| # | Mutação aplicada | Item | Testes vermelhos |
|---|---|---|---|
| M01 | `ensureNoOverlap` volta a considerar `CANCELADA` | I03 | |
| M02 | `sprintsOverlap` troca `<` por `<=` (emenda vira conflito) | I01 | |
| M03 | `ensureDateRange` aceita `startDate == endDate` | I02 | |
| M04 | `ensureNoOverlap` deixa de excluir o próprio `ignoreId` | I01 | |
| M05 | `ensureSingleActiveSprint` deixa de excluir o próprio id | I18 | |
| M06 | `ensureTransitionAllowed` aceita qualquer destino | I20 | |
| M07 | `ensureSprintScopeMutable` deixa de barrar terminal | I04 | |
| M08 | `ensureSprintEditable` deixa de barrar terminal | I04 | |
| M09 | `allMilestoneSprintsConcluded` passa a contar `CANCELADA` | I15 | |
| M10 | `allMilestoneSprintsConcluded` devolve `true` para lista vazia | I15 | |
| M11 | `milestoneHasSprintsError` deixa de ser lançado | I11 | |
| M12 | `parseInstant` volta a truncar para meia-noite UTC | I05 | |
| M13 | `nextUtcDay` deixa de somar um dia (`to` vira exclusivo) | I08 | |
| M14 | `sprintDeleteNotSupportedError` passa a ser lançado só após a leitura | I06 | |
| M15 | Um caminho de escrita de escopo perde o lock do projeto | I09 | |
| M16 | Conclusão deixa de zerar `Task.sprintId` | I19 | |
| M17 | Conclusão passa a sobrescrever a participação congelada | I19 | |
| M18 | `effectiveStatus` passa a usar sempre `currentStatus` | I24 | |
| M19 | `resolveBaseline` passa a usar `startDate` na falta de `startedAt` | I25 | |
| M20 | `planned` deixa de incluir as participações removidas | I27 | |
| M21 | `scopeChange.added` deixa de filtrar `removedAt === null` | I28 | |
| M22 | `metric` devolve `0` em vez de `null` no denominador zero | I29 | |
| M23 | `cutoff` de sprint congelada passa a usar o instante da consulta | I30 | |
| M24 | Burndown preenche com `0` os dias após o corte | I33 | |
| M25 | Burndown inclui o dia de `endDate` na série | I32 | |
| M26 | Calendário volta a incluir sprint cancelada | 3.3 | |
| M27 | Menu de ações deixa de fechar na rolagem | 3.3 | |
| M28 | `MilestoneList` deixa de desabilitar Excluir com sprints | I11 | |
| M29 | Nota do marco passa a dizer sempre "automaticamente" | I16 | |
| M30 | Mutação de sprint deixa de exigir token CSRF | ASVS 3.5.1 | |
| M31 | `resolveProjectId` deixa de resolver `/sprints/:id` | ASVS 8.2.2 | |
| M32 | Mutação do módulo passa a exigir só `VIEWER` | ASVS 8.2.1 | |
| M33 | Transição de status deixa de gravar `AuditEvent` | ASVS 16.3.3 | |
| M34 | `noStoreApiResponses` sai do caminho de `/api` | ASVS 14.3.2 | |
| M35 | Handler de erro passa a devolver stack e valor recebido | ASVS 16.5.1 | |
| M36 | Validação falha e a mutação prossegue mesmo assim | ASVS 16.5.3 | |
| M37 | Logger deixa de codificar quebra de linha no nome da sprint | ASVS 16.4.1 | |

Feche a seção com uma frase explícita: **"Nenhuma mutação sobreviveu"** ou a lista nominal das que
sobreviveram — cada sobrevivente é um achado da seção 13. Sobrevivente de M30–M37 é achado de
**segurança**, severidade mínima HIGH.

---

## 11. Fase 8 — Deriva entre documentação e código

A documentação declarativa é evidência do TCC. Uma linha desatualizada vale menos que ausência: ela
afirma algo falso com autoridade.

### 11.1 `docs/traceability/RF_TECHNICAL_MATRIX.md`

Na linha do **RF10**:

- **Persistência** diz `Milestone (sprintId)`. O ADR-011 D01 inverteu o vínculo para
  `Sprint.milestoneId`, e a migration removeu a coluna. **Contradiz o modelo vigente.**
- **Frontend** cita `ScheduleAgenda (agenda por data)`. Esse componente **não existe** no código —
  a agenda textual foi substituída pelo `ScheduleCalendar`. Confirme com uma busca antes de
  reescrever.
- **Frontend** não cita `SprintsScreen` nem `MilestonesScreen`, que são hoje as telas principais do
  RF10.

Na linha do **RF35**:

- **Frontend** não cita `SprintBurndownChart`.
- **Evidência de teste** cita `ScheduleScreen`, mas os testes de evolução hoje vivem em
  `SprintsScreen.test.jsx`.

### 11.2 Demais documentos

- `docs/api/API_CONTRACTS.md` contra o Anexo A: todo código de erro que a suíte exercita está
  documentado, e todo código documentado existe em `ERROR_CODES`. Limites de negócio (100 tarefas,
  180 dias) documentados (ASVS 2.1.3).
- `docs/security/ASVS_BASELINE.md` atualizada conforme 9.4.
- `docs/security/AUTHORIZATION_MATRIX.md` reflete leitura=`VIEWER` / mutação=`MEMBER`+ para as
  rotas do módulo (ASVS 8.1.1).
- ADR-010 D03 registra o refinamento de 24/08 (I03) como nota — confirmar.

---

## 12. Critérios de aceite

Derivados do DoD comum do ROADMAP §4 e do CONTEXTO §17.4, no que cabe a uma bateria de testes:

1. Mapa da Fase 1 completo, sem nenhum item A/I em `AUSENTE` sem teste novo correspondente.
2. Os seis critérios do S1-04 (seção 3.0) com prova nomeada.
3. Backend e frontend verdes, com a saída colada.
4. Cobertura **acima dos limiares configurados**, sem baixá-los:
   - backend: `statements 85`, `branches 70`, `functions 85`, `lines 87`;
   - frontend: `statements 50`, `branches 45`, `functions 40`, `lines 53`.
   Abaixar limiar para passar é reprovação automática desta bateria (ROADMAP §4: "CI verde, sem
   enfraquecimento de gates").
5. Bateria de mutação preenchida, com a frase de fechamento — incluindo as mutações de segurança.
6. `npm run lint`, `format:check`, `architecture:check`, `security:secrets` verdes; `npm run build`
   verde no frontend.
7. Nenhum teste novo alterou código de produção (Regra 2). Nenhum mock no caminho de produção
   (Regra 9).
8. Nenhum teste depende do relógio, do fuso ou da ordem de execução. Prove rodando a suíte duas
   vezes e, nas calculadoras, com `TZ` diferente.
9. `ASVS_BASELINE.md`, `RF_TECHNICAL_MATRIX.md` e demais documentos da Fase 8 atualizados —
   avaliação ASVS e LGPD registrada, como o DoD do roadmap exige.

---

## 13. Formato do relatório final

Entregue `docs/issues/RF10_RF35_RELATORIO_TESTES.md` com:

**13.1 Resumo** — uma frase por RF dizendo se o comportamento entregue corresponde ao especificado,
e uma frase sobre a postura de segurança do módulo frente à meta ASVS L2.

**13.2 Números** — testes antes/depois por projeto e por camada; cobertura antes/depois.

**13.3 Achados** — um bloco por achado, ordenado por severidade:

```
### [HIGH|MEDIUM|LOW] Título curto do defeito

**Onde:** caminho/arquivo.js:linha
**Norma violada:** I__ / A__ (ADR-0__ D__ | S1-04 | CONTEXTO §__ | ASVS v__.__.__)
**Comportamento esperado:** uma frase.
**Comportamento observado:** uma frase.
**Como reproduzir:** o teste que falha, ou o comando + entrada.
**Consequência:** o que o usuário vê, o que o dado sofre ou o que um ator hostil ganha.
**Não corrigido nesta bateria** (Regra 2) — proposta de correção em uma frase.
```

Severidade: **HIGH** = dado incorreto persistido, invariante de domínio violável, controle de
segurança ASVS L1/L2 ausente ou contornável, ou norma contradita por teste verde. **MEDIUM** =
comportamento errado sem corromper dado nem expor acesso. **LOW** = texto, rótulo, acessibilidade
sem perda de informação.

**13.4 Bateria de mutação** — a tabela da Fase 7.

**13.5 Deriva documental** — o que foi corrigido na Fase 8 e o que ficou aberto.

**13.6 O que não foi testado e por quê** — seja explícito. Uma bateria que omite silenciosamente é
pior que uma bateria menor declarada. No mínimo: a jornada E2E de navegador (`S104-F02`, decisão
registrada de não bloquear), requisitos ASVS L3 (fora da meta), e o que depender de ambiente que só
produção tem (TLS de borda, headers do host da SPA, retenção operacional de logs).

---

## 14. Checklist de DoD

- [ ] Mapa item ↔ teste publicado, A1–A6 e I01–I36 classificados
- [ ] Fase 2: calculadoras puras, incluindo fronteiras de janela, zero-versus-nulo e determinismo com `TZ` variado
- [ ] Fase 3: toda rota das seções 1.1/1.2 com feliz, recusa de domínio, papel, isolamento e validação
- [ ] Fase 4: cinco cenários de concorrência com `Promise.all` + rollback transacional + consulta de estado impossível
- [ ] Fase 5: menu, ausência-com-menu-aberto, VIEWER, marcos, calendário, diálogo, quatro estados por tela, extremos de dados
- [ ] Fase 6: declarações da `ASVS_BASELINE.md` verificadas; controles novos de 9.2 testados; LGPD de 9.3 conferida; matriz atualizada
- [ ] Fase 7: tabela de mutação preenchida (M01–M37) e fechada com frase explícita
- [ ] Fase 8: `RF_TECHNICAL_MATRIX.md` sem contradição com o ADR-011; `API_CONTRACTS.md` e `AUTHORIZATION_MATRIX.md` conferidos
- [ ] Cobertura acima dos limiares, sem tê-los baixado
- [ ] `lint`, `format:check`, `architecture:check`, `security:secrets`, `build` verdes nos dois projetos
- [ ] Relatório final publicado, com achados no formato da seção 13.3
- [ ] Suíte rodada duas vezes com o mesmo resultado

---

## Anexo A — Códigos de erro do módulo

`SPRINT_NOT_FOUND` · `SPRINT_OVERLAP` · `SPRINT_DATE_RANGE_INVALID` · `SPRINT_INVALID_TRANSITION` ·
`SPRINT_ALREADY_ACTIVE` · `SPRINT_LOCKED` · `SPRINT_SCOPE_LOCKED` · `SPRINT_NAME_IN_USE` ·
`SPRINT_TASK_LIMIT_REACHED` · `SPRINT_DELETE_NOT_SUPPORTED` · `SPRINT_MILESTONE_REQUIRED` ·
`SPRINT_MILESTONE_PROJECT_MISMATCH` · `MILESTONE_NOT_FOUND` · `MILESTONE_HAS_SPRINTS` ·
`TASK_NOT_FOUND` · `TASK_SPRINT_PROJECT_MISMATCH` · `VALIDATION_ERROR`

## Anexo B — Armadilhas conhecidas

1. **`.env.test` ausente** → suítes de API falham por `429`. Parece rate limit; é configuração.
2. **Dois MySQL na porta 3306** → erro de credencial que parece senha errada; é banco errado.
3. **`fileParallelism: false`** no backend: as suítes compartilham banco e rodam em série. Teste que
   depende de estado deixado por outro arquivo passa localmente e quebra na CI — não escreva.
4. **`.spinner` não existe** no `global.css`: o `LoadingState` renderiza um `<span>` vazio. Não é
   defeito desta bateria, mas não escreva teste que dependa do spinner visível.
5. **`RequestState` é exportado e nunca usado** — as três telas do cronograma fazem a cadeia
   `loading ? … : forbidden ? … : error ? …` à mão, com `LoadingState`/`ForbiddenState`/`ErrorState`
   soltos. `RequestState` é a abstração pretendida, mas testar por ela seria testar código morto:
   asserte sobre o que a página renderiza hoje.
6. **Sprints encerradas antes da migration** têm `exitStatus` nulo e caem no status atual da tarefa.
   É limitação conhecida e documentada — um teste que a trate como defeito está errado.
7. **O teste de rate limit (ASVS 2.4.1) deve viver isolado**: se a suíte comum depender do limiter,
   toda ela vira flaky por acúmulo de requisições. O `.env.test` alarga os limites de propósito.
8. **A numeração do ASVS 5.0.0 não é a do 4.0.** Validação está no V2, autorização no V8, logging e
   erro no V16, CSRF/cookies no V3. Ao citar um requisito, confira o texto no PDF oficial — não
   confie em tabelas do 4.0 encontradas na web.

## Anexo C — Referência rápida ASVS 5.0.0 usada nesta bateria

Paráfrases curtas; o texto normativo é o do PDF oficial. Nível entre parênteses.

| ID | Essência | Fase |
|---|---|---|
| 1.2.4 (1) | consultas parametrizadas ou ORM, sem concatenação | 9.1 |
| 2.1.3 (2) | limites de negócio documentados | 9.2 / 11.2 |
| 2.2.1 (1) | validação positiva por allowlist, padrão e faixa | 9.1 |
| 2.2.2 (1) | validação imposta em camada confiável, não no cliente | 9.1 |
| 2.2.3 (2) | consistência entre dados relacionados | 9.1 |
| 2.3.1 (1) | fluxo de negócio só na ordem esperada, sem pular passo | 9.1 |
| 2.3.2 (2) | limites de negócio implementados como documentados | 9.2 |
| 2.3.3 (2) | operação de negócio inteira ou rollback | Fase 4 (item 5) / 9.1 |
| 2.3.4 (2) | lock de negócio contra dupla reserva de recurso limitado | Fase 4 (item 4) / 9.2 |
| 2.4.1 (2) | anti-automação contra chamadas excessivas | 9.2 |
| 3.3.1/3.3.2/3.3.4 (1–2) | cookie com `Secure`, `SameSite` adequado, `HttpOnly` | 9.2 |
| 3.5.1 (1) | anti-CSRF em funcionalidade sensível | 9.2 |
| 3.5.3 (1) | método "safe" não executa mutação | 9.2 |
| 7.4.1 (1) | sessão encerrada não é mais aceita | 9.2 |
| 8.2.1 (1) | acesso a função exige permissão explícita | 9.1 |
| 8.2.2 (1) | acesso a dado restrito ao dono — IDOR/BOLA | 9.1 |
| 8.3.1 (1) | autorização em camada confiável | 9.1 |
| 14.2.1 (1) | nada sensível em URL ou query string | 9.2 |
| 14.3.2 (2) | anti-cache (`no-store`) em dado sensível | 9.2 |
| 16.2.1 (2) | log com quem/quando/onde/o quê | 9.2 |
| 16.2.2 (2) | timestamps em UTC ou com offset explícito | 9.1 |
| 16.3.2 (2) | falha de autorização registrada | 9.1 |
| 16.3.3 (2) | eventos de segurança documentados são registrados | 9.1 |
| 16.4.1 (2) | log codifica dados contra log injection | 9.2 |
| 16.5.1 (2) | erro inesperado responde mensagem genérica, sem stack/query/segredo | 9.1 |
| 16.5.3 (2) | falha segura: erro de validação nunca vira fail-open | 9.2 |
