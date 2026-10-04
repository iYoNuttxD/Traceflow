# S2 P8.6C — Indicators visual & data hardening

Data local: 2026-10-03. Resultado: **CHANGES REQUIRED — HIGH / SECURITY**.

## 1. Baseline

- Checkout: `/Users/daniel/Coding/Traceflow`; branch `daniel-dev`.
- HEAD: `938be91ff575b07887ed68b93d7b04a75c6fe761`.
- Antes das alterações: working tree limpa, `git diff --check` e `git diff --stat`
  sem saída. Status, branch, HEAD e Node conferidos antes de editar.
- Node do shell: `v26.9.0`. Todos os gates desta rodada usaram **v22.23.3**, em
  `/opt/homebrew/opt/node@22/bin`, com `NODE_OPTIONS=--no-experimental-webstorage`.
- Sem commit/push, operações de reescrita Git, migration, schema, biblioteca nova,
  seed ou mudança de fórmulas. P9 não iniciado.

Fontes: Design System, UI Surface Inventory, Visual Validation Log, catálogo S2,
Health Model v1, contratos da API, arquitetura frontend e relatórios P8.5/P8.6A/
P8.6B/P8.6C. Esta entrega atende ao pedido posterior de **visual correction, data
validation & interaction hardening**. A remoção do CTA da Overview substitui a
decisão de rodadas anteriores; os relatórios antigos permanecem históricos.

## 2. Screens reviewed

API real em `localhost:3001`, frontend em `localhost:5173`, Chrome autenticado.
Projeto 2, **TraceFlow**, descrição: “Projeto artificial para homologação manual de
L1, L2 e L1.1.” O banco foi somente consultado: `NODE_ENV=development`, host
`localhost:3306`, schema `traceflow`, `@@read_only=0`. Credenciais não registradas.

Visão Geral e Geral/Planejamento/GitHub/Fluxo/Sprint/Tarefas/Qualidade/Rastreabilidade
renderizados. Comparação com Casos de teste, Rastreabilidade, Defeitos, Tarefas,
Requisitos e Sprints, também com API real. SummaryPanel e CollapsibleFilterPanel
continuam sendo as primitives compartilhadas. Na comparação de Casos de teste:
título do summary 18px/700, labels 12px/600, valores 24px/700.

## 3. Issues identified

| Causa observada | Correção | Evidência |
|---|---|---|
| Listener `focus` incrementava refresh e consultava sync | Removido listener e invalidação por foco | Testes blur/focus/visibility, rede ociosa e relato manual |
| Overview com CTA, cobertura, área de atenção e tipografia própria | Conteúdo mínimo e título canônico | Testes de Overview, captura final |
| Headers repetidos sem owner de alinhamento | `IndicatorHeader` | Testes de estados e render |
| Tabela determinava altura do Panorama; atividade GitHub desequilibrada | Lista em linha própria e atividade em fluxo vertical | Segunda inspeção após ajuste |
| Rankings longos e regiões de dados sem foco próprio | Limite 20rem, nomes, foco e header fixo | PageDown real em 390px |
| Estados sem valor deixavam células sem sinal claro | Dash + estado/contexto compacto | Testes e render GitHub/Sprint |
| I73 saudável com mensagem genérica de ausência | Copy factual “Nenhuma PR aberta.” | Payload real e regressão da exceção |
| Um dia útil em vários buckets ainda produzia gráfico grande | Contagem de dias com valor em I20/I21 | Testes de lacunas e resumo real de 24/09 |
| Limitações de esforço repetidas com códigos diferentes | Normalização de apresentação e aviso na seção | Teste de deduplicação |

## 4. Overview Health simplification

Health permanece **no mesmo container** de Projeto/GitHub/Equipe. Mostra somente
coração secundário, título, nota, status e barra. Removidos CTA, cobertura e principal
área de atenção. `ProjectSectionNav` mantém o acesso a Indicadores do projeto correto.
Nota real observada: 69/100, Atenção. Os quatro títulos usam 12px/700, uppercase e
letter spacing de 0,96px; estados de loading/erro e recuperação foram preservados.

## 5. Filter cleanup

