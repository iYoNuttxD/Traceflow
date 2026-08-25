# LR.9 — GitHub OAuth e GitHub App independentes

## Status

**LR.9 BLOQUEADA para conclusão formal.** O desacoplamento, a migration e os gates automatizados
estão verdes. O DoD externo obrigatório conta local → GitHub App real → projeto → sync não foi
executado porque nenhum navegador estava conectado ao ambiente de validação em 2026-08-24.

## Baseline

- Branch: `daniel-dev`.
- SHA inicial: `04a954977e40e356f49640df3cf2d94ff75ff4fc`.
- Working tree inicial: limpa.
- Migrations antes: 39; depois: 40.
- Runtime: Node.js `22.23.2`.

## Causa raiz

As LR.3/LR.3.1/LR.8 misturaram duas autoridades distintas. O callback da App exigia
`GitHubIdentity`, trocava o code do install flow por token de usuário, comparava o ator GitHub com
a identidade de login TraceFlow e gravava snapshots pessoais `OWNER`/`ADMIN`. Descoberta e criação
dependiam desses snapshots, de TTL de sete dias e de `AUTHORIZED`/`REAUTH_REQUIRED`. O frontend
repetia essa dependência com a jornada “Renovar acesso GitHub”.

O defeito observado em ambiente real era apenas a primeira manifestação: uma conta local sem
`GitHubIdentity` iniciava a App, mas falhava no callback. Remover somente essa condição deixaria a
comparação de identidade, o snapshot, o TTL, o endpoint OAuth técnico e a UX ainda acoplados.

## Arquitetura anterior e nova

```text
Antes
OAuth -> GitHubIdentity -> callback da App -> snapshot OWNER/ADMIN -> repositories

Depois
OAuth -> cadastro/login/vínculo/reautenticação sensível

GitHub App state -> prova efêmera de acesso à Installation
                 -> App JWT valida Installation
                 -> Installation Token lista repositories e sincroniza artifacts
```

Nenhum token de usuário ou de Installation é persistido. O token de usuário do install flow existe
somente durante o callback para consultar `GET /user/installations`; ele não cria nem consulta
`GitHubIdentity`. `GitHubInstallationAuthorization` registra apenas a relação conta TraceFlow ↔
Installation conectada.

## Matriz de componentes

| Componente | Responsabilidade anterior | Responsabilidade vigente | Ação LR.9 |
| --- | --- | --- | --- |
| `GitHubIdentity` | login e pré-requisito da App | somente auth/identity | alterado |
| `GitHubOAuthState` | auth e autorização de repo | somente `LOGIN`, `LINK_IDENTITY`, `REAUTH_SENSITIVE_ACTION` | alterado |
| `GitHubAppConnectionState` | state técnico parcialmente ligado à identity | user/session/intenção/projeto, uso único e TTL próprio | mantido e endurecido |
| `GitHubInstallation` | acesso técnico | acesso técnico e lifecycle | mantido |
| `GitHubInstallationAuthorization` | ponte para snapshots pessoais | vínculo User TraceFlow ↔ Installation | mantido e clarificado |
| `GitHubRepositoryAuthorization` | snapshot OWNER/ADMIN com TTL | nenhuma responsabilidade | removido |
| credential provider | tokens de OAuth e App | tokens efêmeros separados por finalidade | alterado |
| repository discovery | interseção snapshot pessoal + App | escopo vivo da Installation | alterado |
| create/reconnect/sync | App mais evidência pessoal | Installation ativa e acesso atual ao repo | alterado |
| frontend | renovação OAuth para listar repo | instalar/conectar GitHub App | alterado |

## Segurança do callback

O callback valida state hashado, uso único, expiração, conta ativa, usuário, sessão original,
revogação, expiração, `sessionVersion`, intenção e `projectId`. Depois:

