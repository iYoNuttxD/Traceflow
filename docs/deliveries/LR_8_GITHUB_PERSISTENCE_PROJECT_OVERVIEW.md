# LR.8 — Persistência da autorização GitHub e Project Overview

## Baseline

| Campo | Valor |
| --- | --- |
| Data | 23/08/2026 |
| Branch | `daniel-dev` |
| SHA inicial | `8c72f10b8318c0b32fd0b176e4cb20e7718d91ff` |
| Working tree inicial | limpa |
| Runtime dos gates | Node.js `v22.23.2` |
| Migrations | 39; nenhuma migration criada ou alterada |

Nenhum commit, push, merge, rebase, reset, stash, branch, comentário/alteração de PR ou artefato
acadêmico/TCC foi criado ou modificado nesta entrega.

## GitHub Repository Authorization Persistence

### Causa raiz

A evidência já era persistida por `userId`, Installation e repositório e não dependia de
`sessionId`. O OAuth dedicado valida a sessão apenas durante state/callback; depois do callback,
`GitHubInstallationAuthorization` e `GitHubRepositoryAuthorization` permanecem vinculadas ao
`User` cuja `GitHubIdentity` foi confirmada. Logout revoga a `Session`, mas não remove essas
evidências, e uma nova sessão consulta os mesmos registros por `userId`.

A regressão observada era temporal: `GITHUB_REPOSITORY_AUTHORIZATION_TTL_MS` tinha default e valor
local de `900000 ms` (15 minutos), com máximo de uma hora. Assim, uma autorização válida expirava
durante o uso cotidiano e o login posterior apenas tornava visível uma expiração que já havia
ocorrido. O TTL curto não era tecnicamente compartilhado com o OAuth state, mas tinha a mesma
ordem de grandeza inadequada para uma evidência pessoal persistente.

### Diagnóstico consolidado

| Pergunta | Evidência encontrada |
| --- | --- |
| vínculo estável | `GitHubRepositoryAuthorization.userId` e `GitHubInstallationAuthorization.userId`; identidade confirmada por `GitHubIdentity.githubUserId` no callback |
| dependência de sessão | inexistente na descoberta; `sessionId` existe somente no state OAuth/conexão e na sessão autenticada |
| logout/login | revoga/cria `Session`, sem apagar autorização de repositório |
| TTL anterior | 15 minutos (`900000 ms`) |
| criação de `expiresAt` | callbacks de instalação e de `REPOSITORY_AUTHORIZATION` somavam o TTL específico ao instante verificado |
| substituição | transação atualiza timestamps, remove o snapshot anterior da Installation/usuário e cria somente OWNER/ADMIN atuais |
| zero OWNER/ADMIN | timestamps válidos + zero linhas de repositório resultam em `AUTHORIZED` com lista vazia |
| ausência/expiração | resulta em `REAUTH_REQUIRED` antes de consultar repositories pela Installation |
| acesso técnico ausente | a interseção ao vivo com a Installation não lista nem conecta o repositório |

`GET /github/app/repositories` continua agregando somente installations `ACTIVE` autorizadas ao
usuário e exige evidência válida para todas elas. Uma ausência parcial torna a descoberta agregada
`REAUTH_REQUIRED` de forma fail-closed, em vez de produzir uma lista parcial ambígua. Esse
comportamento conservador pode exigir renovação quando há múltiplas installations, mas não foi a
causa do caso reproduzido e não foi relaxado. O fluxo dedicado renova o snapshot das installations
acessíveis à identidade confirmada; uma Installation estranha/inacessível continua bloqueando a
renovação, sem inferência pelo Installation Token.

### Nova política

`GITHUB_REPOSITORY_AUTHORIZATION_TTL_MS` passou a ter finalidade e validação próprias:

```text
default: 604800000 ms (7 dias)
mínimo:  86400000 ms  (24 horas)
máximo:  2592000000 ms (30 dias)
```

O valor foi documentado no `.env.example`, validado pelo parser e aplicado ao ambiente local de
QA sem alterar segredos. OAuth state e PKCE continuam com validade curta de minutos; sessões
continuam com seus próprios TTLs. Evidências já expiradas não recebem extensão artificial: o
usuário realiza uma renovação legítima uma vez e os novos timestamps passam a seguir sete dias.

A renovação continua usando User Access Token somente em memória. Ela confirma a identidade,
consulta instalações e permissões pessoais, substitui atomicamente o snapshot anterior e cria um
novo `expiresAt`. Perda de OWNER/ADMIN na renovação remove a autorização antiga, mas preserva a
verificação válida com zero repositórios. Installation Token permanece exclusivo da validação
técnica, conexão e sincronização; o sync de projetos existentes não passou a depender de User
Access Token.

Criação, conexão e reconexão continuam revalidando no backend:

```text
evidência pessoal OWNER/ADMIN válida
+
Installation ACTIVE com acesso técnico atual
```

