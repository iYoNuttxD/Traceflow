# Runbook — reconciliação dos alertas de rastreabilidade (RF13, RF39, RF40)

Regra em [Traceability Alerts](../data/TRACEABILITY_ALERTS.md); decisão em
[ADR-015](../architecture/ADR-015-TRACEABILITY-ALERTS.md). Os alertas nascem sozinhos nas mutações
de tarefa e vínculo, no fim de cada sincronização e na conexão do repositório. Desde 17/10/2026, o
worker reconcilia a cada 60 minutos os projetos com reconciliação atrasada
([Jobs agendados](SCHEDULED_JOBS.md)). Este runbook cobre o comando de reconciliação, usado na
implantação e para recuperar à mão.

## Quando rodar

- **Depois da implantação da revisão de 15/10/2026 (PR #26).** O RF13 deixou de exigir integração,
  e o RF39 e o RF40 deixaram de ter corte temporal. O estoque que a regra nova pede só aparece
  depois de uma reconciliação do projeto:
  - tarefas concluídas sem commit em projetos sem repositório;
  - PRs mescladas e issues fechadas sem tarefa, de antes da criação do projeto.
- Quando o resumo de alertas avisa reconciliação atrasada (`reconciliation.stale`), e o
  reprocessamento pela tela não resolve.

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
  avisar a reconciliação atrasada.
- Rode de novo depois de corrigir a causa: a reconciliação é idempotente e não duplica alertas.
- **Avisos pendentes.** A falha do despacho dos avisos não derruba a reconciliação: o log traz
  `traceability_notices_dispatch_failed` com o projeto e o código, e os alertas continuam
  `PENDING`. A próxima reconciliação do projeto (sync, reprocessamento ou este script) despacha
  sem duplicar. Para conferir a fila: `noticeState = 'PENDING'` em `TraceabilityAlert`.
- Os logs trazem só contagens, projeto e código de erro, sem título nem nome.
