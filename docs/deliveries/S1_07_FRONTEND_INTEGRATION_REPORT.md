# TRACEFLOW S1-07 — FRONTEND INTEGRATION REPORT

Data: 2026-09-07. **Backend e frontend integrados localmente.** Gates técnicos
PASS. Homologação visual completa e code review integrado permanecem pendentes;
CI remoto **NOT RUN**. Nenhum commit ou publicação.

## A. Git baseline

- Checkout: `/Users/daniel/Coding/Traceflow`.
- Branch: `daniel-dev`.
- HEAD: `b5732ca41cf66b1520e46edbb07c9d4c2d59ed16`.
- Working tree já modificado pelo backend S1-07, protótipo e refinamentos anteriores.
- Snapshot de 877 paths antes da integração, com hashes, status, HEAD e diff em
  `/tmp/traceflow-s107-frontend-baseline`. Alterações pré-existentes fora do escopo preservadas.

## B. Backend contract inspected

Inspecionados schema Prisma, routes/controller/presenter/schema/services/repositories
S1-07, validação de arquivos, API_CONTRACTS, AUTHORIZATION_MATRIX,
RF_TECHNICAL_MATRIX, TEST_CASE_HISTORY e testes executáveis locais.

| Contrato | Resultado da auditoria |
| --- | --- |
| `/projects/:projectId/test-cases` GET/POST | Lista `{items,total,page,limit,summary}`; criação `{testCase}` |
| `/test-cases/:id` GET/PUT/DELETE | Detalhes e capabilities; PUT parcial com status e expectedVersion; DELETE 204 lógico |
| `/test-cases/:id/status` PATCH | Existe; edição usa o PUT atômico que já aceita status |
| `/test-cases/:id/versions` | Versões paginadas e snapshotJson; UI usa currentVersion e histórico funcional |
| `/test-cases/:id/history`, `/executions` GET | `{items,nextCursor}`; cursor vinculado ao caso e stream |
| `/test-cases/:id/tested-references` | PR/Commit importados, relacionados primeiro, search e limit |
| `/test-cases/:id/executions` POST | Multipart com payload e arquivos; retorna execução histórica completa |
| `/test-executions/:id` | Snapshot da definição, referência, executor, resultados e evidências |
| `/test-evidence/:id/content` | Download autenticado privado, inclusive após exclusão lógica |

Enums: `ATIVO/INATIVO`; `PASS/FAIL/BLOCKED`; filtro `NEVER_EXECUTED`;
`LOCAL/DESENVOLVIMENTO/HOMOLOGACAO`; `PULL_REQUEST/COMMIT`.
Erros relevantes: 400 validação, 401 sessão, 403 permissão, 404 opaco,
409 `TEST_CASE_VERSION_CONFLICT` / `TEST_CASE_INACTIVE`, 413 quota, 415 multipart,
503 storage. Limites descritos em L. Leitura VIEWER+, escrita MEMBER+.
**BACKEND CONTRACT GAP: nenhum impeditivo encontrado.** Requirements e Tasks
aceitam busca no servidor, mas não oferecem limit/paginação; o frontend não baixa
catálogos completos para simular autocomplete nem envia parâmetros inexistentes.

## C. Prototype removal

- Fixtures runtime removidas: `test-cases-prototype/fixtures/scenario.js`.
- Estado simulado removido: `state/useTestCases.js` anterior.
- Banner, controles de cenário e reset removidos.
- Page e feature antigas substituídas por um único runtime integrado.
- Runtime mocks remaining: **NONE** na feature S1-07.
- Fixtures atuais existem apenas em `frontend/test/testCases/fixtures.js`.
- Documento do protótipo preservado como registro histórico, com status
  `DESIGN BASELINE IMPLEMENTED` e indicação do contrato vigente.

## D. Feature structure

