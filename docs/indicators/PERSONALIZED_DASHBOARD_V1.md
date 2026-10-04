# Painel pessoal de indicadores — v1

## Escopo e autoridade

P9 acrescenta **Meu painel** em /projects/:projectId/indicators?view=custom. As oito
views canônicas continuam disponíveis. Personalização altera somente seleção e
ordem de indicadores aprovados. Sem fórmula, Health customizado, metas, resize,
layout compartilhado ou drag-and-drop. Ordenação usa controles acessíveis.

Catálogo executável: backend/src/modules/indicators/personalized-dashboard.catalog.js.
O catálogo HTTP acrescenta customization por indicador e personalization com
minWidgets, maxWidgets e defaultPreference. A UI consome essa autoridade; IDs e
razões técnicas não são labels comerciais. Descrições de seleção são curtas.

`category` mantém a classificação analítica original. `customization.categories`
acrescenta os agrupamentos das views canônicas Planejamento/Qualidade quando
aplicáveis. Assim, um indicador de Tasks pode ser encontrado também em Planejamento,
e qualidade de PR também em Qualidade. Isso não altera sua fonte nem sua fórmula.

## Padrão e limites

configurationVersion=1; mínimo 1 e máximo 12 IDs únicos. Padrão:
I01, I23, I49, I66, I21, I28. Combina progresso, WIP, qualidade, implementação,
tendência de Cycle Time e tarefas atrasadas. É uma seleção própria, não uma cópia
independente de Geral. GET sem row e Restaurar padrão usam a mesma função backend.
Sem período, eventos preservam UNAVAILABLE/PERIOD_REQUIRED; não há janela inventada.

## Persistência e autorização

ProjectDashboardPreference: par único projectId/userId, configurationVersion,
configuration JSON com widgets[], createdAt e updatedAt. A posição no array é a
única autoridade de ordem. FK cascade para Project/User; GET não cria row.

Sessão e membership ativa em projeto não excluído são exigidas. VIEWER, MEMBER,
MANAGER e OWNER alteram somente a própria preferência; userId no body é rejeitado.
401 sem sessão; 404 opaco para projeto alheio/excluído. PUT/DELETE exigem CSRF.
Writes revalidam membership/conta na transação após locks Project → membership.
Soft delete conserva a row inacessível durante retenção; restore a recupera;
hard purge a remove por cascade. Anonimização desativa membership antes de remover
as preferências, serializando writes pendentes. Export pessoal inclui apenas as
preferências do ator em projetos acessíveis e ativos.

## Agregado, filtros e Health

CUSTOM exige widgets na query, validados pelo mesmo schema da preferência. Uma
request agrega por source service, sem HTTP interno nem request por widget. Ordem
solicitada é preservada. CUSTOM sempre inclui o Project Health completo e os
assessments/references canônicos; seleção não determina os sinais do modelo.
Apenas o Summary existente mostra Health no Meu painel; o detalhamento fica em Geral.

Período/fuso/Sprint pertencem ao workspace e permanecem na URL entre categorias.
CUSTOM admite até 366 dias como as séries de Flow; cada métrica preserva
filterCompatibility/appliedFilters. WIP é atual, Cycle usa período, Burndown usa
Sprint. A ausência de Sprint não remove o widget; mantém seu estado real.

## Editor, ordem e reset

O SprintDialog canônico recebe catálogo pesquisável e filtro de categoria. A lista
selecionada usa ações Mover para cima/baixo e Remover, com alvos de 44px, nomes
contextuais, anúncio de posição e foco preservado. Primeiro/último bloqueiam a
direção impossível. Busca não é uma consulta HTTP.

Draft separado da configuração confirmada. Salvar fica desabilitado sem mudança,
com menos de 1/mais de 12, ou durante request. Falha mantém draft; sucesso fecha o
editor e atualiza um agregado. Falha do agregado posterior não desfaz nem rotula o
PUT confirmado como falha de salvamento. Troca de projeto/view desmonta o editor e
invalida callbacks antigos. Cancelar/Escape descartam draft e devolvem foco.

