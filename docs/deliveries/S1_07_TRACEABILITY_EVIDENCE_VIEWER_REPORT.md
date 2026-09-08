# TRACEFLOW S1-07 — TRACEABILITY + EVIDENCE VIEWER REPORT

Data: 2026-09-08. Escopo: Frontend UX Addendum 3, RF42.

Implementação e gates locais concluídos. Homologação visual **parcial**: rastreabilidade e
imagem persistida observadas no Safari; matriz exata e demais formatos permanecem pendentes.
Não constitui aprovação visual integral de S1-07.

## A. Git baseline

- Branch: `daniel-dev`.
- HEAD: `c25348b523230b3607a6879d5c60aad1e9da0a19`.
- Working tree: limpo; `git status --short` sem saída.
- `git diff --check`: PASS antes da edição.
- Snapshot de hashes dos arquivos rastreados registrado em
  `/tmp/traceflow-s107-addendum3-baseline`. Alterações anteriores já estavam no HEAD.

## B. Traceability before

Dois cards locais, com título/count próprios e links REQ/TASK acompanhados de ícones
branch/code. A composição repetia o conceito da Task Details com estilos diferentes.

## C. Traceability after

`TestCaseDetails` reutiliza `TaskTraceabilityGrid` e `ArtifactCategory`, publicados pelo barrel
existente de Tasks. Os componentes e o CSS canônicos não foram modificados.

- Mesmos eyebrow uppercase, count badge, fundo, borda, raio, padding e divisor.
- Requisito e tarefas em duas colunas; até 768px, uma coluna.
- Alinhamento superior, altura mínima canônica e alturas independentes.
- Corpo de cada categoria limitado a 16rem com rolagem interna.
- Múltiplas tarefas usam as divisórias de `task-detail-artifact-list`.
- Títulos navegáveis, sem ícones decorativos; foco/hover mantêm indicação de link.
- Ausência de vínculos: `Nenhum vínculo`, com count zero em cada categoria.

Os links fecham o diálogo e navegam às rotas canônicas do mesmo projeto:
`/projects/:projectId/requirements` e `/projects/:projectId/tasks`.
Não há abertura direta de um detalhe de tarefa a partir deste fluxo: a seleção da
`TaskDetailsPanel` pertence ao Kanban, sem contrato de entrada por entidade reutilizável aqui.
Requirements também não expõe um fluxo público de detalhes para esse vínculo.
Foi preservado o fallback de navegação existente, sem criar outro detalhe ou empilhar modais.

## D. Backend fields used

Contrato auditado em
`backend/src/modules/testCases/repositories/test-case.repository.js`,
`test-case.presenter.js` e snapshots em `test-case.schema.js`.

| Entidade | Dados reais usados | Dados desejados ausentes deste DTO |
|---|---|---|
| Requirement | `id`, `title`; label REQ já existente | `status`, `type`, `description`, `displayId` próprio |
| Task | `id`, `title`; label TASK já existente | `status`, `responsible`, `priority`, `sprint`, `deadline` |

Não foram inventados campos, labels, badges ou informações de responsável. Não há fetch adicional
por vínculo nem alteração do contrato para enriquecer essas linhas. Os casos de metadata estendida
mencionados no addendum são **NOT APPLICABLE ao contrato atual**; os testes cobrem DTO mínimo,
vínculos múltiplos e ausentes. A ausência desses campos não bloqueia o viewer nem exige ampliação
do backend. Não foi identificado **BACKEND CONTRACT GAP essencial ao viewer**.

## E. Evidence Viewer

Suporte implementado e verificado por testes de componentes/hook. Reprodução real depende do
formato e do navegador; a coluna de implementação não equivale a homologação visual completa.

