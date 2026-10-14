# Baseline de evidências OWASP ASVS 5.0 do TRACEFLOW

## Escopo

Esta matriz consolida evidências verificáveis do estado final da refatoração. Ela não é uma certificação, não declara conformidade integral com o ASVS L2 e não substitui validação operacional do ambiente de produção.

Estados: `ATENDIDO`, `PARCIAL`, `NÃO ATENDIDO` e `NÃO APLICÁVEL`.

| Área / controle aplicável | Estado | Evidência verificável | Limitação |
|---|---|---|---|
| Arquitetura em camadas e fronteiras | ATENDIDO | `docs/architecture/SYSTEM_ARCHITECTURE.md`; `backend/scripts/check-architecture.js`; `npm run architecture:check` | revisão contínua é necessária para novos módulos |
| Validação de entrada e queries parametrizadas | ATENDIDO | `backend/src/shared/validation/`; schemas dos módulos; Prisma sem SQL raw no runtime; testes de validação | novos endpoints devem aderir aos mesmos schemas |
| Prevenção de SSRF na integração GitHub | ATENDIDO | `backend/src/shared/security/ssrf.js`; testes de hosts/esquemas; base fixa do Octokit | deve ser reavaliado ao adicionar outra integração externa |
| Autenticação e recuperação de conta | PARCIAL | username/e-mail, Argon2id, GitHub-only com reautenticação sensível por state/sessão/identidade, reset e verificação de e-mail com token hashado/TTL/uso único | MFA, SSO e validação GitHub operacional externa não existem |
| Sessão e CSRF | ATENDIDO no escopo atual | sessão opaca hashada, TTL comum/persistente, cookie seguro por ambiente, expiração/revogação e CSRF | store distribuído e revogação central entre instâncias não existem |
| Autorização por projeto e objeto | ATENDIDO no escopo RBAC atual | `backend/src/shared/auth/`; `docs/security/AUTHORIZATION_MATRIX.md`; testes 403/404 e isolamento entre projetos. No S1-04/RF10, `resolveProjectId` também cobre `/sprints/:id` e `/milestones/:id`; o RF35 reutiliza essa resolução. `backend/test/api/schedule-contracts.test.js` cobre os papéis, recursos antigos e isolamento das rotas novas | não representa ABAC nem autorização fora dos papéis atuais; recursos inexistentes e recursos de projeto alheio preservam resposta 404 indistinguível |
| Proteção contra automação e abuso | PARCIAL | limiters geral, convite e GitHub em `backend/src/shared/security/`; claim persistido de sync por projeto com stale detection | contadores HTTP usam memória local; produção horizontal requer store distribuído para rate limit |
| CORS, headers e fingerprint | ATENDIDO na API | allowlist em `backend/src/shared/security/cors.js`; Helmet; `X-Powered-By` removido; testes HTTP | headers do documento HTML pertencem ao host da SPA |
| HSTS e confiança no proxy | PARCIAL | HSTS condicionado a produção; `TRUST_PROXY` explícito e validado | depende de HTTPS e topologia reais do ingress |
| Limite e parsing seguro de body | ATENDIDO | `BODY_LIMIT`; tratamento 400/413/415 seguro no middleware global; testes | uploads não fazem parte do produto atual |
| GitHub App/callback/webhook | PARCIAL | state hashado ligado à sessão, prova de instalação, token efêmero, HMAC constant-time e delivery ID | configuração/permissões reais e secret manager dependem da operação |
| TLS de saída e timeout/retry | ATENDIDO para GitHub | HTTPS, timeout e retry limitados no client por instalação; testes de falhas transitórias | TLS de entrada e MySQL dependem da infraestrutura |
| Segredos e redaction | PARCIAL | `docs/security/SECRETS_POLICY.md`; scanner obrigatório na CI; env validado; testes de redaction | secret manager e rotação automatizada não existem |
| Erros seguros e correlação | ATENDIDO | erros compartilhados, request ID, ausência de stack/valor recebido e testes | agregador operacional externo não está configurado no repositório |
| Logging e auditoria de domínio | ATENDIDO no escopo definido | logger estruturado/redacted; `AuditEvent`; metadata allowlist; consultas restritas; testes | alertas, SIEM e garantia externa de retenção não são verificáveis aqui |
| Privacidade e direitos do titular | PARCIAL | `backend/src/modules/privacy/`; exportação limitada à autorização atual; último OWNER retorna `ACTIVE`; anonimização/tombstone e testes | bases legais, prazos, backups e procedimento humano exigem validação jurídica/operacional |
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

