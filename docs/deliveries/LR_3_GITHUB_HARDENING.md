# LR.3 — GitHub App, autorização de repositórios e sync hardening

## Baseline

- Branch: `daniel-dev`.
- SHA inicial: `8002fe7452f955102ff1d14a1e8bde9e66b7310c`.
- Working tree inicial: limpa.
- Node dos gates finais: `22.23.2`; npm `11.19.0`.
- Escopo: GitHub App, autorização de repositórios, lifecycle de instalação, webhook, rate
  limit, DTOs e sincronização.
- Nenhum commit, push, merge, rebase, reset, stash, comentário ou alteração da PR foi realizado.
- Nenhuma migration histórica ou documento oficial do TCC foi alterado.

O caminho solicitado `docs/deliveries/L1_2_GITHUB_SYNC_ROBUSTNESS.md` não existe neste checkout.
A baseline equivalente foi revisada nos documentos existentes
`L1_2_HOMOLOGATION_FIXES.md` e `L1_2_1_GITHUB_SYNC_ROBUSTNESS.md`, além das demais fontes
obrigatórias.

## Decisões implementadas

```text
Repository selection: usuário GitHub autorizado como OWNER ou ADMIN
GitHub App: autoridade técnica de sincronização
User token: temporário, não persistido, não logado e não retornado
Repository swap: não permitido; mesma repo pode ser reconectada
```

O callback confirma state, sessão, conta `ACTIVE`, `GitHubIdentity`, usuário GitHub e Installation.
O token pessoal é usado apenas em memória para consultar a interseção oficial
`/user/installations/{installation_id}/repositories`. Somente `OWNER` ou `ADMIN` produz uma
`GitHubRepositoryAuthorization` curta. A listagem e a conexão ainda validam ao vivo o acesso
técnico da App com installation token; portanto, nenhuma das duas autoridades substitui a outra.

## Findings corrigidos

| ID | Problema | Correção | Teste |
| --- | --- | --- | --- |
| LR3-01 | Installation listava tudo que a App alcançava e ampliava a seleção do usuário | evidência usuário→repo expirada, identidade conferida e filtro exclusivo `OWNER`/`ADMIN`, cruzado com acesso técnico ao vivo | owner pessoal, admin de organização, WRITE/READ negados e App-sem-usuário negado em `github-boundary`/`github-app.service` |
| LR3-02 | upsert da integração permitia trocar repo X por repo Y | preflight no service e comparação transacional no repository; `409 GITHUB_REPOSITORY_SWAP_FORBIDDEN` | mesma repo reconecta; repo diferente rejeita; integração, commit e histórico permanecem |
| LR3-03 | lifecycle possuía `DELETED` e callbacks/webhooks podiam reativar implicitamente | estados canônicos `PENDING/ACTIVE/SUSPENDED/REMOVED`; metadata não muda status; callback bloqueia `SUSPENDED/REMOVED`; suspensão/remoção expira evidências e exige reconexão | `PENDING→ACTIVE`, callback bloqueado, sync ACTIVE, bloqueio SUSPENDED/REMOVED e artifacts preservados |
| LR3-04 | delivery criado antes do processamento tornava uma falha interna permanentemente “duplicada” | claim `PROCESSING`, contador/timestamp, `FAILED` retomável, reclaim de stale, conclusão terminal e erro limitado a etapa/código seguro | HMAC inválido, válido, duplicata concorrente, falha, retry do mesmo delivery e stale claim |
| LR3-05 | todo `403` era não-retry, enquanto a normalização reconhecia somente quota zero | classificação separa permissão de primary/secondary rate limit; retry limitado respeita `Retry-After`/`X-RateLimit-Reset`, máximo e fallback exponencial | `403` permissão sem retry, `403` rate limit com retry, `429` e fallback sem headers |
| LR3-06 | DTO de repo não expressava a autoridade do usuário | retorno minimizado adiciona somente `userPermission`; token, secret, payload Octokit e projeto invisível não saem | testes de mapper/listagem, isolamento de projeto e scanner de segredos |
| LR3-07 | concorrência/stale/multibranch precisavam ser preservados no hardening | `GitHubSyncRun.activeProjectId` e stale detection mantidos; lifecycle agora bloqueia antes do worker; nenhuma deleção de `GitBranch`/`CommitBranch` | duas solicitações concorrentes produzem uma execução, run stale libera nova execução e 4 cenários multibranch passam |