Restaurar padrão usa confirmação leve, muda somente draft e continua cancelável.
Salvar após restore executa DELETE e consome o default retornado. Não há autosave,
PUT por reorder ou refetch ao recuperar foco da janela. Preferência é carregada uma
vez por projeto no workspace; catálogo usa o estado em memória já existente.

## Layout

Tamanho semântico controlado pelo catálogo: compact, standard, wide, full.
Somente itens adjacentes do mesmo tamanho se agrupam; não há reordenação CSS dense.
KPIs reutilizam o grid/subgrid da baseline. Detalhes distribuem a largura entre
vizinhos compatíveis; detalhe isolado usa a linha. Listas têm altura de conteúdo e
rolagem canônica. Séries preservam one-point, NO_DATA, PARTIAL, teclado e tabela.
Limitações repetidas são promovidas a uma única nota do painel.

Em Meu painel, as nove tabs ocupam uma linha própria e as ações ficam na linha
seguinte, dentro da largura disponível. Abaixo do desktop, a navegação conserva
rolagem horizontal e teclado; o documento não ganha overflow horizontal.

## Matriz de elegibilidade — 74 fichas

Esta matriz descreve elegibilidade de apresentação, independentemente do papel no
Health. I03/I05 continuam implementados e acessíveis pelos contratos existentes,
mas exigem homologação específica de presenter standalone antes da seleção pessoal.
Nenhum indicador novo foi implementado nesta rodada.

