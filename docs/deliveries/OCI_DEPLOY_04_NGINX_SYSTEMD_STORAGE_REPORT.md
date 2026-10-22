# OCI-DEPLOY-04 — Nginx, systemd e storage persistente

## 1. Resumo executivo

**OCI-DEPLOY-04 — PARTIAL / BLOCKED.** Implementação operacional local concluída e validações
locais aprovadas. O bloqueador que determina essa classificação é a incompatibilidade entre
**100 MB por requisição da zona Cloudflare**, confirmado pelo usuário, e até **100 MiB de arquivos
+ 6 MiB de JSON + overhead multipart** já permitidos pelo TraceFlow. Nenhum limite funcional foi
reduzido; não existe solução de transporte maior aprovada nesta entrega. A restrição bloqueia o
deploy funcional completo, não a preparação dos arquivos locais.

Foram criados ingress Nginx 1.20.1, duas units systemd, scripts de preparação/validação/diagnóstico,
política SELinux restrita, testes e runbook. Nenhuma instalação, deploy, acesso ao HeatWave, alteração
em DEV/OCI/Cloudflare/GitHub App, commit ou push. A página temporária não foi acessada nem alterada.
Não houve screenshots ou evidência visual. OCI-DEPLOY-05 não foi iniciada.

## 2. Baseline

- Repositório: iYoNuttxD/Traceflow, checkout `/Users/daniel/Coding/Traceflow`.
- Branch: `daniel-dev`.
- HEAD real: `19922ae17dd4175846f416423b2068509aa4ac9f`.
- Working tree inicial: limpo, sem modificados ou não rastreados; diff --check aprovado.
- HEAD informado `2e97454` foi sucedido pelo commit `19922ae`, que já contém OCI-03.
- OCI-02/OCI-03, código, migrations, schema, lockfiles e workflows preservados.
- Shell padrão tinha Node 26.10.0/npm 11.19.1. Gates usaram Node 22.23.3/npm 10.9.9 no macOS
  ARM64; laboratório Linux usou Node 22.23.2/npm 10.9.8, igual à versão informada para OCI.
- Não havia AGENTS.md aplicável no checkout/ancestrais; nenhuma delegação/subagente foi usada.

## 3. Arquivos alterados

Único arquivo previamente rastreado modificado: `README.md`, com links técnicos e descrição de
`deploy/`. Nenhum arquivo de runtime backend/frontend ou documentação acadêmica foi modificado.

Arquivos novos de operação/teste:

- `deploy/nginx/snippets/cloudflare.conf`
- `deploy/nginx/snippets/proxy.conf`
- `deploy/nginx/snippets/static-headers.conf`
- `deploy/nginx/traceflow.conf`
- `deploy/scripts/check-runtime.sh`
- `deploy/scripts/configure-selinux.sh`
- `deploy/scripts/prepare-runtime-directories.py`
- `deploy/scripts/update-cloudflare-ips.py`
- `deploy/scripts/validate-nginx.sh`
- `deploy/scripts/validate-service-environment.mjs`
- `deploy/scripts/validate-systemd.sh`
- `deploy/selinux/traceflow_nginx.te`
- `deploy/systemd/traceflow-api.service`
- `deploy/systemd/traceflow-github-worker.service`
- `deploy/tests/controlled-upstream.mjs`
- `deploy/tests/run-linux.py`
- `deploy/tests/test_operations.py`
- `deploy/tests/worker-sandbox.mjs`

Documentação/evidência nova:

- `docs/runbooks/OCI_RUNTIME_SERVICES.md` (35 seções).
- `docs/deliveries/OCI_DEPLOY_04_NGINX_SYSTEMD_STORAGE_REPORT.md` (este relatório, 28 seções).
- `docs/deliveries/evidence/oci-deploy-04/quality-gates.json`.
- `docs/deliveries/evidence/oci-deploy-04/linux-runtime.json`.
- `docs/deliveries/evidence/oci-deploy-04/source-sha256.json`.

