# LR.3.1 — GitHub Repository Authorization Migration Flow

## Baseline

- Branch: `daniel-dev`.
- SHA inicial: `5baef10e5af98be4be1a9be9a07868aaea5151ce`.
- Working tree inicial: limpa.
- Migrations iniciais: 38.
- Runtime dos gates: Node.js `22.23.2`.
- Nenhuma migration histórica, documento oficial do TCC, commit, push, merge, rebase, reset,
  stash, comentário ou alteração da PR foi realizado.

## Causa raiz

A LR.3 mudou corretamente a seleção de repositórios para exigir duas autoridades independentes:
permissão pessoal GitHub `OWNER`/`ADMIN` e acesso técnico da GitHub App Installation. A migration
não fez backfill de `GitHubRepositoryAuthorization`, porque a Installation não prova a autoridade
individual do usuário.

Contas autorizadas antes da LR.3 continuaram com Installation `ACTIVE` e projetos conectados,
mas sem evidência pessoal. Como somente as linhas de repositório representavam a verificação, o
backend não conseguia diferenciar “autorização válida com zero repositórios” de “permissões nunca
verificadas ou expiradas” e retornava uma lista vazia silenciosa.

## Decisões preservadas

```text
Installation não é autoridade pessoal.
User Authorization é necessária para descoberta e conexão.
Não existe backfill por Installation.
User Access Token permanece efêmero.
Installation Token permanece exclusivo do acesso técnico e sync.
```

O purpose OAuth `REPOSITORY_AUTHORIZATION` é separado de login e de reautenticação para ações
sensíveis. O fluxo exige sessão `ACTIVE`, CSRF, identidade vinculada, PKCE, state expirável de uso
único e correspondência do GitHub user ID. O token pessoal existe apenas durante o callback, para
consultar as instalações do usuário e suas permissões `OWNER`/`ADMIN`; somente IDs, nome completo,
permissão e timestamps minimizados são persistidos.

## Correção

| Item | Antes | Depois |
| --- | --- | --- |
| autorização ausente | `repositories: []` ambíguo | `repositories: []`, `authorizationStatus: REAUTH_REQUIRED` |
| autorização válida sem repos | indistinguível da ausência | `repositories: []`, `authorizationStatus: AUTHORIZED` |
| evidência expirada | lista vazia | `REAUTH_REQUIRED`, sem consultar a Installation para descoberta |
| token pessoal | temporário | temporário; nunca persistido, logado ou retornado |
| sync | Installation | Installation; fluxo não alterado |
| descoberta | User Authorization | User Authorization renovável por OAuth dedicado |
| criação/conexão | filtro de linhas de repo | revalidação da evidência e da Installation; ausência/expiração retorna `409 GITHUB_USER_REAUTH_REQUIRED` |

A evidência de verificação foi adicionada a `GitHubInstallationAuthorization` por meio de
`repositoryAuthorizationVerifiedAt` e `repositoryAuthorizationExpiresAt`. Esses campos permitem
registrar uma consulta pessoal válida mesmo quando o resultado OWNER/ADMIN é vazio. Registros
anteriores permanecem `NULL` de forma intencional e exigem renovação; nenhum dado foi inferido.

O frontend de Projetos e de Configurações deixou de exibir “0 repositórios acessíveis” nesse
estado. Ele apresenta a explicação de renovação, desabilita a seleção e oferece a ação
“Renovar acesso GitHub”. Após o callback, a descoberta é refeita. O backend continua sendo a
autoridade mesmo se `repositoryId` ou `installationId` forem manipulados.

## Persistência e migration

A migration incremental
`20260821180000_lr3_1_github_repository_authorization_migration`:

- adiciona `REPOSITORY_AUTHORIZATION` ao enum de `GitHubOAuthState.purpose`;
- adiciona dois timestamps nullable a `GitHubInstallationAuthorization`;
- não contém `UPDATE`, backfill, `DELETE`, `DROP` ou transformação de dados;
- preserva todas as 38 migrations anteriores e eleva a cadeia para 39;
- foi aplicada com `prisma migrate deploy` no banco de desenvolvimento, sem reset;
- foi aplicada com sucesso pela cadeia completa em banco temporário vazio.

