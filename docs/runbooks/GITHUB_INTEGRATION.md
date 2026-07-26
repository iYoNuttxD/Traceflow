# Runbook — integração GitHub

## Configuração

1. Crie um token técnico com somente os repositórios e permissões de leitura necessários.
2. Armazene-o como `GITHUB_TOKEN` no ambiente do backend; nunca use `VITE_*`, banco ou repositório.
3. Valide `GITHUB_REQUEST_TIMEOUT_MS` e `GITHUB_RETRY_MAX` conforme `.env.example`.
4. Inicie a API e valide `GET /api/github/auth/check` com sessão autorizada.

O PAT é sistêmico e não representa o usuário TRACEFLOW. Para repositório privado, o token precisa de acesso explícito. A evolução recomendada é GitHub App por instalação.

## Sincronização e reprocessamento

- A UI de detalhes do projeto dispara `POST /api/projects/:projectId/github/sync` para MANAGER+.
- O sync consulta repositório, commits, pull requests e issues em páginas e persiste por identificador externo.
- Segunda execução atualiza/deduplica; não apaga artefatos ausentes no GitHub.
- Falha parcial preserva lotes concluídos, registra status/erro sanitizado e permite repetir manualmente.
- Uma trava por projeto evita duas execuções concorrentes na mesma instância; múltiplas instâncias exigem lock distribuído.

Após importar commits, a detecção RF41 cria somente sugestões. Na edição de uma Task persistida, “Atualizar sugestões” chama o scan histórico project-scoped; confirmação humana cria `TaskCommit`.

## Rate limit e falhas

- `403` com rate limit e `429` são normalizados; respeite `Retry-After`/reset antes de repetir.
- Timeout, 502, 503 e 504 podem receber retry limitado com backoff/jitter.
- 401, 404 e 422 não devem ser repetidos automaticamente.
- Nunca registre token, headers Octokit, mensagem completa de commit ou payload externo.

## Recuperação

1. Consulte `githubSyncStatus`, última tentativa e erro sanitizado do projeto.
2. Verifique validade/escopo do token sem copiá-lo para logs ou chat.
3. Verifique disponibilidade/rate limit do GitHub.
4. Corrija credencial/configuração e repita o sync uma vez.
5. Confirme contagens e ausência de duplicidade; não faça DELETE manual de artefatos.
6. Em comprometimento, siga [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) antes de reprocessar.

Não há scheduler, checkpoint persistente entre páginas ou smoke externo automatizado com repositório privado.

