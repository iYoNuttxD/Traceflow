# S2 P8.6D — Final Indicators Polish

## 1. Baseline

Rodada iniciada em 2026-10-03 e encerrada em 2026-10-04, America/Sao_Paulo, no checkout `/Users/daniel/Coding/Traceflow`.

| Item                                   | Valor observado antes de editar              |
| -------------------------------------- | -------------------------------------------- |
| Branch                                 | `daniel-dev`                                 |
| HEAD                                   | `f6d9e2946993f9fc852d87e897719bebe7aa8976`   |
| Working tree                           | Limpa; `git status --short` vazio            |
| `git diff --check` / `git diff --stat` | Sem saída                                    |
| Node do shell                          | 26.9.0                                       |
| Node de todos os gates                 | **22.23.3**, `/opt/homebrew/opt/node@22/bin` |

Sem commit, push, merge, rebase, reset, clean ou stash. A aplicação local já estava
em execução: frontend 5173, API 3001. Instrumentação temporária de leitura HTTP
foi removida antes dos gates finais e da matriz visual final.

## 2. Scope

Correções limitadas a anatomia dos widgets, Flow, distribuição de commits, composição
de escopo/esforço, filtros e estados vazios. Limites de tabelas existentes foram
revalidados. Nenhuma mudança no backend, schema, migration, fórmula, Health Model,
biblioteca, fatos de desenvolvimento ou integração externa. P9 não iniciado.

Fontes revisadas: `DESIGN_SYSTEM.md`, `UI_SURFACE_INVENTORY.md`,
`VISUAL_VALIDATION_LOG.md`, `S2_INDICATOR_CATALOG.md`, `PROJECT_HEALTH_MODEL_V1.md`,
`API_CONTRACTS.md` e relatórios P8.6A/B/C, incluindo o hardening P8.6C de 03/10.
Código do HEAD usado para identificar primitives e comportamento existentes.

## 3. Visual issues reviewed

| Achado                                       | Causa                                         | Correção / comprovação                                  |
| -------------------------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| Health e parcial em posições distintas       | Estado fora do header compartilhado           | Ambos pertencem a `IndicatorHeader`                     |
| Lead/Cycle: diferença de 45px entre gráficos | Blocos superiores independentes               | Linhas semânticas compartilhadas com CSS subgrid        |
| Seleção de dia vazio                         | Navegação usava todo bucket do calendário     | Índices interativos somente de observações finitas      |
| Pessoa parecia outra categoria de associação | Distribuição escalar e pessoas no mesmo fluxo | Grupos Associação / Por responsável com barras próprias |
| Escopo removido separado do restante         | Classificação automática como KPI compacto    | I41/I42/I43 juntos; I44 em Esforço da Sprint            |
| Clear acima dos campos                       | Wrapper de ações antes do formulário          | Ação no fim do painel expandido                         |
| Troca de Sprint apagava draft inválido       | Effect dependia também de sprintId            | Draft de datas sincronizado somente por período/projeto |
| Estado parcial sem observação sem traço      | Fallback excluía LIST/SERIES                  | Headline explicita `—`; sem zero inventado              |
| Espaço de aviso vazio                        | Parágrafo parcial renderizado sem conteúdo    | Render condicionado a informação efetiva                |

## 4. Widget anatomy

`IndicatorHeader` → `.indicator-card__headline` → `.indicator-card__visualization`
→ limitação específica, quando necessária. KPI concentra valor/referência; CHART
acrescenta série/legenda/dados; TABLE apresenta contagem antes dos registros.
Valores ausentes têm traço e contexto. Não há placeholder invisível nem `<br>`
para alinhamento. Estados sem gráfico continuam compactos.

## 5. Health/Data State positioning

Título e ajuda permanecem na mesma linha. A linha seguinte reúne Health e Data State
quando presentes, com geometria compartilhada e tokens existentes. PARTIAL, STALE,
UNAVAILABLE e estado desconhecido usam esse owner. NO_DATA usa contexto curto, sem
um badge redundante que contradiga o caso saudável de I73. O modelo backend decide
Health; o frontend não cria assessments.

## 6. GitHub commits

API real: 133 commits no período; 93 na main, dos quais 67 associados, 26 não
associados e zero com histórico sem responsável. Grupo Associação separado do grupo
Por responsável, que contém a pessoa e seus 67 commits. Cada grupo normaliza suas
barras internamente; números textuais permanecem visíveis. Três responsáveis,
proporções e ausência de responsável foram testados com fixture; o banco atual tem
somente uma pessoa elegível nessa distribuição. Não foram criados commits artificiais.
KPI 133 continua em linha compacta própria, sem esticar até a distribuição.

