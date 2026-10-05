# TRACEFLOW Visual Validation Log

## 2026-09-27 — S2 P8.3 Project Health (API real + fixtures sintéticas)

No Chrome local, `projects/2` autenticado consumiu a API real após o P8.3. A visão Geral exibiu
`73/100 · Atenção`, cobertura ponderada `69%`, `16 de 20` sinais, cinco dimensões avaliadas e
Fluxo sem base suficiente. Qualidade e Integração técnica apareceram como críticas; os três
drivers negativos e positivos foram apresentados com títulos do catálogo e bases numéricas.
I28 mostrou `Saudável` no próprio card sem esconder o valor bruto `3` nem o estado independente
do Burndown parcial. Desktop 1440 px Dark não teve overflow horizontal (`scrollWidth=1440`).

A fixture local `frontend/test/visual/p8.html?health=...&theme=...` usa respostas sintéticas,
sem banco ou rede. HEALTHY (86), ATTENTION (68), CRITICAL (43) e UNASSESSED (`—`, cobertura 42%)
foram renderizados em **1440 e 390 px, Light e Dark**: 16 combinações verificadas no DOM após
carga completa, todas com seis linhas dimensionais e `scrollWidth=innerWidth`. Capturas visuais
foram inspecionadas para HEALTHY 1440/390 Dark, CRITICAL 390 Light, UNASSESSED 390 Dark e ATTENTION
768 Dark; no tablet, `scrollWidth=768`. Em 390 px, dimensões e drivers empilham, nota/status/
cobertura permanecem no topo e não há tabela larga. O help do modelo foi aberto visualmente na
API real e mostrou propósito, limite de cobertura, versão e risco de interpretar a nota como
desempenho humano. Teste de componente confirma texto, pesos, janela e badge individual.

Esta é validação visual local de composição e responsive, não auditoria WCAG instrumental,
homologação cross-browser ou prova externa de frescor GitHub. A fixture não valida fórmulas;
backend unit/API as validam separadamente. Tema original Escuro e viewport temporário foram
restaurados ao concluir a inspeção.

## 2026-09-27 — S2 P8.2 Dashboard visual e UX (API local real)

Chrome autenticado em `localhost:5173/projects/2`, consumindo catálogo e agregado P7 reais do
Project persistido. Antes da edição, a inspeção em 1710 px Dark mostrou filtros permanentemente
abertos, IDs e badges `Disponível` em todos os cards, seis cards grandes no Panorama, WIP `2` com
a mesma altura da lista de três Tasks atrasadas, Burndown de um ponto com data repetida nos dois
extremos do eixo, rodapés/timestamps por card e grandes vazios. O frontend já expunha contagens do
I58 como percentuais por herdar a unidade do indicador.

Após o redesign, GENERAL foi inspecionada em Dark 1710/390 e Light 1440. GITHUB com período
01–27/09 mostrou `127` commits observados, `93` na main (`67` associados e `26` não associados),
limitação de histórico de PR no cabeçalho da seção e filtros recolhíveis com resumo na URL. FLOW
mostrou I22 (27 pontos) e I25 (26 pontos), crosshair/seleção, resumo do ponto e tabela. SPRINT
mostrou I45/I46 de um ponto como resumo e I47 de uma Sprint como snapshot. QUALITY em Light 390
mostrou I58 `33,33%` e distribuição `1/1/1` sem `%`; concentração usa singular/plural de defeito.
TRACEABILITY em Light 1440/390 mostrou sete dimensões e uma mensagem comum de recorte não aplicado.

| Largura | Dark | Light | Observação |
| ---: | --- | --- | --- |
| 1440 px | Sete visões com 7/15/6/14/10/14/7 widgets | Mesmas sete visões | Sem overflow horizontal; seções e toolbar alinhadas |
| 1280 px | Sete visões | Sete visões | Fluxo cumulativo e listas com larguras distintas; sem overflow horizontal |
| 768 px | Sete visões | Sete visões | Histórico da Sprint empilhado; tabelas/ajuda acessíveis; sem overflow horizontal |
| 390 px | Sete visões | Sete visões | Cards em coluna, toolbar rolável, filtros em disclosure; sem overflow horizontal |

Em cada largura, `document.documentElement.scrollWidth` igualou `window.innerWidth` após a resposta
da visão. Nenhuma das chaves `associated`, `unassociated`, `unassignedHistoricalCount`,
`unknownCount`, `people` ou `Defects` apareceu no texto visível comum. `AVAILABLE`, `PARTIAL`,
`NO_DATA` e `UNAVAILABLE` foram vistos na API real; `STALE` permaneceu coberto por teste de
componente, sem fonte GitHub desatualizada criada artificialmente no banco de desenvolvimento.
Ajuda, filtro, foco e tabela foram examinados via controles nativos; o refresh local continua
distinto de Sincronizar. Em 390 px Light, a ajuda de WIP abriu com cálculo em linguagem de uso,
e “Detalhes técnicos” revelou a fórmula somente após nova ação; o painel permaneceu dentro da
largura da tela. O tema Escuro original e o override temporário de viewport foram restaurados.
Uma amostra de contraste calculada sobre cores efetivas do Chrome mediu 5,76:1–18,06:1 em Light
e 7,26:1–17,61:1 em Dark para cabeçalhos, texto secundário, aviso de período e controle de filtro.
Não houve auditoria WCAG integral nem validação cross-browser.

## 2026-09-25 — S2 P8.1 Dashboard com API real e sync GitHub externa (PASS LOCAL)

Chrome autenticado em `localhost:5173/projects/2`, Project persistido de homologação local,
backend P7 e banco de desenvolvimento reais. Entrada por `/projects` → Project → Visão geral.
GENERAL, GITHUB, FLOW, SPRINT, TASK, QUALITY e TRACEABILITY foram abertas com respostas do
agregado real. GENERAL mostrou I01 `46,67%`, WIP `2`, Tasks atrasadas `2`, I61 `100%`, I66 `25%`,
quatro Defects e I45 parcial, comparados com o service no mesmo banco. Sprint concluída legada
mostrou I45 com lacunas e I46 indisponível sem gráfico; Sprint em andamento mostrou I45/I46
parciais. Período de um dia mudou I09 de `298` para `7`; responsável sem recorte seguro mostrou
aviso e marca por card, sem alterar WIP.

| Largura real | Tema | Visões com dados reais | Observação | Resultado |
| ---: | --- | --- | --- | --- |
| 1710 px | Dark | GENERAL, GITHUB, FLOW, SPRINT, TASK, QUALITY, TRACEABILITY | Cards, séries, listas, ajuda e filtros; sem overflow horizontal observado | PASS local |
| 1710 px | Light | GENERAL, SPRINT, QUALITY, TRACEABILITY | Dados persistidos e estados visíveis; sem overflow horizontal observado | PASS local |
| 1440/1280 px | Light/Dark | SPRINT | I46 disponível por eventos reais do banco de teste; 14 cards, sem overflow horizontal | PASS local |
| 768 px | Light/Dark | GENERAL, SPRINT, QUALITY, TRACEABILITY | Respostas reais com 7/14/14/7 cards; sem overflow horizontal | PASS local |
| 390 px | Light/Dark | GENERAL, SPRINT, QUALITY, TRACEABILITY | Cards com 358 px, sem overflow horizontal; gráfico/tabela I46 real em ambos os temas | PASS local |
| 390 px | Dark | QUALITY e TRACEABILITY no Project de desenvolvimento | 14 cards Quality com dados persistidos; sete valores não vazios de Traceability; ajuda/foco legíveis | PASS local |

Sync GitHub externa acionada pela UI: run `17` `SUCCEEDED`, um commit novo persistido, freshness
GitHub `17:55` → `18:54` e nova montagem do Dashboard `18:53` → `18:54`. Hash do histórico
congelado da Sprint `13` permaneceu igual antes/depois. No banco de teste, login/API reais criaram
Project, Sprint e Tasks; o domínio capturou seis eventos de Burnup. O frontend autenticado exibiu
I46 `AVAILABLE`, com 25/09 `7 h` de escopo e `5 h` concluídos, e lacunas `—` nos dias futuros,
iguais à resposta P7. A fixture foi removida e o banco de teste retornou a zero usuários/Projects/
eventos de Burnup.

Foram inspecionados screenshots de Light/Dark no desktop e no mobile, incluindo I46 com tabela.
Uma primeira tentativa de resize atuou na aba errada e foi descartada; a matriz acima foi medida
após ativar a aba correta. ArrowRight moveu seleção/foco visível de Qualidade para Rastreabilidade;
o help I61 permaneceu legível em 390 px. O tema Dark original e o override de viewport foram
restaurados. Não houve auditoria WCAG completa, medição de contraste instrumental, contagem de
rede pelo DevTools nem validação cross-browser. A evidência da fixture P8 abaixo continua separada
da API real. A surface foi promovida a `VISUALLY APPROVED` localmente; detalhes no
[relatório P8.1](../../deliveries/S2_P8_1_REAL_DASHBOARD_HOMOLOGATION_REPORT.md).

## 2026-09-25 — S2 P8 Dashboard na Visão Geral (fixture local)

Chrome em `127.0.0.1:5179/test/visual/p8.html`, renderizando o
`ProjectDetailsScreen` e a feature `DashboardPanel` reais. O adapter HTTP da fixture entrega
respostas sintéticas no formato P7 em memória; nenhum banco, conta, GitHub ou API backend real foi
consultado. Os dados e o shell mínimo da fixture não representam uma sessão autenticada completa.

| Visão/estado | Largura | Tema | Observação renderizada | Resultado |
| --- | ---: | --- | --- | --- |
| GENERAL: AVAILABLE, STALE | 1440, 390 | Light/Dark | Contexto, sete widgets, fonte por card, Burndown e filtro visíveis; contexto recolhível em 390 | Sem clipping ou dado falso observado |
| SPRINT: I45/I46 AVAILABLE | 390 | Light/Dark | Linhas separadas, linha ideal tracejada, legenda e tabela; cards empilhados | Legível; labels do SVG pequenos em 390, tabela textual disponível |
| SPRINT: I46 PARTIAL | 390 | Dark | Dois pontos históricos `null` não desenhados; aviso de cobertura no card | Sem zero histórico inventado |
| SPRINT: I46 UNAVAILABLE | 390 | Dark | Mensagem da limitação e nenhum gráfico Burnup | Estado distinto de zero |
| QUALITY: execuções, saúde atual e concentração | 390 Light; 768 Dark | Light/Dark | Seções separadas e aviso de Defect que aparece em mais de um Requirement | Legível |
| TRACEABILITY: I61–I67 e I64 NO_DATA | 390 | Light/Dark | Métricas independentes; NO_DATA sem barra de 0% | Legível |
| GITHUB, FLOW, TASK: AVAILABLE/PARTIAL | 1280 | Dark | Cards, série I22, área I25 e listas inspecionados | Sem clipping ou overflow observado |
| Help do card e contexto expandido | 390 | Dark | Help absoluto dentro dos 390px; toggle revela Projeto/GitHub/Equipe e metadata | Ações e detalhes preservados |

Matriz de largura após o ajuste de contexto: 1440/1280/768/390 px em Light e Dark;
`scrollWidth` do documento igual à largura da viewport nas oito células. Grid analítico de
3/3/2/1 colunas; em 768/390 o contexto começa recolhido e pode ser expandido. O modo Sistema foi
aberto na fixture com `ThemeProvider` e resolveu para Dark, acompanhando a preferência do sistema
observada no navegador. Navegação das tabs, ajuda e expansão do contexto foram operadas.

Evidência **local e parcial**: dados sintéticos, sem fluxo autenticado/API P7 real, GitHub externo,
cross-browser, medição WCAG completa ou todos os estados de erro por viewport. A surface modificada
permanece `TECHNICALLY VERIFIED` no inventário; esta rodada não a promove a `VISUALLY APPROVED`.

## 2026-09-23 — PR #21 targeted corrections (inspeção parcial)

Chrome real autenticado em `localhost:5173`, projeto local 2, sem mutation de negócio.
Tarefas, Requisitos e Sprints carregadas foram medidas em Light/Dark ×
1440/1280/768/390 px: nas 24 células, o título ficou acima da navegação e não houve
overflow horizontal da página. Capturas de cards, Task Create/Edit, Requisitos/Details,
Sprint Evolution/burndown e SprintDialog foram inspecionadas em recortes representativos
de desktop, tablet e mobile nos dois temas. O formulário Task mediu 928/928/736/390 px
de largura nas quatro larguras de viewport em ambos os temas, com scroll interno.

