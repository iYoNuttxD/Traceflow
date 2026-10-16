# ADR-015 — Alertas de inconsistência de rastreabilidade

- **Estado:** aceita para o cartão S2-01 (RF13, RF39, RF40, RF58)
- **Data:** 07/10/2026; revisões em 09/10/2026 (correções da campanha de testes) e em 15/10/2026
  (revisão independente da PR #26), ver as seções de revisão no fim
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
   estado persistido. Todo membro (VIEWER+) o vê. O alerta não tem destinatário nem estado de
   leitura.
   - Os alertas de PR e de issue geram também um aviso por pessoa (UX-D03, ADR-022): todo membro
     ativo recebe, e a leitura é individual.
   - Ler o aviso não resolve nem dispensa o alerta. Os dois estados ficam separados.
2. **Três tipos, uma regra cada:**
   - **`TASK_CONCLUDED_WITHOUT_COMMIT`**: tarefa `CONCLUIDO`, sem `TaskCommit`, com ou sem
     `ProjectGitHubIntegration`.
     - Em projeto sem integração, o alerta informa "Projeto sem repositório conectado: nenhum commit
       pode ser vinculado". O OWNER vê o atalho para conectar.
     - Desconectar o repositório não resolve o alerta.
   - **`PULL_REQUEST_MERGED_WITHOUT_TASK`**: `mergedAtGithub` não nulo e nenhuma tarefa com aquele
     `pullRequestId`, qualquer que seja a data do merge.
   - **`ISSUE_CLOSED_WITHOUT_TASK`**: `state = 'closed'` e sem `TaskIssue`, qualquer que seja a data
     do fechamento. Sem `closedAtGithub`, a ocorrência fica indisponível
     (`CLOSE_TIME_UNAVAILABLE`).

   Não há corte temporal. PRs e issues encerradas antes da criação do projeto também geram alerta,
   com `occurredAt` igual à data do GitHub.

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
   - depois de conectar o repositório ao projeto (`GITHUB_INTEGRATION`), em transação própria e sem
     desfazer a conexão;
   - no reprocessamento manual (MANAGER+);
   - num script operacional com dry-run.

   Os alertas de PR e de issue criados por qualquer gatilho entram na fila de avisos (ADR-022). O
   despacho roda depois da transação, nunca dentro dela.

   As reconciliações do projeto inteiro (sync, conexão, manual e script) registram o resultado da
   última execução, de sucesso ou de falha. A tela avisa quando os alertas podem estar
   desatualizados. A reconciliação de mutação não registra: se ela falha, a mutação inteira é
   desfeita.
6. **Dispensa.** MANAGER+ pode dispensar um alerta aberto, com justificativa de 10 a 500
   caracteres Unicode (code points, contados depois do `trim`). O alerta dispensado continua
   segurando a chave enquanto a condição persistir.
7. **Interface.** Consulta contextual (UX-D01 e UX-D02, ADR-022):
   - indicação na tarefa e no artefato;
   - filtro nas listas que já existem (Kanban, lista de tarefas e Repositório);
   - resumo no topo de Rastreabilidade.

   As páginas próprias de alertas e de tarefas sem vínculo técnico saem. Detalhes, histórico e
   dispensa continuam acessíveis no contexto da tarefa ou do artefato. As 11 abas do projeto
   permanecem.
8. **Módulo.** O código vive em `backend/src/modules/traceability/` (`traceability-alert.*`), como
   parte do domínio de rastreabilidade, e não num módulo `alerts/` próprio. As notificações
   (S2-02/S2-03) decidem o próprio módulo.

## Alternativas consideradas

- **RF13 só em projeto com integração (versão de 07/10/2026).** Rejeitada na revisão de 15/10/2026:
  o Quadro 3-51 não condiciona o alerta à integração. O texto do alerta explica que falta o
  repositório.
- **PR vinculada contando como commit para o RF13.** Rejeitada: o RF exige commit, e o modelo não
  liga commits a PRs. A dispensa cobre os casos legítimos.
- **Corte do RF39/RF40 em `ProjectGitHubIntegration.integratedAt`.** Rejeitada: deixaria sem
  alerta as PRs e issues encerradas entre a criação do projeto e a conexão do repositório.
- **Corte do RF39/RF40 em `Project.createdAt` (versão de 07/10/2026).** Rejeitada na revisão de
  15/10/2026: os Quadros 3-52 e 3-53 não limitam a data. O volume do histórico é tratado no aviso,
  que sai em resumo acima de 10 alertas novos (ADR-022), e não no alerta.
- **Uma linha por sujeito, reaberta a cada recorrência.** Rejeitada: apagaria o histórico das
  ocorrências anteriores e exigiria uma tabela de eventos à parte.
- **Deduplicação no código.** Rejeitada: duas reconciliações concorrentes poderiam criar dois
  ativos. O índice único é a garantia; o lock do projeto é a primeira barreira.
- **Detecção só por varredura periódica.** Rejeitada: não há scheduler no produto, e o alerta da
  tarefa ficaria atrasado em relação à mutação que o causou.
- **Uma 12ª aba "Alertas".** Rejeitada: a navegação do projeto é uma decisão de produto pinada por
  teste.
- **Sub-navegação com páginas próprias de alertas e de tarefas sem vínculo (versão de 07/10/2026).**
  Rejeitada na revisão de 15/10/2026 (UX-D01): a navegação fragmentada tira a pessoa do contexto
  de trabalho.

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
- Conectar um repositório antigo gera um alerta para cada PR mesclada e cada issue fechada sem
  tarefa do histórico. A dispensa e o vínculo continuam sendo a saída. O aviso aos membros sai em
  resumo.
- Projeto sem integração tem um alerta RF13 para cada tarefa concluída. Só o vínculo de commit,
  depois de conectar o repositório, ou a dispensa resolvem.

## Impactos de segurança e privacidade

- A leitura exige membership ativa: não membro recebe 404. Todo membro ativo lê.
  - O middleware confere a membership, e o serviço confere de novo nas quatro leituras (lista,
    resumo, detalhe e tarefas sem vínculo).
  - O 404 do serviço tem o mesmo corpo do 404 opaco do middleware (TF-REV-001, emenda do ADR-003).
- Dispensar e reprocessar exigem MANAGER+, CSRF e revalidação de papel no serviço. O
  reprocessamento tem limitador próprio (`traceability-alerts-reconcile`), com a mesma janela e o
  mesmo teto do sync manual.
- `dismissedByUserId` e `dismissalReason` são dados pessoais do ciclo do projeto: `SetNull` na
  remoção do usuário e DTO mínimo `{ id, name }`. A justificativa é texto livre, limitada a 500
  caracteres.
- Logs e auditoria não carregam título, nome nem justificativa.

## Revisão de 09/10/2026

Correções dos achados da campanha de testes (`docs/issues/S2_01_RELATORIO_TESTES.md`), aprovadas
pelo João em 09/10/2026:

- **Gatilho na conexão (S201-A01).** Conectar o repositório a um projeto com tarefas concluídas sem
  commit não gerava o alerta até o próximo sync. A conexão passa a reconciliar o projeto (D5).
- **Registro da última reconciliação (S201-A05).** Uma falha da reconciliação depois do sync ficava
  só no log. O registro por projeto (`TraceabilityAlertReconciliation`) guarda o último sucesso e a
  última falha. O resumo expõe `reconciliation.stale` quando a falha é mais recente que o sucesso
  (D5).
- **Unidade da justificativa (S201-A02).** O limite era medido em unidades UTF-16, e 5 emojis
  passavam como 10 caracteres. Passa a contar code points, coerente com a coluna `VARCHAR(500)` em
  `utf8mb4` (D6).
- **Localização do módulo (S201-A09).** Registrada em D8.
- **Textos corrigidos (S201-A04):** limitador próprio do reprocessamento e leitura sem 403.

## Revisão de 15/10/2026 — revisão independente da PR #26

A revisão independente publicada na PR #26 pediu aderência literal ao TCC e a consulta contextual.
O João aprovou as recomendações em 15/10/2026
([PR26_PROMPT_CORRECOES_REVISAO.md](../issues/PR26_PROMPT_CORRECOES_REVISAO.md), não versionado),
e as decisões estão incorporadas no texto acima:

| Achado | Decisão |
| --- | --- |
| TF-REV-001 | as quatro leituras conferem a membership no serviço, além do middleware |
| TF-REV-002 | RF13 sem integração obrigatória e RF39/RF40 sem corte temporal (D2); issue sem data de fechamento com `CLOSE_TIME_UNAVAILABLE` |
| TF-REV-008, UX-D01 | consulta contextual no lugar das páginas próprias (D7) |
| TF-REV-008, UX-D03 | aviso por pessoa para os alertas de PR e de issue, com leitura individual (D1 e ADR-022) |

