# S2 P9 — Personalized Indicators Dashboard

Data: 2026-10-04. Validação local, Node 22 e API real.

## 1. Baseline

- Branch: `daniel-dev`.
- HEAD: `ad7d01ce0ae689176b6a64dc06a7044c97f708d9`.
- Working tree inicial limpa; `git diff --check` e `git diff --stat` vazios.
- Node padrão do shell: 26.9.0. Gates: Node **22.23.3**, com
  `NODE_OPTIONS=--no-experimental-webstorage`.
- P8.6F estava encerrado no HEAD. Nenhuma rodada anterior foi reiniciada.
- Sem commit, push, merge, rebase, reset, clean ou stash.

## 2. Scope

Meu painel acrescentado à página de Indicadores, com seleção, remoção, ordem e
persistência por usuário/projeto. Sem nova rota de dashboard, fórmulas, resize,
drag-and-drop, metas, Health customizado, dependências novas ou P10.

## 3. Sources reviewed

Design System, UI Surface Inventory, Visual Validation Log, catálogo S2, Health
Model v1, API Contracts, relatório final P8.6F e roadmap incremental. Também foram
auditados arquitetura frontend, autorização/membership, sessão/CSRF, exclusão de
conta, soft delete/restore/purge de Project e export pessoal de privacidade.
Código do HEAD e primitives existentes orientaram a implementação.

## 4. Product decisions

Meu painel fica após Geral, em `?view=custom`. Health permanece no Summary fixo;
o detalhamento continua em Geral. Editor usa `SprintDialog`, lista compacta,
controles de ordem explícitos e confirmação canônica. Salvar é explícito; não há
autosave. Nenhuma preferência global de projeto é alterada.

## 5. Eligibility model

Matriz de 74 fichas em [Painel pessoal v1](../indicators/PERSONALIZED_DASHBOARD_V1.md).
**66 selecionáveis**. I03/I05 continuam fora do picker até homologação de presenter
standalone; I07/I08 são capacidades; I19/I69/I70 não implementados; I68 não
recomendado. `healthRole` não controla seleção: Commits, Throughput e Velocity
continuam elegíveis como contexto. Backend valida todos os IDs.

## 6. Default dashboard

Autoridade única backend: I01, I23, I49, I66, I21, I28. Seis widgets equilibram
progresso, WIP, testes, implementação, Cycle Time e atraso. GET sem preferência
retorna default sem inserir row. Restore consome a mesma função. Não há cópia da
composição Geral nem IDs default no componente frontend.

## 7. Persistence model

`ProjectDashboardPreference`: ID incremental, projectId, userId, versão, JSON de
widgets, createdAt/updatedAt. Unique(projectId,userId), índice userId e FK cascade.
Array é a única autoridade da ordem. Modelo não persiste filtros, posições livres,
fórmulas ou layout responsivo.

## 8. Migration

Nova migration `20261004090000_project_dashboard_preference`. Cria apenas tabela,
índices e duas FKs. Nenhuma migration aplicada foi editada; nenhum reset executado.
Prisma format realinhou colunas dos modelos que receberam relações inversas.

Segurança verificada antes das escritas: `NODE_ENV=development`, host
`localhost:3306`, schemas distintos `traceflow` e `traceflow_test`, servidor
`MacBook-Air-de-Daniel.local`, `read_only=0`. Project 2, TraceFlow, descrição
“Projeto artificial para homologação manual de L1, L2 e L1.1.”

Migration aplicada nos dois bancos locais. `migrate status`: 63 migrations, ambos
atualizados. `migrate diff --from-schema-datasource ... --to-schema-datamodel ...
--exit-code`: nenhuma diferença no desenvolvimento. Prisma validate/generate PASS.
Histórico de domínio/GitHub preservado; apenas preferências foram exercitadas pela UI.

## 9. Authorization

VIEWER/MEMBER/MANAGER/OWNER podem alterar a própria preferência. User deriva da
sessão; body com userId é inválido. 401 sem sessão, 404 opaco para acesso alheio,
projeto excluído ou membership inativa. PUT/DELETE usam CSRF existente.
Transação trava Project/membership e revalida conta/membership antes de escrever.

## 10. Preference API

GET/PUT/DELETE em `/api/projects/:projectId/indicator-preference`. PUT estrito:
configurationVersion=1, 1–12 IDs elegíveis, sem duplicatas. GET retorna persistida
ou default; DELETE é idempotente e retorna default. Resposta contém widgets,
configurationVersion, isDefault e updatedAt. Contrato completo em API_CONTRACTS.

## 11. Custom aggregate API

