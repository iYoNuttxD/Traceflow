# Runbook — integração GitHub App

## Criar a App

1. No GitHub, crie uma GitHub App e habilite **Request user authorization (OAuth) during installation**. Configure a Callback URL como `GITHUB_APP_CALLBACK_URL` (`/api/github-app/callback`). Nesse modo, não configure Setup URL: o GitHub usa o callback OAuth da App e fornece `code`, `installation_id`, `setup_action` e `state`.
2. Configure o webhook para `POST /api/webhooks/github-app`. No callback, confirme nos logs sanitizados as etapas `validate_state`, `exchange_installation_user_code`, `validate_installation`, `fetch_installation`, `verify_repository_access`, `persist_installation`, `consume_state` e `complete`.
3. Habilite instalação apenas nas contas/repositórios necessários. Permissões mínimas de repositório: Metadata read-only, Contents read-only, Pull requests read-only e Issues read-only. Mantenha separados o callback da App (`GITHUB_APP_CALLBACK_URL`) e o callback de login/vínculo (`GITHUB_LOGIN_CALLBACK_URL`); `GitHubIdentity` não autoriza a App e a App não autentica a conta TraceFlow.
4. Gere private key e configure seu conteúdo PEM em base64 no secret store como `GITHUB_APP_PRIVATE_KEY_BASE64`.
5. Configure App ID, client ID/secret, slug, webhook secret e URLs de sucesso/erro listadas em `.env.example`.
6. Não configure PAT nem `GITHUB_TOKEN`; não existe fallback operacional.
7. Em produção, ausência ou conjunto parcial da configuração deve impedir startup.

Nenhuma variável `VITE_*` pode conter private key, client secret, webhook secret ou token. Esses valores não entram no banco.

## Instalação e conexão

1. Usuário com e-mail verificado inicia a instalação pela tela de Projetos.
2. O backend cria state curto, hashado e ligado à sessão/intenção.
3. Após instalar, o callback troca `code` por token de usuário efêmero, comprova `installation_id` em `GET /user/installations`, confirma a mesma Installation com JWT da App e valida o Installation Token com uma única consulta mínima (`per_page=1`), que aceita zero repositórios. O callback salva somente metadados e redireciona; a listagem completa ocorre apenas nos endpoints de descoberta. Não consulta nem cria `GitHubIdentity`.
4. Para projeto existente, somente OWNER escolhe o repositório e conclui `PUT /api/projects/:projectId/github/integration`.
5. Criação por repositório usa `POST /api/projects/from-github` com installation/repository IDs; o backend consulta o DTO real.
6. Reutilize a mesma instalação para todos os projetos/repositórios autorizados. Não reinstale a App por projeto; use “Gerenciar acesso da instalação no GitHub” somente para adicionar ou remover repositórios do escopo.

User e installation access tokens são temporários e nunca persistidos. O primeiro existe apenas durante o callback; o segundo é a autoridade para repositórios e sync. Se o callback falhar, use o reason code sanitizado do redirect/request ID; não copie code/state/token para logs ou tickets.

## Migração dos projetos anteriores

A migration L1 cria integração `RECONNECT_REQUIRED` para projetos com metadados GitHub anteriores. Requisitos, tarefas, commits, PRs, issues, vínculos, histórico e auditoria permanecem intactos. Um OWNER deve instalar a App e selecionar novamente o repositório. Não altere o status manualmente nem delete artifacts.

## Sincronização

- `POST /api/projects/:projectId/github/sync` exige MANAGER+, e-mail verificado e integração/instalação `ACTIVE`.
- Duas solicitações concorrentes para o mesmo projeto retornam `202` e o mesmo `run.id`; somente a criadora informa `alreadyRunning=false` e agenda o worker.
- O token de instalação é gerado sob demanda; sync pagina, deduplica/upserta e preserva artifacts ausentes em execuções posteriores.
- Falha parcial preserva lotes confirmados e último sucesso; `GitHubSyncRun.activeProjectId` garante um claim ativo por projeto no banco e stale detection permite recuperação controlada.
- O polling de status é read-first: runs com `heartbeatAt` recente não geram escrita. Apenas um run realmente stale é expirado condicionalmente pelo próprio `run.id`; para `QUEUED` sem heartbeat, `updatedAt` é o fallback de liveness.
- Webhooks de instalação/repositório apenas atualizam estado. Não disparam sync automático.
- `installation_repositories.added` atualiza metadados e o novo repositório aparece na listagem ao vivo, sem alterar projetos existentes.
- `installation_repositories.removed` bloqueia somente integrações dos IDs removidos e preserva as demais integrações e todos os artifacts já importados.

## Webhook

GitHub deve enviar `Content-Type: application/json`, `X-Hub-Signature-256`, `X-GitHub-Delivery` e `X-GitHub-Event`. O backend limita raw body a 1 MiB, valida HMAC e trata delivery repetido idempotentemente. Monitore 4xx/5xx por request ID, nunca pelo payload integral.

## Diagnóstico

1. Verifique `ProjectGitHubIntegration.status` e `GitHubInstallation.status` sem consultar segredos. Ausência de `GitHubIdentity` não é falha da App.
2. `RECONNECT_REQUIRED`: OWNER deve reinstalar/autorizar e selecionar o repositório.
3. `SUSPENDED`/`REMOVED`: confirme no GitHub; não force sync.
4. `GITHUB_AUTH_FAILED`: verifique App ID/private key/permissões, Callback URL e a opção de autorização durante a instalação, sem imprimir valores.
5. Rate limit/5xx: respeite retry limitado e aguarde recuperação.
6. Após correção, execute um sync manual e confira contagens/vínculos.

Store de rate limit, lock distribuído, secret manager e monitoramento pertencem ao ambiente operacional.
