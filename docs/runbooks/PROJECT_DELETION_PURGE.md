# Runbook — purge de projetos após 30 dias

## Responsabilidade e pré-condições

O responsável pela implantação deve agendar um job externo recorrente para `backend/npm run projects:purge`. Não executar no startup da API. Até que o agendamento real, o monitoramento e a política de backup sejam configurados no ambiente de produção, o purge automático não está operacionalmente comprovado. Executar sob a mesma configuração protegida de banco e storage privado usada pela API; não apontar para um filesystem vazio ou diferente.

Antes de habilitar em produção, aprovar política de backup/retenção, assegurar backup consistente de MySQL e storage e testar restore conforme [BACKUP_RESTORE](BACKUP_RESTORE.md). Confirmar ambiente, host e schema antes de qualquer `--apply`; não usar banco de desenvolvimento por conveniência.

## Execução

Na pasta `backend`, com Node 22 e variáveis de ambiente do deployment:

```bash
npm run projects:purge:dry-run
npm run projects:purge
```

O dry-run informa projetos vencidos e journal pendente sem mutação. O apply processa vencidos e reconcilia journal retryable. Agendar ao menos diariamente (por exemplo, a cada hora se a operação comportar o volume); a exclusão ocorre **após** o prazo, na primeira execução saudável seguinte, não exatamente no segundo do deadline. A implantação deve possuir somente uma configuração de job gerenciada; claims persistidos protegem contra execução simultânea, mas não substituem monitoramento.

## Observabilidade e falha

Alertar quando o job não executar no intervalo planejado, terminar com erro, deixar projetos vencidos pendentes ou acumular `ProjectPurgeStorageCleanup` em `READY`/erro. Registrar execução, duração, contagem de projetos processados/falhos e limpeza física pendente sem expor nomes, bytes ou tokens. Reexecutar o job após corrigir a causa; não remover journal manualmente. Um arquivo ausente é tratado de forma idempotente, mas erro de permissão/storage requer correção e retry.

Se um worker cair com claim ativo, aguardar o período de stale definido pelo service antes de takeover por outro worker. Não iniciar restauração de bytes nem apagar staging manualmente enquanto houver claim ativo. Se banco e filesystem divergirem, preservar ambos, consultar journal/claim e escalar incidente; nunca apagar metadata ou chaves do journal para forçar sucesso.

## Recuperação e validação

Depois de falha, rodar dry-run, conferir projetos vencidos e journal; corrigir conectividade/permissões, reexecutar apply e conferir redução a zero. Validar por amostra controlada que projeto purgado não autoriza acesso nem reserva repo e que não restaram bytes privados sem journal. Registrar evidência operacional sem PII. Backups seguem a janela separada da [política de retenção](../privacy/DATA_RETENTION_POLICY.md); purge primário não apaga backup ainda retido.
