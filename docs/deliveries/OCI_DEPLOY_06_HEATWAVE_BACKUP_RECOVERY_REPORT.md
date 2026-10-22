# OCI-DEPLOY-06 — HeatWave, Backup & Disaster Recovery

## 1. Resumo executivo

**OCI-DEPLOY-06 — PARTIAL.** Validações locais aprovadas; homologação gerenciada e DR de produção pendentes. O usuário orientou expressamente continuar apenas no laboratório local. Não houve conexão, alteração ou deploy na OCI.

Foram implementados diagnóstico somente leitura com TLS estrito, contratos de ambiente/pool, backup coordenado criptografado, verificação/restore protegido, laboratório reproduzível de falhas, monitor avaliador e templates não instalados. A cadeia de 68 migrations, Prisma 6.12.0, restauração funcional, leases/fencing e uploads foram demonstrados em MySQL Community 8.4.8/26.7.0 e Oracle Linux ARM64.

O CLI de backup permanece deliberadamente limitado ao laboratório. Ativação real exige integração operacional, armazenamento externo/chaves, capacidade, observabilidade e decisões de RPO/RTO. Nenhum resultado local autoriza produção.

## 2. Baseline

| Campo | Estado confirmado |
| --- | --- |
| Repositório | `iYoNuttxD/Traceflow`, checkout `/Users/daniel/Coding/Traceflow` |
| Branch | `daniel-dev` |
| HEAD real | `4def31513bfb9d20444a7b9fb8f8b7500164c4ae` |
| HEAD anteriormente informado no pedido | `8d5096a041e671a9fa610d5a61c4b2d672587d4d`; não foi imposto por checkout/reset |
| Working tree inicial | limpo |
| Final | alterações desta entrega não commitadas; HEAD e branch preservados |
| Runtime de testes host | Node 22.23.3 / npm 10.9.9 selecionados explicitamente |
| Runtime Linux | Node 22.23.2 / Oracle Linux 9.8 aarch64 |

O shell também disponibiliza Node 26; não foi usado como baseline de aprovação. Hashes iniciais dos arquivos rastreados foram comparados ao fim para confirmar apenas as cinco modificações declaradas. Não houve reset, clean, stash, commit, push, merge, PR ou workflow remoto.

## 3. Infraestrutura

A OCI existente foi considerada conforme informações fornecidas: São Paulo, VM A1.Flex ARM64 com 2 OCPUs/12 GB, Oracle Linux 9.8, Node 22.23.2, Nginx, SELinux Enforcing, firewalld; HeatWave privado `10.20.2.25:3306`; domínio `traceflow.dev` com Cloudflare Full (strict). Esses recursos não foram acessados nem reconfirmados.

O laboratório Linux foi uma VM local exclusiva `tf06`, Oracle Linux 9.8 ARM64, 2 CPUs/4 GiB, SELinux Enforcing, sem mounts do host, chaves pessoais, agent forwarding ou portas públicas. Não é a VM OCI. Builds/dependências nativas nela usaram distribuições ARM64 verificadas.

## 4. Escopo executado

Local: leitura de entregas anteriores e código; implementação dos arquivos inventariados; MySQLs novos com CA/credenciais sintéticas; migrations e dados artificiais; backend/frontend/gates; falhas reais de processo/conexão; backup/restore; Linux ARM64; runbooks e evidências JSON.

Remoto: nenhum acesso à OCI, SSH da VM real, MySQL gerenciado, GitHub App, Cloudflare ou dados reais. Houve apenas obtenção de ferramentas/dependências públicas e consulta à documentação oficial. O usuário recusou prosseguir com a etapa gerenciada nesta execução; essa decisão foi respeitada.

## 5. Segurança de execução

`TEST_DATABASE_URL` explícito e identidade UUID/porta/schema/datadir antes dos testes persistentes. Somente loopback, portas altas e schema com identificador aleatório próprio. Bootstrap inicial de contas por mysqld próprio, sem conexão administrativa de testes. Nenhuma `.env` de desenvolvimento ou credencial preexistente foi aberta. Execuções usaram cópias de fonte pública sem `.env` e configs npm vazias próprias.

