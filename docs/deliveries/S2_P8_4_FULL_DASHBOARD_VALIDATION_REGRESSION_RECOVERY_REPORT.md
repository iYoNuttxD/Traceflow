# S2 P8.4 — Validação integral e recuperação do Dashboard

> **Retificação PR23-FIX-02 — 2026-10-05:** o pacote binário citado em §36 não está
> versionado, não possui histórico Git nesse caminho e não foi encontrado localmente com
> origem comprovável. O texto abaixo preserva a declaração feita na época, mas seu PASS
> visual não constitui aprovação canônica. Status histórico corrigido: **TECHNICALLY VERIFIED**.
> O Visual Validation Log registra essa ausência; validações posteriores pertencem às suas
> próprias rodadas e não comprovam retroativamente a P8.4.

**S2 P8.4 FULL DASHBOARD VALIDATION & REGRESSION RECOVERY — PASS LOCAL**

## Resumo executivo

- **Regressões/lacunas:** 13 achados tratados; datas do Health ocultas, snapshot comprimido, ajuda recortada, texto/eixos reduzidos, vazios de layout e unidade incorreta em I17.
- **Gráficos:** I45/I46/I47 protegidos; Burnup acrescentado à Geral conforme P8.4. Em Sprint já existiam e foram preservados, inclusive CONTEXT_ONLY/REDUNDANT.
- **Filtros:** capacidades de visão explícitas, período da Geral restaurado, incompatibilidade e seleções da URL explicadas.
- **Visual/a11y:** sete visões em Light/Dark, ajuda em portal com foco/Escape, layout sem colunas mortas e eixos legíveis.
- **Dados:** correção de apresentação da contagem de PRs; fórmulas, fontes históricas e Health v1 preservados. Não houve correção inventada de histórico.
- **Gates:** frontend 1.264; backend 837 unit + 608 integração; cobertura completa e demais gates aprovados. Cinco skips legados preexistentes explicitados.
- **Limites:** Chromium local; zoom de renderer/reflow; sem CI remoto, sync GitHub externa nova ou certificação WCAG. Dados artificiais removidos do banco de teste.

## 1. Baseline

Data: 27/09/2026. Branch `daniel-dev`, HEAD `6d10715075c752e2d394270ff994bb2742ccb5d8`, tracking `origin/daniel-dev`; árvore inicialmente limpa. Node **22.23.3**. Mudanças locais sem commit/push. Nenhuma dependência, migration ou definição de schema alterada.

A sessão visual usa Chrome headless isolado, Vite temporário em 5174 e aplicação Express real em 3002. Serviços do usuário em 5173/3001 foram preservados. Servidor 3002, Vite 5174 e Chrome isolado foram encerrados ao terminar. Antes das escritas: `NODE_ENV=test`, host `localhost:3306`, schema `traceflow_test`, `read_only=0`, `TEST_DATABASE_URL` distinta da URL de desenvolvimento, validada pelo helper canônico. Nenhum dado de desenvolvimento foi alterado.

## 2. Escopo

Auditoria e correção de UI, contrato agregado, filtros, apresentação de unidades, gráficos, ajuda e regressões. Sete visões e 74 IDs reconciliados. P8.4 acrescenta I46 à composição GENERAL, já existente no backend. Health Model v1, fórmulas e owners de cálculo preservados. P9, preferências persistidas, novos KPIs e nova biblioteca de gráficos permanecem fora desta entrega.

## 3. Fontes revisadas

- [Roadmap S2-04/S2-05](../../TRACEFLOW_ROADMAP_INCREMENTAL.md), [matriz RF](../traceability/RF_TECHNICAL_MATRIX.md), [catálogo](../indicators/S2_INDICATOR_CATALOG.md), [prontidão](../indicators/S2_DATA_READINESS_AUDIT.md) e [Health Model v1](../indicators/PROJECT_HEALTH_MODEL_V1.md).
- [API](../api/API_CONTRACTS.md), incluindo S1-06, P5/P5.2, P7 e P8.3; relatórios P5.1/P5.2/P7/P8/P8.1/P8.2/P8.3.
- [Design System](../design/DESIGN_SYSTEM.md), [inventário](../design/UI_SURFACE_INVENTORY.md), [log visual](../design/validation/VISUAL_VALIDATION_LOG.md), arquitetura frontend e padrão de revisão.
- Código de catálogo/composição/política, services/calculators, registry de Health, componentes e testes correspondentes.

O alinhamento com o TCC nesta revisão usa a transcrição canônica e `TCC_ALIGNMENT_NOTE` do catálogo; não declara nova revisão integral do documento acadêmico. RF54 mantém a distinção entre merge/fechadas e parecer de Review `APPROVED`.

## 4. Arquitetura atual

`app/routes → pages → ProjectDetailsScreen → features/indicators/DashboardPanel`. A página não calcula indicadores. O painel consulta catálogo, agregado por visão e lista de Sprints; recebe membros da página. `dashboard-display.js` traduz e agrupa; `IndicatorCard` preserva o envelope; `IndicatorChart` permanece lazy; `ProjectHealth` apresenta o score recebido.

`DashboardHelp` é local à feature e usa portal para escapar do recorte das seções. Backend publica capacidades de filtro por visão a partir da política existente. Período na Geral também considera a janela de Health. `appliedFilters` de cada indicador continua independente. Identidades e gerações de requests protegem trocas de projeto/visão/filtro.

## 5. Esperado × atual

