# S2-07 — Exportação do relatório em PDF (RF57)

- **Data:** 15/10/2026.
- **Branch:** `gt-dev`.
- **Decisão:** [ADR-025](../architecture/ADR-025-RELATORIOS-E-PDF.md) — pdfmake, PDF montado sob
  demanda, sem arquivo armazenado.

## Entrega

- Botão **Baixar PDF** no card de relatório pronto e no relatório aberto.
- PDF A4 com o mesmo recorte e os mesmos dados do relatório do S2-06:
  - cabeçalho em toda página com o projeto e o período;
  - rodapé com `Relatório #N`, data e fuso da geração e `Página X de Y`;
  - capa com os metadados e sumário com o número da página de cada seção;
  - Planejamento com um cartão por Sprint (Burndown em SVG) e tabela de marcos;
  - Rastreabilidade e Indicadores em páginas próprias, com o vocabulário da tela.
- Tabelas com legenda e cabeçalho repetidos em cada página e linhas que nunca se dividem;
  conteúdo maior que uma página (objetivo de Sprint, lista de pessoas de um indicador) continua
  em linhas seguintes, sem omitir nada (PR27-02).
- Acentuação do português com as fontes Roboto embutidas e texto extraível do PDF.
- Leitura visual igual à da tela: resumo no topo (progresso, requisitos concluídos, Saúde do
  Projeto e defeitos pendentes, com barras), selos coloridos de situação em Sprints, marcos e
  requisitos (concluído em verde, atrasado em vermelho), barras de progresso e coluna **Status** em
  cada indicador, com o motivo e a referência da avaliação do painel.

## Backend

| Arquivo | Papel |
| --- | --- |
| `report-pdf.labels.js` | cópia dos rótulos do painel, da Rastreabilidade e do Cronograma |
| `report-pdf.format.js` | mesmas regras de formatação da tela (valores, datas, observações, nomes congelados) |
| `report-pdf.chart.js` | Burndown em SVG com a geometria e as notas do `SprintBurndownChart` |
| `report-pdf.document.js` | definição pura do documento pdfmake |
| `report-pdf.renderer.js` | fontes Roboto, URL negada e leitura local restrita às fontes |
| `report-pdf.runner.js` / `report-pdf.worker.js` | montagem em worker thread: 2 simultâneas, 30 s, heap de 512 MB |
| `report-pdf.message.js` | envelope da mensagem com o PDF; outras mensagens do canal da worker são ignoradas |
| `report.service.js` (`exportPdf`) | só `SUCCEEDED` (409), auditoria obrigatória do download, falhas sem detalhe interno |

Rota `GET /api/projects/:projectId/reports/:reportId/pdf?timeZone` (VIEWER+, limiter
`project-report-pdf`), com `Content-Disposition: attachment`, `Cache-Control: no-store` e
`X-Content-Type-Options: nosniff`. Dependências: `pdfmake` 0.3.11 (runtime) e `unpdf` 1.8.1
(apenas testes), versões exatas e audit sem ocorrências.

## Frontend

`reportsApi.downloadPdf` (blob, fuso do navegador), hook `useReportPdfDownload` (bloqueio de
clique duplo, nome do arquivo igual ao do backend e revogação da URL temporária) e erros no
`FeedbackRegion`, inclusive limite com `Retry-After`. O relatório na tela passou a usar os
mesmos títulos de indicador do painel.

## Testes

- `report-pdf-labels.test.js`: paridade com os módulos do frontend (rótulos, formatação,
  distribuições e nome do arquivo).
- `report-pdf-document.test.js`: identificação em cabeçalho e rodapé, fuso, conteúdo das três
  seções, nomes congelados, valores indisponíveis sem zero, tabelas com cabeçalho repetido e
  linhas indivisíveis, cartão de Sprint em partes, estados vazios e Burndown (lacunas, Sprint
  encerrada, um dia, sem dados, escape do SVG).
