# OCI-DEPLOY-03 — Production Environment & Runtime

**Veredito do código e dos gates finais: PASS LOCAL.** Não é aprovação de deploy.
Ressalva de execução sobre a rodada focada inicial: seção 24. HeatWave gerenciado,
TLS/contas, ingress e supervisão reais continuam pendentes.

## 1. Baseline

- Repositório local: `/Users/daniel/Coding/Traceflow`; branch `daniel-dev`.
- HEAD observado: `2e97454716d1c570bf733cd2bd7000c7328be6e5`; working tree inicialmente limpo.
- O HEAD histórico informado era `11eeea3`. O commit posterior já contém a OCI-DEPLOY-02;
  seus scripts, testes, evidências, relatório e runbook foram preservados.
- Execução final: 14/10/2026, Node 22.23.3/npm 10.9.9, macOS ARM64. OCI informada usa
  Node 22.23.2/npm 10.9.8; nenhuma versão na VM foi alterada.

## 2. Escopo

Contrato de ambiente, bind/proxy, SMTP, lifecycle/readiness, storage e frontend same-origin.
Sem deploy, commit/push/PR, infraestrutura, banco persistente, alteração de migration,
novas funcionalidades de negócio, screenshots ou documentação acadêmica.

## 3. Auditoria inicial

Já corretos: sessão persistida/hash, CSRF, CORS allowlist, cookies por ambiente, limiter,
SSE, scheduler independente, leases/fencing, storage sem symlinks e camadas do domínio.
Lacunas confirmadas: bind sem host, URLs com default local, perfil de limiter permissivo em
produção, SMTP sem TLS obrigatório/timeouts explícitos, readiness sem prazo e parada HTTP
sem acompanhamento de sync manual; o deadline era removido antes de Prisma disconnect.

## 4. Contrato de ambiente

[Inventário completo e defaults](../runbooks/OCI_ENVIRONMENT.md), com as categorias solicitadas.
[Backend example](../../backend/.env.production.example) e
[frontend example](../../frontend/.env.production.example) contêm parâmetros públicos/campos
vazios, sem credenciais reais. `.gitignore` protege arquivos de ambiente e permite os exemplos.
Não foi criada uma segunda configuração para o worker; ele compartilha o contrato existente.

## 5. HTTP bind

Produção aceita somente `127.0.0.1`; PORT default 3001. IP público, wildcard e localhost
textual são recusados. Dev sem HTTP_HOST mantém o comportamento anterior. O smoke verificou
o endereço efetivo informado por `server.address()`, além do startup negativo.

## 6. URLs de produção

FRONTEND_URL, CORS, cinco URLs transacionais e quatro callbacks/retornos GitHub exigem HTTPS
público explícito, sem credenciais embutidas/destino local. Caminhos conferidos em AppRoutes.
Domínio previsto: `https://traceflow.dev`; API `/api`. Nenhuma rota nova de negócio.

## 7. Trusted proxy

Produção exige `TRUST_PROXY=loopback`. Testes Express mostram IP/protocolo/host corretos
quando normalizados pelo proxy e rejeição de headers forjados de peer não confiável.
CF-Connecting-IP não é autoridade no backend. A segurança final depende da normalização
Nginx e da validação do peer Cloudflare, documentadas e ainda não implementadas na VM.

## 8. CORS

Allowlist exata, sem wildcard, com frontend incluído e credenciais preservadas. Origem
estranha retorna 403. Mesma origem elimina a necessidade de liberação cruzada adicional.

## 9. Cookies e sessões

Arquitetura preservada. Smoke real: login, HttpOnly/Secure/SameSite=Lax, Path=/, Max-Age e
sem Domain; logout 204 expira cookie e invalida a sessão. Nenhum JWT foi introduzido.

## 10. CSRF

Token hashado e header X-CSRF-Token preservados. Smoke de produção recusou mutation sem
CSRF e aceitou criação de projeto sintético com sessão/token válidos no banco proprietário.