REQ-8 exibiu `Planejado` no card e no Details. O diálogo `Criar sprint` manteve a
mesma geometria e estilos em 1440 px Light antes/depois de visitar Requisitos por
navegação SPA; em 390 px não houve overflow da página. No Kanban, ArrowDown mudou o
foco entre opções de `Mover tarefa`, Escape devolveu foco ao trigger e Tab fechou o
menu avançando ao controle seguinte. O burndown congelado foi visto em desktop Light
e mobile Dark com scroll interno.

Esta é evidência **parcial**: não foram capturados todos os estados em todas as oito
células. O banco local tinha dois projetos ativos e nenhum pendente; recovery e
start-over não foram acionados porque isso exigiria exclusão real. A fixture visual
de 22/09 cobre esses estados sinteticamente, não a sessão autenticada desta rodada.
Nenhuma surface do diff PR #21 foi promovida a `VISUALLY APPROVED` com esta evidência.

## 2026-09-22 — Project deletion targeted corrections (local fixture)

Chrome local em `127.0.0.1:5179`, com API artificial em memória; nenhum projeto persistido ou
repositório real foi excluído. Zona de perigo, diálogo de exclusão recuperável, cartão de recuperação,
conflito de repositório reservado e confirmação de exclusão definitiva foram inspecionados em Light
e Dark a 1440, 1280, 1024, 768 e 390px. Em cada recorte, o conteúdo esteve presente e não houve
overflow horizontal da página. Os dois campos de confirmação mediram 45px no navegador, com
background, borda, raio, padding e focus ring da primitive `field` C2. O diálogo mobile manteve
ações legíveis e scroll interno. Escape fechou o diálogo e devolveu o foco ao botão acionador;
Tab permaneceu dentro do diálogo. Os targets principais mediram ao menos 44px.

Na fixture, purge confirmado seguido de falha 503 na criação mostrou sucesso parcial, retirou
Recuperar e a marcação de repositório programado para exclusão, e ofereceu retry somente da criação.
A execução foi visual/funcional local com dados sintéticos; não constitui homologação de produção,
teste cross-browser ou aprovação integral de acessibilidade. O inventário mantém as surfaces como
`TECHNICALLY VERIFIED`, não `VISUALLY APPROVED`.

## 2026-09-20 — Repository C2 navigation alignment

Chrome real autenticado em `localhost:5173`, projeto local 2. O header, a navegação do projeto e o
conteúdo foram reinspecionados em Light/Dark a 1440×1000, 1280×1000, 768×1000 e 390×844. Em todos
os recortes, `ProjectSectionNav` apareceu como irmã imediata abaixo do header, alinhada ao mesmo eixo
do Resumo, com 24px entre header/navegação e navegação/conteúdo. A aba Repositório permaneceu ativa.

Não houve overflow horizontal da página nem overflow vertical da navegação. O overflow horizontal
ficou restrito à própria navegação em 1280/768/390 e à tabela nessas mesmas larguras. Os 408
artefatos, Resumo, filtros recolhíveis e ações externas permaneceram renderizados sem regressão.

## 2026-09-20 — Repository C2 facelift

Chrome real autenticado em `localhost:5173`, projeto local 2. A página de Repositório foi
reinspecionada em Light/Dark a 1440×1000, 1280×1000, 768×1000 e 390×844, com dados
persistidos existentes: 4 branches, 388 commits, 20 pull requests, 0 issues, 100% de
completude e 408 artefatos. Header, navegação do projeto, resumo único, filtros recolhidos e
expandidos, tabela real, títulos em duas linhas, metadados e ação canônica Abrir no GitHub
permaneceram legíveis. Não houve overflow horizontal da página; quando necessário, somente a
navegação e o contêiner da tabela apresentaram rolagem horizontal interna.

No ajuste final, Tipo e Branch passaram a usar `SelectControl`, com 44px, chevron e tokens
canônicos nos oito recortes. A aplicação automática foi observada com Pull Request e `gt-dev`;
o contador representou somente a resposta confirmada, “Limpar filtros” apareceu apenas com filtro
ativo e restaurou os 408 artefatos. A ação externa permaneceu compacta, mas agora apresentou borda,
surface, raio e foco efetivos; a matriz continuou sem overflow horizontal da página.

Foram operados filtros de tipo, branch e período; a combinação Pull Request + `main` +
01/06/2026–20/09/2026 preservou 20 resultados. Issue + branch exibiu o aviso contratual e
produziu o vazio filtrado distinto, seguido de limpeza para os 408 itens. A rota de projeto
inexistente permitiu observar loading, erro contextual e `Tentar novamente`; o retry reemitiu
a consulta. O vazio de repositório, validação de datas, cooldown, aborto e latest-wins foram
verificados por automação direcionada. Nenhuma sincronização, edição ou outra mutação de dados
foi confirmada.

Dívida de escala preservada e explicitada: o endpoint atual devolve todos os artefatos e a UI
monta as 408 linhas em uma única resposta. Não existe paginação nesse contrato; este facelift
não inventou endpoint, limite ou ordenação. A rodada é local e não equivale a CI remoto,
cross-browser ou certificação integral de acessibilidade.

## 2026-09-20 — Tasks final card action cleanup

Chrome real autenticado em `localhost:5173`, projeto local 2. Os Task Cards foram
reinspecionados em Light/Dark a 1440×900, 1280×900, 768×1024 e 390×844 após a
remoção de `Ver detalhes`. Nas oito células, o rodapé exibiu somente o menu `...`
alinhado à direita, sem espaço residual nem overflow horizontal da página.

Em mobile Light, `Enter` no corpo do TASK-21 abriu o `TaskDetailsPanel` canônico;
o fechamento por teclado devolveu foco visível ao mesmo card. O menu preservou as
ações Editar tarefa e Excluir tarefa. VIEWER sem rodapé/menu foi coberto por teste
direcionado. Nenhuma edição, exclusão ou outra mutação de dados foi confirmada.

## 2026-09-20 — Tasks C2 facelift

Chrome real autenticado em `localhost:5173`, projeto local 2. A página principal foi
inspecionada em Light/Dark a 1440×900, 1280×900, 768×1024 e 390×844. O grid respondeu
em 3/2/1 colunas, sem overflow horizontal da página em nenhuma célula. Resumo, filtros
recolhidos e expandidos, tile Nova tarefa, cards com diferentes status/Sprints/prazos e
esforços foram observados com dados persistidos existentes.

O dialog Nova tarefa foi inspecionado em Light desktop e Dark mobile, com scroll interno,
header estável e agrupamentos Informações, Planejamento e Rastreabilidade. TASK-21 abriu
o `TaskDetailsPanel` canônico em Light desktop, preservando informações, esforço,
rastreabilidade, qualidade e comentários. Nenhuma criação, edição, exclusão, mudança de
status ou outra mutação de dados foi confirmada durante a inspeção.

Busca/filtros, menus, VIEWER, retorno de foco, empty states e fluxos de submit foram
verificados por automação direcionada. Esta evidência é local, não equivale a CI remoto,
cross-browser, certificação WCAG integral ou homologação de estados raros de erro.

## 2026-09-10 — S1-09 Etapa 3: Requirement Cards e histórico

