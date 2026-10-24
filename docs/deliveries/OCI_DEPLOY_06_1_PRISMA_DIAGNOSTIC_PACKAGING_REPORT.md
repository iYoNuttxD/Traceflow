# OCI-DEPLOY-06.1 — PRISMA DIAGNOSTIC PACKAGING

**FINAL VERDICT: PASS LOCAL.** Data: 15/10/2026.
PRISMA MANAGED permanece PENDING. Nenhuma conexão/instalação/desbloqueio/deploy OCI ocorreu.

## 1. Resumo executivo

Foi implementado e validado um pacote mínimo de diagnóstico Prisma 6.12.0 para Oracle Linux
9.8 ARM64/Node 22.23.2, reutilizando o diagnóstico e o cliente compartilhado do TraceFlow.
Dois builds finais independentes produziram bytes idênticos. O artefato de 7.498.083 bytes
contém 24 arquivos de execução e um manifesto; não contém aplicação, CLI de migrations,
credenciais, .env ou certificados.

39 verificações do pacote extraído passaram em MySQL Community 26.7.0 sintético, com schema
vazio. Passaram também 60 testes específicos de TLS/contratos, 3 de sanitização do launcher,
8 de artefato, 93 testes operacionais e os gates completos de qualidade. Backend:
2.067 testes aprovados, cinco skips históricos preservados; frontend: suíte completa e
coverage aprovados. Zero HIGH/CRITICAL nos dois npm audits.

## 2. Missão e limites

Continuação da OCI-DEPLOY-06.1, sem nova entrega do roadmap. Implementação local autorizada.
A autorização adicional do usuário permitiu as 68 migrations **somente no laboratório
descartável da suíte completa**. O diagnóstico do pacote manteve outra instância/schema
vazios. Não houve migration no DEV/HeatWave, importação, seed real, deploy ou administração OCI.

Não foram usados subagentes, Git remoto, credenciais reais, chaves pessoais ou screenshots.
Não houve commit, push, merge, mudança de branch ou alteração acadêmica/TCC.

## 3. Baseline e preservação

| Campo | Resultado |
| --- | --- |
| Branch inicial/final | daniel-dev |
| HEAD inicial/final | 09d98d7fb6a7ffcf4b6e1546ab866afc7090915f |
| Working tree inicial | limpo; zero alterações rastreadas/não rastreadas |
| Arquivos rastreados iniciais | 1.491 |
| Rastreado modificado no escopo | 7 |
| Rastreado preservado byte a byte | 1.484 |
| Host padrão | macOS ARM64, Node 26.11.1/npm 11.20.0; não utilizado para gates Node 22 |
| Ferramentas host selecionadas | Node 22.23.3 para export/format/verificações de fonte |
| Toolchain de build/testes | OL9.8 ARM64, Node 22.23.2/npm 10.9.8 |

Preservados: schema.prisma, todas as 68 migrations, os dois lockfiles, Prisma 6.12.0,
cliente compartilhado, código de negócio/arquitetura, CI, job release-database.mjs,
relatórios históricos e documentação acadêmica. Evidência: [E01](evidence/oci-deploy-06-1-prisma-diagnostic/E01_BASELINE.json).

Novos arquivos de implementação:

- `scripts/package-diagnostic.mjs` e `scripts/package_diagnostic.py`.
- `deploy/lib/diagnostic_contract.py`.
- `deploy/scripts/diagnostic-launcher.mjs` e `diagnostic-runtime.mjs`.
- `deploy/tests/test_diagnostic_package.py`, `diagnostic-launcher.test.mjs`,
  `run-diagnostic-package-lab.py` e `run-diagnostic-quality.py`.

Novos documentos: este relatório, o runbook específico e 17 evidências E01–E17.
Modificados: diagnóstico canônico, helper heatwave-connection, teste unitário correspondente
e quatro runbooks (HOMOLOGATION, INITIAL_BOOTSTRAP, ENVIRONMENT, MIGRATIONS).
O working tree final contém somente essas alterações autorizadas. O binário está em build/,
já ignorado pelo Git; .gitignore não mudou.

## 4. Histórico OCI-DEPLOY preservado

