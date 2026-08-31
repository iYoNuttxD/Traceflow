# Mapa critério/invariante ↔ teste — bateria RF10/RF35

> Fase 1 da bateria descrita em `RF10_RF35_PROMPT_TESTES.md`. Executada em 25/08/2026 sobre a
> branch `joao-dev-v2` (baseline: backend 483 testes / 36 arquivos verdes; frontend 214 / 29).
>
> `Situação` ∈ { PROVADA, PARCIAL, AUSENTE, CONTRADITA }. Itens PARCIAL/AUSENTE apontam o teste
> novo que os fecha: `B*` = `backend/test/{unit,api}/rf10-rf35-bateria.test.js`, `F*` = adições no
> frontend. Nenhum item terminou a bateria em AUSENTE.

## Critérios oficiais do S1-04

| Item | Prova | Camada | Situação |
|---|---|---|---|
| A1 sprint possui projeto, nome, objetivo, início, fim e status | `schedule-contracts.test.js:88` afirma `projectId/name/status`; **objective/startDate/endDate sem asserção** → fechado por B-A1 | API | PARCIAL → coberta |
| A2 tarefa só em sprint do mesmo projeto | `schedule-contracts:588`; `sprint.service.test.js:828,839,849`; lados tarefa/sprint indistinguíveis `schedule-contracts:1140,1164` | API+unit | PROVADA |
| A3 cronograma com tarefas, sprints, prazos e marcos | `schedule-contracts:790`; `sprint.service.test.js:1229–1300`; `ScheduleScreen.test.jsx` (grade, eventos, agenda) | API+unit+UI | PROVADA |
| A4 evolução: planejado, concluído, percentual, corte | `schedule-contracts:859,540`; `sprint.progress.calculator.test.js:49–118`; burndown suite | API+unit | PROVADA |
| A5 adições/remoções pós-planejamento identificáveis | `sprint.progress.calculator.test.js:120–166`; `schedule-contracts:859`; `SprintsScreen.test.jsx:1461` | unit+API+UI | PROVADA |
| A6 permissões, fórmulas, fusos e limites testados | permissões `schedule-contracts:1042–1200`; fórmulas Fase 2; fusos `sprint.service:201–255`, `schedule-contracts:288–316`; limites `schedule-contracts:154,372,385` | todas | PROVADA |

## Invariantes RF10

