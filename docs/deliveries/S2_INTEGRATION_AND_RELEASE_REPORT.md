# Integração dos Ciclos 1 e 2 e publicação OCI

**Estado final em23/10/2026 23:29 UTC: BLOCKED — gate de segurança do build recusou o candidato. Correção do preflight instalada e comprovada; produção b9c1beb9/68 saudável, sem DDL ou cutover nesta execução.**
Este relatório preserva a integração, as homologações e o histórico das execuções autorizadas.
A execução mais recente foi recusada no build, antes do job de produção; a versão integrada não foi publicada.

## Código e proveniência

- Fontes conferidas: main `daf5c1e87082b8bba24c1ee5c87e2e09da73d86b` e daniel-dev
  `f43ccb2cdbecc395f977414e9f58fe4066faf47d`.
- Branch dedicada `integration/cycles-1-2-oci`; candidato imutável
  `81718c29ade2550d33fa7986defa3d96dc3c7b34`.
- [PR #32](https://github.com/iYoNuttxD/Traceflow/pull/32) integrada pelo proprietário em
  `2fb62458e4c4b0bf6cbea5f6d31d9c9875fd4330`. A árvore do merge é idêntica ao candidato.
  Houve dispensa explícita de revisão independente pelo operador, sem aprovação registrada.
  A proteção da main, desativada pelo proprietário para o merge, foi restabelecida com
  uma revisão obrigatória e sem bypass. Não se atribui revisão inexistente.
- Conflitos preservaram OAuth/GitHub App, IDs exatos, uploads retomáveis, lifecycle/readiness
  OCI, Prisma com recuperação limitada e desconexão dos dois clientes, recursos C1/C2,
  relatórios/PDF, scheduler GitHub e job runner no mesmo worker.
- Prisma 6.12.0 integra o runtime do pacote para executar o CLI imutável sem download na OCI.
  Nenhuma migration histórica foi editada, removida ou resolvida artificialmente.

## Schema e homologação

União: **84 migrations**, sendo 67 comuns idênticas, 16 exclusivas da main e uma exclusiva
na daniel-dev já aplicada. Produção: **68 migrations, 61 tabelas e 116 FKs**. Alvo:
**84 migrations, 74 tabelas e 145 FKs**. Os 16 nomes e hashes estão no plano de transição.

PASS isolado: vazio84; upgrade68→84 em MySQL nativo26.7.0 e em Oracle Linux 9.8 ARM64/MySQL 8.4.8;
upgrade83→84; hashes/colunas/registros anteriores preservados, backfills verificados, 145 FKs
sem órfãos, schema drift ausente e controle negativo real recusado. O upgrade ARM64 levou
12,598 s, preservando dez registros sintéticos nas 60 tabelas de domínio anteriores.

A API/Prisma Client anteriores leram o alvo84 e ficaram ready. O worker integrado iniciou
scheduler e os quatro jobs, publicou heartbeat e encerrou ambos os clientes. Pools previstos:
API5, worker3, comandos2; orçamento agregado documentado no runbook. Isso não equivale a teste
completo de todas as gravações bidirecionais após rollback, nem a DDL já aplicado no HeatWave.

## CI e artefato

[CI da revisão exata](https://github.com/iYoNuttxD/Traceflow/actions/runs/39714436829):
3.370 testes backend PASS, cinco skips herdados; 1.797 frontend PASS; Quality, Dependency Review
e Supply Chain PASS. [CI automático do merge](https://github.com/iYoNuttxD/Traceflow/actions/runs/39718199802)
concluiu SUCCESS; Dependency Review não se aplica ao evento push, tendo passado na PR candidata.

[Build/homologação ARM64](https://github.com/iYoNuttxD/Traceflow/actions/runs/39714436779): duas
montagens independentes byte-idênticas, Oracle Linux 9.8, Node 22.23.2, Prisma 6.12.0. Inventário de
4.640 arquivos/links verificado; 457 fontes/arquivos Prisma comparados com a revisão; 84 SQLs
conferidos. CLI Prisma validado com filesystem somente leitura. Audits produtivos: zero
vulnerabilidades em ambos. Recusas anteriores de transporte npm foram preservadas, sem waiver.

- Pacote SHA-256: `a76e39a50011bad5da0e40029935156e0acfcf377562a8af6297d7d554b5998d`.
- Manifesto SHA-256: `72f8e46a5a9d0e5b99fc4b882f1d3a34b2dd3dd9a3318f87dc7be1dca36683a9`.
- 78.694.748 bytes; sourceState committed; arch aarch64.

Testes direcionados adicionais: lifecycle66; backend179; GitHub/Health/uploads92; frontend70;
CD65; operações25; retenção4; política CI87; fechamento de imports diagnósticos27;
regressões de integração88. Nenhum threshold foi reduzido e nenhum skip novo foi introduzido.
As advertências de whitespace herdadas dos SQLs imutáveis foram preservadas; os novos trechos
não têm erros. Não foram repetidas suítes gerais para a correção posterior do auxiliar.

## Backup e recuperação

Backup pré-migração `20261022T022652Z-9da9b993947b484e8b1b237e4b2a5653`:
captura consistente, cifragem, publicação e readback externo PASS, 245.316 bytes cifrados.

- Cipher: `018f919011c6c34118708762850bd7bb2338a10b5e4075d09f7e28c90e575e4a`.
- Manifesto: `028eac512d76e8fcf5598878f28e01bf7cb87da5d8cdbd6d6c87e675f55e41ed`.

Restore real do mesmo conjunto: **ISOLATED_RESTORE_PASS**, 7,255 s, 61 tabelas, 68 migrations,
116 FKs, todos os dados/estruturas, um arquivo persistente e configurações iguais. Volume
cifrado local, MySQL descartável26.7.0, nenhum destino OCI, limpeza comprovada. A diferença
bruta de DDL ficou restrita à grafia redundante de charset previamente autorizada; hashes
originais preservados. O ensaio de backup/restore sintético no alvo84 também passou.

Não houve outra captura, restore produtivo, uso de ledger legado ou recurso OCI pago novo.
RPO alvo24h condicionado ao backup diário bem-sucedido; RTO planejado4h, ainda sem ensaio
integral de provisionamento/cutover. O tempo de restore acima não comprova o RTO completo.

## CD instalada e tentativa interrompida

A atualização administrativa revisada passou sob locks: código/provas protegidos, sete hashes
da autoridade CD, contratos exatos68/84, dois guards de backup/retenção, seletor de retenção e
JOBS_ENABLED=false na API/true no worker. PIDs e ingress permaneceram inalterados; os serviços
não foram reiniciados. Foram preservados os arquivos anteriores e todos os segredos/rotinas.
O plano protegido vinculou os 16 SQLs, o backup/restauração e as provas de runtime/upgrade.

Na execução única [39718652366](https://github.com/iYoNuttxD/Traceflow/actions/runs/39718652366),
build/homologação PASS e pacote novamente byte-idêntico ao aprovado. A preparação da credencial
migradora temporária falhou antes do DDL. O workflow foi cancelado; o receiver oficial recusou
o request cancelado com `WORKFLOW_NOT_ACTIVE`, antes da quiescência, migrations ou cutover.
Recibo terminal e request assinado foram preservados. Não se reutilizou essa autorização.

**Causa comprovada:** `1819 / ER_NOT_VALID_PASSWORD` no HeatWave às 03:50:27 UTC
(00:50:27 de Brasília). O gerador do auxiliar usava token_urlsafe sem garantir todas as
classes exigidas por validate_password.policy=MEDIUM. A remoção de DELETE/DROP ocorreu;
o ALTER seguinte foi recusado e a contenção manteve a conta bloqueada. Auditoria atual:
sete privilégios de schema, max_user_connections0, zero sessões, nenhuma credencial migradora
cifrada instalada. Não se declara que todas as ações administrativas foram somente leitura.

A correção foi preparada **somente no auxiliar local**, mantendo o sufixo aleatório de
288 bits e garantindo uma maiúscula, minúscula, dígito e caractere especial. O estado inicial
exige exatamente a conta parcial observada; não repete REVOKE. Diagnóstico futuro registra
somente códigos numéricos, sem SQL/senhas. SHA-256 do auxiliar corrigido:
`c887a4ff1f2b1a259cd7a65f04e2c04b1c905cf51f2e802a14b6f3acd387fcac`.

Teste real MySQL 26.7.0 com a mesma política: contraexemplo do gerador antigo recusado com 1819;
sete casos adversariais/aleatório corrigidos aceitos, inclusive ALTER USER completo com SSL,
limite 2 e unlock. MySQL local encerrado, senhas não registradas. Essa prova antecedeu a execução adicional
expressamente autorizada, registrada abaixo.

## Execução adicional autorizada e resultado

O operador autorizou **uma execução adicional após os gates**, mantendo a exclusão dos demais
escritores. A custódia corrigida passou às **01:18:42 de Brasília (04:18:42 UTC)**, antes do
novo disparo: identidade/TLS VERIFY_IDENTITY, sete privilégios de schema e limite 2 comprovados.
A extração da tentativa cancelada foi preservada por renomeação controlada, após verificação
completa do inventário e ausência de uso por current, Nginx, unidades, processos e listener 3002.
Inodes, conteúdo, permissões, ACLs e contextos SELinux ficaram iguais; nenhum diretório foi apagado.
Foi criado plano exclusivo `24a2a4df45c9186178695108ad89ea1ea0da271ae00aaa8ba7d529880222a197`,
com as mesmas 16 adições/provas/backup, novos horários e custódia root. O plano anterior foi preservado.

A [execução adicional 39721691174](https://github.com/iYoNuttxD/Traceflow/actions/runs/39721691174)
concluiu build/homologação ARM64 em **208 s**, incluindo novo upgrade isolado 68→84 em
8,781 s e inicialização da API/worker. O artefato baixado foi comparado byte a byte com
o pacote aprovado, sem diferença. A aprovação obrigatória de production foi registrada por
`iYoNuttxD`. O workflow publicou novo request/atestado OIDC, exclusivo dessa execução, às
01:24:24 de Brasília. Não foram reutilizados request ou autorização anteriores.

**Resultado: FAILED / COMMAND_SYSTEMD_RUN às 01:28:07 de Brasília (04:28:07 UTC).**
O ponto exato é `Host.preflight()`, chamada de `migration_unit(..., check=True)`, antes da
publicação de migrator-preflight.json. O receptor não chegou a `apply_migrations()`: não há
journal de DDL, data-before.json, migration.json, guard de schema, frontend candidato ou unidade
API candidata. O recibo informa migration.status=not-required e recovery.status=not-needed;
nesse contexto, not-required significa que a etapa não foi alcançada, não que as 16 adições
pudessem ser dispensadas. O job production terminou FAILED às 01:28:21; nenhuma nova tentativa ocorreu.

**Limitação diagnóstica real:** receiver.run() captura stderr, mas transforma a recusa em
COMMAND_SYSTEMD_RUN; o caminho de preflight não persiste o detalhe capturado. StandardError=null
na unidade pai e o journal consultado da unidade filha/gerenciador não forneceram a mensagem
específica. A unidade check estava not-found/inactive após a tentativa; isso, com --collect,
não comprova por si só se ela chegou a iniciar. Não há evidência para atribuir a causa a senha,
TLS, privilégios, dependências systemd, sandbox ou SELinux. Não foi repetido o comando para
produzir um diagnóstico dentro de outra operação privilegiada sem autorização.

O bloqueio restante é comprovar a execução do preflight migrador no contexto real da unidade
CD, preservando seu erro sanitizado. Não foi instalada outra correção, relaxado controle,
reexecutado DDL, disparada terceira pipeline ou criado novo recurso OCI.

Recibo oficial SHA-256:
`82ec2f26ebe3d037a15a3727d7207a602e75ef2b7b3db530630d2bd571553d17`.
Preservado em `/var/lib/traceflow-live-cd/oci-cd-39721691174-1.json` e publicado pelo
endpoint de resultado consultado pela pipeline. A cópia root foi auditada nesta verificação.

## Preservação e aceite final

Verificação administrativa **somente leitura** às **01:29:55 de Brasília (04:29:55 UTC)**:

- Produção continua em `b9c1beb9`; HTTPS 200, frontend público byte-idêntico ao ativo e readiness PASS.
- Banco `traceflow_live`: 61 tabelas, 68 migrations e 116 FKs; nomes/checksums aplicados exatamente
  iguais ao manifesto anterior, TLS VERIFY_IDENTITY. Nenhuma migration foi iniciada.
- API e worker mantiveram os mesmos processos desde 00:54:01 UTC. Worker único, heartbeat 12 s,
  MySQL saudável, zero 5xx em 5 min, zero falhas do monitor. Os novos quatro jobs ainda não estão ativos.
- Current.json continua byte-idêntico, SHA-256
  `f158209c1e5abb755647972536164293247044f173dd8c1d6ccc445daf0ca350`;
  Nginx/proxy, 24 fingerprints operacionais e SELinux Enforcing preservados.
- Backup existente/readback/restore permanecem válidos; nenhuma captura adicional ou recurso
  pago OCI foi criado. Timers CD, backup, monitor e retenção ativos. A falha terminal do serviço
  CD ficou registrada, sem reset de evidência ou tentativa automática da promoção consumida.
- Custódia encerrada às 01:29:10 de Brasília: migrador bloqueado, zero sessões e credencial cifrada
  temporária removida. Workspace temporário de custódia encerrado pelo systemd.
- Sem listener 3002, API candidata, frontend candidato ou guard de schema. A nova extração inativa
  e todos os recibos foram preservados. As releases anteriores e o legado não foram alterados.
- Homologação pública dos recursos C2/PDF **não executada**, pois o candidato não foi promovido.
  Nenhum projeto existente foi modificado e o dataset da banca não foi importado.

| Critério | Estado | Evidência / pendência |
|---|---|---|
| Código C1/C2 integrado | DONE | PR #32 / merge 2fb; candidato 817; origens e SQLs preservados |
| Homologação do schema integrado | DONE em isolamento | Vazio 84, 68→84, 83→84, hashes/FKs/drift/backfills e runtime |
| Schema integrado em produção | BLOCKED | Produção segue 68; preflight migrador recusado antes de DDL |
| Worker e quatro jobs | PARTIAL | Local/CI PASS; nova versão ainda não ativa |
| CD com migrations produtivas | PARTIAL | Build/artefato/aprovação/OIDC PASS; execução systemd do preflight recusada |
| Backup recuperável pré-DDL | DONE | Captura externa/readback/restore real do mesmo conjunto, sem repetição |
| Recursos públicos C2/relatórios/PDF | PARTIAL | CI/local PASS; homologação na nova release NÃO EXECUTADA |
| Preservação S2-10 | DONE no escopo verificado | Timers, backup atual, monitor e permissões preservados |
| Rollback integrado | PARTIAL | Ensaiado por etapa; leituras do binário anterior no schema 84; sem prova funcional bidirecional integral ou incidente OCI provocado |
| Dataset da banca | PARTIAL | Compatibilidade 83→84/fórmula preservadas; procedimento preparado; nenhum import produtivo |
| S2-08 IaC | PARTIAL | Ressalvas anteriores mantidas; nenhuma infraestrutura recriada |

## Investigação do preflight — preparação local e pausa em 22/10/2026

O acesso direto a `144.22.183.254:22` expirou nas consultas de leitura. HTTPS respondeu200,
com TLS validado e resposta dinâmica, mas isso não substitui uma auditoria atual do MySQL,
serviços ou backup. O operador confirmou que a rede atual não permite comunicação direta
com a VM e solicitou **pausar essa parte**. Não houve novos acessos depois dessa instrução.
Os dados de produção da seção anterior são a verificação de01:29:55, não uma nova observação.

Preparação **somente local**, ainda não instalada ou apresentada como correção causal:

- receiver distingue códigos de criação da unidade, setup, execução do filho, TLS/identidade,
  validação e timeout/recurso, aceitando somente os códigos conhecidos do migrador.
- BLOCKED do preflight fica preservado; evidência privada0600 contém metadados filtrados,
  hashes dos streams e InvocationID quando observado. O recibo público recebe somente códigos
  e estados seguros. Não grava streams brutos, SQL, credenciais ou dados empresariais.
- --quiet foi removido do comando preparado para manter o resumo de término de --wait,
  inclusive quando --collect descarrega a unidade. Os demais controles e BindsTo/PartOf
  permanecem. Essa alteração melhora diagnóstico e **não comprova a causa da recusa**.
- migrate.py mantém os limites e diferencia timeouts de conexão, introspecção e deploy,
  sem expor argumentos/ambiente. Backend, frontend, SQLs e pacote aprovado não foram alterados.
- Ensaio nativo preparado com pai oneshot em ativação, comando original fixado pelo hash do
  receptor anterior, credenciais sintéticas e casos de sucesso, BLOCKED, exec, namespace,
  credencial, timeout e memória. Não contém SQL nem chama migrate deploy. **Não foi executado.**
- **85 testes direcionados da CD PASS**, incluindo execução real do filho sintético local,
  captura de saída/código e recusa de modos não autorizados; diff check PASS. Esses resultados
  não comprovam comportamento nativo de systemd/SELinux. Suítes gerais não foram repetidas.

Não houve provisionamento de credencial produtiva, instalação, consulta HeatWave, DDL,
quiescência, cutover, novo request ou workflow nesta continuação. O pacote mantém SHA-256
`a76e39a50011bad5da0e40029935156e0acfcf377562a8af6297d7d554b5998d`.
A causa específica de COMMAND_SYSTEMD_RUN permanece **NÃO COMPROVADA**; não foi atribuída a
BindsTo, segredo, sandbox ou MySQL por hipótese. Não há GO técnico para nova promoção.

O trabalho está salvo localmente em `fix/cd-migrator-preflight`, sem novo commit/PR ou
atualização da autoridade CD antes da prova causal e das revisões aplicáveis. Na retomada do
acesso, executar primeiro o ensaio sintético; qualquer preflight HeatWave real continua
condicionado à autorização específica exigida nesta tarefa. Os planos antigos não serão
reutilizados: sua validade e o vínculo ao backup efetivamente selecionado precisam ser
conferidos antes do novo resumo/GO. Nenhum timestamp foi renovado.

[Evidência consolidada sanitizada](evidence/s2-integration-release/CURRENT_VALIDATION.json).
Procedimentos: [ADR-026](../architecture/ADR-026-OCI-SCHEMA-TRANSITIONS.md),
[CD](../runbooks/OCI_CONTINUOUS_DEPLOYMENT.md), [banca](../runbooks/TCC_DEMO_AFTER_INTEGRATION.md).

## Retomada em 23/10 — causa reproduzida e transporte corrigido

O SSH voltou a funcionar. Oracle Linux 9.8 ARM64, systemd 252-67.0.2.el9_8.6,
SELinux Enforcing. O ensaio clona as propriedades da unidade CD instalada, mantém o pai
Type=oneshot em `activating` e usa somente credenciais cifradas sintéticas, sem SQL.
Current, Nginx/proxy e PIDs de API/worker foram confrontados antes/depois, sem mudanças.

**Causa operacional reproduzida:** `systemd-run --pipe` falha antes da criação do filho,
com `Failed to start transient service unit: Connection reset by peer` (0,031 s no ensaio
final). Retirar somente `--pipe` permite executar o filho. Retirar BindsTo, PartOf, ambas as
dependências ou a credencial não resolve. O comando original do receptor instalado foi
fixado pelo SHA-256 e exercitado no mesmo contexto. O recibo histórico não preservou o
stderr original: a mensagem acima é do ensaio reproduzido, não um log recuperado da tentativa.
A causa interna da recusa do transporte de FDs pelo gerenciador não foi inferida por hipótese.

**Correção restrita:** substituir `--pipe` por `StandardOutput=append:` em arquivo exclusivo
root/0600, aberto pelo systemd; stderr do filho permanece null. O resultado já sanitizado do
migrador é lido com limite de 64 KiB e verificação de custódia; a ausência de resultado é recusa.
Permanecem --wait/--collect, BindsTo/PartOf, Type=exec, LoadCredentialEncrypted, ProtectSystem=strict,
NoNewPrivileges, InaccessiblePaths, limites e allowlists. A unidade CD não precisa ser alterada.
Nenhum diretório adicional foi tornado gravável no sandbox do migrador.

O receptor distingue criação, preparação, processo filho, conexão/identidade MySQL, validação,
timeout e recurso. Preserva somente códigos BLOCKED conhecidos, status/exit code e invocação
válida. A evidência privada contém metadados filtrados, hashes e resumo do journal da unidade
exata; o recibo público recebe uma lista ainda menor de campos seguros. stdout/stderr brutos
MySQL/Prisma, SQL, tokens e credenciais não são publicados nem persistidos pelo diagnóstico.
O migrador diferencia os timeouts de MySQL, introspecção e deploy sem mudar os comandos oficiais.

**93 testes direcionados CD PASS.** No ensaio nativo: sucesso 0,146 s; BLOCKED de conexão
sintético preservado 0,152 s; executável ausente 0,026 s; namespace 226 em 0,095 s; credencial
243 em 0,072 s; timeout em 1,326 s; OOM em 0,287 s. As falhas de preparação são recuperadas
por leitura filtrada do journal mesmo depois da coleta da unidade. São testes sintéticos,
não prova de TLS, privilégios ou drift reais. O cenário que usa credencial inválida não lê
credenciais de produção. Evidência privada: `/var/lib/traceflow-live-cd/diagnostics/migrator-20261023T202320Z-ed0cc067/`.

A consulta real de leitura foi recusada pela revisão automática antes da execução. O operador
posteriormente autorizou UM preflight HeatWave --check com custódia temporária delimitada,
sem DDL, quiescência, cutover ou promoção, após checks/revisão. A proposta está em
`build/cd-migrator-preflight/READONLY_PREFLIGHT_PROPOSAL.json`; ainda não foi executada.
A proteção da main foi consultada: ativa, sem dispensa nova de revisão independente.

O pacote 81718c29 permanece imutável. O receptor corrigido ainda não foi instalado.
O plano anterior está expirado e não pode ser reutilizado. O backup automático atual e o
vínculo ao restore devem ser consultados por leitura; o backup de 22/10 não é declarado vigente
por simples preservação do arquivo. Não houve nova captura, DDL, parada ou dispatch nesta retomada.
Após revisão, preflight real, instalação verificada e comprovação atual das provas/backup,
será apresentado o único resumo para um **novo GO produtivo**, ainda não solicitado.
S2-08 IaC e rollback funcional integral após expansão do schema continuam PARTIAL.

**Leitura real autorizada às20:23:33 UTC em23/10:** b9c1beb9, 61 tabelas/68 migrations/116 FKs,
nomes/checksums exatos, TLS VERIFY_IDENTITY; HTTPS/frontend e readiness PASS; API/worker/Nginx e
os quatro timers ativos. Fingerprints operacionais e current preservados, sem DDL/cutover,
credencial migradora temporária ausente. O backup diário `20261023T060005Z-8e686a25d1584fd492f6e044c111bfea`
concluiu SUCCESS/readback externo às06:00:11 UTC (14,39 h na consulta). Não houve captura nova.
Para o novo plano, o contrato exige restore vinculado a esse id/cipher/manifest: o restore de22/10
permanece histórico e não será apresentado como prova deste conjunto de23/10. O --check real
com a conta migradora ainda não foi executado.

## Fechamento da correção em23/10 — pronto para novo GO

- [PR #33](https://github.com/iYoNuttxD/Traceflow/pull/33), head `51405eeb0082b7f94b45b6edb9929b9c6bda5a7b`,
  merge `d0f577fc407d1780c88f100872d1c76967844489`. O proprietário integrou sem revisão, com a
  regra desabilitada, e depois dispensou expressamente a revisão independente para os dois
  hashes propostos. Não há aprovação independente registrada. A regra Protect main foi
  restabelecida com uma revisão exigida e zero bypass. CI da PR e do merge passou; o job
  [ARM64](https://github.com/iYoNuttxD/Traceflow/actions/runs/40019202656) concluiu SUCCESS.
- Instalação restrita às21:15:08 UTC: receiver `29ca8fff2c86180d45279580fc29aa054810f6ff5553d2ea8bde31d8d41d49df`
  e migrate `23c11eb5f15aed46948ed5068a094635384ee6fda1fe3891b094421549c7d4fa`, mais seus dois
  fingerprints no cd.json. Versões anteriores em
  `/var/lib/traceflow-live-cd/admin-updates/migrator-preflight-51405eeb0082`.
  PIDs, current, ingress, ACLs/contextos SELinux, unidade CD e autoridade do workflow preservados.
  Não houve bootstrap, restart de aplicação, alteração de secrets operacionais ou migrations.
- **REAL_MIGRATOR_PREFLIGHT_PASS às21:15:28 UTC, 5,3 s totais**, usando o código instalado,
  pai oneshot ainda activating e a credencial dedicada real. MySQL/TLS VERIFY_IDENTITY,
  identidade/schema/privilégios, limite2, CLI Prisma e migrate diff PASS; schemaDrift=NONE.
  Invocation ID `6c6effbe53374e78baccfbbfb46534cc`.
  Evidência root: `/var/lib/traceflow-live-cd/diagnostics/heatwave-check-20261023211523`.
  O ensaio só usou SELECT/SHOW e introspecção; a custódia autorizada realizou a rotação/unlock/lock
  da conta dedicada, sem mudar grants. Conta bloqueada, zero sessões e credencial cifrada
  temporária removida ao final. Nenhum DDL, quiescência, cutover ou request produtivo.
- Backup automático de23/10 às06:00 UTC, id `20261023T060005Z-8e686a25d1584fd492f6e044c111bfea`,
  SUCCESS/readback. Restore real do MESMO conjunto PASS em **7,3 s**: 61 tabelas, 68 migrations,
  116 FKs sem órfãos, todos os dados/estruturas, um arquivo e configurações iguais; volume
  cifrado/limpeza PASS, sem conexão à OCI. Cipher `3e2c5cd88139dcb1322aef3b0e4ddd5ebb4b6e6fd9b4e22d5e07b181bb7a61fa`;
  manifesto `409779a70baaf7647925dd8a564fb468387fb09ca2f108f60bdf7fb0548408b2`.
  O MySQL global do Mac avançou para26.10; foi usada uma cópia isolada26.7 da distribuição
  Homebrew, com SHA-256 do bottle oficial conferido e apenas relocação de prefixo local.
  A verificação oficial de versão e todas as comparações de restore permaneceram intactas.
  Não houve captura adicional nem alteração do MySQL global.
- Extração inativa da39721691174 preservada em
  `/opt/traceflow-live/releases/81718c29ade2550d33fa7986defa3d96dc3c7b34-a76e39a50011-preserved-failed-39721691174`.
  Referências por processos/configurações e listener3002 ausentes; inventário/inodes/conteúdo/
  ACLs/SELinux idênticos após rename. Um primeiro gate de lock recusou antes de qualquer
  alteração; a consulta seguinte comprovou zero locks/destino/journal ausentes, e houve uma
  única renomeação efetiva. Nenhuma evidência ou versão ativa foi excluída.
- Auditoria final às21:18:42 UTC: b9c1beb9, 68 migrations com checksums exatos, 61 tabelas/116 FKs,
  HTTPS/frontend/readiness PASS, MySQL/worker saudáveis, todos os timers ativos, 24 fingerprints
  válidos, SELinux Enforcing, migrador encerrado. Backup com15,308 h de idade; contrato máximo26 h.

O plano anterior expirado permanece preservado. Há somente um rascunho não consumível com
as mesmas16 adições/provas e o backup novo, sem issuedAt/expiresAt nem declaração atual de
exclusão de escritores. Depois do novo GO será emitido plano exclusivo (até4 h), request novo
pela CD existente e aprovação humana obrigatória de production. O candidato segue81718c29 e
pacote a76e39a5, sem reconstrução ou mudança funcional nesta correção.

**A promoção/DDL ainda NÃO está autorizada.** Solicitar um único GO, incluindo confirmação
atual da exclusão dos demais escritores. DDL parcial implica parada/intervenção, sem retry,
resolve/reset ou restore destrutivo. Após schema completo, eventual rollback de binário
preserva o schema84; a compatibilidade funcional bidirecional integral continua não comprovada.
S2-08 IaC permanece PARTIAL; S2-09 com migrations produtivas continua PARTIAL até a promoção.
O OAuth antecipado foi bloqueado pela revisão automática antes da ação e foi adiado para
os testes pós-GO, conforme o escopo; nenhuma sessão foi criada nesse teste antecipado.

## Publicação autorizada em23/10 — execução em andamento

O operador concedeu o novo GO: “GO — uma publicação, escritores excluídos até o encerramento”.
Abrange o mesmo candidato81718c29/pacotea76e39a5, custódia temporária, parada coordenada e16
migrations. Mantidos: uma execução, aprovação humana de production e intervenção em DDL parcial.

Às23:24:42 UTC, leitura atual comprovou b9c1beb9/68/61tabelas/116FKs, HTTPS/readiness,24
fingerprints e timers íntegros; nenhuma credencial migradora temporária. Backup de23/10
com17,409h, vigente com readback e restore real já comprovados, sem nova captura.

Plano protegido exclusivo `aa5b054d7cccd3e535d67bd2187a1132215300a095762df6bb869e4d508d0500`,
emitido23:25:23 UTC, válido até24/10 03:25:23 UTC, com os mesmos hashes de homologação
e o restore do backup diário. Os documentos anteriores permanecem intactos.
[CD40039599837](https://github.com/iYoNuttxD/Traceflow/actions/runs/40039599837) disparada
uma vez às23:25:33 UTC na main d0f577fc. Build/homologação em andamento; nenhuma migration
ou promoção declarada nesta atualização. A proteção da main está ativa, uma revisão e sem bypass.

## Resultado da execução40039599837 — BLOCKED, produção preservada

A execução autorizada [40039599837](https://github.com/iYoNuttxD/Traceflow/actions/runs/40039599837)
foi encerrada sem retry. O ensaio CD passou nos93 testes; o teste isolado real de schema84,
API e worker também passou. Em23/10 às23:27:59 UTC, a primeira montagem ARM64 foi interrompida
por `npm --prefix backend audit --omit=dev --audit-level=high` (exit1). Não se declara build
reproduzível completo nem comparação de artefato desta execução: ela parou antes da emissão.

Causa específica: **body-parser1.20.8 e zod4.4.3 com vulnerabilidades high**; adicionalmente
ip-address10.7.3 e nodemailer10.0.9 com moderate. Total:2 high e2 moderate. Os alertas high:

- [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828): body-parser <1.20.9;
  correção1.20.9, advisory publicado22/10 e atualizado23/10.
- [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5): zod <4.6.6;
  correção4.6.6, revisão/atualização23/10.

Os PASSs anteriores de CI/audit permanecem evidência histórica, não substituem esse gate atual.
Nenhum audit foi ignorado, flexibilizado ou convertido em PASS. Corrigir dependências exige
novo SHA/pacote e validação correspondente; o pacotea76e39a5 não pode ser alterado mantendo a
identidade aprovada. Conforme a regra de parada diante de falha nova, não se iniciou essa
correção de aplicação nem outra execução automaticamente.

**Produção ignorada pelo workflow:** job production=skipped; nenhuma aprovação do ambiente
solicitada, request assinado ou release de promoção publicado. A custódia migradora preparada
localmente NÃO foi executada: nenhuma senha foi gerada/provisionada nesta execução. O plano
novo permanece original e não utilizado; não reutilizar esse GO/request para outra publicação.

Leitura final real às23:29:12 UTC confirmou: **b9c1beb9,61 tabelas,68 migrations,116 FKs**,
nomes/checksums exatos; HTTPS/frontend/readiness PASS; API,worker,Nginx e timers ativos,
monitoramento sem falhas;24 fingerprints intactos e SELinux Enforcing. Não existem recibo,
diretório de trabalho ou extração do candidato dessa execução na OCI, nem guard de DDL,
listener3002 ou credencial migradora temporária. Current, ingress e horários de início dos
serviços preservados. Nenhuma parada, migration, cutover ou recuperação de produção necessária.
Backup diário/readback/restore preservados; zero capturas adicionais.

Evidências sanitizadas: `docs/deliveries/evidence/s2-integration-release/CURRENT_VALIDATION.json`
e `build/cd-migrator-preflight/PUBLICATION_FINAL_RESULT.json`; log bruto somente local protegido.
S2-09 C1/C2 permanece PARTIAL até publicação/homologação pública; S2-08 IaC e rollback funcional
integral após schema expandido continuam PARTIAL. A CD sem mudança de schema já comprovada
e a S2-10 permanecem preservadas.