1. troca o code por token de usuário efêmero;
2. comprova a `installation_id` em `GET /user/installations`;
3. consulta a mesma Installation com JWT da App e compara o account id;
4. valida o acesso técnico com uma única consulta mínima (`per_page=1`) usando Installation Token,
   aceitando zero repositórios e sem paginar o escopo completo;
5. persiste Installation/autorização e consome o state na mesma transação.

Replay, cross-user/cross-session, installation spoofing, conta inativa e Installation
`SUSPENDED`/`REMOVED` falham fechado. Logs registram somente etapa e código seguro, sem code, state,
cookie ou token.

## Alterações

### Backend

- removido o purpose e o endpoint OAuth de repository authorization;
- callback da App desacoplado de `GitHubIdentity` e com dupla prova da Installation;
- descoberta, criação e reconexão consultam o escopo atual da Installation;
- sync existente continua usando Installation Token, inclusive após unlink da identity;
- lifecycle, webhook idempotente, repository removal, rate limit e repository swap foram
  preservados.

### Frontend

- removidos `AUTHORIZED`, `REAUTH_REQUIRED`, renovação pessoal e `userPermission`;
- Projetos orienta “Conectar GitHub App” quando não há Installation;
- Settings separa “Login com GitHub” de “GitHub App” e explica a independência.

### Banco e migration

A migration incremental `20260824120000_lr9_github_oauth_app_decoupling` remove somente:

- `GitHubRepositoryAuthorization`;
- `repositoryAuthorizationVerifiedAt` e `repositoryAuthorizationExpiresAt`;
- states pendentes `REPOSITORY_AUTHORIZATION` e esse valor do enum.

Preflight do banco local: 4 Installations, 1 InstallationAuthorization, 6 integrações, 41 snapshots
obsoletos e 3 states obsoletos. Depois da aplicação, as 4 Installations, o vínculo e as 6
integrações permaneceram; a tabela obsoleta deixou de existir. O upgrade representativo preservou
também Commit, PullRequest, Issue, GitBranch e GitHubSyncRun.

## Matriz funcional

| OAuth | App | Resultado esperado | Automação | Manual real |
| --- | --- | --- | --- | --- |
| Não | Não | login local funciona; criação orienta instalar App | PASS | BLOCKED |
| Sim | Não | login GitHub funciona; criação exige App | PASS | BLOCKED |
| Não | Sim | repositories, projeto e sync funcionam | PASS | BLOCKED |
| Sim | Sim | login GitHub, projeto e sync funcionam; identity é irrelevante à App | PASS | BLOCKED |

As regressões incluem conta local sem identity no start/callback/discovery, identity presente como
metadata irrelevante, criação e sync sem identity, unlink preservando integração, ausência da App,
spoofing de Installation, state adversarial, repository swap, project isolation, webhook e token
leakage.

## Correções pós-code review

- **CR-FIX-01:** Login e as páginas Integrações/Segurança passaram a compartilhar o mesmo mapping
  seguro para `github=error&reason=...`. Reasons desconhecidos usam fallback genérico; os sucessos
  `githubIdentity=success` e `githubReauth=success` foram preservados.
- **CR-FIX-02:** o callback deixou de coletar e descartar todas as páginas de repositórios. O client
  expõe `verifyRepositoryAccess()`, que faz uma única chamada com `per_page=1`; resposta vazia é
  válida, enquanto 403/429 continuam seguindo a normalização e o retry já existentes. A paginação
  completa permanece em `listRepositories`, `listAllRepositories` e
  `resolveAuthorizedRepository`.
