# PLANNING-QA-FIX-04

## Decision

**TECHNICALLY PASS — READY FOR FINAL PLANNING QA.**

F01 e F02 resolvidos no escopo de Sprints/Marcos e suas projeções. O addendum substitui a
reserva nominal anterior: safe delete libera o nome, preservando a identidade histórica.
Gates locais, navegador real e banco descartável foram executados nesta revisão. Este resultado
não representa CI remoto, implantação em produção nem aprovação integral dos 112 BR-IDs.

Os addenda 2/3 foram concluídos sobre `48ca54f`, conforme a seção de revalidação ao final:
snapshot v2 completo, paridade visual dos detalhes, microcopy removida e gates locais finais PASS.
A baseline abaixo pertence à primeira execução e é preservada como evidência histórica.

## Baseline

| Campo | Evidência |
|---|---|
| Data | 05/09/2026 |
| Checkout | `/Users/daniel/Coding/Traceflow` |
| Branch | `joao-dev-v2` |
| HEAD inicial/final | `42a172ffdbec3fb9fa58f0dc0edd14e80364fbae` |
| Working tree inicial | Limpo |
| Node | `22.23.2`; `NODE_OPTIONS=--no-experimental-webstorage` |
| Prisma Client/CLI | `6.12.0` |
| MySQL observado | `9.7.1`, loopback:3306, `REPEATABLE-READ` |
| MySQL CI | `8.4.8`; execução local não é equivalente a CI |
| Navegador | Chrome real, headless, perfil exclusivo, CDP, 1440×1000 |
| Serviços artificiais | frontend:5399 → proxy:3399 → aplicação real:3199; sessão local:3299 |

Fontes lidas: [regras canônicas](PLANNING_BUSINESS_RULES.md), [FIX-03](PLANNING_QA_FIX_03.md),
[contratos](../api/API_CONTRACTS.md), [histórico](../data/PLANNING_HISTORY.md) e `CONTRIBUTING.md`.
O relatório anterior não estava no checkout; foi lida a cópia integral em
`/private/tmp/planning-final-crud-qa-20260905/PLANNING_FINAL_CRUD_FROZEN_HISTORY_QA.md`, cujo
baseline coincide com este HEAD. Seus resultados não foram usados como novos PASS.

Evidências desta execução ficam em [`/private/tmp/planning-qa-fix-04`](</private/tmp/planning-qa-fix-04>),
fora do versionamento. `environment.json` identifica o ambiente sem credenciais. Schemas novos,
previamente inexistentes: `traceflow_test_fix04_gates_20260905` para suites e
`traceflow_test_fix04_core_20260905` para API/navegador. O helper configura o banco de teste antes
dos imports de Prisma/servidor; nenhum cleanup de suite foi dirigido ao schema compartilhado.

Limpeza final confirmada em `cleanup.json`: os dois schemas exclusivos foram removidos, os
schemas preexistentes continuam presentes, os quatro serviços de QA foram encerrados e o
perfil privado do Chrome foi removido. Logs, comparações e capturas foram preservados.

## F01 — Cross-project stale mutation

**Root cause.** O owner dos catálogos aceitava setters/refreshes que ainda carregavam closures
antigas. A geração criada apenas quando o refresh começava não identificava a origem da
mutation. Além do catálogo, `finally`, erros e fechamento de formulário podiam atingir a visita
mais recente.

**Architecture fix.** `useScheduleData` agora concentra as escritas. O helper local
`useScopedAsyncCatalog` captura projeto, identidade da visita e geração antes do primeiro await;
valida a origem tanto para DTOs quanto para refresh, erro e feedback. As telas isolam seu estado
contextual por `projectId`. O recibo de confirmação acompanha a reconciliação posterior.

| Caso | Teste versionado | Navegador + API/DB real | Resultado |
|---|---|---|---|
| Sprint CREATE A→B | Sucesso e rejeição atrasados; draft de B preservado | POST persistiu em A; B intacto após entrega e reload | PASS |
| Sprint EDIT A→B | Sucesso e rejeição atrasados; draft de B preservado | PUT persistiu em A; B intacto após entrega e reload | PASS |
| Sprint DELETE A→B | Sucesso e rejeição atrasados; draft de B preservado | Tombstone em A; B intacto após entrega e reload | PASS |
| Marco CREATE A→B | Sucesso e rejeição atrasados; draft de B preservado | POST persistiu em A; B intacto após entrega e reload | PASS |
| Marco EDIT A→B | Sucesso e rejeição atrasados; draft de B preservado | PUT persistiu em A; B intacto após entrega e reload | PASS |
| Marco DELETE A→B | Sucesso e rejeição atrasados; draft de B preservado | Tombstone em A; B intacto após entrega e reload | PASS |

