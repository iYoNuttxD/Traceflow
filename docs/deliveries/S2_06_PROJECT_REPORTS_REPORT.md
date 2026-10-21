# S2-06 — Relatórios resumidos do projeto (RF37)

- **Data:** 15/10/2026.
- **Branch:** `gt-dev`.
- **Decisão:** [ADR-025](../architecture/ADR-025-RELATORIOS-E-PDF.md).

## Entrega

- Aba **Relatórios** no projeto: lista de relatórios em cards, pedido de geração com período e
  Sprint opcionais, acompanhamento da geração e leitura do relatório pronto.
- Painel **Visão geral dos relatórios** (`SummaryPanel` compartilhado): total, prontos, em geração,
  com falha e último relatório pronto, do projeto inteiro (`summary` na resposta da lista).
- Painel **Buscar e filtrar** na lista, igual ao das outras abas: situação, Sprint, solicitante e
  período, aplicados pela API (`status`, `sprintId`, `requestedByUserId`, `startDate`, `endDate`).
- Resumo visual no topo do relatório e **status de cada métrica** (Saudável, Atenção, Crítico,
  Dados insuficientes, Informativo) com o motivo e a referência do painel; Sprints, marcos e
  requisitos com cores por situação e barras de progresso (`model/report-summary.js`, conferido
  contra a cópia do PDF em `report-pdf-status.test.js`).
- Relatório com três seções, montadas pelos mesmos services das abas de origem:
  - **Planejamento:** Sprints do recorte com progresso e Burndown, e marcos.
  - **Rastreabilidade:** situação atual de cada requisito.
  - **Indicadores:** as oito visões do painel com os mesmos valores, estados e observações.
- Registro do recorte, do projeto, da data de geração e de quem pediu, com o nome congelado
  na geração.

## Backend

| Item | Implementação |
| --- | --- |
| Modelo | `ProjectReport` (status, recorte, tempos, erro sanitizado, snapshot JSON versionado) e `ProjectReportPerson` (nomes congelados); migration `20261014120000_s2_06_project_reports` |
| Migration | criada em 14/10/2026 (UTC); a hora `120000` não segue a sequência do dia (`010000`) e o nome foi mantido porque a migration já estava aplicada no banco de desenvolvimento, conforme [DATABASE_MIGRATIONS](../runbooks/DATABASE_MIGRATIONS.md) |
| API | `POST/GET /api/projects/:projectId/reports` e `GET .../reports/:reportId` |
| Geração | segundo plano com reserva única por projeto, claim, heartbeat, lease e prazo; conclusão atômica com conferência da lease |
| Consistência | `dashboardService`, `sprintService` e `requirementProjectionService` expostos pelos `index.js` dos módulos de origem; nenhum cálculo duplicado |
| Falhas | fonte do painel indisponível, volume acima do teto, snapshot grande demais, prazo e execução abandonada terminam `FAILED` com código próprio |
| Segurança | gerar MEMBER+; ler VIEWER+; 404 opaco para projeto alheio; CSRF; limiter `project-report`; auditoria `REPORT_REQUESTED` e `REPORT_GENERATED` |
| Privacidade | snapshot só com `userId`; anonimização neutraliza os nomes congelados; export pessoal `project-reports.json`; FAILED removido após 180 dias pelo `privacy:retention` |

## Frontend

`features/reports` com API, hooks de lista e detalhe (polling só durante geração ativa), cards,
diálogo de pedido e documento. Reutiliza `sprint-card`, `new-milestone-card`, `SprintDialog`,
`FeedbackRegion`, o `SprintBurndownChart` do Cronograma e os rótulos e formatadores do painel
(exportados pelos `index.js` de indicators, traceability e schedule). Os títulos dos indicadores
seguem os do painel (`METRIC_TITLES`).

## Testes

- API (`test/api/reports.test.js`): autorização por papel, IDOR, projeto excluído, validação,
  geração com as três seções, auditoria, nome congelado, geração já ativa, execução abandonada,
  paginação e **igualdade de cada indicador, da rastreabilidade e da evolução da Sprint com as
  APIs de origem** para o mesmo recorte.
- Integração (`test/integration/reports.test.js`): falhas (código do módulo, erro genérico, fonte
  indisponível, prazo, falha ao gravar, lease perdida), volume (250 requisitos, teto, tamanho),
  concorrência (4 pedidos simultâneos geram 1 relatório; 2 execuções concluem 1), anonimização,
  export pessoal, retenção e cascade.
- Unidade: `report-people`, `report-validation`.
- Frontend: `ReportsScreen.test.jsx` e `report-display.test.js`.

## Verificação

Detalhada no [relatório S2-07](S2_07_REPORT_PDF_EXPORT_REPORT.md#verificação), que cobre as duas
entregas no mesmo ciclo de gates.

## Documentação atualizada

[API_CONTRACTS](../api/API_CONTRACTS.md), [REPORT_HISTORY](../data/REPORT_HISTORY.md),
[AUTHORIZATION_MATRIX](../security/AUTHORIZATION_MATRIX.md),
[PERSONAL_DATA_INVENTORY](../privacy/PERSONAL_DATA_INVENTORY.md),
[DATA_RETENTION_POLICY](../privacy/DATA_RETENTION_POLICY.md),
[DATA_FLOW_MAP](../privacy/DATA_FLOW_MAP.md),
[SYSTEM_ARCHITECTURE](../architecture/SYSTEM_ARCHITECTURE.md),
[RF_TECHNICAL_MATRIX](../traceability/RF_TECHNICAL_MATRIX.md),
[TECHNICAL_BACKLOG](../issues/TECHNICAL_BACKLOG.md),
[UI_SURFACE_INVENTORY](../design/UI_SURFACE_INVENTORY.md),
[runbook](../runbooks/PROJECT_REPORTS.md) e roadmap.
