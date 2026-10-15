# OCI-DEPLOY-06 — Homologação MySQL / HeatWave

## Estado e limites

Em 14/10/2026 (São Paulo), o usuário determinou: **continuar apenas no laboratório local; manter HeatWave pendente**. Os relatórios UTC podem indicar 15/10. Nenhum comando deste runbook foi executado na OCI. MySQL Community 26.7.0 isolado não representa homologação do serviço HeatWave.

Baseline: `daniel-dev`, `4def31513bfb9d20444a7b9fb8f8b7500164c4ae`. Prisma Client e CLI permanecem **6.12.0**. A arquitetura Route → Controller → Service → Repository → Prisma → MySQL permanece preservada. A instância compartilhada continua em `backend/src/database/prismaClient.js`.

Infraestrutura informada pelo usuário, sem reconfirmação remota: região `sa-saopaulo-1`, VM Oracle Linux 9.8 ARM64, 2 OCPUs / 12 GB, Node 22.23.2, MySQL privado `10.20.2.25:3306`, versão apresentada `26.7.0`. Na OCI06 esses dados ainda não estavam disponíveis. A atualização OCI06.1 ao final incorpora FQDN/SAN/CA informados pelo operador; UUID, limites e contas continuam pendentes.

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

Readiness mantém o limite de 3 s existente, menor que os timeouts SQL. Consultas SQL podem terminar depois da resposta de readiness; a deduplicação existente impede acumulação ilimitada de probes. `wait_timeout` do servidor não foi alterado. Prisma reconecta conforme seu comportamento existente; não foi adicionado retry infinito. Medir conexões ociosas, concorrência de sync e latência antes de ajustar orçamento/timeouts. O laboratório testou saturação do pool (`P2024`), do servidor (`P2037`), liberação das conexões e timeout de query, sem alterar defaults funcionais da aplicação.

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

## OCI-DEPLOY-06.1 — atualização de 15/10/2026

Origem dos fatos remotos: **relato do operador**, não consulta do Codex. A classificação histórica
OCI06 permanece PARTIAL. Nesta continuação: TLS SERVER VALIDATION PASS (operador), PRISMA MANAGED
VALIDATION PENDING, HEATWAVE MANAGED PARTIAL, DR PRODUCTION PENDING. Nenhum SSH/SQL/console OCI
foi acessado; não houve migration, bootstrap de schema/contas, backup real ou instalação remota.

| Item | Informação fornecida / limitação |
| --- | --- |
| VM | traceflow-app; hostname observado traceflowapp; Oracle Linux 9.8 ARM64 |
| Banco | traceflow-mysql, MySQL.Free, Active, versão apresentada 26.7.0 |
| FQDN | `traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com` |
| Endereço | `10.20.2.25:3306`, privado |
| Certificado ativo | `traceflow-mysql-tls-test-2026`, User defined, Imported X.509 |
| Emissor | TraceFlow Internal Root CA |
| Identidade / uso | DNS acima e IP 10.20.2.25; RSA 4096/SHA-256; CA:FALSE; Digital Signature, Key Encipherment, TLS Web Server Auth |
| CA pública | `/home/opc/traceflow-ca.crt`; subject C=BR, O=TraceFlow, CN=TraceFlow Internal Root CA |
| Validade da CA | 15/10/2026 a 14/10/2031; **validade do certificado servidor ainda não fornecida** |
| Fingerprint SHA-256 DER da CA | `2E:AE:E0:E2:06:74:1B:F8:1B:65:1F:1A:E3:3F:44:F0:A9:29:49:ED:6A:99:13:7A:4A:A8:B0:01:34:86:D2:95` |
| Aplicação/dados | sem aplicação/dados de negócio em produção e sem cadeia aplicada, conforme operador; existência/nome de schema não confirmados |
| Ainda desconhecido | VERSION() SQL, UUID, schema, contas, grants, plugin de autenticação e parâmetros efetivos |

O recurso anterior `traceflow-mysql-tls-2026` usava chave PKCS#8 cifrada com AES-256-CBC,
PBKDF2/HMAC-SHA256. O operador relatou UPDATE_DBSYSTEM/HTTP 500 / InternalError, Audit begin 204,
GetCertificateBundleWithPrivateKey 200 e end 500. Um segundo recurso com o mesmo certificado e
chave PKCS#8 não cifrada foi aplicado com sucesso. Isso é **correlação operacional observada**;
não demonstra a causa interna da Oracle nem autoriza recriar certificados, alterar IAM ou ler
chaves. A aplicação precisa somente da CA pública. Chaves reais não foram acessadas.

