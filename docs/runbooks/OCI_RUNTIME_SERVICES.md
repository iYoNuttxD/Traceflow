# OCI — Nginx, systemd e storage persistente

## 1. Objetivo e limite de autorização

OCI-DEPLOY-04 prepara arquivos e testes locais. **Nada deste procedimento foi instalado na
OCI.** A página temporária, certificados, DNS, NSGs, firewalld e HeatWave permanecem intactos.
Os comandos de instalação abaixo só serão executados em uma entrega de deploy explicitamente
autorizada, depois dos gates da seção 34. Não executar o harness de testes na VM de produção.

Contratos existentes: [ambiente/runtime](OCI_ENVIRONMENT.md),
[worker](GITHUB_AUTOMATIC_SYNC.md), [MySQL](OCI_MYSQL_COMPATIBILITY.md).
A referência OCI-DEPLOY-01 disponível aqui é o escopo/histórico fornecido na conversa; não há
relatório OCI_DEPLOY_01 versionado para consulta. OCI-02 e OCI-03 continuam preservadas.

## 2. Arquitetura

Cloudflare Full (strict) → Nginx 80/443 → frontend estático ou API `127.0.0.1:3001`.
API e worker usam Prisma/MySQL privado; só o worker inicia o scheduler automático. A API
mantém sincronizações manuais. SSE e rate limiting são locais a um único processo API.
Nenhum Redis, broker, cron, scheduler alternativo ou endpoint novo foi introduzido.

## 3. Pré-requisitos

Oracle Linux 9.8 ARM64, Node **22** em `/usr/bin/node`, Nginx 1.20.1 com SSL/realip,
systemd 252, SELinux Enforcing, firewalld ativo, usuário/grupo `traceflow` não administrativo
com shell nologin. A VM real possui Node 22.23.2 segundo o inventário fornecido; o caminho
real **não foi consultado remotamente**. Verificar `command -v node`, `readlink -f`, `node -v`
e `nginx -V` antes da instalação; corrigir a unidade por revisão se o binário estiver em outro
local. `validate-service-environment.mjs` recusa outra major de Node.

Ferramentas: Python 3.9+, curl, openssl, policycoreutils-python-utils, checkpolicy e
policycoreutils-devel (checkmodule/semodule_package). Conferir RPMs/erratas Oracle completos;
`nginx -v` sozinho não informa o nível de backports de segurança. Não compilar upstream antigo
como substituto dos RPMs corrigidos da distribuição.

## 4. Estrutura de diretórios

```text
/opt/traceflow/releases/<id>/backend/       código/dependências imutáveis
/opt/traceflow/releases/<id>/deploy/        preflight e arquivos operacionais da release
/opt/traceflow/releases/<id>/frontend/dist/ somente saída compilada
/opt/traceflow/current                     referência da release ativa (OCI-05)
/opt/traceflow/shared/                     reservado; não é a raiz de evidências
/etc/traceflow/runtime.env                 configuração comum protegida
/etc/traceflow/api.env                     ajustes permitidos da API
/etc/traceflow/github-worker.env           ajustes permitidos do worker
/var/lib/traceflow/test-evidence/           diretório real persistente
/var/www/traceflow/current                 referência exclusiva ao dist público (OCI-05)
/etc/nginx/traceflow/                      snippets de ingress
```

Nenhuma referência `current` definitiva é criada por OCI-04. Symlinks usados no laboratório
existem apenas dentro da VM descartável. O pacote futuro precisa incluir o preflight em
`deploy/scripts/validate-service-environment.mjs`; não copiar `node_modules` do desenvolvimento.

## 5. Permissões

| Recurso | Proprietário/modo | Contrato |
|---|---|---|
| `/opt/traceflow`, `releases`, código | root:root, diretórios 0755; arquivos 0644, executáveis necessários 0755 | `traceflow` somente leitura; preservar modos dos binários |
| `shared` | root:root 0700 | nenhum uso de escrita atual pelo runtime |
| `/etc/traceflow` / arquivos env | root:root 0700 / 0600 | PID 1 lê EnvironmentFile antes do sandbox; processo recebe ambiente, não lê arquivo |
| `/var/lib/traceflow` | root:root 0711 | permite atravessar até a folha privada |
| `test-evidence` | traceflow:traceflow 0700 | arquivos novos privados por UMask 0077 |
| dist público | root:root; diretórios 0755, arquivos 0644 | Nginx lê somente compilados |
| chave Origin CA | root, permissão restrita existente | invisível aos dois serviços; nunca incluída na release |
| units/snippets | root:root 0644 | não contêm segredos |
| logs | journald / nginx root e grupo operacional restrito | acesso administrativo; não publicar |

Não usar chmod/chown recursivo no storage existente. Não dar ao runtime escrita no código.
API e worker compartilham UID e parte do ambiente; não são uma fronteira de isolamento entre
identidades hostis. O mount namespace nega ao worker acesso ao storage, mas separar UIDs/segredos
seria trabalho futuro se o modelo de ameaça exigir isolamento entre esses processos.

## 6. Preparação de storage

Revisar primeiro o plano:

