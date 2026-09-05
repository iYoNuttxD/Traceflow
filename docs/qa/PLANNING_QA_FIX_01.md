# PLANNING-QA-FIX-01

Execução local em 04/09/2026. Resultado final: **PLANNING-QA-FIX-01 — TECHNICALLY PASS**.

## Baseline

- Branch: `joao-dev-v2`.
- HEAD: `316ac80d4d7d81d73d2c2aa096fa2790ab9c321b`.
- Working tree inicial: somente `?? docs/qa/PLANNING_BUSINESS_RULES.md`.
- `git diff --check` inicial: PASS.
- Node dos testes/gates: `22.23.2` (Node padrão do shell: `26.7.0`).
- MySQL disponível: `9.7.1`; banco de teste configurado disponível.
- Schema exclusivo criado: `traceflow_test_planning_fix_01_20260904`.
- Banco de desenvolvimento `traceflow`, produção e dados preexistentes: não alterados.
- Fonte canônica lida integralmente e preservada: `PLANNING_BUSINESS_RULES.md`.

## F1 — Frozen Sprint Evolution

Status: RESOLVED.

Root cause: o congelamento preservava status/corte da participação, mas o repository ainda
buscava `Task.estimatedEffort` e o histórico de conclusão atual. Edição ou exclusão da Task
reescrevia pontos e série do período encerrado.

Historical model: `SprintTask.pointsAtPlanning` é separado de `pointsAtClose` e
`completedAtClose`; `Sprint.closedAt` preserva o corte também em cancelamento/escopo vazio.
`exitStatus` e `SprintTask.closedAt` existentes são reutilizados.

Implementation: captura transacional em start/close. Evolução terminal lê somente snapshots,
sem join de esforço/status atual e sem consultar o histórico mutável de conclusão da Task.
Métricas operacionais de Sprint aberta continuam respondendo ao estado corrente.

Migration: `20260904180000_planning_historical_snapshots`, incremental, seis campos nullable.
Nenhuma migration antiga foi editada; não houve reset. Validação e status realizados somente
contra o schema artificial: 46 migrations aplicadas.

Legacy data: **LEGACY HISTORICAL LIMITATION** explícita. Nenhum backfill com dados atuais.
Sem pontos históricos, burndown é sem dados; limitações são expostas em `historicalLimitations`.
A precisão de membership antigo e corte legado não é inventada. Ver
[modelo histórico](../data/PLANNING_HISTORY.md).

Tests: antes da implementação, falharam `5→13`, `5→1` e exclusão da Task no backlog. Depois,
passaram imutabilidade de corte, total, série e métricas; exclusão também de Task concluída;
cancelamento com/sem Tasks; e pontos operacionais `5→13` com planejamento persistido em `5`.

## F2 — Planning Baseline

Status: RESOLVED.

Root cause: `!addedAfterStart` contava toda participação antiga, inclusive removida antes do
start. Reativar a linha preservava a flag e o primeiro `addedAt`, confundindo participação
passada com membership do planejamento.

Membership-at-start: `planningSnapshotAt` confirma a captura de `plannedAtStart` e pontos das
participações ativas na mesma transação de start. Esse snapshot é autoridade para novas Sprints.

- Removed-before-start: A fica fora; baseline contém somente B.
- Added-after-start: reentrada de A é adição; baseline permanece B.
- Removed-after-start: A continua no baseline e aparece como removida.
- Repeated membership: entradas/saídas antes do start não geram planejamento artificial.
- Reentrada de Task realmente planejada mantém o baseline e não vira adição posterior.

Tests: cenários A–E reais via service/repository/MySQL. A/C/E falharam antes; B/D já passavam.
As regressões verificam também os campos persistidos e a classificação devolvida ao frontend.
A bateria histórica ampliada contém 13 testes.

## Sprint Business Rules Revalidation