## 11. Rate limiting

RATE_LIMIT_PROFILE=development é recusado em produção. Limites canônicos não foram
reduzidos; testes negativos comprovam que spoofing não troca a chave do cliente externo.
Contadores continuam por processo; implantação horizontal não está aprovada.

## 12. SMTP e TLS

Nodemailer existente: STARTTLS obrigatório em produção sem TLS implícito; 465 usa TLS
implícito, 587 exige a configuração correspondente. Certificados validados, TLS mínimo 1.2,
sem downgrade, debug ou resposta SMTP bruta em erros. Código numérico 4xx/5xx preserva a
classificação temporária/permanente existente. Testes usam peer loopback e certificado
sintético temporário, sem encaminhar mensagens. Provedor real permanece por definir.

## 13. SMTP timeouts

Conexão/DNS 10s, saudação/STARTTLS 10s e inatividade 20s, configuráveis dentro de limites.
Testados: ausência de STARTTLS, certificado não confiável, credencial inválida, conexão,
saudação, handshake e resposta final parados. Sem retries automáticos. São timeouts de
transporte, não um SLA absoluto de entrega; adequar timeout do cliente/ingress ao provedor.

## 14. API lifecycle

Estado starting → ready → draining. Middleware recusa novas operações com 503
SERVICE_DRAINING e Connection: close. Segunda verificação após auth impede SSE tardio.
API não inicia scheduler. Startup exige storage pronto, sem provisioná-lo implicitamente.

## 15. Graceful shutdown

Um deadline inclui HTTP, SSE, background e disconnect (30s default da API). Mantém handlers
para sinais repetidos e cleanup idempotente. Responses ativas não se tornam keep-alive
indefinido; SSE já com headers enviados tem sockets ociosos fechados após finish. Os testes
com processos reais detectaram essa corrida e passaram após a correção, sem aumentar o prazo.
Prisma disconnect travado termina com exit 1; nenhum shutdown espera indefinidamente.

## 16. Sincronizações manuais

Registro da promise ocorre antes de setImmediate e é removido em ambos os resultados.
Espera inclui persistência, auditoria e heartbeat final. Teste com MySQL real manteve RUNNING
até liberar a pipeline controlada e confirmou SUCCEEDED/auditoria antes de concluir a espera.
No deadline não desconecta sob trabalho ativo nem fabrica estado terminal/libera lease.
Recuperação e fencing existentes continuam cobertos pela suíte completa.

## 17. GitHub Worker

Comando preservado: `npm run github:worker --prefix backend`. Entry point de produção
recusa scheduler false; dev mantém opt-out. Sem alterações de jitter, slots, leases, fencing,
backoff ou retry. Worker stop/drain existente permanece; limite final será do supervisor.
Não foram criadas unidades systemd nem iniciado worker funcional na VM ou no banco persistente.

## 18. Liveness

`/health` e `/health/live` preservados, independentes de MySQL, SMTP e GitHub. Smoke manteve
200 em liveness quando storage ou autenticação no MySQL proprietário falhou.

## 19. Readiness

`/health/ready`: configuração, lifecycle, storage, SELECT 1, ledger completo da release e
acesso às tabelas Session/GitHubSyncRun. 200 ready ou 503 genérico/no-store, default 3s.
Somente leitura. Um único probe pendente evita acumular queries após timeout; não cancela
Prisma compartilhado. Não substitui schema drift completo, nem prova espaço/quota livre.

## 20. Frontend same-origin

Base única em `api/api-base.js`, reutilizada por Axios e SSE. Builds exigem `/api`, inclusive
com modo Vite customizado; desenvolvimento conserva localhost. Sem alteração visual.

## 21. EventSource/SSE