| # | Prova | Situação |
|---|---|---|
| I01 janela semiaberta sem sobreposição | `sprint.service:408,422,434,440`; `schedule-contracts:212,237,317` | PROVADA |
| I02 duração zero recusa | `sprint.service:166,177`; HTTP `schedule-contracts:154,385` | PROVADA |
| I03 cancelada libera datas | `sprint.service:451` (só service) → HTTP fechado por B-I03 | PARCIAL → coberta |
| I04 terminal imutável | `sprint.service:759–800`; `schedule-contracts:165,602,636,671,685` | PROVADA |
| I05 instante exato preservado | `sprint.service:201,212,239`; `schedule-contracts:288,307`; `rf10-sprint-schedule:92` | PROVADA |
| I06 DELETE 405 antes de qualquer leitura | `sprint.service:815` (precedência); HTTP só com id existente (`schedule-contracts:194`) → id **inexistente** fechado por B-I06 | PARCIAL → coberta |
| I07 teto único de 100 | `sprint.service:866`; `schedule-contracts:772,1490` | PROVADA |
| I08 `to` inclusivo em UTC | `sprint.calculator:111–160`; `sprint.service:1244,1252`; `schedule-contracts:839` | PROVADA |
| I09 locks antes de leituras | `sprint.service:267,279,632`; `rf10-sprint-schedule:259–485` | PROVADA |
| I10 vínculo invertido (ADR-011) | `rf10-sprint-schedule:47` (asserção negativa da coluna antiga) | PROVADA |
| I11 marco com sprints não exclui | `sprint.service:1139,1145`; `schedule-contracts:429`; `MilestonesScreen.test:232` | PROVADA |
| I12 marco obrigatório na criação, null depois | `sprint.service:334,383`; `schedule-contracts:372,350` | PROVADA |
| I13 prazo do marco livre | `sprint.service:1117`; `MilestonesScreen.test:294` | PROVADA |
| I14 marco editável com sprint terminal apontando | **nenhum teste** → fechado por B-I14 | AUSENTE → coberta |
| I15 conclusão automática (ADR-011 D05) | `sprint.service:709,720,732,743,750`; `schedule-contracts:503,519`; `rf10-sprint-schedule:401,427` | PROVADA |
| I16 nota automático/manual derivada | `MilestonesScreen.test:161,176`; barra cheia no manual **sem teste** → F-barra | PARCIAL → coberta |
| I17 conclusão manual reabre | `sprint.service:1123`; `schedule-contracts:399`; reabrir-sem-confirmação **sem teste** → F-reabrir | PARCIAL → coberta |
| I18 sprint única em andamento | `sprint.service:596–645`; `schedule-contracts:460`; `rf10-sprint-schedule:323` | PROVADA |
| I19 devolução ao backlog sem tocar participação | `sprint.service:646–700`; `schedule-contracts:484,602`; `rf10-sprint-schedule:356` | PROVADA |
| I20 matriz de transições | `sprint.service:493–595`; `schedule-contracts:165` | PROVADA |
| I21 nome único por projeto | `sprint.service:465,477`; `schedule-contracts:140`; `rf10-sprint-schedule:105,113` | PROVADA |
| I22 404 indistinguível | `schedule-contracts:1302–1391` | PROVADA |
| I35* teto de 180 dias do burndown | **nenhum teste** → fechado por B-I35 (contrato atual: **truncamento silencioso** em 180 pontos) | AUSENTE → coberta |
| I36* determinismo/fusos | `sprint.progress.calculator.test:246` (roda 2×, cutoff fixo); equivalência de offset no burndown **sem teste** → B-I36; execução com `TZ` variado na aceitação | PARCIAL → coberta |

\* I35/I36 são do RF35; mantidos na numeração do prompt.

## Invariantes RF35

| # | Prova | Situação |
|---|---|---|
| I23 fonte é a participação | `sprint.progress.calculator.test:203,227`; `schedule-contracts:1531–1591` | PROVADA |
| I24 exitStatus vence | `sprint.progress.calculator.test:75,81`; `sprint.burndown.calculator.test:199` | PROVADA |
| I25 baseline STARTED_AT/OPEN | `sprint.progress.calculator.test:50,54` | PROVADA |
| I26 base OPEN: planned == current | `sprint.progress.calculator.test:60`; `schedule-contracts:946` | PROVADA |
| I27 planned inclui removidas | `sprint.progress.calculator.test:110` | PROVADA |
| I28 saldo líquido | `sprint.progress.calculator.test:156` | PROVADA |
| I29 percentage null ≠ 0 | `sprint.progress.calculator.test:98`; `schedule-contracts:959`; `SprintsScreen.test:900` | PROVADA |
| I30 frozen + cutoff no encerramento | `sprint.progress.calculator.test:193,239`; `sprint.burndown.calculator.test:214,234`; `schedule-contracts:974`; estabilidade entre 2 chamadas reforçada em B-I30 | PROVADA |
| I31 carryOver | `sprint.progress.calculator.test:169`; `sprint.service:911–997` | PROVADA |
| I32 janela semiaberta do burndown | `sprint.burndown.calculator.test:33,69,133` | PROVADA |
| I33 remaining null após o corte | `sprint.burndown.calculator.test:146,157` | PROVADA |
| I34 linha ideal indiferente ao real | `sprint.burndown.calculator.test:94,105` | PROVADA |

## Mudanças de 24/08 (design v2 — seção 3.3 do prompt)

