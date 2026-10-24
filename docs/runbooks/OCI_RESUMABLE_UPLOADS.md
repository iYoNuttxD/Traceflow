# OCI — Uploads retomáveis de evidências

Contrato implementado em OCI-DEPLOY-04.1. Validação local; nenhum deploy OCI.

## 1. Motivação

Um multipart com 100 MiB de arquivos, JSON e delimitadores ultrapassa 100 MB.
A interface mantém uma execução atômica, enviando os arquivos em partes antes da confirmação.
O fluxo de reteste usa o mesmo transporte e a mesma transação de negócio.

## 2. Limite da Cloudflare

Restrição informada pelo operador: **100.000.000 bytes por requisição**. Cada parte tem
no máximo 8.388.608 bytes; a confirmação JSON tem no máximo 6.291.456 bytes.
Não há alteração de plano, DNS, proxy ou SSL. A homologação pela zona real continua pendente.

## 3. Limites funcionais

Preservados: 50 MiB/vídeo, 10 MiB/outro arquivo, 100 MiB agregado, 20 arquivos,
5 gerais, 3 por passo e JSON de até 6 MiB. MiB = 1.048.576 bytes.
Formatos, validação de conteúdo, 100 passos e regras de reteste permanecem canônicos.
Nenhuma redução automática para acomodar a Cloudflare.

## 4. Arquitetura

`Route → Controller → Service → Repository → Prisma → MySQL`.
A rota recebe o stream; o service coordena leases, autorização, storage e o service de execução.
Somente repositories usam Prisma. A UI usa a API do domínio sobre o `httpClient` existente.
`EvidenceUpload` representa **todos** os arquivos de uma execução, não uma execução por arquivo.

## 5. Protocolo

Base `/api/test-cases/:id/execution-uploads`. POST inicia; GET lista.
GET/DELETE `/:uploadId` consultam/cancelam. PUT `/:uploadId/files/:fileId/parts/:index`
recebe bytes. POST `/:uploadId/complete` confirma a execução inteira.
Estados: `OPEN`, `FINALIZING`, `COMPLETED`, `CANCELLED`, `EXPIRED`.
Falha recuperável retorna a OPEN, preservando o hash do payload de confirmação.

## 6. Inicialização

POST JSON: `idempotencyKey` UUID v4, `testCaseVersion` inteiro e `files[]` com
`name`, `field`, `sizeBytes`, `sha256`. Field: `evidence` ou `stepEvidence.N`.
Valida tamanho, formato declarado, versão, passos, limites e autorização antes da admissão.
Retorna 201 com uploadId, IDs opacos por arquivo, chunkSize, expiração e progresso.
Não aceita paths nem chaves de storage fornecidas pelo cliente.

## 7. Partes

PUT binário `application/octet-stream`. Índice começa em 0. Headers obrigatórios:
`X-Chunk-SHA256` (hex minúsculo de 64 caracteres), `X-Chunk-Offset` (índice × 8 MiB).
O tamanho real deve coincidir com o esperado; a última parte pode ser menor.
Partes fora de ordem são aceitas. A UI envia uma por vez. Há no máximo 40 partes por sessão.

## 8. Checksums

SHA-256 incremental no navegador em fatias de 256 KiB; buffer de envio limitado à parte.
O servidor verifica SHA e tamanho da parte durante streaming de até 64 KiB, depois verifica
cada parte e o arquivo inteiro na montagem. O validador canônico verifica novamente o conteúdo.
`@noble/hashes` 2.0.1 e `stream-json` 3.7.0 são dependências diretas fixadas no lockfile;
nenhuma acrescenta binário nativo. JSON usa tokens sem empacotar valores inteiros na memória.

## 9. Idempotência

A chave inicial é única por usuário; repetir o mesmo manifesto retorna a mesma sessão.
Alterar o manifesto com a mesma chave retorna 409. Parte repetida idêntica é verificada e
retorna progresso; conteúdo divergente retorna 409. Complete vincula um hash do payload
normalizado: repetir retorna a mesma execução; payload diferente retorna 409.
O recibo e a execução são gravados na mesma transação. Recibos são retidos até expiração + 7 dias.
Após essa retenção não existe promessa de deduplicação: consultar o histórico antes de novo envio.

## 10. Progresso

GET retorna somente sessões do autor no contexto autorizado. Lista limitada a 10,
priorizando até 3 pendentes. `receivedParts` contém índice, tamanho e hash; `confirmedBytes`
conta apenas partes publicadas no MySQL. Não retorna paths ou storageKeys.
A UI nunca mostra 100% antes da confirmação de negócio.

## 11. Retomada

