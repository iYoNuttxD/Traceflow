# OCI-DEPLOY-06.1.2 — Pacote ARM64 do diagnóstico instrumentado

**Veredito: PASS LOCAL.** Pacote montado offline no Mac, sem instalações, downloads, banco,
VM ou OCI. **Não é PASS ARM64 REAL nem homologação Prisma–HeatWave. D03 permanece FAIL.**
Nenhuma transferência, instalação remota ou próxima homologação foi iniciada.

## A. Baseline e autorização

| Campo | Resultado |
| --- | --- |
| Repositório | iYoNuttxD/Traceflow; checkout /Users/daniel/Coding/Traceflow |
| Branch inicial/final | daniel-dev |
| HEAD inicial/final | 4a9b64edb85d2c4e91fea8858972e42380b3ab92 |
| Baseline da investigação | cf15522587b3de0293c951c83ffdd0165cd5d6e5 |
| Working tree inicial | limpo |
| Evolução entre HEADs | um commit, exatamente os seis arquivos da 06.1.1, +1036/-38 |
| Alterações concorrentes encontradas | nenhuma |
| Commit/push nesta entrega | nenhum |

A receita existente exigia OL9.8 ARM64 e sempre executava npm ci. O usuário autorizou
explicitamente adicionar o modo offline à **mesma receita**, reutilizando apenas dependências
ARM64 do pacote anterior após verificação dos pins e inventário. Não houve autorização para
instalações, downloads, conexão, alterações SQL ou uso de VM; nada disso foi executado.

Working tree final desta entrega:

- Modificado: `scripts/package_diagnostic.py` — modo offline, guardas de reutilização e procedência.
- Modificado: `docs/runbooks/OCI_HEATWAVE_PRISMA_DIAGNOSTIC.md` — somente seção 28 adicionada.
- Novo: `deploy/tests/test_diagnostic_offline.py` — 11 testes com arquivos sintéticos.
- Novo: este relatório.
- Novo: `docs/deliveries/evidence/oci-deploy-06-1-2-prisma-diagnostic/E01_LOCAL_PACKAGE_VALIDATION.json`.

Os seis arquivos da 06.1.1 estão incorporados ao HEAD atual. Os três módulos operacionais
entram no runtime; os dois testes e o runbook são identificados no manifesto de fontes e
na exportação local, sem ampliar a allowlist de execução. Schema, 68 migrations, dependências,
lockfile, Prisma compartilhado e código da aplicação não foram alterados. As seções 1–27
do runbook e as 17 evidências anteriores foram preservadas.

## B. Novo pacote e pins

Diretório local exato:

`/Users/daniel/Coding/Traceflow/build/oci-deploy-06-1-2-prisma-diagnostic/traceflow-prisma-diagnostic-fa4a318dfa1c636d/`

| Campo | Valor |
| --- | --- |
| packageId | traceflow-prisma-diagnostic-fa4a318dfa1c636d |
| Arquivo | traceflow-prisma-diagnostic-fa4a318dfa1c636d.tar.gz |
| Tamanho tar.gz | **7.499.618 bytes**, aproximadamente 7,1522 MiB |
| Arquivos no manifesto | **24** |
| Membros no tar | **25**, incluindo manifest.json |
| Inputs da exportação de fontes | **18** |
| Dependências reutilizadas | **13 arquivos**, idênticos aos originais |
| SHA-256 tar.gz | `00cfcc96f51c6cef36ed3753b77831bc000cb0e79add855f84abd9a75c782020` |
| SHA-256 manifest.json | `2bcaa329cb40f2767fe5e9b4df2125b39799c1b2e2db544843137e5d1fcceae5` |
| SHA-256 diagnostic-tool.py | `a6b4a77d725f24c31f1a8368983ff8a28bde0db4c29de61e0a18b7d1cf254378` |
| SHA-256 source.json | `fa4a318dfa1c636d6ae9611765710f28906d95c38defe3adc016cb37eaa3a92a` |
| Tipo | prisma-diagnostic; productionRelease=false |
| Método | offline-verified-dependencies |

O SHA do verificador foi recalculado: é igual ao anterior porque o arquivo não mudou.
Tar, manifesto e packageId são novos. Não alterar o verificador apenas para produzir outro hash.
As duas montagens offline em diretórios distintos produziram tar, manifesto, verificador e
recibo **byte a byte idênticos**. Isso comprova reprodução para estes inputs e esta toolchain.

