# OCI-DEPLOY-06.1 — Bootstrap inicial do MySQL HeatWave

Data: 15/10/2026. **PREPARADO — NÃO EXECUTADO; autorização humana pendente.**
Este documento prepara operações administrativas futuras. Não autoriza conexão, criação,
GRANT, migration, deploy ou acesso a credenciais. Os blocos SQL são lotes independentes;
não extrair e executar todos de uma vez. [Relatório da preparação](../deliveries/OCI_DEPLOY_06_1_INITIAL_BOOTSTRAP_PREPARATION_REPORT.md).

## 1. Estado confirmado e baseline

Baseline local: `daniel-dev`, HEAD `b5572bd16af35722fec21da6190b7b4f360bbb27`,
working tree inicialmente limpo. Prisma Client/CLI **6.12.0**, 68 migrations preservadas.
A arquitetura Route → Controller → Service → Repository → Prisma → MySQL não muda.

| Informação | Origem / estado |
| --- | --- |
| Always Free; DB System `traceflow-mysql`; versão apresentada 26.7.0 | confirmado pelo operador; VERSION() SQL ainda não coletado |
| FQDN | `traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com` |
| Endpoint privado | `10.20.2.25:3306` |
| Origem privada da VM `traceflow-app` | **10.20.1.184**, confirmada pelo operador nesta continuação |
| TLS personalizado / TLS 1.3 / hostname | aprovados pelo operador; usuário Linux traceflow consegue validar TLS |
| CA pública | já instalada em `/etc/pki/traceflow/mysql-ca.pem`, conforme operador |
| Contas existentes | somente administrador MySQL, segundo operador; nome não fornecido |
| Schema, migrations, aplicação | schema ainda não criado; nenhuma migration; nenhuma aplicação publicada |
| Identidade SQL, parâmetros, grants e autenticação Prisma | não observados nesta execução; pendentes |

Não houve acesso à OCI, SSH, credenciais, banco DEV ou HeatWave. A confirmação de schema ausente
atualiza a incerteza do relatório anterior; não transforma um relato em inspeção SQL executada.
A versão da console não substitui `VERSION()` nem identifica `@@server_uuid`.

## 2. Dependências antes de qualquer operação

1. Autorização separada para leitura administrativa B00; depois, para os lotes mutáveis escolhidos.
2. Operador, alias SSH e conta Unix identificados; nome do administrador fornecido por canal
   operacional. Não descobrir senhas em arquivos existentes nem pedir credenciais no chat.
3. Cliente **Oracle MySQL**, ARM64, versão e origem verificadas, compatível com 26.7 e com
   as opções abaixo. Não assumir que um executável chamado mysql é esse cliente.
4. Bash, GNU timeout e diretório privado de operação na VM; nenhum componente é instalado aqui.
5. Confirmar DNS privado exclusivamente 10.20.2.25, rota com origem 10.20.1.184 e identidade TLS.
   Divergência de origem interrompe o procedimento; não ampliar Host para `%` ou para a sub-rede.
6. Cofre/mecanismo de custódia, responsáveis, recuperação e rotação aprovados antes de gerar
   credenciais. Caminhos do bundle, launcher e autorizações ainda precisam ser informados.
7. Preflight B00 deve confirmar schema/contas ausentes, privilégios administrativos efetivos,
   InnoDB, collations e identidade. Desvio de SQL mode/case sensitivity exige revisão.
8. Ninguém inicia escritores durante bootstrap. API, worker, migrations, seeds e ferramentas
   de desenvolvimento permanecem fora desta operação.

