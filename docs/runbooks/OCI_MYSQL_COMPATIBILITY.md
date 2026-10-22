# OCI — compatibilidade isolada de MySQL e ARM64

## 1. Objetivo e limites

Validar a aplicação existente antes de autorizar migrations ou deployment. Este procedimento
cria seu próprio processo MySQL, utiliza somente fixtures sintéticas e remove apenas o
ambiente pertencente à execução. Não aceita um servidor previamente instalado, nem mesmo
`localhost:3306`, um túnel ou um schema vazio em um servidor compartilhado.

O banco de desenvolvimento, `traceflow`, o endpoint OCI `10.20.2.25:3306` e qualquer ambiente
com dados reais são protegidos. Não executar este procedimento na VM de produção.
Não usar `migrate reset`, `migrate dev`, `db push`, seeds reais ou credenciais administrativas
existentes. A homologação do HeatWave é uma decisão e uma execução separadas.

Resultados desta entrega: [relatório OCI-DEPLOY-02](../deliveries/OCI_DEPLOY_02_MYSQL_ARM64_COMPATIBILITY_REPORT.md).
Referências internas: [migrations](DATABASE_MIGRATIONS.md),
[worker](GITHUB_AUTOMATIC_SYNC.md), [incidentes](INCIDENT_RESPONSE.md) e
[arquitetura](../architecture/SYSTEM_ARCHITECTURE.md).

## 2. Versões e alcance

O runner aceita exatamente MySQL **8.4.8** ou **26.7.0**, Node.js **22** e exige Prisma Client
**6.12.0**. CLI e Client são instalados pelo lockfile, sem atualização. A baseline desta
entrega tem 58 models, 32 enums e 67 migrations. Não generalizar o resultado para qualquer
versão futura ou para outra implementação, como MariaDB.

