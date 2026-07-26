# E13 — Performance e consolidação do frontend

## Estado

**CONCLUÍDA em 26/07/2026.** A E13 introduziu code splitting por rota, isolou o grafo do carregamento inicial, decompôs Tasks e Kanban por responsabilidades reais e ampliou a cobertura de sessão e rotas. Não houve alteração de contrato HTTP, schema, migration ou regra de negócio.

## Baseline operacional

- Branch: `daniel-dev`.
- Commit inicial: `a783451` (`fix(frontend): close E12 validation regressions`).
- Alterações preexistentes preservadas: os PDFs do TCC/ASVS e `TRACEFLOW_MAPEAMENTO_REFATORACAO.md`, não rastreados.
- Frontend: 69 testes em 21 arquivos; 49,58% statements, 44,33% branches, 40,45% functions e 52,43% lines.
- Backend herdado: 198 testes.

O build Vite inicial transformava 293 módulos e produzia um único JavaScript de entrada com 576,00 kB (176,35 kB gzip), além de 43,66 kB de CSS. Esse era também o maior chunk e gerava o aviso de tamanho superior a 500 kB. A dependência `@xyflow/react`, alcançada estaticamente por `TraceabilityFlow`, contribuía para esse agrupamento.

## Lazy loading e arquitetura dos chunks

Todas as páginas públicas e protegidas declaradas em `AppRoutes` passaram a usar `React.lazy`: login, registro, recuperação de senha, convite, entrada em projeto, projetos, detalhes, requisitos, tarefas, Kanban, repositório, rastreabilidade, privacidade e auditoria. `lazyNamed` adapta os exports nomeados existentes sem alterar as pages.

Um único `Suspense` na fronteira das rotas usa `LoadingState` com `role="status"` e a mensagem “Carregando página...”. O `ErrorBoundary` global permanece acima da árvore e apresenta resposta segura para falhas de importação dinâmica. `ProtectedRoute`, `AuthProvider`, `ConfirmProvider`, restauração de sessão e CSRF foram preservados.

Resultado do build final:

| Artefato | Antes | Depois |
|---|---:|---:|
| JavaScript inicial | 576,00 kB | 290,50 kB |
| JavaScript inicial gzip | 176,35 kB | 95,28 kB |
| Maior chunk | 576,00 kB | 290,50 kB |
| Chunk Tasks | integrado à entrada | 62,56 kB |
| Chunk Traceability | integrado à entrada | 188,95 kB |
| CSS inicial | 43,66 kB | 28,25 kB |
| CSS Traceability | integrado ao CSS inicial | 15,41 kB |

A entrada caiu 285,50 kB, ou aproximadamente 49,6%. O aviso do Vite desapareceu. O grafo e `@xyflow/react` estão no chunk `traceability`, carregado somente quando a rota correspondente é visitada. React, React Router e Axios permanecem compartilhados na entrada; não foi adotado `manualChunks` frágil nem analisador adicional.

## Tasks

`TasksScreen` continua coordenando carregamento, formulário, mutações e atualização local, mas deixou a apresentação das métricas e da lista para `TaskMetrics` e `TaskList`. A screen foi reduzida de 965 para 705 linhas sem deslocar regras do backend para componentes.

Cadastro, edição, responsável canônico, busca de requisitos e artefatos, RF41, commits vinculados e remoção de vínculos foram preservados. A carga inicial por projeto ganhou uma guarda contra a segunda execução do efeito em `StrictMode`; buscas canceláveis e deduplicação já homologadas na E12 foram mantidas.

## Kanban

`KanbanScreen` foi reduzida de 1.029 para 566 linhas. A composição foi dividida em:

- `KanbanBoard`, responsável por colunas, cartões, teclado e drag-and-drop;
- `MovementHistory`, responsável por filtros e paginação;
- `TaskDetailsPanel`, responsável pelo dialog de detalhe e suas ações;
- `kanban-display`, com labels e formatações exclusivamente visuais.

A screen conserva movimento otimista, rollback em 409, confirmação de exclusão, atualização local dos vínculos e coordenação das APIs. A carga inicial também evita repetição sob `StrictMode`. Não houve mudança nas três colunas nem nas transições.

## Requests e renders duplicados

A inspeção da carga inicial comprovou repetição de `/auth/me`, CSRF, Tasks e Kanban causada pela execução dupla de efeitos em desenvolvimento. `AuthContext.refresh` agora coalesce operações concorrentes por promise em voo; as screens de Tasks e Kanban guardam o `projectId` já carregado. A troca real de projeto continua provocando nova carga.

Não foram encontrados motivos para cache global, React Query ou memoização ampla. Atualizações locais já seguras foram preservadas e `useMemo`/`useCallback` existentes não foram espalhados indiscriminadamente.

## AuthContext e rotas

Os testes novos cobrem restauração bem-sucedida e falha, loading, CSRF, login, registro, logout, evento `traceflow:unauthorized`, preservação da sessão diante de 403 e coalescência de refreshes. `ProtectedRoute` passou a ter caracterização explícita da rota original em `location.state.from`.

As rotas lazy são exercitadas quanto a fallback, resolução, falha encaminhada ao `ErrorBoundary`, navegação entre chunks públicos e proteção de rota privada. Os testes verificam comportamento observável, não detalhes internos do bundler.

## Acessibilidade

Foram preservados dialog, foco, labels, `aria-live`, estados exclusivos, links externos seguros, teclado e cancelamento de requests da E12. O fallback de rota possui mensagem compreensível e semântica de status. Cartões do Kanban mantêm ativação por Enter e Espaço.

## Testes e cobertura

Resultado frontend:

| Métrica | Baseline E12 | E13 |
|---|---:|---:|
| Testes | 69 | 83 |
| Arquivos de teste | 21 | 25 |
| Statements | 49,58% | 53,29% |
| Branches | 44,33% | 49,20% |
| Functions | 40,45% | 45,97% |
| Lines | 52,43% | 56,58% |

Os testes adicionados abrangem lazy routes, `ErrorBoundary`, navegação pública, `ProtectedRoute`, `AuthContext`, métricas/lista de Tasks, board por teclado, histórico paginado e painel de detalhes. A regressão backend manteve os 198 testes verdes; `prisma validate`, `architecture:check` e `security:secrets` também passaram.

## Dependências e audits

Nenhuma dependência foi adicionada. O audit backend permaneceu sem vulnerabilidades. O audit frontend manteve duas vulnerabilidades altas do React Router relacionadas ao modo RSC; o TRACEFLOW usa SPA com `BrowserRouter` e a correção automática indicada exige mudança incompatível. Nenhum `npm audit fix` foi executado.

## Arquivos removidos

Não foi necessário remover arquivo funcional. Imports estáticos de pages foram removidos de `AppRoutes`; código de apresentação duplicado foi retirado das screens depois de migrado para componentes com consumers reais.

## Riscos para E14

- O chunk de rastreabilidade é o maior chunk de rota (188,95 kB), embora esteja corretamente isolado e abaixo do limite.
- `TasksScreen` ainda coordena um fluxo amplo; qualquer nova subdivisão deve acompanhar casos de uso reais, não apenas contagem de linhas.
- As vulnerabilidades do React Router precisam de atualização controlada quando houver versão compatível com a SPA e regressão completa.

A E14 não foi iniciada.