Pausar aborta a requisição, sem cancelar a sessão. Após reload/reabertura, selecionar
“Consultar envios pendentes”, escolher o envio e selecionar todos os arquivos originais.
O navegador guarda somente IDs opacos em sessionStorage; não guarda conteúdo nem payload.
Repreencher os dados da execução; se Complete já foi tentado, devem corresponder ao payload original.
SHA, tamanho, destino e versão são conferidos antes de enviar partes ausentes.
Depois de crash pode ser necessário aguardar até 90 s pelo lease; o retry automático é finito.

## 12. Finalização

Complete recebe o JSON canônico de execução, inclusive retest quando aplicável.
Monta arquivos privados, valida todos e revalida usuário, sessão, projeto, versão e referência.
Promove com hardlinks exclusivos no mesmo filesystem durante a transação de execução;
cria execução, snapshots, evidências, auditoria e efeitos de reteste; grava o recibo COMPLETED.
Somente então a API responde `{execution}`. Nenhuma evidência parcial se torna pública.

## 13. Associação

Destinos gerais e por passo vêm do manifesto validado; o JSON contém resultados dos passos.
A associação e os snapshots históricos continuam no serviço canônico. Downloads continuam
em `/api/test-evidence/:id/content`, com autorização, attachment, nosniff e no-store.
Não há URL pública direta para arquivos ou diretórios temporários.

## 14. Cancelamento

DELETE exige CSRF e autoria. Marca CANCELLED e invalida o token. Preserva o prazo de um
writer ainda ativo para a limpeza não concorrer com ele. Cancelamento de COMPLETED retorna 409.
O rascunho da UI permanece; arquivos confirmados nunca são removidos por cancelar.

## 15. Expiração

TTL padrão de 24 h, contado pelo relógio UTC do banco, sem renovação indefinida por conexão.
A sessão expirada não recebe novos writes. Uma finalização já admitida pode concluir dentro
do seu lease, mesmo ao cruzar o TTL. Falta momentânea de conexão não expira um upload.

## 16. Limpeza

Executar com a identidade `traceflow` e o mesmo root privado da API, com ambiente protegido
injetado pelo supervisor/operador autorizado. Executar como root não é substituto: o storage
confere o proprietário e recusa diretórios pertencentes a outro UID.

CLI existente de manutenção é reutilizada: `npm run uploads:cleanup:dry-run`;
para aplicar em produção, no ambiente protegido de manutenção, `npm run uploads:cleanup -- --confirm-production`.
Não executar esses comandos com URL de desenvolvimento por engano. Flags não substituem a
identificação do ambiente e autorização operacional. Testes persistentes exigem TEST_DATABASE_URL.
Lote de até 50 recibos por chamada, idempotente, códigos de saída não zero quando há falhas.
Recomenda-se chamada pelo agendador de manutenção do operador a cada 15 min; até 32 sessões
podem reservar temporários. Registrar resultado/atraso. **Nenhum agendador foi instalado**.
Não foi criado um terceiro daemon: isso preserva o controle dos dois writers do OCI-05.
Se uma automação independente for adotada no deploy, ela deve participar da exclusão de
writers e ser suspensa/drenada antes de migrations e troca de release.
Cleanup só remove entradas conhecidas sob UUIDs de sessão, sem seguir symlinks, e consulta
TestEvidence antes de remover chaves finais. Conserva sessões e leases ativos. Nunca usar `rm -rf`,
`find -mtime -delete` ou limpeza genérica do storage.

## 17. Segurança

Admissão serializada por uma linha de orçamento no banco, cotas persistentes, leases com token
aleatório e comparação antes de publicar. UUID não constitui autorização. Paths gerados no servidor,
O_NOFOLLOW/O_EXCL, modos 0700/0600, dono do serviço, fsync antes do recibo, sem sobrescrever arquivos.
MIME, assinaturas, UTF-8 e conteúdo ativo continuam validados pelo fluxo canônico.

## 18. CSRF

Todos os POST/PUT/DELETE passam pela proteção existente. O PUT binário é uma exceção exata
apenas à exigência de JSON. Complete tem parser de 6 MiB depois de autenticação/autorização/CSRF;
o parser global dos outros endpoints permanece em 100 KiB. Nenhuma origem foi ampliada.

## 19. Autorização

Sessão válida, usuário ativo, membership ativo e papel diferente de VIEWER. A autoria da sessão
é obrigatória. Revalidação antes de publicar bytes e na transação final, com locks do usuário,
sessão e projeto. Revogação, desativação e exclusão lógica bloqueiam continuidade.

## 20. Isolamento entre projetos

