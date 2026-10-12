# ADR-018 — Notificações de eventos de issues e pull requests

- **Estado:** aceita para o cartão S2-03 (RF60, RF61)
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

1. **Fonte (D1).** A transição nasce da comparação de estado na sincronização (UC04, passo 4), na
   mesma transação que grava a página de PRs ou issues. Vale para a sincronização manual e para a
   automática, que passam pelos mesmos `upsertMany`.
2. **Estados e transições (D2).**
   - Issue: `OPEN` ou `CLOSED`. PR: `OPEN`, `CLOSED` (fechada sem merge) ou `MERGED`.
   - Geram evento: issue `OPEN → CLOSED` (`ISSUE_CLOSED`), issue `CLOSED → OPEN` (`ISSUE_REOPENED`),
     PR `OPEN`/`CLOSED → MERGED` (`PULL_REQUEST_MERGED`), PR `OPEN → CLOSED` (`PULL_REQUEST_CLOSED`) e
     `CLOSED → CLOSED` com outra data de fechamento (fechada de novo entre duas sincronizações).
   - Não geram: a primeira observação de um artefato, estado anterior desconhecido, reabertura de
     PR, PR depois de `MERGED` e mudança só de título, corpo, rótulo ou autor.
   - A tabela completa está em [GITHUB_EVENT_NOTIFICATIONS.md](../data/GITHUB_EVENT_NOTIFICATIONS.md).
3. **Abertura no RF60 (D3).** É a reabertura de uma issue já vinculada (`ISSUE_REOPENED`), a única
   abertura observável, porque a issue só é vinculada depois de importada.
4. **Vínculo (D4).** Vale o retrato dos vínculos no instante da transição, lido na mesma transação e
   gravado com o evento. Artefato sem tarefa vinculada não gera evento: é o alerta do S2-01
   (ADR-015).
5. **Fila transacional (D5).** `GitHubArtifactEvent` guarda uma linha por transição de artefato
   vinculado, com o snapshot do artefato, a contagem de tarefas vinculadas e o estado do despacho;
   `GitHubArtifactEventTask` guarda o retrato. A chave da ocorrência é única por projeto. Evento e
   estado novo persistem juntos ou não persistem. A fila fica no módulo `notifications`, que não
   importa `github`, `issues` nem `pullRequests`.
6. **Destinatários (D6).** Participantes de cada tarefa do retrato, no instante do despacho: o
   responsável, quem tem comentário não excluído e quem registrou esforço. Valem as condições do
   S2-02: conta `ACTIVE`, membership ativa no projeto e preferência ligada. Quem fechou ou mesclou não
   é excluído, porque a listagem do GitHub não diz quem foi.
7. **Tipos e deduplicação (D7).** `ISSUE_EVENT` (RF60) e `PULL_REQUEST_EVENT` (RF61), com
   preferência por tipo e sem efeito retroativo (`enabledAt` até a detecção). Uma notificação por
   (evento, tarefa, pessoa), com chave `<tipo>:event:<eventId>:task:<taskId>`.
8. **Janela (D8).** Transição ocorrida mais de `GITHUB_EVENT_NOTIFICATIONS_LOOKBACK_DAYS` dias (padrão
   7) antes da detecção é despachada sem notificação (`OUTSIDE_WINDOW`).
9. **Despacho (D9).**
   - Roda logo depois de cada execução de sincronização, com sucesso ou falha (até 100 eventos do
     projeto), e num job externo a cada 15 minutos (`npm run notifications:github-events`). Nunca
     por `setInterval` na API.
   - Sem transação interativa: reserva por `UPDATE` condicional com prazo de 2 minutos, inserção com
     `skipDuplicates`, conferência das chaves gravadas e fechamento pelo token da reserva. É entrega
     pelo menos uma vez com consumidor idempotente.
   - Até 5 tentativas, com esperas de 1, 5, 30 e 120 minutos; depois, `FAILED`, com reprocessamento
     manual (`--retry-failed`). Falha no despacho nunca muda o resultado da sincronização.
10. **Conteúdo (D10).** A notificação copia o evento, o número, o título e a URL do artefato e a data
    da ocorrência. Nunca leva token, cabeçalho ou resposta do GitHub, corpo, login, rótulos ou
    e-mail. O despacho não chama o GitHub.
11. **Visibilidade (D11).** Igual ao ADR-016 D9. Não há rota nova; a fila não é exposta.
12. **Contrato (D12).** Contexto novo no DTO e quatro chaves obrigatórias nas preferências. A
    divergência com o §12 do contexto de arquitetura continua declarada (ADR-016 D17).
13. **Interface (D13).** Cartões "Issue" e "Pull request" na central, com "Abrir tarefa" e "Abrir no
    GitHub", e o grupo "Avisos do GitHub" nas preferências.
14. **Métrica (D14).** Mesmo critério do ADR-016 D16, na unidade do par (tarefa, participante). O
    despacho grava o resultado de cada evento (`outcome`), porque a maior parte do despacho não passa
    pela saída do job.
15. **Observabilidade (D15).** Logs só com contagens, ids e códigos. Saída do job com contagens,
    pendentes e idade do mais antigo; código de saída 0, 1 ou 2. Só o reprocessamento manual é
    auditado.
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
- **Linha do tempo do GitHub por artefato.** Rejeitada: uma requisição por issue ou PR a cada
  sincronização, contra o limite de taxa.
- **Notificar quando alguém vincula uma issue aberta.** Rejeitada: é ação no TraceFlow, não evento
  no repositório.
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

## Consequências positivas

- Toda transição real de artefato vinculado vira exatamente um evento, por construção, e cada par
  elegível vira exatamente uma notificação.
- Falha em qualquer ponto é reprocessada sem perda e sem duplicata.
- A sincronização automática da PR #24 passa a avisar sem mudança neste código.
- O despacho não depende do GitHub nem de transação interativa.
- A métrica com dados reais pode ser reconstruída pelos eventos gravados, dentro da retenção.

## Consequências negativas

- O aviso chega na sincronização seguinte à mudança no GitHub; até a PR #24, só na manual.
- Mudanças intermediárias entre duas sincronizações se fundem: fechar e reabrir uma issue entre
  elas não deixa rastro.
- Quem fechou ou mesclou também recebe o aviso.
- A criação de uma issue nunca notifica.
- A transação de cada página faz até três consultas a mais quando há transição.
- `Notification` ganha cinco colunas anuláveis e o contrato de preferências muda.
- O ADR-016 previa o S2-03 "sem migration nova"; os valores novos do enum e o contexto do artefato
  exigem migration.

## Impactos de segurança e privacidade

- Nenhuma rota nova. Os destinatários são calculados no servidor, a partir de dados persistidos.
- O título do artefato vem de terceiros: é exibido como texto, limitado a 256 caracteres. A URL só
  é aceita com o prefixo `https://github.com/` e abre em nova aba com `rel="noopener noreferrer"`.
- O retrato só aceita tarefas do projeto do evento.
- Logs sem título, URL, login, nome ou e-mail.
- **Dados pessoais:**
  - a notificação é dado do titular: exportada com os campos novos, apagada na anonimização e
    retida por 180 dias;
  - a fila é dado do projeto, sem id de pessoa, mas o título do artefato pode conter dado pessoal
    escrito no GitHub; eventos processados são apagados depois de 180 dias.