O proxy repassou cada mutation ao backend real e reteve sua resposta por 4 segundos. O harness
confirmou a gravação no DB antes de navegar. A navegação SPA usou um controle de QA sobreposto
às rotas reais, permitindo trocar de projeto mesmo com modal pendente. Esse controle está
somente no harness temporário. Nenhuma mutation foi cancelada por navegação.

Fonte versionada: [`planning-catalog-races.test.jsx`](../../frontend/test/features/planning-catalog-races.test.jsx).
Prova real: `browser-results.json`, `browser-network.json` e `f01-{sprints,milestones}-{create,edit,delete}.png`.
A→B→A e callback antigo invocado somente depois da navegação também passam em testes determinísticos.

**Status: RESOLVED.**

## F02 — Deleted entity resurrection

**Root cause.** Uma leitura iniciada antes de uma mutation continuava autorizada a substituir o
catálogo inteiro. A remoção local não invalidava a resposta anterior; a mesma falha podia apagar
uma criação ou desfazer uma edição.

**Read generation.** Cada recurso tem versão independente e identidade da leitura mais recente.
Uma leitura aplica estado somente se visita, geração, versão e request ainda correspondem.

**Mutation invalidation.** A confirmação incrementa versões e aborta leituras afetadas antes do
merge funcional por ID. Um refresh posterior recebe essas versões; um recibo superado não pode
reiniciar reconciliação antiga. O snapshot derivado de Schedule invalidado é descartado, sem
fallback para dados anteriores à mutation.

| Ordem controlada | Sprint | Marco | Schedule |
|---|---|---|---|
| GET antigo → CREATE confirmado → GET antigo | PASS: novo DTO permanece | PASS | PASS: snapshot antigo rejeitado |
| GET antigo → EDIT confirmado → GET antigo | PASS: campos novos permanecem | PASS | PASS: snapshot antigo rejeitado |
| GET antigo → DELETE confirmado → GET antigo | PASS: ID continua ausente | PASS | PASS: snapshot antigo rejeitado |
| Cada CRUD confirmado → refresh 503 | PASS: DTO/remoção + warning | PASS | PASS: snapshot inválido não retorna |

As seis combinações de CRUD/recurso têm teste de hook com promises que ignoram abort e teste
na tela real com API simulada. Isso comprova os tokens independentemente do cancelamento HTTP.

No navegador, CREATE iniciou um GET retido por 6 segundos; DELETE ocorreu antes de sua entrega.
Sprint e Marco continuaram ausentes após a resposta antiga, consulta nova, Schedule e reload,
sem filtros. O transporte real também exercitou cancelamento. Provas: `browser-results.json`,
`f02-sprints.png`, `f02-milestones.png` e tráfego com horários em `browser-network.json`.

A ligação com histórico congelado foi revalidada separadamente com GET retido por 20 segundos,
exclusão de S1 concluída e criação de outra Sprint com o mesmo nome antes da entrega antiga.
Apenas o novo ID permaneceu. Detalhes na seção de regressão.

**Status: RESOLVED.**

## Catalog Invariants

| Invariant | Implementação/validação |
|---|---|
| Project generation | Identidade por visita + contador; A→B→A e unmount invalidam a origem anterior |
| Resource generation | Sprints, Marcos e Schedule independentes; leitura de recurso não afetado continua válida |
| Abort strategy | Abort somente de reads; contexto/versões são autoridade mesmo sem cooperação do transporte |
| Latest-wins | Request mais recente vence no mesmo recurso; warning antigo não substitui feedback posterior |
| Mutation confirmed | Merge funcional por ID e remoção local antes de reconciliação |
| Success/refresh failure | Preserva DTO ou ausência do ID; warning informa ação concluída e falha da atualização |
| Same-name history | Tombstone por ID da visita impede DTO ativo tardio desse ID; outro ID pode compartilhar nome |
| Mutations concorrentes | Envios de formulário únicos e locks de entidade; criações independentes preservadas em ordem inversa |
| Ownership | `useScheduleData` é o único writer dos três catálogos; telas não recebem setters brutos |

