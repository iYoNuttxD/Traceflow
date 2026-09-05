# Prompt de teste — terceira bateria: quinta iteração do design (RF10) e Kanban sem seletor no cartão (RF08)

> **Como usar este documento.** Ele é o enunciado completo da **terceira bateria de testes** da
> branch `joao-dev-v2`, motivada pela **quinta iteração do design de sprints e marcos**
> ([RF10_RF08_PROMPT_QUINTA_ITERACAO.md](RF10_RF08_PROMPT_QUINTA_ITERACAO.md)), entregue em
> 31/08/2026 nos commits `f4f4796` (barra do marco), `d538505` (abas do painel do mês), `da04918`
> (Kanban sem seletor no cartão) e `58e49b7` (ajuste da avaliação visual: aba "Todos" como padrão e
> segmentos de largura igual). As duas baterias anteriores
> ([RF10_RF35_PROMPT_TESTES.md](RF10_RF35_PROMPT_TESTES.md),
> [RF10_RF35_PROMPT_SEGUNDA_BATERIA.md](RF10_RF35_PROMPT_SEGUNDA_BATERIA.md)) provaram A1–A6 e
> I01–I49 e produziram o mapa ([RF10_RF35_MAPA_TESTES.md](RF10_RF35_MAPA_TESTES.md)) e o relatório
> ([RF10_RF35_RELATORIO_TESTES.md](RF10_RF35_RELATORIO_TESTES.md)). Esta bateria **não as repete**:
> ela (a) prova os comportamentos novos **I50–I58**, (b) reconfere as provas antigas que a entrega
> moveu ou reescreveu — em especial **I38 e I44, cuja redação a quinta iteração superou**, e as duas
> provas reescritas do Kanban —, (c) reavalia o delta sob ASVS 5.0.0 e LGPD, e (d) re-executa o gate
> de zero comentários **no escopo em que ele vale**.
>
> A bateria agora inclui o **RF08** (quadro Kanban): a quinta iteração moveu a troca de status do
> cartão para o painel de detalhes, e o quadro entra no mapa e no relatório pela primeira vez desde
> a E11. Leia as seções 0 a 3 antes de abrir qualquer arquivo; execute as fases 0 a 8 na ordem;
> encerre pelas seções 12 e 13. Cada fase é um commit próprio. A Fase 7 (mutação) continua sendo a
> que separa cobertura real de cobertura nominal — nenhuma fase anterior é dada por concluída sem
> ela.

---

## 0. Regras de trabalho (invioláveis)

As 14 regras das baterias anteriores valem integralmente — em especial: teste prova comportamento
observável; **teste que falha achou defeito, registre e não corrija na bateria**; funções puras
recebem `hoje`/datas por parâmetro e nunca chamam `new Date()` por conta própria; evidência de
verde é a saída colada do comando; fixtures sintéticas; achado fora de escopo vai para o
[TECHNICAL_BACKLOG.md](TECHNICAL_BACKLOG.md); **ambiente é do João** (dev server completo, MySQL,
seed: comando proposto, aval aguardado); **os dois extremos de dados** (0, 1 e seed em escala).
Somam-se três regras próprias desta bateria:

15. **O gate de zero comentários vale para RF10/RF35 — e não para o Kanban.** A decisão de
    27/08/2026 cobre `backend/src/modules/sprints` e `frontend/src/features/schedule` (e suas
    suítes). Os arquivos do Kanban (`frontend/src/features/tasks/**`, `KanbanPage.test.jsx`) têm
    registro deliberado de comentários de porquê — lá a regra é outra: **nenhum comentário novo**,
    e comentário existente só sai junto com o código que ele explica. A Fase 0 varre o primeiro
    escopo; encontrar comentário no Kanban **não é achado**.
16. **UI "travada" em dev server antigo não é achado.** A quinta iteração inseriu hooks no meio de
    `ScheduleCalendar`, e o React Refresh preserva estado de hook **por posição**: um dev server
    que atravessou os commits ligado exibe abas com estado embaralhado (comprovado em 31/08 — num
    navegador limpo o mesmo commit filtra corretamente). Antes de registrar qualquer defeito de
    interação, **reinicie o Vite e faça hard refresh**; só o que sobreviver a isso é achado.
