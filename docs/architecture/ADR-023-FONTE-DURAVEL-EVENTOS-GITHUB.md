# ADR-023 — Fonte durável dos eventos de issues e pull requests

- **Estado:** aceita pelo autor (João) em 17/10/2026, com o aval das recomendações do
  `PR26_PROMPT_CORRECOES_REVISAO_2.md` (não versionado), e revista em 18/10/2026 depois da terceira
  revisão independente (`PR26_PROMPT_CORRECOES_REVISAO_3.md`, não versionado). A aprovação
  arquitetural do Daniel está pendente e não é presumida. Substitui a proposta de 15/10/2026, que a
  segunda revisão criticou.
- **Data:** 15/10/2026 (proposta); 17/10/2026 (revisão e aceite do autor); 18/10/2026 (revisão pela
  terceira revisão: TF-REV-014 e o restante do TF-REV-002)
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
   - A da associação (D6) é `linked:<id da issue>:task:<id da tarefa>`. Até 18/10/2026 era
     `opened:`, e a migration do D6 converte as linhas antigas.
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
5. **Merge e fechamento (D5).** Revisto em 18/10/2026 (TF-REV-014): a proximidade no tempo, sozinha,
   não prova que o `closed` é o do merge. Um `closed` de PR só faz parte do merge quando é o
   fechamento par dele:
   - existe `merged` da mesma PR a até 5 s;
   - nenhum `reopened` da mesma PR está entre os dois na sequência: o instante e, no mesmo segundo,
     o `id` do evento no GitHub, comparado como número. Sem `id` numérico, a ordem no mesmo segundo
     é desconhecida, e um `reopened` nesse segundo impede a absorção;
   - cada `merged` absorve no máximo um `closed`, o mais próximo.

   Quando o merge só aparece no retrato da PR (`mergedAtGithub`, sem evento), o intervalo é fechado
   nas duas pontas: um `reopened` no mesmo segundo impede a absorção, e o fechamento sai como aviso.
   A política lê o histórico gravado da PR na janela, inclusive o de sincronizações anteriores.
   - A reabertura de PR continua fora do RF61.
   - Na issue, `closed` vira `ISSUE_CLOSED` e `reopened` vira `ISSUE_REOPENED`, com a data real.
6. **Associação de issue aberta no RF60 (D6).** Revisto em 18/10/2026 (TF-REV-002): vincular e abrir
   são fatos diferentes.
   - **Interpretação.** O TraceFlow não cria issues no GitHub; ele só lista issues e eventos. "Uma
     issue vinculada a ela for aberta" acontece aqui de duas formas: a reabertura (`ISSUE_REOPENED`,
     evento do ciclo de vida) e o vínculo de uma issue que já está aberta, que é a associação.
   - Quando uma issue **aberta** passa a estar vinculada a uma tarefa, a transação do vínculo
     registra `ISSUE_LINKED`, com o instante do vínculo, e o despacho avisa os envolvidos. A data de
     criação da issue no GitHub fica só como contexto.
   - É uma vez por par (issue, tarefa): desvincular e vincular de novo não repete.
   - Issue fechada no instante do vínculo não gera associação.
   - A métrica separa a associação do ciclo de vida (D8).
   - Até 18/10/2026, o evento se chamava `ISSUE_OPENED` e levava a data de criação. Uma migration
     converte as linhas antigas: o tipo, a chave e o instante, que passa a ser o `detectedAt`.
7. **Corte e cobertura (D7).** `GitHubEventCoverage`, uma linha por projeto:
   - `coverageFrom`: o instante da migration para as integrações existentes; o da primeira leitura
     para as novas. Evento anterior não gera aviso. Assim, conectar um repositório não avisa o
     histórico, e os eventos gravados antes pela comparação de estado não se duplicam.
   - `completeThrough`: o início da última leitura completa, menos 5 minutos de margem. Só anda
     quando todas as páginas foram lidas e gravadas.
   - **Cobertura presumida (18/10/2026).** A margem de 5 minutos é hipótese operacional para a
     consistência eventual do GitHub, que não garante a completude da listagem. A métrica declara a
     cobertura como presumida e confere a aquisição (D8).