A reconciliação é seletiva: create/edit de Sprint lê Sprints/Schedule; delete lê Schedule;
conclusão também lê Marcos quando o backend confirma conclusão automática de Marco. Escopo lê
Sprints/Schedule. Create/edit/delete de Marco só lê Sprints quando referências são afetadas.
Reabertura de Marco reconcilia Schedule. Projeto/membership não são recarregados em cada ação.
Há teste explícito de criação sem vínculo não recarregar o catálogo não relacionado.

START/CLOSE/CANCEL, scope e reabertura de Marco foram auditados no mesmo mecanismo, incluindo
prévia/confirm, catch e finally. Operações de associação já autorizadas podem terminar em A;
seu resultado contextual é suprimido depois da navegação. Nenhum timeout de correção, teste de
pathname pós-resposta, reload global ou framework em `shared` foi introduzido.

## Sprint Name Reuse After Safe Delete

**Status: RESOLVED — BR-SPRINT-021.** O inventário foi auditado: 021 era o próximo ID de Sprint;
passou de 111 para **112 IDs únicos**, sem renumerar regras existentes.

| Cenário | Resultado observado |
|---|---|
| Duplicata não excluída no mesmo projeto | `409 SPRINT_NAME_IN_USE` |
| POST após safe delete com o mesmo nome | `201`, novo ID |
| PUT para nome de Sprint excluída | `200`, ID editado preservado |
| PUT para nome de outra Sprint atual | Conflito mantido |
| Mesmo nome em outro projeto | Permitido |
| Cinco DELETE→CREATE | Seis linhas, cinco tombstones, uma Sprint atual |
| Creates concorrentes, períodos distintos | Um vencedor; outro recebe conflito nominal |
| DELETE/CREATE concorrentes, ambas ordens de despacho | Resultado serializável; nunca duas atuais |
| Escrita Prisma fora do service | Índice rejeita duplicata; chave gerada não aceita valor forjado |
| Entrega de GET/DELETE/EDIT antigos após recriação | Novo ID permanece; ID histórico não retorna |

A migration incremental
[`20260905030000_sprint_active_name_uniqueness`](../../backend/prisma/migrations/20260905030000_sprint_active_name_uniqueness/migration.sql)
cria `activeNameKey` gerada pelo MySQL: nome original quando `deletedAt IS NULL`, senão NULL.
O índice único `(projectId, activeNameKey)` substitui `(projectId, name)` em um único ALTER.
A chave é mantida atomicamente em INSERT, rename e soft delete, inclusive fora do repository.

Charset e collation vêm da coluna `name` existente. O trim vigente do service foi preservado;
nenhuma normalização nova de caixa ou Unicode foi adicionada. Testes verificam colisão
case/accent conforme `utf8mb4_unicode_ci` e preservação das collations `utf8mb4_unicode_ci` e
`utf8mb4_bin` durante a migration. Nenhuma migration antiga foi editada.

| Prova da migration | Resultado |
|---|---|
| Banco vazio, cadeia completa | 48 migrations aplicadas — PASS |
| Banco com 47 migrations e Sprints atuais/excluídas | 48ª aplicada; todos os campos anteriores idênticos — PASS |
| Backfill da chave | Nome nas atuais; NULL em cada tombstone — PASS |
| Estado legado inconsistente com duplicatas atuais | Falha explícita `P2002`, índice identificado; ALTER atômico, sem sobrevivente escolhido — PASS |
| Prisma validate/generate/status | PASS; schema atualizado nos dois ambientes de QA |

Testes versionados: [`planning-name-reuse.test.js`](../../backend/test/integration/planning-name-reuse.test.js)
e [`schedule-contracts.test.js`](../../backend/test/api/schedule-contracts.test.js).
Provas adicionais: `migration-proofs.json`, `migration-*-final48.log`, `migration-cleanup.json`.
Os dois schemas extras usados nessas provas também eram novos e foram removidos ao terminar.

O Client representa a coluna com `@default(dbgenerated())`; a expressão `GENERATED ALWAYS`
permanece no SQL versionado. A limitação de representação do Prisma e o cuidado com futuros
diffs de schema estão documentados em [PLANNING_HISTORY](../data/PLANNING_HISTORY.md).
Não há campo técnico novo no DTO público nem código/copy de nome reservado por tombstone.
A mensagem de duplicata continua: “Já existe uma sprint com este nome neste projeto.”

Auditoria de identidade: cards usam `sprint.id`; Kanban e Schedule mapeiam por ID; seletores
usam IDs; carry-over usa FK/ID; Task history resolve `fromValue`/`toValue` por ID e mantém
fallback `Sprint #ID` quando a entidade não integra o catálogo atual. Não foi encontrado join,
React key ou deduplicação de identidade por nome nessas superfícies.

