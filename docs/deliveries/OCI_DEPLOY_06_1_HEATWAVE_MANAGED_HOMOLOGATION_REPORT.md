# OCI-DEPLOY-06.1 — Managed HeatWave Homologation

Data: 15/10/2026. Classificação: **PARTIAL — implementação validada localmente; Prisma gerenciado PENDING**.
Não é autorização de deploy. [Evidências E01–E16](evidence/oci-deploy-06-1/INDEX.md).

## 1. Resumo executivo

Incorporada a evidência OpenSSL fornecida pelo operador e preparados CA pública, contratos e
procedimento de diagnóstico gerenciado. Foram corrigidas lacunas no diagnóstico/preflight, sem
mudança de negócio, arquitetura, Prisma, schema ou migrations. Testes locais usam somente bancos
novos próprios e certificados sintéticos. A OCI real não foi acessada nesta execução.

TLS SERVER VALIDATION: **PASS — operador**. PRISMA MANAGED VALIDATION: **PENDING**.
HEATWAVE MANAGED: **PARTIAL**. DR PRODUCTION: **PENDING**. OCI06 permanece PARTIAL.
A falta de autorização remota não foi classificada como falha de implementação local.

## 2. Objetivo

Preparar homologação rastreável da integração Prisma 6.12.0/HeatWave 26.7 com TLS/identidade,
privilégios mínimos, timeouts e preservação dos bancos. Reutilizar OCI06; não reconstruir DR,
implantar aplicação ou antecipar OCI07. A evidência TLS isolada não fecha a preparação de produção.

## 3. Baseline

| Item | Verificado nesta execução |
| --- | --- |
| Checkout | `/Users/daniel/Coding/Traceflow`, iYoNuttxD/Traceflow |
| Branch | `daniel-dev` |
| HEAD inicial/final | `dee40d83f9904d22b3dc65cb61f56dc5b4732d7a` |
| Working tree inicial | limpo; diff --check aprovado |
| Working tree final | somente arquivos locais desta entrega, sem staging/commit/push |
| Toolchain host | macOS ARM64; Node 22.23.3/npm 10.9.9; Node 26 disponível não usado nos gates |
| Laboratório systemd | Oracle Linux 9.8 ARM64, VM Lima tf061 nova, SELinux Enforcing |

Não havia AGENTS.md aplicável. Nenhum subagente/skill foi usado. Inventário SHA-256 inicial
permite conferir preservação de cada arquivo rastreado, inclusive documentação acadêmica.

## 4. Histórico das entregas

| Entrega | Estado histórico preservado / efeito atual |
| --- | --- |
| OCI01 | COMPLETE conforme histórico do operador; relatório não versionado neste checkout |
| OCI02 | PARTIAL/BLOCKED; Community 8.4/26.7 e ARM64 demonstrados |
| OCI03 | PASS LOCAL; contrato de ambiente e lifecycle |
| OCI04 | implementação local; bloqueio de upload naquele momento |
| OCI04.1 | PASS LOCAL; partes de 8 MiB preservam envelope funcional sob limite Cloudflare 100 MB |
| OCI05 | PASS LOCAL; releases, migration job, rollback conservador |
| OCI06 | PARTIAL; laboratório de TLS/DR, gerenciado pendente |
| OCI06.1 | presente relatório; gerenciado parcialmente evidenciado pelo operador |
| OCI07 | NÃO INICIADO |

Foram lidos os relatórios OCI02/03/04/04.1/05/06, os runbooks de compatibilidade, ambiente,
serviços, releases, migrations, HeatWave/manutenção, backup/recuperação e uploads; inventariados
arquitetura, segurança e evidências. Os relatórios históricos foram preservados integralmente.

## 5. Estado anterior da OCI-DEPLOY-06