```bash
sudo python3 deploy/scripts/prepare-runtime-directories.py
# Somente na instalação futura autorizada:
sudo python3 deploy/scripts/prepare-runtime-directories.py --apply
```

O script tem allowlist fixa de sete diretórios, verifica conta/grupo, ancestrais reais,
proprietários e permissões antes de alterar qualquer diretório. Não segue symlinks, não exclui,
não cria configuração, não ativa releases e não percorre arquivos existentes para chmod/chown.
Pode corrigir modo/proprietário da própria folha. Falha parcial pode deixar diretórios vazios;
reexecução após diagnóstico é idempotente e preserva dados. Rodar sob administração exclusiva,
sem outro administrador alterando ancestrais simultaneamente.

API valida 0700/owner, caminho absoluto, ancestrais sem symlink e fora do código/webroot antes
de escutar. Falta de storage impede startup; perda de acesso depois degrada readiness. Quota,
disco cheio e falha física ainda exigem monitoramento. Backup deve combinar MySQL e evidências;
nenhum job de backup, prune ou exclusão foi criado nesta entrega.

## 7. Nginx e servidor padrão existente

Fonte: `deploy/nginx/traceflow.conf`, incluída uma vez dentro de `http {}`. Instalar snippets
em `/etc/nginx/traceflow/`. O arquivo define um default HTTP que encerra com 444 e um default
TLS com `ssl_reject_handshake on`, disponível desde Nginx 1.19.4.

**Alteração necessária fora de conf.d:** remover, por revisão manual, o bloco `server` de
exemplo/default de `/etc/nginx/nginx.conf` que escuta 80/[::]:80 e publica `/usr/share/nginx/html`,
incluindo seu `include /etc/nginx/default.d/*.conf`. Preservar `user`, `events`, MIME types,
modules e o include de conf.d. Não basta adicionar um segundo `default_server`; haveria conflito
ou servidor legado ainda acessível por nomes próprios. Inventariar os outros includes/servers.
Não remover virtual hosts de terceiros nem usar uma substituição textual cega.

O laboratório validou um main config isolado com o servidor de exemplo removido, usando os RPMs
Oracle. O main config real não foi lido. Antes de reload, verificar que só os defaults previstos
respondem em cada socket e que Host inválido/IP não publica conteúdo.

## 8. Certificados e TLS

Referências, sem conteúdo: `/etc/nginx/ssl/traceflow-origin.pem` e
`/etc/nginx/ssl/traceflow-origin.key`. Certificado existente vence em **13/10/2027**, conforme
inventário do usuário; configurar alerta antes do vencimento na fase operacional. Não houve
leitura, cópia ou geração desses arquivos reais. Laboratório gera certificado próprio de um dia.

TLS 1.2/1.3, ciphers TLS 1.2 ECDHE/AEAD, session tickets desligados. Default TLS também limita
protocolos; SNI inválido é recusado antes de servir a aplicação. Origin CA autentica a origem
perante a Cloudflare; **não autentica o cliente Cloudflare**. Não usar `curl -k` como evidência
de cadeia válida; testes diretos futuros precisam da CA de origem apropriada e SNI correto.

## 9. Cloudflare e restrição da origem

Manter Full (strict), proxy ligado e DNS existente. O Nginx permite conteúdo HTTPS somente se
o **peer TCP original** pertencer aos ranges oficiais; loopback não é exceção em produção.
HTTP com Host canônico redireciona para domínio fixo, mantendo caminho/query. Demais hosts
são descartados. Os ranges identificam a rede do provedor, não uma zona específica;
mTLS/Authenticated Origin Pulls pode ser avaliado em entrega posterior se essa fronteira for
necessária. Nenhum certificado ou mecanismo adicional foi configurado. Mesmo com Host/SNI corretos, acesso direto de fora da Cloudflare recebe 403.

A zona tem **100 MB por requisição**, confirmado pelo usuário nesta execução. Nenhuma
configuração da zona foi consultada/alterada. Não adicionar Cache Everything a `/api`, callbacks
ou probes; manter SSE sem transformação/buffering por regra da zona. Rocket Loader e injeções
opcionais de scripts precisam de avaliação própria antes de enforcement de CSP.

Restrição adicional de 80/443 aos CIDRs Cloudflare em NSG/firewalld é recomendável na instalação
futura: manter SSH restrito separado, salvar regras atuais, adicionar todos os CIDRs IPv4/IPv6,
validar HTTPS pelo edge e acesso administrativo, só então remover ingress amplo. Rollback restaura
as regras anteriores de 80/443, nunca abre 3001/3306. Atualizações de ranges precisam coordenar
firewall e Nginx para evitar outage. Nada disso foi aplicado remotamente.

## 10. IP real e atualização dos ranges

`set_real_ip_from` limita quem pode fornecer CF-Connecting-IP; `geo $realip_remote_addr`
verifica o peer original, não o IP reescrito. Express recebe Host/X-Forwarded-Host fixos,
Proto=https, Port=443 e **um único** X-Forwarded-For=`$remote_addr`. Forwarded, CF-Connecting-IP,
True-Client-IP e headers de reescrita são removidos. Request ID novo é gerado no ingress.
`TRUST_PROXY=loopback` permanece obrigatório; não usar `$proxy_add_x_forwarded_for`.

