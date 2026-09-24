# PR #21 — correções direcionadas do code review

**Estado em 23/09/2026: correções locais implementadas e gates automatizados verdes; não declarar `PASS LOCAL` ainda.** A inspeção renderizada cobre os estados carregados disponíveis, mas não os estados de recovery/start-over, e o agendamento de purge em produção não está comprovado. Não houve commit ou push.

## Baseline

- Branch `daniel-dev`, HEAD inicial `dc3505ae52f0ece69475a129d0fb168bb0f7303a`, working tree limpa, `git diff --check` limpo.
- PR #21 no mesmo head, base `main` em `a33ba690f952e12fa44084693ed46f6863d3a055` no início da rodada.
- Node `v22.23.2`. Nenhuma migration nova nem edição de migration histórica nesta rodada.
- Testes com banco usaram schema MySQL local, exclusivo e descartável `traceflow_pr21_review_20260923_test`, distinto do banco de desenvolvimento, e storage de teste real.
- Fontes consultadas: Design System, inventário e log visual, contratos API, matriz RF, endpoints E0, regras/histórico de Planning, backlog, ADRs existentes, retenção, inventário pessoal e matriz de autorização.

## A1 — SearchCombobox / TaskForm

Regressão reproduzida: query estável `ab` com nova identidade de `onSearch` no rerender disparava segunda busca. O efeito do componente compartilhado dependia da identidade da callback. `SearchCombobox` agora usa ref para a callback atual e depende da presença de busca remota e de `searchContextKey` explícita. TaskForm e TaskTraceabilityEditor passam `projectId` como contexto. Testes verificam uma única chamada para Requirement, PR, Commit e Issue após rerender, e nova busca quando o contexto muda. Focados: 27/27.

## A2 — decisão de exclusão

[ADR-014](../architecture/ADR-014-EXCLUSAO-RECUPERAVEL-DE-PROJETOS.md) registra 30 × 24 h, indisponibilidade imediata, preservação de grafo/memberships/bytes, revogação de convites, restore por OWNER, journal/claim de purge, auditoria residual minimizada, reserva de repositório, antecipação irreversível e último OWNER anonimizado. O repositório guarda ADRs em `docs/architecture/` (não existe `docs/adr/`), por isso foi usada a sequência canônica local. E15-F01 permanece **pendente de ativação operacional**, com vínculo ao ADR e ao [runbook](../runbooks/PROJECT_DELETION_PURGE.md). O runbook recomenda executor externo recorrente e alertas, mas não afirma scheduler de produção instalado. O caminho absoluto local foi retirado do relatório histórico de implementação; os demais relatórios de exclusão foram preservados como evidência histórica.

## A3 — burndown tardio

Testes falharam antes da correção para Sprint iniciada no último dia nominal e terminal com janela de um dia. O cálculo usa somente `startedAt` real, produz série de um dia quando legítima, não inventa ponto anterior e mantém snapshot terminal. A comparação com o dia de corte deixou de depender de coerção de `null`. O gráfico trata um ponto sem divisão por zero/`NaN`. CP-PE-23 voltou a uma fixture determinística com clock controlado; não usa data relativa para evitar o edge. Focados backend 21/21, gráfico frontend 6/6 e CP-PE-23 passou.

## M1 — writes após soft delete e evidência

`lockProject` de lifecycle foi preservado para restore/purge. Writes normais passaram a usar `lockActiveProject`: locking read atual de `Project` com `deletedAt IS NULL` na mesma transação da mutation. Foram auditados/ajustados Task, Requirement/Reconciliation, Sprint, Milestone, TestCase/Execution, Defect, movimentos, links, comentários, time entries, commit suggestions e mutações de membership; a ordem Project → Membership foi preservada. Task e Requirement tiveram regressões reais red→green após soft delete.

Na prova MySQL + filesystem real, upload pausado após `storage.prepare()` perdeu para soft delete e purge; a transação rejeitou o write, `TestEvidence` ficou em zero e o byte preparado foi removido. Outra regressão mostrou que `deleteProjectGraph` removia metadata sem journal. Agora, sob claim/lock, cada `TestEvidence` exige entrada `STAGED` ou `MISSING` do token atual antes da remoção relacional; sem cobertura, a transação recua com conflito retryable. A suíte concorrente de exclusão passou 15/15, incluindo multiworker e recovery. `prepared = null` não transforma mais conflito em `TypeError` (teste red→green).

## M2 — budget do purge

