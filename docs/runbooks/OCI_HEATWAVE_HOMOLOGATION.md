# OCI-DEPLOY-06 — Homologação MySQL / HeatWave

## Estado e limites

Em 14/10/2026 (São Paulo), o usuário determinou: **continuar apenas no laboratório local; manter HeatWave pendente**. Os relatórios UTC podem indicar 15/10. Nenhum comando deste runbook foi executado na OCI. MySQL Community 26.7.0 isolado não representa homologação do serviço HeatWave.

Baseline: `daniel-dev`, `4def31513bfb9d20444a7b9fb8f8b7500164c4ae`. Prisma Client e CLI permanecem **6.12.0**. A arquitetura Route → Controller → Service → Repository → Prisma → MySQL permanece preservada. A instância compartilhada continua em `backend/src/database/prismaClient.js`.

Infraestrutura informada pelo usuário, sem reconfirmação remota: região `sa-saopaulo-1`, VM Oracle Linux 9.8 ARM64, 2 OCPUs / 12 GB, Node 22.23.2, MySQL privado `10.20.2.25:3306`, versão apresentada `26.7.0`. O nome DNS, SAN do certificado, CA confiável, UUID MySQL, limites efetivos e contas da instância real permanecem desconhecidos.

## Evidência e compatibilidade

Os laboratórios usam datadirs novos, porta TCP alta em loopback, schema `tf_oci_<identificador aleatório>_test`, certificados e credenciais sintéticos. `TEST_DATABASE_URL` é obrigatório; não há fallback para DEV. O bootstrap de contas ocorre por `init-file` do mysqld próprio; os testes não usam conexão administrativa. A conta root recebe uma senha aleatória não reutilizada. O harness remove os processos, dados, credenciais e chaves que criou.

| Ambiente | Demonstração desta entrega |
| --- | --- |
| macOS ARM64, MySQL 8.4.8, Node 22.23.3 | 68 migrations, backup/restore, falhas e probes Prisma/TLS |
| macOS ARM64, MySQL 26.7.0, Node 22.23.3 | idem; backend completo e 14 validadores |
| Oracle Linux 9.8 ARM64, MySQL 26.7.0, Node 22.23.2, SELinux Enforcing | idem; Prisma validate/generate, 14 validadores e testes TLS |
| OCI HeatWave | **PENDING — não conectado** |

