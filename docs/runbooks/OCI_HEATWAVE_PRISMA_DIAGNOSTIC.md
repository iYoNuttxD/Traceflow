# OCI-DEPLOY-06.1 — Pacote isolado de diagnóstico Prisma

Atualização: 15/10/2026. Implementação e execução **somente local**. D01, D02, B40, B41,
D03, D04 e relock abaixo são procedimentos futuros, cada qual sujeito à autorização descrita.
O pacote não é uma release da aplicação. Não inicia OCI-DEPLOY-07.

## 1. Objetivo e estado conhecido

Executar futuramente `backend/scripts/validate-oci-heatwave-connection.js` na VM Oracle Linux
9.8 ARM64, sem checkout, frontend, Express, worker ou Prisma CLI.

O operador informou B00/B10/B20/B21/B22/B23/B30 PASS: schema `traceflow` vazio,
utf8mb4/utf8mb4_unicode_ci; quatro contas @10.20.1.184, caching_sha2_password, REQUIRE SSL,
PASSWORD EXPIRE NEVER e ACCOUNT LOCK. Não repetir o bootstrap. Backup não criado.
Versão SQL `26.7.0-cloud`; UUID `6e94bb7f-c601-11f1-9b91-02001704771f`.
Nenhum desses fatos foi reconfirmado por conexão nesta entrega.

TLS SERVER PASS (operador); PRISMA MANAGED PENDING; HEATWAVE MANAGED PARTIAL;
DR PRODUCTION PENDING. Os testes MySQL Community 26.7.0 não encerram esses gates.

## 2. Arquitetura e consultas

`diagnostic-launcher.mjs` → verificação do inventário → preflight nativo →
diagnóstico canônico → cliente compartilhado `src/database/prismaClient.js` → Prisma → MySQL.

O launcher só compõe o ambiente e supervisiona o processo. Não implementa outro cliente SQL.
O diagnóstico mantém identidade (DATABASE, UUID, porta, datadir, VERSION, CURRENT_USER),
TLS da sessão, parâmetros do servidor, próprios grants e SELECT 1. Não consulta registros
de negócio, não inicia jobs e não executa DML/DDL/seed/migrations.

Há uma ampliação limitada de metadata: @@mandatory_roles, CURRENT_ROLE() e, somente quando
a role obrigatória é exatamente public@%, `SHOW GRANTS FOR CURRENT_USER USING 'public'@'%'`.
SHOW GRANTS FOR CURRENT_USER não inclui automaticamente mandatory roles:
[MySQL 26.7, SHOW GRANTS](https://dev.mysql.com/doc/refman/26.7/en/show-grants.html).
Direitos diretos e expandidos passam pela mesma allowlist. Role desconhecida, aninhada,
ADMIN/GRANT OPTION, direito global ou outro schema são recusados.
Não presumir que a role public real é vazia; sua expansão gerenciada ainda é um gate.

## 3. Dependências explícitas

- Node 22, Python 3 do sistema, libc/OpenSSL 3 no Oracle Linux 9.8 ARM64.
- @prisma/client **6.12.0**: entrypoints, runtime/library, Prisma Client gerado e um engine.
- dotenv **16.6.1**: importado pelo cliente compartilhado. O diagnóstico usa NODE_ENV=production;
  dotenv.config não é chamado. A geração limpa não registra caminhos de descoberta de .env.
- Seis módulos internos JS: diagnóstico, heatwave-connection, oci-compatibility-safety,
  reexport de database-safety, cliente Prisma e database-safety do src.
- schema.prisma público canônico e cópia gerada, necessários à rastreabilidade/resolução do engine.

O manifesto enumera 24 arquivos de execução; manifest.json é o 25º membro do tar.
Não há npm CLI, Prisma CLI, migrations, API, worker, certificado ou configuração operacional.

## 4. Empacotamento reproduzível

Receitas: `scripts/package-diagnostic.mjs`, `scripts/package_diagnostic.py`,
`deploy/lib/diagnostic_contract.py`. O export lê somente 14 entradas públicas explícitas do
working tree, identifica HEAD/branch, hashes e sete alterações locais incluídas. Não usa GitHub.

Em checkout/cópia autorizado, com Node 22, destino novo e pais protegidos:

```bash
node scripts/package-diagnostic.mjs export --output "$DIAGNOSTIC_SOURCE_DIR"
```

Revisar o sourceSha256 emitido; transportar somente essa exportação para uma VM de build
descartável OL9.8 ARM64. Executar a receita contida na própria exportação:

```bash
node "$DIAGNOSTIC_SOURCE_DIR/scripts/package-diagnostic.mjs" build \
  --source "$DIAGNOSTIC_SOURCE_DIR" \
  --source-sha256 "$DIAGNOSTIC_SOURCE_SHA256" \
  --output "$DIAGNOSTIC_ARTIFACT_DIR"
```

Cada build cria workspace exclusivo, HOME/cache/npmrc novos, npm ci pelo lockfile, Prisma
validate/generate sem conexão e sem .env; copia só a allowlist e remove o workspace próprio.
O diretório determinístico de build recusa colisão, não remove diretório de outra execução.
O Prisma usa uma URL de geração sem senha, loopback porta 1, jamais acessada.
Não instalar dependências na VM OCI para construir este pacote.

## 5. ARM64 e ambiente

Builds demonstrados: Oracle Linux 9.8 aarch64, Node **22.23.2**, npm **10.9.8**,
OpenSSL **3.5.8**, SELinux Enforcing. O preflight exige Linux ARM64, Node major 22,
OpenSSL major 3 e OL9.8. A versão Node do build fica fixada no manifesto; a instalação
deve conferir a versão exata planejada, mesmo que o preflight aceite outro patch do major 22.

## 6. Prisma Engine

`libquery_engine-linux-arm64-openssl-3.0.x.so.node`: ELF64 little endian, máquina AArch64.
O preflight carrega o módulo nativo e confere QueryEngine e sharedObjects; o laboratório
também executa Prisma real. Não copia node_modules do macOS nem engines x86.
Incompatibilidade recusa antes de abrir o arquivo de senha. Não trocar engine manualmente.

## 7. Manifesto e procedência

`productionRelease:false` e `sourceState:working-tree-candidate` são obrigatórios.
Contém HEAD, branch, origem de cada fonte, alterações locais, Node/npm/Prisma/OpenSSL,
plataforma, dependências, tamanho, modo e SHA-256 de cada arquivo.
Os hashes não equivalem a assinatura: a confiança depende da revisão das fontes e do
pin por canal independente. Não promover como release completa.

## 8. Artefato e checksums aprovados localmente

Pasta local ignorada pelo Git:

`build/oci-deploy-06-1-prisma-diagnostic/traceflow-prisma-diagnostic-efa7abc8191bbf10/`

| Campo                      | Valor                                                            |
| -------------------------- | ---------------------------------------------------------------- |
| Arquivo                    | traceflow-prisma-diagnostic-efa7abc8191bbf10.tar.gz              |
| Tamanho                    | 7.498.083 bytes                                                  |
| SHA-256 tar.gz             | 5344f07d4387f17f57d57e1418e0772a2a10b10ca51079f2b9f41080152a730b |
| SHA-256 manifest.json      | e155bf4ccf3e323a4fd2b0b9bafb1451713d1127bf501b9ca7df7ca17be00ea1 |
| SHA-256 diagnostic-tool.py | a6b4a77d725f24c31f1a8368983ff8a28bde0db4c29de61e0a18b7d1cf254378 |
| SHA-256 source.json        | efa7abc8191bbf10871b9c013044ed0b7dc3479a9a35da88be60078bc5a76d68 |
| HEAD base                  | 09d98d7fb6a7ffcf4b6e1546ab866afc7090915f                         |

Dois builds finais com cache/workspace novos produziram os mesmos bytes. O tar usa ordem,
mtime, uid/gid e modos fixos. A prova vale para estes inputs e toolchain; não é promessa
de identidade após atualização de npm, compressão, SO, lockfile ou gerador.

## 9. Segurança e limites de confiança

Verificar o SHA do verificador externo antes de executá-lo. Verificar o pacote antes de
executar qualquer Node de dentro dele. O launcher repete a verificação, mas auto-verificação
não protege contra substituição maliciosa do próprio launcher antes da primeira execução.

Instalação proposta root:traceflow, pasta 0750, arquivos públicos 0644 e sem escrita pelo
executor. Extração só em destino inexistente, com allowlist exata; recusa path traversal,
symlinks, hardlinks, duplicatas, arquivos extras, permissões abertas e checksum incorreto.
Não usar tar -x arbitrário. Não há downloads em runtime.

## 10. Material proibido

Não incluir URLs autenticadas, .env reais, senhas, tokens, chaves SSH/OCI/GitHub/SMTP,
chaves de certificados, dumps, backups ou dados da aplicação. O scanner verifica todos
os arquivos finais, inclusive o engine, por padrões de credenciais/chaves/tokens e URLs.
É uma verificação por padrões e allowlist, não uma prova universal de ausência de qualquer
segredo arbitrário. A origem pública e o export fechado são controles complementares.

## 11. CA pública e TLS

Usar exclusivamente `/etc/pki/traceflow/mysql-ca.pem` no modo gerenciado. O operador informou
root:root 0644, SELinux cert_t, leitura por traceflow e TLS 1.3 com hostname validado.
Fingerprint SHA-256 DER:
`2eaee0e206741bf81b651f1ae33f44f0a92949ed6a99137a4aa8b0013486d295`.

Não copiar CA para o pacote, substituir certificados nem usar a CA do Nginx. O launcher
tem --ca-file apenas para fornecer CA sintética ao contrato local já existente; no modo
gerenciado qualquer caminho diferente do canônico é recusado pelo mesmo contrato.

Parâmetros únicos e exatos: sslaccept=strict, sslcert=caminho acima, connection_limit=1,
connect_timeout=5, pool_timeout=5, socket_timeout=10. Não há fallback por IP.
DNS gerenciado deve retornar somente 10.20.2.25. TLS Node valida cadeia/validade/SAN;
a sessão Prisma precisa de Ssl_cipher e TLS 1.2 ou 1.3. require_secure_transport=0
não dispensa TLS estrito nem o REQUIRE SSL das contas.

## 12. Autorização protegida

Template documental **inválido**, sem senha e sem autorização automática:

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
    "serverUuid": "6e94bb7f-c601-11f1-9b91-02001704771f",
    "version": "26.7.0-cloud",
    "caSha256": "2eaee0e206741bf81b651f1ae33f44f0a92949ed6a99137a4aa8b0013486d295"
  }
}
```

Somente após autorização humana D03, o operador materializa uma cópia fora do Git/pacote,
com approved true e expiresAt UTC curto (proposta: 30 minutos; contrato exige menos de 24 h).
Não reutilizar autorização sintética nem vencida. Arquivo regular 0600, proprietário do
executor, sem symlink, pais root ou executor sem escrita por terceiros.
D02 pode preparar a cópia inválida; não produz uma autorização utilizável automaticamente.

## 13. Credenciais e entrada protegida

A senha existente permanece sob custódia do operador. Não regenerar, recuperar pelo Codex
nem usar senha administrativa. O launcher recebe --credential-file apontando a um JSON 0600
contendo somente o campo password. Nunca colocar o valor em argv, export, histórico ou log.

Após D02 autorizado, o operador pode inserir a senha existente por TTY local privado.
Exemplo futuro, no terminal da VM, sem gravação de sessão e sem set -x:

```bash
test ! -e /run/traceflow-diagnostic
test ! -L /run/traceflow-diagnostic
sudo install -d -o traceflow -g traceflow -m 0700 /run/traceflow-diagnostic
sudo -u traceflow env -i PATH=/usr/bin:/bin HOME=/nonexistent \
  /usr/bin/python3 -I -c '
import getpass, json, os
assert os.isatty(0), "TTY_REQUIRED"
os.umask(0o077)
p = "/run/traceflow-diagnostic/password.json"
secret = getpass.getpass("Senha existente de traceflow_diag (entrada privada): ")
assert secret and not any(ord(c) < 32 or ord(c) == 127 for c in secret)
fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
with os.fdopen(fd, "w") as stream:
    json.dump({"password": secret}, stream)