| Visão | IDs esperados após P8.4 | API/DOM | Resultado |
|---|---|---|---|
| GENERAL | I01, I23, I28, I61, I66, I53, I45, I46 | 8/8 | P7 tinha 7; I46 adicionado por P8.4; período Health habilitado |
| GITHUB | I02, I09, I04, I06, I10, I11, I12, I15, I16, I17, I73, I13, I14, I18, I74 | 15/15 | Todos preservados; geometria/estados revistos |
| FLOW | I20, I21, I22, I23, I24, I25 | 6/6 | Todos preservados; geometria/estados revistos |
| SPRINT | I36, I37, I38, I39, I40, I41, I42, I43, I44, I45, I46, I47, I71, I72 | 14/14 | Todos preservados; geometria/estados revistos |
| TASK | I26, I27, I28, I29, I30, I31, I32, I33, I34, I35 | 10/10 | Todos preservados; geometria/estados revistos |
| QUALITY | I06, I48, I49, I50, I51, I52, I53, I54, I55, I56, I57, I58, I59, I60 | 14/14 | Todos preservados; geometria/estados revistos |
| TRACEABILITY | I61, I62, I63, I64, I65, I66, I67 | 7/7 | Todos preservados; geometria/estados revistos |

### Reconciliação completa

74 IDs = 68 indicadores executáveis no catálogo (66 em widgets padrão + I03/I05 fora do padrão), duas capacidades I07/I08, três propostas não implementadas I19/I69/I70 e I68 não recomendado. A coluna de estado registra a resposta persistida capturada, não promete que todos os dados de domínio sejam completos. “Verificação” distingue presença/estado real de testes do cálculo. Nenhum ID ficou sem classificação.