1. store distribuído para rate limiting em implantação horizontal; sessões e exclusão mútua do sync já usam persistência no banco;
2. secret manager, rotação automatizada e telemetria/alertas operacionais;
3. MFA e endurecimento operacional adicional da recuperação/verificação de conta;
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
| V2 (lógica de negócio no servidor) | **ACHADO T-A1 — corrigido em 31/08/2026** (`ad71a19`): `PATCH /tasks/:id/move` passou a recusar com `409 TASK_SPRINT_LOCKED` tarefa de sprint `CONCLUIDA`/`CANCELADA`, alinhando o servidor à regra que o quadro aplicava só no cliente (ADR-010 D04). Sem impacto no registro histórico do RF35 durante a janela exposta (`SprintTask` intacta) | `rf08-terceira-bateria.test.js` (409 nos dois status terminais, status intacto, nenhum movimento/histórico/auditoria); S104-F14 encerrado no backlog |
| 14 (minimização) | o seletor do diálogo e as abas não adicionam dado pessoal: o diálogo já exibia responsável e rastreabilidade; o painel de abas reorganiza texto já presente | forma renderizada asserida nas duas suítes; payloads inalterados |

Fora o T-A1, nenhum capítulo novo do ASVS passa a incidir: sem upload, sem token novo, sem origem
nova, sem canal novo. Mutações de segurança da terceira bateria (seletor de volta ao cartão,
diálogo ignorando congelada/em-voo, dessincronização do diálogo): tabela M57–M72 em
`docs/issues/RF10_RF35_RELATORIO_TESTES.md`, seção da terceira bateria.

## Delta S1-07 — upload privado e execução auditável

A entrega acrescenta multipart e filesystem privado, portanto amplia a superfície
além das iterações anteriores sem upload. O mapeamento abaixo descreve controles
exercitados; não é certificação ASVS nem validação de infraestrutura de produção.

| Área | Controle aplicado | Evidência |
|---|---|---|
| Autorização | sessão/CSRF/RBAC antes do upload; ProjectMembership ativa em reads/writes/downloads; 404 opaco entre projetos | `test/api/test-cases-s1-07.test.js` |
| Validação de arquivos | parser mantido, limites de partes/bytes/contagem, allowlist por destino, assinatura real, UTF-8/JSON; MIME do cliente ignorado | `test/unit/test-cases/storage.test.js`, API S1-07 |
| Armazenamento/download | UUID privado, sem static, O_NOFOLLOW, nomes sanitizados, attachment/nosniff, sem chaves/caminhos em DTO | storage unit e downloads API |
| Integridade de negócio | versões imutáveis, conflito otimista sob row lock, XOR físico de referência, resultado derivado e autor/timestamp do servidor | `test/integration/test-cases-s1-07.test.js` |
| Atomicidade prática | upload fora de lock; rollback DB e compensação de arquivos em falhas conhecidas | injeção de falha de storage/auditoria em integração |
| Privacidade/logging | AuditEvent minimizado, exportação própria e membership ativa, neutralização de nomes capturados na anonimização | integração S1-07, inventário e política de retenção |

Limites: detecção de formato não é antivírus/decodificação integral; nenhum teste
local comprova ACLs, backup ou deploy de produção. Queda entre promoção e commit pode
exigir reconciliação manual de órfãos. Range de vídeo e storage externo não implementados.

## Delta S2-01 — alertas de rastreabilidade (RF13, RF39, RF40, RF58)

A entrega acrescenta seis rotas project-scoped e uma tabela nova (`TraceabilityAlert`). Não há
upload, token, canal ou origem nova. O mapeamento descreve controles exercitados; não é
certificação ASVS.

| Área | Controle aplicado | Evidência |
|---|---|---|
| Controle de acesso | VIEWER+ lê; dispensa e reprocessamento exigem MANAGER+ no middleware (`requiredRole`) e de novo no service; alerta de outro projeto responde 404 opaco | `test/api/s201-traceability-alerts.test.js` (matriz completa e isolamento), `test/unit/traceability-alert.service.test.js` |
| Validação de entrada | schemas `strictObject` (parâmetro desconhecido responde 400); justificativa de 10 a 500 caracteres depois do `trim`; enums de situação, tipo e status; `limit` até 100 | API S2-01 |
| CSRF e abuso | mutações exigem CSRF; o reprocessamento tem limitador próprio por usuário e projeto, com o teto do sync manual | API S2-01 (POST sem token responde 403); `app.js`, `rate-limit.js` |
| Lógica de negócio no servidor | detecção e resolução são exclusivas do servidor, sob o lock do projeto; o índice único sobre a coluna gerada `activeKey` impede dois alertas ativos por sujeito, mesmo em concorrência | `test/integration/s201-traceability-alerts.test.js` (I14–I16) |
| Logging e auditoria | logs só com contagens e gatilho; auditoria de dispensa e reprocessamento com metadata allowlisted (`alertType`, `created`, `resolved`), sem justificativa | API S2-01 (auditoria não contém a justificativa), unit do service |
| Minimização (V14) | DTO sem e-mail, `dedupeKey`, `activeKey` ou campos crus do GitHub; quem dispensou aparece só como `{id,name}` | API S2-01 (DTO e contexto) |