'
```

Aprovar previamente que /run/traceflow-diagnostic é um destino novo, privado e não symlink;
se já existir, interromper e investigar, sem sobrescrever. Confirmar tmpfs e proteção de
swap/dumps. Unlink não promete apagamento físico. Esse procedimento não foi executado.

O launcher percent-encode a senha em memória e fornece somente a variável
HEATWAVE_DIAGNOSTIC_DATABASE_URL ao filho gerenciado. O processo canônico converte internamente
para DATABASE_URL para instanciar o Prisma compartilhado. A URL não é argumento nem saída.
Variáveis de banco herdadas, NODE_OPTIONS/NODE_PATH, overrides de engine e bypass TLS são
recusados. Sempre iniciar com env -i: um preload Node malicioso pode executar antes do JS
ter oportunidade de recusar NODE_OPTIONS.

## 14. Identidade Unix — decisão anterior a D01/D02

Proposta condicional: usar o usuário existente traceflow para esta sessão anterior ao primeiro
deploy, apenas se não houver API, worker ou outros processos nesse UID e o operador aceitar
a fronteira. Compartilhar UID permite inspeção de ambiente/memória/arquivos por processos
compatíveis; root também pode inspecioná-los. Depois do deploy, rever uma identidade exclusiva
e custódia correspondente, com autorização própria. Nenhum usuário/grupo/sudoers foi criado.
O launcher recusa root. Não ampliar privilégios para contornar uma falha.

## 15. D01 — transferência futura

Pré-requisitos: revisar pacote/manifesto/hashes, destino SSH e fingerprint SSH por canal já
confiável, identidade Unix, janela e cartão de autorização D01. Não confiar automaticamente
em ssh-keyscan, não consultar chaves pessoais pelo Codex.

Origem: pasta local da seção 8. Destino SSH conhecido informado: opc@144.22.183.254
(traceflowapp); confirmar antes da autorização. Destino transitório proposto, ainda inexistente:
`/home/opc/traceflow-prisma-diagnostic-efa7abc8191bbf10.incoming`, dono opc 0700.
O operador cria esse diretório novo na VM antes da cópia autorizada.

```bash
scp "$DIAGNOSTIC_ARTIFACT_DIR/traceflow-prisma-diagnostic-efa7abc8191bbf10.tar.gz" \
    "$DIAGNOSTIC_ARTIFACT_DIR/manifest.json" \
    "$DIAGNOSTIC_ARTIFACT_DIR/diagnostic-tool.py" \
    "$DIAGNOSTIC_ARTIFACT_DIR/artifact.json" \
    opc@144.22.183.254:/home/opc/traceflow-prisma-diagnostic-efa7abc8191bbf10.incoming/
```

Nenhuma transferência foi feita. Não usar esse comando antes da autorização D01.

## 16. D01 — instalação futura

Diretório proposto: `/opt/traceflow-diagnostics/<packageId>`, separado de releases/current,
webroot, storage de negócio e arquivos runtime.env/api.env/github-worker.env.
Confirmar os pais existentes; criar apenas os diretórios novos aprovados. Não alterar
permissões de diretórios preexistentes para fazer o verificador passar.

Em sessão root aprovada, para a primeira instalação, materializar somente os diretórios
novos abaixo. Se a base já existir, parar para revisar proprietário/permissões e preparar
um procedimento específico; não sobrescrever nem reparar automaticamente.

```bash
set +x
set -eu
umask 077
test "$(id -u)" -eq 0
DIAGNOSTIC_PACKAGE_ID=traceflow-prisma-diagnostic-efa7abc8191bbf10
DIAGNOSTIC_BASE=/opt/traceflow-diagnostics
DIAGNOSTIC_TRANSIT="/home/opc/$DIAGNOSTIC_PACKAGE_ID.incoming"
DIAGNOSTIC_STAGING_DIR="$DIAGNOSTIC_BASE/incoming/$DIAGNOSTIC_PACKAGE_ID"
DIAGNOSTIC_PACKAGE_DIR="$DIAGNOSTIC_BASE/$DIAGNOSTIC_PACKAGE_ID"
test ! -e "$DIAGNOSTIC_BASE"
test ! -L "$DIAGNOSTIC_BASE"
test -d "$DIAGNOSTIC_TRANSIT"
test ! -L "$DIAGNOSTIC_TRANSIT"
install -d -o root -g traceflow -m 0750 "$DIAGNOSTIC_BASE"
install -d -o root -g root -m 0700 "$DIAGNOSTIC_BASE/incoming"
install -d -o root -g root -m 0700 "$DIAGNOSTIC_STAGING_DIR"
for public_file in "$DIAGNOSTIC_PACKAGE_ID.tar.gz" manifest.json diagnostic-tool.py artifact.json; do
  test -f "$DIAGNOSTIC_TRANSIT/$public_file"
  test ! -L "$DIAGNOSTIC_TRANSIT/$public_file"
  install -o root -g root -m 0644 "$DIAGNOSTIC_TRANSIT/$public_file" "$DIAGNOSTIC_STAGING_DIR/$public_file"
done
```

Conferir previamente /opt root-owned, diretório real e sem escrita por terceiros. A base
dedicada evita depender da propriedade de /var/lib/traceflow ou /opt/traceflow, ainda não
reconfirmada nesta entrega. Não executar conteúdo pertencente a opc como root.

## 17. Verificação e extração futura

Na pasta staging root, verificar os valores fixos por canal confiável, não apenas artifact.json:

```bash
cd "$DIAGNOSTIC_STAGING_DIR"
sha256sum --check <<'CHECKSUMS'
5344f07d4387f17f57d57e1418e0772a2a10b10ca51079f2b9f41080152a730b  traceflow-prisma-diagnostic-efa7abc8191bbf10.tar.gz
e155bf4ccf3e323a4fd2b0b9bafb1451713d1127bf501b9ca7df7ca17be00ea1  manifest.json
a6b4a77d725f24c31f1a8368983ff8a28bde0db4c29de61e0a18b7d1cf254378  diagnostic-tool.py
CHECKSUMS
/usr/bin/python3 -I ./diagnostic-tool.py extract \
  --archive "$DIAGNOSTIC_STAGING_DIR/traceflow-prisma-diagnostic-efa7abc8191bbf10.tar.gz" \
  --sha256 5344f07d4387f17f57d57e1418e0772a2a10b10ca51079f2b9f41080152a730b \
  --manifest-sha256 e155bf4ccf3e323a4fd2b0b9bafb1451713d1127bf501b9ca7df7ca17be00ea1 \
  --destination "$DIAGNOSTIC_PACKAGE_DIR"
chown -R root:traceflow "$DIAGNOSTIC_PACKAGE_DIR"
chmod 0750 "$DIAGNOSTIC_PACKAGE_DIR"
```

Somente o destino novo criado pelo extrator é objeto do chown. Não usar caminhos vazios,
symlinks, globs nem diretórios de releases. Nenhum npm install/generate remoto é necessário.

## 18. D02 — preflight sem banco

Depois de autorização D02, confirmar hostname traceflowapp, aarch64, OL9.8,
SELinux Enforcing, Node /usr/bin/node 22.23.2, Python /usr/bin/python3 e OpenSSL 3.
Binário/path diferente requer revisão, não instalação automática.
Verificar usuário, pais, modos e CA root:root 0644/cert_t; comparar DER SHA e validade.
Não ler runtime.env nem credenciais de outras contas.

```bash
sudo -u traceflow env -i PATH=/usr/bin:/bin HOME=/nonexistent \
  /usr/bin/python3 -I "$DIAGNOSTIC_PACKAGE_DIR/diagnostic-tool.py" verify \
  --root "$DIAGNOSTIC_PACKAGE_DIR" \
  --manifest-sha256 e155bf4ccf3e323a4fd2b0b9bafb1451713d1127bf501b9ca7df7ca17be00ea1

sudo -u traceflow env -i PATH=/usr/bin:/bin HOME=/nonexistent \
  /usr/bin/node "$DIAGNOSTIC_PACKAGE_DIR/deploy/scripts/diagnostic-runtime.mjs"

openssl x509 -in /etc/pki/traceflow/mysql-ca.pem -noout -fingerprint -sha256 -dates
```

Esses comandos verificam pacote/plataforma/CA local e não autenticam no banco.
Verificação de rota/DNS na VM exige que sua leitura esteja incluída no cartão D02.
Nenhum D02 foi executado aqui.

## 19. B40/B41 — operações futuras separadas

Reutilizar a sessão administrativa protegida de
[OCI_HEATWAVE_INITIAL_BOOTSTRAP](OCI_HEATWAVE_INITIAL_BOOTSTRAP.md#7-execução-manual-futura-e-preflight-administrativo),
com /usr/bin/mysql e traceflow_admin informados pelo operador, senha no TTY,
--no-defaults --no-login-paths e VERIFY_IDENTITY. Não recriar B00–B30.

B40, somente mediante autorização mutável específica:

```sql
ALTER USER 'traceflow_diag'@'10.20.1.184' ACCOUNT UNLOCK;
```

B41, leitura separadamente autorizada:

```sql
SELECT User, Host, plugin, ssl_type, account_locked, password_expired
FROM mysql.user
WHERE User IN ('traceflow_api', 'traceflow_worker', 'traceflow_diag', 'traceflow_migrator')
ORDER BY User, Host;
SHOW GRANTS FOR 'traceflow_diag'@'10.20.1.184';
```

Só diag pode ter account_locked=N; demais continuam Y, REQUIRE SSL e grants aprovados.
B41 administrativo não substitui a verificação dos próprios grants efetivos no diagnóstico.

## 20. D03 — diagnóstico gerenciado futuro

Requer autorização própria para conexão autenticada, alvo exato, prazo, identidade Unix,
custódia, aprovação explícita do JSON e plano de D04/relock. Materializar authorization.json
0600 no diretório privado, usando somente os campos da seção 12. Revisar timestamps.

Primeiro --validate-only (sem DNS/SQL; ainda exige autorização válida e senha protegida):

```bash
sudo -u traceflow env -i PATH=/usr/bin:/bin HOME=/nonexistent LANG=C.UTF-8 TZ=UTC \
  /usr/bin/node "$DIAGNOSTIC_PACKAGE_DIR/deploy/scripts/diagnostic-launcher.mjs" \
  --authorization /run/traceflow-diagnostic/authorization.json \
  --credential-file /run/traceflow-diagnostic/password.json \
  --manifest-sha256 e155bf4ccf3e323a4fd2b0b9bafb1451713d1127bf501b9ca7df7ca17be00ea1 \
  --validate-only
```

Após CONFIG_VALID e dentro da autorização D03, executar exatamente o mesmo comando sem
--validate-only. Não mudar host, SSL, grants ou UUID para fazê-lo passar. Salvar apenas
stdout sanitizado em destino novo, privado; não ativar debug/trace nem capturar ambiente.
Preflight ≠ homologação. Somente PASS real com identidade, TLS, grants, writes=false e
disconnected=true pode servir de evidência PRISMA MANAGED.

## 21. D04 e relock futuro

D04: conferir término/exit code, ausência do processo filho e de sessões remanescentes
do diagnóstico; leitura administrativa, se necessária, deve integrar a autorização.
Registrar horário e código sanitizado. Não deixar conta desbloqueada indefinidamente.

Relock é operação mutável separada, que precisa estar explicitamente autorizado inclusive
para o caminho de erro. Usar o mesmo cliente administrativo protegido, com o seguinte lote
único — não chamar um B42 inexistente no helper do bootstrap:

```sql
ALTER USER 'traceflow_diag'@'10.20.1.184' ACCOUNT LOCK;
SELECT User, Host, account_locked
FROM mysql.user
WHERE User='traceflow_diag' AND Host='10.20.1.184';
```

Execução manual alternativa, depois da autorização de relock, em terminal root privado:

```bash
env -i PATH=/usr/bin:/bin HOME=/nonexistent MYSQL_HISTFILE=/dev/null \
  /usr/bin/timeout --foreground --signal=TERM --kill-after=5s 60s \
  /usr/bin/mysql --no-defaults --no-login-paths \
  --host=traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com \
  --port=3306 --protocol=TCP --user=traceflow_admin --password \
  --ssl-mode=VERIFY_IDENTITY --ssl-ca=/etc/pki/traceflow/mysql-ca.pem \
  --tls-version=TLSv1.2,TLSv1.3 --connect-timeout=5 --local-infile=0 \
  --batch --skip-reconnect < "$DIAGNOSTIC_RELOCK_SQL"
```

DIAGNOSTIC_RELOCK_SQL deve ser arquivo novo root:root 0600, sem symlink, somente com o lote
acima. ACCOUNT LOCK não encerra sessões existentes; confirmar desconexão primeiro. Se houver
sessão presa, interromper o fluxo e obter autorização para tratamento específico; não aplicar
KILL amplo. Não automatizar relock/kill neste pacote.

## 22. Falhas e interrupção

Diagnóstico tem deadline 30 s, probe TLS 5 s, connect/pool/socket 5/5/10 s.
Launcher limita filho a 35 s, stdout+stderr a 1 MiB e mata seu próprio filho em SIGINT/SIGTERM.
Saída de erro contém código sanitizado; stderr bruto do filho não é retransmitido.
Interrupção forçada não comprova encerramento SQL instantâneo: D04 precisa conferir sessões.

Checksum, CA, DNS, schema, usuário, UUID, versão, expiração, role ou grants divergentes,
engine/dependência ausente, timeout, arquivo aberto/symlink e TLS permissivo interrompem.
Não repetir automaticamente; preservar evidência sem segredo e investigar com nova autorização.

## 23. Limpeza e remoção futura

Depois de D04 e relock confirmados, remover somente password.json e authorization.json
criados para esta janela; confirmar o diretório exato e sua propriedade. Invalidar aprovações
vencidas; não perder a senha custodiada pelo operador. Remover diretório privado vazio.
Para desinstalar: verificar ausência de processo, caminho exato do packageId e checksum do
inventário; remover somente essa árvore e seus quatro arquivos de staging aprovados.
Não remover CA, /etc/traceflow, releases/current, storage ou outro pacote.
Não usar glob de limpeza nem limpeza automática em falha.

## 24. Evidências e reprodução

E01–E17 em `docs/deliveries/evidence/oci-deploy-06-1-prisma-diagnostic/`.
Separar operador, laboratório, histórico e procedimento não executado.

No laboratório OL9.8 sem mounts/segredos reais, dependências instaladas por npm ci em cópia
limpa de fontes e ferramentas verificadas:

```bash
python3 -B -m unittest discover -s deploy/tests -p test_diagnostic_package.py -v
node --test deploy/tests/diagnostic-launcher.test.mjs