| ID | Nome | Papel no Health | Visões esperadas P8.4 | Classificação | Atual/renderizado | Verificação | Regressão/ação |
|---|---|---|---|---|---|---|---|
| I01 | Progresso atual do projeto | CONTEXT_ONLY | GENERAL | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I02 | Commits na main por responsável | CONTEXT_ONLY | GITHUB | CONTEXT_ONLY BUT DISPLAYED | Sim / UNAVAILABLE | DOM + API + regressão | Preservado |
| I03 | Tasks concluídas por responsável | CONTEXT_ONLY | — | HIDDEN BY DESIGN | Ausente conforme contrato | Catálogo/P7/registry | Sem implementação nova |
| I04 | Taxa de retrabalho de PR | SCORING_SIGNAL | GITHUB | HEALTH_SIGNAL + DISPLAYED | Sim / PARTIAL | DOM + API + regressão | Preservado |
| I05 | Atividade por responsável | CONTEXT_ONLY | — | HIDDEN BY DESIGN | Ausente conforme contrato | Catálogo/P7/registry | Sem implementação nova |
| I06 | Qualidade oficial de PR | REDUNDANT | GITHUB, QUALITY | DISPLAYED (redundante somente no score) | Sim / PARTIAL | DOM + API + regressão | Preservado |
| I07 | Capacidade RF55/RF56 | CONTEXT_ONLY | — | DISPLAYED (capacidade, sem widget) | Capacidade, sem card | Toolbar/filtros reais | Sem KPI artificial |
| I08 | Capacidade RF55/RF56 | CONTEXT_ONLY | — | DISPLAYED (capacidade, sem widget) | Capacidade, sem card | Toolbar/filtros reais | Sem KPI artificial |
| I09 | Commits no período | CONTEXT_ONLY | GITHUB | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I10 | PRs abertas agora | CONTEXT_ONLY | GITHUB | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I11 | PRs fechadas no período | CONTEXT_ONLY | GITHUB | CONTEXT_ONLY BUT DISPLAYED | Sim / PARTIAL | DOM + API + regressão | Preservado |
| I12 | PRs mescladas no período | CONTEXT_ONLY | GITHUB | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I13 | Issues GitHub abertas agora | CONTEXT_ONLY | GITHUB | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I14 | Issues atualmente fechadas no período | CONTEXT_ONLY | GITHUB | CONTEXT_ONLY BUT DISPLAYED | Sim / PARTIAL | DOM + API + regressão | Preservado |
| I15 | Mediana até merge | SCORING_SIGNAL | GITHUB | HEALTH_SIGNAL + DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I16 | Média até merge | REDUNDANT | GITHUB | DISPLAYED (redundante somente no score) | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I17 | PRs abertas mais antigas | CONTEXT_ONLY | GITHUB | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Corrigida unidade do resumo; replay + teste |
| I18 | Mediana até fechamento de Issue | CONTEXT_ONLY | GITHUB | CONTEXT_ONLY BUT DISPLAYED | Sim / NO_DATA | DOM + API + regressão | Preservado |
| I19 | Proposta não implementada | UNIMPLEMENTED | — | UNIMPLEMENTED | Ausente conforme contrato | Catálogo/P7/registry | Sem implementação nova |
| I20 | Lead time | SCORING_SIGNAL | FLOW | HEALTH_SIGNAL + DISPLAYED | Sim / PARTIAL | DOM + API + regressão | Preservado |
| I21 | Cycle time | SCORING_SIGNAL | FLOW | HEALTH_SIGNAL + DISPLAYED | Sim / UNAVAILABLE | DOM + API + regressão | Preservado |
| I22 | Throughput | CONTEXT_ONLY | FLOW | CONTEXT_ONLY BUT DISPLAYED | Sim / PARTIAL | DOM + API + regressão | Preservado |
| I23 | WIP atual | CONTEXT_ONLY | GENERAL, FLOW | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I24 | Aging WIP | CONTEXT_ONLY | FLOW | CONTEXT_ONLY BUT DISPLAYED | Sim / UNAVAILABLE | DOM + API + regressão | Preservado |
| I25 | Cumulative flow | CONTEXT_ONLY | FLOW | CONTEXT_ONLY BUT DISPLAYED | Sim / PARTIAL | DOM + API + regressão | Preservado |
| I26 | Total de Tasks | CONTEXT_ONLY | TASK | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I27 | Distribuição por status | CONTEXT_ONLY | TASK | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I28 | Tasks atrasadas | SCORING_SIGNAL | GENERAL, TASK | HEALTH_SIGNAL + DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I29 | Tasks sem responsável | SCORING_SIGNAL | TASK | HEALTH_SIGNAL + DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I30 | Tasks sem estimativa | SCORING_SIGNAL | TASK | HEALTH_SIGNAL + DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I31 | Estimativa total conhecida | CONTEXT_ONLY | TASK | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I32 | Esforço realizado conhecido | CONTEXT_ONLY | TASK | CONTEXT_ONLY BUT DISPLAYED | Sim / NO_DATA | DOM + API + regressão | Preservado |
| I33 | Desvio de esforço comparável | CONTEXT_ONLY | TASK | CONTEXT_ONLY BUT DISPLAYED | Sim / NO_DATA | DOM + API + regressão | Preservado |
| I34 | Tasks acima da estimativa | CONTEXT_ONLY | TASK | CONTEXT_ONLY BUT DISPLAYED | Sim / NO_DATA | DOM + API + regressão | Preservado |
| I35 | Tasks concluídas abaixo da estimativa | CONTEXT_ONLY | TASK | CONTEXT_ONLY BUT DISPLAYED | Sim / NO_DATA | DOM + API + regressão | Preservado |
| I36 | Pontos planejados | CONTEXT_ONLY | SPRINT | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I37 | Pontos atuais | CONTEXT_ONLY | SPRINT | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I38 | Pontos entregues | CONTEXT_ONLY | SPRINT | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I39 | Tasks planejadas | CONTEXT_ONLY | SPRINT | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I40 | Tasks entregues | CONTEXT_ONLY | SPRINT | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I41 | Escopo adicionado | CONTEXT_ONLY | SPRINT | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I42 | Escopo removido | CONTEXT_ONLY | SPRINT | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I43 | Carry-over | CONTEXT_ONLY | SPRINT | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I44 | Estimado × realizado | SCORING_SIGNAL | SPRINT | HEALTH_SIGNAL + DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I45 | Burndown | SCORING_SIGNAL | GENERAL, SPRINT | HEALTH_SIGNAL + DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Corrigida largura/legibilidade; protegido por teste |
| I46 | Burnup | REDUNDANT | GENERAL, SPRINT | DISPLAYED (redundante somente no score) | Sim / AVAILABLE | DOM + API + regressão | Adicionado à Geral; mantido em Sprint |
| I47 | Velocity | CONTEXT_ONLY | SPRINT | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Corrigida largura/legibilidade; protegido por teste |
| I48 | Execuções por resultado | CONTEXT_ONLY | QUALITY | CONTEXT_ONLY BUT DISPLAYED | Sim / PARTIAL | DOM + API + regressão | Preservado |
| I49 | Pass rate | SCORING_SIGNAL | QUALITY | HEALTH_SIGNAL + DISPLAYED | Sim / PARTIAL | DOM + API + regressão | Preservado |
| I50 | Fail rate | REDUNDANT | QUALITY | DISPLAYED (redundante somente no score) | Sim / PARTIAL | DOM + API + regressão | Preservado |
| I51 | Blocked rate | REDUNDANT | QUALITY | DISPLAYED (redundante somente no score) | Sim / PARTIAL | DOM + API + regressão | Preservado |
| I52 | Saúde atual dos TestCases | SCORING_SIGNAL | QUALITY | HEALTH_SIGNAL + DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I53 | Defeitos por estado | CONTEXT_ONLY | GENERAL, QUALITY | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I54 | Defeitos por severidade | CONTEXT_ONLY | QUALITY | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I55 | Defeitos criados | CONTEXT_ONLY | QUALITY | CONTEXT_ONLY BUT DISPLAYED | Sim / PARTIAL | DOM + API + regressão | Preservado |
| I56 | Defeitos validados | CONTEXT_ONLY | QUALITY | CONTEXT_ONLY BUT DISPLAYED | Sim / PARTIAL | DOM + API + regressão | Preservado |
| I57 | Tempo de correção | CONTEXT_ONLY | QUALITY | CONTEXT_ONLY BUT DISPLAYED | Sim / PARTIAL | DOM + API + regressão | Preservado |
| I58 | Sucesso de reteste | SCORING_SIGNAL | QUALITY | HEALTH_SIGNAL + DISPLAYED | Sim / PARTIAL | DOM + API + regressão | Preservado |
| I59 | Concentração por Requirement | CONTEXT_ONLY | QUALITY | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I60 | Concentração por Task de origem | CONTEXT_ONLY | QUALITY | CONTEXT_ONLY BUT DISPLAYED | Sim / NO_DATA | DOM + API + regressão | Preservado |
| I61 | Requirements com Tasks | SCORING_SIGNAL | GENERAL, TRACEABILITY | HEALTH_SIGNAL + DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I62 | Requirements com evidência técnica | SCORING_SIGNAL | TRACEABILITY | HEALTH_SIGNAL + DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I63 | Requirements com TestCase | SCORING_SIGNAL | TRACEABILITY | HEALTH_SIGNAL + DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I64 | Requirements com Defect ativo | SCORING_SIGNAL | TRACEABILITY | HEALTH_SIGNAL + DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I65 | Requirements validados | SCORING_SIGNAL | TRACEABILITY | HEALTH_SIGNAL + DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I66 | Cobertura de implementação | SCORING_SIGNAL | GENERAL, TRACEABILITY | HEALTH_SIGNAL + DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I67 | Progresso médio por Requirement | CONTEXT_ONLY | TRACEABILITY | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I68 | Funil excluído | NOT_RECOMMENDED | — | NOT_RECOMMENDED | Ausente conforme contrato | Catálogo/P7/registry | Sem implementação nova |
| I69 | Proposta não implementada | UNIMPLEMENTED | — | UNIMPLEMENTED | Ausente conforme contrato | Catálogo/P7/registry | Sem implementação nova |
| I70 | Proposta não implementada | UNIMPLEMENTED | — | UNIMPLEMENTED | Ausente conforme contrato | Catálogo/P7/registry | Sem implementação nova |
| I71 | Sprint com mudança de escopo | SCORING_SIGNAL | SPRINT | HEALTH_SIGNAL + DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I72 | Carry-over atual | CONTEXT_ONLY | SPRINT | CONTEXT_ONLY BUT DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I73 | Idade média das PRs abertas | SCORING_SIGNAL | GITHUB | HEALTH_SIGNAL + DISPLAYED | Sim / AVAILABLE | DOM + API + regressão | Preservado |
| I74 | Tempo médio até fechamento de Issue | CONTEXT_ONLY | GITHUB | CONTEXT_ONLY BUT DISPLAYED | Sim / NO_DATA | DOM + API + regressão | Preservado |