Reutilizados: cliente Prisma compartilhado; `heatwave-connection.js`; diagnóstico read-only;
preflight systemd; bridge de migrations; backup_contract/backup; monitor avaliador e templates;
Lab/probes TLS e ensaios sintéticos. OCI06 já comprovou 68 migrations, 61 tabelas / 116 FKs de fixture,
backup age/restore, falhas, uploads, leases/fencing em 8.4/26.7 e Linux ARM64.
Não reexecutamos a matriz extensa ou R01–R12: não houve alteração da implementação DR.
A preparação de CA e os guards novos justificam os ensaios específicos desta continuação.

## 6. Infraestrutura OCI

Informações do operador, sem consulta remota: região sa-saopaulo-1; traceflow-app/hostname
traceflowapp; A1.Flex ARM64, 2 OCPU/12 GB, OL 9.8, Node 22.23.2/npm 10.9.8, Nginx 1.20.1; SELinux Enforcing,
firewalld ativo. HeatWave traceflow-mysql/MySQL.Free/Active, privado 10.20.2.25:3306.
Cloudflare proxy/Full(strict), Origin CA e página temporária não foram acessados nem alterados.
Não houve ação IAM, DNS, NSG, firewall, Terraform, GitHub App ou console OCI.

## 7. Estado real do HeatWave

FQDN informado: `traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com`.
Versão apresentada 26.7.0; VERSION() SQL/UUID/schema/contas/grants/parâmetros permanecem desconhecidos.
O operador informa ausência de aplicação/dados de negócio e migrations ainda não aplicadas.
Isso não prova inexistência de schema. Não foi criado schema para permitir diagnóstico.
Bootstrap futuro depende de decisão humana e autorização própria, fora desta entrega.

## 8. Certificado personalizado

Ativo informado: `traceflow-mysql-tls-test-2026`, User defined / Imported X.509, emissor TraceFlow
Internal Root CA, RSA 4096 / SHA-256, CA:FALSE, Digital Signature / Key Encipherment, EKU TLS Web Server Auth.
SAN DNS=FQDN canônico e IP=10.20.2.25. Leaf notBefore/notAfter não foram fornecidos.
PKCS#8 não cifrado foi fornecido pelo operador à OCI; o Codex não acessou a chave nem o bundle.
A aplicação consome apenas a CA pública, não identidade PKCS12 de cliente ou chave de servidor.

## 9. Histórico do incidente BYOC

Primeiro recurso `traceflow-mysql-tls-2026`, PKCS#8 cifrado (AES-256-CBC / PBKDF2 / HMAC-SHA256): relato de
UPDATE_DBSYSTEM com HTTP 500 / InternalError, begin 204 / GetCertificateBundleWithPrivateKey 200 / end 500.
Segundo recurso, mesmo certificado e PKCS#8 não cifrado: aplicação bem-sucedida relatada.
Registrar correlação observada, sem afirmar causalidade interna da Oracle. Não reproduzido;
não houve recriação de recurso, mudança IAM, leitura de chave ou tentativa de reparo remoto.

## 10. Validação TLS OpenSSL

