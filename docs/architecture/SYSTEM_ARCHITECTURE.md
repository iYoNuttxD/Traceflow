# Arquitetura vigente do TRACEFLOW

## Escopo

Este documento descreve a arquitetura executável vigente. `TRACEFLOW_CONTEXTO_ARQUITETURA.md`
continua sendo fonte de requisitos e diretrizes evolutivas; em caso de divergência sobre o estado
executável, prevalecem código, migrations, testes, este documento e os ADRs vigentes.

## Visão geral

```text
Navegador
  ↓ HTTPS/reverse proxy
React/Vite SPA
  ├→ REST: cookie HttpOnly + CSRF nas mutations + JSON
  └→ SSE: cookie HttpOnly + stream por projeto visível
Express API
  ├→ REST: Route → Controller → Service → Repository → Prisma → MySQL
  │                             ├→ GitHub App factory/Octokit → api.github.com
  │                             └→ email provider → SMTP/capture controlado
  └→ SSE: Route → Controller → Service → Project Event Publisher in-memory
```

O backend é a autoridade para identidade, autorização, validação, domínio e persistência. O frontend coordena interação e estado de interface, sem reproduzir fórmulas de domínio.

## Frontend

A direção permitida é `app/routes → pages → features → shared + http-client`.

- `AppRoutes` aplica lazy loading, `ProtectedRoute`, shell autenticado e fallback acessível.
- Pages adaptam parâmetros e compõem features.
- APIs de feature usam exclusivamente `api/http-client.js`.
- Hooks e screens controlam requests canceláveis, mutações e rollback visual.
- Shared não importa pages/features; features não importam internals umas das outras.
- `TraceabilityFlow` renderiza o DTO de nodes/edges sem recalcular cobertura.
- `app/theme` separa a preferência persistida `system | light | dark` do tema resolvido
  `light | dark`. Sistema é o default, acompanha `prefers-color-scheme` enquanto selecionado e usa
  Light quando `matchMedia` não está disponível; overrides manuais ignoram mudanças do sistema.
- `app/layout` concentra sidebar responsiva, drawer acessível, navegação, identidade e logout. Rotas
  públicas e contas restritas permanecem fora do shell autenticado.
- A sidebar e a tela Projects compartilham o catálogo autorizado de `GET /projects`. IDs fixados e
  recentes são preferências locais filtradas pelo catálogo e nunca concedem acesso.
- Projects reúne projetos, convites pendentes e a entrada progressiva dos fluxos existentes em um
  grid responsivo. A visão geral de `/projects/:projectId` integra os resumos de Projeto, GitHub e
  Equipe; edição e administração de membros/acesso usam, respectivamente,
  `/projects/:projectId/edit` e `/projects/:projectId/members`, sempre sob autorização do backend.
- `ProjectEventsProvider` mantém uma conexão SSE compartilhada por projeto ativo enquanto a aba está
  visível. O consumer atual é exclusivamente Comments; Kanban não consome eventos e não executa
  polling periódico.
- CSS convencional acompanha o owner em `pages`, `features` e `shared`. Componentes e screens
  importam a folha colocada ao lado do JSX; grupos em `shared/styles` ou `features/*/styles` existem
  somente quando há múltiplos consumidores reais. Media queries permanecem com o mesmo owner do
  seletor. `frontend/src/styles/tokens.css` contém tokens semânticos Light/Dark, `base.css` concentra
  reset e elementos base e `global.css` mantém apenas primitives transversais; estilos específicos
  de feature não entram nessa pasta.

## Backend

| Camada          | Responsabilidade                                | Não pode                        |
| --------------- | ----------------------------------------------- | ------------------------------- |
| Route           | método, caminho, auth/CSRF/RBAC e schema HTTP   | regra, Prisma, client externo   |
| Controller      | adaptar HTTP e contexto autenticado             | repository, Prisma, regra       |
| Service         | caso de uso, invariantes, transação e auditoria | `req`/`res`, DOM                |
| Repository      | consulta/mutação orientada ao domínio           | autorização ou mensagem HTTP    |
| External client | timeout, retry, paginação e DTO externo         | persistência ou regra TRACEFLOW |

O stream de eventos preserva a mesma direção `Route → Controller → Service`. Services de domínio
publicam pelo `ProjectEventPublisher` depois do commit e não conhecem HTTP, `Response` ou conexões.
MySQL/REST são autoridade; SSE apenas propaga DTOs de mudanças confirmadas.