## Findings corrigidos

| ID | Problema | Correção | Teste |
| --- | --- | --- | --- |
| LR3.1-01 | ausência de evidência pré-LR.3 virava falso zero | estado agregado `REAUTH_REQUIRED`, avaliado antes de qualquer chamada com Installation token | unitário cobre instalação ACTIVE sem evidência e confirma zero chamada externa |
| LR3.1-02 | zero repos não representava uma verificação válida | timestamps no vínculo usuário–installation independem da quantidade de linhas de repo | repository unitário persiste verificação com array vazio; service retorna `AUTHORIZED` |
| LR3.1-03 | não havia renovação pessoal após a migração | OAuth dedicado consulta identidade, instalações e repos com user token efêmero e substitui evidências atomicamente | API com banco parte de usuário legado, conclui callback e grava OWNER minimizado |
| LR3.1-04 | expiração era apresentada como vazio | expiração retorna `REAUTH_REQUIRED` e CTA explícito | service e páginas de Projetos/Configurações |
| LR3.1-05 | IDs manipulados poderiam tentar conexão direta | `resolveAuthorizedRepository` bloqueia antes da Installation com `409 GITHUB_USER_REAUTH_REQUIRED` | teste de conexão confirma ausência de chamada externa/persistência |
| LR3.1-06 | renovação poderia misturar identidades/instalações | GitHub ID deve coincidir e todas as instalações renovadas devem pertencer ao user token atual | mismatch/inacessível rejeitado; nenhuma evidência é substituída |
| LR3.1-07 | regressão poderia trocar o token técnico do sync | serviços e cliente de sync não foram modificados | suíte integral `githubSync` permanece verde |

## Testes e gates

Todas as rodadas finais usaram Node.js `22.23.2`.

| Gate | Resultado real |
| --- | --- |
| testes focados backend | `PASS`; 5 arquivos, 67 testes |
| teste API OAuth/migration | `PASS`; 1 arquivo, 11 testes |
| testes focados frontend | `PASS`; 2 arquivos, 36 testes |
| backend lint / format / architecture | `PASS` |
| backend unit | `PASS`; 37 arquivos, 253 testes |
| backend integration/API | `PASS`; 14 arquivos, 165 testes; 2 arquivos/5 testes históricos `N/A` |
| backend integral | `PASS`; 51 arquivos, 418 testes; 2 arquivos/5 testes históricos `N/A` |
| backend coverage | `PASS`; 88,76% statements, 75,46% branches, 92,61% functions, 91,25% lines |
| frontend lint / format | `PASS` |
| frontend integral e coverage | `PASS`; 34 arquivos, 241 testes |
| frontend build | `PASS`; 382 módulos |
| Prisma format / validate / generate / status | `PASS`; 39 migrations aplicadas |
| cadeia de migrations em banco vazio | `PASS`; zero registros residuais |
| backend secret scan | `PASS`; 312 arquivos |
| npm audit backend/frontend | `PASS`; 0 vulnerabilidades |
| `git diff --check` | `PASS` |

A primeira rodada de coverage backend teve um `401` transitório no teste existente de logout e
CSRF. O arquivo passou 28/28 isoladamente e a repetição integral de coverage passou 418/418 sem
alterar ou relaxar o teste.

## Pendências externas

| Evidência | Estado | Motivo |
| --- | --- | --- |
| renovação OAuth em conta GitHub descartável anterior à LR.3 | `BLOCKED` | exige conta/Installation externa descartável; a conta real principal não foi alterada |
| confirmação visual do redirect e retorno em navegador real | `BLOCKED` | depende do OAuth externo acima |

Nenhuma pendência externa foi convertida em `PASS`. A prova automatizada utiliza usuário,
Installation, repositório e token exclusivamente artificiais.

## Resultado

**LR.3.1 CONCLUÍDA — PRONTO PARA LR.6**