O design v2 **está aplicado** na árvore (`SprintActionsMenu` importado por `SprintList`;
`ConfirmDialog` com "Voltar" e `button-primary` no não destrutivo; rodapé de marcos com
Concluir/Reabrir). Cobertura:

| Item | Prova | Situação |
|---|---|---|
| Cancelada some do calendário/contagens | `ScheduleScreen.test:344`; `MilestonesScreen.test:125` | PROVADA |
| Menu abre e ações vivem nele | helper `abrirMenu` (`SprintsScreen.test:66`) usado pela suíte | PROVADA |
| Ausência de Editar/Cancelar com menu **aberto** em terminal | `SprintsScreen.test:330,1410` | PROVADA |
| Menu fecha por clique fora / Escape devolvendo foco / **rolagem**; ARIA (`aria-haspopup`/`aria-expanded`) | **nenhum teste** → F-menu (`SprintActionsMenu.test.jsx`) | AUSENTE → coberta |
| Diálogo: recusa é "Voltar" | `SprintsScreen.test:589` | PROVADA |
| Diálogo: não destrutivo é `button-primary` | **sem teste** → F-dialogo | AUSENTE → coberta |
| Marco: Excluir desabilitado com sprints + title | `MilestonesScreen.test:232` | PROVADA |
| Marco: aviso "Nenhuma sprint associada" | **sem teste** → F-semSprints | AUSENTE → coberta |
| Marco: barra cheia em concluído manual | **sem teste** → F-barra | AUSENTE → coberta |
| Marco: Reabrir não pede confirmação | **sem teste** → F-reabrir | AUSENTE → coberta |
| Estados por tela (ROADMAP §4): Milestones e Schedule sem teste de **erro recuperável** | Sprints tem os 4 (`SprintsScreen.test:139–166`) → F-erro (2 adições) | PARCIAL → coberta |
| Burndown acessível (role="img", legenda em texto, sem-dados) | componente implementa; **nenhum teste** → F-burndown (`SprintBurndownChart.test.jsx`) | AUSENTE → coberta |

## ASVS 5.0.0 — declarações da `ASVS_BASELINE.md` (S1-04)

| Controle | Evidência conferida | Situação |
|---|---|---|
| 1.2.4 | repositories só com Prisma parametrizado; único `$queryRaw` é o lock com template e IDs internos (`sprint.repository.js`) | PROVADA (inspeção + M-suite) |
| 2.2.1 | `sprint.validation.js` (Zod estrito); `schedule-contracts:772,1217` | PROVADA |
| 2.2.2 | payload inválido direto na API: `schedule-contracts:154,372,1204` | PROVADA |
| 2.2.3 | janela `sprint.service:162–316`; mesmo projeto A2 | PROVADA |
| 2.3.1 | máquina de estados `sprint.service:493`; `schedule-contracts:165` | PROVADA |
| 2.3.3 | `rf10-sprint-schedule:199,222` (rollback total) | PROVADA |
| 4.1.1 | **sem teste no módulo** → B-headers (charset) | PARCIAL → coberta |
| 8.2.1 | `schedule-contracts:1058` (403 VIEWER / MEMBER escreve) | PROVADA |
| 8.2.2 | `schedule-contracts:1083–1200` (todos os métodos, + progress :1004,1025) | PROVADA |
| 8.3.1 | toda a suíte de API é sem frontend; autorização no middleware+service | PROVADA |
| 16.2.2 | `sprint.calculator.test:86–108`; `sprint.service:1300` | PROVADA |
| 16.3.2 | logger com redaction; 403/404 nos testes acima | PROVADA (evidência indireta) |
| 16.3.3 | `schedule-contracts:1231,1281` (um AuditEvent por mutação, ator da sessão) | PROVADA |
| 16.5.1 | `schedule-contracts:1204` (400 sem eco); `shared-infrastructure.test:83–98` (500 sem stack) | PROVADA |

## ASVS 5.0.0 — controles aplicáveis ainda sem declaração (fase 9.2)