17. **Verificação visual do cronograma pode dispensar o backend.** A entrada
    `traceflow-frontend-harness` (porta 4180) do `.claude/launch.json` sobe só o Vite do frontend;
    um harness que monta `ScheduleCalendar` com props sintéticas cobre a matriz visual do
    calendário sem MySQL. Arquivo de harness é temporário: criado na fase visual, apagado antes de
    qualquer commit (o lint cobre `src`). O Kanban, que depende de API real, usa o ambiente
    completo do João — com aval.

### 0.1 Fontes normativas e precedência

| Ordem | Fonte | Papel nesta bateria |
|---|---|---|
| 1 | Documento oficial do TCC (Cap. 3) | define o que RF10 (cronograma) e RF08 (quadro ágil) **são** |
| 2 | `TRACEFLOW_ROADMAP_INCREMENTAL.md`, cartão **S1-04** e DoD comum (§4) | critérios de aceite oficiais — continuam sendo A1–A6 |
| 3 | `TRACEFLOW_CONTEXTO_ARQUITETURA.md` | §12 contratos, §13 segurança, §14 LGPD, §15 estratégia de testes, §17.4 DoD |
| 4 | **OWASP ASVS 5.0.0** (PDF oficial) | requisitos verificáveis; meta **L2**. Numeração do 5.0.0 — validação no V2, frontend web no V3, autorização no V8, logging/erro no V16 |
| 5 | ADRs do repo: **ADR-011 > ADR-010 > ADR-009** | regras de domínio vigentes — a quinta iteração **não muda nenhuma**: a extensão da barra é apresentação, `dueDate` permanece livre (ADR-011 D03) |
| 6 | [RF10_RF08_PROMPT_QUINTA_ITERACAO.md](RF10_RF08_PROMPT_QUINTA_ITERACAO.md) (D1–D6) + o ajuste aprovado de 31/08 (aba "Todos" padrão; segmentos iguais) | especificação da entrega sob teste — a seção 1 resume o que dela virou código |
| 7 | `docs/api/API_CONTRACTS.md`, `docs/security/ASVS_BASELINE.md`, `docs/security/AUTHORIZATION_MATRIX.md`, `docs/traceability/RF_TECHNICAL_MATRIX.md` | estado declarado — a bateria verifica as declarações |

As ressalvas de leitura das baterias anteriores seguem valendo. Uma nova: o prompt da quinta
iteração descreve na D3/D4 o painel com **três** abas e trilho que abraça o conteúdo — o ajuste de
31/08, aprovado pelo João, **supersede esse trecho**: são **quatro** abas com "Todos" no início e
ativa por padrão, segmentos dividindo a largura por igual. Em divergência, vale o ajuste (commit
`58e49b7`).

### 0.2 Comandos de verificação (rodar ao fim de cada fase)

```bash
cd frontend && npm run lint && npm run format:check && npm run build && npm test
```

```bash
cd backend && npx prisma validate && npm run lint && npm run format:check && npm test
```

```bash
cd frontend && npm run test:coverage
```

```bash
cd backend && npm run architecture:check && npm run security:secrets && npm run test:coverage
```

Suíte rodada **duas vezes** com resultado idêntico. Números de partida conhecidos de 31/08 —
frontend: 31 arquivos, 316 casos; cobertura 67,03 / 65,53 / 60,03 / 68,11 — mas colete os **seus**
na largada: o relatório compara contra a coleta, não contra este enunciado.

---

## 1. O que mudou desde a segunda bateria — o delta sob teste

O delta é **exclusivamente frontend**; `git diff f4f4796~1..58e49b7 -- backend/` é vazio.
Superfície: `frontend/src/features/schedule/components/schedule-calendar.js` e
`ScheduleCalendar.jsx`; `frontend/src/features/tasks/components/KanbanBoard.jsx` e
`TaskDetailsPanel.jsx`; `frontend/src/features/tasks/pages/KanbanScreen.jsx`; seções do
`global.css`; as suítes `ScheduleScreen.test.jsx` e `KanbanPage.test.jsx`.

### 1.1 Barra do marco no calendário (`milestonePeriods` e consumidores)

- O fim do período derivado passou de `max(primeiro, prazo)` para
  **`alcance = max(prazo, menor fim pintado entre as sprints agrupadas)`** — a barra nunca termina
  antes do fim da sprint agrupada que termina primeiro. Sem sprint agrupada, nada muda (colapsa no
  prazo). `Milestone.dueDate` não é tocado: é regra de apresentação, simétrica ao início que já era
  derivado da primeira sprint.
