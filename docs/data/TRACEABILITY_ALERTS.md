# Alertas de rastreabilidade — S2-01 (RF13, RF39, RF40, RF58)

Decisão em [ADR-015](../architecture/ADR-015-TRACEABILITY-ALERTS.md). Este documento é a regra
executável: o código e os testes seguem exatamente estas tabelas.

## Tipos e condições

Um alerta está **ativo** (`OPEN` ou `DISMISSED`) enquanto a condição do seu tipo for verdadeira.

| Tipo | RF | Sujeito | Condição | `occurredAt` |
| --- | --- | --- | --- | --- |
| `TASK_CONCLUDED_WITHOUT_COMMIT` | RF13 | `Task` | `status = 'CONCLUIDO'`, zero `TaskCommit` e o projeto tem `ProjectGitHubIntegration` | `occurredAt` da última `TaskHistoryEntry` `STATUS → CONCLUIDO`; sem entrada, `null` com `COMPLETION_TIME_UNAVAILABLE` |
| `PULL_REQUEST_MERGED_WITHOUT_TASK` | RF39 | `PullRequest` | `mergedAtGithub` não nulo, nenhuma `Task` com `pullRequestId` da PR e `mergedAtGithub >= Project.createdAt` | `mergedAtGithub` |
| `ISSUE_CLOSED_WITHOUT_TASK` | RF40 | `Issue` | `state = 'closed'`, zero `TaskIssue` e `closedAtGithub >= Project.createdAt` | `closedAtGithub` |

Regras de borda:

- O corte inclui o próprio instante de `Project.createdAt` (`>=`), em UTC.
- PR com `state = 'closed'` e `mergedAtGithub` nulo foi fechada sem merge: nunca gera alerta.
- Issue `closed` com `closedAtGithub` nulo não satisfaz o corte e não gera alerta.
- `state` é o valor cru do GitHub, minúsculo, e não é normalizado.
- PR vinculada a uma tarefa não silencia o RF13.
- Issue fechada como "not planned" gera alerta, porque `state_reason` não é persistido.

## RF58 — tarefas sem vínculo técnico

Leitura derivada, sem persistência e sem corte temporal. Uma tarefa sem vínculo técnico tem, ao
mesmo tempo:

- zero `TaskCommit`;
- `pullRequestId` nulo;
- zero `TaskIssue`.

Vale para qualquer status, com filtro opcional de status. Aqui a issue conta como vínculo técnico.
Na "evidência técnica" do motor de situações do requisito, só contam PR e commit.

## Estados e transições

| Estado | Significado | Segura `activeKey` |
| --- | --- | --- |
| `OPEN` | condição verdadeira; ninguém dispensou | sim |
| `DISMISSED` | condição verdadeira; MANAGER+ dispensou com justificativa | sim |
| `RESOLVED` | condição deixou de valer; registro terminal | não |

```text
(nenhum)  --condição verdadeira-->  OPEN
OPEN      --condição falsa-------->  RESOLVED (motivo)
OPEN      --dispensar------------->  DISMISSED
DISMISSED --condição falsa-------->  RESOLVED (motivo; dispensa preservada)
```

Se a condição voltar a valer depois de `RESOLVED`, nasce uma linha nova `OPEN`. Não há reabertura
nem desfazer dispensa.

## Motivos de resolução

Os motivos são avaliados na ordem da tabela, e o primeiro verdadeiro vence:

| Tipo | Ordem |
| --- | --- |
| Tarefa | `TASK_DELETED` → `COMMIT_LINKED` → `TASK_REOPENED` → `RULE_NO_LONGER_APPLIES` |
| Pull request | `PULL_REQUEST_LINKED` → `RULE_NO_LONGER_APPLIES` |
| Issue | `ISSUE_LINKED` → `ISSUE_REOPENED` → `RULE_NO_LONGER_APPLIES` |

`RULE_NO_LONGER_APPLIES` cobre o que sobra:

- a integração GitHub foi removida (RF13);
- um dado do GitHub corrigido tirou o artefato do corte (RF39/RF40).

## Deduplicação

- `dedupeKey = "<type>:<subjectId>"`, gravada na criação e imutável.
- `activeKey` é uma coluna gerada `STORED`:
  `CASE WHEN status IN ('OPEN','DISMISSED') THEN dedupeKey END`.