```text
frontend/src/features/testCases/
  TestCasesScreen.jsx
  index.js
  api/test-cases.api.js
  hooks/useTestCases.js
  hooks/useTestCaseScope.js
  hooks/useCaseRead.js
  model/test-cases.js
  components/
    TestCaseList.jsx
    TestCaseForm.jsx
    TestCaseDetails.jsx
    TestCaseHistory.jsx
    TestCaseDialogContent.jsx
    TestExecutionWizard.jsx
    Parts.jsx
    PersistedEvidence.jsx
  styles/test-cases.css
frontend/src/pages/TestCasesPage.jsx
frontend/test/testCases/
  TestCases.test.jsx
  concurrency.test.jsx
  model-api.test.js
  evidence-focus.test.jsx
  fixtures.js
```

API sem estado de UI, componentes sem fetch/axios direto. Alterações compartilhadas
restritas ao cliente HTTP (fresh reads, distinção JSON/blob e erro JSON em blob) e
ao focus trap de SprintDialog (excluir descendentes ocultos/inert e controles
inabilitados por fieldset). SearchCombobox, filtros, menu e confirmação reutilizados.

## E. Routes

Rota final: `/projects/:projectId/test-cases`, por lazyNamed e Suspense globais.
Tab **Casos de teste** preservada entre Cronograma e Repositório, no projeto real.

## F. Main Screen

Header e composição C2 preservados. Summary exclusivamente do backend, independente
dos filtros e páginas carregadas. Grid contínuo com deduplicação por ID e botão
`Carregar mais casos`; sem navegação de páginas. Loading, vazio, vazio filtrado,
erro/retry e warning de reconciliação distintos. Cards mostram lifecycle separado
do resultado, Requirement, quantidade de Tasks e latestExecution real.

## G. Filters

- Search de TC-ID/título: servidor, debounce de 300 ms.
- Status e latest result: enums reais; nunca executado envia `NEVER_EXECUTED`.
- Responsável: catálogo real de membros do projeto; inativos identificados quando retornados.
- Requirement: `requirementsApi.listByProject(..., {search})`.
- Task: `tasksApi.list(..., {search})`.
- Selectores usam SearchCombobox canônico, busca assíncrona e latest-wins.
- Troca de filtro invalida a leitura anterior, limpa páginas e retorna à página 1;
  summary continua sendo o agregado do projeto.

## H. Create

Responsável ativo obrigatório, rastreabilidade opcional, Requirement singular e
múltiplas Tasks. Um passo vazio inicial, máximo 100, editores em duas colunas no
desktop e uma no breakpoint do container. Limites de texto centralizados conforme
backend; erros associados e primeiro inválido focado. POST único, sem IDs persistidos,
autor, timestamp ou versão sintetizados pelo cliente. IDs locais só identificam
itens de rascunho/React e são removidos do payload.

## I. Edit/versioning

Carrega detalhes atuais. PUT único inclui `expectedVersion` e status; `currentVersion`
vem da resposta. Frontend não calcula incremento. Conflito preserva rascunho e modal,
bloqueia nova tentativa na versão antiga e orienta recarregar antes de salvar.
Sem retry ou merge automático. Erros estruturados de campos são associados ao formulário.

## J. Delete

ConfirmProvider e microcopy de exclusão lógica. Modal operacional fecha antes da
confirmação; cancelamento pode restaurar detalhes. Sucesso remove o card imediatamente,
invalida leituras anteriores e atualiza a lista/summary. Tombstones locais impedem
ressurreição por resposta antiga; histórico persistido permanece no backend.

## K. Execution

Assistente vinculado à currentVersion recebida. Referência obrigatória pelo endpoint
real, relacionados primeiro e fallback de busca no mesmo projeto. Chaves de opções
incluem tipo para evitar colisão PR/Commit; payload usa o ID numérico original.
Ambiente real, resultados por posição e observação obrigatória em FAIL/BLOCKED.
Resumo mostra cinco contagens; resultado derivado local é apenas prévia.

FormData contém `payload` JSON, `stepEvidence.N` e `evidence`. Não define manualmente
Content-Type/boundary nem envia autor, horário, texto de snapshot ou resultado geral.
Timeout de upload explícito, sem retry automático. Lock síncrono previne duplicação;
pendência bloqueia fechar, Escape, cancelamento e controles. Confirmação usa ID/result
retornados. Conflito mantém arquivos/observações. Falha ambígua de rede mantém rascunho,
não declara rollback e oferece consulta ao histórico antes de nova tentativa.

