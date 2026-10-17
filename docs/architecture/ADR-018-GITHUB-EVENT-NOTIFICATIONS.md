# ADR-018 — Notificações de eventos de issues e pull requests

- **Estado:** aceita para o cartão S2-03 (RF60, RF61); revista em 13/10/2026 (correções da campanha de
  testes), em 15/10/2026 (revisão independente da PR #26) e em 17/10/2026 (segunda revisão
  independente)
- **Data:** 12/10/2026
- **Responsáveis:** João Vitor S. Hernandes

## Contexto

O documento oficial do TCC (Somativa 2) pede duas notificações ligadas ao GitHub:

- **RF60 (Quadro 3-57):** os usuários envolvidos na tarefa são avisados quando uma issue vinculada a
  ela é aberta ou fechada no repositório.
- **RF61 (Quadro 3-58):** os usuários envolvidos na tarefa são avisados quando uma pull request
  vinculada a ela é mesclada ou fechada. O quadro não fala de abertura.

Os dois quadros têm a mesma métrica do RF30 e do RF59: `(notificações enviadas corretamente / total
de eventos ocorridos) × 100`. O UC04 (Sincronizar dados do GitHub, Quadro 3-72) compara os dados
recebidos com os armazenados (passo 4) e prevê a sincronização automática agendada (A1). O cartão
S2-03 do roadmap acrescenta: evento só depois de transição real, destinatários pela participação na
tarefa e no projeto, sem duplicata em sincronizações repetidas, reprocessamento sem perda e nenhuma
exposição de token ou resposta bruta do GitHub.

Restrições do terreno:

- A sincronização lista todas as PRs e issues a cada execução (`state: 'all'`, sem `since`) e grava
  cada página numa transação com o `Project` travado. O estado anterior não era comparado.
- Os webhooks da GitHub App só tratam eventos de instalação.
- O vínculo de PR é `Task.pullRequestId`, sem data; o de issue é `TaskIssue`. Os dois são manuais
  (o vínculo automático do RF41 é só de commit) e travam o mesmo `Project`.
- O RF12 (Quadro 3-29) vincula tarefas a issues **importadas**. Nenhuma tarefa está vinculada a uma
  issue no instante em que ela é criada no GitHub.
- A central de notificações, as preferências e a visibilidade vêm do S2-02 (ADR-016).
- Transação interativa do Prisma que espera um bloqueio além do seu tempo derruba requisições de
  outras pessoas (S202-R01, S202-F29).
- A sincronização automática (UC04, A1) está na PR #24, ainda não integrada.

## Decisão

1. **Fonte (D1).** Desde 17/10/2026, o evento nasce do histórico de eventos do repositório
   (`GET /repos/{owner}/{repo}/issues/events`), lido por inteiro em toda sincronização, manual ou
   automática ([ADR-023](ADR-023-FONTE-DURAVEL-EVENTOS-GITHUB.md)).
   - O registro do GitHub e o evento persistem na mesma transação, com a trava do projeto. A
     comparação de estado deixou de criar eventos e fica só para o log da anomalia.
   - Leitura incompleta não grava nada e não avança a cobertura; a sincronização seguinte relê a
     lista inteira.
   - Conectar um repositório não gera evento: o corte do ADR-023 D7 começa na primeira leitura.
   - Até 17/10/2026, o evento nascia da comparação do retrato de cada sincronização com o gravado.
     Os eventos daquela fonte continuam na fila e na métrica, antes do corte.
   - A falha de uma página é registrada mesmo quando a conexão cai junto com ela. A gravação da
     falha da execução tem até três tentativas, e os ganchos de alerta e de despacho rodam depois.
   - As escritas da sincronização esperam a trava do projeto por no máximo 5 s
     (`FOR UPDATE NOWAIT`, com nova tentativa em transação nova). Esgotado o prazo, a página falha
     com `GITHUB_SYNC_PROJECT_BUSY`.
   - Erro de banco na sincronização sai com `GITHUB_SYNC_STORAGE_FAILED` e mensagem própria. O
     código interno do Prisma fica só no log.