| Type | Preview |
|---|---|
| PNG | `<img>`, contain, alt com nome do arquivo |
| JPG/JPEG | Mesmo renderer; JPG persistido observado no Safari |
| WEBP | Mesmo renderer |
| MP4 | `<video controls>`; fallback em erro |
| WEBM | Mesmo renderer |
| MOV | `video/quicktime`; depende de codec suportado, fallback em erro |
| PDF | `<object type="application/pdf">` nativo com fallback e download |
| TXT | `Blob.text()` e `<pre>` literal |
| LOG | Mesmo renderer; backend normaliza `.log` para `text/plain` |
| JSON | Parse e indentação de dois espaços; fallback se inválido |
| Other | Mensagem de indisponibilidade e download; nenhum embed |

A lista mostra nome original, tipo legível, tamanho e ações compactas Visualizar/Baixar.
Step Evidence e General Evidence usam o mesmo componente e o mesmo modo de visualização.

## F. Viewer architecture

- API existente: `GET /api/test-evidence/:id/content` via `testCasesApi.content` e `httpClient`.
- Leitura autenticada, `responseType: 'blob'`, `fresh: true`, `AbortSignal` por request.
- `app.js` aplica autenticação; `test-execution.service.js` autoriza membership no projeto antes
  de abrir o conteúdo. `test-case.controller.js` entrega Content-Type, Content-Length,
  Content-Disposition com nome original e X-Content-Type-Options: nosniff.
- Nenhuma URL pública de uploads/storage nem storageKey chega ao renderer.
- `useEvidenceContent` concentra transporte, validação do tipo, limite textual e object URL.
- Allowlist fechada de MIME; extensão do nome não promove HTML/SVG a renderer.
  O tipo do Blob recebido também precisa corresponder à categoria esperada.
- `TestCasesScreen` mantém o único `SprintDialog` e troca título, subtítulo, voltar e ações.
- A execução continua montada, oculta e excluída da navegação por foco. Ao voltar, reutiliza dados
  já carregados e restaura foco no botão Visualizar e posição da rolagem.
- Object URLs de mídia são revogadas ao voltar, trocar recurso, substituir request, fechar,
  mudar projeto ou desmontar. O Blob e texto deixam de ser selecionados ao sair do modo viewer.
- Download usa o Blob disponível; sem Blob, faz leitura autenticada. Nome original preservado;
  URL temporária adicional também é revogada.

Arquivos principais: `EvidenceViewer.jsx`, `useEvidenceContent.js`, `evidence-viewer.js`,
`PersistedEvidence.jsx`, `TestCaseDetails.jsx`, `TestCaseDialogContent.jsx`, `TestCasesScreen.jsx`.

## G. Text safety

Limite centralizado `TEXT_PREVIEW_LIMIT = 2 * 1024 * 1024`, exclusivo do preview.
Metadata acima do limite evita o fetch de preview. O tamanho real do Blob é conferido novamente
antes de chamar `text()`. O download permanece disponível.

TXT/LOG/JSON são nós de texto React em `<pre>`; conteúdo semelhante a HTML permanece literal.
Sem `innerHTML`, syntax highlighter ou renderização SVG. JSON válido usa `JSON.stringify(...,
null, 2)`; falha de parse/formatação oferece mensagem e download. Texto com quebra/wrap e
rolagem interna limitada a 28rem, usando o token monospace do projeto.

## H. Video

Controles nativos, `autoPlay={false}`, `preload="metadata"`, largura limitada ao container,
altura máxima 32rem, foco acessível. O evento de erro substitui o player por mensagem sobre
incompatibilidade do navegador e download. MOV não é anunciado como universalmente reproduzível.

## I. PDF

Object URL autenticada em `<object>`, largura 100%, altura interna 32rem, nome acessível e
fallback nativo com `Baixar PDF`. Download no header permanece disponível independentemente
do suporte do plugin nativo. Sem pdf.js, react-pdf, iframe remoto ou dependência adicional.
A renderização/teclado interno do visualizador PDF do navegador requer homologação com arquivo real.

## J. Async