- **CR-FIX-03 — GitHub Sync Run Determinism:** a causa confirmada estava no teste E9, não no
  runtime. O cenário MANAGER iniciava um sync e chamava um helper que fazia um segundo `POST`; o
  helper também aceitava qualquer run terminal sem comparar seu ID com o run iniciado. A
  instrumentação diagnóstica capturou os dois POSTs no mesmo run artificial `1408`: o primeiro com
  `alreadyRunning=false`, o segundo com `alreadyRunning=true`, exatamente um registro no banco e
  terminal `SUCCEEDED`. Não houve evidência de worker duplo, divergência de `projectsInSync` ou
  falha de produto.

  A falha terminal relatada anteriormente não se reproduziu na baseline: antes da correção, o
  cenário isolado passou 30/30, o arquivo E9 passou 10/10 e a integração/API passou 3/3. Ainda
  assim, a dupla intenção era temporalmente não determinística: se o primeiro run terminasse antes
  do segundo `POST`, o helper poderia iniciar e observar outro run. A correção separou
  `waitForSyncRun(runId)` de `startAndWaitForSync()`, eliminou o segundo `POST` do cenário MANAGER e
  passou a exigir igualdade de ID em todo polling. Um novo teste HTTP concorrente prova dois 202,
  o mesmo `run.id`, flags `alreadyRunning` complementares, um único worker e um único registro.

  Pós-correção: cenário alvo 50/50, arquivo E9 10/10, integração/API 167/167 e backend total
  429/429. Não houve aumento de timeout, sleep ou polling, retry, skip, mudança de coverage ou
  alteração de runtime; a instrumentação temporária foi removida.

### CR-FIX-04 — Sync Status Failure-Transition Reliability

O CI do SHA `b1f2bd052f026fba56de714888080ce65de682d9`, em Ubuntu 24.04, Node.js
22.23.2 e MySQL 8.4.8, expôs `HTTP 500 / INTERNAL_ERROR` no requestId
`12030b9b-007f-49f2-bde8-e0610704acea` enquanto o run intencionalmente falhava em
`PULL_REQUESTS`. O estado `FAILED` era esperado; o endpoint de status deveria continuar sendo uma
leitura HTTP 200.

A causa estrutural estava no caminho write-first do polling. Cada
`GET /api/projects/:projectId/github/sync/status` executava primeiro um `updateMany` de stale
recovery por projeto, mesmo quando o run tinha liveness recente. Esse update disputava a mesma
linha e os mesmos índices alterados por `GitHubSyncRun.fail()` durante a transição terminal. O
error handler converteu a rejeição não operacional no fallback seguro `INTERNAL_ERROR`. O log
daquela execução não preservou a classe/código de baixo nível; por isso este relatório não atribui
sem evidência o erro a `P2034`, deadlock ou lock wait específico.

A consulta passou a ser read-first:

- lê o run ativo e retorna imediatamente quando o heartbeat é recente, sem executar escrita;
- usa `heartbeatAt` como liveness do worker e `updatedAt` apenas como fallback para o estado
  `QUEUED`, que ainda não possui heartbeat;
- quando o run está realmente stale, expira atomicamente somente o `run.id` observado, desde que
  status, projeto, vínculo ativo e cutoff continuem válidos;
- se o worker concluir entre a leitura e a expiração condicional, relê o estado em vez de impor um
  terminal concorrente;
- preserva `GITHUB_SYNC_STALE`, `activeProjectId @unique`, coalescing e o mesmo `run.id`.

O ambiente local não era equivalente ao CI: Node.js 22.23.2 e MySQL 9.7.1 com
`REPEATABLE-READ`; Docker/MySQL 8.4.8 não estavam disponíveis. Antes da correção, o cenário alvo
passou 50/50, o E9 10/10 e integração/API 3/3 localmente, portanto o erro de baixo nível não foi
reproduzido fora do CI. A race controlada também passou 30/30, confirmando a diferença ambiental,
mas demonstrou a janela funcional em que a integração já estava em `FALHA` e o run ainda em
`RUNNING`.

Depois da correção:

- cenário alvo: 50/50, zero HTTP 500;
- E9 definitivo: 10/10 execuções do arquivo, com 10 testes por execução;
- integração/API: 3/3 execuções, 169/169 testes por execução e 5 skips condicionais;
- backend total e coverage: 431/431, 5 skips; 88,85% statements, 75,70% branches, 92,86%
  functions e 91,42% lines;