`REDUNDANT` limita participação na nota; não remove I46. `CONTEXT_ONLY` não remove I47. I03/I05 são `HIDDEN BY DESIGN` em P7, não uma regressão causada pelo Health. Não houve regressão de desaparecimento em Sprint; houve problema de dimensão/legibilidade e uma exigência nova de composição na Geral.

## 6. Regressões encontradas

| ID | Categoria | Severidade | Visão/cenário | Esperado | Atual inicial | Causa | Correção | Regressão/evidência | Status |
|---|---|---|---|---|---|---|---|---|---|
| P84-01 | Filtro | HIGH | Geral/Health | Período configurável | Datas ocultas | Capacidade inferida só dos widgets | Metadata de visão inclui Health; warning corrigido | API P7 + DashboardPanel + interação real | RESOLVIDO |
| P84-02 | Composição | HIGH | Geral/Sprint em foco | I45 e I46 conforme P8.4 | I46 só em Sprint | Composição P7 de sete widgets | GENERAL com oito; contrato atualizado | Unit/API + DOM de oito IDs | RESOLVIDO; evolução explícita de contrato |
| P84-03 | Visual | HIGH | Sprint fechada/snapshot | Largura legível | 147,7 px úteis no desktop | Coluna 4/12 dentro de container estreito | Snapshot ocupa largura da célula | Antes/depois real, snapshot + I47 | RESOLVIDO |
| P84-04 | Ajuda/a11y | HIGH | Mobile | Ajuda dentro da tela e acima do header | Borda esquerda −1 px; header cobria painel | Posicionamento absoluto e camada baixa | Portal, clamp, overlay, Escape/foco | 360/390/768/1440 + teste semântico | RESOLVIDO |
| P84-05 | Visual | MEDIUM | Badge/label/help | Título íntegro | Três elementos comprimiam título | Header sem região própria para badge | Badge abaixo do título | Matriz real Light/Dark | RESOLVIDO |
| P84-06 | Gráfico | MEDIUM | Séries móveis/nomes longos | Eixos legíveis | Texto SVG escalava/cortava valores | Texto no viewBox fixo | Eixos HTML e plot responsivo | Capturas + teclado/tabela | RESOLVIDO |
| P84-07 | Layout | MEDIUM | KPIs/listas/última linha | Espaço proporcional | Colunas vazias e listas vazias enormes | Grade fixa e LIST sempre detalhado | Linhas flexíveis e vazio compacto | Sete visões reais | RESOLVIDO |
| P84-08 | Filtro/clareza | MEDIUM | Sprint/Responsável | Compatibilidade explicada | Controles ofereciam recorte sem efeito | Sem metadata agregada | Disabled + descrição; URL preservada | Teste + interação real | RESOLVIDO |
| P84-09 | Tradução | LOW | Sprint/carry-over | Português e direção explícita | Enum cru; direção não identificada | Presenter incompleto | Rótulos e direção; chave única de item | Teste de status + revisão | RESOLVIDO |
| P84-10 | Composição defensiva | MEDIUM | Task/Sprint/ID adicional | Preservar resposta | Agrupamento poderia descartar novos IDs | Listas fechadas no presenter | Preservar IDs/seções restantes | Teste direto de preservação | RESOLVIDO |
| P84-11 | Estado/recuperação | MEDIUM | Projeto novo/lista de Sprint falha | Draft contextual; retentativa | Draft podia atravessar projeto; erro sem retry | Dependência/recovery incompletos | projectId no reset e retry local | Revisão de geração + regressão completa | RESOLVIDO |
| P84-12 | Estado de dados | LOW | SERIES com zero pontos | Explicação textual | Ausência pouco clara | Sem branch de série vazia | Mensagem explícita | Teste componente | RESOLVIDO |
| P84-13 | Unidade | HIGH | GitHub/I17 | Total de PRs + idade por item | `1 dias` no total | Unidade DAYS aplicada à contagem | `1 PR aberta`; idade em dias; singular correto | Teste semântico + replay de resposta real | RESOLVIDO |

