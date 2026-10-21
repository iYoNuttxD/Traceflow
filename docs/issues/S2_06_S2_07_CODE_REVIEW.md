# Code Review — S2-06 (RF37) e S2-07 (RF57)

Revisão feita conforme o [padrão de Code Review](../engineering/CODE_REVIEW_STANDARD.md), em
20/10/2026, sobre o working tree da branch `gt-dev` com base em `origin/main` `66a5dba7` (PR #26
incluída). Escopo: módulo `backend/src/modules/reports`, integrações nos módulos de indicadores,
rastreabilidade, privacidade, configurações, manutenção e segurança, a migration
`20261014120000_s2_06_project_reports`, `frontend/src/features/reports`, rotas, navegação, testes e
documentação das duas tasks. Os findings abaixo foram corrigidos nesta mesma rodada, a pedido do
responsável pelas tasks, antes da revisão por outro colega.

# Verdict: APPROVED WITH RESERVATIONS

## Findings

| ID         | Severity | File:line                                                  | Summary                                                          | Status    |
| ---------- | -------- | ---------------------------------------------------------- | ---------------------------------------------------------------- | --------- |
| TF-REV-001 | LOW      | `backend/src/modules/reports/report.repository.js`         | Método `findStaleCandidates` sem nenhum consumer                 | CORRIGIDO |
| TF-REV-002 | LOW      | `frontend/.../model/report-summary.js`, `report-summary.js` | Saúde do Projeto sem nota escondia o status no resumo             | CORRIGIDO |
| TF-REV-003 | LOW      | `frontend/src/features/reports/ReportsScreen.css`          | Título da visão abaixo do cabeçalho da tabela de indicadores     | CORRIGIDO |
| TF-REV-004 | LOW      | `backend/src/modules/reports/report-pdf.document.js`       | Selos do PDF sem cor de fundo dentro de células preenchidas      | CORRIGIDO |
| TF-REV-005 | INFO     | `backend/package-lock.json`, `frontend/package-lock.json`  | Gate de supply chain bloqueado por alertas novos em dependências | CORRIGIDO |
| TF-REV-006 | INFO     | `backend/prisma/migrations/20261014120000_s2_06_project_reports` | Hora do nome da migration fora da sequência do dia         | REGISTRADO |

### TF-REV-001 — Método de repositório sem uso

- Observed: `reportRepository.findStaleCandidates` existia, mas nenhum service, script ou teste o
  chamava; a expiração de gerações abandonadas acontece por `findActive` + `expireIfStillStale`.
- Expected: superfície mínima no repositório (Engineering quality).
- Evidence: busca por `findStaleCandidates` em `src` e `test` retornava só a definição.
- Impact: código morto sugere um varredor de gerações abandonadas que não existe.
- Recommendation: remover. Feito.

### TF-REV-002 — Saúde do Projeto sem nota no resumo

- Observed: com `projectHealth.score = null` (amostra insuficiente), o resumo mostrava só "—", sem
  o status, enquanto o `ProjectHealthSummary` do painel mostra "Dados insuficientes".
- Expected: mesmo vocabulário do painel (ADR-025, paridade de apresentação).
- Evidence: `reportOverview` exigia `typeof health.score === 'number'` para devolver a saúde.
- Impact: o relatório omitia uma informação que o painel exibe para o mesmo recorte.
- Recommendation: manter `status` com `score: null`; tela e PDF mostram o selo sem a barra. Feito,
  com regressão em `report-pdf-status.test.js`.

### TF-REV-003 — Legenda da tabela de indicadores fora do lugar

- Observed: `display: flex` direto no `caption` tirava o elemento do papel de legenda e o título
  da visão aparecia abaixo do cabeçalho.
- Expected: legenda no topo da tabela, como nas demais tabelas do relatório.
- Evidence: inspeção no Chrome do relatório #8 do projeto de exemplo.
- Recommendation: aplicar o flex num `div` interno (`.report-caption`). Feito.

### TF-REV-004 — Selos sem fundo no PDF

- Observed: selos dentro de células com `fillColor` (resumo e cartões de Sprint) apareciam só com o
  texto colorido; o pdfmake pinta o fundo da célula externa por cima da tabela interna.
- Expected: selo com fundo, igual ao restante do PDF.
- Evidence: páginas renderizadas com pymupdf antes e depois da correção.
- Recommendation: retirar o fundo das células externas e manter a borda colorida. Feito.

### TF-REV-005 — Supply chain bloqueado

- Observed: `scripts/check-npm-audit.mjs` bloqueia os dois projetos por alertas publicados depois
  da baseline: `vite` (GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw, GHSA-587h-7wmj-h5pm) e, no
  frontend, `follow-redirects` (GHSA-q3jh-wrc6-jgq8, GHSA-8r9p-f939-6h3c).