python3 -B deploy/tests/run-diagnostic-package-lab.py \
  --mysql-base "$MYSQL_LAB_BASE" --node "$NODE22_EXECUTABLE" \
  --artifact-directory "$DIAGNOSTIC_ARTIFACT_DIR" --report "$LOCAL_DIAGNOSTIC_REPORT"

python3 -B deploy/tests/run-diagnostic-quality.py \
  --mysql-base "$MYSQL_LAB_BASE" --node "$NODE22_EXECUTABLE" --report "$LOCAL_QUALITY_REPORT"
```

O último comando aplica 68 migrations exclusivamente na instância sintética que cria, por
autorização adicional do usuário nesta sessão. Nunca usá-lo na VM OCI. O primeiro harness
mantém outro schema vazio e sem migrations. Ambos reutilizam persistence_lab.Lab e eliminam
somente os próprios recursos. Não aceitam URL de banco externa.

## 25. Limitações e dependências humanas

O pacote permanece candidato de working tree revisável. Não foi instalado na VM OCI.
Não há observação direta de grants expandidos public no serviço, nem prova Prisma gerenciada.
A versão cloud difere da Community. Decidir identidade Unix/custódia e aprovar D01/D02;
aprovar B40/B41, D03, D04 e relock em escopos próprios. Sem segredos no chat.

## 26. Próximos gates

D01 → D02 → B40 → B41 → D03 → D04 + relock verificado.
Depois, resolver em escopo próprio: migration job exige literal +00:00 e o serviço retorna
UTC; o fluxo de primeiro schema vazio exige backupVerified/backupReference/restoreRehearsed.
Não fabricar backup de dados inexistentes, alterar flags ou modificar release-database.mjs.
Homologar backup/restore, retenção, RPO/RTO e runtime antes de autorizar OCI-DEPLOY-07.

## 27. Adendo OCI-DEPLOY-06.1.1 — instrumentação local de P2010

As seções 1–26 e as evidências E01–E17 acima permanecem como registro da entrega anterior.
Este adendo descreve a instrumentação local baseada no HEAD
`cf15522587b3de0293c951c83ffdd0165cd5d6e5`, branch `daniel-dev`. Não gera pacote de distribuição,
não atualiza o pacote instalado e não autoriza conexão ou operação remota.

Estado mais recente informado pelo operador, sem reconfirmação remota nesta entrega:
D01/D02/B40/B41 PASS; D03 FAIL com `P2010` no pacote
`traceflow-prisma-diagnostic-efa7abc8191bbf10`; D04/limpeza concluídos. Conta `traceflow_diag`
bloqueada novamente (`account_locked=Y`), zero sessões remanescentes, credenciais temporárias
removidas e swap reativada. Schema vazio, sem migrations. A causa SQL permanece desconhecida.

### 27.1 Contrato de falha do diagnóstico canônico

O stdout contém exatamente um objeto JSON terminado por newline. Exemplo **ilustrativo**,
sem atribuir a falha real à consulta ou ao código abaixo:

```json
{
  "status": "FAIL",
  "code": "P2010",
  "phase": "SQL_IDENTITY",
  "mysqlCode": "1227",
  "writes": false
}
```

- `code`: preserva o código Prisma original, incluindo `P2010`. Códigos estruturados aceitos
  são strings de 1–64 caracteres ASCII maiúsculos, dígitos ou underscore; conteúdo inválido
  ou ausente produz `DIAGNOSTIC_FAILED`, sem mensagem ou stack.
- `phase`: identificador constante da operação que falhou; não contém SQL, parâmetros,
  nomes recebidos do servidor, caminhos ou conteúdo de arquivos.
- `mysqlCode`: opcional, obtido exclusivamente de `error.meta.code`. Aceita número inteiro
  ou string decimal canônica entre **1 e 65535**, emitido sempre como string decimal.
  O intervalo acompanha o campo `int<2>` do [MySQL ERR_Packet](https://dev.mysql.com/doc/dev/mysql-server/latest/page_protocol_basic_err_packet.html).
  Zero, negativos, frações, valores fora do intervalo, espaços, sinais, zeros à esquerda,
  notação exponencial/hexadecimal, controles, objetos, arrays, `N/A` e ausência são omitidos.
  A omissão não muda `code` nem converte FAIL em PASS. Não se tenta extrair números da mensagem.
- `writes`: permanece `false`; toda falha termina com exit code diferente de zero.

O serializador lê apenas propriedades próprias de dados; não invoca getters, `toString`
ou `toJSON` do erro/metadata. Não serializa Error, meta completo, mensagem, stack, SQL,
DATABASE_URL, credencial ou arquivo privado. Não há logs de progresso no stdout.

O launcher valida a lista de campos de topo por status; FAIL exige `status`, `code`, `phase`
e `writes=false`, permitindo apenas `mysqlCode` adicional em formato canônico. Campos extras
são recusados. O launcher acrescenta `packageId` somente após essa validação, a partir do
recibo de integridade. Os formatos de sucesso PASS/CONFIG_VALID permanecem inalterados.
Falhas próprias do launcher (integridade, supervisão, contrato de saída etc.) preservam seu
formato anterior, sem atribuir uma etapa SQL que o launcher não conhece. Stderr do filho
continua suprimido; nenhum debug/trace deve ser habilitado.

### 27.2 Identificadores de etapas

| Identificador         | Operação identificada                                         |
| --------------------- | ------------------------------------------------------------- |
| PREVALIDATION         | Argumentos, autorização protegida e contrato de conexão       |
| TLS_CA                | Leitura protegida e validação da CA pública                   |
| DNS_IDENTITY          | Verificação do DNS gerenciado                                 |
| TLS_PROBE             | Handshake TLS independente, sem autenticação SQL              |
| PRISMA_INIT           | Verificação da versão e importação do cliente compartilhado   |
| SQL_IDENTITY          | Q1: consulta original de identidade, incluindo @@datadir      |
| SERVER_IDENTITY       | Validação do resultado de Q1                                  |
| SQL_SESSION_TLS       | Q2: SHOW SESSION STATUS original                              |
| SESSION_TLS           | Validação de cipher/versão TLS da sessão Prisma               |
| SQL_SERVER_PARAMETERS | Q3: consulta original dos parâmetros e roles                  |
| ROLES                 | Validação das roles obrigatórias e ativas                     |
| SQL_DIRECT_GRANTS     | Q4: SHOW GRANTS FOR CURRENT_USER original                     |
| DIRECT_GRANTS         | Validação dos grants diretos                                  |
| SQL_PUBLIC_GRANTS     | Q5: expansão original de public, somente quando obrigatória   |
| EFFECTIVE_GRANTS      | Validação dos grants efetivos                                 |
| SQL_SELECT_ONE        | Q6: SELECT 1 original                                         |
| DISCONNECT            | Encerramento do Prisma quando não existe falha primária       |
| UNKNOWN               | Proteção do serializador contra identificador não reconhecido |

As seis consultas, sua ordem e a condição de Q5 foram preservadas. Não foi removido @@datadir,
alterado qualquer GRANT ou modificado o cliente Prisma compartilhado, schema ou migrations.

### 27.3 Encerramento, prazo e interpretação

O resultado aguarda a tentativa de desconexão. Há uma única tentativa de `$disconnect`
quando o cliente foi obtido. Se a consulta ou validação já falhou, o erro da limpeza não
substitui `code`, `phase` ou `mysqlCode` da falha primária e não gera outro JSON.
Se apenas a desconexão falhar, o resultado é FAIL/DISCONNECT; PASS só é emitido após sucesso
da desconexão. CONFIG_VALID continua sem carregar Prisma nem abrir conexão.

O deadline canônico permanece 30 segundos. Se expirar sem erro anterior, emite
`DIAGNOSTIC_DEADLINE` com a fase em andamento e encerra com código 1. Se expirar durante a
limpeza após outro erro, emite a falha primária já sanitizada e encerra com código 1.
A proteção de emissão única também impede uma segunda saída se o fluxo retomar.
Permanecem os limites do launcher de 35 segundos/1 MiB, sinais e controle do próprio filho,
assim como os timeouts TLS/Prisma e as verificações de integridade, identidade, roles e grants.

`phase` identifica a chamada ou validação, não a expressão individual de um SELECT composto
nem o estágio interno prepare/execute/decode do engine. `mysqlCode` permite classificar um
erro nativo, mas pode estar ausente; ausência não comprova falha de TLS ou privilégio.
Uma falha de metadados não autoriza ampliar permissões, omitir verificações ou executar
migrations. A saída FAIL não atesta ausência de sessões; D04 continua necessário, inclusive
quando o prazo expirar. A instrumentação não resolve nem comprova a causa do P2010 anterior.

### 27.4 Validação local sem banco

Com Node 22 e as dependências já instaladas, na raiz do repositório:

```bash
node --experimental-vm-modules --test \
  deploy/tests/heatwave-diagnostic.test.mjs \
  deploy/tests/diagnostic-launcher.test.mjs
```

O novo teste executa o entrypoint real em um contexto JavaScript com imports explicitamente
substituídos, Prisma simulado, arquivos/CA/DNS/TLS sintéticos e relógio controlado. Nenhum
cliente real ou conexão de rede é carregado pelo entrypoint testado. O módulo de segurança
real é usado nas validações puras. A flag experimental serve somente ao harness de testes,
nunca ao comando operacional do diagnóstico. Não são criados arquivos privados, banco ou
pacote, e nenhuma migration é executada. Não usar os harnesses persistentes da seção 24
como validação desta entrega.

Cobertura: P2010 em cada SQL, parada após falha, ordem/texto das seis consultas, Q5 condicional,
modos local/gerenciado, pré-validação, CA/DNS/TLS, identidade, roles/grants, sanitização,
metadata maliciosa, validate-only, desconexão, falha dupla, deadline e contrato do launcher.

### 27.5 Próxima homologação — proposta OCI-DEPLOY-06.1.2

1. Revisar e aprovar separadamente esta implementação local e seus testes. D03 permanece FAIL.
2. Em entrega própria autorizada, gerar e validar um novo pacote ARM64 com manifesto e hashes
   novos. Não editar o pacote `efa7abc8191bbf10`, reaproveitar seus pins para fontes modificadas
   ou misturar launcher/diagnóstico de versões diferentes: FAIL sem phase será recusado pelo
   novo launcher. Não existe novo packageId aprovado nesta entrega.
3. Preparar os comandos exatos com os novos pins e revisar as autorizações D01/D02, custódia,
   B40/B41, D03 e D04/relock. Conta bloqueada e ausência de credenciais continuam sendo o
   estado de repouso. As autorizações anteriores não autorizam uma nova tentativa.
4. Somente após autorização explícita, executar validate-only e uma tentativa diagnóstica;
   preservar apenas o JSON sanitizado, exit code e identificação do pacote. Sem retries.
5. Concluir D04, relock verificado e limpeza mesmo em falha. Interpretar phase/mysqlCode
   antes de propor qualquer alteração SQL ou de privilégios. Encerrar os gates gerenciados
   apenas com evidência real; não iniciar OCI-DEPLOY-07 automaticamente.

## 28. OCI-DEPLOY-06.1.2 — empacotamento offline autorizado

O operador autorizou acrescentar `offline` à receita existente exclusivamente nesta entrega,
sem instalações, downloads, SQL, acesso à OCI ou execução em VM. O modo `build` nativo mantém
seus requisitos. Não contornar suas verificações nem executar `npm ci` nesta etapa.

O modo offline verifica primeiro os pins externos do tar e do manifesto do pacote anterior,
extrai com o mesmo extrator fechado e valida todos os arquivos. Reutiliza **somente os 13
arquivos de dependências** da allowlist, incluindo o engine ARM64. Os módulos internos e
os dois drivers são copiados integralmente da nova exportação revisada. Não copia o launcher
antigo nem acessa `node_modules` do DEV para montar o runtime.

A reutilização exige igualdade dos hashes de package.json, lockfile, schema, cliente Prisma
compartilhado, módulos de segurança preservados, preflight e verificador. Exige versões
Prisma 6.12.0/dotenv compatíveis com o lockfile e geração sem descoberta de .env. O schema
gerado anterior é preservado byte a byte: o gerador original normalizou alinhamentos de
espaços em relação ao schema fonte, sem diferença nos tokens observada nesta auditoria.
Não regenerar nem editar esse arquivo para simular uma geração nova.

A exportação agora inclui, para rastreabilidade, os dois testes da 06.1.1, este runbook e o
teste do modo offline. As seis alterações da 06.1.1 ficam identificadas em `sourceFiles`:
os três módulos operacionais entram no runtime; testes/documentação permanecem na exportação
de fontes, fora da allowlist de execução. O tar continua com 24 arquivos inventariados e
manifest.json como 25º membro. Não é uma release da aplicação.

Receita local, com diretórios de saída novos e pais previamente protegidos:

```bash
node scripts/package-diagnostic.mjs export --output "$DIAGNOSTIC_SOURCE_DIR"
node scripts/package-diagnostic.mjs offline \
  --source "$DIAGNOSTIC_SOURCE_DIR" \
  --source-sha256 "$DIAGNOSTIC_SOURCE_SHA256" \
  --base-archive "$DIAGNOSTIC_PREVIOUS_DIR/traceflow-prisma-diagnostic-efa7abc8191bbf10.tar.gz" \
  --base-sha256 5344f07d4387f17f57d57e1418e0772a2a10b10ca51079f2b9f41080152a730b \
  --base-manifest-sha256 e155bf4ccf3e323a4fd2b0b9bafb1451713d1127bf501b9ca7df7ca17be00ea1 \
  --output "$DIAGNOSTIC_NEW_ARTIFACT_DIR"
