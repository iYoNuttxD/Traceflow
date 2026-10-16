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

~~~bash
node scripts/package-diagnostic.mjs export --output "$DIAGNOSTIC_SOURCE_DIR"
~~~

Revisar o sourceSha256 emitido; transportar somente essa exportação para uma VM de build
descartável OL9.8 ARM64. Executar a receita contida na própria exportação:

~~~bash
node "$DIAGNOSTIC_SOURCE_DIR/scripts/package-diagnostic.mjs" build \
  --source "$DIAGNOSTIC_SOURCE_DIR" \
  --source-sha256 "$DIAGNOSTIC_SOURCE_SHA256" \
  --output "$DIAGNOSTIC_ARTIFACT_DIR"
~~~

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

| Campo | Valor |
| --- | --- |
| Arquivo | traceflow-prisma-diagnostic-efa7abc8191bbf10.tar.gz |
| Tamanho | 7.498.083 bytes |
| SHA-256 tar.gz | 5344f07d4387f17f57d57e1418e0772a2a10b10ca51079f2b9f41080152a730b |
| SHA-256 manifest.json | e155bf4ccf3e323a4fd2b0b9bafb1451713d1127bf501b9ca7df7ca17be00ea1 |
| SHA-256 diagnostic-tool.py | a6b4a77d725f24c31f1a8368983ff8a28bde0db4c29de61e0a18b7d1cf254378 |
| SHA-256 source.json | efa7abc8191bbf10871b9c013044ed0b7dc3479a9a35da88be60078bc5a76d68 |
| HEAD base | 09d98d7fb6a7ffcf4b6e1546ab866afc7090915f |

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

~~~json
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
~~~

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

~~~bash
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
~~~

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

~~~bash
scp "$DIAGNOSTIC_ARTIFACT_DIR/traceflow-prisma-diagnostic-efa7abc8191bbf10.tar.gz" \
    "$DIAGNOSTIC_ARTIFACT_DIR/manifest.json" \
    "$DIAGNOSTIC_ARTIFACT_DIR/diagnostic-tool.py" \
    "$DIAGNOSTIC_ARTIFACT_DIR/artifact.json" \
    opc@144.22.183.254:/home/opc/traceflow-prisma-diagnostic-efa7abc8191bbf10.incoming/
~~~

Nenhuma transferência foi feita. Não usar esse comando antes da autorização D01.

## 16. D01 — instalação futura

Diretório proposto: `/opt/traceflow-diagnostics/<packageId>`, separado de releases/current,
webroot, storage de negócio e arquivos runtime.env/api.env/github-worker.env.
Confirmar os pais existentes; criar apenas os diretórios novos aprovados. Não alterar
permissões de diretórios preexistentes para fazer o verificador passar.

Em sessão root aprovada, para a primeira instalação, materializar somente os diretórios
novos abaixo. Se a base já existir, parar para revisar proprietário/permissões e preparar
um procedimento específico; não sobrescrever nem reparar automaticamente.

~~~bash
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
~~~

Conferir previamente /opt root-owned, diretório real e sem escrita por terceiros. A base
dedicada evita depender da propriedade de /var/lib/traceflow ou /opt/traceflow, ainda não
reconfirmada nesta entrega. Não executar conteúdo pertencente a opc como root.

## 17. Verificação e extração futura

Na pasta staging root, verificar os valores fixos por canal confiável, não apenas artifact.json:

~~~bash
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
~~~

Somente o destino novo criado pelo extrator é objeto do chown. Não usar caminhos vazios,
symlinks, globs nem diretórios de releases. Nenhum npm install/generate remoto é necessário.

## 18. D02 — preflight sem banco

Depois de autorização D02, confirmar hostname traceflowapp, aarch64, OL9.8,
SELinux Enforcing, Node /usr/bin/node 22.23.2, Python /usr/bin/python3 e OpenSSL 3.
Binário/path diferente requer revisão, não instalação automática.
Verificar usuário, pais, modos e CA root:root 0644/cert_t; comparar DER SHA e validade.
Não ler runtime.env nem credenciais de outras contas.

~~~bash
sudo -u traceflow env -i PATH=/usr/bin:/bin HOME=/nonexistent \
  /usr/bin/python3 -I "$DIAGNOSTIC_PACKAGE_DIR/diagnostic-tool.py" verify \
  --root "$DIAGNOSTIC_PACKAGE_DIR" \
  --manifest-sha256 e155bf4ccf3e323a4fd2b0b9bafb1451713d1127bf501b9ca7df7ca17be00ea1

sudo -u traceflow env -i PATH=/usr/bin:/bin HOME=/nonexistent \
  /usr/bin/node "$DIAGNOSTIC_PACKAGE_DIR/deploy/scripts/diagnostic-runtime.mjs"

openssl x509 -in /etc/pki/traceflow/mysql-ca.pem -noout -fingerprint -sha256 -dates
~~~

Esses comandos verificam pacote/plataforma/CA local e não autenticam no banco.
Verificação de rota/DNS na VM exige que sua leitura esteja incluída no cartão D02.
Nenhum D02 foi executado aqui.

## 19. B40/B41 — operações futuras separadas