Snapshot oficial de 14/10/2026 contém 15 CIDRs IPv4 e 7 IPv6; tem origem/data/digest no arquivo.
Revisar antes de cada instalação, mensalmente e após aviso do fornecedor:

```bash
python3 deploy/scripts/update-cloudflare-ips.py /caminho/novo/cloudflare.candidate.conf
diff -u deploy/nginx/snippets/cloudflare.conf /caminho/novo/cloudflare.candidate.conf
```

O gerador usa HTTPS verificado, limites de tamanho/tempo, exige redes globais/famílias corretas,
recusa listas vazias, duplicatas, 0/0 e injeção. Só cria arquivo novo; não instala, atualiza NSG ou
faz reload. Revisar diff, executar harness/syntax e aprovar instalação separadamente. Falha no
fetch conserva snapshot anterior; não substituir por lista vazia nem desabilitar verificação TLS.

## 11. Headers de segurança e CSP progressiva

Estáticos recebem nosniff, no-referrer, DENY, Permissions-Policy sem câmera/microfone/localização
(não há captura dessas mídias pelo produto) e HSTS de um ano/includeSubDomains, alinhado ao
backend atual, sem preload. TLS da origem não exige HSTS para Full(strict).

CSP aplicada: `base-uri 'self'; object-src 'none'; frame-ancestors 'none'`. A política completa
é **Report-Only**: script self, estilos self/inline para React Flow e estilos dinâmicos, imagens
self/data/blob, mídia e frames self/blob, connect self e workers self/blob. Não há unsafe-inline
para scripts. O script inline de tema precisa de hash do **HTML compilado**, a ser incluído no
contrato do artefato OCI-05; sem isso há violação report-only esperada, sem bloqueio funcional.
PDFs usam iframe blob, não plugin object. Não reivindicar CSP completa enforced nem homologação
visual de PDFs/grafos/vídeos: sem screenshots nesta entrega. Não há novo endpoint de reports.
Validar esses fluxos no navegador antes de promover a CSP; violação report-only não impede o app.

Proxy preserva Helmet, CORS e Set-Cookie; normaliza somente HSTS e Cache-Control para uma única
política, adicionando Permissions-Policy. Não aplica CSP estática sobre JSON da API. Respostas
próprias 413/503 usam JSON, nosniff, no-store e HSTS.

## 12. SPA, arquivos e cache

Publicar somente dist em `/var/www/traceflow/current`. `try_files` entrega index em rotas React
profundas. `/assets` e URLs com extensão ausentes retornam 404. Dotfiles, código, manifests,
mapas, chaves, logs e caminhos privados são negados; não há autoindex. A raiz pública não deve
conter fontes/segredos mesmo quando existem negações de defesa. `disable_symlinks` permite a
referência current controlada, mas impede links dentro do dist.

HTML usa no-cache/revalidação. Assets que seguem o contrato Vite de hash no nome usam um ano
immutable somente em respostas de sucesso; assets sem hash usam no-cache. Nome parecido com
hash **não prova** imutabilidade: OCI-05 deve validar manifest, nomes/bytes e impedir substituição
de conteúdo sob o mesmo nome.

Contrato de retenção para OCI-05: cada dist ativado deve conter também a união dos assets das
releases ainda suportadas, com comparação de hash antes de aceitar colisões. Manter inicialmente
uma janela **proposta de sete dias**, além da janela de rollback; confirmar por produto/telemetria
antes do deploy. Uma aba mais antiga ainda pode precisar recarregar. Preservar diretórios antigos
sem disponibilizar seus chunks no dist atual não resolve lazy imports. Nenhuma união, ativação,
limpeza automática ou script de releases foi implementado agora.

## 13. API e timeouts

`proxy_pass http://127.0.0.1:3001` **sem URI** preserva `/api` e `/api/`. Não redireciona `/api`
para `/api/`, não altera métodos e não reenvia mutations a outro upstream. Cache desligado,
no-store/no-transform sempre (inclusive SSE), erros Express preservados (proxy_intercept_errors off). Falha de conexão/timeout
do próprio Nginx retorna JSON 503; não retorna index.html nem detalhes internos.

| Controle | Valor | Motivo |
|---|---:|---|
| client_header_timeout | 15s | recebimento de headers |
| client_body_timeout | 60s entre leituras | cliente lento; não é duração total do upload |
| keepalive_timeout | 15s | conexão HTTP ociosa |
| send_timeout | 60s entre escritas | cliente que não recebe |
| proxy_connect_timeout | 5s | upstream está na mesma VM |
| proxy_send_timeout | 60s entre escritas | envio do body já recebido |
| proxy_read_timeout normal | 60s entre leituras | chamadas convencionais; sync manual devolve execução assíncrona |
| proxy_read_timeout upload | 90s | validação/persistência de evidência |
| proxy_read_timeout SSE | 75s entre leituras | três heartbeats de 25s |