8. **Métrica (D8).** Por projeto e período ([NOTIFICATION_METRICS.md](../data/NOTIFICATION_METRICS.md)):
   - trecho antes de `coverageFrom`: lacuna `FONTE_POR_COMPARACAO_DE_ESTADO`;
   - trecho depois de `completeThrough`: lacuna `LACUNA_DE_AQUISICAO`;
   - **conferência da aquisição (18/10/2026):** PR ou issue vinculada cujo retrato (`mergedAtGithub`
     ou `closedAtGithub`) cai no trecho coberto, sem o evento correspondente gravado, também é
     `LACUNA_DE_AQUISICAO`, com o artefato e o instante;
   - período inteiro coberto e sem lacuna: cobertura total calculada, rotulada como presumida;
   - o RF60 conta o ciclo de vida (`ISSUE_CLOSED` e `ISSUE_REOPENED`); a associação
     (`ISSUE_LINKED`) sai à parte, em `RF60_ASSOCIACAO`, com o mesmo cálculo.
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
- **`ISSUE_OPENED` com a data de criação (17/10/2026).** Revista em 18/10/2026: misturava o vínculo
  com a abertura no texto e na métrica, e contava a associação no período da criação da issue.
- **Deixar de avisar a associação.** Rejeitada: perde o aviso que a segunda rodada aprovou.
- **`commit_id` do `closed` e do `merged` para identificar o fechamento do merge.** Rejeitada:
  exigiria gravar o campo e depende de um comportamento do GitHub que a documentação não garante.

## Consequências positivas

- Fechar e reabrir, ou fechar, reabrir e mesclar entre duas sincronizações, viram eventos reais, com
  a data do GitHub.
- O total de eventos ocorridos fica conhecido no período coberto, e a cobertura total pode ser
  calculada.
- Falha temporária não perde evento: a leitura seguinte relê tudo.
- A associação tem contrato, instante e contagem próprios, separados do ciclo de vida.
- O fechamento distinto de uma PR reaberta e mesclada não se perde.
- A métrica diz que a cobertura é presumida e mostra o artefato quando a aquisição falha.

## Consequências negativas

- **Paginação.** A leitura completa cresce com a atividade do repositório. Esse custo já existia para
  os indicadores.
- **Atraso.** O aviso chega na sincronização seguinte, como antes.
- **Vínculos antigos de PR.** Valem a partir da migration.
- **Associação.** O aviso de issue aberta vinculada nasce no vínculo, e a sua contagem fica fora do
  percentual do ciclo de vida.
- **Migrations.** Quatro: períodos de vínculo, eventos de issue com a cobertura, o valor
  `ISSUE_OPENED` (17/10/2026) e a troca dele por `ISSUE_LINKED` (18/10/2026).
- **Conferência da aquisição.** Uma consulta a mais por projeto no cálculo da métrica.
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
| Abertura com contrato explícito | associação `ISSUE_LINKED` no vínculo, desde 18/10/2026 (D6) |
| Indisponibilidade explícita até haver evidência completa | cobertura por período, com as duas lacunas (D7, D8) |

## Resposta à terceira revisão

| Ponto do parecer | Resposta |
| --- | --- |
| TF-REV-014: a janela de 5 s elimina um fechamento real | o fechamento só é absorvido quando é o par do merge, pela sequência e sem reabertura entre os dois (D5) |
| Vincular e abrir são fatos distintos | `ISSUE_LINKED` com o instante do vínculo, texto próprio e contagem em `RF60_ASSOCIACAO` (D6, D8) |
| A margem de 5 min é hipótese, não garantia do GitHub | cobertura declarada presumida e conferência da aquisição pelo retrato (D7, D8) |
| Leitura completa: custo cresce com o repositório | ensaio local com 10 mil e 50 mil eventos, no relatório da rodada; o ensaio no Always Free fica para a homologação |
| Preservar o núcleo da fonte durável | eventos gravados, destinos atômicos e períodos de vínculo não mudam |