- `report-pdf-render.test.js`: PDF real com 120 requisitos lido por `unpdf` (acentuação,
  identificação e número em todas as páginas, cabeçalho repetido nas continuações), conteúdo
  idêntico entre execuções, URL e arquivo local negados, worker com o mesmo resultado,
  limite de concorrência, prazo e erro isolado.
- API: VIEWER baixa o PDF com cabeçalhos corretos e os mesmos dados do relatório; auditoria do
  download; 409 para relatório não pronto; 401/404 opaco; fuso e parâmetros inválidos.
- Regressão `node --watch`: no modo watch o Node envia `{ "watch:import": [...] }` pelo mesmo
  canal da worker antes do PDF. A primeira versão tratava essa mensagem como o PDF e derrubava o
  backend de desenvolvimento no download; o runner passou a aceitar só o envelope próprio e a
  rejeitar resultado inválido sem exceção solta. Teste com workers de fixture e verificação real
  sob `node --watch`.
- Integração: falha de montagem sem detalhe e auditada, servidor ocupado, download bloqueado
  sem auditoria, nome congelado e neutralizado após anonimização, exportação impossível após
  exclusão do projeto.
- Frontend: download pelo card e pelo relatório aberto, estado "Gerando PDF…", erro exibido,
  botão ausente para relatório não pronto e nome do arquivo.

Inspeção do PDF: páginas do relatório de demonstração e de um relatório com 2.000 requisitos e
100 Sprints (157 páginas, cerca de 1,2 s de montagem) renderizadas em imagem e revisadas.

## Verificação

Gates rodados localmente no Windows para as duas entregas (S2-06 e S2-07):

| Gate | Resultado |
| --- | --- |
| Backend lint, Prettier (`--end-of-line auto`), architecture, secrets, `prisma validate` | PASS |
| Backend testes completos | 1.902 PASS, 5 skips; 2 falhas que só ocorrem no Windows e já existiam antes (modo `chmod` e symlink sem privilégio) |
| Backend cobertura (sem os 2 testes acima) | 1.851 PASS; global 92,29% statements, 86,7% branches, 94,77% functions, 94,56% lines (limites 85/70/85/87); módulo `reports` 94,87% statements |
| Frontend lint, Prettier, build | PASS |
| Frontend testes completos | 1.503 PASS; 6 falhas que só ocorrem no Windows e já existiam antes (CSS com CRLF e caminho de fixture) |
| Banco de teste | migrations aplicadas; `prisma migrate diff` entre o banco migrado e o schema sem diferenças; `db:lr5:audit --test` SCHEMA_CONSISTENT |
| `db:test:validate-empty` e `db:test:validate-schema-drift` | não executados localmente: o usuário MySQL local não pode criar os bancos temporários (erro 1044); rodam no CI |
| Audit backend e frontend | 0 high, 0 critical, sem exceção nova |
| Inventário de UI | contagens e taxonomia verificadas |
| Política do CI (`validate-ci`) | 59/59 com finais de linha LF, como no CI |

## Documentação atualizada

[API_CONTRACTS](../api/API_CONTRACTS.md), [ADR-025](../architecture/ADR-025-RELATORIOS-E-PDF.md),
[runbook](../runbooks/PROJECT_REPORTS.md),
[DEPENDENCY_RISK_REGISTER](../security/DEPENDENCY_RISK_REGISTER.md),
[AUTHORIZATION_MATRIX](../security/AUTHORIZATION_MATRIX.md),
[PERSONAL_DATA_INVENTORY](../privacy/PERSONAL_DATA_INVENTORY.md),
[DATA_RETENTION_POLICY](../privacy/DATA_RETENTION_POLICY.md),
[DATA_FLOW_MAP](../privacy/DATA_FLOW_MAP.md),
[RF_TECHNICAL_MATRIX](../traceability/RF_TECHNICAL_MATRIX.md),
[UI_SURFACE_INVENTORY](../design/UI_SURFACE_INVENTORY.md),
[VISUAL_VALIDATION_LOG](../design/validation/VISUAL_VALIDATION_LOG.md) e roadmap.