Uploads são recebidos pelo spool privado do Nginx antes do envio ao Node (request_buffering on),
evita que a velocidade do cliente conflite com requestTimeout Node de 60s. Monitorar espaço e
permissões de `/var/lib/nginx/tmp/client_body` conforme RPM; não usar webroot/storage de evidência
como spool. Buffering de resposta fica desligado especificamente no SSE.

## 14. SSE

Endpoint real `/api/projects/:projectId/events`, HTTP/1.1 upstream, Connection limpo,
proxy_buffering off, gzip off, proxy_cache off, read timeout 75s. Backend possui heartbeat de
25s e vida máxima de 15min. Cliente continua usando reconexão/REST existentes. Não supor eventos
em memória compartilhada com worker: ele atualiza persistência, consultada pela interface.
Monitorar simultaneidade/FDs; não elevar limites sem medição. Recarregar Nginx pode deixar workers
antigos atendendo SSE até encerramento; avaliar reload/drain na homologação real.

## 15. Webhooks

`POST /api/webhooks/github-app`, `express.raw` JSON com limite de 1 MiB. Método/caminho/corpo,
X-Hub-Signature-256, X-GitHub-Delivery e X-GitHub-Event são preservados. Nginx não decodifica,
reformata ou reserializa JSON; não há retry de POST. HMAC é verificado pela implementação atual.
Duplicidade é autoridade do banco/aplicação; o teste de transporte usa ledger sintético e a
suíte backend testa a persistência isolada. GitHub App real não foi acessada/configurada.

## 16. Uploads e bloqueador Cloudflare

| Limite atual | Valor |
|---|---:|
| arquivo comum | 10 MiB = 10.485.760 bytes |
| vídeo | 50 MiB = 52.428.800 bytes |
| arquivos por etapa / gerais / totais | 3 / 5 / 20 |
| soma dos arquivos | 100 MiB = 104.857.600 bytes |
| único campo JSON multipart | 6 MiB = 6.291.456 bytes |
| Nginx, rota de registrar execução | 108 MiB = 113.246.208 bytes |
| Cloudflare, confirmado | **100 MB por requisição** |

A maior requisição válida inclui até 106 MiB de conteúdo mais boundaries/headers multipart
limitados pelo parser (até 21 partes úteis, headers limitados por Busboy). O teto Nginx de 108 MiB
acomoda o contrato; não é uma elevação dos limites funcionais. O tamanho exato depende dos
headers/nome/boundary; não declarar que 100 MiB é o maior arquivo, nem omitir os 6 MiB de JSON.
Mesmo se o fornecedor interpretar MB em base binária, o overhead ainda excede o cap confirmado.
O laboratório transporta 106 MiB e recusa Content-Length >108 MiB; esse caso grande não simula
validação de conteúdo de negócio. Suíte backend mantém os limites de evidência reais.

**Bloqueador operacional aberto:** requisições grandes válidas podem ser recusadas pela
Cloudflare antes de chegar ao Nginx. Recomendação que preserva a funcionalidade atual: aprovar
capacidade Cloudflare superior ao envelope completo (por exemplo, plano/configuração com 200 MB,
confirmado para a zona), mantendo Full(strict), domínio e mesmos endpoints. Não contratar/alterar
plano automaticamente. Alternativa futura: transporte em partes com recomposição autorizada,
integridade/quotas/idempotência, mediante entrega específica; não existe hoje e não foi criado.
Redução coerente frontend/backend requer aprovação de produto; não foi aplicada. Remover proxy
ou expor Node não é solução recomendada.

413 da aplicação/Nginx tem mensagem JSON sanitizada. 413 HTML do edge é convertido pelo cliente
atual em mensagem genérica de falha, sem renderizar HTML; não há retry automático nem mensagem
específica de Cloudflare. Frontend mantém validação de arquivo/contagem/100 MiB e timeout HTTP
15s. Upload lento pode ultrapassar esse timeout apesar de body_timeout Nginx permitir inatividade
60s: medir fluxo real antes do deploy e decidir ajuste específico de upload em entrega autorizada.
Não aumentar o timeout global indiscriminadamente nem prometer que a requisição abortada não
chegou ao backend.

## 17. Downloads privados

Somente `/api/test-evidence/:id/content`, autenticado/autorizado por projeto. Não há alias de
`/var/lib/traceflow/test-evidence`. Traversal/symlinks continuam recusados pela implementação.
Nginx não acessa o storage: DAC 0700 + tipo privado + ausência de mapeamento HTTP. Backup e
restauração não devem copiar evidências para dist. Os headers de download vêm do backend.

## 18. Serviço API

`traceflow-api.service`: Node direto em `backend/src/server.js`, equivalente a npm start,
WorkingDirectory do backend ativo, User/Group traceflow. Type=exec comprova exec, **não readiness**.
ExecStartPre valida constantes do supervisor sem banco ou .env. Um único processo HTTP.
Somente `/var/lib/traceflow/test-evidence` é escrita persistente autorizada; PrivateTmp oferece
espaço temporário isolado. Não há ExecStartPre de migrations, verificação remota ou DDL.

## 19. Serviço worker

