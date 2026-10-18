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