O diagnóstico gerenciado é opt-in, com alvo exato e autorização privada expirada automaticamente; não foi utilizado. Backup/restore recusam modo de produção antes de conectar. Nenhuma operação destrutiva foi executada em banco protegido. Limpeza limitada aos processos, datadirs e VM criados por esta tarefa.

## 6. Compatibilidade MySQL

| Versão efetiva | Plataforma | Resultado |
| --- | --- | --- |
| 8.4.8 Community | macOS ARM64 | cadeia 68/reexecução, DR ampliado e probes TLS/Prisma PASS |
| 26.7.0 Community | macOS ARM64 | idem + backend completo e 14 validadores PASS |
| 26.7.0 Community | Oracle Linux 9.8 ARM64 | cadeia 68/reexecução, DR ampliado, probes, Prisma e 14 validadores PASS |
| HeatWave apresentado como 26.7.0 | OCI | **PENDING**; versão SQL e parâmetros não consultados |

Evidência não implica equivalência completa de configuração Community/HeatWave. No macOS `lower_case_table_names=2`; Linux utiliza comparação sensível ao caso e foi exercitado separadamente. Engine InnoDB, TLS obrigatório, REPEATABLE-READ, UTC e sql_mode foram capturados nos JSONs de conexão. O diagnóstico registra charset/collation do servidor; schema/colunas são validados separadamente.

## 7. Prisma

Client e CLI **6.12.0**, sem alteração de dependência/lockfile. Prisma validate/generate, migrate deploy/status, queries reais e conexão estrita passaram no Linux ARM64. O diagnóstico reutiliza o cliente compartilhado; não altera a arquitetura de negócio nem executa aplicação/startup/migration para obter conexão.