Diretórios adicionais locais, ignorados pelo Git:

- `build/oci-deploy-06-1-2-prisma-diagnostic/source/`: exportação pública revisada e source.json.
- `build/oci-deploy-06-1-2-prisma-diagnostic/reproducibility-copy/`: segunda montagem idêntica.
- `build/oci-deploy-06-1-2-prisma-diagnostic/audit-package.py`: auditor local, sem comandos remotos.
- `build/oci-deploy-06-1-2-prisma-diagnostic/local-audit.json`: resultado local da auditoria.

Somente os quatro arquivos da pasta do packageId serão candidatos à transferência futura.
Fontes, testes, cópia de reprodução e auditor local não integram a distribuição de runtime.

## C. Compatibilidade e procedência

| Componente | Resultado |
| --- | --- |
| Host de empacotamento | Darwin/macOS arm64; Node **22.23.3**; Python **3.9.6** |
| Destino contratado | Oracle Linux **9.8**, Linux **arm64/aarch64**, OpenSSL **3** |
| Node de destino/toolchain nativa herdada | **22.23.2** |
| npm da geração nativa original | **10.9.8**; não executado nesta montagem |
| Prisma Client e gerador original | **6.12.0**, sem regeneração |
| dotenv | **16.6.1**, inalterado |
| Engine | linux-arm64-openssl-3.0.x |
| Cabeçalho do engine | ELF64, little endian, e_machine=183/AArch64 |
| Tamanho do engine | 15.335.624 bytes |
| SHA-256 do engine | `116c9f3661e626c81587ab89cedc7e7d2ff3ac5ad53b7e3585bafb737546706c` |

O manifesto distingue `packager` da toolchain herdada e registra `runtimeProvenance` com os
pins do pacote anterior e os hashes dos 13 arquivos reutilizados. `validation.nativeRuntime`
é **NOT_EXECUTED**. Não atribuir a esta montagem os testes nativos históricos do pacote antigo.

Importação real de @prisma/client e dotenv em extração fora do checkout: PASS, seis módulos
carregados exclusivamente de dentro do pacote, Prisma 6.12.0, sem construir PrismaClient,
carregar o engine Linux ou abrir conexão. O preflight e o launcher recusaram corretamente
o Mac com `LINUX_ARM64_REQUIRED`, exit 1 e um único JSON, sem stderr operacional.

Uma verificação exploratória de igualdade byte a byte entre schema fonte e schema gerado
anterior retornou diferença. A inspeção demonstrou apenas normalização de alinhamento de
espaços pelo gerador original no modelo TaskMovement; não houve diferença nos tokens.
Ambos permanecem intactos. A guarda de reutilização exige igualdade do **input fonte**
e lockfile originais; o schema gerado é reutilizado pelos seus próprios bytes e hash verificados.

## D. Inventário e segurança

O inventário completo, com tamanho, modo e SHA de cada arquivo, está no manifest.json e na
[evidência E01](evidence/oci-deploy-06-1-2-prisma-diagnostic/E01_LOCAL_PACKAGE_VALIDATION.json).

| Grupo | Arquivos incluídos |
| --- | --- |
| Fontes internas, 7 | diagnóstico canônico; heatwave-connection; oci-compatibility-safety; reexport database-safety; Prisma compartilhado; database-safety do src; schema.prisma |
| Drivers, 2 | diagnostic-launcher.mjs e diagnostic-runtime.mjs |
| @prisma/client, 5 | default.js, index.js, package.json, LICENSE, runtime/library.js |
| .prisma/client, 5 | default.js, index.js, package.json, schema.prisma, engine ARM64 |
| dotenv, 3 | lib/main.js, package.json, LICENSE |
| Contrato, 2 | backend/package.json mínimo e diagnostic-tool.py |

Todos os membros são arquivos regulares 0644. Não existem nomes absolutos, traversal,
duplicatas, symlinks, hardlinks, diretórios extras, arquivos especiais ou payload fora da
allowlist. O extrator original verificou o pacote antes e depois da montagem. O inventário
permaneceu igual após os testes na extração independente.