Troca de repositório permanece `409 GITHUB_REPOSITORY_SWAP_FORBIDDEN`.

## Project Overview

A composição anterior fragmentava status, GitHub, sincronizações, membros, equipe, código e datas
em até dez cards internos. A LR.8 preservou todas as informações e reduziu a visão principal para
quatro blocos:

| Bloco final | Informação consolidada |
| --- | --- |
| `PROJETO` | status e área/equipe responsável |
| `GITHUB` | status, repositório, último sucesso e falha posterior quando aplicável |
| `EQUIPE` | quantidade de membros ativos |
| `ACESSO AO PROJETO` | código, mostrar/ocultar, copiar, regenerar e perfil de entrada, somente OWNER |

`createdAt` e `updatedAt` passaram para metadata secundária abaixo do grid. O card GitHub não cria
campos vazios quando não há integração. Quando a última tentativa falha após um sucesso, mostra
`Sincronizado anteriormente`, o último sucesso e a tentativa falha no mesmo contexto, sem expor
`lastSyncError` técnico.

O grid usa 12 colunas no desktop (`3/6/3` e acesso alinhado na largura seguinte), duas colunas no
tablet e uma coluna no mobile. Todos os blocos reutilizam borda, radius, padding, título e altura
base. Código longo mantém `min-width: 0`, overflow oculto e ellipsis; no mobile, valor, botões e
select quebram para uma coluna sem ampliar o viewport. Os botões icon-only mantêm nome acessível,
o select mantém label e os status reutilizam os badges existentes.

Não OWNER não recebe o contrato sensível de access code, não dispara a API e não renderiza o card
administrativo. Sidebar, header global, login, Settings, Kanban, Traceability, cores e identidade
visual não foram alterados.

## Testes e gates

Todos os resultados finais abaixo usaram Node.js `v22.23.2`.

| Gate | Resultado real |
| --- | --- |
| testes focados backend | `PASS`; 4 arquivos, 68 testes |
| regressão API GitHub | `PASS`; 11 testes; nova Session preserva `AUTHORIZED`, renovação remove OWNER perdido |
| testes focados frontend | `PASS`; Project Overview 15 testes e Projects 15 testes |
| backend lint / format / architecture | `PASS` |
| backend unit | `PASS`; 37 arquivos, 254 testes |
| backend integração/API | `PASS`; 14 arquivos/165 testes; 2 arquivos/5 testes históricos `N/A` |
| backend integral | `PASS`; 51 arquivos/419 testes; 2 arquivos/5 testes históricos `N/A` |
| backend coverage | `PASS`; 88,78% statements, 75,50% branches, 92,70% functions, 91,28% lines |
| backend secret scan | `PASS`; 312 arquivos |
| frontend lint / format | `PASS` |
| frontend integral | `PASS`; 34 arquivos, 245 testes |
| frontend coverage | `PASS`; 63,33% statements, 60,94% branches, 54,88% functions, 64,74% lines |
| frontend build | `PASS`; 382 módulos transformados |
| Prisma format / validate / generate / status | `PASS`; 39 migrations, schema atualizado |
| npm audit backend/frontend | `PASS`; zero vulnerabilidades |

O percentual de 60,94% de branches acima preserva o snapshot da execução original da LR.8. Na
repetição do QA final, a mesma baseline funcional produziu 60,91%; a diferença de 0,03 p.p. não
alterou nenhum gate.

A execução sandboxed inicial dos testes HTTP/backend não pôde abrir sockets locais (`EPERM`) e o
Prisma não alcançou o MySQL. As mesmas rodadas, autorizadas para sockets/MySQL locais, passaram.
A primeira cobertura backend reproduziu o `401` transitório já conhecido no cadastro do teste E9;
o arquivo passou `6/6` isolado e a cobertura integral repetida passou `419/419`, sem mudança ou
relaxamento de teste.

## Homologação visual

| Cenário | Estado | Evidência |
| --- | --- | --- |
| Project Overview desktop | `BLOCKED EXTERNO` | runtime Browser sem navegador disponível (`[]`) |
| Project Overview tablet | `BLOCKED EXTERNO` | runtime Browser sem navegador disponível (`[]`) |
| Project Overview mobile | `BLOCKED EXTERNO` | runtime Browser sem navegador disponível (`[]`) |
| OAuth real `AUTHORIZED`/`REAUTH_REQUIRED` | `BLOCKED EXTERNO` | exige navegador e conta/Installation GitHub descartável |

Testes DOM, inspeção CSS e build não foram convertidos em homologação visual. O QA final deve
renovar uma vez a evidência antiga expirada, confirmar que um novo login dentro dos sete dias não
mostra o CTA e inspecionar os três viewports.

## Resultado

**LR.8 CONCLUÍDA — PRONTO PARA QA FINAL.**
