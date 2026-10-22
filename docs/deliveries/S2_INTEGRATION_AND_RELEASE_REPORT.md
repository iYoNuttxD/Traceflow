# Integração dos Ciclos 1 e 2 e publicação OCI

Situação: preparação local validada; CI/build ARM64 e promoção ainda pendentes. Produção
preservada em `b9c1beb9f6ded49ce9257d346c086a8893f700c9`, banco `traceflow_live`, 68 migrations.
Este documento será consolidado com os resultados reais; não é declaração de publicação.

## Integração e schema

Branch isolada `integration/cycles-1-2-oci`, baseada em `daniel-dev` f43ccb2c e integrada com
`main` daf5c1e8. As duas branches de origem foram preservadas. Os conflitos de API/worker foram
resolvidos mantendo drenagem, readiness/storage OCI, proteção do motor Prisma, desconexão dos
dois clientes, scheduler GitHub e job runner. Os contratos de uploads retomáveis e os contratos
novos de alertas/notificações/relatórios foram mantidos. Os lockfiles preservam as versões
compartilhadas aprovadas da main e acrescentam streaming/upload; Prisma 6.12.0 passa a integrar
o runtime para executar o CLI imutável de migração sem download na OCI.

União comprovada: main 83, daniel-dev 68, resultado **84 migrations**; 16 novas para produção
mais a migration de uploads retomáveis exclusiva da daniel-dev. Todos os SQLs originais
permanecem byte a byte, sem colisões de checksum. Schema integrado: **74 tabelas, 145 FKs**.

O ensaio nativo em MySQL 26.7.0 aplicou 68→84 pelo Prisma, preservou os 10 registros sintéticos
em todas as 60 tabelas de domínio anteriores, validou preenchimentos históricos e todas as
145 FKs. A instalação vazia de 84 também passou. O schema físico corresponde ao datamodel;
um controle negativo real de FK foi recusado com exit 2. A API/Prisma Client anteriores leram
os dados no schema alvo; o worker integrado iniciou os quatro jobs e heartbeat e encerrou
sem deixar registro de worker ativo.

Limite: MySQL nativo 26.7.0/macOS não equivale integralmente ao HeatWave 26.7.0-cloud. O build
ARM64/Linux e sua homologação precisam ser registrados. Na OCI foram observados SQL mode,
case sensitivity, TLS, cadeia aplicada e privilégios; nenhuma migration nova foi executada.
As contas API/worker seguem somente DML e interromperam exclusivamente suas próprias consultas
temporárias de diagnóstico, sem privilégios globais adicionais.

## CD, backup e recuperação

Contrato em [ADR-026](../architecture/ADR-026-OCI-SCHEMA-TRANSITIONS.md) e procedimento no
[runbook CD](../runbooks/OCI_CONTINUOUS_DEPLOYMENT.md). A cadeia deixa de depender da quantidade
68. A comparação de nomes/checksums, ausência de duplicidades e recusa de histórico incompleto
continuam obrigatórias. O plano protegido, suas provas de upgrade/runtime/restore e o hash
no request OIDC vinculam a transição exata e a aprovação humana.

Antes do DDL: backup consistente cifrado, externo e com readback e restore isolado do mesmo
conjunto; configuração de backup reconhecendo origem e alvo; credencial migradora própria,
TLS estrito, pool ≤2; locks CD/backup e Prisma. O migrador não usa a credencial SELECT do backup.
API/worker drenam e param brevemente para impedir gravações durante os preenchimentos.

Falha durante DDL é terminal e exige intervenção, preservando o histórico observado. Não há
retry, down migration, reset, resolve ou restore automático. Após DDL completo, somente o
binário anterior comprovadamente compatível pode retornar; o schema alvo permanece aplicado.
Essa recuperação foi ensaiada em isolamento; não constitui prova de rollback integral na OCI.

Backup e restore foram adaptados a contratos explícitos de schema, mantendo validação integral.
Um dump sintético das 74 tabelas/84 migrations foi restaurado em outro banco vazio com igualdade
integral de dados/estruturas. Isso **não substitui** o backup/restore atual de produção exigido
antes do GO. A política, o bucket, o prefixo, a retenção e os contadores da instalação limpa
não foram alterados nesta preparação. Não há dependência de ledgers/controladores abandonados.

## Validação

[Evidências sanitizadas](evidence/s2-integration-release/LOCAL_VALIDATION.json): 66 testes de
lifecycle/conexões, 179 de integração backend, 92 GitHub/Health/uploads, 70 frontend, 56 CD,
25 operações, 3 retenção e 59 da política CI. Lint/formatação e scanner de segredos passaram;
auditorias npm de produção: zero vulnerabilidades em ambos os pacotes. Os dois URLs falsos
com senha de testes de retenção foram substituídos por URLs sem senha, sem alterar o scanner.

A CI completa da revisão candidata, o build reproduzível Oracle Linux ARM64, a aprovação de
produção, o backup atual/restauração e a publicação ainda não foram executados nesta revisão.
Não foram simulados recibos produtivos.

## Pendências e aceite

| Critério | Estado | Evidência / pendência |
|---|---|---|
| Código integrado e migrations preservadas | PARTIAL | Local PASS; revisão e CI da identidade definitiva pendentes |
| Upgrade e integridade do schema | PARTIAL | 68→84, vazio84, dados/FKs/drift locais PASS; prova ARM64 e migração produtiva pendentes |
| Worker, jobs e orçamento | PARTIAL | Quatro jobs/heartbeat/encerramento locais PASS; ativação operacional dos jobs pendente |
| CD com migrations | PARTIAL | Contrato e recuperação isolados PASS; instalação administrativa e promoção dependem do GO |
| Backup recuperável antes do DDL | PARTIAL | Backup automático atual íntegro; restore do conjunto selecionado para a promoção pendente |
| Funcionalidades públicas integradas | PARTIAL | Testes direcionados locais PASS; produção segue a versão anterior |
| Dataset da banca | PARTIAL | 83→84 PASS e fórmula Health preservada; aplicação posterior conforme runbook, sem import neste deploy |
| S2-08 IaC | PARTIAL | Mantidas as ressalvas existentes; nenhuma infraestrutura recriada |

Custos adicionais desta preparação: nenhum recurso OCI pago criado. Nenhuma alteração de
schema, promoção, mudança na GitHub App ou importação de demonstração ocorreu.

Preparação da banca: [procedimento separado](../runbooks/TCC_DEMO_AFTER_INTEGRATION.md).
O gate de cronologia do ator e o versionamento dos scripts locais precisam ser conferidos na
operação de povoamento; não justificam alterar contas reais ou forçar resultados nesta publicação.

`git diff --check`: as alterações novas de implementação não têm erros. Permanecem linhas
em branco de EOF herdadas de SQLs/documentos/unidades originais; os SQLs imutáveis não foram
editados para eliminar avisos cosméticos.