| Controle | Evidência encontrada / criada | Situação |
|---|---|---|
| 2.1.3 limites documentados | 100 tarefas em `API_CONTRACTS.md:215,278,442`; **teto de 180 dias do burndown não documentado** → Fase 8 | PARCIAL → corrigida na doc |
| 2.3.2 limites implementados | I07 + I35 | PROVADA |
| 2.3.4 lock anti dupla reserva | `rf10-sprint-schedule:259–356`; `schedule-contracts:237,261` | PROVADA |
| 2.4.1 anti-automação | `security.test.js:125–162` (limiter geral e sensível, app isolado com `rateLimitMax:1`) | PROVADA |
| 3.3.1/3.3.2/3.3.4 cookies | `auth-authorization.test.js:49` (`HttpOnly`+`SameSite=Lax` no cookie de sessão; `Secure` condicionado a produção) | PROVADA (fora do módulo, citada) |
| 3.5.1 CSRF | `schedule-contracts:1048` | PROVADA |
| 3.5.3 método safe não muta | rotas GET do módulo não mutam (inspeção `sprint.routes.js`); auditoria só em mutação (`schedule-contracts:1231`) | PROVADA (inspeção) |
| 7.4.1 sessão encerrada | `auth-authorization.test.js:77–80` | PROVADA (fora do módulo, citada) |
| 14.2.1 nada sensível em URL | query do módulo: `from`/`to`/status/paginação (inspeção `sprint.validation.js`); sessão em cookie, CSRF em header | PROVADA (inspeção) |
| 14.3.2 `no-store` | implementado em `shared/security/headers.js:19`, documentado em `API_CONTRACTS.md:52`, **sem nenhum teste** → B-headers | AUSENTE → coberta |
| 16.2.1 metadado no log | `schedule-contracts:1231` (ator, ação, alvo) | PROVADA |
| 16.4.1 log injection | logger emite linha única `JSON.stringify` (C0 escapado); **sem teste** → B-log | AUSENTE → coberta |
| 16.5.3 fail-open | `rf10-sprint-schedule:222` (falha na auditoria desfaz tudo); validação antes da transação (`sprint.service:287,866`) | PROVADA |

**Não aplicáveis ao módulo** (justificados na `ASVS_BASELINE.md`): V5 (sem upload), V4.3 (sem
GraphQL), V4.4/V17 (sem WebSocket/WebRTC), V9/V10 (sessão opaca; sem token autocontido/OAuth no
runtime), V6.5–V6.8 (sem MFA/out-of-band — lacuna já registrada na baseline, fora do RF10/35).

## Achados da Fase 1 (detalhados no relatório)

1. **Título de teste afirma o contrário do que prova** — `schedule-contracts.test.js:602`
   ("permite esvaziar e excluir uma sprint concluida" assert a **recusa** 405/409). LOW.
   **Corrigido na bateria** (título e comentário reescritos).
2. **Deriva documental** em `RF_TECHNICAL_MATRIX.md` (RF10 com `Milestone (sprintId)` e
   `ScheduleAgenda` inexistente; RF35 sem `SprintBurndownChart`). MEDIUM (doc). **Corrigida na
   Fase 8.**
3. **Teto de 180 dias não documentado** em `API_CONTRACTS.md` (ASVS 2.1.3). LOW (doc).
   **Corrigido na Fase 8.**

## Adendo pós-mutação (Fase 7)

A bateria de mutação revelou o que o mapa acima, baseado em leitura, não podia ver — quatro
lacunas reais de cobertura (nenhuma delas defeito de comportamento do produto):