Upload pertence a userId, projectId, testCaseId e testCaseVersion. Não se pode reutilizar uploadId
em outro caso/projeto, associar um passo inexistente nem trocar o proprietário ou a referência.
404 evita revelar identificadores de outro contexto; 403 indica papel/conta sem permissão.

## 21. Storage

`/var/lib/traceflow/test-evidence/.uploads/<uploadId>/part-<leaseToken>` e
`work-<leaseToken>/<storageKey>`. O arquivo final fica na raiz privada canônica por storageKey.
Todos estão no mesmo filesystem persistente, fora da release e do webroot. A API traceflow é
o único serviço regular com escrita nesse root; worker continua sem escrita em evidências.
Backups devem capturar banco e arquivos consistentes; restaurar juntos e executar reconciliação
antes de liberar tráfego. Temporários podem ser reconstruídos somente a partir de partes íntegras.

## 22. Prisma

Client e CLI **6.12.0**. Migration aditiva `20261014090000_resumable_evidence_uploads` cria
EvidenceUpload, EvidenceUploadBudget e a linha de admissão id=1. Cadeia passa de 67 para 68.
JSON, DATETIME(3), inteiros e índices únicos normais; ReadCommitted e SELECT FOR UPDATE.
Não há FK com cascade para entidades de negócio: o recibo precisa sobreviver a purge para
compensar arquivos. Autorização é revalidada no domínio; execuçãoId é único, sem cascata.
Aplicar somente pelo migration job controlado OCI-05, após backup e gates, em futura autorização.
Migrations anteriores são imutáveis. Nenhuma migration de rollback destrutiva é fornecida.

## 23. Compatibilidade com releases

Temporários e ledger sobrevivem à troca de current. Protocolo versão 1 usa manifesto explícito,
partes de 8 MiB e storage persistente comum. Uma release só pode receber sessões abertas se
entender esse contrato. Rollback para release anterior a OCI-04.1 exige suspender novos envios,
comunicar indisponibilidade de retomada, conservar ledger/arquivos e reativar uma versão compatível.
Nunca apagar migration/tabelas ou arquivos para “desfazer” a publicação.

## 24. Nginx

Template real `deploy/nginx/traceflow.conf`: partes 8m, request buffering off, leitura 60s;
Complete 6m e leitura 90s. Restante mantém request buffering on. Proxy preserva /api, headers,
cookies, CSRF, IP confiável e no-store. Não alterar diretivas de SSE, webhook, SPA e cache de assets.
Validar `nginx -t` antes de reload futuro. Paths privados continuam negados.

## 25. Cloudflare

Partes e JSON cabem individualmente no limite de 100 MB. Manter proxy e Full (strict), Origin CA,
restrição da origem e portas Node/MySQL privadas. O endpoint multipart legado permanece funcional,
mas clientes antigos com requests acima de 100 MB continuam sujeitos a 413 na borda.
A UI nova usa o protocolo para toda execução com arquivo; execução sem arquivo mantém a rota antiga.

## 26. Timeouts

Recepção de parte: 45 s; lease: 90 s; montagem: 60 s; HTTP Node: 60 s para receber request.
Cliente: 60 s por parte e 90 s por Complete; Nginx conforme seção 24.
Retry: no máximo 3 tentativas, backoff 0,5/1 s e Retry-After; se espera >30 s, retorna o erro para
retomada manual. Retenta rede/408/429/500/502/503/504; não retenta automaticamente erros permanentes.
Graceful shutdown existente drena requests até 30 s; leases recuperam interrupções forçadas.

## 27. Limites de recursos

Variáveis sem segredos, inteiros positivos; tetos podem ser reduzidos, piso de disco só aumentado:

| Variável TEST_UPLOAD_                        |                 Padrão | Finalidade               |
| -------------------------------------------- | ---------------------: | ------------------------ |
| TTL_SECONDS                                  |                  86400 | Prazo de retomada        |
| ACTIVE_USER / ACTIVE_PROJECT / ACTIVE_GLOBAL |            3 / 10 / 32 | Sessões ainda não limpas |
| TEMP_USER_BYTES / TEMP_GLOBAL_BYTES          | 268435456 / 1073741824 | Reserva temporária       |
| MIN_FREE_BYTES                               |              536870912 | Piso livre               |
| CONCURRENT_USER / CONCURRENT_GLOBAL          |                  2 / 4 | Leases simultâneos       |

Reserva por sessão = `2 × totalBytes + 8 MiB` (partes, montagem e uma repetição).
O piso livre considera reservas ao iniciar. Verificação de statfs também antecede cada lease.
ENOSPC retorna 507. Memória do servidor não cresce com o tamanho total dos arquivos; o JSON de
execução é o único corpo completo limitado a 6 MiB, mais objetos normalizados de domínio.
A quota de temporários não substitui monitoramento da capacidade dos arquivos finais.