## L. Evidence

Passos: PNG, JPG/JPEG, WEBP, MP4, WEBM, MOV. Gerais: os anteriores mais PDF, TXT,
LOG, JSON. `accept` explicita extensões e MIME; validação client-side é preventiva.
Backend continua autoridade sobre bytes, formato real, quota e autorização.

| Limite padrão espelhado | Valor |
| --- | ---: |
| Não vídeo | 10 MiB |
| Vídeo | 50 MiB |
| Por passo | 3 |
| Gerais | 5 |
| Total de arquivos | 20 |
| Total de bytes | 100 MiB |

PNG/JPEG/WEBP têm preview local e URL revogada ao remover/sair; sem autoplay de vídeo.
Arquivo permanece no draft até concluir/cancelar. Download usa httpClient autenticado
em blob, nome do DTO, tamanho real em bytes e URL temporária revogada; erros mantêm
o detalhe histórico aberto. Respostas JSON de erro em transporte blob passam pelo
tratamento canônico de sessão.

## M. History

Um SprintDialog, abas acessíveis **Execuções** (default) e **Alterações**, usando
classes canônicas de tabs. Streams com cursor/load-more e deduplicação por ID.
Histórico funcional usa ação, timestamp, actorUserId, versões e metadados reais;
sem inventar nome do autor ausente no DTO. Breadcrumb discreto com displayId recebido.
Execution Details usa exclusivamente caseVersionSnapshot, steps e evidence históricos;
anexos de passos por executionStepId e gerais por null. Não consulta o cadastro atual
para reconstruir uma execução anterior.

## N. Async/race protection

Visita ao projeto e identidade do recurso têm scopes e gerações próprios. Cada
leitura possui token e AbortController; aceitação exige token atual, não somente
mounted ou AbortSignal. A→B, troca de caso/execução/stream e filtros descartam respostas
antigas. Confirmação de mutation invalida as projeções e aplica o DTO recebido.
`fresh` evita deduplicar GET pós-mutation com uma promise anterior ainda pendente;
logout continua cancelando essas requisições. SearchCombobox mantém sua autoridade
por request ID. Testes usam promises controladas, inclusive transporte que ignora abort.

## O. Mutation reconciliation

| Mutation | Confirmed state preserved if refresh fails? |
| --- | --- |
| Create | Sim; DTO salvo e feedback permanecem, warning separado |
| Update | Sim; definição retornada permanece, sem recuperar versão antiga |
| Delete | Sim; card removido, resposta antiga não o recria |
| Execute | Sim; latestExecution e ID/result confirmados permanecem |

Summary anterior é sinalizado como desatualizado enquanto sua reconciliação não
conclui; não é reconstruído a partir dos cards carregados.

## P. Authorization UI

| Capability | VIEWER | MEMBER | MANAGER | OWNER |
| --- | --- | --- | --- | --- |
| List | Sim | Sim | Sim | Sim |
| Details | Sim | Sim | Sim | Sim |
| Create | Não | Sim | Sim | Sim |
| Edit | Não | Sim | Sim | Sim |
| Delete | Não | Sim | Sim | Sim |
| Execute | Não | Sim, ativo | Sim, ativo | Sim, ativo |
| History | Sim | Sim | Sim | Sim |
| Evidence | Download | Download/upload | Download/upload | Download/upload |

Papel de membership real e capabilities orientam UI; responsável não restringe o
executor. Backend revalida permissão. Não foi criado papel Admin ou bypass de autorização.

## Q. Focused tests

**190 PASS, 10 arquivos**, executados com Node 22. Incluem `test/testCases`, cliente
HTTP, SearchCombobox, SprintActionsMenu, Sprints, Milestones e navegação de projeto.
Cenários de payload, limites, versões, roles, multipart, sucesso+refresh-fail nas quatro
mutations, cursores, races por contexto, previews, download e foco.

## R. Full frontend tests

