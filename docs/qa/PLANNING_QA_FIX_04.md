# PLANNING-QA-FIX-04

## Decision

**TECHNICALLY PASS — READY FOR FINAL PLANNING QA.**

F01 e F02 resolvidos no escopo de Sprints/Marcos e suas projeções. O addendum substitui a
reserva nominal anterior: safe delete libera o nome, preservando a identidade histórica.
Gates locais, navegador real e banco descartável foram executados nesta revisão. Este resultado
não representa CI remoto, implantação em produção nem aprovação integral dos 112 BR-IDs.

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