Prisma v6 documenta MySQL 8.4; o resultado observado com 26.7 deve ser tratado como compatibilidade demonstrada para esta cadeia, versão e plataforma, sem inferir suporte oficial irrestrito. Revalidar após atualização do serviço, Prisma, engine, sistema ou schema. Os parâmetros `sslaccept`, `sslcert`, pools e timeouts são descritos na [documentação Prisma v6 de MySQL](https://docs.prisma.io/docs/orm/v6/overview/databases/mysql).

## TLS, CA e identidade

1. Obter o FQDN e as informações de conexão/certificado da instância, por leitura autorizada. A OCI documenta essas informações em [DB System details](https://docs.oracle.com/en-us/iaas/mysql-database/doc/viewing-db-system-details.html).
2. Obter a cadeia pública por canal confiável e verificar emissor, validade e SAN. Não confiar automaticamente na CA apresentada pelo próprio endpoint. Um hostname local que aponta para o IP não corrige SAN incompatível.
3. Usar o nome coberto pelo certificado e resolver exclusivamente para o endereço privado aprovado. Conexão pelo IP somente se o certificado cobrir explicitamente esse IP.
4. Instalar futuramente apenas a CA pública em `/etc/pki/traceflow/mysql-ca.pem`, legível pelo serviço, sem escrita pelo serviço. Este caminho fica fora de `/etc/traceflow`, ocultado pelos units de runtime. Nenhum certificado foi instalado nesta etapa.
5. Exigir `sslaccept=strict` no Prisma, e `VERIFY_IDENTITY` no cliente MySQL. Nunca solucionar erro com `accept_invalid_certs`, TLS desabilitado ou CA da Cloudflare.

A CA do Nginx/Cloudflare Origin protege outra conexão. A documentação atual permite certificado gerenciado pelo serviço ou BYOC, e informa reinicialização ao alterá-lo; verificar disponibilidade e restrições da instância real antes de propor qualquer mudança. A [documentação de certificados OCI](https://docs.oracle.com/en-us/iaas/mysql-database/doc/updating-security-certificate.html) é mais recente que o [troubleshooting de 2023](https://docs.oracle.com/en-us/iaas/mysql-database/doc/troubleshooting-networking.html), que descreve certificado autoassinado. Não assumir qual deles está configurado.

O diagnóstico executa um handshake MySQL STARTTLS com Node para validar cadeia, SAN e datas; depois abre a conexão com o Prisma canônico e verifica `Ssl_cipher` e `Ssl_version` da própria sessão. O teste separado não é usado como substituto do TLS do Prisma. No laboratório macOS, Node negociou TLS 1.3 e Prisma TLS 1.2; ambos estritos. CA desconhecida, certificado expirado e SAN incorreto foram recusados também pelo Prisma real, com `P1011`.

## Contas, privilégios e segredos

| Papel | Contrato proposto |
| --- | --- |
| API / worker | `SELECT, INSERT, UPDATE, DELETE` somente no schema da aplicação; contas separáveis por serviço; sem DDL/global/FILE/GRANT OPTION |
| Diagnóstico | `SELECT` no schema aprovado, consulta de variáveis/sessão e próprios grants; sem leitura de registros de negócio pelo script |
| Backup | `SELECT` e, se necessário, `SHOW VIEW`, somente no schema aprovado; sem escrita/DDL/admin |
| Migration / restore | identidade separada, DDL/DML estritamente no destino autorizado; fornecida somente ao job controlado |

O validador de grants recusa privilégios excessivos, outro schema e roles não resolvidas; não presume direitos indiretos. A conta de diagnóstico precisa de SELECT no schema mesmo quando ele ainda está vazio. A migração nunca deve reaproveitar a credencial de runtime.

Nenhuma conta real foi criada ou inspecionada. URLs completas, senhas, chaves e arquivos de autorização ficam fora do Git e dos logs. Percent-encode das credenciais na URL é obrigatório. Usar um launcher protegido para injeção; não usar URL em argv, histórico de shell ou `set -x`. CA pública não é segredo. Arquivos privados: caminho absoluto real, usuário correto e modo 0600; diretório protegido. Não ler `.env` de desenvolvimento para obter credenciais.

## Pool, timeouts e orçamento inicial

| Processo | `connection_limit` | `connect_timeout` | `pool_timeout` | `socket_timeout` |
| --- | ---: | ---: | ---: | ---: |
| API (um processo) | até 5 | 5 s | 10 s | 30 s |
| Worker (um processo) | até 3 | 5 s | 10 s | 30 s |
| Diagnóstico | 1 | 5 s | 5 s | 10 s |
| Job de administração | orçamento até 2, exclusivo de backup/migration | explícito | explícito | compatível com a operação |

Planejar 8 conexões de runtime + 2 de job + 1 de diagnóstico = **11**, com reserva operacional mínima proposta de 5, sem contar conexões internas/terceiros. Só adotar se o limite real disponível suportar pelo menos 16 e houver margem observada. Isso é orçamento, não alteração do servidor nem recomendação de elevar `max_connections`. Não replicar API/worker sem recalcular os pools. Backup coordenado para os escritores, reduzindo concorrência; não habilitar jobs simultâneos.

`validate-service-environment.mjs` passa a recusar TLS permissivo, CA em outro caminho, pools acima desses limites, timeout ausente/zero e parâmetros desconhecidos/duplicados. Cada `api.env` e `worker.env` futuro deve conter sua própria URL. `.env.production.example` mantém segredos vazios.

Readiness mantém o limite de 2 s existente, menor que os timeouts SQL. Consultas SQL podem terminar depois da resposta de readiness; a deduplicação existente impede acumulação ilimitada de probes. `wait_timeout` do servidor não foi alterado. Prisma reconecta conforme seu comportamento existente; não foi adicionado retry infinito. Medir conexões ociosas, concorrência de sync e latência antes de ajustar orçamento/timeouts. O laboratório testou saturação do pool (`P2024`), do servidor (`P2037`), liberação das conexões e timeout de query, sem alterar defaults funcionais da aplicação.

## Diagnóstico somente leitura

Arquivo: `backend/scripts/validate-oci-heatwave-connection.js`.

Entradas obrigatórias:

- `--authorization`: JSON 0600, `formatVersion: 1`, `operation: diagnose-read-only`, validade inferior a 24 h, papel e alvo exatos.
- Modo `local-isolated`: `TEST_DATABASE_URL`, host `127.0.0.1`, porta alta, schema sintético, UUID e datadir conhecidos.
- Modo `oci-read-only`: `HEATWAVE_DIAGNOSTIC_DATABASE_URL`, autorização explícita com `approved: true`, `target.expectedAddress: 10.20.2.25`, FQDN/porta/schema/usuário/UUID/versão exatos. Este modo **não foi executado**.
- Qualquer `DATABASE_URL` herdada é recusada. A URL deve conter os seis parâmetros da linha de diagnóstico da tabela, além da CA absoluta e `sslaccept=strict`.

`--validate-only` valida o contrato e os arquivos sem abrir conexão; não comprova TLS ou autenticação. O diagnóstico completo tem limite total de 30 s, handshake de 5 s e desconecta o Prisma no encerramento. Em sucesso imprime versão, parâmetros não sensíveis, grants normalizados, TLS e orçamento; em falha imprime apenas código sanitizado.

Consultas exatas do diagnóstico: identidade (`DATABASE()`, UUID, porta, datadir, `VERSION()`), `SHOW SESSION STATUS` de TLS, `SHOW GRANTS FOR CURRENT_USER`, variáveis de engine/sql_mode/isolation/timezone/charset/collation/case/limites e `SELECT 1`. Não consulta registros, executa migrations ou escreve no banco.

O UUID deve vir de uma leitura autorizada independente; a OCI pode não exibi-lo no console. Se faltar, preparar primeiro a consulta abaixo com uma conta restrita, configuração protegida e CA/FQDN previamente validados, e apresentar o comando resolvido para autorização. **Não executar agora.**

```bash
mysql --defaults-file="$DIAG_CLIENT_FILE" --no-login-paths \
  --protocol=TCP --ssl-mode=VERIFY_IDENTITY --ssl-ca="$MYSQL_PUBLIC_CA" \
  --connect-timeout=5 --batch --skip-column-names \
  --execute='SELECT DATABASE(), @@server_uuid, @@port, VERSION();'
```

Após autorização específica, o launcher protegido poderá fornecer exclusivamente a variável de diagnóstico ao comando:

```bash
env -u DATABASE_URL -u TEST_DATABASE_URL \
  node backend/scripts/validate-oci-heatwave-connection.js \
  --authorization "$HEATWAVE_AUTHORIZATION_FILE"
```

Não fornecer credenciais no chat. Esta documentação não autoriza SSH, conexão remota, acesso a segredos, criação de usuário, GRANT, backup real ou alteração de certificado.

## Migrations e schema

São **68 migrations**, incluindo `20261014090000_resumable_evidence_uploads`. As 67 anteriores permanecem byte a byte intactas em relação a `11eeea3`. A nova migration já estava na baseline desta entrega; nenhum SQL ou schema Prisma foi modificado aqui.

O ledger inclui `EvidenceUpload` (JSON de partes, lease, idempotência, prazos, execução) e `EvidenceUploadBudget`. A ausência de FKs de negócio nesse ledger é intencional para permitir recuperação/limpeza após exclusões; não adicionar cascatas. Os ensaios validam 61 tabelas e 116 relações FK no snapshot sintético, índices, colunas, charset/collation, hashes de dados e anti-joins de órfãos.

Cadeia vazia + reexecução, 14 validadores e drift passam. Os validadores criam/removem apenas schemas derivados no mysqld descartável cujo usuário possui privilégios no prefixo exclusivo. Nenhum validador persistente aceita fallback de `TEST_DATABASE_URL`.

O preflight futuro continua condicionado a TLS gerenciado, restore ensaiado e autorização de deploy. `release-database.mjs` agora aceita FQDN coberto pelo certificado com resolução para o IP aprovado e exige `target.expectedAddress` e recusa parâmetros de conexão duplicados. Não alterar o registro de autorização antigo silenciosamente. Não há migration no startup da API ou worker.

## Reprodução local

Prerequisitos: Node 22, dependências instaladas por lockfile em checkout/cópia sem `.env`, MySQL Community da versão exata e arquitetura correta, OpenSSL, Python 3 e `age` 1.3.2 verificado. Os argumentos abaixo são caminhos públicos das ferramentas, sem credenciais.

```bash
python3 deploy/tests/run-connection-lab.py \
  --mysql-base "$MYSQL_LAB_BASE" --version 26.7.0 \
  --node "$NODE22_EXECUTABLE" --report "$LOCAL_REPORT_PATH"

python3 deploy/tests/run-persistence-lab.py \
  --mysql-base "$MYSQL_LAB_BASE" --version 26.7.0 \
  --node "$NODE22_EXECUTABLE" --age "$AGE_EXECUTABLE" \
  --report "$LOCAL_DR_REPORT_PATH"
```

Repetir com 8.4.8 e seu binário correspondente. O harness cria os alvos, valida identidade e os remove; não aceita URL de banco fornecida pelo operador. Não apontar diretórios de ferramenta para conteúdo não verificado. Para o ensaio Linux, usar VM descartável própria sem mounts do host, chaves pessoais ou portas públicas.

## Critérios de homologação gerenciada

Permanecem pendentes: autorização para comandos exatos; mecanismo protegido de credenciais; FQDN/CA/SAN; UUID e versão reais; privilégios e parâmetros; pool agregado disponível; diagnóstico Prisma TLS na instância; readiness pelo runtime de produção. Após manutenção, repetir essas verificações e comparar versão/CA/grants. Qualquer divergência bloqueia a promoção até investigação; não aceitar certificado inválido nem modificar a OCI automaticamente.

Evidências e classificação: [relatório OCI06](../deliveries/OCI_DEPLOY_06_HEATWAVE_BACKUP_RECOVERY_REPORT.md). Procedimento de manutenção: [OCI_HEATWAVE_MAINTENANCE.md](OCI_HEATWAVE_MAINTENANCE.md).