`scripts/check-architecture.js` verifica essas fronteiras e impede a reintrodução, no runtime/schema atual, de `TaskPullRequest`, `GithubArtifact`, `TraceLink`, `ProjectMember`, `Commit.branch`, aliases GitHub de `Project` e rotas de conta removidas.

## Identidade, sessão e autorização

- `User` é identidade; senha usa Argon2id.
- `Session` guarda hash do token opaco e do CSRF; o browser recebe cookie HttpOnly.
- `ProjectMembership` define OWNER, MANAGER, MEMBER e VIEWER.
- A API resolve recursos filhos para o projeto antes de autorizar.
- Ausência de membership usa `404`; papel insuficiente usa `403`.
- Ator de movimento e auditoria vem de `req.auth.user`.
- Responsável por Task é `responsibleUserId` com membership ativa.

`Task.responsible` e `TaskMovement.movedBy` são snapshots históricos anteriores à identidade e nunca prova de identidade. `TaskMovement` não mantém referência a `ProjectMember`.

## Modelo canônico e rastreabilidade

```text
Requirement 0..N ← Task.requirementId
Task 0..1 → PullRequest via Task.pullRequestId
Task N..N Commit via TaskCommit
Task N..N Issue via TaskIssue
TaskCommitSuggestion → revisão humana → TaskCommit
```

`TaskMovement` registra movimentações; `TaskHistoryEntry` registra STATUS, DEADLINE, RESPONSIBLE e PRIORITY; `AuditEvent` é a trilha transversal. O grafo canônico possui perspectivas de requisito, tarefa e artefato tipado.

## GitHub

`github-credential.provider.js` lê somente segredos da GitHub App, assina JWT e cria tokens temporários. `github.client.js` é uma factory por instalação; não existe singleton nem fallback para credencial sistêmica. O state do callback da App é hashado, ligado ao usuário/sessão/intenção e separado do state OAuth de autenticação. Quando a autorização de usuário durante a instalação está habilitada, o user access token permanece somente em memória: pagina `GET /user/installations` para provar o `installation_id` devolvido pelo GitHub. O callback também consulta a Installation com JWT da App e faz uma única chamada mínima com Installation Token para validar acesso técnico, aceitando escopo vazio; somente os endpoints de descoberta percorrem todas as páginas de repositórios. Nenhum token é persistido, registrado ou retornado.

GitHub OAuth pertence ao módulo Auth e cria `GitHubIdentity` somente para cadastro, login, vínculo e reautenticação sensível. A GitHub App pertence ao módulo GitHub e é a autoridade de repositórios e artefatos. `GitHubIdentity` não é requisito para instalar a App, descobrir repositórios, criar/reconectar projeto ou sincronizar. `GitHubInstallationAuthorization` registra apenas qual conta TraceFlow conectou a Installation. Listagem e conexão consultam ao vivo os repositórios concedidos à Installation; não existe snapshot pessoal, TTL ou renovação OAuth de repositório.

Uma `GitHubInstallation` pode alimentar várias `ProjectGitHubIntegration`. Cada integração aponta para um projeto e um repositório únicos; `installationId` é apenas FK/index, nunca unique. Reconectar o mesmo repositório revalida a conexão; trocar para outro repositório retorna `409 GITHUB_REPOSITORY_SWAP_FORBIDDEN`, preservando artifacts e histórico. O lifecycle da instalação é `PENDING`, `ACTIVE`, `SUSPENDED` ou `REMOVED`; somente `ACTIVE` seleciona e sincroniza. Callback não reativa `SUSPENDED`/`REMOVED`.

Sync pagina coleções, persiste por identificador externo e usa `GitHubSyncRun.activeProjectId` para
exclusão mútua no banco, com stale detection. Webhook público usa raw body, HMAC e delivery ID, sem
sessão/CSRF. Delivery possui claim `PROCESSING`, estado terminal e retry de `FAILED` ou processamento
stale; duplicatas concorrentes não reexecutam o evento. Não há fetch genérico de URL fornecida pelo
cliente.

Projetos que ainda possuam metadados anteriores à integração canônica mantêm artifacts e metadados
em uma integração `RECONNECT_REQUIRED`. `ProjectGitHubIntegration` é a única fonte operacional da
conexão e concentra identidade do repositório, configuração e estado de sincronização; `Project`
não mantém aliases concorrentes.

