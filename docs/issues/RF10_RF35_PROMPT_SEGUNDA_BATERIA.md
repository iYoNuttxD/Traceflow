# Prompt de teste — segunda bateria do RF10 (cronograma) e RF35 (evolução por sprint)

> **Como usar este documento.** Ele é o enunciado completo da **segunda bateria de testes** do RF10
> e do RF35 na branch `joao-dev-v2`, motivada pela **quarta iteração do design de sprints e marcos**
> (30/08/2026), que reescreveu o frontend do cronograma sem tocar uma linha de backend. A primeira
> bateria ([RF10_RF35_PROMPT_TESTES.md](RF10_RF35_PROMPT_TESTES.md)) provou os invariantes de
> domínio A1–A6 e I01–I36 e produziu o mapa
> ([RF10_RF35_MAPA_TESTES.md](RF10_RF35_MAPA_TESTES.md)) e o relatório
> ([RF10_RF35_RELATORIO_TESTES.md](RF10_RF35_RELATORIO_TESTES.md)). Esta bateria **não a repete**:
> ela (a) prova os comportamentos novos I37–I49, (b) verifica que a reescrita não derrubou nenhuma
> prova antiga, (c) reavalia o delta sob ASVS 5.0.0 e LGPD, e (d) **fecha o gate de zero
> comentários** no código dos dois requisitos.
>
> Leia as seções 0 a 3 antes de abrir qualquer arquivo; execute as fases 0 a 8 na ordem; encerre
> pelas seções 9 a 11. Cada fase é um commit próprio. A Fase 7 (mutação) continua sendo a que separa
> cobertura real de cobertura nominal — nenhuma fase anterior é dada por concluída sem ela.

---

## 0. Regras de trabalho (invioláveis)

As 11 regras da primeira bateria valem integralmente — em especial: teste prova comportamento
observável; **teste que falha achou defeito, registre e não corrija na bateria**; funções puras
recebem `cutoff`/`hoje` por parâmetro e nunca chamam `new Date()` por conta própria; evidência de
verde é a saída colada do comando; fixtures sintéticas; achado fora de escopo vai para o
[TECHNICAL_BACKLOG.md](TECHNICAL_BACKLOG.md). Somam-se três regras próprias desta bateria:

12. **Zero comentários no código de RF10/RF35.** Decisão de 27/08/2026, reafirmada em 30/08: o
    racional vive em ADR e documentação, nunca no código — nem em produção, nem em teste, nem no
    CSS das telas. Nome de `describe`/`it` carrega a intenção. Diretiva funcional de lint só é
    aceita quando o lint não puder ser satisfeito de outra forma — hoje **não existe nenhuma** (a
    última, em `useScheduleData.js`, foi resolvida em 30/08 trocando a dependência do efeito). A
    Fase 0 verifica; comentário encontrado durante a bateria é removido no commit da própria fase
    que o encontrou, citado na mensagem.
13. **Ambiente é do João.** Dev server, MySQL, `migrate`, seed e qualquer mutação de dados são
    **propostos como comando e aguardam aval**. As suítes do frontend rodam sem banco — essas rode
    direto. As de `test/api` e `test/integration` do backend exigem `backend/.env.test` e MySQL de
    pé (Anexo B).
14. **Os dois extremos de dados.** Toda verificação visual e todo teste de tela relevante cobre
    projeto zerado, 1 item e o seed em escala (dezenas de sprints/marcos/tarefas). A régua é a das
    iterações anteriores: gráfico ou grade que só funciona com dado bonito é achado.

### 0.1 Fontes normativas e precedência

