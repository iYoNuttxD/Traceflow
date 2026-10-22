# Relatórios do projeto e PDF — operação (S2-06/S2-07)

Decisão: [ADR-025](../architecture/ADR-025-RELATORIOS-E-PDF.md). Contrato:
[API_CONTRACTS](../api/API_CONTRACTS.md#s2-06-e-s2-07--relatórios-do-projeto-e-exportação-em-pdf-rf37rf57).

## Implantação

- Aplicar a migration `20261014120000_s2_06_project_reports` antes de subir a API.
- Não há processo extra: a geração roda na própria API (`setImmediate`) e o PDF numa worker
  thread criada por download.
- Memória: cada montagem de PDF pode usar até 512 MB de heap na worker, e o processo admite duas
  ao mesmo tempo. Na VM da OCI, reservar essa folga além do consumo normal da API.
- Variável opcional: `REPORT_FAILED_RETENTION_DAYS` (padrão 180, entre 30 e 3650).

## Limites

| Limite | Valor | Resposta |
| --- | --- | --- |
| Gerações ativas por projeto | 1 | pedido devolve a ativa com `alreadyRunning: true` |
| Gerações executando por processo | 2 | as demais esperam a vaga como `QUEUED` |
| Período | 366 dias | `400` |
| Sprints / requisitos no recorte | 100 / 2.000 | `FAILED` com `REPORT_VOLUME_LIMIT_EXCEEDED` |
| Snapshot | 16 MiB | `FAILED` com `REPORT_TOO_LARGE` |
| Montagem do snapshot | 4 min | nenhuma consulta nova começa depois do prazo; `FAILED` com `REPORT_TIMEOUT` quando a consulta pendente termina |
| Carência após o cancelamento | 30 s | apenas alerta; reserva, heartbeat e vaga permanecem até a consulta em andamento terminar |
| Sem heartbeat | 5 min | `FAILED` com `REPORT_GENERATION_STALE` na próxima leitura |
| PDFs simultâneos por processo | 2 | `503 REPORT_PDF_BUSY` |
| Montagem do PDF | 30 s | `500 REPORT_PDF_FAILED` |
| Pedidos de geração / downloads | limiters `project-report` e `project-report-pdf` por ator e projeto | `429` com `Retry-After` |

## Logs

| Evento | Significado |
| --- | --- |
| `project_report_started` / `project_report_completed` | geração reivindicada / concluída (duração, bytes, pessoas) |
| `project_report_failed` | geração terminou FAILED; `errorCode` público e `sourceErrorCode` técnico |
| `project_report_stale` | geração sem batimento encerrada na leitura |
| `project_report_lease_lost` | execução perdeu a reserva antes de concluir; nada foi gravado como pronto |
| `project_report_cancel_overdue` | a consulta em andamento não terminou na carência após o cancelamento; a geração continua contabilizada até a consulta terminar |
| `project_report_heartbeat_failed` / `project_report_worker_failed` | falha de banco no batimento / erro inesperado fora do fluxo |
| `project_report_pdf_failed` | PDF não montado (`REPORT_PDF_FAILED` ou `REPORT_PDF_BUSY`) |

## Diagnóstico

- **Relatório parado em "Gerando".** Se há heartbeat e `project_report_cancel_overdue`, a consulta
  cancelada ainda está pendente: a reserva e a vaga continuam ocupadas, sem bloquear a resposta
  HTTP. Investigar a consulta no banco; não liberar a reserva enquanto ela roda. Se a API
  reiniciou, depois de 5 min sem heartbeat a próxima leitura encerra o registro como FAILED.
- **Falhou com `REPORT_SOURCE_UNAVAILABLE`.** Uma fonte do painel ficou indisponível durante a
  geração (banco ocupado, por exemplo). Gerar de novo; se persistir, conferir o painel de
  Indicadores do mesmo recorte.
- **Falhou por volume ou tamanho.** Reduzir o período ou escolher uma Sprint.
- **Falhou com `REPORT_TIMEOUT`.** O prazo cancela a composição: a etapa em andamento termina e
  nenhuma outra começa; só então a reserva é liberada para um novo pedido. Reduzir o período ou
  escolher uma Sprint. `project_report_cancel_overdue` frequente indica consulta lenta no banco.
- **Relatório esperando em "Na fila".** Já há duas gerações executando no processo; a vaga é
  liberada quando uma termina. Na fila por mais de 5 min, a geração é encerrada como FAILED.
- **`503 REPORT_PDF_BUSY` frequente.** Muitos downloads simultâneos no mesmo processo. Avaliar
  CPU/memória da VM antes de aumentar o limite.
- **Backend reinicia no primeiro download em desenvolvimento.** `npm run dev` usa `node --watch`,
  que passa a observar o arquivo da worker quando ela é carregada; um "Change detected" nesse
  momento reinicia o processo. Basta baixar de novo. Não ocorre em produção.
- **Auditoria indisponível.** O download falha de propósito: sem `REPORT_PDF_EXPORTED`, o PDF não
  é entregue.

## Retenção

`npm run privacy:retention` remove gerações FAILED encerradas há mais de
`REPORT_FAILED_RETENTION_DAYS` e informa `failedProjectReports` no resultado. Relatórios prontos
acompanham o projeto. Nenhum PDF é gravado em disco, então não há arquivos para limpar.
