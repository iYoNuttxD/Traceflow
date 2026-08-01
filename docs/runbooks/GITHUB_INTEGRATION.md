# Runbook — integração GitHub App

## Criar a App

1. No GitHub, crie uma GitHub App com callback igual a `GITHUB_APP_CALLBACK_URL` e webhook apontando para `POST /api/github/app/webhook`.
2. Habilite instalação apenas nas contas/repositórios necessários. Permissões mínimas de repositório: Metadata read-only, Contents read-only, Pull requests read-only e Issues read-only. Não habilite login de usuários como funcionalidade do TRACEFLOW.
3. Gere private key e configure seu conteúdo PEM em base64 no secret store como `GITHUB_APP_PRIVATE_KEY_BASE64`.
4. Configure App ID, client ID/secret, slug, webhook secret e URLs de sucesso/erro listadas em `.env.example`.
5. Não configure PAT nem `GITHUB_TOKEN`; não existe fallback operacional.
6. Em produção, ausência ou conjunto parcial da configuração deve impedir startup.

Nenhuma variável `VITE_*` pode conter private key, client secret, webhook secret ou token. Esses valores não entram no banco.

## Instalação e conexão

1. Usuário com e-mail verificado inicia a instalação pela tela de Projetos.
2. O backend cria state curto, hashado e ligado à sessão/intenção.
3. Após instalar, o callback troca `code`, comprova `installation_id`, salva metadados e redireciona.
4. Para projeto existente, somente OWNER escolhe o repositório e conclui `PUT /api/projects/:projectId/github/integration`.
5. Criação por repositório usa `POST /api/projects/from-github` com installation/repository IDs; o backend consulta o DTO real.
6. Reutilize a mesma instalação para todos os projetos/repositórios autorizados. Não reinstale a App por projeto; use “Gerenciar acesso da instalação no GitHub” somente para adicionar ou remover repositórios do escopo.

User e installation access tokens são temporários e nunca persistidos. Se o callback falhar, use o reason code sanitizado do redirect/request ID; não copie code/state/token para logs ou tickets.

## Migração dos projetos anteriores

A migration L1 cria integração `RECONNECT_REQUIRED` para projetos com metadados GitHub anteriores. Requisitos, tarefas, commits, PRs, issues, vínculos, histórico e auditoria permanecem intactos. Um OWNER deve instalar a App e selecionar novamente o repositório. Não altere o status manualmente nem delete artifacts.

## Sincronização

- `POST /api/projects/:projectId/github/sync` exige MANAGER+, e-mail verificado e integração/instalação `ACTIVE`.
- O token de instalação é gerado sob demanda; sync pagina, deduplica/upserta e preserva artifacts ausentes em execuções posteriores.
- Falha parcial preserva lotes confirmados e último sucesso; uma trava local impede concorrência no mesmo processo.
- Webhooks de instalação/repositório apenas atualizam estado. Não disparam sync automático.
- `installation_repositories.added` atualiza metadados e o novo repositório aparece na listagem ao vivo, sem alterar projetos existentes.
- `installation_repositories.removed` bloqueia somente integrações dos IDs removidos e preserva as demais integrações e todos os artifacts já importados.

## Webhook

GitHub deve enviar `Content-Type: application/json`, `X-Hub-Signature-256`, `X-GitHub-Delivery` e `X-GitHub-Event`. O backend limita raw body a 1 MiB, valida HMAC e trata delivery repetido idempotentemente. Monitore 4xx/5xx por request ID, nunca pelo payload integral.

## Diagnóstico

1. Verifique `ProjectGitHubIntegration.status` e `GitHubInstallation.status` sem consultar segredos.
2. `RECONNECT_REQUIRED`: OWNER deve reinstalar/autorizar e selecionar o repositório.
3. `SUSPENDED`/`DELETED`: confirme no GitHub; não force sync.
4. `GITHUB_AUTH_FAILED`: verifique App ID/private key/permissões e rotação, sem imprimir valores.
5. Rate limit/5xx: respeite retry limitado e aguarde recuperação.
6. Após correção, execute um sync manual e confira contagens/vínculos.

Store de rate limit, lock distribuído, secret manager e monitoramento pertencem ao ambiente operacional.
