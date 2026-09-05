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
| fingerprint de identidade GitHub anonimizada | MySQL | enquanto for necessário impedir reassociação automática | somente HMAC-SHA256 domain-separated; sem FK, login ou GitHub ID bruto; expurgo/rotação depende de decisão jurídica e custódia da chave |
| convite finalizado | MySQL | 30 dias | `e6:cleanup`; convite ativo preservado |
| `AuditEvent` | MySQL | 365 dias | `privacy:retention`; usa `retentionUntil` e registra o próprio cleanup |
| solicitação de privacidade finalizada | MySQL | 365 dias | `COMPLETED`, `CANCELLED` e `REJECTED` seguem retenção; pedido bloqueado por último OWNER termina `REJECTED` e não permanece pendente |
| exportação temporária | metadata MySQL/resposta sob demanda | 15 minutos para download | sem arquivo público ou persistente; metadata expirada é removida pelo cleanup |
| conta desativada | MySQL | 30 dias antes de revisão operacional | não é apagada automaticamente; anonimização exige solicitação elegível |
| conta anonimizada | MySQL | histórico técnico necessário | perfil e referências conhecidas neutralizados; credenciais, tokens, states, identidade e autorizações pessoais removidos; auditoria segue prazo próprio |
| requisitos, tarefas, movements, histórico RF38 e artifacts | MySQL | ciclo do projeto, sem prazo automático | `TaskHistoryEntry` é histórico funcional; hard delete da Task remove movement/history na transação, mas preserva `AuditEvent` |
| histórico de Planning e tombstones | `Sprint`, `SprintTask`, `Milestone` | ciclo do projeto, sem expurgo automático novo | excluir Sprint/Marco é lógico; preserva baseline, card mínimo, pontos e corte. IDs históricos não copiam nome/e-mail; dados legados ausentes não são fabricados |
| vínculos `TaskCommit`, `TaskIssue` e `Task.pullRequestId` | MySQL | ciclo da tarefa/projeto | excluir Task remove joins/FK; Commit, PullRequest e Issue importados são preservados |
| logs | destino operacional | a definir no deploy, recomendação inicial 30–90 dias | stdout local não implementa política do agregador |
| e-mails técnicos | provedor SMTP | política do provedor | TRACEFLOW não controla mailbox; evitar anexos de exportação |
| backup | infraestrutura | a definir pelo controlador | expurgo lógico pode persistir até rotação; seguir `docs/runbooks/BACKUP_RESTORE.md`, com acesso, criptografia e descarte seguros |

Na E9, sincronização GitHub atualiza ou acrescenta artefatos por identificador externo e não apaga automaticamente itens ausentes em uma execução posterior. Essa preservação protege rastreabilidade e vínculos; uma política de reconciliação destrutiva exigirá decisão específica de retenção e auditoria.

`Task.responsible` e `TaskMovement.movedBy` permanecem como snapshots históricos somente leitura. IDs canônicos só podem ser preenchidos com seleção válida para Tasks ou evidência técnica inequívoca para movimentos; nome textual nunca é prova de identidade. A LR.2 removeu `ProjectMember` e `TaskMovement.projectMemberId` após auditoria com zero linhas/referências na base atual e guard para outras bases.

Execução: `npm run privacy:retention:dry-run` mostra apenas contagens; `npm run privacy:retention` aplica. Banco com nome de produção exige `--confirm-production`. Agendamento pertence a cron/job externo, nunca ao startup.

`PRIVACY_PSEUDONYMIZATION_KEY` é um segredo operacional de longa duração. Produção deve guardá-lo em secret manager, incluí-lo no plano de continuidade e tratar rotação como migração coordenada dos fingerprints; trocar ou perder a chave sem esse processo rompe a comparação deny-only para identidades anonimizadas anteriores.

Na E15, um backup e restore foi exercitado somente sobre bancos artificiais: 21 tabelas foram restauradas e os bancos/arquivo temporários foram removidos. Isso valida o procedimento técnico, não comprova agendamento, criptografia, retenção ou restauração periódica de produção. Essas responsabilidades permanecem operacionais e jurídicas.