## 7. Lead Time data validation

Leitura nova, somente leitura, do Project **2 — TraceFlow**, descrição **Projeto
artificial para homologação manual de L1, L2 e L1.1.**. Ambiente verificado:
`NODE_ENV=development`, host `localhost`, schema/database `traceflow`, `read_only=0`.
Nenhuma escrita nesse banco. Gates de integração utilizam o banco isolado
`traceflow_test` pelas factories/rotinas canônicas.

Auditados **40 Tasks e 73 TaskMovements**. Janela 01–30/09/2026, America/Sao_Paulo,
`[2026-09-01T03:00:00Z, 2026-10-01T03:00:00Z)`. `asOf` da leitura:
`2026-10-04T02:20:49.720Z` (03/10, 23:20 local).

Cadeia verificada: Task/TaskMovement → repository Flow → `flowTaskService.read` /
`calculateFlowTaskHistory` → `dashboardService.read` → GET autenticado
`/api/projects/2/indicators/dashboard` → presenter → headline/tabela/gráfico.
Script independente reconstruiu eventos e medianas sem chamar o calculator para
obter o esperado; comparou todos os buckets com o serviço real.

**I20: mediana de 15 Tasks = 6 dias, AVAILABLE, zero excluídas na coorte.**
A tabela abaixo registra todas as Tasks elegíveis, horários em UTC, ano 2026.
Durações calculadas em dias de 86.400.000ms; números pequenos não são ausência.

| Task | Criação UTC        | Primeira entrada em andamento UTC | Primeira conclusão UTC |       Lead dias |      Cycle dias |
| ---- | ------------------ | --------------------------------- | ---------------------- | --------------: | --------------: |
| 3    | 09-03 11:05:51.027 | 09-04 16:11:43.837                | 09-16 20:51:55.959     |     13.40700153 |     12.19458475 |
| 9    | 09-06 22:16:41.110 | —                                 | 09-06 22:18:15.470     |   0.00109212963 |               — |
| 10   | 09-08 21:37:16.136 | 09-08 21:39:46.366                | 09-08 21:39:46.372     |  0.001738842593 | 6.944444444e-08 |
| 11   | 09-08 21:39:00.244 | 09-08 21:39:46.229                | 09-08 21:39:46.245     | 0.0005324189815 | 1.851851852e-07 |
| 12   | 09-08 21:39:46.299 | 09-08 21:39:46.326                | 09-08 21:39:46.335     | 4.166666667e-07 | 1.041666667e-07 |
| 17   | 09-08 21:39:46.528 | 09-08 21:39:46.547                | 09-08 21:39:46.555     |       3.125e-07 | 9.259259259e-08 |
| 22   | 09-08 15:00:00.000 | 09-17 15:00:00.000                | 09-18 15:00:00.000     |              10 |               1 |
| 23   | 09-09 15:00:00.000 | 09-18 15:00:00.000                | 09-19 15:00:00.000     |              10 |               1 |
| 24   | 09-10 15:00:00.000 | 09-19 15:00:00.000                | 09-20 15:00:00.000     |              10 |               1 |
| 25   | 09-14 15:00:00.000 | 09-17 15:00:00.000                | 09-23 15:00:00.000     |               9 |               6 |
| 26   | 09-15 15:00:00.000 | 09-18 15:00:00.000                | 09-24 15:00:00.000     |               9 |               6 |
| 27   | 09-16 15:00:00.000 | 09-19 15:00:00.000                | 09-25 15:00:00.000     |               9 |               6 |
| 28   | 09-18 15:00:00.000 | 09-20 15:00:00.000                | 09-24 15:00:00.000     |               6 |               4 |
| 33   | 09-23 15:00:00.000 | 09-23 19:48:00.000                | 09-24 03:00:00.000     |             0.5 |             0.3 |
| 34   | 09-24 15:00:00.000 | 09-24 19:48:00.000                | 09-25 03:00:00.000     |             0.5 |             0.3 |

O outlier Task 3 é factual: 13,407 dias de Lead. Não foi removido nem limitado.
Tasks já concluídas antes do início não entram novamente por reconclusão. Cadeias
sem primeira conclusão comprovada não recebem duração inventada. Essas policies
continuam cobertas pelos testes canônicos do calculator.

## 8. Cycle Time data validation

