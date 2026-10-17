# OCI-DEPLOY-06 — Backup coordenado e recuperação

> Continuação OCI06.1: consultar o [bootstrap inicial preparado](OCI_HEATWAVE_INITIAL_BOOTSTRAP.md)
> para o estado atualizado informado pelo operador e os lotes administrativos. Nenhuma execução autorizada.

## Escopo e estado

Implementação e ensaios **locais com dados sintéticos**. O CLI `deploy/scripts/backup.sh` aceita somente `local-isolated`; não existe flag que habilite produção. Nenhum backup de dados reais, envio externo, timer instalado ou restore gerenciado foi feito. A autorização atual do usuário limita a execução ao laboratório.

O contrato histórico de [BACKUP_RESTORE.md](BACKUP_RESTORE.md) foi preservado: menor privilégio, InnoDB, credenciais protegidas e restore isolado. Este runbook acrescenta consistência com evidências, upload resumível, criptografia autenticada, identidade de destino e fencing operacional. A evidência histórica E15 de 25 migrations não deve ser confundida com as 68 migrations atuais.

## Dados protegidos e unidade de recuperação

Uma cópia recuperável é um conjunto indivisível:

1. Dump lógico do schema inteiro, incluindo `_prisma_migrations`, identidades/sessões, projetos, requisitos, tarefas, sprints, testes, histórico, sincronizações, auditoria e ledger de uploads.
2. Arquivos confirmados em `/var/lib/traceflow/test-evidence`.
3. `.uploads`, partes aceitas, staging de finalização e seus metadados do mesmo ponto de quiescência.
4. Manifestos, hashes e vínculo com release, versão MySQL e cadeia Prisma.

Não copiar apenas `TestEvidence`, apenas o banco ou apenas o diretório e declarar DR aprovado. Configurações de runtime e segredos não entram neste pacote; precisam de recuperação independente por responsáveis autorizados. Artefatos de release também devem ter cópias verificadas independentes.

## Consistência e exclusão mútua

O procedimento coordenado futuro deve:

1. Adquirir o mesmo `operation.lock` usado por migrations/releases, mantendo o inode; não remover o arquivo de lock para destravar.
2. Bloquear novos escritores, interromper API e worker de forma graciosa, aguardar encerramento dos processos e controlar jobs/escritores externos. Registrar a interrupção planejada e a release.
3. Manter o bloqueio até terminar o dump e a cópia dos arquivos. Não executar DDL concorrente.
4. Validar identidade, TLS, grants, engine, cadeia aplicada, referências e arquivos antes da coleta.
5. Executar snapshot lógico e copiar arquivos; comparar snapshot e inventário novamente antes de publicar o pacote.
6. Criptografar, conferir e publicar atomicamente o conjunto; registrar checksum por canal independente; verificar recuperação antes de depender da cópia.
7. Retomar os escritores apenas pelo procedimento autorizado, conferir readiness e heartbeat. Falha do backup não autoriza exclusão de cópias anteriores.

O laboratório simula a quiescência com processos encerrados e recibo privado de curta validade, associado a runId/UUID e PIDs conhecidos. Esse recibo é uma atestação do operador, **não um lock distribuído**. A integração real com systemd, bloqueio de todos os escritores e lock `/opt/traceflow/shared/release-state/operation.lock` ainda precisa ser implementada/homologada antes da ativação de backups reais. Não anunciar o CLI local como job de produção.

