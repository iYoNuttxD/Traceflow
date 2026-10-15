# OCI-DEPLOY-06 — Manutenção e recuperação do HeatWave

## Estado observado e autorização

A informação abaixo foi fornecida pelo usuário como observação anterior do console; não foi reconfirmada nesta entrega:

| Campo histórico | Valor observado |
| --- | --- |
| Janela | segunda-feira, 08:18 UTC |
| Próxima manutenção | 02/11/2026, 08:18 UTC / 05:18 Brasília |
| Schedule type | Regular |
| Version preference / track | Oldest / Follow |
| Versão / alvo anunciado | 26.7.0 / 26.7.0 |
| Maintenance-disabled window | opção desabilitada |

Esses valores são históricos e podem mudar. Não representam uma semana de indisponibilidade nem garantia de zero downtime. Nenhuma janela foi alterada; nenhuma conexão OCI foi feita. O usuário limitou a execução ao laboratório local.

A documentação atual informa início de manutenção dentro de até duas horas da janela prevista e tratamento de upgrades específico do Always Free. Reconciliar a preferência histórica “Oldest” com a política efetiva da instância; não prometer que permanecerá em 26.7. [Maintenance overview](https://docs.oracle.com/en-us/iaas/mysql-database/doc/overview-maintenance.html), [MySQL server upgrades](https://docs.oracle.com/en-us/iaas/mysql-database/doc/mysql-server-upgrades.html).

A instância standalone pode sofrer interrupção. Near-zero downtime depende de critérios e configuração; não inferir sua disponibilidade pelo estado Active. [Standalone maintenance](https://docs.oracle.com/en-us/iaas/mysql-database/doc/maintenance-standalone-db-system.html).

## Conferir a janela e a versão

Por leitura remota posteriormente autorizada, consultar DB System → Maintenance e Connections; registrar UTC da consulta, janela, próximo evento, versão corrente/alvo, track e mensagens da Oracle. Conferir Work Requests e Events no período. Não salvar screenshots ou dados sensíveis. Não executar update/reschedule/restart.

Antes de qualquer conexão SQL, preparar os comandos exatos e o contrato de TLS/identidade conforme [OCI_HEATWAVE_HOMOLOGATION.md](OCI_HEATWAVE_HOMOLOGATION.md). Não obter CA privada do Nginx nem usar conexão sem validação. Registrar a versão pelo servidor, não apenas o rótulo do console.

## Antes da manutenção

1. Definir responsável operacional e janela de acompanhamento. Não instalar cron/timer nem prometer alerta sem canal configurado.
2. Conferir versão/UUID/CA/SAN/grants, pool agregado, disco, readiness, heartbeat, execução GitHub ativa e estado dos uploads por leituras autorizadas.
3. Confirmar conjunto coordenado recuperável, idade aceitável, chave disponível fora do destino, digest confiável e último restore com smoke. Backup automático do MySQL sozinho não cobre evidências da VM.
4. Se houver versão alvo nova, ensaiar migrations, queries, TLS, Prisma, upload e DR em ambiente isolado dessa versão. Não atualizar Prisma ou migrations históricas preventivamente.
5. Evitar deploy, migration, limpeza de uploads e backup coordenado simultâneos. Usar exclusão mútua operacional; agendar backup antes da janela e com folga medida.
6. Preparar manutenção/graceful stop conforme estratégia aprovada. Não encerrar jobs à força ou apagar leases para acelerar o procedimento. Preservar referência da release e timestamps.

Não existe autorização implícita para criar backup real ou alterar o serviço. Se não houver cópia recuperável, destino ou responsável, registrar bloqueio e escalar antes de qualquer promoção.

## Durante indisponibilidade

- `/health/live` deve continuar 200 enquanto o processo responde; falha externa de banco não implica processo morto.
- `/health/ready` deve retornar 503 dentro do orçamento existente. Não substituir por 200 fixo ou elevar timeout sem causa.
- Esperar erros controlados de operações dependentes do banco; não confirmar sucesso fictício. Não acrescentar loop infinito de reconexão.
- Observar tentativas, heartbeat e logs sanitizados do worker. Leases e fencing continuam válidos; não iniciar workers paralelos para compensar uma falha de banco.
- Preservar upload ledger, partes e evidências confirmadas. Uma parte gravada no filesystem cuja atualização no banco falhou pode precisar de retransmissão após lease expirar; não promovê-la manualmente nem apagar evidências já referenciadas.
- Registrar duração e códigos, nunca URL completa, SQL com dados privados, headers de autenticação ou credenciais.

Se a interrupção exceder a janela operacional definida, verificar eventos da Oracle e estado real com leituras autorizadas. Não presumir corrupção, forçar migration, resetar banco ou restaurar em cima do schema atual.

## Depois da manutenção

1. Confirmar endpoint, UUID, versão efetiva e configuração; investigar divergência antes de reabrir escritores.
2. Revalidar CA, SAN, datas e TLS do Prisma. Alteração de certificado exige investigação/cadeia confiável; nunca usar modo permissivo.
3. Conferir schema/ledger e metadata de forma somente leitura. Os validadores que criam schemas são **somente de laboratório**; não rodá-los no HeatWave.
4. Conferir readiness, storage e ausência de órfãos por procedimento aprovado. Leituras de dados reais adicionais dependem de escopo específico.
5. Conferir heartbeat, runs QUEUED/RUNNING/stale e fencing. Deixar o reconciliador canônico recuperar execuções vencidas; não marcar SUCCEEDED manualmente.
6. Conferir autorização/download de evidências e retomar uploads por endpoints canônicos, respeitando lease e TTL. Smoke mutável com contas reais exige autorização própria.
7. Só retomar releases/migrations/backups depois de estabilidade demonstrada. Se a versão mudou, executar laboratório correspondente antes de concluir compatibilidade.
8. Registrar achados, duração, alertas e decisão; revisar RPO/RTO à luz de dados medidos.

## O que foi demonstrado no laboratório

MySQL 8.4.8 e 26.7.0 em macOS ARM64 e 26.7.0 em Oracle Linux ARM64 foram parados/reiniciados de verdade, com API/worker usando Prisma real e certificados sintéticos.

- Readiness passou de 200 para 503; liveness permaneceu 200.
- Tick de worker falhou durante a parada; após retorno, o heartbeat foi persistido novamente.
- Run em andamento não foi confirmado falsamente; recuperação stale foi exercitada e uma escrita com fence vencido foi rejeitada.
- O relógio injetável do scheduler avançou 31 minutos apenas no teste para exercitar o lease original de 30 minutos. Não houve alteração do timeout de produção nem espera real de 30 minutos.
- O upload ficou interrompido após escrita de bytes e antes do commit de metadata. O teste aguardou **92 segundos reais**, preservando o lease original de 90 segundos, retomou a parte, finalizou duas vezes sem duplicar e manteve autorização.
- Partes confirmadas e arquivos de evidências permaneceram íntegros; nenhuma consulta externa ao GitHub ou SMTP real foi feita.
- Credencial inválida, porta fechada, CA desconhecida, SAN incorreto, certificado expirado, pool esgotado e limite de conexões foram testados em processos próprios. A conexão voltou após liberar o orçamento/restaurar o certificado.

Esses resultados não medem a duração de uma manutenção Oracle nem validam a tenancy, service units, NSG, firewalld ou SELinux da VM real.

## Alertas e resposta

| Sinal | Critério inicial proposto | Resposta |
| --- | --- | --- |
| API morta | liveness falha em probes consecutivos | investigar processo/host; preservar logs |
| Banco/storage indisponível | readiness 503 persistente | conferir MySQL/TLS/storage, sem migration automática |
| Worker sem heartbeat | idade acima do contrato e tolerância operacional | conferir processo, pool e lease; não duplicar worker |
| Pool pressionado | erro P2024/P2037 ou orçamento excedido | identificar consumidores e query lenta antes de ampliar |
| Backup velho/ausente/corrompido | idade > frequência + tolerância ou checksum inválido | preservar cópias boas; suspender promoção |
| Restore não ensaiado | ausência de recibo válido ou idade excessiva | agendar ensaio isolado |
| Disco baixo | limiar aprovado antes da reserva mínima | conter coleta; não apagar evidência/backup automaticamente |
| Certificado próximo do vencimento | proposta: alerta 30 dias, escalada 7 dias | planejar rotação e revalidação autorizadas |
| Versão/agenda mudou | diferença em inventário autorizado | revisar ensaio e janela operacional |

Os valores devem ser aprovados e calibrados. Monitor local gera códigos/exit status; coletor e canal externo permanecem pendentes. Templates de timer estão preparados, sem instalação. Falta de sensores gera alerta, não saúde fictícia.

Incidente grave: preservar origem e última cópia validada, conter escritores pelo procedimento aprovado, identificar responsável/custodiante e restaurar somente em novo destino autorizado. Não usar rollback de symlink para reverter schema incompatível. Consultar [OCI_BACKUP_RECOVERY.md](OCI_BACKUP_RECOVERY.md), que distingue integridade de restauração, smoke e autorização de cutover.

## OCI06.1 — identidade TLS e sensores pendentes

O operador informou certificado ativo `traceflow-mysql-tls-test-2026`/User defined/Imported X.509,
FQDN `traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com`, IP10.20.2.25 e CA TraceFlow Internal
Root CA. Handshake OpenSSL estrito: PASS manual; Prisma gerenciado: PENDING. Não há reconfirmação
da janela histórica de manutenção. Ver [identidade/fingerprint e incidente BYOC](OCI_HEATWAVE_HOMOLOGATION.md#oci-deploy-061--atualização-de-15102026).

A validade15/10/2026–14/10/2031 pertence à CA; não usar2031 como vencimento do certificado servidor.
Após rotação/manutenção, obter leaf notAfter por leitura autorizada, comparar FQDN/SAN/CA/UUID/versão,
validar autenticação/grants e TLS da sessão Prisma, readiness e heartbeat. Revalidar trust por canal
independente; nunca recuperar/aceitar CA automaticamente do endpoint. Instalação da CA exige lote
separado autorizado; rotação diferente é recusada pelo preparador conservador. Incidente HTTP500 com
PKCS#8 cifrada foi correlação informada, não diagnóstico confirmado da causa interna Oracle.

| Sinal necessário | Estado do avaliador OCI06 | Trabalho operacional restante |
| --- | --- | --- |
| Certificado perto do vencimento | certificateRemainingDays avaliado | coletar leaf/CA separadamente, indicar qual venceu; não existe coletor |
| TLS falhou / CA mudou | sem campos específicos; readiness agrega falhas | adicionar sensores tlsVerified/caFingerprintChanged e identidade aprovada, sem bypass |
| Autenticação falhou | sem discriminação própria | classificar código sem log de credencial |
| Banco indisponível | readiness agregado | coletor com deadline que distingue DB/storage/config |
| Pool saturado | poolBudgetExceeded avaliado | coletar P2024/P2037, consumidores e limite aprovado |
| Readiness degradada | readiness/liveness avaliados | coletor protegido e canal de alerta |
| MySQL mudou de versão | maintenanceReviewRequired genérico | comparação explícita VERSION()/UUID e baseline aprovada |
| Falha backup/restore | catálogo/checksum/idade/receipt | bundle operacional, coleta e restore representativo |
| Worker sem heartbeat | workerHeartbeatFresh avaliado | coleta somente leitura, responsável e entrega de alerta |

Nenhum desses alertas está operacional por existir uma função avaliadora ou timer. Inputs ausentes
já alertam, mas coleta e delivery seguem pendentes; falha do coletor/canal precisa de observador
independente. Não instalar timer, mudar IAM ou criar Object Storage nesta etapa. RPO≤24h/RTO≤4h
continuam propostas não aprovadas. Não repetir restore local como substituto de DR gerenciado.
