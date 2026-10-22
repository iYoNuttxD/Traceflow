# TraceFlow — operação da instalação limpa

Este documento aplica-se exclusivamente a `https://traceflow.dev`, banco
`traceflow_live`, UID `traceflow-live`, serviços `traceflow-live-api` e
`traceflow-live-worker`. O protocolo antigo, seus recibos, ledger, timer,
`recoveryProof`, schema `traceflow` e storage antigo permanecem isolados.
Nunca utilizar ferramentas antigas de primeira ativação para operar esta instalação.

## Diagnóstico inicial

Na VM, por SSH com identidade já autorizada; consultas administrativas como root:

```sh
curl --fail --silent --show-error --max-time 15 https://traceflow.dev/ -o /dev/null
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3001/health/ready
sudo systemctl status traceflow-live-api traceflow-live-worker nginx --no-pager
sudo python3 -I -B /usr/local/libexec/traceflow-live-ops.py status
sudo systemctl list-timers 'traceflow-live-*' --all
sudo journalctl -u traceflow-live-api -u traceflow-live-worker --since '-15 minutes' --no-pager
```

O status protegido inclui disponibilidade/tempo HTTPS, readiness, identidade MySQL,
heartbeat, jobs GitHub com falha, HTTP 5xx/p95, disco, memória e idade do backup.
Ele contém dados operacionais; não publicá-lo como endpoint anônimo. Consultar
logs por `requestId`; não copiar logs brutos para chats/tickets. O access log
JSON usa rota categorizada, sem query string, IP do usuário, cookie ou token.

## Indisponibilidade, banco e worker

1. Comparar HTTPS público com readiness local. Público falha/local saudável:
   conferir `nginx -t`, status Nginx, firewall e certificado. Não alterar DNS ou
   Cloudflare por tentativa. Não usar `curl -k`.
2. Readiness falha: consultar os logs da API e a métrica MySQL. Confirmar espaço,
   CA, TLS, endpoint privado e estado HeatWave pelo console autorizado. Nunca
   abrir 3306 à Internet, desbloquear o migrador ou executar migrations como reparo.
3. Worker falha/heartbeat >90 s: consultar seu journal e erros `GitHubSyncRun`.
   Conferir conectividade GitHub, rate limit e credencial. Não executar outro
   worker paralelo. Reinício controlado de serviço exige avaliação da causa e
   autorização operacional quando houver impacto; não aplicar restart em loop.
4. A sondagem é realizada a cada minuto; três observações consecutivas com falha
   enviam alerta, limitado a um por código/hora. Backup falho alerta por OnFailure;
   falha do coletor possui OnFailure próprio. SMTP usa STARTTLS com certificado
   validado. Destinatário autorizado: `danielganzmusse@gmail.com`.
5. Se a VM inteira parar, o SMTP local também deixa de funcionar. A cobertura
   externa usa o alarme OCI `traceflow-live-vm-metric-absence`: ausência de
   `CpuUtilization[1m]` da VM exata, pending PT5M, tópico
   `traceflow-live-operations`, assinatura e-mail ACTIVE. Conferir o alarme no
   Monitoring e a assinatura no Notifications; ausência da métrica também pode
   significar falha do agente. A entrega SMTP de teste foi confirmada pelo operador;
   não foi provocada uma queda real da VM para testar o alarme externo.

## Backup da produção atual

Código: `deploy/operations/live_operations.py`, instalado root:root 0755 em
`/usr/local/libexec/traceflow-live-ops.py`; configuração root 0600
`/etc/traceflow-live/operations.json`; estado independente root 0700 em
`/var/lib/traceflow-live-ops`. A conta `tf_live_backup@10.20.1.184` possui somente
SELECT em `traceflow_live.*`, REQUIRE SSL e credencial systemd cifrada por host.
Não reutiliza orçamento/ciclos/políticas antigos.