| Referência atual (sem alteração) | Arquivos novos / motivo | Impacto e risco | Aceite / testes |
|---|---|---|---|
| server.js, app.js, rotas API e eventos | nginx/traceflow.conf + proxy.conf | ingress precisa substituir default legado; erro de prefixo quebraria auth/API | N1–N18 e I1–I12 no Nginx real |
| frontend/index.html, Vite/dist, React Router, EvidenceViewer | static-headers.conf | fallback/cache e CSP; política completa fica report-only | SPA/assets/headers aprovados; CSP visual futura explícita |
| TRUST_PROXY=loopback | cloudflare.conf + update-cloudflare-ips.py | lista desatualizada pode negar tráfego; confiança global permitiria spoofing | fonte oficial, validação negativa, peer original e spoofing testados |
| backend/src/server.js, graceful-shutdown.js | traceflow-api.service + validate-service-environment.mjs | supervisor não pode matar antes do deadline nem sobrescrever contratos | API real não root, 30s interno/45s externo, falhas e reinícios testados |
| github-worker.js, scheduler existente | traceflow-github-worker.service | parada forçada deixa run para lease/fencing | worker real sem porta; native/sandbox, limite 90s sintético e reboot |
| local-test-evidence.storage.js | prepare-runtime-directories.py | permissões/symlinks ou limpeza insegura causariam perda/exposição | 12 testes de storage/preparação, arquivos preservados; nenhum rm de dados |
| layout e políticas Oracle Linux | traceflow_nginx.te + configure-selinux.sh | tipo de porta/contexto errado impede ingress | SELinux Enforcing, httpd_t, booleans amplos off, dist real em release testado |
| health endpoints e logs existentes | validate-nginx.sh, validate-systemd.sh, check-runtime.sh | syntax isolada não prova readiness; active não prova heartbeat | sintaxe + HTTP real + diagnóstico falha em 503; worker status documentado |
| gates backend/frontend já existentes | deploy/tests + evidências + runbook | fixture não equivale a integração de produção | fronteiras de prova discriminadas neste relatório; sem alteração de thresholds |

## 4. Nginx

Compatibilidade executada com RPM **1.20.1-28.0.1.el9_8.6.aarch64** no Oracle Linux 9.8.
TLS 1.2/1.3; caminhos Origin CA somente referenciados. Defaults HTTP/TLS rejeitam Host/IP/SNI
inválidos, inclusive ausência de Host/SNI. HTTPS TraceFlow exige peer TCP Cloudflare autorizado;
redirecionamento HTTP usa domínio fixo e preserva caminho/query, sem header como destino.

Main config existente precisa de remoção manual revisada do server de exemplo/default; o include
conf.d sozinho não resolve esse caso. Procedimento/backup/rollback descritos no runbook. Não foi
lido ou alterado nginx.conf da OCI. O laboratório usa main config descartável sem o default antigo.

## 5. Frontend

Build atual com VITE_API_URL=/api aprovado, servido exclusivamente como dist. Rotas profundas
projects/requirements/repository/indicators/settings retornaram o HTML compilado. Assets faltantes,
fontes/dotfiles/chaves/manifests/paths privados foram negados. HTML revalida; nomes de hash têm
immutable, não hash no-cache. Symlink permitido apenas para current administrado, sem links
internos arbitrários. OCI-05 deverá validar nomes/bytes e carregar assets das releases ainda
suportadas no dist atual: só preservar diretórios antigos não garante lazy chunks de abas abertas.
Janela inicial proposta de sete dias precisa de aprovação operacional/produto. Nada foi ativado
ou limpo nesta entrega.

## 6. Backend