A [documentação HeatWave de privilégios administrativos](https://docs.oracle.com/en-us/iaas/mysql-database/doc/default-mysql-privileges.html)
inclui criação de usuários e concessão dos privilégios usados abaixo. Isso confirma a viabilidade
documental; não comprova os grants da conta administrativa desta instância. Se faltarem direitos,
parar e solicitar revisão do operador; não conceder uma role administrativa às contas da aplicação.

## 3. Schema e collation propostos

Schema definitivo **`traceflow`**, charset **`utf8mb4`**, collation **`utf8mb4_unicode_ci`**.
A cadeia atual contém 66 ocorrências de `CHARACTER SET utf8mb4`, 65 de
`COLLATE utf8mb4_unicode_ci` e uma de `COLLATE utf8mb4_bin`. São contagens textuais,
não quantidades finais de tabelas. Há tabelas que herdam defaults do schema.

Preservar `GitBranch.name` com `utf8mb4_bin`, definido por
`20260821120000_lr5_gitbranch_case_sensitive`. A migration
`20260905030000_sprint_active_name_uniqueness` usa metadata de collation em SQL preparado
para construir coluna gerada/índice. O schema Prisma documenta a exceção de GitBranch.

Não adotar automaticamente `utf8mb4_0900_ai_ci`: mudaria semântica de comparação e defaults
herdados sem homologação. Não executar ALTER nas 68 migrations, no Prisma ou no servidor.
B10 cria somente o schema vazio; não cria tabelas, histórico Prisma ou dados.
`CREATE DATABASE` sem `IF NOT EXISTS` interrompe em caso de objeto inesperado.

## 4. Matriz de contas e privilégios

Os nomes abaixo são **propostas novas**, não contas já existentes. Todas usam o Host exato
`10.20.1.184`, `caching_sha2_password` e `REQUIRE SSL`. Não há concessão global,
GRANT OPTION, role herdada, administração de usuários ou conta admin no runtime.

| Conta proposta | Escopo / privilégios | Estado inicial / uso |
| --- | --- | --- |
| `traceflow_api` | `traceflow.*`: SELECT, INSERT, UPDATE, DELETE | LOCK; desbloqueio só na ativação autorizada da API |
| `traceflow_worker` | `traceflow.*`: SELECT, INSERT, UPDATE, DELETE | LOCK; desbloqueio só na ativação autorizada do worker |
| `traceflow_diag` | `traceflow.*`: SELECT | LOCK; desbloqueio B40 após custódia e autorização de diagnóstico |
| `traceflow_migrator` | `traceflow.*`: SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES | LOCK; desbloqueio temporário somente para job aprovado |
| `traceflow_backup` | `traceflow.*`: SELECT; SHOW VIEW somente se necessidade futura demonstrada | **adiar criação** até ferramenta/job operacional aprovado |

DML por schema corresponde aos parsers existentes; separar API e worker permite rotação/auditoria.
Restrição por tabela para cada serviço é uma evolução distinta: exigiria revisão do contrato,
não deve ser improvisada no bootstrap. SELECT do diagnóstico alcança dados do schema, embora
o script autorizado consulte só metadata e SELECT 1; custodiar essa conta como credencial sensível.
DML também alcança `_prisma_migrations` quando existir; esse é um limite residual do contrato atual.

Os nove privilégios do migrator correspondem à cadeia e à exigência de
`deploy/scripts/release-database.mjs`. A cadeia usa DDL, índices/FKs e backfills DML;
não define routines, triggers, views ou events. SQL `PREPARE/EXECUTE` não requer o privilégio
EXECUTE de stored routines. GET_LOCK não requer LOCK TABLES. Não conceder CREATE TEMPORARY TABLES,
PROCESS, RELOAD, FILE, SUPER, BACKUP_ADMIN ou privilégios globais por precaução.
DROP permite operações destrutivas dentro do schema: credencial transitória, conta bloqueada
fora da janela e gates de migrations são obrigatórios.

O dump local existente usa single transaction, skip-lock-tables, no-tablespaces,
set-gtid-purged=OFF, sem triggers/routines/events. Isso fundamenta SELECT como proposta
mínima para backup da cadeia atual, **não aprova um job gerenciado**. O CLI de backup ainda
aceita apenas `local-isolated`. Não criar a conta nem executar backup agora.

HeatWave exige grants com schema explícito e usa partial_revokes; não se depende de wildcard
no nome de schema. Essa regra é distinta de Host de conta, aqui um único IPv4.
[Restrições do serviço](https://docs.oracle.com/en-us/iaas/mysql-database/doc/unsupported-features.html).

## 5. SQL administrativo preparado

Não há senha literal. O servidor gera a senha e a retorna **em claro no resultset**:
captura privada da seção 7 é obrigatória. Cada lote B20–B23 tem saída própria protegida.
Ajuste de comprimento é somente SESSION, sem alterar configuração global.
As contas são criadas bloqueadas, sem expiração automática para uso não interativo;
`PASSWORD EXPIRE NEVER` depende de aceitar rotação controlada, com responsável e prazo.
Não usar `IF NOT EXISTS`, FLUSH PRIVILEGES, DML em mysql.user ou transação como promessa de rollback.
[Sintaxe CREATE USER 26.7](https://dev.mysql.com/doc/refman/26.7/en/create-user.html),
[senhas aleatórias](https://dev.mysql.com/doc/refman/26.7/en/password-management.html) e
[escopo da variável de comprimento](https://dev.mysql.com/doc/refman/26.7/en/server-system-variables.html#sysvar_generated_random_password_length).

B10 — schema, após revisão do B00:

```sql
CREATE DATABASE `traceflow`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

B20 — diagnóstico:

```sql
SET SESSION generated_random_password_length = 32;
CREATE USER 'traceflow_diag'@'10.20.1.184'
  IDENTIFIED WITH caching_sha2_password BY RANDOM PASSWORD
  REQUIRE SSL PASSWORD EXPIRE NEVER ACCOUNT LOCK;
GRANT SELECT ON `traceflow`.*
  TO 'traceflow_diag'@'10.20.1.184';
```

B21 — API:

```sql
SET SESSION generated_random_password_length = 32;
CREATE USER 'traceflow_api'@'10.20.1.184'
  IDENTIFIED WITH caching_sha2_password BY RANDOM PASSWORD
  REQUIRE SSL PASSWORD EXPIRE NEVER ACCOUNT LOCK;
GRANT SELECT, INSERT, UPDATE, DELETE ON `traceflow`.*
  TO 'traceflow_api'@'10.20.1.184';
```

B22 — worker:

```sql
SET SESSION generated_random_password_length = 32;
CREATE USER 'traceflow_worker'@'10.20.1.184'
  IDENTIFIED WITH caching_sha2_password BY RANDOM PASSWORD
  REQUIRE SSL PASSWORD EXPIRE NEVER ACCOUNT LOCK;
GRANT SELECT, INSERT, UPDATE, DELETE ON `traceflow`.*
  TO 'traceflow_worker'@'10.20.1.184';
```

B23 — migrations, ainda sem executar a cadeia:

```sql
SET SESSION generated_random_password_length = 32;
CREATE USER 'traceflow_migrator'@'10.20.1.184'
  IDENTIFIED WITH caching_sha2_password BY RANDOM PASSWORD
  REQUIRE SSL PASSWORD EXPIRE NEVER ACCOUNT LOCK;
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES
  ON `traceflow`.* TO 'traceflow_migrator'@'10.20.1.184';
```

B40 — desbloqueio **somente** do diagnóstico, após B30, custódia e autorização própria:

```sql
ALTER USER 'traceflow_diag'@'10.20.1.184' ACCOUNT UNLOCK;
```

B90 — proposta **adiada**, fora do lote inicial; não executar até necessidade operacional:

```sql
SET SESSION generated_random_password_length = 32;
CREATE USER 'traceflow_backup'@'10.20.1.184'
  IDENTIFIED WITH caching_sha2_password BY RANDOM PASSWORD
  REQUIRE SSL PASSWORD EXPIRE NEVER ACCOUNT LOCK;
GRANT SELECT ON `traceflow`.*
  TO 'traceflow_backup'@'10.20.1.184';
```

Não há desbloqueio de API, worker ou migrator nesta preparação. A ativação futura deverá apresentar
o ALTER USER exato e seu relock/encerramento aprovados. A origem exata restringe a conta à VM,
não ao processo Linux; dois processos com UID traceflow não ficam isolados entre si por isso.

## 6. Criação, custódia e uso seguro das credenciais

1. Antes de B20, escolher um cofre aprovado e testar o fluxo de importação/recuperação sem
   credenciais reais nesta entrega. Não inventar uma integração Vault, OCID ou chave.
2. Gerar no MySQL com BY RANDOM PASSWORD; capturar o resultset diretamente em arquivo privado
   transitório da seção 7. Não usar terminal gravado, tee, clipboard compartilhado, CI ou journald.
3. Diretório 0700, arquivos 0600, sem symlinks, dono operacional. /run é proposta de scratch
   volátil: confirmar tmpfs, política de swap e proteção do host. Unlink não garante apagamento físico.
4. Importar cada segredo por canal privado para a custódia aprovada; validar associação conta/Host
   sem imprimir a senha. Não executar cat dos recibos, anexá-los ao Git, chat, tickets ou relatórios.
5. Guardar só evidência sanitizada: conta, origem, grants, TLS exigido, estado locked, horário e
   identificador não secreto da custódia. Os resultsets de CREATE USER **não são logs operacionais**.
6. Apagar apenas arquivos temporários próprios após confirmar custódia e recuperabilidade;
   em falha, manter protegidos para decisão do operador. Não remover CA/configs/banco.
7. Configuração futura: DATABASE_URL da API em `/etc/traceflow/api.env` e do worker em
   `/etc/traceflow/github-worker.env`, separados de `runtime.env`; root:root 0600, pais protegidos.
   O systemd lê EnvironmentFile antes de mudar para User=traceflow. Não modificar esses arquivos agora.
8. Segredos de admin, migrations, backup e diagnóstico não entram nessas units. O diagnóstico
   recebe somente HEATWAVE_DIAGNOSTIC_DATABASE_URL por launcher revisado; job recebe suas
   variáveis próprias. Não carregar .env de DEV nem copiar node_modules gerados junto de .env.
9. Percent-encode de usuário/senha/caminhos ao compor URLs por ferramenta privada revisada;
   escapar para o formato do arquivo consumidor. Não formar URL em argv, histórico, echo ou set -x.
   Variáveis de ambiente continuam acessíveis a root e potencialmente ao mesmo UID: limitar
   acesso ao host, dumps e ferramentas de inspeção; não executar systemctl show Environment.
10. Rotação e revogação são operações futuras aprovadas. Não usar ALTER USER para recuperar
    automaticamente senha perdida, reaproveitar senha administrativa ou enfraquecer validação.

REQUIRE SSL recusa transporte sem TLS no servidor; **não verifica hostname pelo cliente**.
VERIFY_IDENTITY no cliente e sslaccept=strict no Prisma continuam obrigatórios.
A autenticação proposta é caching_sha2_password; não habilitar mysql_native_password.
[Autenticação e atualização HeatWave](https://docs.oracle.com/en-us/iaas/mysql-database/doc/major-version-upgrade.html).

## 7. Execução manual futura e preflight administrativo

Todos os comandos desta seção estão **preparados, não executados**. Rodar somente na VM,
por operador autorizado. O cliente administrativo não escolhe banco na conexão inicial,
pois traceflow ainda não existe. A senha administrativa é solicitada pelo cliente no TTY,
sem valor em argv/ambiente. O nome do admin e o caminho do binário são dados operacionais
a preencher e apresentar no cartão de autorização; não são fornecidos por este documento.

Preparação da sessão Bash operacional, apenas após autorização:

```bash
set +x
set -eu
umask 077
test "$(id -u)" -eq 0
IFS= read -r -p 'Caminho absoluto do cliente Oracle MySQL revisado: ' MYSQL_BIN
IFS= read -r -p 'Nome da conta administrativa aprovada: ' ADMIN_MYSQL_USER
case "$MYSQL_BIN" in /*) ;; *) exit 1 ;; esac
test -x "$MYSQL_BIN"
test -n "$ADMIN_MYSQL_USER"
BOOTSTRAP_DIR=$(mktemp -d /run/traceflow-bootstrap.XXXXXXXX)
chmod 0700 "$BOOTSTRAP_DIR"

mysql_admin() {
  test "$#" -eq 1 || return 2
  case "$1" in B00|B10|B20|B21|B22|B23|B30|B40|B41|B90) ;; *) return 2 ;; esac
  test -f "$BOOTSTRAP_DIR/$1.sql" || return 2
  test ! -L "$BOOTSTRAP_DIR/$1.sql" || return 2
  (
    set -C
    env -i PATH=/usr/bin:/bin HOME="$BOOTSTRAP_DIR" \
      MYSQL_HISTFILE=/dev/null LANG=C.UTF-8 \
      /usr/bin/timeout --foreground --signal=TERM --kill-after=5s 60s \
      "$MYSQL_BIN" --no-defaults --no-login-paths \
      --protocol=TCP \
      --host=traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com \
      --port=3306 --user="$ADMIN_MYSQL_USER" --password \
      --ssl-mode=VERIFY_IDENTITY --ssl-ca=/etc/pki/traceflow/mysql-ca.pem \
      --tls-version=TLSv1.2,TLSv1.3 --connect-timeout=5 \
      --default-character-set=utf8mb4 --local-infile=0 \
      --batch --raw --skip-column-names --skip-reconnect \
      < "$BOOTSTRAP_DIR/$1.sql" \
      > "$BOOTSTRAP_DIR/$1.stdout.private" \
      2> "$BOOTSTRAP_DIR/$1.stderr.private"
  )
}
```

O operador materializa **somente o lote aprovado** em `$BOOTSTRAP_DIR/Bxx.sql`, com conteúdo exato
do bloco correspondente, dono root, modo 0600, sem symlinks; confere hash/conteúdo antes de chamar
a função. O diretório novo impede herança de arquivos; noclobber impede sobrescrever recibos.
O timeout inclui o tempo do prompt, e nenhuma falha é repetida automaticamente.
O comportamento do prompt deve ser verificado com o cliente aprovado antes do lote mutável.
`--no-defaults` sozinho ainda permite login paths; ambos os flags são necessários.
[Opções do cliente MySQL](https://dev.mysql.com/doc/refman/26.7/en/mysql-command-options.html).

Antes da conexão autorizada, conferir fingerprint/datas da CA pública, rota e resolução
do FQDN por leitura na VM. Comparar o fingerprint DER com o valor público da seção 9;
não substituir a CA ou aceitar outro digest automaticamente:

```bash
openssl x509 -in /etc/pki/traceflow/mysql-ca.pem -noout -fingerprint -sha256 -dates
ip -4 route get 10.20.2.25
getent ahostsv4 traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com
```

Exigir origem 10.20.1.184 e destino aprovado; esse comando não é uma prova de autenticação SQL.
O diagnóstico canônico também recusará qualquer resposta DNS fora de 10.20.2.25.

B00 — leitura administrativa inicial, **sem selecionar hashes/senhas**:

```sql
SELECT VERSION() AS version, @@version_comment AS version_comment,
       @@server_uuid AS server_uuid, @@port AS port, @@hostname AS hostname,
       USER() AS connection_identity, CURRENT_USER() AS effective_account,
       CURRENT_ROLE() AS active_roles, DATABASE() AS selected_database;
SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_cipher', 'Ssl_version');
SHOW GRANTS FOR CURRENT_USER;
SELECT @@global.time_zone AS global_time_zone,
       @@global.sql_mode AS sql_mode,
       @@global.lower_case_table_names AS lower_case_table_names,
       @@global.default_storage_engine AS default_storage_engine,
       @@global.character_set_server AS character_set_server,
       @@global.collation_server AS collation_server,
       @@global.max_connections AS max_connections,
       @@global.require_secure_transport AS require_secure_transport,
       @@global.partial_revokes AS partial_revokes,
       @@global.mandatory_roles AS mandatory_roles;
SHOW COLLATION WHERE Collation IN ('utf8mb4_unicode_ci', 'utf8mb4_bin');
SELECT SCHEMA_NAME, DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME
FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = 'traceflow';
SELECT User, Host, plugin, ssl_type, account_locked, password_expired
FROM mysql.user
WHERE User IN ('traceflow_api', 'traceflow_worker', 'traceflow_diag',
               'traceflow_migrator', 'traceflow_backup')
ORDER BY User, Host;
```

B00 deve retornar zero schemas traceflow e zero contas com os nomes propostos, inclusive outros
Hosts. Se houver role administrativa, sua expansão requer SHOW GRANTS da identidade/role
real descoberta e revisão explícita, sem presumir seu nome. Não fazer escrita em mysql.*.
A visibilidade administrativa das consultas precisa ser confirmada; erro de permissão não é ausência.

Primeira chamada possível, ainda condicionada à aprovação de leitura:

```bash
mysql_admin B00
```

| Próxima chamada manual | Condição antes da chamada |
| --- | --- |
| `mysql_admin B10` | B00 revisado; alvo/UUID fixados; schema ausente; autorização CREATE DATABASE |
| `mysql_admin B20` | schema correto, custódia pronta; autorização CREATE USER + GRANT diagnóstico |
| `mysql_admin B21` / `B22` / `B23` | autorização de cada conta; recibos separados; conta anterior custodiada |
| `mysql_admin B30` | leitura posterior autorizada; objetos continuam vazios |
| `mysql_admin B40` | desbloqueio diagnóstico expressamente aprovado; credencial custodiada |
| `mysql_admin B41` | conferência posterior; só diag desbloqueado |
| `mysql_admin B90` | **não integra bootstrap inicial**; aprovação futura de backup operacional |

Nunca colocar os lotes em um loop. Recusa, timeout ou sessão interrompida exigem inspeção somente
leitura autorizada antes de qualquer retomada. Não usar --force ou reconexão automática.

O helper administrativo fixa destino/TLS, mas não implementa o fencing de UUID do migration job.
A conferência de UUID é manual em B00/B30 e vale somente para a janela aprovada, sem mudanças
do DB System. Interrupção, manutenção, troca de endpoint ou retomada em outra janela exigem
nova leitura de identidade autorizada e revisão antes de qualquer lote mutável.

## 8. Verificações posteriores ao bootstrap

B30 — verificações administrativas; resultados esperados antes do desbloqueio:

```sql
SELECT @@server_uuid AS server_uuid, VERSION() AS version;
SHOW SESSION STATUS WHERE Variable_name IN ('Ssl_cipher', 'Ssl_version');
SELECT SCHEMA_NAME, DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME
FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = 'traceflow';
SELECT 'tables_and_views' AS object_kind, COUNT(*) AS object_count
FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'traceflow'
UNION ALL
SELECT 'routines', COUNT(*) FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = 'traceflow'
UNION ALL
SELECT 'triggers', COUNT(*) FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = 'traceflow'
UNION ALL
SELECT 'events', COUNT(*) FROM information_schema.EVENTS
WHERE EVENT_SCHEMA = 'traceflow';
SELECT User, Host, plugin, ssl_type, account_locked, password_expired
FROM mysql.user
WHERE User IN ('traceflow_api', 'traceflow_worker', 'traceflow_diag',
               'traceflow_migrator', 'traceflow_backup')
ORDER BY User, Host;
SHOW GRANTS FOR 'traceflow_api'@'10.20.1.184';
SHOW GRANTS FOR 'traceflow_worker'@'10.20.1.184';
SHOW GRANTS FOR 'traceflow_diag'@'10.20.1.184';
SHOW GRANTS FOR 'traceflow_migrator'@'10.20.1.184';
```

Aceite: mesmo UUID/versão fixados no B00; TLS 1.2/1.3 e cipher não vazio; uma linha de schema com
utf8mb4/unicode_ci; quatro contagens zero, inclusive ausência de _prisma_migrations; exatamente
quatro contas, somente Host 10.20.1.184, plugin caching_sha2_password, ssl_type ANY
(REQUIRE SSL), account_locked Y, password_expired N. Backup ausente.
Grants exatamente iguais à matriz; `USAGE ON *.*` sozinho não concede privilégio global.
Role, GRANT OPTION, outro Host/schema ou privilégio inesperado interrompe o aceite.

B41 — após B40, somente o diagnóstico deve apresentar account_locked N:

```sql
SELECT User, Host, plugin, ssl_type, account_locked, password_expired
FROM mysql.user
WHERE User IN ('traceflow_api', 'traceflow_worker', 'traceflow_diag',
               'traceflow_migrator', 'traceflow_backup')
ORDER BY User, Host;
SHOW GRANTS FOR 'traceflow_diag'@'10.20.1.184';
```

Registrar evidência sanitizada de B00/B10–B30/B41 e custódia, sem resultsets de senhas.
Não enviar credencial real sem TLS para produzir teste negativo; conferir REQUIRE SSL em metadata,
cliente estrito e sessão efetiva. Ensaios adversos com senhas sintéticas pertencem ao laboratório.
Não executar CREATE/INSERT de teste, seed, readiness da aplicação ou worker no schema vazio.

## 9. Homologação real do Prisma

Após bootstrap e autorização **separada de diagnóstico somente leitura**, reutilizar
`backend/scripts/validate-oci-heatwave-connection.js` e o Prisma canônico 6.12.0.
O script não precisa de tabelas da aplicação: identidade, status TLS, próprios grants,
parâmetros e SELECT 1 permitem homologar conexão no schema vazio. Isso não comprova execução
das 68 migrations nem comportamento completo da aplicação no serviço gerenciado.

Preparar autorização privada 0600, dono do processo diagnóstico, pais protegidos e sem symlinks.
Este modelo está propositalmente **não autorizado e incompleto**; UUID e VERSION() devem vir
do B00 aprovado. Expiração UTC futura inferior a 24h e approved true somente após aprovação real:

```json
{
  "formatVersion": 1,
  "operation": "diagnose-read-only",
  "mode": "oci-read-only",
  "approved": false,
  "expiresAt": null,
  "role": "diagnostic",
  "target": {
    "host": "traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com",
    "expectedAddress": "10.20.2.25",
    "port": 3306,
    "schema": "traceflow",
    "user": "traceflow_diag",
    "serverUuid": null,
    "version": null,
    "caSha256": "2eaee0e206741bf81b651f1ae33f44f0a92949ed6a99137a4aa8b0013486d295"
  }
}
```

O SHA-256 DER público vem da evidência OCI06.1; reconferir por canal confiável, não substituir
automaticamente pelo certificado apresentado. CA existente não será reinstalada. O validator
exige arquivo root-owned, PEM de uma CA raiz válida e caminho definitivo; o usuário traceflow
deve poder lê-lo, sem poder alterá-lo.

O launcher protegido fornece **somente HEATWAVE_DIAGNOSTIC_DATABASE_URL** para esse propósito.
Seis parâmetros obrigatórios, únicos: `sslaccept=strict`,
`sslcert=/etc/pki/traceflow/mysql-ca.pem`, `connection_limit=1`,
`connect_timeout=5`, `pool_timeout=5`, `socket_timeout=10`.
Nenhuma URL com senha é registrada neste documento.

Bundle isolado, sem .env, dependências por lockfile e engine Linux ARM64/OpenSSL homologada;
não usar node_modules do checkout DEV. Comando relativo ao bundle revisado, sem iniciar aplicação:

```bash
/usr/bin/node backend/scripts/validate-oci-heatwave-connection.js \
  --authorization "$HEATWAVE_AUTHORIZATION_FILE" --validate-only
```

Com aprovação própria para a conexão, outra execução:

```bash
/usr/bin/node backend/scripts/validate-oci-heatwave-connection.js \
  --authorization "$HEATWAVE_AUTHORIZATION_FILE"
```

O launcher e seu caminho absoluto ainda precisam de revisão antes de executar; esses comandos
não descobrem nem carregam segredo por si. Não herdar DATABASE_URL, TEST_DATABASE_URL,
TEST_RUNTIME_DATABASE_URL, MIGRATION_DATABASE_URL, RUNTIME_DATABASE_URL ou bypass TLS.
O modelo incompleto acima deve ser recusado, inclusive em validate-only.

Aceite de validate-only: CONFIG_VALID/connected false, sem DNS/SQL.
Aceite da execução: DNS somente 10.20.2.25; cadeia/SAN/datas; identidade SQL/usuário; sessão
Prisma TLS 1.2/1.3; SELECT apenas no schema; pool 1 e tempos 5/5/10; disconnect antes de PASS.
Deadline total 30 s, handshake 5 s. O script verifica o nome em CURRENT_USER; Host exato da
conta é conferido pelo preflight administrativo e B30, não por um novo guard inventado.
Saída sanitizada, nenhum DDL/DML, nenhum fallback.

API/worker podem futuramente ser diagnosticados com role runtime e suas próprias credenciais,
sob autorizações independentes e os limites diagnósticos. A conta migrator possui DDL e não deve
ser forçada pelo parser de diagnóstico. TEST_DATABASE_URL permanece obrigatório exclusivamente
nos testes persistentes isolados; não usar validators de integração contra traceflow.

## 10. Riscos e interrupção

| Situação | Ação segura |
| --- | --- |
| DNS, TLS, origem, CA, UUID ou versão divergentes | interromper; nenhum fallback por IP, certificado permissivo ou Host amplo |
| Schema/conta já existe; visibilidade insuficiente | interromper e inventariar sob leitura autorizada; não adotar, resetar ou sobrescrever |
| CREATE USER passou, GRANT falhou | conta permanece LOCK; preservar recibo privado, verificar estado e reaprovar reparo pontual |
| Timeout/desconexão ou credencial perdida | resultado pode ser parcial; não repetir lote nem executar DROP/ALTER de recuperação automaticamente |
| Privilégio/role excessivo ou mandatory role inesperada | recusar homologação; revisar com operador, sem conceder mais direitos para passar |
| grant DROP do migrator, DML amplo ou acesso por mesmo UID | restringir janela, custódia e host; separar contas não isola processos com mesmo UID |
| time_zone diferente de literal +00:00 | diagnóstico pode coletar; migration job recusará; configuração é decisão separada, sem SET GLOBAL neste bootstrap |
| Gerenciamento de senhas/backup não aprovado | não gerar/desbloquear credenciais; não fabricar evidência |
| Falha parcial da futura migration | quarentena e intervenção, manter escritores parados; sem reset, resolve ou edição de histórico automática |

DDL/CREATE USER/GRANT não formam um bootstrap reversível por ROLLBACK. O ponto seguro de parada
é schema vazio e contas bloqueadas, com estado conhecido e credenciais custodiadas.
Não preparar DROP DATABASE/DROP USER como rollback automático. Se diagnóstico já foi desbloqueado,
revogação/relock exigirá comando pontual autorizado; não continuar em caso de incidente.

## 11. Checklist de autorização

- [ ] Responsável, janela, identidade Unix/SSH, admin MySQL e cliente verificado identificados.
- [ ] Comandos/SQL exatos, caminhos absolutos, hashes do bundle/lotes e limites revisados;
      nenhum identificador obrigatório desconhecido no cartão final.
- [ ] Lotes separados: B00 leitura; B10 schema; B20–B23 contas/grants; B30 leitura;
      B40 desbloqueio diagnóstico; B41 leitura; Prisma validate-only e conexão em autorizações próprias.
- [ ] Origem 10.20.1.184, destino/FQDN/porta/CA fixados; UUID/SQL version coletados antes da mutação.
- [ ] B00 comprova ausência de schema/contas e visibilidade administrativa suficiente.
- [ ] Cofre/custódia, rotação e PASSWORD EXPIRE NEVER aceitos; captura privada e limpeza aprovadas.
- [ ] Sem writers, schema ainda vazio e nenhuma migration na operação; backup da aplicação
      inexistente explicitamente não aplicável.
- [ ] Sem senha em argv/log/Git/chat; sem leitura de credenciais pelo agente nesta preparação.
- [ ] Critérios de parada/falha parcial aceitos; sem retries, remoção ou concessão automática.
- [ ] B90 e desbloqueios de runtime/migrator excluídos da aprovação inicial.
- [ ] Evidência distinguindo relato do operador, preparação local e execução real; nenhuma
      homologação gerenciada marcada PASS sem execução correspondente.

Esta checklist não equivale a autorização. A próxima interação pode aprovar apenas B00,
preservando todas as etapas mutáveis pendentes.

## 12. Impacto nas entregas, migrations e ordem recomendada

**OCI06.1 permanece PARTIAL**: TLS do servidor aprovado pelo operador; autenticação Prisma,
bootstrap, privilégios/parâmetros reais e DR gerenciado pendentes. **OCI07 não iniciada**.
Este bootstrap prepara schema/contas; não publica aplicação, altera IAM/NSG/DNS/certificados
ou autoriza deploy.

Há uma incompatibilidade real entre primeiro banco vazio e o migration job atual:
`release-database.mjs:prepareMigration` exige incondicionalmente backupVerified,
backupReference e restoreRehearsed, embora depois aceite tableCount zero.
O wrapper `release.py` também exige gates de produção, inclusive SMTP/GitHub/uploads/deploy.
Até operações de inspeção desse wrapper dependem desses gates. Não usá-lo para B00
nem marcar gates verdadeiros sem evidência.

**Não exigir dump lógico de dados inexistentes para bootstrap.** O registro do estado inicial
(schema ausente → vazio, contas/grants, UUID e cadeia) é evidência de bootstrap, não backup.
Para a primeira migration, propor uma entrega pequena posterior que modele explicitamente
`initial-empty-database` — nome conceitual, **não flag existente**:

- Aprovação própria vinculada a UUID, schema, versão, cadeia, release e fingerprint anterior.
- Prova positiva de ausência de tabelas/views, histórico Prisma, routines, triggers e events;
  visibilidade suficiente e nenhuma aplicação/escritor externo.
- Revalidação sob os locks existentes, validade curta e recusa de qualquer objeto inesperado.
- Dispensa somente do backup de aplicação inexistente nesse caso; não falsificar backupReference.
  Política de restore/DR e demais gates de produção continua sujeita à decisão humana explícita.
- Preservar TLS, identidade, locks/fencing, histórico, proteção contra falha parcial e
  isolamento de credenciais. Testar a recusa de schema não vazio e de autorização fora do caso.
- Nunca chamar Prisma CLI diretamente para contornar o job. Depois de existir dado de aplicação,
  seguir backup consistente banco + evidências/uploads e restore ensaiado.

A conta migrator ficará LOCK enquanto esse contrato não for resolvido. O job mantém a exigência
de global time_zone literal +00:00 e Prisma 6.12.0; nenhuma adaptação é implementada aqui.
Orçamento inicial API até 5 + worker até 3 + diagnóstico 1 + job até 2 = 11, reserva proposta 5,
condicionado ao limite real. Bridge e CLI são processos distintos: orçamento 2 não significa
connection_limit 2 para cada um. Backup e migration não concorrem.

Ordem: aprovar preparação/custódia → B00 → B10–B30 → B40/B41 → diagnóstico Prisma →
adequação revisada do primeiro migration job + estratégia DR → autorização de primeira
migration → verificações e autorização própria de OCI07. Não iniciar qualquer etapa automaticamente.

A inexistência atual de dados dispensa backup pré-bootstrap, mas não elimina a necessidade de
uma recuperação operacional antes de receber dados reais. O backup local não é job de produção;
a conta backup, retenção, cofre externo, restore isolado e política RPO/RTO permanecem pendentes.
RPO 24h/RTO 4h dos runbooks são propostas, não compromissos aprovados.

Contratos consultados: [OCI06](../deliveries/OCI_DEPLOY_06_HEATWAVE_BACKUP_RECOVERY_REPORT.md),
[OCI06.1](../deliveries/OCI_DEPLOY_06_1_HEATWAVE_MANAGED_HOMOLOGATION_REPORT.md),
[homologação](OCI_HEATWAVE_HOMOLOGATION.md), [migrations](OCI_MIGRATIONS.md),
[ambiente](OCI_ENVIRONMENT.md), [backup/recuperação](OCI_BACKUP_RECOVERY.md),
[schema Prisma](../../backend/prisma/schema.prisma),
[diagnóstico](../../backend/scripts/validate-oci-heatwave-connection.js) e
[bridge](../../deploy/scripts/release-database.mjs).