- Agenda habilitada e ativa: **06:00 UTC / 03:00 America/Sao_Paulo, diariamente**,
  timer `traceflow-live-backup.timer`, Persistent=true. A primeira captura real pela
  mesma service passou; na entrega, o primeiro disparo automático ainda era futuro.
  Conferir `last-backup.json` e o último disparo nas verificações diárias.
- Destino: bucket privado existente `traceflow-production-recovery`, região
  `sa-saopaulo-1`, namespace `grcxenfrp09f`, prefixo exclusivo
  `production-live-v1/`. Publicação por instance principal, sem PAR pública.
- Dump InnoDB `--single-transaction --quick --skip-lock-tables`, sem locks
  operacionais, sem tabelas globais/usuários, mantendo 61 tabelas/68 migrations.
  Recusa views, engines não transacionais, triggers/routines/events fora do escopo.
- Copia storage atual por streaming; valida estabilidade de arquivos, hashes,
  propriedade, permissões, referências TestEvidence e partes ativas de upload.
  Se atividade concorrente impedir consistência, recusa e alerta; não interrompe API.
- Inclui configurações necessárias, CA, certificado/chave de origem, serviços,
  referência imutável da release e manifesto de dados/estruturas/arquivos.
  Configurações com segredos ficam somente em tmpfs privado durante a captura e
  dentro do arquivo cifrado. Não exportar plaintext.
- Cifra antes de publicar, usando age e a chave pública já custodiada. A chave
  privada continua exclusivamente com o operador, fora da VM. Guardá-la em
  custódia externa protegida; sua perda impede recuperar os backups.
- Readback do objeto cifrado precisa ter SHA-256 e tamanho idênticos à origem.
  Só então publica `last-backup.json` com status SUCCESS. Um arquivo local cifrado
  ou exit code isolado não prova backup externo recuperável.
- Retenção técnica: 14 dias no prefixo novo, preservando no mínimo as duas cópias
  mais recentes quando existirem; há uma geração nova comprovada nesta entrega.
  Cifrados locais por dois dias. Nenhum objeto `backups/` legado é
  candidato. Exclusão condicional por ETag e nome estrito. Não habilitar lifecycle
  amplo no bucket. Revalidar mínimo de cópias/restore antes de descarte excepcional.
- Limite conservador: bucket total <8 GiB, plaintext por conjunto <512 MiB e
  orçamento próprio de requisições na configuração. Ao atingir limite, alertar e
  revisar capacidade; não remover dados históricos para forçar captura.

RPO alvo: **até 24 horas apenas com capturas diárias bem-sucedidas**. Backup >26 h
ou captura falha gera alerta. Falhas podem ampliar a perda potencial: a agenda não
constitui garantia de RPO. RTO de planejamento: **4 horas**, dependendo de acesso
OCI, chave de recuperação, destino MySQL/VM e código imutável disponíveis. O tempo
medido do ensaio isolado não inclui provisionamento, autorização de incidentes,
DNS/TLS, reconexão GitHub ou decisão de cutover; não comprova RTO integral.

### Backup falhou ou está desatualizado

```sh
sudo systemctl status traceflow-live-backup.service --no-pager
sudo journalctl -u traceflow-live-backup.service --since '-2 days' --no-pager
sudo cat /var/lib/traceflow-live-ops/last-attempt.json
sudo cat /var/lib/traceflow-live-ops/last-failure.json
sudo cat /var/lib/traceflow-live-ops/last-backup.json
```

Conferir IAM do prefixo, espaço, credencial/TLS, referências de arquivos e quotas.
`BucketNotFound` também pode significar autorização recusada; não criar outro bucket
ou usar o prefixo legado como desvio. Preservar a última cópia íntegra e os recibos.
Após resolver a causa, executar a unit nova somente mediante a autorização de
manutenção aplicável; não fazer loop de retries, restore ou limpeza automática.

## Restore de banco, arquivos e configurações

1. Identificar uma captura SUCCESS do **banco novo** e seu objeto no prefixo novo.
   Recuperar o cifrado por acesso OCI autorizado, com TLS normal; verificar tamanho,
   SHA-256, id de captura e recibo de readback. Proteger a pasta local com 0700.