2. **Eventos (D2).**
   - Issue: `closed` vira `ISSUE_CLOSED` e `reopened` vira `ISSUE_REOPENED`, com a data do GitHub.
   - PR: `merged` vira `PULL_REQUEST_MERGED`; `closed` vira `PULL_REQUEST_CLOSED`, salvo quando está a
     até 5 s do `merged` da mesma PR, caso em que faz parte do merge.
   - Não geram: reabertura de PR e qualquer outro tipo de evento do GitHub.
   - A tabela completa está em [GITHUB_EVENT_NOTIFICATIONS.md](../data/GITHUB_EVENT_NOTIFICATIONS.md).
3. **Abertura no RF60 (D3).** Desde 17/10/2026, são duas:
   - `ISSUE_REOPENED`, a reabertura de uma issue vinculada;
   - `ISSUE_OPENED`, registrado quando uma issue **aberta** passa a estar vinculada a uma tarefa, com
     a data de criação no GitHub. É uma vez por par (issue, tarefa), e issue fechada no instante do
     vínculo não gera abertura (ADR-023 D6).

   Fundamento: o RF12 (Quadro 3-29) só vincula issue importada, então a abertura de uma issue
   vinculada só é conhecida quando o vínculo nasce. Até 17/10/2026, só a reabertura contava; a
   segunda revisão pediu contrato explícito para a abertura.
4. **Vínculo (D4).** Vale o vínculo no instante do evento: as tarefas cujo período de vínculo
   (`TaskArtifactLinkPeriod`) contém o `created_at` do GitHub, gravadas com o evento (ADR-023 D4).
   Artefato sem tarefa vinculada naquele instante não gera evento: é o alerta do S2-01 (ADR-015).
5. **Fila transacional (D5).** `GitHubArtifactEvent` guarda uma linha por transição de artefato
   vinculado, com o snapshot do artefato, a contagem de tarefas vinculadas e o estado do despacho;
   `GitHubArtifactEventTask` guarda o retrato. A chave da ocorrência é única por projeto. Evento e
   estado novo persistem juntos ou não persistem. A fila fica no módulo `notifications`, que não
   importa `github`, `issues` nem `pullRequests`.
   - Os eventos e os retratos da página são gravados em lote: um `INSERT` dos eventos, a leitura dos
     ids pela chave da ocorrência e um `INSERT` dos retratos.
   - O custo da página com transição não cresce com o número de transições.
6. **Destinatários (D6).** Participantes de cada tarefa do retrato, no instante do despacho: o
   responsável, quem tem comentário não excluído e quem registrou esforço. Valem as condições do
   S2-02: conta `ACTIVE`, membership ativa no projeto e preferência ligada. Quem fechou ou mesclou não
   é excluído, porque a listagem do GitHub não diz quem foi.
7. **Tipos e deduplicação (D7).** `ISSUE_EVENT` (RF60) e `PULL_REQUEST_EVENT` (RF61), com
   preferência por tipo e sem efeito retroativo (`enabledAt` até a detecção). Uma notificação por
   (evento, tarefa, pessoa), com chave `<tipo>:event:<eventId>:task:<taskId>`.
8. **Sem janela (D8).** A transição de artefato vinculado é notificada qualquer que seja a idade da
   ocorrência (Quadros 3-57 e 3-58). O motivo `OUTSIDE_WINDOW` e a variável
   `GITHUB_EVENT_NOTIFICATIONS_LOOKBACK_DAYS` saíram na revisão de 15/10/2026.
9. **Despacho (D9).**
   - Roda logo depois de cada execução de sincronização, com sucesso ou falha (até 100 eventos do
     projeto), e num job externo a cada 15 minutos (`npm run notifications:github-events`). Nunca
     por `setInterval` na API.
   - Sem transação interativa: reserva por `UPDATE` condicional com prazo de 2 minutos, inserção com
     `skipDuplicates`, conferência das chaves gravadas e fechamento pelo token da reserva. É entrega
     pelo menos uma vez com consumidor idempotente.
   - Até 5 tentativas, com esperas de 1, 5, 30 e 120 minutos; depois, `FAILED`, com reprocessamento
     manual (`--retry-failed`). Falha no despacho nunca muda o resultado da sincronização.
   - Cada reserva conta como tentativa, inclusive a retomada de uma reserva vencida. É essa contagem
     que leva a `FAILED` (`DISPATCH_INTERRUPTED`) o evento que derruba o despachante.
   - A reserva perdida deixa log (`github_event_notification_claim_lost`).