Sem mudança de arquitetura Route → Controller → Service → Repository → Prisma → MySQL.
/api e /api/ preservados pelo proxy_pass sem URI. Métodos e erros Express não viram SPA.
Timeouts: connect 5s, send/read convencional 60s, upload read 90s, SSE read 75s. Node continua
headers 15s, request reception 60s, keepalive 5s. Mutations não são repetidas pelo proxy.
Nginx gera requestId e sobrescreve host/proto/porta/cadeia IP. API no-store/no-transform, sem
cache nem substituição de Set-Cookie. Indisponibilidade do upstream gera JSON 503 controlado.

## 7. Cloudflare

Snapshot dos endpoints oficiais em 14/10/2026: 15 ranges IPv4 e 7 IPv6, fontes/digest/data no
arquivo. Gerador cria candidato novo e nunca instala/recarrega. Atualização revisada mensal,
antes do deploy e após aviso do fornecedor. Não há trust 0/0 nem loopback no arquivo de produção.
RealIP só confia em peer autorizado; geo verifica realip_remote_addr, antes da substituição.
Full(strict), DNS/proxy e Origin CA existentes preservados. Restrição futura de NSG/firewall aos
ranges requer planejamento/rollback; não executada. Origin CA não é autenticação do edge.

## 8. SSE

Endpoint confirmado `/api/projects/:projectId/events`. HTTP/1.1, buffering/gzip/cache desativados,
75s de leitura contra heartbeat 25s e lifetime 15min existente. Prova com intervalo real de 25s,
primeiro frame sem buffering, cleanup após desconexão, fechamento no SIGTERM e recuperação após
reinício. Cache-Control conserva no-transform. Fixture omite X-Accel-Buffering para provar a
configuração Nginx, não depender só do header do backend. Não há transporte SSE entre processos;
worker continua com persistência e polling existente.

## 9. GitHub Webhooks

POST /api/webhooks/github-app, raw JSON até 1 MiB. HMAC foi calculado sobre bytes sintéticos
incluindo espaços/escape/newline e verificado pela função real do backend através de Nginx.
Corpo/assinatura válidos aceitos; alteração de corpo, assinatura inválida/ausente e ausência de
headers recusadas. Duplicidade aceita no ledger da fixture. A persistência/idempotência real
continua coberta pela suíte backend isolada; não houve webhook ou App real configurado/testado.

## 10. Uploads

Maior arquivo: vídeo 50 MiB, demais formatos 10 MiB. Contagem: 3/etapa, 5 gerais, 20 totais.
Soma de arquivos até 100 MiB, campo payload até 6 MiB, mais overhead multipart limitado pelo
parser. Nginx permite 108 MiB apenas na rota `/api/test-cases/:id/executions`, com buffer de
request privado do Nginx, preservando os limites de negócio. 106 MiB de transporte foram aceitos;
Content-Length >108 MiB retornou 413 JSON. Teste grande é de transporte, não de conteúdo funcional.

**Cloudflare 100 MB é bloqueador confirmado.** Mesmo interpretação binária do cap não acomodaria
o envelope completo. Recomendação: aprovar capacidade de proxy superior ao envelope (por exemplo
200 MB confirmados para a zona), preservando Cloudflare, HTTPS, autenticação e endpoints. Não
contratar/alterar plano sem autorização. Upload em partes é alternativa futura com desenho próprio
de integridade/quotas/idempotência; não é funcionalidade existente nem foi implementada. Redução
coerente de limites requer decisão de produto; não aplicada. Não recomendar exposição do Node.

Frontend atual exibe mensagem sanitizada para 413 JSON; 413 HTML do edge vira falha genérica, sem
renderizar HTML (dois controles executados). Timeout HTTP de 15s é outro risco de uploads grandes
em conexão lenta; medir e aprovar ajuste específico, sem elevar globalmente por conveniência.

## 11. Downloads privados

Sem alias público do storage. Endpoint real `/api/test-evidence/:id/content` continua sob
backend/autorização de projeto. Fixture provou 401 sem cookie, arquivo sintético com sessão e
negação HTTP direta/symlink. Autorização por projeto e proteções completas continuam nos testes
backend reais, que passaram. Nginx não consegue ler o diretório 0700; evidências fora de releases.

