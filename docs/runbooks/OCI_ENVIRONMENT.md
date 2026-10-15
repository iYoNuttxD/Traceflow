# OCI — contrato de ambiente e runtime

> Continuação OCI06.1: consultar o [bootstrap inicial preparado](OCI_HEATWAVE_INITIAL_BOOTSTRAP.md)
> para o estado atualizado informado pelo operador e os lotes administrativos. Nenhuma execução autorizada.

Escopo OCI-DEPLOY-03: preparação local; não autoriza deploy, migrations no HeatWave,
configuração de ingress/systemd nem acesso a segredos reais. O resultado isolado de
[OCI-DEPLOY-02](../deliveries/OCI_DEPLOY_02_MYSQL_ARM64_COMPATIBILITY_REPORT.md)
continua distinto da homologação gerenciada de TLS, certificados e privilégios.

## Decisões de contrato

- Produção exige URLs públicas HTTPS explícitas, sem credenciais embutidas ou destinos locais;
  `FRONTEND_URL` e a allowlist CORS representam origens exatas. O perfil HTTP de produção
  não aceita `RATE_LIMIT_PROFILE=development`.
- API escuta em `127.0.0.1:3001`. `HTTP_HOST` público e `TRUST_PROXY` diferente de
  `loopback` são recusados em produção. Desenvolvimento conserva o bind/configuração local.
- Nginx deve sobrescrever Host/X-Forwarded-Host com o domínio autorizado, X-Forwarded-Proto
  com `https` e X-Forwarded-For com um único IP validado. Deve validar CF-Connecting-IP
  apenas de pares Cloudflare autorizados; nunca repassar diretamente o header do cliente.
  Express não lê CF-Connecting-IP. Um processo local é parte da fronteira de confiança.
- SMTP mantém Nodemailer: TLS implícito na porta 465; STARTTLS obrigatório em produção
  quando não implícito (587), certificados verificados e timeouts finitos. Falhas externas
  não retornam texto bruto do servidor SMTP. Nenhum provedor definitivo é escolhido.
- SIGTERM/SIGINT inicia draining, impede novas requisições, encerra SSE, aguarda HTTP e
  sincronizações manuais deste processo e só então desconecta Prisma. Um único deadline
  inclui a desconexão. Expirado, o processo sai com erro sem fabricar estado terminal,
  liberar leases ou desconectar Prisma sob uma sincronização ainda ativa.
- Readiness é somente leitura, limitada por timeout e sem consultas concorrentes acumuladas:
  configuração, estado local, banco/schema e storage. Não migra, cria diretório ou reconcilia.
  Liveness permanece independente de MySQL, SMTP e GitHub.
- Storage de produção deve existir, ser privado, absoluto e sem symlinks, fora da release
  e da raiz pública: `/var/lib/traceflow/test-evidence`. Provisionamento pertence à OCI-04.
- Frontend usa `/api` em produção, compartilhado por Axios e EventSource. `VITE_*` é público;
  build só aceita as configurações públicas previstas. Rotas e contratos HTTP permanecem.
- Worker continua independente, com scheduler habilitado obrigatório no seu entry point em
  produção. API não inicia scheduler. Política de jitter, concorrência, leases/fencing e
  recuperação não muda. O contrato compartilhado de ambiente é preservado.

## Fontes técnicas

