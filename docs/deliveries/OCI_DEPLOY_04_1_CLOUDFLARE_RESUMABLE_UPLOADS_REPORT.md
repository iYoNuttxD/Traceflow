# OCI-DEPLOY-04.1 — Relatório de uploads retomáveis

Data: 2026-10-14 (America/Sao_Paulo). Escopo: implementação e validação local, sem publicação.

## 1. Resumo executivo

**OCI-DEPLOY-04.1 — CLOUDFLARE-COMPATIBLE RESUMABLE UPLOADS — PASS LOCAL**

Implementado transporte retomável que preserva o envelope funcional completo. Uploads são
privados até a confirmação atômica da execução. Testes completos, testes focados MySQL 26.7,
Linux ARM64, navegador/Nginx/systemd/SELinux e crash real passaram. Isso não autoriza deploy
nem comprova o caminho real Cloudflare → OCI → HeatWave.

## 2. Baseline

Branch `daniel-dev`; HEAD `8d5096a041e671a9fa610d5a61c4b2d672587d4d`. Working tree inicialmente limpo, confirmado antes
das alterações. HEAD final permanece igual; nenhum commit/push. Inventário inicial SHA-256 de
1.404 arquivos rastreados usado para verificar preservação. O HEAD antigo citado no histórico
não foi presumido como atual. 67 migrations anteriores, workflows, units systemd e documentos
acadêmicos permanecem byte a byte iguais à baseline.

## 3. Problema original

100 MiB de arquivos + até 6 MiB JSON + overhead multipart ultrapassam a restrição operacional
confirmada de 100.000.000 bytes por requisição na zona Cloudflare. Reduzir limites eliminaria
funcionalidade existente; esta entrega divide o transporte e conserva a operação de negócio.

## 4. Auditoria do fluxo anterior

A UI montava um FormData com payload JSON, evidence e stepEvidence.N; o POST de executions
usava middleware multipart/staging privado e validação canônica. O service registrava snapshots,
resultados, evidências, auditoria e reteste em uma transação, compensando o storage em falhas.
Downloads eram autenticados. Esse caminho continua disponível, inclusive para execução sem arquivo.
A UI com arquivos agora delega à API resumable; confirma uma única execução pelo service existente.

## 5. Arquitetura da solução

Rotas → controller → evidence-upload.service → repository → Prisma/MySQL; storage é um adaptador
privado. A transação canônica test-execution.service recebe um recibo interno, nunca vindo do
cliente, para validar/promover/confirmar o upload junto ao negócio. Frontend: hook de operação,
componente de progresso e API de domínio sobre httpClient. Nenhum Prisma em controller/UI.

## 6. Protocolo