Removido o parágrafo sobre recortes preservados. Período e Sprint continuam no
CollapsibleFilterPanel, com SelectControl, autoaplicação e limpeza canônica. Não há
controle Responsável. Recorte de 24–30/09 + Sprint A persistiu em Geral → Fluxo →
Sprint → Qualidade → GitHub; Sprint B mudou a entrega para 28h. Janela de 30 dias e
intervalo de um dia também renderizados. Compatibilidade permanece no contrato,
sem repetição de avisos no filtro, seção e widget.

## 6. Window-focus refresh bug

O owner era `ProjectIndicators` em IndicatorsScreen.jsx: `onFocus` incrementava
`refreshVersion` e reiniciava o probe de sincronização. Removida essa assinatura.
Não existe outro listener de foco/visibility no fluxo de Indicadores responsável
por refetch. Probe inicial, polling somente durante execução de sync, retries
limitados e invalidação por conclusão confirmada continuam presentes.

Instrumentação temporária registrou sete requests iniciais e **zero novos requests
durante 199,7 segundos sem interação**. Após a solicitação de troca de aplicativo,
o usuário informou que a atualização já não ocorria; a contagem permaneceu em sete.
O controle nativo não produziu eventos blur/focus observáveis no probe. Portanto,
não se afirma captura instrumental da sequência Alt-Tab: a comprovação combina
inspeção do owner, testes de eventos, contagem de rede e relato do usuário.

## 7. Indicator header alignment

`IndicatorHeader` centraliza título, assessment e DashboardHelp. Todos os indicadores
usam a mesma linha de título/ajuda; assessment aparece abaixo. Desenho de 16px com
target de 44px, fechamento pequeno e nome acessível preservado. Títulos longos quebram
sem sobrepor o botão em 360/390px.

## 8. Spacing system

Header, status, valor, referência e conteúdo usam tokens existentes de espaçamento.
Layout com alinhamento pelo início e altura orientada pelo conteúdo. Não foram
alterados tokens globais nem introduzidas medidas arbitrárias por indicador.
Instruções repetidas dos gráficos saíram da apresentação visual, permanecendo
disponíveis para tecnologia assistiva.

## 9. Empty states

Zero disponível continua numérico. NO_DATA/UNAVAILABLE mostram dash e contexto curto;
PARTIAL sem valor mostra dash/estado e a limitação aplicável. O valor conhecido não
é substituído por zero. Não se reserva área de gráfico para ausência de série ou
resumo de um ponto. I73 usa a exceção factual do Health descrita na seção 12.

## 10. Table height/scroll

Regiões de registros têm máximo de 20rem, header de coluna sticky, nome específico
e foco visível. Caption explicita exibidos/total: por exemplo **10 de 11 registros**
em Tasks concluídas abaixo da estimativa. Aging WIP usa elegibilidade do payload.
Listas curtas ficam menores; o limite não impõe altura mínima.

Teste real em 390px: região de Tasks acima da estimativa com clientHeight 320px e
scrollHeight 951px; PageDown deslocou scrollTop para 300px, foco com outline sólido
e cabeçalhos preservados. Rolagem horizontal fica na região, sem alargar a página.
Nomes longos continuam legíveis, com quebra de linha. Não foi usado dispositivo
físico de toque; avaliação mobile feita por viewport e teclado.

## 11. General view

Panorama coloca Tasks atrasadas em linha própria e Defeitos por estado em outra.
A distribuição deixou de herdar a altura da lista. Summary integra metadados,
mantém cinco sinais e não substitui o Health detalhado. No recorte setembro/Sprint A:
70/100, coverage 81%, Planejamento 95, Qualidade 42 e Rastreabilidade 85.

## 12. GitHub

Atividade técnica voltou ao fluxo vertical após a primeira renderização revelar
assimetria entre o total de commits e a distribuição. Limitação histórica de PRs
aparece uma vez na seção; Issues possuem sua própria limitação de lifecycle.
Ausências não criam cartões altos. I73 só apresenta “Nenhuma PR aberta.” quando o
assessment do backend é HEALTHY com `NO_OPEN_PRS`; NO_DATA genérico continua distinto.

Foram utilizados dados já sincronizados, com atualização de 28/09 às 21:34 local.
Não houve sync externo nem criação de artefatos GitHub nesta rodada. Refresh após
sync confirmada é coberto pelos testes do owner; a execução externa anterior não
é apresentada como evidência operacional nova.

