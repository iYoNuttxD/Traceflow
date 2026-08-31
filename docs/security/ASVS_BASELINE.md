# Baseline de evidências OWASP ASVS 5.0 do TRACEFLOW

## Escopo

Esta matriz consolida evidências verificáveis do estado final da refatoração. Ela não é uma certificação, não declara conformidade integral com o ASVS L2 e não substitui validação operacional do ambiente de produção.

Estados: `ATENDIDO`, `PARCIAL`, `NÃO ATENDIDO` e `NÃO APLICÁVEL`.

| Área / controle aplicável | Estado | Evidência verificável | Limitação |
|---|---|---|---|
| Arquitetura em camadas e fronteiras | ATENDIDO | `docs/architecture/SYSTEM_ARCHITECTURE.md`; `backend/scripts/check-architecture.js`; `npm run architecture:check` | revisão contínua é necessária para novos módulos |
| Validação de entrada e queries parametrizadas | ATENDIDO | `backend/src/shared/validation/`; schemas dos módulos; Prisma sem SQL raw no runtime; testes de validação | novos endpoints devem aderir aos mesmos schemas |
| Prevenção de SSRF na integração GitHub | ATENDIDO | `backend/src/shared/security/ssrf.js`; testes de hosts/esquemas; base fixa do Octokit | deve ser reavaliado ao adicionar outra integração externa |
| Autenticação e recuperação de conta | PARCIAL | `backend/src/modules/auth/`; Argon2id, respostas uniformes, reset com TTL e testes | MFA, verificação de e-mail e SSO não existem |
| Sessão e CSRF | ATENDIDO no escopo atual | sessão opaca hashada, cookie seguro por ambiente, expiração/revogação, middleware CSRF e testes em `backend/test` | store distribuído e revogação central entre instâncias não existem |
| Autorização por projeto e objeto | ATENDIDO no escopo RBAC atual | `backend/src/shared/auth/`; `docs/security/AUTHORIZATION_MATRIX.md`; testes 403/404 e isolamento entre projetos. **S1-04/RF10:** `resolveProjectId` estendido para `/sprints/:id` e `/milestones/:id` em `authorization.service.js`; sem essa extensão o middleware liberaria o recurso sem checar membership (ASVS 8.2.2, IDOR/BOLA). Evidência em `backend/test/api/schedule-contracts.test.js`, incluindo regressão dos recursos antigos. **S1-04/RF35:** `GET /sprints/:id/progress` reaproveita a mesma resolução, sem nova regra em `requiredRole`; testes cobrem 401, papéis `VIEWER`–`OWNER` e ausência de vazamento de conteúdo para projeto alheio | não representa ABAC nem autorização fora dos papéis atuais. A divergência de 404 entre recurso alheio e inexistente — que permitia confirmar existência de ID fora do alcance do ator — foi **corrigida** no ADR-010 D16: middleware e service constroem a resposta pela mesma fábrica, e a indistinguibilidade é testada em `/projects/:id`, `/requirements/:id`, `/tasks/:id`, `/sprints/:id` e `/milestones/:id`, inclusive em método de escrita |
| Proteção contra automação e abuso | PARCIAL | limiters geral, convite e GitHub em `backend/src/shared/security/`; lock de sync por projeto | contadores e lock são locais à instância; produção horizontal requer store distribuído |
| CORS, headers e fingerprint | ATENDIDO na API | allowlist em `backend/src/shared/security/cors.js`; Helmet; `X-Powered-By` removido; testes HTTP | headers do documento HTML pertencem ao host da SPA |
| HSTS e confiança no proxy | PARCIAL | HSTS condicionado a produção; `TRUST_PROXY` explícito e validado | depende de HTTPS e topologia reais do ingress |
| Limite e parsing seguro de body | ATENDIDO | `BODY_LIMIT`; tratamento 400/413/415 seguro no middleware global; testes | uploads não fazem parte do produto atual |
| TLS de saída e timeout/retry | ATENDIDO para GitHub | HTTPS, timeout e retry limitados no client GitHub; testes de falhas transitórias | TLS de entrada e MySQL dependem da infraestrutura |
| Segredos e redaction | PARCIAL | `docs/security/SECRETS_POLICY.md`; scanner obrigatório na CI; env validado; testes de redaction | secret manager e rotação automatizada não existem |
| Erros seguros e correlação | ATENDIDO | erros compartilhados, request ID, ausência de stack/valor recebido e testes | agregador operacional externo não está configurado no repositório |
| Logging e auditoria de domínio | ATENDIDO no escopo definido | logger estruturado/redacted; `AuditEvent`; metadata allowlist; consultas restritas; testes | alertas, SIEM e garantia externa de retenção não são verificáveis aqui |
| Privacidade e direitos do titular | PARCIAL | `backend/src/modules/privacy/`; inventário, exportação, desativação/anomização e testes | bases legais, prazos e procedimento humano exigem validação jurídica |
| Dependências e lockfiles | ATENDIDO para high/critical conhecidos | `package-lock.json`; `scripts/check-npm-audit.mjs`; Dependency Review; audits E15 com zero vulnerabilidades | SBOM e gate automatizado de compatibilidade de licenças não existem |
| CI e gates de merge | ATENDIDO no workflow | `.github/workflows/ci.yml`; lint, format, Prisma, migrations, testes, cobertura, build, audit, secrets e dependency review | branch protection é configuração remota e deve seguir `docs/ci/BRANCH_PROTECTION.md` |
| Health/liveness/readiness | ATENDIDO | `/health`, `/health/live`, `/health/ready`; smoke e testes | política de exposição pública depende do deploy |
| Backup e restauração | PARCIAL | `docs/runbooks/BACKUP_RESTORE.md`; exercício E15 em bancos artificiais com 21 tabelas restauradas | agendamento, criptografia, retenção e restore periódico são responsabilidades operacionais |
| Upload de arquivos | NÃO APLICÁVEL | nenhuma rota multipart/upload no runtime | reavaliar caso a capacidade seja introduzida |
| Server-side rendering/RSC | NÃO APLICÁVEL | frontend Vite SPA sem SSR, loaders/actions de servidor ou React Server Components | reavaliar se a arquitetura frontend mudar |