`traceflow-github-worker.service`: Node em `backend/src/github-worker.js`, equivalente ao comando
canônico npm run github:worker. Scheduler true obrigatório; API false. Sem listener HTTP,
sem escrita persistente em arquivos, storage de evidências inacessível. Ambos importam o contrato
compartilhado de configuração existente; não remover SMTP/URLs/privacidade do ambiente do worker.
Uma unidade não template por VM reduz duplicação acidental; não iniciar um segundo processo via
npm/cron. Reservas, heartbeat, leases/fencing persistidos continuam autoridade de concorrência.

## 20. Ambiente do supervisor

Partir do inventário e exemplo da OCI-03. Arquivo comum runtime.env e overrides por serviço
precisam existir (podem estar vazios os overrides). Não são scripts shell, não usar export,
substituição `$(...)` ou expansão de `${VAR}`. Valores com espaços/especiais devem seguir a sintaxe
EnvironmentFile do systemd. Segredos multiline permanecem base64 conforme contrato existente.

EnvironmentFile tem precedência sobre Environment da unidade. Por isso o preflight **recusa**
NODE_ENV, HTTP_HOST, PORT, TRUST_PROXY, storage, scheduler ou shutdown inconsistentes, sem imprimir
valores. Limita SHUTDOWN_TIMEOUT_MS a 1–30s, abaixo dos 45s do supervisor; mudança desse orçamento
requer revisão coordenada. TEST_DATABASE_URL é proibida nesses serviços de produção.

## 21. Segredos

Nenhum segredo nas units, argumentos de ExecStart, dist ou Git. Configurar fora das releases pelo
operador autorizado/gestor de segredos, root 0600. Não copiar exemplos vazios e tentar iniciar como
se fossem configuração completa. Não executar `systemctl show -p Environment`, `env`, `printenv`,
`set -x`, dumps de `/proc/*/environ` ou colar URLs/chaves em diagnósticos. `InaccessiblePaths`
protege arquivos após PID 1 carregar o ambiente; não elimina acesso do processo aos próprios
segredos nem substitui controle de acesso ao host/journal. Chave Origin CA nunca entra no ambiente.

## 22. SELinux

Não desabilitar Enforcing. Política fonte `deploy/selinux/traceflow_nginx.te`: somente
`httpd_t → traceflow_api_port_t:tcp_socket name_connect`. Rotular tcp/3001 com esse tipo;
Oracle Linux 9.8 atribui 3000–3001 a ntop_port_t por default. A regra exata local para 3001 deve
ser revisada e não pode sobrepor customização de outro serviço. A política é por **tipo/porta**,
não por IP; loopback/firewall continuam necessários para restringir destino/exposição.

```bash
bash deploy/scripts/configure-selinux.sh --plan
# Somente no futuro autorizado:
sudo bash deploy/scripts/configure-selinux.sh --apply
```

Nenhum `httpd_can_network_connect`/`httpd_can_network_relay` é habilitado. Script não altera
booleanos já existentes: inventariar e revisar um eventual on prévio. Não usar audit2allow cego.
Diretórios públicos e dist reais usam httpd_sys_content_t; backend continua usr_t, arquivos
operacionais usam tipos padrão de `/etc`, `/var/lib` e `/etc/systemd/system`. Não rotular toda a
release como conteúdo web nem storage como httpd_sys_rw_content_t.

Após instalar: `restorecon` nos arquivos de config/units/código e **no destino real do dist**,
além de current. Copiar arquivos de /tmp preservando xattrs pode deixar user_tmp_t e fazer
systemd recusar até abrir uma unit; isso foi reproduzido no laboratório. Certificados mantêm
contextos apropriados do pacote para `/etc/nginx/ssl`; conferir com `matchpathcon`/`ls -Zd`, sem
ler seu conteúdo. Não aplicar restorecon recursivo em segredos/storage/release de terceiros.
Diagnosticar `ps -eZ`, `semanage port -l -C`, `matchpathcon`, AVCs e DAC antes de mudar política.

## 23. firewalld, NSG e Security Lists

Preservar 22 restrito pela rede OCI, 80 e 443. Nunca abrir 3001, 3306 ou 33060 ao público.
NSGs e Security Lists controlam tráfego VCN; firewalld controla o host; bind loopback limita
Node; SELinux controla operações de processos. São controles complementares. O MySQL mantém
endpoint privado autorizado. Não incluir firewall commands de alteração em startup das units.

## 24. Logs e retenção

API/worker stdout/stderr → journald, identificadores próprios. Nginx access log JSON contém
hora, requestId gerado, categoria fixa (api/asset/spa/health/other), método allowlist, status,
bytes e tempos. Não contém request URI, query, path bruto, IP, user-agent, referer, cookies,
authorization, corpos ou headers GitHub. Categoria fixa evita tokens embutidos também no path.

**Error log HTTP do virtual host vai para /dev/null**: Nginx 1.20.1 não oferece formato redigível
para esse log e erros 413/upstream podem incluir a request line completa. Decisão explícita:
preservar status/tempo no access log, startup/syntax via supervisor e logs da aplicação; perder
detalhes por request do error log. Não elevar log level em produção sem coleta temporária
revisada que evite dados reais. Não há sanitizador externo nem serviço adicional.

