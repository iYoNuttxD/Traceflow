# OCI-DEPLOY-07.10 — primeira ativação controlada

Estado: implementação local para revisão. **Este documento não autoriza execução.**
A release candidata não pode ser promovida. Nenhum comando desta seção foi executado
na OCI durante a 07.10. O banco já possui as 68 migrations: não executar migrations,
restore, seed ou alterações de schema neste procedimento.

## Evidências anteriores e limites

A OCI-07.9 demonstrou captura cifrada, cópia externa e readback no bucket privado
`traceflow-production-recovery` e restauração isolada do backup
`76e9f5a5b2394fcab7f189b4aac93dbc`: 61 tabelas, 116 FKs, 68 registros de migrations,
igualdade de dados, estruturas e configurações; limpeza concluída. Recibos originais
estão em `build/oci-deploy-07-9/`. Não reescrever esses registros nem atribuir ao ensaio
um smoke da aplicação, RTO completo ou RPO periódico que não foram demonstrados.
SMTP já teve entrega confirmada pelo destinatário na 07.7; não reenviar e-mail.

A nova rotina de backup reaproveita o formato e as consultas da captura v3, incluindo
`CAST(... AS BINARY)` nas consultas que antes produziam warnings. A operação OCI CLI,
a interação incremental do cliente MySQL antes de ALTER USER e o cutover Nginx completo
precisam de validação operacional específica. Testes sintéticos não substituem essas
validações. Não usar produção para descobrir se o recuperador funciona.

## Contrato do controlador

O `release.py` oficial oferece `activate-first`, `run-first`, `finalize-first` e
`record-activation-check`. Somente o primeiro é um lançador de ativação. Os dois seguintes
são entradas internas do serviço transitório e de seu recuperador; não são bypasses.
O fluxo comum de upgrade mantém seus gates. Primeira publicação pelo `activate` antigo
é recusada em produção com `FIRST_ACTIVATION_WINDOW_REQUIRED`.

`activate-first` exige release committed, estado idle sem current/previous/history,
68 migrations íntegras, ambientes por hash, evidências anteriores e autorização fechada.
A janela dura no máximo dez minutos, verificada por UTC, relógio monotônico e systemd.
A autorização não é renovada automaticamente.

```text
preflight → recovery-armed → accounts-enabled → switching → switched
→ starting-api → starting-worker → public-cutover → postchecks-pending
→ database-disconnected → verified/complete → closed
qualquer falha → recovering → temporary-page-restored OU intervention-required
```

Readiness, heartbeat e listener loopback são verificados antes do cutover. HTTPS,
SPA/assets, proteção de arquivos privados e API pública são verificados depois.
`ACTIVATION_PENDING_VALIDATION` não é aprovação. GitHub, upload/download e fluxo funcional
exigem observações reais da janela corrente. O bridge Prisma se desconecta antes de
`verified` e `complete`. O término seguro também exige `closed.json` e remoção da
credencial administrativa volátil.

O serviço transitório usa Type=exec, RuntimeMaxSec limitado, KillMode=control-group,
LimitCORE=0 e ExecStopPost independente. Os cgroups de API/worker são interrompidos
explicitamente; matar somente o controlador não os encerraria. O recuperador tem até
600 segundos adicionais para contenção e encerramento. A ativação não ganha tempo extra.
Os quatro cenários nativos de término normal, exit 1, SIGKILL e timeout usam processos e
página sintéticos no Lima Oracle Linux 9.8 ARM64; não comprovam Nginx/MySQL de produção.

## Autorização e custódia

Documento root:root 0600, diretórios root protegidos, JSON sem campos desconhecidos ou
duplicados. Não colocar senha, URL autenticada, token, chave privada ou payload GitHub
no documento. Não gerar uma autorização real a partir de um exemplo preenchido.

Campos exatos, versão 1:

| Campo                                   | Exigência                                                                                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| formatVersion / operation / environment | `1` / `activate-first` / `production`                                                                                                                                |
| authorizationId / runId / nonce         | três IDs aleatórios de 32 caracteres hex; runId nunca reutilizado                                                                                                    |
| operatorId                              | identidade do responsável, 3–80 caracteres permitidos pelo contrato                                                                                                  |
| releaseId / descriptorSha256            | identidade e digest aprovados da nova release committed                                                                                                              |
| issuedAt / expiresAt                    | UTC com Z; emissão não futura; prazo positivo de até 600 s                                                                                                           |
| target                                  | objeto exato `TARGET` de `deploy/lib/activation_contract.py`                                                                                                         |
| expectedSchemaFingerprint               | fingerprint compatível obtido em inspeção autorizada; não copiar valor histórico sem conferir                                                                        |
| configurationSha256                     | hashes exatos de runtime.env, api.env e github-worker.env                                                                                                            |
| gates                                   | somente writersControlled, deploymentAuthorized, heatwaveTlsHomologated, restoreRehearsed e smtpHomologated, todos comprovados                                       |
| preEvidence                             | referências path/SHA-256 aos recibos recovery, smtp e runtime                                                                                                        |
| frontend                                | somente `url: https://traceflow.dev`                                                                                                                                 |
| firstActivation                         | recovery=temporary-page-stop-and-relock; operationalWindowAccepted; duas runtimeAccountsAuthorized exatas; publicCutoverAuthorized; publicFunctionalWritesAuthorized |
| nginx                                   | inventário before/after, temporaryPageSha256 e candidateDirectory                                                                                                    |

`firstActivation` autoriza exclusivamente API/worker @10.20.1.184, cutover e gravações
funcionais de teste identificadas. Diag/migrator permanecem bloqueados. O operador
aprova a janela e exclui outros escritores; a ferramenta não prova ausência de toda
mudança transitória feita por outro administrador.

Recibos prévios: campos exatos `formatVersion, kind, status, observedAt, serverUuid,
chainSha256, configurationSha256, sources, checks`. Status VERIFIED, observação/revisão
nos últimos 24 h; cada source é path absoluto/SHA-256 protegido. O recibo recovery exige
captura e restore reais correspondentes, 68 migrations, igualdade e limpeza. SMTP exige
o recibo SMTP_HOMOLOGATED, resposta 250, um destinatário aceito, nenhum recusado e
RECEIVED_IN_INBOX. Runtime documenta SELinux restrito, storage, ambientes, preparação do
GitHub/transporte de uploads e exclusão de escritores. Preparação não é homologação pública.
Não atualizar observedAt para fazer uma evidência antiga passar: revalidar a correspondência
do backup/configurações/estado atual e registrar essa revisão. Dados/configurações alterados
exigem nova captura consistente; não reutilizar artificialmente o backup da 07.9.

Checks dos recibos são fechados em `activation_contract.py`. Hash comprova integridade,
não veracidade nem origem por si só. A custódia root e a responsabilidade do operador são
fronteiras de confiança explícitas. O executor traceflow não pode produzir/substituir provas.

## Procedimento único para a futura publicação

1. **Revisão e release.** Aprovar o diff e autorizar commit local, gerar uma release
   committed pela receita oficial e aprovar seu digest. Não promover a candidata desta
   tarefa. Reutilizar backend/frontend/dependências ARM64 somente quando os hashes das
   fontes e do par anterior coincidirem. Não mudar a release 3f37cfbe de referência.
   Validar o novo transporte incremental MySQL e o Nginx completo em ambiente isolado;
   fechar as pendências operacionais do backup antes da publicação.
2. **Staging separado.** Transferir apenas o novo par runtime/admin e descritor mediante
   autorização. `verify` e `stage` oficiais, sem iniciar serviços. Usar controlador da
   nova release; preservar catálogo, ambientes, storage, Nginx ativo e release anterior.
   Não executar `init` sobre estado desconhecido nem editar journal/symlinks manualmente.
