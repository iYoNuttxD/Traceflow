# Inventário de dados pessoais do TRACEFLOW

Consolidação técnica atualizada pela LR.2 em 20/08/2026. O inventário descreve o tratamento implementado, mas não determina base legal nem comprova conformidade integral com a LGPD; essas decisões pertencem ao controlador com apoio jurídico.

| Dado | Finalidade | Origem | Persistência | Acesso | Retenção | Exclusão | Anonimização | Risco | Controle existente |
|---|---|---|---|---|---|---|---|---|---|
| Nome, username e e-mail da conta | identificação pública, login e comunicação | cadastro e perfil | `User` | titular; OWNER recebe visão autorizada de membros; SMTP recebe destinatário | enquanto a conta estiver ativa, observadas obrigações aplicáveis | fluxo do titular remove ou neutraliza conforme vínculos | substituição por valores neutros/aleatórios | enumeração, exposição e envio indevido | autenticação, RBAC, username normalizado, minimização de DTO e respostas uniformes |
| Hash de senha | autenticação | senha fornecida pelo titular | `User.passwordHash` com Argon2id | somente backend | até troca ou anonimização | removido/invalidado no fluxo aplicável | não aplicável ao valor original, que não é persistido | comprometimento de conta | hash forte, redaction, nunca exportado ou logado |
| Sessão, CSRF, reset e verificação de e-mail | prova temporária de sessão/ação | backend e navegador/e-mail | `Session`, `PasswordResetToken`, `EmailVerificationToken` | titular, backend e SMTP para o link | TTL técnico e limpeza operacional | revogação/expiração e remoção | não aplicável | sequestro, replay e tomada de conta | token opaco hashado, uso único, cookies por ambiente, CSRF e rate limiting |
| Instalação GitHub autorizada | conectar conta/organização e repositório | callback GitHub | IDs/login/tipo em `GitHubInstallation` e autorização temporal | titular e membros autorizados por projeto | enquanto instalação/conexão for necessária; subject a revisão | desconexão/revogação preserva artifacts históricos | autorização do usuário é removida na anonimização | correlação de contas, instalação forjada e BOLA | state/sessão, prova na API GitHub, OWNER-only; nenhum token persistido |
| Convite de projeto | admissão controlada | OWNER e e-mail do convidado | `ProjectInvitation`; capability adicional em `Project.accessCode`, com link derivado | OWNER e destinatário conforme fluxo | TTL e limpeza após estado terminal; access code dura até regeneração | revogação, aceite ou recusa preservam o estado observado; regeneração invalida o código anterior | e-mail e vínculos de ator podem ser neutralizados no fluxo do titular | vazamento, replay, enumeração e brute force | token hashado de uso único, destinatário vinculado, código aleatório, limiter e resposta uniforme |
| Membership, papel e participação | autorização por projeto | convite, criação e administração | `ProjectMembership` | membros conforme papel; e-mail completo somente onde autorizado | ciclo da conta/projeto e trilha necessária | desativação lógica e fluxos de titular | neutralização quando compatível com integridade | BOLA/IDOR e elevação de privilégio | RBAC, 404 seguro, proteção do último OWNER e auditoria |
| Responsável pela tarefa | atribuição de trabalho | membro autenticado | `Task.responsibleUserId`; snapshot `Task.responsible` | membros ativos do projeto | ciclo da tarefa/projeto | vínculo canônico tratado no fluxo de titular; snapshot preservado se histórico | ID pode ser desassociado quando a política permitir | associação incorreta de identidade | membership ativa obrigatória; nenhuma associação automática por nome |
| Autor de movimento e histórico | histórico funcional e responsabilização | sessão autenticada | `TaskMovement.movedByUserId`, `TaskHistoryEntry.actorUserId`; snapshots legados | membros do projeto conforme endpoint | ciclo do projeto e política de auditoria | identificadores tratados preservando integridade; movimentos não são apagados por reconciliação | snapshots sem evidência permanecem não associados | falsa atribuição ou exposição de histórico | ator somente da sessão; IDs técnicos; paginação e autorização |
| Revisor de sugestão Commit–Task | confirmação/rejeição humana do RF41 | sessão autenticada | `TaskCommitSuggestion.reviewedByUserId` | VIEWER+ consulta DTO mínimo; MEMBER+ revisa | ciclo do projeto | `SetNull` em remoção do usuário conforme schema | desassociação técnica | atribuição indevida | transação, mesmo projeto, auditoria e CSRF |
| Autoria/login/e-mail de artefato GitHub | rastreabilidade técnica importada | API GitHub | `Commit`, `PullRequest`, `Issue` | membros autorizados; grafos não expõem `Commit.authorEmail` | histórico do projeto/importação | conforme política do projeto e origem externa | não correlacionada automaticamente com usuário TRACEFLOW | PII de terceiros e correlação indevida | DTO mínimo, autorização e ausência de e-mail no grafo |
| Conteúdo de projeto, requisito, tarefa e issue | colaboração e rastreabilidade | usuários e GitHub | models de domínio | membros autorizados | ciclo do projeto | fluxos existentes e futura política de projeto | depende do conteúdo e finalidade | texto livre pode conter PII | validação, limites, RBAC e orientação de minimização |
| Request ID, IP técnico e evento de auditoria | segurança, diagnóstico e responsabilização | request e operações autenticadas | logs e `AuditEvent` | titular em eventos próprios; OWNER em eventos do projeto; operação autorizada | 365 dias por default técnico para auditoria | job/política de retenção; logs externos dependem da operação | metadata minimizada | perfilamento e exposição operacional | allowlist, redaction, sem body/token/e-mail e request ID |
| Segredos de infraestrutura | acesso a banco, GitHub e SMTP | operação | variáveis de ambiente, nunca banco/UI | operadores autorizados e backend | até rotação/revogação | revogação e substituição | não aplicável | comprometimento sistêmico | validação de config, scanner, redaction e política de segredos |

## Snapshots anteriores à identidade

Os valores textuais de `Task.responsible` e `TaskMovement.movedBy` continuam permitidos para
preservar apresentação histórica, mas nunca autorizam ou identificam uma pessoa. Na auditoria
LR.2 da base atual havia 1 Task, nenhuma com responsável textual, e nenhum movimento. A
migration removeu a relação `projectMemberId`; qualquer base com referência ainda não
reconciliada é bloqueada antes do contract.

## Limitações de governança

- retenção de backups e logs externos não pode ser comprovada apenas pelo código;
- validação de bases legais, atendimento humano e prazos regulatórios permanece pendente;
- conteúdo livre e dados importados do GitHub podem conter dados de terceiros;
- remoções destrutivas de snapshots exigem nova auditoria e evidência de preservação.