## Regression

Reexecução via API real: **21 grupos PASS, zero FAIL** em `required-crud-results.json` e
`required-crud-summary.json`. A tabela separa essa evidência dos testes de componente.

| Casos solicitados | Evidência atual | Resultado |
|---|---|---|
| C01, C02 | Criação com Marco null, objetivo vazio/preenchido, zero Tasks ou duas Tasks associadas | PASS API/DB |
| C10, C30 | Período de tombstone reutilizado e cinco ciclos consecutivos | PASS API/DB |
| C25 | Dez pares de criações concorrentes no mesmo período: um `201`, um `409` | PASS API/DB |
| C26 | Submit duplicado: uma linha; testes de tela impedem double submit | PASS API/DB + componente |
| E01, E11, E20 | Rename; período liberado; entidade excluída continua não editável | PASS API/DB |
| E21 | Updates parciais concorrentes não persistem intervalo inválido | PASS API/DB |
| E22 | PUT confirmado + refresh 503 preserva DTO e warning | PASS componente |
| E23 | Resposta A após navegar B | PASS componente + navegador |
| D01, D04 | Tombstone em PLANEJADA/CONCLUÍDA com histórico preservado | PASS API/DB + navegador |
| D12 | Double delete: exatamente um efeito; vencedor não predeterminado | PASS API/DB |
| D17 | Ausente em listagem/cronograma e depois de GET atrasado | PASS API/DB + navegador |
| D22, D25 | Período reutilizado; ciclos DELETE→CREATE; nome também reutilizável pelo addendum | PASS API/DB |
| M01, M05, M07 | Criação independente; edição de título/prazo; tombstone | PASS API/DB + CRUD no navegador |
| M13 | Listagem/seletores atuais omitem excluídos | PASS API + componentes |
| M16, M17 | Mesmo nome/prazo após delete; delete repetido rejeitado | PASS API/DB |
| M19 | Criação visível somente no contexto correspondente | PASS API/DB + componente + navegador |

**Frozen Kanban/carry-over.** No cenário focal final, projeto 40, S1=53 e S2=54. S1 fechou com
quatro Tasks, 29 pontos, uma concluída/8 pontos (28%). Três pendências seguiram para S2.
Mudanças em S2 alteraram status, título, pontos, prioridade, prazo, responsável e requisito.
Projeção, progresso/burndown, memberships e linha de S1 conservaram o hash SHA-256:
`349c337e8a5d1f3a4d1bff5bb6c3cc82f94892d974a325e15244229d802091e0`.
O Kanban congelado real continuou exibindo os títulos/colunas e 29 pontos do encerramento.

**Safe delete + same name + F02.** Com um GET anterior ainda retido, a UI excluiu S1=53 e criou
`Core S1`=58. Após entrega antiga, nova listagem, Schedule e reload: apenas ID 58 no catálogo;
a prévia de exclusão do card consultou `/sprints/58/impact`. A linha 53 mantém nome original,
`deletedAt` e chave NULL; snapshots, histórico e S2 permaneceram preservados. Hash de memberships:
`b67b10c95f8dfbc8f09a48137bf81939ef6ca54b81e6b3456d728ea4773592ee`.

Provas: `core-frozen.json`, `core-after-s2-changes.json`, `frozen-reuse-before.json`,
`frozen-delete-name-reuse.json`, `frozen-kanban-after-s2-changes.png` e
`frozen-delete-same-name-after-old-get.png`. As suites de frozen/history/carry-over/safe-delete
integram ainda os gates completos abaixo.

## Business Rules

Classificação focal desta FIX, sem substituir uma matriz integral futura:

| BR-ID | Resultado | Evidência |
|---|---|---|
| BR-GLOBAL-003 | PASS | Contratos de autorização/associação entre projetos + F01 |
| BR-GLOBAL-004 | PASS | Matriz CRUD A→B; A→B→A; old reads/callbacks; navegador |
| BR-GLOBAL-005 | PASS | Seis CRUDs com sucesso e refresh 503; warnings contextualizados |
| BR-SPRINT-015 | PASS | Safe delete em todos os estados nas suites; S1 concluída excluída no navegador |
| BR-SPRINT-016 | PASS | S1→S2 real, três pendências; suite carry-over |
| BR-SPRINT-019 | PASS | Hash integral de S1 idêntico após alterações em S2 |
| BR-KANBAN-015 | PASS | Snapshot terminal nas suites e Kanban congelado renderizado |
| BR-KANBAN-016 | PASS | S2 alterada, fonte congelada intacta |
| BR-MILESTONE-013 | PASS | Safe delete/API e componentes preservam referências; F01/F02 Marco |
| BR-SPRINT-021 | PASS | Índice gerado, API, concorrência, migrations e recriação real por novo ID |