| Sobrevivente | O que ficou sem prova | Desfecho |
|---|---|---|
| M13 | `to` inclusivo na emenda `nextUtcDay` → cronograma: regredir para exclusivo não derrubava teste nenhum | assassino em `rf10-rf35-bateria.test.js` (API) — morta |
| M17 | congelamento do encerramento restrito às participações vivas: sobrescrever a removida passava | assassino em `rf10-rf35-bateria.test.js` (API) — morta |
| M33 | `AuditEvent` da transição de status fora do teste "um evento por mutação" (ASVS 16.3.3) | assassino em `rf10-rf35-bateria.test.js` (API) — morta |
| M15 | lock de projeto do caminho de escopo (D17): sem ele, todos os testes seguem verdes — os locks finos de Sprint/Task serializam os cenários exercitados | **aberta** → `TECHNICAL_BACKLOG.md` S104-F07 |

M05 e M10 sobreviveram por serem **guardas inalcançáveis no fluxo atual** (mutantes equivalentes
por fluxo): a própria sprint nunca está `EM_ANDAMENTO` no retrato da checagem de unicidade, e o
retrato do marco nunca chega vazio ao fechamento. As duas funções são a codificação normativa do
ADR-011 D05/D06 e ganharam teste direto na bateria — as mutações agora morrem.

---

# Segunda bateria (30/08/2026, design v4) — `RF10_RF35_PROMPT_SEGUNDA_BATERIA.md`

Baseline da largada: backend 501/38 verdes; frontend 295/31. Fechamento: backend 501/38 (delta
sem backend); frontend **304/31**. Todas as citações de arquivo abaixo são de
`frontend/test/features/ScheduleScreen.test.jsx` quando não qualificadas.

## Invariantes novos I37–I49

| # | Prova | Situação |
|---|---|---|
| I37 trilha só para marco que agrupa sprint | `'marco sem sprint nao tem trilha…'`, `'marco sem sprint nao ganha segmento nem marcador'`, `'marco sem sprint marca so o prazo…'`, `'marcos so de prazo nao viram trilha nem entrada de legenda'`, `'dez marcos so de prazo mantem a grade limpa em escala'` | PROVADA |
| I38 período = primeira sprint → prazo; colapso; normalização | `'comecam na primeira sprint…'`, `'marco sem sprint nao tem trilha e ocupa apenas o dia do prazo'`, `'prazo anterior a primeira sprint normaliza…'`, `'marco sem prazo e descartado'`, `'ordena os marcos pelo inicio derivado'` | PROVADA |
| I39 marcador acessível, um por marco, um aberto por vez, Escape | `'poe o marcador…apenas na primeira semana'`, `'marcadores…linhas proprias'`, `'desenha a trilha…abre o nome ao clicar'`, `'abrir um marcador fecha o que estava aberto'`, `'escape fecha o marcador mantendo o foco'` | PROVADA |
| I40 hoje só no mês exibido; dia cinza sem mover a vista | `'hoje so marca a celula do mes exibido…'`, `'distingue hoje, selecionado e dias de fora do mes'`, `'dia cinza alem do limite seleciona sem mover a vista'` | PROVADA |
| I41 legenda do mês exibido | `'a legenda nomeia sprint e marco do mes exibido'`, `'a legenda acompanha o mes ao navegar'`, `'sem prazo de marco no mes o ponto sai da legenda'`, `'projeto vazio esconde a legenda…'`, `'filtra sprints e marcos pelo mes exibido'`, `'marco sem sprint sai das entradas de marco…'` | PROVADA |
| I42 eventos: tipos, metas e ordem total | `'gera sprint, marco e prazo em ordem de dia'`, `'explica que o marco comeca com a primeira sprint'`, `'marco sem sprint gera apenas o prazo'`, `'gera deadline de tarefa…'`, `'descarta tarefa sem deadline'`, `'desempata o mesmo dia pelo id'`, `'empates de dia preservam a ordem de emissao mesmo em volume'` | PROVADA |
| I43 cartões de agora | describe `'cartoes de agora'` completo (8 casos, incl. `'com todos os marcos vencidos o atual e o ultimo prazo'` e `'deadline…nao vira atencao'` via fixture concluída) | PROVADA |
| I44 blocos do mês por calendário real | describe `'blocos do mes exibido'` (4 casos) + `'o painel do mes exibido resume…'`, `'o painel do mes diz quando um grupo esta vazio'`; o fim do mês usa `new Date(ano, mes+1, 0)` — o mutante "31 fixo" (M47) é **equivalente** por comparação lexicográfica | PROVADA (com equivalência documentada) |
| I45 formulário de sprint: replace só quando muda; falha avisa | `SprintsScreen.test.jsx`: `'cria a sprint e entrega as tarefas marcadas'`, `'editar preenche…envia so a nova composicao'`, `'editar sem mexer nas tarefas nao chama a substituicao'`, `'salvar sprint sem tarefas marcadas nao rebusca…'`, `'avisa quando a sprint salva mas as tarefas falham'` | PROVADA |
| I46 formulário de marco: congelada imóvel; mover/soltar exatos | `MilestonesScreen.test.jsx`: `'sprint congelada aparece marcada…sem poder sair'`, `'criar marco ja leva as sprints marcadas'`, `'salvar a edicao move as marcadas e solta as desmarcadas'` (com `toHaveBeenCalledTimes(2)`), `'sprint que nao mudou de marco e sprint congelada nao geram requisicao'`, `'avisa que marcar sprint de outro marco move a sprint'` | PROVADA |
| I47 VIEWER: sem formulário, sem catálogo, sem mutação | `SprintsScreen.test.jsx` `'perfil somente leitura nao busca as tarefas do projeto'` + describe `'perfil somente leitura'`; `MilestonesScreen.test.jsx` `'nao oferece formulario nem acoes'` | PROVADA |
| I48 variante ampla = só geometria | `SprintBurndownChart.test.jsx` `'a variante ampla marca o eixo em quatro datas'` + suíte compacta intacta; `SprintsScreen.test.jsx` `'mostra o burndown apurado junto do escopo'` (nota idêntica) | PROVADA |
| I49 economia de requisições | `SprintsScreen.test.jsx`: `'a carga inicial busca as tarefas do projeto uma unica vez…'`, `'salvar sprint sem tarefas marcadas nao rebusca marcos, projeto nem tarefas'`, `'mostra carregando…'` (painel reaproveita o catálogo) | PROVADA |