O escopo inclui projeto, recurso e geração de request. Abort é limpeza de transporte;
a identidade continua sendo a autoridade mesmo quando uma resposta ignora cancelamento.

Testes verificam:

- A pendente → voltar → B → B responde → A responde: B permanece atual.
- Voltar/fechar durante leitura: sinal abortado, sem criação tardia de object URL.
- Project A → B, inclusive mesmo ID: resposta do contexto anterior descartada.
- Texto cuja decodificação termina após troca de evidência: descartado.
- Reabrir o mesmo arquivo: não mostra a URL já revogada da visita anterior.
- Retry após erro: nova request; estado anterior não substitui a tentativa atual.

## K. Tests

- Focados: **130 testes, 6 arquivos, PASS**.
- Novas regressões: **34 testes** (33 em `evidence-viewer.test.jsx` e 1 integração de diálogo real
  em `TestCases.test.jsx`).
- Regressão dos consumidores canônicos: **118 testes, 4 arquivos, PASS** — Kanban,
  FrozenTaskDetails, Sprints e Milestones.
- Suite completa: **898 testes, 75 arquivos, PASS**.
- Coverage: os mesmos **898 testes, PASS**, thresholds atendidos.
- Cobertura global: statements **82,14%**, branches **76,41%**, functions **78,20%**,
  lines **84,32%**.

A integração usa AppRoutes/ProjectTestCases/SprintDialog reais e verifica um único diálogo,
header de arquivo, contexto de passo/geral, foco, rolagem, Escape e uma única leitura da execução
mesmo após ida/volta do viewer. Os testes de formato usam Blobs em ambiente de teste;
não certificam codecs, o plugin PDF ou renderização visual dos browsers.

## L. Visual validation

Safari autenticado, cenário local já existente, leitura de TC-1/EXEC-0001 e duas imagens JPG
persistidas, uma de passo e uma geral. Nenhum registro de caso/execução ou upload foi criado.
Capturas nativas inspecionadas; dimensões de captura não foram confundidas com viewport CSS.

Legenda: **parcial** = observado no desktop disponível; **EB** = ENVIRONMENT BLOCKED.

| Surface | Light | Dark | 1440 | 768 | 390 |
|---|---|---|---|---|---|
| Traceability | parcial | parcial | EB | EB | EB |
| Image | parcial | parcial | EB | EB | EB |
| Video | EB | EB | EB | EB | EB |
| PDF | EB | EB | EB | EB | EB |
| Text | EB | EB | EB | EB | EB |
| JSON | EB | EB | EB | EB | EB |

1280: também EB. O provider disponível expõe apenas controle nativo do Safari, sem API de
viewport CSS/DevTools. Não foi possível certificar a matriz exata solicitada.

Task Details foi inspecionada como referência canônica; comparação sequencial, sem captura
simultânea lado a lado. A rastreabilidade do caso usa as mesmas surfaces e conserva apenas
as entidades reais. Os dados existentes não exercitam listas longas/metadata adicional.

No viewer de imagem: header com nome/tipo/tamanho, contexto do passo ou geral, conteúdo real,
voltar e fechar. Retorno ao botão Visualizar observado com foco visível e posição preservada.
Os demais formatos, unsupported, loading controlado e erro controlado não possuem cenário
persistido disponível nesta sessão de leitura; cobertura automatizada não foi promovida a PASS
visual. O estado transitório de pintura da imagem também não foi contado como teste de loading.

## M. Console

| Fonte | errors | warnings | unhandled rejections |
|---|---|---|---|
| Testes novos de viewer + integração de Casos de Teste | 0 (assertado) | 0 (assertado) | 0 reportadas pelo runner |
| Suite completa | nenhum erro inesperado reportado | nenhum warning inesperado reportado | 0 reportadas |
| Safari real | ENVIRONMENT BLOCKED | ENVIRONMENT BLOCKED | ENVIRONMENT BLOCKED |