## 13. Planning

40 Tasks, uma sem responsável, uma sem estimativa e quatro atrasadas. Esforço
conhecido: estimado 163h, realizado 117,03h; delta comparável −0,97h. Esse delta usa
somente a amostra comparável e não é a subtração indiscriminada dos dois totais.
Limitações equivalentes de estimativa/realizado foram agrupadas numa mensagem de
seção. O backend e o universo de elegibilidade permanecem inalterados.

## 14. Flow data audit

Auditoria de leitura executada **antes** dos ajustes de Flow. Reconstrução independente
das 40 Tasks e 73 TaskMovements: criação, primeira conclusão válida, primeiro andamento
e último movimento no corte. Janela 01–30/09/2026, `America/Sao_Paulo`; intervalos em
UTC equivalentes, sem arredondar os fatos antes da mediana. Resultado individual
completo em `data-audit.json`, incluindo Tasks não elegíveis.

| Task | Criação UTC | Primeiro andamento UTC | Primeira conclusão UTC | Lead dias | Cycle dias |
|---|---|---|---|---:|---:|
| 3 | 03/09 11:05:51 | 04/09 16:11:43 | 16/09 20:51:55 | 13,4070 | 12,1946 |
| 9 | 06/09 22:16:41 | Ausente | 06/09 22:18:15 | 0,0011 | — |
| 10 | 08/09 21:37:16 | 08/09 21:39:46 | 08/09 21:39:46 | 0,0017 | <0,0001 |
| 11 | 08/09 21:39:00 | 08/09 21:39:46 | 08/09 21:39:46 | 0,0005 | <0,0001 |
| 12 | 08/09 21:39:46 | 08/09 21:39:46 | 08/09 21:39:46 | <0,0001 | <0,0001 |
| 17 | 08/09 21:39:46 | 08/09 21:39:46 | 08/09 21:39:46 | <0,0001 | <0,0001 |
| 22 | 08/09 15:00 | 17/09 15:00 | 18/09 15:00 | 10 | 1 |
| 23 | 09/09 15:00 | 18/09 15:00 | 19/09 15:00 | 10 | 1 |
| 24 | 10/09 15:00 | 19/09 15:00 | 20/09 15:00 | 10 | 1 |
| 25 | 14/09 15:00 | 17/09 15:00 | 23/09 15:00 | 9 | 6 |
| 26 | 15/09 15:00 | 18/09 15:00 | 24/09 15:00 | 9 | 6 |
| 27 | 16/09 15:00 | 19/09 15:00 | 25/09 15:00 | 9 | 6 |
| 28 | 18/09 15:00 | 20/09 15:00 | 24/09 15:00 | 6 | 4 |
| 33 | 23/09 15:00 | 23/09 19:48 | 24/09 03:00 | 0,5 | 0,3 |
| 34 | 24/09 15:00 | 24/09 19:48 | 25/09 03:00 | 0,5 | 0,3 |

A tabela abrevia timestamps; as diferenças usam milissegundos no artefato. Os valores
próximos de zero são eventos reais persistidos de homologação, não lacunas convertidas.
Nenhum dado foi reescrito para melhorar o desenho do gráfico.

## 15. Lead Time validation

I20: 15 amostras, mediana do período **6 dias**. Cada bucket diário e sua contagem
foram comparados ao serviço; os 30 buckets e 30 linhas da UI correspondem à API real.
Referência anterior do backend: 4,5 dias, 13 amostras, delta +33,33%, Atenção.
O outlier real da Task 3 mantém a escala em 13,41 dias. A série mostra mediana diária,
não repete o KPI nem liga dias separados por lacunas.

## 16. Cycle Time validation

I21: 14 amostras calculáveis, mediana **1 dia**. Task 9 não tem primeiro andamento:
preservado PARTIAL e a limitação; não foi inventado início. Outlier da Task 3 de
12,1946 dias justifica a escala de 12,19. Foram comparados todos os 30 buckets e
contagens, inclusive null e valores arredondados a zero. A referência não é criada
no frontend quando o modelo não oferece uma comparação elegível.

Para I20/I21, um dia útil em janela esparsa agora produz snapshot compacto. Testes
cobrem zero legítimo, dois pontos separados, segmentos consecutivos e outlier. No
recorte real de 24/09, três Tasks produzem Lead 6/Cycle 4 dias, sem “Ver dados”.