## Controles verificados no S1-04 (RF10)

Controles conferidos contra o texto oficial do ASVS 5.0.0 durante a entrega de sprints, marcos e cronograma. Todos são L1 ou L2, coerentes com a meta L2.

| Controle | Aplicação no RF10 | Evidência |
|---|---|---|
| 1.2.4 consultas parametrizadas/ORM | Prisma parametrizado. A única exceção é o `SELECT ... FOR UPDATE` do lock de linha (ADR-010 D08), que usa `$queryRaw` com **template parametrizado** e recebe apenas IDs internos já validados — nunca entrada do usuário concatenada. O lock não tem equivalente na API declarativa do Prisma | `sprint.repository.js`, `milestone.repository.js` |
| 2.2.1 allowlist, padrões e faixas | Zod estrito; `status` por `z.enum`; datas por `dateOnly`/`isoDateTime`; `taskIds` ≤ 100 sem duplicados | `sprint.validation.js`; `schedule-contracts.test.js` |
| 2.2.2 validação em camada confiável | invariantes no service, não no formulário; frontend valida só por UX | `sprint.schema.js`; teste de API com payload inválido direto |
| 2.2.3 consistência entre dados relacionados | `startDate <= endDate`; tarefa e sprint no mesmo projeto | `sprint.service.test.js` |
| 2.3.1 fluxo na ordem esperada | máquina de estados da sprint; transição inválida → `409 SPRINT_INVALID_TRANSITION` | matriz de transições em `sprint.service.test.js` |
| 2.3.3 transações no nível de negócio | link/unlink e `PUT /sprints/:id/tasks` em `prisma.$transaction` com auditoria no mesmo escopo | `rf10-sprint-schedule.test.js` (falha parcial sem persistência residual) |
| 4.1.1 `Content-Type` correto | respostas JSON com charset; limites de payload globais | asserção direta de header em `backend/test/api/rf10-rf35-bateria.test.js` (bateria de 25/08) |
| 8.2.1 acesso a função por permissão explícita | `requiredRole` vigente aplicado às rotas novas, sem alterar o resolvedor de papéis | teste `403` para VIEWER em mutação |
| 8.2.2 acesso a dado (IDOR/BOLA) | `resolveProjectId` estendido + filtro por `projectId` nos repositories | teste obrigatório de isolamento entre projetos, todos os métodos |
| 8.3.1 autorização em camada confiável | middleware + verificação de pertencimento no service; nada depende da UI | teste de API sem passar pelo frontend |
| 16.2.2 timestamps em UTC | `generatedAt`, `startedAt`, `completedAt`, `occurredAt` | `sprint.calculator.test.js` (normalização de offset) |
| 16.3.2 falhas de autorização registradas | `403`/`404` chegam ao logger sem dado sensível | logger com redaction existente |
| 16.3.3 eventos de segurança definidos | `AuditEvent` em todas as mutações de sprint, marco e vínculo | `schedule-contracts.test.js` |
| 16.5.1 mensagem genérica em erro inesperado | `asyncHandler` com `fallbackMessage` por operação; `details` sem eco de valor recebido | teste de resposta de erro |