```

Não executar esses comandos com variáveis vazias, diretórios existentes ou fontes divergentes.
O packageId deriva do novo sourceSha256 e deve diferir do anterior. Tar e manifesto recebem
hashes novos; o SHA do verificador é **recalculado** e pode continuar igual, pois seus bytes
não mudaram. Identidade nova não exige alterar arquivos intactos apenas para mudar hashes.

`buildMethod=offline-verified-dependencies` distingue a montagem da geração nativa original.
`nodeVersion`, `npmVersion` e `openssl` descrevem a toolchain nativa herdada; `packager` registra
o host/toolchain que montou o pacote. `runtimeProvenance` registra os pins do pacote anterior
e os hashes dos 13 arquivos reutilizados. `validation.nativeRuntime=NOT_EXECUTED` impede
interpretar essa montagem como novo PASS ARM64. Uma extração de verificação precede a
publicação em diretório novo; saídas existentes são recusadas.

Testes locais sem banco, com diretórios temporários sintéticos próprios:

```bash
python3 -B -m unittest discover -s deploy/tests -p 'test_diagnostic_*.py' -v
node --experimental-vm-modules --test \
  deploy/tests/heatwave-diagnostic.test.mjs deploy/tests/diagnostic-launcher.test.mjs
```

O novo teste cobre procedência, cópia das fontes atuais, reutilização exata, reprodução dos
bytes e recusa de pins, inputs do gerador, versões, descoberta de .env, fontes/receitas,
destino existente e packageId reutilizado. Fixtures ELF sintéticas não demonstram execução
nativa. Não executar os harnesses de MySQL/qualidade persistente nesta entrega.

Os novos pins, inventário, evidências locais e procedimento específico de instalação estarão
em [OCI_DEPLOY_06_1_2_PRISMA_DIAGNOSTIC_PACKAGING_REPORT](../deliveries/OCI_DEPLOY_06_1_2_PRISMA_DIAGNOSTIC_PACKAGING_REPORT.md).
As seções anteriores e E01–E17 continuam históricas; não usar os pins antigos para o novo tar.

OCI-DEPLOY-06.1.3 será somente transferência/instalação e verificações locais da VM, mediante
autorização própria. D03 continua FAIL. O launcher `--validate-only` também exige credencial
e autorização válidas: não materializar esses arquivos na etapa de instalação. Nela, limitar
a verificação sem banco ao extrator, preflight nativo e leitura/validação da CA pública.
Uma nova conexão Prisma–HeatWave, B40/B41 e D04/relock exigem autorização separada.

## 29. Adendo OCI-DEPLOY-06.1.5 — auditoria de roles obrigatórias

Data: 16/10/2026. Este adendo descreve a implementação local atual; as seções anteriores
permanecem registros históricos. Não autoriza empacotamento, instalação, conexão, alteração
de grants ou reexecução do D03. A execução real da **06.1.4 permanece FAIL**.

### 29.1 Evidência observada e limite do diagnóstico causal

O operador informou `P2010`, fase `SQL_PUBLIC_GRANTS`, `mysqlCode="3530"`,
`writes=false`, no pacote `traceflow-prisma-diagnostic-fa4a318dfa1c636d`.
A consulta era `SHOW GRANTS FOR CURRENT_USER USING 'public'@'%'`.
O código 3530 é `ER_ROLE_NOT_GRANTED`, conforme o
[catálogo oficial de erros MySQL](https://dev.mysql.com/doc/mysql-errors/8.4/en/server-error-reference.html#error_er_role_not_granted).
Isso identifica a rejeição da expansão solicitada; não demonstra um defeito de TLS,
de `@@datadir`, de prepared statements ou do Prisma 6.12.0.

A hipótese de que `USING` sempre exige um GRANT **explícito** não foi confirmada.
O [manual de roles 26.7](https://dev.mysql.com/doc/refman/26.7/en/roles.html) descreve
roles obrigatórias como concessões implícitas e distingue concessão de ativação.
`mandatory_roles=public` não comprova existência/resolução nem ativação da role.
`CURRENT_ROLE()` informa as roles ativas, não o inventário de todas as roles aplicáveis.
Uma role nomeada na configuração pode não existir; o manual prevê que seja ignorada.

Além disso, `mysql_show_grants()` no
[código oficial upstream](https://github.com/mysql/mysql-server/blob/trunk/sql/auth/sql_authorization.cc)
consulta tanto roles concedidas quanto obrigatórias antes de emitir 3530. Esse comportamento
também aparece no [tag mysql-8.4.0](https://github.com/mysql/mysql-server/blob/mysql-8.4.0/sql/auth/sql_authorization.cc).
Essas fontes não são prova dos bytes do build gerenciado `26.7.0-cloud`.
Identidade efetiva da role, resolução/cache e particularidades do serviço continuam hipóteses.
O valor de `CURRENT_ROLE()` da execução 06.1.4 não foi fornecido; não inferir `NONE` nem `public`.

### 29.2 Fundamentação e estratégia

O [manual SHOW GRANTS 26.7](https://dev.mysql.com/doc/refman/26.7/en/show-grants.html)
distingue a forma sem `FOR`, que inclui roles obrigatórias, da forma com `FOR`.
Consultar o próprio usuário não exige SELECT no schema `mysql`; consultar outra conta/role
tem requisitos diferentes. Não adicionar permissões administrativas ao diagnóstico.

A [documentação de autorização do servidor, identificada como 26.7.0](https://dev.mysql.com/doc/dev/mysql-server/latest/AUTHORIZATION_PAGE.html)
explica a agregação dos privilégios das roles ativas em `SHOW GRANTS`.
Listar uma atribuição de role não comprova, sozinho, que seus privilégios foram expandidos.
O diagnóstico escolhe o caminho **antes** da execução SQL, sem fallback baseado em erro:

| Metadata aceita                                  | Auditoria adicional                                              | Expansão obrigatória                                              |
| ------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| Nenhuma role obrigatória; `CURRENT_ROLE()=NONE`  | Grants do próprio usuário, recusando qualquer atribuição de role | Não há Q5; `direct-only`                                          |
| Somente `public@%`, ativa                        | Inventário completo de roles aplicáveis                          | `SHOW GRANTS`; `active-session`                                   |
| Somente `public@%`, inativa                      | Mesmo inventário completo                                        | `SHOW GRANTS FOR CURRENT_USER USING 'public'@'%'`; `using-public` |
| Qualquer outra combinação ou metadata malformada | Recusa                                                           | FAIL                                                              |

No caminho inativo a consulta original continua necessária e **pode continuar falhando com
3530 no HeatWave**. Nenhum P2010/3530 é convertido em sucesso, repetido ou substituído por uma
consulta mais permissiva. Se a expansão não puder ser demonstrada com a conta atual, manter
FAIL e solicitar revisão humana das evidências, sem conceder privilégios adicionais.

`SHOW GRANTS FOR CURRENT_USER` continua sendo auditado. Não pressupor que seu resultado seja
equivalente ao comando sem `FOR`, nem que contenha exclusivamente direitos diretos em todas
as situações: a implementação upstream também considera roles ativas para CURRENT_USER.
Todos os direitos apresentados são validados, sem subtrações ou descarte de direitos herdados.

### 29.3 Inventário de roles e validação dos grants

A nova consulta de metadata, executada somente com `mandatoryPublic=true`, é:

```sql
SELECT USER, HOST, GRANTEE, GRANTEE_HOST, ROLE_NAME, ROLE_HOST,
       IS_GRANTABLE, IS_MANDATORY