- **O prazo continua sendo o ponto** sob o dia do `dueDate`. Quando `fim !== prazo`, as superfícies
  textuais — legenda, item de marco no painel do mês e `title` dos segmentos — ganham o sufixo
  `· prazo DD/MM`. O chip compacto do marcador e o tile "Marco atual" não mudam.
- `buildEvents` e a descrição acessível do dia trocaram a condição de "início do marco" de
  `inicio !== prazo` para **`inicio !== fim`**, e na descrição o ramo do prazo passou a ser
  avaliado **antes** do ramo do início — dia que é prazo e início ao mesmo tempo anuncia o prazo.
- Cancelada não estende (o componente filtra antes de derivar); o fim à meia-noite é herdado de
  `sprintDayRange`; a extensão não desbloqueia mês novo em `calendarBounds` (o fim estendido é fim
  de sprint pintada, que já entrava nos limites).

### 1.2 Painel "No mês exibido" (abas)

- Os três blocos empilhados viraram um **tablist de quatro abas**: **Todos** (primeira, ativa por
  padrão), Marcos, Sprints, Tarefas — cada uma com badge de contagem **do mês exibido**. "Todos"
  renderiza os três grupos com título e contagem (`Marcos (N)`…); as demais filtram para um grupo.
- Semântica completa: `role="tablist"`/`tab`/`tabpanel` único; *roving tabindex*;
  `ArrowLeft`/`ArrowRight` circulam e `Home`/`End` vão aos extremos, **com seleção acompanhando o
  foco**; a aba ativa **sobrevive à navegação de mês**; aba com zero itens continua clicável e
  mostra o texto vazio do grupo.
- `monthBlocks` trocou `titulo` por `rotulo` (+ `descricao` no bloco de tarefas, que vira `title`
  da aba); os segmentos dividem o trilho por igual (`flex: 1`) — sem sobra à direita no card em
  coluna do desktop nem em 375px.

### 1.3 Kanban (RF08)

- O `<select>` de status **saiu do cartão** — com o comentário que o explicava. O cartão mantém
  clique/Enter para abrir detalhes, arrasto, rótulos de congelada/movendo.
- O **painel de detalhes** (`role="dialog"`, aberto por clique ou Enter/Espaço no cartão) passou a
  ter o seletor na linha "Status atual", com o **mesmo nome acessível de antes**
  (`Mover a tarefa {título}`), `disabled` + `title` quando a sprint da tarefa está congelada e
  `disabled` durante a movimentação em voo.
- `moveTaskToStatus` passou a **sincronizar `selectedTask`** no sucesso — o diálogo aberto reflete
  o status novo sem reabrir. `KanbanBoard` perdeu a prop `onChangeTaskStatus`; o caminho do arrasto
  (`handleColumnDrop → moveTaskToStatus`), o histórico (RF38) e a recusa amigável de sprint
  congelada não mudaram.

### 1.4 Pré-condição de dados

O seed local de 31/08 tem o caso canônico da extensão: "[SEED] Marco de sprint aberta" com prazo
17/08 agrupando a sprint "sdsd" (12/08 – 21/08). A bateria testa **por fixture** os dois lados
(prazo antes e depois do fim) — o seed serve à matriz visual, nunca de fixture.

---

## 2. Invariantes novos desta bateria

A numeração continua a das baterias anteriores. Origem "quinta iteração" = fonte 6 da seção 0.1.

