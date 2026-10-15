# OCI-DEPLOY-06.1 — Índice de evidências

Consolidação: 2026-10-15T12:13:15.153868+00:00. Baseline `daniel-dev` / `dee40d83f9904d22b3dc65cb61f56dc5b4732d7a`.

**PARTIAL.** Contratos e testes locais executados; TLS do servidor relatado pelo operador; Prisma HeatWave e DR de produção pendentes. Nenhum acesso remoto, deploy ou mudança de banco persistente.

Cada JSON declara origem, ambiente, data, comando/procedimento, status, resultado e limitações. `OPERATOR_SUPPLIED` não representa execução pelo agente. Datas de arquivo/consolidação não substituem o timestamp ausente do teste manual.

| Evidência | Estado | SHA-256 do arquivo |
| --- | --- | --- |
| [E01_BASELINE](E01_BASELINE.json) | PASS | `96930824d31eb578e06f8b9bde311344b412d14b584dcc3456199fde74959b71` |
| [E02_PRISMA_CONTRACT](E02_PRISMA_CONTRACT.json) | PASS_LOCAL | `83a7485ee7db1808642bbda229ad9381ecc382f468012b41dff47d6abff58f04` |
| [E03_TLS_LOCAL](E03_TLS_LOCAL.json) | PASS_LOCAL | `ad079a0499dffeddf96f9f548542fd8838444ec03636d7f350da954b95551beb` |
| [E04_OPERATOR_CERTIFICATE](E04_OPERATOR_CERTIFICATE.json) | REPORTED | `9830058631d39c41567ea754223884f020ccee2a38884ed3dd3ecb4a63278891` |
| [E05_OPERATOR_DNS](E05_OPERATOR_DNS.json) | REPORTED | `956b4dd8c1eb6bd61d6b56aeaa11dd3989a85572cb242f730e16292f86feb6a9` |
| [E06_OPERATOR_HOSTNAME_TLS](E06_OPERATOR_HOSTNAME_TLS.json) | PASS_OPERATOR | `41b98fea51e804ca9c57abf2b0225104d4ec8ebe83237eb8138ea9ad9e2beb16` |
| [E07_CA_PERMISSIONS](E07_CA_PERMISSIONS.json) | PASS_LOCAL | `043019ac25e3c1224481c936a6267ee211920ff8c083811ccff8476b6278b2fe` |
| [E08_SYSTEMD](E08_SYSTEMD.json) | PASS_LOCAL | `fc6fb9e5a0957dda08e5a8f8921e91e5d3cdd6101d2d0ed5a5c919f503c9d567` |
| [E09_LOCAL_DIAGNOSTIC](E09_LOCAL_DIAGNOSTIC.json) | PASS_LOCAL | `860d3b85d9dc40322b6e68f2aee7f87abac681b4ffb699a255bed06ffa805e5e` |
| [E10_MANAGED_DIAGNOSTIC](E10_MANAGED_DIAGNOSTIC.json) | PENDING | `afa6b059b030bf5f8cf6862b0961fdeeb4f949541ee4ee35257a3911e39f5c33` |
| [E11_GRANTS](E11_GRANTS.json) | PASS_LOCAL_MANAGED_PENDING | `659595bffce77aa2c1694e7c329ad7d589f7bcfcdd816f7c3fd39b422d269fc8` |
| [E12_MYSQL_PARAMETERS](E12_MYSQL_PARAMETERS.json) | PASS_LOCAL_MANAGED_PENDING | `ebfc733fe15316073aa55cc738acdf037b5b00fb4ec383d5c347295d41785d4f` |
| [E13_MIGRATIONS](E13_MIGRATIONS.json) | PASS_LOCAL_OCI_PENDING | `ed40871b45836e5048845459473bf57f2eb798a6c963e77b851ee76746536270` |
| [E14_SECURITY](E14_SECURITY.json) | PASS_WITH_REVIEWED_EXISTING_TEMPLATE | `e21d6a3720bc4b262f470c3df7744d9fd99348b6a4c0f1e2f72439db72f212c9` |
| [E15_QUALITY_GATES](E15_QUALITY_GATES.json) | PASS_LOCAL_WITH_MEASURED_COVERAGE_DELTAS | `44734ec9116f90ccc1429b2ec496d0f34f28d8952a214bebe97a207543d93340` |
| [E16_REMAINING_BLOCKERS](E16_REMAINING_BLOCKERS.json) | PARTIAL | `7af986aa7e56f05442288f5b446d3ee585a0de8422377410b8908439f5256999` |

O E01 contém a comparação de 1.467 arquivos rastreados; E13 conserva os hashes das 68 migrations. E15 registra contagens, coverage, comandos, correções de harness e a comparação com a baseline limpa. As pequenas diferenças de cobertura não foram ocultadas ou compensadas por mudanças funcionais.

O scan padrão e todo conteúdo novo passaram. O scan integral dos arquivos alterados sinalizou uma URL f-string histórica no runbook de compatibilidade; senha/usuário são variáveis sintéticas e o trecho é idêntico ao HEAD. E14 conserva o resultado e sua classificação; o scanner não foi alterado.

Reprodução: usar Node 22 e uma cópia de fontes públicas sem `.env`, com `npm ci` por lockfile e Prisma generate próprios. O laboratório recebe somente caminhos verificados de MySQL/Node, cria seu alvo e `TEST_DATABASE_URL`, confere UUID/porta/schema/datadir e remove somente os recursos criados. Comandos exatos locais estão em E03/E15; requisitos e modelos remotos no [runbook](../../../runbooks/OCI_HEATWAVE_HOMOLOGATION.md).

Não há URL com senha real, dump, conteúdo de chave, `.env`, arquivo privado ou screenshot nestas evidências. Certificados/contas dos ensaios são sintéticos. O relatório preserva as distinções entre manual, histórico, local e pendente.

[Relatório da entrega](../../OCI_DEPLOY_06_1_HEATWAVE_MANAGED_HOMOLOGATION_REPORT.md)

Limpeza concluída: VM Lima própria removida; workspaces privados, datadirs, credenciais e chaves sintéticas descartados. Apenas saídas públicas sanitizadas foram retidas; nenhum recurso OCI ou banco persistente foi tocado.