Proposta para futura aprovação: access logs 14 dias, compressão/rotação diária via logrotate do
RPM (verificar `/var/log/nginx/*.log`, owner e reopen); journald 14 dias e limite total 256 MiB.
Não aplicar drop-in global de journald nesta entrega: afeta outros serviços da VM. Auditoria de
negócio MySQL segue política própria (365 dias por default), não esta retenção operacional.
Configurar alertas de espaço, 5xx, restart rate e certificado antes de produção.

## 25. Health/readiness

`/health`, `/health/live`, `/health/ready` são rotas Node existentes. Nginx recusa todas publicamente
(404), sem SPA. Probes locais via `127.0.0.1:3001`, sem credenciais e sem depender da Cloudflare.
Liveness 200 indica processo; readiness 200/503 inclui estado/schema/storage somente leitura,
timeout 3s e uma consulta em andamento no máximo. Banco indisponível não causa restart por probe.
`check-runtime.sh` usa URL fixa, não segue redirect, ignora proxies e não imprime bodies/ambiente.

## 26. Heartbeat do worker

`systemctl active` não prova agenda funcional. Consultar status autorizado existente
`GET /api/projects/:id/github/sync/status`: automation.status/reason, lastHeartbeatAt, checkedAt,
nextSyncAt, run. Heartbeat recente: max(60s, 3 × GITHUB_SCHEDULER_TICK_MS). Consultas operacionais
somente leitura futuras devem usar conta restrita e nunca imprimir tokens/keys:

```sql
SELECT MAX(heartbeatAt) AS lastHeartbeatAt, COUNT(*) AS workers
FROM GitHubSchedulerWorker;
SELECT status, origin, step, heartbeatAt, errorCode
FROM GitHubSyncRun
WHERE status IN ('QUEUED', 'RUNNING');
```

Não executar essas consultas no HeatWave nesta entrega. Avaliar ausência de heartbeat, agenda
vencida, contenção/cooldown, idade dos runs e reinícios em conjunto. Ticks vazios não geram log.
Eventos canônicos: github_scheduler_operation_failed, github_sync_claimed,
github_sync_run_completed/failed, github_sync_heartbeat_failed e github_scheduler_stopped.
Ausência de progresso pode decorrer de rate limit legítimo; não liberar lease manualmente.

## 27. Inicialização futura

Exige todos os gates da seção 34. Após instalação revisada, EnvironmentFiles e schema pronto:
daemon-reload, iniciar API, validar live/ready; iniciar worker, verificar heartbeat; só então
substituir/recarregar ingress e habilitar boot. WantedBy=multi-user.target existe nas duas units.
Boot automático após reboot foi validado na VM descartável; repetir em janela de homologação
autorizada da infraestrutura real.

## 28. Reinício e falhas

Restart=on-failure, RestartSec=10s, até três partidas numa janela de 300s. Não há retry infinito
agressivo. Configuração inválida aparece pelo nome de variáveis, não valores. Corrigir causa,
validar preflight e usar reset-failed antes de start quando limite atingido. systemd 252 pode
manter Result=exit-code após limite em ExecStartPre; observar ActiveState, NRestarts e journal,
não depender só de Result=start-limit-hit. Falha de banco apenas degrada readiness; não usar
monitor que reinicie incessantemente por 503.

## 29. Graceful shutdown

SIGTERM, KillMode=control-group, SendSIGKILL=yes. API tem deadline interno de 30s e TimeoutStopSec
45s: bloqueia novas requests, fecha SSE, aguarda HTTP/sync manual, desconecta Prisma. Se trava,
sai com erro ou é encerrada pelo supervisor; nunca marca sync como sucesso artificial.
Worker bloqueia novos claims e aguarda trabalho ativo; não usa SHUTDOWN_TIMEOUT_MS e recebe teto
externo de **90s**. Esse teto não cobre uma sync inteira de duração arbitrária. Se excedido, SIGKILL
preserva recuperação posterior via lease/fencing, sem promessa de rollback de operações externas.
Nenhum cleanup extra em ExecStop/ExecStopPost. Não enviar múltiplos sinais manualmente como
procedimento normal de manutenção.

## 30. Diagnóstico

| Sintoma | Verificação segura |
|---|---|
| Unit not found / permission denied | caminho/mode e contexto systemd_unit_file_t; daemon-reload após restorecon |
| 226/NAMESPACE | existência dos paths ReadWrite/Inaccessible, incluindo `/etc/nginx/ssl` |
| preflight falha | nomes no service_contract_invalid; não imprimir ambiente |
| API live 200, ready 503 | schema, conexão/pool/TLS, storage, drain; não migrar automaticamente |
| 503 do proxy | API/bind, SELinux porta/AVC, configuração; não trocar por SPA |
| 403 origem | peer fora dos ranges CF ou acesso direto; não adicionar trust 0/0 |
| TLS/525/526 | SNI, cadeia/validade Origin CA e Full(strict), sem baixar chave |
| SSE atrasa/cai | localização específica, gzip/buffering, heartbeat/read timeout/edge |
| 413 | distinguir edge 100 MB, Nginx 108 MiB e limites de negócio |
| timeout frontend | 15s atual, velocidade/requisição; verificar resultado antes de reenviar |
| worker ativo sem heartbeat | status autorizado, tick/DB/App/cooldown, relógio UTC |
| disco/logs crescem | storage + spool + journal + access logs; limpeza só por política autorizada |

