# Complemento preparado para a descrição da PR #24

Texto para atualização manual. Não publicado por PR24-FIX-02.

## Requisitos e comportamento

- **RF01:** cadastro básico por `POST /api/projects`, com OWNER/membership atômicos e integração
  ausente legítima; o caminho integrado `POST /api/projects/from-github` continua disponível.
- **RF02:** vinculação posterior pela GitHub App na rota existente
  `PUT /api/projects/:projectId/github/integration`, sem recriar Project ou dados locais.
- **RF21:** sincronização manual e automática compartilham pipeline idempotente, progresso
  persistido, reserva por projeto, leases/fencing e recuperação; preferência configurável por OWNER.
- **RF06:** consulta de repositório/artefatos preservada, inclusive estado de projeto sem integração;
  filtros não repetem a leitura de metadata/membership.

## Migrations e contratos

Migrations aditivas da PR: `20261011000000_github_automatic_sync`,
`20261011010000_github_scheduler_liveness` e
`20261012000000_github_sync_run_actor_set_null`. As duas primeiras já foram aplicadas em ambiente
persistente e foram preservadas. A terceira alinha a FK nullable do solicitante a SET NULL/CASCADE,
preservando histórico. Nenhum novo status administrativo de Project.

| Operação | Contrato relevante |
| --- | --- |
| `PUT /api/projects/:projectId/github/integration` | OWNER; `{message,project,integration,initialSync}`; primeira vinculação distingue vínculo confirmado de resultado da sync. ACTIVE repetido: `409 GITHUB_PROJECT_ALREADY_CONNECTED`; troca continua proibida |
| `GET /api/projects/:projectId/github/sync/status` | `{run,automation}`; run nullable com origin/progresso/summary/erro; automation informa disponibilidade/razão/heartbeat/checkedAt/nextSyncAt sem IDs internos |
| `POST /api/projects/:projectId/github/sync` | MANAGER+; `202 {message,run}`; coalescing por projeto; cooldown: 429 com Retry-After real; contenção persistente de Project: 503 controlado |
| `PATCH /api/projects/:projectId/github/sync-settings` | OWNER; `{githubAutoSyncEnabled:boolean}`; preferência e nextSyncAt persistidos atomicamente |

## Segurança, privacidade e arquitetura

Sessão, conta ativa, e-mail verificado quando exigido, CSRF, RBAC, 404 opaco e reserva única de
repositório preservados. A GitHub App usa tokens efêmeros no backend; sem PAT, tokens no frontend
ou logs brutos do provedor. Falhas não apagam artefatos ou rastreabilidade.

AUTOMATIC tem ator nulo; MANUAL conserva referência ao User pseudonimizado após anonimização.
SET NULL protege o histórico diante de eventual remoção física, sem criar hard delete de conta.
Retenção numérica de SyncRun permanece **DECISION REQUIRED**, com critérios de implementação
futura na política; propostas 90/180 dias não autorizam limpeza automática.

O [ADR-017](../architecture/ADR-017-GITHUB-ASYNC-SYNC.md) formaliza worker independente, jitter,
limites globais/por instalação, leases/fencing, heartbeat e backoff. NOWAIT nos caminhos GitHub
evita esperar Project bloqueado até expirar a transação Prisma. API e worker compartilham
policy/UTC/banco; supervisão, reinício e alerta de ausência de heartbeat pertencem à operação OCI.
A API não inicia o worker. Nenhum deploy é incluído nesta PR.

## Testes e CI

FIX-01 publicada em `ae9a265b6347f288b9c3b4c1ab0f01553c1f19b6`, com cinco checks verdes na
[CI #139](https://github.com/iYoNuttxD/Traceflow/actions/runs/38159318408).
O diff FIX-02 foi validado localmente conforme o
[relatório de fechamento](PR24_FIX_02_FINAL_ARCHITECTURE_DATABASE_REVIEW_CLOSURE_REPORT.md);
a CI remota das novas alterações depende de publicação autorizada.

Cobertura de upgrade/FK/anonimização, drift da cadeia SQL com controle negativo, locks reais >5s,
autenticação e outro projeto durante contenção, manual × automática, workers concorrentes,
lease/fencing, cooldown e countdown frontend. Persistência exclusivamente em TEST_DATABASE_URL
e schemas descartáveis próprios; desenvolvimento consultado somente por leitura de metadata.
Validadores GitHub (automação/liveness/ator) e drift passam a integrar a CI, além dos anteriores.

Referências: [API](../api/API_CONTRACTS.md), [autorização](../security/AUTHORIZATION_MATRIX.md),
[retenção](../privacy/DATA_RETENTION_POLICY.md), [inventário pessoal](../privacy/PERSONAL_DATA_INVENTORY.md),
[matriz RF](../traceability/RF_TECHNICAL_MATRIX.md), [runbook](../runbooks/GITHUB_AUTOMATIC_SYNC.md).
