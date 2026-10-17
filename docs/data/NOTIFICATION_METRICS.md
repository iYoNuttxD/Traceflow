# Métrica oficial das notificações — RF30, RF59, RF60 e RF61

Os Quadros 3-55 (RF59), 3-56 (RF30), 3-57 (RF60) e 3-58 (RF61) do TCC dão o mesmo critério:
`(notificações enviadas corretamente / total de eventos ocorridos) × 100`.

Decisão no [ADR-016](../architecture/ADR-016-TASK-NOTIFICATIONS.md) (D11) e no
[ADR-018](../architecture/ADR-018-GITHUB-EVENT-NOTIFICATIONS.md) (D14), revistos em 15/10/2026. Este
documento é a regra executável: o script e os testes seguem exatamente estas tabelas. Ele substitui
o cálculo sobre eventos elegíveis, que vigorou de 09/10 a 15/10/2026.

## Termos

| Sigla | Termo | Definição |
| --- | --- | --- |
| T | eventos ocorridos | todos os eventos do requisito no período (seção "Fontes") |
| E | enviadas corretamente | eventos com a notificação criada uma vez para cada destinatário, com contexto e link corretos e visível só a ele |
| A | não enviadas por motivo autorizado | `PREFERENCE_OFF`, `INACTIVE_ACCOUNT` ou `INACTIVE_MEMBER` |
| N | sem destinatário | `NO_RESPONSIBLE` no RF30 e no RF59; `NO_PARTICIPANT` e `NO_TASK` (tarefa excluída antes do despacho) no RF60/RF61 |
| X | não enviadas sem motivo autorizado | eventos avaliados e não enviados por um motivo que as regras atuais não autorizam, como `OUTSIDE_WINDOW` e `PROJECT_DELETED` no `outcome` de eventos do GitHub despachados até 15/10/2026 |
| U | não observados | eventos que ocorreram e que o sistema não avaliou (sem decisão registrada) |
| L | lacunas | períodos em que a fonte não consegue dizer o total (registro incompleto, fonte por comparação de estado ou falha de aquisição registrada) |

`T = E + A + N + X + U`.

No RF60/RF61 a unidade é o par (evento, participante da tarefa), como no ADR-018 D14. Evento ainda
não despachado conta uma unidade em U, porque os participantes só são conhecidos no despacho.

## Cálculo

- **Cobertura total** (fórmula oficial): `E / T × 100`, com duas casas decimais.
- **Cobertura elegível** (auxiliar, sempre rotulada como tal): `E / (T − A − N) × 100`. X fica no
  denominador: evento perdido sem motivo autorizado baixa as duas coberturas.
- **Indisponível.** A cobertura sai `INDISPONIVEL`, nunca 0 nem 100, com o motivo. Vale o primeiro
  motivo da tabela que se aplica, e ele é o mesmo nas duas coberturas:

  | Ordem | Motivo | Quando |
  | --- | --- | --- |
  | 1 | `REGISTRO_INCOMPLETO` | o período começa antes de o registro estar completo (abaixo) |
  | 2 | `FONTE_POR_COMPARACAO_DE_ESTADO` | RF60/RF61 com a fonte por comparação de estado (ADR-018 D1) |
  | 3 | `LACUNA_DE_AQUISICAO` | RF60/RF61 com lacuna registrada pela fonte durável (ADR-023, proposto; ainda não produzido) |
  | 4 | `EVENTOS_NAO_OBSERVADOS` | `U > 0` |
  | 5 | `SEM_EVENTOS` | `T = 0` |

  Só a cobertura elegível tem um caso a mais: com `T > 0` e `T − A − N = 0`, ela sai `SEM_EVENTOS`
  e a total continua calculada.
- **Registro completo.** O registro de um requisito está completo a partir do mais tarde de dois
  instantes:
  - o fim da migration que criou a fonte, lido em `_prisma_migrations`
    (`20261015120000_notification_decisions` no RF30 e no RF59;
    `20261012010000_github_event_notifications` no RF60/RF61);
  - o horizonte da retenção, `agora − NOTIFICATION_RETENTION_DAYS`, porque o `privacy:retention`
    pode ter apagado decisões e eventos mais antigos.

  `lacunas` traz `{ "motivo": "REGISTRO_INCOMPLETO", "completoDesde": <instante> }`.
  `completoDesde` sai nulo quando a migration não está registrada.
