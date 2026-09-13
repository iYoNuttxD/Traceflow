# TRACEFLOW S1-09 — INDEPENDENT REVIEW TARGETED CORRECTIONS REPORT

Date: 2026-09-13  
Branch: `daniel-dev`  
HEAD: `6a8090b4a1753b43dfec651e723b5386603e1565`  
PR: #20 (`main@205b6def1af2231bbbe855de01df3eef2686a3db` ← `daniel-dev@6a8090b4a1753b43dfec651e723b5386603e1565`)

## Resultado

**S1-09 INDEPENDENT REVIEW TARGETED CORRECTIONS — PASS LOCAL**

Known merge-blocking findings remaining locally: **0**.

Este resultado cobre o diff local não commitado. A PR remota ainda aponta para o HEAD acima,
mantém `CHANGES_REQUESTED` e o check Frontend Tests vermelho da revisão anterior. Nova
revalidação independente e novo CI continuam obrigatórios antes de merge.

## Findings

| ID | Severity | Root cause | Fix | Regression | Result |
|---|---|---|---|---|---|
| TF-REV-001 | MEDIUM | O teste procurava a CTA antes de observar a conclusão canônica da leitura de esforço e publicação de capabilities | Espera restrita ao painel de esforço até `Retomar` existir e estar habilitado; depois usa a CTA no mesmo painel | `late response` e `read failure`, sem timeout, retry, skip ou API de teste | PASS |
| TF-REV-002 | LOW | Mensagem hardcoded divergiu do enum aceito | `ACCEPTED_REQUIREMENT_STATUSES` passou a alimentar enum e mensagem | status inválido retorna 400 e lista real | PASS |
| TF-REV-003 | LOW | O schema duplicava 11 estados, embora o read model compare somente lifecycle macro | `requirementStatus` reutiliza `REQUIREMENT_LIFECYCLE_STATUSES` | `EM_CORRECAO` aceito; `APROVADO` rejeitado com 400 | PASS |
| TF-REV-004 | LOW | S1-08/S1-09 introduziram vínculos pessoais sem seleção própria no export nem política documental explícita | Export minimizado de responsabilidade/autoria própria, inventário e retenção atualizados | User A/User B, ator nulo, membership inativa e regressões S1-07 | PASS |

## TF-REV-001 — determinismo

- Evidência anterior ao fix: o CI da PR no mesmo HEAD falhou em Frontend Tests no cenário
  `Confirmed effort in graph-owned Task Details`. Três execuções locais completas pré-fix
  passaram, confirmando a natureza intermitente registrada pelo review, não a ausência do bug.
- Fluxo auditado: `TraceabilityWorkspace` → `GraphEntityDetails`/`TaskInspection` →
  `TaskDetailsPanel` → `TaskEffortTracker` → `useTaskEffort` → `permissions.canOperate`.
- Classificação: race do test harness. O produto já descarta contexto obsoleto, reaplica
  mutations/eventos confirmados sobre reads em voo e só expõe controles operacionais após a
  capability retornada pelo backend.
- Timeout não era a correção: a precondição não estava expressa. O teste agora observa a região
  acessível `Esforço (horas)` e o botão `Retomar` habilitado, que implica Task carregada,
  effort read concluído e capability publicada.
- Estabilidade pós-fix: arquivo focado 20/20; coverage completo 5/5 consecutivas.

## TF-REV-004 — decisão de governança

- **Defect responsibility:** dado de atribuição corrente; exporta somente Defects não excluídos
  com `responsibleUserId` do titular em projeto com membership ativa.
- **Defect history:** autoria funcional; exporta somente eventos cujo `actorUserId` é o titular,
  sem metadata livre e sem inferência por nome.
- **Task effort history:** histórico funcional/auditável do projeto, retido pelo ciclo do projeto
  e política aplicável. Exporta somente eventos próprios e minimizados.
- **Task deletion:** não apaga `TaskEffortHistoryEntry`; `taskId` e `sessionId` são identidades
  históricas deliberadamente preservadas sem FK para os recursos removíveis.
- **Account removal:** `actorUserId` pode tornar-se nulo por `SetNull`; o evento permanece e não é
  reatribuído por heurística.
- **Personal export:** `responsible-defects.json`, `defect-history.json` e
  `task-effort-history.json`; responsabilidade/ações de terceiros e atores nulos ficam de fora.

## Findings informativos

- TF-REV-005: **DEFERRED** — assinaturas de `fail()` sem impacto atual; nenhuma refatoração estética.
- TF-REV-006: metadata remota da PR pendente do gate verde final; nenhuma alteração remota nesta rodada.
- TF-REV-007: **DEFERRED** — `resourceType` genérico sem impacto de segurança reproduzido.

## Matriz de testes

| Suite | Runs | Result |
|---|---:|---|
| TraceabilityWorkspace focused | 20 | PASS, 2 casos por rodada |
| Frontend full | 1 | PASS, 1.137 testes |
| Frontend coverage | 5 | PASS, 1.137 testes por rodada; 81,84% statements / 77,02% branches / 77,51% functions / 84% lines |
| Backend focused: Requirement, traceability, export, privacy, Defects e effort history | 1 | PASS, 145 testes |
| Backend unit | 1 | PASS, 757 testes |
| Backend integration/API | 1 | PASS, 517 testes e 5 skips legados |
| Backend coverage | 3 | PASS, 1.274 testes e 5 skips legados por rodada; 91,46% statements / 82,71% branches / 94,89% functions / 93,72% lines |
| Requirement validation | focused + full | PASS |
| Traceability validation | focused + full | PASS |
| Personal export negative tests | focused + full | PASS |
| Lint e format, frontend/backend | 1 | PASS |
| Frontend build | 1 | PASS |
| Architecture e secrets | 1 | PASS |
| Audit policy, npm audit e supply-chain policy | 1 | PASS |

## Integridade do escopo

- Nenhum timeout aumentado, retry, novo skip, `data-testid` ou flag de teste.
- Nenhuma mudança visual, schema, migration, FK ou acesso Prisma fora do repository.
- Nenhuma inferência de ownership por nome e nenhum dado de outro usuário no export.
- TF-REV-005/006/007 não aumentaram o diff funcional.
- O warning React já existente no teste de Kanban continuou não bloqueante e fora do escopo.

## Sugestão de metadata para a PR #20

Título sugerido: `Complete S1-09 traceability and close independent review findings`

Descrição resumida sugerida:

> Conclui a rastreabilidade S1-09 e aplica as correções direcionadas TF-REV-001 a TF-REV-004:
> teste determinístico do Task Details, contratos coerentes de status/lifecycle e governança de
> exportação pessoal para Defects e histórico de esforço. Gates locais completos passaram; a PR
> aguarda nova revalidação independente e novo CI.

## Próximo passo

Parar após esta rodada e solicitar **NOVA REVALIDAÇÃO INDEPENDENTE FINAL** do diff, seguida da
verificação dos checks remotos atuais. Este relatório não marca S1-09 como concluído nem autoriza merge.
