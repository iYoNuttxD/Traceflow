# ADR-023 — Fonte durável dos eventos de issues e pull requests

- **Estado:** aceita em 17/10/2026 pelo João, com o aval das recomendações do
  `PR26_PROMPT_CORRECOES_REVISAO_2.md` (não versionado). Substitui a proposta de 15/10/2026, que a
  segunda revisão independente da PR #26 criticou.
- **Data:** 15/10/2026 (proposta); 17/10/2026 (revisão e aceite)
- **Responsáveis:** João Vitor S. Hernandes
- **Relação:** revê o [ADR-018](ADR-018-GITHUB-EVENT-NOTIFICATIONS.md) (D1 a D4 e D14) e respeita o
  [ADR-021](ADR-021-GRAVACAO-POR-DIFERENCA.md) (gravação por diferença)

## Contexto

O RF60 (Quadro 3-57) notifica os envolvidos na tarefa "quando uma issue vinculada a ela for aberta
ou fechada no repositório". O RF61 (Quadro 3-58) faz o mesmo quando uma PR vinculada "for mesclada
ou fechada". Os dois medem a cobertura sobre o **total de eventos ocorridos**.

Até aqui, o evento nascia da comparação do retrato de cada sincronização com o gravado (ADR-018 D1).
Isso perde transições:
- issue fechada e reaberta entre duas sincronizações tem os dois retratos abertos e não gera nada;
- PR fechada, reaberta e mesclada entre duas leituras gera só o merge;
- a data da reabertura era aproximada pela última atualização;
- a abertura não tinha contrato.

A segunda revisão (17/10/2026) recusou a proposta de 15/10/2026, que lia o histórico de cada artefato
vinculado cujo `updatedAt` mudou. Se a leitura do histórico falhasse ou passasse do limite depois de
o retrato ser gravado, o artefato não voltava a ser escolhido: o cursor sozinho não o torna elegível
de novo. O parecer pediu:
- pendência durável independente do retrato;
- identidade estável;
- paginação completa;
- data real do vínculo.

**Documentação do GitHub, lida em 17/10/2026:**
- `GET /repos/{owner}/{repo}/issues/events` só aceita `page` e `per_page` (até 100). Ordem, limite
  de páginas, limite de tempo e `since` não são documentados.
- Não existe evento `opened`. A criação de uma issue só aparece como `created_at` da própria issue.
- `closed`, `reopened` e `merged` trazem `id` e `created_at` ("quando o evento ocorreu"). Se o merge
  emite também um `closed` não está documentado.

**Fato do código.** A sincronização já lê essa listagem inteira a cada execução, para os indicadores
(`sync-project-pull-requests.service.js`). Ela guarda `closed`, `reopened` e `merged` das PRs em
`PullRequestLifecycleEvent`, com `providerEventId` único por projeto, e descarta os eventos de issue.

## Decisão

1. **Fonte (D1).** A listagem de eventos do repositório, lida por inteiro em toda sincronização.
   - A leitura sai da etapa das PRs para uma etapa própria, depois das issues. Assim, o evento de uma
     issue nova já encontra a issue gravada.
   - Os eventos de PR continuam em `PullRequestLifecycleEvent`. Os marcadores dos indicadores
     (`pullRequestLifecycleSyncedAt` e `pullRequestLifecycleCoverageFrom`) não mudam de sentido.
   - Os eventos `closed` e `reopened` de issue vão para `IssueLifecycleEvent`, tabela nova com
     `@@unique([projectId, providerEventId])`.
   - Nada depende da ordem da listagem: a leitura é completa e a deduplicação é pelo id.
2. **Identidade estável (D2).**
   - A chave de ocorrência de um evento lido do GitHub é `gh:<providerEventId>`.
   - A da abertura (D6) é `opened:<id da issue>:task:<id da tarefa>`.
3. **Evento independente do retrato (D3).**
   - O registro do GitHub e o evento de notificação que ele gera (com as tarefas alvo) persistem na
     mesma transação, com a trava do projeto.
   - A comparação de estado deixa de criar eventos. Ela fica só para o log da anomalia (PR mesclada
     que volta a outro estado).
   - **Falha na leitura:** nada daquela leitura é gravado, e a cobertura não anda (D7). A
     sincronização seguinte relê a lista inteira. Nenhuma pendência depende de o retrato ter mudado.
4. **Vínculo no instante do evento (D4).**
   - Cada mudança de vínculo grava um período em `TaskArtifactLinkPeriod`, na mesma transação. Os
     períodos têm tarefa, tipo, artefato, `linkedAt` e `unlinkedAt`.
   - Mudanças cobertas: vincular e desvincular issue; definir, trocar ou limpar a PR; excluir a
     tarefa.
   - O evento vale para as tarefas cujo período contém o `created_at` do GitHub
     (`linkedAt ≤ ocorrência < unlinkedAt`).
   - **Carga inicial.** Issue: `TaskIssue.createdAt`. PR: o instante da migration, porque o vínculo
     antigo de PR não tem data (aproximação declarada).