## Reclassificação de regressão (itens antigos cujas provas mudaram de lugar)

| Item antigo | Situação após o design v4 |
|---|---|
| A3 (cronograma apresenta tarefas, sprints, prazos e marcos) | prova ampliada: agregado HTTP inalterado + telas novas (blocos do mês, eventos de tarefa, trilhas) — casos citados em I41/I42/I44 |
| A6 (permissões, fórmulas, fusos, limites) | permissões reconfirmadas sob composição (I45–I47); limites de navegação da 3ª iteração intactos (describe `'limites do calendario'` e `'interacao do calendario'`) |
| Economia de requisições (2 testes da 1ª bateria) | **reescritos às claras** — o formulário passou a exigir o catálogo na carga; a nova regra é I49 |
| "não oferece campo de sprint" no formulário de marco | **reescrito às claras** — o design v4 inverte a decisão de UI (bloco "Sprints do marco"); a autoridade de domínio segue sendo `PUT /sprints/:id` (ADR-011 D02), inalterada |
| Testes de tela citados no mapa da 1ª bateria por linha | as linhas mudaram com a reescrita das três suítes; os casos nomeados continuam existindo (menu, VIEWER, quatro estados, respostas fora de ordem, diálogo) e seguem verdes — conferido pela suíte completa 304/31, duas vezes |
| Filtro "Período exibido" | removido pelo design v4 (S104-F12); os dois testes de filtro da tela saíram e o recorte passou a ser provado pelos limites de navegação |

---

# Terceira bateria (31/08/2026, quinta iteração — inclui RF08) — `RF10_RF08_PROMPT_TERCEIRA_BATERIA.md`