Medição em MySQL local descartável com 1.001 commits, 1.000 vínculos CommitBranch, 400 Tasks, 400 históricos e evidência física: purge completo em **92 ms** nesta máquina. A transação final agora declara `maxWait: 5000` e `timeout: 15000`, seguindo precedentes de transações destrutivas do projeto. Isso não extrapola um SLA de produção; volumes maiores e storage remoto exigem observação operacional. Não houve refatoração por etapas sem evidência de necessidade.

## M3 — status legado em Settings/Privacy

Bloqueios de sole OWNER e export operacional pessoal agora distinguem `Project.deletedAt === null`, não `status !== EXCLUIDO`. Projeto em carência não mantém a conta ativa artificialmente e seus dados colaborativos não entram como projeto operacional corrente na exportação. Regressões API de desativação/exportação e anonimização passaram. A decisão sobre perda de recuperação quando não resta OWNER está no ADR.

## M4 — operação do scheduler

Criado [runbook de purge](../runbooks/PROJECT_DELETION_PURGE.md): dry-run/apply, frequência recomendada, claim/stale, alertas, journal, falhas, backup e recuperação. Não foi encontrado agendamento de deploy pronto para configurar nesta rodada. Assim, E15-F01 não foi marcado RESOLVIDO; a obrigação operacional continua explícita.

## M5 — lock do sync

Hipótese medida antes de refatoração: 100 upserts de Issues mantiveram a transação/guarda por **33 ms**; 100 PRs por **40 ms** no MySQL local. Ambos recusaram novo lote após soft delete. A suíte concorrente existente também demonstrou zero write pós-delete para branches, commits, PRs, Issues e estado terminal de sync. Esses dados não reproduzem lock excessivo neste ambiente; o batching não foi alterado para não reintroduzir PD-03 sem prova. Monitorar latência real com DB remoto/volume maior.

## M6 — estado de repositórios

Restore e criação confirmada agora conciliam projetos e repositórios com GET `fresh`; criação após purge deixa de manter o override local do repositório anterior. `404/409` em restore/purge reconciliam ambas as listas e removem ação pendente obsoleta. Regressões demonstraram ausência do segundo GET antes da correção e sua presença depois. Foram acrescentados testes de UI para `409` em restore e `404` em purge feitos por outro OWNER: o catálogo é reconciliado e a ação pendente desaparece. Ainda não há prova desse payload concorrente com backend real.

## M7 — foco e teclado

Após purge confirmado e falha de criação, o CTA de retry recebe foco dentro do NewProjectDialog; Tab vindo de foco externo é recapturado pelo trap. Teste falhou com foco em `body` antes da correção e passou depois. `TaskMoveMenu` usa menuitems fora da sequência Tab (`tabIndex=-1`), ArrowDown/ArrowUp/Home/End, Escape e Tab que fecha e avança ao próximo controle; teste focado passou. No Chrome real, abrir o menu focou o primeiro item, ArrowDown focou o segundo, Escape devolveu foco ao trigger e Tab fechou o menu avançando ao botão de histórico. O estado de retry após purge não foi aberto no banco de desenvolvimento, para evitar destruição de dados reais.

## M8 — propriedade do CSS

As regras globais de `.sprint-menu` e `.sprint-dialog*` saíram de `RequirementsScreen.css` para as folhas importadas pelos componentes SprintActionsMenu e SprintDialog. Permaneceram na página apenas ajustes realmente locais de Requirement. Teste estático de ownership e suíte de Requirements passaram. No Chrome Light 1440, o diálogo `Criar sprint` mediu 736 × 868 px, raio 20 px e overflow interno antes e depois de visitar Requisitos por navegação SPA; as propriedades foram iguais. O diálogo também foi inspecionado em 390 px, sem overflow da página. SprintsScreen conserva algumas regras equivalentes legadas que devem ser avaliadas em revisão mais ampla, sem ampliar este diff sem prova.

## M9 — localização da rastreabilidade

Matriz RF09/RF11/RF12 e catálogo E0 não apontam mais cards de cobertura para Tasks Page. Relações continuam em TaskForm/Task Details/Rastreabilidade e APIs; nenhuma métrica agregada nova foi afirmada. A requisição `listMilestones` era de fato descartada por TaskList e foi removida com teste red→green. `Criado em` permanece em Task Details; `Marco` não aparece ali, pois o Details atual não expõe essa relação — mantido como limite de informação, sem restaurar metadata no card por suposição. O timer em execução mostra início; o histórico distingue eventos por `occurredAt`, origem e duração. Não foram reintroduzidos horários absolutos de início/fim da sessão histórica sem evidência de necessidade funcional.

## M10 — semântica do Task Card

