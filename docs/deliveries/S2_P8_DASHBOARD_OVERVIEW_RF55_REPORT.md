# S2 P8 — Dashboard na Visão Geral e RF55

**Resultado local: CHANGES REQUIRED.** O painel está implementado e os gates automatizados locais
passaram. A inspeção renderizada foi feita em fixture isolada; falta homologar o fluxo autenticado
contra o backend P7 e dados reais antes de declarar `PASS LOCAL`/RF55 completo.

## 1. Baseline

Branch inicial `daniel-dev`, HEAD `dd63133604b477b381c3d6f02c6119dbfb629361`, worktree limpo.
Node 22.23.3 usado nos gates. O banco de teste foi confirmado como
`localhost/traceflow_test`, diferente do banco de desenvolvimento, `NODE_ENV=test` e
`read_only=0`. Esta rodada não criou migration, alterou schema, fez commit ou push.

## 2. Scope

P8 adiciona apresentação dos indicadores na rota existente `/projects/:projectId`, consumindo a
resposta agregada e o catálogo P7. Não há service/calculator novo nem fórmulas no frontend. O único
ajuste no fluxo existente é invalidar o painel após sync GitHub confirmada sem transformar uma falha
posterior de refresh do contexto em falha da mutação.

## 3. Existing overview before P8

A tela mostrava header com nome/status/ações, `ProjectSectionNav` e uma surface integrada com
Projeto, GitHub e Equipe. Sync e feedback já existiam. O contexto foi preservado e agora começa
recolhido em largura útil até 45rem, com resumo e botão de expansão; as ações de editar, membros e
sync continuam no header.

## 4. Dashboard architecture

`ProjectDetailsScreen` carrega `features/indicators/DashboardPanel` com `React.lazy`. A feature
centraliza cliente HTTP, seleção/URL, filtros, catálogo, estados assíncronos e cards. Cada mudança
de visão/filtro consulta uma vez o endpoint agregado P7. Projeto/membros/Sprints são contexto ou
opções do formulário; os números de indicador vêm somente do agregado. Um chunk posterior carrega
os gráficos quando há série.

## 5. Chart library spike