5. **Merge e fechamento (D5).**
   - O `closed` da mesma PR com até 5 s de diferença do `merged` faz parte do merge. Conta só
     `PULL_REQUEST_MERGED`. A regra vale com ou sem esse `closed`.
   - A reabertura de PR continua fora do RF61.
   - Na issue, `closed` vira `ISSUE_CLOSED` e `reopened` vira `ISSUE_REOPENED`, com a data real.
6. **Abertura no RF60 (D6).**
   - Quando uma issue **aberta** passa a estar vinculada a uma tarefa, a transação do vínculo
     registra `ISSUE_OPENED`, com a data de criação no GitHub, e o despacho avisa os envolvidos.
   - É uma vez por par (issue, tarefa): desvincular e vincular de novo não repete.
   - Issue fechada no instante do vínculo não gera abertura.
   - Fundamento: o RF12 só vincula issue importada. A abertura de uma issue vinculada só pode ser
     conhecida quando o vínculo nasce, e é nesse instante que ela vira evento da tarefa.
7. **Corte e cobertura (D7).** `GitHubEventCoverage`, uma linha por projeto:
   - `coverageFrom`: o instante da migration para as integrações existentes; o da primeira leitura
     para as novas. Evento anterior não gera aviso. Assim, conectar um repositório não avisa o
     histórico, e os eventos gravados antes pela comparação de estado não se duplicam.
   - `completeThrough`: o início da última leitura completa, menos 5 minutos de margem para a
     consistência eventual do GitHub. Só anda quando todas as páginas foram lidas e gravadas.
8. **Métrica (D8).** Por projeto e período ([NOTIFICATION_METRICS.md](../data/NOTIFICATION_METRICS.md)):
   - trecho antes de `coverageFrom`: lacuna `FONTE_POR_COMPARACAO_DE_ESTADO`;
   - trecho depois de `completeThrough`: lacuna `LACUNA_DE_AQUISICAO`;
   - período inteiro coberto: cobertura total calculada.
9. **Custo (D9).** Nenhuma requisição nova: a paginação já era feita para os indicadores. Por evento
   novo de artefato vinculado, uma linha de evento e uma por tarefa alvo.

## Alternativas consideradas

- **Histórico por artefato vinculado que mudou (proposta de 15/10/2026).** Rejeitada pela crítica da
  segunda revisão: a seleção por `updatedAt`, depois de o retrato ser gravado, pode deixar o artefato
  fora da tentativa seguinte.
- **Webhooks `issues` e `pull_request` com reconciliação.**
  - Exigem assinar os eventos na App, que pertence ao dono, além de HMAC.
  - O GitHub não reentrega sozinho; a reentrega manual só cobre 3 dias.
  - Exigem reconciliar com a sincronização.
  - Ficam como evolução, se a latência importar.
- **API de atividade.** Rejeitada: 30 dias, 300 eventos e latência de até 6 h.
- **Só a comparação de estado.** Era o estado anterior. A cobertura total ficaria indisponível para
  sempre.
- **Só `Task.pullRequestLinkedAt`.** Rejeitada: não cobre desvincular e vincular de novo.
- **Abertura só como reabertura (ADR-018 D3 anterior).** Rejeitada: o parecer pediu contrato
  explícito para a abertura, e o João pediu aderência literal ao TCC.

## Consequências positivas

- Fechar e reabrir, ou fechar, reabrir e mesclar entre duas sincronizações, viram eventos reais, com
  a data do GitHub.
- O total de eventos ocorridos fica conhecido no período coberto, e a cobertura total pode ser
  calculada.
- Falha temporária não perde evento: a leitura seguinte relê tudo.
- A abertura tem contrato.

## Consequências negativas

- **Paginação.** A leitura completa cresce com a atividade do repositório. Esse custo já existia para
  os indicadores.
- **Atraso.** O aviso chega na sincronização seguinte, como antes.
- **Vínculos antigos de PR.** Valem a partir da migration.
- **Data do aviso de abertura.** A abertura é avisada no vínculo, com a data de criação no GitHub,
  que é anterior.
- **Migrations.** Três novas: períodos de vínculo, eventos de issue com a cobertura, e o valor
  `ISSUE_OPENED`.
- **Código do Daniel.** O mapper, o cliente, a etapa das PRs e a orquestração da sincronização mudam.

## Impactos de segurança e privacidade

- A requisição é a mesma de antes, com a mesma credencial e o mesmo prazo.
- Do evento ficam o tipo, a data e o id. O `actor` do GitHub não é gravado.
- Os períodos de vínculo guardam ids e datas, sem título nem login.

## Resposta à crítica da segunda revisão

| Crítica | Resposta |
| --- | --- |
| A seleção por `updatedAt` pode excluir o artefato da próxima tentativa | não há seleção: toda sincronização relê a lista inteira (D1, D3) |
| Pendência durável independente do retrato | o registro do GitHub e o evento persistem juntos; a falha não grava nada, e a leitura seguinte refaz (D3) |
| Identidade estável | `gh:<providerEventId>` (D2) |
| Paginação completa | leitura de todas as páginas, sem depender da ordem (D1) |
| Data real do vínculo | `TaskArtifactLinkPeriod` (D4) |
| Abertura com contrato explícito | `ISSUE_OPENED` no vínculo (D6) |
| Indisponibilidade explícita até haver evidência completa | cobertura por período, com as duas lacunas (D7, D8) |