O `<button>` que continha `h3`, `p` e `dl` foi removido. O `article` mantém heading e pares `dt/dd` semânticos, foco visível e ativação por click/Enter/Space; o menu administrativo interno não aciona o card. Regressão red→green e suites TaskPresentation/TasksPage passaram. Leitura com leitor de tela real ainda não foi executada.

## M11 — aprovação visual

O inventário explicita que `VISUALLY APPROVED` requer evidência renderizada Light/Dark × 1440/1280/768/390 no log. As surfaces materialmente alteradas `TASKS-MAIN`, `TASKS-CREATE-EDIT-FORM` e `TASKS-LIST-AND-EMPTY` foram rebaixadas a `TECHNICALLY VERIFIED` até a nova matriz; Kanban registra o menu de teclado sem alegar homologação renderizada. Nenhuma captura foi fabricada ou promovida por Testing Library.

## M12 — degradação de Requirements

Reprodução red: falha isolada de projection derrubava a página apesar do GET básico de Requirements ter retornado. Agora a lista e a cobertura básica permanecem, a projection vira conjunto vazio e um aviso discreto informa indisponibilidade parcial. Card e RequirementDetails usam a mesma função de macro status, e acesso parcial a `summary.defects` é null-safe. A suíte da página passou 12/12.

## Gates e limites

| Gate | Resultado local |
| --- | --- |
| Frontend full / coverage | PASS — 1.231 testes; cobertura 83,87% statements, 78,41% branches |
| Backend unit | PASS — 789 testes com socket local liberado |
| Backend integration/API | PASS — 550 testes, 5 skips legados |
| Backend full / coverage | PASS — 1.339 testes, 5 skips legados; 91,04% statements, 82,70% branches |
| Lint backend/frontend | PASS |
| Format backend/frontend | PASS |
| Frontend build | PASS (avisos preexistentes de chunk grande/IIFE) |
| Prisma validate / generate | PASS; sem migration nova |
| Architecture / secrets | PASS |
| `git diff --check` | PASS |

A primeira tentativa de backend unit no sandbox teve 28 falhas `listen EPERM 127.0.0.1`; a repetição com acesso ao socket local passou 789/789. Não houve alteração de código/teste para mascarar isso. O schema de teste foi conferido como local, distinto do desenvolvimento e gravável antes das execuções. Os cinco skips da integração/coverage já eram os canônicos; nenhum skip novo foi adicionado.

## Visual QA e riscos restantes

Após login manual do usuário, Chrome real autenticado em `localhost:5173`, projeto local 2. Em Light/Dark × 1440/1280/768/390, as páginas carregadas de Tarefas, Requisitos e Sprints tiveram `h1` acima da navegação, sem overflow horizontal (`documentElement.scrollWidth - innerWidth = 0` nas 24 medições). Capturas foram inspecionadas para cards, create/edit de Task, Requisitos/Details, Sprint Evolution/burndown e SprintDialog em recortes representativos de desktop, tablet e mobile nos dois temas. O formulário de Task foi medido nas oito células: largura 928/928/736/390 px, altura 812/812/812/828 px com viewport de 844 px; nenhum overflow horizontal. A edição de TASK-21 foi vista em 1440/1280/768/390 no tema claro. REQ-8 mostrou `Planejado` no card e no Details. O burndown congelado de Sprint 1 foi observado em desktop Light e mobile Dark, com scroll interno e sem overflow da página. O menu de movimentação foi operado por teclado em desktop Light. Nenhuma mutation de negócio foi confirmada pelo navegador.

Isso é inspeção renderizada **parcial**, não uma homologação visual integral: as capturas não cobrem todos os estados de cada superfície em cada uma das oito células. A lista local continha dois projetos ativos e nenhum projeto pendente de exclusão; produzir recovery/start-over exigiria excluir dados reais. Esses estados continuam cobertos por testes automatizados e pela fixture visual de 22/09, mas não foram revalidados renderizados nesta rodada. Faltam ainda teste backend real do conflito 404/409 entre OWNERs, leitor de tela real/cross-browser e instalação observável do scheduler de produção. O inventário permanece `TECHNICALLY VERIFIED`, sem promoção a `VISUALLY APPROVED`.

**Veredito local: ainda não satisfaz os critérios de `PR #21 CODE REVIEW TARGETED CORRECTIONS — PASS LOCAL`.** Os gates automatizados estão verdes, mas a matriz visual integral e a obrigação operacional acima permanecem abertas. Revalidar independentemente o diff e esses limites antes do merge; não transformar este relatório em aprovação final da PR.
