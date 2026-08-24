# ADR-012 — GitHub OAuth e GitHub App independentes

**Status:** aceito na LR.9; substitui a autoridade pessoal de repositórios do ADR-009

**Data:** 2026-08-24

## Contexto

O modelo das LR.3, LR.3.1 e LR.8 vinculou a descoberta de repositórios a uma
`GitHubIdentity` e aos snapshots pessoais `OWNER`/`ADMIN` com TTL. Na validação real, uma conta
TraceFlow local conseguia iniciar a instalação da GitHub App, mas o callback falhava porque exigia
identidade GitHub vinculada. Isso misturava a identidade usada para autenticar no TraceFlow com a
credencial técnica concedida à App.

## Decisão

GitHub OAuth e GitHub App são integrações independentes:

```text
GitHub OAuth -> cadastro, login, vínculo de identidade e reautenticação sensível
GitHub App   -> Installation, repositórios, artefatos, webhooks e sincronização
```

`GitHubIdentity` nunca é requisito para instalar a App, listar repositórios, criar/reconectar um
projeto ou sincronizar. Remover a identidade não remove `GitHubInstallation`,
`ProjectGitHubIntegration` ou artefatos.

O fluxo de instalação usa `GitHubAppConnectionState`, separado de `GitHubOAuthState`, com hash,
`userId`, `sessionId`, intenção, projeto opcional, expiração e consumo atômico. A configuração da
App deve habilitar **Request user authorization (OAuth) during installation** e registrar
`GITHUB_APP_CALLBACK_URL` como callback URL. Nesse modo, o GitHub envia `code`, `installation_id`,
`setup_action` e `state` ao callback; a Setup URL não é usada nesse fluxo.

O `code` produz um user access token efêmero da instalação. Ele serve exclusivamente para paginar
`GET /user/installations` e provar que `installation_id` está acessível ao ator que concluiu a
operação no GitHub. O backend não consulta nem compara esse ator com `GitHubIdentity`. Em seguida,
um JWT da App consulta a Installation informada e um Installation Access Token executa uma única
chamada mínima (`per_page=1`) para validar o acesso técnico. Resposta vazia é válida e o callback
não percorre o escopo completo. A descoberta integral permanece nos endpoints próprios de
repositórios. Nenhum token é persistido, retornado ou registrado.

`GitHubInstallationAuthorization` permanece como vínculo entre uma conta TraceFlow e a
Installation que ela conectou. Ela não representa identidade OAuth nem permissão pessoal no
repositório. A LR.9 remove `GitHubRepositoryAuthorization`, `GitHubRepositoryPermission`, os
timestamps de snapshot, o TTL de sete dias, o purpose `REPOSITORY_AUTHORIZATION` e os estados
`AUTHORIZED`/`REAUTH_REQUIRED` da descoberta.

A autoridade de repositórios é o escopo vivo da Installation. Listagem, criação e reconexão
consultam o Installation Token; sync normal usa a mesma fronteira. `SUSPENDED` e `REMOVED` bloqueiam
novas operações. A remoção de um repositório marca a integração como `RECONNECT_REQUIRED`, sem
apagar histórico. A troca silenciosa de repositório continua retornando
`409 GITHUB_REPOSITORY_SWAP_FORBIDDEN`.

## Configuração operacional

- Callback URL da App: `GITHUB_APP_CALLBACK_URL`, rota `/api/github-app/callback`.
- Callback OAuth de login: `GITHUB_LOGIN_CALLBACK_URL`, rota `/api/auth/github/callback`.
- Request user authorization during installation: habilitado.
- Setup URL: não configurada para este fluxo.
- Webhook: `/api/webhooks/github-app`, com secret e validação HMAC.
- Permissões mínimas: Metadata read-only, Contents read-only, Pull requests read-only e Issues
  read-only.
- Seleção de repositórios: definida pelo instalador no GitHub; o TraceFlow não amplia o escopo.

O GitHub documenta que a Setup URL e o callback URL têm finalidades distintas e que
`installation_id` recebido pela Setup URL pode ser adulterado, exigindo verificação adicional. O
modo adotado segue a autorização durante a instalação e valida o ID tanto pela lista acessível ao
ator quanto pela API autenticada da App.

## Referências oficiais

- [About the setup URL](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url)
- [About the user authorization callback URL](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-user-authorization-callback-url)
- [Modifying a GitHub App registration](https://docs.github.com/en/apps/maintaining-github-apps/modifying-a-github-app-registration?apiVersion=2022-11-28)

## Consequências

Contas locais e contas GitHub-only usam a mesma jornada da App. Ter OAuth sem App permite login,
mas não cria projeto; ter App sem OAuth permite projeto e sync. A migration LR.9 remove somente o
snapshot pessoal obsoleto e estados OAuth pendentes daquela finalidade, preservando Installations,
autorizações de instalação, integrações, sync runs e artefatos.

## Histórico substituído

O ADR-009 continua registrando a decisão vigente entre LR.3 e LR.8. Permanecem válidos dele o uso
de Installation Token, o lifecycle, a cardinalidade e a proibição de PAT. A exigência de snapshot
pessoal `OWNER`/`ADMIN`, TTL e renovação OAuth foi substituída por este ADR.
