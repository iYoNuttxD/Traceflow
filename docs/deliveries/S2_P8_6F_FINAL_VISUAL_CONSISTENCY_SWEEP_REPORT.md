# S2 P8.6F — Final visual consistency sweep

> Legacy label: S2 P8.6F. Canonical phase: **IND-P8.6F**.
> Fase interna de indicadores vinculada a S2-04/S2-05; não é o cartão S2-08.
> [Mapeamento canônico](../../TRACEFLOW_ROADMAP_INCREMENTAL.md#fases-internas-de-indicadores-ind).

## 1. Baseline

- Data: 2026-10-04. Branch `daniel-dev`; HEAD `9d3e9dfb65475a21a7ef063a48c2f6567216b470`.
- Working tree inicialmente limpo; `git diff --check` e `git diff --stat` sem saída.
- Node dos gates: 22.23.3 (`/opt/homebrew/opt/node@22/bin`); runtime padrão da máquina: 26.9.0.
- API real local, Project 2, dataset de homologação já existente. Nenhuma escrita de domínio planejada.
- Sem commit/push. P9 fora do escopo.

## 2. Docs reviewed

Design System, UI Surface Inventory, Visual Validation Log, S2 Indicator Catalog,
Project Health Model v1, API Contracts e entregas P8.6A/B/C/D/E. A decisão desta
rodada de badges inline substitui a anatomia com estado abaixo do título da P8.6D.

## 3. Full visual audit

Registro inicial criado **antes das alterações de código**. Inspeção real das oito
categorias e Visão Geral em Chrome, com capturas integrais (inclusive conteúdo abaixo
da dobra). Contexto: 01–30/09/2026, America/Sao_Paulo, Sprint A (16).
Evidências iniciais: `/private/tmp/traceflow-p86f-20261004/before-*.jpg`.

| ID / categoria | View | Problema visual | Severidade | Causa | Correção proposta | Status |
| --- | --- | --- | --- | --- | --- | --- |
| F01 NAVIGATION | Todas | Nav do projeto corta opções mesmo em 1440; Indicadores exige scroll | MEDIUM | Padding horizontal e largura intrínseca dos 12 itens | Compactação moderada mantendo targets de 48px; conferir 1280 | Corrigido e reinspecionado |
| F02 FILTER | Requisitos, Tasks, TestCases, Rastreabilidade, Sprints, Marcos, Kanban, Repositório | Limpar acima dos campos; Defeitos/Indicadores abaixo; Repositório usa outra variante | MEDIUM | Ações renderizadas individualmente por cada owner | Rodapé e variante compartilhados, depois dos campos | Corrigido e reinspecionado |
| F03 FILTER / SPACING | Indicadores | Legenda Período acrescenta altura e desalinha Sprint das datas | LOW | Legend visual e alinhamento ao fim do grupo | Preservar grupo acessível, remover apenas legenda visual e alinhar controles pelo topo | Corrigido e reinspecionado |
| F04 BADGE / ALIGNMENT | Todas as categorias | Badges abaixo do título deslocam valores equivalentes | MEDIUM | IndicatorHeader separa status em outra linha | Título/status inline com wrap e ajuda independente à direita | Corrigido e reinspecionado |
| F05 GRID / SPACING | Fluxo | WIP ocupa linha sozinho; Throughput com gráfico ao lado de lista curta | MEDIUM | Classificação genérica entre KPIs e detalhes | Strip WIP/Throughput, tendência em linha própria, Aging com altura do conteúdo | Corrigido e reinspecionado |
| F06 ALIGNMENT / CHART | Fluxo | Ações Ver dados de Lead/Cycle em alturas diferentes | MEDIUM | Referência opcional acrescenta linha no footer de apenas um gráfico | Compartilhar linhas semânticas também no gráfico/footer, sem texto de preenchimento | Corrigido e reinspecionado |
| F07 GRID / TYPOGRAPHY | Sprint | Divisor da célula Escopo removido termina cedo; Carry-over menor | MEDIUM | Flex align-start e escala específica de 24px no carry-over | Três células com divisores completos, mesma escala de valor | Corrigido e reinspecionado |
| F08 GRID | Qualidade | Divisores de distribuições terminam conforme número de linhas | LOW | Borda no card com altura do conteúdo | Alinhar divisores apenas entre células equivalentes | Corrigido e reinspecionado |

Sem problema novo observado no Health compacto integrado à Visão Geral. Estados
zero/sem dados/indisponível/parcial continuam explícitos. Burndown/Burnup/Velocity
possuem série real; CFD tem área adequada. A edição de data por automação será
reconfirmada com interação nativa antes de classificar qualquer defeito funcional.

### Achados da iteração

| ID | Achado / causa | Correção e comprovação |
| --- | --- | --- |
| F09 FILTER | Diálogos de histórico/sessões também mantinham ações inline próprias | `FilterActions` no footer; aplicação explícita e Clear de draft confirmados na UI |
| F10 ALIGNMENT | Títulos/badges quebrados deslocavam valores entre KPIs na mesma linha | Subgrid semântico e spans responsivos; valores equivalentes alinhados |
| F11 EMPTY STATE | Mensagem NO_DATA isolada em outra linha ficava distante do travessão | Conteúdo vazio agrupado; PR aging e Issues compactos reinspecionados |
| F12 LIMITATION | Total e tendência de I22 poderiam repetir uma limitação específica | Contagem de apresentações promove a mensagem para a seção; regressão dedicada |

## 4. Filter standardization

`CollapsibleFilterPanel` centraliza a superfície e recebe `onClear`, `canClear` e
`clearDisabled`. Os dez owners usam a mesma primitive. Removidas duplicações de
borda/background/radius e ações individuais. O Repositório conserva o título
contextual “Filtrar artefatos”, com a mesma anatomia.

## 5. Shared action footer

`FilterActions` fica após os campos, com `justify-content: flex-end`. Clear ghost,
submit primary apenas nos filtros manuais já existentes. Histórico e sessões foram
abertos com API real: alterar o draft conserva os resultados; Filtrar aplica; Clear
restaura. No histórico mobile os botões continuam lado a lado à direita.

## 6. Project navigation

Doze links imediatamente visíveis com sidebar expandida: 1440 → 1104/1104px e
1280 → 944/944px (clientWidth/scrollWidth). Targets de 48px, fonte de 14px em
1440 e 12px em 1280. Menores mantêm navegação horizontal; nenhum item removido.

## 7. Analytics selector

Oito categorias sem scroll em desktop: 1039/1039px em 1440 e 879/879px em 1280.
Targets de 48px. Home/Enter e setas cobertos; período e Sprint persistem entre views.

## 8. Indicator header

Uma primitive para título, Health, Data State e ajuda. Health primeiro, no máximo
dois badges; wrap quando necessário. Ajuda visual pequena conserva target de 44px.
Tooltips sem identificadores técnicos; Escape fecha e retorna foco ao acionador.

## 9. General

Saúde 70/100, cobertura 81% no recorte observado; Panorama, atrasadas, defeitos e
Sprint em foco renderizados. Valores dos KPIs agora alinham mesmo com títulos
longos. Overview permanece na versão mínima definida pelo hardening P8.6C:
coração, score 69/100, status e barra dentro do container; não foi reintroduzido o
CTA removido por aquela decisão. Overview usa outro contexto, sem o período aplicado.

## 10. Planning

40 Tasks; 1 sem responsável; 1 sem estimativa; 4 atrasadas. Esforço conhecido
163h/117,03h e desvio comparável −0,97h preservados. Tabela de tarefas acima da
estimativa mantém rolagem interna. Estado parcial e aviso compartilhado conservados.

## 11. GitHub

133 commits no período; 93 na main, 67 associados e 26 sem associação. Grupos de
associação/responsável preservados. PR history aparece uma vez na seção; PR aging
sem dados compacto. Mediana até merge 100,5h e referência 4,48h vêm do backend.
Limitação histórica de Issues permanece explícita. Nenhum sync externo disparado.

## 12. Flow

WIP, Throughput, Lead, Cycle, Aging e CFD reinspecionados. Aging tem altura própria;
CFD ocupa a largura da seção, com SVG de 352px no desktop. Série de 30 dias conserva
lacunas honestas. Nenhuma fórmula, relógio ou amostra foi alterada.

## 13. WIP and Throughput

Strip 4/16, com valores retornados pela API. A série temporal de Throughput fica
abaixo em linha própria. Não soma pontos no frontend. Com série ausente/curta não
cria tendência redundante; estados de dados continuam presentes.

## 14. Lead and Cycle

Lead 6 dias com referência 4,5 dias e +33,33%; Cycle 1 dia sem referência elegível.
Medição final em 1440: diferença vertical **0px** entre valores, início dos plots e
Ver dados. Plots de 288px; aviso específico de Cycle abaixo. Tabela aberta por
teclado: 30 datas com `—` nos dias sem amostra; zeros reais continuam valores.
CFD selecionou 30/09 por End: 0 A fazer, 4 Em andamento, 28 Concluído.

## 15. Sprint

Sprint A: 20h planejadas, 24h atuais, 20h entregues; 5 Tasks planejadas/entregues.
Burndown e Burnup com oito buckets reais e Velocity com quatro Sprints renderizados.
Esforço 24h/20h/−4h. One-point/NO_DATA continuam cobertos pela regressão existente.

## 16. Scope dividers

Um container de Mudanças de escopo: 1 Task adicionada, 0 removidas e 1 saída.
Divisores percorrem toda a célula e Carry-over usa a mesma escala de valor. Wrap
2+1 em tablet e uma coluna mobile mantêm bordas e leitura.

## 17. Tasks

Estado do trabalho, esforço, distribuição e atrasadas revisados com nomes longos.
Acima da estimativa: 8; abaixo: 11 (10 registros apresentados, caption explícito).
Valores, unidades e critérios de elegibilidade preservados.

## 18. Quality

PASS 36,67%, FAIL 43,33%, BLOCKED 20%. Distribuições de execução/TestCases e
status/severidade de Defects com divisores completos. Reteste 28,57%, contagens
2/2/3 continuam contagens. Concentração mantém aviso de não aditividade e tabelas.

## 19. Traceability

Sete dimensões independentes, sem funil: 91,67%; 58,33%; 75%; 25%; 16,67%; 25%;
40,83%. Reference markers e texto acessível preservados. Última linha distribui sua
largura entre os três indicadores restantes no desktop.

## 20. Empty states

Zero, sem dados e indisponível continuam distintos. PR aberta = 0; aging sem PR
mostra travessão e explicação compacta. Sem altura de gráfico reservada no vazio.
Mensagem vazia acompanha o valor dentro da mesma célula.

## 21. Tables

Regiões com `tabIndex=0`, caption e limite de 20rem. No mobile, a tabela de esforço
acima tinha 951px de conteúdo em 320px: End chegou a 630,5px de scroll (máximo 631px),
e ArrowRight chegou a 18,5px (máximo 19px). Últimas linhas/colunas acessíveis, sem
crescimento horizontal do documento.

## 22. Responsive

| Largura | Evidência pós-correção |
| --- | --- |
| 1440 | Todas as categorias Dark + Overview; Rastreabilidade Light; nav e hit areas medidos |
| 1280 | Oito categorias Dark; nav sem scroll; Geral/Qualidade e estrutura de Fluxo/Sprint inspecionados |
| 1024 | Oito categorias Dark; Fluxo empilhado e tabelas inspecionados |
| 768 | Fluxo Light com sidebar expandida; Sprint Dark com sidebar recolhida |
| 430 | Oito categorias Dark; GitHub mobile inspecionado |
| 390 | Tasks/tooltip/histórico Dark; Rastreabilidade Light; drawer e scroll por teclado |
| 360 | Filtro com data parcial Light; campos empilhados e erro local legível |

Medições não apontaram overflow do documento. Scroll interno de navegação/tabelas
é intencional. Inspeção direta amostral por breakpoint, complementada pela captura
das categorias e validação da primitive compartilhada.

## 23. Light and Dark

Amostras obrigatórias 1440/768/390 nos dois temas concluídas. Cores seguem tokens;
nenhuma cor literal adicionada. Sidebar expandida/recolhida e drawer móvel exercitados.

## 24. Accessibility

Labels De/Até/Sprint presentes; Período permanece como nome acessível do grupo sem
legenda visual. Erro associado por ARIA; contador reflete somente filtros aplicados.
Disclosures e manual submit por teclado; ações de 44px e navegação de 48px.
Tooltips comerciais dentro do viewport; gráfico com título, legenda, seleção por
setas/Home/End e tabela. Referências têm valor textual/accessible name; Health e
Data State incluem rótulo, sem depender só de cor. Não é certificação WCAG completa.

## 25. Async

Código de autoridade de requests e invalidação não alterado. Regressões de respostas
obsoletas, troca de projeto/view/período e ausência de refetch em focus/visibility
reexecutadas. Back/Forward reais restauraram view=traceability/flow com datas e
Sprint 16; refresh manual atualizou o contexto analítico. Não se alega novo Alt+Tab
nativo nem benchmark de rede nesta rodada.

Interações reais adicionais: apagar o dia de Até manteve URL 01–30/09 e contador 2;
Sprint A → B e troca de categoria conservaram draft inválido e recorte aplicado.
Sprint automática removeu apenas Sprint; Clear zerou datas/contador e ocultou a ação.
O erro em 360px ficou junto aos campos, sem deslocar o footer para fora do painel.

## 26. Tests

Novas regressões de footer compartilhado/manual, posicionamento, Clear em draft,
Health/Data State inline, WIP/Throughput, deduplicação I22, nav desktop, subgrid,
divisores e spans responsivos. Regressão de Back agora inclui Forward. Contratos de
one-point, referência, NO_DATA/zero, duração, filtros parciais, races e foco mantidos.

Primeira execução full encontrou duas expectativas antigas (Clear somente após
Apply e CSS duplicado do Repositório); foram atualizadas para o contrato desta
rodada, preservando asserts de semântica e tokens. O primeiro teste CSS novo também
foi ajustado ao seletor agrupado real. Não houve skip, retry ou timeout relaxado.

## 27. Gates

Resultados finais registrados abaixo após a última correção de código e reinspeção.

| Gate Node 22 | Resultado final |
| --- | --- |
| Frontend test | 108 arquivos; 1.322 testes PASS |
| Frontend coverage | 1.322 PASS; statements 85,10%, branches 79,74%, functions 80,94%, lines 87,51% |
| Frontend lint / format:check / build | PASS / PASS / PASS |
| Backend unit | 83 arquivos; 888 PASS |
| Backend integration/API | 49 arquivos PASS, 2 skipped; 607 PASS, 5 skipped legados |
| Backend coverage | 1.495 PASS; statements 92,21%, branches 85,47%, functions 95,50%, lines 94,60% |
| Backend lint / format:check | PASS / PASS |
| Prisma validate / generate | PASS / PASS; sem migration nova |
| Architecture / secrets | PASS / PASS |
| Local CI policy | `validateRepositoryCi()` = true |
| CI/audit policy tests | 83 PASS |
| CI policy format | PASS |
| Dependency/security backend + frontend | PASS; 0 HIGH/CRITICAL, 0 exceções utilizadas |
| git diff --check | PASS |

Comandos canônicos: `npm run test`, `test:coverage`, `lint`, `format:check`, `build`
no frontend; `test:unit`, `test:integration`, `test:coverage`, `lint`, `format:check`,
`prisma:generate`, `architecture:check`, `security:secrets` no backend; `npx prisma validate`;
validador e testes de CI/audit do diretório `scripts`. Auditoria executada pelo
`check-npm-audit.mjs` com política versionada inalterada. Nenhuma exclusão de dev deps.

Runtime 22.23.3; `NODE_OPTIONS=--no-experimental-webstorage`. Testes backend usam
`localhost/traceflow_test`, distinto de `localhost/traceflow`; helper valida essa
separação antes de preparar fixtures. Não houve escrita no banco de homologação.


## 28. Visual evidence

Diretório transitório local: `/private/tmp/traceflow-p86f-20261004/`.

- `before-*.jpg`: auditoria anterior às edições.
- `final-1440-dark-{general,planning,github,flow,sprint,tasks,quality,traceability,overview}.jpg`.
- `final-1280-dark-*.jpg`, `final-1024-dark-*.jpg`, `final-430-dark-*.jpg`.
- `final-1440-light-traceability.jpg`, `final-768-light-flow.jpg`, `final-768-dark-sprint.jpg`.
- `final-390-dark-tasks.jpg`, `final-390-dark-tooltip.jpg`, `final-390-light-traceability.jpg`.
- `final-360-light-date-error.jpg`, `final-390-dark-history-filter.jpg`.
- `final-filter-*.jpg`: nove áreas adicionais e dois diálogos com footer comum.
- `final-flow-data-table.jpg`, `proof-flow-desktop.jpg`, `responsive-matrix.json`.
- `final-console.json`: nenhum novo warn/error desde 04:00UTC durante a reinspeção.
- `*-gates.json`, `*.log`: gates desta rodada; `frontend-initial/` conserva falhas corrigidas.

As capturas integrais complementam a inspeção do viewport e medições DOM. Elementos
fixed podem aparecer na posição da janela usada na captura integral; o viewport
real foi conferido separadamente para sobreposição/foco.

## 29. Remaining limitations

Sem achado visual relevante aberto nesta rodada. Limitações honestas do dataset
(Cycle sem baseline elegível, histórico parcial de PR/Issues/CFD, esforço ausente)
permanecem. Referências e Health seguem contratos existentes; nenhuma fabricação de
histórico. Não foram alterados backend, schema, migration, banco ou dependências.

Cinco testes backend legados permanecem skipped pela suíte existente; nenhum novo
skip. Gates são locais; não houve execução de CI hospedada, certificação WCAG,
teste touch físico ou nova medição nativa de zoom. O gate de segurança preserva a
política HIGH/CRITICAL vigente, sem nova exceção; não significa zero achados moderate.

Durante HMR houve uma referência temporária a `activeCount` corrigida antes da
reinspeção final; não há erro novo na baseline renderizada. A evidência fica em
`/private/tmp` e pode ser removida pelo sistema; os resultados estão documentados aqui.

## 30. Final verdict

**S2 P8.6F FINAL VISUAL CONSISTENCY SWEEP — PASS LOCAL**

**INDICATORS FINAL STABLE BASELINE** para o escopo local documentado.
Achados F01–F12 encerrados; frontend/backend full, gates auxiliares e inspeção real
concluídos. Sem alteração de fórmula, contrato, Health Model, schema ou dependência.

Sem commit/push. P9 não iniciado. Sugestão de commit:
`fix: finalize indicators visual consistency`.

