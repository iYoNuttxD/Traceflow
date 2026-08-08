# L1.1 — Login e identidade GitHub

## Arquitetura

A L1.1 reutiliza a GitHub App TRACEFLOW existente, mas mantém dois domínios independentes:

- `GitHubIdentity`: identidade externa usada somente para autenticação;
- `GitHubInstallation` e `GitHubInstallationAuthorization`: autorização da GitHub App para acessar repositórios.

O login nunca cria instalação, autorização de instalação, projeto, membership ou acesso a repositório. A identidade é resolvida exclusivamente por `githubUserId`; `githubLogin` é metadata atualizável de apresentação.

## Modelos

- `GitHubIdentity`: relação opcional e única com `User`; `userId` e `githubUserId` são únicos.
- `GitHubOAuthState`: state por hash, finalidade (`LOGIN`, `LINK_IDENTITY` ou `REAUTH_SET_PASSWORD`), contexto de usuário/sessão, `rememberMe`, `returnTo`, expiração e consumo único.
- `Session.lastReauthenticatedAt`: autorização recente, vinculada à sessão, para inicializar a primeira senha.

A migration incremental é `20260808120000_l1_1_github_identity_login`. Nenhuma migration anterior é alterada e não há backfill de identidade.

## Fluxos

### Login e criação de conta

1. O frontend envia `rememberMe` e `returnTo` a `POST /api/auth/github/start`.
2. O backend cria state, verifier PKCE e challenge S256. Somente o hash do state é persistido; state e verifier ficam em cookie HTTP-only transitório.
3. `GET /api/auth/github/callback` valida query, cookie, hash, finalidade, expiração e uso único antes de trocar o code.
4. O backend consulta `GET /user` e procura `GitHubIdentity.githubUserId`.
5. Uma identidade existente autentica o `User` vinculado sem consultar e-mail e atualiza somente `githubLogin` e `lastAuthenticatedAt`.
6. Para um GitHub ID novo, o backend consulta `GET /user/emails` e exige o e-mail `primary` e `verified`.
7. E-mail já usado por `User` bloqueia criação e auto-link. Caso contrário, `User` e `GitHubIdentity` são criados na mesma transação.

Contas novas recebem e-mail verificado, `passwordHash = null` e username baseado no login quando válido e disponível. Conflito, formato inválido ou nome reservado gera username temporário com sufixo aleatório e `mustSetUsername = true`.

### Vínculo e desvínculo

- `GET /api/settings/integrations/github-identity` retorna somente o DTO público da identidade.
- `POST /api/settings/integrations/github-identity/link/start` exige conta ativa, e-mail TraceFlow verificado, sessão, CSRF, senha local e ausência de vínculo. O callback valida novamente usuário e sessão.
- `DELETE /api/settings/integrations/github-identity` exige conta ativa, sessão, CSRF e senha atual. Contas sem senha recebem `LOCAL_PASSWORD_REQUIRED`.

Desvincular remove somente `GitHubIdentity`, preserva a sessão atual, revoga as demais e não altera instalações, autorizações de instalação, projetos ou artefatos.

### Primeira senha local

Uma sessão criada por login GitHub é marcada como recentemente reautenticada. Depois da janela configurada, `POST /api/auth/github/reauth/start` inicia OAuth com finalidade `REAUTH_SET_PASSWORD` e exige o mesmo GitHub ID vinculado.

`POST /api/settings/security/password/initialize` exige reautenticação recente, ausência de senha, identidade GitHub, política de senha e confirmação. A operação incrementa `sessionVersion`, revoga outras sessões, atualiza a versão da sessão atual e consome `lastReauthenticatedAt`.

O DTO de conta expõe somente `hasLocalPassword` e `canInitializePassword`; hashes nunca são retornados.

## Segurança

- PKCE S256 e callback configurado pelo backend;
- state aleatório armazenado somente por hash, com TTL, finalidade e uso único;
- cookie de binding HTTP-only, `SameSite=Lax`, `Secure` em produção e path limitado ao callback;
- `returnTo` aceita somente caminho interno e preserva pathname, search e hash;
- user access token existe somente na requisição de callback e nunca é persistido ou logado;
- CSRF em vínculo, desvínculo, reautenticação e inicialização de senha;
- rate limit de autenticação no início/callback e de mutação sensível nas operações autenticadas;
- erros e redirects usam códigos/reasons permitidos, sem code, state, GitHub ID, e-mail ou payload bruto;
- constraints únicas são a fonte de verdade para concorrência de e-mail e identidade;
- anonimização remove `GitHubIdentity` e states OAuth; cleanup remove states usados/expirados.

## Endpoints

| Método | Endpoint | Responsabilidade |
| --- | --- | --- |
| POST | `/api/auth/github/start` | Iniciar login/cadastro GitHub |
| GET | `/api/auth/github/callback` | Concluir finalidade persistida no state |
| POST | `/api/auth/github/reauth/start` | Reautenticar para criar a primeira senha |
| GET | `/api/settings/integrations/github-identity` | Consultar identidade vinculada |
| POST | `/api/settings/integrations/github-identity/link/start` | Iniciar vínculo explícito |
| DELETE | `/api/settings/integrations/github-identity` | Desvincular identidade |
| POST | `/api/settings/security/password/initialize` | Criar primeira senha local |

## Configuração manual da GitHub App

1. Cadastre como callback de autenticação o valor exato de `GITHUB_LOGIN_CALLBACK_URL`, separado de `GITHUB_APP_CALLBACK_URL`. Em desenvolvimento, o padrão documentado é `http://localhost:3001/api/auth/github/callback`; produção exige HTTPS.
2. Em **Permissions & events > Account permissions**, configure **Email addresses** como **Read-only**. Não amplie permissões de escrita ou de repositório.
3. Depois de alterar permissões, proprietários/usuários podem precisar aceitar ou reautorizar a GitHub App conforme solicitado pelo GitHub.

Variáveis adicionadas:

- `GITHUB_LOGIN_CALLBACK_URL`;
- `GITHUB_OAUTH_STATE_TTL_MS` (padrão: 600000 ms);
- `GITHUB_REAUTHENTICATION_TTL_MS` (padrão: 600000 ms);
- `GITHUB_OAUTH_COOKIE_NAME` (padrão: `traceflow_github_oauth`).

## Testes

As suítes cobrem schema/migration, PKCE/state/cookie, sanitização de `returnTo`, identidade existente, mudança de login, preservação de e-mail/username, criação GitHub-only, e-mail ausente/conflitante, reautenticação com identidade divergente, primeira senha, vínculo posterior por ID e isolamento entre identidade e instalação.

## Limitações operacionais

O teste ponta a ponta contra GitHub depende da callback e da permissão de e-mail configuradas manualmente na GitHub App. A aplicação não automatiza alterações externas nem persiste tokens para repetir chamadas fora do callback.