EventSource usa a base compartilhada e withCredentials. Reconexão e consumers existentes
foram preservados. Smoke encerrou um stream real junto com a API; testes de processo
cobrem SSE ativo e sinais duplicados. Nginx deverá preservar heartbeat e desabilitar buffering.

## 22. Bundle de produção

Build aprovado com validação automática de index.html, API local operacional e padrões
óbvios de credencial. Apenas VITE_API_URL/TIMEOUT são aceitas; o teste não confunde o literal
inofensivo `http://localhost` do parser Axios com uma API operacional. Testes cobrem login,
CSRF, FormData e blob com a base /api. SPA continua BrowserRouter; fallback real é da OCI-04.
O scanner de padrões não constitui prova matemática de ausência de qualquer segredo arbitrário.

## 23. Storage persistente

`/var/lib/traceflow/test-evidence`: absoluto, existente, real, sem symlinks, proprietário do
processo, modo 0700 e acesso R/W/X. Produção não cria a raiz automaticamente. Release,
frontend/webroot, `/opt/traceflow` e `/var/www` são recusados. Download privado permanece
pela API. Smoke/testes usam diretórios temporários e validam indisponibilidade e symlinks.

## 24. Segurança

ASVS 5.0 é referência, sem alegar conformidade integral. Nenhum segredo real foi inserido,
exibido ou alterado; não se leu o conteúdo de `.env` por comandos de inspeção.

**Ressalva de isolamento:** focos iniciais reutilizaram node_modules por symlink. Na revisão,
identificou-se que o Prisma gerado local contém schemaEnvPath para `.env` da origem e seu
loader pode lê-lo implicitamente. Não é possível afirmar ausência dessa leitura interna
nessa rodada, que não é usada como evidência de isolamento. Os testes focados não executaram
queries reais; Client de teste tinha datasource explícito para loopback/porta sem MySQL.
Os processos terminaram, o symlink foi removido e os gates finais usaram npm ci/Prisma generate
em workspace descartável sem `.env`, com banco comprovadamente proprietário. O PASS LOCAL
refere-se ao código e a esses gates finais; a ressalva permanece registrada, sem apagá-la.

## 25. Banco isolado

Final: MySQL 8.4.8 em `127.0.0.1:61201`, schema `tf_oci_946abdb2624f_test`, UUID
`06646a06-c783-11f1-b644-03d83375b323`. Processo novo, datadir/nonce/PID comprovados antes de
fixtures. Usuário restrito ao prefixo; leitura administrativa negada, senha errada rejeitada.
TEST_DATABASE_URL obrigatória; nenhum fallback a desenvolvimento. Duas instâncias da rodada
foram encerradas e seus diretórios removidos com guard de propriedade. Nada na OCI acessado.

## 26. Testes backend

**1.937 PASS, 0 FAIL, 5 skips legados; 160 arquivos.** Total 1.942. Sem skips novos.
Quatro skips pré-LR.2 em e11-legacy-responsibility e um em e6-backfill já existiam.
Inclui domínios completos, segurança, manual/automatic sync, concorrência e fencing.
[Evidência](evidence/oci-deploy-03/backend.json).

## 27. Testes frontend

**1.493 PASS, 0 FAIL, 0 skips; 120 arquivos.** Coverage e build aprovados.
[Evidência](evidence/oci-deploy-03/frontend.json).

## 28. Runtime controlado

12 controles no smoke de produção: bind efetivo, health/schema/storage, storage degradado,
origem negada, cookie seguro, CSRF, logout, SSE/SIGTERM idempotente, parada ociosa, falha de
credencial no banco proprietário, startup inseguro/worker desabilitado e logs sem sentinelas
secretas. Sem GitHub real ou SMTP externo. Cenários A–G também usam processos filhos reais,
com trabalho HTTP/background controlado e Prisma disconnect simulado quando travado.

## 29. Gates completos