## Assíncronos e concorrência

Jobs persistidos possuem ID correlacionável. Em novas operações assíncronas ou na evolução de um
polling existente, a consulta deve acompanhar aquele ID quando execuções puderem se confundir, em
vez de selecionar `latest` por conveniência. Coalescing, exclusão mútua, retry e recuperação de stale
possuem contrato explícito e testes determinísticos. `FAILED` é um estado de domínio representado no
DTO do job; a consulta de status continua usando o contrato HTTP adequado a uma leitura bem-sucedida.

Comentários usam REST para carga inicial, histórico cursor e reconciliação, e SSE para
`task.comment.created`, `task.comment.updated` e `task.comment.deleted`. Existe uma conexão por
projeto e aba visível, com reconexão nativa do `EventSource`; ao reabrir, Comments reconcilia uma vez
a janela recente. Eventos são mesclados localmente por ID e versão sem GET adicional. O publisher
in-memory é válido para uma instância Node, usa heartbeat compartilhado de 25 segundos, encerra em
backpressure, limpa subscribers desconectados e limita cada stream a 15 minutos para reautorizar na
reconexão. Escala multi-node exige futuro adapter de broker; não há event log ou replay persistente.

## Segurança e privacidade

A API usa validação Zod, limite de body, Helmet, CORS allowlist, rate limiting, erros seguros, request ID, logging estruturado e redaction. Direitos técnicos do titular usam `/api/settings/*`; `/api/account/reactivation/*` permanece como fluxo específico. Direitos incluem consulta, correção, sessões, exportação, desativação e solicitação de exclusão. Conteúdo colaborativo entra na exportação somente com `ProjectMembership.isActive=true`; relação histórica não concede acesso atual.

Operações sensíveis aceitam senha local ou, para conta GitHub-only, reautenticação GitHub recente vinculada à mesma sessão e identidade. O user access token é efêmero. A anonimização transacional remove credenciais, states, autorizações pessoais GitHub e PII dispensável; preserva IDs e rastreabilidade pseudonimizados. Um tombstone sem FK e sem GitHub ID bruto guarda apenas fingerprint HMAC para negar login/reassociação automática da identidade anonimizada. A chave `PRIVACY_PSEUDONYMIZATION_KEY` é configuração protegida, estável e obrigatória em produção.

No vencimento de `DELETION_PENDING`, o worker revalida ownership dentro da mesma transação. Último OWNER não é removido nem anonimizado: a solicitação termina `REJECTED`, a conta volta `ACTIVE`, sessões são revogadas e eventos mínimos registram tentativa, impedimento e retorno. Auditoria e histórico têm finalidades e retenções diferentes.

ASVS é referência, não certificação. LGPD depende de decisões jurídicas e operacionais externas sobre base legal, controlador, backups, logs e fornecedores.

## Banco e migrations

Prisma é acessado somente por repositories e scripts de manutenção autorizados. Migrations
versionadas são imutáveis e devem aplicar do zero. Mudança destrutiva exige inventário,
reconciliação, backup, guard e roll-forward. Scripts de recovery ligados a schemas históricos
exigem o checkout/schema correspondente e não pertencem ao runtime.

## CI e operação

GitHub Actions executa Quality, Backend Tests, Frontend Tests, Supply Chain e Dependency Review.
Backend usa MySQL descartável e migrations do zero. Coverage, ESLint, Prettier,
`architecture:check`, secret scan, audit policy e build são gates.

Validações locais sensíveis a banco, migrations ou concorrência reproduzem, quando possível, a mesma
versão/configuração MySQL declarada no workflow ou um ambiente containerizado equivalente. Uma
execução só é chamada de `CI-equivalent` quando Node, banco e ordem dos gates relevantes também são
equivalentes. A CI de pull request pode testar um merge ref sintético; diagnósticos distinguem esse
resultado do commit isolado da branch.

TLS termina no proxy. Os contadores de rate limit HTTP ainda usam memória local; a exclusão mútua do sync usa claim persistido em `GitHubSyncRun`, unique por projeto e stale detection, portanto não depende de lock em memória. Logs, backup, restore, secret manager, monitoramento e proteção de branch precisam ser configurados no ambiente conforme os runbooks.
