# Alertas de rastreabilidade — S2-01 (RF13, RF39, RF40, RF58)

Decisão em [ADR-015](../architecture/ADR-015-TRACEABILITY-ALERTS.md), com a consulta contextual e
os avisos aos membros no [ADR-022](../architecture/ADR-022-CONSULTA-CONTEXTUAL-E-AVISOS-DE-INCONSISTENCIA.md).
Este documento é a regra executável: o código e os testes seguem exatamente estas tabelas.

Revisto em 15/10/2026 (revisão independente da PR #26). O RF13 deixou de exigir integração, o RF39 e
o RF40 deixaram de ter corte temporal, e os alertas de PR e de issue passaram a gerar aviso por
pessoa.

## Tipos e condições

Um alerta está **ativo** (`OPEN` ou `DISMISSED`) enquanto a condição do seu tipo for verdadeira.

| Tipo | RF | Sujeito | Condição | `occurredAt` |
| --- | --- | --- | --- | --- |
| `TASK_CONCLUDED_WITHOUT_COMMIT` | RF13 | `Task` | `status = 'CONCLUIDO'` e zero `TaskCommit`, com ou sem `ProjectGitHubIntegration` | `occurredAt` da última `TaskHistoryEntry` `STATUS → CONCLUIDO`; sem entrada, `null` com `COMPLETION_TIME_UNAVAILABLE` |
| `PULL_REQUEST_MERGED_WITHOUT_TASK` | RF39 | `PullRequest` | `mergedAtGithub` não nulo e nenhuma `Task` com `pullRequestId` da PR, qualquer que seja a data | `mergedAtGithub` |
| `ISSUE_CLOSED_WITHOUT_TASK` | RF40 | `Issue` | `state = 'closed'` e zero `TaskIssue`, qualquer que seja a data | `closedAtGithub`; sem data, `null` com `CLOSE_TIME_UNAVAILABLE` |

Regras de borda:

- Não há corte temporal. A PR mesclada e a issue fechada antes da criação do projeto também geram
  alerta.
- PR com `state = 'closed'` e `mergedAtGithub` nulo foi fechada sem merge: nunca gera alerta.
- Issue `closed` com `closedAtGithub` nulo gera alerta com `occurredAt` nulo e a limitação
  `CLOSE_TIME_UNAVAILABLE`.
- **Projeto sem integração GitHub.**
  - O alerta RF13 nasce do mesmo jeito.
  - O detalhe diz "Projeto sem repositório conectado: nenhum commit pode ser vinculado".
  - O resumo expõe `rules.integrationConnected`, e o detalhe da tarefa, `context.integrationConnected`.
    A tela usa os dois para explicar o alerta e levar ao repositório do projeto, onde o OWNER conecta.
  - Desconectar o repositório não resolve alerta.
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
| Tarefa | `TASK_DELETED` → `COMMIT_LINKED` → `TASK_REOPENED` |
| Pull request | `PULL_REQUEST_LINKED` → `RULE_NO_LONGER_APPLIES` |
| Issue | `ISSUE_LINKED` → `ISSUE_REOPENED` → `RULE_NO_LONGER_APPLIES` |

`RULE_NO_LONGER_APPLIES` cobre o que sobra no RF39 e no RF40: o artefato deixou de existir, ou um
dado do GitHub corrigido tirou a condição (por exemplo, `mergedAtGithub` voltou nulo).

- Na tarefa, ele não é mais gerado desde 15/10/2026, porque a integração deixou de ser condição.
- Alertas antigos resolvidos com esse motivo continuam como estão.

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

## Avisos aos membros (UX-D03)

A regra completa está no ADR-022 (D5 a D9). Em resumo:

| Item | Regra |
| --- | --- |
| Quem gera | só os alertas `PULL_REQUEST_MERGED_WITHOUT_TASK` e `ISSUE_CLOSED_WITHOUT_TASK` |
| Estado da fila no alerta (`noticeState`) | `PENDING` na criação dos dois tipos; `NOT_APPLICABLE` no RF13 e nos alertas criados antes de 15/10/2026; `DISPATCHED` depois do despacho, com `noticedAt` |
| Destinatários | toda membership ativa (qualquer papel), com conta `ACTIVE`, `joinedAt` até o `detectedAt` e preferência `TRACEABILITY_INCONSISTENCY` ligada antes da detecção |
| Lote | alertas pendentes do mesmo projeto com o mesmo `detectedAt`; até 10, um aviso por alerta; acima disso, um resumo por pessoa |
| Chaves | `TRACEABILITY_INCONSISTENCY:alert:<alertId>` e `TRACEABILITY_INCONSISTENCY:batch:<projectId>:<detectedAt>`, únicas por destinatário |
| Quando despacha | depois da reconciliação da sincronização, do reprocessamento manual, do script e das mutações por `traceabilityTransaction`; o job periódico recupera o que ficou pendente |
| Leitura | individual; ler não resolve nem dispensa o alerta; resolver ou dispensar não apaga nem marca o aviso |

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
- **Histórico importado:** conectar um repositório antigo gera um alerta para cada PR mesclada e
  cada issue fechada sem tarefa. O aviso aos membros sai em resumo acima de 10.
- **Projeto sem integração:** todo alerta RF13 fica aberto até que o repositório seja conectado e o
  commit vinculado, ou até a dispensa.
- **`CLOSE_TIME_UNAVAILABLE`:** a issue fechada sem `closedAtGithub` fica com a data da ocorrência
  indisponível, nunca substituída por `updatedAtGithub`.
- **`state_reason` da issue** não é persistido.
- **Snapshot do sujeito:** `subjectCode` e `subjectTitle` (até 256 caracteres) são gravados na
  detecção e só aparecem quando o sujeito deixou de existir.
