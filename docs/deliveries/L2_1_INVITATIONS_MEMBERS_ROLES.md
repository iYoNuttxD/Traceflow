# L2.1 — Convites, equipe e perfis

## Escopo técnico

A entrega fecha RF24, RF25 e RF26 sobre as fontes canônicas `ProjectInvitation` e `ProjectMembership`, preservando os contratos legados de `ProjectMember` e `accessCode` para uma futura migração controlada. Nenhuma migration anterior, roadmap ou documento oficial do TCC foi alterado.

## Fluxo de convite

- somente OWNER cria, lista e revoga convites do projeto; a criação também exige e-mail verificado;
- o e-mail é normalizado e o token aleatório de 256 bits é persistido somente como SHA-256;
- convite pendente duplicado para o mesmo projeto/e-mail é bloqueado em transação serializável, preservando o convite original;
- membro já ativo não recebe novo convite;
- o destinatário autenticado consulta contexto mínimo, aceita ou recusa;
- aceite reivindica o convite atomicamente antes de criar ou reativar a membership;
- aceite, recusa, expiração, revogação e uso anterior possuem estados e códigos distintos;
- e-mail incompatível com a sessão usa resposta genérica para não permitir enumeração;
- conta não `ACTIVE` é bloqueada pelo middleware global e não conclui aceite ou recusa;
- criação aplica quotas de mutation sensível e entrega de e-mail; detalhes, aceite e recusa aplicam quota de mutation sensível.

O token bruto não aparece em lista, DTO, auditoria ou log. Em produção, ele é entregue apenas pelo adapter de e-mail. O retorno de criação informa `emailDelivery.status` sem expor detalhes SMTP; nova criação para o mesmo destinatário/projeto retorna `INVITATION_ALREADY_PENDING` enquanto o convite anterior estiver pendente e válido.

## Concorrência e integridade

As operações críticas usam transação `SERIALIZABLE` com repetição limitada apenas para conflito `P2034` do Prisma. Aceites concorrentes do mesmo token produzem uma única transição terminal e uma única membership. Alterações ou desativações concorrentes de proprietários preservam pelo menos um OWNER ativo.

O MySQL não fornece índice parcial simples para “um convite pendente”; portanto, a unicidade operacional de pendência é mantida pela transação serializável e pelo índice composto de consulta `(projectId,email,createdAt)`. O token possui unicidade física no banco e a membership mantém `UNIQUE(projectId,userId)`.

## Matriz efetiva

| Operação                                                    | VIEWER | MEMBER | MANAGER |                          OWNER |
| ----------------------------------------------------------- | -----: | -----: | ------: | -----------------------------: |
| Listar equipe                                               |    Sim |    Sim |     Sim |                            Sim |
| Ver e-mail completo da equipe                               |    Não |    Não |     Não |                            Sim |
| Criar/listar/revogar convites                               |    Não |    Não |     Não |                            Sim |
| Alterar perfil/desativar/reativar membro                    |    Não |    Não |     Não |                            Sim |
| Adicionar outro OWNER                                       |    Não |    Não |     Não |                            Sim |
| Sair do projeto                                             |    Sim |    Sim |     Sim | Sim, se não for o último OWNER |
| Consultar/aceitar/recusar convite destinado à própria conta |    Sim |    Sim |     Sim |                            Sim |

Ausência de membership ativa continua retornando `404` para reduzir enumeração; papel insuficiente retorna `403`. O middleware resolve o projeto antes da autorização e impede acesso por IDs de memberships de outro projeto.

## Lifecycle e auditoria

`ProjectInvitation` preserva `createdAt`, `expiresAt`, `revokedAt`, `acceptedAt` e agora `declinedAt`, além dos atores aplicáveis. A migration nova é `20260815120000_l2_1_invitations_members_roles`; ela é aditiva e não remove dados.

Criação, revogação, aceite e recusa geram eventos operacionais sem token ou e-mail. Mudanças de perfil, desativação, reativação, saída e adição de proprietário continuam gravadas pelo adapter canônico de auditoria, dentro das transações de membership.

## UX

A administração apresenta nome, username, e-mail conforme permissão, perfil, estado e data de entrada. O último OWNER tem ações destrutivas bloqueadas com explicação. Convites exibem perfil, criação, expiração e estado; a ação de revogar existe apenas enquanto pendente. Falha de SMTP não é apresentada como envio bem-sucedido.

A rota `/invitations/accept` preserva o `returnTo` completo do fluxo de autenticação e, depois da sessão, mostra o projeto/perfil autorizados e as ações explícitas Aceitar e Recusar.

## Validação automatizada

- backend: 191 testes unitários, 137 de integração/API e 328 na cobertura completa;
- cobertura backend: 86,34% statements, 73,21% branches, 88,96% functions e 88,65% lines;
- frontend: 173 testes em 33 arquivos; build Vite com 374 módulos;
- cobertura frontend: 58,08% statements, 57,26% branches, 48,71% functions e 59,56% lines;
- lint, Prettier, arquitetura, Prisma format/validate/generate/status, scanner de segredos, audit de dependências e `git diff --check` aprovados.

A homologação visual H01–H09 não foi declarada como aprovada: não havia navegador disponível na sessão. O smoke técnico confirmou backend saudável e frontend servindo `/login`, sem substituir a validação manual.

## Decisão a confirmar

A política vigente bloqueia contas `DEACTIVATED`, `DELETION_PENDING` ou `ANONYMIZED` no momento de responder ao convite. Ainda não há decisão oficial para consultar previamente uma conta existente pelo e-mail e impedir o próprio envio do convite a esses estados. A implementação não inventa essa regra: preserva a proteção no aceite/recusa e mantém a decisão pendente para produto e privacidade.