| Regra | Resultado | Evidência |
| --- | --- | --- |
| BR-SPRINT-006 | PASS | snapshot do start e pontos persistidos |
| BR-SPRINT-007 | PASS | baseline B após remover A antes do start |
| BR-SPRINT-008 | PASS | reentrada posterior de A classificada como added |
| BR-SPRINT-009 | PASS | A removida depois permanece planejada; reentrada preserva baseline |
| BR-SPRINT-010 | PASS | composição terminal bloqueada; regressões de lifecycle |
| BR-SPRINT-011 | PASS | associação a Marco terminal permanece protegida |
| BR-SPRINT-012 | PASS | zero/percentual parcial/conclusão e cálculo operacional preservados |
| BR-SPRINT-013 | PASS | pontos, progresso, escopo e burndown históricos preservados |
| BR-SPRINT-014 | PASS | corte e série não mudam após editar/excluir Task |

Sprints, Marcos, Schedule e concorrência de start/overlap/close foram reexecutados nas suites
inteiras de integração e API. Os testes de comentários também integram o gate completo.

## F3 — Kanban Mobile Overflow

Status: RESOLVED na revalidação renderizada focal.

Root cause: `project-tabs.css` aplicava margens negativas de 16 px, mas o Kanban mobile tinha
apenas 8 px de gutter. O nav chegava a `x=-8`, `right=398` em viewport 390.

Fix: override pertencente ao Kanban remove as margens negativas e limita o nav ao container.
Nenhuma regra `body { overflow-x: hidden }` foi adicionada.

| Viewport | clientWidth | scrollWidth | Nav esquerdo/direito | Light/Dark |
| --- | --- | --- | --- | --- |
| 390×844 | 390 | 390 | 8 / 382 | PASS |
| 375×844 | 375 | 375 | 8 / 367 | PASS |
| 320×844 | 320 | 320 | 8 / 312 | PASS |

Board scroll: conteúdo 864 px dentro de containers 374/359/304 px; `overflow-x:auto` preservado.
O scroll interno avançou 150 px com `document.scrollLeft=0`. Drawer real aberto manteve as três
larguras sem overflow global. Nenhum elemento externo aos scrollers intencionais ultrapassou o
documento após a correção.

Visual validation: Chrome headless, AppShell/pages reais e respostas de API artificiais,
Light/Dark. Isto é revalidação renderizada focal, sem homologação touch ou promoção de surfaces.

## F4 — Sprint Summary

Status: RESOLVED na revalidação renderizada focal.

Root cause: a grade fixa de três colunas deixava a sexta posição vazia na segunda linha;
mesmo com bordas próprias, o fundo da surface continuava mostrando essa região.

Layout: flex com quebra de linha, crescimento dos itens reais e bordas em cada célula.
Exatamente cinco métricas; nenhum placeholder. A última linha ocupa toda a largura.

| Contexto | Distribuição | Evidência |
| --- | --- | --- |
| Wide 1440 | 5 | cinco células numa linha, com destaque da Sprint ativa |
| Intermediate 1024 / conteúdo 872 | 3 + 2 | primeira linha 3×290 px; segunda 2×435 px |
| Tablet 768, sidebar recolhida | 2 + 2 + 1 | conteúdo 616 px; última métrica ocupa 614 px úteis |
| Tablet 768, sidebar expandida | 2 + 2 + 1 | conteúdo 432 px, sem overflow |
| Mobile 390 | 1 + 1 + 1 + 1 + 1 | cinco surfaces reais, sem região de preenchimento |

Visual validation: Light/Dark renderizados; imagens completas do Summary inspecionadas.
Trinta casos geométricos entre Kanban/Sprints/Marcos, incluindo os dois estados tablet:
nenhuma falha nem exceção de runtime. Teste estrutural verifica flex-wrap/grow, bordas e
breakpoints; não se limita à contagem de DOM. Marcos e Kanban foram revalidados; não houve
alteração de primitive compartilhada.

## F5 — Backend Coverage Stability

Status: RESOLVED.

