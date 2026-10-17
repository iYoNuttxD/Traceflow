# OCI — Releases imutáveis e publicação controlada

> **OCI-DEPLOY-07.1:** o primeiro schema comprovadamente vazio possui fluxo separado
> `inspect-initial-schema` → `migrate-initial`, descrito em [migrations](OCI_MIGRATIONS.md#oci-deploy-071--primeira-inicialização).
> A preparação do banco não exige SMTP/uploads/GitHub nem backup de dados inexistentes.
> A ativação da aplicação mantém todos os seus gates; as seções OCI05 abaixo preservam o histórico.

Status: implementação local OCI-DEPLOY-05. Este procedimento não autoriza execução na OCI.
Consulte [o relatório](../deliveries/OCI_DEPLOY_05_RELEASE_MIGRATION_ROLLBACK_REPORT.md),
[o contrato de ambiente](OCI_ENVIRONMENT.md), [os serviços OCI-04](OCI_RUNTIME_SERVICES.md)
e [migrations](OCI_MIGRATIONS.md). Não alterar os arquivos históricos dessas entregas.

## 1. Objetivo

Construir uma vez, verificar conteúdo e preparar uma publicação recuperável. Somente um artefato
aprovado por SHA-256 e associado a um commit completo pode ser promovido. As receitas ainda
não commitadas desta entrega geram candidatos de laboratório; não são artefatos autorizados
para staging ou produção.

## 2. Arquitetura

Cloudflare → Nginx → API Node.js; worker GitHub independente; ambos usam Prisma Client/MySQL.
As camadas Route → Controller → Service → Repository → Prisma permanecem intactas.
O operador administrativo executa `deploy/scripts/release.py`; a aplicação não executa DDL.
O frontend vem do mesmo artefato runtime, publicado em geração estática separada.

## 3. Pré-requisitos

Oracle Linux 9.8 ARM64, Node 22 em `/usr/bin/node`, Python 3.9+, OpenSSL 3, systemd,
Nginx e SELinux Enforcing. Instalar previamente os contratos OCI-03/04 em uma execução
autorizada: usuário traceflow, storage privado, labels, firewall, dois serviços e ambiente
protegido. O operador é root; traceflow não pode escrever releases, catálogo ou symlinks.

Produção continua bloqueada por HeatWave/TLS/permissões, backup/restore, homologação real dos uploads pela Cloudflare,
SMTP, GitHub App e autorização de implantação. Não preencher gates como aprovados sem evidência.
Não usar o marcador de laboratório em servidor existente.

## 4. Build ARM64

A partir do checkout aprovado, com Node 22 no PATH:

```bash
node scripts/package-release.mjs export --commit "$COMMIT_SHA_COMPLETO" --output "$FONTE_NOVA"
```

Registrar o `sourceSha256` retornado em um canal de revisão confiável. A exportação usa
`git show` e uma allowlist; não copia o working tree inteiro, arquivos .env ou node_modules.
Se a receita difere do commit, a exportação exige `--candidate` e grava
`sourceState=candidate`. Não converter esse campo manualmente.

Transferir a fonte pública para um builder Oracle Linux ARM64 isolado. Normalizar UID/GID do
tar de transporte para o usuário do builder, sem links ou metadados AppleDouble. O inventário
verifica proprietário e conteúdo. Não reutilizar um diretório de saída existente.

```bash
node scripts/package-release.mjs build --source "$FONTE" --source-sha256 "$SOURCE_SHA256" \
  --output "$SAIDA_NOVA" --epoch "$BUILD_EPOCH_UTC" --build-id "$BUILD_ID_12_HEX"
```

Guardar o epoch, build ID, fonte e receita. A repetição com esses mesmos inputs, no mesmo
toolchain, deve produzir os mesmos bytes. O workspace temporário exclusivo é
`/tmp/traceflow-build-<buildId>`; sua existência causa recusa. Após queda abrupta do builder,
investigar propriedade/processos antes de qualquer limpeza assistida. Não sobrescrever.

## 5. Instalação de dependências

Somente no builder: `npm ci` nos dois componentes, lockfiles existentes e registry oficial.
HOME, cache e configurações npm são temporários; o ambiente não herda tokens. Depois do build,
`npm prune --omit=dev --ignore-scripts` reduz o runtime. Prisma CLI, retido pelo npm como
peer opcional, é removido explicitamente desse runtime após a geração.

Não executar npm install/ci/generate no servidor durante promoção. O bundle administrativo
retém o conjunto instalado necessário à CLI e fica separado, privado e sem serviço permanente.
Licenças e notices são preservados; source maps, tipos e documentação de dependências
não necessária ao runtime são removidos. Não há atualização de dependências nesta entrega.

## 6. Prisma Client

Client e CLI permanecem em 6.12.0. O builder executa validate e generate; carrega o engine
`linux-arm64-openssl-3.0.x`, verifica Argon2 e os entry points. Repete o smoke após extrair
os pacotes verificados. Não aceitar engines x86, Darwin ou geração posterior no destino.
Os arquivos históricos de schema/migrations são inventariados por hash.

## 7. Frontend

Vite compila com API relativa `/api` e timeout de 15000 ms. Esse contrato permite o mesmo
bundle em origens diferentes, desde que ambas publiquem a API em /api e aceitem esse timeout.
Outra variável VITE ou base exige build explícito diferente; não prometer promoção universal.
Nenhum segredo vai ao Vite. A publicação não altera rotas, UI ou funcionalidades.

## 8. Manifesto

Formato v1: release ID, commit completo, build ID/timestamp UTC, sourceState, hashes de fonte e
receita, Node/npm/Prisma, sistema/arquitetura/OpenSSL, contrato frontend, checks nativos,
schema e cadeia de migrations, inventário de caminhos, tamanho, modo e SHA-256 de cada arquivo.

ID: `YYYYMMDDTHHMMSSZ-<commit40hex>-<build12hex>`. Não usar latest como identidade.
Cada tar contém `manifest.json`. O descritor externo `release.json` referencia os dois
arquivos e seus hashes de arquivo/manifesto.

## 9. Checksums e confiança

O digest esperado de release.json é obrigatório e deve vir da aprovação do build, não apenas
de um arquivo recebido ao lado do tar. SHA-256 comprova integridade relativa àquele digest;
não substitui assinatura, identidade do builder ou governança da aprovação.

```bash
python3 deploy/scripts/release.py verify --descriptor "$PACOTE/release.json" --digest "$DIGEST_APROVADO"
```

Recusar conteúdo extra, checksum divergente, ausência de manifesto, plataforma errada,
path traversal, links, arquivos especiais, duplicatas, diretórios graváveis por terceiros,
arquivos grandes ou inventário incompatível. Extração manual validada; sem extractall no
processo operacional. Certificados públicos não são confundidos com chaves privadas.

## 10. Estrutura da release

```text
pacote/
  release.json
  runtime.tar.gz
  admin.tar.gz
/opt/traceflow/releases/<id>/       backend/, frontend/dist/, deploy/, manifest.json
/opt/traceflow/administration/<id>/ CLI/dependências, prisma/, manifest.json
/opt/traceflow/current             -> releases/<id>
/opt/traceflow/shared/release-state/ catálogo, lock, journal e recibos
/opt/traceflow/release-guard.json   estado mínimo legível pelos serviços
/var/www/traceflow/generations/<id>-<nonce>/dist/
/var/www/traceflow/current         -> generations/<id>-<nonce>/dist
/etc/traceflow/                    configurações protegidas, externas ao pacote
/var/lib/traceflow/                storage privado persistente, externo ao pacote
```

Não empacotar uploads/evidências, logs, backups, .env, chaves, tokens, state Terraform ou dados.

## 11. Transferência futura

Somente após aprovação: transportar os três arquivos por canal autenticado até uma área de
entrada controlada pelo operador. Verificar o digest externo e os dois tars antes de staging.
As mesmas cópias aprovadas atravessam homologação/produção, sem reconstrução no destino.
Armazenamento remoto, assinatura e pipeline de promoção serão entregas próprias; não existem
como automação nesta etapa.

## 12. Staging

Com diretórios OCI-04 já preparados e protegidos, inicializar uma vez:

```bash
python3 deploy/scripts/release.py init
python3 deploy/scripts/release.py stage --descriptor "$PACOTE/release.json" --digest "$DIGEST_APROVADO"
python3 deploy/scripts/release.py status
```

Init não adota symlinks preexistentes sem journal. Stage verifica cópias privadas, extrai em
diretório temporário e registra o catálogo por último. Não altera current nem serviços.
Repetir o mesmo ID recusa sobrescrita. Um diretório órfão após SIGKILL não vira release
aprovada, mesmo que tenha o nome final. Não apagar órfãos automaticamente.

## 13. Permissões

Runtime root:root, diretórios 0755, arquivos 0644/0755 conforme inventário. Administração,
catálogo e journal 0700; autorizações e estado privados 0600. O guard público contém somente
estado operacional mínimo, sem credenciais. Symlinks ficam em pais root sem escrita de terceiros.
Não aplicar chmod/chown recursivo em storage, /opt ou /var/lib para resolver um erro.

Configurações e arquivos da aplicação mantêm os contratos OCI-03/04. Não dar DDL ao usuário
runtime. Nginx só lê a árvore pública; não criar alias para storage privado.

## 14. Ativação

Preparar uma autorização JSON root:root 0600 fora do repositório. Campos obrigatórios:
`formatVersion=1`, environment, operation, releaseId, descriptorSha256, expiresAt UTC
(futuro, menor que 24h), target, gates, expectedSchemaFingerprint, frontend.url.
O contrato de target/credenciais está no runbook de migrations.

Gates: writersControlled, heatwaveTlsHomologated, restoreRehearsed, deploymentAuthorized,
uploadsResolved, smtpHomologated e githubAppHomologated. Para migrations também backupVerified
e backupReference. Cada autorização é específica da operação e release; não existe --force.

```bash
python3 deploy/scripts/release.py activate --release-id "$RELEASE_ID" \
  --digest "$DIGEST_APROVADO" --authorization "$AUTORIZACAO_PROTEGIDA"
```

O processo verifica identidade/schema antes de parar serviços, pausa API e worker, verifica
PIDs/escritores locais, troca links, sobe API/readiness, depois worker/heartbeat, e faz smoke.
Cada symlink é trocado atomicamente; o conjunto NÃO é atômico. Há janela de manutenção,
sem promessa de zero downtime. A versão só é aprovada após todos os checks.

## 15. systemd

Reutilizar exatamente `traceflow-api.service` e `traceflow-github-worker.service` da OCI-04.
Instalar, numa entrega futura autorizada, `deploy/systemd/traceflow-release-guard.conf` como
drop-in `20-release-guard.conf` em cada diretório `/etc/systemd/system/<unit>.d/`.
Validar com systemd-analyze verify e daemon-reload. Não criar um terceiro serviço permanente.

O ExecStartPre adicional consulta o guard: journal interrompido, boot ID/PID inválido, fase
incompatível ou migration concluída sem ativação explícita bloqueiam startup. Após migration
idempotente, activate pode reativar a mesma release para executar novamente os gates.
O preflight de ambiente OCI-04 continua em vigor. Nenhum ExecStartPre executa migrations.

## 16. Nginx

Manter o template OCI-04 com root /var/www/traceflow/current, /api no loopback, fallback SPA,
cache immutable dos assets, HTML sem cache longo, caminhos privados negados e SSE configurado.
Não copiar release inteira ao document root. Cada geração pública recebe restorecon; SELinux
permanece Enforcing. Nginx permanece ativo durante a troca de links.

Cloudflare Full (strict)/Origin CA e firewall reais não foram acessados nesta entrega.
O certificado de laboratório é sintético. Não introduzir TLS insecure ou acesso público ao Node.

## 17. Assets anteriores

Gerações são derivadas imutáveis: index atual + união de assets com hash das releases
atuais/anteriores e das ativadas nos últimos 7 dias. Mesmo nome com bytes diferentes recusa
a publicação. Não modificar frontend/dist de uma release selada.

Após rollback, a geração recomposta inclui os chunks da versão retirada. O teste A/B usou
dois builds Vite reais com hashes distintos; somente a cópia de laboratório B recebeu um
atributo sintético, sem alteração na UI do repositório.

A política promete disponibilidade no current por pelo menos 7 dias após a última ativação;
abas mais antigas que essa janela devem recarregar. Gerações públicas antigas não são
apagadas automaticamente nesta versão, para evitar remoção de chunks ainda necessários.

## 18. Readiness

API: /health/live e /health/ready em 127.0.0.1:3001, ambos HTTP 200 no smoke final.
Readiness é funcional, não apenas PID ativo. Conferir usuário traceflow, cwd do PID apontando
para o backend da release e socket restrito ao loopback. Timeout de partida API: 30s;
não altera os timeouts de shutdown da OCI-04.

## 19. Smoke

Verifica também JSON AUTHENTICATION_REQUIRED/401 em /api/auth/me sem sessão, index esperado,
rota profunda SPA, bytes/hashes dos entry assets, cache immutable e 404 para caminhos privados
e asset inexistente. O worker exige processo correto e exatamente um heartbeat recente no
banco, posterior à partida, dentro de 45s. Comprova schema real, histórico e ausência de drift.

```bash
python3 deploy/scripts/release.py smoke --release-id "$RELEASE_ID" \
  --digest "$DIGEST_APROVADO" --authorization "$AUTORIZACAO_SMOKE"
```

Não faz login nem mutação de negócio. O smoke não homologa SMTP ou chamadas reais ao GitHub.
Heartbeats recentes de outro worker causam recusa conservadora; investigar e aguardar expiração,
sem apagar leases ou mascarar a divergência.

## 20. Erros de deploy

Falha antes da ativação preserva links. Falha durante ativação para ambos os serviços.
Compensação exige release anterior íntegra, contrato de schema idêntico e novo check do banco;
depois reinicia e testa. Sem prova suficiente, journal fica intervention-required e serviços
parados. Nunca promover só porque systemctl diz active.

## 21. Rollback da aplicação

```bash
python3 deploy/scripts/release.py rollback --release-id "$RELEASE_ANTERIOR" \
  --digest "$DIGEST_ANTERIOR" --authorization "$AUTORIZACAO_ROLLBACK"
```

Apenas previous protegido é aceito. O procedimento troca código/frontend, preserva storage,
reinicia API e worker e refaz smoke. Não executa rollback de SQL nem restaura dados.

## 22. Schema compatibility

Política conservadora v1: schema.prisma, cadeia completa de nomes/checksums, histórico aplicado,
fingerprint físico aprovado e migrate diff sem diferença. Quantidade de migrations não é prova.
Até uma migration aditiva nova exige revisão de compatibilidade separada; a ferramenta não
infere que a release anterior tolera o novo schema. Upgrades entre contratos diferentes
permanecem bloqueados até um plano explicitamente homologado, sem editar journal para contornar.

## 23. Prune

```bash
python3 deploy/scripts/release.py prune --days 7 --keep 3
python3 deploy/scripts/release.py prune --days 7 --keep 3 --apply
```

Default é plano. Nunca menos de 7 dias/3 releases recentes. Protege current, previous,
histórico recente e releases referenciadas por cwd/exe/fds/maps de processos Linux.
Falha de inventário impede exclusão. Só remove pares runtime/admin íntegros cadastrados;
não segue links, não toca storage, configurações, backups ou gerações públicas. Estado
interrompido bloqueia prune. Repetição é idempotente. Gerenciar capacidade em disco e
arquivamento de gerações públicas em procedimento separado revisado.

## 24. Logs

Eventos JSON com releaseId, fase e código limitado; nunca SQL, URL com senha, variáveis,
payload GitHub ou saída bruta de erro Prisma. Recibos de migrations guardam nomes aplicados
e fingerprint, sem dados. Journald dos dois serviços mantém os contratos OCI-04.
Retenção/alertas centralizados e armazenamento durável de auditoria não foram implementados.

## 25. Segurança

Os locks coordenam operadores cooperantes: flock local de inode persistente e GET_LOCK MySQL
mantido na mesma conexão, com conferência de ownership. Não são proteção contra root malicioso,
outro administrador DDL ou escritores remotos privilegiados. Exigir manutenção e escritores
controlados. Não usar shell tracing com credenciais; não colocar URLs em argumentos.

## 26. Diagnóstico

Consultar status, journal root e código da recusa; conferir digest esperado, owner/modes,
plataforma, serviços, bind, readiness, heartbeat e evidências de schema.
OPERATION_LOCKED: outro job ativo; não remover o arquivo de lock.
RECOVERY_REQUIRED: ler o journal, não sobrescrevê-lo.
TREE_INTEGRITY/ARCHIVE_DIGEST: rejeitar artefato e investigar origem.
LIVE_SCHEMA_DRIFT/FAILED_MIGRATION_HISTORY: manter serviços parados e usar o runbook de banco.

## 27. Recuperação

Após reboot/SIGKILL, o guard impede startup ambíguo. Revisar journal, boot ID, links e
integridade; emitir nova autorização `operation=recover` para previousCurrent:

```bash
python3 deploy/scripts/release.py recover --release-id "$RELEASE_RECUPERAVEL" \
  --digest "$DIGEST_APROVADO" --authorization "$AUTORIZACAO_RECUPERACAO"
```

Na primeira instalação, sem anterior, apenas o mesmo target preparado pode ser recuperado
explicitamente. Migrations interrompidas usam recover-migration, que só reconhece schema
já completo e íntegro; não corrige DDL. Uma release parcialmente extraída nunca é promovida.
Não há recuperação automática que altere o banco.

## 28. Limitações e reprodução local

Sem deploy OCI, HeatWave gerenciado, restore real, teste visual, CI remoto ou assinatura
automática. MySQL desta entrega: 8.4.8 descartável; as evidências 26.7 da OCI-02 são históricas.

Testes de filesystem:
`PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s deploy/tests -p test_releases.py`.
O harness `deploy/tests/run-release-linux.py` exige root, hostname lima-tf05, VM detectada e
marcador root 0600 em /run/traceflow-oci05-disposable cujo token corresponde a
TF_RELEASE_LAB_TOKEN. Nunca criar esse marcador em ambiente existente.

Em VM descartável sem mounts/credenciais: preparar ferramentas públicas verificadas, copiar
deploy/, backend/package.json e helper de produção de testes, criar o marcador sintético;
`setup --build <artefato A>` cria seu próprio mysqld/port/schema/users; `exercise --build <B>`
testa migrations e publicação; prepare-reboot → reboot real → restaurar apenas o marcador
sintético → reboot-check; interruption-cases; final-candidate --build <candidato final>;
negative-db-guards; cleanup. Consultar os pré-requisitos exatos
do harness e evidências da entrega. O provisionamento Lima específico não é automatizado
por este script; não reaproveitar um servidor MySQL existente.

## 29. Checklist operacional

- Aprovação humana de ambiente, release, digest confiável, janela e responsáveis.
- Gates externos resolvidos; receita commitada; duas construções controladas verificadas.
- Par runtime/admin validado e staging concluído; anterior íntegro identificado.
- Usuários/ambiente/TLS/storage e os dois serviços OCI-04 + guard verificados.
- Backup consistente e restore ensaiado; escritores controlados; schema aprovado.
- Migration job separado, quando necessário; nenhuma migration em startup.
- Ativação, readiness, heartbeat e smoke aprovados; assets/storage preservados.
- Plano de rollback compatível; retenção/capacidade e logs operacionais acompanhados.
- Parar diante de recusa. Não habilitar produção com candidato ou gate fictício.

Referências: [npm ci v10](https://docs.npmjs.com/cli/v10/commands/npm-ci/),
[Prisma 6.12.0](https://github.com/prisma/orm/releases/tag/6.12.0),
[locks de sessão MySQL 8.4](https://dev.mysql.com/doc/refman/8.4/en/locking-functions.html).

## OCI-04.1 — Sessões de upload entre releases

A cadeia oficial agora inclui a migration aditiva `20261014090000_resumable_evidence_uploads`
(68 migrations); o procedimento de migration job e as autorizações OCI-05 permanecem obrigatórios.
O artefato inclui as novas fontes e dependências pelos manifests/lockfiles existentes. Prisma
Client/CLI permanecem 6.12.0; nunca transportar node_modules macOS para Linux ARM64.
Ledger MySQL e `.uploads` pertencem ao ambiente persistente, fora de releases e webroot.
O operador deve suspender/drenar toda chamada de manutenção de uploads antes do migration job,
como qualquer writer manual/externo já abrangido por writersControlled. Não iniciar cleanup
independente durante a promoção. Não se introduziu um terceiro serviço permanente.
Rollback de aplicação exige compatibilidade com protocolo v1 ou bloqueio explícito de retomadas
até restaurar uma release compatível. Manter recibos/partes/arquivos confirmados; não fazer down
migration automática. Backup/restore abrange DB e arquivos consistentes. Reter assets antigos
continua necessário. Ver [recuperação de uploads](OCI_RESUMABLE_UPLOADS.md).


## OCI-DEPLOY-07.1 — separação de readiness do banco e da aplicação

A inicialização exige exatamente a cadeia atual de 68 migrations, runtime/admin íntegros e correspondentes,
inspeção administrativa fresca com visibilidade comprovada, grants mínimos do migrator, UTC efetivo,
writersControlled, heatwaveTlsHomologated, deploymentAuthorized e plano inicial de interrupção/recuperação.
Não preencher backupVerified/backupReference/restoreRehearsed para inventar dados anteriores. A proibição
vale exclusivamente ao fluxo inicial; `migrate` posterior continua exigindo os três campos com evidência.

`activate`, `rollback`, `recover` e `smoke` continuam exigindo restoreRehearsed, uploadsResolved,
smtpHomologated e githubAppHomologated, além dos gates comuns. A primeira migration não desbloqueia esses
comandos nem inicia serviços. `recover` de aplicação recusa uma migration interrompida; usar somente o
reconhecimento readonly de `recover-migration` quando toda a cadeia já estiver completa e sem drift.

A receita inclui `deploy/scripts/lib/migration-contract.mjs`. Um pacote anterior não recebe esse código
por cópia avulsa; gerar no futuro uma release completa revisada, com novo manifesto/digest. Candidatos
com receita não commitada continuam não promovíveis pelo contrato existente. Nenhum pacote foi gerado
nesta entrega e não há autorização para commit ou publicação.