Limites: a reconciliação pós-sync roda no processo da API, depois de o run ser persistido; uma
falha nela fica no log e no registro da última reconciliação, e é recuperada pelo reprocessamento
manual ou pelo script `traceability:alerts`. Nenhum teste local cobre o limitador sob carga real.

**Revisão de 09/10/2026 (correções da campanha de testes, `docs/issues/S2_01_RELATORIO_TESTES.md`):**

| Controle | Mudança | Evidência |
|---|---|---|
| V2.1.3, V2.3.2 | a justificativa conta caracteres Unicode, como documentado; deixa de ser `PARCIAL` | `test/api/s201-correcoes.test.js` (C5-01), bateria de frontend (C5-02, C5-03) |
| V16.5.2, V16.5.3 | a falha da reconciliação do projeto fica registrada e visível na tela (`reconciliation.stale`); deixa de ser `PARCIAL` | `test/integration/s201-correcoes.test.js` (C3), bateria de frontend (C4) |
| V8.2.1 | a regra MANAGER do middleware aceita a barra final; dispensa e reprocessamento têm duas camadas também nessas variantes | `test/unit/s201-bateria.test.js` (papel exigido no middleware) |
| V1.2.1, V3.2.2, §13.2 do contexto | URLs vindas do GitHub só são gravadas com o prefixo `https://github.com/` | `test/unit/github-mapper.correcoes.test.js` (C1-03) |
| Disponibilidade do sync | textos do GitHub cabem nas colunas; um título longo não derruba mais a importação | `test/api/s201-correcoes.test.js` (C1-01) |

## Delta S2-02 — notificações de tarefa (RF30, RF59)

A entrega acrescenta seis rotas do próprio usuário, duas tabelas com dado pessoal
(`Notification`, `NotificationPreference`), um job agendado (`notifications:due`) e duas telas. A
matriz segue a §13.1 do contexto de arquitetura: requisito, aplicabilidade, implementação,
evidência e status. O mapeamento descreve controles exercitados; não é certificação ASVS.