`--single-transaction` só garante o snapshot transacional do banco. A relação banco/filesystem exige a quiescência acima. DDL concorrente pode invalidar a captura. Referência: [mysqldump MySQL 26.7](https://dev.mysql.com/doc/refman/26.7/en/mysqldump.html).

## Ferramentas, TLS e credenciais

- `mysqldump` e `mysql` da mesma versão do servidor: 8.4.8 ou 26.7.0 nos ensaios.
- `age` **1.3.2**, release oficial com SHA-256 verificado; chave X25519 sintética criada fora do destino de backup. [Release oficial age](https://github.com/FiloSottile/age/releases/tag/v1.3.2).
- Python standard library; sem dependência adicional no runtime Node ou mudança de Prisma.
- Cliente usa `--defaults-file` 0600 transitório como primeira opção, `--no-login-paths`, ambiente limpo, TLS `VERIFY_IDENTITY`, CA pública e TLS 1.2/1.3. Senha nunca em argv/log.
- Backup usa conta SELECT/SHOW VIEW. Restore usa conta DDL/DML limitada ao schema novo; sem global, FILE, usuário, GRANT OPTION ou conta root.

O dump usa single transaction, quick, sem lock de tabelas, sem tablespaces, sem GTID global e sem DROP de tabelas. Views, triggers, routines, events e engines não suportados são recusados quando visíveis. A visibilidade de metadata varia com privilégios: o futuro preflight administrativo restrito deve confirmar a inexistência desses objetos; não inferir inexistência de uma consulta sem direitos de visibilidade. O schema atual não os define.

Timeouts de ferramentas são limitados; mysqldump não recebe `--connect-timeout`, opção não suportada nesse utilitário. O processo tem deadline externo. Não tratar encerramento por timeout como backup válido.

## Criptografia, arquivos temporários e manifestos

`backup.py` cria scratch 0700, arquivos 0600, sem symlinks e fora do destino final. Há plaintext temporário privado durante dump, validação e empacotamento. Ele é removido ao concluir ou em falha tratada. Em produção exigir volume criptografado e procedimento para scratch remanescente após crash/SIGKILL; unlink não garante apagamento físico em SSD. Não afirmar que todo plaintext nunca chega ao disco.

Formato v1:

```text
<backup-id>/
  manifest.json       metadata operacional e SHA-256 do payload cifrado
  payload.age         database.sql + snapshot.json + set.json + evidence/...
```

Manifesto externo: aplicação, formato, backupId, UTC, versão MySQL, releaseId, política de consistência, hash da cadeia, algoritmo, tamanho/hash do ciphertext e estado COMPLETE. O conjunto interno cifrado contém schema/cadeia completos, inventário de arquivos, hashes, tamanhos, estruturas/contagens/fingerprints por tabela e política de uploads.

O diretório final só é publicado após criptografia e fsync. Um dump criado ou uma criptografia iniciada não bastam. `.incomplete-*` não é backup válido. Uma falha remove apenas o temporário pertencente à tentativa atual; as cópias anteriores permanecem intactas.

SHA-256 detecta corrupção; não autentica sozinho a procedência. Restore exige o digest esperado do manifesto por canal independente confiável, além da autenticação do payload age. Nunca usar o hash calculado do mesmo diretório potencialmente comprometido como única raiz de confiança. Catálogo externo protegido/assinado e cópia fora da VM são pendências de produção.

A chave privada não pode ficar junto ao pacote de backup. Definir custodiante, segundo responsável, mecanismo de recuperação, acesso auditado e exercício de perda/rotação. Preservar identidades antigas enquanto existirem cópias necessárias cifradas para elas. Nenhuma chave real foi criada, acessada ou distribuída.

## Arquivos, uploads e integridade

O inventário aceita somente nomes e árvores canônicas UUID, rejeita links, caminhos desconhecidos e permissões abertas. Compara SHA-256/tamanho de cada evidência confirmada com `TestEvidence`. Para uploads OPEN/FINALIZING, exige todas as partes registradas; partes de registros terminais podem já ter sido limpas. Preserva staging e temporários reconhecidos, sem promovê-los a evidências confirmadas ou apagá-los automaticamente.

O restore mantém ledger, idempotency key, leases, prazos, referências e arquivos juntos. Não limpar leases na mão. Aguardar expiração e seguir o reconciliador canônico; retomar/completar deve manter autorização, versão do caso de teste e idempotência. Um upload expirado há dias pode não ser retomável, mesmo com bytes preservados; confirmar evidências já concluídas e tratar TTL conforme o contrato existente, sem prorrogação silenciosa.

## Destino, retenção e agendamento

No ensaio, o destino é um diretório privado de laboratório e é removido ao final. Não é uma cópia de DR operacional. Produção exige armazenamento criptografado **fora da VM**, responsável e política aprovados. OCI Object Storage privado é candidato; outro destino pode ser escolhido. Não foi criado bucket, IAM, upload ou contratação.

No Always Free, Oracle documenta backup automático com retenção de um dia e ausência de backup manual normal; PITR não está disponível. Restore gerenciado e backup final têm regras próprias. Essas cópias do DB System não incluem o filesystem de evidências da VM. Fontes: [backups](https://docs.oracle.com/iaas/mysql-database/doc/overview-backups.html), [PITR](https://docs.oracle.com/en-us/iaas/mysql-database/doc/point-time-recovery.html), [restore](https://docs.oracle.com/en-us/iaas/mysql-database/doc/restoring-backup.html).

As ações gerenciadas Validate/Prepare de backup não estão disponíveis no Always Free; não usá-las como gate presumido. Um restore lógico isolado demonstrado continua necessário. [Managing backups](https://docs.oracle.com/en-us/iaas/mysql-database/doc/managing-backup.html).

A franquia de Object Storage depende do tipo de conta e consumo: a documentação distingue 20 GB combinados em contas Always Free e franquias por classe para PAYG. Confirmar tenancy, uso, requests, egress e ciclo de vida antes de escolher destino/retenção. PAYG pode cobrar excesso; nada foi contratado. [Free Tier](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

**Proposta para decisão, não política instalada:** cópia coordenada diária, 7 diárias + 4 semanais + 3 mensais, mínimo de 3 conjuntos íntegros e preservar a última cópia com restore ensaiado. Dimensionar bytes reais antes de adotar: essa proposta pode ultrapassar franquias. Definir retenção de dados pessoais com o controlador. Aumentar frequência somente após avaliar RPO e impacto da quiescência.

Não existe exclusão automática implementada. `persistence-monitor.py` pode listar candidatos apenas com política explicitamente aprovada, restore correspondente e cópias mínimas; cópias são fixadas por padrão. A lista não é autorização de remoção. Não instalar timer de backup antes do destino, chaves, capacidade, janela e coordenação estarem aprovados.

## Restauração isolada

1. Escolher release/schema exatos e conjunto completo. Registrar idade e janela de perda aceitável; checksum íntegro não torna um backup antigo adequado.
2. Obter chave por mecanismo protegido e digest de catálogo confiável; confirmar capacidade livre. Rejeitar versão/cadeia incompatível antes de SQL.
3. Criar destino novo e vazio **autorizado**, storage inexistente e credencial de restore limitada. O CLI atual só permite alvos descartáveis criados pelo laboratório. Nunca apontar para DEV/produção ou reutilizar schema parcialmente restaurado.
4. Validar cadeia age, checksum e extração segura: sem links, traversal, dispositivos, membros extras/duplicados, pacote incompleto ou volume acima do limite.
5. Registrar intenção antes de importar. Restaurar SQL sem `--force`, validar cadeia, schema, dados, FKs e arquivos; publicar storage atomicamente no mesmo filesystem.
6. Validar login, autorização, projeto/requisito/tarefa/sprint, histórico, sincronização, download, upload pendente e finalização idempotente com a release correspondente.
7. Emitir recibo separado vinculando backupId/digest e smoke aprovado. `RESTORED_INTEGRITY_VALIDATED` tem `applicationSmoke: PENDING` até esse smoke; não editar para PASS sem execução comprovada.
8. Só considerar cutover/ativação em procedimento separado e aprovado. Recuperação de dados não equivale a rollback de código; não executar down-migration automática.

Em falha após importação, registrar QUARANTINED e preservar o alvo parcial para investigação autorizada. Nova tentativa exige novo alvo; o script não limpa schema, remove journal ou sobrescreve storage para “tentar novamente”. Em SIGKILL, journal IN_PROGRESS também exige investigação/novo destino. A origem protegida e cópias anteriores não são apagadas.

Interface local, com os arquivos privados gerados pelo harness:

```bash
sh deploy/scripts/backup.sh backup --config "$LOCAL_BACKUP_CONFIG"
sh deploy/scripts/backup.sh verify --config "$LOCAL_BACKUP_CONFIG" \
  --backup "$LOCAL_BACKUP_SET" --manifest-sha256 "$TRUSTED_MANIFEST_SHA256" \
  --identity "$LOCAL_RECOVERY_IDENTITY"
sh deploy/scripts/backup.sh restore --config "$LOCAL_RESTORE_CONFIG" \
  --backup "$LOCAL_BACKUP_SET" --manifest-sha256 "$TRUSTED_MANIFEST_SHA256" \
  --identity "$LOCAL_RECOVERY_IDENTITY"
```

Não reconstruir o JSON manualmente para contornar os alvos permitidos. `run-persistence-lab.py` demonstra a configuração completa reproduzível e o ciclo de vida dos recursos sintéticos.

## Ensaios e tempos

R01–R03: schema vazio + banco/arquivos coordenados + smoke funcional. R04 incompleto; R05 corrupção e corrupção com hash externo recalculado; R06 chave incorreta; R07 cadeia incompatível; R08 backup envelhecido mas de schema exato; R09 evidência ausente; R10 SIGTERM real após DDL parcial; R11 reexecução; R12 alvo protegido. Também testados: backup interrompido, concorrência do mesmo flock, permissões, falha de criptografia, espaço insuficiente (unitário), links e arquivos maliciosos (unitários).

| Restore de integridade | Tempo medido, fixture sintética |
| --- | ---: |
| MySQL 8.4.8 / macOS ARM64 | 4,519 s |
| MySQL 26.7.0 / macOS ARM64 | 4,317 s |
| MySQL 26.7.0 / Oracle Linux ARM64 | 2,283 s |

61 tabelas, 116 FKs, uma evidência confirmada e dois registros de upload no snapshot; o smoke retoma a parte pendente e confirma conteúdo/idempotência. Não são benchmarks de volume real. O cronômetro de restore inclui verificação/decriptação/importação/integridade/publicação, mas não provisionamento, obtenção de chaves, transferência externa, aprovação, smoke e cutover. Verificar datas UTC nas evidências.

**RPO proposto ≤24 h e RTO proposto ≤4 h, ambos pendentes de aprovação e ensaio representativo.** RPO depende da frequência e do último conjunto coordenado recuperável, não apenas do backup OCI. RTO medido localmente em segundos não comprova RTO de produção. Aprovação exige volume representativo, transferência externa, perda simulada da VM, recovery de segredos e execução humana cronometrada.

## Monitoramento e incidentes

`deploy/scripts/persistence-monitor.py --config <arquivo protegido>` verifica cópias COMPLETE, hashes/tamanhos, idade, recibo de restore correspondente, espaço, sensor freshness, API, readiness, heartbeat, certificado, orçamento de pool e revisão de manutenção. Exit 0 indica avaliação sem alertas; exit 2 indica alerta/configuração inválida. Saída sanitizada, sem webhook/email e sem remoção.

O monitor consome um `sensorSnapshot` protegido produzido externamente: `checkedAtEpoch`, `liveness`, `readiness`, `workerHeartbeatFresh`, `freeBytes`, `certificateRemainingDays`, `poolBudgetExceeded`, `maintenanceReviewRequired`. Sensor ausente/velho não é tratado como saudável. O coletor de produção e canal de alerta **não estão implementados/integrados**; definir responsáveis e prazos. A avaliação de checksum não substitui decriptação/restore nem catálogo de procedência confiável.

Configuração privada inclui `backupRoot`, `restoreReceipt`, `sensorSnapshot` e `policy`: `minimumCopies` ≥3, idades máximas de backup/restore/sensor, bytes livres mínimos, dias de alerta de certificado, retenção e aprovação explícita. Caminhos devem ser reais, com dono do processo e permissões restritas. A unit preparada usa `traceflow`; resolver acesso do catálogo/configuração para esse usuário sem dar acesso à chave privada. Não copiar um arquivo root-only e presumir que o monitor o lerá.

Os templates `traceflow-persistence-monitor.service` e `.timer` rodam a avaliação a cada cinco minutos, com proteção de filesystem e sem acesso à rede. **Não instalados, habilitados ou homologados como serviço OCI.** A allowlist de empacotamento da OCI05 ainda não inclui estes novos utilitários; antes de instalar a unit, preparar um bundle operacional versionado ou ampliar a receita com validação de integridade/extração. O caminho ExecStart é um contrato futuro, não prova de que o arquivo exista em releases antigas. Falha de coleta/delivery precisa de alerta por mecanismo independente, para que o monitor não seja o único observador de si próprio.

Incidente: conter escritores; registrar falha/código/UTC sem dados; preservar última cópia válida e alvo parcial; verificar storage/CA/identidade/grants/capacidade; não apagar leases ou reduzir TLS; escalar ao responsável; restaurar em novo destino somente com autorização. Revogar/rotacionar credenciais comprometidas em fluxo separado. Manter logs sanitizados, acesso restrito e retenção aprovada.

## Limitações e checklist de ativação

O formato local limita arquivos descompactados a 4 GiB/100 mil membros e exige reserva de disco. Fingerprints por tabela e importação do SQL utilizam memória; ainda faltam processamento em streaming e limites de memória comprovados para volume real. Não ativar esse protótipo local em uma base grande. A janela de quiescência e todos os escritores precisam de prova operacional, não só receipt. Não há cópia externa, cofre real, coleta de sensores, alertas enviados ou restore HeatWave.

- [x] Cadeia atual e recuperação sintética demonstradas em 8.4.8, 26.7.0 e Linux ARM64.
- [x] Criptografia, corrupção, falhas, concorrência e destinos proibidos ensaiados.
- [ ] TLS/permissões/versão reais do HeatWave homologados por leitura autorizada.
- [ ] Adaptador operacional, streaming/capacidade e coordenação systemd implementados e revisados.
- [ ] Destino externo, custo, identidade de acesso, custódia de chaves e catálogo confiável aprovados.
- [ ] Frequência, retenção, RPO/RTO, responsáveis e alertas aprovados.
- [ ] Restore representativo independente, smoke e tempos completos demonstrados.
- [ ] Autorização específica para instalar jobs e operar dados reais.

Relatório: [OCI_DEPLOY_06_HEATWAVE_BACKUP_RECOVERY_REPORT.md](../deliveries/OCI_DEPLOY_06_HEATWAVE_BACKUP_RECOVERY_REPORT.md).

## OCI06.1 — continuidade de DR

TLS do servidor HeatWave recebeu PASS **manual**, conforme [homologação](OCI_HEATWAVE_HOMOLOGATION.md#oci-deploy-061--atualização-de-15102026).
Isso não habilita o CLI local-only de backup, comprova restore gerenciado nem fecha OCI06.
Não houve novo backup/restore real, timer, bucket, chave real, coleta ou alerta enviado.

Futuras ferramentas MySQL devem usar o FQDN canônico, VERIFY_IDENTITY e CA pública definitiva
com fingerprint confiável. A CA raiz é pública; sua chave privada e a chave do servidor não
entram no pacote coordenado. Recuperação de configurações, credenciais, release e CA confiável
é processo separado, com responsáveis; não recuperar trust somente do servidor a restaurar.

Permanecem: adaptador operacional com writers/lock de release, streaming/capacidade, destino
externo/custos, custódia de chaves, retenção aprovada, sensores/alertas, empacotamento dos utilitários
e ensaio representativo com transferência e smoke. RPO≤24h/RTO≤4h são propostas. Os segundos de
restore sintético da OCI06 não são RTO de produção. Avaliar o backup automático Always Free frente
ao conjunto DB+evidências e requisitos aprovados; não presumir que ele seja suficiente.

## OCI06.1 — bootstrap sem dados de aplicação

Segundo o operador, schema da aplicação ainda não foi criado, nenhuma migration foi aplicada
e não há aplicação publicada. O [bootstrap preparado](OCI_HEATWAVE_INITIAL_BOOTSTRAP.md)
não exige backup lógico de dados inexistentes. Recibo de schema ausente/vazio é evidência de
estado inicial, não backup; nunca preencher backupVerified/backupReference fictícios.

A conta traceflow_backup fica adiada até necessidade operacional e job gerenciado aprovado.
SELECT no schema é a proposta mínima para a cadeia atual, sem views; SHOW VIEW somente se
justificado pelo contrato futuro. O CLI existente continua local-isolated e não é habilitado
por esta documentação. DR, retenção, recuperação de segredos e restore real permanecem gates
antes de aceitar dados reais; a primeira migration precisa resolver separadamente o gate de
backup obrigatório do job atual. Nenhum backup/restore real foi executado nesta preparação.


## OCI-DEPLOY-07.1 — exceção delimitada para o primeiro schema vazio

O fluxo `migrate-initial` não exige dump lógico anterior quando a ausência de todos os objetos e do
histórico Prisma foi comprovada por inspeção administrativa protegida e revalidada pela sessão do job.
Não preencher backupVerified, backupReference ou restoreRehearsed artificialmente: o contrato inicial
recusa esses campos. Exige plano `stop-and-review-empty-initialization`, referência revisada e operador.

O plano é de **interrupção e análise**, não de restauração de dados inexistentes. Após DDL parcial,
preservar o alvo, histórico e journal; não apagar/recriar schema, não marcar migrations como aplicadas
nem repetir o fluxo inicial. Reparação ou recriação eventualmente necessárias dependem de autorização
específica. `recover-migration` só reconhece estado já integralmente concluído da mesma release/digest/
cadeia, com fingerprint novo e diff limpo, sem executar DDL.

Após as 68 migrations existe histórico e há a linha inicial de EvidenceUploadBudget. A exceção de vazio
não se aplica mais. Migrations posteriores exigem backup/restore; a ativação da aplicação mantém sua
recuperação obrigatória. O primeiro job não comprova DR de produção, RPO/RTO, restauração gerenciada,
retenção nem backup de arquivos. Ver o procedimento exato em [OCI_MIGRATIONS.md](OCI_MIGRATIONS.md#oci-deploy-071--primeira-inicialização).