| Gate | Resultado |
|---|---|
| Backend full/coverage | PASS: statements 92,50%; branches 87,26%; functions 95,35%; lines 94,81% |
| Frontend full/coverage | PASS: statements 86,14%; branches 81,00%; functions 82,00%; lines 88,62% |
| Thresholds | mantidos: backend 85/70/85/87; frontend 50/45/40/53 (mesma ordem acima) |
| Prisma 6.12 validate/generate | PASS em workspace próprio sem .env |
| Cadeia SQL oficial | 67/67 aplicadas somente em vazio descartável; arquivos imutáveis |
| Validators de migrations | 14 invocações PASS, incluindo drift e controle negativo; [evidência](evidence/oci-deploy-03/migration-validators.json) |
| Lint/format backend e frontend | PASS |
| Build frontend | PASS, contrato /api e bundle verificado |
| Arquitetura/secret scan | PASS |
| Política de CI, audit e inventário UI | 90 testes PASS |
| Auditoria dependências | backend/frontend: 0 HIGH, 0 CRITICAL, 0 exceções |
| Formato do workflow/policy e git diff --check | PASS |

[Gates](evidence/oci-deploy-03/quality-gates.json) e
[hashes das fontes/testes](evidence/oci-deploy-03/source-sha256.json).
São gates locais do workflow: não CI remota nem reprodução idêntica de runner Linux
(`lower_case_table_names=2` no MySQL macOS). ARM64/Oracle Linux da OCI-02 não foi repetido.

Tentativas relevantes: a primeira suíte completa teve 1.933 PASS/2 FAIL/5 skips. Falharam
mocks antigos sem setHeader e sem as novas opções SMTP; as expectativas foram atualizadas
explicitamente, sem relaxar assertions. O reporter temporário foi corrigido para sanitizar
strings antes de serializar JSON; nenhum arquivo da OCI-02 foi alterado. A segunda execução
passou sem retry automático. Os validators, cuja cadeia não mudou, não foram repetidos.

## 30. Alterações realizadas

| Grupo / arquivos principais | Justificativa, impacto e risco residual | Aceite / testes |
|---|---|---|
| env.js; novos exemplos; .gitignore | rejeitar produção ambígua; configs antigas precisam atualização explícita | config positiva/negativa, nomes sem segredos, startup negativo |
| server.js, app.js; novo lifecycle.js | loopback, draining, timeouts de recepção e SSE tardio | bind real, saúde e sinais A–G |
| graceful-shutdown.js; novo background-tasks.js; github-sync-run.service.js | acompanhar trabalho sem mudar autoridade persistida; timeout pode exigir recuperação por lease | pipeline real/auditoria, deadline, disconnect e sinais duplicados |
| health.js; novo database/readiness.js; storage local/index | schema/storage somente leitura com prazo; exige raiz pré-provisionada e SELECT do ledger | ready saudável/degradado, symlink/permissão, nenhum mkdir de health |
| email.provider.js | TLS e limites sem nova dependência; provedor real pendente | peer SMTP/TLS local, negativos e sem downgrade |
| github-worker.js | configuração desabilitada em produção falha com exit não zero | assert de ambiente e startup do entry point |
| HTTP client/SSE; novos api-base.js, vite.config.js, production-contract.js | mesma base /api; build inválido falha antes de gerar artefato | testes same-origin, bundle, full frontend |
| Testes novos/ajustados e validate-production-runtime.js | regressão e smoke protegido por ownership, sem banco existente | full suites + smoke em instância nova |
| Runbook/relatório e contratos técnicos | registrar defaults, limites e dependências reais | revisão de caminhos, hashes, gates e diff |

O inventário completo de arquivos consta abaixo; nenhuma migration, schema Prisma, dependência,
lockfile, workflow, documento acadêmico ou artefato OCI-02 foi modificado.

## 31. Limitações restantes