| Requisito | Nível | Aplicação ao S2-02 | Implementação | Evidência | Status |
|---|---|---|---|---|---|
| V1.2.1, V3.2.2 | L1 | título da tarefa, nome do ator e do projeto exibidos como texto | `NotificationCard` | `NotificationsPage.test.jsx` (título com `<img onerror>` literal); NT-U-06 da campanha (nome do projeto e do ator) | ATENDIDO |
| V1.2.2 | L1 | link de contexto montado pelo servidor com ids inteiros | `notification.policy.js` (`notificationLink`), mapper | `notification.policy.test.js`; DTO em `s202-notifications.test.js` (API) | ATENDIDO |
| V1.2.4 | L1 | consultas só pelo Prisma; o módulo não usa SQL bruto | `notification.repository.js` | inspeção; `architecture:check` | ATENDIDO |
| V2.1.1, V2.1.3 | L1, L2 | regras e limites documentados: `limit` até 100, `status` enum, preferências estritas, janela de 7 dias, 15 min, título de 191 | `docs/data/TASK_NOTIFICATIONS.md`, `API_CONTRACTS.md` | documentos da Fase 0 e da Fase 6 | ATENDIDO |
| V2.2.1, V2.2.2 | L1 | validação positiva no servidor (`strictObject`, enums, ids inteiros até 2³¹−1) | `notification.validation.js` | API: campo desconhecido, ids malformados e `limit=101` respondem 400, nunca 500; cursor malformado, com `page` ou repetido responde 400 (C2-03) | ATENDIDO |
| V2.3.2 | L2 | limites implementados como documentados | política e validação | `notification.policy.test.js` (janela nas duas pontas); API (`limit=101`) | ATENDIDO |
| V2.3.3 | L2 | notificação de status na mesma transação do movimento e do histórico | `transitionStatus` | N4 (`test/integration/s202-notifications.test.js`) | ATENDIDO |
| V2.3.4 | L2 | índice único (destinatário, chave) contra duplicidade sob concorrência; `PUT` de preferências serializado por usuário, com espera limitada a 2 s (`FOR UPDATE NOWAIT`) | schema, `skipDuplicates`; `notification.repository.js` (`savePreferences`) | N5, N8; RT-V-02, RT-N-L-01, CR-02 (concorrência da mesma conta sem 409) | ATENDIDO |
| V2.4.1 | L2 | as três leituras no limitador autenticado; mutações com CSRF e limitador global | `app.js` | API: 429 com `Retry-After` nas três leituras | ATENDIDO |
| V3.5.1, V3.5.3 | L1 | CSRF em `PATCH`, `POST` e `PUT`; nenhuma `GET` muda estado | middleware CSRF existente | API: mutação sem token responde 403; `readAt` intacto depois das `GET` | ATENDIDO |
| V4.1.1 | L1 | `Content-Type` com charset em sucesso e erro | resposta global | API (cabeçalhos das rotas novas) | ATENDIDO |
| V8.1.1 | L1 | regra documentada: só o destinatário, com membership ativa | `AUTHORIZATION_MATRIX.md`, ADR-016 | documentos | ATENDIDO |
| V8.2.1 | L1 | toda rota exige sessão | `authenticate` | API: 401 nas seis rotas | ATENDIDO |
| V8.2.2 | L1 | id de outra pessoa ou oculto responde 404 igual ao inexistente | repository filtra por `recipientUserId` e visibilidade | API (C6) | ATENDIDO |
| V8.2.3, V15.3.1 | L2, L1 | DTO sem e-mail, `dedupeKey` nem destinatário | `notification.mapper.js` | API (chaves exatas do DTO) | ATENDIDO |
| V8.3.1 | L1 | destinatário só da sessão; nenhum `userId` aceito | controller e validação | API: `userId` em query ou corpo responde 400 | ATENDIDO |
| V8.4.1 | L2 | perder a membership oculta; contador e `read-all` respeitam a visibilidade | repository (`visibleWhere`) | API (membership removida e reativada, projeto excluído, `read-all`) | ATENDIDO |
| V14.1.1, V14.1.2, V14.2.4 | L2 | notificação e preferência inventariadas, com retenção de 180 dias, exportação e anonimização | `PERSONAL_DATA_INVENTORY.md`, `DATA_RETENTION_POLICY.md` | `test/integration/s202-privacy.test.js`; exportação na API com todas as notificações do titular e `visible` (C7-01, correção de 10/10); conta restrita não recebe dado novo (`INACTIVE_ACCOUNT`, C6-02) | ATENDIDO |
| V14.2.1 | L1 | a query leva `status`, `cursor` (instante e id, sem dado pessoal), `page` e `limit`; o link não leva dado pessoal | rotas e mapper | API (inspeção das rotas); RT-N-C-01..09 | ATENDIDO |
| V14.3.2 | L2 | `Cache-Control: no-store` nas respostas com nome e título | `noStoreApiResponses` global | API (cabeçalhos) | ATENDIDO |
| V14.3.3 | L2 | nada de notificação em `localStorage` ou `sessionStorage` | feature `notifications` | `NotificationsPage.test.jsx` | ATENDIDO |
| V15.1.3, V15.2.2 | L2 | custo do job, da lista e da exportação documentado e limitado (janela, lote por projeto, keyset, índices) | runbook, script, `listPage`, exportação | job em banco de teste, num projeto: 2.000 tarefas, 47 ms; 10.000 tarefas, 171 ms. Lista por cursor com 10.000 notificações: pior página 98 ms (RT-N-C-10). Exportação de 5.000 notificações: até 173 ms, 24 SELECTs (RT-N-X-02). "Carregar mais" sem refazer os cartões já exibidos (CR-08) | ATENDIDO |
| V15.3.3, V15.3.5, V15.3.7 | L2 | `PATCH` aceita só `read`; `"true"` responde 400; `status` repetido responde 400 | validação | API | ATENDIDO |
| V15.3.6 | L2 | `__proto__` em qualquer nível do corpo responde 400; `constructor` também | `notification.validation.js` | API (preferências) | ATENDIDO |
| V16.2.1, V16.2.2 | L2 | log do job com evento, projeto, contagens e instante em UTC, e o fuso usado | `notification.service.js` | `notify-overdue-tasks.script.test.js` | ATENDIDO |
| V16.2.5, V16.4.1 | L2 | log sem título, nome ou e-mail; título com `\r\n` não forja linha | `notification.service.js` | `notify-overdue-tasks.script.test.js` | ATENDIDO |
| V16.3.2 | L2 | 404 por id alheio registrado pelo tratador de erros | tratador global | API (logger injetado) | ATENDIDO |
| V16.3.3 | L2 | mudança de preferências auditada, só com `changedTypes` | `audit.service.js` | API (auditoria); `PUT` serializado por usuário, trilha coerente sob concorrência (C4-01, correção de 10/10) | ATENDIDO |
| V16.5.1 | L2 | erro genérico, sem eco da entrada nem stack | tratador global | API | ATENDIDO |
| V16.5.2, V16.5.3 | L2 | falha de inserção desfaz a mudança de status; falha de um projeto no job conta em `failed` e o processo sai com código 1, e `--project-id` sem projeto sai com código 2; `PUT` de preferências com a conta ocupada responde 409 sem afetar outras requisições | `transitionStatus`, script, `savePreferences` | N4; N15 e testes do script; RT-V-06; RT-N-L-05 e CR-01..04 (correção de 11/10) | ATENDIDO |
| V16.4.2, V16.4.3 | L2 | proteção e envio dos logs para sistema separado | ambiente | — | NÃO VERIFICÁVEL LOCALMENTE (S2-10) |

