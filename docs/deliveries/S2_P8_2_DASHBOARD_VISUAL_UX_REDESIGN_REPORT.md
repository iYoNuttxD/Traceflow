# S2 P8.2 — Dashboard visual e UX

> Legacy label: S2 P8.2. Canonical phase: **IND-P8.2**.
> Fase interna de indicadores vinculada a S2-04/S2-05; não é o cartão S2-08.
> [Mapeamento canônico](../../TRACEFLOW_ROADMAP_INCREMENTAL.md#fases-internas-de-indicadores-ind).

**Resultado local:** S2 P8.2 DASHBOARD VISUAL & UX REDESIGN — **PASS LOCAL**. Redesign renderizado
com API real nas sete visões, em Light/Dark e 1440/1280/768/390 px; gates locais aprovados. Esta
declaração cobre a rodada P8.2 no checkout atual, sem equivaler a CI remoto, certificação WCAG ou
validação em outro navegador.

## 1. Baseline

Branch `daniel-dev`, HEAD inicial `1982633a64b017945cb151914b7ac7e80f9391c4`, worktree
limpo, `git diff --check` limpo. Node padrão v26.9.0; gates executados com Node v22.23.3.
Frontend e backend já tinham dependências instaladas. O gráfico era SVG nativo, lazy loaded; esta
rodada não adiciona pacote, migration nem alteração de API.

## 2. Motivo do P8.2

P8.1 havia homologado API real, valores, sync e sete visões. A inspeção P8.2 mostrou que a
apresentação ainda tratava quase todo indicador como card grande, expondo metadados técnicos,
repetindo estados/horários e desperdiçando altura. A entrega aqui é exclusivamente de apresentação.

## 3. Auditoria do layout anterior

| Categoria | Evidência antes da edição |
| --- | --- |
| HIERARCHY | Seis cards independentes no Panorama, sem superfície de seção. |
| DENSITY | WIP `2` tão alto quanto a lista de três Tasks atrasadas. |
| SPACING | Grade de três colunas criava espaço morto e Burndown de um ponto era grande. |
| CONSISTENCY | KPI, lista, distribuição e chart partilhavam o mesmo shell alto. |
| TRANSLATION | Chaves de associação e “Defects” podiam chegar à UI; I58 herdava `%` nas contagens. |
| DATA_STATE | “Disponível” repetido; limitações e frescor locais duplicados em cards. |
| CHART | Um ponto desenhava eixo com a mesma data nos dois extremos. |
| INTERACTION | Hover sem instrução nem marcador persistente; tabela discreta. |
| FILTER | Painel sempre aberto e fuso exposto no cabeçalho. |
| HELP | ID/fonte/fórmula técnica apareciam na primeira camada. |
| RESPONSIVE | Cards empilhavam corretamente, mas a altura excessiva persistia no mobile. |
| ACCESSIBILITY | Ajuda e tabela tinham semântica nativa, porém a exploração do gráfico era pouco descoberta. |

## 4. Princípios adotados

O tipo do conteúdo determina seu tamanho. A seção é a superfície principal; tiles, listas e
gráficos são divisões internas. Disponibilidade não é juízo de saúde do projeto. A API P7 segue
autoritativa para valor, estado, filtro, limitação e frescor.

## 5. Referência: box Project Overview

Panorama, Histórico e demais seções usam container, cabeçalho e divisões como a box
Projeto/GitHub/Equipe. A borda pertence à seção; widgets não têm sombras e raios independentes.

## 6. Toolbar

As sete tabs, Filtros e refresh compartilham a mesma linha. Refresh virou controle compacto de
44 px com `aria-label` e `title` “Atualizar indicadores”, disabled durante carga e animação
desligada por preferência de movimento reduzido. Continua lendo somente o agregado; “Sincronizar”
permanece no header do Project e mantém o fluxo GitHub.

## 7. Filtros

O formulário inicia recolhido. O botão mostra a quantidade de recortes; ao fechar, o período,
Sprint e responsável aplicados aparecem em resumo. Período sem suporte executável na visão não
mostra campos de data; o painel explica o motivo. O fuso vem da policy existente e só integra a
query quando há período. Aplicar/Limpar mantêm URL, Back/Forward e contrato P7. Limpar também
descarta valores ainda em rascunho.

## 8. Seções

O layout separa métricas compactas de conteúdo detalhado dentro da mesma seção. Task ganhou
Estado do trabalho, Esforço e Atenção; Planning da Sprint ganhou Plano e entrega e Escopo e
esforço. É apenas reagrupamento dos IDs recebidos, sem consulta ou cálculo extra.

## 9. Taxonomia de widgets

`kpi-compact` e `kpi-progress` usam tiles curtos; `distribution` usa linhas semânticas;
`ranked-list` segue o conteúdo; `time-series` recebe espaço analítico ou resumo de um ponto.
NO_DATA/UNAVAILABLE usam corpo textual compacto. A distinção é frontend e não muda o catálogo.

## 10. General

Panorama reúne os quatro KPIs/progressos e os blocos de Tasks atrasadas/Defeitos por estado.
Sprint em foco exibe o Burndown P7; com um ponto, a própria seção fica estreita. A estrutura aceita
uma seção futura acima de Panorama, sem placeholder visível nem health calculado.

## 11. GitHub

Atividade técnica usa KPI e distribuição lado a lado no desktop. Pull Requests e Issues preservam
seções distintas. A limitação comum do histórico de PR fica no cabeçalho da seção. Sem PR aberta,
a lista diz “Nenhuma PR aberta no momento.”. O horário de GitHub aparece na visão, sem rodapé
idêntico por tile.

## 12. Flow

Lead/Cycle/Throughput/WIP ficam compactos. I25 continua gráfico analítico largo, com Aging WIP
dimensionado pelo conteúdo. I22/I25 preservam exatamente os pontos/lacunas do backend.

## 13. Sprint

Plano, escopo/esforço, histórico e mudanças de escopo são superfícies separadas. I45/I46 com um
ponto mostram data e valores reais; I47 com uma Sprint mostra nome e horas concluídas. Duas ou mais
observações continuam SVG.

## 14. Tasks

Estado, esforço e atenção deixam Total/sem responsável/sem estimativa em tiles; comparações e
Tasks atrasadas usam listas. O navegador não refaz soma de esforço.

## 15. Quality

Pull Requests, Testes, Defeitos e Concentração conservam os IDs do agregado. I58 mostra percentual
principal e quantidades `PASS/FAIL/BLOCKED` sem sufixo de percentual. Concentração apresenta
“defeito/defeitos” conforme contagem e explica que requisitos podem compartilhar o mesmo defeito.

## 16. Traceability

As sete dimensões permanecem independentes dentro de um container. Um filtro não aplicado em toda
a seção é informado uma vez, sem sete ícones repetidos. Não existe funil I68.

## 17. Estados de dados

`AVAILABLE` não gera badge. `PARTIAL`, `STALE`, `NO_DATA`, `UNAVAILABLE` e estado desconhecido
mantêm texto explícito; valor parcial/stale continua visível quando recebido. Null não vira zero.
Não há inferência de HEALTHY/ATTENTION/CRITICAL.

## 18. Limitações e frescor

Códigos comuns a mais de um indicador vão para a seção; período incompleto vai para a visão. A
ajuda preserva a lista completa por indicador. Montagem e freshness GitHub ficam no contexto da
visão; data da fonte permanece no widget STALE. A compatibilidade de filtro segue visível nos
detalhes técnicos e por marca individual quando há diferença dentro da seção.

## 19. Ajuda

A primeira camada mostra “O que mostra”, “Como é calculado”, “Como interpretar” e limitações em
linguagem de uso. I01/I45/I46/I47/I58 têm cópia semântica específica; os demais cálculos técnicos
do catálogo têm explicação por indicador em português. “Detalhes técnicos” recolhe ID, fórmula
exata, fonte, horários, versão, RF e filtros aplicados.

## 20. Tradução e presenters

`distributionRows` escolhe rótulo e unidade por campo. `associated`, `unassociated`,
`unassignedHistoricalCount`, `unknownCount` e `people` não aparecem como chaves no fluxo comum;
o vetor de pessoas tem linhas próprias. Campos de taxa continuam percentuais; distribuições de
contagem, inclusive I58, usam números inteiros. I25 e I47 têm títulos em português.

## 21. Interação com gráficos

Séries com dois ou mais pontos têm instrução visível, crosshair, marcador do ponto selecionado,
resumo textual, pointer/tap e setas/Home/End. “Tabela de dados” tem alvo de 44 px e valores
originais. A área empilhada mantém legenda e interrompe segmentos em lacunas, sem zero inferido.

## 22. Comportamento de um ponto

I45/I46 exibem data, séries recebidas e aviso de tendência insuficiente. I47 exibe a última Sprint
e valor recebido. Nenhum eixo com datas duplicadas ou barra única gigante é renderizado. A tabela
continua disponível.

## 23. Responsivo

As sete visões carregaram com a API real em 1440/1280/768/390 px nos temas Light e Dark. O
`scrollWidth` do documento igualou a largura do viewport em todos os recortes carregados. Mobile
usa widgets em coluna e toolbar com rolagem horizontal de tabs; filtro fica na linha de ações.

## 24. Acessibilidade

Tabs mantêm `aria-selected` e setas; filtro anuncia expandido/recolhido; refresh tem nome,
tooltip e estado disabled. Ajuda e tabela usam `details` nativo; SVG mantém nome, foco e navegação
por teclado, com resumo textual e tabela alternativa. Alvos aplicáveis usam 44 px. Light/Dark foram
inspecionados; amostras de contraste calculadas no Chrome variaram de 5,76:1 a 18,06:1 em Light e
de 7,26:1 a 17,61:1 em Dark para textos principais/secundários sobre suas superfícies. Isto não
substitui auditoria WCAG integral ou teste em outro navegador.

## 25. Regressão assíncrona

Seleção, filtros, refresh e catálogo preservam geração/cancelamento do P8. Mudança de view/filtro
continua uma consulta agregada; abrir ajuda, tabela ou selecionar ponto não altera identidade da
request. O teste de resposta antiga ainda passa.

## 26. Performance

Nenhum endpoint por widget nem biblioteca nova. `IndicatorChart` continua chunk lazy separado;
o build contém chunk próprio de aproximadamente 6,8 kB. O bundle principal mantém o aviso
preexistente de tamanho de chunks grandes não relacionados ao Dashboard.

## 27. Testes

Frontend focado: 18/18. Frontend completo: 101 arquivos, 1.253 testes; cobertura 83,88% statements,
78,14% branches, 79,30% functions, 86,30% lines. Lint, format check e build passaram no Node 22.
O teste focado cobre toolbar/disclosure/refresh, I58, um ponto, URL/race, estados e gráfico com
lacunas. Prisma validate/generate, architecture check, secret scan, 13 testes da política CI e
audit de backend/frontend (0 high/critical) passaram. A suíte backend completa passou com 120
arquivos e 1.434 testes aprovados; 2 arquivos e 5 testes estavam marcados como ignorados.

## 28. Validação visual

Inspeção antes/depois em Chrome autenticado, Project 2, backend e banco de desenvolvimento reais.
Geral Dark 1710/390; GitHub 1440 com período; Flow 1280 Light; Sprint 768 Light; Quality 390
Light; Traceability 1440/390 Light. A matriz de sete views em 1440/1280/768/390 foi percorrida em
ambos os temas. Valores vistos: I02 93, I09 127, I58 33,33% com 1/1/1, I45 18 h restantes,
I46 22 h de escopo/4 h concluídas. Detalhes no log visual.

## 29. Limitações remanescentes

Histórico GitHub/Planning parcial e filtros não aplicáveis são limitações da fonte/contrato P7.
Sem período, métricas de evento continuam indisponíveis. A primeira execução backend no sandbox
falhou por bloqueio de conexão/porta; a repetição com acesso ao banco de teste passou. Não houve
certificação WCAG, outro navegador nem CI remoto nesta rodada.

## 30. Prontidão para P8.3

O shell de seção e o cabeçalho de widget aceitam futura avaliação de saúde sem refazer as
representações. P8.3 continua separado: nenhum score, threshold, baseline ou julgamento de saúde
foi criado. Sugestão de commit, sem executar: `refactor: redesign project analytics dashboard`.