Chrome real autenticado em `localhost:5173`, projeto local 2. Light/Dark ×
1440×1000, 1280×1000, 768×1000 e 390×1000; 72 células de nove superfícies
consolidadas no [relatório da Etapa 3](../../deliveries/S1_09_FRONTEND_REQUIREMENT_CARDS_HISTORY_REPORT.md#k--visual-matrix).
Capturas full page e recortes do navegador foram inspecionados durante a sessão;
medições DOM complementaram a inspeção. Capturas transitórias/reduzidas foram refeitas.

REQ-4 cobriu título longo, 25%, testes/defeitos, seleção e histórico; REQ-2 cobriu
zero tarefas/testes/defeitos e progresso sem dados. Cards desktop mediram 576px,
sem conteúdo cortado; uma coluna adapta a altura. Sidebar expandida/recolhida foi
inspecionada no tablet. Nenhum overflow horizontal da página foi observado.

Busca real `REQ-2`: 1 de 4 requisitos; limpar restaurou os quatro. Seleção por Enter
focou o heading do fluxo. Histórico abriu o baseline, fechou por Escape e devolveu o
foco. O estado vazio foi observado antes da adoção. Comparação renderizada: cards
Sprint/Marco/TC-5/DEF-4; resumos TestCases/Defects; filtros TestCases/Defects/Kanban;
históricos TASK-17 e DEF-4. Foram corrigidos corte inicial de rodapé, densidade em uma
coluna, margens duplicadas e tipografia do resumo antes da verificação final.

O banco local já tinha as 51 migrations aplicadas. O script canônico registrou apenas
quatro baselines atuais; dry-run posterior sem mudanças. Não houve edição de entidades
de negócio nem reconstrução histórica. Transições adicionais, cursor, erros e concorrência
foram testados por automação, sem classificação como observação renderizada.

React Flow e CSS preservados byte a byte. Expansão e centralização operadas. Canvas
claro em Dark, recorte de grafos largos no mobile e sobreposição de nó expandido são
limitações anteriores preservadas; PASS do canvas significa preservação, não redesign.
Etapa 4 não iniciada. Gates locais PASS; sem afirmação de CI remoto ou certificação de
acessibilidade integral.

## 2026-09-09 — S1-08 UX Standardization FIX 03

Chrome real autenticado em `localhost:5173`, projeto local 2, dados persistidos
existentes. Light/Dark × 1440×1000, 1280×1000, 768×1000 e 390×1000.
Inspeção renderizada das 96 células de 12 superfícies, consolidada no
[relatório FIX 03](../../deliveries/S1_08_UX_STANDARDIZATION_FIX_03_REPORT.md#g--visual-matrix).
Capturas observadas durante a sessão; medições DOM complementaram a inspeção.

DEF-2 aberto/zero correções, DEF-3 em correção, DEF-4 aguardando reteste e DEF-1
validado mantiveram ações legíveis e nenhum overflow horizontal da página.
TASK-16 permitiu comparar Rastreabilidade e Qualidade na mesma tarefa; TASK-15
cobriu TC vazio e vínculo CORREÇÃO. Nas seis categorias, cabeçalho de 53px e corpo
com padding 16px; linhas REQ/TC/DEF de 102px no desktop. TestCases/Defects
preenchidos mediram 253,39px, contra 271,39px no baseline.

Acessar correções → DEF-4/Correção recebeu foco; TASK-17 abriu o Task Details com
um único dialog; Voltar do navegador retornou ao mesmo defeito/seção. No mobile
claro, Adicionar correção → DEF-2/Correção exibiu Criar/Vincular; ambas as subviews
foram abertas e canceladas, restaurando foco no CTA correspondente. Sprint/Marco/
TestCase Catalog foram comparados a 1440px no tema claro.

Nenhuma submissão de dados de negócio. Múltiplas correções, ausência de requisito,
VIEWER, erros, concorrência e mutações permaneceram cobertos por automação, sem
serem classificados como inspeção renderizada. Interrupções pontuais da conexão
com o navegador foram recuperadas; capturas incompletas foram refeitas.
Este gate é local e restrito ao FIX 03, sem CI remoto ou QA integrado final.

## 2026-09-09 — S1-08 UI Standardization FIX 02

Chrome real autenticado em `localhost:5173`, projeto local 2, Light/Dark,
1440×1000, 1280×1000, 768×1000 e 390×1000. Foram inspecionados os 112 recortes da
matriz de 14 superfícies em [relatório A–S](../../deliveries/S1_08_TRACEFLOW_UI_STANDARDIZATION_REPORT.md).
Comparação entre Sprint/Marco, Task, TestCase e Defect guiou a implementação.

PASS renderizado: filtros Kanban, marcador de correção, Task Details/Qualidade,
TC catálogo/Details/form, DEF catálogo/filtros/Details/form/correção/validação e
histórico DEF. Complementos: histórico Task/TC desktop/mobile nos dois temas;
registro a partir de EXEC-0008 FAIL; detalhes validados DEF-1 ciclo 2/EXEC-0005;
criar/vincular correção e cancelamento; buscas de responsável, requisito, tarefas,
Marco e referência testada. Não houve submissão de dados de negócio nesta rodada.

A inspeção de interação encontrou lista encobrindo rodapé e foco retornando ao corpo
do dialog. Ambos foram corrigidos e reinspecionados: resultados no fluxo normal e
callback de fechamento estável. A inspeção final também corrigiu seta/posição do
select ao abrir uma busca vizinha e o gap duplicado de seções TC. Não foi observado
overflow horizontal da página; o scroll horizontal contido do Kanban foi preservado.

Loading/erro/permissões/concorrência e mutações foram verificados nos testes, não
reclassificados como observação visual. Esta evidência é local e restrita à rodada;
não equivale a CI remoto, certificação de acessibilidade ou QA integrado final.

## 2026-09-08 — S1-08 frontend UX alignment

**Resultado: VISUALLY APPROVED para os estados carregados e cancelamento abaixo.**
Chrome autenticado, APIs locais e dados sintéticos persistidos já existentes.
Light e Dark em 1440×1000, 1280×1000, 768×1000 e 390×844, com viewport emulado,
screenshots observados e interação real. Esta rodada substitui a pendência de
matriz do smoke anterior apenas para este escopo.

Matriz completa: detalhes, edição e confirmação/cancelamento de Defect; detalhes
da execução e defeitos registrados no passo FAIL; seção Correção e manager com
tarefa existente; histórico de Defect; alterações do TestCase; detalhes e
Qualidade da tarefa de origem; card de correção no Kanban. IDs: `DEF-DETAILS`,
`DEF-EDIT`, `DEF-DELETE`, `DEF-CORRECTION`, `DEF-HISTORY`, `TC-CHANGES`,
`TC-EXECUTION-DETAILS` (detalhes carregados), `TC-FAILED-STEP-DEFECTS`,
`TASK-QUALITY`, `TASK-CORRECTION-DETAILS` e `TASK-CORRECTION-CARD`.

Referências comparadas: Task Details/History, confirmações Task/TestCase,
ArtifactCategory, SprintDialog e SearchCombobox. Confirmação compacta, foco inicial
em Cancelar, retorno ao acionador, menu mobile e navegação Ver correção observados.
Nenhuma página/dialog da matriz apresentou overflow horizontal; o scroll interno
do Kanban é intencional. A inspeção identificou e revalidou correções de identidade
no histórico aberto por deep link, especificidade da badge de severidade e
contenção de nomes longos de sprint no card. Inspeções adicionais cobriram manager
vazio, Qualidade de tarefa de correção e fechamento do popup de responsável.

Nenhum formulário, exclusão, execução ou movimento de tarefa foi confirmado.
VIEWER, erros de rede, conflitos, múltiplos defeitos por tarefa e estados raros
permanecem tecnicamente verificados por automação, sem aprovação visual inferida.
Não houve nova homologação de todos os formatos de evidência, lifecycle completo,
cross-browser ou WCAG integral. Evidência por cenário, matriz e gates no
[relatório de alinhamento](../../deliveries/S1_08_FRONTEND_UX_ALIGNMENT_REPORT.md).

## 2026-09-08 — S1-08 dados autorizados e smoke adicional

Bloqueio por ausência de dados removido. Quatro defeitos persistidos, um por
estado, com ciclo completo de reabertura e validação no DEF-1. Chrome autenticado,
desktop Dark: cards, indicadores, detalhes de DEF-1/DEF-4 e wizard de reteste
de DEF-4 observados. Wizard não submetido; cenário aguardando reteste preservado.
Matriz visual completa continua pendente. Inventário, vínculos e limites no
[ciclo de dados](../../deliveries/S1_08_QA_DATA_CYCLE.md).

## Purpose

This log is the versioned authority for rendered visual-validation evidence. The
[UI Surface Inventory](../UI_SURFACE_INVENTORY.md) records each surface's current status; this log
records what was actually rendered and evaluated at a specific point in time.

`VISUALLY APPROVED` means that the surface passed the manual/rendered matrix stated in its entry. It
does not mean WCAG certification, exhaustive browser certification, or approval of states listed as
limitations. A later material change to layout or interaction requires the corresponding inventory
status to be reconsidered until that changed behavior is rendered again.

Screenshots are optional supporting artifacts, not a prerequisite for an entry. External workspaces,
chat histories, local prototype folders, and ignored files are not canonical evidence. Entries must
not contain credentials, tokens, cookies, personal data, fixture access URLs, or other secrets.

## Validation records

### Authenticated Shell and Theme Foundation

- **Date:** 2026-08-30
- **Scope:** Authenticated shell, expanded/collapsed sidebar, mobile drawer, quick projects, theme
  persistence, and essential keyboard/focus behavior.
- **Surface IDs:** `GLOBAL-AUTHENTICATED-SHELL`, `GLOBAL-SIDEBAR-EXPANDED`,
  `GLOBAL-SIDEBAR-COLLAPSED`, `GLOBAL-MOBILE-DRAWER`, `GLOBAL-QUICK-PROJECTS`,
  `GLOBAL-THEME-CONTROL`.
- **Themes:** Light and Dark.
- **Viewports:** 1440 x 900, 768 x 1024, and 390 x 844.
- **Validation type:** Rendered visual validation, responsive validation, and focused manual keyboard
  validation.
- **Result:** `VISUALLY APPROVED` for the shell and two resolved themes as implemented at that time.
- **Known limitations:** The validation predates the explicit System / Light / Dark preference and the
  skip link added later. The current three-state theme control and changed shell keyboard path remain
  `TECHNICALLY VERIFIED` until consolidated rendered revalidation.

### Projects, Overview, Edit, and Members

- **Date:** 2026-08-30
- **Scope:** Projects grid, Create/Join flows, Project Overview, Edit Project, Members Team and
  Invitations, Access Code, regeneration confirmation, responsive headers, focus transfer, and
  available auxiliary feedback/confirmations.
- **Surface IDs:** `PROJECTS-MAIN`, `PROJECTS-REQUEST-STATES`, `PROJECTS-INVITATION-CARD`,
  `PROJECTS-NEW-CHOOSER-DIALOG`, `PROJECTS-CREATE-DIALOG`, `PROJECTS-JOIN-DIALOG`,
  `PROJECT-OVERVIEW-MAIN`, `PROJECT-OVERVIEW-REQUEST-AND-SYNC`, `PROJECT-EDIT-PAGE`,
  `PROJECT-MEMBERS-PAGE`, `MEMBERS-TEAM-TAB`, `MEMBERS-INVITATIONS-TAB`, `MEMBERS-ACCESS-CODE`,
  `MEMBERS-ACCESS-REGENERATE-CONFIRM`, `PROJECTS-AUXILIARY-FEEDBACK`.
- **Themes:** Light and Dark.
- **Viewports:** 1440 x 900, 768 x 1024 with the sidebar collapsed, 768 x 1024 with the sidebar
  expanded, and 390 x 844.
- **Validation type:** Rendered visual validation, responsive validation, and focused manual keyboard
  validation.
- **Result:** `VISUALLY APPROVED` for the listed surfaces in the recorded matrix.
- **Known limitations:** Rare states that required a real invitation or additional user/ownership
  configuration were not promoted by inference. Members tab semantics and keyboard interaction were
  materially changed later and currently require rendered revalidation.

### Auth and Account Lifecycle

- **Date:** 2026-08-30
- **Scope:** Login, Register, Recovery, available Reset states, Verification, Email Verification
  Banner, Username Setup Banner, Bootstrap Error, `DEACTIVATED`, `DELETION_PENDING`, Email Change
  Confirmation, and Reactivation Confirmation.
- **Surface IDs:** `AUTH-LOGIN-PAGE`, `AUTH-LOGIN-VALIDATION-FEEDBACK`, `AUTH-GITHUB-OAUTH`,
  `AUTH-REGISTER-PAGE`, `AUTH-REGISTER-VALIDATION-FEEDBACK`, `AUTH-RECOVERY-REQUEST`,
  `AUTH-RESET-PASSWORD`, `AUTH-VERIFY-EMAIL`, `AUTH-EMAIL-VERIFICATION-BANNER`,
  `AUTH-USERNAME-SETUP-BANNER`, `AUTH-BOOTSTRAP-ERROR`, `ACCOUNT-RESTRICTED-DEACTIVATED`,
  `ACCOUNT-RESTRICTED-DELETION-PENDING`, `ACCOUNT-EMAIL-CHANGE-CONFIRMATION`,
  `ACCOUNT-REACTIVATION-CONFIRMATION`.
- **Themes:** Light and Dark.
- **Viewports:** 1440 x 900, 768 x 1024 where applicable, and 390 x 844.
- **Validation type:** Rendered visual validation and responsive validation.
- **Result:** `VISUALLY APPROVED` for the listed surfaces and states that were rendered with the local
  test-only fixtures described in the Auth validation runbook.
- **Known limitations:** Transient runtime loading remained `ENVIRONMENT LIMITATION` and was not
  promoted by inference. The Login recovery-link target changed after this record; the current Login
  surface therefore requires Light/Dark rendered revalidation. SMTP delivery and external GitHub
  behavior remain separate operational evidence.

### Settings

- **Date:** 2026-08-31
- **Scope:** Account, Security, Privacy, Integrations, SensitiveActionDialog, Sessions, password UX,
  and responsive Settings navigation. The final pass specifically included the mobile sensitive
  dialog and Security's container-aware responsive reflow.
- **Surface IDs:** `SETTINGS-SHELL`, `SETTINGS-ACCOUNT`, `SETTINGS-SENSITIVE-REAUTH`,
  `SETTINGS-DEACTIVATE-CONFIRM`, `SETTINGS-SECURITY`, `SETTINGS-SESSIONS`,
  `SETTINGS-SESSION-REVOKE-CONFIRM`, `SETTINGS-PRIVACY`, `SETTINGS-DATA-EXPORT`,
  `SETTINGS-DELETION-STATES`, `SETTINGS-DELETION-REQUEST-CONFIRM`,
  `SETTINGS-DELETION-CANCEL-CONFIRM`, `SETTINGS-INTEGRATIONS`, `SETTINGS-GITHUB-IDENTITY`,
  `SETTINGS-GITHUB-IDENTITY-UNLINK-CONFIRM`, `SETTINGS-GITHUB-APP`,
  `SETTINGS-GITHUB-APP-DISCONNECT-CONFIRM`, `SETTINGS-GLOBAL-FEEDBACK`.
- **Themes:** Light and Dark.
- **Viewports:** 1440 x 900, 768 x 1024 with the sidebar collapsed, 768 x 1024 with the sidebar
  expanded, and 390 x 844.
- **Validation type:** Rendered visual validation, responsive validation, and focused manual keyboard
  validation.
- **Result:** `VISUALLY APPROVED` for the listed surfaces in the recorded matrix.
- **Known limitations:** Account partial-save feedback, sensitive-dialog focus/success behavior,
  Integrations cooldown/impact feedback, and route-navigation semantics changed later. Those current
  surfaces remain `TECHNICALLY VERIFIED` until rendered revalidation. Initial fatal-error and loading
  states were not promoted without direct rendered evidence.

### Frozen Task Details — FIX-04 addenda 2/3

- **Date / revision:** 2026-09-05; working tree over `48ca54f6cb9f39db58b595ba6b08bd52dbdaeb1b`.
- **Scope:** shared read-only Task Details information and traceability, full-width frozen dialog,
  explicit transition to current details, frozen/legacy/empty/unavailable-current states.
- **Surface IDs:** `KANBAN-FROZEN-TASK-DETAIL-DIALOG`, `KANBAN-TASK-DETAIL-INFO`,
  `KANBAN-TASK-DETAIL-TRACEABILITY`; current dialog read-only content as comparison.
- **Themes / viewports:** Light and Dark; 1440, 1024, 768 and 390 pixels wide, height 1000.
- **Method:** real Chrome headless with native input through CDP; real application routes/API,
  exclusive local disposable MySQL fixtures. Screenshots inspected for hierarchy, grids, spacing,
  full-width frozen content, theme tokens, wrapping and bounded scrolling. No production data.
- **Result:** visual parity PASS in the recorded content matrix. Shared information and traceability
  sections are `VISUALLY APPROVED` for this matrix. Frozen contains no Comments/composer/mutable
  actions; current contains Comments and authorized edit/delete. Enter/Space open; Escape closes
  and restores card focus while preserving the historical Sprint filter. Frozen opening performs
  no current Task/artifact reads. V2 fields remain original after current changes.
- **Long content:** 16 commits, 12 issues, long title and description within the real API limit;
  all eight theme/viewport combinations. Removed the shared mobile `overflow-y: visible` override:
  lists retain bounded scroll and their last links are accessible. Current mobile rechecked too.
- **Legacy / empty / unavailable:** rendered in both themes at 390; legacy limitations are explicit,
  captured empty relations remain empty and a deleted current Task has no open-current action.
- **Evidence:** [FIX-04 report](../../qa/PLANNING_QA_FIX_04.md), including capture filenames and local
  evidence manifest. `browser-smoke.json`, `browser-long.json`, `browser-edges.json` record results.
- **Limits:** transient loading and HTTP 404 race are covered by automated tests, not promoted to
  rendered approval. No broad approval of editing, all authorization roles, sidebar permutations,
  external GitHub destinations or the whole Kanban page. Their previous inventory status remains.

## Current revalidation queue

The following materially changed areas require a new rendered record before they can regain or gain
`VISUALLY APPROVED` for their current implementation:

- System / Light / Dark control and live System resolution;
- authenticated-shell skip link and its first-focus path;
- Members tabs, including roving focus and panel associations;
- Account partial-save and Integrations cooldown feedback;
- SensitiveActionDialog busy, error, cancel, Escape, and post-success focus;
- UX-PLANNING-SPRINTS em Light/Dark, sidebar expandida/recolhida, tablet e mobile, incluindo filtros recolhíveis;
- UX-PLANNING-MILESTONES em Light/Dark, sidebar expandida/recolhida, tablet e mobile, incluindo filtros recolhíveis;
- UX-PLANNING-SCHEDULE em Light/Dark, sidebar expandida/recolhida, tablet e mobile, incluindo faixas,
  lanes/overflow, cores automáticas, marcadores, painel Contexto Mês/Dia, grid de próximos prazos e
  estados vazios;
- UX-PLANNING-KANBAN em Light/Dark, sidebar expandida/recolhida, tablet e mobile, incluindo resumo,
  filtros recolhíveis, quadro horizontal em containers estreitos, Task Details e histórico individual;
- legacy Dark-compatible operational surfaces.

### S1-07 — frontend integrado (2026-09-07)

**Status: TECHNICALLY VERIFIED; homologação visual completa pendente.** Checkout
operacional, branch `daniel-dev`, HEAD `b5732ca41cf66b1520e46edbb07c9d4c2d59ed16`.
A sessão usou exclusivamente uma conta artificial e o schema descartável
`traceflow_s107_20260907_test`. Nenhuma alteração no banco de desenvolvimento.

Renderização observada por captura nativa do Safari, sem equivalência comprovada a
um viewport CSS de 1440/1280/768/390. Em Dark: catálogo, formulário de criação,
cinco passos em duas colunas, assistente, resumo e detalhe histórico. Em Light:
catálogo, filtros expandidos, detalhes atuais v4, Execuções, Alterações, detalhe
histórico v3 e confirmação de exclusão. O histórico foi recarregado após ajustar
as classes das abas ao controle canônico `internal-tab`. Os demais estados e as
combinações de tema/dimensão não observados continuam pendentes.

Fluxo real observado: criar com Requirement/Task encontrados no servidor, editar
até v3, registrar cinco passos PASS com PNG no passo 3, consultar histórico,
abrir execução v3 após alteração do caso para v4, baixar JSON e excluir logicamente.
O download do navegador foi comparado com a fixture: bytes idênticos.

A tentativa nativa de upload conjunto PNG/MP4/JSON teve seleção de arquivos
inconsistente (botão Enviar desabilitado apesar do arquivo selecionado e erro
`noWindowsAvailable`). Não houve comprovação completa desse upload conjunto pelo
navegador. Um smoke HTTP autenticado complementar registrou os três anexos e
validou três downloads por SHA-256; o frontend renderizou essa execução real,
incluindo PNG no passo 3, MP4 no passo 5 e JSON geral. Isso não transforma o smoke
HTTP em PASS do upload completo pela UI. Extensões e MIME types estão explicitados
no `accept`; esse ajuste não foi considerado prova de resolução do seletor nativo.

**ENVIRONMENT BLOCKED:** controle exato de viewport, matriz responsiva completa,
medidas DOM/overflow/44px, coleta de console do navegador e comparação renderizada
completa com Sprints/Tasks. Nenhum browser provider estava disponível; houve apenas
controle nativo do Safari. O atalho de modo responsivo não disponibilizou controles
mensuráveis. Não há declaração de zero erros no console real nem `VISUALLY APPROVED`.

Testes automatizados, API/DB, CSS estrutural e cobertura estão detalhados no
[relatório de integração](../../deliveries/S1_07_FRONTEND_INTEGRATION_REPORT.md).
Esses resultados não substituem a matriz visual solicitada nem aprovação humana.

## 2026-09-08 — S1-07 Frontend Final UX Fix

**Estado: TECHNICALLY VERIFIED; matriz visual exata ENVIRONMENT BLOCKED.**
Checkout `/Users/daniel/Coding/Traceflow`, branch `daniel-dev`, baseline
`b5e6b83c1c632aa566ec8cfc8d4e23acdab2edc2`. Implementação real, sem runtime fake.

Smoke desktop nativo no Safari, sessão já autenticada, projeto 2: Main, filtros
abertos/fechados, New TestCase e TC-1 PASS, create/edit sem salvar, Details, execução
com dropdown inicialmente fechado e aberto por clique, Step, resumo com referência
longa, ambas as tabs do histórico, EXEC-0001 histórica e confirmação cancelada.
Superfícies observadas em Light/Dark. Links REQ-1 e TASK-2 navegaram às seções
canônicas fechando o contexto anterior. Nenhum registro foi criado, editado ou excluído;
nenhuma execução foi enviada. Tema Sistema restaurado ao encerrar.

Comparação sequencial renderizada em Light com Task Card/Task Details/Sprint Filters.
O comparativo identificou a necessidade de reutilizar GithubExternalAction, aplicada
pelo barrel público de tasks. A seleção longa do SearchCombobox revelou overflow
intrínseco, corrigido com min-width: 0 e revalidado em ambos os temas. PageDown
confirmou que o dropdown fecha ao rolar o modal; não interfere no footer. Recarregamento
precedeu a captura Dark final da execução histórica com a ação externa canônica.

Limites: nenhum browser provider; sem viewport CSS medido em 1440/1280/768/390, sem
coletor de console/computed styles e sem matriz de variantes de cards simultâneas.
O comando nativo de scroll retornou noWindowsAvailable em tentativas, contornado
para o smoke de scroll por teclado. Não há visual PASS para as combinações exatas,
medição de targets/overflow ou console. Não promover a VISUALLY APPROVED/C2 COMPLETE.

Evidências e gates: [S1-07 FRONTEND FINAL UX FIX REPORT](../../deliveries/S1_07_FRONTEND_FINAL_UX_FIX_REPORT.md),
com 230 testes focados, 864 testes completos e cobertura aprovada. Capturas foram
observadas durante a sessão; este registro não as apresenta como artefatos PNG versionados.

### S1-07 Addendum 3 — Traceability + Evidence Viewer

- **Date:** 2026-09-08.
- **Baseline:** `daniel-dev`, `c25348b523230b3607a6879d5c60aad1e9da0a19`; working tree inicialmente limpo.
- **Surface IDs:** `TC-TRACEABILITY`, `TC-EVIDENCE-LIST`, `TC-EVIDENCE-VIEWER`, `TC-EXECUTION-DETAILS`.
- **Resultado:** `TECHNICALLY VERIFIED`; homologação visual parcial, sem promoção a `VISUALLY APPROVED`.
- **Render real:** Safari autenticado em localhost, cenário já existente, leitura de requisito/tarefa
  vinculados e imagem JPG persistida. Rastreabilidade em Light/Dark e mesma família visual da Task
  Details; comparação sequencial. Viewer JPG em Light/Dark, contextos de passo/geral, header,
  voltar e fechar. Retorno com foco visível em Visualizar e posição preservada observado em Dark.
- **Backend/dados:** nenhuma alteração de backend, banco, upload ou registro de execução. Somente
  navegação e leitura autenticada. A preferência de tema original foi restaurada ao final.
- **Viewports:** dimensões CSS exatas 1440/1280/768/390 `ENVIRONMENT BLOCKED`; somente provider nativo,
  sem controle de viewport/DevTools. Captura de janela não foi usada como medição de viewport CSS.
- **Outros formatos/estados:** video, PDF, TXT/LOG, JSON, unsupported, loading e erro controlados:
  `ENVIRONMENT BLOCKED` para render real por ausência de cenário persistido disponível nesta sessão
  de leitura. Cobertos por testes, sem inferência de codecs/plugin PDF ou aprovação visual.
- **Console:** navegador `ENVIRONMENT BLOCKED`; testes focados assertam zero errors/warnings e o
  runner não reportou unhandled rejections. Não há equivalência entre essas duas fontes de evidência.
- **Gates:** 130 focados, 118 regressão canônica, 898 completos e coverage PASS; lint, format,
  build, arquitetura, secrets e diff-check PASS.
- **Relatório:** [S1-07 Traceability + Evidence Viewer](../../deliveries/S1_07_TRACEABILITY_EVIDENCE_VIEWER_REPORT.md).

## 2026-09-08 — S1-08 frontend integration

**ENVIRONMENT BLOCKED para homologação completa.** Sessão real no Chrome local,
projeto 2, sem defeitos e sem candidatos FAIL. Smoke renderizado do catálogo vazio
em Light/Dark 1440, 768 e 390; filtros abertos em desktop e Dark 390; seletor vazio
de criação observado em desktop Dark. Comparação com TestCases Main e Task Details
em Light 1280. Isso não prova cards de defeitos, correções, reteste ou histórico.

Detalhamento por superfície/viewport, console, testes e gaps no
[S1_08_FRONTEND_INTEGRATION_REPORT](../../deliveries/S1_08_FRONTEND_INTEGRATION_REPORT.md).

Um reinício local provocou `ERR_CONNECTION_REFUSED` em auth/me; a sessão foi
recuperada e a leitura de defeitos retornou 200. Os controles nativos de filtro
receberam id/name durante a investigação de Issues do navegador. A ausência de
warnings nas superfícies não percorridas não está homologada.

**FROZEN CORRECTION CONTEXT CONTRACT GAP** registrado: sem metadados no snapshot,
nenhum Defect atual é consultado para representar o contexto congelado.

Smoke adicional Light 1280: Task Details → criação contextual no mesmo dialog,
TASK-2 + REQ-1 selecionados sem persistência. Corrigido e reobservado o foco no
título ao entrar; retorno ao botão de criação implementado. A Task normal não
recebeu contexto de correção. Um Issue de melhoria do Chrome também apareceu na
superfície canônica de tarefa; o painel Issues classificou a família como campos sem id/name (dois apontamentos),
sem page errors/breaking changes. A atribuição individual permanece pendente.

## 2026-09-10 — S1-09 Etapa 4 · Expanded Traceability Graph

**PASS LOCAL — inspeção renderizada.** Chrome 152.0.7977.84/macOS, sessão local autenticada.
Escopo: canvas de rastreabilidade, oito tipos reais, metadata, grupos, fit/pan e abertura dos
Details existentes. Overview, filtros, Requirement Cards e histórico da Etapa 3 preservados.
Larguras verificadas no DOM, em Light e Dark: 1440, 1280, 768 e 390px.

| Cenário                           | Light 1440 | Dark 1440 | Light 1280 | Dark 1280 | Light 768 | Dark 768 | Light 390 | Dark 390 |
| --------------------------------- | ---------- | --------- | ---------- | --------- | --------- | -------- | --------- | -------- |
| Requirement sem relações          | PASS       | PASS      | PASS       | PASS      | PASS      | PASS     | PASS      | PASS     |
| Legacy Task / PR                  | PASS       | PASS      | PASS       | PASS      | PASS      | PASS     | PASS      | PASS     |
| TestCase PASS                     | PASS       | PASS      | PASS       | PASS      | PASS      | PASS     | PASS      | PASS     |
| TestCase FAIL / detecção / Defect | PASS       | PASS      | PASS       | PASS      | PASS      | PASS     | PASS      | PASS     |
| Correction Task                   | PASS       | PASS      | PASS       | PASS      | PASS      | PASS     | PASS      | PASS     |
| Retest PASS                       | PASS       | PASS      | PASS       | PASS      | PASS      | PASS     | PASS      | PASS     |
| Large grouped (fixture isolado)   | PASS       | PASS      | PASS       | PASS      | PASS      | PASS     | PASS      | PASS     |
| Metadata expandida                | PASS       | PASS      | PASS       | PASS      | PASS      | PASS     | PASS      | PASS     |
| Grupo expandido                   | PASS       | PASS      | PASS       | PASS      | PASS      | PASS     | PASS      | PASS     |

REQ-2: vazio. REQ-1: Task/PR/Commit. REQ-3: TestCases PASS/FAIL, detecção e Passo 1,
Defects aberto/validado, Task de correção e retestes PASS/BLOCKED/FAIL. Os quatro Details reais
foram abertos/fechados preservando seleção/expansão; nenhuma mutação foi executada nessa sessão.
O cenário grande usou preview temporário do componente real com DTO artificial persistido em
schema exclusivo de teste: 85 entidades/123 relações; default 22 entidades + 10 grupos;
expansão total 85 IDs únicos + 10 grupos, zero sobreposição entre cards. Issue e Commit também
foram inspecionados com metadata. Preview e schema descartável removidos ao encerrar.

Capturas de canvas/cards foram observadas na execução interativa, sem pacote PNG versionado.
Geometria confirmou card focado inteiramente no canvas e ausência de overflow horizontal da página.
Em mobile, pan é necessário para relações fora do recorte; foco recentraliza em zoom legível.
Controles horizontais de 44px não cobrem o footer do card expandido. Fit enquadra a expansão total;
nessa escala, serve como visão geral, com zoom/foco para leitura. Labels semânticos ficam visíveis
nas relações de metadata expandida e preservam nome acessível em todas as edges.

Teclado, foco visível, aria-expanded, resultados textuais e retorno dos Details verificados;
não é certificação WCAG completa. Este registro não substitui QA integrado/CI remoto.
Ver [relatório A–V](../../deliveries/S1_09_EXPANDED_TRACEABILITY_GRAPH_REPORT.md).

## 2026-09-11 — S1-09 Etapa 5 · Workspace final e targeted corrections

**PASS LOCAL — inspeção renderizada no Chrome/macOS.** Sessão autenticada local no projeto 2; grafo grande obtido de fixture persistida em schema exclusivo de teste e exibido em preview temporário removido ao final.

| Workspace / grafo grande / contexto / Inspector | Light | Dark |
| ----------------------------------------------- | ----- | ---- |
| 1440×1000                                       | PASS  | PASS |
| 1280×900                                        | PASS  | PASS |
| 768×1024                                        | PASS  | PASS |
| 390×844                                         | PASS  | PASS |

Requirement Cards, TestCase/Defect overviews e Defect Cards foram comparados com a família Task/TestCase; a cobertura exata por superfície está na seção Q do [relatório final](../../deliveries/S1_09_TRACEABILITY_GRAPH_WORKSPACE_UX_REPORT.md), sem extrapolar a matriz do grafo para toda combinação de catálogo. Cards reais: REQ-4 25%/Em correção; REQ-3 75%/Com falha; REQ-2 Sem dados/Sem rastreabilidade. Summary: 4 total, 2 com defeito, 1 em desenvolvimento. Card aguardando reteste: fixture sintética calculada pela policy, Light/Dark em 390.

Grafo grande: 85 artefatos/123 relações; 22 entidades + 10 grupos por padrão; 85 + 10 totalmente expandido. Leitura real TC → execução FAIL → Defect → reteste PASS, ciclos separados, edges destacadas e Inspector textual. Zoom manual .20 e centralização .90 conferidos no DOM; arraste de DEF-222 permaneceu ao trocar seleção. Margem 768 corrigida para 16px em ambos os lados. Mobile manteve canvas e Inspector rolável, sem overflow horizontal da página.

Revalidação de foco posterior ao último fix: Enter abre workspace, ajuda consome Escape, relações focam o heading do Inspector, Details mantém um diálogo, fechamento devolve ao trigger. A homologação encontrou Enter/Espaço interceptados pelo canvas nos botões de grupos; regressão red/green e correção do owner de teclado, seguida de 299 testes × 10 rodadas e 1.110 testes full/coverage. Backend: 89 focados e 1.246 full, 5 skips preexistentes.

Histórico real confirmou nova razão de policy sem reescrever baseline. Screenshots foram observadas na sessão, sem PNGs temporários versionados. Preview removido. Nenhuma conclusão sobre CI remoto, produção, dispositivos físicos ou conformidade WCAG integral é derivada deste registro.

## 2026-09-12 — S1-09 Etapa 5 · FINAL TARGETED CORRECTIONS

**PASS LOCAL — inspeção renderizada no Chrome/macOS, sessão local autenticada.**
Larguras confirmadas no DOM; Light e Dark em 1440, 1280, 768 e 390px. A matriz
completa por superfície está na seção
[FINAL TARGETED CORRECTIONS](../../deliveries/S1_09_TRACEABILITY_GRAPH_WORKSPACE_UX_REPORT.md#final-targeted-corrections).

Nos oito recortes por superfície: Project Tabs; overviews TestCase/Defect/
Traceability; filtros e Requirement Cards; Defect Cards ABERTO, EM_CORRECAO,
AGUARDANDO_RETESTE e VALIDADO; workspace; Task Inspector; PR Inspector; histórico
de esforço. Comparação dos cards com o Kanban real em ambos os temas no desktop.
Defect validado mostra reteste PASS real, EXEC-5/ciclo 2. GitHub usa a ação
canônica, sem underline computado; não foi necessária navegação externa.

Task 16: snapshot inicial de 5h estimadas/7h realizadas/140%; após atualização
dos dados durante a sessão, histórico real mostrou exclusão de 3h e estado atual
de 4h/5h/80% coerente entre Task Details, Kanban e Inspector. A exclusão já estava
persistida quando consultada; não foi executada como ação de homologação.
O componente também foi observado com DTOs retornados pelos testes reais de
persistência para CREATED/UPDATED/DELETED (3h → 4h → exclusão), em preview
temporário explicitamente separado da consulta integrada. Filtros Manual +
Excluído foram aplicados no histórico real; datas combinadas estão cobertas por
automação, sem alegação de submit manual confirmado.

Inspeção encontrou colapso/overflow da barra em layout legado e quebra necessária
nos seletores do dialog mobile; corrigidos nos owners locais e revalidados.
Aba ativa ficou visível sem scroll vertical da página. Navegação por teclado,
foco nas relações e footer mobile foram observados. Sem estimativa/zero e
permissões/concorrência foram verificados por testes.

Previews e duas abas auxiliares removidos, viewport restaurado, tema Escuro e
aba principal preservados. Capturas observadas durante a execução, sem arquivos
PNG versionados. Não substitui CI remoto, QA integrado final, teste em dispositivo
físico ou certificação WCAG integral.

## 2026-09-12 — S1-09 Etapa 5 / FINAL UI/PARITY CORRECTIONS

Baseline desta micro-rodada: `daniel-dev`, HEAD
`f0050758ce59777df0babd28f84fd8a12b2e7497`, working tree inicialmente limpa.
Navegação autenticada no Chrome local, projeto 2, sem mutações de dados durante
a inspeção visual. Esta entrada substitui a aprovação anterior de duas visões
de esforço; não revalida funcionalidades fora do recorte atual.

| Superfície                                  | Light 1440/1280/768/390   | Dark 1440/1280/768/390    |
| ------------------------------------------- | ------------------------- | ------------------------- |
| Histórico único de esforço, filtros e ações | PASS / PASS / PASS / PASS | PASS / PASS / PASS / PASS |
| Kanban Overview, quatro cantos              | PASS / PASS / PASS / PASS | PASS / PASS / PASS / PASS |
| Defect Card, quatro estados reais           | PASS / PASS / PASS / PASS | PASS / PASS / PASS / PASS |
| Task Inspector                              | PASS / PASS / PASS / PASS | PASS / PASS / PASS / PASS |
| PR Inspector                                | PASS / PASS / PASS / PASS | PASS / PASS / PASS / PASS |
| TestCase Inspector                          | PASS / PASS / PASS / PASS | PASS / PASS / PASS / PASS |
| Execution Inspector                         | PASS / PASS / PASS / PASS | PASS / PASS / PASS / PASS |
| Defect Inspector                            | PASS / PASS / PASS / PASS | PASS / PASS / PASS / PASS |
| Task Details aberto pelo grafo              | PASS / PASS / PASS / PASS | PASS / PASS / PASS / PASS |

Task 16 mostra 4h/5h/80% no Inspector, no Details do grafo e no Details canônico.
A lista real contém DELETED de 3h e a sessão antiga de 4h como Snapshot / Registro
anterior ao histórico, conforme decisão do usuário. Eventos de criação, edição e
exclusão juntos, antes/depois, origem, datas UTC e permissões foram verificados
nos testes; não foram fabricados eventos no projeto visual.

Controles medidos em 44px; reflow final usa a largura do painel, evitando campos
apertados no Details convencional. Lápis/lixeira compartilham tamanho; foco e
tooltip observados. Edição foi aberta por Enter e cancelada; exclusão foi aberta
por teclado e cancelada na confirmação. Escape do histórico embedded devolveu
foco a Ver sessões registradas com um único diálogo no workspace. Voltar ao fluxo
preservou TASK-16 selecionada; testes existentes cobrem posições/grupos/viewport.

Kanban: clipping pertence à surface; seletor em portal permaneceu visível no
mobile, seleção/limpeza funcionaram e Escape retornou ao trigger. Defect Cards
DEF-1 a DEF-4 preservaram severidade, detection, requisito, fase, seção dinâmica e
footer, sem badge de lifecycle duplicado ou heading isolado. TestCase Cards foram
comparados nas mesmas larguras e temas. Inspectors reutilizam DetailSurface com
grade consistente; relações mobile e foco foram observados por scroll/teclado.
Link GitHub sem underline computado em foco; demais estados cobertos pela regra
CSS local existente, sem navegação externa ou alegação de visita manual a cada
pseudo-estado.

197 testes focados ×10, 1.131 full frontend e coverage, 23 backend focados;
lint/format/build e verificações finais passaram. Matriz detalhada, comandos e
limites no [relatório](../../deliveries/S1_09_TRACEABILITY_GRAPH_WORKSPACE_UX_REPORT.md#final-uiparity-corrections).
Capturas observadas nesta execução, sem pacote PNG versionado. Aba auxiliar
fechada, viewport restaurado e tema Escuro preservado. Sem QA temporário dentro
do produto. Não substitui CI remoto, dispositivo físico ou Final Integrated QA.

## 2026-09-21 — Project deletion and 30-day recovery

**PASS LOCAL — inspeção renderizada no Chrome/macOS.** Catálogo, seção de projetos
excluídos recentemente, recuperação, Zona de perigo e confirmação digitada foram
observados com frontend/API reais contra schema isolado de teste.

| Superfície                          | Light 1440/1280/768/390   | Dark 1440/1280/768/390    |
| ----------------------------------- | ------------------------- | ------------------------- |
| `/projects` e recuperação           | PASS / PASS / PASS / PASS | PASS / PASS / PASS / PASS |
| Zona de perigo                      | PASS / PASS / PASS / PASS | PASS / PASS / PASS / PASS |
| Confirmação digitada                | PASS / PASS / PASS / PASS | PASS / PASS / PASS / PASS |
| Conflito GitHub de OWNER            | PASS / PASS / PASS / PASS | PASS / PASS / PASS / PASS |
| Conflito GitHub neutro de não OWNER | PASS / PASS / PASS / PASS | PASS / PASS / PASS / PASS |
| Confirmação de exclusão definitiva  | PASS / PASS / PASS / PASS | PASS / PASS / PASS / PASS |

Nenhum recorte apresentou overflow horizontal da página. Em 390px, a surface
principal mediu 358px; em 768px, 616px; em 1280/1440px, 928px. O diálogo permaneceu
em 512px ou na largura disponível. Input recebeu foco inicial, nome divergente
manteve a ação desabilitada, nome exato habilitou a ação, Tab/Shift+Tab fecharam o
ciclo, Escape fechou somente o diálogo superior e devolveu foco ao trigger.

A recuperação foi executada na aplicação real e observada no catálogo. Os dois
projetos temporários foram removidos do schema de teste ao final por conferência
exata de ID e nome. Os estados raros de conflito GitHub foram renderizados com os
componentes reais e fixture HTTP efêmero, explicitamente sem persistência; portanto
comprovam apresentação/responsividade, enquanto autorização e mutations são
cobertas pela suíte API. Abas auxiliares e servidores temporários foram encerrados.
Não substitui CI remoto, dispositivo físico ou certificação WCAG integral. Ver o
[relatório de implementação](../../deliveries/PROJECT_DELETION_RETENTION_IMPLEMENTATION_REPORT.md).

## 2026-09-28 — P8.5 Indicators Workspace

**CHANGES REQUIRED — matriz visual incompleta.** Indicadores/Geral, Overview
compacta, Casos de teste e Defeitos foram observados no Chrome nativo desktop Dark,
com sessão/API reais e dados persistidos do projeto local 2. A leitura observada
foi 73/100, cobertura 69%. Ajustados espaçamento da Overview, barra de saúde,
colunas de tabelas e container responsivo da nova página.

O browser integrado não estava disponível. O fallback nativo apresentou foco e
valores inconsistentes nos controles de emulação e conteúdo antigo após mudança
de URL; essas capturas não homologam a matriz. Falta concluir Light/Dark em
1440/1280/1024/768/430/390/360 para Overview e Geral/Fluxo/Sprint/Qualidade/
Rastreabilidade, com comparação de Tarefas/Requisitos e verificação de gráficos,
ajuda, filtros, acessibilidade e overflow. Automação alternativa depende da
autorização solicitada conforme as instruções da ferramenta de interface.

Os gates automatizados passaram, mas não substituem a inspeção visual. Detalhes:
[relatório P8.5](../../deliveries/S2_P8_5_INDICATORS_WORKSPACE_COMMERCIAL_UX_REPORT.md).


## 2026-09-28 — P8.6A UI Consistency & Commercial UX Recovery

**PASS LOCAL.** Overview e Geral/Planejamento/GitHub/Fluxo/Sprint/Tarefas/Qualidade/Rastreabilidade renderizados com frontend e API reais, projeto artificial persistido em `traceflow_test`. Chrome via CDP autorizado explicitamente após falhas no controle nativo. Matriz de 126 capturas: Light/Dark × 1440/1280/1024/768/430/390/360 × nove superfícies, sem overflow horizontal ou alertas de erro. Inspeção visual direta das categorias em amostras distribuídas entre as larguras e temas; comparação renderizada com as seis páginas maduras.

Correções após renderização: padding/ícone do Health no mesmo container, regra que sobrescrevia a fonte das abas, largura da barra versus marker e remoção de texto informativo redundante. SummaryPanel de Casos de teste e Indicadores apresentou estilos computados idênticos de fonte, tamanho, peso, letter spacing e padding. Filtro expandido mobile com alvos de 44px; somente datas/Sprint, contexto preservado entre categorias. Ajuda dentro do viewport, Escape e retorno de foco confirmados. Refresh único incluindo Health. CTA da Overview navega para Indicadores.

Burndown/Burnup: cinco pontos reais na Sprint atual e snapshots de um ponto em Sprint encerrada (aproximadamente 194px, sem “Ver dados”). Velocity com duas Sprints; CFD com SVG 352px/área útil aproximada 283px. Referências percentuais com marker e texto; tabela de PR com título longo legível no mobile. Estados vazios e limitações usam apresentação compacta e hierarquia de mensagens.

Matriz automática não equivale à leitura manual de cada pixel das 126 capturas. A inspeção direta é amostral e complementar aos testes; não cobre dispositivo físico, leitor de tela ou sincronização externa GitHub. Registros de origem GitHub são artificiais no banco isolado. O projeto/conta de teste foram removidos após validar o ambiente e conferir ausência de mudança em registros congelados preexistentes. Gates e evidência transitória em `/private/tmp/traceflow-p86-evidence/`, detalhados no [relatório P8.6A](../../deliveries/S2_P8_6A_UI_CONSISTENCY_COMMERCIAL_UX_REPORT.md).


Conferência final adicional do projeto local 2, somente leitura no Chrome conectado: Health 73/100, Atenção, cobertura 69%, principal área Qualidade e barra/CTA integrados ao container de Overview. Aba auxiliar fechada; aba original de Defeitos e serviços do usuário preservados. Navegador isolado e servidores temporários encerrados.


## 2026-09-28 — S2 P8.6B: dataset representativo e séries

Chrome autenticado, frontend local em 5173 e API real em 3001; projeto artificial 2.
Todas as categorias em 1440px/dark: Geral, Planejamento, GitHub, Fluxo, Sprint,
Tarefas, Qualidade, Rastreabilidade. Visão Geral em 1440px/light. Amostras adicionais:
Tarefas 1280/light e 390/dark; Qualidade 1024/light; Fluxo 768/light e 360/light;
Sprint 430/light. Não houve overflow horizontal do documento nas amostras estreitas.
Rolagem horizontal de tabelas permanece contida na região. Legendas de Velocity,
referências de duração, lacunas e área útil de CFD foram examinadas.

Dados maiores revelaram rankings excessivamente altos e seleção inicial vazia em
séries esparsas. Corrigidos com altura máxima da região, cabeçalho fixo, indicação de
ranking parcial e seleção inicial da primeira amostra. Reinspeção após alterações.
Capturas integrais podem posicionar elementos fixed conforme o offset do viewport;
a avaliação da composição do conteúdo foi complementada por leitura DOM e captura
de viewport, sem atribuir esse efeito da captura ao layout da aplicação.
Evidências locais transitórias: `/private/tmp/traceflow-p86b-evidence/`.
Fluxo também inspecionado com janela de 30 dias (30 pontos e 30 linhas de dados),
com lacunas preservadas. Rolagem de ranking por PageDown e header fixo confirmados.
Detalhes e limites no [relatório](../../deliveries/S2_P8_6B_ANALYTICS_DATA_ENRICHMENT_REPORT.md).

## 2026-09-28 — S2 P8.6C: auditoria final independente

Chrome autenticado, API real 3001/frontend 5173, projeto artificial 2. Matriz nova com
90 capturas finais: Overview e oito categorias, 1440/1280/1024/768/430/390/360 Light,
mais 1440/768/390 Dark. Sem overflow horizontal do documento. Inspeção visual direta
amostral, DOM, teclado e dados complementares; não se afirma revisão de cada pixel.

Encontrada divergência no h1: Indicadores 40px, páginas maduras 48px no mesmo viewport.
Removida exceção de IndicatorsScreen.css para herdar a tipografia global. Nova leitura
48px desktop/32px mobile e matriz renderizada após a correção. Summary e filtro usam
primitives canônicas. 83 tooltips abertos/fechados por teclado em 390px, sem conteúdo
técnico ou extravasamento; foco restaurado. Tabelas com rolagem horizontal por teclado,
referências de Flow, Burndown/Burnup de oito pontos e Velocity de quatro Sprints conferidos.

Sync GitHub real SUCCEEDED (run 18); atualização refletida no Summary. Conferência
independente de Planning/Flow/Sprint/Quality/Traceability e snapshot original preservado.
Frontend 1280 testes; backend 1459, com cinco skips legados; demais gates aprovados.

**CHANGES REQUIRED:** o Chrome encerrou inesperadamente nas tentativas de zoom nativo.
125/150/200% não foram comprovados; viewport não substitui zoom. Falta também timeline
HTTP e medição de render no navegador. Medição de serviço local não foi apresentada
como latência HTTP. A versão ainda não recebe INDICATORS STABLE BASELINE.

Evidência transitória: `/private/tmp/traceflow-p86c-evidence/`. Capturas full-page possuem
possíveis deslocamentos de elementos fixed, diferenciados das telas reais por captura
de viewport. Detalhes, matriz e pendências no
[relatório P8.6C](../../deliveries/S2_P8_6C_FINAL_INDICATORS_VALIDATION_REPORT.md).

## 2026-10-03 — S2 P8.6C: correção visual, dados e interações

Rodada nova, posterior à auditoria acima. Chrome autenticado, API local 3001,
frontend 5173 e projeto artificial 2 do banco de desenvolvimento existente. Sem seed
ou alteração de fatos nesta rodada. Baseline `938be91ff575b07887ed68b93d7b04a75c6fe761`.

Corrigidos: conteúdo/tipografia do Health na Overview, refetch ao recuperar foco,
header de indicador, ajuda 16px/target 44px, fluxo do Panorama e atividade GitHub,
listas com limite de altura e contagem explícita, estados vazios, I73 sem PR aberta,
limitações de esforço compartilhadas e distinção entre mediana diária/do período.
Lead/Cycle com um dia amostrado usam resumo compacto; lacunas e outliers preservados.

Após todas as alterações de código e remoção da instrumentação temporária, matriz
nova de **90 capturas**: Overview e oito categorias em 1440/1280/1024/768/430/390/360
Light, e 1440/768/390 Dark. Sem overflow horizontal do documento, sem alertas de erro
ou snapshots de carregamento nessa matriz. Inspeção visual direta de todas as nove
superfícies em amostras desktop e adicionais mobile/tablet; não se afirma leitura
manual de cada pixel das 90 capturas. Casos de teste, Rastreabilidade, Defeitos,
Tarefas, Requisitos e Sprints também renderizados para comparação canônica.

Evidência adicional: tabela mobile rolada 300px por PageDown, cabeçalho de coluna
sticky e outline visível; tooltip de Lead Time dentro de 390px, Escape e retorno de
foco; sidebar expandida/recolhida e drawer mobile; snapshot real em 24/09 sem gráfico
ou “Ver dados” redundante. Contraste textual amostral de Rastreabilidade: mínimo
5,67:1 Light e 7,13:1 Dark. Não houve teste com leitor de tela/dispositivo físico.

Auditoria independente reconstruiu 40 Tasks/73 movimentos: Lead 6 dias, Cycle 1 dia,
Throughput 16 e CFD com coorte de 32 Tasks/30 buckets. As 120 linhas das quatro
tabelas de Flow correspondem à API. Sem modificação das fórmulas ou dos fatos.
Rede: 199,7s ocioso, sete requests iniciais e nenhum adicional; o usuário informou
que o refresh não ocorria mais ao retornar. O controle nativo não produziu sequência
observável blur/focus; essa evidência é composta por relato, contagem e testes, sem
alegar captura instrumental dessa sequência. Console final: zero warn/error.

Frontend: 1.297 testes; backend: 1.495 aprovados e cinco skips legados. Coverage,
lint, format, build, Prisma, arquitetura, segredos e política de CI local passaram.
**CHANGES REQUIRED — HIGH / SECURITY:** audit do backend bloqueado pelo advisory
`GHSA-vfj7-8cjw-p6xm`, cadeia de desenvolvimento nodemon/chokidar/braces, sem versão
corrigida publicada na consulta. Não foi criada exceção nem aplicado downgrade.
Esta rodada não concede INDICATORS STABLE BASELINE.

Evidências transitórias: `/private/tmp/traceflow-p86c-hardening-20261003/`, arquivos
`final-*.png`, `final-visual-matrix.json`, `data-audit.json`, `facts-api-ui-check.json`
e logs de gates. Capturas full-page podem deslocar elementos fixed; inspeções de
viewport foram usadas para distinguir esse efeito de defeitos do layout.
Relatório: [P8.6C visual/data hardening](../../deliveries/S2_P8_6C_INDICATORS_VISUAL_DATA_HARDENING_REPORT.md).


## 2026-10-03 — S2 P8.6D: polimento final e auditoria de Flow

Baseline limpa `daniel-dev`, HEAD `f6d9e2946993f9fc852d87e897719bebe7aa8976`.
Chrome autenticado, frontend 5173/API 3001, Project 2 artificial existente. Leitura
readonly de 40 Tasks/73 movimentos; nenhuma alteração de fatos, schema ou seed.

Causas corrigidas: Data State fora do header, Flow com 45px de desalinhamento,
seleção de gaps, associação/pessoas misturadas, escopo/esforço agrupados por tipo
visual e effect de Sprint que descartava draft inválido. Correções adicionais de
traço em PARTIAL vazio e parágrafos sem conteúdo, após revisão renderizada.

Nova matriz final pós-correções/reload: **80 capturas**, oito categorias em
1440/1280/1024/768/430/390/360 Light e 1440/768/390 Dark. Sem overflow horizontal
do documento ou alertas de erro. Inspeção direta amostral das oito views desktop e
mobile, mais breakpoints intermediários/Dark. Não equivale a inspeção manual de
cada pixel, leitor de tela físico ou certificação de acessibilidade.

Lead/Cycle: top dos SVGs em 1107,98px para ambos em 1440/1280; stack em larguras
menores. CFD mantém SVG 352px. Task 3 outlier preservado; Task 9 sem início excluída
do Cycle. Medianas 6/1 dias, coortes 15/14, série diária com 9/8 dias úteis. Sessenta
linhas de tabela correspondem ao HTTP e ao cálculo independente. End no Cycle
seleciona 25/09, duas Tasks, 3,15 dias; nenhum gap gera tooltip com amostra zero.

Commits: 133 total compacto, 93 na main; associação e responsáveis separados.
Sprint: escopo 1/0/1 saída, esforço 24/20/−4h, Burndown/Burnup oito pontos e Velocity
quatro Sprints. Tabelas limitadas a 320px, total 10 de 11 preservado; teclado moveu
scroll mobile até 895px, com foco visível. Ajuda mobile 358px dentro de viewport
390px, Enter/Escape e retorno de foco. Filtro inválido manteve 0 ativos/URL sem
período/nenhum request; erro junto às datas e Clear no fim do painel.

Rede instrumentada temporariamente: uma consulta agregada por categoria, nenhuma
por widget, nove respostas mantidas na observação ociosa posterior. HTTP aquecido
11–17ms / 25.031–33.872 bytes; não é benchmark de produção. Console sem warn/error.
Focus/visibility e races reexecutados por testes, sem alegar novo Alt+Tab nativo.

Frontend **1.312 testes**; backend **1.495** e cinco skips legados; coverage, lint,
format, build, Prisma, arquitetura, segredos e política de CI local passaram.
**CHANGES REQUIRED — HIGH / REGRESSION (gate de segurança)**: advisory herdado
GHSA-vfj7-8cjw-p6xm na cadeia dev nodemon/chokidar/braces, sem versão corrigida
listada. Audit frontend passou; backend falhou. Sem exceção/downgrade/P9/commit/push.

Evidência transitória: `/private/tmp/traceflow-p86d-20261003/`, `final-*.png`,
`visual-matrix.json`, `data-audit.json`, `http-flow.json`, `http-all-views.json`,
`flow-dom-tables.json`, `filter-http.json`, logs e resultados dos gates.
[Relatório P8.6D](../../deliveries/S2_P8_6D_FINAL_INDICATORS_POLISH_REPORT.md).


## 2026-10-04 — P8.6F final visual consistency sweep

Baseline: `daniel-dev`, HEAD `9d3e9dfb65475a21a7ef063a48c2f6567216b470`, árvore
inicialmente limpa. API real local, Project 2 artificial, 01–30/09/2026 e Sprint A (16).
Registro inicial de F01–F08 criado antes das edições; ciclo de inspeção/correção
adicionou F09–F12. Todos encerrados e reinspecionados.

Filtro: superfície/ações centralizadas em `CollapsibleFilterPanel`/`FilterActions`.
Dez áreas reais e diálogos de histórico/sessões renderizados. Clear ghost no footer,
Filtrar primary só nos formulários manuais. Draft parcial conservou período, URL,
contador e Sprint; Clear, colapso, troca de categoria, Back/Forward e refresh reais
exercitados. Responsável segue ausente em Indicadores; grupo Período só acessível.

ProjectSectionNav: 12 links visíveis, 48px de target, sem scroll em 1440/1280
(client/scroll 1104/1104 e 944/944). Oito tabs analíticas cabem nos dois desktops.
Header inline com até dois badges, Health primeiro; ajuda separada de 44px.
KPIs alinham valores quando título quebra; última linha preenche a seção.

Fluxo: WIP 4 / Throughput 16 em strip; tendência própria; Lead 6 dias / referência 4,5 dias / +33,33%
e Cycle 1 dia sem referência. Diferença vertical 0px entre valores, plots e Ver dados.
CFD 352px, seleção por End até 30/09; Aging independente. Sprint: divisores completos
entre 1 Task adicionada, 0 removidas e 1 saída; gráficos reais de oito buckets e Velocity
com quatro Sprints. Quality: divisores completos entre distribuições equivalentes.
GitHub NO_DATA compacto e limitações deduplicadas; referências de Rastreabilidade
com marker e valores textuais. Tabela mobile rolável por teclado: 951px em 320px,
End até 630,5px, ArrowRight até 18,5px; nomes longos mantidos.

Sete larguras: 1440/1280/1024/768/430/390/360; amostras Light/Dark obrigatórias em
1440/768/390. Todas as categorias capturadas em 1440/1280/1024/430, inspeção direta
amostral dos breakpoints e das primitives. Sidebar expandida/recolhida e drawer.
Tooltip mobile, Escape/foco, filtro inválido em 360px e tabela de dados do gráfico.
Nenhum overflow do documento observado. Overview compacto integrado preservado
conforme a decisão vigente do hardening P8.6C (sem reintroduzir o CTA removido).

Frontend **1.322 PASS**; backend **1.495 PASS**, cinco skips legados. Coverage,
lint, format, build, Prisma, arquitetura, segredos, política/testes de CI local,
dependency/security e diffcheck PASS. Segurança: 0 HIGH/CRITICAL, 0 exceções utilizadas,
sem mudança de política; não equivale a zero achados moderate. Focus/visibility,
loops e stale responses validados por regressão; não se alega novo Alt+Tab nativo.
Console final sem novos warnings/erros; erro temporário de HMR corrigido antes da
reinspeção. Sem certificação WCAG, teste touch físico ou CI hospedada nesta rodada.

**S2 P8.6F FINAL VISUAL CONSISTENCY SWEEP — PASS LOCAL**.
**INDICATORS FINAL STABLE BASELINE**, limitado à evidência local descrita.
Sem commit/push, backend, banco, schema, dependências ou P9.

Evidências transitórias: `/private/tmp/traceflow-p86f-20261004/`, capturas
`before-*`, `final-*`, `proof-flow-desktop.jpg`, matriz, console e logs dos gates.
[Relatório completo P8.6F](../../deliveries/S2_P8_6F_FINAL_VISUAL_CONSISTENCY_SWEEP_REPORT.md).

## 2026-10-04 — P9 Meu painel

Baseline `daniel-dev`, HEAD `ad7d01ce0ae689176b6a64dc06a7044c97f708d9`, árvore limpa.
Chrome autenticado, API real, Project 2 artificial existente. Período 01–30/09/2026,
America/Sao_Paulo, Sprint A (16). P9 adiciona seleção/ordem com persistência própria;
summary, filtros, Health, métricas e presenters canônicos são reutilizados.

Inspeção: padrão com seis widgets, painel com um e 12, editor desktop/mobile,
busca, resultado vazio, categoria, máximo, add/remove/reorder, Save/Cancel/reset.
Padrão restaurado e reload conferido ao encerrar. Editor não abre automaticamente.
Teclado real: foco inicial, reorder até extremidade, Enter no disclosure Ver dados,
Escape/Cancel com retorno de foco e confirmação de reset. Cenários de erro/races
complementados por testes automatizados, sem simular falhas como evidência real.

Achados corrigidos: chart isolado com meia largura, desalinhamento de KPIs,
foco em controle que se tornava disabled, nona tab disputando espaço com ações e
overflow mobile após Save. Layout final usa grupos adjacentes por tamanho semântico
e toolbar contida por grid; ordem DOM acompanha ordem salva. Matriz repetida após
a última correção: 1440/1280/1024/768/430/390/360, sem overflow do documento.
Tabs 1104/1104px e 944/944px em desktop; abaixo disso, scroll interno acessível.

Light/Dark em 1440 e 390, amostras tablet 768 e modo System inspecionados. Editor
com 12 selecionados permanece utilizável em mobile; labels e ações não se cortam.
Tema Escuro restaurado e override de viewport removido ao final.

Dados reais: Progresso 70%, WIP 4, Pass Rate 36,67%, cobertura de implementação
25% com referência 70% e delta −45 p.p.; Health 70/100 e cobertura 81% iguais em
Geral/Meu painel. Cycle com oito dias observados; Burndown/Burnup oito pontos,
Velocity quatro Sprints, Throughput/CFD 30 pontos. CFD conserva 352px; tabela
Burndown mobile aberta por teclado; Tasks atrasadas com nomes longos; PRs abertas
mais antigas NO_DATA compacto; Cycle/CFD PARTIAL sem substituir ausência por zero.

Rede real: preferência 17,93ms/167B; catálogo 14,16ms/51.594B; agregado 12 widgets
46,21ms/36.169B. Aproximadamente 203s sem novos requests analíticos durante
interações que não alteram filtros/dados. Save um PUT + um agregado; reset um
DELETE + um agregado; sem request por widget ou por reorder. HMR durante edição
foi separado da observação. Retorno à view com chart pronto: 131ms incluindo
automação/rede/DOM, não paint isolado. Instrumentação temporária removida.
Focus/visibility sem refetch comprovado por regressão, sem alegar Alt+Tab nativo.
Console final sem warnings/erros.

Backend 1.522 PASS (cinco skips legados), frontend 1.333 PASS. Coverage, lint,
format, build, Prisma, migrations dev/test, arquitetura, segredos, política/testes
de CI local e audit canônico passaram. Zero HIGH/CRITICAL, zero exceções usadas;
nenhuma dependência adicionada. Gates locais não equivalem a CI hospedada.

**S2 P9 PERSONALIZED INDICATORS DASHBOARD — PASS LOCAL**.
Sem commit/push ou P10. Sem certificação WCAG, leitor de tela dedicado ou touch físico.

Evidências transitórias: `/private/tmp/traceflow-p9-20261004/`, `final-*.jpg`,
`editor-*.jpg`, `one-widget-390-light.jpg`, `proof-default-desktop.jpg`, matrizes,
console, métricas HTTP e logs de gates.
[Relatório P9](../../deliveries/S2_P9_PERSONALIZED_INDICATORS_DASHBOARD_REPORT.md).

## 2026-10-04 — P9.1 Toolbar e reorder do Meu painel

Baseline `daniel-dev`, HEAD `88c6ef85c9851ad88fe926e9e9c0014a8ebec407`, árvore limpa.
Node 22.23.3 nos gates. Chrome autenticado, API real, Project 2, período
01–30/09/2026, Sprint A (16). Escopo limitado à apresentação da toolbar e lista
selecionada; sem dependências novas ou mudanças de backend/contrato/dados.

Toolbar inspecionada em 1440/1280/1024/768/430/390/360. Em 1440 e 1280, nove tabs
e ações ficam na mesma linha, sem scroll nas tabs (879/879px e 727/727px).
Targets 48px/44px. Tablet/mobile mantêm scroll interno das tabs e wrap controlado
das ações; nenhum overflow do documento. Dark nas sete larguras; Light em
1440/1280/768/390. Capturas 430/390 repetidas após estabilizar a sidebar.

Nas nove views, Personalizar aparece somente em Meu painel; refresh permanece
disponível e período/Sprint são preservados. Refresh real atualizou a metadata.
Editor padrão em desktop/tablet/mobile, Light/Dark; 12 itens em desktop Light e
mobile Dark. Controles, limite e rodapé rolável utilizáveis. Teclado real na alça
e botões Mover; foco acompanha reorder, trap Tab/Shift+Tab e retorno ao fechar.

Drag nativo mudou WIP da segunda para primeira posição e Progresso da primeira
para quarta. Cancelar/reabrir restaurou a ordem inicial. Drafts visuais descartados;
Save e ausência de requests intermediários comprovados por testes automatizados.
**MEDIUM / DND:** feedback durante o gesto ainda carece de inspeção verificável.
Capturas da ferramenta não conseguiram congelar a linha de destino; confirmação
manual solicitada e ainda pendente. Não se confunde o teste dos atributos CSS com
evidência visual desse estado. Não há bug confirmado nesse item.

Frontend 1.338 PASS; backend 1.522 PASS e cinco skips legados. Coverage, lint,
format, build, Prisma, arquitetura, política/testes locais CI e security PASS.
Zero HIGH/CRITICAL, zero exceções usadas. Console da aba auxiliar sem novos
warnings/erros. Sem certificação WCAG, touch físico ou novo Alt+Tab nativo.

**S2 P9.1 PERSONALIZED DASHBOARD VISUAL POLISH — CHANGES REQUIRED**.
Pendência única: inspeção visual do marcador durante drag. Sem commit/push/P10.
Override removido; aba auxiliar fechada e aba original mantida para verificação.
Evidências transitórias: `/private/tmp/traceflow-p91-20261004/`.
[Relatório P9.1](../../deliveries/S2_P9_1_PERSONALIZED_DASHBOARD_VISUAL_POLISH_REPORT.md).

## 2026-10-04 — P9.1.1 Feedback de salvamento

Baseline: `daniel-dev`, HEAD `74065e6ede9cd82c35739a7787d20987b178e739`, árvore
limpa e diffcheck PASS. Node 22.23.3. Auditoria encontrou `FeedbackRegion` como
primitive canônica inline, sem toast/timing existente. Reutilizada com opção
transitória de 4s, portal fixo no canto inferior direito, tokens semânticos,
`role=status`/`aria-live=polite` e timer cancelado no unmount. Sem dependência nova.

Removido o texto permanente de sucesso. Salvar/restaurar exibem um único feedback;
falha do PUT mantém draft e erro canônico no editor. PUT confirmado seguido de
falha do GET usa aviso de atualização, conservando a preferência e o retry,
sem alerta inline duplicado. Contexto antigo não reaparece em outro Project.

Chrome autenticado, API real, Project 2, Meu painel: ordem alterada e salva,
editor fechado, widgets atualizados, foco devolvido a Personalizar, toast visível
e desaparecimento automático confirmado. Repetido com restauração ao padrão.
1440 Dark/Light e 390 Light/Dark inspecionados. Em desktop, toolbar top 589,09px,
altura 53px e início dos widgets 666,09px antes/durante/depois: deslocamento pelo
feedback **0px**. Em 390px, toast x=16px, largura 358px, direita=374px; dentro da
viewport e sem cobrir Personalizar/refresh. Contraste e ícone seguem a primitive.
Configuração padrão inicial e tema Escuro restaurados; override removido.

86 testes focados PASS, incluindo expiração, cleanup, erro/retry, refresh falho,
restauração e troca de projeto. Falhas de rede foram verificadas em testes, sem
alegar reprodução visual de falha real. Frontend full/coverage **1.356 PASS**;
backend canônico full/coverage **1.549 PASS**, cinco skips legados. Lint/format,
build, arquitetura, segredos, política/testes de CI local e audit canônico PASS.
Audit: zero HIGH/CRITICAL e zero exceções utilizadas. Sandbox inicialmente bloqueou
MySQL/registro npm; gates repetidos com acesso autorizado e aprovados. Diffcheck
PASS; console da inspeção sem warnings/erros novos. CI hospedada não executada.

Evidências: `/private/tmp/traceflow-p911-20261004/`, `save-1440-dark.jpg`,
`restore-1440-light.jpg`, `save-390-light.jpg`, `restore-390-dark.jpg`,
`layout-stability.json`, `browser-evidence.json` e logs/JSON dos gates.

**S2 P9.1.1 SAVE FEEDBACK POLISH — PASS LOCAL**.
Sem alterações em DnD, layout dos widgets, persistência/API/autorização, filtros,
Health ou backend. Sem commit/push/P10. Este aceite é restrito ao feedback de
salvamento; não promove a pendência de inspeção de drag registrada no P9.1.

## 2026-10-04 — P10 revisão final independente (API e banco reais)

Baseline `daniel-dev` @ `279e17fbeadabb1cfbc3885bb49a4fe1cc746c60`, árvore inicialmente
limpa. A inspeção desta rodada utilizou Chrome autenticado, Project 2 artificial,
MySQL de desenvolvimento e servidores QA Node 22 nas portas 5174/3002. Nenhuma
aprovação visual anterior foi reutilizada como evidência do estado final.

Correções visuais comprovadas: Casos de teste e Defeitos receberam o landmark
`main` ausente (dois testes vermelhos antes, verdes depois); estados GitHub brutos
foram traduzidos no grafo/inspector, Task e repositório, sem inferir merge. As telas
foram recarregadas após essas alterações. Não houve redesign nem mudança de Health.

| Largura | Amostra visual real | Tema |
| ---: | --- | --- |
| 1440 | Projects, Overview, Requirements, Sprints, Marcos, Cronograma, Tasks/Kanban, TestCases, Defects, Repository, Traceability, nove views de Indicadores e editor | Dark; Overview, Geral e toast também Light |
| 1280 | Fluxo: séries, listas e tabela | Light |
| 1024 | Fluxo e composição responsiva | Dark |
| 768 | Sprint: Burndown, Burnup e Velocity com histórico real | Light / Dark |
| 430 | Tasks e detalhe com título longo | Light |
| 390 | TestCases/Defects após correção, editor e toast; drawer/foco | Dark; amostra Light de navegação |
| 360 | Indicadores / Requirements | Dark / Light |

Sem overflow horizontal global nas amostras medidas. Tabelas/grafo mantêm rolagem
interna intencional. Sidebar expandida/recolhida e drawer foram exercidos; System
acompanhou o tema do sistema. Zoom nativo Chrome confirmado em **100%, 125%, 150%
e 200%** (1710/1368/1140/855 CSS px, DPR 2/2,5/3/4). A 200%, ações do editor ficaram
entre y=324,95 e 369,95 na viewport de 411 px, acessíveis por teclado; filtros
continuaram utilizáveis. Zoom 100%, tema Escuro e viewport sem override restaurados.

Fluxos reais: navegação a partir de sessão autenticada; Requirement/Task/Sprint;
movimento no Kanban por teclado; sync GitHub run 19 concluída; TestCase → FAIL →
Defect → Task de correção → reteste PASS/VALIDADO; cadeia de 16 entidades do REQ-4;
filtros e categorias de indicadores; personalização/salvamento/reload; exclusão
lógica/404/recuperação do Project 13 artificial e vazio. O projeto foi deixado
restaurado. Fatos artificiais de QA foram preservados no banco de desenvolvimento.

Meu painel: draft, adicionar/remover, reorder por teclado, Cancelar, Salvar,
persistência após reload e toast transitório foram inspecionados. Ordem inicial
restabelecida. O usuário confirmou nesta rodada **“Sim, marcador e reordenação
corretos”** para o gesto de arraste, sem sobreposição; essa confirmação fecha a
pendência visual do marcador registrada no P9.1. Não é uma captura automatizada
do gesto. Touch físico não foi testado; os botões mantêm a alternativa sem drag.

Rede final: **635,09 s ocioso sem novos requests**, e ida/volta entre abas nativas
sem refetch de indicadores/preferência. Não se confunde esse teste com novo Cmd+Tab
entre aplicativos. Console da sessão final: zero warnings/errors. Medições locais,
oracles de dados, limites de escala e gates estão no
[relatório P10](../../deliveries/S2_P10_FINAL_CODE_REVIEW_RELEASE_READINESS_REPORT.md).

Evidências locais em `/private/tmp/traceflow-p10-20261004/`: `native-zoom.json`,
`idle-result.json`, `focus-result.json`, `console-final.json`, `http-observed.jsonl`
e capturas em `visual/`, incluindo `custom-toast-1440-light.png`,
`testcases-390-dark.png`, `defects-390-dark.png`, `flow-1280-light.png`,
`sprint-768-light.png`, `requirements-360-light.png`, `editor-native-200-light.png`,
`traceability-chain-final-dark.png` e `project-restored-1440-dark.png`.

**S2 P10 FINAL CODE REVIEW & RELEASE READINESS — PASS LOCAL.** Backend 1.562 PASS
e cinco skips legados; frontend 1.366 PASS; audit completo zero nos dois pacotes.
Sem certificação WCAG, leitor de tela dedicado, touch físico, cross-browser, CI
remota ou deploy. Risco MEDIUM de escala em Tasks documentado; nenhum HIGH/BLOCKING
remanescente conhecido. Sem commit/push; próxima etapa depende de revisão humana.

## 2026-10-05 — Hotfix: cards de criação nas coleções vazias

Baseline `daniel-dev` @ `e8a8efd1177f3cf45ad9e93fc7ccb5645e2b82f5`, árvore limpa,
Node 22.23.3. Requisitos e Tarefas reutilizam `NewRequirementCard`/`NewTaskCard` e
a grid atual mesmo com zero itens, quando a membership permite criar. VIEWER e
permissão desconhecida recebem somente o estado de consulta. Avisos de filtros
sem resultado permanecem; nenhum card, CSS ou fluxo de criação foi redesenhado.

Chrome autenticado em `localhost:5173`, API real existente: Project 13 possui
zero Requirements/Tasks; Project 2 possui 13 Requirements e 42 Tasks. Um resultado
real foi isolado por busca (`REQ-13` / `TASK-47`); a resposta com exatamente um
registro sem filtro também está coberta nos testes de página. Nenhum dado de
domínio foi criado/alterado para esta inspeção.

| Estado inspecionado nas duas páginas | Viewports | Temas | Resultado |
| --- | --- | --- | --- |
| Coleção vazia real | 1440, 768, 390 | Light / Dark | Um único card de criação no primeiro slot; sem empty alternativo |
| Um resultado real filtrado | 1440 | Light | Card de criação + um card de registro |
| Coleção preenchida real | 1440 | Light | Card de criação + 13 Requirements / 42 Tasks |

Sem overflow horizontal nas amostras: `scrollWidth = innerWidth`. Gap canônico
20px; card vazio com 185,5px de altura intrínseca e grid responsiva original.
Abrir/fechar os dois dialogs de criação funcionou sem salvar. Uma captura mobile
feita durante a transição da sidebar foi descartada e refeita após estabilização.
Console final sem warnings/errors; tema Escuro e viewport original restaurados.

26 testes focados PASS, com oito novos casos (zero/um item e VIEWER/permissão
desconhecida nas duas páginas); seis falharam antes da correção. Frontend full e
coverage: **1.374 PASS / 112 arquivos**, lint, format e build PASS. Coverage:
85,77% statements / 80,29% branches / 81,57% functions / 88,24% lines. Backend não
alterado; policy frontend de CONTRIBUTING executada. Diffcheck PASS.

Evidências locais: `/private/tmp/traceflow-empty-cards-20261005/`, capturas
`requirements-empty-{1440,768,390}-{light,dark}.png` e equivalentes `tasks-empty-*`,
`requirements-one-1440-light.png`, `tasks-one-1440-light.png`, `visual-observations.json`,
`focused-before.log`, `focused-after.log`, logs dos gates e `console.json`.
**EMPTY STATE CREATION CARD CONSISTENCY — PASS LOCAL**. Sem commit/push.


## 2026-10-05 — PR23-FIX-01: integridade de Sprint Analytics

Baseline `daniel-dev` @ `62690ecc355e6221050b09f400384600a86e1a67`, árvore inicial
limpa, Node 22.23.3. Sem redesign. Estimativa ausente é desconhecida; subtotal e
cobertura são explícitos. Linha ideal coberta usa baseline integral inicial e dias
nominais; escala contém valores históricos. I43 terminal novo lê saída congelada
no JSON v4, sem depender de memberships vivos.

Chrome autenticado, API real de desenvolvimento (QA 5174/3002), Project 2 artificial,
nenhuma escrita de domínio no desenvolvimento. Desktop **1440×1000 Light/Dark**:

| Superfície / cenário | Verificação pós-correção |
| --- | --- |
| Sprints — summary/cards/evolução da Sprint 15 ativa | Estimativa ausente: `—`, Dados parciais; sem `null pts`, zero fabricado ou “a Sprint ainda não começou” no Burndown |
| Sprints — evolução da Sprint 17 concluída | 28h no encerramento, baseline ideal 24h, escala 28h, curva/legenda legíveis e congeladas |
| Indicadores/Sprint — Sprint 15 | I36 37h parcial/I37 39h parcial; I45/I46 desconhecidos com copy parcial, sem falsa ausência de amostras |
| Indicadores/Sprint — Sprint 17 | Burndown/Burnup de oito buckets, Velocity com três elegíveis e uma exclusão; ideal não cresce para escopo final |
| Carry-over legado | Desconhecimento explícito, sem inventar destino a partir de dados vivos |

Teclado no Burndown agregado: dia 25/08 com restante 24h e ideal 20,6h; escala 28h.
Inspeção DOM sem atributos SVG NaN/Infinity e sem overflow horizontal. Console final
zero warnings/errors. Uma captura escura obtida ainda em loading foi descartada e
refeita após aguardar o conteúdo. Tema Escuro e viewport original restaurados;
servidores de QA encerrados, servidores existentes preservados.

Evidências locais: `/private/tmp/traceflow-pr23-fix01-20261005/`,
`sprint-partial-{light,dark}.jpg`, `sprint-closed-{light,dark}.jpg`,
`indicators-partial-{light,dark}.jpg`, `indicators-closed-{light,dark}.jpg`,
`console-final.json` e `runtime-data.json`. Snapshot v4/carry-over após S→D→E→D
foi comprovado por API/integration no schema isolado, sem reescrever snapshots
legados do projeto de desenvolvimento.

336 testes focados backend e 54 frontend PASS. Full: **1.574 backend PASS**
(cinco skips legados pré-LR.2), **1.386 frontend PASS**; coverage, lint, format,
build, Prisma, architecture, local CI e audits completos PASS. Zero HIGH/CRITICAL.
[Relatório e limites](../../deliveries/PR23_FIX_01_SPRINT_ANALYTICS_INTEGRITY_REPORT.md).
**PR23-FIX-01 SPRINT ANALYTICS INTEGRITY — PASS LOCAL**. Sem commit/push.
Não promove achados de outros clusters da PR23 nem certifica CI remota.
