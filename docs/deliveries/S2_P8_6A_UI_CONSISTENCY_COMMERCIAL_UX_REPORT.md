# S2 P8.6A — UI Consistency & Commercial UX Recovery

> Legacy label: S2 P8.6A. Canonical phase: **IND-P8.6A**.
> Fase interna de indicadores vinculada a S2-04/S2-05; não é o cartão S2-08.
> [Mapeamento canônico](../../TRACEFLOW_ROADMAP_INCREMENTAL.md#fases-internas-de-indicadores-ind).

## Baseline e escopo

- Data: 2026-09-28; checkout `/Users/daniel/Coding/Traceflow`.
- Branch: `daniel-dev`; HEAD: `b8831360ddf7d6a69347a57d1e86577886a89640`.
- Working tree inicial limpa; `git diff --check` e `git diff --stat` sem alterações.
- Shell inicial Node `26.9.0`; todos os gates executados com Node `22.23.3` (`/opt/homebrew/opt/node@22/bin`).
- Escopo: apresentação e interação de Overview/Indicadores, regressões e documentação. Backend, schema, migrations, contratos, fórmulas e dependências não foram modificados. Sem commit/push ou operações de integração Git. P8.6B não iniciada.

## Auditoria e causas

Foram consultados Design System, UI Surface Inventory, Visual Validation Log, catálogo S2, Health Model V1, API Contracts, arquitetura frontend e relatórios P8.2/P8.3/P8.5. Casos de teste, Rastreabilidade, Defeitos, Tarefas, Requisitos e Sprints foram inspecionados no código e renderizados com a aplicação real.

| Sintoma | Causa encontrada | Correção |
|---|---|---|
| Health separado da Overview | Componente renderizado como irmão da superfície, com borda/radius próprios | Inserido após as três colunas, com divisor/padding do mesmo container |
| Resumo e categorias destoavam | Peso/espaçamento próprios e regra `font: inherit` sobrescrevendo abas canônicas | `SummaryPanel` compartilhado, valores/labels alinhados, overrides removidos |
| Metadados soltos | Faixa externa ao resumo | Slot `footer` na primitive real |
| Filtros exclusivos | Responsável não aplicável, submit explícito e estilos próprios | `CollapsibleFilterPanel`, controles canônicos, somente Período/Sprint e aplicação automática |
| Avisos repetidos | Compatibilidade em múltiplos níveis e limitações repetidas por card | Compatibilidade no filtro; códigos compartilhados na seção; avisos da view suprimem níveis inferiores |
| Ajuda extensa e visualmente pesada | Desenho ocupava o alvo e conteúdo expunha explicações internas | Desenho 18px/target 44px, fechamento compacto e conteúdo comercial |
| Comparação só textual | Barra sem marca de referência | `IndicatorProgress` com marker fornecido pelo backend e texto acessível |
| Espaço morto e CFD achatado | Stretch de widgets, altura mínima de header, snapshot com tabela redundante | Alinhamento pelo início, alturas por conteúdo, CFD ampliado, snapshot sem tabela |

A correção foi novamente renderizada após detectar padding excessivo no Health, divergência tipográfica nas abas e largura antiga de `progress` que deslocava o marker em relação à barra.

## Resultado funcional

- Overview contém coração neutro, nota/status/barra quando avaliável, principal área de atenção, cobertura discreta e CTA “Ver indicadores”. Estado insuficiente continua explícito, sem fabricar score.
- Resumo contém cinco sinais e rodapé discreto de disponibilidade/atualização/Sprint/GitHub. O componente também é usado por Casos de teste.
- Filtro recolhido por padrão, contexto único na URL, aplicação automática. Datas incompletas/invertidas não são enviadas; Sprint aplica imediatamente. Troca de categoria preserva período/Sprint; Limpar segue o padrão existente. Responsável foi retirado somente da experiência e da query emitida por ela.
- Limitações históricas usam texto secundário. Estados de erro e avaliações de atenção/crítico preservam sua semântica. Tooltips não exibem metricId, definitionVersion, reasonCode, RF, pesos ou campos internos.
- Referências percentuais do servidor em I62/I63/I65/I66 possuem marker e descrição textual. Outros indicadores não recebem referência arbitrária.
- Listas usam tabelas semânticas com rolagem local. Aging WIP não é esticado pela altura de um gráfico. Estados vazios usam conteúdo compacto.
- Burndown/Burnup com um ponto exibem valores e início do histórico, sem “Ver dados”. Velocity com uma Sprint permanece snapshot; com duas, gráfico. Sem série, não há área de plot reservada.
- Refresh usa uma consulta de Dashboard com `includeProjectHealth=true`; não existe atualização paralela exclusiva de Health. O fluxo de revalidação por navegação/foco/sincronização continua ativo.

## Homologação com aplicação e API reais

Chrome local via CDP explicitamente autorizado após falhas de conteúdo antigo/área preta no controle nativo. Frontend temporário em `5174`, API em `3002`, conta artificial e projeto isolado `77647` em `traceflow_test`. Antes de escrita foram verificados `NODE_ENV=test`, host localhost, schema, `read_only=0` e banco de teste distinto do desenvolvimento.

Projeto/Sprints/Tasks/requisito e operações de qualidade foram criados pela API autenticada. O relógio do harness avançou durante as operações para produzir histórico real; nenhum histórico existente foi reconstruído. Registros de origem GitHub são artificiais, inseridos somente no projeto de teste: esta rodada valida renderização/contrato local, não sincronização com o provedor externo. O limite de leitura foi elevado apenas no processo temporário de teste para a matriz, sem mudança no código/configuração versionada.

A matriz possui 126 capturas: Overview e oito categorias × sete larguras × Light/Dark. Verificação automática de overflow horizontal, conclusão do carregamento e alertas visíveis em cada combinação. Inspeção visual direta de todas as categorias em amostras distribuídas entre as sete larguras e os dois temas, além das seis páginas maduras. Capturas móveis foram também examinadas em recortes legíveis.

| Largura | Light: Overview + oito categorias | Dark: Overview + oito categorias |
|---|---|---|
| 1440 | Renderização sem overflow/erro | Renderização sem overflow/erro |
| 1280 | Renderização sem overflow/erro | Renderização sem overflow/erro |
| 1024 | Renderização sem overflow/erro | Renderização sem overflow/erro |
| 768 | Renderização sem overflow/erro | Renderização sem overflow/erro |
| 430 | Renderização sem overflow/erro | Renderização sem overflow/erro |
| 390 | Renderização sem overflow/erro | Renderização sem overflow/erro |
| 360 | Renderização sem overflow/erro | Renderização sem overflow/erro |

Observações concretas:

- Conferência adicional no projeto local existente 2, somente leitura, Chrome conectado: Health 73/100, Atenção, cobertura 69%, principal área Qualidade, barra e CTA no mesmo container da Overview. A aba auxiliar foi fechada e a aba original de Defeitos preservada.
- Health filtrado: 75/100, cobertura 64%; Overview sem período: insuficiente, cobertura 60%. Contextos diferentes permanecem distintos conforme contrato, sem score artificial para a captura.
- Burndown/Burnup da Sprint atual: cinco pontos; Velocity: duas Sprints. Sprint encerrada: um ponto em cada burn chart, cards de aproximadamente 194px e nenhuma tabela redundante.
- CFD: SVG 352px, aproximadamente 283px de plotting area; throughput com área própria e lista/estado de Aging por conteúdo.
- Referência visual em 88,89% e no limite 0% conferida com texto correspondente; tabela de PR com título longo não sobrepõe coluna de idade em mobile.
- Filtro expandido em 390px: Período e Sprint, alvos de 44px; seleção automática e preservação ao alternar Geral/GitHub.
- Ajuda em 390px: dentro do viewport, trigger/close de 44px, Escape fecha e devolve foco. Conteúdo comercial observado.
- Refresh observado com uma requisição incluindo Health; tabela de série com cinco linhas e interação de teclado verificadas.

Evidência local transitória: `/private/tmp/traceflow-p86-evidence/`. Arquivos: `visual-matrix.json`, `interactions.json`, `real-api.json`, `real-api-enriched.json`, capturas `{light|dark}-{largura}-{view}.png`, `reference-*.png`, `interaction-*.png` e logs dos gates. Capturas de ensaios que ainda mostravam carregamento não foram usadas como matriz final. A homologação é local em Chrome; não representa CI remoto, dispositivo físico, leitor de tela ou sincronização GitHub externa.

## Regressões e gates

Testes adicionados/ajustados em `DashboardPanel.test.jsx`, `IndicatorsScreen.test.jsx` e `ProjectDetailsPage.test.jsx`: Health integrado e CTA/coração; summary/filter canônicos; metadados internos ao resumo; ausência de Responsável; período/Sprint e persistência; deduplicação GitHub; tooltip comercial; marker acessível; snapshots I45/I46/I47 sem tabela; CFD com container específico. Regressões existentes de estados vazios, erros, stale, teclado, tabelas, concorrência e refresh permanecem na suíte completa.

| Gate | Resultado |
|---|---|
| Frontend `npm test` | PASS — 102 arquivos, 1.274 testes |
| Frontend `npm run test:coverage` | PASS — 1.274 testes; statements 84%, branches 78,19%, functions 79,65%, lines 86,4% |
| Frontend lint / format:check / build | PASS |
| Backend regressão pertinente | PASS — 30 testes: API P7, dashboard-view e project-health |
| Prisma validate / generate | PASS |
| Architecture check / secrets | PASS |
| CI local: `validateRepositoryCi()` + 8 testes da política + formatação dos arquivos de CI | PASS |
| Dependency/security audit backend/frontend | PASS — 0 high, 0 critical, nenhuma exceção aplicada |
| `git diff --check` | PASS |

A regressão backend foi limitada aos contratos envolvidos, pois não houve alteração de código backend. Não foi alegada execução da suíte backend completa.

## Encerramento

**S2 P8.6A UI CONSISTENCY & COMMERCIAL UX RECOVERY — PASS LOCAL**

Projeto artificial 77647 e conta p86 removidos do banco de teste. Verificação prévia: ambiente test, localhost, `traceflow_test`, leitura/escrita autorizada. Registros congelados preexistentes permaneceram inalterados (baseline vazio); após limpeza, zero projetos com o ID da fixture e zero snapshots congelados no schema de teste. Dados do projeto de desenvolvimento não foram modificados. Chrome isolado e servidores temporários foram encerrados; os serviços do usuário em 5173/3001 foram preservados.

A comparação computada confirmou fonte Inter, título 18px/700, eyebrow 12px/800, label 12px/600, valor 24px/700 e padding 20px/24px idênticos no summary de Casos de teste e Indicadores. Evidência adicional: `final-inspect.json` e `cleanup.log`.

Sugestão de commit, não executado: `refactor: align indicators workspace with TraceFlow design`.