| # | Invariante | Origem |
|---|---|---|
| I50 | Fim do período do marco = `max(prazo, menor fim pintado entre as sprints agrupadas)`; a extensão para na sprint que termina primeiro (nunca na última); sem sprint agrupada o período colapsa no prazo; `dueDate` exposto em `prazo` permanece intacto | quinta iteração D1; ADR-011 D03 preservado |
| I51 | O ponto e o evento de prazo ficam no dia do `dueDate` mesmo com barra estendida; o sufixo `· prazo DD/MM` aparece na legenda, no item do painel e no `title` dos segmentos **exatamente quando** `fim !== prazo` — nunca no chip compacto nem no tile | quinta iteração D2 |
| I52 | Sprint cancelada não estende barra; o fim à meia-noite estende só até o último dia pintado; a extensão não desbloqueia mês novo na navegação | quinta iteração D1; regras herdadas de `sprintDayRange`/`calendarBounds` |
| I53 | "Início — marco" (evento e descrição do dia) existe quando `inicio !== fim`; dia que é prazo e início simultaneamente anuncia o prazo | quinta iteração §4.3 |
| I54 | O painel do mês é um tablist de 4 abas com tabpanel único rotulado pela ativa; roving tabindex; setas circulam e Home/End vão aos extremos com seleção no foco; a aba ativa sobrevive à navegação de mês; aba vazia é clicável e nomeia o vazio | quinta iteração D3 + ajuste 31/08; CONTEXTO §15.2 |
| I55 | "Todos" é a primeira aba e a padrão, com os três grupos titulados e contados; as demais filtram para um grupo; badges contam os itens do mês exibido (Todos = soma) | ajuste 31/08 |
| I56 | Nenhum cartão do Kanban contém combobox; o caminho sem mouse é Enter/Espaço no cartão → diálogo → seletor com o nome acessível `Mover a tarefa {título}` | quinta iteração D5 |
| I57 | O seletor do diálogo fica desabilitado (com `title` explicativo) para tarefa de sprint congelada e durante movimentação em voo; a mensagem amigável de congelada do quadro permanece | quinta iteração D6; ADR-010 D04 |
| I58 | Mover pelo diálogo atualiza o quadro **e** o próprio diálogo (sincronização de `selectedTask`); o arrasto e o histórico de movimentações (RF38) seguem intactos; nenhum caminho novo de mutação além do endpoint de sempre | quinta iteração §6.3 |

---

## 3. Fase 0 — Gate de zero comentários (escopo RF10/RF35)

Re-executar as três varreduras da segunda bateria, sem alteração de escopo:

```bash
grep -rn -E "//|/\*" backend/src/modules/sprints frontend/src/features/schedule
```

```bash
grep -n -E "/\*" frontend/src/styles/global.css
```

```bash
grep -rn -E "(^|\s)//|/\*" backend/test/unit/sprint.service.test.js backend/test/unit/sprint.calculator.test.js backend/test/unit/sprint.progress.calculator.test.js backend/test/unit/sprint.burndown.calculator.test.js backend/test/unit/adr011-milestone-sprint-audit.test.js backend/test/unit/s104-legacy-schedule-dates.test.js backend/test/api/schedule-contracts.test.js backend/test/integration/rf10-sprint-schedule.test.js frontend/test/features/SprintsScreen.test.jsx frontend/test/features/MilestonesScreen.test.jsx frontend/test/features/ScheduleScreen.test.jsx frontend/test/components/SprintActionsMenu.test.jsx frontend/test/components/SprintBurndownChart.test.jsx frontend/test/components/TaskHistorySprint.test.jsx
```

Critério: vazio nos três (falso-positivo de `//` em string/URL julgado pela linha). **O Kanban está
fora do gate** (regra 15) — mas ganha uma conferência própria, de outra natureza: nenhum comentário
**novo** entrou em `KanbanBoard.jsx`, `TaskDetailsPanel.jsx`, `KanbanScreen.jsx` e
`KanbanPage.test.jsx` além dos ajustes previstos na quinta iteração (o comentário do seletor saiu
com o seletor; o do congelamento e os dois dos testes reescritos foram reeditados, não criados).
`git log -p da04918 -- frontend/src/features/tasks frontend/test/pages` é a evidência. Registre a
frase de fechamento por escopo.

---

## 4. Fase 1 — Atualização do mapa critério/invariante ↔ teste

Atualize [RF10_RF35_MAPA_TESTES.md](RF10_RF35_MAPA_TESTES.md) com a seção **"Terceira bateria
(31/08/2026, quinta iteração — inclui RF08)"**:

1. **Linhas novas** I50–I58, no formato `Item | Arquivo::caso | Camada | Situação`
   (`Situação` ∈ {PROVADA, PARCIAL, AUSENTE, CONTRADITA}). Boa parte já tem teste escrito na
   entrega — o trabalho é **citar nominalmente** cada caso e classificar o resto.
2. **Redações superadas**: **I38** dizia "período = menor início pintado → prazo" — o início
   continua valendo, o fim virou o alcance de I50; reescreva a linha apontando para I50 e
   reconfira as células (o caso `'prazo anterior a primeira sprint normaliza o periodo sem
   inverter'` foi **reescrito às claras** como `'…estende do prazo ate o fim dela'`). **I44**
   descrevia blocos empilhados com `titulo` — o painel virou abas; reescreva apontando para
   I54/I55 e reconfira as células (dois casos de painel foram renomeados e três reescritos na
   entrega; os nomes atuais estão em `ScheduleScreen.test.jsx`).
