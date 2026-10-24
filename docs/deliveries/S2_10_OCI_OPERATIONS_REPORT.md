# S2-10 — Operação, segurança e continuidade na OCI

**Resultado: DONE — instalação limpa protegida e operacional; TraceFlow online.**
Entrega de 20/10/2026. HTTPS público 200 com TLS válido, API pronta, MySQL acessível
por TLS privado e worker com heartbeat atual. API/worker permaneceram com os mesmos
PIDs (413284/413285), sem reinícios. Nenhuma nova publicação, migration ou execução
do controlador antigo foi realizada.

## Critérios oficiais

| Critério | Estado | Evidência concreta e limites |
| --- | --- | --- |
| 1. Logs e métricas adequados, sem exposição indevida | DONE | Access log JSON correlacionado por requestId, rota categorizada, sem query/IP/cookies; amostras API 406 linhas e worker 30 sem padrões de segredo/e-mail. Métricas de disponibilidade, latência, HTTP, MySQL, worker, backups, disco/memória em status protegido e JSONL; métricas OCI nativas disponíveis. Logs/estado privados, retenção limitada. Não constitui prova universal sobre todos os logs futuros. |
| 2. Alertas de disponibilidade, erros, latência, banco e jobs | DONE | Monitor ativo a cada minuto; HTTPS/API, MySQL, heartbeat, jobs falhos, HTTP5xx/p95, disco/memória e backup. SMTP de teste recebido e confirmado pelo operador. Alarme externo OCI habilitado, status OK, assinatura ONS ACTIVE confirmada. Não foi provocada indisponibilidade da VM. |
| 3. Firewall e conectividade MySQL de menor privilégio | DONE | NSGs e security lists reais consultados; subnet MySQL sem IP público, TCP3306 só do NSG da VM. Contas limitadas à origem privada, TLS obrigatório, backup SELECT-only, migrador bloqueado. HTTP/S de origem restritos aos CIDRs Cloudflare; SSH conserva dois /32 administrativos. IMDS HTTP/S bloqueado para UIDs dos serviços públicos. |
| 4. Backups automáticos com RPO/RTO documentados | DONE | Timer diário habilitado/ativo; captura real da mesma service cifrada, publicada e lida de volta, com hashes iguais. Bucket privado separado da VM, prefixo novo/IAM restrito, retenção 14d, alertas de falha/idade. RPO alvo 24h condicionado a sucesso diário; RTO planejado 4h, não integralmente medido. |
| 5. Restauração de banco e arquivos demonstrada | DONE | Restore real isolado em volume cifrado no Mac: 61 tabelas, 68 migrations, 116 FKs, todos os dados, um arquivo persistente e configurações conferidos; cleanup comprovado. 7,052s no ensaio, sem acesso à OCI ou destino produtivo. |
| 6. Retenção, LGPD e runbooks de incidentes | DONE | Prazos técnicos e agenda aprovados pelo responsável; módulos existentes, escopo exclusivo da instalação limpa, dry-run real com zero candidatos. Runbook cobre site/API, banco, worker, backup, restore, rollback e segredo comprometido. Não representa certificação jurídica LGPD; decisão de retenção de SyncRuns continua pendente e sem novo expurgo. |

## Instalação e proteção efetivamente aplicadas

Produção: `https://traceflow.dev`, schema `traceflow_live`, Oracle Linux 9.8 ARM64,
Node.js 22.23.2, MySQL HeatWave 26.7.0-cloud, SELinux Enforcing. Release preservada:
`20261019T011508Z-9bc3dad199566afc6fa43d67abba400665d843ea-a6eda960ef55`.

Runtime (2.252 arquivos) e admin (4.191 arquivos) conferidos contra os manifestos
imutáveis aprovados; 68 migrations intactas. Nenhuma alteração funcional,
frontend/backend, schema, GitHub App ou DNS. Nenhum commit/push nesta tarefa.

