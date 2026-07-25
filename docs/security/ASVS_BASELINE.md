# Baseline OWASP ASVS 5.0 do TRACEFLOW

## Escopo e fonte

Esta é uma matriz de evidências aplicáveis ao MVP após a E5. **Não declara conformidade ASVS L2.** O artefato ASVS 5.0 citado no prompt não foi encontrado no checkout; foi usado o CSV oficial `OWASP_Application_Security_Verification_Standard_5.0.0_en.csv` da [release oficial OWASP/ASVS](https://github.com/OWASP/ASVS/releases/tag/latest), consultada em 24/07/2026.

Estados: `IMPLEMENTADO`, `PARCIAL`, `AUSENTE`, `NÃO_APLICÁVEL`, `NÃO_VERIFICADO`.

| Controle | Aplicabilidade | Estado | Evidência | Lacuna / etapa futura |
|---|---|---|---|---|
| V1.2.4 queries parametrizadas | Aplicável | IMPLEMENTADO | Prisma, sem SQL raw identificado | manter revisão de novas queries |
| V1.3.6 SSRF | Aplicável | IMPLEMENTADO | `shared/security/ssrf.js`, URL HTTPS/hosts oficiais e base Octokit fixa | revisar cada nova integração/redirect |
| V2.4.1 anti-automação | Aplicável | PARCIAL | limiters geral, join, GitHub e trava de sync | store distribuído, identidade e limites por usuário E6/infra |
| V3.4.1 HSTS | Aplicável em produção HTTPS | PARCIAL | Helmet habilita 1 ano/subdomínios somente em produção | validar proxy/HTTPS e host da SPA |
| V3.4.2 CORS allowlist | Aplicável | IMPLEMENTADO | allowlist por ambiente; wildcard proibido; preflight testado | revisar origens no deploy |
| V3.4.3 CSP | Aplicável | PARCIAL | API usa CSP restritiva | CSP do servidor da SPA não está neste repositório |
| V3.4.4 `nosniff` | Aplicável | IMPLEMENTADO | Helmet e teste HTTP | validar também host da SPA |
| V3.4.5 Referrer Policy | Aplicável | PARCIAL | `no-referrer` na API | validar host da SPA |
| V3.4.6 `frame-ancestors` | Aplicável | PARCIAL | CSP `frame-ancestors 'none'` e X-Frame-Options na API | aplicar no documento HTML da SPA |
| V3.5.1/V3.5.2 proteção de origem/CSRF | Futuramente aplicável | PARCIAL | CORS e content type; não há cookie/sessão | CSRF e sessão pertencem à E6; CORS não é autenticação |
| V4.1.1 Content-Type correto | Aplicável | IMPLEMENTADO | Express JSON e rejeição `415` para body inesperado | observar novos formatos/upload |
| V4.1.3 headers do proxy confiáveis | Aplicável no deploy | PARCIAL | `TRUST_PROXY` não aceita `true`, admite hops/faixas explícitas | topologia do proxy não existe no repo |
| V6 autenticação | Aplicável | AUSENTE | nenhuma identidade/login | E6 |
| V7 sessão | Aplicável após E6 | AUSENTE | nenhuma sessão/cookie | E6 |
| V8 controle de acesso | Aplicável | AUSENTE | rotas anônimas; apenas invariantes pontuais | BOLA/IDOR deny-by-default na E6 |
| V12.2.1/V12.3.1 TLS | Aplicável | PARCIAL | GitHub usa HTTPS e certificado validado pelo Node | TLS inbound e MySQL TLS dependem do deploy |
| V13.2.6 timeout/retry externo | Aplicável | IMPLEMENTADO | Octokit 15s, retries limitados/backoff/jitter | sem circuit breaker/telemetria distribuída |
| V13.3.1 secret manager | Aplicável | AUSENTE | env, redaction, scanner e política apenas | secret manager/identidade de workload futura |
| V13.4.5 endpoints de monitoramento | Aplicável | PARCIAL | health não expõe causa/URLs | definir exposição de readiness no deploy |
| V14.3.2 anti-cache | Aplicável | IMPLEMENTADO | `Cache-Control: no-store` em `/api` | validar assets/documento da SPA conforme sensibilidade |
| V15.1.1 prazo de remediação | Aplicável | IMPLEMENTADO | `DEPENDENCY_RISK_REGISTER.md` | formalizar owner/SLA corporativo |
| V15.1.2 inventário/SBOM | Aplicável | PARCIAL | lockfiles e audit | SBOM automatizada E14 |
| V15.3.4 IP via proxy | Aplicável | PARCIAL | trust proxy explícito e limiter usa `req.ip`/IPv6 normalizado | validar ingress real e proteção de headers |
| V16.1.1 inventário de logs | Aplicável | PARCIAL | E3/E5 documentam formato/eventos | acesso, destino e retenção dependem da operação/E7 |
| V16.2.2 timestamp com zona | Aplicável | IMPLEMENTADO | ISO-8601 UTC | sincronização do host não verificada |
| V16.2.4 formato correlacionável | Aplicável | IMPLEMENTADO | JSON estruturado + request ID | agregador externo não configurado |
| V16.2.5 dados sensíveis em logs | Aplicável | IMPLEMENTADO | redaction e testes de token/DB/e-mail | revisão contínua de novas chaves |
| V16.3.4 erros/controles falhos logados | Aplicável | IMPLEMENTADO | error handler e eventos sensíveis sanitizados | alertas/monitoramento não implementados |
| Upload de arquivos | Não existe no MVP | NÃO_APLICÁVEL | nenhuma rota multipart/upload | reavaliar se a função surgir |

## Lacunas L2 prioritárias

1. autenticação, sessão e autorização por projeto/recurso (E6);
2. convite criptograficamente seguro, hash, expiração, revogação e resposta uniforme (E6);
3. classificação/retenção/acesso a logs e dados pessoais, mais auditoria de negócio (E7);
4. TLS/proxy/headers do host SPA e limiter distribuído no ambiente de produção;
5. secret manager, SBOM, dependency review e scanner obrigatório no CI (E14).

## Atualização E6

Sem declarar conformidade ASVS L2: V6 permanece **PARCIAL** (Argon2id, resposta uniforme, inatividade, reset e entrega SMTP configurável); V7 permanece **PARCIAL** (sessão opaca hashada, cookie, expiração/revogação, CSRF e limpeza operacional); V8 passa a **IMPLEMENTADO no escopo RBAC atual** (matriz documentada, BOLA 404, 403 por papel, administração canônica e proteção do último OWNER). V3.5.1/V3.5.2 está **IMPLEMENTADO no escopo atual**. Lacunas: MFA/SSO, store distribuído, monitoramento/agendamento operacional, gestão real do SMTP e controles de auditoria/privacidade da E7.

## Atualização E7

Sem declarar conformidade: V16 ganha evidência **IMPLEMENTADA no escopo dos eventos definidos** em `AuditEvent`, consultas restritas, metadata allowlist, request ID, rollback obrigatório e retenção; direitos do titular e minimização têm evidência técnica em `modules/privacy` e `docs/privacy`. Permanecem lacunas em confirmação de e-mail, backups/logs externos, legal hold e validação jurídica/operacional.

## Atualização E9

Sem declarar conformidade: V1.3.6 e V13.2.6 ganham evidência adicional no factory/client GitHub com base fixa, provider de credencial, timeout/retry já centralizados, paginação explícita, DTOs mínimos e testes sem rede real. A sincronização ganhou idempotência por identificador externo, trava por projeto na instância e estado de falha auditável. Permanecem lacunas em credencial por instalação, lock/store distribuído, checkpoint e smoke operacional autorizado.