10. **Conteúdo (D10).** A notificação copia o evento, o número, o título e a URL do artefato e a data
    da ocorrência. Nunca leva token, cabeçalho ou resposta do GitHub, corpo, login, rótulos ou
    e-mail. O despacho não chama o GitHub.
11. **Visibilidade (D11).** Igual ao ADR-016 D9. Não há rota nova; a fila não é exposta.
    - O evento de projeto excluído é despachado como qualquer outro.
    - As notificações ficam ocultas enquanto o projeto estiver excluído e aparecem com a restauração.
    - A purga apaga evento, retrato e notificações.
    - Não há exclusão por projeto excluído.
12. **Contrato (D12).** Contexto novo no DTO e quatro chaves obrigatórias nas preferências. A
    divergência com o §12 do contexto de arquitetura continua declarada (ADR-016 D17).
    - A exigência das quatro chaves vale desde 12/10/2026 (`5341a1c`). Chave ausente responde 400
      com a mensagem para recarregar a página.
    - A lista aceita o filtro `group` (`ALL`, `TASKS` ou `GITHUB`).
13. **Interface (D13).** Itens "Issue" e "Pull request" no painel lateral de notificações (ADR-022),
    e o grupo "Avisos do GitHub" nas preferências.
    - O item abre a tarefa. "Abrir no GitHub" fica no destino, não no item.
    - O painel filtra por origem: Todas, Tarefas, GitHub e Inconsistências.
    - O nome acessível do item e do botão de leitura leva o texto do contexto, em todos os tipos.
14. **Métrica (D14).** Mesmo critério do ADR-016 D16 (cobertura total sobre os eventos ocorridos,
    cobertura elegível rotulada), na unidade do par (tarefa, participante).
    - O despacho grava o resultado de cada evento (`outcome`), porque a maior parte do despacho não
      passa pela saída do job.
    - "Enviada corretamente" é o par com `created` ou `alreadyNotified` no `outcome`.
      `alreadyNotified` é a notificação criada por uma tentativa anterior do mesmo evento, não uma
      duplicata.
    - A cobertura total é calculada no trecho coberto pela fonte durável. Antes do corte, sai
      "indisponível" com `FONTE_POR_COMPARACAO_DE_ESTADO`; depois da última leitura completa, com
      `LACUNA_DE_AQUISICAO` ([NOTIFICATION_METRICS.md](../data/NOTIFICATION_METRICS.md)).
15. **Observabilidade (D15).** Logs só com contagens, ids e códigos. Só o reprocessamento manual é
    auditado.
    - A saída do job traz as contagens da execução, o estoque de `FAILED` (`failedStock`), os
      pendentes (`pendingAfter`), as pendências vencidas (`dueAfter`), há quanto tempo a mais antiga
      venceu (`oldestDueAgeSeconds`) e as reservas perdidas (`claimLost`).
    - O código de saída é 0, 1 ou 2.
    - O log dos jobs vai para `stderr`, e o `stdout` traz só o relatório.
16. **Privacidade (D16).** A notificação segue o S2-02 (exportação, anonimização e 180 dias). A fila
    é dado do projeto, sem id de pessoa; eventos `DISPATCHED` e `FAILED` com mais de 180 dias são
    apagados pelo `privacy:retention`.
17. **Coordenação (D17).** O S2-03 não depende da PR #24. Com ela, a gravação da fila fica sob o
    guarda de lease e as execuções automáticas despacham no worker. Este ADR é o 018 porque o 017 foi
    recomendado ao worker da PR #24.
18. **Fora (D18).** Webhooks de issue e PR, exclusão do autor da ação, vínculo automático de issue e
    PR, abertura e reabertura de PR, e-mail e resumo, indicador no produto, motivo do fechamento e
    link direto para o artefato na Rastreabilidade (S203-F01 a F08).

## Alternativas consideradas

- **Webhooks `issues` e `pull_request`.** Rejeitados nesta entrega: exigem assinar eventos na
  configuração da App, tratar entregas repetidas e fora de ordem e reconciliar com a sincronização,
  e não são verificáveis localmente (S203-F01).