`npm test`: **843 PASS, 73 arquivos**. Nenhum teste ignorado nessa execução.
`npm run test:coverage` repetiu a suíte completa com **843 PASS** após os ajustes finais.
Fixtures/reset exclusivos do protótipo foram substituídos por cenários de API;
regressões existentes dos demais módulos foram preservadas.

## S. Coverage

| Métrica | Frontend completo | Feature testCases |
| --- | ---: | ---: |
| Statements | 81,86% | 88,33% |
| Branches | 75,88% | 83,33% |
| Functions | 77,92% | 86,51% |
| Lines | 84,12% | 90,73% |

Thresholds existentes passaram; não foram reduzidos nem criadas exclusões para a feature.

## T. Regression tests

SearchCombobox e SprintActionsMenu no gate focado; Sprints e Milestones completos no
mesmo gate. Kanban/shared consumers, Task Details, confirmações, autenticação e
navegação na suíte completa. Teste específico garante que o focus trap não alcança
rascunho oculto nem controles de um fieldset disabled. Backend S1-07: **120 PASS**
(80 unitários, 29 integração, 11 API) no schema exclusivo, sem mudar implementação.

## U. Browser integration smoke

Ambiente: Safari nativo, frontend/backend locais separados, conta artificial,
schema exclusivo `traceflow_s107_20260907_test`. Nenhuma fixture ou fallback inserido
no runtime da aplicação. Pré-requisitos (membro, Requirement, Task, Commit e PR)
persistidos como fixtures de teste, sem sync ou chamada ao GitHub.

| Verificação | Resultado observado |
| --- | --- |
| Criar caso com membro, Requirement e Task buscados no servidor | PASS; TC-516 v1 |
| Editar definição até v3 pela UI | PASS; v2 e v3 confirmadas |
| Registrar cinco passos PASS e PNG no passo 3 pela UI | PASS; EXEC-0313 |
| Upload conjunto PNG/MP4/JSON inteiramente pela UI | ENVIRONMENT BLOCKED; seletor nativo inconsistente |
| Complemento HTTP com PNG/MP4/JSON e cinco passos | PASS; EXEC-0314 v3; MP4 H.264 artificial de 1 segundo |
| Editar caso para v4 por HTTP e abrir v3 histórica na UI | PASS; pré-condição v4 atual e v3 histórica distintas |
| Histórico funcional e execuções reais no frontend | PASS; criação, v2, v3, v4 e ambas execuções |
| Download JSON pela UI | PASS; arquivo em disco com hash igual à fixture |
| Três downloads HTTP autenticados | PASS; SHA-256 idêntico para PNG, MP4 e JSON |
| Exclusão pela UI | PASS; card ausente e summary zero |
| Histórico após exclusão | PASS na inspeção persistida: v3, cinco passos e três evidências preservados |

Execução imutável observada: **EXEC-0314**, caso **TC-516**, versão histórica **3**,
versão atual **4**, referência **COMMIT importado**. PNG vinculado ao passo 3, MP4 ao
passo 5 e JSON com executionStepId null. Não usa IDs ou nomes fictícios no runtime.
O teste HTTP complementar não é apresentado como upload UI PASS.

Limitações nativas observadas: botão Enviar desabilitado apesar da seleção,
`noWindowsAvailable`, clipboard timeout e mudança de estado do aplicativo. Extensões
e MIME foram explicitados, mas não houve comprovação de resolução completa do seletor.

Limpeza concluída: schema exclusivo vazio; armazenamento privado, arquivos de entrada
e JSON baixado removidos após verificação; aba e servidores de teste encerrados.
O banco/servidor/conta de desenvolvimento não foram modificados por esse smoke.

## V. Visual validation

`EB` = **ENVIRONMENT BLOCKED**, não aprovação. Nenhum browser provider com controle
mensurável de viewport estava disponível. O controle nativo do Safari permitiu
capturas e interação; o atalho responsivo não disponibilizou dimensões verificáveis.
A dimensão da captura não foi confundida com CSS pixels do viewport.