## 28. Concorrência

Um writer por sessão, até 2 por usuário e 4 globalmente. 429 UPLOAD_BUSY com Retry-After: 3.
Lock global só durante admissão/publicação/cleanup; o stream ocorre fora da transação.
Token e prazo impedem publicação por writer antigo após crash, cancelamento ou outro claim.
Arquivos de tentativas interrompidas são removidos pelo próximo claim ou cleanup elegível.
O serviço finalizador mantém o lock do recibo durante promoção e commit, serializando cancelamento.

## 29. Erros HTTP

400 formato/offset/comprimento; 401 sessão ausente/expirada; 403 CSRF/permissão; 404 contexto;
409 manifesto/payload/versão/parte divergente, partes faltantes ou lease perdido; 410 encerrada;
413 limite; 415 Content-Type; 422 integridade; 429 cota/concorrência/rate; 507 espaço;
503 storage indisponível. Um corte do transporte pode impedir entrega do JSON de erro:
consultar status e retomar, sem assumir que a operação não foi confirmada.

## 30. Observabilidade

Eventos: upload_created, upload_part_received, upload_progress_read, upload_completed,
upload_cancelled, upload_expired, upload_cleaned, upload_rejected e recovery/cleanup_pending/failed.
Logs incluem apenas IDs operacionais, bytes, quantidade, status e códigos; sem nomes de arquivos,
hashes, tokens, cookies, conteúdo ou payload. Uma linha por parte confirmada (máximo 40/sessão),
limitada também pela admissão/rate limiter de 120 requests/min/usuário.
Alertar sobre falhas de cleanup, sessões elegíveis antigas, 507, 503, 429 sustentado, leases
vencidos persistentes, bytes reservados, disco/inodes, RSS/CPU e latência de confirmação.

## 31. Recuperação após falhas

Antes do recibo da parte: bytes incompletos não são anunciados. Depois: status permite pular a parte.
Antes do COMMIT final: nenhuma execução parcial; tentativas deixam arquivos privados rastreáveis.
Após COMMIT com resposta perdida: repetir Complete retorna a mesma execução. Nunca remover arquivos
no catch de um resultado SQL ambíguo. Cleanup consulta referências atuais antes de qualquer unlink.
Falha de filesystem/DB mantém recibo para retry; falha de limpeza não revoga confirmação válida.
Após crash, aguardar lease, selecionar os originais e retomar. Usar logs/IDs, sem coletar conteúdo.

## 32. Testes

Backend: `test/api/resumable-evidence.test.js`, `test/unit/test-cases/resumable-storage.test.js`,
regressão `test/api/test-cases-s1-07.test.js` e suíte completa. Frontend: `resumable-uploads.test.js`,
`resumable-uploads-ui.test.jsx`, catálogo, retestes e suíte completa. Sempre usar TEST_DATABASE_URL
apontando a um MySQL descartável cuja versão, datadir, porta e schema foram verificados.
Relatório e evidência sanitizada: [OCI_DEPLOY_04_1_CLOUDFLARE_RESUMABLE_UPLOADS_REPORT.md](../deliveries/OCI_DEPLOY_04_1_CLOUDFLARE_RESUMABLE_UPLOADS_REPORT.md).

### Reprodução do laboratório integrado

Os harnesses versionados em `deploy/tests/resumable-browser.mjs`, `resumable-fixtures.mjs`
e `resumable-crash.mjs` são **exclusivos do laboratório**, sem função de instalação em produção.
A fixture e o crash devem ser copiados para a raiz de uma cópia pública do backend na VM
(`./test` e `./src` precisam resolver nessa cópia). Eles recusam hostname diferente de `lima-tf041`
e schema diferente de `traceflow_oci_041_267_test`; verificam o datadir antes de mutações SQL.

1. Criar uma nova VM Lima VZ ARM64 chamada tf041, em LIMA_HOME privado e próprio, sem mounts
   ou chaves pessoais. Perfil utilizado: 2 CPUs, 4 GiB, Oracle Linux 9.8; não reutilizar VM OCI.
2. Instalar Node 22.23.2 ARM64, Nginx 1.20.1 e MySQL Community 26.7.0 ARM64. SHA-256 dos
   binários oficiais utilizados: Node `fff4078c5def658577f92c88db7db3bc0072924bfb93fe52c1e744a54e94abb8`;
   MySQL `894da547042baf5f7da6eac72252978dc3da146aca706dbbae2f4176aded34b4`.