**Não aplicáveis:**
- **V1.3.x:** sem HTML rico, SVG, template, Markdown, SSRF, LDAP, JNDI ou e-mail.
- **V1.5.x:** sem XML nem desserialização de objeto.
- **V2.3.1:** não há fluxo em etapas.
- **Cabeçalhos e origem (V3.3.x, V3.4.x, V3.5.2, V3.5.4–V3.5.5, V3.7.x):** cookies, cabeçalhos globais, CORS e origem não mudam.
- **V4.1.2–V4.4.x:** sem GraphQL, WebSocket ou intermediário novo.
- **V5, V6, V7, V9, V10, V11 e V12:** nada novo de arquivo, autenticação, sessão, token, OAuth, criptografia ou TLS.
- **V13.x:** sem comunicação externa nova; o job usa a mesma `DATABASE_URL`.
- **V17:** sem WebRTC.

**Achado transversal.** O Zod 4 descarta em silêncio uma chave própria `__proto__` num
`strictObject`, em vez de acusar chave desconhecida. Não há poluição de protótipo, porque o objeto
validado sai limpo. Mesmo assim, a tentativa não chega ao log como erro de validação. O S2-02
recusa a chave nos próprios corpos; o restante da API está no backlog (S202-F06).

**Verificação de 09/10/2026.**
- Suíte completa do backend duas vezes: 1744 testes passaram nas duas rodadas. A única falha é o
  `storage.test.js` (symlink `EPERM` no Windows, de ambiente e anterior ao S2-02).
- Mutação dirigida: 20 mutantes, todos mortos. Cobrem fuso, valor-limite, guarda de concluída,
  ator, transação, deduplicação, visibilidade, `read-all`, preferências, contador, código de saída,
  contagens, janela, exportação, anonimização, retenção, recarga após 404, consulta periódica e o
  teto "99+".
- Cadeia de 62 migrations aplicada num banco vazio temporário, com as colunas, os índices e as
  chaves estrangeiras esperados. O banco temporário foi removido em seguida.
- `db:lr5:audit -- --test`: `SCHEMA_CONSISTENT`.

**Correções de 10/10/2026** (campanha de testes do S2-02, `S2_02_RELATORIO_TESTES.md`, seção 17):
- V14.1.1, V14.1.2 e V14.2.4: a exportação traz todas as notificações do titular, com `visible`, e
  conta restrita não recebe dado novo (`INACTIVE_ACCOUNT`).
- V16.3.3: o `PUT` de preferências é serializado por usuário; a trilha de auditoria chega ao estado
  final sob concorrência.
- V2.2.1 e V2.2.2: o cursor da central é validado no servidor (formato, data, faixa do id,
  exclusividade com `page`).
- Suíte completa do backend duas vezes com 1916 verdes (só o `EPERM` de ambiente); 22 mutantes
  dirigidos, todos mortos; 63 migrations aplicadas num banco vazio; `SCHEMA_CONSISTENT`.

