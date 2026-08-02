# L2 — Conta, segurança, privacidade e integrações

## Objetivo e escopo

A L2 transforma os controles parciais da E7 em fluxos completos de perfil, username, e-mail, senha, sessões, desativação, exclusão, anonimização, exportação e autorizações pessoais da GitHub App. Exclusão de projeto, MFA, login com GitHub, upload de avatar e infraestrutura distribuída permanecem fora do escopo.

## Decisões e modelo de dados

- `User.id` continua sendo a identidade estável; nome, username e e-mail são mutáveis.
- `AccountStatus` possui `ACTIVE`, `DEACTIVATED`, `DELETION_PENDING` e `ANONYMIZED`.
- `EmailChangeRequest` e `AccountReactivationToken` guardam somente hashes de tokens expiráveis e de uso único.
- `Session.publicId` é um UUID público para listagem/revogação; IDs internos e hashes não saem da API.
- `PrivacyRequest` recebe lease, tentativa e código de falha para processamento retomável.

A migration incremental `20260802120000_l2_account_security_privacy` cria essas estruturas, preenche UUIDs de sessões existentes e converte `isActive=true` em `ACTIVE` e `isActive=false` em `DEACTIVATED`. Nenhuma migration histórica ou dado existente é alterado destrutivamente.

## Máquina de estados e permissões

| Estado | Acesso permitido |
|---|---|
| `ACTIVE` | Operações normais conforme papel |
| `DEACTIVATED` | Login restrito, leitura da conta, reativação, logout e recuperação de senha |
| `DELETION_PENDING` | Login restrito, status/cancelamento, exportação, logout e recuperação de senha |
| `ANONYMIZED` | Nenhuma autenticação, recuperação, reativação ou exportação |

`requireAccountState` aplica a matriz antes das rotas de negócio. O guard frontend apenas representa a mesma política; não é fonte de autorização.

## Perfil, username e e-mail

Nome e username têm endpoints separados. Username reutiliza normalização, formato e reservados da L1, respeita a unicidade do banco e tem cooldown de 30 dias; `mustSetUsername=true` recebe a alteração inicial sem cooldown.

Troca de e-mail exige conta ativa, senha, CSRF e e-mail disponível. O endereço atual continua válido enquanto a solicitação guarda o novo endereço e somente o hash do token. A confirmação pública revalida expiração, uso único, estado e unicidade dentro de transação; depois altera `User.email`, verifica o endereço, revoga todas as sessões, audita e notifica o e-mail anterior. Novo pedido, cancelamento, desativação, exclusão e anonimização invalidam solicitações pendentes. Falhas do adapter de e-mail são sanitizadas e não expõem tokens.

## Senha e sessões

A troca de senha reutiliza Argon2id e a política L1. A transação preserva somente a sessão atual, revoga as outras e invalida resets pendentes; reset continua revogando todas. Sessões retornam apenas UUID público, persistência, criação, última atividade, expiração, revogação e indicação da atual. Revogação individual é limitada ao titular e idempotente; revogar a atual limpa o cookie. A ação de encerrar outras sessões audita a quantidade.

## Desativação e reativação

Desativar exige senha, confirmação explícita, CSRF e verificação transacional de último OWNER. A operação cancela troca de e-mail, muda para `DEACTIVATED`, revoga outras sessões e mantém a atual restrita. Reativação requer token hashado, expirável e de uso único enviado ao e-mail; a confirmação volta a `ACTIVE`, revoga sessões restritas e exige novo login.

## Exclusão e anonimização

O pedido repete a verificação de ownership, agenda 30 dias em UTC e, na mesma transação, muda para `DELETION_PENDING` e revoga outras sessões. O cancelamento dentro do prazo volta a `ACTIVE`, revoga sessões restritas e exige novo login.

O processor busca pedidos vencidos, adquire lease de 30 minutos e processa cada usuário isoladamente. Falhas registram código/tentativa e liberam a operação para retry. A anonimização troca nome, username e e-mail por valores opacos, remove senha, verificação, sessões, tokens e autorizações pessoais GitHub, desativa memberships e neutraliza snapshots pessoais conhecidos. Instalações GitHub, projetos, requisitos, tarefas, commits, pull requests, issues, movimentos e trilha necessária permanecem.

Não existe scheduler embutido. Agendar e monitorar em cron ou runner externo:

```bash
cd backend
npm run accounts:process-deletions
```

O comando é idempotente e pode ser repetido; falha deve gerar alerta operacional.

## Exportação

`POST /api/settings/privacy/export` gera em memória `traceflow-export-AAAA-MM-DD.zip`, sem arquivo temporário. `manifest.json` versão 1.0 referencia JSONs de perfil, memberships, projetos, requisitos, tarefas atribuídas, sessões sanitizadas, privacidade, auditoria e integrações. O schema atual não possui autoria canônica de projeto/requisito/tarefa nem comentários; a exportação não inventa essa autoria.

Não entram senha, hashes, cookies, CSRF, tokens, chaves, secrets ou dados privados de terceiros. O endpoint aceita `ACTIVE` e `DELETION_PENDING`, exige sessão, CSRF e rate limit, audita e envia headers de download. Se o volume crescer, consultas e ZIP devem migrar para paginação/streaming.

## Integrações GitHub

`/settings/integrations` lista conta, status, repositórios, projetos e link oficial de gerenciamento. Instalações suspensas/removidas não disparam leitura externa. Remover uma autorização exige senha e apaga somente `GitHubInstallationAuthorization` do titular: não desinstala a App, não apaga instalação, projetos, artefatos ou autorizações alheias.

A cardinalidade L1 permanece: uma instalação serve vários projetos/repositórios; `projectId` e `githubRepositoryId` são únicos e `installationId` não.

## Endpoints

| Área | Contratos relativos a `/api` |
|---|---|
| Conta | `GET /settings/account`, `PATCH /settings/account/profile`, `PATCH /settings/account/username` |
| E-mail | `POST|DELETE /settings/account/email-change`, `GET .../status`, `GET .../confirm` público |
| Segurança | `POST /settings/security/password`, `GET /settings/security/sessions`, `DELETE .../:sessionId`, `POST .../revoke-others` |
| Desativação | `POST /settings/account/deactivate`, `POST /account/reactivation/start`, `GET .../confirm` público |
| Exclusão/exportação | `GET|POST|DELETE /settings/privacy/deletion`, `POST /settings/privacy/export` |
| Integrações | `GET /settings/integrations/github`, `DELETE .../authorizations/:authorizationId` |

Mutations autenticadas exigem CSRF e operações sensíveis possuem rate limit.

## Auditoria, testes e limitações

São auditados perfil, username, e-mail, senha, sessões, desativação/reativação, exclusão/anonimização, exportação e GitHub. Metadados passam pela allowlist e não contêm senha, token, hash ou e-mail completo.

Testes cobrem estados, cooldown, tokens hashados, preservação da sessão atual, UUID público, ownership, ZIP sem segredos, autorização GitHub, migration/backfill e guards/telas. Limitações: o processor depende de agendamento externo; ZIP é em memória; device/browser não é exibido porque esses dados não são coletados; SMTP e GitHub App reais dependem de homologação externa.