| Ordem | Fonte | Papel nesta bateria |
|---|---|---|
| 1 | Documento oficial do TCC (Cap. 3) | define o que RF10 e RF35 **são** |
| 2 | `TRACEFLOW_ROADMAP_INCREMENTAL.md`, cartão **S1-04** e DoD comum (§4) | critérios de aceite oficiais — continuam sendo A1–A6 |
| 3 | `TRACEFLOW_CONTEXTO_ARQUITETURA.md` | §12 contratos, §13 segurança, §14 LGPD, §15 estratégia de testes, §17.4 DoD |
| 4 | **OWASP ASVS 5.0.0** (PDF oficial) | requisitos verificáveis de segurança; meta **L2** (CONTEXTO §13.1). A numeração é a do 5.0.0 — validação no V2, frontend web no V3, autorização no V8, logging/erro no V16 |
| 5 | ADRs do repo: **ADR-011 > ADR-010 > ADR-009** | regras de domínio vigentes — o design v4 **não muda nenhuma** |
| 6 | O design v4: artboards `Cronograma/Sprints/Marcos.dc.html` do pacote "Sprint timeline design.zip" | especificação de interface desta entrega — a seção 1 resume o que dele virou código |
| 7 | `docs/api/API_CONTRACTS.md`, `docs/security/ASVS_BASELINE.md`, `docs/security/AUTHORIZATION_MATRIX.md`, `docs/traceability/RF_TECHNICAL_MATRIX.md` | estado declarado — a bateria verifica as declarações |

As ressalvas de leitura da primeira bateria seguem valendo: o envelope `{data, meta}` do CONTEXTO
§12.2 é exemplo, não contrato; capacidades futuras do CONTEXTO não são especificação de
comportamento atual; teste antigo que contradiz ADR-011 é achado, não licença para apagar.

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

Suíte rodada **duas vezes** com resultado idêntico. Na largada, colete e registre os números de
partida (arquivos, casos, cobertura) — o relatório final compara contra eles, não contra números
deste enunciado.

---

## 1. O que mudou desde a primeira bateria — o delta sob teste

A quarta iteração do design (30/08/2026) é **exclusivamente frontend**; `git diff backend/` da
entrega é vazio. Superfície alterada: `frontend/src/features/schedule/**` (todas as telas, os dois
formulários, o módulo puro `schedule-calendar.js`, o `SprintBurndownChart`) e as seções de
cronograma do `global.css`.

### 1.1 Cronograma (`ScheduleScreen` + `ScheduleCalendar`)

- **Layout novo:** seção "Agora" em largura total no topo (cartões *Sprint atual*, *Marco atual*,
  *Tarefas em aberto na sprint atual* — só com sprint ativa — e *Atenção*); grade de duas colunas
  com o calendário e o painel **"No mês exibido"** (blocos Marcos/Sprints/Tarefas com deadline, com
  rolagem interna pareada); **"Próximos eventos"** em grade de cartões ao final.
- **O filtro "Período exibido" foi removido.** O recorte passou a ser o mês exibido com navegação
  presa ao intervalo pintado (D1–D5 da terceira iteração, preservados). O contrato `from`/`to` do
  backend permanece intacto — decisão registrada como **S104-F12** no backlog.
- **Marcos no calendário:** um marco **que agrupa sprints** ganha trilha — tinta de fundo cobrindo
  o período (início da primeira sprint → prazo), segmento de 3px por semana com empilhamento quando
  marcos se sobrepõem, e um **marcador-círculo** na primeira semana visível que abre o nome ao
  clicar (`aria-expanded`, `Escape` fecha sem perder o foco, abrir um fecha o outro). Marco **sem
  sprint não tem trilha**: continua sendo só o ponto de prazo sob o dia, com cor neutra.