`view=CUSTOM&widgets=...` é validado no backend e usa uma seção na ordem solicitada.
Source services são agrupados; não há HTTP interno ou chamada por widget.
Health completo é independente da seleção. Mesmo `includeProjectHealth=false`
não reduz Health em CUSTOM. Janela máxima: 366 dias; filtros incompatíveis
continuam declarados sem aplicação falsa. Views canônicas mantêm suas composições.

## 12. Frontend architecture

`DashboardPanel` continua dono de filtros, catálogo e agregado. Novo hook de
preferência é ativado em CUSTOM e conserva a leitura durante troca de categorias.
`CustomDashboard` reutiliza `IndicatorCard`; `DashboardEditor` mantém draft local.
Identidade do request incorpora seleção, projeto, view, período, Sprint e refresh.
Backend permanece dono de fórmulas, assessment, referência e default.

## 13. Meu painel

Primeiro acesso apresenta o padrão sem abrir editor. Summary e filtro canônicos
mantidos. Health não é removível. Uma única ação Personalizar aparece na view
pessoal. Com 12 widgets, tabs e ações usam linhas separadas contidas na página.

## 14. Editor

Reutiliza diálogo, overlay, focus trap, campos, SelectControl, botões e confirmação
do produto. Busca recebe foco inicial. Lista selecionada indica posição e ações
contextuais. Desktop e apresentação de altura disponível no mobile inspecionados.
Não há previews pesados ou 66 cards de gráficos dentro do picker.

## 15. Search/categories

Busca local por título/descrição/categoria, sem requisição, insensível a acentos.
Filtro inclui Geral, Planejamento, GitHub, Fluxo, Sprint, Tarefas, Qualidade e
Rastreabilidade. Categorias compartilhadas são derivadas das views canônicas;
Tasks de prontidão aparecem também em Planejamento, PR Quality em Qualidade.
Pesquisa sem resultado tem estado compacto. Exercitado por teste e navegador.

## 16. Add/remove

Selecionado não pode ser adicionado novamente. Máximo 12 desabilita novas adições
com instrução de remoção. Zero no draft bloqueia Save e orienta escolher ao menos
um. Remover conserva foco no próximo item disponível ou na busca. UI real validou
configurações com um, seis e 12 widgets.

## 17. Reorder

Botões Mover para cima/baixo de 44px e nomes contextuais, com anúncio de posição.
Ordem persistida sobrevive a reload e nova sessão de API. Sem reordenação visual
por CSS dense. Bug de foco ao atingir extremidade corrigido: foco passa para o
controle oposto habilitado do mesmo item. Teste específico e teclado real passaram.

## 18. Save/cancel

Save envia um PUT e atualiza um agregado. Duplo submit é bloqueado por ref e estado.
Falha conserva draft. PUT confirmado seguido de falha no agregado é apresentado
como painel salvo com falha de carregamento, não erro falso de Save. Cancelar/Escape
descartam alterações e retornam foco para Personalizar painel. Verificado na UI,
com falhas/races controladas nos testes.

## 19. Restore default

Confirmação altera apenas draft. Cancelar ainda conserva configuração persistida;
Save executa DELETE e usa o default backend. Restore foi exercitado com API real,
seguido de reload. Ao encerrar a homologação, o usuário voltou ao default de seis
widgets; não foi deixada seleção de teste com 12 widgets.

## 20. Filters

Mesmo contexto De/Até/fuso/Sprint na URL, sem filtro por widget ou Responsável.
01–30/09/2026, America/Sao_Paulo e Sprint A (16) permaneceram entre as nove views.
API prova WIP atual, Cycle temporal e Burndown da Sprint sem recorte falso.
Filtros, drafts inválidos e requests obsoletos da baseline passaram na regressão.

## 21. Data states

Presenters mantêm AVAILABLE, NO_DATA, PARTIAL e UNAVAILABLE. Sem período, métricas
de evento continuam indisponíveis. Real: PRs antigas sem abertas mostrou ausência
compacta; Cycle e CFD exibiram parcialidade; limitações repetidas foram agrupadas.
One-point/fallbacks não foram reimplementados; testes canônicos continuam verdes.

## 22. Health/assessments

Mesmo período/Sprint resultou em **70/100, Atenção, cobertura 81%**, em Geral e Meu
painel. Planejamento 95, Qualidade 42 e Rastreabilidade 85; Fluxo sem avaliação
elegível nessa janela. Teste compara Health de GENERAL/CUSTOM, inclusive seleção
de um widget. I66 mantém 25% versus referência 70%, delta −45 p.p., marker visual
e texto acessível. Nenhum peso ou cálculo foi adicionado ao frontend.