P84-10/P84-11 são lacunas detectadas na revisão defensiva; não se afirma que tenham causado perda de dados persistidos. P84-02 não é atribuído falsamente ao Health. Não foi encontrado defeito de fórmula backend que exigisse mudança nesta rodada.

## 7. Auditoria visual

A inspeção visual das capturas avaliou hierarquia, densidade, equilíbrio, alinhamento, texto longo, proporção dos gráficos, vazios, contraste e integração com a surface Projeto/GitHub/Equipe. Não se limitou a medir overflow. As sete visões usam o mesmo ritmo de seções e divisórias; ajuda e toolbar são consistentes. Health precede o Panorama sem substituir suas métricas. No mobile há empilhamento e tabs roláveis, alcançáveis por teclado.

32 observações de renderização real: sete visões em 1440/390 Light/Dark, mais Geral/Sprint em 768 nos dois temas. IDs completos, zero header sobreposto, zero erro de runtime e ausência de overflow horizontal global. A correção final I17 foi verificada separadamente por replay rotulado, depois da limpeza do banco.

## 8. Geral

Oito widgets + Project Health. Na massa real: I01 `88,89%`, WIP `1`, atrasadas `0`, Requirements com Tasks `100%`, implementação `0%`, um Defect ativo e I45/I46 com cinco pontos. Período disponível mesmo quando os widgets atuais não o aplicam. Sprint em foco segue a seleção/autodetecção canônica; nota e widgets mantêm explicações próprias.

## 9. GitHub

Quinze IDs presentes. Massa controlada: um commit, uma PR aberta, uma mesclada, merge mediano/médio de 24 h, idade média de 5,71 dias. I17 agora distingue contagem e duração. I02 indisponível por ausência de prova main; I04/I06/I11 parciais por cobertura incompleta; isso aparece como limitação, não zero. I18/I74 sem amostra permanecem sem dados. Os fatos de provider são fixtures persistidas; não se afirma sincronização externa nesta rodada.

## 10. Fluxo

Seis IDs presentes. I22 tem seis pontos e total oito; I25 tem cinco pontos com cobertura parcial. Lead time parcial `0,7 dias`; cycle time e aging respeitam falta de eventos iniciais. WIP atual continua `1`. O renderer de I25 interrompe área em lacunas; não conecta história desconhecida nem inventa zero. Contraste, legenda, resumo e tabela foram examinados em Light/Dark.

## 11. Sprint

Quatorze IDs, incluindo Burndown, Burnup e Velocity. Massa ativa: 9 h planejadas, 11 h atuais, 7 h entregues, três Tasks planejadas, duas entregues. I43 separa entrada/saída; I71 explica mudança; I72 conserva valor zero válido. Escolha de Sprint fechada mostra snapshots e histórico congelado; Sprint planejada mostra ausência de histórico sem ocultar Velocity do projeto.

## 12. Tarefas

Dez IDs preservados e reagrupados em Estado do trabalho, Esforço e Atenção. Nove Tasks: oito concluídas e uma em andamento; estimativa total de 29 h. Ausência de esforço elegível em I32/I33/I34/I35 aparece como sem dados, inclusive quando o payload carrega contagem zero acompanhada de `NO_DATA`. Recorte temporal sem suporte recebe explicação comum de seção.

## 13. Qualidade

Quatorze IDs separados por fonte. Via API autenticada foram criadas execuções FAIL, BLOCKED e PASS: I48 `1/1/1`, total três; I49/I50/I51 `33,33%` com período em andamento explicitamente parcial. I52 considera somente a execução atual e mostra PASS=1. Defect ALTA ativo aparece em estado, severidade e Requirement. Concentração por Task de origem é NO_DATA. I58 conserva contagens sem `%`, coberto por teste anterior mantido. RF54 continua qualidade de PR, distinta da qualidade dos testes.

## 14. Rastreabilidade

Sete dimensões independentes, sem funil I68. Massa real: I61/I63/I64=100%, I62/I65/I66=0%, I67=88,89%. Todos os títulos, estados e badges preservam semântica backend. `I65=0%` com avaliação saudável decorre de `STAGE_GAP`: I66 também é 0%, portanto a lacuna é zero e o score é 100 conforme Health v1. Esse score compara validação à implementação; não afirma entrega completa. Período histórico não suportado continua explícito.

## 15. Project Health

Modelo v1 e pesos intactos. API real passou de UNASSESSED com cobertura insuficiente para ATTENTION após enriquecimento controlado; os JSONs preservam score, base e janela exatos. Como o relógio voltou a avançar para manter o rate limiter real, consultas posteriores podem ter pequenas diferenças de coorte/cobertura.

HEALTHY, ATTENTION, CRITICAL e UNASSESSED foram renderizados também em 16 combinações sintéticas: 1440/390 × Light/Dark × quatro estados. `UNASSESSED` mostra travessão, nunca zero. Dimensões, cobertura e drivers continuam explicáveis. Nenhum papel de Health filtra a lista de widgets ou calcula nota de pessoa.

## 16. Filtros

| Visão | Datas | Sprint | Responsável |
|---|---|---|---|
| GENERAL | Habilitadas: janela Health | Habilitada | Sem suporte seguro; explicado |
| GITHUB | Habilitadas | Não aplicável | Sem suporte seguro; explicado |
| FLOW | Habilitadas | Sem suporte seguro; explicado | Sem suporte seguro; explicado |
| SPRINT | Não aplicável | Habilitada | Não aplicável |
| TASK | Não aplicável | Sem suporte seguro; explicado | Sem suporte seguro; explicado |
| QUALITY | Habilitadas | Não aplicável | Não aplicável |
| TRACEABILITY | Sem suporte seguro; explicado | Não aplicável | Não aplicável |

