# Relatórios do projeto — S2-06 (RF37) e S2-07 (RF57)

## Modelo

`ProjectReport` é o registro de cada geração. Guarda o recorte pedido (`startDate`, `endDate`,
`timeZone`, `sprintId`), quem pediu (`requestedByUserId`, FK `SET NULL`), o status
(`QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`), os tempos (`startedAt`, `heartbeatAt`,
`finishedAt`, `durationMs`), o erro sanitizado (`errorCode`, `errorMessage`) e, quando pronto, o
`snapshot` JSON com `snapshotVersion`. `activeProjectId` é preenchido só durante QUEUED/RUNNING;
o índice único nele garante uma geração ativa por projeto.

`ProjectReportPerson` congela, por relatório, o nome de exibição e o username de cada pessoa
citada (`userId` sem FK, porque é identidade histórica; único por `reportId + userId`).

| Índice | Uso |
| --- | --- |
| `ProjectReport(projectId, createdAt)` | lista do projeto, mais recente primeiro |
| `ProjectReport(status, finishedAt)` | retenção das gerações FAILED |
| `ProjectReport(requestedByUserId, createdAt)` | export pessoal |
| `ProjectReport.activeProjectId` (único) | reserva por projeto |
| `ProjectReportPerson(userId)` | anonimização |

Migration incremental: `20261014120000_s2_06_project_reports` (cria as duas tabelas e o enum;
não altera dados existentes).

## Snapshot

Versão 1: `project`, `generatedAt`, `filters`, `planning`, `traceability` e `indicators`. Cada
seção é a resposta dos services de origem para o mesmo recorte (contrato em
[API_CONTRACTS](../api/API_CONTRACTS.md)). Antes de gravar, `stripPeople` remove `displayName`,
`name`, `username`, `email` e `avatarUrl` de todo objeto com `userId` positivo e coleta esses IDs
para `ProjectReportPerson`.

## Ciclo e concorrência

O pedido cria o registro com a reserva e o evento `REPORT_REQUESTED` na mesma transação
(`withActiveProjectWrite`, NOWAIT). Conflito de reserva ou projeto ocupado devolve a geração ativa
que venceu a corrida; sem ela, há até cinco tentativas curtas. A execução reivindica o registro
(`QUEUED → RUNNING`), mantém o heartbeat e, ao terminar, trava o relatório, confere status, reserva
e batimento dentro da lease e só então grava `SUCCEEDED`, o snapshot e as pessoas. Uma execução
que perdeu a lease não sobrescreve o `FAILED` gravado pela expiração.

## Retenção, anonimização e exclusão

- `SUCCEEDED`: ciclo do projeto; remoção por cascade no purge do projeto.
- `FAILED` encerrado: removido pelo `privacy:retention` após `REPORT_FAILED_RETENTION_DAYS`
  (padrão 180).
- Anonimização: `ProjectReportPerson` recebe o nome e o username neutros da conta anonimizada; o
  snapshot não muda, porque não contém nomes.
- Export pessoal: `project-reports.json` com os metadados dos relatórios pedidos pelo titular.
- PDF: não é persistido; cada download monta o arquivo a partir do snapshot e das pessoas
  congeladas.

Evidência: [API](../../backend/test/api/reports.test.js),
[integração](../../backend/test/integration/reports.test.js),
[documento do PDF](../../backend/test/unit/report-pdf-document.test.js) e
[PDF renderizado](../../backend/test/unit/report-pdf-render.test.js).