3. **RF08 entra no mapa**: linha própria citando as provas atuais de `KanbanPage.test.jsx` — os
   dois testes reescritos (`'move a tarefa pelo seletor do painel de detalhes, sem mouse'`,
   `'bloqueia a tarefa de sprint congelada no cartao e no painel'`) e os três novos
   (`'o cartao nao tem mais seletor de status'`, `'desabilita o seletor do painel enquanto a
   movimentacao esta em voo'` e o de arrasto preservado da E11).
4. Itens I39–I43 e I45–I49 não mudam de redação; reconfira apenas células cujos casos foram
   renomeados. Item órfão volta a AUSENTE e ganha teste nesta bateria.

Sem o mapa atualizado, as fases seguintes viram escrita de teste ao acaso.

---

## 5. Fase 2 — Unidade: o alcance do marco e os dados das abas

Alvo: os describes de função pura de `ScheduleScreen.test.jsx`. Datas por parâmetro; `TZ` variado
não pode mudar resultado (I36 estendido aos casos novos — rode a suíte com `TZ` alternativo e
compare).

1. **`milestonePeriods` — extensão (I50, I52)**: prazo antes do fim (estende); prazo depois
   (no-op); menor fim entre várias sprints (para na primeira que termina); prazo anterior à
   primeira sprint (estende do prazo ao fim); fim à meia-noite (`endDate` dia 1 → fim dia
   anterior); marco sem sprint (colapsa). Cinco desses seis já existem — **cite-os**; o que faltar,
   escreva.
2. **Caso ausente obrigatório**: sprint agrupada **com data inválida** (`startDate` não parseável)
   — `sprintDayRange` devolve `{inicio: null, fim: null}` e o `filter(Boolean)` de `fins` precisa
   segurar o `reduce`; sem o filtro, array vazio lança. Prove que o marco degrada para o colapso no
   prazo em vez de quebrar.
3. **Sufixo textual (I51)**: `milestoneWeekLayout` com `titulo` carregando `· prazo DD/MM` só com
   extensão e `texto` do chip sem sufixo (existe — citar); `monthBlocks` com meta
   `ini – fim · prazo DD/MM · status · agrupa N` só com extensão (existe — citar); caso negativo
   explícito (sem extensão, sem sufixo) — a igualdade exata dos casos antigos já o prova, registre
   isso no mapa.
4. **Condições de início (I53)**: `buildEvents` com prazo no dia do início e barra estendida gera
   "Início — marco" (existe — citar); `buildMonthGrid` com o mesmo cenário anuncia
   `prazo do marco X` no dia degenerado (existe — citar); ponto de prazo **não** migra para o fim
   estendido e o dia do fim ganha `fimDoMarco` sem `temPrazoDeMarco` (existe — citar).
5. **`monthBlocks` (I55)**: `rotulo`/`descricao` no lugar de `titulo`; a contagem é
   `itens.length`, não campo duplicado (existe — citar).

---

## 6. Fase 3 — Telas: abas e Kanban por papel acessível

Regra de ouro mantida: **papel acessível, nunca classe CSS nem ordem de DOM**. Largura de
segmento, sobra de trilho e alinhamento de seletor no `dl` não viram asserção — vão para a Fase 6.

### 6.1 Painel do mês (`ScheduleScreen.test.jsx`)

1. **Estrutura (I54, I55)**: 4 abas, "Todos" selecionada por padrão, tabpanel único com
   `aria-labelledby` da ativa, grupos titulados na visão Todos (existe — citar:
   `'o painel do mes e um tablist com todos ativo por padrao'`).
2. **Filtro por clique (I55)**: todos → marcos → tarefas → todos, com asserções negativas do que
   saiu de cena (existe — citar: `'trocar de aba filtra o conteudo do painel'`).
3. **Teclado (I54)**: setas com seleção no foco, `Home`/`End` (existe — citar). **Acrescentar**: a
   guarda de teclas neutras — `Tab` a partir da aba ativa **não** é capturado pelo handler (o foco
   segue para o tabpanel, `tabIndex={0}`), e tecla qualquer não muda a seleção.
4. **Vazios (I54, I55)**: os dois vazios juntos na visão Todos; vazio isolado na aba filtrada; aba
   `0` clicável (existe — citar).