## 12. Systemd API

Node direto em server.js, User/Group traceflow, WorkingDirectory backend ativo. EnvironmentFiles
protegidos fora de releases, sem segredo em unit/ExecStart. Preflight não usa banco e recusa
sobrescrita indevida dos contratos fixos por EnvironmentFile (que tem precedência no systemd).
Type=exec, Restart=on-failure, 10s de intervalo e três partidas/300s. Startup real passou com
DB indisponível: live 200 e ready 503. Não há migrations automáticas.

## 13. Systemd Worker

Node direto em github-worker.js, scheduler true obrigatório, sem listener HTTP. API mantém false
e sync manual. Persistência/leases/fencing/backoff/recuperação não foram alterados. Mesmo contrato
compartilhado de ambiente/URLs/SMTP da OCI-03. Storage inacessível ao worker. Sandbox suplementar
provou escrita negada em código/configuração/evidências, chave TLS inacessível, PrivateTmp utilizável
e Argon2 nativo funcional. Serviços não root, sem capabilities administrativas.

## 14. Lifecycle

API: deadline interno até 30s, TimeoutStopSec 45s; preflight impede valores maiores sem revisão.
Worker: stop aguarda trabalho ativo, supervisor limita 90s. SIGTERM, KillMode control-group,
SIGKILL final, nenhum ExecStop duplicando cleanup. Probe que ignora SIGTERM foi encerrado no
limite real de 90s com Result=timeout; não simulou sync/lease ativa. Recovery de runs permanece
na autoridade existente, sem falsa marcação de sucesso.

Falha de configuração chegou ao limite de três reinícios e permaneceu sem PID; correção permitiu
recuperação. Crash por SIGKILL reiniciou a API. Reboot real da VM descartável mudou boot_id e
iniciou automaticamente os dois entry points reais, preservando Enforcing/firewalld. Esta prova
local não substitui homologação de reboot/recuperação do host OCI e do banco gerenciado.

## 15. Storage

`/var/lib/traceflow/test-evidence`, real, 0700, proprietário traceflow; parent root 0711.
Preparador idempotente, allowlist fixa, dry-run padrão, preflight completo de identidade/ancestrais,
sem exclusão nem chmod/chown recursivo. Testes: inexistente criado no root descartável, symlinks
recusados, arquivo no lugar de diretório recusado, traversal recusado, parent inseguro recusado,
permissões da folha corrigidas sem alterar descendentes, reexecução preserva arquivos/configuração,
e falha parcial recuperável. API já valida storage no startup/readiness; nada foi escrito no host
em `/var/lib/traceflow` ou nos diretórios OCI.

## 16. SELinux

Enforcing durante toda a prova. Política declarativa restrita httpd_t → traceflow_api_port_t,
atribuída localmente a tcp/3001. Porta está na faixa ntop_port_t do Oracle Linux por default;
customização exata revisada evita habilitar network_connect/relay amplos, ambos mantidos off.
Nginx executou em httpd_t. Configs/units/código recebem contextos dos destinos; dist recebe
httpd_sys_content_t. Suplemento comprovou dist real sob `/opt/traceflow/releases/.../frontend/dist`
servido através do symlink current, após restorecon do destino. Storage não virou conteúdo web.

Falha inicial reproduziu copy2 de /tmp conservando user_tmp_t: systemd recusou ler as units.
Procedimento corrigido com restorecon explícito. Não se desabilitou SELinux, não se gerou política
por audit2allow automático e não se tocaram contextos/chaves reais de produção.

## 17. Firewall

firewalld ativo no laboratório, nenhuma porta 3001/3306/33060 aberta. Node em loopback; worker
sem socket público. Rede da VM descartável sem mounts do host, sem SSH agent forwarding, sem
forward de portas de aplicação. Drop-in exclusivo dos testes restringiu a rede das units a
localhost; não está nas units de produção. Nenhum NSG/Security List/firewall/DNS OCI foi modificado.

