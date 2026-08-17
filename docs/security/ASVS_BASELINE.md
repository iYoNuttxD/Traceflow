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
| 4.1.1 `Content-Type` correto | respostas JSON com charset; limites de payload globais | testes HTTP existentes |
| 8.2.1 acesso a função por permissão explícita | `requiredRole` vigente aplicado às rotas novas, sem alterar o resolvedor de papéis | teste `403` para VIEWER em mutação |
| 8.2.2 acesso a dado (IDOR/BOLA) | `resolveProjectId` estendido + filtro por `projectId` nos repositories | teste obrigatório de isolamento entre projetos, todos os métodos |
| 8.3.1 autorização em camada confiável | middleware + verificação de pertencimento no service; nada depende da UI | teste de API sem passar pelo frontend |
| 16.2.2 timestamps em UTC | `generatedAt`, `startedAt`, `completedAt`, `occurredAt` | `sprint.calculator.test.js` (normalização de offset) |
| 16.3.2 falhas de autorização registradas | `403`/`404` chegam ao logger sem dado sensível | logger com redaction existente |
| 16.3.3 eventos de segurança definidos | `AuditEvent` em todas as mutações de sprint, marco e vínculo | `schedule-contracts.test.js` |
| 16.5.1 mensagem genérica em erro inesperado | `asyncHandler` com `fallbackMessage` por operação; `details` sem eco de valor recebido | teste de resposta de erro |

## Lacunas prioritárias

1. store distribuído para sessões operacionais, rate limiting e exclusão mútua do sync;
2. secret manager, rotação automatizada e telemetria/alertas operacionais;
3. MFA, confirmação de e-mail e endurecimento adicional da recuperação de conta;
4. TLS, proxy, CSP do host da SPA, backup e retenção comprovados no ambiente real;
5. SBOM, gate de licenças e validação jurídica da política de privacidade.

As lacunas possuem rastreabilidade em `docs/issues/TECHNICAL_BACKLOG.md`. O estado `ATENDIDO` sempre se limita à evidência citada e não equivale a conformidade total do produto ou da operação.