| Surface | Light 1440 | Dark 1440 | Light 768 | Dark 768 | Light 390 | Dark 390 |
| --- | --- | --- | --- | --- | --- | --- |
| Main | EB | EB | EB | EB | EB | EB |
| Filters | EB | EB | EB | EB | EB | EB |
| Create | EB | EB | EB | EB | EB | EB |
| Details | EB | EB | EB | EB | EB | EB |
| Execute | EB | EB | EB | EB | EB | EB |
| History | EB | EB | EB | EB | EB | EB |
| Execution Details | EB | EB | EB | EB | EB | EB |

**1280 Light/Dark: EB** pelo mesmo limite. Renderizações desktop efetivamente
observadas: Dark (Main, Create, passos 2 colunas, Execute, Summary, Execution Details);
Light (Main, Filters, Details v4, Execuções, Alterações, Execution Details v3, Delete).
Demais superfícies/combinações não receberam PASS. A matriz comparativa completa
com Criar Sprint, Task Details e Task Cards permanece pendente. CSS/container e
acessibilidade automatizada não substituem essa homologação.

## W. Console

- console.error do navegador: **ENVIRONMENT BLOCKED**, sem coletor disponível.
- warnings do navegador: **ENVIRONMENT BLOCKED**.
- duplicate keys do navegador: **ENVIRONMENT BLOCKED**.
- unhandled rejections do navegador: **ENVIRONMENT BLOCKED**.
- Testes de fluxos S1-07 verificaram console.error/warn sem chamadas; a suíte passou
  sem unhandled rejections. Isso não equivale a zero erros no console real.

## X. Gates

| Gate | Resultado |
| --- | --- |
| lint | PASS |
| format:check | PASS |
| focused tests | PASS — 190 |
| full tests | PASS — 843 |
| coverage | PASS — thresholds existentes |
| build | PASS |
| backend focused regression | PASS — 120 |
| architecture:check | PASS |
| security:secrets | PASS |
| supply-chain | NOT APPLICABLE — nenhuma dependência ou lockfile alterado nesta etapa |
| git diff --check | PASS |
| CI remoto | NOT RUN |

Comandos existentes dos respectivos package.json, sem inventar scripts ou baixar
dependências. A primeira tentativa backend foi bloqueada pelo sandbox; a repetição
com acesso ao MySQL exclusivo passou. Gates locais não validam CI remoto.

## Y. Documentation

- `TRACEFLOW_ROADMAP_INCREMENTAL.md`
- `docs/api/API_CONTRACTS.md`
- `docs/architecture/SYSTEM_ARCHITECTURE.md`
- `docs/traceability/RF_TECHNICAL_MATRIX.md`
- `docs/design/UI_SURFACE_INVENTORY.md` — 11 superfícies, total 207, sem promover C2 COMPLETE.
- `docs/design/prototypes/TEST_CASES_PROTOTYPE.md`
- `docs/design/validation/VISUAL_VALIDATION_LOG.md`
- Este relatório.

Documentos oficiais do TCC não foram alterados.

## Z. RF status

- **RF42: IMPLEMENTADO LOCALMENTE**, backend/frontend reais e testes; revisão,
  homologação visual completa e CI remoto pendentes.
- **RF43: PARCIAL**, vínculos tipados no contexto de Casos de teste.
- **RF44: NÃO IMPLEMENTADO**, não promovido pela seleção de referência testada.
- **RF62: PARCIAL**, relação TestCase–Task/Requirement, sem consolidar todo o RF.

## AA. S1-07 status

- BACKEND: integrado e preservado nesta etapa.
- FRONTEND: integração local implementada; sem runtime paralelo de protótipo.
- LOCAL GATES: PASS.
- VISUAL INTEGRAL: pendente, com limitações registradas.
- CI REMOTO: **NOT RUN**.
- DoD global/card não encerrado. Próximo passo: **S1-07 FINAL INTEGRATED QA + CODE REVIEW**.

## AB. S1-08

**NOT IMPLEMENTED.** Nenhum Defect ou reteste iniciado.

## AC. S1-09

**NOT IMPLEMENTED.** Rastreabilidade global preservada.

## AD. Git final

Branch/HEAD preservados. Comparação com hashes de início: **zero arquivos backend
alterados**; alterações pré-existentes não relacionadas preservadas. Novos arquivos
permanecem sem commit. Migração do runtime do protótipo e documentação são intencionais.