## 18. Logs

Journald separado por unidade, logger backend existente preservado. Access log Nginx JSON com
categoria fixa, requestId novo, status/bytes/tempos, sem path bruto/query/IP/referer/UA/cookie/
authorization/body. Testes com marcador sensível em query, path e headers, 413 e upstream fora do
ar, não vazaram o marcador. Error log HTTP por vhost vai a /dev/null porque seu formato no Nginx
1.20.1 pode incluir request line e não permite redigir campos. Tradeoff documentado: perdem-se
detalhes por request desse log; permanecem access status/tempos, startup/syntax e app logs.

Retenção proposta: access logs 14 dias, rotação/compressão diária, journald 14 dias/256 MiB após
avaliação dos outros serviços. Não aplicado drop-in global nem job de limpeza. Logs de negócio e
backup têm políticas próprias; não prometer conformidade ASVS integral pela configuração local.

## 19. Health/readiness

Rotas existentes /health, /health/live, /health/ready acessadas somente na loopback operacional;
ingress retorna 404, nunca SPA. Readiness do runtime continua somente leitura e bounded. Script
check-runtime não segue redirects, ignora proxy, não imprime ambiente/bodies e retorna erro
se serviço inativo ou probe falha. Verificado após reboot: live 200, ready 503 com DB ausente,
exit 1 do diagnóstico. Heartbeat do worker exige automation status ou consultas SELECT restritas;
active sozinho não basta. Nenhuma consulta foi feita ao banco OCI.

## 20. Testes

Evidências sanitizadas em [quality-gates.json](evidence/oci-deploy-04/quality-gates.json) e
[linux-runtime.json](evidence/oci-deploy-04/linux-runtime.json).

| Conjunto | Resultado efetivamente executado |
|---|---|
| Operações no host | 21 testes Python PASS (12 storage, 4 ranges, 5 contrato de serviço) |
| Nginx/systemd/segurança/integração Linux | **87 controles PASS, 0 FAIL** na configuração final |
| Suplementos Linux | sandbox/native worker, parada forçada 90s, contexto de release real, reboot automático e diagnóstico 503 PASS |
| Backend full com coverage | **1.937 PASS, 0 FAIL, 5 skips legados**, 160 arquivos |
| Frontend full com coverage | **1.493 PASS, 0 FAIL, 0 skips**, 120 arquivos |
| Migrations em MySQL descartável 8.4.8 | 67 aplicadas/status PASS e 14 validators PASS |
| Smoke runtime real OCI-03 reutilizado no alvo novo | 12 controles PASS |
| CI policy local | 90 PASS, 0 FAIL |
| Frontend 413 JSON/HTML | 2 controles PASS |

| Requisitos | Prova / limite |
|---|---|
| N1–N8 | HTTP/TLS, /api/prefixo, SPA, missing assets, dotfiles, Host/SNI/ausência recusados |
| N9 / I6 / I12 | heartbeat real 25s, desconexão, SIGTERM e retorno do proxy |
| N10 / I7 | bytes/HMAC com verificador real; ledger duplicado sintético; persistência na suíte full |
| N11 / I4–I5 | Set-Cookie e CSRF/CORS reais no middleware; identidade de fixture no proxy |
| N12 / I8 | multipart íntegro, transporte 106 MiB, 413 >108 MiB; cap Cloudflare não simulado como aprovado |
| N13 / I9 | downloads de fixture autenticados e paths privados/symlinks negados; autorização por projeto na suíte full |
| N14–N18 / I10–I11 | cache/headers/spoofing/métodos/erros sem fallback; CSP completa só report-only |
| S1–S6 | units verificadas e entry points reais, traceflow não root, API loopback, worker sem listener |
| S7–S10 | falhas/restart budget/SIGTERM/deadline interno compatível e deadline worker observado |
| S11–S12 | sandbox real, binário nativo, boot automático após reboot |
| I1–I3 | HTML compilado, rotas React e Express através do Nginx real |