- **Contagens.** T, E, A, N, X e U saem sempre, mesmo com a cobertura indisponível.

## Fontes

| RF | T | Decisões (E, A, N) | U |
| --- | --- | --- | --- |
| RF30 | cada `TaskMovement` com `movedAt` no período, mais as decisões do período cuja mudança não existe mais (tarefa excluída) | `NotificationDecision` do tipo `TASK_STATUS_CHANGED`, chave `movement:<movementId>`, gravada na transação da mudança | movimentos do período sem decisão |
| RF59 | cada par (tarefa, data do prazo) cujo vencimento ocorreu no período, reconstruído pelo histórico, mais as decisões do período sem reconstrução (tarefa excluída) | `NotificationDecision` do tipo `TASK_OVERDUE`, chave `<taskId>:<YYYY-MM-DD>`, gravada pelo job | pares reconstruídos sem decisão |
| RF60/RF61 | cada `GitHubArtifactEvent` com `occurredAt` (ou `detectedAt`, sem `occurredAt`) no período: os pares do `outcome` (`participants`, `NO_PARTICIPANT` e `NO_TASK`) | `outcome` do evento: `created` e `alreadyNotified` em E; `excluded` por motivo em A e N; motivo desconhecido em X | eventos `PENDING`, `PROCESSING` ou `FAILED` |

O RF60 conta `ISSUE_CLOSED` e `ISSUE_REOPENED`; o RF61, `PULL_REQUEST_MERGED` e
`PULL_REQUEST_CLOSED`.

**Decisão por evento.** No RF59 um evento pode ter mais de uma decisão, uma por destinatário
avaliado (o responsável mudou entre execuções). O evento conta em E se alguma decisão é `SENT`;
senão, vale a mais recente (`decidedAt`).

**Gravação das decisões.**
- **RF30.** Uma decisão por mudança de status, na transação da mudança: `SENT` quando a notificação
  nasce, ou o motivo. Se a transação falha, nem a mudança nem a decisão ficam.
- **RF59.** A cada execução com `--apply`, o job grava a decisão de cada vencimento avaliado junto
  com as notificações, em paralelo:
  - `SENT` não muda mais;
  - um motivo novo substitui o anterior do mesmo destinatário;
  - decisão igual não é regravada, então a execução sem mudança não escreve;
  - se uma notificação nova não fica gravada (a tarefa foi excluída durante a execução), o job
    desfaz o `SENT` dela e restaura a decisão anterior;
  - o dry-run não grava decisão.
- **Instante da decisão do RF59.** `occurredAt` é o corte do prazo, ou a criação da tarefa quando
  posterior. Enquanto a tarefa existe, o período do evento é decidido pelo instante reconstruído.

**Vencimento ocorrido (RF59).** Para cada tarefa e cada data de prazo que ela teve, o vencimento
ocorre no primeiro instante que reúne três condições:
- o corte da data já passou (início do dia seguinte, em `APP_TIMEZONE`);
- a tarefa tem aquele prazo, pelo histórico `DEADLINE` ou pelo valor atual;
- a tarefa não está `CONCLUIDO`, pelo histórico `STATUS`.

Exemplos:

| Situação | Evento? |
| --- | --- |
| prazo `2026-10-10`, tarefa aberta até 15/10 | sim, em `2026-10-11T03:00:00.000Z` (corte em `America/Sao_Paulo`) |
| prazo `2026-10-10`, concluída em 10/10 | não |
| prazo `2026-10-10` trocado para `2026-10-20` em 09/10 | não para `2026-10-10`; o de `2026-10-20` segue a mesma regra |
| criada em 15/10 com prazo `2026-10-10` | sim, em 15/10 (o instante da criação) |
| prazo `2026-10-10`, concluída em 11/10 às 10:00, antes do job seguinte | sim; se o job não registrou decisão, conta em U |
| prazo `2026-10-10`, concluída em 10/10 e reaberta em 12/10 às 09:00 | sim, em 12/10 às 09:00 (a reabertura) |

Tarefa excluída perde o histórico (cascata). Os pares dela entram em T só pelas decisões gravadas.

