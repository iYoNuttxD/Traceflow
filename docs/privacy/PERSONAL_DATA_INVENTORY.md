# Inventário de dados pessoais do TRACEFLOW

Baseline técnico atualizado na E8 em 25/07/2026. Este inventário apoia governança e não constitui conclusão jurídica; base legal, prazos obrigatórios e atendimento formal devem ser validados pelo controlador e assessoria competente.

| Dado | Classificação | Origem/finalidade | Model | Acesso/compartilhamento | Retenção e correção | Exclusão/risco |
|---|---|---|---|---|---|---|
| nome e e-mail da conta | DADO PESSOAL | cadastro, identificação e comunicação | `User` | titular; OWNER vê e-mail de membros; SMTP recebe destinatário | enquanto conta ativa; titular corrige em `/account/profile` | anonimização substitui por valor neutro/aleatório; risco de enumeração e caixa postal |
| hash de senha | CREDENCIAL/SEGREDO | autenticação | `User.passwordHash` | somente backend/Argon2id | até troca ou anonimização | removido na anonimização; nunca exportado/logado |
| sessão/CSRF/reset/convite | CREDENCIAL/SEGREDO | sessão e fluxos de prova | `Session`, `PasswordResetToken`, `ProjectInvitation` | backend; token bruto apenas navegador/e-mail | TTL e limpeza operacional | revogado/removido; risco crítico se vazado |
| membership, papel e participação | DADO PESSOAL | autorização por projeto | `ProjectMembership` | integrantes do projeto, e-mail minimizado por papel | histórico durante o projeto/conta | desativação lógica; risco BOLA mitigado por RBAC |
| responsável e movimentação | DADO TÉCNICO POTENCIALMENTE PESSOAL | atribuição e histórico Kanban | `Task`, `TaskMovement` | integrantes do projeto | histórico funcional | texto legado vira neutro na anonimização |
| vínculo Task–PR | DADO TÉCNICO | rastreabilidade singular da tarefa | `Task.pullRequestId` | integrantes autorizados | ciclo da tarefa/projeto | não possui ator próprio; a relação é removida com a Task ou anulada com a PR |
| autoria de commit/login/e-mail | DADO TÉCNICO POTENCIALMENTE PESSOAL | rastreabilidade importada do GitHub | `Commit`, `PullRequest`, `Issue` | integrantes do projeto; GitHub é origem/terceiro | acompanha artefato técnico | correlação é limitada e não é automaticamente identidade TRACEFLOW |
| conteúdo de requisito/tarefa/issue | DADO TÉCNICO POTENCIALMENTE PESSOAL | colaboração | models de domínio | integrantes autorizados e GitHub quando originário | ciclo do projeto | pode conter PII livre; minimização depende do autor |
| request ID e evento de auditoria | IDENTIFICADOR TÉCNICO | segurança, responsabilização e diagnóstico | `AuditEvent` | titular para conta; OWNER para projeto; operador de banco | 365 dias por default técnico | metadata em allowlist, sem body/e-mail/token |
| segredos de infraestrutura | CREDENCIAL/SEGREDO | banco, GitHub e SMTP | variáveis de ambiente | operadores autorizados/backend | rotação operacional | nunca exportados, persistidos na UI ou logs |
| código/link legado de acesso | CREDENCIAL/SEGREDO | compatibilidade de convite | `Project.accessCode/inviteLink` | backend e integrantes conforme UI legada | até retirada futura | não incluído na exportação; mecanismo residual inseguro |

Campos legados `ProjectMember.name/email` permanecem por integridade. `Task.responsible` e `TaskMovement.movedBy` são neutralizados quando vinculados ao usuário anonimizado. Dados GitHub não são apagados automaticamente porque pertencem ao histórico externo do projeto e podem representar terceiros.
