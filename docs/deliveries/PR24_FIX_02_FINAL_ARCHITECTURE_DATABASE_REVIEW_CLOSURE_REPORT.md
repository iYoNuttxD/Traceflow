# PR24-FIX-02 — Final Architecture, Database & Review Closure

## 1. Baseline

11/10/2026, `/Users/daniel/Coding/Traceflow`. Working tree limpo antes das alterações.
`git status --short` e `git diff --check` sem saída; branch `daniel-dev`;
HEAD `ae9a265b6347f288b9c3b4c1ab0f01553c1f19b6`.
Shell inicial: Node 26.10.0 / npm 11.19.1; comandos da entrega: **Node 22.23.3 / npm 10.9.9**.
Nenhum AGENTS.md aplicável encontrado. Nenhuma alteração preexistente descartada.

PR #24 aberta, `daniel-dev → main`; base remota
`6bc08c2b93468ee6a29e1faefbdcbc88391282bf`, head remoto igual ao local.
CI #139 (`38159318408`), event pull_request, headSha `ae9a265...`: cinco checks SUCCESS.
Esse baseline não comprova CI remota do diff local produzido nesta rodada.

## 2. Escopo da correção

M1–M4, L1–L7 e D-A–D-D do review. Sem deploy, merge, mudança de permissões, novos endpoints,
troca/desvinculação de repositório, reimplementação GitHub ou alteração de documentos oficiais TCC.

Fontes consultadas: README, CONTRIBUTING, contexto/roadmap, SYSTEM_ARCHITECTURE,
MODULE_CONVENTIONS, API_CONTRACTS, AUTHORIZATION_MATRIX, DATA_RETENTION_POLICY,
PERSONAL_DATA_INVENTORY, runbooks GitHub, ADRs 005/010/014 e template do contexto (§20).
Relatórios GITHUB-01/02/03/04/04.1 e FIX-01 usados como histórico, confrontados com código/SQL/testes.
RF01, RF02, RF06 e RF21 conferidos na matriz técnica; texto acadêmico preservado.

Arquivos alterados (29):

| Área | Arquivos |
| --- | --- |
| Runtime | `backend/src/modules/projects/active-project-write.js`, `project-write-context.js`; `backend/src/modules/github/github-sync-run.repository.js`, `github.controller.js`, `services/github-sync-run.service.js`; `backend/src/server.js` |
| Banco/validação | `backend/prisma/schema.prisma`; `backend/prisma/migrations/20261012000000_github_sync_run_actor_set_null/migration.sql`; `backend/scripts/validate-github-sync-migration.js`, `validate-schema-drift.js`; `backend/package.json` |
| Testes | `backend/test/api/privacy-governance.test.js`, `projects-github-e9.test.js`; `backend/test/integration/github-automatic-sync.test.js`, `github-sync-contention.test.js`; `frontend/test/pages/ProjectGitHubIntegration.test.jsx` |
| CI | `.github/workflows/ci.yml`; `scripts/validate-ci.mjs`, `validate-ci.test.mjs` |
| Contratos/decisões | `docs/api/API_CONTRACTS.md`; `docs/architecture/SYSTEM_ARCHITECTURE.md`, `ADR-017-GITHUB-ASYNC-SYNC.md`; `docs/privacy/DATA_RETENTION_POLICY.md`, `PERSONAL_DATA_INVENTORY.md`; `docs/runbooks/GITHUB_AUTOMATIC_SYNC.md` |
| Entrega | `TRACEFLOW_ROADMAP_INCREMENTAL.md`; `docs/deliveries/PR24_FIX_01_CODE_REVIEW_CI_CORRECTIONS_REPORT.md`, `PR24_DESCRIPTION_SUPPLEMENT.md`, este relatório |

## 3. Referências do code review