Baseline da largada: backend 501/38 verdes; frontend 316/31; cobertura frontend
67,03 / 65,53 / 60,03 / 68,11. Citações não qualificadas são de
`frontend/test/features/ScheduleScreen.test.jsx`; `K::` = `frontend/test/pages/KanbanPage.test.jsx`.
Itens PARCIAL apontam a fase desta bateria que os fecha.

## Invariantes novos I50–I58

| # | Prova | Situação |
|---|---|---|
| I50 fim do período = `max(prazo, menor fim pintado)`; para na primeira que termina; colapso sem sprint | `'prazo antes do fim da sprint estende a barra ate esse fim'`, `'a extensao para na sprint agrupada que termina primeiro'`, `'prazo anterior a primeira sprint estende do prazo ate o fim dela'`, `'comecam na primeira sprint do marco e terminam no prazo'` (no-op com prazo além), `'marco sem sprint nao tem trilha e ocupa apenas o dia do prazo'`, T-F1 `'sprint agrupada com data invalida degrada para o colapso no prazo'`; I36 estendido: suíte 103/103 sob TZ padrão, UTC e Pacific/Kiritimati | PROVADA |
| I51 ponto/evento de prazo no `dueDate`; sufixo `· prazo DD/MM` sse `fim !== prazo`; chip e tile sem sufixo | `'o titulo do segmento ganha o prazo quando a barra passa dele'` (título com sufixo + chip sem), `'meta do marco ganha o prazo quando a barra passa dele'`, `'sprint cancelada nao estende a barra do marco'` (legenda com sufixo); negativo pela igualdade exata dos casos pré-existentes (`'a legenda nomeia sprint e marco do mes exibido'`, `'agrupa marcos, sprints e tarefas do mes com contagem'`); tile em `'nomeia o marco atual com prazo, agrupamento e concluidas'` | PROVADA |
| I52 cancelada não estende; meia-noite; extensão não desbloqueia mês | `'sprint cancelada nao estende a barra do marco'`, `'a extensao respeita o fim a meia-noite da sprint'`, `'a extensao da barra nao desbloqueia mes novo na navegacao'` | PROVADA |
| I53 início por `inicio !== fim`; dia prazo+início anuncia o prazo | `'prazo no dia do inicio ainda anuncia o comeco da barra estendida'` (evento), `'dia que e prazo e inicio ao mesmo tempo anuncia o prazo'` (descrição), `'com barra estendida o ponto continua no prazo e o fim ganha o canto'` | PROVADA |
| I54 tablist de 4 abas; roving tabindex; seleção no foco; sobrevive à navegação; vazia clicável | `'o painel do mes e um tablist com todos ativo por padrao'`, `'setas movem e ativam as abas do painel'`, `'a aba ativa sobrevive a navegacao de mes'`, `'o painel do mes diz quando a aba esta vazia'`, T-F2 `'tab sai da aba ativa para o conteudo sem mudar a selecao'`, T-F3 `'mes vazio no meio do intervalo mantem a aba filtrada com o vazio dela'` | PROVADA |
| I55 "Todos" primeira e padrão; grupos titulados; badges do mês exibido | `'o painel do mes e um tablist com todos ativo por padrao'` (grupos com título), `'trocar de aba filtra o conteudo do painel'` (ciclo todos → marcos → tarefas → todos), `'o painel do mes exibido resume marcos, sprints e tarefas em abas'` (badges incl. soma), `'dez marcos so de prazo mantem a grade limpa em escala'` (`Marcos 10`), unit `'agrupa marcos, sprints e tarefas do mes com contagem'` (`rotulo`/`descricao`/contagem por `itens.length`) | PROVADA |
| I56 cartão sem combobox; caminho sem mouse via diálogo | K::`'o cartao nao tem mais seletor de status'`, K::`'move a tarefa pelo seletor do painel de detalhes, sem mouse'` (Enter abre, nome acessível `Mover a tarefa …`), T-F4 K::`'espaco no cartao tambem abre o painel de detalhes'` | PROVADA |
| I57 congelada e em-voo desabilitam o seletor do diálogo | K::`'bloqueia a tarefa de sprint congelada no cartao e no painel'` (disabled + `title` + cartão sem arrasto), K::`'desabilita o seletor do painel enquanto a movimentacao esta em voo'`, T-F5 K::`'conflito 409 no painel reabilita o seletor e mostra a mensagem do quadro'` | PROVADA |
| I58 mover sincroniza quadro e diálogo; arrasto e histórico intactos | K::`'move a tarefa pelo seletor do painel de detalhes, sem mouse'` (`toHaveValue` pós-move), K::`'move a tarefa enviando somente o status e usa o responsável canônico'` (arrasto), K::`'mantém o quadro coerente e recarrega os dados diante de conflito 409'`, K::`'pagina o histórico no backend…'`, K::`'mantem o historico de tarefas com o indicador de movimentacoes'`, T-F6 K::`'escolher o status atual no painel nao dispara requisicao'` | PROVADA |