5. **Sobrevivência (I54)**: aba ativa preservada ao navegar de mês com badges recalculados
   (existe — citar). **Acrescentar**: mês sem nada (resumo "nada no calendário") com a aba
   filtrada ativa — o painel mostra o vazio do grupo, não quebra.
6. **Regressões nomeadas**: `'dez marcos so de prazo…'` e `'marcos so de prazo nao viram
   trilha…'` agora consultam `getByRole('tab', …)` — confirme no mapa que nenhuma asserção antiga
   ainda válida se perdeu na migração de `heading` para `tab`.

### 6.2 Kanban (`KanbanPage.test.jsx`)

1. **Cartão limpo (I56)**: `within(cartao).queryByRole('combobox')` nulo (existe — citar).
2. **Caminho sem mouse (I56, I58)**: foco no cartão → Enter → diálogo → `selectOptions` →
   chamada `moveTask(id, {toStatus})` → seletor do diálogo reflete o status novo (existe — citar).
   **Acrescentar**: o mesmo fluxo abrindo por **Espaço** (o cartão trata as duas teclas).
3. **Congelada (I57)**: cartão sem arrasto + diálogo com seletor `toBeDisabled()` e `title`
   presente (existe — citar).
4. **Em voo (I57)**: promessa pendente → seletor desabilitado (existe — citar). **Acrescentar**: o
   erro do backend (409) reabilita o seletor e exibe a mensagem do quadro (o `finally` zera
   `movingTaskId`).
5. **Arrasto e histórico intactos (I58)**: os testes de drag/409/paginação da E11 seguem verdes sem
   edição — a evidência é o diff da entrega não os ter tocado; cite-os no mapa como regressão
   reconferida.
6. **Selecionar sem mover**: abrir o diálogo de uma tarefa e escolher **o status atual** no
   seletor não dispara requisição (`moveTaskToStatus` retorna cedo) — caso novo.

---

## 7. Fase 4 — Backend: regressão dirigida, sem rota nova

O delta não criou nem alterou rota; o que mudou é **quem** chama `PATCH /tasks/:id/move` (o diálogo
em vez do cartão) e **o que a UI faz com a resposta** (espalha `movedTask` sobre `selectedTask`).
Confirme no mapa e complete em `test/api` se a prova for PARCIAL:

1. O corpo de sucesso do move devolve a **tarefa completa** (status, sprint, responsável,
   vínculos) — o merge do diálogo depende desse shape; resposta parcial viraria diálogo mentindo.
2. Move de tarefa em sprint terminal → `409` com código estável — é a rede de segurança do
   `disabled` do diálogo.
3. Autorização do move inalterada (matriz permitir/negar da `AUTHORIZATION_MATRIX.md`) — o caminho
   novo de UI não muda o perfil exigido.
4. Suítes de integração e API completas verdes, duas vezes — nenhum teste de backend pode ter
   mudado nesta bateria além de complementos declarados.

---

## 8. Fase 5 — Segurança e LGPD do delta (ASVS 5.0.0, meta L2)

Superfície HTTP intacta; o que muda é interação e composição de tela. Verifique e acrescente à
`docs/security/ASVS_BASELINE.md` uma nota da terceira bateria:

1. **V8 (8.2.1/8.2.2)**: mover pelo diálogo usa o mesmo endpoint com a mesma autorização; nenhum
   caminho de mutação novo para perfil de leitura — cite as provas de `403` existentes e o teste de
   UI que mostra o diálogo respeitando o mesmo fluxo.
2. **V3**: o tablist e o diálogo mantêm semântica nativa (botões reais, `dialog` com
   `aria-modal`); nenhum handler novo em elemento não interativo entrou no delta.
3. **V16 (16.5.1)**: as mensagens novas (`title` de congelada, aviso de movimentação) não ecoam
   valor recebido nem detalhe interno; o corpo de erro do backend segue genérico.
4. **LGPD (CONTEXTO §14)**: o diálogo já exibia responsável e rastreabilidade — o seletor não
   adiciona dado pessoal; o painel de abas exibe títulos e nomes já presentes na tela. Declare em
   uma frase, com a inspeção do payload como evidência.
5. **Não aplicáveis**: nenhum capítulo novo do ASVS passa a incidir (sem upload, sem token novo,
   sem origem nova) — declare.

---

## 9. Fase 6 — Verificação visual (obrigatória, com captura)

Cronograma pelo harness da regra 17 (sem backend); Kanban no ambiente completo do João (aval).
Matriz mínima — cada célula com captura:

| Cenário | Cronograma | Kanban |
|---|---|---|
| Projeto zerado | abas `Todos 0 · Marcos 0 · Sprints 0 · Tarefas 0`, vazios nomeados na visão Todos, trilho sem sobra | colunas vazias, cartão nenhum |
| 1 item por grupo | badges `1`; visão Todos com três grupos; filtro por aba | 1 cartão sem seletor; diálogo com "Status atual" como seletor alinhado no `dl` |
| Seed em escala | marco 12/08–21/08 com ponto de prazo em 17/08 no meio da barra e legenda `· prazo 17/08`; marco com prazo após o fim sem sufixo; marco só-prazo como ponto; painel rolando por aba | 15+ cartões, altura menor e alinhada; congelada com rótulo e diálogo travado |
| Interação | clicar cada aba filtra; setas circulam com anel de foco `#244aa5`; aba ativa sobrevive ao ▼/▲ | mover pelo diálogo atualiza coluna e diálogo sem reabrir; "Movendo..." durante o voo |
| 375px | trilho com 4 segmentos íntegro, sem quebra nem estouro; grade e painel íntegros | colunas empilhadas; diálogo íntegro |
| Dev server atravessado | reiniciar Vite + hard refresh e repetir o clique das abas (regra 16) — registrar que o comportamento limpo confere | — |

---

## 10. Fase 7 — Bateria de mutação (obrigatória)

Mesmo protocolo: neutralizar **uma por vez** no `HEAD`, rodar a suíte, anotar os vermelhos,
reverter. Sobrevivente é achado; a numeração continua.

| # | Mutação aplicada | Item | Testes vermelhos |
|---|---|---|---|
| M57 | `milestonePeriods` reduz pelo **maior** fim das sprints agrupadas | I50 | |
| M58 | `alcance` ignora a comparação e estende sempre para `menorFim` | I50 | |
| M59 | Sufixo `· prazo DD/MM` emitido também quando `fim === prazo` | I51 | |
| M60 | Mapa de prazos de `buildMonthGrid` passa a apontar o fim estendido | I51 | |
| M61 | `buildEvents` volta à condição `inicio !== prazo` | I53 | |
| M62 | Descrição do dia avalia o ramo de início antes do ramo de prazo | I53 | |
| M63 | Aba padrão volta a `'marcos'` | I55 | |
| M64 | `teclasDeAba` move o foco sem ativar (some o `setAbaAtiva`) | I54 | |
| M65 | Navegar de mês reseta a aba para `'todos'` | I54 | |
| M66 | Visão Todos omite grupo com zero itens | I55 | |
| M67 | Badge da aba fixa `0` em vez de `itens.length` | I55 | |
| M68 | O `<select>` volta a renderizar no cartão do Kanban | I56 | |
| M69 | Diálogo ignora `frozen` (seletor nunca desabilita) | I57 | |
| M70 | Diálogo ignora `moving` | I57 | |
| M71 | `moveTaskToStatus` deixa de sincronizar `selectedTask` | I58 | |
| M72 | Enter/Espaço no cartão deixa de abrir o diálogo | I56 | |

Feche com a frase explícita: **"Nenhuma mutação sobreviveu"** ou a lista nominal das sobreviventes.

---

## 11. Fase 8 — Deriva documental

1. `docs/traceability/RF_TECHNICAL_MATRIX.md`: a linha do **RF08** já cita
   `TaskDetailsPanel (troca de status sem arrasto)` (commit `11587a9`) — conferir que nada mais ali
   afirma o seletor no cartão; a linha do **RF10** não pode afirmar o painel de blocos nem o
   desenho antigo da barra. Editar **apenas** o que estiver falso.
2. `docs/issues/TECHNICAL_BACKLOG.md`: achados novos, uma linha cada. Conferir se algum item
   existente foi resolvido de passagem pela quinta iteração e marcar.
3. `docs/security/ASVS_BASELINE.md`: nota da terceira bateria (seção 8).
4. `docs/api/API_CONTRACTS.md` e `AUTHORIZATION_MATRIX.md`: nada muda — confirmar e declarar.
5. Nenhum ADR novo: a quinta iteração não altera regra de domínio (a extensão é apresentação; o
   ADR-011 D03 segue valendo). Se algum teste sugerir o contrário, é achado HIGH, não pauta de ADR.

---

## 12. Critérios de aceite