O comando integral e resultado fornecidos estão em E04–E06 e no
[runbook atualizado](../runbooks/OCI_HEATWAVE_HOMOLOGATION.md#evidência-openssl-fornecida-pelo-operador).
Usou STARTTLS MySQL, FQDN/SNI, CAfile, verify_hostname e verify_return_error.
Resultado manual: TLSv1.3/TLS_AES_128_GCM_SHA256, Verification OK, peername correto,
RSA-PSS/SHA256 e X25519 (253 bits), conectando a 10.20.2.25. **PASS manual**.
Não prova auth SQL, grants, pool, schema, migrations, API/worker ou sessão Prisma.
Data atribuída ao relato de 15/10; timestamp exato da execução manual não fornecido.

## 11. CA pública

Fonte informada `/home/opc/traceflow-ca.crt`; subject C=BR / O=TraceFlow / CN=TraceFlow Internal Root CA;
validade da **CA** 15/10/2026–14/10/2031; SHA-256 DER:
`2E:AE:E0:E2:06:74:1B:F8:1B:65:1F:1A:E3:3F:44:F0:A9:29:49:ED:6A:99:13:7A:4A:A8:B0:01:34:86:D2:95`.
Destino preservado `/etc/pki/traceflow/mysql-ca.pem`, fora de releases/HOME/webroot.
Preparador novo tem plano default, fingerprint, certificado raiz único, validade/assinatura,
anti-symlink, owner/modes e publicação exclusiva. Não substitui CA existente diferente.
Reversão futura exige recibo/inode/digest iguais e consumidores parados; não apaga dados nem
configurações preexistentes. Não instala confiança global. **Nenhuma CA real foi lida/instalada.**

## 12. Integração Prisma

Client/CLI 6.12.0 mantidos. Sem segundo Client global ou alteração de `prismaClient.js`.
A URL chega ao Client canônico após validações; produção não carrega dotenv nesse módulo.
Client gerado usado nos testes veio de npm ci / generate em árvore pública sem .env; nenhuma
node_modules de DEV foi reutilizada. A comparação de baseline usa somente essa árvore isolada.

O código exato 6.12 habilita TLS com sslcert/sslaccept; strict impede certificados inválidos,
sslcert fornece raiz de confiança, checagem de hostname continua ativa. Referências primárias:
[parser](https://github.com/prisma/prisma-engines/blob/6.12.0/quaint/src/connector/mysql/url.rs),
[engine nativo](https://github.com/prisma/prisma-engines/blob/6.12.0/quaint/src/connector/mysql/native/mod.rs),
[driver fixado](https://github.com/prisma/mysql_async/blob/c4c841c9d03e361df7377264a075335a823534ee/src/conn/mod.rs).
A documentação v6 é complementar; testes reais resolvem as lacunas de descrição.
Não foi presumido suporte oficial irrestrito a HeatWave 26.7.

## 13. Contratos de ambiente

API preserva production, HTTP_HOST=127.0.0.1, PORT=3001, TRUST_PROXY=loopback e storage privado.
API/worker recebem DATABASE_URL próprias. Diagnóstico usa somente
HEATWAVE_DIAGNOSTIC_DATABASE_URL; local exige TEST_DATABASE_URL. Cruzamento de credenciais entre
modos, DATABASE_URL herdada, variáveis de job/teste nas units e bypass TLS são recusados.
TEST_EVIDENCE_* e TEST_UPLOAD_* são configurações de negócio, não foram proibidas pelo prefixo.
Não há URL com credencial real nos exemplos, logs ou relatório. Segredos e nomes reais de contas
não foram acessados. O FQDN definitivo está no contrato do diagnóstico e nos runbooks.

## 14. Pool e timeouts

| Processo | Pool | connect/pool/socket em segundos |
| --- | ---: | --- |
| API |1–5|5/10/30|
| Worker |1–3|5/10/30|
| Diagnóstico |1|5/5/10|
| Job exclusivo |até2 proposto|limites explícitos revisados para a operação|

Orçamento proposto 11 + reserva 5, condicionado a max_connections real e demais consumidores.
Sem elevação de limite do HeatWave. Lab confirmou P2024 de pool, P2037 de servidor, timeout,
liberação/reconexão. Concorrência/capacidade gerenciada e reserva operacional não medidas.
Readiness default 3 s, deduplicado; não confundir com cancelamento individual de query Prisma.

## 15. Systemd

Units existentes e release-guard preservados byte a byte. User/Group=traceflow, NoNewPrivileges,
ProtectSystem=strict, ProtectHome, UMask=0077, paths inacessíveis e escrita somente da API no storage.
No laboratório, derivadas das duas units trocaram somente entrypoint/ambiente/lifecycle para
um probe Python e adicionaram restrição de rede. Os sandboxes reais permitiram ler a CA e negaram
escrita na CA/código e acesso ao HOME; usuário não root / NoNewPrivileges comprovados.
Isso prova filesystem/sandbox, **não partida funcional API+worker no HeatWave**.

## 16. Permissões de filesystem

CA root:root 0644 em diretório 0755, contexto padrão cert_t conferido com restorecon/matchpathcon.
SELinux Enforcing durante todo o ensaio. Nenhuma política foi enfraquecida. Arquivos privados
continuam 0600 / parent 0700; CA pública pode ser lida sem ser gravável pelo serviço.
Nenhum alias Nginx foi criado. Primeiro ensaio falhou em CHDIR porque umask 077 tornou diretório
público sintético 0700; o harness passou a aplicar explicitamente 0755/0644 em suas próprias fontes.
Repetição aprovada, sem mudar hardening das units ou permissões de arquivos reais.

## 17. Diagnóstico gerenciado

`oci-read-only` exige aprovação específica com validade <24h, operação read-only, target exato, FQDN definitivo,
IP/porta e caminho/fingerprint da CA. Novo guard recusa env cruzado, CA inválida e ancestrais graváveis;
confere CURRENT_USER() além de schema/UUID/porta/versão. DNS misto/falho é recusado, sem alternativa.
Prisma real verifica sessão TLS / grants / parâmetros / SELECT 1 e desconecta antes de emitir PASS.
30 s total / 5 s handshake; errors por código sanitizado. `--validate-only` não conecta.

[Procedimento e cartão de 14 campos](../runbooks/OCI_HEATWAVE_HOMOLOGATION.md#cartão-de-autorização-obrigatório-para-cada-lote-remoto)
preparados, com SQL/read-only, identidades, arquivos, limites, abort/cleanup/evidências.
Faltam nomes/caminhos de SSH/launcher/credencial/schema e bundle revisado para resolver comandos;
eles deverão ser reapresentados integralmente antes da autorização. **Nenhum lote remoto aprovado.**

## 18. Identidade do servidor

Bootstrap preparado via mysql com VERIFY_IDENTITY e conta já existente limitada; consultar
DATABASE(), CURRENT_USER(), UUID, porta, VERSION(), version_comment, TLS e próprios grants.
Se não houver schema, manter pendência; não inventar target nem usar schema administrativo.
Diagnóstico adicional coleta engine, sql_mode, isolation, timezones, charsets, collation,
lower_case_table_names, max_connections, wait_timeout, connect_timeout, require_secure_transport.
Todos esses valores gerenciados permanecem PENDING. FQDN/IP são informação do operador.

## 19. Contas e privilégios

| Conta futura | Escopo mínimo proposto |
| --- | --- |
| Diagnóstico |SELECT do schema aprovado + variáveis/próprios grants, sem consulta de registros de negócio pelo script|
| API / worker separados |SELECT/INSERT/UPDATE/DELETE no próprio schema; sem DDL|
| Backup |SELECT / SHOW VIEW no schema autorizado|
| Migration/restore |DDL/DML estritamente no destino autorizado, somente job|

Sem root/admin/global/FILE/SUPER/GRANT OPTION, roles não resolvidas ou wildcard copiado do laboratório.
Modelos CREATE USER / GRANT estão preparados no runbook para revisão separada; não executados.
Senha aleatória futura deve ir diretamente ao mecanismo protegido; não deve ser publicada no log
retornado pelo comando. Partial_revokes/limitações HeatWave exigem grants por nome exato.
Autenticação bem-sucedida do diagnóstico não certifica os direitos de outras contas.

## 20. Migrations

68 arquivos SQL e schema preservados; última migration 20261014090000_resumable_evidence_uploads.
Aplicação/status apenas em instâncias Community novas; nenhum SQL no DEV/HeatWave.
O job OCI05 mantém target, separação de usuário, strictCA, lock local+GET_LOCK, drift/fingerprint,
histórico/checksum, backup/writers/gates, quarentena em falha parcial e ativação explícita.
Não há migrations em startup. Asserções/lógica de release foram inspecionadas e testes operacionais
passaram; não foi repetido todo o laboratório histórico de migration/rollback.

Lacunas operacionais a fechar: job resolvido deve usar FQDN/CA definitiva e limites explícitos;
bridge atual não impõe sozinho fingerprint/path canônico nem todos os budgets propostos.
O modo descartável histórico do bridge não comprova TLS gerenciado. Preparar revisão do job antes
primeiro deploy; sem bypass, migration automática, reset, db push ou edição de migrations antigas.

## 21. Testes positivos

| Casos | Evidência atual / limite |
| --- | --- |
|T01–T04 TLS/hostname/Prisma/sessão|CA / SAN / IP e DNS localhost válidos; Prisma real, cipher e protocolo; Community somente|
|T05–T06 credencial/grants|conta diagnóstica sintética SELECT, metadata administrativa negada; grants normalizados|
|T07–T08 pool/timeout|limites e falha bounded reais; parâmetros menores somente no probe|
|T09–T10 API/worker|preflight e testes completos de produção / lifecycle; não runtime gerenciado|
|T11–T12 CA/systemd|preparador com 10 testes; dois sandboxes Linux sem root, CA somente leitura, Enforcing|
|T13–T15 diagnóstico/disconnect/reexecução|duas execuções reais readonly; identidade/SELECT 1/TLS; recuperação e disconnect|
|T16 relatórios|códigos/metadata allowlist, scan; nenhum segredo real acessado|

## 22. Testes negativos

| Casos | Prova atual |
| --- | --- |
|N01 CA desconhecida|Prisma P1011; CA sintética alternativa|
|N02 expirado|Prisma P1011/Node CERT_HAS_EXPIRED; validade da CA também testada|
|N03 SAN inválido|Prisma P1011/Node ERR_TLS_CERT_ALTNAME_INVALID|
|N04 sem TLS|config recusada; servidor próprio ativo sem capacidade TLS: Node TLS_REQUIRED e erro específico Prisma; sem plaintext|
|N05–N07 certificado/CA inválida, ausente/inacessível|parser X509/raiz/fingerprint, ENOENT/EACCES/modes; sem leitura de chave real|
|N08–N11 URL/duplicatas/env/expiração|guards antes de DNS/Prisma|
|N12–N14 target/DEV/OCI sem aprovação|recusa local; nenhum alvo protegido conectado como controle|
|N15 credencial inválida|Prisma P1000, dados sintéticos|
|N16 excesso de privilégios|parser recusa DDL/global/outro schema/roles; nenhuma concessão real|
|N17–N18 saturação/indisponibilidade|P2024/P2037/porta fechada e timeouts; recursos liberados|
|N19 DNS|resolver injetado falho/vazio/misto recusado; sem DNS real OCI|
|N20–N21 logs/arquivos privados|sanitização, permissões, symlinks e scanner explícito|
|N22 schema não autorizado|operação migrate recusada no diagnóstico; gates/credenciais/target do job testados; nenhuma tentativa em DB protegido|
|N23 startup migration|inspeção units/entrypoints + contratos/testes; nenhum novo DDL no startup|
|N24 segurançaTLS|permissivo / duplicado / CA relativa / bypass de ambiente recusados|

Falhas iniciais de harness preservadas em E15: fixtures sem CA:TRUE no LibreSSL, asserções que
buscavam mensagem em Error cujo código é separado, umask 077 aplicada indevidamente aos testes
históricos de releases e CHDIR no Linux. O runner adicional de comparação usou inicialmente
pool 1: 49 falhas concorrentes, sem cobertura; corrigido somente para o pool 10 já usado pela
suíte principal, passou com 2048 aprovados e 5 skips. Corrigidos fixtures/assertions/ambiente,
sem retirar testes, aumentar timeouts ou adicionar retries.
O cenário sem TLS inicialmente usou opção removida `--ssl=OFF` e confundiu servidor que morreu
com falha TLS; não contou como PASS. Corrigido para `--tls-version=` somente no servidor próprio,
exigindo greeting TLS_REQUIRED/processo vivo e texto específico do driver. No Prisma 6.12 esse erro
não carrega P1011; a saída sanitizada é SERVER_HAS_NO_TLS_CAPABILITY/PRISMA_REJECTED.

## 23. Testes de integração

Laboratório Community 26.7 no macOS ARM64: diagnóstico, Prisma TLS, DNS localhost, autenticação,
privilégios, pools/servidor, timeout, CA/SAN/expiry, recuperação, ausência de TLS e porta fechada.
Lab separado para backend completo; UUID/datadir/porta/schema próprios antes de DDL/fixtures.
Systemd/CA em Oracle Linux ARM64 separados do teste SQL. Não foram combinados esses resultados
para alegar ponta a ponta HeatWave. DR, Cloudflare, SMTP e GitHub reais não foram exercitados.

## 24. Testes backend

**2065 aprovados, 0 falhas, 5 skips históricos**, total 2070. Os skips são E6/E11 pré-LR2 já existentes.
58 testes focados de conexão/TLS aprovados. Lint, formato, Prisma validate / generate, arquitetura e
migrations/status do laboratório aprovados. Nenhum threshold/timeout funcional/retry alterado.
Coverage (S/B/F/L): **92,57/87,43/95,47/94,85%**; comparação de baseline em E15.

## 25. Testes frontend

**1520 aprovados, 0 falhas, 0 skips**. Lint, formato, build / API relativa aprovados, Node 22.
Coverage (S/B/F/L): **86,10/80,98/81,89/88,57%**; comparação de baseline em E15.
Nenhuma fonte, teste, lockfile ou configuração frontend modificada. Aviso de chunk ELK grande já
existente. Não houve screenshot, teste visual ou navegação na produção.

## 26. Gates de qualidade

| Gate | Resultado / escopo |
| --- | --- |
| Backend/frontend completos+coverage |PASS com 5 skips históricos backend|
| Lint/formato/build frontend |PASS|
| Prisma validate / generate 6.12 |PASS em workspace próprio sem .env|
| Arquitetura |PASS, fronteiras preservadas|
| Operacionais Python |85 PASS, inclui 10 novos de CA e 1 novo de ambiente|
| Política CI/audit/inventário UI |90 PASS e validações locais PASS|
| Dependências |0 HIGH / 0 CRITICAL nos dois componentes; 0 exceções|
| TLS real / CA / systemd |PASS LOCAL; 9 fases de conexão e 3 controles Linux agregados|
| Secret scan/diff/preservação |Padrão e conteúdo novo PASS; template histórico classificado abaixo; diff/preservação PASS|
| CI remoto/OCI |NÃO EXECUTADOS|

O scan explícito de todos os arquivos alterados também sinalizou uma URL f-string de laboratório
já presente na linha 158 do runbook OCI_MYSQL_COMPATIBILITY.md. A senha nessa linha é uma
interpolação de variável, não uma credencial literal. O trecho é idêntico ao HEAD; a revisão
classificou esse achado como template histórico. O scanner permaneceu inalterado. O conteúdo
adicionado e os arquivos novos passaram no scan, além do escopo padrão do repositório. E14
registra o achado e a classificação sem reproduzir a URL.

Sem redução de thresholds (B 85/70/85/87; F 50/45/40/53). Pequenas diferenças percentuais contra o
relatório histórico são explicitadas; nenhuma alteração de src backend/frontend ou remoção de
teste foi usada para melhorar métricas. A comparação adicional com o HEAD limpo passou: backend 2048 aprovados + 5 skips históricos, frontend 1520 aprovados.
No backend, um único branch do ternário `latestRetest` em `defect.presenter.js` teve cobertura
diferente (14/16 na baseline, 13/16 nesta execução); a causa exata da variação não foi estabelecida.
No frontend, todas as contagens cobertas por arquivo são iguais; o relatório V8 de `elk-layout.js`
apresentou uma unidade extra no denominador de linhas/statements/funções. Fontes, testes e
configurações desses módulos são idênticos por SHA-256. Os percentuais publicados permanecem
os medidos: não se afirma igualdade ou ausência de queda de cada métrica. Não foi alterado código
funcional fora do escopo para ajustar cobertura. E15 conserva os numeradores, denominadores e
a comparação; a ressalva deve ser considerada na revisão.

## 27. Segurança

DEV/OCI não conectados. Sem segredo real/.env/chave privada/chave SSH/token/SMTP lido; certificados,
credenciais e dados dos labs são sintéticos. URLs não são argv/evidência; logs publicados só têm
códigos e metadata. Fingerprint da CA é público. NOVAS variáveis de teste não entram nas units.
ASVS 5.0 é referência da baseline existente, sem certificação integral. DNS VCN, root operacional,
canal de segredos e revisão de autorizações continuam fronteiras de confiança. A CA instalada
não é pinning exclusivo do leaf de cada conexão Prisma. Não prometemos revogação online automática.
Nenhum recurso pago ou terceiro acessado com credencial; fontes públicas oficiais apenas.

## 28. Evidências

[E01–E16](evidence/oci-deploy-06-1/INDEX.md): origem, ambiente, UTC / comando, resultado, limite/status.
E04–E06 são **operador**; E10–E12 gerenciados **PENDING**; E07–E09/E15 são execução local.
Não contém certificados privados, dumps, env real ou screenshots. Inventário SHA-256 acompanha a
entrega; logs brutos sintéticos ficaram na área temporária privada e são descartados ao encerrar.
Os comandos completos de reprodução e os modelos remotos estão no runbook, sem autorização implícita.

## 29. Resultados locais

Implementação/contratos/testes locais aprovados no alcance indicado. A VM própria e todos os
mysqld/datadirs/credenciais efêmeros são encerrados/removidos; E15 registra cleanup final.
Cópias de fonte pública/toolchain não são releases promovidas. Alterações permanecem no working
tree para revisão; sem commit, push, PR ou modificação de workflow.

| Arquivo atual envolvido / alterado | Novo arquivo | Justificativa / impacto | Risco / aceite e teste |
| --- | --- | --- | --- |
| heatwave-connection.js | — |ambiente cruzado, ancestrais, pin/validade da CA, FQDN, conta efetiva, DNS|contratos antigos exigem atualização explícita;58 focados + Prisma real|
| validate-oci-heatwave-connection.js | — |CA validada, CURRENT_USER, PASS após disconnect|não aceitar identidade apenas pela URL; diagnóstico repetido e falhas|
| validate-service-environment.mjs | — |impedir variáveis de banco de teste/job/diagnóstico e bypass TLS|serviços antigos com ambiente ambíguo passam a falhar; testes operacionais |
| prepare-runtime-directories/release_contract preservados |prepare-mysql-ca.py|CA pública fora de HOME/releases, exclusiva/idempotente|instalação futura com aprovação, sem rotação automática;10 testes+Linux|
| heatwave-connection/heatwave-tls.test.js, test_operations.py |test_mysql_ca.py|cobrir novos guardas/permissões|não relaxar asserts; suíte completa + focados + 85 Python|
| persistence_lab.py, run-connection-lab.py, connection-probes.mjs |run-mysql-ca-linux.py|CA explícita nas fixtures, DNS no Prisma, sem TLS, sandbox Linux|exclusivo laboratório novo; hostname/marcador/ownership e cleanup|
| 5 runbooks atualizados|este relatório+E01–E16|rastreabilidade/contratos/preparação remota|distinguir relato / histórico / local / PENDING; revisão+scan|

Units, Nginx, release bridge, backup/monitor funcional, prismaClient, src, testes funcionais existentes,
frontend, 68 migrations, schema, locks, CI e TCC foram preservados.

## 30. Resultados gerenciados

PASS manual somente do TLS do servidor. Prisma / auth / TLS da sessão/grants/parâmetros/pool/UUID/schema e
permissões/CA/systemd reais: PENDING. A leitura do relato não foi registrada como execução remota.
Não houve sequer conexão diagnóstica SSH/MySQL. Manutenção informada historicamente não foi
reconsultada. Zero migração, bootstrap, backup/restore ou modificação de certificado real.

## 31. Limitações

Comandos finais ainda dependem de alias/paths/identidades/schema/bundle e aprovação específica.
Não há staging HeatWave separado autorizado, volume/carga real, plugin/grants confirmados,
monitor/coletor/canal operacional, backup externo ou teste de recuperação da VM real.
Compatibilidade Community não implica equivalência HeatWave. Prova systemd usou probes Python,
não processo funcional Prisma/worker contra banco gerenciado. Runtime/preflight e bridge ainda
dependem do contrato de configuração resolvido para o FQDN/job correto. Nenhum gate pendente virou PASS.

## 32. Disaster Recovery

Backup/restore com age e R01–R12 permanecem evidência local OCI06; não reimplementados ou repetidos.
CLI continua local-only. Pendentes adaptador operacional / writers / lock, streaming / capacidade, bundle,
destino externo / custos, retenção, custódia/recuperação de chaves, sensores/alertas e restore representativo.
RPO ≤ 24 h / RTO ≤ 4 h são propostas não aprovadas; tempos de fixtures não são RTO de produção.
Backup automático Always Free não cobre evidências da VM nem substitui análise do conjunto recuperável.

## 33. Pendências operacionais

1. Resolver nomes/paths não secretos, schema existente ou dependência de bootstrap e bundle público revisado.
2. Autorizar separadamente preflight/instalação de CA e leitura de identidade / diagnóstico Prisma; não buscar segredos.
3. Confirmar auth/grants/UUID/VERSION/parâmetros/maxconnections e orçamento agregado; sem modificar limites.
4. Preparar contas/job / orçamento resolvidos e aprovação do primeiro bootstrap / migration em etapa própria.
5. Fechar DR/destino/chaves/retenção/RPO/RTO/alertas e restore representativo.
6. Fechar SMTP/GitHub App / segredos, ingress Cloudflare / upload real e smoke operacional antes do deploy.

## 34. Impacto no roadmap

OCI06.1 acrescenta preparação local e incorpora uma parcela da evidência gerenciada.
OCI06 permanece PARTIAL; seus requisitos DR não foram renumerados, removidos ou declarados concluídos.
Cloudflare 100 MB e envelope funcional preservados. OCI07 continua não iniciado. Terraform/CI/CD
permanecem entregas próprias, sem adoção automática de recursos existentes.

## 35. Condições para OCI-DEPLOY-07

Revisão dos arquivos; fechamento Prisma HeatWave/TLS/identidade/contas/pool; CA/contextos reais
verificados; release ARM64/bundle operacional aprovados; job de migrations/backup/restore/rollback
homologados; writers/monitor/alertas/segredos preparados; SMTP/App/ingress funcional; janela,
responsáveis e autorização humana específica. Nenhum PASS LOCAL substitui esses gates.

## 36. Final verdict

```text
OCI-DEPLOY-06.1 — MANAGED HEATWAVE HOMOLOGATION — PARTIAL
LOCAL IMPLEMENTATION AND VALIDATION: PASS LOCAL (escopo documentado)
TLS SERVER VALIDATION: PASS (evidência fornecida pelo operador)
PRISMA MANAGED VALIDATION: PENDING
HEATWAVE MANAGED VALIDATION: PARTIAL
DR PRODUCTION: PENDING
OCI-DEPLOY-06: PARTIAL
OCI-DEPLOY-07: NOT STARTED
PRODUCTION DEPLOY AUTHORIZATION: NOT GRANTED
```

Próxima atividade recomendada: revisar a entrega, completar nomes/caminhos/bundle e apresentar
os lotes remotos resolvidos para autorização específica. Encerrar e aguardar revisão.