**I21: mediana de 14 Tasks = 1 dia, PARTIAL, uma excluída.** Task 9 possui conclusão
sem primeira entrada em andamento; não recebe Cycle igual a zero. Task 3 tem
12,1946 dias de Cycle e permanece na escala. Eventos muito próximos de Tasks
10/11/12/17 produzem durações positivas mínimas, arredondadas para `0 dias` na UI.
Isso difere dos dias sem amostra, cujo valor persistido na série é `null`.

KPI = mediana de todas as Tasks elegíveis no período. Série = mediana das primeiras
conclusões agrupadas pelo dia local; não é a mediana das medianas diárias.
I20 tem nove dias com amostra; I21 tem oito. Todos os **30 buckets de cada série**,
valores e `eligibleCount`, coincidem entre cálculo independente, serviço, HTTP e
as **60 linhas** das tabelas acessíveis. Labels: “Mediana do período” e “Mediana diária”.
Referência de Lead 4,5 dias / +33,33% veio do backend; Cycle parcial não ganhou
referência fabricada. Throughput 16 e CFD, coorte 32/30 buckets, também coincidiram
com a reconstrução de fatos, como regressão adicional.

## 9. Lead/Cycle visual alignment

Antes: top dos SVGs 1099,98px versus 1054,98px, diferença 45px. Depois, em 1440
Light/Dark e 1280 Light: **1107,98px para ambos**. O par usa subgrid para header,
headline, visualização e nota. Não há margem compensatória por métrica.
Quando a área disponível cai abaixo de 56rem, os cards empilham e a altura volta
a ser orientada pelo conteúdo; não se preserva espaço de referência inexistente.

Setas/Home/End percorrem somente dias com valor finito. Pointer sobre gap não
seleciona um bucket vazio. Zero real é selecionável. End no Cycle real terminou
em **25/09, duas Tasks, 3,15 dias**, não em 30/09 sem amostra. Segmentos só ligam
buckets consecutivos; gaps não são interpolados. Um dia útil continua resumo compacto.

## 10. Sprint scope/effort

I36–I40 permanecem em Plano e entrega. I41/I42/I43 compõem Mudanças de escopo:
**1 Task adicionada / 0 removidas / 1 saída** na Sprint A. Detalhes abaixo da contagem;
carry-over sem barras redundantes. I44 fica em Esforço da Sprint: **24h estimado,
20h realizado, −4h desvio**. A referência duplicada fora da ajuda foi retirada nesse
widget. Seção complementar I71/I72 intitulada Continuidade da Sprint.
Burndown/Burnup mantêm oito pontos; Velocity, quatro Sprints. Sem perda de IDs.

## 11. Filter draft/applied model

Datas digitadas são draft. Querystring, requisição, resumo e active count representam
somente filtros aplicados. Uma data vazia ou início posterior ao fim gera erro local,
sem modificar URL nem disparar agregado. Sprint é aplicada independentemente;
preserva o período aplicado e o draft inválido. Troca de categoria preserva ambos.
Alteração legítima de período pela navegação/histórico ressincroniza o draft.

No navegador: após limpar, `0 ativos` / “Todos os dados disponíveis” e ação Limpar
ausente. Digitar 08/10 sem fim, depois fim 02/10, manteve URL sem período e contagem
de respostas em três. Trocar para Sprint B gerou somente sua consulta, preservando
o erro e as datas digitadas. Testes também cobrem essa troca com período anterior
aplicado, histórico, clear e resposta antiga chegando depois da atual.

## 12. Filter layout

`CollapsibleFilterPanel` mantido. Erro dentro do fieldset Período e associado aos
inputs por `aria-invalid`/`aria-describedby`, sem afetar o resumo do disclosure.
Limpar fica no fim do painel, após os campos, somente com draft ou filtro aplicado.
Período/Sprint continuam únicos. Responsável não foi reintroduzido.

## 13. Tables

Primitive existente preservada: máximo **20rem / 320px**, altura menor quando cabe,
caption N de M, cabeçalho sticky, região focável e nomeada. Desktop: aproximadamente
4–6 linhas, conforme extensão dos títulos e largura. Tasks abaixo: **10 de 11**,
headline **11**; acima: **8 de 8**. Não oculta o total nem estica linhas curtas.

Mobile mantém uma região de tabela rolável, em vez de novo padrão de lista. Em 390px,
scroll vertical chegou ao fim: `895px` de deslocamento, conteúdo 1215px/viewport 320px;
horizontal chegou a 18,5px. Foco visível e teclado funcionaram. Em 360px há rolagem
horizontal interna para preservar colunas e nomes; documento não transborda. Não
há captura de wheel/touch por handlers que impeça sair da região. Teste em hardware
touch físico não realizado; esta homologação usa viewport Chrome e teclado.