FROM information_schema.APPLICABLE_ROLES;
```

A [definição oficial de APPLICABLE_ROLES](https://dev.mysql.com/doc/refman/26.7/en/information-schema-applicable-roles-table.html)
descreve o inventário visível para o usuário corrente e as colunas utilizadas.
O [código oficial da view](https://github.com/mysql/mysql-server/blob/trunk/sql/dd/impl/system_views/applicable_roles.cc)
inclui as roles obrigatórias como sementes e percorre as relações recursivamente.
Não há WHERE, filtro de role ou LIMIT que esconda outra role. Não se consulta `mysql.role_edges`
diretamente. A disponibilidade e o comportamento dessa view no build gerenciado ainda precisam
ser homologados; erro SQL, resultado vazio, duplicado ou inesperado implica FAIL.

O contrato aceita exatamente uma linha: `public@%`, obrigatória (`YES`), não delegável (`NO`),
cujo usuário/host e destinatário correspondem a `CURRENT_USER()` validado. Outra role, herança
aninhada, ADMIN OPTION, host diferente ou colunas inesperadas são recusados, inclusive quando
os privilégios da role adicional seriam apenas de leitura.

A auditoria dos grants agora valida a coluna única de SHOW GRANTS, tipos, caracteres de
controle, duplicatas, destinatário e sintaxe completa. Não executa getters nem coerções para
ler os valores. Não ignora colunas adicionais ou sufixos desconhecidos.

Para `role=diagnostic`, permanece a allowlist anterior: `USAGE ON *.*` e `SELECT`/`SHOW VIEW`
exclusivamente em `traceflow.*`, com SELECT obrigatório. SHOW VIEW já era permitido pelo
validador; isso não altera nem solicita o grant SELECT aprovado para a conta real.
São recusados DML, DDL, privilégios administrativos/dinâmicos, leitura global, outro schema,
grants de tabela/coluna/rotina fora do formato revisado, PROXY, GRANT OPTION, ADMIN OPTION e
REVOKE/partial revokes. Formatos legítimos não reconhecidos também falham, por segurança.

A atribuição de `public` é identificada separadamente, não tratada como evidência suficiente
de expansão. O resultado final exige prova do inventário, preservação dos privilégios já
observados e, no comando sem FOR, presença da atribuição obrigatória. No caminho USING,
uma atribuição explícita observada anteriormente também precisa continuar presente.

### 29.4 Sessão, consultas e saída operacional

Todas as consultas passam pelo cliente de uma única transação interativa Prisma, contendo
somente leituras. Isso mantém CURRENT_ROLE e a expansão na mesma conexão, conforme o
[contrato Prisma v6 de transações](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions).
Não ativa roles, não altera grants e não define isolamento ou configuração TLS.
O Prisma gerencia início e término/rollback da transação; não confundir ausência de escrita
de dados com ausência desses comandos de controle de sessão na futura execução real.
SHOW GRANTS não está entre as
[instruções MySQL de commit implícito](https://dev.mysql.com/doc/refman/26.7/en/implicit-commit.html).

Os limites continuam: pool de uma conexão, connect/pool timeout de 5s, socket de 10s,
deadline global de 30s e supervisor de 35s. A transação tem `maxWait=5000` e `timeout=30000`;
o deadline global continua limitando o tempo total. A falha primária é sanitizada antes do
rollback, para que falhas/prazos no rollback ou na desconexão não a ocultem.

Ordem SQL: identidade → TLS → parâmetros → grants do próprio usuário → inventário de roles
(condicional) → expansão de public (condicional) → SELECT 1. Os seis textos SQL históricos
permanecem intactos; Q5 escolhe o novo `SHOW GRANTS` apenas quando public está ativa.
As consultas de identidade, TLS e parâmetros, incluindo `@@datadir`, não foram alteradas.

Fases adicionais, todas constantes: `SESSION_START`, `SESSION_END`, `SQL_ROLE_GRAPH` e
`ROLE_GRAPH`. As fases anteriores, incluindo `SQL_PUBLIC_GRANTS`, continuam válidas.
Novas recusas estruturadas incluem `MALFORMED_GRANTS`, `GRANT_IDENTITY_MISMATCH`,
`MALFORMED_ROLE_GRAPH`, `ROLE_GRAPH_UNVERIFIED`, `UNREVIEWED_ROLE_GRAPH` e
`EFFECTIVE_GRANTS_UNVERIFIED`.

O JSON de falha mantém exatamente o contrato da seção 27: `status`, `code`, `phase`,
`writes=false`, e `mysqlCode` opcional decimal canônico entre 1 e 65535. O launcher acrescenta
o packageId do futuro artefato verificado. Sem mensagens, SQL, objetos Error/meta, stack,
senhas ou URLs na saída operacional; um único JSON após encerramento ou deadline.
O launcher não foi modificado: sua validação usa a enumeração compartilhada de fases.

Em PASS, `roleVerification` conserva `mandatoryPublic`, `activePublic` e `expanded`,
e acrescenta `graphVerified` e `strategy` (`direct-only`, `active-session` ou `using-public`).
Esses campos são booleanos/constantes; o inventário e os grants brutos não são impressos.

### 29.5 Validação local e limites

Testes do diagnóstico/launcher: **138 PASS**. Helpers de conexão: **50 PASS**.
TLS e arquivos protegidos, com certificados sintéticos e peer em loopback: **10 PASS**.
Total: **198 PASS**, sem MySQL, migrations ou credenciais reais.
Comandos, verificações estáticas, limitações e cobertura dos 30 cenários estão no
[relatório OCI-DEPLOY-06.1.5](../deliveries/OCI_DEPLOY_06_1_5_MANDATORY_ROLES_AUDIT_REPORT.md).

Os doubles validam o comportamento do cliente para respostas fundamentadas nas fontes oficiais;
não reproduzem nem comprovam o mecanismo ACL, a view ou os prepared statements do HeatWave.
Os testes separam public explícita/implícita e ativa/inativa; não presumem que a execução real
tenha usado qualquer dessas combinações. D03 e compatibilidade gerenciada continuam pendentes.

A transação fixa a sessão, mas não congela mudanças administrativas de roles/grants feitas
por outras conexões. A futura janela deve manter essa configuração estável. Uma auditoria
é uma observação pontual, não uma garantia sobre grants concedidos posteriormente.

### 29.6 Próxima homologação — depende de autorização separada

1. Revisar fontes/diff e testes. Autorizar separadamente novo empacotamento ARM64, com as
   fontes atuais, mesmo Prisma 6.12.0 e engine, novo packageId/manifesto/checksums. Não editar
   nem reutilizar a identidade dos pacotes anteriores.
2. Autorizar instalação/verificação do novo artefato em diretório exclusivo. Revalidar o
   runtime ARM64 e a CA sem iniciar D03. Nenhuma dessas operações ocorreu nesta entrega.
3. Somente em nova janela autorizada, preparar credencial/autorização protegidas e realizar
   um diagnóstico. Não mudar a conta SELECT, ativar roles ou conceder acesso administrativo
   para fazer a validação passar.
4. Exigir inventário completo, expansão válida, direitos dentro da allowlist, identidade/TLS
   válidos, SELECT 1, término de sessão e JSON único. Qualquer erro SQL, 3530, grafo
   desconhecido/incompleto ou divergência mantém FAIL.
5. Se continuar bloqueado, revisar sob autorização própria a identidade real de public,
   sua existência/resolução, roles ativas/aplicáveis e comportamento do build gerenciado.
   Evidência administrativa pode ser analisada pelo responsável; não conceder SELECT em
   `mysql.*` à conta de diagnóstico nem contornar a falha automaticamente.
6. Executar D04/relock, confirmar bloqueio e zero sessões/processos, remover os arquivos
   temporários e restaurar o estado operacional. Preservar o FAIL histórico da 06.1.4.

## 30. Complementação OCI-DEPLOY-06.1.5 — atestado administrativo de ausência

Data: 16/10/2026. Baseline: `daniel-dev`, HEAD
`8f6681c4e0b74abfb1959c63539ea0861984b05c`, working tree inicialmente limpo.

**Estado desta complementação: PARTIAL. Não está pronta para empacotamento.**
Esta seção substitui as orientações operacionais da seção 29 para a versão candidata;
as seções anteriores preservam o histórico. A 06.1.4 e o D03 continuam **FAIL**.
Nenhuma autorização para conectar, coletar evidência, desbloquear conta ou executar
qualquer etapa futura decorre desta implementação.

### 30.1 Evidência comunicada e decisão de segurança

O operador informou: `mandatory_roles=public`, `activate_all_roles_on_login=0`,
contagem administrativa de contas de nome `public` igual a zero e erro 1141 ao
consultar os grants de `public@%`. Esses fatos não foram recoletados nesta tarefa.
A documentação [MySQL 26.7 — roles](https://dev.mysql.com/doc/refman/26.7/en/roles.html)
distingue configuração, existência, concessão e ativação: uma role configurada
como obrigatória, mas ausente de `mysql.user`, não é concedida aos usuários.

O zero obtido por consulta administrativa bem-sucedida sustenta ausência naquele
instante. O 1141 e o P2010/3530 histórico não substituem essa evidência. Nenhum dos
dois erros é tratado como sucesso ou dispara retry/fallback. Um nome em
`mandatory_roles`, `CURRENT_ROLE()=NONE` ou uma atribuição em `SHOW GRANTS`
isoladamente não prova ausência nem auditoria dos privilégios herdados.

| Estado  | Evidência                                                                          | Comportamento candidato                                                                    |
| ------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| ABSENT  | Contrato e custódia válidos; consulta de existência bem-sucedida com contagem zero | Continua as verificações de sessão e grants; ainda termina em FAIL no bloqueio de warnings |
| PRESENT | Contagem positiva de contas de nome public                                         | FAIL antes do SQL; não há auditoria de herança habilitada                                  |
| UNKNOWN | Evidência ausente, inválida, vencida, incompleta ou contraditória                  | FAIL; nenhum atalho por erro SQL                                                           |

Uma contagem positiva em qualquer host bloqueia conservadoramente o caminho de
ausência; não é prova da identidade exata ou dos privilégios de `public@%`.
O estado ABSENT atestado é necessário, mas não suficiente para PASS.

### 30.2 Contrato fechado v1

O atestado é JSON UTF-8, até **16 KiB**, sem campos extras em qualquer objeto,
membros duplicados (inclusive nomes equivalentes escapados), getters ou coerções.
O parser limita a profundidade. IDs de evidência, execução e referência de grants
são UUID v4 canônicos em minúsculas; identificadores reais não são inventados.

| Caminho                     | Conteúdo exigido                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `formatVersion`, `kind`     | `1`, `mysql-role-existence-attestation`                                                                                 |
| `evidenceId`, `executionId` | IDs distintos, iguais aos da autorização atual                                                                          |
| `collectedAt`, `expiresAt`  | UTC canônico `YYYY-MM-DDTHH:mm:ss.sssZ`                                                                                 |
| `operatorId`                | Identificação administrativa, 1–64 caracteres alfanuméricos, ponto, hífen ou sublinhado; primeiro alfanumérico          |
| `mode`, `source`            | Produção: `oci-read-only` e `administrative-read-only`; laboratório: `local-isolated` e `synthetic-lab`                 |
| `target`                    | Exatamente `serverUuid`, `version`, `host`, `expectedAddress`, `port`, `caSha256`, `schema`, `account`                  |
| `role`                      | Exatamente `name: public`, `host: %`                                                                                    |
| `observations`              | Exatamente `mandatoryRoles: public`, `activateAllRolesOnLogin: 0`, `existence`                                          |
| `observations.existence`    | `queryId: MYSQL_USER_PUBLIC_COUNT_V1`, `status: SUCCESS`, `accountCount` inteiro seguro não negativo                    |
| `grantsAudit`               | Exatamente `referenceId`, `sha256`, `status: PASS`, `account`, `schema`, `privileges: [SELECT]`, `explicitRoleCount: 0` |
| `package`                   | Exatamente `packageId`, `manifestSha256`                                                                                |

O identificador `MYSQL_USER_PUBLIC_COUNT_V1` corresponde exclusivamente à coleta
administrativa `SELECT COUNT(*) FROM mysql.user WHERE User = 'public'`, concluída
com sucesso. Conta todos os hosts; zero também exclui `public@%`. O diagnóstico
não executa essa consulta nem solicita SELECT em `mysql.*`. Não basta preencher
`status: SUCCESS`: o operador deve conservar o resultado original bem-sucedido e
a auditoria referenciada sob custódia administrativa. `grantsAudit.sha256` fixa
os bytes desse registro independente; o programa não abre esse registro nem
revalida a coleta administrativa por uma nova conexão.

O target deve coincidir integralmente com a autorização. Em produção são fixados
FQDN `traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com`, IP `10.20.2.25`,
porta `3306`, versão `26.7.0-cloud`, schema `traceflow` e conta completa
`traceflow_diag@10.20.1.184`. UUID e fingerprint SHA-256 da CA vêm da evidência
autorizada, não de valores fabricados. O fingerprint é o SHA-256 DER do certificado,
conforme o contrato existente da CA.

A autorização ganha um objeto fechado `roleAttestation` com exatamente:
`formatVersion: 1`, `evidenceId`, `sha256`, `executionId`, `packageId`,
`manifestSha256`. Seu `target.account` inclui nome **e host**. Os hashes são
64 dígitos hexadecimais minúsculos; `sha256` cobre os bytes exatos do atestado,
incluindo espaços e newline. Os demais contratos da autorização continuam vigentes.
O packageId segue `traceflow-prisma-diagnostic-` mais 16 dígitos hexadecimais.
A vinculação confere o manifesto real protegido, seu hash e o recibo do verificador.

Não há exemplo operacional preenchido, gerador de atestados, credenciais, arquivo de
autorização ou atestado real nesta entrega. Fixtures ficam somente nos testes,
em memória. O rótulo de origem não autentica o conteúdo por si só: um administrador
confiável é responsável por nunca instalar uma fixture ou declaração sem coleta.

### 30.3 Custódia, revalidação e validade temporal

Caminho operacional fixo:
`/etc/traceflow/diagnostic-evidence/<evidenceId>.json`. Não se aceita caminho
arbitrário na autorização. O pacote deverá estar em
`/opt/traceflow-diagnostics/<packageId>`.

O leitor exige Linux e executor não root. Arquivo regular de root, link count 1,
modo 0400/0440/0600/0640, leitura efetivamente permitida e escrita efetivamente
negada ao executor. Na instalação futura, 0440 ou 0640 com grupo administrativo
que permita somente leitura ao executor são exemplos compatíveis; 0400/0600
sem permissão de leitura resultarão em FAIL. Não se altera permissão nesta etapa.

Todos os ancestrais precisam ser diretórios de root sem escrita para grupo/outros.
São verificados canonicalização, ausência de symlinks, `O_NOFOLLOW`, limites de
leitura e identidade por dispositivo/inode/modo/proprietário/grupo/link count/
tamanho/mtime/ctime antes e depois da leitura por descritor. Mudança do caminho,
arquivo ou ancestrais provoca FAIL; o manifesto tem verificações análogas.
O executor não pode substituir o arquivo removendo ou escrevendo em seu diretório.

O hash detecta divergências, **não prova origem**. O modelo confia na custódia root,
no sistema operacional, no relógio UTC e no operador. Não protege contra root
comprometido, adulteração deliberada pelo próprio custodiante ou uma coleta falsa.

O launcher verifica integridade do pacote, autorização e atestado **antes de ler
a credencial**. O filho reabre e verifica o atestado antes da CA/conexão e novamente
após a desconexão, inclusive em falha. A evidência é imutável em memória. Exigem-se:

- Coleta não futura, instante atual estritamente anterior à expiração.
- Expiração posterior à coleta, intervalo máximo de 600.000 ms.
- Expiração do atestado não posterior à autorização.
- Mesmo evidenceId, executionId, servidor, conta, CA, schema, packageId e manifesto.

Expiração/substituição durante a execução impede sucesso; uma falha anterior permanece
primária. Não há ledger persistente de consumo: o procedimento deve alocar novo
executionId/evidenceId por tentativa e não reutilizar a mesma autorização. O contrato
recusa vínculo de outra execução; ele não pretende provar uso único de arquivos copiados
com os mesmos identificadores. Nenhum estado operacional foi criado para esse fim.

A coleta administrativa e a sessão Prisma **não são snapshot atômico**. Prazo curto,
transação na mesma conexão e revalidação de arquivo não congelam ACLs do servidor.
Congelamento operacional de mudanças e confirmação administrativa posterior continuam
pré-requisitos de uma futura homologação; ainda não há caminho de PASS gerenciado.

### 30.4 Auditoria implementada na sessão

As consultas originais de identidade, TLS e parâmetros permanecem byte a byte,
incluindo `@@datadir`. `CURRENT_USER()` é comparado à conta completa autorizada.
Preservam-se TLS estrito, CA/hostname/DNS, UUID, versão, schema, Prisma 6.12.0 e pool/
timeouts. Nenhuma alteração no Prisma compartilhado, schema, migrations ou grants.

Depois da atestação ABSENT, a sessão exige `mandatoryRoles=public`,
`CURRENT_ROLE()=NONE`, grants diretos válidos e configuração consistente.
A consulta `SHOW GRANTS FOR CURRENT_USER` é preservada; cada linha, coluna,
destinatário e privilégio continuam auditados. Qualquer atribuição de role,
inclusive `public`, agora é contradição. Somente USAGE global e SELECT no schema
autorizado são suficientes no caminho ABSENT; SHOW VIEW adicional também é recusado,
pois não está no atestado da conta atual. DML, DDL, privilégios administrativos,
GRANT/ADMIN OPTION, grants globais excessivos, outros schemas e ambiguidades falham.

Acrescenta-se somente a leitura
`SELECT @@GLOBAL.activate_all_roles_on_login AS activateAllRolesOnLogin`;
exige uma linha/coluna com zero. O inventário APPLICABLE_ROLES conserva a consulta
da seção 29.3, sem filtro/limite; qualquer linha ou formato inesperado falha.
Array vazio comprova apenas o formato observado, **não a completude**.

Não se executa `SHOW GRANTS` sem FOR nem `USING public`: a decisão ocorre antes
dessas consultas. PRESENT é recusado antes do SQL, sem tentar expansão. O caminho
local-isolated sem roles mantém a auditoria direct-only e SELECT 1. Não há PASS
para roles obrigatórias, mesmo que um mock forneça `graphVerified=true`.

O caminho ABSENT para após o inventário com:

```json
{
  "status": "FAIL",
  "code": "ROLE_WARNINGS_UNVERIFIED",
  "phase": "ROLE_WARNINGS",
  "writes": false
}
```

O launcher acrescentará o packageId verificado; não foi criado um novo pacote.
As fases novas são `ADMIN_ROLE_ATTESTATION`, `ROLE_ATTESTATION_FINAL`,
`SQL_ROLE_SETTINGS` e `ROLE_WARNINGS`. Mantêm-se fases históricas,
código Prisma original e mysqlCode opcional sanitizado (decimal 1–65535).
Erros locais sem código MySQL não inventam mysqlCode. Saída única, sem SQL,
mensagens de servidor, stack, credenciais ou metadados brutos.

O launcher recusa PASS sob autorização `oci-read-only`, inclusive se o filho omitir
ou contradizer o mode, e recusa alegações de expansão.
Resultados `CONFIG_VALID` de `--validate-only` atestam somente validação
local dos inputs/CA, não conexão, inventário ou auditoria efetiva.

### 30.5 Bloqueio de warnings — fundamentação e limite

O [manual de prepared statements 26.7](https://dev.mysql.com/doc/refman/26.7/en/sql-prepared-statements.html)
inclui **SHOW WARNINGS** entre comandos preparáveis. Porém exclui
`SHOW COUNT(*) WARNINGS` e referências a `@@warning_count`. Logo,
não basta transferir qualquer SQL do cliente administrativo para `$queryRawUnsafe`.

O [manual SHOW WARNINGS](https://dev.mysql.com/doc/refman/26.7/en/show-warnings.html)
distingue total de condições e registros armazenados: `max_error_count` pode
limitar os registros, inclusive a zero. Um conjunto vazio não certifica zero warnings.
A [área de diagnósticos](https://dev.mysql.com/doc/refman/26.7/en/diagnostics-area.html)
é da sessão e pode ser substituída por comandos intermediários; SHOW WARNINGS é
diagnóstico, mas isso não prova que todo o percurso cliente/engine preserve a área.

O [conector MySQL no commit do engine Prisma 6.12.0 instalado](https://github.com/prisma/prisma-engines/blob/8047c96bbd92db98a2abc7c9323ce77c02c89dbc/quaint/src/connector/mysql/native/mod.rs)
utiliza preparação/cache, execução e conversão do resultado. O ResultSet retornado
nesse caminho não oferece ao script o contador nativo de warnings. A preparação
pode envolver comandos adicionais. Isso demonstra uma lacuna de observabilidade;
**não demonstra que toda chamada Prisma necessariamente apaga warnings**.

A transação interativa fixa a conexão, mas não demonstra associação dos warnings
à consulta anterior. Também não demonstra um snapshot das tabelas de privilégios.
A implementação não executa SHOW WARNINGS experimentalmente, não troca conexão,
não usa contador de outra sessão e não cria um mock de engine como prova.

`requireVerifiableRoleWarnings()` falha incondicionalmente. Não existe flag,
campo do atestado ou retorno simulado que possa habilitar PASS. Ainda faltam
mecanismo demonstrado de contagem/associação/completude e verificações finais
da sessão ao redor desse mecanismo. Revalidação do arquivo já existe; ela não
substitui essas verificações SQL finais, que não foram implementadas como prova
fictícia de um caminho que permanece bloqueado.

### 30.6 Testes desta complementação

Executados localmente com dependências existentes e Node 22.23.3 do Mac
(alvo continua Node 22.23.2/ARM64). Sem MySQL, conexão Prisma, credenciais reais,
migrations ou pacote novo. As fixtures de filesystem, Prisma, processos e
ambiente são sintéticas; não se materializa atestado operacional.

```bash
env -i PATH=/usr/bin:/bin /opt/homebrew/opt/node@22/bin/node \
  --experimental-vm-modules --test \
  deploy/tests/role-attestation.test.mjs \
  deploy/tests/heatwave-diagnostic.test.mjs \
  deploy/tests/diagnostic-launcher.test.mjs