Compatibilidade é derivada do backend, não da disponibilidade momentânea de dados. URL preserva período/Sprint/responsável ao trocar visão; resumo indica ausência de efeito e Limpar remove a seleção. Draft não dispara request; abrir/fechar preserva draft. Aplicar envia fuso IANA; período incompleto exibe erro nomeado. Back/Forward restaura estado. Teste API confirma São Paulo `[03:00Z,03:00Z)` e cobertura existente de DST de Nova York. Listagem de Sprints tem recuperação própria.

## 17. Burndown

I45 v2 preservado em Geral/Sprint, cinco pontos disponíveis na Sprint ativa, horas e linha ideal distintas. Cenários reais: Sprint fechada com ponto único; planejada sem gráfico histórico. Testes P5.1/P5.2 cobrem reabertura, conclusão, escopo, estimativa e imutabilidade terminal. Nenhum cálculo frontend novo.

## 18. Burnup

I46 v2 acrescentado à Geral e preservado em Sprint mesmo com papel REDUNDANT. Duas linhas: escopo total e trabalho concluído. Na API real coberta, para cada dia conhecido, `scope − completed = remaining` do I45. Capturas sintéticas adicionais exercitam PARTIAL com lacunas e UNAVAILABLE sem gráfico; `null` não é convertido em zero. Sprint planejada real permanece NO_DATA.

## 19. Velocity

I47 CONTEXT_ONLY permanece em Sprint. Duas Sprints concluídas reais fornecem duas barras; seleção de Sprint ativa/fechada/planejada não elimina esse histórico do projeto. Label usa “Horas concluídas” quando unidade HOURS. Nome extenso quebra linha; Home/End percorrem extremos e a tabela é operável por teclado. Snapshot de uma Sprint continua coberto pelo teste de componente.

## 20. Gráficos

SVG continua sem biblioteca nova. Escala e datas em HTML evitam redução do texto pelo viewBox; plot mantém domínio numérico, resumo de ponto e tabela. Linhas distinguem série secundária por tracejado; área acumulada não recebe legenda falsa de linha. Valores negativos/zero/null conservam o tratamento existente. Uma amostra vira resumo; zero pontos vira explicação. Hover/toque/cursor e teclado usam o mesmo índice de leitura; Home/End e expansão da tabela foram exercitados no renderer.

## 21. Tradução

Status de Sprint: Planejada, Em andamento, Concluída, Cancelada. Carry-over identifica recebimento/transferência. I66 é Cobertura de implementação. A fonte RF16 é a branch literal `main`. I17 usa PR/PRs e dias por item; duração de um dia usa singular. Datas são pt-BR; técnico/fórmula/códigos ficam na ajuda, enquanto limitações conhecidas usam linguagem de uso.

## 22. Tooltips e ajuda

Ajuda informativa usa dialog não modal nomeado em portal. Abre por botão de 44 px, recebe foco, fecha por botão/Escape/clique externo/saída de foco e devolve foco ao acionador ao fechar explicitamente. Largura ≤400 px e margens de 16 px; altura limitada com rolagem. Acompanha scroll/resize e não desloca tiles. Em 360 px: x=16, largura=328; em 390: x=16, largura=358. Camada overlay evita cobertura pelo header móvel. Conteúdo separa o que mostra, cálculo, interpretação, saúde, limites e detalhes técnicos.

## 23. Estados dos dados

AVAILABLE, NO_DATA, PARTIAL, STALE e UNAVAILABLE permanecem separados da saúde. Os quatro primeiros estados reais relevantes foram observados conforme cada fonte; STALE foi exercitado por fixture e teste, sem envelhecer dados de desenvolvimento. Estado desconhecido falha de forma conservadora. Zeros legítimos permanecem visíveis; ausência/inconclusão não vira zero. Loading, falha de catálogo/agregado, resposta obsoleta e recarregamento seguem contratos e testes.

## 24. Correção dos dados

A homologação criou projeto 74899, nove Tasks, duas Sprints concluídas, uma ativa e depois uma planejada, um Requirement, um TestCase, três execuções e um Defect. Domínio foi operado por API real; GitHub foi enriquecido por inserts de fixtures no banco de teste. Relógio controlado avançou entre mutações; middleware de teste alinhou timestamps de INSERT de Task/TaskMovement. Não houve reescrita de histórico preexistente.

Paridade escalar foi examinada em 14 visões/temas; distribuições e invariantes I45/I46 também foram confrontadas com payloads. A primeira comparação escalar repetia o formatter e não detectou o erro semântico I17: a inspeção visual detectou-o, e teste/replay independentes verificaram a correção. Não se usa aquela comparação isolada como prova de unidade.

I44 `actualHours=0` sem sessões é o agregado canônico S1-06 de segundos concluídos; I32 exige esforço elegível registrado e pode ser NO_DATA. A diferença foi investigada e preservada, sem alterar Health v1. O conjunto congelado preexistente do schema de teste estava vazio; não se afirma comparação de snapshots de desenvolvimento. As fixtures próprias foram removidas antes da regressão completa. Tentativas iniciais incompletas também foram limpas por projeto próprio.

## 25. Acessibilidade

24 verificações de interação passaram, incluindo tabs por setas/Home/End, último tab visível a 360 px, disclosure, erro de datas, ajuda/Escape/retorno de foco, drawer móvel e gráfico/tabela. Árvore de acessibilidade do Chrome confirmou nomes de tabs, artigos e refresh. Estados/Health têm texto além da cor; gráficos têm alternativa tabular.