**Correções de 11/10/2026** (reteste do S2-02, `S2_02_RELATORIO_RETESTE.md`, seção 19):
- V2.3.4, V16.5.2 e V16.5.3: o `PUT` de preferências não espera mais que 2 s pelo bloqueio da conta
  e responde 409 `NOTIFICATION_PREFERENCES_BUSY`; a espera longa deixou de derrubar requisições de
  outras pessoas (RT-N-L-05, CR-01..04).
- V2.2.1 e V2.2.2: o cursor só vale na forma canônica (CR-05, CR-06).
- V14.2.1 e V15.1.3/V15.2.2: linhas revistas com o cursor e as medições do reteste; "Carregar mais"
  sem refazer os cartões já exibidos (CR-08).
- Suíte completa do backend duas vezes com 1995 verdes (só o `EPERM` de ambiente); 17 mutantes
  dirigidos, 15 mortos e 2 equivalentes justificados (F9, MR14); sem migration nesta rodada.

## Delta S2-03 — notificações de eventos de issues e pull requests (RF60, RF61)

A entrega acrescenta uma fila com dado de terceiros (títulos e URLs do GitHub), a detecção dentro
da sincronização, um job agendado (`notifications:github-events`), campos novos no DTO e nas
preferências, e cartões e interruptores na interface. Não há rota nova. A matriz segue a §13.1 do
contexto de arquitetura; o mapeamento descreve controles exercitados, não é certificação ASVS.
Testes citados: política `test/unit/github-event.policy.test.js` (P1–P9), detecção
`test/integration/s203-github-event-detection.test.js` (E1–E15), despacho
`test/integration/s203-github-event-dispatch.test.js` (G1–G12, G14, G15, M3, M4), API
`test/api/s203-github-event-notifications.test.js` (R1–R8, PV1), privacidade
`test/integration/s203-github-event-privacy.test.js` (PV2–PV4), script
`test/unit/dispatch-github-event-notifications.script.test.js` e interface
`frontend/test/pages/Notifications.github-events.test.jsx` e
`frontend/test/pages/NotificationPreferencesPage.test.jsx` (F1–F9).

A campanha de testes de 12/10/2026 acrescentou as baterias `test/api/s203-bateria.test.js`,
`test/integration/s203-bateria.test.js`, `test/unit/s203-bateria.test.js` e
`frontend/test/pages/Notifications.s203-bateria.test.jsx`, com os casos `EV-*` mapeados em
[S2_03_MAPA_TESTES.md](../issues/S2_03_MAPA_TESTES.md). As correções de 13/10/2026 estão em
`test/unit/s203-correcoes.test.js`, `test/integration/s203-correcoes.test.js` e
`test/api/s203-correcoes.test.js` (casos C0–C8) e na bateria do frontend (C9).