```

No diretório backend:

```bash
env -i PATH=/opt/homebrew/opt/node@22/bin:/usr/bin:/bin \
  /opt/homebrew/opt/node@22/bin/node node_modules/vitest/vitest.mjs \
  run test/unit/heatwave-connection.test.js --no-file-parallelism
```

Resultados: **257 PASS**, **0 FAIL**, **0 ignorados/cancelados**:
93 do atestado, 86 do diagnóstico, 26 do launcher e 52 dos helpers de conexão.
ESLint: nove arquivos, zero erros/avisos, usando o config backend e os mesmos
globals Node/rules para os testes e launcher MJS. Prettier: dez arquivos PASS.
Sintaxe: nove arquivos PASS. `git diff --check`: PASS.

A primeira execução do ESLint identificou duas ocorrências de `no-control-regex`,
uma no parser novo e outra no launcher já existente. Foram substituídas por
verificação explícita dos códigos dos caracteres, sem aceitar controles adicionais;
os testes cobrem essa preservação. A verificação final passou. A normalização
Markdown foi conferida contra a baseline: não altera conteúdo de evidências,
comandos ou resultados históricos.

Cobertura: contrato fechado, vínculo e validade; custódia/substituição/limites;
ABSENT/PRESENT/UNKNOWN; grants excessivos e roles explícitas; contradições;
JSON sanitizado e códigos SQL; desconexão/falha primária; deadline; integridade
antes da credencial; `--validate-only` sem rede. Os testes de warnings certificam
a **recusa**, inclusive com alegações de zero, contagem positiva, erro, sessão
errada ou operação intermediária; não certificam uma leitura real dos warnings.

Não executados: MySQL real/HeatWave, semântica real do engine/prepared statements,
custódia real Linux/SELinux, execução ARM64 ou geração/verificação de pacote novo.
O verificador do pacote no teste do launcher é simulado: comprova a ordem e
recusa da falha, não integridade de um artefato inexistente. O aviso experimental
do Node refere-se ao harness `vm`, não à saída operacional do diagnóstico.

### 30.7 Próxima etapa e critérios de liberação

1. Revisar este contrato e o bloqueio. Não empacotar esta versão como homologável.
2. Sob autorização separada, demonstrar um mecanismo que associe os warnings
   completos ao inventário na mesma sessão com o engine exato. Investigar em
   laboratório permitido; nenhuma conta/grant do HeatWave deve ser ampliada.
3. Implementar e testar a verificação real e as releituras finais de consistência.
   Continuar FAIL para warnings, impossibilidade de contar/associar, role presente/
   desconhecida, alteração de ACL/configuração, expiração ou desconexão incompleta.
4. Somente depois, autorizar a revisão da allowlist do empacotador para incluir
   `heatwave-role-attestation.js`, novo packageId/manifesto/checksums e instalação.
   A receita e os pacotes anteriores não foram alterados nesta entrega.
5. Em janela de execução explicitamente autorizada, o administrador deve coletar
   identidade/configuração/contagem/grants pela conexão TLS protegida, conservar
   a evidência, instalar o atestado sob custódia e vincular autorização/pacote.
   Conta runtime não recebe acesso administrativo. Não executar essa etapa agora.
6. Para futuro PASS: todos os vínculos e controles, inventário vazio íntegro sem
   warnings, somente grants autorizados, consistência inicial/final, SELECT 1 e
   desconexão concluída. Verificação administrativa posterior deve confirmar
   ausência e estabilidade de grants/configuração; divergência invalida a conclusão.
7. Fechar a janela segundo D04, conferir bloqueio e zero sessões/processos,
   retirar inputs temporários e arquivar evidências sanitizadas sob a retenção
   aprovada. Não reutilizar atestado/autorização; preservar os FAIL históricos.

A aprovação desta implementação local não é homologação Prisma–HeatWave.

## 31. OCI-DEPLOY-06.1.5-W02-B — núcleo local da auditoria administrativa

**Estado: PARTIAL. Não empacotar nem executar nova homologação.**

Esta seção complementa, sem substituir, os registros anteriores. A 06.1.4
permanece FAIL; a W01 permanece MECANISMO INADEQUADO. As cinco auditorias W02-A,
informadas pelo operador, confirmaram acesso às nove fontes e um perfil compatível
com SELECT/USAGE, public ausente, TLS obrigatório e conta bloqueada naquele momento.
Não foram repetidas nesta tarefa e não autorizam uma execução futura.

### 31.1 O que existe e o que continua bloqueado

Implementado localmente:

- Plano SQL fixo e versionado, parser de transcript textual e validação do conteúdo
  das nove fontes; nenhuma função deste núcleo abre conexão MySQL.
- Contratos fechados v2 para ADMIN_INITIAL, PRISMA, ADMIN_FINAL e CONSOLIDATED.
- Vinculação de servidor, conta, autorização, execução, pacote, janela e hashes.
- Verificador puro de consolidação, sem banco, filesystem ou efeitos colaterais.
- Caminho Prisma que gera apenas PRISMA_VERIFIED após desconexão, exercitado por
  injeção controlada de evidência sintética nos testes.
- Launcher com recusa de PASS gerenciado antecipado e validação estrita do
  resultado intermediário.
- Reutilização do leitor de custódia existente, sem mudar permissões, limite do
  contrato v1 ou sua proibição de execução como root.

**Não implementado/disponibilizado:** coletor operacional que execute mysql,
captura administrativa protegida do resultado Prisma, publicação dos recibos sob
custódia, controle persistente de consumo e CLI operacional do consolidador.

A revisão automática de aprovação rejeitou o supervisor proposto que invocaria
mysql e o launcher, classificando-o como automação futura vedada nesta etapa.
A alteração rejeitada não foi aplicada. O helper administrativo de publicação
preparado durante o trabalho também foi retirado; não há novo componente root
executável, leitura de senha administrativa ou comando de conexão introduzido.

Por isso, `loadInitialAudit()` começa por uma recusa incondicional:

```json
{
  "status": "FAIL",
  "code": "ADMIN_COLLECTION_RUNTIME_UNVERIFIED",
  "phase": "ADMIN_AUDIT_INITIAL",
  "writes": false
}
```

Nenhum flag, campo JSON, fixture ou produtor declarado libera esse gate. No
launcher, a mesma recusa ocorre antes da credencial; seu envelope de erro segue
o contrato do launcher. O caminho v1 continua com ROLE_WARNINGS_UNVERIFIED.
O PASS calculado pelo verificador puro sobre fixtures **não é aprovação
operacional**, prova de custódia, coleta real ou homologação.

### 31.2 Arquitetura e fontes

Fluxo futuro, ainda dependente de implementação/autorização operacional:

1. Coleta administrativa inicial por protocolo textual.
2. Sessão Prisma nova, autenticada como traceflow_diag, com resultado intermediário.
3. Nova coleta administrativa final; não reutilizar a inicial.
4. Encerramento humano da janela e consolidação offline das evidências custodiadas.

O modelo `mysql-26.7-absent-v1` exige:

| Fonte               | Verificação                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| mysql.user          | Uma identidade exata traceflow_diag@10.20.1.184; todos os privilégios estáticos N; ssl_type ANY; account_locked Y nas duas coletas; Restrictions NULL |
| mysql.global_grants | Nenhuma concessão dinâmica                                                                                                                            |
| mysql.db            | Um registro traceflow/10.20.1.184; Select_priv Y e demais indicadores N                                                                               |
| mysql.tables_priv   | Nenhuma concessão adicional por tabela                                                                                                                |
| mysql.columns_priv  | Nenhuma concessão adicional por coluna                                                                                                                |
| mysql.procs_priv    | Nenhuma concessão por rotina                                                                                                                          |
| mysql.role_edges    | Nenhuma aresta envolvendo traceflow_diag ou public em qualquer ponta/host                                                                             |
| mysql.default_roles | Nenhuma relação envolvendo essas contas/roles                                                                                                         |
| mysql.proxies_priv  | Nenhuma delegação concedida a traceflow_diag em qualquer host                                                                                         |

As consultas de concessões filtram pelo nome, sem limitar o host nem o schema.
Um host adicional/padrão ou schema diferente não pode desaparecer do inventário.
SELECT redundante por tabela/coluna permanece fora deste perfil estrito e é recusado.
Não há expansor genérico de roles: PRESENT e UNKNOWN continuam FAIL.

Complementos obrigatórios: inventário de todas as colunas das nove tabelas em
INFORMATION_SCHEMA.COLUMNS, existência de public por todos os hosts, SHOW GRANTS
da conta exata, TLS da sessão administrativa e identidade/configuração no início
e no fim. Colunas desconhecidas, ausentes ou duplicadas recusam o modelo.
Somente nomes de colunas de autenticação aparecem no inventário de metadados;
seus valores não são consultados. User_attributes é projetado exclusivamente por
JSON_EXTRACT(..., '$.Restrictions'), nunca integralmente.

A identidade administrativa esperada é traceflow_admin@%. Os valores exigidos são
26.7.0-cloud, UUID 6e94bb7f-c601-11f1-9b91-02001704771f, porta 3306,
mandatory_roles=public, activate_all_roles_on_login=0, partial_revokes=1,
sql_notes=1 e require_secure_transport=1. A CA precisa de seu fingerprint real
fornecido por mecanismo protegido; esta entrega não criou um fingerprint operacional.

### 31.3 Protocolo textual e completude

`ADMIN_PLAN` contém as 15 consultas fixas em ordem. `PLAN_SHA256` vincula esse
plano ao documento. `administrativeSql()` prepara, sem executar, para cada fonte:

```text
marcador BEGIN + CONNECTION_ID()
consulta fixa
SHOW COUNT(*) WARNINGS
marcador END + CONNECTION_ID()
```

Não há consulta entre a instrução auditada e o contador. O parser exige todos os
marcadores, ordem, mesma conexão, contador exatamente zero, dimensões conhecidas
das linhas, ausência de dados adicionais e término integral do transcript.
O validador de resultado exige exitCode=0, signal=null e stderrBytes=0.
Limites: 64 KiB de transcript, até 512 linhas por fonte e 16 KiB por documento JSON.

A W01 demonstrou contadores textuais sem dependência do armazenamento limitado por
max_error_count. **O novo enquadramento de saída e sua integração com um processo
mysql ainda não foram testados contra um servidor.** Fixtures não comprovam
associação real, ausência de reconexão ou completude do cliente nativo.

Uma implementação futura deverá fixar cliente/protocolo, desativar reconexão e
carregamento implícito de opções, preservar TLS VERIFY_IDENTITY e não usar --force,
SQL arbitrário ou credenciais em argv. Esses controles não estão representados
como concluídos por este parser. Warnings administrativos nunca são atribuídos
à sessão Prisma. Nenhum parâmetro de sessão/global foi alterado.

SHOW GRANTS é auditado integralmente antes da serialização. No documento, cada
linha aprovada é representada reversivelmente por privilégio, escopo, database,
objeto, usuário, host, opções de delegação e hash dos bytes originais. A reconstrução
precisa corresponder exatamente a uma das duas linhas autorizadas e ao hash.
Não se substituem grants por booleanos ou marcadores sem conteúdo. SQL bruto
não é incorporado ao resultado intermediário/consolidado.

### 31.4 Contrato v2

Todos os documentos possuem exatamente:

`formatVersion, evidenceId, runId, authorizationId, stage, startedAt, completedAt,
expiresAt, target, package, previous, producer, status, final, writes, payload`.

- formatVersion=2; UUIDs v4 distintos para execução/autorização/documentos.
- target contém UUID/versão/FQDN/IP/porta/CA/schema/conta completa/usuário.
- package contém packageId e manifestSha256.
- previous é null somente no documento inicial; depois contém evidenceId e sha256.
- JSON com membros duplicados, extras ou malformados é recusado.
- A serialização canônica ordena recursivamente as chaves e preserva a ordem dos
  arrays. Hashes de evidências são SHA-256 dessa representação UTF-8 sem newline;
  o hash do manifesto continua sobre os bytes reais do arquivo.

| Etapa         | status / final          | payload                                                                                                   |
| ------------- | ----------------------- | --------------------------------------------------------------------------------------------------------- |
| ADMIN_INITIAL | ADMIN_VERIFIED / false  | planSha256, collectionId, observações completas normalizadas, stateSha256, janela                         |
| PRISMA        | PRISMA_VERIFIED / false | Prisma 6.12.0, connectionId, disconnected, verificações fechadas, stateSha256                             |
| ADMIN_FINAL   | ADMIN_VERIFIED / false  | Nova coleta, collectionId distinto, mesmas verificações e vínculo ao Prisma                               |
| CONSOLIDATED  | PASS / true             | Evidências técnicas, política operacional, aceitação do risco, fechamento, hashes e limitações explícitas |

A autorização permanece formatVersion=1/operation=diagnose-read-only, agora com
`administrativeAudit.formatVersion=2`. Esse objeto contém authorizationId, runId,
package, evidenceIds das quatro etapas, initialSha256 e window. O preparador puro
aceita initialSha256=null somente antes da coleta inicial; diagnóstico e consolidação
exigem o hash. Não há comando para gerar autorização real ou preencher esse campo.

O projeto de custódia usa arquivos fora do pacote/Git, sob
/etc/traceflow/diagnostic-evidence, e mantém o executor incapaz de escrevê-los.
A autorização privada passada ao launcher deve corresponder à cópia administrativa
custodiada. O carregador prevê verificação do manifesto e da evidência inicial.
Contudo, seu gate permanece anterior à leitura: o mecanismo operacional de origem,
captura/publicação e uso único ainda falta. Um JSON manual não deve substituí-lo.

### 31.5 Prisma e consolidação

Preservadas as consultas originais de identidade, TLS e parâmetros, inclusive
@@datadir. Preservados Prisma compartilhado, versão, pool, timeouts, TLS/CA/DNS,
integridade do pacote, sanitização e falha primária durante desconexão.

No caminho v2 simulado, depois dos grants diretos:

1. Ler activate_all_roles_on_login, partial_revokes e CONNECTION_ID().
2. Executar SELECT 1 e validar o resultado.
3. Relê identidade completa, configuração, CURRENT_ROLE() e CONNECTION_ID().
4. Relê e audita SHOW GRANTS FOR CURRENT_USER.
5. Concluir transação, desconectar, revalidar evidência e emitir PRISMA_VERIFIED.

Não usa APPLICABLE_ROLES, SHOW WARNINGS nem USING public nesse caminho.
A garantia substituta projetada é a auditoria administrativa completa, não uma
exceção para 3530/1141/1295. Sem coletor operacional validado, o caminho permanece
bloqueado. O modo local-isolated anterior permanece independente e coberto.

`consolidateEvidence()` é um verificador puro: revalida os dois inventários,
Prisma, hashes, identidades, pacote, janela, ordem, nova collectionId, igualdade
dos estados e desconexão. Requer declaração separada de encerramento com
runId/authorizationId/operador/instante e confirmação do risco residual.
Não acessa banco, escreve arquivos ou comprova sozinho a origem dos documentos.

### 31.6 Janela e risco residual

Máximo de dez minutos desde openedAt até expiresAt, sem renovação na coleta final.
Cada etapa tem limite de 35 segundos e intervalos adjacentes de até 60 segundos.
Exigem-se aceitação humana identificada, responsável e ausência de automações
conhecidas/alterações de privilégios autorizadas. A única transição operacional
prevista é desbloqueio/bloqueio de traceflow_diag, que exige autorização futura
específica; não autoriza alterar credenciais, grants, roles ou outras contas.

A declaração de encerramento deve ser posterior à coleta final e anterior à
expiração. Uma exigência `continuous-required` é recusada: não foi implementada
auditoria contínua. O resultado consolidado distingue:

- Evidência técnica verificada.
- Política operacional `operator-controlled-v1` e identificador da aceitação.
- atomicSnapshot=false e continuousAudit=false.
- TRANSIENT_ACL_CHANGES_NOT_AUTOMATICALLY_DETECTED.

Coletas iguais não detectam necessariamente GRANT seguido de REVOKE no intervalo.
Não há atomicidade entre sessões. Autorização/copias com IDs iguais também não
demonstram uso único: o futuro mecanismo de consumo continua pendente.
Nenhum risco operacional foi aceito pelo usuário por meio desta implementação.

### 31.7 Validação e próxima entrega

Testes locais usam exclusivamente fixtures em memória e Prisma/filesystem simulados.
Cobrem modelo, privilégios, todas as fontes, framing/contadores, encadeamento,
validade, permissões, sanitização, gate operacional, resultado intermediário,
recusa de PASS antecipado, encerramento e preservação de erros. Não comprovam
comportamento real do cliente, HeatWave ou engine ARM64.

Antes de qualquer pacote:

1. Obter autorização explícita para implementar o invocador manual do cliente e
   a captura administrativa do processo Prisma, sem executá-los contra OCI.
2. Completar publicação/custódia/consumo e o verificador operacional offline.
3. Testar o protocolo e captura em MySQL descartável sob autorização separada,
   sem migrations TraceFlow e sem credenciais reais.
4. Demonstrar falhas/truncamento/reconexão, sql_notes, contador com max_error_count=0,
   efeitos de alterações de privilégios e semântica das colunas da versão real.
5. Revisar a política temporal com o operador. Somente depois preparar nova receita/
   allowlist de pacote, packageId, manifesto e checksums mediante autorização.
6. Instalação, coletas novas no HeatWave e D03 exigem autorizações próprias.

Acesso às fontes confirmado pela W02-A não elimina essas pendências. Esta entrega
não gerou pacote, atestado operacional, autorização, credencial, processo MySQL,
migration, conexão externa de banco, commit, push ou deploy.

### 31.8 Resultados locais da W02-B

Baseline: branch `daniel-dev`, HEAD `4cfa1eae3961f377c452b11053395ca23569c238`,
working tree inicialmente limpo. Execução em macOS ARM64 com Node.js **22.23.3**
instalado; não equivale à validação de Node.js 22.23.2 no Oracle Linux ARM64.
Prisma 6.12.0 e dependências permaneceram inalterados.

Comando de regressão executado com ambiente limpo, sem carregar `.env`:

```bash
env -i PATH=/usr/bin:/bin /opt/homebrew/opt/node@22/bin/node \
  --experimental-vm-modules --test --test-reporter=spec \
  deploy/tests/role-attestation.test.mjs \
  deploy/tests/heatwave-diagnostic.test.mjs \
  deploy/tests/diagnostic-launcher.test.mjs \
  deploy/tests/administrative-audit.test.mjs