Tentativas intermediárias preservadas no relato da evidência: contextos user_tmp_t; diretório
sintético de certificados ausente para mount namespace; reset-failed sobre unit ainda não carregada;
expectativa incorreta de Result=start-limit-hit (252 mantém exit-code no caso observado); OPTIONS
esperado como 200, mas CORS canônico retorna 204. Corrigidos setup/assertions sem aumentar timeout,
afrouxar controles do produto ou criar skips. Sexta tentativa passou; execução final acrescentou
no-transform e negativos de Host/SNI. Nenhum retry automático até verde.

Gates de CI inicialmente falharam em cópia sem docs/design/UI_SURFACE_INVENTORY.md e em sandbox
somente leitura para fixtures temporárias; o scanner padrão exige metadados Git. Corrigido o
ambiente de execução: inventário público completo, fixtures em área autorizada e scan read-only
no checkout real (mais scan explícito dos arquivos operacionais). Resultados finais separados
na evidência; não classificados como defeitos do produto ou ocultados.

## 21. Segurança

Controles implementados/validados: rejeição de Host/SNI, confiança em peer Cloudflare restrita,
headers sobrescritos, IP efetivo no Express, TLS verificado nos testes, arquivos privados sem alias,
processos sem root/capabilities, código/configuração readonly, TLS key invisível às units,
Nginx confinado e logs sem dados de URL. Auth/cookies/CSRF/autorização não foram enfraquecidos.

Riscos residuais: cap de upload, timeout frontend 15s, CSP report-only, ranges que identificam
a rede Cloudflare e não a zona, administração compartilhada
do UID, manutenção de ranges, ausência de alertas/retention aplicada, perda deliberada de detalhe
do error log por request, host real/SMTP/App/HeatWave ainda não homologados. Npm audit não é um
scanner de SO/infraestrutura; validar RPMs/erratas da VM real no preflight posterior.

## 22. Gates

| Gate | Resultado |
|---|---|
| Backend lint / format | PASS |
| Frontend lint / format / build `/api` | PASS |
| Prisma validate / generate 6.12.0 | PASS em workspace sem .env |
| Architecture check | PASS |
| CI policy / formatação CI | PASS |
| Secret scan canônico + novos arquivos explicitamente | PASS, sem valores reais |
| Dependency audit backend/frontend | **0 HIGH / 0 CRITICAL / 0 exceções** em ambos |
| Shell syntax / Node syntax / Python tests | PASS |
| nginx -t / systemd-analyze verify | PASS no Oracle Linux ARM64 |
| git diff --check | PASS na revisão final |

Coverage sem alteração de thresholds:

| Métrica | Backend | Threshold backend | Frontend | Threshold frontend |
|---|---:|---:|---:|---:|
| Statements | 92,51% | 85% | 86,14% | 50% |
| Branches | 87,26% | 70% | 81,00% | 45% |
| Functions | 95,35% | 85% | 82,00% | 40% |
| Lines | 94,81% | 87% | 88,62% | 53% |

Cinco skips são anteriores (quatro responsabilidade legada E11 e um backfill E6 que exige schema
anterior à LR2). Nenhum novo skip. Nenhuma CI remota/PR/dependency-review de PR foi executada.

## 23. Segurança dos bancos

TEST_DATABASE_URL obrigatório. Full backend executado em MySQL **8.4.8 novo**, criado pelo runner
com bind 127.0.0.1/porta efêmera, UUID/datadir/nonce e usuário de privilégios restritos ao prefixo
proprietário. Identidade e recusa de leitura administrativa/password inválido registrados. Banco
DEV nunca foi fallback; DATABASE_URL inicial apontava à porta inválida local de guarda. O runner
parou o servidor e removeu somente seu diretório comprovadamente proprietário.