## Race Stress

**20/20 rodadas finais, 41 testes por rodada, 820 execuções, zero falhas.**
Cada rodada executa `planning-catalog-races.test.jsx` em processo Vitest novo.
Ordens de entrega independentes: `[2,0,1]`, `[1,2,0]`, `[2,1,0]`; CRUD/GET, leitura mais recente,
late warning, A→B→A e reutilização nominal completam a cobertura. Promise deferred controla a
ordem: nenhum sleep define o resultado dos testes versionados. `race-stress.json` e
`race-stress-{1..20}.log` registram exits e duração. Sleeps do proxy/navegador só injetam atraso
de rede em QA; não fazem parte da implementação.

## Browser Smoke

| Superfície | Resultado observado |
|---|---|
| F01 | Seis operações, B sem dados/feedback de A; backend persistiu em A |
| F02 | Sprint e Marco excluídos não retornam após resposta antiga/reload |
| Addendum + frozen | Nova Sprint com mesmo nome e ID distinto permanece; snapshots preservados |
| Light | Sprints, Marcos e Cronograma renderizados; tema escolhido no controle real |
| Dark | Mesmas três superfícies renderizadas; tema escolhido no controle real |
| Geometria | 1440×1000, sem overflow horizontal nas seis capturas finais |
| Console da matriz F01/F02 | Nenhum warning/error de aplicação capturado (`browser-console.json`) |

Capturas `smoke-{light,dark}-{sprints,milestones,schedule}.png` foram inspecionadas visualmente:
texto, cartões, controles, contraste aparente e hierarquia preservados no viewport observado.
`browser-smoke-final.json` registra temas e geometria. A faixa de navegação de QA no topo é do
harness temporário. Não se declara certificação de contraste, leitor de tela, touch ou outros
viewports nesta rodada.

## Frontend Gates

| Gate final | Resultado |
|---|---|
| Lint | PASS |
| Format check | PASS |
| Focused: Sprints, Marcos, Kanban, terminal, hook e races | 167/167 PASS em seis arquivos |
| Full | 752/752 PASS em 68 arquivos |
| Coverage full | 752/752 PASS; thresholds preservados |
| Build | PASS; artefato em `frontend-dist` |
| Architecture / secrets | PASS nos scripts canônicos comuns |
| npm audit policy | PASS: zero high/critical e nenhuma exceção consumida |

`frontend-gates.json` registra comandos, duração, exits e logs. Vitest executou com
`--configLoader native`; o build final foi produzido com `NODE_ENV=production`, fora do
checkout, sem warning de tamanho de chunk. O runner de testes usa `NODE_ENV=test`; seu build
exploratório foi substituído por essa execução explícita de produção (`final-build.mjs`).

## Backend Gates

| Gate final | Resultado |
|---|---|
| Lint / format | PASS / PASS |
| Focused Planning + contratos | 150/150 PASS em sete arquivos |
| Unit | 554/554 PASS |
| Integration + API | 390 PASS, cinco skips explícitos, zero FAIL |
| Full coverage | Cinco rodadas consecutivas: 944 PASS, cinco skips, zero FAIL em cada |
| Prisma validate / generate / migration status | PASS; 48 migrations aplicadas |
| Empty + populated migration | PASS; schemas adicionais removidos |
| Architecture / secrets | PASS / PASS |
| Supply-chain/CI policy tests | PASS |
| npm audit policy | PASS: zero high/critical e nenhuma exceção consumida |

Os cinco skips preexistentes são `e6-backfill` (um) e `e11-legacy-responsibility` (quatro),
especificações para banco pré-LR.2: **NOT APPLICABLE** ao schema atual. Não são testes de
Planning bloqueados ou falhos. Comandos/exits em `backend-gates.json`; nenhum threshold ou
skip foi alterado para aprovação.

## Coverage

Percentuais na ordem statements / branches / functions / lines:

| Rodada final | Testes | Cobertura | Resultado |
|---|---|---|---|
| Frontend | 752 | 80,85 / 74,40 / 76,66 / 83,15 | PASS |
| Backend 1 | 944 + 5 N/A | 90,32 / 79,26 / 94,09 / 92,82 | PASS |
| Backend 2 | 944 + 5 N/A | 90,32 / 79,26 / 94,09 / 92,82 | PASS |
| Backend 3 | 944 + 5 N/A | 90,32 / 79,26 / 94,09 / 92,82 | PASS |
| Backend 4 | 944 + 5 N/A | 90,32 / 79,26 / 94,09 / 92,82 | PASS |
| Backend 5 | 944 + 5 N/A | 90,32 / 79,26 / 94,09 / 92,82 | PASS |

Limites mantidos: frontend 50/45/40/53; backend 85/70/85/87. As cinco rodadas de backend acima
foram executadas após a implementação do addendum. Rodadas anteriores à mudança nominal
ficam em `pre-addendum/` e não fundamentam esta decisão.

Durante implementação houve falhas corrigidas de fixture/harness (ator ausente, metadata de
prepared SELECT após ALTER, expectativa de erro SQL versus `P2002`, seletores/scroll e botão
“Voltar” no navegador), uma regressão inicial do carregamento atômico do hook e um erro de lint.
As suites finais passaram após as correções. No navegador, a prova congelada foi retomada após
corrigir o seletor de cancelamento, preservando os snapshots e a gravação de tráfego da execução.
Falhas de socket/MySQL dentro do sandbox foram repetidas com acesso local autorizado; não são
classificadas como aprovação parcial de gate.

## Documentation

Atualizados: BR-SPRINT-021, regra de nome nos contratos, SQL de unicidade e arquitetura de
reconciliação em `PLANNING_HISTORY.md`, além deste relatório. O addendum é registrado como
mudança explícita da decisão nominal da FIX-03. Relatórios históricos permanecem inalterados.

## Git

HEAD/branch preservados; somente arquivos desta FIX estão alterados ou novos. Arquivos de
produto: dois hooks locais e as telas de Sprints/Marcos; backend: schema e uma migration nova;
testes: races, name reuse e contratos; documentação: três fontes canônicas e este relatório.
`git diff --check` passou. Nenhum commit, push, merge, rebase, reset, force-push ou review de PR
foi executado. Status e diff finais ficam em `git-final.txt` e `git-final.diff` nas evidências.

## Remaining Issues

- Execução contra MySQL 8.4.8/CI remoto não realizada; observado localmente MySQL 9.7.1.
- Touch DnD: **ENVIRONMENT BLOCKED** para validação física nesta rodada. O gap conhecido de
  teclado do Kanban continua follow-up; não foi alterado nem aprovado por esta FIX.
- Homologação integral de Planning, outros viewports e acessibilidade completa permanecem no
  QA final; os 112 BR-IDs não foram reclassificados integralmente neste trabalho.
- A expressão de coluna gerada exige preservação em migrations futuras; não substituir por
  `db push` ou aceitar diff que remova a geração, conforme documentação técnica.

## Recommendation

**READY FOR FINAL PLANNING QA**, com F01, F02 e BR-SPRINT-021 resolvidos e evidências locais
reconciliadas. A autorização desta execução termina nas alterações locais e na limpeza das
fixtures exclusivas; não houve publicação ou implantação.


## Revalidação — Addenda 2/3

**TECHNICALLY PASS — READY FOR FINAL PLANNING QA**, no escopo registrado abaixo.

Baseline reconfirmada: branch `joao-dev-v2`, HEAD `48ca54f6cb9f39db58b595ba6b08bd52dbdaeb1b`.
O checkout estava limpo ao início do addendum 2. Na chegada do addendum 3, continha somente as
alterações em andamento desse refinamento; nenhuma foi descartada. `git diff --check` identificou
uma linha vazia final no CSS durante essa transição, corrigida antes dos gates finais.
Não houve commit, push, merge, rebase, reset ou alteração de PR.

Evidências novas: `/private/tmp/planning-qa-fix-04-frozen-details`. Os resultados da execução
anterior acima não foram relabelados como resultados desta revisão. F01/F02 e a liberação do nome
após safe delete permanecem integrados; suas regressões foram reexecutadas nos gates atuais.
As reproduções browser F01/F02 originais permanecem documentadas acima; o novo smoke browser
concentrou-se nos addenda 2/3. Não há alteração nos owners dos catálogos nesta revisão.

## Complete Frozen Task Snapshot

**PASS.** Old snapshot: v1 parcial, com título/prioridade/ID do responsável/prazo e contagens.
New snapshot: `closingTaskSnapshot.version=2`, autossuficiente para a informação de Task Details.
Status, esforço estimado e cutoff continuam nas colunas históricas existentes da participação.