## Persistência e migration

A migration incremental `20260820180000_lr3_github_hardening`:

- amplia o enum antes de converter `DELETED` para `REMOVED` e só depois o contrai;
- cria `GitHubRepositoryAuthorization` sem qualquer campo de token/secret;
- adiciona estado, tentativas e diagnóstico seguro a `GitHubWebhookDelivery`;
- preserva `ProjectGitHubIntegration`, `GitHubSyncRun`, `GitBranch`, `CommitBranch`, commits, PRs,
  issues e todas as migrations históricas.

Na primeira aplicação no banco de teste, o MySQL recusou um nome de índice com mais de 64
caracteres. Como a migration nova ainda não havia sido aplicada com sucesso, os identificadores
Prisma/SQL foram encurtados, apenas o registro falho foi marcado `rolled-back` e a migration foi
reaplicada. Não houve reset, drop do banco existente ou perda de dados. Depois disso, os bancos
de desenvolvimento e teste ficaram atualizados com 36 migrations, e a aplicação do zero em banco
temporário vazio passou.

## Testes e gates finais

Todas as rodadas finais abaixo usaram Node `22.23.2`.

| Gate | Resultado |
| --- | --- |
| backend lint, format e architecture | `PASS` |
| backend unit | `PASS`; 37 arquivos, 240 testes |
| backend integration/API | `PASS`; 14 arquivos/160 testes; 2 arquivos/5 testes históricos `N/A` |
| backend integral | `PASS`; 51 arquivos/400 testes; 2 arquivos/5 testes históricos `N/A` |
| backend coverage | `PASS`; 88,52% statements, 74,98% branches, 91,81% functions, 91,08% lines |
| repository authorization | `PASS`; OWNER/ADMIN incluídos, READ/WRITE excluídos, dupla autoridade exigida |
| repository reconnect/swap | `PASS`; mesma repo permitida, outra repo `409`, histórico preservado |
| installation lifecycle | `PASS`; ACTIVE permite; SUSPENDED/REMOVED bloqueiam sem apagar artifacts |
| webhook | `PASS`; HMAC, processamento único, duplicata, retry e stale recovery |
| rate limit | `PASS`; 403 permission, 403 rate, 429, headers e fallback |
| sync/multibranch | `PASS`; concorrência, stale, idempotência, remoção/reativação e histórico |
| Prisma format/validate/generate/status | `PASS`; desenvolvimento e teste atualizados, 36 migrations |
| migrations do zero | `PASS`; banco temporário vazio, zero registros residuais |
| backend secret scan | `PASS`; 307 arquivos |
| backend npm audit | `PASS`; 0 vulnerabilidades |
| frontend lint e format | `PASS` |
| frontend tests e coverage | `PASS`; 34 arquivos/203 testes; coverage executado |
| frontend build | `PASS`; 380 módulos |
| frontend npm audit | `PASS`; 0 vulnerabilidades |
| `git diff --check` | `PASS` |

Houve instabilidades intermediárias não ocultadas: uma rodada integral retornou um `500`
transitório no polling do teste E9, que passou 6/6 isolado e 400/400 na repetição integral; uma
rodada de coverage retornou `401` em uma variante LR.1 e outra atingiu o timeout de 30 segundos no
mesmo teste. O arquivo LR.1 passou 3/3 isolado e o coverage original, sem relaxamento, concluiu
400/400. A primeira rodada frontend também reteve a expectativa textual anterior ao novo estado
vazio OWNER/ADMIN; a asserção foi alinhada ao contrato e a suíte final passou 203/203.

## Pendências externas

| Evidência | Estado | Motivo |
| --- | --- | --- |
| GitHub real com repositório pessoal OWNER e organização ADMIN/WRITE/READ | `BLOCKED` | exige contas e permissões externas descartáveis |
| webhook público assinado, redelivery real e lifecycle suspend/delete/unsuspend | `BLOCKED` | exige endpoint público e operação na GitHub App real |
| callback/reinstalação com conta descartável | `BLOCKED` | exige autorização externa sem usar conta principal |

Nenhuma evidência externa indisponível foi convertida em `PASS`. Os cenários equivalentes usam
somente dados artificiais e doubles controlados.

## Resultado

**LR.3 CONCLUÍDA — PRONTO PARA LR.4**