2. Preparar `payload.age`, `receipt.json` e `config-public.json` (somente recipient)
   na pasta. Não incluir senha administrativa ou chave privada nesses arquivos.
3. Em Mac com MySQL 26.7.0 e ferramentas age aprovadas, no checkout preservado:

```sh
python3 -I -B deploy/operations/restore_live_backup.py --check /CAMINHO/ABSOLUTO/PASTA
python3 -I -B deploy/operations/restore_live_backup.py --run /CAMINHO/ABSOLUTO/PASTA
```

   O operador digita a chave apenas no prompt oculto. O helper usa volume APFS
   cifrado e MySQL novo, UUID distinto, bind 127.0.0.1, porta efêmera e schema
   descartável. Não se conecta à OCI ou ao banco produtivo. Compara hashes de
   todas as estruturas/dados, 68 migrations, 116 FKs e arquivos/configurações.
   DDL é comparada integralmente, exceto a grafia redundante comprovada
   `CHARACTER SET utf8mb4` antes de `COLLATE utf8mb4_*`, fora de literais/comentários.
   Collation, tipo, default, constraints e AUTO_INCREMENT continuam exigidos. Os
   hashes originais são preservados; `rawDdlHashesEqual=false` não é ocultado. O helper
   encerra MySQL antes de desmontar e elimina somente o workspace criado por ele.
   Verificar `restore-result.json`, cleanup e ausência de processos residuais.
4. As ferramentas age 1.3.2 ficam em
   `~/Library/Application Support/TraceFlowRecovery/tools/age-1.3.2/` (privado,
   binários 0500 e SHA-256 fixado no helper), sem dependência do cache temporário.
   São necessários MySQL 26.7.0, Node.js 22, OpenSSL Homebrew e APFS do Mac.
   Em SIGKILL/perda de energia, conferir processo/datadir e sparsebundle pertencentes
   ao ensaio antes de limpeza manual; não usar KILL/rm por padrão amplo.
   Helper tem caminhos/hashes/versionamento explícitos; caso o Mac
   ou ferramentas mudem, revalidar os binários oficiais antes de alterar esses
   parâmetros. Não desabilitar integridade para acomodar uma ferramenta diferente.
5. Recuperação real de desastre: restaurar primeiro em destino novo e isolado,
   nunca sobre a origem ativa. Conferir manifesto e toda a integridade antes de
   autorizar mudança de conexão dos serviços. Reprovisionar conta backup SELECT
   pela custódia administrativa; o encrypted credential systemd é vinculado ao host
   e não substitui a custódia externa. Não reaplicar credenciais/paths de incidente
   sem revisão. Cutover exige autorização específica, diagnóstico e plano de volta.

## Deploy malsucedido e rollback

Não usar o antigo activate-first. Antes de atualizar, preservar configs root,
release anterior e novo backup restaurável. Não executar migrations destrutivas
como rollback. Se só o ingress precisar ser contido, o roteiro preservado:

`/var/lib/traceflow-deployment-archive/20261020-clean/rollback-to-maintenance.sh`

restaura a página de manutenção e para os serviços da instalação limpa. **Isso
interrompe a produção e só deve ser executado com autorização do responsável.**
Não restaura banco, não apaga storage e não significa retorno automático a uma
versão funcional. SHA-256 do roteiro:
`5b72fc3367b6583b2f5f58f76deae207039b26f4888b5d489f8942aad57e2968`.

## Segurança, retenção e incidente de segredo

- Firewall permite SSH administrativo; 80/443 somente dos CIDRs oficiais Cloudflare
  conferidos nesta entrega. API: 127.0.0.1:3001; MySQL: endpoint privado, TLS
  VERIFY_IDENTITY e contas limitadas à origem 10.20.1.184. NSGs e security lists
  reais foram consultados: SSH somente de dois /32 administrativos existentes;
  subnet MySQL proíbe IP público e ingress 3306 recebe somente do NSG da VM.
  Não existe liberação 3306 adicional pelas security lists. Revalidar após alterações.