| Entrega | Estado mantido |
| --- | --- |
| 01 | COMPLETE |
| 02 | validação local aprovada; histórico PARTIAL/BLOCKED |
| 03 | PASS LOCAL |
| 04 | implementação local concluída |
| 04.1 | PASS LOCAL |
| 05 | PASS LOCAL |
| 06 | PARTIAL |
| 06.1 | EM ANDAMENTO; este pacote PASS LOCAL |
| 07 | NÃO INICIADO |

Os relatórios anteriores foram consultados e preservados. Os adendos aos runbooks apontam
o estado informado mais recente; não convertem evidências históricas em execução atual.

## 5. Estado real do HeatWave

**Origem: operador, sem acesso/reconfirmação do Codex.** Always Free, região sa-saopaulo-1;
DB traceflow-mysql/MySQL.Free, VERSION() 26.7.0-cloud, UUID
6e94bb7f-c601-11f1-9b91-02001704771f. FQDN
traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com, 10.20.2.25:3306.
VM traceflow-app/traceflowapp, origem privada 10.20.1.184, OL9.8 ARM64, Node22.23.2.

Schema traceflow já criado, utf8mb4/utf8mb4_unicode_ci; zero tabelas, views, rotinas,
triggers ou eventos. Nenhuma migration/aplicação/dado de negócio em produção.
Global: InnoDB, utf8mb4/utf8mb4_0900_ai_ci, lower_case_table_names=0, max_connections=200,
time_zone=UTC, require_secure_transport=0, partial_revokes=1, mandatory_roles=public.
Não alterados nesta execução.

## 6. Bootstrap B00–B30

B00, B10, B20, B21, B22, B23 e B30: **PASS informado pelo operador**.
Não repetir CREATE DATABASE/CREATE USER/GRANT nem recuperar/regenerar senhas.

| Conta @10.20.1.184 | Privilégios informados em traceflow.* | Estado |
| --- | --- | --- |
| traceflow_diag | SELECT | LOCK |
| traceflow_api | SELECT, INSERT, UPDATE, DELETE | LOCK |
| traceflow_worker | SELECT, INSERT, UPDATE, DELETE | LOCK |
| traceflow_migrator | DML + CREATE, ALTER, DROP, INDEX, REFERENCES | LOCK |
| backup | não criada | adiada |

Todas as quatro contas: caching_sha2_password, REQUIRE SSL, PASSWORD EXPIRE NEVER,
account_locked=Y e password_expired=N. [E14](evidence/oci-deploy-06-1-prisma-diagnostic/E14_OPERATOR_BOOTSTRAP.json).
B40/B41 não executados.

## 7. TLS gerenciado

O operador comprovou TLS1.3/TLS_AES_128_GCM_SHA256 e verificação de hostname com certificado
personalizado. Isso não comprova Prisma autenticado. Estado: TLS SERVER PASS (operador).
O pacote exige CA confiável, SAN/datas, hostname e TLS da própria sessão Prisma.
require_secure_transport=0 não cancela REQUIRE SSL das contas nem a validação do cliente.

## 8. CA pública

Caminho definitivo /etc/pki/traceflow/mysql-ca.pem, root:root 0644, SELinux cert_t,
legível por traceflow, conforme operador. DER SHA-256:
`2eaee0e206741bf81b651f1ae33f44f0a92949ed6a99137a4aa8b0013486d295`.

Não foi lida, copiada, instalada ou alterada. Não integra o tar.
CAs/chaves utilizadas no laboratório foram sintéticas e removidas.

## 9. Diagnóstico existente e alteração limitada

Entry point preservado: `backend/scripts/validate-oci-heatwave-connection.js`.
Cliente preservado: `backend/src/database/prismaClient.js`.

Identificou-se que SHOW GRANTS FOR CURRENT_USER omite roles obrigatórias. Acrescentados
@@mandatory_roles/CURRENT_ROLE e uma expansão fixa de public@%, quando comprovadamente
obrigatória. Validam-se grants diretos e expandidos, com a allowlist histórica inalterada.
Roles desconhecidas/aninhadas ou privilégios globais, de outro schema, DML de diagnóstico
e GRANT/ADMIN OPTION continuam recusados. Não há interpolação de nome de role recebido
na consulta SQL.