## 17. Throughput validation

I22: **16 Tasks distintas** pela política canônica de último movimento elegível no
corte. A soma dos 30 buckets é 16 e corresponde ao KPI/tabela real. Esse universo
difere da primeira conclusão usada em Lead/Cycle; não se força igualdade entre as
contagens. Reabertura/reconclusão continuam respeitando a definição vigente.

## 18. Cumulative Flow

I25: coorte observável de **32 Tasks**, 30 dias. Auditoria refez o estado diário com
criação e cadeia consistente de movimentos e comparou a fazer/em andamento/concluído em cada
bucket. Limitação de estado anterior desconhecido e exclusões permanentes preservada.
SVG de 352px com área útil aproximada de 283px; legenda, seleção por teclado e dados
em tabela. Não houve alteração do cálculo do CFD.

## 19. Sprint

Sprint A: planejado 20h, atual 24h, entregue 20h; cinco Tasks planejadas/entregues,
uma entrada no escopo e um carry-over de saída. Burndown/Burnup com oito buckets,
linhas reais/ideal e escopo/concluído, sem pontos derivados inseridos no banco.
Velocity apresenta quatro barras (20, 28, 5 e 32h). Sprint B entrega 28h. Estado de
um ponto e ausência continuam compactos e possuem regressão automatizada.

## 20. Tasks

Estado atual: 40 Tasks, oito a fazer, quatro em andamento, 28 concluídas. Agrupamento
de esforço passou a incluir rankings acima/abaixo da estimativa, permitindo uma
limitação compartilhada. Atrasadas ficaram na seção Atenção. Help explica a base
do assessment: quatro de 40 Tasks estão atrasadas; “Saudável” refere-se à proporção
avaliada, sem negar a existência dos atrasos.

## 21. Quality

Execuções do período: 30, distribuídas em 11 PASS, 13 FAIL e seis BLOCKED; taxas
36,67%, 43,33% e 20%. Defeitos: oito, dois por estado e dois por severidade; seis
ativos. Reteste: **28,57%**, distribuição **2 aprovados, 2 falhos, 3 bloqueados**.
Teste dedicado garante contagens sem sufixo percentual. Estados/Health, densidade
e tabelas de concentração inspecionados com nomes longos.

## 22. Traceability

I61–I67 preservados, sem Funnel I68. Task coverage 91,67%, evidência 58,33%, TestCase
75%, defeitos ativos 25%, requisitos concluídos 16,67%, implementação 25% e progresso
médio 40,83%. Referências de progresso/estágio anterior vêm do assessment backend;
não se usa “meta”. Diferença entre valores atuais e referências continua visível.

## 23. Tooltips

Conteúdo: definição comercial, valor, referência quando elegível e interpretação.
Basis do Health usa apresentação humana, incluindo proporção de atrasos e amostras
de baseline. Sem metricId, reasonCode, versões, RFs, pesos ou nomes internos na ajuda.
Tooltip real de Lead em 390px coube entre 16 e 374px; Escape fechou e devolveu foco
ao trigger. Conteúdo atual inclui 6 dias versus 4,5 dias e 15/13 amostras.

## 24. References

`IndicatorProgress` preserva marker tracejado, rótulo e comparação textual acessível.
Exemplos reais: implementação 25% versus progresso 70%, evidência 58,33% versus 70%,
TestCase 75% versus implementação 25%. Referências de Flow continuam tracejadas,
rotuladas e na unidade do indicador. Não há recálculo ou baseline hardcoded no cliente.

## 25. Responsive

Matriz final após todas as alterações de código e remoção do probe temporário:

| Superfícies | Light | Dark | Capturas |
|---|---|---|---:|
| Overview + oito categorias | 1440, 1280, 1024, 768, 430, 390, 360 | 1440, 768, 390 | 90 |

Sem overflow horizontal do documento, alertas de erro ou snapshots de carregamento.
Scroll horizontal permanece limitado a navegação/tabelas. Sidebar recolhida,
expandida e drawer mobile também examinados; tema Dark e viewport natural restaurados.
Não se transfere a aprovação antiga: são arquivos novos `final-*` desta rodada.

## 26. Accessibility

