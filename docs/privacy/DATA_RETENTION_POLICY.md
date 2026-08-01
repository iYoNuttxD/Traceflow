# Política técnica inicial de retenção

Prazos abaixo são defaults de engenharia, não prazos jurídicos definitivos. Produção deve aprová-los e alinhar banco, logs e backups.

| Categoria | Banco/operação | Default | Expurgo/observação |
|---|---|---:|---|
| sessão revogada/expirada | MySQL | 30 dias | `e6:cleanup`; sessão ativa não é removida |
| reset de senha | MySQL | 7 dias | `e6:cleanup` após uso/expiração |
| verificação de e-mail | MySQL | TTL de 24 horas; retenção de 7 dias por default | `e6:cleanup` após uso/expiração; valor bruto nunca persiste |
| state da GitHub App | MySQL | TTL de 10 minutos; retenção de 7 dias por default | `e6:cleanup` após uso/expiração; sessão removida também faz cascade |
| delivery de webhook GitHub | MySQL | 30 dias por default | `e6:cleanup`; guarda somente IDs/event/action, nunca payload integral |
| metadados/autorização da instalação | MySQL | duração da conexão/conta | anonimização remove autorização do usuário; artifacts do projeto permanecem conforme finalidade histórica |
| convite finalizado | MySQL | 30 dias | `e6:cleanup`; convite ativo preservado |
| `AuditEvent` | MySQL | 365 dias | `privacy:retention`; usa `retentionUntil` e registra o próprio cleanup |
| solicitação de privacidade finalizada | MySQL | 365 dias | pendente nunca é apagada pelo cleanup |
| exportação temporária | metadata MySQL/resposta sob demanda | 15 minutos para download | sem arquivo público ou persistente; metadata expirada é removida pelo cleanup |
| conta desativada | MySQL | 30 dias antes de revisão operacional | não é apagada automaticamente; anonimização exige solicitação elegível |
| conta anonimizada | MySQL | histórico técnico necessário | perfil neutralizado; auditoria segue prazo próprio |
| requisitos, tarefas, movements, histórico RF38 e artifacts | MySQL | ciclo do projeto, sem prazo automático | `TaskHistoryEntry` é histórico funcional; hard delete da Task remove movement/history na transação, mas preserva `AuditEvent` |
| vínculos `TaskCommit`, `TaskIssue` e `Task.pullRequestId` | MySQL | ciclo da tarefa/projeto | excluir Task remove joins/FK; Commit, PullRequest e Issue importados são preservados |
| `ProjectMember` legado | MySQL | até migração contratual futura | não é prova de identidade; nenhuma remoção E7 |
| logs | destino operacional | a definir no deploy, recomendação inicial 30–90 dias | stdout local não implementa política do agregador |
| e-mails técnicos | provedor SMTP | política do provedor | TRACEFLOW não controla mailbox; evitar anexos de exportação |
| backup | infraestrutura | a definir pelo controlador | expurgo lógico pode persistir até rotação; seguir `docs/runbooks/BACKUP_RESTORE.md`, com acesso, criptografia e descarte seguros |

Na E9, sincronização GitHub atualiza ou acrescenta artefatos por identificador externo e não apaga automaticamente itens ausentes em uma execução posterior. Essa preservação protege rastreabilidade e vínculos; uma política de reconciliação destrutiva exigirá decisão específica de retenção e auditoria.

`Task.responsible`, `TaskMovement.movedBy` e `TaskMovement.projectMemberId` permanecem como snapshots históricos somente leitura. A reconciliação E11 preenche IDs canônicos apenas com seleção manual válida para Tasks ou evidência técnica inequívoca para movimentos. Registros não comprovados são preservados, nunca apagados; remoção física desses campos exige contract destrutivo futuro e decisão específica de retenção.

Execução: `npm run privacy:retention:dry-run` mostra apenas contagens; `npm run privacy:retention` aplica. Banco com nome de produção exige `--confirm-production`. Agendamento pertence a cron/job externo, nunca ao startup.

Na E15, um backup e restore foi exercitado somente sobre bancos artificiais: 21 tabelas foram restauradas e os bancos/arquivo temporários foram removidos. Isso valida o procedimento técnico, não comprova agendamento, criptografia, retenção ou restauração periódica de produção. Essas responsabilidades permanecem operacionais e jurídicas.