Nenhuma conexão com 10.20.2.25:3306, nenhum acesso a bancos existentes, nenhum import/reset em
DEV/OCI. Migrations só no servidor descartável autorizado, sem mudar SQL/schema. Matriz extensiva
OCI-02 não repetida. Fresh npm ci/prisma generate em cópias sem .env/node_modules compartilhados;
não repetido o risco de loader implícito por symlink observado na execução anterior OCI-03.
Laboratório systemd/ingress não possui servidor de banco nem faz sync/email externo.

## 24. Limitações

- Solução de upload não aprovada: bloqueador operacional explícito da classificação desta entrega.
- HeatWave gerenciado/TLS/CA/privilégios/backup/restore continuam pendentes, independentemente do
  MySQL isolado; não atribuir PASS OCI a compatibilidade local.
- Nginx real/NSG/Cloudflare/App/SMTP e certificado de produção não consultados ou modificados.
- CSP completa progressiva; não houve homologação visual, screenshots, teste de navegador real de
  PDF/blob/vídeos/grafos ou enforcement pleno. Política aplicada limita-se a controles compatíveis.
- Rotação/alertas, retenção aprovada, empacotamento/referências current e assets retidos dependem
  da próxima entrega e da instalação autorizada.
- Proxy testou Express/middlewares/verificador reais com estado sintético. Login/banco/App reais
  através do edge não foram exercitados; testes de persistência completos ocorreram separadamente.
- Reboot/deadline reais apenas na VM descartável. A prova de kill usou processo sintético, não
  uma sync persistida em andamento; invariantes de recuperação seguem a suíte existente.
- Relatório original OCI-01 não está versionado; usados escopo/histórico fornecidos e código atual.

## 25. Instalação futura

Runbook contém os 35 tópicos e sequência precisa: revisar decisão de uploads e preflight → backup
protegido das configurações → preparar diretórios → artefato OCI-05 e current disponíveis → instalar
snippets/units → remover default legado revisado → aplicar política/contexts → nginx -t e verify →
segredos/SMTP/App → HeatWave homologado/schema inicializado por job separado → iniciar API e medir
ready → iniciar worker e conferir heartbeat → reload autorizado → smoke/enable/monitoramento.
Sem release/DB/secrets corretos, não substituir página temporária. Nenhuma etapa executada na OCI.

## 26. Rollback

Restaurar arquivos de configuração anteriores e main nginx.conf, validar e recarregar; parar novos
processos quando necessário e restaurar units/estado enabled anterior. Preservar ambiente, chaves,
evidências, banco e releases. Reverter somente customizações SELinux desta instalação conforme
inventário; nunca desabilitar Enforcing. Porta local 3001 e módulo têm ordem de remoção documentada.
Sem rollback de migrations, sem promessa de reversão automática de schema, sem prune de dados.

## 27. Próxima entrega

Revisar esta entrega e decidir transporte de uploads antes do deploy. Próxima recomendação:
**OCI-DEPLOY-05 — Immutable Release Packaging, Controlled Migrations & Rollback Preparation**,
aproveitando units/ingress/storage/preflight e contrato de assets retidos. Depois, homologação
HeatWave/recuperação e implantação autorizada. OCI-05 pode preparar artefatos enquanto decisões
operacionais são resolvidas, mas não pode liberar deploy nem migrations de produção sem os gates.
Não iniciada automaticamente.

## 28. Final verdict

**OCI-DEPLOY-04 — PARTIAL / BLOCKED.**

Implementação e testes locais aprovados; deploy bloqueado pelo limite confirmado de 100 MB sem
solução aprovada, além dos gates operacionais herdados. Não há alegação de produção operacional.
HEAD e branch preservados; alterações permanecem locais, sem staging/commit/push. VM descartável
parada/removida e servidor MySQL temporário removido; arquivos públicos/evidências locais mantidos
para revisão. Encerrar e aguardar autorização explícita; não iniciar a entrega seguinte.