Fonte primária: [MySQL 26.7 SHOW GRANTS](https://dev.mysql.com/doc/refman/26.7/en/show-grants.html).
No laboratório, public sem direitos extras passou; INSERT herdado foi recusado; revogação
sintética restaurou PASS. A composição de public real permanece desconhecida até D03.

## 10. Dependências

Prisma Client gerado, @prisma/client6.12.0, runtime/library.js, engine ARM64, dotenv16.6.1,
seis módulos JS internos e schemas públicos. dotenv é importado pelo cliente compartilhado,
mas seu config() só roda em modo test; o diagnóstico usa production. A geração limpa
deixou rootEnvPath nulo e schemaEnvPath ausente, sem descoberta de .env.

A allowlist de 24 arquivos foi exercitada de forma isolada, sem fallback para checkout ou
node_modules macOS. [E02](evidence/oci-deploy-06-1-prisma-diagnostic/E02_DEPENDENCIES.json).

## 11. Estrutura do pacote

Tar contém backend/scripts do diagnóstico/segurança, backend/src/database, schemas públicos,
backend/package.json mínimo, somente os arquivos transitivos necessários de node_modules,
dois launchers/preflight, diagnostic-tool.py e manifest.json.

Fora do tar: artifact.json, cópia do manifesto e verificador externo para iniciar a cadeia
de confiança. Credencial/autorização/CA são entradas operacionais externas.
Sem frontend, API, worker, scheduler, Prisma CLI, migrations, seed, Nginx ou units.

## 12. Processo de build

Export explícito de 14 fontes do working tree com hashes, HEAD/branch e identificação de
alterações locais. Build somente OL9.8 ARM64, npm ci a partir do lockfile, cache/HOME/npmrc
novos, Prisma validate/generate em pasta sem .env e sem conexão SQL.
O gerador recebe só uma URL de guarda sem senha em loopback porta1; não a usa para conectar.

Workspace determinístico exclusivo, outputs novos, tar/gzip normalizados. Os dois builds
finais usaram instalações/cache/workspace novos e produziram bytes idênticos.
[E03](evidence/oci-deploy-06-1-prisma-diagnostic/E03_BUILD.json).

## 13. Compatibilidade ARM64

OL9.8 aarch64, Node22.23.2, OpenSSL3.5.8, SELinux Enforcing reais no laboratório.
ELF64 little endian/AArch64 validado. Nenhum engine x86/macOS incluído.
Preflight verifica SO, arquitetura, major Node22, OpenSSL3, OL9.8 e carregamento nativo.
Mudança de distribuição/toolchain exige nova validação; não inferir compatibilidade universal.

## 14. Prisma Client

Client e CLI6.12.0 preservados. CLI existe apenas no build/QA, nunca no pacote.
Prisma validate/generate passaram. O cliente canônico instanciou e consultou a instância
sintética vazia, verificando identidade e TLS. [E06](evidence/oci-deploy-06-1-prisma-diagnostic/E06_PRISMA_CLIENT.json).

## 15. Prisma Engine

Target linux-arm64-openssl-3.0.x. Foi carregado via require, sua exportação QueryEngine foi
verificada e a biblioteca apareceu em process.report.sharedObjects. O teste real Prisma
confirmou funcionalidade, além da inspeção ELF.
Mutação x86 e ausência de dependência foram recusadas antes da leitura da senha.
[E07](evidence/oci-deploy-06-1-prisma-diagnostic/E07_PRISMA_ENGINE.json).

## 16. Integridade e artefato

| Campo | Valor |
| --- | --- |
| Package ID | traceflow-prisma-diagnostic-efa7abc8191bbf10 |
| Diretório local | build/oci-deploy-06-1-prisma-diagnostic/traceflow-prisma-diagnostic-efa7abc8191bbf10 |
| Tar | traceflow-prisma-diagnostic-efa7abc8191bbf10.tar.gz |
| Tamanho | 7.498.083 bytes |
| SHA-256 tar | 5344f07d4387f17f57d57e1418e0772a2a10b10ca51079f2b9f41080152a730b |
| SHA-256 manifesto | e155bf4ccf3e323a4fd2b0b9bafb1451713d1127bf501b9ca7df7ca17be00ea1 |
| SHA-256 verificador externo | a6b4a77d725f24c31f1a8368983ff8a28bde0db4c29de61e0a18b7d1cf254378 |
| SHA-256 fontes | efa7abc8191bbf10871b9c013044ed0b7dc3479a9a35da88be60078bc5a76d68 |

Extração manual segura, sem extractall, com destino novo, limites de tamanho e inventário
exato. Recusa traversal, links, duplicatas, arquivos/diretórios inesperados, modos abertos,
corruptos e falta de dependência. Verificador externo deve ser validado por pin independente
antes de qualquer código do pacote. [E05](evidence/oci-deploy-06-1-prisma-diagnostic/E05_CHECKSUMS.json).

## 17. Manifesto e procedência

24 registros SHA/tamanho/modo, plataforma, Node/npm/OpenSSL, Prisma, dependências, HEAD,
branch, 14 hashes de fontes e sete alterações locais incluídas.
sourceState=working-tree-candidate; productionRelease=false. Arquivos de testes/docs não são
inputs do runtime; a identidade desses drivers está em E16.
Não é artefato assinado/promovível nem uma release completa.
[E04](evidence/oci-deploy-06-1-prisma-diagnostic/E04_MANIFEST.json).

## 18. Segurança

Least privilege, TLS estrito, ambiente explícito, arquivos privados, verificação de identidade,
pool limitado, deadline, saída sanitizada e pacote root-owned proposto.
O launcher recusa root; verificador/extrator não conecta banco e pode preparar a instalação
como root em diretório próprio. Não há sudoers, novo usuário ou mudança de privilégios Linux.

| Alteração | Justificativa/impacto | Risco e critério de aceite | Validação |
| --- | --- | --- | --- |
| Diagnóstico/helper + unit test | considerar mandatory public efetiva, mantendo fronteira Prisma | recusar role/direito não resolvido; não aceitar excesso | 60 testes e public sintética com/sem INSERT |
| Receitas de build/contrato Python | runtime mínimo com fontes locais rastreáveis | fonte/engine errado deve bloquear; destino não sobrescrito | 2 builds iguais, 8 testes adversos, 39 checks reais |
| Launcher/preflight | não depender de env/checkout; proteger injeção e saída | UID compartilhado é risco residual; secret/URL não sai | 3 testes de saída, auth/TLS/env/permissões negativos |
| Harnesses novos | reproduzir o laboratório e gates sem URL externa | operar só mysqld criado pelo próprio Lab | UUID/datadir/porta/schema próprios e cleanup |
| Runbooks/evidências | separar operador/local/futuro e impedir repetição do bootstrap | documentação não autoriza execução | hashes, lotes e comandos conferidos com implementação |

## 19. Segredos

Nenhuma credencial real solicitada, lida ou recuperada. Não há senha em argv/log/evidência.
Scan de fontes canônico: 680 arquivos, aprovado. Scan do artefato: allowlist e padrões em
todos os arquivos, incluindo binário. Fixtures negativas de URL, token e chave privada
recusadas. O scanner é baseado em padrões; não representa garantia absoluta contra qualquer
segredo arbitrário. [E08](evidence/oci-deploy-06-1-prisma-diagnostic/E08_PACKAGE_SECURITY.json).

## 20. Autorização

Contrato real preservado: formatVersion1, diagnose-read-only, oci-read-only, approvedtrue
somente após autorização humana, expiresAt <24h, rolediagnostic e target exato.
Nenhuma propriedade nova foi adicionada ao JSON; o template documental tem approvedfalse
e expiresAtnull. Não é autorização utilizável.
JSON privado externo 0600, dono executor, sem symlink/pais inseguros.
[E11](evidence/oci-deploy-06-1-prisma-diagnostic/E11_AUTHORIZATION.json).

## 21. Launcher protegido

Entrada: arquivo externo contendo somente password. Constrói URL com percent-encode,
seis opções únicas e sem extras. Em modo gerenciado restringe conta traceflow_diag/schema
traceflow; exige CA canônica e todas as verificações existentes.
Não aceita DATABASE_URL/TEST_DATABASE_URL/MIGRATION_DATABASE_URL herdadas, overrides de
engine, NODE_OPTIONS/NODE_PATH ou bypass TLS; a execução futura usa env -i antes do Node.

Não inicia serviços/migrations. Pool1; connect/pool/socket5/5/10s; deadline canônico30s,
supervisão do filho35s, limite de saída1MiB. SIGINT/SIGTERM interrompe seu próprio filho.
Root e processos do mesmo UID continuam na fronteira de confiança; identidade Unix/custódia
precisam ser aceitas pelo operador antes de D01/D02.

## 22. Testes positivos

| Escopo | Evidência e resultado |
| --- | --- |
| P01–P03 | tar produzido, 24 arquivos inventariados, checksums verificados |
| P04–P08 | Node22, ARM64, Client6.12, engine carregado, dependências completas |
| P09–P13 | secret scan, extras/links/corrupção/engine incorreto recusados |
| P14–P15 | .env sintético não carregado; sem dependência de rede OCI/DEV |
| P16 | dois builds finais independentes iguais byte a byte |
| P17–P18 | baseline preservada fora do escopo; HEAD/receitas/toolchain/fontes identificados |
| T01–T08 | CA/SAN, Prisma real, TLS da sessão, SELECT, UUID/versão/parâmetros |
| T09–T12 | pool/timeouts, encerramento, sanitização e zero sessão residual |
| T13–T16 | diagnóstico sem migrations/DML/DDL; schema vazio antes/depois; repetição |
| T17–T18 | autorização sintética válida e recusas de autorização inválida |

39 checks do harness: PASS. O handshake Node e a sessão Prisma negociaram TLS1.3
TLS_AES_128_GCM_SHA256. Probe complementar com localhost comprovou SAN DNS no Prisma.
[E09](evidence/oci-deploy-06-1-prisma-diagnostic/E09_POSITIVE_TESTS.json).

## 23. Testes negativos

N01–N28: PASS nas camadas apropriadas. A [matriz E10](evidence/oci-deploy-06-1-prisma-diagnostic/E10_NEGATIVE_TESTS.json)
identifica prova/camada para cada ID. Inclui CA/SAN/datas/TLS, senha, lock, UUID, versão,
schema/usuário, auth expirada/ausente, permissões/links, ambiente herdado, opções duplicadas,
engine/dependência, indisponibilidade, timeout, saída com segredo e operação migration.

DNS inesperado foi exercitado via resolver injetado no teste unitário; **nenhuma consulta DNS
gerenciada real foi feita**. DEV foi recusado antes de rede. approved=false gerenciado foi
recusado antes de CA/DNS/SQL. Falhas TLS com CA/SAN/expiração foram reais no laboratório.
Timeout exato do probe: 5,135s. Role public com INSERT foi recusada sem relaxar allowlist.

## 24. Integração e falhas resolvidas

Prisma real repetível, pool/saturação/timeout, autenticação inválida e desconexão reutilizam
as probes anteriores. O diagnóstico executa em árvore extraída sem symlinks para checkout.

Falhas encontradas e corrigidas, sem esconder resultados:

1. Prisma6.12 omite schemaEnvPath sem .env; a verificação aceita ausência/null e rejeita
   qualquer caminho efetivo. Não foi reescrito código gerado.
2. Fixture revelou regex de chave privada com newline escapado incorretamente; scanner
   corrigido, 8 testes e dois builds finais mais harness completo repetidos.
3. Primeira suíte backend reutilizou pool1 do diagnóstico e falhou em testes concorrentes.
   Apenas o harness passou a pool5; todos os testes/timeouts/thresholds preservados.
   Reexecução completa em outra instância: 2.067 PASS.
4. Teste de timeout encontrou TIME_WAIT ao reutilizar porta; fixture passou a reservar nova
   porta alta própria, sem retry do diagnóstico. Harness completo final passou.
5. Regressão operacional opcional, como usuário sem privilégio, recusou inventário /proc
   em teste preexistente de prune. Com identidade administrativa adequada, somente em
   temporários locais, 93/93 passaram. O pacote diagnóstico continuou não-root.

## 25. Gates de qualidade

| Gate | Resultado |
| --- | --- |
| Backend completo + coverage | 162 arquivos PASS, 2 históricos skipped; 2.067 testes PASS/5 históricos skipped |
| Backend cobertura S/B/F/L | 92,57% / 87,44% / 95,47% / 94,85% |
| Frontend completo + coverage | PASS, exit0; contagem individual não retida no log resumido |
| Frontend cobertura S/B/F/L | 86,08% / 80,97% / 81,89% / 88,54% |
| Backend/frontend lint e format | PASS |
| Prisma validate/generate | PASS, 6.12.0 |
| Architecture check | PASS |
| Build frontend | PASS |
| CI policy/audit policy/UI inventory | 90/90 PASS LOCAL; workflow inalterado |
| Testes TLS/contratos focados | 60/60 PASS |
| Saída do launcher | 3/3 PASS |
| Artefato adverso | 8/8 PASS |
| Operacionais | 93/93 PASS em laboratório |
| npm audit backend/frontend | zero vulnerabilidades, incluindo 0 HIGH/0 CRITICAL |
| Secret scan fontes/artefato | PASS |
| git diff --check | PASS |

Thresholds mantidos: backend S85/B70/F85/L87; frontend S50/B45/F40/L53.
Não se adicionaram skips. Os cinco existentes pertencem a e6-backfill e e11-legacy-responsibility
para bancos pré-LR.2. Avisos não bloqueantes observados no frontend: act/NaN em fixtures,
chunk ELK grande e output.name de IIFE. Não foram alteradas funcionalidades para silenciá-los.
Não houve CI remota. [E16](evidence/oci-deploy-06-1-prisma-diagnostic/E16_QUALITY_GATES.json).

## 26. Laboratório Linux e limpeza

VM nova tf061pkg, VZ/aarch64, 4CPUs/8GiB/24GiB, sem mounts do host, sem chaves SSH pessoais,
sem exposição das portas de serviço. SELinux permaneceu Enforcing.
Imagem OL9.8 e tarballs públicos Node/MySQL tiveram SHA-256 conferidos contra a procedência
registrada; valores em [E12](evidence/oci-deploy-06-1-prisma-diagnostic/E12_LINUX_ARM64.json).

Instâncias MySQL/datadirs/portas altas/schemas/contas/certificados sintéticos próprios.
Diagnóstico em schema vazio; suíte completa em instância diferente, com 68 migrations
autorizadas apenas nesse laboratório. Os harnesses removeram os recursos criados.
Ausência de mysqld confirmada; VM parada e excluída. Chaves Lima/token sintéticos removidos.
Artefato público final e evidências foram preservados localmente. Recursos de laboratórios
anteriores não foram removidos.

## 27. Procedimento remoto futuro

[Runbook completo](../runbooks/OCI_HEATWAVE_PRISMA_DIAGNOSTIC.md), 26 seções, comandos
correspondentes aos scripts produzidos. D01 prevê transferência autorizada para área privada
opc e instalação root-owned em /opt/traceflow-diagnostics/<packageId>, ainda não criada.
O caminho evita assumir propriedade dos diretórios de aplicação já existentes.

Verificar pins do verificador/tar/manifesto, extrair apenas em destino novo e conferir
owner/modos/arquitetura/Node/Python/engine/CA antes de credenciais.
Não modifica current, Nginx, systemd ou ambientes de API/worker.
[E15](evidence/oci-deploy-06-1-prisma-diagnostic/E15_REMOTE_PROCEDURE.json).

## 28. B40/B41

Preparados, não executados. B40 desbloqueia somente traceflow_diag@10.20.1.184 e requer
autorização mutável específica. B41 confere conta, TLS, grants e ausência de desbloqueio das
outras contas, com autorização de leitura. Nenhuma conta real foi desbloqueada aqui.
Não reexecutar B00–B30.

## 29. Diagnóstico gerenciado

D02 preflight local do pacote/configuração protegida, sem unlock.
D03 exige autorização própria para autenticar no HeatWave, JSON temporário válido, conta
restrita e alvo conhecido. --validate-only não comprova autenticação/TLS.
Somente execução real com identidade/grants/TLS/disconnected aprovados permite alterar
PRISMA MANAGED de PENDING. Não gerada autorização real approvedtrue nesta entrega.

## 30. Relock

D04 confirma término e desconexão. Relock de traceflow_diag é operação administrativa
mutável explicitamente incluída na autorização futura, inclusive em falha.
ACCOUNT LOCK não encerra sessões existentes; verificar desconexão, não executar KILL amplo.
Runbook apresenta SQL e comando administrativo protegido de relock sem inventar um lote
B42 aceito pelo helper existente. Não automatizado/executado.

## 31. Limitações

Community26.7.0 ≠ HeatWave26.7.0-cloud. Não houve observação atual remota, TLS Prisma
gerenciado, instalação na VM, API/worker de produção ou smoke end-to-end.
O artefato é candidato de working tree, sem assinatura/promoção release.
Reprodutibilidade comprovada somente para os inputs/toolchain registrados.
Testes de diagnóstico não demonstram backup/restore/DR nem compatibilidade integral de
migrations no serviço gerenciado. Evidências do operador não são execuções do Codex.

## 32. Riscos residuais e decisões humanas

- Confirmar identidade Unix e custódia: UID compartilhado pode permitir leitura do segredo
  em ambiente/memória; root pertence à fronteira de confiança.
- Revisar procedência/pins por canal independente antes de executar código transferido.
- Conferir rights reais de mandatory public; qualquer excesso bloqueia D03.
- Reconfirmar versão/UUID/CA/datas/rota/DNS na janela autorizada; manutenção pode causar drift.
- Decidir janela/autorizações D01/D02/B40/B41/D03/D04/relock e responsável pelo encerramento.
- Manter segredos fora de logs, dumps, gravações e chat; arquivar somente resultado sanitizado.

## 33. Pendências de migrations

Job separado intacto. HeatWave retorna UTC, mas job exige literal +00:00: pendência de
escopo futuro, sem alteração global nem bypass.
Primeiro schema vazio ainda encontra gates backupVerified/backupReference/restoreRehearsed.
Não foi exigido dump de dados de aplicação inexistentes nem fabricada evidência de backup.
Tratamento formal do primeiro deploy precisa ser preparado/testado em escopo autorizado.
As 68 migrations e Prisma6.12.0 não mudaram.

## 34. Pendências de DR

OCI-DEPLOY-06 permanece responsável por backup/restore gerenciados, retenção, RPO/RTO,
custódia, consistência com storage e recuperação ensaiada.
Nenhum backup/import/restore real foi executado. DR PRODUCTION PENDING.
Não criar conta backup até necessidade operacional aprovada.

## 35. Impacto no roadmap e ordem

1. Revisar este pacote e decidir identidade Unix/custódia.
2. Autorizar D01 transferência/instalação.
3. Autorizar D02 preflight/configuração protegida.
4. Autorizar B40 e B41 em seus escopos.
5. Autorizar D03 diagnóstico Prisma, D04 e relock com encerramento verificável.
6. Tratar pendências separadas de migrations/primeiro schema vazio e backup/DR.
7. Só após gates restantes e nova autorização considerar OCI-DEPLOY-07.

OCI-DEPLOY-06.1 EM ANDAMENTO, pacote PASS LOCAL; OCI-DEPLOY-06 PARTIAL; OCI-DEPLOY-07 NÃO INICIADO.
Bloqueadores detalhados em [E17](evidence/oci-deploy-06-1-prisma-diagnostic/E17_REMAINING_GATES.json).

## 36. Final verdict

**PASS LOCAL — pacote implementado, reproduzido e validado no ambiente Linux ARM64 exigido.**

O artefato reutiliza o diagnóstico canônico, valida Prisma/TLS/identidade/roles,
protege credenciais/integridade e não depende da aplicação completa. Gates locais passaram,
com falhas do harness/scanner corrigidas e registradas, sem reduzir testes ou thresholds.

**PRISMA MANAGED PENDING; HEATWAVE MANAGED PARTIAL; DR PRODUCTION PENDING.**
D01/D02/B40/B41/D03/D04/relock não foram executados. Nenhum acesso a DEV/HeatWave/VM OCI,
IAM, DNS, Cloudflare, credenciais ou chaves privadas reais. Sem deploy, commit ou push.
A execução encerra aqui, aguardando revisão e autorização explícita para qualquer próximo lote.