```

Resultado: **393 PASS, 0 FAIL, 0 ignorados**: 93 de atestado/custódia,
95 do diagnóstico, 28 do launcher e 177 da auditoria administrativa.

O arquivo `backend/test/unit/heatwave-connection.test.js` foi executado pela API
local `startVitest("test", ["test/unit/heatwave-connection.test.js"], ...)`, com
`config:false`, `envDir:false`, `setupFiles:[]`, `globalSetup:[]`, coverage
desabilitado e diretório temporário exclusivo. Resultado: **52 PASS**.
A primeira tentativa foi interrompida pelo sandbox com `EPERM` ao criar cache
temporário, antes da coleta dos testes. A nova execução, com escrita restrita
ao diretório exclusivo autorizada, passou e removeu esse diretório.

Total: **445 testes PASS**, sem testes com banco real. Os testes do caminho novo
que ultrapassam o gate usam substituição explícita do carregador por fixture;
não demonstram a existência de um coletor operacional validado.

Verificações adicionais executadas:

- ESLint pela API instalada, usando `backend/eslint.config.js` e globals Node
  para os arquivos `.mjs`: 11 arquivos, zero erros e zero warnings.
- Prettier instalado: `--check` nos 12 arquivos alterados, PASS.
- Node.js `--check` nos 11 arquivos de código, PASS.
- `git diff --check`, PASS.
- Comparação do prefixo do runbook com `git show HEAD:...`: histórico anterior
  preservado integralmente, sem reescrita das evidências anteriores.
- Comparação com HEAD de aplicação, Prisma compartilhado, schema, migrations,
  arquivos de dependências e receita de empacotamento: nenhuma alteração.

Não executados: cliente MySQL/protocolo textual real, coleta administrativa real,
captura/publicação operacional, consolidação sob custódia em Linux, teste ARM64
na VM e nova homologação Prisma–HeatWave. Permanecem pendências, não PASS.

Veredito desta implementação: **PARTIAL**. O contrato local e seus validadores
foram testados; o coletor, a captura, a publicação/consumo e o verificador
operacional precisam ser concluídos e demonstrados antes de retirar o gate.

## 32. W02-B — continuação autorizada: comandos administrativos manuais

Esta seção complementa o histórico da seção 31. A continuação foi autorizada
expressamente para implementar, sem executar conexões, o coletor manual, a captura
protegida e o verificador offline. Baseline: `daniel-dev`, HEAD
`f05a297c627b3659309e8519b2ca46428bf810cd`, working tree inicialmente limpo.
O commit contém os 12 arquivos da entrega anterior; eles foram preservados.

**Estado: PARTIAL. Nenhum pacote ou homologação está autorizado por esta entrega.**

### 32.1 Quatro invocações independentes

`deploy/scripts/heatwave-admin-manual.mjs` aceita exatamente três argumentos:
`--operation`, `--run-id`, `--manifest-sha256`. As únicas operações são:

| Operação        | Processo de coleta/captura               | Documento     | Aprovação final                                      |
| --------------- | ---------------------------------------- | ------------- | ---------------------------------------------------- |
| collect-initial | Um cliente MySQL, consultas fixas        | ADMIN_INITIAL | Não                                                  |
| capture-prisma  | Um launcher existente, como traceflow    | PRISMA        | Não                                                  |
| collect-final   | Um novo cliente MySQL, consultas fixas   | ADMIN_FINAL   | Não                                                  |
| verify-offline  | Nenhuma conexão ou processo Prisma/MySQL | CONSOLIDATED  | Bloqueada enquanto a validação real estiver pendente |

Não existe operação all/auto, agendamento, supervisor de sequência, desbloqueio,
mudança de grants ou retry automático. O programa valida Linux/root para a
custódia administrativa; o launcher e o Prisma continuam executando sem root.
Cada operação verifica o pacote instalado e o SHA-256 independente do manifesto.
A ferramenta exige o caminho `/opt/traceflow-diagnostics/<packageId>`.

O contrato do diagnóstico permanece intermediário. `capture-prisma` aceita
somente PRISMA_VERIFIED válido, com final=false, vínculos corretos e desconexão
concluída. PASS antecipado, stderr, exit code incompatível e documentos incompletos
são recusados. Uma falha Prisma conserva código, fase e código MySQL sanitizado.

O guard `ADMIN_COLLECTION_RUNTIME_UNVERIFIED` foi **preservado** no diagnóstico
e também é obrigatório antes de qualquer PASS do verificador operacional.
Não há flag, campo de autorização ou variável de ambiente que o desabilite.
Consequentemente, a captura do caminho v2 ainda recebe FAIL do launcher real;
as cadeias completas dos testes utilizam doubles explícitos. Não se deve executar
este procedimento na OCI para tentar ultrapassar essa pendência.

### 32.2 Cliente textual e credenciais

O coletor usa exclusivamente o cliente MySQL instalado. O código executa o plano
ADMIN_PLAN existente, sem modificá-lo, por stdin. Não há SQL fornecido em argv nem
SQL configurável. Para cada fonte continua havendo o contador imediato
`SHOW COUNT(*) WARNINGS`, sem consulta intermediária.

As opções fixam TCP, FQDN/porta autorizados, `VERIFY_IDENTITY`, CA pública validada
e TLS 1.2/1.3. Desabilitam reconexão, login paths, auto-rehash e LOCAL INFILE;
fixam batch/raw/sem cabeçalhos e ambiente mínimo. Não usam --force, --execute,
init-command ou shell. A documentação relevante é
[MySQL 26.7 — opções do cliente](https://dev.mysql.com/doc/refman/26.7/en/mysql-command-options.html)
e [SHOW WARNINGS/contagem](https://dev.mysql.com/doc/refman/26.7/en/show-warnings.html).

O arquivo administrativo de opções deve existir previamente, sob custódia root,
com apenas o grupo `[client]`, usuário fixo traceflow_admin e senha entre aspas
duplas. Ordem exata: cabeçalho, user, password, cada qual terminado por LF.
Somente escapes de barra invertida e aspas duplas são aceitos; controles ASCII,
includes, opções adicionais e credenciais vazias são recusados. O programa não
cria, transforma, imprime nem persiste esse segredo.

O arquivo regular é aberto com O_NOFOLLOW, conferido por descritor e mantido
aberto. O cliente recebe o descritor 3, com `--defaults-file=/proc/self/fd/3` como
primeira opção. O caminho protegido e o descritor são revalidados após o processo.
A compatibilidade desse mecanismo com o cliente instalado precisa de teste real
isolado; falhas não têm fallback para argv, ambiente ou arquivo temporário.

Na captura Prisma, o launcher existente recebe caminhos protegidos para sua
autorização privada e password.json. O coletor não copia a senha nem interpreta
seu conteúdo; fixa e revalida o arquivo, e conserva o comportamento do launcher.
Buffers de credencial lidos pelo componente administrativo são zerados ao sair.
Isso não constitui garantia de apagamento de toda cópia interna do runtime.

stdout/stderr dos filhos são capturados, limitados e não retransmitidos. stderr
é contado, sem armazenar sua mensagem nas evidências. Falha, sinal, timeout,
truncamento, UTF-8 inválido ou limites excedidos impedem aprovação. O grupo do
processo é encerrado em timeout/interrupção; o encerramento é aguardado. Esses
controles foram exercitados com processos simulados, não com MySQL real.

### 32.3 Custódia, recibos e uso único

Diretórios a provisionar manualmente, apenas em etapa futura autorizada:

- `/etc/traceflow/diagnostic-inputs`: root:traceflow, 0750.
- `/etc/traceflow/diagnostic-evidence`: root:traceflow, 0750.
- `/etc/traceflow/diagnostic-evidence/control`: root:root, 0700.
- Todos os ancestrais: root, sem escrita por grupo/outros, sem symlink.

Entradas por execução:

| Arquivo em diagnostic-inputs   | Dono / modo         | Conteúdo                                                     |
| ------------------------------ | ------------------- | ------------------------------------------------------------ |
| `<runId>.authorization.json`   | root / 0400 ou 0600 | Autorização v2, initialSha256=null, janela e risco aprovados |
| `<runId>.admin.cnf`            | root / 0400 ou 0600 | Opções privadas do cliente administrativo                    |
| `<runId>.prisma-password.json` | traceflow / 0600    | Contrato privado já existente do launcher                    |
| `<runId>.closure.json`         | root / 0400 ou 0600 | Confirmação operacional posterior à auditoria final          |

Nenhuma dessas entradas reais foi gerada ou lida nesta entrega. O mecanismo de
provisionamento de segredos deve permanecer protegido, fora do Git, sem comandos
contendo senhas no histórico ou em argumentos. Também deve impedir core dumps
e encaminhamento de memória/saídas privadas a logs externos durante a operação.

O primeiro comando reserva authorizationId e runId antes de executar o cliente.
Cada etapa cria exclusivamente `<operation>.attempt.json` no diretório de controle
da execução. A criação usa O_EXCL/O_NOFOLLOW; existência prévia resulta em FAIL.
Não existe limpeza automática ou substituição para liberar uma tentativa.

Após validação, publica-se `<evidenceId>.json` root:traceflow/0440 e, por último,
um recibo root:root/0400. O recibo vincula hash canônico do documento, hash da
tentativa, hash do recibo anterior, operação, pacote, runId e authorizationId.
Documentos/recibos são sincronizados em disco e o diretório é sincronizado.
Falha parcial deixa a tentativa consumida; ausência de recibo impede a próxima
etapa. O registro de falha contém apenas o erro sanitizado e os identificadores.

Na coleta inicial são publicadas uma autorização root vinculada ao hash da
evidência inicial e uma cópia privada traceflow/0600 para o launcher. A cópia do
executor deve corresponder à autorização administrativa. Nenhuma credencial é
publicada. O leitor v1 não foi alterado nem passou a aceitar execução como root.

Arquivos precisam ser regulares, de proprietário/modo esperados, com um único
link, tamanho limitado e caminhos absolutos canônicos. Metadados e ancestrais
são revalidados; substituições durante leitura/publicação são recusadas.
Symlinks de evidências/credenciais são proibidos. Apenas programas do sistema
podem ter symlinks administrativamente controlados, com origem e destino
verificados e execução pelo destino canônico.

O verificador offline exige os documentos **e** seus recibos/tentativas sob
custódia. Não aceita um arquivo arbitrário importado como evidência administrativa.
Isso impede substituição pelo executor; não autentica um administrador root
malicioso. Root e o procedimento administrativo continuam sendo a fronteira de
confiança. Não há assinatura remota, hardware de atestação ou log externo imutável.

### 32.4 Procedimento manual futuro — não executar nesta entrega

Antes destes comandos: validar o cliente/protocolo/custódia em laboratório,
revisar a liberação do guard, autorizar novo pacote e sua composição, verificar
checksums, preparar a janela e as entradas privadas. Os placeholders abaixo
precisam ser substituídos por identificadores reais aprovados; não são artefatos
ou autorizações emitidos por esta entrega. Cada bloco exige decisão manual própria.

1. Com a conta de diagnóstico bloqueada, coletar a auditoria inicial:

```text
sudo env -i PATH=/usr/bin:/bin <NODE22_ABSOLUTO> /opt/traceflow-diagnostics/<PACKAGE_ID>/deploy/scripts/heatwave-admin-manual.mjs --operation collect-initial --run-id <RUN_ID> --manifest-sha256 <MANIFEST_SHA256>
```

2. Conferir a evidência/recibo inicial e, somente em janela autorizada, preparar
   externamente a conta/credencial temporária. Invocar apenas a captura Prisma:

```text
sudo env -i PATH=/usr/bin:/bin <NODE22_ABSOLUTO> /opt/traceflow-diagnostics/<PACKAGE_ID>/deploy/scripts/heatwave-admin-manual.mjs --operation capture-prisma --run-id <RUN_ID> --manifest-sha256 <MANIFEST_SHA256>
```

3. Conferir desconexão, bloquear novamente a conta pelo procedimento administrativo
   separado e confirmar ausência de sessões. Invocar a nova coleta final:

```text
sudo env -i PATH=/usr/bin:/bin <NODE22_ABSOLUTO> /opt/traceflow-diagnostics/<PACKAGE_ID>/deploy/scripts/heatwave-admin-manual.mjs --operation collect-final --run-id <RUN_ID> --manifest-sha256 <MANIFEST_SHA256>
```

4. Preparar a confirmação operacional de encerramento e executar a consolidação:

```text
sudo env -i PATH=/usr/bin:/bin <NODE22_ABSOLUTO> /opt/traceflow-diagnostics/<PACKAGE_ID>/deploy/scripts/heatwave-admin-manual.mjs --operation verify-offline --run-id <RUN_ID> --manifest-sha256 <MANIFEST_SHA256>
```

O verificador não conecta ao banco; usa somente arquivos protegidos e verificação
local do pacote. PASS exige toda a cadeia e política satisfeitas, além da retirada
do guard em uma revisão futura fundamentada por evidências reais.

Em qualquer falha: não repetir a tentativa, não editar recibos, não reaproveitar
IDs e não executar a próxima etapa como se houvesse sucesso. Preservar evidências
sanitizadas e fazer a limpeza operacional de conta/processos/credenciais conforme
D04. Qualquer nova tentativa requer autorização e identificadores novos. A
ferramenta não altera conta, grants, configurações ou schema em nenhum caminho.

### 32.5 Validação e limites desta continuação

Testes novos usam filesystem, processos, DNS, CA e saídas do cliente simulados;
não executam MySQL. O teste de entrada do CLI executa apenas a rejeição sem
operação selecionada, antes de qualquer acesso administrativo.

Continuam pendentes: cliente textual real e descritor de opções em /proc,
contadores/completude, ausência de reconexão silenciosa, encerramento do grupo
real de processos, permissões/ACL/SELinux em Linux, sincronização durável e
recuperação após interrupção real, composição do futuro pacote ARM64.
Nenhum teste sintético substitui essas evidências.

As coletas não são atômicas. Dois estados iguais não excluem alterações
transitórias. O contrato mantém a aceitação operacional humana e a limitação
TRANSIENT_ACL_CHANGES_NOT_AUTOMATICALLY_DETECTED; não anuncia auditoria contínua.
As evidências W02-A permanecem históricas, a 06.1.4 permanece FAIL e não há
homologação Prisma–HeatWave nesta entrega.

### 32.6 Resultados locais da continuação

Node.js 22.23.3 em macOS ARM64, dependências previamente instaladas. Nenhum
arquivo da implementação anterior foi alterado, exceto o acréscimo desta seção
ao runbook. Prisma, schema, migrations e empacotador permaneceram intactos.

Regressão executada com ambiente limpo:

```bash
env -i PATH=/usr/bin:/bin /opt/homebrew/opt/node@22/bin/node \
  --experimental-vm-modules --test --test-reporter=spec \
  deploy/tests/role-attestation.test.mjs \
  deploy/tests/heatwave-diagnostic.test.mjs \
  deploy/tests/diagnostic-launcher.test.mjs \
  deploy/tests/administrative-audit.test.mjs \
  deploy/tests/heatwave-admin-manual.test.mjs