- polling controlado: HTTP 200 em `RUNNING`, durante a transição e em `FAILED`; oito consultas
  simultâneas observaram o mesmo run e não acionaram stale update;
- heartbeat recente não expirou mesmo com `updatedAt` antigo; heartbeat antigo expirou com
  `GITHUB_SYNC_STALE` mesmo com `updatedAt` recente;
- papéis/isolamento e coalescing do CR-FIX-03 permaneceram verdes;
- lint, format, architecture, secrets, npm audit, Prisma e validadores de migration passaram; 40
  migrations continuam aplicadas e nenhuma migration foi criada.

Houve duas respostas locais esporádicas com payload externo
`authentication_error / Invalid authentication` durante baterias de coverage/E9; esse contrato
não existe no TRACEFLOW e não corresponde ao `INTERNAL_ERROR` investigado. As repetições focadas,
o E9 final 10/10, o backend total e o coverage consolidado subsequentes passaram. O CR-FIX-04 está
concluído localmente, mas permanece **AGUARDANDO CI** em MySQL 8.4.8; nenhum PASS remoto novo é
inferido destes resultados locais.

## Resultados automatizados

| Gate | Resultado |
| --- | --- |
| Backend unit | PASS — 262/262 |
| Backend integration/API | PASS — 169/169; 5 skips condicionais |
| Backend total | PASS — 431/431; 5 skips condicionais |
| Backend coverage | PASS — 88,85% statements; 75,70% branches; 92,86% functions; 91,42% lines |
| Frontend | PASS — 252/252 |
| Frontend coverage | PASS — 63,38% statements; 61,02% branches; 54,76% functions; 64,76% lines |
| Frontend build | PASS |
| Lint/format/architecture | PASS |
| Secret scan | PASS — nenhum segredo encontrado |
| npm audit backend/frontend | PASS — 0 vulnerabilidades |
| Prisma format/validate/generate/status | PASS — 40 migrations aplicadas |
| Cadeia vazia | PASS |
| Upgrade LR.8 representativo → LR.9 | PASS |
| Recovery LR.2/LR.2.1 e migration LR.5 | PASS |
| Auditoria física/schema | PASS — `SCHEMA_CONSISTENT`, zero órfãos |
| Política CI | PASS — inclui o upgrade LR.9 obrigatório |

## Homologação manual

### Conta local sem OAuth

**BLOCKED EXTERNO.** Backend e frontend locais iniciaram, porém a descoberta do ambiente retornou
zero navegadores conectados. Assim, não houve interação real com GitHub, callback público, criação
de projeto ou sync e nenhum desses passos foi convertido em PASS por inferência.

### Conta com OAuth e unlink

**BLOCKED EXTERNO** pela mesma ausência de navegador/conta descartável. Os cenários possuem
cobertura automatizada, mas isso não substitui a validação real.

## Configuração externa esperada

- **Request user authorization (OAuth) during installation:** habilitado;
- callback da App: `GITHUB_APP_CALLBACK_URL` em `/api/github-app/callback`;
- Setup URL: não usada nesse modo;
- callback de login: `GITHUB_LOGIN_CALLBACK_URL` em `/api/auth/github/callback`;
- webhook: `/api/webhooks/github-app` com secret HMAC;
- permissões: Metadata, Contents, Pull requests e Issues somente leitura;
- repository selection: definida no GitHub pelo instalador.

A configuração autenticada real da App e o alcance do callback público não foram confirmados sem
navegador. A distinção entre Setup URL e callback segue a documentação oficial do GitHub registrada
no ADR-012 e no runbook.

## Pendência para conclusão

Disponibilizar navegador com sessão GitHub descartável e callback público ativo, então executar os
três fluxos manuais obrigatórios: conta local sem identity, conta com OAuth e unlink seguido de
sync. Somente após PASS real do fluxo conta local → App → projeto → sync a entrega pode ser marcada
`LR.9 CONCLUÍDA — PRONTA PARA NOVO QA FINAL`.
