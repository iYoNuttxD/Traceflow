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
| N | sem destinatário | `NO_RESPONSIBLE` no RF30 e no RF59, `NO_PARTICIPANT` no RF60/RF61 |
| U | não observados | eventos que ocorreram e que o sistema não avaliou (sem decisão registrada) |
| L | lacunas | períodos em que a fonte não consegue dizer o total (fonte por comparação de estado, ou falha de aquisição registrada) |

No RF60/RF61 a unidade é o par (evento, participante da tarefa), como no ADR-018 D14.

## Cálculo

- **Cobertura total** (fórmula oficial): `E / T × 100`, com duas casas decimais.
- **Cobertura elegível** (auxiliar, sempre rotulada como tal): `E / (T − A − N) × 100`.
- **Indisponível.** A cobertura sai `INDISPONIVEL`, nunca 0 nem 100, com o motivo, quando:

  | Motivo | Quando |
  | --- | --- |
  | `SEM_EVENTOS` | `T = 0`; na cobertura elegível, também quando `T − A − N = 0` |
  | `EVENTOS_NAO_OBSERVADOS` | `U > 0` |
  | `REGISTRO_INCOMPLETO` | o período começa antes do registro de decisões existir (`NotificationDecision`, RF30 e RF59) |
  | `FONTE_POR_COMPARACAO_DE_ESTADO` | RF60/RF61 com a fonte por comparação de estado (ADR-018 D1) |
  | `LACUNA_DE_AQUISICAO` | RF60/RF61 com lacuna registrada pela fonte durável (ADR-023, proposto) |

- **Contagens.** As contagens de T, E, A, N e U saem sempre, mesmo com a cobertura indisponível.

## Fontes

| RF | T | Decisões (E, A, N) | U |
| --- | --- | --- | --- |
| RF30 | cada `TaskMovement` com `movedAt` no período | `NotificationDecision` do tipo `TASK_STATUS_CHANGED`, chave `movement:<movementId>`, gravada na transação da mudança | movimentos do período sem decisão |
| RF59 | cada par (tarefa, data do prazo) cujo vencimento ocorreu no período, reconstruído pelo histórico | `NotificationDecision` do tipo `TASK_OVERDUE`, chave `<taskId>:<YYYY-MM-DD>`, gravada pelo job | pares reconstruídos sem decisão |
| RF60/RF61 | cada `GitHubArtifactEvent` com `occurredAt` (ou `detectedAt`) no período, multiplicado pelos participantes do `outcome` | `outcome` do evento: `created` e `alreadyNotified` em E; `excluded` por motivo em A; `NO_PARTICIPANT` em N | eventos `PENDING`, `PROCESSING` ou `FAILED` |

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

Tarefa excluída perde o histórico (cascata). Os pares dela entram em T só pelas decisões gravadas.

## Script

`npm run notifications:metrics -- --from=YYYY-MM-DD --to=YYYY-MM-DD [--project-id=<id>]`

- **Execução.**
  - Só leitura. Não exige `--confirm-production`, porque não grava nada.
  - Período fechado, em dias de `APP_TIMEZONE`.
  - Sem `--project-id`, considera todos os projetos não excluídos.
- **Saída.** JSON em `stdout`; o log vai para `stderr`.
- **Por RF:**
  - `ocorridos`, `enviadasCorretamente`, `naoEnviadas` (por motivo), `semDestinatario`,
    `naoObservados` e `lacunas`;
  - `coberturaTotal` e `coberturaElegivel`, cada uma com `{ valor, situacao, motivo }`:
    - `situacao` é `CALCULADA` ou `INDISPONIVEL`;
    - `valor` fica nulo quando a cobertura está indisponível.

Exemplo, RF30 num período com registro completo:

| T | E | A | N | U | Cobertura total | Cobertura elegível |
| --- | --- | --- | --- | --- | --- | --- |
| 10 | 6 | 3 (`PREFERENCE_OFF` 1, `INACTIVE_ACCOUNT` 1, `INACTIVE_MEMBER` 1) | 1 (`NO_RESPONSIBLE`) | 0 | 60,00% | 100,00% |

Exemplo, RF61 com a fonte por comparação de estado:

| T | E | A | N | U | Cobertura total | Cobertura elegível |
| --- | --- | --- | --- | --- | --- | --- |
| 4 eventos, 7 pares | 3 | 1 | 0 | 0 | indisponível (`FONTE_POR_COMPARACAO_DE_ESTADO`) | indisponível (`FONTE_POR_COMPARACAO_DE_ESTADO`) |

## Retenção e privacidade

- `NotificationDecision` segue a retenção das notificações: é apagada pelo `privacy:retention` 180
  dias depois de `decidedAt`.
- A anonimização apaga as decisões do titular.
- O script não publica nada por pessoa: as contagens são por RF e por projeto.

## Limitações

- O RF59 depende do histórico (RF38). Tarefa com prazo ou status mudados antes de o histórico
  existir não é reconstruída: o período sai `REGISTRO_INCOMPLETO`.
- A reconstrução usa o fuso único `APP_TIMEZONE` (ADR-016 D5).
- No RF60/RF61, enquanto o ADR-023 não vigorar, a cobertura total é sempre indisponível. As
  contagens observadas continuam úteis para conferir o despacho.
