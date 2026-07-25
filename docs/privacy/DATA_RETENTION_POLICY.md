# Política técnica inicial de retenção

Prazos abaixo são defaults de engenharia, não prazos jurídicos definitivos. Produção deve aprová-los e alinhar banco, logs e backups.

| Categoria | Banco/operação | Default | Expurgo/observação |
|---|---|---:|---|
| sessão revogada/expirada | MySQL | 30 dias | `e6:cleanup`; sessão ativa não é removida |
| reset de senha | MySQL | 7 dias | `e6:cleanup` após uso/expiração |
| convite finalizado | MySQL | 30 dias | `e6:cleanup`; convite ativo preservado |
| `AuditEvent` | MySQL | 365 dias | `privacy:retention`; usa `retentionUntil` e registra o próprio cleanup |
| solicitação de privacidade finalizada | MySQL | 365 dias | pendente nunca é apagada pelo cleanup |
| exportação temporária | metadata MySQL/resposta sob demanda | 15 minutos para download | sem arquivo público ou persistente; metadata expirada é removida pelo cleanup |
| conta desativada | MySQL | 30 dias antes de revisão operacional | não é apagada automaticamente; anonimização exige solicitação elegível |
| conta anonimizada | MySQL | histórico técnico necessário | perfil neutralizado; auditoria segue prazo próprio |
| requisitos, tarefas, movements e artifacts | MySQL | ciclo do projeto, sem prazo automático | exclusão depende de política do projeto e análise futura |
| `ProjectMember` legado | MySQL | até migração contratual futura | não é prova de identidade; nenhuma remoção E7 |
| logs | destino operacional | a definir no deploy, recomendação inicial 30–90 dias | stdout local não implementa política do agregador |
| e-mails técnicos | provedor SMTP | política do provedor | TRACEFLOW não controla mailbox; evitar anexos de exportação |
| backup | infraestrutura | a definir | expurgo lógico pode persistir até rotação; acesso e criptografia devem ser contratados |

Execução: `npm run privacy:retention:dry-run` mostra apenas contagens; `npm run privacy:retention` aplica. Banco com nome de produção exige `--confirm-production`. Agendamento pertence a cron/job externo, nunca ao startup.