Verificados headings, nomes dos controles/regiões, foco, teclado, Escape, retorno de
foco, filtros, tabelas e gráficos. Valores/estados possuem texto e não dependem só
de cor; referências têm descrição textual. Regiões de dados dos charts passaram a
ter tabIndex/nome próprio e headers fixos. Descrições de interação permanecem para
tecnologia assistiva, com “Ver dados” nas séries em que agrega valor.

Contraste textual amostral, calculado a partir das cores CSS resolvidas, incluindo
`color(srgb ...)` de color-mix: mínimo **5,67:1 Light / 7,13:1 Dark** em títulos,
status e referências de Rastreabilidade. Não é certificação WCAG nem auditoria com
leitor de tela físico. Zoom nativo não foi reexecutado: não integra a matriz do
pedido posterior de hardening; a limitação histórica continua registrada no relatório
anterior e não é considerada validada por mudança de viewport.

## 27. Network/async

Sem request por widget, polling ocioso ou refetch por foco. O carregamento inicial
observado fez sete requests, incluindo autenticação, catálogo, Sprints, aggregate
e status de sync. Contagem ociosa/foco descrita na seção 6. Testes preservam authority
em mudanças de projeto, filtros/categorias, aborts, resposta tardia e refresh manual.
Sync possui retries limitados e invalidação por conclusão confirmada; não foi feita
nova sincronização externa. Console final: **zero warn/error**.

Uma amostra HTTP real do aggregate Geral: **26,2ms**, JSON de **26.095 bytes**; intervalo
até oportunidade de pintura após dois requestAnimationFrame: **67,2ms** desde o
início da requisição. Essa instrumentação local não é medição de frame final do chart
nem benchmark de produção. O probe foi removido antes dos gates e capturas finais.

Medição independente de serviço, includeProjectHealth=true e janela de setembro:

| View | Tempo local ms | JSON bytes | Operações Prisma lógicas |
|---|---:|---:|---:|
| GENERAL | 13 | 26.372 | 33 |
| PLANNING | 8 | 27.615 | 37 |
| GITHUB | 7 | 33.855 | 43 |
| FLOW | 6 | 31.101 | 37 |
| SPRINT | 5 | 32.466 | 33 |
| TASK | 6 | 31.812 | 37 |
| QUALITY | 7 | 33.414 | 47 |
| TRACEABILITY | 6 | 25.014 | 33 |

Uma amostra por view, sem percentis. Contagem via middleware Prisma, não statements
SQL físicos. Leitura do repository de Flow usa coleções em lote; o aggregate agrupa
owners e reutiliza resultados. Não se encontrou consulta por Task no caminho
inspecionado. Não foi feito benchmark de escalabilidade com crescimento artificial.

## 28. Tests

Regressões adicionadas/ajustadas: Overview mínima e nav preservada; focus/visibility
sem requests; retry limitado e troca de projeto; filtro sem microcopy; header único;
zero/ausência/parcial; I73 factual versus unassessed; reteste count versus rate;
reference marker e base de atrasos; limitações compartilhadas; um dia útil com null,
zero, série esparsa, consecutividade e outlier; captions e tabela acessível.

O teste unitário `e11-mapping-writer` dependia de DATABASE_URL externa mesmo com Prisma
mockado. Passou a declarar URL local fictícia sem credenciais e limpar o stub, sem
usar o banco real. Não foram ampliados timeouts, criados skips ou relaxadas asserções.

## 29. Full gates

| Gate — Node 22 | Resultado novo |
|---|---|
| Frontend test | PASS — 106 arquivos, 1.297 testes |
| Frontend coverage | PASS — 1.297 testes; statements 85%, branches 79,49%, functions 80,85%, lines 87,41% |
| Frontend lint / format:check / build | PASS |
| Backend unit | PASS — 83 arquivos, 888 testes |
| Backend integration/API | PASS — 607 testes; cinco skips legados em dois arquivos |
| Backend coverage | PASS — 1.495 testes; statements 92,21%, branches 85,47%, functions 95,5%, lines 94,6% |
| Backend lint / format:check | PASS |
| Prisma validate / generate | PASS |
| Architecture check | PASS |
| Local CI policy, testes dos validadores e format dos arquivos de CI | PASS |
| Security secrets | PASS |
| Dependency audit frontend | PASS — zero high/critical |
| Dependency audit backend | **FAIL — advisory high sem correção publicada** |
| git diff --check | PASS |