## Script

`npm run notifications:metrics -- --from=YYYY-MM-DD --to=YYYY-MM-DD [--project-id=<id>]`

- **Execução.**
  - Só leitura. Não exige `--confirm-production`, porque não grava nada.
  - Período fechado, em dias de `APP_TIMEZONE`: de `--from` até o fim de `--to`.
  - Sem `--project-id`, considera todos os projetos não excluídos. As contagens somam os projetos.
- **Saída.** JSON em `stdout`; o log vai para `stderr` (`notifications_metrics_completed`, com o
  número de projetos e a duração).
  - `periodo` (`de`, `ate`, `fuso`, `inicio`, `fim`), `calculadoEm`, `projetos`, `database` (alvo
    sem credencial) e `requisitos`, com `RF30`, `RF59`, `RF60` e `RF61`.
  - Por RF:
    - `unidade` (`EVENTO`, ou `PAR_EVENTO_PARTICIPANTE` no RF60/RF61) e, no RF60/RF61, `eventos`;
    - `ocorridos`, `enviadasCorretamente`, `naoEnviadas`, `semDestinatario`,
      `naoEnviadasSemMotivoAutorizado` e `naoObservados`. Os três grupos de não envio trazem
      `total` e a contagem por motivo;
    - `lacunas`, a lista do que impede o total;
    - `coberturaTotal` e `coberturaElegivel`, cada uma com `{ valor, situacao, motivo, formula }`.
      A elegível traz também `auxiliar: true`. `situacao` é `CALCULADA` ou `INDISPONIVEL`, e
      `valor` fica nulo quando a cobertura está indisponível.
- **Códigos de saída.**
  - 0: cálculo feito.
  - 1: argumento inválido (com o uso em `stderr`) ou falha, com mensagem genérica, sem detalhe do
    banco.
  - 2: `--project-id` sem projeto ativo.

Exemplo, RF30 num período com registro completo:

| T | E | A | N | X | U | Cobertura total | Cobertura elegível |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 6 | 3 (`PREFERENCE_OFF` 1, `INACTIVE_ACCOUNT` 1, `INACTIVE_MEMBER` 1) | 1 (`NO_RESPONSIBLE`) | 0 | 0 | 60,00% | 100,00% |

Exemplo, RF61 com a fonte por comparação de estado:

| T | E | A | N | X | U | Cobertura total | Cobertura elegível |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4 eventos, 7 pares | 3 | 1 | 0 | 3 (`OUTSIDE_WINDOW`) | 0 | indisponível (`FONTE_POR_COMPARACAO_DE_ESTADO`) | indisponível (`FONTE_POR_COMPARACAO_DE_ESTADO`) |

## Retenção e privacidade

- `NotificationDecision` segue a retenção das notificações: é apagada pelo `privacy:retention` 180
  dias depois de `decidedAt`.
- A anonimização apaga o destinatário da decisão (`recipientUserId` nulo e `recipientKey` igual a
  `−id`) e mantém o resultado, para a métrica dos períodos passados não mudar.
- A exportação do titular traz `notification-decisions.json`: tipo, chave do evento, projeto,
  resultado e os instantes da ocorrência e da decisão.
- A decisão não guarda a tarefa: a chave do evento já a identifica no RF59, e a mudança de status
  no RF30. Por isso a exclusão da tarefa não toca a decisão.
- O script não publica nada por pessoa: as contagens são por RF, no conjunto de projetos ou no
  projeto do `--project-id`.

## Limitações

- O RF59 depende do histórico (RF38). Tarefa com prazo ou status mudados antes de o histórico
  existir não é reconstruída. Esses períodos são anteriores ao registro de decisões e já saem
  `REGISTRO_INCOMPLETO`.
- A reconstrução usa o fuso único `APP_TIMEZONE` (ADR-016 D5).
- O job do RF59 roda a cada 15 minutos. Período que termina depois da última execução pode ter
  vencimentos ainda não avaliados e sai `EVENTOS_NAO_OBSERVADOS`: meça períodos já fechados.
- No RF60/RF61, enquanto o ADR-023 não vigorar, a cobertura total é sempre indisponível. As
  contagens observadas continuam úteis para conferir o despacho.