| metricId | Título | Categoria | Elegibilidade | Razão | defaultVisualization | sizeClass | supportedFilters |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I01 | Progresso atual do projeto | GENERAL | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | PROGRESS | compact | — |
| I02 | Commits na main por responsável | GITHUB | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | TABLE | full | period |
| I03 | Tasks concluídas por responsável | TASK | NOT_CUSTOMIZABLE | Presenter por pessoa/vetor ainda não homologado standalone. | TABLE | compact | period |
| I04 | Taxa de retrabalho de PR | GITHUB | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | period |
| I05 | Atividade por responsável | TASK | NOT_CUSTOMIZABLE | Presenter por pessoa/vetor ainda não homologado standalone. | TABLE | compact | period |
| I06 | Qualidade oficial de PR | GITHUB | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | standard | period |
| I07 | Painel consolidado | GENERAL | NOT_CUSTOMIZABLE | Capacidade de composição, sem resultado próprio. | — | — | — |
| I08 | Filtro temporal | GENERAL | NOT_CUSTOMIZABLE | Capacidade global, não um widget. | — | — | — |
| I09 | Commits no período | GITHUB | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | period |
| I10 | PRs abertas agora | GITHUB | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | — |
| I11 | PRs fechadas no período | GITHUB | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | period |
| I12 | PRs mescladas no período | GITHUB | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | period |
| I13 | Issues GitHub abertas agora | GITHUB | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | — |
| I14 | Issues atualmente fechadas no período | GITHUB | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | period |
| I15 | Mediana até merge | GITHUB | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | period |
| I16 | Média até merge | GITHUB | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | period |
| I17 | PRs abertas mais antigas | GITHUB | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | RANKED_LIST | full | — |
| I18 | Mediana até fechamento de Issue | GITHUB | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | period |
| I19 | Aprovações GitHub Review | GITHUB | UNIMPLEMENTED | Reviews não coletadas. | — | — | — |
| I20 | Lead time | FLOW | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | LINE | wide | period |
| I21 | Cycle time | FLOW | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | LINE | wide | period |
| I22 | Throughput | FLOW | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | LINE | wide | period |
| I23 | WIP atual | FLOW | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | — |
| I24 | Aging WIP | FLOW | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | RANKED_LIST | full | — |
| I25 | Cumulative flow | FLOW | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | STACKED_AREA | full | period |
| I26 | Total de Tasks | TASK | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | — |
| I27 | Distribuição por status | TASK | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | STACKED_BAR | standard | — |
| I28 | Tasks atrasadas | TASK | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | RANKED_LIST | full | — |
| I29 | Tasks sem responsável | TASK | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | — |
| I30 | Tasks sem estimativa | TASK | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | — |
| I31 | Estimativa total conhecida | TASK | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | — |
| I32 | Esforço realizado conhecido | TASK | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | — |
| I33 | Desvio de esforço comparável | TASK | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | — |
| I34 | Tasks acima da estimativa | TASK | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | RANKED_LIST | full | — |
| I35 | Tasks concluídas abaixo da estimativa | TASK | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | RANKED_LIST | full | — |
| I36 | Pontos planejados | SPRINT | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | sprintId |
| I37 | Pontos atuais | SPRINT | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | sprintId |
| I38 | Pontos entregues | SPRINT | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | sprintId |
| I39 | Tasks planejadas | SPRINT | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | sprintId |
| I40 | Tasks entregues | SPRINT | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | sprintId |
| I41 | Escopo adicionado | SPRINT | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | RANKED_LIST | full | sprintId |
| I42 | Escopo removido | SPRINT | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | RANKED_LIST | full | sprintId |
| I43 | Carry-over | SPRINT | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | RANKED_LIST | full | sprintId |
| I44 | Estimado × realizado | SPRINT | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | standard | sprintId |
| I45 | Burndown | SPRINT | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | LINE | wide | sprintId |
| I46 | Burnup | SPRINT | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | LINE | wide | sprintId |
| I47 | Velocity | SPRINT | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | BAR | wide | — |
| I48 | Execuções por resultado | QUALITY | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | STACKED_BAR | standard | period |
| I49 | Pass rate | QUALITY | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | period |
| I50 | Fail rate | QUALITY | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | period |
| I51 | Blocked rate | QUALITY | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | period |
| I52 | Saúde atual dos TestCases | QUALITY | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | STACKED_BAR | standard | — |
| I53 | Defeitos por estado | QUALITY | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | STACKED_BAR | standard | — |
| I54 | Defeitos por severidade | QUALITY | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | STACKED_BAR | standard | — |
| I55 | Defeitos criados | QUALITY | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | period |
| I56 | Defeitos validados | QUALITY | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | period |
| I57 | Tempo de correção | QUALITY | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | period |
| I58 | Sucesso de reteste | QUALITY | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | standard | period |
| I59 | Concentração por Requirement | QUALITY | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | RANKED_LIST | full | — |
| I60 | Concentração por Task de origem | QUALITY | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | RANKED_LIST | full | — |
| I61 | Requirements com Tasks | TRACEABILITY | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | — |
| I62 | Requirements com evidência técnica | TRACEABILITY | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | — |
| I63 | Requirements com TestCase | TRACEABILITY | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | — |
| I64 | Requirements com Defect ativo | TRACEABILITY | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | — |
| I65 | Requirements validados | TRACEABILITY | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | — |
| I66 | Cobertura de implementação | TRACEABILITY | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | — |
| I67 | Progresso médio por Requirement | TRACEABILITY | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | — |
| I68 | Funil cumulativo | TRACEABILITY | NOT_RECOMMENDED | Dimensões não são subconjuntos sucessivos. | — | — | — |
| I69 | Marcos próximos do prazo | PLANNING | UNIMPLEMENTED | Sem service/presenter aprovado. | — | — | — |
| I70 | Marcos vencidos | PLANNING | UNIMPLEMENTED | Sem service/presenter aprovado. | — | — | — |
| I71 | Sprint com mudança de escopo | SPRINT | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | standard | sprintId |
| I72 | Carry-over atual | SPRINT | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | full | sprintId |
| I73 | Idade média das PRs abertas | GITHUB | CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | — |
| I74 | Tempo médio até fechamento de Issue | GITHUB | CONTEXT_ONLY_BUT_CUSTOMIZABLE | Presenter standalone existente; estados preservados. | KPI | compact | period |