```

Resultado: **463 PASS, 0 FAIL, 0 ignorados**, incluindo os 70 testes novos.
Executados também os 52 testes de `backend/test/unit/heatwave-connection.test.js`
pela API `startVitest`, com config/envDir/setup/globalSetup desabilitados e cache
em diretório temporário exclusivo, removido ao final: **52 PASS**.
Total desta continuação: **515 PASS**, sem banco ou cliente MySQL real.

ESLint nos quatro arquivos de código: PASS, zero erros/warnings. A primeira
verificação apontou `no-control-regex`; a validação foi ajustada para conferir
os códigos dos caracteres explicitamente, mantendo a recusa de controles.
Prettier nos cinco arquivos, Node.js --check nos quatro arquivos de código e
git diff --check completaram a validação estática.

Os testes demonstram recusa de replay, vínculo dos recibos, permissões simuladas,
substituição de arquivos/ancestrais, interrupção/timeout, limites de saída,
sanitização, expiração entre verificações, deadline limitado pela autorização,
captura intermediária, ausência de encadeamento automático e bloqueio do PASS
operacional. Casos de sucesso completo usam double explícito do guard somente
no teste; a interface CLI não oferece tal opção.

Veredito: **PARTIAL**, pelos limites reais enumerados na seção 32.5. Esta
continuação não produziu atestado real, autorização operacional, credencial,
conexão MySQL/OCI, migration, pacote, commit, push, PR ou deploy.