3. **Revisão imediatamente anterior.** Confirmar API/worker parados, quatro contas
   bloqueadas e nenhuma sessão inesperada; schema/cadeia/fingerprint compatíveis; backup
   recuperável corresponde ao estado atual; configurações sem alterações; credencial
   administrativa disponível ao operador. Revisar SELinux Enforcing, módulo restrito
   traceflow_nginx, tipo traceflow_api_port_t exclusivamente TCP3001, booleanos amplos off,
   storage traceflow:traceflow 0700 e LimitCORE=0 nas duas units. Não reaplicar políticas
   já comprovadas sem divergência. Uma inspeção que exige abrir contas precisa de sua
   autorização explícita e fechamento, não de credenciais migrator.
4. **Preparar Nginx candidato e provas.** Em
   `/etc/traceflow/activation-candidates/<runId>`, root0700, criar cinco arquivos root0600:
   `0` nginx.conf; `1` conf.d/traceflow.conf; `2` traceflow/cloudflare.conf;
   `3` traceflow/proxy.conf; `4` traceflow/static-headers.conf. São conteúdos revisados dos
   templates oficiais, com paths de produção, certificados existentes e proxy loopback.
   Nenhuma chave TLS vai nesse diretório. Os mapas before/after usam esses cinco caminhos
   absolutos; before=null é permitido só para includes originalmente ausentes. A página
   temporária `/var/www/traceflow/index.html` é preservada por hash. O preflight exige só
   traceflow.conf em conf.d e testa a configuração candidata separadamente com `nginx -t`.
5. **Autorização específica.** Conferir os recibos, hashes, operador e janela. Obter
   autorização humana para desbloqueio, cutover e testes funcionais. Não preencher gates
   GitHub/uploads antecipadamente. Os dois ainda não existem nessa autorização.
6. **Uma chamada de ativação.** Em Terminal autenticado, definir variáveis com caminhos
   e hashes reais já aprovados, sem segredos, e executar:

   ```bash
   sudo /usr/bin/python3 -I -B "$tf_controller/deploy/scripts/release.py" activate-first \
     --release-id "$tf_release_id" --digest "$tf_descriptor_sha256" \
     --authorization "$tf_activation_authorization"
   ```

   O prompt protegido recebe a senha EXISTENTE de traceflow_admin. Não usar argv/env/chat.
   O arquivo volátil root0600 fica em `/run/traceflow-activation/<runId>/admin.cnf` até o
   encerramento independente. O launcher não herda ambientes DEV. Nunca lançar run-first
   diretamente nem usar flags/marcadores de laboratório no servidor.

7. **Acompanhar a janela.** Consultar `release.py status`, estado da unidade
   `traceflow-first-<runId>.service` e recibos protegidos em
   `/opt/traceflow/shared/release-state/activations/<runId>/`. Não esperar pelo prazo
   passivamente. Se não houver postchecks-pending, não tentar inserir provas.
8. **GitHub quando a API estiver disponível.** Atualizar somente os três endpoints da
   App existente, preservando IDs/chave/segredos/permissões/eventos:
   webhook `https://traceflow.dev/api/webhooks/github-app`, OAuth
   `https://traceflow.dev/api/auth/github/callback`, setup
   `https://traceflow.dev/api/github-app/callback`. A alteração já foi autorizada, mas
   não foi executada nesta entrega. Confirmar entrega REAL, HMAC aceito, status 2xx,
   deliveryId e digest do corpo; resposta 2xx sozinha não comprova HMAC. Registrar
   callbacks reais e eventuais deliveries pendentes para redelivery controlado.
9. **Uploads e smoke públicos.** Autenticar pelo site, testar fluxo funcional de projeto
   e execução de teste. Usar fixture identificada de 100 MiB sem dados sensíveis, upload
   resumível com requests até 8 MiB, download autorizado e igualdade SHA-256, e recusa sem
   autorização. O teto Cloudflare100MB/request não muda o limite funcional. Não apagar
   dados de negócio nem registrar cookies/assinaturas/payloads/tokens nas provas.
10. **Registrar três observações separadas.** Para github, upload e functional, produzir
    recibo root0600 com campos exatos `formatVersion,kind,status,runId,nonce,releaseId,
descriptorSha256,authorizationId,observedAt,operatorId,sources,checks`. Status VERIFIED;
    timestamps entre cutover e encerramento. Pelo menos uma source JSON protegida deve
    conter exatamente os mesmos campos de vinculação/observação/checks, formatVersion=1
    e `type=traceflow-public-observation` (sem status/sources). Pode acompanhar referências
    sanitizadas adicionais. Esses documentos registram observações reais do responsável;
    não são criados antecipadamente pelo controlador. Os campos de checks são definidos
    integralmente em `post_evidence()`; campo ausente, extra ou divergente recusa a prova.

    ```bash
    sudo /usr/bin/python3 -I -B "$tf_controller/deploy/scripts/release.py" record-activation-check \
      --run-id "$tf_run_id" --kind github --evidence "$tf_github_receipt"
    sudo /usr/bin/python3 -I -B "$tf_controller/deploy/scripts/release.py" record-activation-check \
      --run-id "$tf_run_id" --kind upload --evidence "$tf_upload_receipt"
    sudo /usr/bin/python3 -I -B "$tf_controller/deploy/scripts/release.py" record-activation-check \
      --run-id "$tf_run_id" --kind functional --evidence "$tf_functional_receipt"
    ```

11. **Encerramento.** Exigir verified.json, closed.json, status idle/complete, hashes da
    mesma janela, unidade transitória encerrada, credencial volátil removida e serviços
    API/worker saudáveis. O controlador verifica novamente artefatos, ambientes, privilégios,
    schema, heartbeat e HTTPS e exige desconexão. Só então registrar ACTIVATION_VERIFIED.
    Não prolongar a janela para fabricar um PASS. Manter diag/migrator bloqueados.

## Falha e recuperação

Qualquer falha/timeout/interrupção mantém o journal. O recuperador impede novos starts,
tenta parar **ambos** os serviços, restaura somente os cinco paths inventariados, valida
Nginx/reload e o hash HTTPS da página temporária, bloqueia somente API/worker e exige
zero sessões runtime. Remove apenas links da release/janela esperados e a credencial
volátil. Preserva gerações, snapshots, recibos, banco, migrations e storage. Nenhum restore
SQL, DROP, rollback DDL ou remoção de dado de teste ocorre automaticamente.

Sem prova de recuperação: INTERVENTION_REQUIRED, sem retry/reutilização da janela.
Não executar KILL amplo. Sessão residual, arquivo concorrente, MySQL indisponível ou
falha de reload exige intervenção. Perda total da VM pode impedir relock imediato:
guard persistido impede novos starts após boot, mas não prova atomicidade. Conter o
ingresso e serviços, revisar journal, fechar contas com autorização e confirmar ausência
de sessões. Não editar estado para idle à mão. A credencial pode exigir nova entrada.
Em falha depois de mudar GitHub, preservar deliveries pendentes e planejar redelivery;
a recuperação do site não recupera automaticamente eventos externos.

## Backup operacional preparado, ainda não instalado

`recovery-backup.py` oferece capture, publish, periodic e retention-plan. O timer é apenas
um template desabilitado. É um **backup de manutenção com escritores parados**, não online:
fresh authorization de até600s, quatro contas bloqueadas, API/worker parados, exclusão
operacional de outros escritores, lock de release, snapshots antes/depois, dump
single-transaction, evidências/configurações coordenadas e comparação de hashes.
Ele nunca para serviços nem desbloqueia contas por conta própria.

Dependências futuras: age e OCI CLI Linux revisados por hash, política root0600,
identidade OCI autorizada com menor privilégio, confirmação da franquia/capacidade,
custódia externa e aprovação de instalação/agendamento. Não foram instaladas. A CLI usa
instance_principal, sem token persistido nem chave privada age na VM. IAM novo exige
revisão separada; o bucket existente não concede acesso à VM automaticamente.