## 23. Accessibility

Tabs, diálogo, busca, categoria, selected list, ações e mensagens possuem nomes e
papéis. Reorder completo por teclado; limites de ordem desabilitados; focus trap,
Escape/retorno e anúncio testados. No navegador: foco inicial, reorder nas bordas,
cancelamento, Save/reset e disclosure de tabela por Enter. Burndown mobile mostrou
8 linhas com valores iguais aos pontos e linhas ideal/restante distinguíveis.
Não equivale a certificação WCAG ou teste com leitor de tela dedicado.

## 24. Responsive

Matriz final pós-correção com 12 widgets:

| Viewport | Documento | Tabs client/scroll | Resultado |
| --- | --- | --- | --- |
| 1440 | 1440 | 1104/1104 | PASS |
| 1280 | 1280 | 944/944 | PASS |
| 1024 | 1024 | 688/797 | PASS; scroll interno |
| 768 | 768 | 432/797 | PASS; scroll interno |
| 430 | 430 | 398/797 | PASS; stack |
| 390 | 390 | 358/797 | PASS; stack |
| 360 | 360 | 328/797 | PASS; stack |

Light/Dark obrigatórios 1440/390, tablet 768 e seleção System inspecionados.
Editor desktop/mobile, pesquisa vazia, máximo, charts e listas capturados. Viewport
temporário removido ao final e tema Escuro restaurado. Sem overflow do documento.

## 25. Async/races

GET preference abortado não sobrescreve outro projeto. Agregado mantém identity,
generation e abort da baseline. Editor desmontado não aplica callback de PUT ao
projeto seguinte; uma escrita já enviada continua pertencendo ao projeto original.
Troca de view/projeto descarta draft. Testes cobrem GET/PUT obsoletos, clique duplo,
falha de preferência sem falso default e retry. Sem novo listener de foco.

## 26. Performance

HTTP real instrumentado temporariamente no backend, sem cookies/tokens/body nos
logs. Instrumentação removida e `server.js` sem diff ao final. Amostra local:

| Operação | Duração HTTP | Payload | Operações Prisma |
| --- | --- | --- | --- |
| GET catálogo | 14,16 ms | 51.594 B | 3 |
| GET preferência de 12 widgets | 17,93 ms | 167 B | 4 |
| GET CUSTOM, 12 widgets | 46,21 ms | 36.169 B | 58 |
| PUT seleção de 1 widget | 25,17 ms | 101 B | 7 |
| GET CUSTOM, 1 widget | 17,77 ms | 19.065 B | 37 |
| DELETE/reset | 4,79 ms | 108 B | 7 |
| GET CUSTOM, 6 widgets | 15,61 ms | 26.300 B | 49 |

Contagem é de operações Prisma (inclui autenticação), não SQL físico. Trabalho é
agrupado por fonte e inclui Health completo; não representa uma query por widget.
Teste de integração comprova uma chamada ao source Flow para seleção de três
indicadores dessa fonte. Janela de aproximadamente 203s com interações de charts,
editor, busca/cancelamento e tema não gerou novas requests analíticas. Recarregamento
por HMR durante edição foi identificado e excluído dessa conclusão.

Save observado: um PUT + um GET agregado; reset: um DELETE + um GET. Não refaz
catálogo/preferência nesses fluxos. Chart, busca e reorder não persistem cada ação.
Foco/visibilidade sem refetch coberto por regressão automatizada; não se alega novo
Alt+Tab nativo nesta rodada. Render interativo sem congelamento perceptível; retorno
à view com 12 widgets e chart Cycle pronto observado em **131ms**, incluindo
automação, rede e confirmação DOM. Não é medida isolada de paint nem benchmark de
produção. Console final: zero warn/error capturados.

## 27. Database lifecycle

Testes com banco dedicado comprovam isolamento User A/B, Project A/B, VIEWER CRUD,
sessão nova, unique/upsert, CSRF, projeto alheio/inativo, soft delete/restore e purge
sem órfão. Teste de anonimização cria preferência e verifica remoção. Export de
privacidade inclui somente o ator e projetos ativos acessíveis. Projeto real de
homologação não foi apagado nem teve fatos analíticos reescritos.

## 28. Tests

- Backend novo: 25 casos de API P9 + 2 de catálogo/default; regressão de
  anonimização ampliada sem novos skips.
- Frontend novo: 11 testes de Meu painel/editor; testes antigos ajustados para nona
  tab e metadata nova, preservando assertions de filtros e composição.