## 31. Instalação futura controlada (NÃO EXECUTADA)

1. Revisar diff desta entrega, decidir uploads e demais gates; confirmar VM/ambiente. Verificar
   conta traceflow, binários/módulos/RPMs, interfaces/portas, Enforcing e firewall. Não acessar
   segredos por comandos de diagnóstico. Não levar arquivos de `deploy/tests` ao runtime final.
2. Criar backup protegido **só de configurações operacionais** atuais (nginx.conf, traceflow.conf,
   snippets existentes, units e customizações SELinux), inventário de modos/contexts/serviços.
   Não copiar `/etc/nginx/ssl` ou imprimir `/etc/traceflow`. Guardar em local administrativo 0700.
3. Executar prepare-runtime-directories.py em modo plano; aprovar e aplicar. Artefato OCI-05 deve
   existir, conter backend/dependências Linux ARM64 e preflight, dist verificado e referências
   current ativadas pela entrega própria. Nunca apontar webroot para a raiz da release.
4. Após esses pré-requisitos, com `release` apontando para artefato revisado:

   ```bash
   sudo install -d -o root -g root -m 0755 /etc/nginx/traceflow
   sudo install -o root -g root -m 0644 "$release/deploy/nginx/traceflow.conf" /etc/nginx/conf.d/traceflow.conf
   sudo install -o root -g root -m 0644 "$release/deploy/nginx/snippets/"*.conf /etc/nginx/traceflow/
   sudo install -o root -g root -m 0644 "$release/deploy/systemd/traceflow-api.service" /etc/systemd/system/
   sudo install -o root -g root -m 0644 "$release/deploy/systemd/traceflow-github-worker.service" /etc/systemd/system/
   ```

5. Ajustar **somente** o default legado em nginx.conf conforme seção 7. Aplicar política SELinux
   revisada e restaurar contextos dos destinos (`/etc/nginx/traceflow`, arquivo conf, as duas units,
   preflight/backend da release e dist real). Não mudar contexto/conteúdo das chaves por cópia.
6. `nginx -t` e `systemd-analyze verify` via scripts. Conferir conflitos de listeners/includes.
   Não usar `nginx -T` em evidência pública sem revisão de possíveis includes sensíveis.
7. Operador provisiona runtime.env/api.env/github-worker.env com proteção; validar contrato sem
   imprimir valores. Homologar HeatWave/TLS/identidade/privilégios em entrega própria; executar
   migration job separado autorizado. **Nunca** migrar no startup.
8. Iniciar API e verificar live/ready locais. Iniciar worker e observar heartbeat/progresso real
   autorizado. Só depois reload Nginx validado, smoke pelo edge, enable das units e monitoração.
   Qualquer falha antes do reload mantém a configuração carregada/página temporária existente;
   restaurar os arquivos em disco para não deixar uma surpresa no próximo restart.

Esta sequência não autoriza sua execução nesta entrega. Instalação não inclui empacotamento,
ativação/prune de releases, migrations, Terraform ou alteração remota da GitHub App.

## 32. Rollback da configuração

Se syntax/TLS/proxy/SSE/cookies/Host falharem: parar worker novo se ativo, parar API nova quando
necessário, restaurar os arquivos de configuração do backup protegido (inclusive main nginx.conf
legado), restorecon, nginx -t e só então reload. Não reiniciar cegamente Nginx com arquivo inválido;
workers antigos continuam atendendo enquanto não houver reload bem-sucedido.

Restaurar units anteriores ou remover apenas as units instaladas por esta entrega quando não
existiam, daemon-reload e estado enabled anterior. Preservar EnvironmentFiles, chaves/certificados,
evidências, banco e releases. Configuração de página temporária restaurada não depende da API.
Se SELinux for causa, diagnosticar contexto/política; não mudar para permissive.

Para desfazer **somente** a customização SELinux nova quando não havia configuração prévia:
primeiro restaurar/parar o ingress dependente, remover regra local exata `tcp/3001` por
`semanage port -d -p tcp 3001`, depois `semodule -r traceflow_nginx`; default ntop_port_t retorna.
Restaurar fcontexts prévios do inventário antes de restorecon. Não apagar módulos/rules de outro
serviço. Se já existiam customizações, restaurar o estado inventariado, não aplicar este atalho.
Não há rollback de dados/migrations nem garantia de reversão de schema.

## 33. Testes reproduzíveis e limitações