**NO COMMIT · NO PUSH · NO MERGE · NO REBASE · NO RESET**.
Também não houve force-push, clean ou stash.

Status final e comandos de preservação são registrados abaixo.

```text
$ git status --short
 M .gitignore
 M TRACEFLOW_ROADMAP_INCREMENTAL.md
 M backend/.env.example
 M backend/package-lock.json
 M backend/package.json
 M backend/prisma/schema.prisma
 M backend/src/modules/audit/audit.service.js
 M backend/src/modules/authorization/authorization.repository.js
 M backend/src/modules/authorization/authorization.service.js
 M backend/src/modules/privacy/privacy.repository.js
 M backend/src/modules/settings/settings.repository.js
 M backend/src/modules/settings/settings.service.js
 M backend/src/routes/index.js
 M backend/src/shared/security/body.js
 M backend/test/helpers/test-database.js
 M docs/api/API_CONTRACTS.md
 M docs/architecture/SYSTEM_ARCHITECTURE.md
 M docs/design/UI_SURFACE_INVENTORY.md
 M docs/design/validation/VISUAL_VALIDATION_LOG.md
 M docs/privacy/DATA_RETENTION_POLICY.md
 M docs/privacy/PERSONAL_DATA_INVENTORY.md
 M docs/security/ASVS_BASELINE.md
 M docs/security/AUTHORIZATION_MATRIX.md
 M docs/traceability/RF_TECHNICAL_MATRIX.md
 M frontend/src/api/http-client.js
 M frontend/src/app/routes/AppRoutes.jsx
 M frontend/src/features/projects/components/ProjectSectionNav.jsx
 M frontend/src/features/schedule/components/MilestoneFilters.jsx
 M frontend/src/features/schedule/components/MilestoneSprintSelector.jsx
 D frontend/src/features/schedule/components/SearchCombobox.jsx
 M frontend/src/features/schedule/components/SprintActionsMenu.jsx
 M frontend/src/features/schedule/components/SprintDialog.jsx
 M frontend/src/features/schedule/components/SprintFilters.jsx
 M frontend/src/features/schedule/components/SprintForm.jsx
 M frontend/src/features/schedule/components/SprintTaskSelector.jsx
 M frontend/src/features/schedule/index.js
 M frontend/src/features/schedule/pages/MilestonesScreen.css
 M frontend/src/features/schedule/pages/SprintsScreen.css
 M frontend/src/shared/index.js
 M frontend/test/api/http-client.test.js
 M frontend/test/components/SearchCombobox.test.jsx
 M frontend/test/pages/ProjectDetailsPage.test.jsx
?? backend/prisma/migrations/20260907120000_s1_07_test_cases/
?? backend/src/modules/testCases/
?? backend/test/api/test-cases-s1-07.test.js
?? backend/test/fixtures/test-evidence/
?? backend/test/integration/test-cases-s1-07.test.js
?? backend/test/unit/test-cases/
?? docs/data/TEST_CASE_HISTORY.md
?? docs/deliveries/S1_07_BACKEND_IMPLEMENTATION_REPORT.md
?? docs/deliveries/S1_07_FRONTEND_INTEGRATION_REPORT.md
?? docs/design/prototypes/
?? frontend/src/features/testCases/
?? frontend/src/pages/TestCasesPage.jsx
?? frontend/src/shared/components/SearchCombobox.css
?? frontend/src/shared/components/SearchCombobox.jsx
?? frontend/test/testCases/

$ git diff --check
(sem saída; exit 0)

$ git rev-parse HEAD
b5732ca41cf66b1520e46edbb07c9d4c2d59ed16
```

Comparação final: 877 paths do snapshot inicial verificados; **0 alterações backend** e **0 alterações fora do escopo autorizado** em relação ao início desta etapa. O status acima inclui alterações backend e compartilhadas que já existiam antes da integração frontend.

Os processos temporários nas portas 3002 e 5174 foram encerrados; nenhuma dessas portas permaneceu em escuta na verificação final.