Política fechada `validate_policy()` em `recovery_policy.py`: bucket/namespace/região
fixos; max8GiB,1000requests/mês,16conjuntos até512MiB,14dias/intervalo24h, destinatário
age público e SHA, custodiante, paths/hashes de age/oci e operationallyAuthorized.
Estado root0700 `/var/lib/traceflow-recovery`, subdiretório sets root0700. Autorização
capture: formatVersion,backupId,issuedAt,expiresAt,releaseId,runtimeManifestSha256,
configurationSha256,operatorId,externalWritersControlled,maintenanceAuthorized,preActivation.
Credencial sintética só nos testes; futuramente admin.cnf root0600 em
`/run/traceflow-recovery/<backupId>/`, fornecida por entrada protegida. Não copiar senha
para policy/authorization. `/run` temporário pode ser afetado por swap; precisa de revisão
operacional antes de uso com dados reais. Interrupção não tratável pode deixar scratch
root protegido: inspecionar propriedade e runId antes de remover, sem limpeza ampla.

A publicação exige capacity-authorization.json root0600 com formatVersion=1,month UTC,
expiresAt até24h,approved e externalRequestsUsed. Reserva32requests antes da rede, não
reembolsa após falha; recusa listagem paginada/incompleta, bucket público, tier/versão
inesperados, prefixos estranhos, colisão e excesso. Upload só dos dois .age, sem overwrite
ou multipart; readback condicionado por ETag, tamanho e SHA iguais. Nunca remove objeto.
Lista de retenção é somente revisão; não apaga a pré-ativação ou backups existentes.
Ao atingir o teto, para e exige revisão; não compra capacidade automaticamente.

Comandos futuros independentes, somente após aprovação operacional e credenciais protegidas:

```bash
sudo python3 -I -B "$tf_controller/deploy/scripts/recovery-backup.py" capture --policy "$tf_backup_policy" --authorization "$tf_backup_authorization"
sudo python3 -I -B "$tf_controller/deploy/scripts/recovery-backup.py" publish --policy "$tf_backup_policy" --backup-id "$tf_backup_id"
sudo python3 -I -B "$tf_controller/deploy/scripts/recovery-backup.py" retention-plan --policy "$tf_backup_policy"
```

periodic combina captura/publicação para uma janela de manutenção explicitamente preparada;
não instala cron/systemd nem inicia janelas futuras. O timer diário recusa ausência de
autorização recente/credencial. RPO24h permanece objetivo, sem execução diária demonstrada.
O formato do archive foi comparado com o extrator usado na07.9 e testado com fixture;
o lançador antigo de restore fixa a release/backup antigos e não deve ser reutilizado
sem revisão para novos conjuntos. Restore futuro: destino isolado cifrado, download por
hash, decriptação com custódia externa, extração validada, importação somente no destino
novo,68migrations/estrutura/FKs/digests/configurações/storage comparados e cleanup. Nunca
restaurar sobre produção para testar o backup. Cada novo conjunto continua
`restore=NOT_REHEARSED` até existir seu recibo real.

## Fontes e validação