Root cause: isolamento do transporte HTTP. Supertest recebia uma função Express, abria um
listener wildcard efêmero (`::`) e enviava a requisição para `127.0.0.1`. Neste ambiente,
um listener IPv4 preexistente podia ocupar a mesma porta. A resposta vinha de outro serviço.

Prova independente, sem aplicação ou banco: entre 3.000 requisições a um servidor mínimo,
uma retornou `401 Invalid authentication` sem o marcador do handler. Na porta observada,
listener `::` respondeu corretamente por `[::1]`, mas por `127.0.0.1` retornou o mesmo `401`;
bind explícito IPv4 detectou `EADDRINUSE`. Não é hipótese atribuída ao MySQL 9.

Isolamento auditado: `fileParallelism=false` e `sequence.concurrent=false` já eram canônicos;
as limpezas do banco não concorriam entre arquivos. Sessões, fixtures de GitHub e cleanup não
explicam uma resposta estrangeira numa reprodução sem esses componentes.

Affected tests: polling GitHub e despromoção concorrente de OWNER da QA; nesta execução,
também cadastro público em `lr1-auth-identity-hardening.test.js` recebeu 401.

Fix: `test/helpers/http-server.js` aguarda um listener IPv4 explícito e reutiliza o mesmo servidor
por aplicação, fechando-o ao fim da suite. Todas as suites de API e testes unitários HTTP usam
esse transporte; SSE usa seu servidor IPv4 já existente. Teste comportamental verifica identidade,
endereço, reutilização e clientes concorrentes. Nenhuma asserção de status foi relaxada; nenhuma
mudança de retries, workers ou configuração de serialização.

Diagnóstico antes do fix (suite existente, excluindo somente as novas regressões ainda vermelhas):

| Run | Resultado |
| --- | --- |
| 1 | PASS — 880 testes + 5 skips |
| 2 | PASS — 880 testes + 5 skips |
| 3 | FAIL — cadastro público esperava 201, recebeu 401; report de cobertura não concluído |
| 4 | PASS — 880 testes + 5 skips |
| 5 | PASS — 880 testes + 5 skips |

Rodada adicional instrumentada: PASS. Após corrigir as suites de API, cinco rodadas passaram
com 894 testes + 5 skips em cada uma: API Run 1 PASS, Run 2 PASS, Run 3 PASS, Run 4 PASS,
Run 5 PASS. A mesma fixture foi então aplicada aos quatro arquivos
unitários HTTP restantes. A bateria final abaixo corresponde à versão completa.

| Coverage final | Resultado | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- | --- |
| Run 1 | PASS — 894 testes + 5 skips | 90.04% | 78.40% | 93.94% | 92.56% |
| Run 2 | PASS — 894 testes + 5 skips | 90.06% | 78.42% | 93.94% | 92.56% |
| Run 3 | PASS — 894 testes + 5 skips | 90.06% | 78.42% | 93.94% | 92.56% |
| Run 4 | PASS — 894 testes + 5 skips | 90.06% | 78.42% | 93.94% | 92.56% |
| Run 5 | PASS — 894 testes + 5 skips | 90.06% | 78.42% | 93.94% | 92.56% |

As cinco rodadas consecutivas concluíram os reports text, JSON summary e HTML.


Skips canônicos preservados: 1 teste de backfill E6 e 4 de reconciliação E11, restritos a banco
pré-LR.2. Não há novos skips.

## Accessibility Pending

BR-UX-005: **ENVIRONMENT BLOCKED** para touch/DnD mobile real. Browser headless e scroll
programático não homologam gestos em dispositivo físico.

Kanban keyboard movement: **KANBAN KEYBOARD MOVE ACCESSIBILITY GAP**. O board utiliza HTML
`draggable` e handlers de drag/drop; Enter/Espaço abrem detalhes, mas não movem status entre
colunas. Nenhum fluxo novo ou select de status foi introduzido.

O gate frontend detectou uma corrida no teste de abertura/retorno de foco: Escape era enviado
antes do frame que coloca foco no dialog. O teste agora aguarda e exige esse foco antes de
Escape, mantendo a exigência de retorno ao card. Produção não foi modificada nesse ponto.