Configuração root 0600 em `/etc/traceflow-live/operations.json`; código novo em
`/usr/local/libexec/traceflow-live-ops.py`; estado root 0700 em
`/var/lib/traceflow-live-ops`. Credencial SELECT-only em systemd encrypted credential,
sem senha em argumentos, evidências ou logs. Código instalado final SHA-256:
`c0c85e392a93f0aaafc6b9be8c34497436b35848780784e41f34b2921f992a90`.

API/worker: UID dedicado, NoNewPrivileges, ProtectSystem=strict, Core=0, swap=0;
API escreve somente no storage atual. ACLs, contextos SELinux e custódia conferidos.
Contas runtime têm apenas DML no schema novo; backup apenas SELECT; migrador está
bloqueado. A auditoria SELECT/SHOW confirmou REQUIRE SSL e ausência de privilégios
globais de escrita/grant nessas contas. Credencial administrativa temporária removida.

Firewall de host: 15 redes IPv4 e 7 IPv6 oficiais Cloudflare em HTTP/S, regras
permanentes/runtime iguais, sem modificar DNS ou acesso SSH. NSG de banco aceita
3306 somente do NSG da VM; security lists não ampliam esse acesso. IMDSv2 era
acessível aos UIDs públicos; após bloqueio dirigido de TCP80/443 para
169.254.169.254, ambos recusam acesso, enquanto root instance principal, DNS e
HTTPS continuam funcionando. Nenhum reinício da aplicação foi necessário.

Verificação ASVS proporcional à operação: TLS normal/HSTS/CSP, segregação de
contas, privilégios DB, custódia/ACLs, sandbox, logs e backups cifrados. Não é uma
auditoria ASVS completa. `npm audit --omit=dev` da release: **zero vulnerabilidades
reportadas no backend e frontend** na consulta desta entrega; não cobre riscos futuros.

## Backup automático e recuperação comprovada

- Agenda: `traceflow-live-backup.timer`, **06:00 UTC / 03:00 America/Sao_Paulo**,
  diário, Persistent=true, habilitado e ativo. No último check o próximo disparo
  era 20/10/2026 06:00 UTC; o primeiro disparo automático ainda não tinha ocorrido.
- Captura usa `mysqldump --single-transaction --quick`, sem parar a produção,
  com hashes de todas as tabelas, migrations, referências de arquivos e partes
  de upload. Inconsistência de storage recusa a captura e alerta.
- Destino: bucket privado existente `traceflow-production-recovery`, região
  `sa-saopaulo-1`, prefixo **`production-live-v1/`**, separado da VM. Age com chave
  pública já custodiada; chave privada somente com o operador.
- IAM novo aprovado: `traceflow-live-backup-objects`, limitado à VM exata, bucket e
  prefixo novos, create/read/delete por retenção, sem overwrite. Política anterior
  e objetos legados preservados. A recusa IAM inicial foi resolvida por essa regra,
  sem usar o prefixo antigo como desvio.
- Retenção: 14d, preservando as duas gerações mais recentes quando existirem;
  cifrados locais 2d; limites conservadores 512MiB plaintext, bucket total <8GiB e
  1.000 requisições/mês no contador novo. Há **uma geração nova** comprovada agora.
  Nenhum ledger ou ciclo antigo foi reutilizado.

Captura: **`20261020T024406Z-113d3c23fcee4564ab7e84264b6b63ea`**.
Objeto: `production-live-v1/20261020T024406Z-113d3c23fcee4564ab7e84264b6b63ea.tar.gz.age`.
Conjunto: 218.957 bytes cifrados, dump de 1.138.164 bytes, 61 tabelas, 68 migrations,
116 FKs, um PNG de 79 bytes, 19 configurações. Captura/publicação/readback: **5,788s**.