A documentação Prisma v6 descreve MySQL 8.4 e opções do conector; a validação de 26.7 aqui é experimental e delimitada à baseline. [Prisma MySQL v6](https://docs.prisma.io/docs/orm/v6/overview/databases/mysql).

## 8. TLS

CA sintética confiada explicitamente, SAN/IP válido, datas e TLS da própria sessão Prisma demonstrados. Certificado expirado, identidade incorreta e CA desconhecida foram recusados tanto pelo probe Node quanto pelo Prisma (`P1011`). Porta fechada produziu `P1001`; handshake silencioso tem limite; servidor sem TLS é recusado.

CA pública futura: `/etc/pki/traceflow/mysql-ca.pem`; não usar Cloudflare Origin CA. FQDN e SAN reais continuam desconhecidos. A OCI documenta certificado do serviço/BYOC; mudança pode reiniciar o banco e está fora desta autorização. [Certificados OCI](https://docs.oracle.com/en-us/iaas/mysql-database/doc/updating-security-certificate.html).

## 9. Credenciais e permissões

Contas sintéticas separadas: diagnóstico SELECT; runtime DML; backup SELECT/SHOW VIEW; migration/restore DDL/DML limitados ao prefixo/schema próprio. DDL pelo runtime e DML pelo backup foram negados. Leitura de metadata administrativa sem permissão foi negada. Credencial inválida retornou `P1000` sem imprimir segredo.

CLI MySQL usa defaults-file privado transitório e ignora login-paths/config externa. Não há senha em argv, log, documentação ou artefatos de evidência. Contas/roles reais e mecanismo de injeção protegido continuam pendentes.

## 10. Pool

Proposta: API até 5, worker até 3, job exclusivo até 2, diagnóstico 1; total planejado 11 + reserva mínima proposta de 5, condicionado ao limite real e outros consumidores. Não foi alterado `max_connections` da OCI. Runtime valida connect 5 s, pool 10 s e socket 30 s; diagnóstico 5/5/10 s.

O laboratório testou pool limitado a 2 com terceira query recusada em cerca de 1 s (`P2024`), timeout de query em cerca de 1 s, teto de servidor 32 com `P2037`, liberação e nova conexão. Esses limites menores são apenas parâmetros do probe; não reduziram timeouts funcionais da aplicação. Saturação de produção e carga representativa permanecem não medidas.

## 11. Migrations

**68**, com `20261014090000_resumable_evidence_uploads` já existente no HEAD inicial. As 67 migrations anteriores e `migration_lock.toml` permanecem idênticas a `11eeea3`. Nenhuma migration foi criada/alterada aqui. Cadeia completa em DB vazio e reexecução passaram nas três combinações locais. Nenhuma migration no HeatWave ou DEV.

Os 14 validadores incluem LR5 audit/upgrade, cadeia vazia, LR9, LR2 legacy, S2 P1/P3/P5.1, dashboard, responsabilidade, GitHub sync/schema/liveness/actor e drift. Relatórios host e Linux contêm comando, exit code e tempo de cada execução.

## 12. Schema

Snapshot sintético: **61 tabelas e 116 FKs**. Verificados tipos, nullability/defaults, colunas, índices, charset/collation, CREATE TABLE, cadeia/checksums, contagens/hashes de linhas e anti-joins de órfãos. O restore normaliza apenas contador AUTO_INCREMENT e a redundância textual CHARACTER SET adicionada pelo dump; os atributos de charset/collation continuam comparados na metadata.

`EvidenceUpload`/`EvidenceUploadBudget` são a evolução desde OCI02. O ledger usa JSON, leases, prazos e índices de idempotência; não tem cascatas de FKs de negócio por decisão existente. Evidências confirmadas e partes ativas são verificadas por referência/hash/tamanho.

## 13. Backup MySQL

`mysqldump` da versão exata, single transaction/quick, sem lock de tabelas/tablespaces/GTID global/DROP. Somente InnoDB e objetos suportados. Captura inicia depois de quiescência declarada e identidade/grants verificados; snapshot anterior/posterior deve ser igual. DDL concorrente não é permitido. [mysqldump 26.7](https://dev.mysql.com/doc/refman/26.7/en/mysqldump.html).

O script não opera HeatWave/produção. Visibilidade de triggers/routines/events por conta restrita e drift físico devem ser conferidos no futuro preflight administrativo apropriado; invisibilidade não comprova ausência.

## 14. Backup de evidências

Inclui evidências confirmadas, ledger e partes/staging em `.uploads`, preservando nomenclatura e permissões. Rejeita links/caminhos desconhecidos e inconsistência de bytes. Não trata temporários como confirmados nem os remove para “corrigir” backup. A aplicação funcional original permanece intacta.

## 15. Backup coordenado

Exclusão mútua por flock estável, quiescência com prazo/UUID/PIDs e confirmação de escritores externos. Banco e arquivos são conferidos antes e depois da cópia e vinculados no mesmo pacote. Recibo local não equivale a controle de todos os escritores de produção.

Pendência concreta: integrar parada/graceful drain de API/worker/jobs e o lock de release `/opt/traceflow/shared/release-state/operation.lock` no adaptador real. Não concorrer backup/migration/restore/limpeza.

## 16. Criptografia

`age` 1.3.2 com destinatário X25519 sintético e verificação autenticada. Ciphertext e manifesto possuem hashes; digest esperado do manifesto precisa de origem independente confiável. Chave privada fora do destino, modo 0600. Somente o conjunto completo é publicado atomicamente.

Há plaintext temporário em scratch 0700, removido no encerramento/falha tratada. SIGKILL/pane exige procedimento de resíduo; remoção lógica não garante apagamento físico. Produção requer volume criptografado, custódia/recuperação/rotação e catálogo confiável, todos pendentes. [age 1.3.2](https://github.com/FiloSottile/age/releases/tag/v1.3.2).

## 17. Armazenamento

Destino local sintético, sem dados privados ou upload externo. Object Storage privado é candidato, não recurso criado/selecionado. Cópia apenas na VM não atende perda da VM. Confirmar tenancy, quota, consumo, custos e IAM antes de ativar. Franquias Always Free/PAYG diferem. [Free Tier OCI](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

Limite local de arquivo descompactado: 4 GiB/100 mil membros, reserva de disco. O algoritmo ainda materializa linhas por tabela e SQL de restore em memória; streaming e ensaio com volume real são requisitos para ativação operacional, não escalabilidade comprovada.

## 18. Retenção

Proposta pendente: diária, 7 diárias + 4 semanais + 3 mensais, mínimo de 3 íntegras e preservação da última ensaiada; confirmar custo/volume e privacidade. Nenhuma exclusão automática implementada. Monitor só propõe candidatos com política aprovada e recibo correspondente; cópias fixadas por padrão. Erro da tentativa atual nunca apaga backup anterior.

## 19. Restauração

Novo DB vazio e storage inexistente, identidade exata e conta limitada; verifica digest/criptografia/extração/schema antes de importar. Depois compara estruturas/dados/FKs/arquivos, publica storage atomicamente e emite receipt. Interrupção após DDL cria QUARANTINED; reexecução sobre destino utilizado é recusada, sem DROP/reset automático.

Smoke real da aplicação restaurada: login, acesso autorizado, projeto/requisito/tarefa/sprint, histórico e sync, download idêntico, consulta/retomada de upload pendente, complete idempotente, rejeição sem autenticação. Receipt de integridade sozinho mantém `applicationSmoke: PENDING`; resultado do smoke fica separado no relatório.

## 20. RPO/RTO

| Ambiente | Restore de integridade medido |
| --- | ---: |
| 8.4.8 macOS ARM64 | 4,519 s |
| 26.7.0 macOS ARM64 | 4,317 s |
| 26.7.0 Oracle Linux ARM64 | 2,283 s |

A medição inclui decriptação/importação/validação/publicação do pequeno conjunto sintético; exclui provisionamento, acesso à chave, transferência externa, aprovação, smoke e cutover. Não representa RTO de produção.

Hipótese para decisão: **RPO ≤24 h; RTO ≤4 h**. Ambos dependem de aprovação e exercício com volume/transferência/responsáveis reais. Backup restaurável antigo prova compatibilidade, não atendimento de RPO.

## 21. Manutenção Oracle

Janela histórica informada: segunda 08:18 UTC, próxima 02/11/2026 08:18 UTC / 05:18 BRT, versão/alvo 26.7.0. Não reconfirmada nem imutável. Runbook explica leitura autorizada da agenda/eventos, preparação, indisponibilidade e revalidação.

A Oracle documenta manutenção e upgrades, com política específica de Always Free; downtime standalone depende do mecanismo/pré-requisitos. Não presumir semana inteira ou zero interrupção. [Maintenance](https://docs.oracle.com/en-us/iaas/mysql-database/doc/overview-maintenance.html), [upgrades](https://docs.oracle.com/en-us/iaas/mysql-database/doc/mysql-server-upgrades.html).

## 22. Readiness e worker

Parada/reinício real do MySQL próprio: live 200, ready 503 durante falha, ready 200 após retorno; tick rejeitado e heartbeat recuperado. Run não virou sucesso falso; stale recovery e fence antigo foram testados. Avanço de relógio de 31 minutos ocorreu apenas na injeção do scheduler do teste; lease funcional permaneceu 30 minutos.

Upload interrompido entre escrita e metadata não foi confirmado indevidamente. Espera real de 92 s preservou lease original de 90 s, permitindo retomada e idempotência. Autorização e evidências confirmadas foram mantidas. Não foram adicionados retries infinitos, novos fluxos de negócio ou redução dos limites de upload. Restrição Cloudflare de 100 MB continua preservada; não houve novo teste através da Cloudflare nesta entrega.

## 23. Monitoramento

Avaliador de catálogo/idade/checksum/restore/disco e sensores de API/worker/TLS/pool/manutenção, com alerta explícito em entrada ausente/velha. Template de cinco minutos + service endurecido passou `systemd-analyze verify` no Linux local, sem instalação/start.

Pendentes: produtor protegido dos sensores, entrega de alertas/responsáveis, catálogo confiável, acesso correto por `traceflow`, bundle operacional e instalação autorizada. A receita OCI05 não empacota os novos utilitários ainda; ExecStart é contrato futuro. Monitor não decripta ou certifica recuperabilidade e nunca apaga arquivos.

## 24. Testes backend

**2048 PASS, 5 skips históricos**, 162 arquivos aprovados / 2 suites skip de migração pré-LR2. Nenhum skip novo, threshold reduzido, timeout funcional ampliado ou retry artificial.

Correção necessária em `projects-github-e9.test.js`: polling de 5 ms consumia burst em TLS e havia corrida do claim NOWAIT com a segunda solicitação coalescida. O teste agora aguarda trabalho real e usa barreira antes do claim; mantém asserts de duas respostas, mesma execução, uma chamada externa e resultado final. Runtime não foi alterado. Focado 14/14 e suíte completa passaram. Asserts TLS finais também passaram 41/41 em host e Linux.

## 25. Testes frontend

**1520 PASS**, 122 arquivos. Coverage, lint, format e build de produção com `/api` passaram em Node 22.23.3. Nenhum arquivo funcional do frontend foi alterado. Sem homologação visual/screenshot ou teste de navegação real em `traceflow.dev` nesta etapa.

## 26. Testes de backup

Nas três combinações: snapshot coordenado, criptografia, decriptação/integridade, SIGTERM real durante criptografia, preservação da cópia anterior, concorrência recusada pelo lock, grants limitados e falha de configuração de criptografia. Unitários: falta de espaço, symlinks, permissões, arquivos ausentes/corrompidos, partes pendentes e inode do lock.

O ensaio não esgotou disco real nem executou backup privado real. Processo interrompido é falha controlada; resíduo após perda de energia/SIGKILL ainda depende de procedimento operacional.

## 27. Testes de restauração

| Cenário | Resultado local |
| --- | --- |
| R01 banco vazio, R02 evidências, R03 conjunto coordenado | integridade e smoke PASS |
| R04 incompleto | recusado |
| R05 corrompido, inclusive hash externo recalculado | checksum/autenticação recusam |
| R06 chave errada | decriptação recusada |
| R07 schema incompatível | recusado antes de importar |
| R08 backup artificialmente envelhecido, schema exato | verificação PASS; idade não autoriza recuperação |
| R09 arquivo ausente | recusado |
| R10 SIGTERM após DDL real no destino novo | QUARANTINED, sem reset |
| R11 reexecução | recusada sobre destino utilizado |
| R12 destino protegido/modo produção | recusado antes de conectar |

Os JSONs contêm fases, códigos, tempos e `productionCertified: false`. R08 não representa cópia histórica real de dados. Restore gerenciado/PITR não foram ensaiados.

## 28. Segurança: resultados e limites

Proteções comprovadas: alvos explícitos, TLS obrigatório, CA/SAN/datas, grants mínimos, auth inválida, pools/timeout, lock, arquivos privados, anti-traversal/links/dispositivos/duplicados, checksum/autenticação, destino vazio e quarentena, logs sem credenciais, preservação de cópias e idempotência.

Riscos residuais: confiança no operador/recibo de quiescência, metadata limitada por privilégios, volume real/memória, scratch após crash, catálogo externo/chaves, dados sensíveis após restore autorizado, ausência de coleta/entrega de alertas. Não é certificação ASVS integral ou auditoria independente de criptografia. Segredos reais não foram acessados.

## 29. Gates

| Gate | Resultado final |
| --- | --- |
| Backend completo / frontend completo | 2048 / 1520 PASS; 5 skips antigos no backend |
| Coverage backend: statements / branches / functions / lines | 92,57 / 87,44 / 95,47 / 94,85% |
| Coverage frontend: statements / branches / functions / lines | 86,11 / 80,97 / 81,91 / 88,58% |
| Lint / format backend e frontend | PASS |
| Build frontend | PASS |
| Prisma validate / generate / migrations / status Linux | PASS |
| 14 validadores host / Linux | PASS / PASS |
| Contratos/scripts deploy | 74 testes PASS |
| CI/audit/UI policy tests | 90 PASS |
| CI contract, UI inventory, architecture | PASS |
| Dependency audit backend / frontend | 0 HIGH / 0 CRITICAL, sem exceções usadas |
| Secret scan canônico + todos novos/modificados | PASS |
| Sintaxe JS/Python/shell e templates systemd | PASS |
| git diff --check | PASS |
| GitHub Actions / Dependency Review remoto | NÃO EXECUTADO |

Backend thresholds 85/70/85/87 e frontend 50/45/40/53 foram preservados. Build do backend é interpretado; a validação nativa incluiu Prisma/argon2 ao autenticar a fixture ARM64, sem empacotar uma nova release.

Falhas encontradas durante desenvolvimento foram tratadas e não contabilizadas como PASS: primeiro mysqld morreu junto ao launcher; um probe TLS encerrava socket original e TLS duas vezes; mysqldump recusou opção de timeout não suportada; comparação inicial de DDL captou redundância de charset; fixture TLS precisou compatibilidade LibreSSL e preservação de ClientHello coalescido; teste E9 tinha a corrida descrita; porta efêmera Linux abaixo da faixa autorizada foi recusada e seleção limitada foi corrigida; um laboratório novo teve falha de startup e passou com diretório temporário curto; Node 26 não serviu para o gate de supervisor Node 22. Não houve relaxamento de guardas.

A execução do secret scan padrão dentro da cópia pública sem `.git` falhou na enumeração, como registrado em `backend-gates.json`; o scan canônico foi então executado no checkout real e passou, inclusive com seleção explícita de todos os arquivos alterados de qualquer extensão. Não foi removido esse controle. Evidências finais e tentativas não equivalentes são distinguidas no inventário JSON.

## 30. Arquivos implementados

Modificados (cinco):

- `backend/.env.production.example`: comentários de TLS/CA/pools por serviço; segredos continuam vazios.
- `backend/test/api/projects-github-e9.test.js`: sincronização determinística do teste mantendo asserções.
- `deploy/scripts/release-database.mjs`: FQDN com endereço privado aprovado, opção socket_timeout e rejeição de parâmetros duplicados; gates de produção preservados.
- `deploy/scripts/validate-service-environment.mjs`: preflight local estrito de TLS/pool/timeouts.
- `deploy/tests/test_operations.py`: ambiente sintético alinhado, URL inválida e duplicatas no bridge recusadas antes de conexão.

Criados (código e templates):

- `backend/scripts/lib/heatwave-connection.js`
- `backend/scripts/validate-oci-heatwave-connection.js`
- `backend/test/unit/heatwave-connection.test.js`
- `backend/test/unit/heatwave-tls.test.js`
- `deploy/lib/backup_contract.py`
- `deploy/scripts/backup.py`
- `deploy/scripts/backup.sh`
- `deploy/scripts/persistence-monitor.py`
- `deploy/systemd/traceflow-persistence-monitor.service`
- `deploy/systemd/traceflow-persistence-monitor.timer`
- `deploy/tests/persistence_lab.py`
- `deploy/tests/run-persistence-lab.py`
- `deploy/tests/run-connection-lab.py`
- `deploy/tests/connection-probes.mjs`
- `deploy/tests/persistence-fixture.mjs`
- `deploy/tests/persistence-interruption.py`
- `deploy/tests/persistence-outage.mjs`
- `deploy/tests/test_backup_contract.py`
- `deploy/tests/test_persistence_monitor.py`

Criados (documentação): este relatório, `docs/runbooks/OCI_HEATWAVE_HOMOLOGATION.md`, `docs/runbooks/OCI_BACKUP_RECOVERY.md`, `docs/runbooks/OCI_HEATWAVE_MAINTENANCE.md` e evidências sanitizadas em [`evidence/oci-deploy-06`](evidence/oci-deploy-06/INDEX.md). Nenhum dump, chave, credencial, log privado ou certificado foi versionado. O índice lista cada artefato e hash.

| Grupo / arquivo atual envolvido | Novo mecanismo / justificativa | Impacto e risco | Aceite / testes |
| --- | --- | --- | --- |
| `prismaClient.js`, exemplo env, preflight systemd | diagnóstico + contrato TLS/pool | preflight passa a recusar env inseguro; CA real pendente | casos positivos/negativos e Prisma real estrito |
| `release-database.mjs` | hostname validado por DNS + expectedAddress | autorizações antigas precisam revisão explícita; sem bypass dos gates | scripts/contratos locais; execução gerenciada pendente |
| `release_contract.py`, `BACKUP_RESTORE.md`, storage de evidências | backup_contract + CLI local | novo formato e recuperação isolada; memória/escritores reais pendentes | R01–R12, FKs/hashes/smoke em 3 ambientes |
| health, scheduler, ledger de upload existentes | harness de manutenção | somente teste; nenhuma mudança de lease/runtime | MySQL parado, ready503/live200, fence, retomada idempotente |
| `projects-github-e9.test.js` | barreira antes do claim e espera de trabalho real | risco de assert enfraquecido evitado por mesmos resultados/counters | 14/14 focados + suite completa |
| catálogo/observabilidade ainda ausentes | avaliador + templates | coleta/canal/empacotamento pendentes; sem deleção | 5 testes de monitor e verify systemd |
| runbooks/reports OCI anteriores | três runbooks + este relatório | nenhum efeito remoto; procedimentos dependem de revisão | rastreabilidade aos JSONs e checklists de pendências |

## 31. Bancos protegidos

DEV e schemas de teste preexistentes não receberam leitura de registros, migration, importação, reset, DROP ou seed. O endpoint OCI não foi conectado. Todos os testes persistentes desta entrega usaram instâncias/datadirs exclusivos comprovados; schemas auxiliares pertenciam ao prefixo com grants restritos. Não foi usado banco protegido como controle.

## 32. OCI

Nenhuma modificação de VM, MySQL, rede, Nginx, SELinux/firewalld, DNS, Cloudflare, certificados, GitHub App, agenda, conta/GRANT, bucket ou timer. Nenhum backup privado real, deploy, push ou workflow remoto. A página temporária não foi alterada por esta entrega; sua disponibilidade atual não foi reconfirmada. Nenhuma screenshot/evidência visual foi gerada. Documentação acadêmica e entregas anteriores preservadas.

## 33. Bloqueadores

1. **HeatWave real:** autorização de leitura, FQDN/SAN/CA confiável, UUID/versão/parâmetros, credencial restrita por mecanismo protegido. O usuário decidiu mantê-lo pendente.
2. **Backup de produção:** adaptador com coordenação systemd/escritores, lock compartilhado, metadata autorizada, streaming/limites de memória, espaço e volume representativo. CLI atual é local-only.
3. **Destino/chaves:** armazenamento externo, custos/IAM, catálogo de hashes confiável, custódia/rotação/recuperação de chave. Nada configurado.
4. **Política humana:** frequência, retenção, RPO/RTO, responsáveis e critérios de idade aceitável.
5. **Operação:** produtor de sensores, canal/escala de alertas, bundle operacional versionado, instalação/timers e ensaio independente aprovado. Sintaxe de unit não equivale a serviço funcionando.
6. **DR real:** restore em destino novo autorizado, volume/transferência/perda da VM, segredos e smoke/cutover medidos. Quotas/custos do destino devem ser confirmados; Always Free não fornece PITR.
7. **Deploy:** SMTP, GitHub App/segredos, integração Nginx/systemd, smoke pelo domínio/Cloudflare e promoção continuam dependentes da fase seguinte e autorização específica.

## 34. Próxima entrega

Primeiro revisar esta entrega e decidir destino/chaves/política e arquitetura do adaptador operacional. Depois, se autorizado, executar somente o diagnóstico HeatWave read-only com comandos previamente apresentados. Em paralelo autorizado, completar empacotamento/coordenação/streaming/coleta/alertas e ensaiar recuperação representativa. Só após fechamento desses gates preparar **OCI-DEPLOY-07 — Controlled Production Deployment & End-to-End Validation** para autorização própria.

Ordem recomendada: revisão → decisões operacionais → homologação TLS gerenciada → integração operacional e restore representativo → autorização explícita de produção → deploy controlado. Não iniciar OCI07 automaticamente nem promover a baseline por este resultado local.

## 35. Final verdict

```text
OCI-DEPLOY-06 — PARTIAL
LOCAL VALIDATION: PASS (escopo de laboratório)
HEATWAVE MANAGED VALIDATION: PENDING (decisão do usuário)
DISASTER RECOVERY READINESS: LOCAL VALIDATED / PRODUCTION PENDING
PRODUCTION DEPLOY AUTHORIZATION: NOT GRANTED
```

Os mecanismos locais foram comprovados e os riscos restantes estão registrados. Não há homologação real de conexão/backup/recuperação HeatWave, implantação ou aprovação de produção. Trabalho encerrado nesta etapa, aguardando revisão/autorização.
