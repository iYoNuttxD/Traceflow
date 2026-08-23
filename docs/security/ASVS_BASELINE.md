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
| Autorização por projeto e objeto | ATENDIDO no escopo RBAC atual | `backend/src/shared/auth/`; `docs/security/AUTHORIZATION_MATRIX.md`; testes 403/404 e isolamento entre projetos | não representa ABAC nem autorização fora dos papéis atuais |
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

## Lacunas prioritárias

1. store distribuído para rate limiting em implantação horizontal; sessões e exclusão mútua do sync já usam persistência no banco;
2. secret manager, rotação automatizada e telemetria/alertas operacionais;
3. MFA e endurecimento operacional adicional da recuperação/verificação de conta;
4. TLS, proxy, CSP do host da SPA, backup e retenção comprovados no ambiente real;
5. SBOM, gate de licenças e validação jurídica da política de privacidade.

As lacunas possuem rastreabilidade em `docs/issues/TECHNICAL_BACKLOG.md`. O estado `ATENDIDO` sempre se limita à evidência citada e não equivale a conformidade total do produto ou da operação.