- **Tarefas no cronograma:** deadlines viram eventos (`Tarefa · Deadline · status · prioridade ·
  sprint`; avulsas como "Sem sprint"), aparecem em "Próximos eventos", no painel do mês, no cartão
  *Atenção* e no expansor "Tarefas de X neste dia (N)" da agenda (teto de 6 + "… e mais N no
  Kanban da sprint").
- **Célula do dia:** faixa de sprint com traços verticais nos dias exatos de início/fim; tinta de
  marco por baixo; `title`/`aria-label` descritivos ("segunda-feira, 3 de agosto — início de X —
  início do marco Y (agrupa N sprints)"); **hoje só marca a célula do mês exibido** — a repetição
  cinza do mês vizinho fica apenas com o anel de seleção.
- **Legenda filtrada pelo mês exibido** (sprints e marcos com trilha que o intersectam; entrada
  "Prazo de marco" só quando há prazo no mês; oculta quando vazia) e **agenda do dia** com linha de
  contexto ("Dentro de X (ini – fim) · marco Y").
- **Funções puras novas** em `schedule-calendar.js`: `milestonePeriods`, `milestoneWeekLayout`,
  `deadlineTasks`, `monthBlocks`, `monthLegend`, `milestoneColors`; assinaturas novas de
  `buildMonthGrid`, `buildEvents` e `nowTiles`; comparator de eventos total (empate devolve 0).

### 1.2 Sprints (`SprintsScreen`)

- **Coluna única com o formulário no topo**, lista abaixo, e os painéis de **Evolução** e
  **Tarefas** como seções irmãs de largura total abaixo da lista (não mais aninhados no card). A
  variante CSS `--pareadas` da terceira iteração foi removida; o foco de "Editar" no primeiro campo
  preenchido e a devolução do foco no cancelamento **permanecem**.
- **Burndown no painel de Evolução**, na variante **ampla** do `SprintBurndownChart` (geometria
  própria, 4 marcas de eixo em quartis; a matemática é a mesma da compacta usada no Kanban).
  Sem tarefa pontuada, o fallback textual explica a ausência.
- **Bloco "Tarefas da sprint" no formulário:** checkboxes com pontos e aviso "Atualmente em X —
  marcar move a tarefa para cá"; resumo "N selecionadas · P pts". Criar = `POST` da sprint seguido
  de `PUT /sprints/:id/tasks` **apenas se houver seleção**; editar pré-carrega a composição e só
  envia o replace **se ela mudou**; falha no replace preserva a sprint salva e avisa com mensagem
  própria. As tarefas do projeto são carregadas **uma única vez** na carga da tela; VIEWER não as
  carrega.

### 1.3 Marcos (`MilestonesScreen`)

- **Coluna única com o formulário no topo.** Bloco **"Sprints do marco"**: congeladas
  (`CONCLUIDA`/`CANCELADA`) aparecem marcadas no próprio marco e desabilitadas ("Congelada/Cancelada
  — não pode mudar de marco"); as demais movem via `PUT /sprints/:id` com corpo parcial
  `{milestoneId}` (marcar) ou `{milestoneId: null}` (desmarcar na edição), em PUTs sequenciais —
  decisão **S104-F13** no backlog. Nenhum PUT é emitido para sprint cuja associação não mudou.

### 1.4 Pré-condição de dados

O burndown do RF35 queima `estimatedEffort`. O seed local foi pontuado em 30/08 (41 tarefas, 182
pts). A bateria testa **os dois lados**: com pontos (gráfico) e sem pontos (fallback) — sempre por
fixture, nunca dependendo do estado do banco de desenvolvimento.

---

## 2. Invariantes novos desta bateria

A numeração continua a da primeira bateria. Origem "design v4" = artboards da seção 0.1, fonte 6.

| # | Invariante | Origem |
|---|---|---|
| I37 | Trilha, segmento, marcador e tinta existem **somente** para marco que agrupa ≥1 sprint (`comTrilha`); marco só-prazo é ponto de prazo com cor neutra | design v4; ADR-011 D01 (o marco agrupa sprints) |
| I38 | Período do marco = menor início pintado das suas sprints → prazo; sem sprints, o período colapsa no dia do prazo (vale para painel do mês, tiles e eventos; prazo anterior à primeira sprint normaliza o intervalo sem inverter) | design v4 |
| I39 | Marcador é botão acessível: um por marco, na primeira semana visível da trilha; `aria-expanded` correto; abrir um fecha o aberto; `Escape` fecha mantendo o foco no botão; `title` carrega nome, período e agrupamento | design v4; CONTEXTO §15.2 |
| I40 | `hoje` marca apenas a célula do mês exibido; a repetição do mesmo dia no mês vizinho fica só com o anel de seleção; selecionar dia cinza além do limite não move a vista (D da 3ª iteração preservada) | design v4 |
| I41 | Legenda reflete o mês exibido: sprints/marcos que o intersectam; "Prazo de marco" só com prazo no mês; lista oculta quando vazia; navegação de mês atualiza a legenda | design v4 |
| I42 | Eventos: início/fim de sprint; início de marco só quando agrupa sprints e o período não colapsa; prazo de marco com status; deadline de tarefa (com sprint nomeada ou "Sem sprint"); ordenação por dia com comparator total — empates preservam a ordem de emissão | design v4; `schedule-calendar.js` |
| I43 | Tiles: *Sprint atual* traz período pintado e progresso de tarefas; *Marco atual* é o pendente que contém hoje, senão o próximo por prazo, senão o último vencido; *Tarefas em aberto* só existe com sprint ativa; *Atenção* prioriza atraso e, sem atraso, aponta o próximo deadline **não concluído** | design v4 |
| I44 | "No mês exibido" agrupa por interseção com o mês de calendário real (último dia correto, nunca "31" fixo); cada bloco vazio nomeia o vazio; o resumo soma as três contagens | design v4 |
| I45 | Formulário de sprint: criar sem seleção não chama replace; criar com seleção chama replace com o id devolvido pelo POST; editar só chama replace quando a seleção difere da composição carregada; falha no replace preserva a sprint salva, avisa com mensagem própria e ressincroniza | design v4; ADR-010 D14 (teto de 100 continua valendo no backend) |
| I46 | Formulário de marco: congelada nunca entra na seleção nem gera PUT (a imutabilidade de I04 é a autoridade no backend); mover gera exatamente um PUT por sprint marcada de outro marco; desmarcar na edição gera PUT com `milestoneId: null`; quem não mudou não gera requisição | design v4; ADR-011 D02; ADR-010 D04 |
| I47 | VIEWER: coluna única sem formulário nas três telas; `listProjectTasks` **não** é chamada; nenhuma ação de mutação em lista, painel ou calendário | CONTEXTO §13.5; ASVS 8.2.1 |
| I48 | A variante ampla do burndown altera só geometria e marcas de eixo — nota, fallback, congelamento e matemática idênticos aos da compacta | design v4; I32–I35 |
| I49 | Economia de requisições: a carga da tela de Sprints busca as tarefas do projeto uma única vez; salvar sprint não rebusca marcos, projeto nem tarefas; abrir painel de tarefas reaproveita o catálogo já carregado | design v4; CONTEXTO §12.1 |

---

## 3. Fase 0 — Gate de zero comentários (único commit que toca produção)

Varredura registrada em 30/08/2026, com resultado **zero** — esta fase re-executa e transforma em
gate permanente. Escopo (o código dos dois requisitos, conforme
[RF_TECHNICAL_MATRIX.md](../traceability/RF_TECHNICAL_MATRIX.md)):

```bash
grep -rn -E "//|/\*" backend/src/modules/sprints frontend/src/features/schedule
```

```bash
grep -n -E "/\*" frontend/src/styles/global.css
```

```bash
grep -rn -E "(^|\s)//|/\*" backend/test/unit/sprint.service.test.js backend/test/unit/sprint.calculator.test.js backend/test/unit/sprint.progress.calculator.test.js backend/test/unit/sprint.burndown.calculator.test.js backend/test/unit/adr011-milestone-sprint-audit.test.js backend/test/unit/s104-legacy-schedule-dates.test.js backend/test/api/schedule-contracts.test.js backend/test/integration/rf10-sprint-schedule.test.js frontend/test/features/SprintsScreen.test.jsx frontend/test/features/MilestonesScreen.test.jsx frontend/test/features/ScheduleScreen.test.jsx frontend/test/components/SprintActionsMenu.test.jsx frontend/test/components/SprintBurndownChart.test.jsx frontend/test/components/TaskHistorySprint.test.jsx
```

Critério: as três varreduras devolvem vazio. Falso-positivo aceitável: `//` dentro de string ou de
URL — julgue pela linha, não pelo padrão. Achado real é removido nesta fase (racional que o
comentário carregava vai para ADR ou doc, se ainda não estiver), com a suíte verde antes e depois.
Registre no relatório a frase de fechamento: **"Nenhum comentário no código de RF10/RF35"** ou a
lista do que foi removido e para onde o racional foi.

---

## 4. Fase 1 — Atualização do mapa critério/invariante ↔ teste

Atualize [RF10_RF35_MAPA_TESTES.md](RF10_RF35_MAPA_TESTES.md):

1. **Linhas novas** I37–I49, no mesmo formato (`Item | Arquivo::caso | Camada | Situação`,
   `Situação` ∈ {PROVADA, PARCIAL, AUSENTE, CONTRADITA}). Boa parte já tem teste escrito na entrega
   de 30/08 — o trabalho é **citar nominalmente** o caso que prova cada um e classificar o resto.
2. **Reclassificação de regressão**: todo item A1–A6/I01–I36 cuja prova morava em teste alterado
   pela reescrita (as três suítes de tela mudaram muito; dois testes de economia de requisições e o
   de "não oferece campo de sprint" foram **reescritos às claras** por codificarem comportamento
   superado) precisa ter a célula `Arquivo::caso` reconferida. Item que ficou órfão volta para
   AUSENTE e ganha teste nesta bateria.
3. Itens A3 (cronograma apresenta tarefas, sprints, prazos e marcos) e A6 (permissões, fórmulas,
   fusos e limites) ganharam superfície nova — a prova antiga não basta; aponte também os casos
   novos.

Sem o mapa atualizado, as fases seguintes viram escrita de teste ao acaso.

---

## 5. Fase 2 — Unidade: as puras novas do calendário

Alvo: `frontend/test/features/ScheduleScreen.test.jsx` (describes de função pura) — ou arquivo
próprio se o volume justificar. Todas recebem datas por parâmetro; `TZ` variado não pode mudar
resultado (I36 estendido às novas).

Cobrir obrigatoriamente:

1. **`milestonePeriods`** (I37, I38): derivação do início pela primeira sprint; `comTrilha`
   verdadeiro/falso; colapso no prazo sem sprints; prazo anterior à primeira sprint (intervalo
   normalizado); `nSprints`/`nConcluidas`; ordenação por início derivado com desempate por id;
   marco sem `dueDate` descartado.
2. **`milestoneWeekLayout`** (I37, I39): recorte por semana com arredondamento só nas pontas reais;
   segmento e marcador ausentes para marco sem trilha; marcador só na primeira semana visível;
   empilhamento de segmentos e de marcadores em linhas próprias quando dois marcos estreiam na
   mesma semana; `alturaTopo` cresce com o empilhamento e repousa em 4 sem nada.
3. **`deadlineTasks`** (I42): união sprint+avulsas ordenada por dia com desempate por id; tarefa sem
   deadline descartada; `sprintNome` nulo para avulsa.
4. **`buildMonthGrid`** (I40, I37): `hoje` só no mês exibido (o par agosto/setembro do mesmo dia é o
   caso canônico); tinta/`marcoId` só de marco com trilha; `prazoAgrupado` distinguindo o ponto
   colorido do neutro; `descricao` composta (dia — sprint — marco — prazo) nos dias notáveis.
5. **`buildEvents`** (I42): início de marco só com trilha e período não colapsado; meta de deadline
   completa; comparator estável com eventos no mesmo dia; aviso de sprint atrasada preservado
   (regressão de I01–I36).
6. **`nowTiles`** (I43): os quatro cartões com sprint ativa; três sem; marco contendo hoje vs
   próximo por prazo vs todos concluídos vs nenhum cadastrado; próximo deadline ignora tarefa
   concluída; pluralizações.
7. **`monthBlocks` e `monthLegend`** (I41, I44): interseção em mês de 28/30/31 dias; bloco vazio
   nomeado; resumo; marco sem trilha fora da legenda mas dentro do bloco (com "Prazo dd/mm");
   "Prazo de marco" condicionado ao mês.

---

## 6. Fase 3 — Telas: o design v4 por papel acessível

Alvos: as três suítes de tela + `SprintBurndownChart.test.jsx`. Regra de ouro mantida: **papel
acessível, nunca classe CSS nem ordem de DOM** (a variante de layout não vira asserção — vai para a
verificação visual da seção 9).

1. **Marcador de marco** (I39): `getByRole('button', {name: 'Marco X · ini – fim · agrupa N
   sprints'})`; `aria-expanded` alterna; abrir A e depois B fecha A; `Escape` fecha; o nome abre e
   fecha como texto visível.
2. **Cronograma nos extremos** (Regra 14): projeto zerado (grade no mês corrente travado, legenda
   oculta, blocos do mês vazios nomeados, "Nenhum evento futuro"); 1 sprint + 1 marco; muitos
   marcos só-prazo (nenhuma trilha, pontos e painel do mês íntegros).
3. **Agenda**: contexto "Dentro de X … · marco Y"; expansor com teto de 6 e sufixo "… e mais N";
   estado vazio citando sprint, marco, prazos e deadlines de tarefa.
4. **Tiles** (I43): presença/ausência do cartão de tarefas em aberto conforme sprint ativa.
5. **Filtro removido**: `queryByRole('heading', {name: 'Período exibido'})` nulo; sem `Data
   inicial`/`Filtrar` (a prova de que a navegação limitada absorveu o recorte já vive nos testes de
   limite da 3ª iteração — confirme no mapa).
6. **Formulário de sprint** (I45, I49): grupo `Tarefas da sprint` por `getByRole('group')`; resumo
   reativo com soma de pontos; hint de mover; criar com seleção → `replaceSprintTasks(idDevolvido,
   ids)`; criar sem seleção → replace não chamado; editar pré-carrega, troca e envia só a nova
   composição; falha no replace → mensagem "Sprint salva, mas não foi possível atualizar as
   tarefas da sprint."; carga única de `listProjectTasks` e nenhuma rebusca ao salvar.
7. **Formulário de marco** (I46): grupo `Sprints do marco`; congelada marcada+desabilitada com
   hint; mover e soltar geram exatamente os `updateSprint` esperados; quem não mudou não gera
   chamada; criar já leva as marcadas.
8. **Evolução com burndown** (I48): painel traz "Burndown" e a nota calculada quando o payload tem
   `hasData: true`; fallback "Sem tarefas pontuadas…" quando não tem; a variante ampla marca o eixo
   em quatro datas; congelada fala no passado (regressão I30/I33).
9. **VIEWER** (I47): três telas sem formulário e sem `listProjectTasks`; painel de tarefas em
   consulta; calendário navegável.
10. **Regressões nomeadas da 1ª bateria**: menu "Mais ações" (fechamento, foco, ausência de
    Editar/Cancelar em terminal **com o menu aberto**), respostas fora de ordem entre painéis,
    quatro estados por tela, diálogo "Voltar"/`button-primary`. Elas atravessaram a reescrita — o
    mapa da Fase 1 diz onde cada uma vive agora.

---

## 7. Fase 4 — Backend: regressão dirigida, sem rota nova

O delta não criou nem alterou rota — mas passou a **depender** de dois contratos que a primeira
bateria provou de passagem e agora são caminho quente. Confirme no mapa e, se a prova for PARCIAL,
complete em `schedule-contracts.test.js`:

1. `PUT /sprints/:id` com corpo parcial `{milestoneId: N}` e `{milestoneId: null}` — o fluxo de
   mover sprints do formulário de marcos emite exatamente isso (I46; ADR-011 D02).
2. `PUT /sprints/:id` em sprint terminal → `409 SPRINT_LOCKED` — é a rede de segurança da UI que
   desabilita congeladas (I04/I46).
3. `POST /projects/:id/sprints` devolve `sprint.id` no corpo — o encadeamento do replace depende
   disso (I45).
4. `PUT /sprints/:id/tasks` com lote acima do teto → `409 SPRINT_TASK_LIMIT_REACHED` — o formulário
   novo permite marcar o catálogo inteiro (I07/I45).
5. Suítes de integração e API completas verdes, duas vezes — nenhum teste de backend pode ter
   mudado nesta bateria além dos complementos acima.

---

## 8. Fase 5 — Segurança e LGPD do delta (ASVS 5.0.0, meta L2)

A superfície HTTP não mudou; o que muda é **orquestração no cliente e informação nova na tela**.
Verifique e atualize `docs/security/ASVS_BASELINE.md` (acrescentando ao S1-04 uma nota da segunda
bateria):

1. **V8 (8.2.1/8.2.2) reconfirmados pela composição**: os fluxos compostos (criar+replace;
   mover marcos) não abrem caminho de mutação para VIEWER — o teste de UI de I47 e os `403` da
   primeira bateria seguem sendo a prova; cite-os na baseline.
2. **V2/2.3.3 na falha parcial do cliente**: criar sprint com replace falhando deixa o servidor
   consistente (sprint criada, composição intacta) e a UI avisa e ressincroniza — não há "sucesso
   parcial silencioso" (CONTEXTO §13.10). O mesmo para a sequência de PUTs do formulário de marcos
   (S104-F13): falha no meio interrompe, avisa e ressincroniza; cada PUT é atômico no servidor.
3. **V16 (16.5.1)**: as mensagens novas de erro da UI não ecoam valor recebido nem detalhe interno;
   o corpo de erro do backend segue genérico.
4. **LGPD (CONTEXTO §14)**: o calendário passou a exibir títulos de tarefa e nomes de sprint/marco
   — nenhum dado pessoal novo (sem responsável, sem e-mail) entra no cronograma, nos tiles, nos
   eventos ou no expansor. Asserção sobre a forma renderizada + inspeção do payload consumido.
   Fixtures novas continuam sintéticas.
5. **Não aplicáveis**: nenhum capítulo novo do ASVS passa a incidir por causa do delta (sem upload,
   sem token novo, sem origem nova) — declare em uma frase.

---

## 9. Fase 6 — Verificação visual (obrigatória, com captura)

Dev server proposto ao João (Regra 13); seed em escala já pontuado (§1.4). Matriz mínima — cada
célula com captura:

| Cenário | Cronograma | Sprints | Marcos |
|---|---|---|---|
| Projeto zerado | grade travada no mês corrente, sem legenda, blocos vazios nomeados | formulário no topo + lista vazia | idem |
| 1 item | trilha única com marcador; clique abre/fecha o nome | painel de evolução com burndown amplo | bloco de sprints com uma opção |
| Seed em escala | marcos só-prazo sem trilha; sem sobreposição de texto; dots íntegros; "No mês exibido" rolando | lista rola por dentro; painéis abaixo da lista em largura total | congeladas travadas no bloco |
| Mês vizinho | **um único "hoje"**; 30 cinza só com anel de seleção | — | — |
| 375px (mobile) | grade íntegra; painéis empilhados | formulário → lista → painéis | idem |
| VIEWER | sem formulário, coluna única | idem | idem |

---

## 10. Fase 7 — Bateria de mutação (obrigatória)

Mesmo protocolo: neutralizar **uma por vez** no `HEAD`, rodar a suíte, anotar vermelhos, reverter.
Sobrevivente é achado; a numeração continua a da primeira bateria.

| # | Mutação aplicada | Item | Testes vermelhos |
|---|---|---|---|
| M38 | `milestonePeriods` marca `comTrilha: true` para marco sem sprint | I37 | |
| M39 | `milestoneWeekLayout` volta a desenhar trilha de marco sem sprint | I37 | |
| M40 | `buildMonthGrid` marca `hoje` sem conferir o mês exibido | I40 | |
| M41 | Marcador deixa de fechar o anterior ao abrir outro | I39 | |
| M42 | Marcador perde `aria-expanded` | I39 | |
| M43 | Comparator de eventos volta a `a.dia < b.dia ? -1 : 1` | I42 | |
| M44 | `deadlineTasks` deixa de descartar tarefa sem deadline | I42 | |
| M45 | `nowTiles` deixa de filtrar tarefa concluída do próximo deadline | I43 | |
| M46 | Cartão "Tarefas em aberto" renderiza sem sprint ativa | I43 | |
| M47 | `monthRange` fixa o fim do mês em dia 31 | I44 | |
| M48 | Legenda deixa de filtrar pelo mês exibido | I41 | |
| M49 | Submit da sprint chama replace mesmo sem mudança na seleção | I45/I49 | |
| M50 | Submit da sprint engole a falha do replace sem aviso | I45 | |
| M51 | Formulário de marco emite PUT também para sprint congelada | I46 | |
| M52 | Formulário de marco deixa de soltar (`milestoneId: null`) as desmarcadas | I46 | |
| M53 | Tela de Sprints busca `listProjectTasks` para VIEWER | I47 | |
| M54 | Variante ampla do burndown altera a nota calculada | I48 | |
| M55 | Expansor da agenda perde o teto de 6 tarefas | design v4 | |
| M56 | `prazoAgrupado` passa a colorir todo ponto de prazo | I37 | |

Feche com a frase explícita: **"Nenhuma mutação sobreviveu"** ou a lista nominal das sobreviventes.

---

## 11. Fase 8 — Deriva documental

1. `docs/traceability/RF_TECHNICAL_MATRIX.md`: as linhas de RF10 e RF35 não podem afirmar nada que
   o design v4 removeu (filtro de período) nem omitir o que ele criou (formulários com composição;
   burndown na tela de Sprints). Editar **apenas** o que estiver falso.
2. `docs/issues/TECHNICAL_BACKLOG.md`: S104-F12 (parâmetros `from`/`to` sem consumidor de UI) e
   S104-F13 (PUTs sequenciais do formulário de marcos) conferidos; achados novos desta bateria
   acrescentados uma linha cada.
3. `docs/security/ASVS_BASELINE.md`: nota da segunda bateria (seção 8).
4. `docs/api/API_CONTRACTS.md` e `AUTHORIZATION_MATRIX.md`: nada muda — confirmar e declarar.
5. Nenhum ADR novo: o design v4 não altera regra de domínio. Se algum teste sugerir o contrário,
   isso é achado HIGH, não pauta de ADR desta bateria.

---

## 12. Critérios de aceite

1. Fase 0 fechada com a frase de zero comentários.
2. Mapa atualizado: I37–I49 classificados; nenhuma linha antiga órfã; nenhum AUSENTE sem teste novo.
3. Frontend e backend verdes, duas vezes, com saída colada; `lint`, `format:check`, `build`,
   `architecture:check`, `security:secrets` verdes.
4. Cobertura acima dos limiares vigentes (frontend `50/45/40/53`; backend `85/70/85/87`), sem
   baixá-los.
5. Tabela de mutação M38–M56 preenchida e fechada.
6. Matriz visual da seção 9 completa, capturas anexadas, extremos incluídos.
7. Nenhum teste novo alterou código de produção (exceção única e declarada: remoções da Fase 0).
8. Documentos da Fase 8 conferidos ou corrigidos.

---

## 13. Relatório final

Atualize [RF10_RF35_RELATORIO_TESTES.md](RF10_RF35_RELATORIO_TESTES.md) com uma seção **"Segunda
bateria (design v4)"** no mesmo formato da primeira: resumo por RF + postura ASVS; números
antes/depois; achados por severidade no bloco padrão (Onde / Norma violada / Esperado / Observado /
Reprodução / Consequência / Proposta — **sem corrigir na bateria**); tabela de mutação; deriva
documental; o que não foi testado e por quê (no mínimo: E2E de navegador segue em `S104-F02`;
ASVS L3 fora da meta; sobreposição visual de rótulos herdada do design quando dois marcos com
trilha estreiam na mesma semana — mitigada pelo empilhamento de marcadores).

## Anexo A — Armadilhas conhecidas desta bateria

1. **`.env.test` ausente** → suítes de API falham por `429`; **dois MySQL na 3306** → credencial
   "errada" que é banco errado (herdadas da 1ª bateria, seguem valendo).
2. **`getByRole('group')`**: os blocos de composição são `<fieldset>` nomeados pelo `<legend>` —
   é assim que se alcançam por papel.
3. **Nome acessível de checkbox inclui o hint**: "Alocada — A fazer · Média · 3 pts Atualmente em
   X…" — case por regex no trecho estável, nunca por igualdade do texto completo.
4. **`clearAllMocks` × carga única de tarefas**: o efeito que busca `listProjectTasks` dispara
   quando `loading` vira falso; limpar mocks antes de `waitFor(listProjectTasks)` produz flake — o
   teste de economia espera a chamada antes de limpar.
5. **`hoje` entra por prop** (`renderCalendar` já injeta `new Date(2026, 7, 10, 12)`); fixture de
   data **sem `Z`** — o calendário ancora no dia local.
6. **`aria-disabled` × `disabled`**: setas de navegação usam `aria-disabled` (guarda no handler);
   checkboxes congeladas usam `disabled` nativo. `toBeDisabled()` só enxerga o segundo.
7. **O conteúdo de `<details>` fechado é consultável** no jsdom — o teto do expansor se afirma pela
   presença/ausência dos itens, não por visibilidade.
8. **`prisma db execute` é silencioso** em DML e não devolve linhas de SELECT — verificação de
   dados é pela aplicação ou por client dedicado.
9. **A numeração ASVS é a do 5.0.0** — confira o texto no PDF oficial antes de citar (V2 validação,
   V3 frontend web, V8 autorização, V16 logging/erro).