- Atualizar CIDRs Cloudflare a partir de fonte oficial com TLS, instalando novas
  permissões antes de retirar antigas. Não abrir todas as origens como solução
  permanente. Preservar acesso SSH/console antes de mudar regras administrativas.
- IMDS 169.254.169.254: TCP80/443 bloqueados por UID para `traceflow-live` e
  `nginx`, em regras permanentes/runtime; root continua autorizado para instance
  principal. DNS53/NTP123 no endereço compartilhado permanecem acessíveis.
- Env/chaves 0600 root, ancestrais 0700; storage 0700 UID dedicado. Não alterar
  backend/frontend nem copiar segredos para relatórios. SELinux permanece Enforcing.
- API/worker usam sandbox systemd, NoNewPrivileges, Core=0 e swap de processo=0.
  API escreve só no storage atual; worker não possui acesso de escrita ao storage.
- Journald: máximo 30 dias/512 MiB persistente/128 MiB volátil; pode remover antes
  do prazo sob limite de tamanho. Histórico disponível antes da mudança foi
  preservado cifrado em `installation-archive/journal-before-retention.export.age`.
  Access logs: rotação diária/30 arquivos comprimidos; métricas: diário/30 rotações
  e limite adicional de tamanho. Acesso administrativo apenas.
- Os prazos de dados de domínio continuam em `docs/privacy/DATA_RETENTION_POLICY.md`.
  O operador aprovou os prazos técnicos e o agendamento diário às **05:30 UTC /
  02:30 America/Sao_Paulo**, `traceflow-live-retention.timer`, apenas nesta instalação.
  Usa os módulos oficiais existentes: sessões expiradas/revogadas 30d; tokens/states
  usados/expirados 7d; convites concluídos e metadados de webhook 30d; auditorias e
  pedidos finalizados 365d; exports/uploads expirados; projetos já excluídos pelo
  usuário após 30d de carência. SyncRuns não receberam um novo prazo.
  Dry-run real com o UID/sandbox da service: zero candidatos. Não foi executado
  apply manual imediato; o primeiro disparo agendado ainda era futuro. Execução
  manual destrutiva adicional exige autorização específica e elegibilidade atual.
  Solicitações LGPD devem considerar retenção de cópias,
  tombstones e arquivos livres, sem prometer apagamento instantâneo ou conformidade
  jurídica absoluta. Nenhum dado de domínio foi eliminado por esta entrega.
- Suspeita de comprometimento: preservar evidências protegidas, identificar o
  segredo afetado e seu alcance, conter acesso por mecanismo autorizado, revogar
  e substituir somente a credencial necessária, atualizar custódia/configuração,
  realizar reinício controlado se indispensável e validar saúde/menor privilégio.
  Não publicar o segredo em ticket. Rotação de GitHub/SMTP/banco exige coordenação
  do titular e não deve invalidar a chave histórica necessária para decriptar backups.

## Limites e custos

Reutiliza VM, HeatWave, SMTP e bucket existentes. Criados somente política IAM do
prefixo novo, tópico/assinatura Notifications e alarme Monitoring nativos. Nenhuma
VM, banco ou bucket adicional pago foi criado; custo incremental esperado zero
dentro das franquias, sem garantia sobre o consumo global do tenant.
O volume e requisições devem permanecer dentro da franquia disponível da conta;
a disponibilidade de franquia não é garantia de custo zero para uso global do tenant.
Revisar consumo no console e o limite local antes de ampliar dados/retenção.
Fontes: [OCI Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm),
[permissões Object Storage](https://docs.oracle.com/en-us/iaas/Content/Identity/Reference/objectstoragepolicyreference.htm),
[CIDRs Cloudflare IPv4](https://www.cloudflare.com/ips-v4/),
[IPv6](https://www.cloudflare.com/ips-v6/),
[restart seguro do journald](https://www.freedesktop.org/software/systemd/man/257/systemd-journald.socket.html).