Não há collector de console/DevTools exposto no provider nativo. Não se declara console limpo
no navegador somente pela ausência de mensagem visível na página.

## N. Gates

Runtime: Node 22.23.2; `NODE_OPTIONS=--no-experimental-webstorage` nos testes.
Scripts reais do `frontend/package.json`, sem instalação de pacotes.

| Gate | Resultado |
|---|---|
| `npx vitest run test/testCases` | PASS — 130 |
| `npm run lint` | PASS |
| `npm run format:check` | PASS |
| `npm test` | PASS — 898 |
| `npm run test:coverage` | PASS — thresholds atendidos |
| `npm run build` | PASS |
| regressão canônica | PASS — 118 |
| backend `npm run architecture:check` | PASS |
| backend `npm run security:secrets` | PASS — 454 arquivos |
| `git diff --check` | PASS |

Logs locais em `/tmp/traceflow-addendum3-{focused,regression,full,coverage,lint,format,build,
architecture,secrets}.log`. Nenhuma conclusão sobre CI remoto foi inferida desses gates locais.

## O. Backend impact

```text
Backend: UNCHANGED
Prisma: UNCHANGED
Migrations: UNCHANGED
Database: UNCHANGED por esta entrega
API contract: UNCHANGED
Dependencies / lockfiles: UNCHANGED
```

Não houve testes mutáveis de backend, migrações, limpeza de dados ou upload durante a inspeção.
As leituras autenticadas usuais continuam sujeitas aos efeitos normais da sessão existente.

**NOT IMPLEMENTED — optional local pre-submit preview**: não foi ampliado nesta rodada.
O preview local pré-existente de imagens selecionadas foi preservado; a prioridade foi o viewer
persistido comum a passo e execução.

## P. Git final

HEAD preservado: `c25348b523230b3607a6879d5c60aad1e9da0a19`, branch `daniel-dev`.
Mudanças limitadas à feature TestCases, exports canônicos de Tasks, testes e documentação de UI.
Inventário atualizado com `TC-TRACEABILITY`, `TC-EVIDENCE-LIST`, `TC-EVIDENCE-VIEWER`;
registro visual específico no Visual Validation Log. API contract não foi editado.

```text
NO COMMIT
NO PUSH
NO MERGE
NO REBASE
NO RESET
NO FORCE-PUSH
NO CLEAN
NO AUTOMATIC STASH
```

S1-08/S1-09 não iniciados. Encerramento deste addendum com implementação tecnicamente verificada
e pendências visuais explícitas. FINAL INTEGRATED QA + CODE REVIEW permanece próximo gate de S1-07,
sem aprovação integral antecipada.

### Estado final dos arquivos

```text
 M docs/design/UI_SURFACE_INVENTORY.md
 M docs/design/validation/VISUAL_VALIDATION_LOG.md
 M frontend/src/features/tasks/index.js
 M frontend/src/features/testCases/TestCasesScreen.jsx
 M frontend/src/features/testCases/components/PersistedEvidence.jsx
 M frontend/src/features/testCases/components/TestCaseDetails.jsx
 M frontend/src/features/testCases/components/TestCaseDialogContent.jsx
 M frontend/src/features/testCases/styles/test-cases.css
 M frontend/test/testCases/TestCases.test.jsx
?? docs/deliveries/S1_07_TRACEABILITY_EVIDENCE_VIEWER_REPORT.md
?? frontend/src/features/testCases/components/EvidenceViewer.jsx
?? frontend/src/features/testCases/hooks/useEvidenceContent.js
?? frontend/src/features/testCases/model/evidence-viewer.js
?? frontend/test/testCases/evidence-viewer.test.jsx
```

Verificação por hashes contra o baseline: nenhum arquivo de backend nem arquivo fora do escopo
foi alterado. Evidência local: `/tmp/traceflow-s107-addendum3-preservation.json`.