Preparação do ambiente: `npm ci --ignore-scripts` restaurou node_modules do backend
(jszip declarado estava ausente), sem alteração de lockfile. Uma primeira execução
de coverage coincidiu com essa reinstalação e foi interrompida; seus resultados não
são os gates finais acima. Prisma Client foi regenerado e a API retomou pelo watcher.
O usuário do banco de testes não tinha CREATE TEMPORARY TABLES; após aprovação da
ferramenta, a permissão foi concedida somente em `traceflow_test.*`. A suíte final
usou o schema de teste isolado; nenhum privilégio/dado do schema de desenvolvimento
foi alterado para acomodar os testes.

## 30. Visual validation

Evidência transitória nova: `/private/tmp/traceflow-p86c-hardening-20261003/`.

- `final-visual-matrix.json`: 90 combinações finais, dimensões, alertas e charts.
- `final-{light|dark}-{width}-{view}.png/.txt`: render e snapshot da API real.
- `final-tooltip-390.png`, `final-table-scroll-390.png`, `final-flow-one-day.png`,
  `final-sidebar-collapsed.png`, `final-overview-delivery.png`: interações adicionais.
- `data-audit.json`, `flow.json`, `dto-*.json`: fatos, resultados e timings.
- `facts-api-ui-check.json`, `browser-flow-api-raw.json`, `browser-flow-ui-rows.json`:
  comparação dos 120 registros de tabela em I20/I21/I22/I25.
- `network-*.json`, `filter-checks.json`, `contrast-*.json`, `table-keyboard.json`,
  `final-console.json`, `*-gates.json` e logs: verificações complementares.

Inspeção direta das nove superfícies em amostras desktop e amostras adicionais
mobile/tablet, incluindo revisão de GitHub após novo ajuste. A matriz captura todas
as combinações; não implica inspeção manual de cada pixel das 90 imagens. Capturas
full-page podem deslocar elementos fixed; screenshots de viewport complementaram
a avaliação. Arquivos ficam em diretório temporário, não são publicados ou versionados.

## 31. Remaining limitations

**Atualização de segurança — 04/10/2026:** o blocker HIGH descrito abaixo foi encerrado pela [P8.6E — PASS LOCAL](S2_P8_6E_SECURITY_DEPENDENCY_CLOSURE_REPORT.md), com remoção do nodemon e uso do watcher nativo do Node 22. A árvore instalada e o audit completo confirmaram a eliminação da cadeia vulnerável, sem exceção. O veredito original e os limites da inspeção permanecem como registro histórico; esta atualização registra somente o fechamento de segurança.

**HIGH / SECURITY — bloqueia PASS:** o gate canônico reporta
`GHSA-vfj7-8cjw-p6xm` na cadeia de desenvolvimento nodemon → chokidar → braces 3.0.3.
O [advisory oficial](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) consultado nesta
rodada informa ausência de versão corrigida. O registry continua oferecendo braces
3.0.3; nodemon 3.1.14 ainda declara chokidar ^3.5.2. O audit sugere downgrade major
para nodemon 1.14.10, que não foi aplicado. Não foi criada exceção, reduzido o nível
do gate ou alterado o launcher para declarar aprovação. Trata-se de dependência de
desenvolvimento; este relatório não afirma exploração na API de produção.

Limites de evidência, sem defeito funcional novo identificado: eventos nativos de
foco não capturados pelo controlador; sem sync GitHub externa nova, leitor de tela,
dispositivo físico ou zoom nativo. Dados históricos ausentes continuam ausentes;
CFD não recupera exclusões permanentes. Medições de latência/render são amostras
locais. Nenhum desses limites foi omitido ou substituído por PASS anterior.

## 32. Final verdict

**S2 P8.6C INDICATORS VISUAL & DATA HARDENING — CHANGES REQUIRED**

Correções funcionais/visuais implementadas, dados de Flow conferidos e reinspeção real
concluída. O gate de dependências do backend permanece **HIGH / SECURITY**, impedindo
PASS global e a classificação **INDICATORS STABLE BASELINE**.

Sem commit/push. Sugestão: `fix: harden indicators visuals and flow analytics`.
Rodada encerrada; P9 não iniciado.