Host, Node 22, sem banco:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s deploy/tests -p 'test_*.py' -v
for script in deploy/scripts/*.sh; do bash -n "$script"; done
node --check deploy/scripts/validate-service-environment.mjs
node --check deploy/tests/controlled-upstream.mjs
```

O harness Linux
exige **hostname lima-tf04**, virtualização, root e marcador privado `/run/traceflow-oci04-disposable`
com token igual a TF04_VM_TOKEN. Esses gates impedem execução acidental em traceflow-app; não
são uma autorização para criar o marcador em um host existente. Usar VM nova, sem montagens,
sem SSH agent forwarding, sem portas encaminhadas (exceto canal administrativo local), sem
credenciais reais. Oracle Linux ARM64 da imagem/digest registrados na evidência OCI-02.

Instalar RPMs de teste e Node22 verificado; copiar fontes allowlist sem .env/node_modules/dados,
rodar npm ci/prisma generate sem .env, produzir dist `/api`, instalar somente no laboratório.
Estrutura na VM: raiz de fontes contém backend, deploy e frontend/dist. Gerar marcador aleatório
0600 e passar token apenas pelo ambiente; não imprimir. Executar:

```bash
# EXCLUSIVAMENTE dentro da VM descartável marcada; cria configs/serviços de laboratório.
python3 deploy/tests/run-linux.py --report /tmp/oci04-linux-novo.json
```

`run-linux.py` cria certificado próprio, ambientes sintéticos e bloqueia saída externa das units
com drop-in exclusivo do teste. Simula um peer Cloudflare em 127.0.0.2 **somente no arquivo do
laboratório**; ao final restaura o snapshot de produção e prova que loopback também é recusado.
Testa Nginx real → Express controlado com middleware CORS/CSRF e verificador HMAC reais, sessões
e ledger de webhook sintéticos. API/worker reais são iniciados sem DB disponível para provar
sandbox/liveness/readiness/shutdown. Banco persistente só é exercitado pela suíte full separada,
com runner proprietário. Não prova login/sync/SMTP/HeatWave reais através da Cloudflare.

Sem screenshots, sem evidência visual, sem acesso ao domínio publicado. Reboot completo da VM
descartável iniciou automaticamente os dois entry points reais; readiness ficou 503 sem banco.
O probe `deploy/tests/worker-sandbox.mjs` também verificou quatro paths negados, PrivateTmp e
Argon2 nativo. Com TF04_TEST_STOP_DEADLINE=true ele ignora SIGTERM apenas no teste e o systemd
o encerrou após 90s. A prova não executou uma sync real; recuperação de sync longa na infraestrutura
real continua gate operacional. Para reproduzir o suplemento, substituir temporariamente ExecStart
da unit worker pelo probe na VM marcada, definir TF04_DISPOSABLE=local-oracle-linux-fixture,
conferir o evento tf04_worker_sandbox, parar a unit e verificar Result=timeout; depois remover
o drop-in do probe. Para ensaio de reboot, remover também o drop-in de fixture da API, habilitar
somente as duas units de teste, reiniciar a VM, comparar boot_id, live/ready, estado e ExecStart,
e então parar/desabilitar os serviços. Esses passos são exclusivos do laboratório descartável.
O harness não é instalador de produção. Ao concluir, parar e remover somente a VM própria.

## 34. Dependências e bloqueadores de deploy

- Solução aprovada para limite Cloudflare de 100 MB e ensaio de uploads/timeout 15s.
- OCI-05: pacote imutável ARM64, preflight, contrato dist/assets retidos, ativação e rollback.
- Homologação HeatWave gerenciado: TLS/CA/hostname, auth, privilégios mínimos e recuperação.
- Schema inicializado por migration job separado; nenhum DDL no startup.
- Segredos reais, SMTP com entrega e certificados corretos, GitHub App/callbacks/webhook reais.
- Instalação ingress/units e defaults inventariados; Full(strict)/SSE/cookies e firewall reais.
- Backup coordenado MySQL/evidências, restore ensaiado, política de retenção e alertas aprovados.
- CSP progressiva com validação funcional de tema/PDF/imagem/vídeo/grafo antes de enforcement.

## 35. Checklist e fontes

Antes da ativação autorizada: revisão dos arquivos e gates; snapshot CF atualizado; hosts/SNI
negados; frontend/dist e assets retidos; `/api` sem rewrite; cookies/CSRF/CORS; SSE/heartbeat;
HMAC e idempotência; decisão de upload; storage privado; duas units com env válido; readonly do
código; Enforcing e regras restritas; portas internas fechadas; live/ready e heartbeat; logs
sem query/segredo; backup/rollback; smoke pelo edge e janela de observação. Não aprovar produção
com base apenas em nginx -t ou systemctl active.

Fontes primárias consultadas em 14/10/2026:
[Nginx realip](https://nginx.org/en/docs/http/ngx_http_realip_module.html),
[Nginx proxy](https://nginx.org/en/docs/http/ngx_http_proxy_module.html),
[Nginx TLS/reject handshake](https://nginx.org/en/docs/http/ngx_http_ssl_module.html),
[Cloudflare ranges](https://www.cloudflare.com/ips/),
[Cloudflare 413 e limites](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/4xx-client-error/error-413/),
[Cloudflare cache](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/),
[systemd 252: exec](https://github.com/systemd/systemd/blob/v252/man/systemd.exec.xml),
[Oracle Linux SELinux](https://docs.oracle.com/en/operating-systems/oracle-linux/9/selinux/).
Comportamento efetivo também verificado nos binários/política instalados na VM descartável,
sem inferir resultados do host OCI real.
