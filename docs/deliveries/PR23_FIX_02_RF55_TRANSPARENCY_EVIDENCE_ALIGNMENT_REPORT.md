# PR23-FIX-02 — RF55 Transparency & Evidence Alignment

## 1. Baseline

2026-10-05, `daniel-dev`, HEAD `3cc88159339008fc5cdfc0dfe19e5b01b6b60d85`.
Árvore inicialmente limpa; diffcheck/stat sem saída. Runtime padrão: Node 26.9.0,
npm 11.19.1. Todos os gates: Node **22.23.3**, npm **10.9.9**.
Sem commit/push ou operações de integração/limpeza Git.

## 2. Review findings addressed

| Achado | Correção | Evidência |
| --- | --- | --- |
| HIGH RF55: fórmula/fonte/horário ausentes na UI | Disclosure secundário na ajuda existente | Componente, presenter, testes e inspeção real abaixo |
| HIGH P8.4: aprovação sem pacote versionado | Retificação histórica e `TECHNICALLY VERIFIED` | Auditoria Git/caminhos, nota no relatório e log canônico |

Nenhum cálculo, payload, domínio, Health, filtro, persistência ou dependência alterado.

## 3. RF55 requirement

A matriz RF, o catálogo e `IndicatorResult` exigem identificação de fórmula, fonte
e corte/frescor por indicador. O critério passa a ser acessível na própria ajuda,
incluindo cards reutilizados no Meu painel.

## 4. Previous commercial UX decision

P8.5/P8.6 removeram metadados internos da experiência comum. A ajuda comercial é
preservada. A exclusão de fórmula/fonte/horário foi substituída explicitamente no
Design System, contrato e catálogo, sem restaurar IDs, versões, códigos ou pesos.

## 5. Two-layer help model

`IndicatorCard` estende `DashboardHelp`/`IndicatorHeader`. Definição, valor,
referência e interpretação continuam na primeira camada. `Detalhes do cálculo`
começa fechado; abre conteúdo no mesmo portal, sem modal adicional ou reflow do card.

## 6. Formula presentation

`indicator-audit-display.js` traduz operadores e termos da expressão `formula`
recebida. Não seleciona fórmula por metricId, não calcula valor e não utiliza o
registry comercial de paráfrases como autoridade do cálculo. O teste importa o
catálogo backend puro e verifica todas as **68 definições** contra vazamento de
IDs, campos e operadores internos. A tradução preserva operações e condições.

## 7. Source presentation

`sources[]` é apresentado por vocabulário central: tarefas, movimentações, commits,
PRs, Sprints/histórico, execuções, defeitos e rastreabilidade. Fontes repetidas
são deduplicadas. Nenhuma raw key é impressa. Fontes desconhecidas usam descrição
pública do catálogo ou fallback de uso; nova terminologia do catálogo deve atualizar
o presenter e passar a regressão de metadata.

## 8. Freshness/asOf presentation

Fontes GitHub e as projeções dependentes de evidência técnica/situação/implementação
usam `sourceUpdatedAt`. `sourceSyncStatus` também identifica dependência externa.
Locais usam `asOf`. Sprint congelada continua com corte do cálculo local; não é
apresentada como sincronização externa. `generatedAt` não é usado nesse disclosure.
Clock inválido/ausente ou `UNAVAILABLE` mostra indisponibilidade.

Na API real: GitHub **04/10/2026, 23:39**, cálculo local **05/10/2026**. A diferença
foi conferida visualmente, inclusive nas projeções de Rastreabilidade.

## 9. AVAILABLE

Progresso 69,05%, commits 152 e sucesso de testes 36,67% mantiveram seus valores.
Fórmula, fonte e clock disponíveis somente ao expandir a ajuda.

## 10. PARTIAL

Cycle Time e Burndown da Sprint ativa preservaram parcialidade e limitações nos
cards/seções. A camada de cálculo continua acessível; não completa lacunas nem
modifica as séries/estimativas tratadas pela FIX-01.