[Review 5485843204](https://github.com/iYoNuttxD/Traceflow/pull/24#pullrequestreview-5485843204),
CHANGES_REQUESTED em `ae9a265...`, publicado em 12/10/2026 01:20 UTC (11/10 em São Paulo).
Os quatro MEDIUM, sete LOW e quatro decisões foram auditados individualmente; não foram
considerados resolvidos apenas por uma suíte geral verde. Matriz na seção 28.

## 4. M1 — Prisma Schema / FK

Confirmado: schema nullable implicava SET NULL, mas a FK da cadeia SQL permanecia RESTRICT/CASCADE
desde `20260810190000_l1_2_1_github_sync_robustness`. A migration automática só alterava nulabilidade.
O novo validador, executado antes da correção, falhou com **exit 2**, identificando unicamente a
troca da FK `GitHubSyncRun.requestedByUserId`.

Decisão explícita: `onDelete: SetNull, onUpdate: Cascade`. ADR-010 continua a anonimizar contas,
preservando User.id pseudonimizado; a FK não habilita exclusão física pelo produto. Se houver
remoção física autorizada, o registro operacional permanece com ator nulo. AUTOMATIC já usa null.
Sem integração fictícia, remoção de histórico ou mudança de status administrativo.

## 5. Migration strategy

Consultas **somente leitura** em `traceflow._prisma_migrations` confirmaram:

| Migration | Aplicação persistente observada (UTC) |
| --- | --- |
| `20261011000000_github_automatic_sync` | 11/10/2026 04:02:06.884 |
| `20261011010000_github_scheduler_liveness` | 11/10/2026 04:57:54.688 |

Ambas também estavam aplicadas em `traceflow_test`. FK física RESTRICT/CASCADE nos dois alvos.
Portanto nenhuma migration anterior foi editada ou renomeada. Adicionada somente
`20261012000000_github_sync_run_actor_set_null`, que recria a FK com SET NULL/CASCADE.
Sua aplicação nesta rodada ocorreu exclusivamente em bancos de teste, nunca em desenvolvimento.

## 6. Schema drift validation

`backend/scripts/validate-schema-drift.js`, exposto como `db:test:validate-schema-drift`:

1. Exige TEST_DATABASE_URL e valida distinção do desenvolvimento.
2. Deriva nome restrito de schema descartável; recusa alvo preexistente.
3. Cria o alvo e confirma SELECT DATABASE(); aplica **toda a cadeia SQL** por migrate deploy.
4. Prisma **6.12.0** compara o datasource materializado ao datamodel com
   `migrate diff --from-schema-datasource ... --to-schema-datamodel ... --exit-code`.
5. Exige exit 0 no positivo; altera somente a FK no banco descartável para RESTRICT e exige exit 2
   no controle negativo. Erro/exit 1/execução incompleta falham; nenhum exit code é ignorado.
6. Desconecta e remove somente o schema que a própria execução criou.

Resultado após correção: **schemaDrift NONE; negativeControlExit 2**. Não é comparação entre dois
datamodels. Não precisa de shadow: o SQL já foi aplicado no datasource descartável. A CLI 6.12
local foi a referência executável; [documentação Prisma sobre shadow](https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/shadow-database)
distingue migrate deploy de diff a partir de diretório de migrations.

## 7. M2 — ADR do scheduler

Criado [ADR-017](../architecture/ADR-017-GITHUB-ASYNC-SYNC.md), conforme template vigente:
contexto, alternativas, decisão, consequências, segurança/privacidade, data/responsáveis e operação.
Confirma worker independente, agenda, jitter, limites, leases/fencing, heartbeat, recovery,
backoff/cooldown e origem automática sem ator. Registra retenção pendente e restrições de operação.
ADRs 015/016 estão na branch remota de João; não há colisão com 017 nos dois heads consultados.

## 8. M3 — Lock contention investigation

Baseline real: Prisma 6.12.0; MySQL `VERSION() = 26.7.0`, lock wait **50s**, transações interativas
com default **5s**. `withActiveProjectWrite` aguardava `Project FOR UPDATE`. A reprodução manteve
esse lock por 6,5s e chamou heartbeat real pelo repository: **P2028**. A limpeza seguinte, usando
o mesmo client, encontrou **Server has closed the connection**. As três chamadas HTTP ao outro
projeto nesse primeiro ensaio retornaram 200; não se afirma reprodução de 401/logout artificial.

| Caminho | Lock/transação antes | Tratamento final |
| --- | --- | --- |
| create manual | Project, transação default | NOWAIT; service coalesce corridas com até 3 tentativas novas/50ms; disputa persistente 503 |
| claim | Project → run, default | NOWAIT; ocupado permanece QUEUED, sem autoridade nova |
| reserveAutomatic | Project + unique slots, default | NOWAIT; CONTENDED permite seguir candidatos |
| expireIfStillStale | Project → run, default | NOWAIT; ocupado retorna count 0 sem expirar indevidamente |
| heartbeat/updateProgress | updateOwnedRun, Project → run | NOWAIT; null significa adiado, false significa autoridade perdida/inativo |
| succeed/fail | updateOwnedRun + reschedule | NOWAIT; erro controlado preserva transação/reserva para recuperação |
| withProjectWriteGuard/pipeline | guard dentro de transações canônicas | Contexto GitHub opta por NOWAIT no Project; verifica run/lease antes de confirmar escrita |

`assertLease` continua sob a mesma ordem de locks. Não há requisição externa segurando Project.
O helper compartilhado mantém o modo de espera anterior fora do contexto/opção GitHub.

## 9. Lock contention correction

NOWAIT é restrito aos caminhos GitHub descritos, sem aumento de timeout global ou retry ilimitado.
Heartbeat adiado não grava timestamp falso e não dispara GITHUB_SYNC_LEASE_LOST. Uma lease
realmente vencida continua impedindo escrita. O tratamento de projeto inativo só captura 404;
não converte disputa em projeto ausente. Terminal ocupado não libera slot parcialmente.

Sete cenários reais, cada um com lock de 6,5s: heartbeat, claim, reserva, recovery, pedido manual,
terminal e escrita de artefato com fencing. Todos exigem resposta da coordenação em **menos de 2s**,
e sessão/GET/PUT de **outra conta em outro projeto** continuam 200 após ultrapassar os 5s do default.
Depois do release: heartbeat/claim/reserva/terminal funcionam; stale expira uma vez; writer antigo
é rejeitado; nenhum artefato do teste contendido foi criado. Cleanup final também passa.

Dois testes adicionais executam o scheduler/pipeline reais com fronteira GitHub controlada:
candidato devido ou stale bloqueado não impede SUCCEEDED do projeto livre. Regressões preservam
worker × worker, manual × automática, coalescing 202, slots, lease e fencing.

Limite explícito D-B: não é correção transversal de todos os writers/pools/DDL. Contenção em outras
linhas, saturação de conexões e disponibilidade física continuam riscos operacionais a monitorar.
Os primeiros testes expuseram regressão 202/503 em corridas curtas; corrigida pelo retry limitado
no service, com transação nova por tentativa, antes da aprovação completa.

## 10. M4 — Data retention policy

**DOCUMENTED_DECISION; prazo numérico DECISION REQUIRED.** Política/inventário agora descrevem
GitHubSyncRun e liveness. O mecanismo existente `privacy:retention` trata auditoria/solicitações/
exports, não SyncRun. Não foi criado cleanup paralelo nem aplicado prazo arbitrário.

Propostas 90 dias para sucesso AUTOMATIC e 180 para MANUAL/FAILED aguardam finalidade/prazo aprovados.
Backlog exige seleção explícita, dry-run, lotes, logs, idempotência e proteção concorrente; preservar
ativos/último status, artefatos/joins/snapshots e auditoria com sua retenção própria. Sem FK de
artefatos para SyncRun; AuditEvent.resourceId é referência histórica sem FK. Detalhes na política.

## 11. L1 — Migration validator in CI

Workflow acrescenta automação, liveness, ator e drift sem remover nenhum gate anterior.
`validate-ci.mjs` exige as quatro execuções; testes estruturais rejeitam ausência, comando somente
em comentário e step desabilitado. Todos usam TEST_DATABASE_URL e falham por exit code.

## 12. L2 — Retry-After

Repository comunica `retryAt = syncNotBefore` no erro GITHUB_RATE_LIMITED. Controller calcula
`max(1, ceil((retryAt - Date.now()) / 1000))` e define o header; repository não conhece headers.
Teste de API usa cooldown >1h, confere arredondamento e ausência de run/chamada GitHub; após
expiração a sync conclui. Frontend reaproveita countdown e permanece bloqueado além dos 60s
de fallback, liberando após 120s sem nova solicitação automática. Nenhuma mudança visual necessária.

## 13. L3 — Roadmap status

Roadmap e relatório FIX-01 distinguem o encerramento local sem commit/push da publicação posterior
em `ae9a265...` e da [CI #139 verde](https://github.com/iYoNuttxD/Traceflow/actions/runs/38159318408).
CI #138 falha continua fato histórico. Nenhuma aprovação remota é atribuída ao novo diff local.

## 14. L4 — PR traceability

[Complemento da descrição](PR24_DESCRIPTION_SUPPLEMENT.md) pronto para atualização manual:
RF01/RF02/RF21/RF06, migrations, endpoints/DTOs, GITHUB_PROJECT_ALREADY_CONNECTED,
segurança/privacidade, worker e evidências. Nenhuma edição remota da PR ou reescrita de commits.

## 15. L5 — Module dependency review

Grafo relativo analisado em 297 arquivos JavaScript do runtime: **zero ciclos de imports**.
Há dependência entre domínios: Project repository consome política de agenda GitHub, e run repository
consome guard/schema de Projects. Política depende de crypto/env; guard depende de Prisma,
erro/contexto, sem retorno ao repository GitHub. Architecture check passa.
Mantido **VERIFIED_SAFE**, com justificativa na arquitetura. Mover cálculo para depois da transação
quebraria atomicidade preferência/agenda; mover regra específica para shared apenas ocultaria o
acoplamento. Não há motivo demonstrado para uma refatoração de módulos nesta rodada.

## 16. L6 — Prisma comment

Comentário de execução persistida reposicionado sobre GitHubSyncRun; GitHubSchedulerWorker conserva
somente comentário de liveness. Nenhuma alteração funcional ou migration causada pelo comentário.

## 17. L7 — Startup logging

Log `github_worker_startup_required` usa mensagem neutra sobre processo independente, somente com
GITHUB_SCHEDULER_ENABLED=true. Serve a produção supervisionada e desenvolvimento; deixa de instruir
“outro terminal” quando desabilitado. Startup da API e logs de worker/diagnóstico preservados.

## 18. Cross-branch migration analysis

`git ls-remote` confirmou `joao-dev-v2@14e00be5d532bf982485258e5295b385280a0663`; o tracking ref
local corresponde a esse SHA. A branch local `joao-dev-v2@54ea185e...` estava desatualizada e não
foi usada como evidência atual. Não houve checkout, merge ou mutação dessa branch.

- Diretórios `20261011010000_github_scheduler_liveness` e
  `20261011010000_notification_preference_enabled_at` têm nomes completos distintos. Na ordem
  lexicográfica, github precede notification; operam em tabelas independentes. Prefixo igual não é
  colisão automática. Migrations comuns às branches possuem blobs idênticos.
- Liveness já aplicada no desenvolvimento local: **não renomear**. Notification não consta nesse
  banco consultado; não se afirma acesso ao banco persistente de João ou a ambientes não fornecidos.
- Futuro merge deve unir diretórios sem modificar nomes/checksums aplicados, preservar ADRs 015/016
  e 017, e combinar as extensões de schema. Manter `currentBranch String? @db.VarChar(512)` de João
  (`20261009010100_github_sync_run_branch_limit`) junto a origin/slots/ator nullable/SetNull,
  agenda/cooldown e GitHubSchedulerWorker desta PR. Também preservar modelos de alertas/notificações.
- Após resolver o schema, validar a cadeia unificada do zero e upgrades de fixtures representativas
  das duas branches, rodar drift e gates completos. Reconsultar heads/históricos antes desse merge.
  Essa validação combinada pertence à integração futura; não foi declarada executada aqui.

OCI: histórico `fe05208ae85b` registra Azure → OCI. ADR-017 encaminha serviço supervisionado/restart
para S2-09 e heartbeat/alertas/NTP/pools para S2-10; não modifica silenciosamente o histórico.

## 19. Security

OWNER no vínculo/configuração; MANAGER+ em sync; membership em leitura. Sessão, e-mail verificado,
CSRF, 401/403/404 opaco, repository reservation e GitHub App preservados. Sem PAT, segredo novo,
exposição de solicitante/slots ou mensagem bruta do provedor. Nenhuma mudança em Health/indicadores.

## 20. Privacy

Upgrade com MANUAL/ator válido e AUTOMATIC/null preserva sete tabelas. Teste negativo de FK rejeita
ator inexistente (P2003). Remover o ator artificial por SQL/Prisma no schema descartável neutraliza
somente a referência; runs, commit e OWNER permanecem. O processor canônico de anonimização preserva os
dois runs integralmente e conserva o User pseudonimizado. Sem descarte novo de dado operacional.

## 21. Database isolation

`TEST_DATABASE_URL` validada, distinta de `DATABASE_URL`; conexão real confirmada como
`localhost:3306/traceflow_test`. Helpers configuram o alvo antes dos imports da aplicação.
Migrations temporárias derivam nomes autorizados e não removem schema preexistente. Suítes mutáveis
sobre o mesmo schema executadas em série. Desenvolvimento recebeu apenas SELECT de metadata
(`_prisma_migrations`, information_schema, DATABASE/VERSION/variáveis), sem escrita ou migration.
Conferência final por leitura: desenvolvimento mantém a FK RESTRICT e as migrations anteriores;
somente `traceflow_test` registra a nova migration e SET NULL/CASCADE. Aplicação operacional da
correção permanece fora desta execução de testes.

MySQL local VERSION 26.7.0, lower_case_table_names 2, sql_mode estrito; CI declara MySQL 8.4.8.
Portanto PASS LOCAL **não é CI-equivalent**. Node 22 usado em todos os gates.

## 22. Focused tests

- 4 arquivos / **67 testes PASS**: sete cenários de contenção, automação, API de sync e privacidade.
- 8 arquivos / **142 testes PASS**: automação (inclui dois cenários adicionais), vínculo posterior,
  projeto local, acesso, exclusão, erros GitHub, scheduler e proteção de Prisma.
- 3 arquivos frontend / **88 testes PASS**: ProjectGitHubIntegration, ProjectDetailsPage,
  RepositoryInfoPage. Grupos possuem sobreposição; não representam uma contagem única somada.
- Sem browser/screenshot/homologação externa. Frontend renderizado em JSDOM; backend usa MySQL real
  e fronteira externa GitHub controlada.

## 23. Full backend validation

`npm ci`, lint, format, Prisma validate/generate, architecture e coverage executados com Node 22.
Suíte completa: **152 arquivos / 1.841 testes PASS**; dois arquivos/cinco testes ignorados já
existentes no baseline. Nenhum skip/threshold/timeout de produção adicionado para mascarar falha.
Cobertura: statements **92,54%**, branches **87,11%**, functions **95,35%**, lines **94,84%**.

## 24. Full frontend validation

`npm ci`, lint, format, coverage e build PASS. **119 arquivos / 1.488 testes PASS**.
Cobertura: statements **86,13%**, branches **80,99%**, functions **81,97%**, lines **88,62%**.
Build mantém avisos preexistentes do bundle ELK/IIFE e chunk >500 kB; nenhum gate relaxado.

## 25. Migration validators

PASS: Prisma validate/generate, migrate/status (67 migrations), auditoria LR.5 (SCHEMA_CONSISTENT),
empty, LR.5, LR.9, S2-P1/P3/P5.1, dashboard preference, task responsibility, LR.2 legacy,
GitHub automatic/liveness/actor e schema drift. FK/upgrade preservam histórico; reaplicação idempotente.
Nenhuma migration anterior alterada. LR.2 mantém fases históricas/guard negativo e cadeia final.

## 26. Local CI

Política executável de CI, audit e inventário: **90 testes PASS**, nenhum skip.
`node scripts/validate-ci.mjs`, formatação do workflow/scripts/política e `git diff --check` PASS.
Security/secrets e architecture PASS. Gates completos executados em série, sem contenção de
suítes mutáveis no mesmo schema. Um format:check inicial apontou o novo teste; Prettier corrigiu
o arquivo e o gate passou. O teste inicial de countdown foi corrigido para avançar timers com
renders por segundo, respeitando o hook existente; não exigiu alteração de produto.

## 27. Dependency audit

Auditoria canônica backend e frontend PASS: **0 HIGH, 0 CRITICAL, zero exceções utilizadas**.
Nenhuma dependência/lockfile modificada. Nenhum gate desabilitado ou threshold reduzido.

## 28. Findings closure matrix

| ID | Severidade / prioridade | Arquivo / causa / correção | Teste ou evidência | Classificação |
| --- | --- | --- | --- | --- |
| M1 | MEDIUM / BLOCKING | schema + migration incremental; FK divergente | Drift real exit 2 antes, 0 depois; upgrade/FK/anonimização | RESOLVED |
| M2 | MEDIUM / BLOCKING | ADR-017; decisão estrutural sem registro | Template, alternativas e IDs remotos verificados | RESOLVED |
| M3 | MEDIUM / HIGH | active-project-write, run repository/service; espera >5s | P2028 antes; 7 locks reais + scheduler livre + coalescing/fencing depois | RESOLVED |
| M4 | MEDIUM / DECISION | Retention Policy + inventário; volume sem prazo próprio | Política/mecanismo auditados; prazo proposto e critérios futuros explícitos | DOCUMENTED_DECISION |
| L1 | LOW / HIGH | ci.yml + política; validators fora da CI | Quatro gates adicionados; execução real e testes estruturais | RESOLVED |
| L2 | LOW / MEDIUM | repository metadata → controller header | API cooldown futuro/expirado; countdown 120s sem retry automático | RESOLVED |
| L3 | LOW | roadmap + FIX-01; cronologia desatualizada | CI #139/head verificados ao vivo; passado preservado | RESOLVED |
| L4 | LOW | PR24_DESCRIPTION_SUPPLEMENT; rastreabilidade incompleta | RF/contratos/migrations/privacidade/operação; publicação manual futura | RESOLVED |
| L5 | LOW | SYSTEM_ARCHITECTURE; dependência de módulos | 297 arquivos sem ciclo; atomicidade preservada; architecture PASS | VERIFIED_SAFE |
| L6 | LOW | schema; comentário no modelo errado | Diff restrito ao comentário | RESOLVED |
| L7 | LOW | server.js; instrução de terminal incondicional | Inspeção do ramo enabled/disabled e mensagem neutra; lint PASS | RESOLVED |
| D-A | DECISION | Prazo SyncRun não aprovado | DECISION REQUIRED; sem cleanup novo; critérios na política | DOCUMENTED_DECISION |
| D-B | DECISION / HIGH | Escopo de locks desta PR | Caminhos frequentes e pipeline com fencing tratados; risco transversal delimitado | DOCUMENTED_DECISION |
| D-C | DECISION / DOCUMENT | ADR-017 + roadmap | Histórico Azure → OCI e obrigações S2-09/10; sem deploy | DOCUMENTED_DECISION |
| D-D | DECISION / HIGH | Históricos SQL/branches + seção 18 | Liveness aplicada: preservar nome; união de schema/migrations futura descrita | DOCUMENTED_DECISION |

## 29. Remaining limitations

Retenção numérica exige decisão; implementação de limpeza não foi aprovada. Operação OCI/worker
supervisionado, relógios/pools, alertas e GitHub real dependem de homologação externa. Riscos
transversais de locks fora dos caminhos corrigidos e merge com João não são declarados encerrados.
Sem nova validação visual, E2E em navegador ou artefatos de screenshot.

## 30. Remote CI pending

A CI #139 verde pertence exclusivamente ao baseline FIX-01. FIX-02 permanece no working tree,
sem commit/push/edição remota da PR. Depois de autorização para publicação: executar CI da PR #24
no novo head e solicitar revisão final deste diff. Nenhum deploy/merge nesta tarefa.

## 31. Final verdict

**PR24-FIX-02 FINAL ARCHITECTURE, DATABASE & REVIEW CLOSURE — PASS LOCAL**

Bloqueantes M1/M2 resolvidos; M3 reproduzido e corrigido no escopo explicitado. Demais achados
resolvidos, verificados ou formalmente classificados com justificativa. D-A permanece decisão
de prazo/expurgo, sem limpeza arbitrária. Não há aprovação operacional ou remota implícita.

Diff revisado: somente runtime/contratos/testes/documentação necessários, uma migration incremental,
sem edição/renomeação de SQL anterior, sem ciclos novos, retries ilimitados ou mudança de autorização.
Nenhum teste alterou desenvolvimento; nenhum screenshot, commit, push, merge, rebase, reset, clean,
stash, edição remota da PR ou deploy executado. HEAD e branch permanecem os do baseline.

Próximo passo, mediante autorização: publicar as correções, executar novamente a CI da PR #24 e
solicitar revisão final. Esta entrega termina aqui. Sugestão de commit:
`fix: resolve PR24 architecture and migration review findings`.