| Informação | Captura histórica / evidência |
|---|---|
| ID e título | `id`, `title`; sobrevivem à exclusão da Task atual |
| Description | `description`, preservada após alteração corrente |
| Priority | `priority` |
| Assignee | `responsibleUserId` + `responsibleDisplayName`; nome anterior preservado após renomeação; sem e-mail/perfil |
| Deadline | `deadline`, ISO UTC ou null |
| Status | `SprintTask.exitStatus`; mesmo valor no card, coluna e detalhes |
| Estimated effort | `SprintTask.pointsAtClose`, sem consultar a Task atual |
| Actual effort | `actualEffort` |
| Created at | `createdAt`, ISO UTC, copiado para o JSON |
| Requirement snapshot | id/title/status |
| Pull Request snapshot | id/number/title/state/githubUrl |
| Commit snapshot | id/hash/message/authorName/date/githubUrl; sem authorEmail |
| Issue snapshot | id/number/title/state/labels/githubUrl |
| Comments | ABSENT; nenhuma cópia de conversa, tombstone, composer ou SSE |
| Current lookup required | **NO** |

Legacy handling: v1 é preservado e sinalizado por `LEGACY_CLOSING_TASK_DETAILS_PARTIAL`;
JSON ausente/versão não suportada continua com `LEGACY_CLOSING_TASK_SNAPSHOT_UNAVAILABLE`.
Não existe backfill a partir de registros atuais. Limitação de outra Task no envelope não transforma
um snapshot v2 completo em indisponível. Null capturado é distinto de campo legado não capturado.

Transaction/capture timing: locks existentes de Project/Sprints/Tasks precedem a visão consistente
`RepeatableRead`; dados da Task, responsável e artefatos são lidos pelo mesmo `tx`. A captura ocorre
antes de persistir o estado terminal e executar carry-over/eventos. Não foram adicionados locks de
artefatos. Teste determinístico atualiza metadados de PR durante a transação e confirma que a captura
permanece na mesma visão lógica. Falha injetada no segundo snapshot desfaz o primeiro, o encerramento
e o carry-over. Inconsistência entre Task ativa e participação aborta a captura.

Migration: **NOT APPLICABLE para DDL adicional**. O JSON nullable já existente suporta o formato v2;
não há mudança de schema que justifique uma migration vazia. Nenhuma migration histórica editada,
nenhum reset, nenhum backfill fabricado. As 48 migrations canônicas foram aplicadas em schemas novos;
Prisma validate e migration status PASS. JSON e RepeatableRead são compatíveis com MySQL 8.4.8;
o servidor observado localmente é 9.7.1, não uma execução da versão de CI.

Testes versionados: `backend/test/integration/planning-frozen-kanban.test.js` cobre cada campo,
metadados posteriores, exclusão/unlink de artefatos, renomeação do responsável, Task excluída,
v1/JSON ausente, rollback e consistência concorrente. O cenário adicional real de API/DB troca
R1/PR #10/commits A–B/issue #5 por R2/PR #11/commits C–E/issues #6–7 e renomeia o responsável:
`complete-relink-proof.json` confirma igualdade integral da projeção histórica antes/depois.

## Frozen Task Details

Visual parity: **PASS** na matriz renderizada. Snapshot-only: **PASS**.

Description: hierarquia compartilhada com o atual, texto histórico completo em v2.
Information: mesma grade Prioridade/Responsável/Prazo/Status e mesmos badges.
Secondary information: esforços e criação na mesma organização visual.
Traceability: `TaskTraceability` compartilhado; quatro categorias, cards/contagens e ação C2
“Abrir no GitHub ↗” para URLs históricas capturadas. V1 mostra somente suas contagens confiáveis.
Comments: **ABSENT**. Mutable actions: **ABSENT**. Sem coluna vazia de Comments.
Header: ID/título em destaque, “Estado no encerramento” e timestamp do corte.
Open current Task: explícito e secundário; substitui o modal por valores atuais, Comments e ações
autorizadas; fechamento preserva a Sprint histórica e retorna foco ao card.
Unavailable current: FK nullable após exclusão física omite a ação; corrida HTTP 404 mantém histórico
com feedback e ação desabilitada (teste de página). Nenhum contrato de soft delete de Task inventado.