- Falhas iniciais de fixtures CSRF, expectativas de oito tabs e regex de linguagem
  foram corrigidas, sem aumentar timeout ou relaxar gates. Execução sem acesso TCP
  foi repetida com autorização no banco de teste local.

## 29. Full gates

Todos executados com Node 22. Frontend full repetido após a última correção CSS.

| Gate | Resultado |
| --- | --- |
| Backend unit | PASS — 890 testes |
| Backend integration/API | PASS — 632 testes; 5 skips legados |
| Backend coverage | PASS — 1.522 testes; 134 arquivos, 2 arquivos legados skipped |
| Backend coverage S/B/F/L | 92,25% / 85,54% / 95,53% / 94,64% |
| Backend lint / format | PASS |
| Frontend test / coverage | PASS — 1.333 testes, 109 arquivos |
| Frontend coverage S/B/F/L | 85,22% / 79,84% / 81% / 87,63% |
| Frontend lint / format / build | PASS |
| Prisma validate / generate | PASS |
| Migration dev/test/status + diff dev | PASS — 63 migrations; sem drift |
| Architecture / secrets | PASS |
| Validação de política de CI local | PASS — validateRepositoryCi=true |
| Testes de CI/audit + formato dos arquivos de política | PASS — 83 testes |
| Audit canônico backend/frontend | PASS — 0 HIGH/CRITICAL, 0 exceções utilizadas |
| git diff --check | PASS |

Sem dependência adicionada, sem nodemon, sem waiver ou exclusão de dev dependencies.
Gates locais não representam execução de CI hospedada. Audit aprovado no critério
canônico não significa ausência de todos os achados moderate.

## 30. Visual validation

Chrome real autenticado em localhost:5173, API e Project 2 existentes. Ciclo
implementar → renderizar → inspecionar → corrigir → reinspecionar executado.

| Achado durante inspeção | Causa / correção | Revalidação |
| --- | --- | --- |
| Chart isolado ocupava meia linha | Grid por card ignorava contexto; grupos adjacentes por tamanho | Padrão, 1/12 widgets e séries |
| KPIs com valores desalinhados | Anatomia fora do subgrid canônico | Grupo compacto e referência em desktop |
| Foco perdido no limite de reorder | Controle focado passava a disabled | Foco no controle habilitado + teste |
| Nona tab cortada no desktop | Ações disputavam a mesma linha | Tabs em linha própria de Meu painel |
| Overflow mobile depois de Save | Flex wrap/basis expandia largura intrínseca | Grid contido; matriz final das sete larguras |

Séries reais: Cycle 8 dias com amostra, Burndown/Burnup 8 buckets, Velocity 4 Sprints,
Throughput/CFD 30 pontos. CFD conserva 22rem/352px. Tabela de Tasks com nomes longos,
PR NO_DATA compacto, PARTIAL e referência I66 inspecionados. Navegação pelas oito
views canônicas preservou filtros e valores, com nova renderização real.

Evidências transitórias em `/private/tmp/traceflow-p9-20261004/`:
`final-custom12-*-dark.jpg`, `final-custom12-1440-light.jpg`,
`final-custom12-390-light.jpg`, `final-editor-390-light.jpg`, `editor-*.jpg`,
`one-widget-390-light.jpg`, `final-table-390-dark.jpg`,
`proof-default-desktop.jpg`, `final-responsive-matrix.json`, `final-views.json`,
`final-console.json`, `http-metrics.jsonl` e logs/JSON dos gates.
Capturas intermediárias que expõem bugs não são usadas como aprovação final.

## 31. Remaining limitations

- P9 permite ordem/seleção; categorias, tamanhos e default são decisões do produto.
- Apenas presenters standalone aprovados são selecionáveis; sem I03/I05 nesta versão.
- Dataset real mantém limitações históricas e períodos sem baseline suficiente.
- Testes de nova sessão/multiusuário/lifecycle usam API e banco de teste; não foram
  criadas contas nem removidos projetos pelo navegador do usuário.
- Sem teste touch físico, leitor de tela dedicado, benchmark de produção ou CI remota.
- Sem edição colaborativa entre abas: último Save válido do próprio usuário vence.

Nenhum blocker P9 conhecido nos critérios locais executados.

## 32. Final verdict

**S2 P9 PERSONALIZED INDICATORS DASHBOARD — PASS LOCAL**

Seleção e ordem persistentes, isolamento, backend authority, filtros, Health,
acessibilidade, responsividade, migration e gates comprovados conforme evidências.
P10 não iniciado. Sem commit/push.

Sugestão de commit: `feat: add personalized indicators dashboard`.