Nenhum .env/.env.example, credencial, chave, token, cookie, autorização, password.json,
backup, dump, log ou arquivo privado integra o pacote. A verificação combina origem pública,
allowlist fechada, comparação de hashes e scanner de padrões em todos os 24 arquivos.
Scanner de padrões não é prova universal contra qualquer segredo arbitrário; nenhum arquivo
de credenciais real foi acessado nesta entrega.

TLS estrito, CA/hostname/identidade, roles/grants, pool/timeouts, recusa de root, ambiente
explícito, integridade e política fail-closed permanecem no mesmo código aprovado. Nenhuma
das seis consultas mudou, incluindo @@datadir; a ordem e Q5 condicional foram comparadas
com cf155225 e testadas novamente sobre o conteúdo empacotado.

Pacote anterior preservado, com os quatro hashes conferidos novamente:

| Arquivo anterior | SHA-256 |
| --- | --- |
| tar.gz efa7abc8191bbf10 | `5344f07d4387f17f57d57e1418e0772a2a10b10ca51079f2b9f41080152a730b` |
| manifest.json | `e155bf4ccf3e323a4fd2b0b9bafb1451713d1127bf501b9ca7df7ca17be00ea1` |
| diagnostic-tool.py | `a6b4a77d725f24c31f1a8368983ff8a28bde0db4c29de61e0a18b7d1cf254378` |
| artifact.json | `eb9db0cccbc11fd908bfbaa11ad73916f3ceea86246ef96ec9cbf870ddd62eeb` |

## E. Testes e reprodução local

**59 testes distintos PASS:** 40 Node da instrumentação/launcher e 19 Python do formato,
extrator e modo offline. Além disso, os mesmos 40 testes Node passaram sobre módulos do
pacote extraído fora do checkout. Nenhum teste ignorado; nenhuma falha nas suítes finais.

```bash
env -i PATH=/usr/bin:/bin /opt/homebrew/opt/node@22/bin/node \
  --experimental-vm-modules --test --test-reporter=spec \
  deploy/tests/heatwave-diagnostic.test.mjs deploy/tests/diagnostic-launcher.test.mjs

env -i PATH=/usr/bin:/bin TMPDIR=/private/tmp \
  /Library/Developer/CommandLineTools/usr/bin/python3 -I -B \
  -m unittest discover -s deploy/tests -p 'test_diagnostic_*.py' -v

# Executado a partir de backend/:
env -i PATH=/usr/bin:/bin /opt/homebrew/opt/node@22/bin/node \
  node_modules/eslint/bin/eslint.js \
  scripts/validate-oci-heatwave-connection.js scripts/lib/heatwave-connection.js

# Executado a partir da raiz:
env -i PATH=/usr/bin:/bin /opt/homebrew/opt/node@22/bin/node \
  backend/node_modules/prettier/bin/prettier.cjs --check \
  backend/scripts/validate-oci-heatwave-connection.js \
  backend/scripts/lib/heatwave-connection.js deploy/scripts/diagnostic-launcher.mjs \
  deploy/tests/heatwave-diagnostic.test.mjs deploy/tests/diagnostic-launcher.test.mjs
git diff --check
```

ESLint, Prettier, sintaxe Python e diff check: PASS. O aviso experimental de VM Modules é
restrito ao harness de testes. Nenhuma flag experimental entra no comando operacional.
Os testes cobrem P2010 em cada SQL, códigos/metadata adversariais, saída única, ausência de
vazamento, falhas primárias/limpeza, ordem/Q5 e os controles de arquivo/procedência do pacote.

Montagem executada duas vezes pelo comando abaixo, com saídas distintas e inexistentes;
não reexecutar sobre esses diretórios já preenchidos:

```bash
env -i PATH=/opt/homebrew/opt/node@22/bin:/Library/Developer/CommandLineTools/usr/bin:/usr/bin:/bin \
  /opt/homebrew/opt/node@22/bin/node scripts/package-diagnostic.mjs offline \
  --source /Users/daniel/Coding/Traceflow/build/oci-deploy-06-1-2-prisma-diagnostic/source \
  --source-sha256 fa4a318dfa1c636d6ae9611765710f28906d95c38defe3adc016cb37eaa3a92a \
  --base-archive /Users/daniel/Coding/Traceflow/build/oci-deploy-06-1-prisma-diagnostic/traceflow-prisma-diagnostic-efa7abc8191bbf10/traceflow-prisma-diagnostic-efa7abc8191bbf10.tar.gz \
  --base-sha256 5344f07d4387f17f57d57e1418e0772a2a10b10ca51079f2b9f41080152a730b \
  --base-manifest-sha256 e155bf4ccf3e323a4fd2b0b9bafb1451713d1127bf501b9ca7df7ca17be00ea1 \
  --output /Users/daniel/Coding/Traceflow/build/oci-deploy-06-1-2-prisma-diagnostic/traceflow-prisma-diagnostic-fa4a318dfa1c636d
```