1. Fase 0 fechada com as duas frases de escopo (zero comentários em RF10/RF35; nenhum comentário
   novo no Kanban).
2. Mapa atualizado: I50–I58 classificados; I38 e I44 reescritos apontando os sucessores; linha de
   RF08 criada; nenhuma linha órfã; nenhum AUSENTE sem teste novo.
3. Frontend e backend verdes, **duas vezes**, com saída colada; `lint`, `format:check`, `build`,
   `architecture:check`, `security:secrets` verdes.
4. Cobertura acima dos limiares vigentes (frontend `50/45/40/53`; backend `85/70/85/87`), sem
   baixá-los, e não abaixo dos números de partida coletados na largada.
5. Tabela de mutação M57–M72 preenchida e fechada.
6. Matriz visual da seção 9 completa, capturas anexadas, extremos incluídos, harness apagado antes
   de qualquer commit.
7. Nenhum teste novo alterou código de produção (exceção única e declarada: remoções da Fase 0, se
   houver).
8. Documentos da Fase 8 conferidos ou corrigidos; relatório da seção 13 escrito.

---

## 13. Relatório final

Atualize [RF10_RF35_RELATORIO_TESTES.md](RF10_RF35_RELATORIO_TESTES.md) com a seção **"Terceira
bateria (31/08/2026, quinta iteração — inclui RF08)"** no formato das anteriores (T1 Resumo, T2
Números, T3 Achados, T4 Mutação M57–M72, T5 Deriva documental, T6 O que não foi testado e por quê,
T7 Checklist do enunciado). Achados no bloco padrão (Onde / Norma violada / Esperado / Observado /
Reprodução / Consequência / Proposta — **sem corrigir na bateria**). Em T6, declare no mínimo: E2E
de navegador segue em `S104-F02`; ASVS L3 fora da meta; a largura igual dos segmentos e o
alinhamento do seletor no `dl` são verificação visual, não asserção.

## Anexo A — Armadilhas conhecidas desta bateria

1. **O espaço entre rótulo e badge da aba é um nó de texto literal** (`{aba.rotulo}{' '}`). Sem
   ele, o navegador computa o nome acessível **sem espaço** (`"Marcos6"`) e toda consulta
   `getByRole('tab', {name: 'Marcos 6'})` falha — foi exatamente o primeiro vermelho da
   implementação. Não "limpar" esse espaço achando que é sobra.
2. **O `title` da aba Tarefas vira descrição acessível no Chrome** — ferramentas de árvore de
   acessibilidade podem exibi-lo no lugar do nome. Asserção sempre pelo nome (`Tarefas N`), nunca
   pelo `title`.
3. **Regra 16 antes de qualquer achado de interação**: dev server que atravessou os commits ligado
   embaralha o estado dos hooks (React Refresh preserva por posição). Reiniciar + hard refresh; só
   o que persistir é defeito.
4. **A página do Kanban tem vários comboboxes** (filtros e histórico). Consultas de cartão e de
   diálogo **sempre** escopadas com `within(...)`; `getByRole('combobox')` global é flake.
5. **O nome acessível do diálogo é o título da tarefa** (`aria-labelledby` no `h2`) —
   `getByRole('dialog', {name: 'Da sprint'})`.
6. **Mock de `moveTask` devolve a tarefa completa**: o diálogo espalha `movedTask` sobre
   `selectedTask`; mock que devolve só `{status}` faz o teste de sincronização passar por acidente
   ou falhar por motivo errado — espelhe o shape real do contrato (Fase 4, item 1).
7. **`aria-disabled` × `disabled`**: setas do calendário usam `aria-disabled` (guarda no handler);
   o seletor do diálogo e as abas usam atributos nativos. `toBeDisabled()` só enxerga o segundo.
8. **`hoje` entra por prop** (`renderCalendar` injeta `new Date(2026, 7, 10, 12)`); fixtures de
   data **sem `Z`** — o calendário ancora no dia local.
9. **Herdadas e ainda válidas**: `.env.test` ausente → suítes de API falham por `429`; **dois MySQL
   na 3306** → credencial "errada" que é banco errado; `prisma db execute` silencioso.
10. **Harness da regra 17**: os arquivos (`dev-harness.html`, `src/dev-harness.jsx`) são
    temporários — o lint cobre `src`, então apagá-los **antes** de `npm run lint`/commit; a entrada
    de launch permanece, os arquivos não.