## Backend Impact

API: adições compatíveis `Sprint.planningSnapshotAt`, `Sprint.closedAt` e
`progress.historicalLimitations`. Rotas, papéis, autorização e fórmula de progresso preservados.

Schema: seis campos nullable em Sprint/SprintTask. Sem nova FK, cascade ou índice desnecessário.
Índices/FKs/cascatas e nullable foram inspecionados no MySQL; exclusão de Task preserva snapshots.

Migration: nova migration incremental aplicada no schema artificial; não aplicada a `traceflow`
ou produção. Legado documentado sem precisão retrospectiva fabricada.

## Frontend Gates

Node 22: lint, format check, full tests **687/687**, coverage e build: PASS.
Arquitetura/segredos: verificadores canônicos compartilhados do repositório: PASS.
Build mantém aviso não bloqueante de bundle acima de 500 kB.

A primeira execução de full tests/coverage falhou somente no teste de foco descrito acima;
os dois gates passaram após fortalecer a sincronização da asserção.

## Backend Gates

Node 22 / MySQL 9.7.1: lint, format, unit **547/547**, integration/API **347 PASS + 5 skips**,
Prisma validate, migration status, arquitetura, secret scan e supply chain: PASS.
Política CI/audit: **12/12**. Audit backend/frontend: zero high/critical, sem exceções aplicadas.
Cobertura/repetibilidade final: **5/5 PASS consecutivos**, com todos os reports concluídos.

Não é resultado remoto de CI nem validação de MySQL 8.4.8, versão declarada no workflow.

## Coverage

| Projeto | Statements | Branches | Functions | Lines |
| --- | --- | --- | --- | --- |
| Frontend | 80.50% | 73.38% | 76.01% | 82.68% |
| Backend (Run 5) | 90.06% | 78.42% | 93.94% | 92.56% |

## Documentation

Atualizados API_CONTRACTS, ADR-010 e SYSTEM_ARCHITECTURE; criado `docs/data/PLANNING_HISTORY.md`
com modelo, inventário dos campos, transações e limitações legadas. Este relatório registra a
evidência local. TCC oficial, roadmap, UI Surface Inventory e Visual Validation Log não foram
alterados; as surfaces continuam aguardando nova QA integrada.

Evidências locais: `/private/tmp/planning-qa-fix-01/`, incluindo logs de regressões vermelhas,
baterias completas, relatórios HTML/JSON de coverage, auditoria de schema, reprodução HTTP,
`evidence-geometry.json` e imagens `evidence-*.png`. O browser usou fixtures artificiais,
sem sessão pessoal nem mutations de contas reais.

## Git

Branch: `joao-dev-v2`. HEAD: `316ac80d4d7d81d73d2c2aa096fa2790ab9c321b`.
Changed files: schema/migration, repository/calculators/services de Sprint, regressões históricas,
fixture HTTP e seus consumidores de teste, CSS owner de Kanban/Sprints, regressões frontend e
documentação relacionada. Lista nominal e diff stat no artefato `git-final.txt`.

`PLANNING_BUSINESS_RULES.md`: **PRESERVED**, continua untracked e sem edição.
Commit/push/merge/rebase/reset/PR review: **NOT EXECUTED**.
Diff check final: **PASS**. Schema artificial removido e ausência confirmada; Chrome isolado
e Vite desta execução encerrados. Artefatos de evidência preservados em `/private/tmp`.

## Remaining Blockers

- Nova QA integrada de Planning e homologação touch/DnD real.
- Movimento de Kanban exclusivamente por teclado requer decisão separada.
- Dados anteriores à migration têm as limitações históricas explicitadas.
- Compatibilidade remota MySQL 8.4.8/CI não executada nesta tarefa local.

## Recommendation

**READY FOR PLANNING QA REVALIDATION**. A aprovação técnica local não substitui a nova QA
integrada, a homologação touch nem a validação remota de CI.
