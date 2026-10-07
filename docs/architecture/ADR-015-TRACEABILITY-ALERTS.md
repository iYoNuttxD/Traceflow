# ADR-015 — Alertas de inconsistência de rastreabilidade

- **Estado:** aceita para o cartão S2-01 (RF13, RF39, RF40, RF58)
- **Data:** 07/10/2026
- **Responsáveis:** João Vitor S. Hernandes

## Contexto

A cadeia `Requisito → Tarefa → Commit / Pull Request / Issue` depende de vínculos manuais
(ADR-006): `TaskCommit`, `Task.pullRequestId` e `TaskIssue`. Nada hoje sinaliza quando esses
vínculos faltam onde o processo os espera.

- **RF13, RF39 e RF40** pedem alertas para três lacunas:
  - tarefa concluída sem commit;
  - pull request mesclada sem tarefa;
  - issue fechada sem tarefa.
- **RF58** pede que tarefas sem vínculo técnico possam ser identificadas.
- O cartão S2-01 exige alertas rastreáveis, deduplicados, acionáveis e resolvidos conforme regra
  documentada.

Restrições do terreno que moldam a decisão:

- `Task` não tem `completedAt`. O instante da conclusão só existe em
  `TaskHistoryEntry` (`STATUS → CONCLUIDO`).
- A tarefa é excluída fisicamente.
- O sync GitHub é manual e importa o histórico inteiro do repositório (`state: 'all'`).
- Webhooks não processam push, pull request nem issue.
- Toda mutação canônica de tarefa e vínculo passa por `traceabilityMutation`, que trava a linha do
  projeto antes de ler. A exceção é a confirmação de sugestão do RF41, que reconcilia em transação
  própria.
- O MySQL não tem índice único parcial.

## Decisão

1. **Alerta é do projeto, não do usuário.** Um alerta registra uma inconsistência observável no
   estado persistido. Todo membro (VIEWER+) o vê. Não tem destinatário nem estado de leitura.
   Notificações pertencem aos cartões S2-02 e S2-03.
2. **Três tipos, uma regra cada:**
   - **`TASK_CONCLUDED_WITHOUT_COMMIT`**: tarefa `CONCLUIDO`, sem `TaskCommit`, em projeto com
     `ProjectGitHubIntegration`.
   - **`PULL_REQUEST_MERGED_WITHOUT_TASK`**: `mergedAtGithub` não nulo, nenhuma tarefa com aquele
     `pullRequestId` e `mergedAtGithub >= Project.createdAt`.
   - **`ISSUE_CLOSED_WITHOUT_TASK`**: `state = 'closed'`, sem `TaskIssue` e
     `closedAtGithub >= Project.createdAt`.

   Uma PR vinculada não silencia o RF13. O RF58 é uma consulta derivada, sem persistência: tarefa
   sem commit, sem pull request e sem issue.
3. **Cada ocorrência é uma linha.** Estados `OPEN`, `DISMISSED` e `RESOLVED`.
   - `RESOLVED` é terminal e guarda o motivo derivado.
   - Se a condição voltar a valer, nasce uma linha nova.
4. **A deduplicação pertence ao banco.** `activeKey` é uma coluna gerada `STORED` que vale
   `dedupeKey` enquanto o alerta está `OPEN` ou `DISMISSED` e `NULL` depois disso. Ela tem
   `UNIQUE (projectId, activeKey)`, o mesmo mecanismo de `Sprint.activeNameKey`. A criação usa
   `INSERT IGNORE` (`createMany` com `skipDuplicates`).
5. **Gatilhos.** A reconciliação roda sob `lockActiveProject`:
   - em `traceabilityMutation`, com as PRs e issues das tarefas lidas antes e depois da mutação;
   - na confirmação do RF41;
   - ao fim de cada execução de sync (`SUCCEEDED` ou `FAILED`), em transação própria e sem afetar
     o resultado do sync;
   - no reprocessamento manual (MANAGER+);
   - num script operacional com dry-run.
6. **Dispensa.** MANAGER+ pode dispensar um alerta aberto, com justificativa de 10 a 500
   caracteres. O alerta dispensado continua segurando a chave enquanto a condição persistir.
7. **Interface.** Os alertas ficam dentro de Rastreabilidade, numa sub-navegação. As 11 abas do
   projeto permanecem.

## Alternativas consideradas

- **RF13 em qualquer projeto.** Rejeitada: sem repositório integrado, não existe commit
  vinculável, e todo alerta seria impossível de corrigir. A tela informa quando a regra está
  inativa.
- **PR vinculada contando como commit para o RF13.** Rejeitada: o RF exige commit, e o modelo não
  liga commits a PRs. A dispensa cobre os casos legítimos.
- **Corte do RF39/RF40 em `ProjectGitHubIntegration.integratedAt`.** Rejeitada: deixaria sem
  alerta as PRs e issues encerradas entre a criação do projeto e a conexão do repositório.
- **Sem corte temporal.** Rejeitada: conectar um repositório antigo geraria centenas de alertas
  sobre trabalho anterior ao TraceFlow.
- **Uma linha por sujeito, reaberta a cada recorrência.** Rejeitada: apagaria o histórico das
  ocorrências anteriores e exigiria uma tabela de eventos à parte.
- **Deduplicação no código.** Rejeitada: duas reconciliações concorrentes poderiam criar dois
  ativos. O índice único é a garantia; o lock do projeto é a primeira barreira.
- **Detecção só por varredura periódica.** Rejeitada: não há scheduler no produto, e o alerta da
  tarefa ficaria atrasado em relação à mutação que o causou.
- **Uma 12ª aba "Alertas".** Rejeitada: a navegação do projeto é uma decisão de produto pinada por
  teste.

## Consequências positivas

- A resolução é automática e explicável: cada alerta resolvido guarda o motivo.
- Reprocessar é seguro a qualquer momento. Uma corrida entre gatilhos não produz duplicata.
- O histórico das ocorrências é a própria tabela, sem reconstrução retroativa.

## Consequências negativas

- O alerta de PR e de issue só nasce no fim de um sync, não no instante do merge ou do
  fechamento, porque não há webhook desses eventos.
- Tarefa concluída antes do histórico de status (RF38) fica com a data de conclusão indisponível
  (`COMPLETION_TIME_UNAVAILABLE`).
- Issue fechada como "not planned" também gera alerta, porque o `state_reason` não é persistido. A
  dispensa é a saída.
- `traceabilityMutation` ganha custo proporcional às tarefas do escopo.

## Impactos de segurança e privacidade

- A leitura exige membership ativa: não membro recebe 404 e papel insuficiente recebe 403.
- Dispensar e reprocessar exigem MANAGER+, CSRF e revalidação de papel no serviço. O
  reprocessamento usa o mesmo limitador do sync manual.
- `dismissedByUserId` e `dismissalReason` são dados pessoais do ciclo do projeto: `SetNull` na
  remoção do usuário e DTO mínimo `{ id, name }`. A justificativa é texto livre, limitada a 500
  caracteres.
- Logs e auditoria não carregam título, nome nem justificativa.