A matriz publicada do [Prisma v6](https://www.prisma.io/docs/orm/v6/reference/supported-databases)
lista MySQL 8.4, mas não declara 26.7. O resultado aqui é evidência experimental sobre a
baseline identificada, não uma ampliação do suporte contratual do fornecedor.

## 3. Pré-requisitos e procedência

- Checkout revisado; registrar branch, SHA e alterações locais antes de executar.
- Node 22 e npm no mesmo diretório de executáveis; Python 3 apenas para o launcher abaixo.
- Distribuição oficial MySQL descompactada, contendo `bin/mysql` e `bin/mysqld`.
- Usuário de sistema sem privilégios administrativos; porta livre entre 49152 e 65535.
- Acesso público a npm e ao serviço de distribuição dos engines Prisma; espaço temporário
  suficiente para dois conjuntos de dependências, banco descartável e cache.
- Para Linux ARM64: glibc, OpenSSL 3, zlib e libgcc; o servidor MySQL usado nos testes também
  precisou de libaio. `numactl-libs` já estava presente na imagem Oracle Linux.

Obter o MySQL na [distribuição oficial](https://dev.mysql.com/downloads/mysql/) ou no
[arquivo oficial de versões](https://downloads.mysql.com/archives/community/). Conferir o
checksum publicado e a assinatura GPG antes de executar. Guardar URL, tamanho, hash SHA-256
local, fingerprint e resultado da verificação. A
[documentação de assinaturas](https://dev.mysql.com/doc/refman/26.7/en/checking-gpg-signature.html)
identifica o fingerprint `BCA43417C3B485DD128EC6D4B7B3B788A8D3785C`.

Usar um keyring temporário exclusivo para chaves públicas. A chave obtida de
`https://repo.mysql.com/RPM-GPG-KEY-mysql-2023` estava expirada; a renovação publicada em
`https://repo.mysql.com/RPM-GPG-KEY-mysql-2025` preserva esse fingerprint. Não contornar
expiração alterando o relógio ou aceitando automaticamente qualquer chave. Os hashes e os
resultados efetivos estão no relatório; MD5 isoladamente não substitui autenticidade.

O runner verifica a versão real e calcula hashes, mas **não baixa nem autentica a origem do
pacote por conta própria**. A conferência de procedência é um pré-requisito do operador.

## 4. Isolamento e prova de propriedade

`validate-oci-mysql-compatibility.js` reutiliza `scripts/lib/database-safety.js` e acrescenta
restrições específicas para este experimento:

1. `TEST_DATABASE_URL` obrigatória; `DATABASE_URL` externa é recusada, sem fallback.
2. Host literal `127.0.0.1`, porta efêmera, sem DNS, socket, query string ou fragmento.
3. Schema `tf_oci_<12 caracteres hexadecimais>_test`, usuário com o mesmo identificador e
   senha efêmera aleatória de 32 bytes representada em hexadecimal.
4. Porta reservável; nenhuma tentativa de aproveitar outro servidor em caso de conflito.
5. Diretório temporário exclusivo, marcador de propriedade e nonce aleatório.
6. `mysqld --no-defaults` inicializa apenas esse datadir. Um `init-file` temporário instala
   a credencial da execução e uma senha root aleatória que não é usada pelos testes.
7. Antes de fixtures, compara versão SQL, UUID do `auto.cnf`, datadir real, porta, schema,
   PID do processo filho e nonce armazenado em um schema de controle da própria execução.
8. Usuário limitado ao prefixo dessa execução; leitura de `mysql.user` deve ser negada e
   autenticação com senha incorreta deve falhar.
9. Workspace copiado por allowlist, sem `.env`, dados ou `node_modules`; configurações npm
   vazias e cache temporário. Os helpers existentes continuam recebendo TEST_DATABASE_URL.
10. Ao terminar, encerra somente o processo filho. A remoção exige servidor parado,
    diretório real sem symlink, proprietário do sistema e marcador idêntico ao original.

Os validators históricos criam e excluem schemas auxiliares dentro desse prefixo. A
credencial não possui privilégio global para excluir bancos externos ao prefixo. Todos os
schemas estão em um processo novo desta execução, sem dados anteriores. Não executar os
validators avulsos contra servidores existentes para tentar reproduzir este resultado.

## 5. Ambiente Linux ARM64 descartável

Preferir máquina Linux ARM64 dedicada a testes. Nesta entrega foi usada virtualização
nativa VZ sobre host Apple ARM64, com Lima 2.2.1 e uma imagem oficial Oracle Linux 9.8.
Isso prova execução de instruções ARM64 no guest; não reproduz desempenho de um Ampere A1.

Configuração mínima utilizada, dentro de um `LIMA_HOME` novo e exclusivo:

```yaml
vmType: vz
arch: aarch64
cpus: 2
memory: 4GiB
disk: 16GiB
images:
  - location: https://yum.oracle.com/templates/OracleLinux/OL9/u8/aarch64/OL9U8_aarch64-kvm-cloud-b182.qcow2
    arch: aarch64
    digest: sha256:4793c3ec49d9f8b27a932d3bd88ec45d08249c5195faa3b0fac876ab0d5f5856
mounts: []
ssh:
  loadDotSSHPubKeys: false
  forwardAgent: false
containerd:
  system: false
  user: false
portForwards:
  - guestPortRange: [1, 65535]
    ignore: true
propagateProxyEnv: false
rosetta:
  enabled: false
```

O [driver VZ](https://lima-vm.io/docs/config/vmtype/vz/) usa a virtualização nativa do macOS.
Não utilizar templates que montem automaticamente o diretório pessoal. Manter SELinux
Enforcing; instalar bibliotecas somente no guest descartável. Copiar explicitamente os
arquivos de backend da allowlist do runner. Não copiar `.env`, chaves, uploads ou dependências
do host. Executar o mesmo launcher dentro do guest, apontando para binários Linux ARM64.

A distribuição Linux MySQL usada foi
`mysql-26.7.0-linux-glibc2.28-aarch64.tar.xz`; a extração omitiu apenas `bin/mysqld-debug`
e `lib/debug`. O servidor executado foi `bin/mysqld`, sem modificação.

## 6. Variáveis

| Variável                                                                             | Origem e finalidade                                                                                                                              |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TEST_DATABASE_URL`                                                                  | Obrigatória, gerada para a execução; segredo efêmero, nunca imprimir.                                                                            |
| `DATABASE_URL`                                                                       | Proibida na entrada. O runner usa valor sentinela nos helpers e fornece a URL já comprovada apenas aos comandos Prisma que exigem essa variável. |
| `PATH`                                                                               | Node 22 e npm correspondentes. O ambiente dos filhos é reconstruído por allowlist.                                                               |
| `TMPDIR`                                                                             | Diretório temporário local permitido; não usar volumes com dados reais.                                                                          |
| `NODE_ENV`, `EMAIL_PROVIDER`                                                         | Fixados como `test` e `capture` nos filhos; nenhuma entrega real de e-mail.                                                                      |
| `TF_OCI_OWNER_TOKEN`, `TF_OCI_SERVER_UUID`, `TF_OCI_DATADIR`, `TF_OCI_MYSQL_VERSION` | Internas, transmitidas pelo runner aos probes. Não preencher manualmente. O nonce é redigido nos relatórios.                                     |
| `npm_config_userconfig`, `npm_config_globalconfig`, `npm_config_cache`               | Apontam para arquivos vazios e cache da execução. Não herdam credenciais npm pessoais.                                                           |

## 7. Execução reproduzível

Não carregar `.env` com `source`, não exportar credenciais existentes e não habilitar shell
tracing. O exemplo gera uma identidade nova em memória e fornece TEST_DATABASE_URL
explicitamente ao processo filho. Escolha caminhos locais reais para os argumentos; nenhum
segredo precisa ser digitado ou salvo. Execute como usuário não root.

```bash
python3 - /caminho/checkout/backend /caminho/node22/bin/node \
  /caminho/mysql-26.7.0-descompactado 26.7.0 /caminho/novo-relatorio.json <<'PY'
from pathlib import Path
import secrets, subprocess, sys
backend, node, mysql_base, version, report = sys.argv[1:]
run_id = secrets.token_hex(6)
password = secrets.token_hex(32)
port = 49152 + secrets.randbelow(16384)
env = {
    'PATH': str(Path(node).parent) + ':/usr/bin:/bin:/usr/sbin:/sbin',
    'TEST_DATABASE_URL': f'mysql://tf_oci_{run_id}:{password}@127.0.0.1:{port}/tf_oci_{run_id}_test',
}
command = [node, str(Path(backend) / 'scripts/validate-oci-mysql-compatibility.js'),
           '--mysql-base', mysql_base, '--expected-version', version, '--report', report]
sys.exit(subprocess.run(command, cwd=backend, env=env).returncode)
PY
```

Repetir com a distribuição exata 8.4.8 e **outro arquivo de relatório** para comparação.
Não reaproveitar servidor, datadir, senha ou schema. O relatório anterior não é sobrescrito.
Conflito de porta é falha de ambiente: inspecionar e iniciar outra execução com identidade
nova. Não conectar ao processo que já ocupa a porta.

## 8. Validações automáticas

O runner executa, nesta ordem:

1. Inventário, hash da cadeia e versão do binário; inicialização e prova de propriedade.
2. `npm ci --no-audit --no-fund`; `prisma validate`; `prisma generate`.
3. Prisma conectado, engine carregado, Argon2 hash/verify com parâmetros reais da aplicação.
4. `prisma migrate deploy` e `prisma migrate status`; ledger com 67 nomes, checksums,
   `finished_at` e ausência de falhas/rollback ou migrations pendentes.
5. Metadados de índices, FKs, CHECKs, collation e coluna gerada; INSERTs e UPDATEs inválidos
   rejeitados pelos seis CHECKs; unicidade nullable, comparações binárias, FKs, JSON,
   CTE/UNION, precisão temporal e rollback de fixtures.
6. Deadlock real, retry do helper existente, NOWAIT, lock timeout, timeout transacional
   e leitura repetível. Não há retry automático de testes com falha.
7. Quatorze invocações de validators históricos e drift, sequenciais, incluindo os três
   modos de `validate-github-sync-migration.js`.
8. Todas as suítes `test/api` e `test/integration`, com `fileParallelism: false`.
9. `npm prune --omit=dev --ignore-scripts --no-audit --no-fund`; Vitest ausente; novo probe
   de engine, conexão, Argon2 e importação do grafo real de `src/app.js`.
10. Desconexão, encerramento e limpeza com propriedade comprovada; relatório JSON sanitizado.

O exit code 0 significa que as fases locais selecionadas concluíram. Examinar também
`classification`, `linuxArm64`, `heatWave`, skips e `cleanup`: sucesso local não libera
produção. Falhas interrompem a cadeia; testes posteriores não executados não são aprovados.

## 9. Operações destrutivas e interrupções

As limpezas das suítes são destrutivas **somente no MySQL recém-criado pelo runner**.
Nunca apontar os helpers para DEV/OCI. SIGINT/SIGTERM encerra os filhos e o servidor;
timeouts têm término limitado e fallback de SIGKILL para o processo pertencente ao runner.
Não existe recuperação automática de uma execução interrompida por SIGKILL da própria
ferramenta ou por desligamento do host. Nesse caso, preservar o diretório e investigar o
PID, UUID, datadir e marcador antes de qualquer limpeza; não usar `pkill mysqld` ou `rm -rf`
com padrões globais.

Para uma VM Lima, parar e excluir somente a instância criada no `LIMA_HOME` exclusivo,
depois de recolher os relatórios e comprovar que o runner terminou. Não operar instâncias
pré-existentes do usuário. Cache de downloads não contém dados do TraceFlow.

## 10. Prisma, pool e encerramento

O provider continua `mysql`; a arquitetura Route → Controller → Service → Repository →
Prisma → MySQL permanece intacta. `src/database/prismaClient.js` centraliza o Client e
vincula explicitamente a datasource nos testes. API e worker possuem caminhos de
`$disconnect`; os probes também encerram suas conexões.

A aplicação não fixa `connection_limit`, `pool_timeout` ou `connect_timeout` no Client.
Cada processo terá seu pool. Dimensionar API + worker + migration job no contrato de
produção, com orçamento total inferior a `max_connections` e margem operacional. Não
copiar limites inferidos do computador de desenvolvimento.

## 11. ARM64 e artefato

Gerar e instalar dependências no próprio Linux ARM64. O engine esperado nesta baseline é
`linux-arm64-openssl-3.0.x`. O probe verifica bibliotecas realmente carregadas, não apenas
o nome de um arquivo. Testa Argon2id com memória 19456 KiB, duas iterações e paralelismo 1,
incluindo rejeição da senha errada. As
[dependências de sistema do Prisma](https://www.prisma.io/docs/orm/v6/reference/system-requirements)
devem ser atendidas na imagem de build e no runtime.

Prisma e Argon2 são dependências nativas do backend. Rolldown, Lightning CSS e fsevents
aparecem no tooling; npm seleciona a plataforma aplicável. Pacotes Argon2 distribuem
prebuilds de várias plataformas: sua presença não significa que todos foram carregados.
O artefato não pode carregar engine Darwin/x86 em Linux ARM64. Preservar Client gerado e
seus engines após prune; o CLI Prisma pode permanecer como peer dependency do Client.
O resultado não inclui empacotamento/publicação de release nem teste de systemd/Nginx.

## 12. MySQL e diferenças de plataforma

Comparar fingerprints físicos, comportamento e dados reais de `@@sql_mode`, collation,
timezone, engine e `@@lower_case_table_names`. MacOS usa valor 2 neste experimento;
Linux usa 0. Não transportar datadir entre essas plataformas. DDL e fixtures são
reaplicadas a um banco vazio em cada execução.

## 13. TLS e HeatWave: gate separado

O runner local não é um homologador de certificados: usa loopback e TLS/defaults da
instância efêmera e registra o cipher do Client. Não reutilizar sua URL em produção.

Planejamento para um futuro HeatWave de homologação autorizado:

- Obter cadeia confiável e identidade DNS/IP correspondente ao certificado real, sem
  presumir que o IP privado informado consta no SAN. Certificado Cloudflare Origin CA
  do Nginx é independente do certificado MySQL.
- Configurar `sslaccept=strict` e CA com `sslcert` em caminho protegido/estável. Se houver
  autenticação mTLS, tratar `sslidentity` e sua senha como segredos separados. O
  [conector Prisma v6](https://www.prisma.io/docs/orm/v6/overview/databases/mysql)
  documenta esses parâmetros; seu default permissivo não é aceitável como contrato final.
- Demonstrar recusa de CA errada, hostname errado, certificado expirado e transporte sem
  TLS. Coletar `Ssl_cipher`, `Ssl_version`, plugin de autenticação e limites do servidor.
- Confirmar contas distintas de aplicação e migrations, sem root e sem privilégios globais;
  DML para runtime e DDL estritamente necessário para o schema de migrations.
- Testar reconexão após manutenção, pool combinado, timeouts e transações na configuração
  gerenciada. A autenticação SQL local não prova suporte à autenticação OCI IAM.

O HeatWave permite certificado definido pelo serviço ou pelo usuário em
[Connections](https://docs.oracle.com/en-us/iaas/mysql-database/doc/advanced-options.html).
Se a cadeia/identidade disponível não satisfizer strict, registrar um bloqueio e decidir
uma solução de certificado suportada; não desabilitar a validação.

Outra diferença material: HeatWave mantém `partial_revokes` habilitado e exige grants
com nomes de schemas completos. O grant por prefixo do experimento local não é uma receita
de permissões para HeatWave. Também há restrições a variáveis globais e tabelas de sistema.
Consultar as [limitações oficiais](https://docs.oracle.com/en-us/iaas/mysql-database/doc/unsupported-features.html).

Existe somente um Always Free reservado para produção. **Este runbook não autoriza testes
destrutivos nele nem criação de recurso pago.** Escolher previamente um alvo gerenciado
separado e seu custo/credenciais, ou manter a homologação gerenciada pendente.

## 14. Problemas conhecidos

- Sandbox pode bloquear bind local ou virtualização: classificar como falha de ambiente,
  sem contornar o guard usando outro servidor.
- Relatórios de INFORMATION_SCHEMA usam BigInt; serializar explicitamente sem alterar
  o valor. Comparação de nomes de migrations usa ordenação JS em ambos os lados, pois a
  collation SQL pode ordenar underscore de outra maneira.
- Cinco testes pré-LR.2 são ignorados no schema atual pelas condições já existentes.
  Registrar seus nomes; os validators históricos exercitam backfills em schemas próprios.
- Verificação `codesign` do pacote macOS 26.7 falhou no host usado. Não alterar/reassinar
  binários para contornar; registrar separadamente da verificação GPG do pacote oficial.
- Limites de CPU, disco e permissões do guest não equivalem aos da VM OCI real.

## 15. Critérios de aprovação

Exigir segurança aprovada, versões exatas, ledger íntegro, seis CHECKs efetivos, contratos
físicos equivalentes, testes funcionais/concorrentes sem falha, skips identificados, engine
e Argon2 reais e runtime após prune. Executar lint, format, architecture, testes dos guards,
varredura de segredos e política de auditoria de dependências. Não aceitar um `SELECT 1`,
build ou geração do Client como prova suficiente.

Os resultados locais e o gate HeatWave são campos independentes. Dúvida de propriedade
exige SAFETY BLOCKED; incompatibilidade funcional reproduzida exige CHANGES REQUIRED e
autorização antes de modificar negócio, Prisma ou migrations históricas.

## 16. Repetição após upgrades

Registrar nova baseline e hashes; baixar a versão exata e verificar procedência; criar
novos ambientes 8.4.8/referência e alvo; repetir a cadeia completa; comparar JSONs, erros
SQL, fingerprints, skips e libs carregadas. Preservar tentativas anteriores e explicar
correções do próprio validador. Não repetir um teste falho até obter verde sem investigar
a causa. Mudança de certificado, configuração HeatWave, Node/OpenSSL, Prisma, Argon2 ou
imagem de sistema exige rever o alcance da evidência anterior.

## OCI06.1 — evidência gerenciada parcial

Em15/10/2026 o operador forneceu validação OpenSSL TLS1.3/hostname aprovada para
`traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com:3306` (10.20.2.25), com CA TraceFlow Internal
Root CA e certificado BYOC User defined. Essa evidência é manual, não execução do Codex.
Prisma Client/CLI6.12.0, schema e68 migrations permanecem iguais à baseline dee40d83.

Os testes novos exercitam a versão exata do parser/driver Prisma e reforçam guards de CA,
identidade/contas/variáveis; os resultados locais e a prova systemd/SELinux ARM64 estão no
[relatório OCI06.1](../deliveries/OCI_DEPLOY_06_1_HEATWAVE_MANAGED_HOMOLOGATION_REPORT.md).
Não se repetiu a matriz extensa8.4/26.7/ARM64 nem DR histórico; a suíte completa atual usa apenas
MySQL Community26.7 descartável e dados sintéticos. Nenhum banco DEV ou OCI foi consultado.

FQDN/CA/SAN conhecidos por relato não eliminam pendências: VERSION() e UUID reais, schema,
autenticação/grants, max_connections/pool agregado, parâmetros, TLS da própria sessão Prisma,
migrations gerenciadas em autorização futura e DR. Não há declaração explícita de suporte
irrestrito a HeatWave26.7 pelo Prisma6.12 baseada nesses testes. Preservar o gate de execução
read-only com autorização e nunca rodar validators que criam schemas no HeatWave reservado.
