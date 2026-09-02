# TRACEFLOW L2 — Plano de implementação

## 1. Inventário do estado atual

- Identidade canônica: `User.id`. Sessões, memberships, tarefas responsáveis, movimentos, auditoria, privacidade e autorizações GitHub usam FKs por `userId`.
- `ProjectMember.email`, `ProjectInvitation.email`, nomes textuais de autoria e metadados importados do GitHub são compatibilidade/snapshots, não identidade autenticável.
- `User` ainda combina `isActive` com ausência de máquina de estados explícita.
- `Session` já possui token opaco em hash, CSRF, expiração, `lastSeenAt` e revogação, mas usa ID interno na API.
- Username já possui normalização, palavras reservadas e unicidade no banco, mas não possui cooldown.
- O fluxo atual de perfil altera e-mail diretamente, o que será substituído por solicitação confirmada.
- Privacidade já possui auditoria, `PrivacyRequest`, `PersonalDataExport`, ownership canônico e processor executável, mas exporta JSON simples, desativa sem modo restrito e não representa o estado da conta.
- A GitHub App possui separação entre instalação compartilhada e autorização pessoal, tokens temporários e cardinalidade multi-repositório/multi-projeto.
- O frontend possui `AuthContext`, guards, modal compartilhado, feedback, CSS global e uma página de privacidade inicial; ainda não possui shell `/settings` nem estado restrito.

## 2. Modelos impactados

- `User`: `accountStatus`, `deactivatedAt`, `usernameChangedAt`, `anonymizedAt`.
- `Session`: identificador público opaco e indicação de sessão restrita derivada do estado da conta.
- Novo `EmailChangeRequest`: `userId`, snapshots/endereço normalizado, hash, expiração e marcadores de uso/cancelamento.
- Novo `AccountReactivationToken`: hash, expiração e uso único.
- `PrivacyRequest`: reutilizado para exclusão/desativação, acrescentando campos operacionais somente se necessários ao processor idempotente.
- `PersonalDataExport`: reutilizado como registro auditável; o ZIP será gerado sob demanda e não persistido.

## 3. Migrations planejadas

1. Nova migration incremental `l2_account_security_privacy`.
2. Criar enum de status e backfill `ACTIVE` para todos os usuários existentes.
3. Adicionar colunas e índices sem alterar migrations históricas.
4. Preencher identificadores públicos aleatórios para sessões existentes antes de aplicar unicidade.
5. Criar tabelas de alteração de e-mail e reativação com FKs/índices seguros.
6. Validar banco vazio por migrations e banco existente por `prisma migrate status/deploy` no banco de testes isolado.

## 4. Rotas impactadas

- Conta: `/api/settings/account`, perfil, username e alteração de e-mail.
- Segurança: senha, listagem/revogação de sessões e revogação das demais.
- Privacidade: exportação ZIP, desativação e exclusão pendente.
- Reativação/confirmacões por token em rotas públicas explicitamente separadas.
- Integrações: listagem e remoção da autorização pessoal GitHub.
- Rotas legadas de `/api/account` serão mantidas somente quando compatíveis e delegarão à mesma regra de domínio durante a transição.

## 5. Middlewares e políticas

- Política central de estado da conta após autenticação.
- `ACTIVE` acessa a API normal.
- `DEACTIVATED` acessa somente estado, reativação e logout.
- `DELETION_PENDING` acessa somente status/cancelamento/exportação/logout.
- `ANONYMIZED` nunca autentica.
- CSRF permanece obrigatório em mutações autenticadas; confirmações por token são públicas, de uso único e rate limited.

## 6. Frontend impactado

- Menu acessível do usuário e avatar por iniciais.
- Shell responsivo de configurações.
- Rotas `/settings/account`, `/settings/security`, `/settings/privacy` e `/settings/integrations`.
- Guard global por `accountStatus` e layout restrito para desativação/exclusão pendente.
- Reutilização de `httpClient`, `AuthContext`, `ConfirmDialog`, feedback e `global.css`.

## 7. Riscos

- Concorrência em username/e-mail, mitigada por constraints e transações.
- Corrida entre cancelamento e processor, mitigada por atualização condicional e transação serializável por usuário.
- Ownership alterado entre pré-checagem e transação, mitigado por repetição da checagem dentro da transação.
- Vazamento de PII/tokens em ZIP, auditoria ou logs, mitigado por selects mínimos e testes negativos.
- Volume da exportação: consultas serão paginadas/selecionadas por titular; o ZIP será produzido em memória limitada enquanto não houver armazenamento/worker.
- Falha SMTP após commit não reverte estado; será auditada/logada de forma sanitizada e documentada como entrega best-effort.

## 8. Compatibilidade

- `User.id` permanece estável e nenhum relacionamento será reescrito por e-mail/username.
- `isActive` será mantido temporariamente como espelho compatível de `accountStatus !== ANONYMIZED`, sem ser a fonte de verdade da L2.
- Projetos, artefatos, histórico e instalações GitHub não serão apagados na anonimização.
- Autorizações pessoais GitHub serão removidas sem afetar instalações ou outros usuários.

## 9. Estratégia de testes

- Unidade: políticas, validações, cooldowns, tokens, ZIP e sanitização.
- Integração: migration, transações, concorrência, ownership, estados, anonimização e preservação de relações.
- API: autenticação/CSRF/rate limit, contratos e erros normalizados.
- Frontend: menu, settings, formulários, estados restritos, integrações, feedback e acessibilidade.
- Gates completos de backend/frontend, Prisma e `git diff --check`.

## 10. Ordem incremental

1. Schema e migration.
2. Erros e política central de estado.
3. Conta, username e e-mail.
4. Senha e sessões.
5. Desativação/reativação e exclusão/cancelamento.
6. Processor e anonimização.
7. Exportação ZIP.
8. Autorizações GitHub.
9. Frontend `/settings` e estados restritos.
10. Documentação, ADRs, roadmap e gates.