Reutilizar a sessão administrativa protegida de
[OCI_HEATWAVE_INITIAL_BOOTSTRAP](OCI_HEATWAVE_INITIAL_BOOTSTRAP.md#7-execução-manual-futura-e-preflight-administrativo),
com /usr/bin/mysql e traceflow_admin informados pelo operador, senha no TTY,
--no-defaults --no-login-paths e VERIFY_IDENTITY. Não recriar B00–B30.

B40, somente mediante autorização mutável específica:

~~~sql
ALTER USER 'traceflow_diag'@'10.20.1.184' ACCOUNT UNLOCK;
~~~

B41, leitura separadamente autorizada:

~~~sql
SELECT User, Host, plugin, ssl_type, account_locked, password_expired
FROM mysql.user
WHERE User IN ('traceflow_api', 'traceflow_worker', 'traceflow_diag', 'traceflow_migrator')
ORDER BY User, Host;
SHOW GRANTS FOR 'traceflow_diag'@'10.20.1.184';
~~~

Só diag pode ter account_locked=N; demais continuam Y, REQUIRE SSL e grants aprovados.
B41 administrativo não substitui a verificação dos próprios grants efetivos no diagnóstico.

## 20. D03 — diagnóstico gerenciado futuro

Requer autorização própria para conexão autenticada, alvo exato, prazo, identidade Unix,
custódia, aprovação explícita do JSON e plano de D04/relock. Materializar authorization.json
0600 no diretório privado, usando somente os campos da seção 12. Revisar timestamps.

Primeiro --validate-only (sem DNS/SQL; ainda exige autorização válida e senha protegida):

~~~bash
sudo -u traceflow env -i PATH=/usr/bin:/bin HOME=/nonexistent LANG=C.UTF-8 TZ=UTC \
  /usr/bin/node "$DIAGNOSTIC_PACKAGE_DIR/deploy/scripts/diagnostic-launcher.mjs" \
  --authorization /run/traceflow-diagnostic/authorization.json \
  --credential-file /run/traceflow-diagnostic/password.json \
  --manifest-sha256 e155bf4ccf3e323a4fd2b0b9bafb1451713d1127bf501b9ca7df7ca17be00ea1 \
  --validate-only
~~~

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

~~~sql
ALTER USER 'traceflow_diag'@'10.20.1.184' ACCOUNT LOCK;
SELECT User, Host, account_locked
FROM mysql.user
WHERE User='traceflow_diag' AND Host='10.20.1.184';
~~~

Execução manual alternativa, depois da autorização de relock, em terminal root privado:

~~~bash
env -i PATH=/usr/bin:/bin HOME=/nonexistent MYSQL_HISTFILE=/dev/null \
  /usr/bin/timeout --foreground --signal=TERM --kill-after=5s 60s \
  /usr/bin/mysql --no-defaults --no-login-paths \
  --host=traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com \
  --port=3306 --protocol=TCP --user=traceflow_admin --password \
  --ssl-mode=VERIFY_IDENTITY --ssl-ca=/etc/pki/traceflow/mysql-ca.pem \
  --tls-version=TLSv1.2,TLSv1.3 --connect-timeout=5 --local-infile=0 \
  --batch --skip-reconnect < "$DIAGNOSTIC_RELOCK_SQL"
~~~

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

~~~bash
python3 -B -m unittest discover -s deploy/tests -p test_diagnostic_package.py -v
node --test deploy/tests/diagnostic-launcher.test.mjs

python3 -B deploy/tests/run-diagnostic-package-lab.py \
  --mysql-base "$MYSQL_LAB_BASE" --node "$NODE22_EXECUTABLE" \
  --artifact-directory "$DIAGNOSTIC_ARTIFACT_DIR" --report "$LOCAL_DIAGNOSTIC_REPORT"

python3 -B deploy/tests/run-diagnostic-quality.py \
  --mysql-base "$MYSQL_LAB_BASE" --node "$NODE22_EXECUTABLE" --report "$LOCAL_QUALITY_REPORT"
~~~

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

| Identificador | Operação identificada |
| --- | --- |
| PREVALIDATION | Argumentos, autorização protegida e contrato de conexão |
| TLS_CA | Leitura protegida e validação da CA pública |
| DNS_IDENTITY | Verificação do DNS gerenciado |
| TLS_PROBE | Handshake TLS independente, sem autenticação SQL |
| PRISMA_INIT | Verificação da versão e importação do cliente compartilhado |
| SQL_IDENTITY | Q1: consulta original de identidade, incluindo @@datadir |
| SERVER_IDENTITY | Validação do resultado de Q1 |
| SQL_SESSION_TLS | Q2: SHOW SESSION STATUS original |
| SESSION_TLS | Validação de cipher/versão TLS da sessão Prisma |
| SQL_SERVER_PARAMETERS | Q3: consulta original dos parâmetros e roles |
| ROLES | Validação das roles obrigatórias e ativas |
| SQL_DIRECT_GRANTS | Q4: SHOW GRANTS FOR CURRENT_USER original |
| DIRECT_GRANTS | Validação dos grants diretos |
| SQL_PUBLIC_GRANTS | Q5: expansão original de public, somente quando obrigatória |
| EFFECTIVE_GRANTS | Validação dos grants efetivos |
| SQL_SELECT_ONE | Q6: SELECT 1 original |
| DISCONNECT | Encerramento do Prisma quando não existe falha primária |
| UNKNOWN | Proteção do serializador contra identificador não reconhecido |

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