- **Linha do tempo do GitHub de todo artefato a cada sincronização.** Rejeitada: uma requisição por
  issue ou PR, contra o limite de taxa. A variante restrita ao artefato vinculado que mudou está
  proposta no ADR-023.
- **Notificar quando alguém vincula uma issue aberta.** Rejeitada em 12/10/2026, por ser ação no
  TraceFlow. Adotada em 17/10/2026 como a abertura do RF60 (D3), a pedido da segunda revisão.
- **Ler os vínculos no despacho.** Rejeitada: daria aviso retroativo a vínculo criado depois da
  transição, e a PR não tem data de vínculo para filtrar.
- **Só o responsável como destinatário.** Rejeitada: o texto oficial fala de usuários envolvidos,
  no plural. Quem moveu a tarefa também foi rejeitado, porque gestores receberiam tudo.
- **Um tipo por evento.** Rejeitada: seis interruptores na tela para dois requisitos.
- **Despacho em transação interativa.** Rejeitado: a FK da notificação espera o `Project` travado por
  até 15 s, além dos 5 s da transação (mecanismo do S202-R01).
- **Só o job, sem despacho depois da sincronização.** Rejeitado: o aviso atrasaria até 15 minutos
  além da sincronização.
- **Métrica só pela saída do job.** Rejeitada: o despacho depois da sincronização não aparece nela.
- **Fechar o evento de projeto excluído sem notificação (`PROJECT_DELETED`).** Era a regra até
  12/10/2026. Foi rejeitada porque o aviso se perdia de vez quando o projeto era restaurado
  (S203-A02).
- **Adiar o despacho enquanto o projeto estiver excluído.** Rejeitada: exigia mais estado na fila e
  o tratamento de uma corrida, para o mesmo resultado que a visibilidade do S2-02 já dá.
- **Gravar a fila numa transação curta depois da página.** Rejeitada: separaria o estado novo do
  evento, e a queda da segunda transação perderia a transição.
- **Buscar a data real da reabertura na API de eventos da issue.** Rejeitada em 12/10/2026: seria uma
  requisição por reabertura, com falha e limite de taxa a tratar. A aproximação é declarada. A data
  real volta como parte do ADR-023, proposto.
- **Janela de 7 dias (versão de 12/10/2026).** Rejeitada na revisão de 15/10/2026: os Quadros 3-57 e
  3-58 não limitam a idade do evento.
- **Não contar a retomada de uma reserva vencida como tentativa.** Rejeitada: o evento que derruba o
  despachante voltaria sem fim.

## Consequências positivas

- Toda transição real de artefato vinculado vira exatamente um evento, por construção, e cada par
  elegível vira exatamente uma notificação.
- Falha em qualquer ponto é reprocessada sem perda e sem duplicata.
- A sincronização automática da PR #24 passa a avisar sem mudança neste código.
- O despacho não depende do GitHub nem de transação interativa.
- A métrica com dados reais pode ser reconstruída pelos eventos gravados, dentro da retenção.

## Consequências negativas

- O aviso chega na sincronização seguinte à mudança no GitHub; até a PR #24, só na manual.
- Até 17/10/2026, mudanças intermediárias entre duas sincronizações se fundiam e a data da
  reabertura era aproximada. Desde então, a fonte é o histórico do GitHub (ADR-023).
- Quem fechou ou mesclou também recebe o aviso.
- A abertura é avisada no vínculo, com a data de criação no GitHub, que é anterior (D3).
- A página com transição faz até cinco instruções a mais que a página sem transição, qualquer que
  seja o número de transições.
- A página sem transição fazia cerca de três instruções por item (um upsert por item, anterior ao
  S2-03). Com latência de rede até o banco, a página de 100 itens chegava aos 5 s da transação
  por volta de 15 ms: levava 4,8 s com 14,7 ms e caía com `P2028` com 17,6 ms (medição de
  13/10/2026, com ou sem transição). Desde o [ADR-021](ADR-021-GRAVACAO-POR-DIFERENCA.md), a
  página grava só o que mudou, e o orçamento de latência está lá (S203-F22).
- Notificações de projeto excluído existem, ocultas, até a restauração ou a purga.
- `Notification` ganha cinco colunas anuláveis e o contrato de preferências muda.
- O ADR-016 previa o S2-03 "sem migration nova"; os valores novos do enum e o contexto do artefato
  exigem migration.