Amostra de texto com cores efetivas e composição de backgrounds: mínimo **5,46:1 Light** e **6,39:1 Dark**, sem falhas na amostra. Alvos verificados ≥44 px. Isso não certifica WCAG integral nem substitui leitor de tela nativo. Não havia axe/VoiceOver automatizável nesta infraestrutura.

## 26. Responsividade

37 observações adicionais: Geral/Sprint × Light/Dark × 1440/1280/1024/768/430/390/360 px; sidebar de 272 e 88 px; quatro cenários de reflow equivalente a zoom 100/125/150/200; três cenários de zoom CSS real de renderer 125/150/200. Sem overflow global, sobreposição de header ou perda de controle. Tabelas têm rolagem local; tabs permanecem alcançáveis.

As porcentagens de zoom foram verificadas por renderer/reflow equivalente. O menu de zoom nativo do Chrome não foi operado; essa distinção integra o alcance da evidência.

## 27. Light/Dark

Sete visões reais nos dois temas em desktop/mobile; Geral/Sprint também em tablet e larguras intermediárias. Tokens de surface, texto, borda, foco e estados foram preservados. Capturas selecionadas inspecionadas incluem todas as visões; Health crítico/sem avaliação e Burnup parcial complementam a massa real. Nenhuma cor de score foi recalculada no frontend.

## 28. Concorrência assíncrona

Revisão e testes confirmam geração + identidade + abort nas requests de catálogo, Sprints e agregado. Resposta antiga de visão/filtro/projeto não sobrescreve contexto novo. Draft inclui projectId no reset. `ProjectDetailsPage` cobre resposta tardia de A após B, run iniciado em A concluindo em B e poll antigo. Sync confirmada permanece confirmada mesmo se o refresh de projeto falhar. Não foram adicionados timeouts/retries para mascarar corrida.

## 29. Autorização

API P7 testa sem sessão→401, estranho/projeto removido→404, VIEWER/MEMBER/MANAGER com leitura autorizada, Sprint e responsável de outro projeto→404 e vínculo inativo conforme política histórica. Catálogo exige o mesmo boundary. UI de sync conserva autorização por papel; teste de página oculta ação para MEMBER. A sessão de homologação é artificial e separada. Nenhum segredo foi registrado nas evidências.

## 30. Sincronização GitHub

Refresh local consulta o agregado; Sincronizar do header mantém operação GitHub. Revisão/testes de página cobrem execução única, polling longo, recuperação após reload, Retry-After, erro sanitizado, permissão, troca de projeto e falha de refresh após sucesso confirmado. A regressão backend cobre sync e fontes. Nenhuma sync contra GitHub externo foi disparada nesta rodada; a evidência externa P8.1 é histórica, não revalidada aqui.

## 31. Network e desempenho

Em 14 cargas locais (sete visões × dois temas), exatamente duas requests de indicadores: catálogo + agregado. Troca de visão/refresh usa o agregado, sem endpoint por widget. Requests de contexto/Sprints são separadas e esperadas. Nenhum loop ou erro de runtime/console foi observado.

| Visão | Payload agregado aproximado |
|---|---:|
| Geral | 22.555 bytes |
| GitHub | 15.758 bytes |
| Fluxo | 7.093 bytes |
| Sprint | 13.361 bytes |
| Tarefas | 8.850 bytes |
| Qualidade | 14.540 bytes |
| Rastreabilidade | 6.732 bytes |

A espera instrumentada até conteúdo visível ficou aproximadamente 0,42–0,46 s; inclui polling de 100 ms, é amostra local e não benchmark/SLA. Sem travamento perceptível nas trocas. A contagem final exclui módulos Vite cujos caminhos também contêm `/indicators/`.

## 32. Bundle e renderização

Build de produção passou. `IndicatorChart` permanece chunk lazy (~7,1 kB; gzip ~2,6 kB), sem biblioteca nova. CSS da feature ~21,36 kB, gzip ~3,48 kB. Aviso de chunk grande de ELK (~1,43 MB) já pertence ao grafo de rastreabilidade e não foi ampliado por um pacote de gráficos. Portal usa listeners/ResizeObserver com cleanup; nenhum loop observado. Não foi feita alegação de delta exato de bundle contra rebuild do HEAD original.

## 33. CSS e qualidade do código

Mudanças restritas à feature e contratos correspondentes. Layout flexível substitui spans fixos inadequados, sem esconder overflow da página. `min-width:0`, quebra de texto, eixos HTML e regras responsivas tratam a causa. Ajuda usa tokens e z-index semântico. Grupos preservam IDs futuros recebidos. Não houve mudança de schema, pacote, lockfile, owner de cálculo, score ou camada de autorização.

## 34. Testes adicionados

- Backend unit: composição GENERAL com I45/I46 e metadata das sete visões.
- Backend API: catálogo de views; janela Health com São Paulo e ausência de warning global falso; GENERAL com I46.
- Frontend: preservação de IDs ao reagrupar; I45/I46/I47 visíveis com SCORING/REDUNDANT/CONTEXT; datas Health com controles incompatíveis explicados; Escape/retorno de foco; série sem pontos; contagem I17 distinta da idade.
- Fixtures visuais: GENERAL com Burnup; unidades HOURS; capacidades de filtro; I17 com resumo/lista.

`DashboardPanel.test.jsx`: 29 testes. Testes existentes de ajuda foram adaptados ao dialog nomeado; asserções de conteúdo e regressões de estado/async foram mantidas.

## 35. Regressão completa