## 14. Empty states

AVAILABLE 0 preservado; NO_DATA mostra traço e contexto; UNAVAILABLE tem estado no
header e traço; PARTIAL sem valor tem traço inclusive em LIST/SERIES. I73 saudável
sem PR aberta mantém “Nenhuma PR aberta.”, sem badge “Sem dados” conflitante.
Mensagens históricas compartilhadas continuam no nível de seção; ausência já
explicada não cria parágrafos vazios ou avisos repetidos por widget.

## 15. Spacing

Gaps e tipografia herdados dos tokens existentes. Header/status/headline/visualização
com ordem uniforme. Associação/pessoas alinham pelo topo, evitando esticar uma pessoa
até a altura das três linhas de associação. Contagem precede tabela. Nenhuma nova
altura fixa de card; subgrid limitado ao par equivalente de Flow.

## 16. Responsive

Matriz final **80 capturas**: oito categorias × sete larguras Light e oito × três
larguras Dark, todas após a última correção e reload. Altura de viewport 1000px.

| Largura | Light   | Dark    | Resultado DOM/layout             |
| ------- | ------- | ------- | -------------------------------- |
| 1440    | 8 views | 8 views | Sem overflow; Flow alinhado      |
| 1280    | 8 views | —       | Sem overflow; Flow alinhado      |
| 1024    | 8 views | —       | Sem overflow; Flow empilhado     |
| 768     | 8 views | 8 views | Sem overflow; conteúdo em coluna |
| 430     | 8 views | —       | Sem overflow do documento        |
| 390     | 8 views | 8 views | Sem overflow do documento        |
| 360     | 8 views | —       | Sem overflow do documento        |

CFD conservou SVG de 352px; Throughput permaneceu legível. Tabelas podem rolar
internamente. Inspeção visual direta amostral de todas as oito categorias em desktop
e mobile, com amostras adicionais por breakpoint/tema; não é leitura manual de cada
pixel das 80 capturas. Nenhuma inspeção anterior foi tratada como evidência desta rodada.

## 17. Accessibility

Ajuda mantém desenho 16px/target 44px e nome acessível. Enter abre, Escape fecha e
retorna foco ao trigger. Dialog real em 390px: x16, largura358, altura327, dentro do
viewport; linguagem comercial. Erros associados às datas, status textuais, referências
textuais e marker/linha, regiões de tabela focáveis, cabeçalhos e caption preservados.
Gráficos têm descrição, série/legenda, tabela acessível e navegação sem mouse; descrição
de duração agora informa quantidade de dias com amostra, não quantidade de gaps.
Sem leitor de tela físico ou certificação WCAG nesta rodada.

## 18. Async/network

Contador temporário observou somente respostas do agregado, sem headers, tokens,
cookies ou credenciais. Uma consulta por troca de categoria; nenhuma por widget.
Nove respostas na sequência Flow → oito categorias/retorno; ociosidade posterior
manteve as mesmas nove. Instrumentação completamente retirada.

Regressões de `IndicatorsScreen` confirmam que focus/visibility não invalidam dados,
retry continua limitado e sync confirmada atualiza dados e Health juntos. Testes de
DashboardPanel preservam autoridade de resposta por view/período/Sprint/projeto.
Não foi repetido sync externo nem alegada nova captura nativa de Alt+Tab.

Amostra HTTP local aquecida: **11–17ms**, payload **25.031–33.872 bytes**. Primeiras
leituras Sprint/Flow: 46,5/19,8ms. Intervalo requisição → dois animation frames após
resposta: 32–50ms na sequência, apenas aproximação de assentamento DOM, não profiler
de paint. Serviço direto: 6–15ms, 33–47 operações lógicas Prisma. Não é contagem de
SQL físico nem benchmark de produção. Nenhum congelamento percebido. Console final
sem warn/error capturados; sem loops ou exceções de chart.

## 19. Tests

**15 novos casos**, total frontend 1.312. Focados em ownership de estado, anatomia por
família, par de duração, nulos no início/meio/fim, zero real, pointer, troca de série,
associação/pessoas/proporções, ausência de pessoas, hierarquia carry-over, seções
Sprint, draft incompleto/invertido, URL/applied count/clear e preservação entre categorias.

Calculator e APIs Flow existentes reexecutados: primeira conclusão, primeira entrada,
reentrada, reconclusão, ausência de início, recorte, timezone, mediana diária e gaps.
Nenhuma fórmula alterada apenas para adequar a visualização.

## 20. Full gates

