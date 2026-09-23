# Política técnica inicial de retenção

Prazos abaixo são defaults de engenharia, não prazos jurídicos definitivos. Produção deve aprová-los e alinhar banco, logs e backups.

| Categoria                                                  | Banco/operação                      |                                                           Default | Expurgo/observação                                                                                                                                              |
| ---------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| sessão revogada/expirada                                   | MySQL                               |                                                           30 dias | `e6:cleanup`; sessão ativa não é removida                                                                                                                       |
| reset de senha                                             | MySQL                               |                                                            7 dias | `e6:cleanup` após uso/expiração                                                                                                                                 |
| verificação de e-mail                                      | MySQL                               |                   TTL de 24 horas; retenção de 7 dias por default | `e6:cleanup` após uso/expiração; valor bruto nunca persiste                                                                                                     |
| state da GitHub App                                        | MySQL                               |                 TTL de 10 minutos; retenção de 7 dias por default | `e6:cleanup` após uso/expiração; sessão removida também faz cascade                                                                                             |
| delivery de webhook GitHub                                 | MySQL                               |                                               30 dias por default | `e6:cleanup`; guarda somente IDs/event/action, nunca payload integral                                                                                           |
| metadados/autorização da instalação                        | MySQL                               |                                          duração da conexão/conta | anonimização remove autorização do usuário; artifacts do projeto permanecem conforme finalidade histórica                                                       |
| fingerprint de identidade GitHub anonimizada               | MySQL                               |           enquanto for necessário impedir reassociação automática | somente HMAC-SHA256 domain-separated; sem FK, login ou GitHub ID bruto; expurgo/rotação depende de decisão jurídica e custódia da chave                         |
| convite finalizado                                         | MySQL                               |                                                           30 dias | `e6:cleanup`; convite ativo preservado                                                                                                                          |
| `AuditEvent`                                               | MySQL                               |                                                          365 dias | `privacy:retention`; usa `retentionUntil` e registra o próprio cleanup                                                                                          |
| solicitação de privacidade finalizada                      | MySQL                               |                                                          365 dias | `COMPLETED`, `CANCELLED` e `REJECTED` seguem retenção; pedido bloqueado por último OWNER termina `REJECTED` e não permanece pendente                            |
| exportação temporária                                      | metadata MySQL/resposta sob demanda |                                          15 minutos para download | sem arquivo público ou persistente; metadata expirada é removida pelo cleanup                                                                                   |
| conta desativada                                           | MySQL                               |                              30 dias antes de revisão operacional | não é apagada automaticamente; anonimização exige solicitação elegível                                                                                          |
| conta anonimizada                                          | MySQL                               |                                      histórico técnico necessário | perfil e referências conhecidas neutralizados; credenciais, tokens, states, identidade e autorizações pessoais removidos; auditoria segue prazo próprio         |
| requisitos, tarefas, movements, histórico RF38 e artifacts | MySQL                               | ciclo do projeto; projeto excluído tem carência exata de 30 × 24h | `TaskHistoryEntry` é histórico funcional; hard delete da Task remove movement/history na transação, mas preserva `AuditEvent`; purge do Project remove o grafo  |
| histórico de Planning e tombstones                         | `Sprint`, `SprintTask`, `Milestone` |                     ciclo do projeto, sem expurgo automático novo | excluir Sprint/Marco é lógico; preserva baseline, card mínimo, pontos e corte. IDs históricos não copiam nome/e-mail; dados legados ausentes não são fabricados |
| vínculos `TaskCommit`, `TaskIssue` e `Task.pullRequestId`  | MySQL                               |                                           ciclo da tarefa/projeto | excluir Task remove joins/FK; Commit, PullRequest e Issue importados são preservados                                                                            |
| logs                                                       | destino operacional                 |              a definir no deploy, recomendação inicial 30–90 dias | stdout local não implementa política do agregador                                                                                                               |
| e-mails técnicos                                           | provedor SMTP                       |                                              política do provedor | TRACEFLOW não controla mailbox; evitar anexos de exportação                                                                                                     |
| backup                                                     | infraestrutura                      |                                        a definir pelo controlador | expurgo lógico pode persistir até rotação; seguir `docs/runbooks/BACKUP_RESTORE.md`, com acesso, criptografia e descarte seguros                                |

## Exclusão e recuperação de projeto

A solicitação feita por OWNER torna o projeto imediatamente indisponível, mas preserva todo o seu
grafo, memberships e bytes privados por exatamente `30 * 24h`, calculadas em UTC a partir de
`deletedAt`. Convites que ainda estavam pendentes são revogados. Restaurar dentro da carência limpa
o estado de exclusão e reapresenta os dados preservados; não recria entidades nem reativa convites.

Ao vencer `deletionScheduledFor`, um processor idempotente pode executar o purge definitivo. A
remoção do banco e a do filesystem não são apresentadas como uma transação distribuída: evidências
são movidas para staging privado antes do delete relacional, e um journal sem FK registra cada item
até que a compensação ou remoção física termine. Falhas permanecem para retry nas execuções
seguintes. O script canônico é `npm run projects:purge`; a operação deve agendá-lo de forma
recorrente, com monitoramento de falhas e do journal pendente. `projects:purge:dry-run` não altera
dados.