[Express atrás de proxies](https://expressjs.com/en/guide/behind-proxies/),
[Nodemailer SMTP](https://nodemailer.com/smtp),
[Vite: ambiente e modos](https://vite.dev/guide/env-and-mode).

## Inventário do ambiente

Fontes executáveis: `backend/src/config/env.js`, `test-evidence.validation.js` e
`frontend/src/api/api-base.js`. Exemplos: [backend](../../backend/.env.production.example),
[frontend](../../frontend/.env.production.example). Valores vazios significam configuração
pendente, nunca credencial utilizável. Não copiar o exemplo de desenvolvimento para produção.

| Variáveis | Classificação | Contrato / default |
|---|---|---|
| `NODE_ENV` | REQUIRED_PRODUCTION, INTERNAL | `production`; fora disso o default é development |
| `DATABASE_URL` | REQUIRED_PRODUCTION, SECRET, INTERNAL, WORKER | URL MySQL; sem fallback de produção. TLS estrito e identidade gerenciada ainda são gate operacional |
| `PRIVACY_PSEUDONYMIZATION_KEY` | REQUIRED_PRODUCTION, SECRET, WORKER | ao menos 32 bytes; chave estável provisionada fora do Git |
| `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS` | REQUIRED_PRODUCTION, PUBLIC_URL, WORKER | origens HTTPS exatas; allowlist inclui frontend; sem wildcard |
| `PASSWORD_RESET_URL`, `INVITATION_ACCEPT_URL`, `EMAIL_VERIFICATION_URL`, `EMAIL_CHANGE_CONFIRM_URL`, `ACCOUNT_REACTIVATION_URL` | REQUIRED_PRODUCTION, PUBLIC_URL, WORKER | caminhos do exemplo conferidos em `AppRoutes.jsx`; HTTPS, sem destino local nem usuário/senha |
| `HTTP_HOST`, `PORT` | OPTIONAL_PRODUCTION, INTERNAL | produção: 127.0.0.1 e 3001; host público recusado. Dev sem host explícito mantém bind anterior |
| `TRUST_PROXY` | REQUIRED_PRODUCTION, INTERNAL | exatamente loopback em produção; false em dev |
| `RATE_LIMIT_PROFILE` | OPTIONAL_PRODUCTION, INTERNAL | production em produção; development proibido nesse ambiente |
| `EMAIL_PROVIDER`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER` | REQUIRED_PRODUCTION ou OPTIONAL_PRODUCTION, INTERNAL, WORKER | provider default smtp em produção; from/host/user obrigatórios; porta default 587; secure default true só para 465 |
| `SMTP_PASSWORD` | REQUIRED_PRODUCTION, SECRET, WORKER | sem default |
| `SMTP_CONNECTION_TIMEOUT_MS`, `SMTP_GREETING_TIMEOUT_MS`, `SMTP_SOCKET_TIMEOUT_MS` | OPTIONAL_PRODUCTION, INTERNAL, WORKER | 10000 / 10000 / 20000; conexão inclui DNS/handshake; greeting limita saudação/STARTTLS; socket limita inatividade |
| `GITHUB_APP_ID`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_SLUG` | REQUIRED_PRODUCTION, INTERNAL, WORKER | identificadores da mesma App em API/worker; não são segredos |
| `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY_BASE64`, `GITHUB_APP_WEBHOOK_SECRET` | REQUIRED_PRODUCTION, SECRET, WORKER | sem defaults; nunca copiar chave/token para frontend ou relatório |
| `GITHUB_APP_CALLBACK_URL`, `GITHUB_LOGIN_CALLBACK_URL`, `GITHUB_APP_FRONTEND_SUCCESS_URL`, `GITHUB_APP_FRONTEND_ERROR_URL` | REQUIRED_PRODUCTION, PUBLIC_URL, WORKER | HTTPS explícito; callbacks de instalação e identidade separados |
| `TEST_EVIDENCE_STORAGE_DIR` | REQUIRED_PRODUCTION, INTERNAL, WORKER | absoluto, existente, privado, sem symlinks e fora de release/webroot; validado antes de escutar |
| `SHUTDOWN_TIMEOUT_MS`, `READINESS_TIMEOUT_MS` | OPTIONAL_PRODUCTION, INTERNAL | 30000 (1000–120000) / 3000 (100–10000) |
| `TEST_DATABASE_URL` | TEST_ONLY, SECRET | obrigatória em testes persistentes; nunca substituir por DATABASE_URL |
| `EMAIL_PROVIDER=capture`, defaults locais de URLs | DEVELOPMENT_ONLY, TEST_ONLY | recusados em produção |
| `VITE_API_URL`, `VITE_API_TIMEOUT_MS` | PUBLIC_URL / OPTIONAL_PRODUCTION | `/api`, 15000; build recusa outra base, timeout inválido e outras variáveis VITE |

O worker importa o contrato compartilhado: também exige SMTP, privacidade, URLs e storage
absoluto. Isso é documentado, preservando a configuração existente sem uma segunda implementação.
A verificação do filesystem pertence ao startup/readiness da API; o worker não manipula evidências.

Opcionais existentes preservadas (sem criar jobs de limpeza ou mudar a política):

| Grupo | Variáveis e defaults |
|---|---|
| HTTP/CORS | `BODY_LIMIT=100kb`; `CORS_ALLOWED_METHODS=GET,POST,PUT,PATCH,DELETE,OPTIONS`; `CORS_ALLOWED_HEADERS=Content-Type,X-Request-Id,X-CSRF-Token` |
| Rate limiting legado | `RATE_LIMIT_WINDOW_MS=900000`, `RATE_LIMIT_MAX=200`, `SENSITIVE_RATE_LIMIT_MAX=20`; preservados para consumidores legados |
| Rate limiting vigente | `RATE_LIMIT_GLOBAL_WINDOW_MS=60000`, `RATE_LIMIT_GLOBAL_MAX=1000`; `RATE_LIMIT_READ_BURST_WINDOW_MS=10000`, `RATE_LIMIT_READ_BURST_MAX=60`; `RATE_LIMIT_READ_WINDOW_MS=300000`, `RATE_LIMIT_READ_MAX=600`; `RATE_LIMIT_AUTH_WINDOW_MS=900000`, `RATE_LIMIT_AUTH_MAX=20`; `RATE_LIMIT_EMAIL_WINDOW_MS=3600000`, `RATE_LIMIT_EMAIL_MAX=5`; `RATE_LIMIT_SENSITIVE_WINDOW_MS=900000`, `RATE_LIMIT_SENSITIVE_MAX=20`; `RATE_LIMIT_EXPORT_WINDOW_MS=3600000`, `RATE_LIMIT_EXPORT_MAX=3` |
| Sessões | `SESSION_TTL_MS=28800000`, `PERSISTENT_SESSION_TTL_MS=2592000000`, `SESSION_COOKIE_NAME=traceflow_session`, `SESSION_COOKIE_SAME_SITE=lax`, `GITHUB_OAUTH_COOKIE_NAME=traceflow_github_oauth` |
| Tokens transacionais | `PASSWORD_RESET_TTL_MS=1800000`, `INVITATION_TTL_MS=604800000`, `EMAIL_VERIFICATION_TTL_MS=86400000`, `EMAIL_CHANGE_TTL_MS=1800000`, `ACCOUNT_REACTIVATION_TTL_MS=1800000` |
| GitHub states | `GITHUB_APP_STATE_TTL_MS=600000`, `GITHUB_OAUTH_STATE_TTL_MS=600000`, `GITHUB_REAUTHENTICATION_TTL_MS=600000` |
| Retenção auth/GitHub | `AUTH_SESSION_RETENTION_DAYS=30`, `AUTH_PASSWORD_RESET_RETENTION_DAYS=7`, `AUTH_INVITATION_RETENTION_DAYS=30`, `AUTH_EMAIL_VERIFICATION_RETENTION_DAYS=7`, `GITHUB_CONNECTION_STATE_RETENTION_DAYS=7`, `GITHUB_WEBHOOK_DELIVERY_RETENTION_DAYS=30` |
| Privacidade | `AUDIT_RETENTION_DAYS=365`, `DEACTIVATED_ACCOUNT_RETENTION_DAYS=30`, `EXPORT_FILE_TTL_MINUTES=15`, `PRIVACY_REQUEST_RETENTION_DAYS=365`, `ACCOUNT_DELETION_GRACE_DAYS=30` |
| Evidências (somente reduzir limites) | `TEST_EVIDENCE_MAX_FILE_BYTES=10485760`, `TEST_EVIDENCE_MAX_VIDEO_BYTES=52428800`, `TEST_EVIDENCE_MAX_PER_STEP=3`, `TEST_EVIDENCE_MAX_GENERAL=5`, `TEST_EVIDENCE_MAX_FILES=20`, `TEST_EVIDENCE_MAX_TOTAL_BYTES=104857600` |

## API, sessões e ingress futuro

Comando: `npm start --prefix backend` (ou Node 22 direto em `backend/src/server.js`, com
WorkingDirectory no backend). Manter um processo de API: rate limiter e SSE são locais ao
processo; sessões e SyncRuns são persistidos. Este contrato não adiciona suporte horizontal.

Cookies continuam HttpOnly, Secure em produção, SameSite=Lax por default, Path=/, sem Domain,
TTL comum de 8h ou persistente de 30 dias. Logout revoga a sessão e expira o cookie. Token de
sessão e CSRF permanecem hashados; mutations autenticadas exigem `X-CSRF-Token`. CORS aceita
somente a allowlist e não substitui CSRF/autorização. O backend não precisa confiar em headers
para decidir Secure: ele é obrigatório por ambiente.

O futuro Nginx deve preservar `/api` no upstream, servir SPA com fallback para `index.html`,
não cachear API/probes, não expor o diretório de evidências, controlar tamanho dos uploads e
sobrescrever headers encaminhados. `Host`/`X-Forwarded-Host` devem ser `traceflow.dev` validado;
`X-Forwarded-Proto=https`; X-Forwarded-For deve conter somente o IP validado pelo ingress.
Não usar `$proxy_add_x_forwarded_for` com cadeias recebidas sem saneamento. Não confiar em
CF-Connecting-IP vindo de origem não Cloudflare. A restrição loopback não distingue Nginx de
outro processo local: proteger acesso à VM/usuário de serviço continua necessário.

Timeouts Node: headers 15s, recebimento de request 60s e keep-alive 5s; não limitam execução de
handlers nem a duração do SSE. Streams atuais enviam heartbeat a cada 25s e têm lifetime 15min.
Ingress deve desabilitar buffering/cache para SSE, usar read timeout acima do heartbeat e
preservar webhook raw body/HMAC. Full(strict), Origin CA, SELinux Enforcing e firewalld continuam;
3001 e 3306 não devem ser expostas. Nenhum arquivo Nginx/systemd foi criado nesta entrega.

## Worker

Comando canônico: `npm run github:worker --prefix backend`.

| Variável WORKER | Default mantido |
|---|---:|
| `GITHUB_SCHEDULER_ENABLED` | false; **true obrigatório no entry point de produção** |
| `GITHUB_SYNC_INTERVAL_MS` | 1800000 |
| `GITHUB_SCHEDULER_TICK_MS` | 15000 |
| `GITHUB_AUTOMATIC_CONCURRENCY` | 2 |
| `GITHUB_SYNC_LEASE_MS` | 1800000 |
| `GITHUB_SYNC_BACKOFF_MAX_MS` | 21600000 |
| `GITHUB_REQUEST_TIMEOUT_MS` | 15000 |
| `GITHUB_RETRY_MAX` | 2 |
| `GITHUB_RETRY_MAX_DELAY_MS` | 60000 |

O worker não abre HTTP; heartbeat/leases/fencing, contenção, backoff e recuperação continuam
no [runbook canônico](GITHUB_AUTOMATIC_SYNC.md). API com scheduler flag true apenas registra
que o worker independente precisa ser iniciado. Worker desabilitado em desenvolvimento pode
continuar encerrando normalmente; em produção a configuração encerra com erro antes do start.

Futuros serviços: `traceflow-api.service` e `traceflow-github-worker.service`. A API tem deadline
interno 30s; planejar TimeoutStopSec maior (por exemplo 45s), validado operacionalmente. Worker
mantém `stop()` atual: bloqueia claims e aguarda jobs; não usa SHUTDOWN_TIMEOUT_MS. O limite final
vem do supervisor, preservando recuperação por lease se precisar terminar à força. Nunca usar
os 30 minutos de intervalo/lease como orçamento HTTP de parada.

## Health, startup e shutdown

| Endpoint | Retorno | Exposição planejada |
|---|---|---|
| `/health` | 200, contrato legado `status: ok` e mensagem estrutural | opcional público, sem cache; não comprova readiness |
| `/health/live` | 200, `status: ok`, sem MySQL/SMTP/GitHub | opcional público, sem cache |
| `/health/ready` | 200 `status: ready` ou 503 `status: not_ready` e mensagem genérica | restringir ao host/monitor operacional; no-store |

Readiness verifica configuração/estado, storage por lstat/realpath/access, SELECT 1, ledger da
cadeia que acompanha a release e tabelas operacionais Session/GitHubSyncRun. Exige SELECT em
`_prisma_migrations`; runtime não precisa DDL. Não prova drift completo de todas as tabelas:
validators de migration continuam obrigatórios antes da promoção. Não cria diretórios, seeds,
migrations ou auditoria. A verificação de permissões não grava um arquivo de prova; disk-full,
quota e perda do filesystem podem falhar depois e ainda retornam erro controlado de storage.

Há no máximo um probe em andamento por aplicação; após timeout responde 503 enquanto aguarda
sua resolução. Prisma 6 não oferece cancelamento individual seguro para essa consulta: a API
não desconecta o Client compartilhado para cancelar um probe. Configurar timeouts finitos de
conexão/pool/socket no contrato de banco homologado; monitorar indisponibilidade prolongada.

Durante drain, requests novas recebem 503 `SERVICE_DRAINING`, inclusive uma segunda verificação
após autenticação para impedir SSE tardio. Probes não informam ready no startup/drain. A API
fecha HTTP/SSE, aguarda as promises manuais registradas antes de setImmediate e inclui auditoria
na espera. Só desconecta Prisma após terminar HTTP e background. Deadline também limita
Prisma disconnect. Na expiração termina com código 1 sem fabricar resultado terminal e sem
liberar autoridade no banco; recuperação continua sendo responsabilidade de lease/fencing.

## SMTP, storage e diagnóstico

TLS mínimo 1.2, certificados validados, STARTTLS obrigatório quando não implícito, sem downgrade
nem retry automático. Timeouts da biblioteca limitam estabelecimento e inatividade; não são um
SLA de duração total para mensagens muito grandes ou servidor que continue respondendo.
SMTP_HOST deve ser o hostname certificado do provedor. Usar IP exige identidade TLS apropriada;
esta entrega não adiciona bypass de certificados nem escolhe provedor.

API exige storage existente no startup, com modo 0700 e proprietário do processo. Diretórios
ancestrais devem ser reais. Provisionar pelo usuário operacional autorizado, nunca dentro de
current ou releases. Downloads continuam autenticados/autorizados pela API. Backup e restore
precisam coordenar MySQL e arquivos; sem job novo de limpeza/retention nesta etapa.

| Sintoma | Diagnóstico sem segredos |
|---|---|
| Startup falha por configuração | nome da variável no erro; corrigir configuração fornecida pelo supervisor, nunca logar o ambiente inteiro |
| `TEST_EVIDENCE_STORAGE_UNAVAILABLE` | existência, ownership, modo, ancestrais/symlinks e política SELinux; não desativar SELinux |
| 503 readiness | estado de drain, acesso ao storage, conectividade/pool e ledger aplicado; consultar logs e status sem URL com senha |
| `EMAIL_DELIVERY_FAILED` | hostname/certificado, porta/mode, autenticação e tempos no provedor; não registrar resposta SMTP bruta |
| `shutdown_incomplete` | HTTP/background/disconnect excedeu orçamento; conferir SyncRun/lease; não editar slots manualmente |
| Worker encerra antes de start | contrato compartilhado e scheduler true no processo correto |
| UI sem API/SSE | confirmar build `/api`, prefixo preservado, cookies/CSRF e buffering do ingress |

## Gates e limites

Validações locais usam cópia sem `.env`, Node 22 e MySQL descartável do runner com host literal
loopback, porta efêmera, UUID/datadir/nonce e privilégios restritos ao prefixo proprietário.
`backend/scripts/validate-production-runtime.js` exige esses marcadores além de TEST_DATABASE_URL;
não aceita execução avulsa contra banco existente. O smoke inicia somente processos locais.
Testes SMTP geram certificado temporário próprio e não entregam e-mails fora do harness.

Antes de deploy ainda faltam homologação HeatWave/TLS/contas, provedor SMTP, segredos reais,
Ingress/Cloudflare-normalização real, systemd, storage/backup/restore, monitoração e rollback
operacional. Aprovação local desta entrega não elimina esses gates. Próxima etapa somente por
autorização explícita: OCI-DEPLOY-04.

Prisma gerado pode conter caminhos de `.env` do ambiente de geração. Por isso, não copiar
`node_modules` de desenvolvimento para release ou para um teste que alegue isolamento: usar
`npm ci` e `prisma generate` em workspace sem `.env`. O guard de `env.js` em produção não
controla o carregamento implícito realizado pelo código gerado de uma dependência.

## OCI-04.1 — Contrato adicional de uploads

Nove configurações `TEST_UPLOAD_*` sem segredos estão em `backend/.env.example` e na seção 27
do [runbook de uploads](OCI_RESUMABLE_UPLOADS.md). Defaults preservam os limites funcionais.
Configuração inválida impede o carregamento do serviço; o piso livre de 512 MiB só pode aumentar.
Não há variável Vite nova. `/api` continua na mesma origem. A API usa o root privado existente,
com `.uploads` abaixo dele; nenhuma credencial nova é necessária para o protocolo.

## OCI06.1 — banco gerenciado e CA pública

Produção usa `traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com:3306`, com resolução privada
esperada10.20.2.25 e CA pública `/etc/pki/traceflow/mysql-ca.pem`. Nenhuma URL com credencial foi
criada/versionada. `api.env` e `github-worker.env` fornecem DATABASE_URL próprias, explicitamente,
sem herdar ambiente DEV. Nome de schema e contas permanecem por confirmar.

| Processo / variável | TLS e orçamento obrigatório |
| --- | --- |
| API / DATABASE_URL | strict, CA definitiva, pool1–5, connect5/pool10/socket30 segundos |
| Worker / DATABASE_URL | strict, mesma CA, pool1–3, connect5/pool10/socket30 segundos |
| Diagnóstico / HEATWAVE_DIAGNOSTIC_DATABASE_URL | strict, CA definitiva, pool1, connect5/pool5/socket10; autorização privada<24h com target exato e fingerprintDER |
| Job / MIGRATION_DATABASE_URL e RUNTIME_DATABASE_URL | credenciais separadas e somente no job aprovado; orçamento até2 proposto, limites explícitos conforme operação; não herdar nas units |
| TEST_DATABASE_URL / TEST_RUNTIME_DATABASE_URL | somente instâncias descartáveis próprias; nunca credencial HeatWave |

O preflight das units recusa todas as variáveis de banco de teste/diagnóstico/job herdadas e
NODE_TLS_REJECT_UNAUTHORIZED=0. Não proibir genericamente TEST_*: TEST_EVIDENCE_STORAGE_DIR e
TEST_UPLOAD_* são configurações funcionais canônicas. API continua bind127.0.0.1/porta3001,
TRUST_PROXY=loopback, storage `/var/lib/traceflow/test-evidence`; worker independente.

CA pública root-owned0644, diretório0755, sem escrita de traceflow; fora de releases, webroot,
HOME e `/etc/traceflow` oculto. Nenhuma chave TLS entra no runtime. Fingerprint, instalação futura,
autorização e OpenSSL fornecido pelo operador estão no [runbook de homologação](OCI_HEATWAVE_HOMOLOGATION.md#oci-deploy-061--atualização-de-15102026).
TLS do servidor validado manualmente não homologa autenticação/sessão Prisma gerenciada.

## OCI06.1 — contas propostas para o primeiro bootstrap

O [runbook de bootstrap](OCI_HEATWAVE_INITIAL_BOOTSTRAP.md) fixa a proposta de schema
traceflow, contas traceflow_api/traceflow_worker/traceflow_diag/traceflow_migrator e origem
10.20.1.184 confirmada pelo operador. São propostas; nenhuma conta foi criada nesta preparação.
DATABASE_URL própria em api.env/github-worker.env permanece o contrato das units.
Não inserir admin, migrator, backup ou diagnóstico em runtime.env ou nas units.

CA pública no caminho definitivo e leitura por traceflow já foram confirmadas pelo operador;
não há reinstalação proposta. Charset/collation serão utf8mb4/utf8mb4_unicode_ci, preservando
as exceções explícitas da cadeia. Credenciais, paths administrativos e autorização permanecem
fora do Git; limites de pool/TLS e proibição de herdar URLs de teste/job não mudam.