Light/Dark: **PASS**. Responsive: **PASS** em 1440, 1024, 768 e 390, altura 1000.
Enter/Space, Escape, foco e ausência de GET atual/artefatos ao abrir Frozen: **PASS** no Chrome real.
Nenhum overflow horizontal global nos oito cenários. O modal limita altura pelo viewport.
Long content: título/descrição longos dentro do limite real da API (191 caracteres para descrição),
16 commits e 12 issues. Corrigido o override mobile que removia o scroll dos cards com altura limitada;
listas agora mantêm scroll interno nas duas apresentações. Últimos artefatos acessíveis em ambos os temas.
Legacy, empty traceability e current Task excluída: renderizados em ambos os temas no mobile.

Capturas em `/private/tmp/planning-qa-fix-04-frozen-details`:

- `frozen-details-{light,dark}-{1440,1024,768,390}.png` e
  `current-details-{light,dark}-{1440,1024,768,390}.png`;
- `frozen-traceability-{light,dark}-{1440,1024,768,390}.png`;
- `frozen-long-{light,dark}-{1440,1024,768,390}.png` e `frozen-long-last-links-*.png`;
- `frozen-{legacy,empty,deleted}-{light,dark}-390.png` e `current-long-{light,dark}-390.png`.

`browser-smoke.json`, `browser-long.json`, `browser-edges.json` e `fixture-proof.json` registram
asserts/medidas e comparações. O [Visual Validation Log](../design/validation/VISUAL_VALIDATION_LOG.md)
e o [inventário](../design/UI_SURFACE_INVENTORY.md) delimitam a aprovação renderizada.
Não há certificação WCAG, validação de destinos GitHub externos nem promoção dos estados transitórios
loading/erro à aprovação visual; esses estados continuam cobertos pelos testes automatizados.

## Frozen Sprint Microcopy

Removed: “Sprints congeladas são visualizadas individualmente.”
Replacement: **NONE**. Busca de variantes singular/plural não encontrou outra ocorrência na UI.
Badge/contexto “CONGELADA” e “Estado congelado no encerramento” foram preservados.

## Gates finais dos addenda

| Gate | Resultado desta revisão |
|---|---|
| Frontend lint / format | PASS |
| Frontend focused | 8 arquivos, 181 testes PASS |
| Frontend full / coverage | 69 arquivos, 762 testes PASS |
| Frontend coverage | statements 81,10%; branches 74,92%; functions 76,80%; lines 83,38%; thresholds PASS |
| Frontend production build | PASS |
| F01/F02 stress | 20 execuções consecutivas de 41 testes de races PASS |
| Backend lint / format | PASS |
| Backend focused | 154 testes PASS, incluindo frozen/history/carry-over/terminal/name reuse/safe delete/API |
| Backend unit | 554 testes PASS |
| Backend integration/API | 394 PASS; 5 skips canônicos pré-LR.2, sem novos skips |
| Backend coverage runs 1–5 | 948 PASS + 5 skips canônicos em cada execução, cinco exits 0 consecutivos |
| Backend coverage | statements 90,31–90,33%; branches 79,31–79,33%; functions 94,11%; lines 92,83%; thresholds PASS |
| Prisma validate / migration status | PASS; 48 migrations, schema atualizado |
| Architecture / secrets | PASS |
| Supply-chain policy / workflow tests | PASS |
| Audit frontend / backend | PASS; 0 high, 0 critical, nenhuma exceção consumida |
| Git diff check | PASS |

Manifestos: `frontend-gates.json`, `backend-final-gates.json`, `race-stress.json`. Logs finais backend
possuem prefixo `final-`. A rodada inicial teve falha na preparação do novo teste (dois upserts
simultâneos do mesmo branch artificial); a fixture foi corrigida para criação sequencial. Seus logs
iniciais foram preservados e não contam como PASS nem como parte das cinco coberturas finais.
As pequenas diferenças percentuais entre coberturas são observadas, sem falhas de threshold.

Ambiente: Node 22.23.2, MySQL local 9.7.1, Chrome headless real, aplicação/API reais, dados artificiais.
Schemas exclusivos `traceflow_test_fix04_a2_gates_20260905` e `traceflow_test_fix04_a2_core_20260905`;
nenhuma suite destrutiva apontou para schema compartilhado. `cleanup.json` registra remoção desses
schemas/perfil Chrome e encerramento dos serviços, preservando schemas preexistentes e evidências.
CI remoto e Dependency Review de PR não foram executados; não houve mudança de dependências.

Remaining issues no escopo implementado: **NONE**. Legado continua explicitamente limitado por contrato;
não é convertido em passado completo com dados atuais. Recommendation: **READY FOR FINAL PLANNING QA**.