## 11. STALE

Badge `Dados desatualizados` preservado. Teste confirma “Última atualização da fonte”
com data anterior e ausência do horário de composição como frescor. Não havia
STALE no recorte real observado; nenhuma integração foi envelhecida artificialmente.

## 12. NO_DATA

Project 13 existente, somente consultado: Progresso mostrou `—`, sem valor disponível,
mas fórmula/fonte acessíveis. O `asOf` identifica a consulta/cálculo local de conjunto
vazio, não atualização de registro inexistente. Para fonte externa sem clock, o
teste mantém atualização indisponível, sem fallback para `asOf`.

## 13. UNAVAILABLE

Project 2/GitHub sem período: fórmula e fonte acessíveis, valor ausente e atualização
indisponível. Não foi usado o timestamp global do Summary para preencher essa lacuna.
Não altera a policy de GitHub NOT_CONFIGURED, fora do escopo.

## 14. Accessibility

Botão nativo de 44px, `aria-expanded`/`aria-controls`, Enter/Space e conteúdo oculto
por padrão. Escape retorna foco ao help; close mantém nome acessível. Portal existente
limita largura/altura e permite rolagem/teclado. Ativação por clique em viewport móvel,
sem dependência de hover. Não constitui certificação de leitor de tela ou touch físico.

## 15. Visual validation

Sessão autenticada no Chrome, Vite/API/MySQL locais reais, Project 2 de homologação.
Período 01–30/09/2026, America/Sao_Paulo; Sprint automática ativa. Sem mock no produto,
seed, escrita de domínio ou sync externa nesta rodada.

| Surface/help | 1440 Light/Dark | 390 Light/Dark | Observação |
| --- | --- | --- | --- |
| Geral / Progresso | Inspecionado | Inspecionado | Camadas fechada/aberta; cálculo local |
| GitHub / Commits | Inspecionado | Inspecionado | Fonte sincronizada, frescor próprio |
| Fluxo / Cycle Time | Inspecionado | Inspecionado | Histórico, PARTIAL, clock local |
| Sprint / Burndown | Inspecionado | Inspecionado | Fonte histórica e parcialidade preservadas |
| Qualidade / Taxa de sucesso | Inspecionado | Inspecionado | Expressão percentual e execuções |
| Rastreabilidade / Implementação | Inspecionado | Inspecionado | Referência comercial e clock externo |

Tablet 768 Light: GitHub/Fluxo e NO_DATA/UNAVAILABLE. Ajuda de 400px desktop/tablet,
358px mobile, margens ≥16px; sem overflow global observado. Conteúdo longo rolado
até o clock, legível nos dois temas. Inspeção do frame atual complementou DOM/AX;
captura prematura durante rolagem foi substituída pelo frame final.

Console capturado sem warnings/errors. Tema Escuro, sidebar expandida e viewport
original restaurados; aba temporária de inspeção encerrada.

Pacote próprio: [evidências PR23-FIX-02](../design/validation/evidence/pr23-fix-02/README.md).
Arquivos incluídos no working tree para revisão/versionamento; nenhum commit feito.

## 16. Design System alignment

Decisão vigente de duas camadas documentada. Anatomia P8/P8.2 e exclusão P8.5/P8.6
marcadas como históricas/substituídas onde conflitavam. Regras de tokens, target,
portal, foco e metadados internos permanecem consistentes.

## 17. RF matrix

RF55 permanece `IMPLEMENTADO LOCALMENTE` com referências específicas a `IndicatorCard`,
`DashboardHelp`, presenter, dois testes, contrato `IndicatorResult`, log e pacote desta
rodada. O status não completa S2-04/S2-05 ou outros RFs por inferência.

## 18. P8.4 evidence audit