## Impactos de segurança e privacidade

- Nenhuma rota nova. Os destinatários são calculados no servidor, a partir de dados persistidos.
- O título do artefato vem de terceiros: é exibido como texto, limitado a 256 caracteres. A URL só
  é aceita com o prefixo `https://github.com/` e abre em nova aba com `rel="noopener noreferrer"`.
  Ela é conferida de novo na saída: no DTO e na exportação.
- O retrato só aceita tarefas do projeto do evento.
- Logs sem título, URL, login, nome ou e-mail.
- **Dados pessoais:**
  - a notificação é dado do titular: exportada com os campos novos, apagada na anonimização e
    retida por 180 dias;
  - a fila é dado do projeto, sem id de pessoa, mas o título do artefato pode conter dado pessoal
    escrito no GitHub; eventos processados são apagados depois de 180 dias.

## Revisão de 13/10/2026 — correções da campanha de testes

A campanha de [S2_03_RELATORIO_TESTES.md](../issues/S2_03_RELATORIO_TESTES.md) encontrou 13
achados. As decisões abaixo foram aprovadas pelo João em 13/10/2026 e estão incorporadas no texto
acima.

| Achado | Decisão |
| --- | --- |
| S203-A01 | falha da página registrada com nova tentativa; trava do projeto esperada por no máximo 5 s nas escritas da sincronização (D1) |
| S203-A02 | evento de projeto excluído despachado e oculto pela visibilidade do S2-02; `PROJECT_DELETED` deixa de existir (D11) |
| S203-A03 | fila gravada em lote, com custo constante por página (D5) |
| S203-A04 | data da reabertura declarada como aproximação (D2) |
| S203-A05, S203-A11, S203-A12 | estoque de `FAILED`, pendência vencida e reserva perdida na saída do job; `attempts` conta reservas (D9, D15) |
| S203-A06 | códigos estáveis para falha de gravação e trava esgotada na sincronização (D1) |
| S203-A07, S203-A08 | nomes acessíveis com o contexto e filtro por origem (D12, D13) |
| S203-A10 | data da mudança do contrato de preferências e mensagem de chave ausente (D12) |
| S203-A13 | linha de base, termo "enviada corretamente", custo declarado e log dos jobs em `stderr` (D1, D5, D14, D15) |

O S203-A09 (URL conferida de novo na exportação) muda a implementação sem alterar decisão.

## Revisão de 15/10/2026 — revisão independente da PR #26

A revisão independente publicada na PR #26 pediu aderência literal ao TCC e a fonte durável dos
eventos. O João aprovou as recomendações em 15/10/2026
([PR26_PROMPT_CORRECOES_REVISAO.md](../issues/PR26_PROMPT_CORRECOES_REVISAO.md), não versionado),
e as decisões estão incorporadas no texto acima:

| Achado | Decisão |
| --- | --- |
| TF-REV-002 | sem janela (D8); "aberta" mantida como reabertura, com o fundamento do RF12 (D3) |
| TF-REV-002 | métrica com o total de eventos ocorridos e "indisponível" enquanto a fonte for a comparação de estado (D14) |
| TF-REV-002 | fonte durável proposta no ADR-023, à espera do portão G1 (D1) |
| TF-REV-008 | itens no painel lateral, com a origem Inconsistências (D13) |

## Revisão de 17/10/2026 — segunda revisão independente da PR #26

A segunda revisão manteve o TF-REV-002 aberto: a comparação de estado perde transições, e a
abertura não tinha contrato. O João aprovou as recomendações em 17/10/2026
(`PR26_PROMPT_CORRECOES_REVISAO_2.md`, não versionado):

| Achado | Decisão |
| --- | --- |
| TF-REV-002 | fonte pelo histórico de eventos do repositório, com o id do GitHub como identidade (D1, D2; ADR-023) |
| TF-REV-002 | `ISSUE_OPENED` no vínculo de issue aberta (D3) |
| TF-REV-002 | vínculo no instante do evento, pelos períodos de vínculo (D4) |
| TF-REV-002 | cobertura total calculada no trecho coberto, com as lacunas antes e depois (D14) |