Todos com Node 22.23.3; `NODE_OPTIONS=--no-experimental-webstorage` nos testes.

| Gate                                                            | Resultado final                                                                         |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Frontend test                                                   | PASS — 106 arquivos / 1.312 testes                                                      |
| Frontend test:coverage                                          | PASS — statements 85,08%; branches 79,68%; functions 80,90%; lines 87,50%               |
| Frontend lint / format:check / build                            | PASS                                                                                    |
| Backend unit                                                    | PASS — 83 arquivos / 888 testes                                                         |
| Backend integration/API                                         | PASS — 49 arquivos / 607 testes; 2 arquivos / 5 testes legados skipped                  |
| Backend coverage                                                | PASS — 1.495 testes; statements 92,21%; branches 85,47%; functions 95,50%; lines 94,60% |
| Backend lint / format:check                                     | PASS                                                                                    |
| Prisma validate / generate                                      | PASS                                                                                    |
| Architecture check                                              | PASS                                                                                    |
| Security secrets                                                | PASS                                                                                    |
| CI local: validateRepositoryCi, testes e formatação de política | PASS                                                                                    |
| Dependency audit frontend                                       | PASS                                                                                    |
| Dependency audit backend                                        | **FAIL — HIGH, GHSA-vfj7-8cjw-p6xm**                                                    |
| git diff --check                                                | PASS                                                                                    |

As primeiras tentativas de backend foram impedidas por EPERM para porta local e
acesso ao banco; a execução autorizada fora do sandbox passou integralmente.
Audits também foram repetidos com acesso de rede autorizado após falha de transporte.
Lint identificou uma variável obsoleta; retirada e gates frontend completos reexecutados.
Não foram adicionados skips, relaxamentos de assert ou exceções de segurança.

## 21. Visual validation

Evidências novas em `/private/tmp/traceflow-p86d-20261003/` (transitórias):

- `baseline.json`, `data-audit.json`, `flow.json`, `dto-*.json`;
- `http-flow.json`, `http-all-views.json`, `http-idle.json`, `filter-http.json`;
- `flow-dom-tables.json`, `visual-matrix.json`;
- `before-flow.png`, `before-filter.png`, `filter-invalid.png`;
- `final-{light|dark}-{largura}-{categoria}.png` e snapshots `.txt`;
- `mobile-help.png`, logs dos gates e `*-gates.json`.

Capturas finais realizadas a partir do topo para evitar que elementos fixed apareçam
no meio da imagem full-page. Viewport real de ajuda foi inspecionado separadamente.
O fluxo aplicado foi inspeção → causa → correção → render real → nova inspeção →
correção dos estados vazios → gates e matriz final. Não houve aprovação só por testes.

## 22. Remaining limitations

**Atualização de segurança — 04/10/2026:** o blocker HIGH descrito abaixo foi encerrado pela [P8.6E — PASS LOCAL](S2_P8_6E_SECURITY_DEPENDENCY_CLOSURE_REPORT.md), com remoção do nodemon e uso do watcher nativo do Node 22. A árvore instalada e o audit completo confirmaram a eliminação da cadeia vulnerável, sem exceção. O veredito original e os limites da inspeção permanecem como registro histórico; esta atualização registra somente o fechamento de segurança.

| Severidade | Tipo                               | Situação                                                                                                                                    |
| ---------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **HIGH**   | **REGRESSION / gate de segurança** | Bloqueio herdado: dependência de desenvolvimento nodemon → chokidar → braces 3.0.3. O audit canônico recusa o advisory; impede PASS global. |

O [advisory oficial GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
consultado nesta rodada, afeta braces até 3.0.3 e não lista versão corrigida. A cadeia
é de desenvolvimento, mas o gate exigido inclui devDependencies. Sem downgrade,
waiver ou alteração de launcher fora do escopo cirúrgico. Nenhum novo bloqueio
DATA/DESIGN/UX/FILTER/CHART/TABLE/ACCESSIBILITY/ASYNC identificado nos cenários executados.
As limitações de evidência manual/touch/Alt+Tab descritas acima permanecem explícitas.

## 23. Final verdict

**S2 P8.6D FINAL INDICATORS POLISH — CHANGES REQUIRED**

Correções visuais/funcionais e dados Flow aprovados localmente nos cenários executados.
O audit de segurança do backend continua reprovado; portanto não se concede PASS LOCAL
nem INDICATORS STABLE BASELINE. Parada nesta rodada, sem P9 ou commit/push.

Sugestão de commit, não executada: `fix: polish indicators layout and flow analytics`.
