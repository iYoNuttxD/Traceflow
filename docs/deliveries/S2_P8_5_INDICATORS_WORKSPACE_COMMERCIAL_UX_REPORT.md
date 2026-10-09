# S2 P8.5 — Indicators Workspace + Commercial Analytics UX

> Legacy label: S2 P8.5. Canonical phase: **IND-P8.5**.
> Fase interna de indicadores vinculada a S2-04/S2-05; não é o cartão S2-08.
> [Mapeamento canônico](../../TRACEFLOW_ROADMAP_INCREMENTAL.md#fases-internas-de-indicadores-ind).

Data: 2026-09-28. Escopo: reorganização da superfície analítica e exposição das referências já existentes.

## 1. Baseline

- Checkout: `/Users/daniel/Coding/Traceflow`; branch `daniel-dev`.
- HEAD inicial: `d6f38da9528b93115aa8a630c103f3b92c08a1ad`.
- Working tree inicial limpo; `diff --check` e `diff --stat` sem alterações.
- Shell: Node 26.9.0. Gates: Node **22.23.3**, com `NODE_OPTIONS=--no-experimental-webstorage` no frontend.
- Nenhum commit, push, merge, rebase, reset, clean ou stash executado.
- Nenhuma alteração de schema, migration ou dependência.

## 2. Motivation

A Visão Geral concentrava contexto executivo e análise detalhada. A separação permite leitura rápida do projeto e mantém filtros, gráficos e interpretação em um destino próprio.

## 3. Sources reviewed

Fontes canônicas consultadas: `CONTRIBUTING.md`, `CODE_REVIEW_STANDARD.md`, `FRONTEND_STRUCTURE.md`, Design System, inventário de superfícies, log visual, catálogo de indicadores, auditoria de prontidão, Health Model v1, contratos de API e matriz RF. Relatórios P7, P8, P8.2, P8.3 e o estado P8.4 foram confrontados com o código atual. Também foram examinados os owners de Overview, ProjectSectionNav, Casos de teste, filtros de Planejamento, abas internas, tabelas, charts e serviços agregados.

## 4. Previous architecture

`ProjectDetailsScreen` carregava `DashboardPanel` na própria Visão Geral. O painel possuía sete categorias, filtro próprio e ajuda com seção técnica. O Health completo estava limitado ao agregado Geral.

## 5. New information architecture

- `/projects/:projectId`: contexto executivo e `ProjectHealthSummary`.
- `/projects/:projectId/indicators`: `IndicatorsPage` → `IndicatorsScreen` → `DashboardPanel`.
- Rota protegida no mesmo layout autenticado; catálogo de projetos autorizado resolve o contexto.
- Os módulos comunicam-se pelos barrels públicos. Charts continuam em importação lazy.

## 6. Overview simplification

Contexto do projeto, repositório, equipe, ações e sincronização foram preservados. O painel detalhado foi substituído pelo resumo de saúde. Não há categorias, filtros, tabelas, dimensões completas ou gráficos analíticos nessa rota.

A inspeção desktop revelou contato entre as duas superfícies e uma barra nativa pouco legível. Foram corrigidos o espaçamento, a aparência da barra e a decoração do CTA.

## 7. Indicators route

Nova rota project-scoped `/projects/:projectId/indicators`, protegida pelo guard autenticado existente. Loading/erro mantêm header e navegação. Projeto ausente do catálogo autorizado não dispara consultas de indicadores. O backend mantém 401 sem sessão e 404 para projeto alheio ou excluído; VIEWER/MEMBER/MANAGER/OWNER ativos podem consultar.

## 8. ProjectSectionNav

Indicadores é o 12º destino, após Rastreabilidade, com URL e estado ativo próprios. Ordenação e rolagem do item ativo seguem o componente canônico. Os testes da navegação anterior foram atualizados para preservar a ordem dos outros destinos.

## 9. Page structure

Eyebrow, título, descrição, navegação de projeto, resumo, filtro recolhível, categorias e conteúdo. Tokens, gutter, tipografia e controles pertencem ao Design System. O container responsivo `indicators-workspace` substitui a dependência do container da antiga Overview.

## 10. Summary

`SummaryPanel` compartilhado é usado em Indicadores e Casos de teste. Exibe cinco tiles: Saúde, Planejamento, Fluxo, Qualidade e Rastreabilidade. Sprint e Integração técnica permanecem no Health completo. Scores ausentes são traço com explicação, sem zero artificial. A cobertura acompanha o mesmo payload.

## 11. Unified filters

Um `CollapsibleFilterPanel` canônico, fechado por padrão, contém De/Até, Sprint e Responsável, Aplicar e Limpar. `SelectControl` é reutilizado. Timezone automático e query string preservados. Rascunho não é perdido ao trocar categoria; filtros aplicados persistem e Back restaura o contexto.

## 12. Filter compatibility

O backend continua publicando `filterCompatibility` e `appliedFilters`. Período sempre está presente no filtro global e também define a janela do Health. Estado atual e histórico da Sprint mantêm suas próprias semânticas.

Responsável aparece desabilitado com explicação porque nenhuma categoria oferece recorte seguro no contrato atual. Uma URL com responsável é preservada e enviada, mas a resposta não afirma aplicação. Nenhum histórico de associação foi reconstruído artificialmente.

## 13. Analytics navigation

Oito categorias: Geral, Planejamento, GitHub, Fluxo, Sprint, Tarefas, Qualidade e Rastreabilidade. Aparência `internal-tabs`, teclado com setas/Home/End e seleção via `view`. A troca mantém a página e substitui apenas a leitura analítica.

## 14. Project Health

Health completo em Geral: nota, estado, cobertura, dimensões, sinais positivos/negativos e ajuda. Pesos, fórmulas, elegibilidade e limiares do Model v1 foram preservados. Não existe botão separado para atualizar saúde.

`includeProjectHealth=true` inclui o resumo completo na mesma resposta da categoria. Teste API verifica igualdade de dimensões e janela entre as oito categorias para contexto fixo.

## 15. Health summary

Overview mostra somente nota, estado, barra, cobertura, até três áreas distintas de atenção derivadas dos drivers e CTA. Loading, erro com retry e ausência de avaliação são explícitos. Identidade de projeto/refresh/tentativa impede reuso visual de resposta antiga.

## 16. Health references

`health.reference.js` expõe bases já calculadas pelo Model v1:

| Base | Referência | Delta |
|---|---|---|
| Lead/Cycle/Merge Time | Período anterior comparável, com amostra mínima existente | Variação percentual assinada |
| Idade de PR aberta | Mediana de merge convertida para dias | Variação percentual assinada |
| Cobertura por estágio | Progresso/implementação do próprio projeto | Pontos percentuais assinados |
| Estimado × realizado | Estimativa da Sprint | Horas realizadas menos estimadas |
| Burndown | Restante ideal do último ponto elegível | Horas restantes menos ideais |

Sem base elegível, `reference` e `delta` são `null`. Não há meta configurada ou threshold novo. Frontend só formata valores/unidades/sinal. A linha ideal existente de I45 permanece a referência visual no gráfico; nenhum baseline escalar foi transformado em série fictícia.

## 17. General

Mantém os oito indicadores da composição P7 e Health completo. Não despeja o catálogo inteiro. Resumo superior e análise usam a mesma geração da resposta.

## 18. Planning

Nova composição de indicadores existentes: I26/I28/I29/I30 em prontidão e I31/I32/I33/I34 em esforço. Não cria fórmula ou indicador. Tasks atrasadas e desvios podem ser lidos como entidades tabulares.

## 19. GitHub

Composição P7 preservada, incluindo contagem de PRs abertas separada da idade dos itens. URLs externas só são links para HTTPS em github.com. Frescor, falta de integração, cobertura insuficiente e estados stale/partial permanecem explícitos.

## 20. Flow

Lead/Cycle Time, throughput, WIP e I25 seguem fontes e clocks canônicos. I25 preserva lacunas. Lead/Cycle Time continuam valores escalares; o contrato atual não entrega sua evolução temporal.

## 21. Sprint

I45 Burndown, I46 Burnup e I47 Velocity preservados, inclusive CONTEXT_ONLY e dados parciais. Um ponto gera resumo; múltiplos pontos permitem gráfico com dados tabulares. Nenhuma reconstrução ou mudança de histórico foi introduzida.

## 22. Tasks

Totais/distribuições e esforço mantêm a composição anterior. Listas usam tabela com colunas sustentadas pelo payload: registro, responsável, detalhes e valor quando disponíveis. Não foi criado atraso em dias calculado no frontend nem nome de responsável inferido.

## 23. Quality

Execuções, sucesso, estado dos casos, defeitos e reteste mantêm as fontes P6/P7. Contagens de distribuição não recebem sufixo percentual. Defeitos por entidade usam tabela.

## 24. Traceability

Coberturas preservadas e organizadas por seção. Lacunas entre estágios recebem referência/delta do backend, sem meta universal. Ausência de evidência e de histórico permanecem distinguíveis.

## 25. Charts

Sem biblioteca nova. Charts continuam lazy, com acessibilidade textual e disclosure “Ver dados”. I25/I45/I46/I47 e séries parciais têm regressão automatizada. A cobertura visual completa com séries persistidas de múltiplos pontos ainda está pendente nesta rodada.

## 26. Tables

Tabelas nativas com caption, cabeçalhos de coluna/linha e região focável de rolagem local. Colunas totalmente sem fonte são omitidas. O padrão segue as tabelas existentes de repositório e dos dados dos charts; não foi introduzida uma biblioteca ou sistema de tabela paralelo.

## 27. Tooltips/commercial UX

Ajuda contém o que mostra, cálculo em linguagem de uso, valor atual, referência quando existe e interpretação. Removidos detalhes técnicos, fórmulas internas, clocks, IDs de métricas, versões e RF. Mensagens desconhecidas têm fallback humano. Identificadores de entidades legítimos continuam podendo aparecer nos registros.

## 28. Data states

AVAILABLE, PARTIAL, STALE, NO_DATA e UNAVAILABLE mantidos. Erro HTTP tem retry e não vira NO_DATA. Série disponível vazia recebe explicação. Catálogo divergente tem alerta. Nenhum score/valor ausente é convertido em zero.

## 29. Async

Identidade/generation + AbortController protegem projeto, categoria, período, Sprint e responsável. Resposta antiga não sobrescreve o contexto novo. Resumo antigo desaparece durante carregamento do novo agregado. Polling acompanha execução GitHub observada em andamento; conclusão e retorno de foco invalidam a leitura. Falha de consulta de status não substitui o estado do agregado.

Coerência é por requisição agregada, não por transação SQL: `generatedAt` e `projectHealth.calculatedAt` identificam a composição; cada fonte preserva seu `asOf`. Não se alega isolamento transacional de todas as consultas.

## 30. Accessibility

Testes cobrem headings, tabs/teclado/foco, disclosure, labels, tabela, ajuda/Escape, estados e score. Tabelas possuem rolagem local focável; status não depende só de cor. Regiões de erro são embedded para evitar main aninhado. Aferição instrumental de contraste e homologação integral de teclado/touch em todos os viewports ainda não estão concluídas.

## 31. Responsive

Layout usa tokens, flex, container queries e rolagem local para navegação/tabelas. Na auditoria foi corrigida a dependência das queries do antigo container de Overview. Resumo quebra em cinco/três/dois tiles por linha conforme largura disponível.

Matriz requerida: 1440/1280/1024/768/430/390/360, Light/Dark. A matriz completa **não está homologada**; ver seção 34. CSS responsivo e testes DOM não substituem essa evidência.

## 32. Performance

Uma consulta de dashboard por categoria/filtros/refresh; catálogo e Sprints são consultas de contexto por projeto, sem request por widget. `groupIds` reúne IDs por service e reutiliza projeções no request. Health adiciona leituras agregadas limitadas, sem consulta por score. Charts carregam sob demanda. Teste API mantém payload das oito categorias abaixo de 256 KiB no cenário exercitado; isso não representa benchmark de projetos arbitrariamente grandes.

Build passou; permanece aviso de chunk grande no ELK de Rastreabilidade, sem dependência nova nesta rodada.

## 33. Tests

Logs locais: `/private/tmp/traceflow-p85-evidence/`.

| Gate | Resultado |
|---|---|
| Frontend focado (workspace, Overview, filtros/charts e Casos de teste) | 95 testes passaram |
| Backend focado (catálogo, Health e API agregada) | 30 testes passaram |
| Frontend full | 1.271 testes passaram |
| Frontend coverage | Passou o gate configurado |
| Frontend lint / format / build | Passaram |
| Backend unit | 841 testes passaram |
| Backend integration/API | 609 passaram; 5 skipped já existentes, sem novos skips |
| Backend coverage | 1.450 passaram; gate configurado passou |
| Backend lint / format | Passaram |
| Prisma validate / generate | Passaram |
| Migration status / physical audit | Passaram |
| Validadores empty, LR5, LR9, S2-P1, S2-P3, S2-P5.1, LR2 legacy | Passaram |
| Architecture / secrets / CI policy / CI formatting | Passaram |
| Dependency policy backend/frontend | Passou: 0 high, 0 critical, nenhuma exceção consumida |
| `git diff --check` | Passou |

Cobertura final (statements / branches / functions / lines): frontend
84,14% / 78,27% / 79,62% / 86,55%; backend 91,76% / 84,14% / 95,19% / 94,24%.
Os gates frontend foram repetidos após os ajustes finais de apresentação.

Banco de testes verificado antes das escritas: `NODE_ENV=test`, host localhost,
schema `traceflow_test`, read_only=0 e TEST_DATABASE_URL distinta validada pelo
helper de segurança. A aplicação local do projeto 2 foi apenas consultada.
CI remota, npm ci limpo e execução em outros sistemas operacionais não foram realizados.

## 34. Visual validation

Inspeção parcial no Chrome nativo, com autenticação/API reais e dados persistidos
do projeto local 2. Não foi usado mock de runtime no produto.

Observado em desktop Dark: Indicadores/Geral com Health 73/100 e cobertura 69%,
Visão Geral compacta, comparação com Casos de teste e Defeitos. A hierarquia de
header/nav/resumo/filtro corresponde à mesma aplicação. Os ajustes de espaçamento,
barra de saúde e tabelas vieram dessa inspeção. Em 390px foi possível observar
Defeitos como referência, mas não concluir a homologação do workspace.

**ENVIRONMENT BLOCKED / matriz incompleta:** o navegador integrado retornou
`Browser is not available: chrome`. No controle nativo, alterações de dimensões
e navegação em DevTools produziram foco/valores inconsistentes e conteúdo visual
antigo apesar da URL nova. Houve também `noWindowsAvailable`. As tentativas foram
interrompidas sem tratar capturas inconsistentes como aprovação. Abas auxiliares
foram fechadas e a aba original de Defeitos foi preservada.

Foi solicitada autorização para automação local via CDP, exigida pelas instruções
da ferramenta de interface para usar outra tecnologia. Sem essa autorização,
nenhuma interação via CDP foi executada nesta rodada.

Faltam: matriz completa Light/Dark e larguras requeridas para Overview,
Geral/Fluxo/Sprint/Qualidade/Rastreabilidade; comparação renderizada de Tarefas e
Requisitos; inspeção integral de charts elegíveis, ajuda, filtros, teclado/touch,
contraste e overflow. A observação parcial não equivale a PASS visual.

## 35. Documentation

Atualizados contratos da API, Design System, inventário, catálogo, matriz RF55/RF56
e log visual, além deste relatório. Fórmulas do catálogo e Health Model v1 não
foram alteradas. Registros de entregas anteriores são históricos, sem estender
seus vereditos à composição atual.

## 36. Remaining limitations

| Severidade | Categoria | Situação |
|---|---|---|
| HIGH | DESIGN / RESPONSIVE / ACCESSIBILITY / REGRESSION | Homologação visual obrigatória incompleta por limitação do controle disponível; retomar a matriz e corrigir eventuais achados antes da aprovação |
| Informativa | DATA / FILTER | Responsável continua sem associação histórica segura e desabilitado; aviso explícito |
| Informativa | CHART / HEALTH | Sem séries de Lead/Cycle/Merge Time ou histórico de Health no contrato atual; não foram fabricados |
| Informativa | PERFORMANCE | Payload verificado em cenário controlado; não é ensaio de carga de escala arbitrária |

## 37. Final verdict

**S2 P8.5 INDICATORS WORKSPACE + COMMERCIAL ANALYTICS UX — CHANGES REQUIRED**

Implementação e regressão automatizada entregues. Não se declara PASS LOCAL
porque a matriz visual obrigatória permanece incompleta. O encerramento depende
da evidência renderizada listada na seção 34. P9 não foi iniciado.

Sugestão de commit, apenas após a homologação: `feat: add dedicated project indicators workspace`.