POST `/api/test-cases/:id/execution-uploads` cria manifesto idempotente; GET lista/consulta;
PUT `/:uploadId/files/:fileId/parts/:index` envia bytes; POST `/:uploadId/complete` envia JSON;
DELETE cancela. Partes de 8.388.608 bytes, até 40 por sessão, SHA-256 e offset explícitos.
Progresso confirmado no banco, reescolha de originais para retomar e idempotência por operação.
Contrato completo: [API_CONTRACTS.md](../api/API_CONTRACTS.md#oci-deploy-041--evidências-retomáveis-protocolo-v1).

## 7. Backend

Controller mantém contexto de sessão real, ator e requestId; service revalida permissões em
mutações; repository concentra Prisma/locks. Complete preserva JSON de 6 MiB sem ampliar o parser
global. Recepção limitada por bytes reais e prazo. Replays e falha de resposta não duplicam
execução/auditoria. Tratamento de falhas preserva recibos quando o resultado SQL pode ser ambíguo.

## 8. Persistência

Migration aditiva `20261014090000_resumable_evidence_uploads`; cadeia 68. EvidenceUpload guarda
identidade, manifesto, partes, TTL, token/prazo de lease, payloadHash e executionId único.
EvidenceUploadBudget serializa admissão. Sem cascade de negócio: purge não pode apagar o recibo
antes da compensação do filesystem. Prisma Client/CLI permanecem **6.12.0**.
MySQL Community 8.4.8 e 26.7.0 isolados aprovados; HeatWave real permanece não testado nesta etapa.

## 9. Storage

Temporários em `TEST_EVIDENCE_STORAGE_DIR/.uploads/<UUID>`; partes e montagem no mesmo filesystem
privado da evidência final, fora de releases/webroot. Diretórios 0700 e arquivos 0600, dono traceflow.
UUIDs gerados, O_EXCL/O_NOFOLLOW, fsync, SHA e promoção com hardlink sem sobrescrita. Arquivos
promovidos só são apagados pela compensação após consultar referências persistentes.
JSON/TXT/LOG são validados em streaming; nenhuma leitura integral de arquivo grande em RAM.

## 10. Segurança

Autenticação, CSRF, autoria, projeto/membership, conta e sessão válidos; VIEWER não envia.
Revalidação antes de publicar partes e dentro da transação final. Traversal, symlink, extensão/MIME
falsos, conteúdo ativo, parte divergente, limites e contexto cruzado cobertos. CORS não foi ampliado;
foram acrescentados somente headers de parte para desenvolvimento. Logs não contêm arquivo/payload,
nome controlado pelo cliente, hash, cookie, token ou credencial. Scan final aprovado sem exceção nova.

## 11. Integridade

SHA incremental de cada parte e do arquivo completo; validação canônica após montagem e novamente
conferida contra manifesto. Todos os arquivos, passos, JSON e efeitos de reteste são uma única
confirmação. Caso de envelope integral: dois vídeos de 50 MiB + JSON UTF-8 acima de 6.000.000 bytes,
100 passos, uma execução. Outro teste associa 20 arquivos (5 gerais + 15 por passos).

## 12. Concorrência

Uma lease por sessão; limites 2 writers/usuário e 4 globais, budget transacional e clocks UTC do
MySQL. Tokens fazem fencing; cancelamento mantém prazo do writer antigo antes de cleanup.
Concorrência testada para parte duplicada/divergente, complete/cancel, complete/expiração,
revogação durante stream e duas operações intencionais com o mesmo arquivo. Nenhum retry infinito.

## 13. Limites

| Contrato                            | Valor preservado |
| ----------------------------------- | ---------------: |
| Vídeo / outro arquivo               |      50 / 10 MiB |
| Arquivos agregados                  |          100 MiB |
| Total / gerais / por passo          |       20 / 5 / 3 |
| JSON da execução                    |            6 MiB |
| Parte / máximo de partes            |       8 MiB / 40 |
| TTL / lease                         |      24 h / 90 s |
| Sessões usuário / projeto / global  |      3 / 10 / 32 |
| Reserva temporária usuário / global |  256 MiB / 1 GiB |
| Piso livre                          |          512 MiB |

Reserva por sessão: 2×total + 8 MiB. Cotas operacionais não reduzem o envelope funcional de uma
execução. Variáveis e regras estão na seção 27 do runbook e em backend/.env.example.

## 14. Cloudflare

Compatibilidade protocolar demonstrada: maior **corpo funcional** no navegador =
8,388,608 bytes, com ampla margem para o teto de 100 MB.
Nenhuma mudança em DNS, proxy, plano ou TLS. A zona real não foi acessada. Clients multipart
legados ainda podem exceder o teto; a UI nova usa partes para todas as execuções com arquivos.

## 15. Nginx

Template atualizado com partes 8m/streaming e Complete 6m/read_timeout 90s. Buffering dos demais
endpoints preservado em escopo server. `nginx -t` passou em 1.20.1. HTTPS real no laboratório,
413 acima do teto de parte, caminhos privados negados, CSRF/autenticação e downloads no-store
verificados. SSE, webhook, SPA e cache de assets mantêm a configuração existente.

## 16. Frontend

SHA em fatias de 256 KiB, uma parte por vez, retry limitado e Retry-After. UI distingue hashing,
envio, pausa, erro e confirmação; progresso confirmado fica abaixo de 100% até o sucesso real.
Retomada valida tamanho/hash/destino/versão. sessionStorage armazena somente IDs opacos;
nenhum File, conteúdo ou payload persistido. Integração inclui testes normais e retestes de defeito.

## 17. Experiência do usuário

Botões de pausa/cancelamento fora do fieldset ocupado; formulário preservado ao erro.
Após reload, consultar envios pendentes e reescolher originais; UI explica a necessidade.
Gerações/AbortController ignoram respostas tardias, e guardas bloqueiam clique duplo.
Acessibilidade automatizada cobre região, status, alerta, progressbar e controles. DOM real
em 390×844 não apresentou overflow horizontal. Não houve screenshot ou homologação visual
manual, leitor de tela, dispositivo físico ou outros navegadores.

## 18. Limpeza

CLI de manutenção sob a identidade traceflow, default dry-run, aplicação com guardas de ambiente
e retorno não zero em falha.
Lotes de até 50; TTL 24h; recibos até expiração+7dias; proteção de leases ativos e chaves em uso.
Testes incluem cancelamento, expiração, órfão, falha/repetição de cleanup e evidência confirmada.
Recomenda-se agendamento operacional a cada 15min, suspenso/drenado pelo gate writersControlled
antes de migrations/promover releases. Nenhum timer ou terceiro daemon foi instalado na OCI.

## 19. Testes de backend

**2007 aprovados, zero falhas, cinco skips preexistentes**, 162 arquivos.
Novos testes: 46 HTTP/persistentes + 24 storage/unidade. Skips E6/E11 destinam-se a schema pré-LR.2;
não foram adicionados nem ampliados. Os validadores históricos separados passaram.
Cobrem U01–U20 e A01–A10, limites, formatos, CSRF POST/PUT/DELETE, revogação e transação.

## 20. Testes de frontend

**1520 aprovados, zero falhas/skips**, 122 arquivos. Novos: 23 API/transporte + 4 UI/hook.
Cobrem arquivo pequeno/grande, progresso, retry/status HTTP, pausa/retomada, arquivos alterados,
expiração, destinos, contexto, unmount/respostas tardias e regressão do catálogo/retestes.

## 21. Testes integrados

Navegador Chrome headless novo, sem conta pessoal/screenshots, em `https://traceflow.test:19441`
(loopback). Oracle Linux ARM64, Nginx TLS, API production sob systemd, MySQL e storage reais locais.
Certificado e credenciais exclusivamente sintéticos. Os 12 cenários aprovados estão na evidência JSON.
Upload de 100 MiB, confirmação com resposta perdida e download/hash: 11.433s
nessa rodada, não SLA. Partes confirmadas não foram reenviadas após pausa/reload/restart/release A→B.
Filesystem sem permissão durante Complete produziu falha sem execução parcial; restaurada a
permissão, o mesmo envio confirmou. 413, 401/403 e armazenamento privado também verificados.

## 22. Testes de concorrência e crash

SIGKILL real com 16 KiB de uma parte em trânsito: sem recibo da parte; API reiniciou sob systemd;
429 até o lease original vencer; espera observada após restart de 80.309s
(o lease total é 90s). Reenvio confirmou 8 MiB, Complete/replay geraram uma execução e cleanup
removeu temporários. O relógio não foi adiantado nesse cenário. Fault injection determinística
em testes HTTP cobre rollback SQL, promoção parcial e perda de ACK de COMMIT, além das corridas
reais com barreiras. Não se afirma benchmark de carga sustentada com quatro usuários máximos.

## 23. ARM64 e recursos

Linux `aarch64`, Oracle Linux 9.8, Node 22.23.2, MySQL Community 26.7.0, Nginx 1.20.1.
165 testes focados + 11 de regressão S1-07 aprovados nativamente; npm ci, Prisma generate,
argon2 e build frontend passaram. MySQL 26.7 ARM64 macOS: 176 aprovados. Não copiar node_modules
macOS para Linux. Novas bibliotecas não acrescentam dependências nativas.

Laboratório 2 CPUs / **4 GiB**, versus 12 GiB da VM OCI informada. Janela amostrada a cada 0,2s:
885 amostras, 198.897s; RSS inicial 174.29 MiB,
pico 218.12 MiB; CPU acumulada observada da API 3.080s;
temporários iniciais 116.00 MiB e pico 316.01 MiB.
Havia temporários de cenários anteriores no laboratório; o valor inicial é explicitado para não
atribuir todo o pico a um único upload. Amostragem pode perder picos curtos e não mede a RAM total
do navegador/MySQL. O envelope JSON de quase 6 MiB foi testado separadamente do benchmark de UI.

## 24. Gates

| Gate                                       | Resultado                                      |
| ------------------------------------------ | ---------------------------------------------- |
| Backend / frontend completos + coverage    | PASS                                           |
| Lint / format backend e frontend           | PASS                                           |
| Build frontend host Node22 e Linux ARM64   | PASS (aviso preexistente de bundle ELK grande) |
| Prisma validate / generate 6.12.0          | PASS                                           |
| 14 validadores históricos, inclusive drift | PASS                                           |
| Arquitetura / política CI / inventário UI  | PASS                                           |
| Testes das políticas CI/audit/inventário   | PASS                                           |
| Operação e releases Python                 | 53 PASS                                        |
| npm audit backend / frontend               | zero vulnerabilidades, inclusive HIGH/CRITICAL |
| Secret scan / diff check                   | PASS, sem waiver                               |
| E2E / crash / concorrência / storage       | PASS LOCAL                                     |
| CI remoto / Cloudflare e OCI reais         | NÃO EXECUTADOS                                 |

Coverage (statements / branches / functions / lines): backend **92,57 / 87,44 / 95,47 / 94,85%**;
frontend **86,11 / 80,98 / 81,91 / 88,58%**. Nenhum threshold, timeout de teste, skip ou regra
foi relaxado para obter PASS. Ajustes de harness corrigiram cópia pública incompleta, seletores,
fixtures e resolução do domínio reservado; o contador de tabelas do guard passou de 50 para 51
para incluir a nova tabela de sessões. O budget fixo não é limpo entre testes.

## 25. Arquivos modificados e critérios

| Grupo / arquivos atuais                                                  | Novos arquivos                                                               | Justificativa e impacto                                | Risco / critério de aceite / teste                                                                    |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| app.js, body.js, test-case.routes.js, env.js                             | evidence-upload.routes/controller.js                                         | Receber binário/JSON específico com guardas existentes | Bypass de parser/CSRF; aceitar somente rotas exatas; HTTP auth/CSRF/body tests                        |
| test-execution.service.js, test-case.repository.js                       | evidence-upload.service/repository.js, uploads/upload-contract.js            | Persistência, fencing e uma confirmação canônica       | Duplicação/concorrência; replay e corridas devem produzir o resultado definido; testes SQL/HTTP/crash |
| schema.prisma                                                            | migration aditiva 20261014090000                                             | Ledger durável e orçamento                             | Drift/compatibilidade; 68 migrations válidas e anteriores intactas; Prisma/validadores/8.4+26.7       |
| local-test-evidence.storage.js                                           | resumable-evidence.storage.js, streamed-text.validation.js                   | Streaming, integridade e compensação                   | Corrupção/perda; hashes/downloads iguais e nenhuma exclusão confirmada; symlink/FS/commit tests       |
| .env.example, package.json/lock                                          | cleanup-evidence-uploads.js                                                  | Cotas e manutenção explícita                           | Disco cheio ou cleanup incorreto; dry-run, guards e cleanup idempotente preservam evidência           |
| test-cases.api.js, TestCasesScreen, DefectFlow, TestExecutionWizard, CSS | resumable-uploads.api.js, useExecutionUpload.js, ExecutionUploadProgress.jsx | Trocar transporte e manter o fluxo de execução/reteste | UI tardia/duplicação; progresso correto e rascunho recuperável; 27 novos testes + regressão/E2E       |
| Nginx traceflow.conf/proxy.conf                                          | —                                                                            | Limites por rota e streaming                           | Ingress/SSE; nginx -t, 413 real e regressão operacional                                               |
| test-database helper/guard, model-api.test.js, run-release-linux.py      | testes resumable backend/frontend e 3 harnesses deploy/tests                 | Evidência reproduzível e inventário da migration       | Testes no alvo errado; guardas explícitas/TEST_DATABASE_URL/VM marcada                                |
| API_CONTRACTS e runbooks OCI03/04/05                                     | runbook, relatório e validation.json                                         | Contrato e recuperação operacionais                    | Operador usar fluxo obsoleto; instruções e limitações coerentes com o código                          |

Inventário exato, relativo à raiz, incluindo este relatório/evidência, ao final desta seção.

Criados:

```text
backend/prisma/migrations/20261014090000_resumable_evidence_uploads/migration.sql
backend/scripts/cleanup-evidence-uploads.js
backend/src/modules/testCases/evidence-upload.controller.js
backend/src/modules/testCases/evidence-upload.routes.js
backend/src/modules/testCases/repositories/evidence-upload.repository.js
backend/src/modules/testCases/services/evidence-upload.service.js
backend/src/modules/testCases/storage/resumable-evidence.storage.js
backend/src/modules/testCases/storage/streamed-text.validation.js
backend/src/modules/testCases/uploads/upload-contract.js
backend/test/api/resumable-evidence.test.js
backend/test/unit/test-cases/resumable-storage.test.js
deploy/tests/resumable-browser.mjs
deploy/tests/resumable-crash.mjs
deploy/tests/resumable-fixtures.mjs
docs/deliveries/OCI_DEPLOY_04_1_CLOUDFLARE_RESUMABLE_UPLOADS_REPORT.md
docs/deliveries/evidence/oci-deploy-04-1/validation.json
docs/runbooks/OCI_RESUMABLE_UPLOADS.md
frontend/src/features/testCases/api/resumable-uploads.api.js
frontend/src/features/testCases/components/ExecutionUploadProgress.jsx
frontend/src/features/testCases/hooks/useExecutionUpload.js
frontend/test/testCases/resumable-uploads-ui.test.jsx
frontend/test/testCases/resumable-uploads.test.js
```

Modificados:

```text
backend/.env.example
backend/package-lock.json
backend/package.json
backend/prisma/schema.prisma
backend/src/app.js
backend/src/config/env.js
backend/src/modules/testCases/repositories/test-case.repository.js
backend/src/modules/testCases/services/test-execution.service.js
backend/src/modules/testCases/storage/local-test-evidence.storage.js
backend/src/modules/testCases/test-case.routes.js
backend/src/shared/security/body.js
backend/test/helpers/test-database.js
backend/test/integration/test-database-guard.test.js
deploy/nginx/snippets/proxy.conf
deploy/nginx/traceflow.conf
deploy/tests/run-release-linux.py
docs/api/API_CONTRACTS.md
docs/runbooks/OCI_ENVIRONMENT.md
docs/runbooks/OCI_RELEASE_DEPLOYMENT.md
docs/runbooks/OCI_RUNTIME_SERVICES.md
frontend/package-lock.json
frontend/package.json
frontend/src/features/defects/components/DefectFlow.jsx
frontend/src/features/testCases/TestCasesScreen.jsx
frontend/src/features/testCases/api/test-cases.api.js
frontend/src/features/testCases/components/TestExecutionWizard.jsx
frontend/src/features/testCases/styles/test-cases.css
frontend/test/testCases/model-api.test.js
```

## 26. Preservação dos bancos

Instâncias próprias em diretórios temporários novos, credenciais aleatórias sintéticas, loopback,
schemas explicitamente test e identidade versão/datadir/porta/schema verificada. Todas as migrations,
fixtures e mutações ocorreram nessas instâncias. Nenhum .env real, banco DEV ou MySQL OCI acessado.
TEST_DATABASE_URL continua obrigatório nos testes persistentes; o supervisor production exige que
ele esteja ausente no processo da API. No laboratório o harness valida TEST_DATABASE_URL e injeta
somente a URL isolada no ambiente sintético do serviço. Isso não usa uma base de desenvolvimento.

## 27. Infraestrutura OCI

Nenhuma conexão SSH à OCI, alteração de rede, serviço, DB, DNS, Cloudflare ou GitHub App.
O hostname reservado .test só apontou a loopback. Node/MySQL do laboratório não foram publicados;
Lima encaminhou somente HTTPS 19441 em loopback, além do seu canal de administração local.
SELinux permaneceu Enforcing, Nginx em httpd_t; booleans amplos de conexão/relay permaneceram off.
Units API/worker e política SELinux versionadas não foram ampliadas. Não houve deploy nem commit/push.

## 28. Riscos residuais

Homologar Cloudflare/Origin CA/NSG/firewall reais, HeatWave/TLS/privilégios, backup/restore e alertas.
Configurar e operar o agendamento de cleanup antes de produção; suspender writers de manutenção
nos gates OCI-05. Monitorar disco final/temporário e inodes. Rollback pré-04.1 não entende sessões
novas: preservar dados e bloquear retomadas até release compatível, sem down migration automática.
Recibos têm retenção finita; reenvio após retenção requer consulta do histórico. Reinício forçado
pode exigir até 90s e ação manual após retries finitos. Não há antivírus/object storage/scale-out
novo. Carga sustentada, dispositivo físico, leitor de tela e outros browsers não foram homologados.
Nenhuma dessas lacunas é declarada como PASS de produção.

## 29. Próxima entrega

Revisar esta entrega local e autorizar separadamente **OCI-DEPLOY-06 — HeatWave Production
Homologation, Backup & Recovery**. Depois, integrar o artefato/revisão aprovada ao processo OCI-05
com migration job, gates, smoke tests e rollback compatível. Nenhuma dessas ações foi iniciada.

## 30. Final verdict

**OCI-DEPLOY-04.1 — CLOUDFLARE-COMPATIBLE RESUMABLE UPLOADS — PASS LOCAL**

Sem bloqueador funcional local identificado. Limites funcionais preservados, integridade,
retomada, idempotência, segurança e falhas validados. Produção depende dos gates e autorizações
citados; PASS LOCAL não equivale a produção pronta ou deployment concluído.

[Runbook](../runbooks/OCI_RESUMABLE_UPLOADS.md) ·
[Evidência sanitizada](evidence/oci-deploy-04-1/validation.json).

Recursos descartáveis encerrados: os dois MySQL locais foram parados e seus datadirs removidos;
a VM tf041 e seu LIMA_HOME próprio foram removidos; credenciais sintéticas foram eliminadas.
A evidência sanitizada permanece versionável. Nenhum recurso existente do usuário foi removido.