A segunda saída foi `build/oci-deploy-06-1-2-prisma-diagnostic/reproducibility-copy`.
O auditor local `audit-package.py` extraiu em diretório temporário próprio, executou os testes
com somente seus caminhos de import redirecionados para o pacote, verificou importações e
recusas no Mac e removeu apenas a extração/harness temporários. Não alterou o tar nem a árvore
verificada. O runtime ficou separado do checkout e de seus node_modules.

Não executados: npm ci/install, Prisma generate/validate, novo carregamento nativo Linux,
suítes com MySQL, aplicação/worker, migrations, DNS/probe TLS gerenciado ou D03. Restrições
do escopo e diferença de SO impedem atribuir PASS a esses itens.

## F. OCI-DEPLOY-06.1.3 — procedimento futuro, NÃO EXECUTADO

### F1. Autorização e destino

Obter autorização explícita para transferência, instalação em diretório exclusivo e
preflight local sem banco. Confirmar por canal já confiável o destino SSH/fingerprint.
O runbook anterior registra `opc@144.22.183.254`/traceflowapp: esse endereço **não foi
revalidado**; se mudou, interromper e revisar os comandos. Não usar ssh-keyscan como confiança
automática. Nenhuma credencial, autorização JSON ou desbloqueio MySQL integra esta etapa.

Na futura sessão da VM como opc, criar apenas o trânsito novo:

```bash
set -eu
umask 077
test "$(id -un)" = opc
test ! -e /home/opc/traceflow-prisma-diagnostic-fa4a318dfa1c636d.incoming
test ! -L /home/opc/traceflow-prisma-diagnostic-fa4a318dfa1c636d.incoming
mkdir -m 0700 /home/opc/traceflow-prisma-diagnostic-fa4a318dfa1c636d.incoming
```

No Mac, somente após essa autorização e preparação:

```bash
DIAGNOSTIC_ARTIFACT_DIR=/Users/daniel/Coding/Traceflow/build/oci-deploy-06-1-2-prisma-diagnostic/traceflow-prisma-diagnostic-fa4a318dfa1c636d
scp -o StrictHostKeyChecking=yes \
  "$DIAGNOSTIC_ARTIFACT_DIR/traceflow-prisma-diagnostic-fa4a318dfa1c636d.tar.gz" \
  "$DIAGNOSTIC_ARTIFACT_DIR/manifest.json" \
  "$DIAGNOSTIC_ARTIFACT_DIR/diagnostic-tool.py" \
  "$DIAGNOSTIC_ARTIFACT_DIR/artifact.json" \
  opc@144.22.183.254:/home/opc/traceflow-prisma-diagnostic-fa4a318dfa1c636d.incoming/
```

### F2. Staging protegido e verificação externa

Em sessão root autorizada da VM. Espera-se que a base dedicada já exista pela instalação
anterior: root:traceflow 0750, incoming root:root 0700. Se divergir, parar; não reparar
proprietário/permissões de diretórios existentes automaticamente.