- `UNIQUE (projectId, activeKey)` admite vários `NULL`. Por isso os alertas resolvidos não
  bloqueiam ocorrências novas.
- A criação usa `INSERT IGNORE` (`createMany` com `skipDuplicates`).
- A resolução é um `UPDATE` guardado por `status IN ('OPEN','DISMISSED')`.
- Alertas ativos são localizados pela `activeKey`, nunca pela FK do sujeito, porque a FK vira
  `NULL` quando a tarefa é excluída.

## Gatilhos

Toda reconciliação começa por `lockActiveProject`, o mesmo primeiro lock dos escritores canônicos.

| Gatilho | Escopo | Transação |
| --- | --- | --- |
| Mutação de tarefa ou vínculo (`traceabilityMutation` com `taskIds`) | as tarefas do escopo, mais as PRs e issues ligadas a elas antes **e** depois da mutação | a da mutação |
| Confirmação de sugestão RF41 | a tarefa da sugestão | a da confirmação |
| Fim de execução de sync (`SUCCEEDED` ou `FAILED`) | o projeto inteiro | própria; uma falha gera log e registro de falha e não altera o resultado do sync |
| Conexão do repositório (`PUT /projects/:projectId/github/integration`), gatilho `GITHUB_INTEGRATION` | o projeto inteiro | própria, depois da conexão gravada; uma falha gera log e registro de falha e não desfaz a conexão |
| `POST /projects/:projectId/traceability/alerts/reconcile` (MANAGER+) | o projeto inteiro | própria |
| `npm run traceability:alerts[:dry-run]` | um projeto ou todos os ativos | própria; dry-run em `RepeatableRead`, sem escrita |

Na varredura do projeto, entram dois conjuntos: os sujeitos que satisfazem cada condição e os
sujeitos com alerta ativo. As criações são ordenadas por `occurredAt` ascendente (nulos primeiro)
e depois por id do sujeito.

## Última reconciliação

O modelo `TraceabilityAlertReconciliation` guarda, por projeto, o resultado da última reconciliação
do projeto inteiro:

- `lastTrigger`: `GITHUB_SYNC`, `GITHUB_INTEGRATION`, `MANUAL` ou `SCRIPT`;
- `lastAttemptAt`;
- `lastSucceededAt` e `lastFailedAt`;
- `lastErrorCode`, apenas o código, nunca a mensagem.

Regras:

- O dry-run e a reconciliação de mutação (`traceabilityMutation`, RF41) não escrevem o registro. Uma
  falha nelas desfaz a própria mutação.
- A gravação da falha é uma escrita própria, fora da transação que falhou. Se ela também falhar,
  fica só o log.
- O resumo expõe `reconciliation{lastSucceededAt,lastFailedAt,lastTrigger,stale}`:
  - `stale` vale `true` quando `lastFailedAt` é posterior a `lastSucceededAt`, ou quando só há
    falha;
  - sem registro, `reconciliation` é `null`.
- A purga do projeto remove o registro por cascata.

## Dispensa

- Somente MANAGER+ dispensa, e só alerta `OPEN`.
- A justificativa tem de 10 a 500 caracteres Unicode (code points), contados depois do `trim`. Um
  emoji simples conta 1; um emoji composto com ZWJ conta cada code point.
- A dispensa grava `dismissedAt`, `dismissedByUserId` e `dismissalReason`, e registra a auditoria
  `TRACEABILITY_ALERT_DISMISSED`.
- Dispensar de novo um alerta `DISMISSED` não muda nada e responde `changed: false`.
- Dispensar um alerta `RESOLVED` responde 409 `TRACEABILITY_ALERT_NOT_OPEN`.

## Limitações conhecidas

- **`COMPLETION_TIME_UNAVAILABLE`:** a tarefa foi concluída antes do histórico de status (RF38).
  A data fica indisponível e nunca é substituída por `updatedAt`.
- **Atraso dos alertas de GitHub:** o alerta de PR ou issue nasce no fim do sync seguinte ao
  merge ou fechamento, porque não há webhook desses eventos.
- **`state_reason` da issue** não é persistido.
- **Snapshot do sujeito:** `subjectCode` e `subjectTitle` (até 256 caracteres) são gravados na
  detecção e só aparecem quando o sujeito deixou de existir.