3. Criar datadir `/var/tmp/tf041-lab/mysql-data`, porta aleatória em loopback e credencial
   aleatória descartável. Guardar somente no arquivo privado `lab-private.json`, 0600,
   com port/password/schema; criar o schema test e validar identidade. Não usar .env existente.
4. Copiar fontes públicas, npm ci nativo, Prisma generate e migrations via TEST_DATABASE_URL
   explícita. Rodar os testes focados antes da fixture E2E: eles limpam somente seu schema próprio.
5. Preparar usuário traceflow, duas releases imutáveis `tf041-a`/`tf041-b`, current em A,
   storage persistente e a unit API existente. Aplicar a política estreita SELinux nessa VM,
   mantendo Enforcing. Usar configuração Nginx derivada do template apenas com hostname .test,
   porta HTTPS 8443, peer loopback de laboratório e certificado sintético; encaminhar somente
   esse HTTPS para 127.0.0.1:19441 no host. Outros forwards de Node/MySQL ficam negados.
6. Executar a fixture como root **na VM marcada**, para criar apenas usuários/projeto/casos
   sintéticos e env do serviço. Iniciar API/Nginx e aguardar /health/ready antes do navegador.
7. No host, usar um diretório privado `/private/tmp/tf041-<nonce>` (ou `/tmp/tf041-<nonce>`),
   com owner contendo `OCI-DEPLOY-04.1`, `lima-home`, Playwright Core em browser-tools e cópia
   0600 de e2e-private.json gerada pela fixture. Definir `TRACEFLOW_UPLOAD_LAB_ROOT` e
   `TRACEFLOW_LIMA_BIN` para executar `node deploy/tests/resumable-browser.mjs`.
   Chrome é iniciado em perfil novo headless; não usa sessão pessoal, tracing ou screenshots.
8. O harness percorre upload, perda de resposta via CDP, pause/reload/reseleção, A→B,
   cancelamento, filesystem sem escrita, DOM móvel, autorização/CSRF, 413 e paths privados.
   Cada repetição precisa de uma fixture nova; não relaxar asserções de unicidade.
9. Após o navegador, executar o harness de crash na cópia do backend da VM como root.
   Ele mata apenas o MainPID validado da API de laboratório, espera o lease real e verifica
   reenvio/confirm/replay/cleanup. Não executá-lo na OCI ou em servidor de desenvolvimento.
10. Coletar somente totais/status/métricas; remover credenciais sintéticas, parar MySQL e
    destruir somente a VM/diretorios próprios após conferir PID/datadir/ownership. Preservar
    evidência sanitizada. Esse roteiro exige preparação explícita e não é um instalador automático.

## 33. Diagnóstico

Consultar o recibo com o mesmo usuário, comparar confirmedBytes e partes; verificar código HTTP,
readiness da API, status Nginx, disco/inodes e último cleanup. Não imprimir ambiente nem URL SQL.
429: esperar lease ou limpar sessões elegíveis, sem remover sessões ativas manualmente.
422: selecionar originais íntegros; 409 de payload: consultar histórico e usar dados originais;
410: cancelar/descartar a referência local e iniciar novo envio. 503/507: corrigir storage antes de retry.

## 34. Operação

Na futura homologação: aplicar migration aditiva pelo job OCI-05; instalar configuração Nginx
validada; ativar API/frontend compatíveis; manter worker e permissões originais; configurar o
agendamento de manutenção e seus gates de exclusão de writers; testar upload/retomada/rollback.
SELinux Enforcing permanece ativo, com a política estreita existente para proxy ao tcp/3001.
O novo subdiretório herda o root privado já autorizado; não ampliar ReadWritePaths nem webroot.
Não há chamada a GitHub/SMTP ou alteração de banco externo exigida pelo protocolo.

## 35. Limitações

Um host e filesystem privado compartilhado entre as releases, como na topologia OCI atual;
scale-out requer storage compartilhado/objeto e nova validação, não está implícito neste contrato.
Retomada exige sessão/autorização válidas e reescolha dos arquivos após reload. SHA-256 detecta
integridade, não equivale a antivírus. Falhas abruptas de host/disco e backups exigem operação.
Ainda é necessária homologação real na borda Cloudflare e na VM/HeatWave OCI, sem presumir
identidade entre MySQL Community 26.7 e o serviço gerenciado.

Fontes de implementação: [Node fs](https://nodejs.org/docs/latest-v22.x/api/fs.html),
[noble-hashes](https://github.com/paulmillr/noble-hashes),
[stream-json Parser](https://github.com/uhop/stream-json/wiki/Parser).
