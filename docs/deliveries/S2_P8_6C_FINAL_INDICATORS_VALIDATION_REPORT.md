# S2 P8.6C — Final Indicators Experience Validation

> Legacy label: S2 P8.6C. Canonical phase: **IND-P8.6C-1**.
> Fase interna de indicadores vinculada a S2-04/S2-05; não é o cartão S2-08.
> [Mapeamento canônico](../../TRACEFLOW_ROADMAP_INCREMENTAL.md#fases-internas-de-indicadores-ind).
> Rodadas distintas: [outro registro P8.6C](S2_P8_6C_INDICATORS_VISUAL_DATA_HARDENING_REPORT.md). IND-P8.6C-1 registra a validação inicial; IND-P8.6C-2 registra o hardening posterior.

## 1. Baseline

Auditoria independente realizada em 28/09/2026, horário America/Sao_Paulo, após os relatórios P8.6A e P8.6B registrarem PASS LOCAL.

- Branch: `daniel-dev`.
- HEAD: `19596bd329142b99c6139e72c67ebbf973e7b9d7`.
- Working tree inicialmente suja com as alterações da P8.6B, preservadas. Inventário e diff inicial em `baseline-status.txt` e `baseline.diff` na pasta de evidências.
- Node do shell: 26.9.0. Todos os gates executados com **22.23.3** (`/opt/homebrew/opt/node@22/bin`).
- `git diff --check`: sem erros antes e depois das mudanças.
- Sem commit, push, migration, alteração de schema ou feature nova.
- Frontend 5173, API real 3001, Chrome autenticado, projeto **2 / TraceFlow**. Descrição confirma projeto artificial de homologação. Banco `localhost:3306/traceflow`, `NODE_ENV=development`; testes de integração usam `traceflow_test`.

Mudanças próprias desta rodada: remoção da exceção tipográfica do h1 em `IndicatorsScreen.css`, regressão da corrida entre duas Sprints em `DashboardPanel.test.jsx` e documentação. As demais alterações pertenciam ao baseline.

## 2. Sources

Fontes canônicas consultadas: `DESIGN_SYSTEM.md`, `UI_SURFACE_INVENTORY.md`, `VISUAL_VALIDATION_LOG.md`, `S2_INDICATOR_CATALOG.md`, `PROJECT_HEALTH_MODEL_V1.md`, `API_CONTRACTS.md` e relatórios P8.6A/P8.6B. Hashes das fontes no arquivo `sources.json`.

Comparação adicional com componentes e páginas renderizadas de Casos de teste, Defeitos e Rastreabilidade. Os resultados anteriores serviram para localizar contratos, não como evidência de aprovação desta auditoria.

## 3. Overview

Health está dentro da região/container Visão geral, abaixo de Projeto/GitHub/Equipe no desktop. Coração discreto, score, status, barra, principal área de atenção, cobertura e CTA presentes. Sem dimensões, drivers ou gráficos analíticos externos.

Mobile usa o disclosure de contexto existente. A Saúde permanece visível e compacta. CTA acionado no navegador abriu `/projects/2/indicators`, mantendo o projeto correto. Amostras finais nas sete larguras e Light/Dark previstos.

## 4. Indicators page

**Defeito encontrado e corrigido (MEDIUM):** h1 de Indicadores tinha limite exclusivo de 40px; páginas maduras apresentavam 48px no mesmo viewport. Causa: regra `.indicators-screen__header h1` com `clamp` próprio. Removida para herdar o estilo canônico. Nova leitura computada confirmou 48px desktop; 32px mobile, conforme regra global.

Eyebrow, descrição, ProjectSectionNav e estrutura de página pertencem ao padrão da aplicação. O ciclo comparação → causa → correção → nova renderização foi executado.

## 5. Summary consistency

`IndicatorsSummary` importa `SummaryPanel` compartilhado. Comparação renderizada: Inter, título de Summary 18px/700, eyebrow 12px/800, letter spacing 1,44px. Grid, divisores e hierarquia usam a mesma primitive das páginas maduras. Metadados permanecem no footer, sem faixa externa.

A altura varia legitimamente conforme cinco métricas, detalhes de estado e footer; não foi imposta altura artificial idêntica a summaries com conteúdo diferente.

## 6. Filters

`CollapsibleFilterPanel` e `SelectControl` canônicos. Somente datas do Período e Sprint; Responsável ausente. Aplicação automática e Limpar filtros. Disclosure aberto/fechado com teclado e mouse, foco visível.

Contexto preservado nas trocas entre as oito categorias, registrado nas URLs da matriz inicial. Exercitados 30 dias (30/08–28/09), 7 dias (22–28/09), intervalo fechado customizado (22–27/09), Sprint A/16, B/17 e atual/15. Alterações mudam métricas compatíveis e a janela de Health; estados atuais continuam atuais por contrato.

## 7. Warnings

Compatibilidade concentrada no filtro. Limitações históricas neutras, mensagens compartilhadas no header da seção quando aplicável. PRs e Issues não repetem o mesmo histórico em todos os widgets. Estados específicos continuam explicados em seu indicador. Não foi observada predominância de avisos amarelos nas amostras inspecionadas.

## 8. Health

Backend permanece autoridade. Sem botão separado de atualização de Health. Overview sem filtros: aproximadamente 70/100, ATTENTION, cobertura 76,75%. Contexto de 7 dias/Sprint encerrada: 63,57, cobertura 92,06%; essa diferença é esperada pelo recorte.

Janela fechada: Lead Time HEALTHY (7,5 dias versus referência 10), Cycle Time CRITICAL (5 versus 1, +400%). ATTENTION foi observado no projeto e UNASSESSED em dimensões sem base elegível. Testes unitários de Health cobrem limiares, cobertura, ausência de base, pesos e classificação, sem alterar o modelo. Não se afirma que o projeto inteiro tenha transitado pelos quatro estados no banco de desenvolvimento.

## 9. References

Markers de cobertura presentes com texto acessível no progressbar. Exemplo: implementação 25%, referência progresso do projeto 70%, delta −45 p.p. Referências de Flow vêm de `assessment.reference`; a UI mostrou 10 dias e 1 dia e as respectivas linhas tracejadas. Nenhuma referência foi chamada de meta ou recalculada pelo frontend.

## 10. General

Saúde consolidada, drivers resumidos, Panorama e Sprint em foco renderizados. Summary não substitui o Health detalhado dessa categoria. Sprint A disponibilizou duas curvas reais com oito pontos. Sem Funnel I68.

## 11. Planning

40 Tasks, 1 sem responsável, 1 sem estimativa, 163h estimadas, 117,03h realizadas conhecidas e −0,97h de desvio comparável. Limitações de esforço ausente preservadas. Tabela de atrasadas e acima da estimativa examinada com nomes longos.

## 12. GitHub

Atividade, commits, PRs, Issues, merge time, PR aging e indicadores sem histórico respeitam os estados disponíveis. Sem PR aberta: empty state compacto. Limitações de lifecycle não viram zero inventado.

Sync real desta rodada: execução **18**, SUCCEEDED, início `2026-09-29T00:34:06.253Z`, fim `00:34:12.758Z`. Commits persistidos totalizaram 416 (baseline P8.6B: 410); PRs 21 e Issues 0. Nenhum artefato externo foi criado. Capturas iniciais antecedem o sync; capturas `final-*` são posteriores.

## 13. Flow

Lead/Cycle Time, Throughput, WIP, Aging WIP e CFD renderizados. Janela inicial de 30 dias e janela final de seis dias, com lacunas honestas. CFD: SVG 352px; outros charts: 288px no desktop. Aging WIP mantém região de lista orientada pelo conteúdo, com rolagem própria quando necessária.

## 14. Sprint

Sprint A: planejado 20h, atual 24h, entregue 20h, cinco Tasks planejadas e cinco entregues; adição de uma Task e carry-over de saída. Sprint B possui outra curva real de oito dias. Sprint atual mantém dados parciais, sem reconstruir esforço desconhecido.

Burndown A: oito linhas de tabela, trabalho restante 20h no primeiro bucket e 4h no último; linha ideal 24h até 0h. Burnup: escopo e concluído distintos. Velocity: quatro Sprints elegíveis, gráfico de barras. Estados de uma Sprint são cobertos pela regressão automatizada da apresentação compacta.

## 15. Tasks

Totais/estados, atrasadas, ausência de responsável/estimativa, estimate/actual/delta e acima/abaixo examinados. 8 A Fazer, 4 Em andamento, 28 Concluídas. Ranking abaixo da estimativa informa 10 de 11; não aparenta lista completa. Títulos longos quebram linha; colunas excedentes ficam em região horizontal acessível.

## 16. Quality

Distribuições de execução, estado atual dos TestCases, defeitos por estado/severidade, retestes e concentração renderizadas. Recorte fechado: 3 PASS, 2 FAIL, 3 BLOCKED; pass rate 37,5%. Reteste: percentual 25% separado das contagens 1 aprovado, 1 falhou, 2 bloqueados. Contagem 1 não é exibida como 1%.

Estado atual: 14 TestCases ativos, 4 PASS, 1 FAIL, 2 BLOCKED, 7 nunca executados na versão atual. O Summary da página Casos de teste tem outro contrato de população/histórico; não foi usado como substituto do cálculo de I52.

## 17. Traceability

I61–I67 presentes; I68 ausente. Valores observados: 91,67%; 58,33%; 75%; 25%; 16,67%; 25%; 40,83%. Variação real entre requisitos. Referências são legíveis textual e visualmente, com estado além de cor.

## 18. Charts

Título, descrição, legenda, seleção de ponto e tabela disponíveis nas séries elegíveis. Cycle Time explorado por ArrowRight; ponto e tabela corresponderam. Tabela de Burndown aberta por Enter e oito valores conferidos. Séries esparsas preservam null, com primeira amostra válida como seleção inicial.

Acessibilidade das curvas combina legenda textual, padrões/tracejado e tabela; não depende apenas da cor. Não foi adicionada série sem fatos persistidos.

## 19. Tables

Headers, captions e regiões focáveis examinados. Aging WIP em 390px: largura da região 323px, conteúdo 438px; ArrowRight avançou `scrollLeft` para 40px. Todas as colunas permanecem disponíveis por rolagem e texto da tabela. Rankings extensos limitados à altura canônica; conteúdo não foi eliminado.

## 20. Tooltips

**83 aberturas/fechamentos por teclado** nas oito categorias, viewport 390px. Nenhum match para metricId, definitionVersion, reasonCode, healthModelVersion, RF numérico ou TaskMovement. Nenhum diálogo ultrapassou os limites do viewport. Escape restaurou o foco ao botão disparador. Alvos medidos de 44×44px, desenho discreto.

Evidência: `tooltip-audit.json`, `tooltip-mobile.png`. O conteúdo responde descrição, valor, referência quando aplicável e interpretação.

## 21. Empty states

Fila de PR vazia compacta. Sprint atual: Burndown/Burnup de um ponto mostraram resumo textual, sem SVG ou tabela redundante. Burnup com esforço desconhecido preservou “—”. Testes cobrem NO_DATA, PARTIAL, UNAVAILABLE, erro/retry e Velocity de uma Sprint. Não foram provocadas falhas de rede artificiais na sessão autenticada do usuário.

## 22. Responsive

Matriz final: nove superfícies × sete larguras Light, mais nove × três larguras Dark = **90 capturas**. Larguras 1440, 1280, 1024, 768, 430, 390, 360. Nenhum overflow horizontal do documento nas medições. Sidebar expandida/recolhida e drawer mobile exercitados.

**Zoom nativo pendente:** 125%, 150% e 200% não receberam evidência confiável. O Chrome encerrou inesperadamente nas tentativas por teclado; houve restauração de sessão. A tentativa pelo menu também não forneceu percentual verificável. Redimensionamento de viewport não foi contado como zoom. Esse requisito bloqueia a baseline final.

## 23. Light/Dark

1440, 768 e 390 nas duas aparências; sete larguras em Light. Capturas finais após a correção CSS. Inspeção direta amostral das imagens integrais, complementada por viewport e DOM; a existência de 90 arquivos não significa revisão humana de cada pixel.

## 24. Accessibility

Landmarks, h1/h2, labels, nomes, skip target, filtros, foco, tooltip, tabelas e charts revisados. Referências e estados possuem texto. Drawer abre com nome e botão de fechamento; tooltip devolve foco. Sem avaliação com leitor de tela físico.

Contraste computado em amostra de 84 textos de Rastreabilidade por tema, considerando backgrounds ancestrais: mínimo 5,67:1 Light e 7,01:1 Dark. Não é certificação integral de acessibilidade. Zoom permanece pendente, portanto a aprovação acessível global é parcial.

## 25. Data correctness

Comparação independente por leitura Prisma, seguida do serviço agregado e da UI real:

| Indicador | Fato/cálculo independente | Resultado agregado |
| --- | --- | --- |
| I26 | contagem de Tasks | 40 |
| I29 | responsável nulo | 1 |
| I31 | soma estimativas conhecidas | 163h |
| I20 | mediana criação → primeira conclusão elegível | 7,5 dias |
| I21 | mediana primeiro andamento → primeira conclusão | 5 dias |
| I38 | soma pointsAtClose dos concluídos na Sprint A | 20h |
| I45/I46 | buckets da Sprint A | 8 / 8 |
| I49 | PASS / execuções no período | 37,5% |
| I61 | requisitos com Task / requisitos | 91,67% |
| I63 | requisitos com TestCase não excluído / requisitos | 75% |

Todos os asserts passaram. A primeira execução do script usou equivocadamente I39 para esforço; corrigido para I38 conforme catálogo, sem alteração do produto. Evidências `facts.json` e DTOs `final-*.json`/`sprint-*.json`.

Hash dos SprintTask originais 1 e 16 preservado: `d808541a6e6749df063b5743c2afdc7a683d4faa243f07338e95be87b5b3a304`. Não houve seed ou alteração dos fatos de domínio nesta rodada, exceto persistência do sync GitHub solicitado pela auditoria.

## 26. Async

Regressões executadas para visão lenta versus nova visão, período antigo versus novo e projeto antigo versus novo, inclusive transporte que ignora abort. Adicionado teste específico Sprint A lenta → Sprint B rápida → resposta A tardia. A seleção B e seu valor prevalecem.

Authority usa identidade completa e geração; Summary e Health pertencem à mesma resposta. As corridas foram controladas nos testes, não por interceptação de requests no navegador autenticado.

## 27. GitHub sync

Sync iniciado pela ação normal da Overview; navegação para Indicadores durante o fluxo. Estado final SUCCEEDED confirmado na persistência. Summary passou de GitHub atualizado em 25/09 para 28/09 às 21:34; Health continuou junto do agregado, sem refresh separado. Código/testes de observação de execução ativa e invalidação por foco revisados. Não houve escrita externa no GitHub.

## 28. Network/performance

Medição local do `dashboardService.read`, após warm-up, três amostras por view:

| View | Mediana (ms) | Payload (bytes) | Operações lógicas Prisma |
| --- | ---: | ---: | ---: |
| GENERAL | 8,61 | 26612 | 34 |
| PLANNING | 7,71 | 27984 | 38 |
| GITHUB | 9,17 | 33713 | 47 |
| FLOW | 7,62 | 26739 | 38 |
| SPRINT | 6,10 | 32695 | 34 |
| TASK | 6,83 | 32250 | 38 |
| QUALITY | 9,54 | 33618 | 54 |
| TRACEABILITY | 6,09 | 25106 | 34 |

Operações lógicas não equivalem a round trips SQL. Não foi identificado loop por Task na composição; testes verificam consulta agregada por view e catálogo único. O probe de sync só agenda polling enquanto há execução ativa. Não há request por widget no código da página.

**Limite:** não foi concluída captura da timeline HTTP nem medição de duração do render no navegador. As ações observadas responderam sem freeze perceptível da aplicação, mas o encerramento do Chrome impede concluir estabilidade do ambiente. Os números acima excluem autenticação, transporte HTTP e render e não são benchmark de produção. Essa lacuna permanece aberta.

## 29. Console

Leituras de warn/error do navegador antes e depois das interações retornaram lista vazia; evidência final `console-final.json`. Nenhum novo React/key/update-depth/ResizeObserver/chart error foi observado. Encerramentos do processo Chrome durante o zoom são registrados separadamente; sua causa não foi atribuída ao frontend sem diagnóstico.

## 30. Full regression

| Gate (Node 22.23.3) | Resultado novo |
| --- | --- |
| Frontend test | PASS — 1280 testes, 104 arquivos |
| Frontend coverage | PASS — 84,05% statements; 78,37% branches; 79,69% functions; 86,45% lines |
| Frontend lint / format:check / build | PASS |
| Backend unit | PASS — 849 testes |
| Backend integration/API | PASS — 610 testes; 5 skips preexistentes |
| Backend coverage | PASS — 1459 testes; 91,81% statements; 84,44% branches; 95,28% functions; 94,27% lines |
| Backend lint / format:check | PASS |
| Prisma validate / generate | PASS |
| Architecture / secrets | PASS |
| CI format / CI policy tests / validateRepositoryCi() | PASS |
| npm audit backend/frontend | PASS — nenhuma ocorrência high/critical, nenhuma exceção usada |
| git diff --check | PASS |

Skips permanecem nos testes legados `e6-backfill` e `e11-legacy-responsibility`; não foram introduzidos para obter aprovação. Frontend completo repetido após a correção final de CSS. Não houve mudança backend própria da P8.6C após seus gates.

## 31. Visual evidence

Pasta local transitória: `/private/tmp/traceflow-p86c-evidence/`.

- `final-visual-matrix.json`: 90 medições/capturas finais, sem overflow do documento.
- `final-{categoria}-{largura}-{tema}.png`: estado pós-correção.
- `comparison-*.png`: páginas maduras; `flow-reference-final.png`, `flow-keyboard-table.png`, `sprint-current-compact.png`, `mobile-table-keyboard.png`.
- `tooltip-audit.json`: 83 diálogos.
- `contrast-results.json`: amostra computada; `facts.json`, `validation.json`, `final-performance.json` e DTOs.
- Logs individuais dos gates, baseline, manifesto SHA256 e console.

Capturas full-page podem posicionar elementos fixed no offset de scroll da captura. Isso foi distinguido do layout real usando viewport/DOM. Screenshots selecionados foram abertos e inspecionados visualmente; não se usa só teste/medição estática para aprovar aparência.

### Matriz por superfície

P = aprovado no recorte/amostra descrito; A = parcial; N/A = não aplicável. Data significa amostragem independente mais contratos/regressões, não prova exaustiva de todo registro. Accessibility parcial inclui a pendência de zoom; Performance parcial inclui HTTP/render.

| Superfície | Design | Layout | Data | Health | Filters | Charts | Tables | Tooltips | Data states | Responsive | Accessibility | Performance | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Visão Geral | P | P | P | P | N/A | N/A | N/A | N/A | P | A | A | A | CHANGES REQUIRED |
| Indicadores / Geral | P | P | P | P | P | P | P | P | P | A | A | A | CHANGES REQUIRED |
| Indicadores / Planejamento | P | P | P | P | P | N/A | P | P | P | A | A | A | CHANGES REQUIRED |
| Indicadores / GitHub | P | P | P | P | P | N/A | P | P | P | A | A | A | CHANGES REQUIRED |
| Indicadores / Fluxo | P | P | P | P | P | P | P | P | P | A | A | A | CHANGES REQUIRED |
| Indicadores / Sprint | P | P | P | P | P | P | P | P | P | A | A | A | CHANGES REQUIRED |
| Indicadores / Tarefas | P | P | P | P | P | N/A | P | P | P | A | A | A | CHANGES REQUIRED |
| Indicadores / Qualidade | P | P | P | P | P | N/A | P | P | P | A | A | A | CHANGES REQUIRED |
| Indicadores / Rastreabilidade | P | P | P | P | P | N/A | N/A | P | P | A | A | A | CHANGES REQUIRED |

Charts N/A significa ausência de série histórica nessa categoria; distribuições/barras de progresso foram inspecionadas. Responsive aprovado nas larguras, parcial no conjunto por faltar zoom.

## 32. Remaining limitations

| Severidade | Item | Situação e ação necessária |
| --- | --- | --- |
| BLOCKING | Evidência final incompleta | Não promover a versão a INDICATORS STABLE BASELINE enquanto os itens abaixo permanecerem abertos. |
| HIGH | Zoom 125/150/200% | Completar em sessão Chrome estável, confirmar percentual real e inspecionar conteúdo/foco/tabelas/charts; viewport emulado não substitui zoom. |
| MEDIUM | HTTP/render e timeline de rede | Registrar duração fim a fim e atividade de rede com dataset enriquecido, sem extrair credenciais; fechar a evidência de ausência de loops/polling inesperado. |
| MEDIUM — corrigido | H1 divergente | Regra exclusiva removida, estilo computado e capturas pós-correção conferidos. |
| LOW | Evidência transitória e amostral | Arquivos estão em /private/tmp; arquivar os selecionados antes de limpeza do ambiente. Sem certificação por leitor de tela/dispositivo físico. |

Histórico anterior à captura e esforço desconhecido continuam limitações canônicas do domínio; não foram fabricados dados para removê-las. Nenhuma outra regressão funcional relevante foi confirmada nesta amostra.

## 33. Final verdict

**S2 P8.6 FINAL INDICATORS EXPERIENCE — CHANGES REQUIRED**

Gates automatizados aprovados, comparação de dados e inspeção real realizadas, defeito tipográfico corrigido. A definição de pronto integral ainda não foi satisfeita por faltar evidência confiável de zoom nativo e HTTP/render. Não declarar INDICATORS STABLE BASELINE e não iniciar P9.

Sem commit/push. Sugestão após conclusão: `refactor: consolidate project indicators experience`.