O purge remove conteúdo colaborativo, histórico funcional, vínculos, memberships, convites,
integração e artefatos GitHub que pertencem ao projeto. A Installation e suas autorizações não são
apagadas apenas por esse motivo, pois podem atender outros projetos e têm lifecycle próprio.
Eventos de auditoria seguem a retenção técnica aplicável e o evento `PROJECT_PURGED` sobrevive com
`projectId = null` na FK e identificador histórico minimizado em `resourceId`/metadata. Backups,
réplicas, logs externos e exigências legais continuam dependentes da política operacional e de
avaliação jurídica; esta implementação não declara apagamento instantâneo nesses meios nem
conformidade legal absoluta.

Na E9, sincronização GitHub atualiza ou acrescenta artefatos por identificador externo e não apaga automaticamente itens ausentes em uma execução posterior. Essa preservação protege rastreabilidade e vínculos; uma política de reconciliação destrutiva exigirá decisão específica de retenção e auditoria.

`Task.responsible` e `TaskMovement.movedBy` permanecem como snapshots históricos somente leitura. IDs canônicos só podem ser preenchidos com seleção válida para Tasks ou evidência técnica inequívoca para movimentos; nome textual nunca é prova de identidade. A LR.2 removeu `ProjectMember` e `TaskMovement.projectMemberId` após auditoria com zero linhas/referências na base atual e guard para outras bases.

Execução: `npm run privacy:retention:dry-run` mostra apenas contagens; `npm run privacy:retention` aplica. Banco com nome de produção exige `--confirm-production`. Agendamento pertence a cron/job externo, nunca ao startup.

`PRIVACY_PSEUDONYMIZATION_KEY` é um segredo operacional de longa duração. Produção deve guardá-lo em secret manager, incluí-lo no plano de continuidade e tratar rotação como migração coordenada dos fingerprints; trocar ou perder a chave sem esse processo rompe a comparação deny-only para identidades anonimizadas anteriores.

Na E15, um backup e restore foi exercitado somente sobre bancos artificiais: 21 tabelas foram restauradas e os bancos/arquivo temporários foram removidos. Isso valida o procedimento técnico, não comprova agendamento, criptografia, retenção ou restauração periódica de produção. Essas responsabilidades permanecem operacionais e jurídicas.

## S1-07 — Retenção histórica de testes

Definições, versões, histórico funcional, execuções, resultados e evidências têm
retenção técnica pelo ciclo do projeto, sem novo prazo ou expurgo automático.
DELETE do caso é lógico e preserva seus filhos e arquivos. Histórico funcional não
é apagado pelo prazo de AuditEvent. O cleanup de upload remove somente arquivos da
tentativa rejeitada; queda abrupta pode exigir reconciliação de órfãos.

Anonimização de conta neutraliza o nome do executor capturado e os nomes de mudança
de responsável que têm ID conhecido. Mantém IDs ligados à conta pseudonimizada,
resultados, versão, referência técnica e arquivos históricos. É exceção explícita à
imutabilidade dos nomes de exibição. Conteúdo livre/arquivos e dados de autoria
externa podem ainda conter PII: o fluxo não promete anonimização universal desses
conteúdos. Solicitações de remoção devem considerar finalidade, acesso e backups,
com revisão humana; este comportamento não constitui conclusão jurídica de conformidade.

O backup operacional deve abranger conjuntamente MySQL e a raiz privada configurada,
com controle de acesso e restauração de consistência entre metadata e bytes.
Não há upload OCI, retenção automática de vídeo nem coleta periódica nova em S1-07.

## S1-08/S1-09 — Defeitos e esforço auditável

- A responsabilidade corrente de Defect acompanha o ciclo do defeito/projeto. Defeitos
  excluídos logicamente deixam de compor a exportação de atribuições correntes.
- `DefectHistoryEntry` é histórico funcional do projeto e acompanha seu ciclo e a
  política aplicável. Remoção de conta pode tornar `actorUserId` nulo por `SetNull`,
  preservando o evento sem atribuí-lo posteriormente por nome ou outra heurística.
- `TaskEffortHistoryEntry` é histórico funcional/auditável de esforço do projeto.
  A exclusão física da Task ou da sessão não apaga seus eventos: `taskId` e `sessionId`
  são identidades históricas deliberadamente mantidas sem FK para esses recursos.
  A remoção ocorre com a exclusão do projeto (`Project` cascade) ou por política de
  retenção aplicável, não pela exclusão operacional da Task.
- A exportação pessoal inclui somente responsabilidade própria e ações cujo
  `actorUserId` seja o titular, sempre em projetos com membership ativa. Ator nulo e
  registros de terceiros ficam de fora. O evento funcional é preservado quando a
  identidade direta deixa de resolver.