| Opção | Integração | Acessibilidade | Custo e decisão |
| --- | --- | --- | --- |
| [Recharts](https://github.com/recharts/recharts/blob/main/package.json) | React declarativo, suporta React 19 e `sideEffects:false` | [Camada de acessibilidade e teclado](https://github.com/recharts/recharts/wiki/Recharts-and-accessibility) disponível | Boa opção para escala futura, mas amplia dependências para cinco formas pequenas. |
| [Chart.js + react-chartjs-2](https://github.com/reactchartjs/react-chartjs-2/blob/master/package.json) | Wrapper suporta React 19/Chart.js 4 | Canvas pede [alternativa acessível explícita](https://www.chartjs.org/docs/latest/general/accessibility.html) | Exigiria tabela/semântica externa de qualquer forma. |
| SVG nativo | Sem pacote e usa diretamente pontos P7 | [`role="img"`, nome e descrição](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_in_HTML), legenda, navegação de pontos e tabela | Escolhido para escopo P8; manutenção fica local à feature. |

## 6. Selected chart technology

Um componente SVG pequeno desenha linha (I22/I45/I46), área empilhada (I25) e barras (I47).
Valores não são recalculados; só coordenadas para exibição. `null` interrompe a linha e o Burnup
parcial não ganha ponto zero. O eixo visual, legenda, leitura por setas e tabela usam os valores
originais da API. Não foi adicionada biblioteca de gráficos.

## 7. Overview information architecture

Header/ações → navegação do projeto → faixa compacta de contexto → Indicadores → sete tabs →
filtros → estado/frescor da visão → seções/cards. Contexto detalhado fica expansível em tablet e
mobile. Nenhuma rota de painel foi criada.

## 8. Views

`GENERAL`, `GITHUB`, `FLOW`, `SPRINT`, `TASK`, `QUALITY` e `TRACEABILITY` correspondem às seções e IDs
definidos pelo P7. I03/I05 permanecem no catálogo, sem widget padrão, para seleção futura. I19 e
I68 não foram inventados.

## 9. Filters

O formulário expõe `startDate`, `endDate`, Sprint e responsável; envia `timeZone` IANA quando há
período. Datas incompletas/invertidas são rejeitadas antes do HTTP. Sem seleção temporal não há
janela implícita. URL preserva `view` e filtros e Back/Forward restaura o recorte. O resultado do
backend decide `appliedFilters` por indicador; ícone e ajuda explicam filtro pedido não aplicado.
O responsável inativo permanece selecionável quando devolvido na lista autorizada de membros.

## 10. Widget primitives

`IndicatorCard` combina cabeçalho/ajuda, estado, KPI, distribuição, lista ou série, aviso e rodapé.
O help usa descrição do catálogo e fórmula/fonte/relógio/horário/versão/limites do resultado.
Links de PR externos são aceitos apenas em `https://github.com`. Cards não são botões inteiros.

## 11. Data states

`AVAILABLE`, `NO_DATA`, `PARTIAL`, `STALE` e `UNAVAILABLE` têm rótulos próprios. `NO_DATA` não vira
0; `UNAVAILABLE` mostra a primeira limitação conhecida e suprime gráfico; `PARTIAL` mantém o valor
conhecido com aviso; `STALE` exibe último valor e horário da fonte. `viewState` não substitui o
estado de cada card.

## 12. GENERAL

Mostra os sete widgets P7 em Panorama/Sprint em foco: progresso, WIP, Tasks atrasadas, duas
dimensões de rastreabilidade, Defects e Burndown. A primeira dobra contém resumo contextual,
seletor e filtros sem esconder o indicador atrás de uma nova rota.

## 13. GITHUB

Separa atividade, Pull Requests e Issues conforme o agregado. Retrabalho e qualidade de PR são
fichas distintas; duração e listas permanecem com unidade/estado da API. `sourceUpdatedAt` e
`STALE` não são substituídos pela hora da montagem local. A sincronização confirmada incrementa
uma versão que solicita nova leitura agregada.

## 14. FLOW

Apresenta lead/cycle time, throughput, WIP, aging e fluxo cumulativo P7. I25 usa área empilhada
apenas nos pontos recebidos e expõe a limitação de estado inicial desconhecido. Não reconstrói
história anterior a partir de Tasks atuais.

## 15. SPRINT

Mantém planejamento, histórico e mudança de escopo separados. O filtro explícito de Sprint passa
ao agregado. I47 permanece série de Sprints concluídas de projeto e segue a compatibilidade P7,
sem reinterpretação no cliente.

## 16. TASK

Status, prazos, esforço e comparações com estimativa usam KPIs, distribuição e listas do P7. Nenhum
esforço é somado novamente no navegador. Itens preservam prazo, unidade e diferença recebidos.

## 17. QUALITY

Test executions I48 e saúde atual de TestCases I52 aparecem em cards separados. Taxas I49–I51,
status/severidade de Defects e concentração seguem IDs e estados P7. I59 avisa que um Defect pode
aparecer em mais de um Requirement; suas linhas não formam total aditivo.

## 18. TRACEABILITY

I61–I67 são dimensões independentes, cada uma com percentual, fonte e estado próprios. Não há
funil ou soma de percentuais. Ausência de denominador aparece como `NO_DATA` sem barra de 0%.

## 19. Burndown/Burnup

I45 v2 mostra `remaining` e `ideal`; I46 v2 mostra `scope` e `completed`. Os pontos de um gráfico
não derivam o outro. A fixture visual cobriu Burnup `AVAILABLE`, `PARTIAL` com lacunas `null`, e
`UNAVAILABLE` sem desenho. O tooltip textual e a tabela preservam `—` para desconhecido.

## 20. Responsive behavior

O grid usa a largura do container: 3 colunas em 1440/1280, 2 em 768, 1 em 390 na fixture. Tabs
quebram linha no mobile; filtros mantêm alvo e largura utilizáveis. Contexto se recolhe em tablet/
mobile e pode ser expandido. O documento não apresentou overflow horizontal nas oito células
Light/Dark verificadas no Chrome.

## 21. Accessibility

Tabs têm `tablist`/`tabpanel`, seleção e setas/Home/End. Filtros possuem label; cards usam
`article`/heading; ajuda usa `details`; gráficos têm nome, descrição, legenda, setas para percorrer
pontos e tabela expansível. Valores/estados são textuais além de cor. Testes de teclado e inspeção
visual local passaram. Isto não constitui auditoria WCAG completa.

## 22. Async/race safety

Dashboard e catálogo usam `AbortController`, geração monotônica e identidade de projeto/view/
filtros. Resposta antiga não substitui resultado de novo recorte. Loading, erro/retry e falta de
metadata são explícitos; a tela não reutiliza silenciosamente resposta de outra visão. Refresh
manual é independente do refresh pós-sync. Testes cobrem troca de visão, troca rápida de filtros e
sync confirmada seguida de falha ao buscar contexto.

## 23. Performance/bundle

Build Vite local: `indicators` 16,52 kB JS (5,28 kB gzip), CSS 12,19 kB (2,24 kB gzip),
formatação compartilhada 7,86 kB JS (3,39 kB gzip) e gráfico 4,99 kB JS (2,10 kB gzip), em chunks
separados. O chunk de entrada ficou em 398,07 kB JS (115,14 kB gzip). Há warning preexistente de
chunk `elk` acima de 500 kB e aviso IIFE; o build
terminou com exit 0. Uma request de Dashboard por mudança de visão/filtro, sem fanout por widget.

## 24. Tests

| Gate local | Resultado |
| --- | --- |
| Frontend focused | 35/35 PASS após ajuste do contexto |
| Frontend coverage | 101 arquivos, 1246/1246; thresholds satisfeitos |
| Frontend lint, format, build | PASS |
| Backend unit | 827/827 PASS |
| Backend integration/API | 605 PASS, 5 skipped |
| Backend coverage | 1432 PASS, 5 skipped; 91,59% statements / 84,12% branches / 94,99% functions / 94,13% lines |
| Backend lint, format, architecture | PASS |
| Prisma validate/generate | PASS; schema não alterado |
| CI policy local | 8/8 PASS; CI remoto não executado |
| Secret scan | PASS, 578 arquivos |
| Audit policy backend/frontend | 0 high, 0 critical |

Os testes frontend cobrem client, sete visões, filtros/compatibilidade, estados, I25/I45/I46,
Quality/Traceability, teclado e regressão das ações da tela. A regressão backend confirma P7 sem
alteração de service/schema.

## 25. Visual validation

[Log visual](../design/validation/VISUAL_VALIDATION_LOG.md): Chrome com tela real e fixture HTTP
isolada. Foram inspecionados GENERAL/SPRINT/QUALITY/TRACEABILITY em desktop/mobile, GITHUB/FLOW/
TASK em desktop, cinco estados e Burnup disponível/parcial/indisponível. A matriz 1440/1280/768/
390 Light/Dark não mostrou overflow; Sistema resolveu pela preferência observada do navegador.
Esta evidência não prova integração autenticada com API P7 real nem todos os estados de erro.

## 26. Documentation

Atualizados `docs/architecture/FRONTEND_STRUCTURE.md`, `docs/design/DESIGN_SYSTEM.md`,
`docs/design/UI_SURFACE_INVENTORY.md`, o log visual e a matriz RF. O roadmap S2-04/S2-05 permanece
aberto: RF36 ainda não tem widget padrão para I05; RF54 depende da cobertura de lifecycle/GitHub
externo; a revisão de PR I19 não foi implementada; P9/P10 e a homologação fim a fim permanecem.
Não houve mudança no contrato P7 nem no catálogo canônico de fórmulas.

## 27. Remaining limitations

- **BLOCKING:** homologar o painel em sessão autenticada com API P7/banco reais e dados
  representativos, inclusive sync GitHub externo, antes de promover RF55 ou declarar `PASS LOCAL`.
- **LIMITATION:** recortes de Sprint/responsável marcados `UNSAFE` pelo P7 continuam sem aplicação. A interface
  comunica isso; não atribui história com base no estado atual.
- **LIMITATION:** I03/I05, personalização P9 e indicadores adicionais não entram nas views padrão
  desta rodada.
- **VISUAL:** rótulos dos eixos SVG ficam pequenos em 390 px; legenda, tooltip por teclado e tabela
  fornecem leitura textual.
- **IMPORTANT:** inspeção cross-browser, contraste instrumental e WCAG completa não foram feitas.
- Nenhum commit, push ou CI remoto foi realizado. Sugestão de commit após aprovação:
  `feat: add project analytics dashboard`.