### Controles acrescentados pela bateria RF10/RF35 (25/08/2026)

Verificação descrita em `docs/issues/RF10_RF35_PROMPT_TESTES.md` (Fase 6) e mapeada em
`docs/issues/RF10_RF35_MAPA_TESTES.md`. Todos L1/L2, conferidos contra o texto oficial do 5.0.0.

| Controle | Aplicação no RF10/RF35 | Evidência |
|---|---|---|
| 2.1.3 limites de negócio documentados | teto de 100 tarefas por sprint documentado; o teto de 180 dias da série do burndown foi acrescentado pela bateria | `docs/api/API_CONTRACTS.md`; truncamento congelado em `backend/test/unit/rf10-rf35-bateria.test.js` |
| 2.3.2 limites implementados como documentados | 100 tarefas recusam com `SPRINT_TASK_LIMIT_REACHED` no lote e na associação individual | `schedule-contracts.test.js` (limite em lote e individual) |
| 2.3.4 lock de negócio contra dupla reserva | janela de datas e posto único de sprint ativa disputados por requisições concorrentes reais | `rf10-sprint-schedule.test.js` (concorrência sob lock); `schedule-contracts.test.js` (criações e substituições concorrentes) |
| 2.4.1 anti-automação | limiter geral e sensível com app isolado (`rateLimitMax: 1`), sem contaminar o resto da suíte | `security.test.js` |
| 3.3.1/3.3.2/3.3.4 cookies de sessão | `HttpOnly` + `SameSite=Lax` asseridos; `Secure` condicionado a produção | `auth-authorization.test.js` (fora do módulo, mesma sessão usada pelas rotas do cronograma) |
| 3.5.1 anti-CSRF | mutação de sprint/marco sem `X-CSRF-Token` recusa; leitura não exige | `schedule-contracts.test.js` |
| 3.5.3 método safe não muta | rotas `GET` do módulo não geram mutação nem auditoria de escrita | inspeção de `sprint.routes.js` + auditoria só em mutação (`schedule-contracts.test.js`) |
| 7.4.1 sessão encerrada é recusada | logout invalida a sessão no servidor | `auth-authorization.test.js` |
| 14.2.1 nada sensível em URL/query | query do módulo carrega apenas datas, status e paginação; sessão em cookie, CSRF em header | inspeção de `sprint.validation.js` |
| 14.3.2 anti-cache | `Cache-Control: no-store` asserido em resposta de sucesso e de erro do módulo — implementado desde a E5, **sem teste até esta bateria** | `backend/test/api/rf10-rf35-bateria.test.js` |
| 16.2.1 metadado de investigação | AuditEvent com ator da sessão, ação e alvo, um por mutação | `schedule-contracts.test.js` |
| 16.4.1 codificação contra log injection | nome de sprint com CRLF/ANSI/NUL sai numa única linha JSON com C0 escapado — garantia estrutural do formato JSON-line | `backend/test/unit/rf10-rf35-bateria.test.js` |
| 16.5.3 falha segura, sem fail-open | falha no meio da transação desfaz participação, ponteiro, histórico e auditoria; validação precede a escrita | `rf10-sprint-schedule.test.js` |

Não aplicáveis à superfície RF10/RF35, com justificativa: V4.3 (sem GraphQL), V4.4/V17 (sem
WebSocket/WebRTC), V5 (sem upload — já registrado acima), V9/V10 (sessão opaca de referência; não
há token autocontido nem OAuth no runtime), V6.5–V6.8 (MFA/out-of-band inexistentes — lacuna 3
abaixo, fora do escopo do módulo).

## Lacunas prioritárias

1. store distribuído para sessões operacionais, rate limiting e exclusão mútua do sync;
2. secret manager, rotação automatizada e telemetria/alertas operacionais;
3. MFA, confirmação de e-mail e endurecimento adicional da recuperação de conta;
4. TLS, proxy, CSP do host da SPA, backup e retenção comprovados no ambiente real;
5. SBOM, gate de licenças e validação jurídica da política de privacidade.

As lacunas possuem rastreabilidade em `docs/issues/TECHNICAL_BACKLOG.md`. O estado `ATENDIDO` sempre se limita à evidência citada e não equivale a conformidade total do produto ou da operação.

## Adendo — segunda bateria RF10/RF35 (30/08/2026, design v4)

A quarta iteração do design de sprints e marcos é exclusivamente frontend e não altera a
superfície HTTP do módulo — as declarações acima permanecem válidas e foram reexecutadas
(backend 501/501, duas vezes). O que a segunda bateria acrescenta de verificação:

| Controle | O que o design v4 muda | Evidência |
|---|---|---|
| 8.2.1/8.2.2 sob composição | os fluxos compostos do cliente (criar sprint + substituir tarefas; mover sprints de marco por `PUT` parcial) não abrem mutação para `VIEWER`: o perfil não carrega o catálogo de tarefas, não recebe formulário e o backend segue recusando com `403` | `frontend/test/features/SprintsScreen.test.jsx` (VIEWER sem `listProjectTasks`), `MilestonesScreen.test.jsx`; `schedule-contracts.test.js` (403 inalterado) |
| 2.3.3/16.5.x na falha parcial do cliente | criar sprint com falha na substituição de tarefas preserva a sprint salva, avisa com mensagem própria (sem eco de dado) e ressincroniza; a sequência de PUTs do formulário de marcos interrompe no erro, avisa e ressincroniza — cada PUT é atômico no servidor (S104-F13) | `SprintsScreen.test.jsx` ("avisa quando a sprint salva mas as tarefas falham"); `MilestonesScreen.test.jsx` |
| 14 (minimização) | as informações novas na tela — títulos de tarefa, nomes de sprint/marco, deadlines — vêm do payload já existente do agregado; nenhum dado pessoal novo entra no cronograma, nos cartões, nos eventos ou no expansor | forma renderizada asserida em `ScheduleScreen.test.jsx`; payload conferido em `schedule.service.js` (sem nome/e-mail) |

Nenhum capítulo novo do ASVS passa a incidir com o delta: sem upload, sem token novo, sem origem
nova, sem canal novo. Mutações de segurança da segunda bateria (VIEWER buscando catálogo, falha de
substituição engolida, PUT para sprint congelada): todas mortas — tabela completa em
`docs/issues/RF10_RF35_RELATORIO_TESTES.md`, seção da segunda bateria.

## Adendo — terceira bateria RF10/RF08 (31/08/2026, quinta iteração)

A quinta iteração (barra do marco, abas do painel do mês, Kanban sem seletor no cartão) também é
exclusivamente frontend e não altera a superfície HTTP — o que muda é **quem chama** o endpoint de
movimentação (o diálogo de detalhes em vez do cartão) e a semântica de interface. Verificação do
delta:

| Controle | O que a quinta iteração muda | Evidência |
|---|---|---|
| 8.2.1\8.2.2 no caminho novo de UI | mover pelo diálogo usa o mesmo `PATCH /tasks/:id/move` com a mesma autorização; nenhum caminho de mutação novo | `auth-authorization.test.js:312` (matriz do move inalterada); `KanbanPage.test.jsx` (o diálogo chama a mesma API do arrasto) |
| V3 (semântica nativa) | tablist e diálogo usam controles reais (`button role="tab"`, `select`, `role="dialog"` com `aria-modal`); nenhum handler novo em elemento não interativo | `ScheduleScreen.test.jsx` (tablist por papel acessível); `KanbanPage.test.jsx` (diálogo por papel) |
| 16.5.1 nas mensagens novas | `title` de sprint congelada e avisos de movimentação não ecoam valor recebido nem detalhe interno; corpo de erro do backend segue genérico | `KanbanPage.test.jsx` (mensagem do 409 é a do servidor, genérica); inspeção de `TaskDetailsPanel.jsx` |
| V2 (lógica de negócio no servidor) | **ACHADO T-A1**: a imutabilidade do quadro de sprint congelada é aplicada só no cliente — `PATCH /tasks/:id/move` aceita (`200`) tarefa de sprint `CONCLUIDA`, contrariando o `409` que o comentário do quadro promete. Sem impacto no registro histórico do RF35 (`SprintTask` intacta); exige sessão com escrita no projeto | sonda da terceira bateria (Fase 4); registrado em `TECHNICAL_BACKLOG.md` S104-F14 — **pendência ativa de L2** |
| 14 (minimização) | o seletor do diálogo e as abas não adicionam dado pessoal: o diálogo já exibia responsável e rastreabilidade; o painel de abas reorganiza texto já presente | forma renderizada asserida nas duas suítes; payloads inalterados |

Fora o T-A1, nenhum capítulo novo do ASVS passa a incidir: sem upload, sem token novo, sem origem
nova, sem canal novo. Mutações de segurança da terceira bateria (seletor de volta ao cartão,
diálogo ignorando congelada/em-voo, dessincronização do diálogo): tabela M57–M72 em
`docs/issues/RF10_RF35_RELATORIO_TESTES.md`, seção da terceira bateria.