| Conteúdo | SHA-256 |
| --- | --- |
| Cifrado, igual no readback externo | `7382b49c3ef0ccb8fd488214b562035f15ec8dc93da680923213cd142abe7a37` |
| Arquivo comprimido original | `bcc55cc2bfc04c53d48fd67cff2242d5071798bed52fea33ecfeef2640926773` |
| Manifesto interno autenticado | `f07d7a559f0d831dc8b5fb52c3e1344e3b2a7a68cacd82502f4fa2cf43b9d2f1` |
| Recibo do restore real | `b2489b65504707ce940d264b5f8b7494e0ce535871819f2562a542b059abb689` |

Restore **ISOLATED_RESTORE_PASS**, terminado em 20/10/2026 02:57:16 UTC, **7,052s**:
MySQL 26.7.0 novo no Mac, bind loopback, porta efêmera 65234, UUID distinto,
volume APFS cifrado; dados, migrations, 116 FKs, arquivo e configurações iguais.
MySQL descartável encerrado e volume removido; produção nunca foi destino.

Os dois primeiros ensaios recusaram diferenças de grafia DDL, sem diferenças nos
dados. A causa foi reproduzida nativamente: SHOW CREATE TABLE adiciona
`CHARACTER SET utf8mb4` ao restaurar uma coluna com COLLATE explícito. Aplicou-se
**exatamente o diff estreito aprovado pelo operador**: comparação da DDL inteira
ignora apenas essa grafia redundante fora de literais/comentários. Collation, tipos,
defaults, constraints e AUTO_INCREMENT continuam verificados; dados/migrations
exigem hashes exatos. `rawDdlHashesEqual=false` é registrado, não ocultado. Backup,
manifesto e hashes originais não foram alterados. Testes recusam diferenças reais.

As configurações operacionais adicionadas após essa captura (retenção/firewall/
logs e templates novos) foram incluídas no escopo das próximas capturas e estão
nos fontes/runbook. Não se atribui sua presença retroativamente ao backup de 19
configurações nem se fez nova captura redundante apenas por isso.

RPO alvo **24h** com sucesso diário; alerta se falhar ou passar de **26h**. RTO de
planejamento **4h**, condicionado a chave, código, acesso e destino disponíveis.
O ensaio de 7,052s não mede provisionamento completo, incidente, DNS ou cutover.
Procedimento reproduzível em [OCI_LIVE_OPERATIONS.md](../runbooks/OCI_LIVE_OPERATIONS.md),
com ferramentas age idênticas fixadas em diretório privado durável do Mac.

## Monitoramento, alertas e retenção

`traceflow-live-monitor.timer` ativo a cada minuto. Status protegido e métricas
JSONL registram códigos, horários/duração e limiares. Alertas: HTTPS/API/MySQL,
worker ausente ou heartbeat >90s, jobs GitHub falhos, HTTP5xx >=5 e >=5% em 5min,
p95 >2s com >=20 requisições, disco >=85%, memória disponível <10%, backup falho
ou >26h e jobs operacionais falhos. Três falhas consecutivas acionam SMTP;
OnFailure cobre falhas das units; repetição limitada a uma por código/hora.

SMTP STARTTLS: **teste recebido em danielganzmusse@gmail.com e confirmado pelo
operador**. Topic OCI `traceflow-live-operations`, assinatura EMAIL **ACTIVE**;
alarme `traceflow-live-vm-metric-absence` habilitado, status **OK**, ausência de
CpuUtilization da VM exata, pending PT5M. Cobre falha total de VM/agente sem depender
do SMTP nela. Assinatura confirmada; não se simulou queda real nem se afirma esse
ensaio de outage. IDs e transcrição sanitizada das consultas oficiais em
[native-oci-observations.json](../../build/s2-10-oci-operations/native-oci-observations.json).

Journald: 30d, máximo 512MiB persistente/128MiB volátil; logrotate Nginx e métricas
diário/30 arquivos, comprimidos e protegidos. Histórico disponível antes da mudança
preservado cifrado (272.537.587 bytes), sem expurgar o legado. As amostras conferidas
não contêm os padrões de segredos/e-mails pesquisados; não se promete ausência
universal de dados pessoais em todo erro futuro.