| Requisito | Nível | Aplicação ao S2-03 | Implementação | Evidência | Status |
|---|---|---|---|---|---|
| V1.2.1 | L1 | título e número do artefato, título da tarefa e nome do projeto exibidos como texto; o título vem de terceiros | `NotificationCard` | F3 (título com `<img onerror>` literal) | ATENDIDO |
| V1.3.3 | L2 | dado não confiável limitado antes de persistir: título em 256 pontos de código; URL só com o prefixo `https://github.com/` e até 512 | `github.mapper.js`, `github-event.policy.js` | P9; R2 | ATENDIDO |
| V2.1.3, V2.3.2 | L2 | limites documentados e implementados: janela de 7 dias, lote de 100, até 10 lotes no job, 5 tentativas, esperas de 1, 5, 30 e 120 min, reserva de 2 min, retenção de 180 dias | política e `GITHUB_EVENT_NOTIFICATIONS.md` | P5, P8, G7, G8 | ATENDIDO |
| V2.3.3 | L2 | transição, evento e retrato gravados na mesma transação da atualização do artefato | `upsertMany` e `github-event.repository.js` | E9 | ATENDIDO |
| V2.3.4 | L2 | trava contra processamento duplo: chave única da ocorrência, reserva condicional com prazo, chave única da notificação por destinatário | schema e repository | E10, G5, G6 | ATENDIDO |
| V3.5.1 | L1 | o `PUT` de preferências continua exigindo CSRF | middleware existente | R3 | ATENDIDO |
| V8.1.1 | L1 | regra documentada: destinatários pela participação na tarefa e pela membership ativa; só o destinatário vê | ADR-018, `AUTHORIZATION_MATRIX.md` | documentos | ATENDIDO |
| V8.2.2 | L1 | id alheio continua 404 opaco; a fila nunca é exposta por rota | repository existente | R4, R5 | ATENDIDO |
| V8.2.3, V15.3.1 | L2, L1 | DTO sem chave de deduplicação, id do evento, chave da ocorrência, resultado do despacho, destinatário, login ou corpo do GitHub | `notification.mapper.js` | R1 | ATENDIDO |
| V8.3.1 | L1 | destinatários calculados no servidor a partir de dados persistidos; nada vem do cliente | `github-event-notification.service.js` | G1, R5 | ATENDIDO |
| V8.4.1 | L2 | isolamento entre projetos: o retrato só aceita tarefas do projeto do evento; participação e membership valem nesse projeto | detecção e despacho | E12, G3 | ATENDIDO |
| V13.2.4 | L2 | o despacho não faz chamada externa; a única saída continua sendo a API do GitHub na sincronização | arquitetura | G14 | ATENDIDO |
| V14.1.1, V14.1.2, V14.2.4 | L2 | fila e campos novos no inventário de dados, com retenção de 180 dias, exportação e anonimização; evento de projeto excluído não se perde; URL revalidada na exportação; aviso de privacidade com as notificações | documentos de privacidade, `privacy-retention.js`, `notification.mapper.js` | PV1–PV4; C4-01, C4-02, C7-01 (correções de 13/10/2026) | ATENDIDO |
| V14.2.1 | L1 | os links levam só ids; nada sensível na URL | mapper | R1 | ATENDIDO |
| V15.1.3, V15.2.2 | L2 | custo documentado e limitado: detecção dentro da transação da página, lote no despacho, despacho sem transação interativa, teto por execução do job | runbook e política | E14; medição local de 12/10/2026 (5 rodadas): página de 100 PRs em cerca de 145 ms sem transição e 240 ms com 100 transições, para um limite de 5 s. Correções de 13/10/2026: custo constante por página com transição (C3-01); pelo proxy de latência, 100 transições levam 3,5 s com 10,66 ms; a página-base passava dos 5 s por volta de 15 ms. Desde o ADR-021 (S203-F22, 13/10/2026), a página grava só o que mudou: 6 instruções sem mudança e cerca de 106 no pior caso, contra 306 antes | ATENDIDO |
| V15.3.3, V15.3.5, V15.3.6 | L2 | preferências estritas com as quatro chaves; comparação de estado estrita e normalizada; agrupamentos com `Map` e `Set`; `__proto__` responde 400 | validação e política | R3, P1, P6 | ATENDIDO |
| V16.1.1 | L2 | inventário de logs com os eventos novos | runbook e documento de regra | documentos | ATENDIDO |
| V16.2.1, V16.2.2 | L2 | logs com quando, onde e o quê, em UTC | serviço e script | G11 | ATENDIDO |
| V16.2.5, V16.4.1 | L2 | logs e saída do job sem título, URL, login, nome ou e-mail; título com `\r\n` não forja linha | serviço e logger | G11 | ATENDIDO |
| V16.3.4 | L2 | falha inesperada no despacho registrada com código; falha da página da sincronização registrada mesmo com a conexão dessincronizada; estoque de `FAILED` e reserva perdida na saída do job | serviço, `github-sync-run.service.js`, cliente de recuperação | G7, G11; C2-01 a C2-04, C5-01, C5-03, C5-04 | ATENDIDO |
| V16.5.1 | L2 | nada do GitHub cru chega a resposta, log, fila ou notificação; erro de banco na sincronização sai com código estável e mensagem que não culpa o GitHub | mapper e normalização de erros, `githubSyncFailure` | R1, G11, E13; C1-01 a C1-03 | ATENDIDO |
| V16.5.2 | L2 | GitHub fora do ar não perde evento: a sincronização falha antes de atualizar o estado, e a seguinte detecta; o despacho não depende do GitHub | ADR-018 (D1, D9) | E9, G9, G14 | ATENDIDO |
| V16.5.3 | L2 | falha no despacho não muda o resultado da sincronização nem cria notificação indevida; falha definitiva vira `FAILED` visível em toda execução; a execução da sincronização não fica presa em `RUNNING` | serviço e job | G8, G9, G12; C2-01, C2-04, C5-01 | ATENDIDO |
| V15.4.2, V15.4.3 | L3 | verificação de estado e registro atômicos sob o lock do projeto; nenhuma espera de lock dentro de transação interativa no despacho | detecção e despacho | E10, G5 | ATENDIDO (informativo, acima da meta) |
| V14.2.7 | L3 | descarte automático agendado da fila | `privacy-retention.js` | PV2 | ATENDIDO (informativo, acima da meta) |
| V16.4.2, V16.4.3 | L2 | proteção e envio dos logs para sistema separado | ambiente | — | NÃO VERIFICÁVEL LOCALMENTE (S2-10) |

