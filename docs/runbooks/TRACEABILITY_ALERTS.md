# Runbook — reconciliação dos alertas de rastreabilidade (RF13, RF39, RF40)

Regra em [Traceability Alerts](../data/TRACEABILITY_ALERTS.md); decisão em
[ADR-015](../architecture/ADR-015-TRACEABILITY-ALERTS.md). Os alertas nascem sozinhos nas mutações
de tarefa e vínculo, no fim de cada sincronização e na conexão do repositório. Desde 18/10/2026, a
varredura do worker, a cada 60 minutos, alcança todo projeto ativo: retoma as falhas, inclusive a
que não chegou a ser registrada, faz a primeira reconciliação dos projetos novos e atualiza os que
estão há mais de 24 h sem sucesso ([Jobs agendados](SCHEDULED_JOBS.md)). A interface não oferece mais
o reprocessamento. Este runbook cobre o comando de reconciliação, usado na implantação e para
recuperar à mão; o endpoint `POST .../traceability/alerts/reconcile` (MANAGER+, auditado) também
continua, para suporte.

## Quando rodar

- **Depois da implantação da revisão de 15/10/2026 (PR #26).** O RF13 deixou de exigir integração,
  e o RF39 e o RF40 deixaram de ter corte temporal. O estoque que a regra nova pede só aparece
  depois de uma reconciliação do projeto:
  - tarefas concluídas sem commit em projetos sem repositório;
  - PRs mescladas e issues fechadas sem tarefa, de antes da criação do projeto.
- Quando o resumo de alertas continua em `reconciliation.state` `STALE` ou `PENDING_FIRST` depois
  de uma varredura, o que indica falha persistente: confira o log
  `traceability_alerts_reconcile_failed` e o `lastErrorCode` antes de rodar.

## Execução

Na pasta `backend`, com Node 22:

```bash
npm run traceability:alerts:dry-run
npm run traceability:alerts
```

- **Escopo.** O padrão é todos os projetos ativos. `-- --project-id=<id>` limita a um projeto.
- **Dry-run.** Roda em `RepeatableRead`, não grava nada e informa por projeto quantos alertas
  seriam criados e resolvidos.
- **Produção.** O apply exige `--confirm-production`
  (`node src/jobs/cli/reconcile-traceability-alerts.js --apply --confirm-production`).
- **Lease.** O apply toma a lease `traceability-alerts` do worker; com a reconciliação agendada em
  curso, o comando avisa e sai com código 1.

## Primeira execução depois de 15/10/2026

1. **Dry-run primeiro.** Rode o dry-run e guarde a saída. O número de criados pode ser grande num
   repositório com histórico longo.
2. **Apply.** Rode o apply num horário sem sincronização em andamento. A reconciliação trava o
   projeto (`lockActiveProject`) enquanto grava.
3. **Avisos.** Os alertas novos de PR e de issue entram na fila de avisos aos membros (ADR-022).
   Acima de 10 alertas novos por projeto, cada membro recebe um aviso-resumo, e não um aviso por
   alerta.
4. **Conferência.** Abra a tela de Rastreabilidade de um projeto e compare a contagem com a saída
   do dry-run.

## Falhas

- A falha de um projeto interrompe o script, que sai com código 1. Os projetos anteriores ficam
  gravados.
- O registro da última reconciliação daquele projeto guarda o código do erro, e o resumo passa a
  avisar que os números podem estar desatualizados. A varredura seguinte tenta de novo.
- Rode de novo depois de corrigir a causa: a reconciliação é idempotente e não duplica alertas.
- **Avisos pendentes.** A falha do despacho dos avisos não derruba a reconciliação: o log traz
  `traceability_notices_dispatch_failed` com o projeto e o código, e os alertas continuam
  `PENDING`. O job `traceability-notice-dispatch` retoma a cada 5 minutos, e a próxima reconciliação
  do projeto também despacha, sem duplicar. Para conferir a fila: `noticeState = 'PENDING'` em
  `TraceabilityAlert`.
- Os logs trazem só contagens, projeto e código de erro, sem título nem nome.