### Evidência OpenSSL fornecida pelo operador

```bash
openssl s_client -starttls mysql \
  -connect traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com:3306 \
  -servername traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com \
  -CAfile /home/opc/traceflow-ca.crt \
  -verify_hostname traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com \
  -verify_return_error -brief < /dev/null
```

Resultado relatado: conexão a 10.20.2.25, TLSv1.3, TLS_AES_128_GCM_SHA256, Verification OK,
Verified peername igual ao FQDN, assinatura RSA-PSS/SHA256 e chave temporária X25519 (253 bits).
Comprova handshake/identidade no momento da execução manual. Não comprova autenticação SQL,
grants, pool, schema, migrations, runtime ou TLS de uma sessão Prisma. Não foi repetido pelo Codex.

### Interpretação de TLS na versão exata

Client/CLI permanecem 6.12.0. O parser do conector Rust habilita TLS ao receber `sslcert` ou
`sslaccept`; `sslcert` configura uma raiz de confiança, e `strict` desliga aceitação de certificados
inválidos. A checagem de hostname permanece habilitada. `sslidentity` é identidade de cliente e
não é necessária neste contrato. Não confiar no default permissivo nem em opção escrita errada.
Fonte: [parser 6.12.0](https://github.com/prisma/prisma-engines/blob/6.12.0/quaint/src/connector/mysql/url.rs),
[conector nativo](https://github.com/prisma/prisma-engines/blob/6.12.0/quaint/src/connector/mysql/native/mod.rs).
O [driver fixado no lockfile](https://github.com/prisma/mysql_async/blob/c4c841c9d03e361df7377264a075335a823534ee/src/conn/mod.rs)
recusa ausência de capacidade TLS antes da resposta de autenticação. Os testes locais exercitam
CA desconhecida, certificado expirado, SAN inválido e servidor sem TLS com o Client real.

O fingerprint é da **CA em DER**, não do arquivo PEM e não do certificado servidor. A verificação
do arquivo não equivale a pinning de cada certificado de conexão do pool. O Prisma usa o backend
TLS nativo; não há alteração do trust store global. O probe Node verifica a cadeia contra a CA
explícita, e depois o diagnóstico confere TLS da própria sessão Prisma, separadamente.

### Preparar a CA — procedimento futuro, NÃO EXECUTADO na OCI

Novo preparador: `deploy/scripts/prepare-mysql-ca.py`, biblioteca existente `release_contract.py`.
Executar a partir de um bundle operacional público revisado, root-owned e com digest aprovado.
O empacotador OCI05 ainda não distribui este utilitário nem o diagnóstico: resolver o bundle antes
da execução remota, sem copiar node_modules de DEV. Confirmar `/etc/pki` existente e os ancestrais
reais. O preparador rejeita links, pais graváveis, CA diferente, arquivo privado e sobrescrita.
Ele valida um único certificado raiz público, assinatura, validade e fingerprint; plano é o default.

Comandos de instalação que precisarão de autorização própria (o diretório de execução do bundle
é um dado ainda pendente; os argumentos da CA abaixo são definitivos):

```bash
sudo python3 deploy/scripts/prepare-mysql-ca.py \
  --source /home/opc/traceflow-ca.crt \
  --expected-sha256 2eaee0e206741bf81b651f1ae33f44f0a92949ed6a99137a4aa8b0013486d295
# Somente após aprovação específica do plano:
sudo python3 deploy/scripts/prepare-mysql-ca.py \
  --source /home/opc/traceflow-ca.crt \
  --expected-sha256 2eaee0e206741bf81b651f1ae33f44f0a92949ed6a99137a4aa8b0013486d295 --apply
sudo restorecon /etc/pki/traceflow /etc/pki/traceflow/mysql-ca.pem
sudo matchpathcon -V /etc/pki/traceflow/mysql-ca.pem
sudo -u traceflow test -r /etc/pki/traceflow/mysql-ca.pem
sudo -u traceflow test ! -w /etc/pki/traceflow/mysql-ca.pem
```

Destino fixo: diretório root:root 0755, arquivo root:root 0644; leitura pública de uma CA pública,
escrita somente administrativa. Sem `update-ca-trust`, sem cópia de chave, sem reload/start de
serviços. `ProtectSystem=strict` reforça a proibição de escrita; `ProtectHome=yes` explica por
que `/home/opc` não serve como path operacional. `/etc/traceflow` continua inacessível ao runtime.
Não ampliar ReadWritePaths nem rotular CA como conteúdo Nginx. No laboratório OL9.8, o contexto
padrão conferido por restorecon/matchpathcon foi `cert_t`, com Enforcing durante o ensaio.

Guardar stdout JSON do plano/aplicação em área administrativa 0700/arquivo 0600, com UTC, digest do
utilitário e aprovação. Reexecução idêntica retorna UNCHANGED e conserva inode/mtime. Conteúdo
preexistente diferente exige plano de rotação separado. Reversão de primeira instalação: manter
serviços consumidores parados; conferir recibo `created=true`, inode e fingerprint ainda idênticos;
remover somente o arquivo recém-criado e, se vazio e criado nessa instalação, seu diretório. Não
remover CA preexistente; não tocar fonte, trust store ou outros arquivos. Preparar os comandos de
reversão resolvidos e sua autorização antes de aplicar. Uma falha parcial não autoriza limpeza ampla.

### Bootstrap de identidade sem inventar schema

Faltam alias SSH, nome de conta diagnóstica, caminho de configuração protegida MySQL, schema
existente (se houver), caminho do launcher/bundle e identidade Unix operacional. Informar somente
nomes/caminhos; nenhum segredo deve ser enviado no chat. Sem esses dados e autorização, tudo abaixo
é **procedimento preparado**, não bloco final liberado para execução. Substituir cada parâmetro
por valor revisado e apresentar novamente os comandos resolvidos antes de qualquer conexão.

Conta bootstrap já existente: SELECT restrito no schema aprovado, ou somente USAGE/variáveis
próprias se ainda não existir schema. Nenhum CREATE/GRANT faz parte do diagnóstico. Configuração
MySQL 0600 deve ter host/port/user/password fornecidos por mecanismo protegido; sem database se
schema ainda desconhecido. O hostname/porta/TLS são fixados novamente no comando, sem senha em argv.

```bash
timeout --signal=TERM --kill-after=5s 20s \
  mysql --defaults-file="$DIAG_CLIENT_FILE" --no-login-paths --protocol=TCP \
  --host=traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com --port=3306 \
  --ssl-mode=VERIFY_IDENTITY --ssl-ca=/etc/pki/traceflow/mysql-ca.pem \
  --tls-version=TLSv1.2,TLSv1.3 --connect-timeout=5 --batch --skip-column-names \
  --execute='SELECT DATABASE(), CURRENT_USER(), @@server_uuid, @@port, VERSION(), @@version_comment; SHOW SESSION STATUS WHERE Variable_name IN ("Ssl_cipher","Ssl_version"); SHOW GRANTS FOR CURRENT_USER;'
```

Não publicar a saída bruta: usuário/host dos grants podem identificar acesso interno. O operador
revisa em canal protegido e fornece somente a identidade esperada e privilégios normalizados.
Se DATABASE() for NULL e não existir schema aprovado, registrar dependência de bootstrap futuro.
Não escolher um schema administrativo, criar schema ou relaxar `connectionContract` para passar.

### Contrato do diagnóstico Prisma gerenciado

O JSON protegido deve conter `formatVersion:1`, `operation:"diagnose-read-only"`,
`mode:"oci-read-only"`, `approved:true`, `expiresAt` futuro inferior a 24 h e `role:"diagnostic"`.
Target: host = FQDN acima, port = 3306, expectedAddress = 10.20.2.25, schema/user/serverUuid/version obtidos
por leitura autorizada e `caSha256` igual ao fingerprint DER aprovado. Não preencher UUID/versão
SQL com o rótulo do console. O validador também exige CA no path definitivo e pertencente a root.

Credencial somente em `HEATWAVE_DIAGNOSTIC_DATABASE_URL`, fornecida pelo launcher protegido.
Contrato público da URL, sem construir senha: host/port/schema/user revisados + `sslaccept=strict`,
`sslcert=/etc/pki/traceflow/mysql-ca.pem`, `connection_limit=1`, `connect_timeout=5`,
`pool_timeout=5`, `socket_timeout=10`. Percent-encode de valores; seis opções únicas, sem extras.
`DATABASE_URL`, `TEST_DATABASE_URL`, `TEST_RUNTIME_DATABASE_URL`, `MIGRATION_DATABASE_URL`,
`RUNTIME_DATABASE_URL` e bypass TLS não podem estar presentes. Não copiar `.env` de DEV.

```bash
# Ambiente fornecido pelo launcher protegido; nunca incluir URL ou senha nesta linha.
/usr/bin/node backend/scripts/validate-oci-heatwave-connection.js \
  --authorization "$HEATWAVE_AUTHORIZATION_FILE" --validate-only
# Conexão real exige aprovação separada:
/usr/bin/node backend/scripts/validate-oci-heatwave-connection.js \
  --authorization "$HEATWAVE_AUTHORIZATION_FILE"
```

`--validate-only` lê apenas autorização/CA e confere contratos; não consulta DNS/SQL. A execução
completa limita o total a 30 s, handshake a 5 s, usa lookup somente do FQDN e exige todas as respostas
10.20.2.25, sem destino alternativo. Confere CURRENT_USER(), schema/UUID/porta/versão; consultas
exatas estão no script: SELECT de identidade, SHOW SESSION STATUS TLS, SHOW GRANTS, SELECT das
variáveis e SELECT 1. Não consulta registros de negócio nem executa DDL/DML. PASS só é emitido
depois de desconectar. Erros imprimem códigos, nunca URL ou texto bruto do servidor.

O DNS VCN permanece parte da fronteira de confiança: Prisma e probe fazem sua própria resolução
após o precheck. Não é pinning de endereço de cada conexão do pool. TLS/hostname estritos, CA
protegida e rede privada continuam necessários. Recusar DNS misto/alterado; investigar divergência.

### Cartão de autorização obrigatório para cada lote remoto

| Campo | Conteúdo a fechar e apresentar antes da aprovação |
| --- | --- |
| 1. Comando exato | expandir bundle/launcher/arquivos/alias nos blocos acima; separar leitura, instalação CA e diagnóstico; sem placeholders na aprovação final |
| 2. Identidade | SSH/Unix a informar; instalação root; diagnóstico conta Unix própria + MySQL restrito; nenhum admin de banco |
| 3–4. Alvo/porta | VM traceflow-app/traceflowapp; FQDN canônico; 10.20.2.25:3306; sem outra instância |
| 5. SQL | somente os SELECT/SHOW explicitados; nenhum CREATE, GRANT, migration, seed ou alteração global |
| 6. Arquivos | CA pública, autorização 0600, cliente MySQL 0600, launcher/bundle revisados; não ler .env/key/credenciais preexistentes por descoberta |
| 7. Segredos | senha da conta diagnóstica via mecanismo protegido; nomes apenas; sem argv/log/chat |
| 8. Efeitos | leitura e sessões transitórias; instalar CA é lote mutável separado e ainda não autorizado |
| 9. Riscos | alvo errado, credencial excessiva, TOCTOU/DNS, indisponibilidade, saída bruta; guards, TLS e revisão reduzem risco |
| 10. Prazo | bootstrap 20 s + 5 s kill, handshake 5 s, diagnóstico 30 s; autorização < 24 h; sem retry infinito |
| 11. Sucesso | identidade exata, cadeia/SAN/datas válidos, sessão TLS 1.2/1.3, grants mínimos, pool 1, saída sanitizada e disconnect |
| 12. Interrupção | qualquer divergência/falta de schema/CA/identidade/autorização; zero fallback e nenhuma tentativa de corrigir banco |
| 13. Limpeza | somente arquivos temporários próprios e sessões; preservar CA instalada, configs e banco; não apagar evidência privada sem política |
| 14. Evidência | UTC, comando sem segredo, origem operador/Codex, target sanitizado, versões/cipher/grants normalizados, códigos, limites e estado PENDING/PASS |

Fases A–F: preflight/CA/autorização → identidade bootstrap → TLS → Prisma → grants/parâmetros →
disconnect/evidência. A instalação CA não está implicitamente autorizada pela aprovação read-only.
O diagnóstico pode certificar apenas sua própria conta; runtime/migration/backup precisam revisão
própria. Observar max_connections disponível e consumidores sem alterar o servidor. O orçamento
11 + reserva 5 é proposta, não capacidade comprovada; no job exclusivo não concorrer backup/migration.

### Contas futuras — somente modelos administrativos para revisão

Nomes de schema, usuários e host permitidos ainda serão decididos. Não há conta real criada.
Em execução administrativa separada, um cliente protegido poderá preparar os comandos abaixo,
substituindo os identificadores validados (sem copiar os placeholders literalmente):

```sql
CREATE USER '<USUARIO_DIAGNOSTICO>'@'<ORIGEM_PRIVADA_VM>' IDENTIFIED BY RANDOM PASSWORD REQUIRE SSL;
GRANT SELECT ON `<SCHEMA_APROVADO>`.* TO '<USUARIO_DIAGNOSTICO>'@'<ORIGEM_PRIVADA_VM>';
CREATE USER '<USUARIO_API>'@'<ORIGEM_PRIVADA_VM>' IDENTIFIED BY RANDOM PASSWORD REQUIRE SSL;
GRANT SELECT, INSERT, UPDATE, DELETE ON `<SCHEMA_APROVADO>`.* TO '<USUARIO_API>'@'<ORIGEM_PRIVADA_VM>';
CREATE USER '<USUARIO_WORKER>'@'<ORIGEM_PRIVADA_VM>' IDENTIFIED BY RANDOM PASSWORD REQUIRE SSL;
GRANT SELECT, INSERT, UPDATE, DELETE ON `<SCHEMA_APROVADO>`.* TO '<USUARIO_WORKER>'@'<ORIGEM_PRIVADA_VM>';
CREATE USER '<USUARIO_BACKUP>'@'<ORIGEM_PRIVADA_VM>' IDENTIFIED BY RANDOM PASSWORD REQUIRE SSL;
GRANT SELECT, SHOW VIEW ON `<SCHEMA_APROVADO>`.* TO '<USUARIO_BACKUP>'@'<ORIGEM_PRIVADA_VM>';
CREATE USER '<USUARIO_MIGRATION>'@'<ORIGEM_PRIVADA_VM>' IDENTIFIED BY RANDOM PASSWORD REQUIRE SSL;
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON `<SCHEMA_APROVADO>`.* TO '<USUARIO_MIGRATION>'@'<ORIGEM_PRIVADA_VM>';
```

RANDOM PASSWORD devolve um segredo: a futura execução deve capturá-lo diretamente em canal
protegido, sem logs/chat. Confirmar suporte/privilégio administrativo HeatWave antes de aprovar.
Não usar '%' por conveniência, grants por prefixo do laboratório, ALL PRIVILEGES/global/FILE/SUPER/
GRANT OPTION. `partial_revokes` do HeatWave exige nomes exatos. Definir existência/charset/collation
do schema em bootstrap separado do primeiro deploy; **não criar schema para este diagnóstico**.
Contas runtime sem DDL; contas de migration/restore restritas somente ao job/destino aprovado.

### Migration gate e limitações atuais

68 migrations imutáveis. `release-database.mjs` impõe credencial separada, strict+CA absoluta,
identidade, DNS/endereço privado em produção, gates humanos, lock GET_LOCK, histórico/fingerprint,
drift e quarentena. Não há migration no startup. O bridge não fixa sozinho o FQDN/path/fingerprint
públicos desta etapa nem todos os orçamentos de job: o contrato resolvido do job precisa ser
revisado antes da primeira autorização. Seu branch de laboratório usa transporte distinto do
modo gerenciado; não chamar esse ensaio histórico de prova TLS do migration job em HeatWave.
Nenhum upgrade de Prisma, edição de migration ou novo schema foi necessário nesta entrega.

Relatório/evidências atuais:
[OCI_DEPLOY_06_1_HEATWAVE_MANAGED_HOMOLOGATION_REPORT.md](../deliveries/OCI_DEPLOY_06_1_HEATWAVE_MANAGED_HOMOLOGATION_REPORT.md).