**Não aplicáveis:**

| Requisitos | Justificativa |
|---|---|
| V1.3.x, salvo V1.3.3 | sem HTML rico, SVG, template, Markdown, SSRF, JNDI ou e-mail |
| V1.5.x | sem desserialização de objeto não confiável; o `outcome` é escrito e lido só pelo servidor |
| V2.3.1, V2.4.x | não há fluxo em etapas nem rota nova; o job é de operação e não tem superfície HTTP |
| V3.x, salvo V3.5.1; V3.7.2 | cookies, cabeçalhos, CORS e origem não mudam. Não há redirecionamento automático: o link externo é clicado pela pessoa, abre em nova aba com `rel="noopener noreferrer"` e só aponta para `https://github.com/` |
| V4.x | sem tipo novo de API, GraphQL ou WebSocket |
| V5, V6, V7, V9, V10, V11, V12 | sem arquivo, autenticação, sessão, token, OAuth, criptografia ou TLS novos; o token da GitHub App não é usado no despacho |
| V13.x, salvo V13.2.4 | sem segredo novo; o job usa a mesma `DATABASE_URL` da API |
| V17 | sem WebRTC |

## Delta S202-F29 — espera de trava nas transações interativas

A correção do S202-F29 (ADR-019) é transversal: limita a espera de trava em toda transação
interativa do backend. Evidência nos testes F1 e F2 de `test/unit`, `test/integration` e `test/api`
(`s202-f29-espera-de-trava.test.js`), nos commits `9dd8b6c` e `375a0fd` e nos mutantes MF01–MF10 de
`docs/issues/S202_F29_RELATORIO.md`.

| Requisito | Nível | Aplicação | Implementação | Evidência | Status |
|---|---|---|---|---|---|
| V15.4.2, V15.4.3 | L3 | estado verificado e alterado sob trava, sem espera indefinida; a espera nunca passa do prazo da transação | `src/database/lock-wait.js` no cliente compartilhado | F1-01 a F1-06 | ATENDIDO (informativo, acima da meta) |
| V16.3.4 | L2 | erro de banco registrado com o código do Prisma; espera esgotada com evento próprio | `error-handler.middleware.js` | F2-02 (sem título, nome ou e-mail no log) | ATENDIDO |
| V16.5.3 | L2 | a operação que encontra o recurso ocupado falha sozinha, com 409, sem efeito parcial e sem atingir outras requisições | limite por sessão, `RESOURCE_BUSY` e classificação na sincronização | F1-01 a F1-04, F2-01, F2-03 a F2-06 | ATENDIDO |

O `P2028` por trabalho lento continua possível e está no S202-F33 (avaliação do Prisma) e no S202-F30
(transações pesadas de 5 s).

## Delta S202-F33 — prazo próprio das transações interativas

A correção do S202-F33 (ADR-020) é transversal: nenhuma instrução fica em andamento quando o prazo
do Prisma vence, e a conexão não volta ao pool fora de sincronia. Evidência nos testes F1 e F2 de
`test/unit`, `test/integration` e `test/api` (`s202-f33-prazo-da-transacao.test.js`), no C2-04 de
`test/integration/s203-correcoes.test.js`, nos commits `d08c0fc` e `a58a075` e nos mutantes
MG01–MG12 de `docs/issues/S202_F33_RELATORIO.md`.

| Requisito | Nível | Aplicação | Implementação | Evidência | Status |
|---|---|---|---|---|---|
| V16.5.2 | L2 | a lentidão do banco numa operação não entrega resposta errada nem erro a outras requisições | prazo próprio com `KILL QUERY` em `src/database/transaction-guard.js`; segunda camada com `KILL` da conexão | F1-01 a F1-04, F2-01, F2-03 | ATENDIDO |
| V16.5.3 | L2 | falha fechada: a transação além do prazo é desfeita e nunca confirma, mesmo quando a instrução interrompida volta sem erro | `TransactionDeadlineError` e 503 `OPERATION_TIMEOUT` | F1-03, F2-01, F2-02 | ATENDIDO |
| V16.3.4 | L2 | prazo vencido, conexão descartada e pânico do motor registrados com código, sem dado pessoal | `error-handler.middleware.js`, envoltório e `health.js` | F2-02, F2-03, F2-05 | ATENDIDO |

A reavaliação do Prisma 7 está no S202-F36.