- Expected: gate sem ocorrência high/critical (CI, job Supply Chain).
- Evidence: o mesmo resultado no lockfile do `main` atual; as dependências novas das tasks
  (`pdfmake`, `unpdf`) não aparecem no audit.
- Impact: o job Supply Chain falha em qualquer PR até a atualização.
- Recommendation: `npm audit fix` sem `--force`, que muda só os lockfiles, dentro das faixas
  declaradas (`vite` 8.3.4, `follow-redirects` 1.16.1). Aplicado nesta PR, por decisão do responsável
  pelas tasks; gate aprovado nos dois projetos e registrado no
  [DEPENDENCY_RISK_REGISTER](../security/DEPENDENCY_RISK_REGISTER.md).

### TF-REV-006 — Nome da migration

- Observed: a hora `120000` não segue a sequência do dia (`010000`).
- Expected: [DATABASE_MIGRATIONS](../runbooks/DATABASE_MIGRATIONS.md).
- Evidence: a migration já está aplicada no banco de desenvolvimento; o runbook proíbe renomear
  migration aplicada e pede o registro do desvio, feito no relatório da S2-06.
- Recommendation: nenhuma ação.

## Validation by area

| Area | Status | Evidence |
| ---- | ------ | -------- |
| Arquitetura | PASS | `npm run architecture:check`; o módulo consome `dashboardService`, `sprintService` e `requirementProjectionService` pelos `index.js`; o frontend usa os `index.js` de indicators, schedule e traceability |
| Autenticação, autorização e segurança | PASS | API: 401 sem sessão, 404 opaco para não membro e relatório de outro projeto, VIEWER lê e baixa, MEMBER gera; CSRF e limiters `project-report` e `project-report-pdf`; pdfmake nega URL e arquivo local (teste de render); download só com auditoria gravada |
| GitHub | N/A | Sem mudança no módulo GitHub; o snapshot lê o painel existente |
| Banco e migrations | PASS | Migration aditiva; FKs com cascata do projeto e `SET NULL` no solicitante; reserva única `activeProjectId`; `prisma validate`; `migrate deploy` no banco de desenvolvimento (83 migrations) e `migrate diff` sem drift |
| API e assíncronos | PASS | Geração com reserva, claim, heartbeat, lease e prazo; conclusão confere a lease na mesma transação; FAILED é estado do DTO; testes de concorrência (4 pedidos → 1 relatório; 2 execuções → 1 conclusão) e de execução abandonada |
| Frontend e CSS | PASS | Estados de carregamento, vazio, filtrado vazio, erro, geração ativa e falha; polling só com geração ativa; CSS no owner `ReportsScreen.css` com tokens; inline style só na largura calculada das barras; inspeção no Chrome em tema escuro |
| Comentários e qualidade estática | PASS | ESLint e Prettier (`--end-of-line auto`) nos dois projetos; comentários explicam invariantes (lease, congelamento de nomes, worker, paridade) |
| Testes, CI e documentação | PASS | Backend 3.112 testes e frontend 1.749 testes passando; módulo `reports` com 95,94% de statements; build ok; documentação atualizada (contratos, ADR-025, privacidade, autorização, retenção, inventário de UI, log visual, matriz RF, roadmap, runbook) |
| Privacidade e observabilidade | PASS | Snapshot só com `userId` (varredura do relatório #8 sem nomes, logins ou e-mails); anonimização neutraliza `ProjectReportPerson`; export pessoal; retenção de FAILED; logs com `reportId` e códigos, sem PII |

## External validations

| Validation | Status | Evidence or exact dependency |
| ---------- | ------ | ---------------------------- |
| CI remoto | NOT RUN | Depende do push da branch e da abertura da PR |
| `db:test:validate-empty` e `db:test:validate-schema-drift` | NOT RUN | O usuário MySQL local não cria bancos temporários (erro 1044); a CI executa os dois |
| Inspeção em tema claro e larguras menores | NOT RUN | Tela inspecionada em tema escuro, desktop |
| GitHub real | N/A | O projeto de exemplo usa repositório fictício só no banco local |

## Residual risks

- A geração roda no processo da API (`setImmediate`): um restart durante a geração deixa o registro
  RUNNING até a lease vencer (5 min), quando a próxima leitura o encerra como FAILED.
- O limite de duas montagens de PDF simultâneas é por processo.
- PDFs já baixados ficam fora da retenção e da anonimização.
- Falhas que não vêm destas tasks: 6 testes do S2-03 (`s203-bateria`, `s203-correcoes`,
  `s203-github-event-dispatch`) falham também no `main` puro nesta máquina; 2 testes de permissão e
  symlink e 6 testes de CSS com CRLF falham só no Windows.

## Merge recommendation

Sem finding aberto que exija mudança no código das tasks. Antes do merge: rodar a CI completa da PR
e avisar o autor do S2-03 sobre os seis testes que falham localmente.