HeatWave gerenciado/TLS/certificados/privilégios e configuração DATABASE_URL definitiva não
foram homologados; o parser desta etapa não atesta TLS do banco. O smoke local usou o MySQL
proprietário da validação, não o serviço OCI. TLS/proxy reais, SMTP escolhido, segredos reais,
SELinux/persistência operacional, supervisão, carga, backups/restore e rollout/rollback ainda
precisam de validação própria. A ressalva da rodada focada inicial da seção 24 permanece.

## 32. Dependências para OCI-DEPLOY-04

Revisar esta entrega; decidir provedor SMTP e entrega protegida de segredos; preparar ingress
com headers normalizados/prefixo/SSE/SPA; provisionar storage/SELinux; definir API/worker em
serviços separados com deadlines e observabilidade. Resolver o gate HeatWave/TLS antes de
migrations/runtime no banco gerenciado. Publicação e mudanças operacionais exigem autorização
própria; não foram criados arquivos Nginx/systemd nem iniciada a próxima etapa.

## 33. Final verdict

**OCI-DEPLOY-03 — PRODUCTION ENVIRONMENT & RUNTIME — PASS LOCAL**, no escopo de código e
validações finais descritos, com a ressalva de isolamento inicial registrada na seção 24.
Não há autorização/evidência de deploy ou homologação do HeatWave. Sem commit/push.

Próxima entrega recomendada: **OCI-DEPLOY-04 — Nginx, Systemd, Persistent Storage & Production
Services**, somente após revisão e autorização explícita. Trabalho encerrado nesta entrega.

### Inventário de arquivos desta entrega

- `.gitignore`
- `README.md`
- `backend/.env.production.example`
- `backend/scripts/validate-production-runtime.js`
- `backend/src/app.js`
- `backend/src/config/env.js`
- `backend/src/database/readiness.js`
- `backend/src/github-worker.js`
- `backend/src/modules/github/services/github-sync-run.service.js`
- `backend/src/modules/testCases/index.js`
- `backend/src/modules/testCases/storage/local-test-evidence.storage.js`
- `backend/src/server.js`
- `backend/src/shared/email/email.provider.js`
- `backend/src/shared/http/health.js`
- `backend/src/shared/runtime/background-tasks.js`
- `backend/src/shared/runtime/graceful-shutdown.js`
- `backend/src/shared/runtime/lifecycle.js`
- `backend/test/api/mvp-contracts.test.js`
- `backend/test/fixtures/production-lifecycle-process.js`
- `backend/test/helpers/production-environment.js`
- `backend/test/helpers/smtp-server.js`
- `backend/test/integration/github-automatic-sync.test.js`
- `backend/test/unit/e6-continuation.test.js`
- `backend/test/unit/env.test.js`
- `backend/test/unit/health-shutdown.test.js`
- `backend/test/unit/production-environment.test.js`
- `backend/test/unit/production-lifecycle.test.js`
- `backend/test/unit/production-proxy.test.js`
- `backend/test/unit/production-signals.test.js`
- `backend/test/unit/production-smtp.test.js`
- `docs/api/API_CONTRACTS.md`
- `docs/architecture/FRONTEND_STRUCTURE.md`
- `docs/architecture/SYSTEM_ARCHITECTURE.md`
- `docs/deliveries/OCI_DEPLOY_03_PRODUCTION_ENVIRONMENT_RUNTIME_REPORT.md`
- `docs/runbooks/GITHUB_AUTOMATIC_SYNC.md`
- `docs/runbooks/OCI_ENVIRONMENT.md`
- `docs/security/ASVS_BASELINE.md`
- `frontend/.env.production.example`
- `frontend/package.json`
- `frontend/production-contract.js`
- `frontend/src/api/api-base.js`
- `frontend/src/api/http-client.js`
- `frontend/src/features/projects/events/ProjectEventsContext.jsx`
- `frontend/test/api/production-contract.test.js`
- `frontend/vite.config.js`
- `docs/deliveries/evidence/oci-deploy-03/`: cinco JSONs sanitizados.