## Redações superadas pela quinta iteração

| Item | Situação após a quinta iteração |
|---|---|
| I38 (período = primeira sprint → **prazo**) | o início derivado permanece; o fim virou o **alcance** de I50. O caso `'prazo anterior a primeira sprint normaliza o periodo sem inverter'` foi **reescrito às claras** como `'prazo anterior a primeira sprint estende do prazo ate o fim dela'` (citado no commit `f4f4796`); os demais casos citados em I38 seguem existindo e verdes |
| I44 (blocos do mês com `titulo`) | o painel virou o tablist de I54/I55; `monthBlocks` expõe `rotulo`/`descricao`. Reescritos às claras (citados nos commits `d538505`/`58e49b7`): `'agrupa marcos, sprints e tarefas do mes com contagem'` (asserções), `'dez marcos so de prazo…'` e `'marcos so de prazo…'` (heading → tab), `'o painel do mes exibido resume…'` (+ sufixo "em abas"), `'o painel do mes diz quando um grupo esta vazio'` → `'…quando a aba esta vazia'`. A interseção por calendário real e a equivalência do mutante M47 continuam como declaradas |
| RF08 (quadro Kanban — entra no mapa) | provas vigentes em `KanbanPage.test.jsx`: arrasto/409/histórico (describe `'KanbanPage E11'`), filtro por sprint e congelada (describe `'KanbanPage ADR-011'`), e os casos da quinta iteração citados em I56–I58. Reescritos às claras (citados no commit `da04918`): `'move a tarefa pelo seletor do cartao'` → `'…pelo seletor do painel de detalhes, sem mouse'`; `'bloqueia o cartao de sprint congelada'` → `'bloqueia a tarefa de sprint congelada no cartao e no painel'` |

## Fase 4 da terceira bateria — contratos quentes do painel de detalhes

| Item | Prova | Situação |
|---|---|---|
| Corpo de sucesso do move devolve a tarefa completa que o diálogo espalha | `backend/test/api/rf08-terceira-bateria.test.js::'o corpo de sucesso devolve a tarefa completa que o dialogo espalha'` (status, sprintId, prioridade, deadline, responsible, pullRequest, commits[], issues[]) | PROVADA |
| Move de tarefa em sprint terminal recusado com 409 (rede de segurança do `disabled` do diálogo) | sonda executada em 31/08: `PATCH /tasks/:id/move` de tarefa `CONCLUIDO` em sprint `CONCLUIDA` respondeu **200** e mutou o status — a guarda não existe no servidor | **CONTRADITA** → achado T-A1 / `TECHNICAL_BACKLOG.md` S104-F14 |
| Autorização do move inalterada pelo caminho novo de UI | `auth-authorization.test.js:312` (matriz permitir/negar sobre `PATCH /tasks/:id/move`) | PROVADA |
| Suítes de backend completas, duas vezes | largada 501/38; fechamento registrado no relatório (inclui o arquivo novo da bateria) | PROVADA |