| Gate local | Resultado |
|---|---|
| Frontend test | PASS — 1.264 testes, 101 arquivos |
| Frontend coverage | PASS — statements 83,99%; branches 78,15%; functions 79,53%; lines 86,39% |
| Frontend lint / format / build | PASS |
| Backend unit | PASS — 837 testes, 76 arquivos |
| Backend integration/API | PASS — 608; 5 skips preexistentes em 2 arquivos |
| Backend coverage | PASS — 1.445; mesmos 5 skips; statements 91,72%; branches 84,08%; functions 95,19%; lines 94,21% |
| Backend lint / format | PASS |
| Foco API P7/P5.1 + unit views/Health | PASS — 30 testes |
| Prisma validate / generate / migration status | PASS |
| Auditoria física LR.5 | PASS |
| Migrations existentes em schema vazio | PASS |
| Upgrades LR.5 / LR.9 / S2 P1 / P3 / P5.1 / guard LR.2 | PASS em schemas descartáveis protegidos |
| Arquitetura / secret scan | PASS |
| Política CI + política npm audit | PASS — 13 testes |
| Format da política CI | PASS |
| npm audit backend/frontend com política do projeto | PASS — zero exceções, zero high/critical |
| git diff --check | PASS |

Os cinco skips pertencem a `e6-backfill.test.js` e `e11-legacy-responsibility.test.js`, exclusivos de banco pré-LR.2, já desativados no baseline. Não foram adicionados skips nem reduzidos gates. O primeiro ensaio unitário no sandbox encontrou EPERM de listen; a execução autorizada fora do sandbox passou integralmente.

Foram usados lockfiles/dependências instaladas e Node 22; não se executou novo `npm ci`. A cadeia de migrations foi aplicada pelos validadores em schemas descartáveis; o schema de teste principal já estava atualizado. Isso é equivalência funcional dos gates locais, não nova execução remota do GitHub Actions.

## 36. Evidências visuais

Pasta durável: [evidence/s2-p8-4](../design/validation/evidence/s2-p8-4/README.md). Contém 26 capturas selecionadas e oito arquivos JSON com payloads/resultados, sem credenciais. As imagens reais usam nome longo de projeto, dados persistidos e sessão autenticada.

| Evidência | Link |
|---|---|
| Geral real desktop | [Light](../design/validation/evidence/s2-p8-4/real-general-1440-light.png) / [Dark](../design/validation/evidence/s2-p8-4/real-general-1440-dark.png) |
| Sprint real desktop | [Light](../design/validation/evidence/s2-p8-4/real-sprint-1440-light.png) / [Dark](../design/validation/evidence/s2-p8-4/real-sprint-1440-dark.png) |
| Snapshot comprimido / corrigido | [Antes](../design/validation/evidence/s2-p8-4/baseline-snapshot-1440.png) / [Depois real](../design/validation/evidence/s2-p8-4/real-closed-sprint-snapshot-1440.png) |
| Ajuda mobile | [Antes](../design/validation/evidence/s2-p8-4/baseline-help-390.png) / [Depois real](../design/validation/evidence/s2-p8-4/real-help-390.png) |
| Qualidade real | [Execuções 1/1/1](../design/validation/evidence/s2-p8-4/real-quality-1440-light.png) |
| Rastreabilidade real | [Mobile Dark](../design/validation/evidence/s2-p8-4/real-traceability-390-dark.png) |
| I17 final | [Replay rotulado](../design/validation/evidence/s2-p8-4/replay-i17-390-dark.png) |
| Sprint planejada real | [Sem histórico inventado](../design/validation/evidence/s2-p8-4/real-planned-sprint.png) |
| Health sintético | [Crítico](../design/validation/evidence/s2-p8-4/fixture-critical-1440-light.png) / [Sem avaliação](../design/validation/evidence/s2-p8-4/fixture-unassessed-390-dark.png) |

Outras visões estão na pasta; JSONs registram presença, tamanho, contraste, requests, estados e interação. A anotação de I17 preserva a captura anterior ao ajuste, sem apresentar evidência antiga como resultado final corrigido.

## 37. Limitações restantes

- Browser homologado: Chromium local headless. CUA e node_repl falharam na inicialização do runtime; foi usado CDP no Chrome isolado, sem biblioteca instalada. Firefox não estava instalado; Safari/WebKit não foi automatizado.
- Zoom via renderer/reflow equivalente; menu nativo e leitor de tela nativo não foram homologados. Contraste amostral e árvore de acessibilidade não constituem certificação WCAG.
- GitHub externo e CI remoto não executados. Fixtures de provider não provam frescor/cobertura histórica externa.
- Limitações canônicas de histórico/UNSAFE e indicadores ausentes por design continuam explícitas; não são marcadas como regressões resolvidas.
- Nenhum BLOCKING/HIGH/MEDIUM/LOW de produto identificado nesta rodada ficou aberto. P84-13 foi corrigido após a massa real ser limpa e validado por teste semântico + replay; não se declara nova consulta live pós-correção para esse cenário específico.

S2-04/S2-05 continuam sujeitos à avaliação integral dos RFs e às etapas posteriores; PASS desta rodada não os conclui automaticamente.

## 38. Veredito final

**S2 P8.4 FULL DASHBOARD VALIDATION & REGRESSION RECOVERY — PASS LOCAL**

No alcance local descrito: sete visões reconciliadas, filtros e séries presentes, ajuda/layout/unidade corrigidos, API/banco/sessão reais homologados, evidências renderizadas examinadas e gates locais aprovados. Limites de browser, zoom nativo, CI remoto e GitHub externo estão declarados acima. Sem commit ou push.

Sugestão de commit para revisão futura: `fix: restore and harden project analytics dashboard`.