```bash
set +x
set -eu
umask 077
test "$(id -u)" -eq 0
DIAGNOSTIC_PACKAGE_ID=traceflow-prisma-diagnostic-fa4a318dfa1c636d
DIAGNOSTIC_BASE=/opt/traceflow-diagnostics
DIAGNOSTIC_TRANSIT=/home/opc/traceflow-prisma-diagnostic-fa4a318dfa1c636d.incoming
DIAGNOSTIC_STAGING_DIR=/opt/traceflow-diagnostics/incoming/traceflow-prisma-diagnostic-fa4a318dfa1c636d
DIAGNOSTIC_PACKAGE_DIR=/opt/traceflow-diagnostics/traceflow-prisma-diagnostic-fa4a318dfa1c636d

/usr/bin/python3 -I -c '
import grp, os, stat
from pathlib import Path
base=Path("/opt/traceflow-diagnostics")
for p in (Path("/opt"),base,base/"incoming"):
    s=p.lstat()
    assert str(p)==os.path.realpath(p) and stat.S_ISDIR(s.st_mode)
    assert s.st_uid==0 and not s.st_mode & 0o022
assert base.stat().st_gid==grp.getgrnam("traceflow").gr_gid
assert stat.S_IMODE(base.stat().st_mode)==0o750
assert (base/"incoming").stat().st_gid==0
assert stat.S_IMODE((base/"incoming").stat().st_mode)==0o700
'
test ! -e "$DIAGNOSTIC_STAGING_DIR"
test ! -L "$DIAGNOSTIC_STAGING_DIR"
test ! -e "$DIAGNOSTIC_PACKAGE_DIR"
test ! -L "$DIAGNOSTIC_PACKAGE_DIR"
test -d "$DIAGNOSTIC_TRANSIT"
test ! -L "$DIAGNOSTIC_TRANSIT"
install -d -o root -g root -m 0700 "$DIAGNOSTIC_STAGING_DIR"
for public_file in "$DIAGNOSTIC_PACKAGE_ID.tar.gz" manifest.json diagnostic-tool.py artifact.json; do
  test -f "$DIAGNOSTIC_TRANSIT/$public_file"
  test ! -L "$DIAGNOSTIC_TRANSIT/$public_file"
  install -o root -g root -m 0644 "$DIAGNOSTIC_TRANSIT/$public_file" "$DIAGNOSTIC_STAGING_DIR/$public_file"
done
cd "$DIAGNOSTIC_STAGING_DIR"
sha256sum --check <<'CHECKSUMS'
00cfcc96f51c6cef36ed3753b77831bc000cb0e79add855f84abd9a75c782020  traceflow-prisma-diagnostic-fa4a318dfa1c636d.tar.gz
2bcaa329cb40f2767fe5e9b4df2125b39799c1b2e2db544843137e5d1fcceae5  manifest.json
a6b4a77d725f24c31f1a8368983ff8a28bde0db4c29de61e0a18b7d1cf254378  diagnostic-tool.py
CHECKSUMS
test "$(stat -c %s "$DIAGNOSTIC_PACKAGE_ID.tar.gz")" -eq 7499618
```

Os pins devem vir deste relatório revisado por canal independente, nunca apenas do recibo
copiado junto do tar. Não executar o verificador transferido antes de validar seu hash.

### F3. Extração e proprietários

Na mesma sessão, após todos os pins passarem:

```bash
/usr/bin/python3 -I "$DIAGNOSTIC_STAGING_DIR/diagnostic-tool.py" extract \
  --archive "$DIAGNOSTIC_STAGING_DIR/traceflow-prisma-diagnostic-fa4a318dfa1c636d.tar.gz" \
  --sha256 00cfcc96f51c6cef36ed3753b77831bc000cb0e79add855f84abd9a75c782020 \
  --manifest-sha256 2bcaa329cb40f2767fe5e9b4df2125b39799c1b2e2db544843137e5d1fcceae5 \
  --destination "$DIAGNOSTIC_PACKAGE_DIR"
chown -R root:traceflow "$DIAGNOSTIC_PACKAGE_DIR"
chmod 0750 "$DIAGNOSTIC_PACKAGE_DIR"

sudo -u traceflow env -i PATH=/usr/bin:/bin HOME=/nonexistent \
  /usr/bin/python3 -I "$DIAGNOSTIC_PACKAGE_DIR/diagnostic-tool.py" verify \
  --root "$DIAGNOSTIC_PACKAGE_DIR" \
  --manifest-sha256 2bcaa329cb40f2767fe5e9b4df2125b39799c1b2e2db544843137e5d1fcceae5
```

Esperado: VERIFIED, packageId novo e files=24. Diretório raiz 0750, subdiretórios 0755,
arquivos 0644, root:traceflow; nenhuma escrita pelo executor. Não instalar em releases/current,
webroot ou pasta do pacote anterior. Não executar npm, Prisma CLI ou aplicação.

### F4. Runtime e CA pública, sem conexão

Confirmar ausência de API/worker/processos concorrentes no UID traceflow e manter SELinux
Enforcing. Os seguintes comandos somente inspecionam/carregam arquivos locais:

```bash
test "$(uname -m)" = aarch64
test "$(/usr/bin/node --version)" = v22.23.2
test "$(getenforce)" = Enforcing
cat /etc/oracle-release
openssl version
sudo -u traceflow env -i PATH=/usr/bin:/bin HOME=/nonexistent \
  /usr/bin/node /opt/traceflow-diagnostics/traceflow-prisma-diagnostic-fa4a318dfa1c636d/deploy/scripts/diagnostic-runtime.mjs

sudo -u traceflow env -i PATH=/usr/bin:/bin HOME=/nonexistent \
  /usr/bin/node --input-type=module -e '
try {
  const {protectedFile,publicCaContract}=await import("file:///opt/traceflow-diagnostics/traceflow-prisma-diagnostic-fa4a318dfa1c636d/backend/scripts/lib/heatwave-connection.js");
  const pem=await protectedFile("/etc/pki/traceflow/mysql-ca.pem",{rootOwned:true});
  const ca=publicCaContract(pem,"2eaee0e206741bf81b651f1ae33f44f0a92949ed6a99137a4aa8b0013486d295");
  console.log(JSON.stringify({status:"CA_VALID",sha256:ca.sha256,connected:false}));
} catch(error) {
  console.log(JSON.stringify({status:"FAIL",code:/^[A-Z0-9_]{1,64}$/.test(error.code||"")?error.code:"CA_INVALID",connected:false}));
  process.exitCode=1;
}'
```

Esperado: RUNTIME_VALID, Node22.23.2, Prisma6.12.0, nativeLoaded=true e connected=false;
depois CA_VALID com fingerprint DER conhecido. O fingerprint é o registrado anteriormente
pelo operador; divergência exige interrupção, sem substituir CA ou relaxar TLS.

Não executar o launcher `--validate-only` na 06.1.3: apesar de não conectar, esse contrato
exige senha e autorização válidas. Não criar password.json/authorization.json nem desbloquear
traceflow_diag para satisfazê-lo. Não executar DNS, probe TLS ou SQL nesta instalação.

### F5. Reversão

Não existe symlink de ativação nem alteração de serviço/aplicação/banco a reverter. Se qualquer
verificação falhar, interromper e preservar a evidência; o pacote anterior continua intacto.
Não voltar automaticamente a executá-lo e não misturar seus arquivos com os novos.

Se a remoção for posteriormente autorizada, primeiro confirmar ausência de processo usando
o novo diretório e verificar seu inventário. Remover somente estes destinos exclusivos:

- `/opt/traceflow-diagnostics/traceflow-prisma-diagnostic-fa4a318dfa1c636d`
- `/opt/traceflow-diagnostics/incoming/traceflow-prisma-diagnostic-fa4a318dfa1c636d`
- `/home/opc/traceflow-prisma-diagnostic-fa4a318dfa1c636d.incoming`

Não remover a base, o pacote efa7abc8191bbf10, certificados, configurações, releases ou dados.
Nenhuma limpeza remota automática foi criada.

## G. Pendências e riscos residuais

1. Revisão humana do modo offline, fontes e pins antes de autorizar 06.1.3.
2. Confirmação do destino SSH, fingerprint, diretórios/proprietários e janela de instalação.
3. Novo preflight nativo do pacote na VM: pendente; ELF e bytes herdados não o substituem.
4. Homologação gerenciada D03: continua FAIL; fase/código nativo originais ainda desconhecidos.
5. Novo D03 exigirá autorização separada para credenciais, B40/B41, conexão e D04/relock.
6. Hashes e proveniência não são assinatura. Pins precisam ser conferidos por canal confiável.
7. A receita nativa mantém seus requisitos, mas não foi reexecutada; testes desta entrega
   exercitam o modo offline. Revisões futuras de schema/lockfile/shared client bloqueiam reutilização.
8. O pacote preserva consultas potencialmente incompatíveis de propósito; uma nova falha
   P2010 não é regressão presumida e deverá ser interpretada pelos campos sanitizados.

## H. Encerramento

**PASS LOCAL para empacotamento offline, integridade, isolamento e testes simulados.**
Nenhuma operação externa, instalação, migration, SQL, deploy, commit ou push ocorreu.
Prisma–HeatWave não foi homologado. D03 permanece FAIL, D04 anterior permanece apenas o
estado informado pelo operador. OCI-DEPLOY-06.1.3 e OCI-DEPLOY-07 não foram iniciados.
