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