A separação Type=exec/RuntimeMaxSec/ExecStopPost segue o
[contrato systemd](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html).
Os adaptadores OCI seguem as opções oficiais de
[listagem](https://docs.oracle.com/en-us/iaas/tools/oci-cli/latest/oci_cli_docs/cmdref/os/object/list.html),
[upload](https://docs.oracle.com/en-us/iaas/tools/oci-cli/latest/oci_cli_docs/cmdref/os/object/put.html) e
[download](https://docs.oracle.com/en-us/iaas/tools/oci-cli/latest/oci_cli_docs/cmdref/os/object/get.html).
A documentação não substitui o teste do binário instalado. Evidências e resultados desta
entrega ficam em `build/oci-deploy-07-10/REPORT.txt`; histórico07.9 preservado integralmente.

## Atualização OCI-07.11 — ensaios operacionais e staging

Os registros da 07.10 acima descrevem aquela entrega. A 07.11 validou o transporte
incremental em MySQL Community 26.7.0 novo e descartável no Mac, com identidade própria,
TLS estrito, contas sintéticas, transições LOCK/UNLOCK, erro SQL, interrupção, timeout,
relock em nova sessão e ausência de sessões remanescentes. Foram 24 verificações reais.
Não houve acesso ao HeatWave nem desbloqueio de contas de produção.

O ensaio revelou duas falhas no encerramento: a corrida entre saída do cliente e
sinalização do grupo no macOS e o flush de stdin após interrupção. O controlador agora
exige comprovação de término antes de aceitar a corrida, mantém falha para processo vivo
não encerrável, sanitiza o pipe quebrado e não deixa o fechamento de um pipe já rompido
ocultar a falha primária. Nenhum erro SQL passa a ser sucesso.

O Nginx 1.20.1 foi exercitado no Lima Oracle Linux 9.8 aarch64 com o binário público de
mesmo hash da VM, templates revisados e funções reais snapshot/test/cutover/recover.
Foram 44 verificações: recuperação antes e depois dos links, troca parcial dos arquivos,
antes do reload, após cutover, falha de testes públicos, morte do controlador e recusa de
candidato inválido. HTTP/TLS/proxy eram reais e exclusivamente loopback; páginas, API,
worker, conta e sentinelas de banco/evidências eram sintéticos. A chamada independente
de recuperação complementa os quatro ensaios systemd da 07.10; não representa um
webhook, upload funcional, Cloudflare ou rollback de schema em produção.

Com autorização específica foram instalados age 1.3.2 e OCI CLI 3.95.0 em diretórios
isolados `/opt/traceflow-tools/age-1.3.2` e `/opt/traceflow-tools/oci-3.95.0`, primeiro no
Lima e depois na VM. As dependências foram fixadas, transportadas por hash e instaladas
offline na VM, sem atualizar Python global. O dynamic group `traceflow-recovery-writer`
seleciona somente a instância traceflow-app. A política `traceflow-recovery-object-storage`
permite consultar o bucket/listar objetos e criar/ler somente `backups/*`, sem excluir ou
sobrescrever. Instance principal pertence à instância: não isola processos por usuário
Unix. A chave privada de recuperação continua fora da VM. Não há novo PAR nem API key.

A CLI 3.95.0 em protocolo de pipes escreve rótulos estáticos de progresso em stderr.
`oci()` aceita somente `Uploading object\n` para object put e `Downloading object\n`
para object get, além de stderr vazio, com exit zero. Qualquer byte adicional, mensagem
em outra operação ou saída não zero é recusado. O restante de `tool()` continua recusando
stderr por padrão. ETag, SHA-256, tamanho, no-overwrite, no-multipart, orçamento e retenção
continuam obrigatórios. Testes não devem substituir warnings reais por um rótulo aceito.

Os resultados finais, hashes, IDs sintéticos e limites efetivamente consumidos estão em
`build/oci-deploy-07-11/REPORT.txt`. Objetos de ensaio são cifrados e identificados como
sintéticos; não são backups de produção nem recibos de restauração do banco. A tentativa
que criou um objeto e falhou antes do recibo continua FAIL. Não apagar objetos parciais
nem reutilizar seu ID automaticamente. Listagem/colisão impedem publicação duplicada.

A release 4f0ae9 é preservada, mas não deve ser ativada sem as correções mínimas da 07.11.
O staging deve usar novo par committed após revisão e commit local especificamente
autorizado. A receita repack-controller valida igualdade das fontes da aplicação e
reutiliza os componentes ARM64 íntegros; não altera Prisma, schema ou as 68 migrations.
Checksums e release ID definitivos são os do relatório 07.11, nunca os da candidata.

Antes da publicação, executar o procedimento único desta página com o controlador do
novo staging e autorização fresca. Não executar migrations, init ou activate legado.
Conferir readiness/heartbeat antes do cutover, depois HTTPS/SPA/assets/negações públicas;
GitHub, upload/download de 100 MiB em partes e smoke funcional exigem evidências reais
na janela. Ausência de evidência, prazo encerrado ou desconexão incompleta exige
recuperação. O staging e os ensaios não autorizam activate-first, desbloqueio ou testes
funcionais em produção. Timer/política de backup de manutenção continuam sujeitos à
aprovação operacional; a instalação das ferramentas não habilitou rotina periódica.

O ensaio real do adaptador terminou com 12 verificações aprovadas no Oracle Linux ARM64
mais a decriptação dos dois readbacks no Mac com chave sintética externa. A primeira
falha revelou somente os rótulos de progresso acima; uma fixture subsequente com ID
inválido foi recusada antes do upload. O conjunto final usou ID novo, gerado como UUID;
replay foi recusado antes de nova escrita, sem devolver a reserva de requests. Os quatro
objetos sintéticos das duas tentativas com upload permanecem no bucket, sem exclusão,
e ocupam menos de 1 MiB. São identificados no relatório; não substituem o backup real
76e9f5a5b2394fcab7f189b4aac93dbc nem justificam gates de restauração adicionais.

## Correção do ciclo periódico de manutenção

O timer passa a invocar `recovery-maintenance.py run`, e não `periodic` diretamente.
`periodic` continua sendo a captura/publicação para uma janela já preparada; sozinho
não para escritores, administra contas nem recupera o estado anterior.

O novo ciclo usa os locks oficiais de operação da release e de recuperação, nessa
ordem. Registra a reserva da execução e o journal antes de parar API/worker; audita
identidade e permissões, aguarda o encerramento das sessões, bloqueia as contas de
runtime e repete as verificações de quiescência. A autorização de captura é derivada
da política assinada operacionalmente pelo operador, vinculada aos hashes reais
sob custódia root, e não de evidência fictícia de backup. A captura mantém o formato
v3, age, publicação privada e download de conferência existentes. Não altera schema.

A recuperação independente (`finalize`/`recover`) consulta o journal, contém
processos, audita novamente contas/estado/cadeia e só reinicia serviços que estavam
ativos antes do ciclo. A primeira publicação, ainda sem `current`, permanece parada
com contas bloqueadas. Falhas na recuperação deixam o guard bloqueado, um `ALERT.json`
durável e mensagem crítica no journal; não executam rollback de schema. Scratch de
captura interrompida ou autorização de capacidade residual exigem revisão explícita,
sem limpeza por prefixo. Dois snapshots não comprovam ausência de escritores externos;
a exclusão operacional desses escritores continua sendo uma premissa autorizada.

### Custódia para autenticação recorrente

A senha MySQL não fica em `.env` ou credencial cifrada persistente na VM. O mecanismo
aprovado é um segredo versionado do OCI Secret Management, obtido sob demanda por
usuário IAM dedicado, sem senha de Console, com leitura de **um único OCID de segredo**.
O instance principal existente permanece exclusivo do acesso ao bucket. Não há novo
acesso ao segredo pelo dynamic group nem alteração de IMDS/firewall: agentes OCI não
root são consumidores legítimos de IMDS.

A API signing key técnica é persistida cifrada por `systemd-creds` e entregue como
`oci-api-key` via `LoadCredentialEncrypted`. Sem TPM, root pode decifrar essa chave e
obter o segredo; isso não é isolamento contra root comprometido. A chave privada age
de recuperação permanece fora da VM. A senha obtida é mantida apenas em memória e
arquivo root `0600` sob `/run`, fechado/removido ao terminar; os limites de core e a
sanitização operacional permanecem obrigatórios. O processo não imprime o bundle,
a senha ou stderr bruto. Revogar a API key ou a policy interrompe novas obtenções.

A referência na política possui campos fechados: `provider: oci-secret-api-key`,
`secretId`, `versionNumber` positivo e `identity` com `userId`, `tenancyId` e
`fingerprint`. O bundle deve corresponder exatamente ao OCID/versão; seu conteúdo
BASE64 decodifica JSON estrito com `formatVersion: 1`, `user: traceflow_admin` e
`password`. Duplicatas, campos adicionais, caracteres de controle, versão/identidade
incorretas e ausência da credencial systemd são recusados. Não há fallback para
instance principal ou outra fonte de senha.

### Instalação e execução manual antes do timer

Ainda requer release committed, staging verificado e autorização operacional. Não
copiar um controlador solto por cima da release instalada. Depois de instalar a nova
release, executar seu `release.py prepare-guard`: ele prepara exclusivamente
`/opt/traceflow/shared/release-guard/release-guard.json`, mantendo o guard legado e
recusando divergência/estado não idle. O serviço escreve somente nos diretórios de
estado, guard dedicado, recuperação e `/run`; releases, administration e current
continuam somente leitura na sandbox.

Instalar os templates de backup, recuperação e alerta com o caminho absoluto da
nova release. Manter o timer desabilitado. A política root `0600` em
`/etc/traceflow/maintenance-policy.json` deve vincular release/manifestos, configurações,
política de backup, identidade IAM e versão do segredo. A autorização aprovada nesta
etapa permite até sete ciclos, às 03:00 UTC, janela de início de 300 segundos,
captura/publicação de até 600 segundos e recuperação de até 600 segundos adicionais.
Não equivale a delegação ilimitada ou renovação automática; renovar a política requer
revisão explícita, sem nova entrada semanal de senha.

O ensaio supervisionado usa uma unidade separada `traceflow-recovery-supervised.service`
com a mesma custódia/sandbox, executando `recovery-maintenance.py run --mode supervised
--authorization /caminho/absoluto/root/authorization.json`. A autorização é específica,
ligada ao hash da política e válida por no máximo dez minutos. Cada operação exige
invocação manual; não gerar aprovação operacional de ensaio que não aconteceu.

O timer só pode ser habilitado após recibo real `COMPLETE` do ensaio sob a mesma
política, `backupVerified: true`, `credentialClosed: true` e autorização de janela.
Também exige aplicação já publicada no início da execução recorrente; nunca a inicia
antecipadamente. `ExecStopPost` finaliza interrupções e a unidade reconcile trata
journal pendente após boot. Falha de encerramento não concede PASS.

Os limites existentes permanecem: 8 GiB, 16 conjuntos de no máximo 512 MiB,
1.000 requests/mês e retenção de 14 dias sujeita a revisão. Não há exclusão automática
nem permissão OCI de DELETE/overwrite. Ao atingir capacidade, recusar e alertar;
não prometer backup indefinido sem revisão de retenção. Recibos de fixtures e ensaios
locais não substituem o ciclo real supervisionado nem a homologação da publicação.

### Compatibilidade do guard histórico na instalação

O preflight real encontrou o guard da OCI-07.4 com exatamente sete campos:
`status`, `phase`, `current`, `target`, `bootId`, `pid` e `processStart`.
`prepare-guard` reconhece esse formato fechado somente se todos esses valores
coincidirem com o estado autoritativo `idle` e os três campos novos
(`expiresAt`, `runId`, `operation`) estiverem ausentes/nulos nesse estado.
Formatos parciais, campos extras, divergências e operações pendentes são recusados.
O guard legado e o state não são reescritos; a nova projeção é criada apenas no
diretório dedicado, com criação/repetição verificável. O formato completo atual
continua exigindo igualdade integral.

### Representação de CURRENT_ROLE no JSON MySQL26.7

O ensaio supervisionado foi recusado no preflight por `BACKUP_SERVER_IDENTITY`,
antes da captura/transição de contas. A comparação isolada mostrou que UUID,
versão, porta, schema, conta e UTC coincidiam; apenas a role divergira.
O laboratório MySQL Community26.7 reproduziu `JSON_ARRAY(CURRENT_ROLE())` como
`base64:type15:...`, tanto para `NONE` quanto para uma role ativa sintética.
`CAST(CURRENT_ROLE() AS CHAR)` devolveu o texto esperado sem warnings.
A consulta de leitura no HeatWave confirmou identidade completa e role exatas
com a conversão. O capturador restaura o CAST já usado na captura v3 da OCI-07.9;
a comparação permanece exata e a expansão/auditoria dos grants continua obrigatória.
Não decodificar representações alternativas, aceitar roles extras nem ignorar a falha.

### Reconciliação explícita da primeira recuperação incompleta

> Histórico da proposta v1, substituída pela revisão v2 abaixo. O contrato e a
> ordem de persistência desta seção não devem ser usados operacionalmente.
> Nenhuma reconciliação v1 foi aplicada à produção nesta correção.

Na tentativa `ebf3b86d74664e048b2dfb82eb98ee37`, o controlador recusou
`FRONTEND_SMOKE` na fase `public-cutover`. A recuperação registrou somente
`public-page` como controle incompleto. A investigação confirmou que o Cloudflare
acrescentava o beacon de Web Analytics ao HTML, inclusive à página temporária:
723 bytes entregues contra 356 bytes originais. Após a alteração autorizada para
**Enable with JS Snippet installation**, sem instalar snippet, as duas respostas
HTTPS verificadas passaram a ter os 356 bytes e o SHA-256 original
`813c28209cbe1fdd2f1744dc5968906f3c982a912f7f5913c11422a97202809f`.
Isso comprova a causa da divergência do controle `public-page`. O recibo genérico
`FRONTEND_SMOKE` não identifica isoladamente qual de suas condições falhou durante
o cutover; não apresentar essa hipótese como uma segunda causa comprovada.
DNS, TLS, WAF, cache e outras configurações não fazem parte dessa correção.

O novo comando manual `reconcile-first` trata exclusivamente esse tipo de falha:
primeira publicação, sem release anterior, falha `FRONTEND_SMOKE/public-cutover`,
recuperação `INTERVENTION_REQUIRED` com `failedControls: ["public-page"]`,
`dataPreserved: true` e `schemaRestored: false`. Outros casos continuam bloqueados.
Não executar esse comando da árvore de desenvolvimento na VM. A implementação
local precisa de revisão, autorização de uma nova versão committed do controlador
e instalação isolada antes de qualquer uso operacional. A release `401f130` e o
estado de produção não são modificados pela implementação ou por seus testes.

**Autorização própria e curta.** O documento root `0600`, em caminho absoluto com
ancestrais protegidos, tem exatamente os seguintes campos, sem duplicatas:

| Campo                                          | Contrato                                                                                                             |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `formatVersion`                                | Inteiro `1`                                                                                                          |
| `operation`                                    | `reconcile-first`                                                                                                    |
| `authorizationId`, `reconciliationId`, `runId` | Identificadores hexadecimais de 32 caracteres; `runId` é o da tentativa interrompida                                 |
| `operatorId`                                   | Responsável identificado, 3–80 caracteres do conjunto alfanumérico, ponto, sublinhado, arroba e hífen                |
| `releaseId`, `descriptorSha256`                | Release histórica e descritor exatos, cuja instalação será verificada novamente                                      |
| `issuedAt`, `expiresAt`                        | UTC com `Z`, sem futuro, duração máxima de 600 segundos                                                              |
| `historySha256`                                | SHA-256 do inventário canônico de caminhos relativos e hashes dos bytes de todos os arquivos históricos da tentativa |
| `stateSha256`                                  | SHA-256 do estado autoritativo codificado pelo `encoded()` oficial                                                   |
| `externalWritersExcluded`                      | `true` somente após exclusão operacional efetiva de outros escritores                                                |

Não existe `force`, `skip`, desbloqueio ou autorização automática. Não reutilizar a
autorização antiga da ativação: ela é validada somente como evidência histórica.
A autorização de reconciliação não autoriza ativação nem renova backup ou política.

Sob o mesmo `operation.lock` usado pelos outros procedimentos, o comando exige:

- integridade do par instalado e de todo o histórico, sem symlinks/hardlinks,
  alterações, recibos contraditórios ou sucesso anterior;
- API/worker parados, ausência de escritores Node não gerenciados, serviços da
  janela/backup/reconciliação e timer inativos, sem PID;
- ausência dos links `current`/`previous` e da credencial temporária da ativação;
- hashes originais dos ambientes, cinco arquivos Nginx e página temporária,
  `nginx -t`, SELinux Enforcing e HTML HTTPS **exatamente** igual ao original;
- auditoria administrativa somente leitura: CA/DNS/TLS/hostname/UUID/versão,
  visibilidade de metadados, privilégios das contas runtime, quatro contas
  bloqueadas, nenhuma sessão runtime ou outro cliente usando o schema e os 68
  registros Prisma com nomes/checksums exatos, finalizados e sem rollback;
- repetição das condições externas, expiração/concorrência/histórico e integridade
  antes de gravar o resultado, com encerramento dos clientes e remoção comprovada
  da credencial volátil primeiro.

A senha existente é digitada somente no TTY protegido. O processo requer root,
Oracle Linux ARM64 nativo, core dump desabilitado e `memory.swap.max=0` do cgroup.
Usa exclusivamente `/run/traceflow-reconciliation/<reconciliationId>/admin.cnf`,
com diretório `0700`, arquivo exclusivo `0600`, sem senha em argv, ambiente ou logs.
Não consulta o Vault nem altera a custódia permanente. SIGTERM/timeout fecham os
subprocessos e passam pela limpeza; um resíduo de SIGKILL é recusado sem reutilizar
ou apagar automaticamente o arquivo. Exige revisão de custódia pelo operador.

**Histórico imutável e repetição.** Os arquivos em `activations/<runId>/` são somente
lidos. A reconciliação cria novos documentos em
`reconciliations/<runId>/<reconciliationId>/`: cópia da autorização, intenção,
recibos de auditoria exclusivos e conclusão. Os vínculos usam SHA-256 da codificação
JSON canônica; alterações semânticas, campos desconhecidos e duplicatas são
recusados. Os hashes do histórico, por sua vez, abrangem os bytes originais.
A escrita exclusiva e `fsync` precedem a transição do estado e de seu guard dedicado.
Nenhum arquivo Nginx, link, dado, migration ou recibo histórico é reescrito.

Se houver interrupção entre intenção, estado, guard e conclusão, uma nova execução
com a mesma autorização ainda válida repete toda a auditoria antes de completar.
O marcador `reconciliationId` impede `activate-first` enquanto conclusão, auditoria,
histórico e guard não coincidirem. Autorização expirada ou arquivo residual mantém
o bloqueio; não há limpeza artificial. Uma operação já concluída é um no-op com
`freshAudit: false`, inclusive após expiração: comprova somente a conclusão
histórica, não a segurança atual nem autorização para iniciar a aplicação.

**Procedimento futuro, ainda não autorizado nesta entrega:** revisar o diff e os
testes, versionar/instalar um controlador aprovado sem substituir a release antiga,
conferir condições reais, preparar os hashes e a autorização específica e executar
manualmente o comando abaixo por Terminal protegido. Os valores entre `<...>`
precisam ser substituídos por caminhos/identificadores revisados; não são um script
pronto para execução e nenhum documento de autorização real foi gerado agora.

```text
sudo systemd-run --pty --wait --collect \
  --unit=traceflow-reconcile-<reconciliationId> \
  --property=MemorySwapMax=0 --property=LimitCORE=0 \
  --property=RuntimeMaxSec=600 --property=KillMode=control-group \
  --property=UMask=0077 \
  /usr/bin/python3 -I -B <controlador-aprovado>/deploy/scripts/release.py \
  reconcile-first --run-id <runId-historico> \
  --authorization <arquivo-absoluto-root-0600>
```

Conferir o resultado sanitizado, os novos recibos e a preservação do inventário
histórico. Não iniciar automaticamente nova ativação. Uma próxima publicação exige
nova janela, gates atuais, backup recuperável correspondente e autorização própria.
Não habilitar timer nem consumir ciclos de backup na reconciliação.

A exclusão de outros operadores é uma premissa operacional, não um snapshot atômico
entre MySQL, sistema de arquivos e HTTPS. Um administrador externo pode introduzir
mudança após a última observação; o lock local não impede ações externas. Os testes
locais usam sistema de arquivos/locks reais e fronteiras MySQL/systemd/HTTPS
simuladas. Eles não homologam a nova operação no Linux de produção. Falhas de
observação, interrupções e discrepâncias continuam impedindo a conclusão.

### Revisão da reconciliação — contrato v2 vigente, somente implementação local

A revisão encontrou cinco problemas reais na proposta v1: propagação de um
`reconciliationId` ligado ao `runId` mutável, publicação prematura de estado `idle`,
recibos criados diretamente no nome final, ausência de comparação inicial do guard
e resultados constantes no recibo de auditoria. A versão v2 substitui esses pontos.
Não modifica o histórico da tentativa, a release instalada ou o banco. O estado
operacional da OCI continua bloqueado até uma intervenção futura autorizada.

**Identidade e proveniência.** O estado passa a ter `recoveryProof`, uma referência
fechada com `kind: reconciliation`, `runId` de origem e `reconciliationId`. Não usa
mais o campo solto `reconciliationId`. Após uma nova tentativa que falhe e seja
recuperada, a referência muda para `kind: activation-recovery` e o `runId` dessa
nova tentativa. O `prior-state.json` imutável preserva a origem; o novo recibo de
recuperação vincula os hashes do estado anterior e do estado recuperado. A validação
percorre essa cadeia, recusa ciclos/referências trocadas e limita a 64 origens. Não
reatribui os recibos da primeira reconciliação à nova tentativa. Um estado legado
v1 contendo o campo solto é recusado para revisão, sem conversão automática.

**Compatibilidade intencionalmente restrita.** Mesmo após concluir a reconciliação,
o estado é `status: reconciled-v2`, `phase: first-recovery-reconciled-v2`. Nunca é
`idle` intermediário. O fluxo normal de primeira ativação da `401f130` exige `idle`
e recusa esse estado; o teste local executa seu código histórico em fronteiras
simuladas para comprovar a recusa. O controlador novo somente aceita esse estado
após validar integralmente a cadeia, a conclusão aplicada e o guard. `idle` por si
só não comprova reconciliação.

A autorização v2 mantém todos os campos anteriores, a janela máxima de 600 segundos
e a custódia root, mas exige `formatVersion: 2` e dois campos adicionais:
`controllerReleaseId` e `controllerDescriptorSha256`. Eles identificam um controlador
committed, instalado e íntegro, com o mesmo contrato de schema da release alvo.
O caminho executado de `release.py` e o módulo `activation_window.py` precisam
pertencer exatamente a esse controlador. O caminho usado por `run-first` e
`ExecStopPost ... finalize-first` também é o controlador selecionado, não o
controlador antigo da release da aplicação. Não há bypass por flag ou ambiente.

Antes de uma execução futura, o operador deverá conferir os dois descritores,
manifestos, hashes, caminhos absolutos, unidades/transientes existentes e o
`ExecStopPost` gerado. Não usar o `release.py` instalado na `401f130` para essa
operação. Não alterar nem substituir aquela release para fazer o caminho coincidir.
A instalação de um novo controlador e sua autorização estão fora desta entrega.
Um operador root pode deliberadamente editar arquivos, fabricar autorizações ou
chamar código antigo fora do fluxo normal. A implementação **não** oferece proteção
contra esse bypass voluntário; custódia root, seleção verificada do controlador e
revisão da janela continuam sendo controles operacionais necessários.

**Ordem durável e exclusiva.** A sequência é:

1. Validar estado e guard existentes, autorização, histórico e controlador.
2. Executar e validar as observações reais de recuperação somente leitura.
3. Publicar `authorization.json`, `intent.json`, `audit-<id>.json` e `complete.json`.
   A intenção contém o estado anterior, sua projeção de guard, o estado esperado e
   hashes do manifesto/cadeia de migrations. A conclusão é
   `AUDIT_COMPLETE_STATE_PENDING`: ainda não habilita ativação.
4. Persistir o estado `reconciled-v2` e seu guard dedicado.
5. Publicar `applied.json`, vinculando conclusão, auditoria, estado, guard e um
   inventário SHA-256 dos bytes de **todos** os documentos anteriores da reconciliação.
6. Revalidar a cadeia antes de emitir o resultado sanitizado.

Cada recibo é escrito em `.pending-...` exclusivo `0600`, com `fsync` do arquivo,
verificação integral dos bytes e `fsync` do diretório. A publicação usa `link()` no
mesmo filesystem, que recusa destino existente, seguida da remoção somente daquele
nome temporário e de novo `fsync` do diretório. Não se usa `replace()` para recibos.
O nome final nunca contém uma escrita parcial. Interrupções deixam o temporário
preservado; interrupção entre link e unlink deixa dois hardlinks e é recusada.
Nenhum resíduo é apagado automaticamente. Arquivos completos são revalidados e
sincronizados novamente na retomada antes de confiar na publicação.

Um `.pending-*`, JSON parcial, hardlink, arquivo inesperado ou `.write-*` de estado/
guard exige intervenção explícita. Não apagar o resíduo para obter PASS. Preservar
bytes, nomes, permissões e hashes, comparar com a intenção e a autorização e submeter
um procedimento específico à revisão; esta entrega não cria um comando de limpeza.
Se a publicação falhar antes de criar qualquer temporário, a mesma operação pode ser
repetida dentro da janela. A intenção/conclusão completas nunca são sobrescritas.

**Guard e transição interrompida.** Na entrada inicial, o guard deve existir e ser
exatamente a projeção do estado autoritativo. Guard ausente, parcial, desconhecido
ou divergente é recusado antes da credencial e da auditoria. `layout.save()` não é
usado para corrigir uma divergência inicial. A única reparação automática permitida
é a combinação comprovada: intenção e conclusão íntegras, estado novo exato já
persistido e guard ainda igual à projeção do estado anterior. Isso corresponde à
ordem conhecida de `layout.save()`; guard adiantado em relação ao estado não é
aceito. A retomada exige autorização ainda válida, nova auditoria completa e recibo
`guard-repair-<id>.json` com os hashes anterior/posterior, conclusão e auditoria
antes de reparar. Esse recibo também entra no inventário selado de `applied.json`.

Sem `applied.json` íntegro, o controlador novo recusa a ativação. O antigo recusa o
estado `reconciled-v2`. A recuperação de uma tentativa posterior também publica seu
recibo antes de tornar o estado elegível; interrupções que impeçam comprovar essa
transição permanecem bloqueadas para intervenção. Uma repetição concluída é
somente consulta histórica (`freshAudit: false`), sem nova credencial, auditoria,
renovação de prazo ou gravação de conteúdo. Não autoriza ativação automaticamente.

**Observações auditáveis.** O recibo não copia `RECONCILIATION_CHECKS`. Ele vincula
seis observações ordenadas, cada qual com início/fim UTC e resultado validado:
`ENVIRONMENT_INITIAL`, `DATABASE`, `ENVIRONMENT_FINAL`, `ACCOUNTS_FINAL`,
`CREDENTIAL_CLOSED` e `INTEGRITY_FINAL`. São persistidos somente estados/PIDs dos
serviços controlados, hashes de configurações/Nginx/página, código de saída de
`nginx -t`, status/tamanho/hash HTTPS, SELinux, identidade administrativa esperada,
resumos sanitizados dos grants com TLS/fontes/warnings/hashes, quantidade/hash da
cadeia Prisma e ausência de sessões/credencial. Não há SQL bruto, senha, URL
credenciada, dados de negócio, mensagem de servidor ou stack trace operacional.

Resultados ausentes, fora de ordem, divergentes, sem fontes obrigatórias ou fora da
janela são recusados. As observações vêm do retorno dos verificadores que executam
os controles; um verificador que retorna `None` não produz aprovação. Os hashes
vinculam os documentos, mas não são uma assinatura independente de root. A auditoria
não é atômica entre MySQL, HTTPS e arquivos e não comprova ausência de mudanças por
operadores externos entre observações; a exclusão operacional continua obrigatória.

**Validação e limite do parecer.** A suíte local cobre o ciclo reconciliação → nova
ativação simulada → falha → recuperação → preparação seguinte, controlador antigo,
seleção do controlador, guard, expiração, replay, concorrência, adulteração, todas as
fronteiras de publicação, um processo filho realmente interrompido antes da
publicação e preservação do histórico. MySQL, HTTPS, systemd e os serviços são
simulados; arquivos, locks, hashes, permissões e interrupções de processos usam
recursos descartáveis locais. `fsync` local não equivale a um ensaio de perda de
energia no filesystem da VM. Testes operacionais Linux/OCI, nova release,
reconciliação real e ativação **não foram executados**. Os logs e o diff desta revisão
ficam em `build/oci-reconciliation-review/`.

### Revisão de titularidade — proteção contra recuperação cruzada

A baseline `c4483ba18ce2e6433dfe6df63ed2b003df956947` permitia que
`finalize-first` chamasse `recover()` sem comprovar quem assumiu o estado global.
Liberar `operation.lock` antes de `systemd-run` permite duas submissões preparadas
sobre o mesmo estado anterior. A segunda unidade pode falhar no lock ou na
comparação de estado e ainda executar `ExecStopPost`. Esse comportamento é previsto
pela [documentação oficial do systemd](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html#ExecStopPost=);
`Type=exec` não comprova que o controlador adquiriu o estado da aplicação.
A reprodução local da baseline confirmou a chamada indevida de recuperação.

O protocolo mantém a submissão fora de `operation.lock`, evitando esperar pelo
processo filho enquanto o launcher segura o lock necessário à execução. Distingue:

1. **Preparada:** `prepared.json`, autorização específica e credencial exclusiva.
2. **Submissão solicitada:** `submission.json`, antes de chamar systemd. É intenção;
   não comprova aceitação do job nem titularidade. Uma resposta perdida continua
   ambígua e não permite apagar a credencial de uma unidade que possa existir.
3. **Aquisição:** `claim.json` imutável vincula autorização, submissão, estado
   anterior e estado pretendido. Somente a persistência do estado global com o
   `runId`, operação, release alvo e `activationClaimSha256` correspondentes concede
   titularidade. O recibo sozinho não concede esse direito.
4. **Execução armada:** `armed.json` é publicado depois da aquisição e antes de
   desbloquear contas. Se o processo morrer entre a aquisição e esse recibo, o
   finalizador independente ainda pode provar a titularidade e recuperar.
5. **Recuperação/conclusão:** preservam os recibos e gates existentes. A recuperação
   verifica a titularidade antes de qualquer alteração global; conclusão exige os
   mesmos testes públicos, desconexão e evidências anteriores.

`run-first` e `finalize-first` usam um lock exclusivo por tentativa em
`shared/release-state/activation-locks/<runId>.lock`, protegido e separado dos
recibos históricos. A ordem é lock da tentativa, depois `operation.lock`; ambos
são não bloqueantes. Não há espera circular nem lock global durante submissão.
Recusa por lock ocupado não autoriza remoção de lock ou recuperação forçada.
Uma finalização legítima impedida por concorrência continua exigindo revisão e
repetição explícita; não se introduz retry ou nova janela automática.

O finalizador de uma tentativa que não é proprietária pode somente publicar seu
`unowned.json` (`NO_GLOBAL_RECOVERY`) e remover sua própria credencial protegida.
Isso independe do lock global ocupado pela outra tentativa. O lock individual
impede que um `run-first` atrasado adquira o estado durante a limpeza; depois da
limpeza, o marcador imutável recusa esse início atrasado. Não há operação sobre
API, worker, Nginx, MySQL, links, estado ou guard de outra tentativa. Históricos
já terminados por `closed.json` ou `recovery.json` não recebem esse marcador.
Repetir o finalizador não renova autorização nem produz nova homologação.

Uma identidade global que aponta para a própria tentativa, mas possui claim
inválido, alvo/operação divergentes ou identidade de processo inconsistente, é
ambígua: falha sem recuperação global e preserva a credencial para intervenção.
Falhas de publicação, arquivos parciais e resíduos continuam bloqueando o protocolo;
não são descartados para permitir PASS. Recibos novos utilizam a publicação atômica,
exclusiva e sincronizada já adotada na reconciliação v2.

**Proveniência de falhas.** `recovery.json` passa a vincular `claimSha256` e
`failureSha256`. A cadeia das recuperações posteriores exige `failure.json` íntegro,
vinculado à mesma autorização, tentativa e release; alteração até de whitespace,
remoção ou replay de outra tentativa é recusado. Se uma interrupção abrupta não
permitiu registrar a exceção, o finalizador registra `ACTIVATION_INTERRUPTED` e a
fase observada, sem inventar o motivo original. Um recibo existente inválido não é
sobrescrito: as ações de contenção da tentativa comprovadamente proprietária ainda
são tentadas, mas a recuperação não pode ser aprovada sem evidência íntegra.

Nenhum recibo histórico é convertido ou completado retroativamente por essa
mudança. A reconciliação v2 da origem histórica continua com seu inventário selado;
recuperações posteriores sem os novos vínculos exigem revisão, nunca migração
silenciosa. A release instalada não foi alterada. Somente controlador compatível,
posteriormente revisado e autorizado, poderá utilizar este protocolo. Root pode
contornar voluntariamente código/custódia; essa limitação permanece explícita.

Os testes usam filesystem e `flock` reais no Mac, incluindo outro processo local,
com MySQL, systemd e HTTPS simulados. Cobrem duas submissões, recusa antes da
posse, finalizador durante a primeira execução e após seu sucesso, falhas antes/
depois de `armed`, aquisição parcial entre estado/guard, limpeza interrompida,
replay e hashes da cadeia v2. Não comprovam execução nativa do systemd, falha física
de energia ou recuperação na OCI. Produção permanece **BLOCKED**; nenhuma ativação,
reconciliação, autorização operacional ou instalação decorre desta revisão local.

### Resíduos `.write-*` — início, contenção e conclusão

A revisão confirmou que `atomic_json()` pode deixar seu temporário após SIGKILL,
`os._exit()` ou perda de energia, pois essas interrupções não executam `finally`.
A exceção Python tratada normalmente remove apenas o temporário criado por aquela
chamada. A escrita de `state.json` e de `release-guard.json` ocorre em duas operações;
não constitui uma transação atômica entre os dois arquivos.

Os diretórios autoritativos inspecionados são:

- `/opt/traceflow/shared/release-state`, para `state.json` e também recibos de
  migrations. Um nome `.write-*` nesse diretório não comprova sozinho sua origem.
- `/opt/traceflow/shared/release-guard`, para `release-guard.json`.

A detecção comum examina entradas `.write-*`, incluindo diretórios e symlinks,
sem seguir links, interpretar conteúdo ou remover arquivos. Ela usa leitura
explícita do diretório: impossibilidade de inspecioná-lo não equivale a ausência.
As evidências de contenção registram apenas escopo, quantidade e hash dos nomes,
vinculados ao estado observado e à tentativa; não copiam o conteúdo temporário.
O destino e a fase exatos de uma escrita interrompida desconhecida exigem revisão.
Temporários de catálogo, generation ou backup pertencem a outros protocolos e
não são tratados como resíduos dos dois arquivos autoritativos nesta correção.

**Início:** `launch`, `run` e a aquisição do claim recusam resíduos antes de iniciar
uma nova ativação. `reconciliation_closed` também os recusa ao validar o estado
operacional atual, mesmo que os recibos v2 estejam completos. A validação da cadeia
histórica, feita com `check_guard=False`, não transforma resíduos atuais em motivo
para impedir a contenção de um proprietário comprovado.

**Contenção:** `recover` continua exigindo titularidade. Quando há resíduo ou falha
na persistência inicial, tenta as ações independentes já autorizadas de parada,
restauração do Nginx/página, bloqueio de contas, links pertencentes à tentativa e
limpeza de sua credencial. Não substitui estado ou guard ambíguos para declarar a
recuperação concluída. Registra `state-persistence`, `INTERVENTION_REQUIRED` e
`formalRecovery: false`. Se existe `recovery.json`, uma nova tentativa de contenção
usa recibo exclusivo `containment-<id>.json`, preservando o recibo anterior.
Erro de inspeção também bloqueia conclusão e não impede essas ações independentes,
desde que a titularidade ainda seja demonstrável pelo estado e claim íntegros.

O finalizador não proprietário mantém a limpeza exclusivamente local à sua
tentativa; ele não repara nem altera estado, guard ou resíduos da proprietária e
não necessita tomar seu lock global. Sem prova de titularidade, não há contenção
global. Uma repetição de contenção incompleta pode registrar novas observações;
não é uma aprovação idempotente nem renovação de autorização.

**Conclusão:** não se publica sucesso ou se aprova recuperação com resíduos
conhecidos. A recuperação já registrada exige também estado final esperado e guard
coerente. Uma interrupção depois do recibo de recuperação, mas antes da conclusão
de estado/guard, não se torna concluída só porque esse recibo existe. `reconcile`
continua recusando resíduos, inclusive em repetição de uma reconciliação v2 já
concluída. Não há limpeza automática, flag de bypass ou reparação genérica adicional.

**Compatibilidade e limite comprovado:** a `401f130` não conhece o detector. Um teste
local de seu código demonstra que ela pode submeter uma ativação a partir de um
estado legado `idle` mesmo com `.write-*`. Estados `reconciled-v2` continuam recusados
pelo controlador antigo, conforme o protocolo anterior. Não se altera um estado
legado ambíguo apenas para fabricar um bloqueio que o código antigo reconheça.
Root pode executar deliberadamente esse código; sem alterar a instalação/custódia,
a implementação nova não oferece prevenção absoluta. Antes de qualquer futura
operação, a revisão deve exigir caminho, descritor, manifesto e seleção efetiva do
controlador revisado para launcher, `run-first` e `ExecStopPost`, além de conferência
dos dois diretórios. Não usar `401f130` para retomada. Esses controles operacionais
não foram aplicados nesta tarefa; produção permanece **BLOCKED**.

A investigação preserva temporários e recibos. Uma intervenção futura deve
inventariar sob custódia os resíduos, comparar estado/guard/claim e recibos, verificar
qual processo e fase os produziram e obter autorização específica para qualquer
tratamento. Esta seção não autoriza excluir, promover, reaproveitar ou sobrescrever
arquivos, nem iniciar serviços. Locks são cooperativos; observações de filesystem
não constituem garantia contra root ou escritores externos fora do protocolo.

### OCI-07.16A — contrato de unidades na reconciliação

O preflight real encontrou `LoadState=loaded`, `ActiveState=inactive` e
`SubState=dead` para `traceflow-recovery-backup.timer`, sem propriedade `MainPID`.
A exigência genérica de PID zero recusava esse timer antes de credencial ou SQL.
A evidência sanitizada está incluída como fixture de testes em
`deploy/tests/fixtures/reconciliation-systemd-timer.json`; os relatórios originais
em `build/oci-reconciliation-preflight/` permanecem imutáveis.

A coleta e a validação dos recibos distinguem os tipos pelo **nome esperado da
unidade**, não por um tipo declarado livremente no documento:

- Serviços `.service`: observação fechada `{type, state, pid}`, com
  `type: service`, `state: inactive` ou `failed` e `pid: "0"` efetivamente retornado
  por `MainPID`. PID ausente, numérico, inválido ou diferente de zero é recusado.
- Somente `traceflow-recovery-backup.timer`: observação fechada
  `{type, loadState, state, subState, unitFileState, triggers}`, exigindo exatamente
  `timer`, `loaded`, `inactive`, `dead`, `disabled` e
  `traceflow-recovery-backup.service`, respectivamente. Não há campo `pid`.
  O serviço acionado continua sendo auditado separadamente como serviço, com PID zero.

O timer é consultado com `systemctl show` e as cinco propriedades explícitas
`LoadState`, `ActiveState`, `SubState`, `UnitFileState` e `Triggers`, com timeout de
10 segundos. Erro do comando, propriedade ausente, duplicada ou inesperada,
saída malformada, estado ativo/desconhecido, habilitação ou vínculo divergente
impedem a auditoria. Não se usa `MainPID` com valor padrão e não se modifica a
implementação genérica de `service_state()` nem o estado das unidades.

Esse contrato vale para as duas observações de ambiente, inicial e final, e para
a validação da cadeia completa. A autorização v2, prazo de 600 segundos, hashes,
ordem das observações, publicação exclusiva, titularidade, lock, resíduos e
verificações MySQL permanecem inalterados. Os tipos explícitos fazem parte dos
bytes selados nos recibos. Um serviço não pode ser interpretado como timer nem
vice-versa. O formato antigo que atribuía `pid: "0"` ao timer não é convertido ou
aceito como evidência tipada: uma cadeia antiga com esse formato exige revisão
específica, sem sobrescrita. Nenhuma reconciliação real existia no preflight.

A correção é exclusivamente local. Os testes usam as propriedades reais registradas,
com chamadas systemd, HTTPS e MySQL simuladas; não representam uma nova execução
na OCI. Após revisão, versionamento, empacotamento, instalação e um novo preflight
exigem suas autorizações próprias. Não executar `reconcile-first`, ativar serviços
ou habilitar o timer com base somente nos testes locais. Produção permanece BLOCKED.

### Captura supervisionada após recuperação `reconciled-v2`

A captura pré-ativação pelo ciclo oficial aceita `reconciled-v2` exclusivamente
em `--mode supervised`, com autorização específica vigente de até 600 segundos.
O caminho direto `recovery-backup.py capture` não recebe exceção de estado.
Não executar `prepare-guard` nesse estado: o guard dedicado deve já existir e
corresponder exatamente ao estado; ausência, divergência ou `.write-*` bloqueiam.

Antes de reservar ciclo, os dois locks oficiais protegem a validação da política,
do replay e do orçamento, seguida da elegibilidade completa: cadeia imutável de
reconciliação/recuperações (`recoveryProof`, inclusive failure/claim/applied),
release e controlador de origem íntegros, state/guard coerentes, ausência de
current/previous/web e histórico ativo, serviços parados com PID zero demonstrado,
contas bloqueadas, auditoria administrativa, sessões ausentes e 68 migrations.
A exclusão de escritores externos exige coordenação efetiva do operador durante
toda a execução; ausência de processos locais não a demonstra por si só.

A política continua vinculada à release da APLICAÇÃO. Um controlador separado
somente é aceito se seu par instalado/catálogo for íntegro, committed, com schema
idêntico, proveniência de repack da release/descritor exatos da política e todos
os arquivos fora de deploy/ (aplicação e dependências) idênticos. Não trocar
policyId, hash da política, ledger ou limites para acomodar um controlador novo.
A identidade desse controlador será aprovada no GO operacional de instalação;
essa compatibilidade não concede autorização para instalar ou executar.

Depois da elegibilidade, revalidar prazo/replay/orçamento e reservar exatamente
um slot, antes de iniciar qualquer alteração de manutenção. Falha no preflight
não reserva slot; falha/interrupção após reserva nunca devolve ou reutiliza slot,
mesmo que a captura não chegue a produzir payload. Resíduo de gravação do ledger
ou journal exige revisão, sem limpeza automática. A reserva e o journal não são
uma única transação: interrupção entre ambos pode consumir um slot sem captura,
mas nunca autoriza repetir a mesma autorização nem iniciar uma aplicação.

O priorState e seu hash são vinculados ao prepared.json protegido; a proveniência
é revalidada antes da captura e da recuperação. O ciclo pode publicar estado
transitório backup-maintenance sob os locks, mas o término seguro restaura
EXATAMENTE o estado anterior, incluindo recoveryProof, runId, status e fase.
O guard volta à projeção correspondente. Sucesso ou falha segura pré-ativação
não desbloqueia contas nem inicia serviços. Falha na recuperação mantém bloqueio
e alerta, preserva o priorState no journal e não fabrica reconciled-v2.
Divergência state/guard não é reparada implicitamente; contenção independe de
conseguir publicar um novo estado. Um preflight recusado não contém outra execução.

Instalação isolada, execução supervisionada, publicação/readback e restauração
isolada exigem GO próprio após revisão dos artefatos. O timer continua desabilitado.
O ensaio consome um dos ciclos restantes somente após elegibilidade; nunca renovar
política, zerar ledger ou remover slots para obter execução. Após a captura,
comprovar o novo conjunto externo/readback e restore integral em destino descartável,
incluindo todos os registros atuais; o backup histórico permanece preservado.
Nada nesta validação local concede PASS OCI ou autoriza activate-first.