Retenção de domínio **explicitamente aprovada**, timer ativo **05:30 UTC / 02:30 BRT**:
sessões expiradas/revogadas 30d; tokens/states usados/expirados 7d; convites concluídos
/webhook metadata 30d; auditorias/pedidos finalizados 365d; exports/uploads expirados;
projetos já excluídos pelo usuário após carência 30d. Módulos oficiais existentes,
sem novo prazo de SyncRuns. Dry-run real com UID/sandbox da service: zero candidatos.
O apply manual imediato não foi executado: a revisão automática recusou-o por não
estar coberto pela aprovação da agenda e não haver nova elegibilidade comprovada.
A agenda aprovada foi mantida; seu primeiro disparo ainda era futuro na entrega.

## Preservação, validação e custos

**359 arquivos históricos protegidos sem alterações**; hashes do state/guard
legados iguais ao baseline, timer antigo desabilitado/inativo, sem uso de ciclos,
backups ou recoveryProof antigos. Runtime/admin imutáveis e contas antigas isolados.
Nenhuma restauração em produção, exclusão de dados ativos ou teste gigante artificial.

19 testes Python + 3 Node.js 22 direcionados: **22 PASS**. Incluem parser sem eval,
SQL/TLS, streaming/hash, referências de storage, isolamento de retenção, recusa de
arquivos/archives inseguros, proveniência e diferenças reais de DDL/dados/migrations.
Após fixar o caminho durável de age (mesmos binários/hashes), os 22 foram repetidos
com sucesso, sem novo restore ou solicitação da chave. Sintaxe, whitespace e busca
de segredos no conjunto alterado registrados em VALIDATION.json. Não se repetiram
regressões gerais, OAuth, sincronização ou upload de 100MiB da S2-09.

Nenhuma VM, banco ou bucket adicional pago criado. Reutilizados recursos existentes;
adições nativas: IAM, tópico/assinatura e alarme. **Custo incremental esperado zero
dentro das franquias disponíveis**, sem garantir a fatura global do tenant. Os
limites locais evitam expansão silenciosa; acompanhar consumo e capacidade antes
de ampliar retenção. [Franquias OCI](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

Pendências operacionais recorrentes: conferir primeiro disparo diário, manter
custódia externa da chave, revisar destinatário/limiares e repetir restore
periodicamente ou após mudança relevante. Não são resultados já observados.
Não há bloqueio técnico restante para a conclusão delimitada desta S2-10.

## Evidências e arquivos entregues

- [Última saúde/configuração instalada](../../build/s2-10-oci-operations/final-backup-config-scope-verified.json),
  [HTTPS externo](../../build/s2-10-oci-operations/final-public-https.json).
- [Backup, timers e dry-run](../../build/s2-10-oci-operations/final-readonly-operational-verified.json),
  [restore verificado](../../build/s2-10-oci-operations/restore-result-verification.json).
- [Privilégios MySQL](../../build/s2-10-oci-operations/database-security-audit-validated.json),
  [custódia/logs](../../build/s2-10-oci-operations/security-current-monitor-enabled.json),
  [restrição de IMDS](../../build/s2-10-oci-operations/public-service-metadata-isolated.json).
- [Histórico preservado](../../build/s2-10-oci-operations/final-historical-preservation.json),
  [release intacta](../../build/s2-10-oci-operations/immutable-application-pair-verified.json).
- [Inventário e hashes finais](../../build/s2-10-oci-operations/VALIDATION.json).
- Fontes: `deploy/operations/`, templates systemd, testes `deploy/tests/operations/`;
  [runbook](../runbooks/OCI_LIVE_OPERATIONS.md),
  [retenção](../privacy/DATA_RETENTION_POLICY.md).