`git ls-files docs/design/validation` tinha somente o log. A pasta `evidence/s2-p8-4`
citada na seção 36 do relatório não existia no checkout; `git log --all -- <pasta>`
não retornou histórico. Não foram encontrados originais identificáveis pelos nomes
P8.4 nos artefatos de `/private/tmp`. Não há origem comprovável para recuperar aquele
pacote; aplicada a opção B, sem afirmar ausência em toda a máquina.

## 19. Visual status correction

Declarações originais do relatório preservadas com nota de retificação no início.
As duas entradas afetadas do inventário passaram de status fora da taxonomia a
`TECHNICALLY VERIFIED`, com owners/rotas atuais e distinção do registro histórico.
Não há nova aprovação canônica da P8.4. O log registra a ausência do pacote original.

## 20. Current evidence authority

Observações próprias P8.6F/P10 permanecem no log, atribuídas àquelas rodadas, sem
reclassificá-las como evidência P8.4. A ajuda atual recebe validação própria FIX-02,
limitada à matriz acima. Nota no P10 retifica somente RF55/evidência. Nenhuma imagem
atual foi renomeada ou tratada como original de setembro.

## 21. Tests

**84 PASS / cinco arquivos focados:** DashboardPanel, audit presenter,
IndicatorPresentation, IndicatorDurationTrend e IndicatorChart. Cobrem ajuda,
Data States, clocks, ausência de raw keys, teclado, fechamento e regressões de gráficos.
O teste que fixava ausência de cálculo foi substituído por camada fechada por padrão
e fórmula/fonte/horário visíveis ao expandir.

## 22. Full gates

| Gate local Node 22 | Resultado |
| --- | --- |
| Frontend full | 1.398 PASS, 115 arquivos |
| Frontend coverage | 1.398 PASS; statements 85,87%, branches 80,42%, functions 81,70%, lines 88,32% |
| Frontend lint / format / build | PASS |
| Backend regressão canônica completa (coverage: unit/API/integration) | 1.574 PASS, cinco skips legados |
| Backend coverage | statements 92,42%, branches 86,18%, functions 95,73%, lines 94,80%; thresholds PASS |
| Backend lint / format | PASS |
| Prisma validate / generate | PASS; sem schema/migration nova |
| Architecture / secrets | PASS |
| CI validation / audit policy tests / CI formatting | PASS; 83 testes e validação executável `true` |
| Security/dependency gate backend/frontend | PASS; 0 HIGH, 0 CRITICAL, 0 exceções consumidas |
| git diff --check | PASS |

Helper confirmou `NODE_ENV=test`, localhost, `traceflow_test`, URL distinta e read_only=0
antes da regressão. MySQL local **26.7.0**, diferente do CI **8.4.8**: não é CI-equivalent
ou execução hospedada. Cinco skips preexistentes E6/E11 preservados. Acesso MySQL/registry
no sandbox falhou; execuções autorizadas fora dele passaram. Nenhuma policy relaxada.

## 23. Remaining limitations

STALE foi coberto por teste, não por alteração artificial da fonte real. Sem leitor de
tela/touch físico, certificação WCAG, outros browsers ou CI remoto. O aviso de chunk
ELK grande é preexistente; não foi adicionada dependência. Evidência P8.4 original
continua ausente e não poderá sustentar promoção retroativa.

## 24. Final verdict

**PR23-FIX-02 RF55 TRANSPARENCY & EVIDENCE ALIGNMENT — PASS LOCAL**

HIGHs desta rodada encerrados no escopo local registrado. Sem commit/push ou FIX-03.
Sugestão: `fix: restore indicator auditability and align visual evidence`.

### Complemento posterior — PR23-FIX-02.1

A ajuda em duas camadas permanece. A revisão posterior conferiu os 68 cálculos
contra suas implementações e normalizou `formula` na autoridade backend, substituindo
a tradução de termos do presenter descrita neste relatório histórico. Label vigente
**Como é calculado**; clocks, Data States e RF55 preservados. Evidência atual em
[PR23-FIX-02.1](PR23_FIX_02_1_INDICATOR_FORMULA_AUDIT_PRESENTATION_REPORT.md).
