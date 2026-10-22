# OCI-DEPLOY-06 — Evidências locais sanitizadas

Baseline `daniel-dev` / `4def31513bfb9d20444a7b9fb8f8b7500164c4ae`, 14/10/2026 BRT (timestamps de execução em UTC podem indicar 15/10).

Escopo: bancos sintéticos novos em MySQL 8.4.8/26.7.0 e VM Oracle Linux 9.8 ARM64 própria. Nenhum dado, credencial, certificado privado ou dump é publicado aqui. HeatWave real: PENDING. DR de produção: PENDING.

- `dr-*.json`: 27 fases por ambiente, R01–R12, interrupções, manutenção e smoke; `productionCertified: false`.
- `connection-*.json`: diagnóstico estrito, credenciais inválidas, pool/limite/timeout, CA/SAN/validade e recuperação, com Prisma real.
- `migration-validators.json` / `linux-gates.json`: comandos e resultados de schema/Prisma/TLS.
- `backend-gates.json`: a suíte/lint/format/architecture passam; o scan padrão da cópia sem `.git` recusa enumeração. O scan final no checkout real está em `final-static.json` e `post-document-checks.json`.
- `frontend-gates.json`: coverage/lint/format/build desta execução.
- `security-quality.json`: execução anterior aos últimos testes de monitor/bridge (72 unitários então); `quality-summary.json` registra o resultado final de 74 testes, sem omitir a diferença de momento.
- `quality-summary.json`: contagens, coverage, thresholds preservados, auditoria e integridade da baseline; cinco skips pré-LR2 já existentes.
- `systemd-verify.json`: validação de sintaxe somente, sem instalação/start.
- `cleanup.json`: processos/datadirs/VM/chaves sintéticas removidos; sem alvos protegidos.
- `source-file-hashes.json`: hashes finais dos arquivos de código e documentação desta entrega (exclui esta pasta para evitar dependência circular).
- `post-document-checks.json`: secret scan incluindo documentação/evidências, whitespace e links locais.

Os hashes abaixo detectam alterações nestes arquivos; este índice local não é um catálogo assinado ou raiz de confiança de backup de produção. Os logs completos de testes ficaram no diretório temporário público da tarefa; somente dados sanitizados necessários ao diagnóstico foram incorporados. Nenhum workflow GitHub remoto foi executado.

| Arquivo | SHA-256 |
| --- | --- |
| [backend-gates.json](backend-gates.json) | `6b0c77bb1aa631cdfaaef3b2baa9c2c089f52e25611b278dcc1159caddcd4ac1` |
| [cleanup.json](cleanup.json) | `b2c88adefe14819cff0ce19cf4852ce92dd7758ad5d13e441d116cb2af5957b8` |
| [connection-267.json](connection-267.json) | `bb2c4751911159909bb3d42d92c34474011bcf1d144c07a956345a2f89f90398` |
| [connection-848.json](connection-848.json) | `7fc73c2c5095f0287cb66372af03ba7e3f367ef73e9465723182c8819f460ac0` |
| [connection-linux.json](connection-linux.json) | `8c9c8989c84850da10c66b26ff98254b2c89e10f2afed9726efadc307946062d` |
| [dr-267-expanded.json](dr-267-expanded.json) | `a30ea170175ff434954d0a77ba42f5e6896339802da0226cb76517379a1f5a3b` |
| [dr-848.json](dr-848.json) | `33d49822e9bcee38bdca46fd7f5bcba92028529a64be14f48e3386d5001e3a5f` |
| [dr-linux-expanded.json](dr-linux-expanded.json) | `21971a6428f570f0626e9a43e600ae10c4a37c67194767a4c55c90c81b33158a` |
| [final-static.json](final-static.json) | `30dedfdc3311fe0376b14d3688b608d1b905ff50ea70022774a4da11bc365c1f` |
| [frontend-gates.json](frontend-gates.json) | `16dafa2288a77fb1d662f07e9ba8f40002402f8a707c5dd1b6c08d6f5194fee9` |
| [linux-gates.json](linux-gates.json) | `c555ecb19882a605e19814ffd120acf633de98159a73c56be1e575d210998f77` |
| [migration-validators.json](migration-validators.json) | `0b9d072a81d990cfe482a53869afa0038a83e4c0104c321eef38267579e4501a` |
| [post-document-checks.json](post-document-checks.json) | `c1726bf50b308c4f9cbe7cf06af30d568c60399255afc40931821b9da1211af4` |
| [quality-summary.json](quality-summary.json) | `d020c5d9b2efc1b3de4dabe2c511cd91c7e0d4cda96068271e5526154785b5bc` |
| [security-quality.json](security-quality.json) | `2eb8beea35d084ac3954a0d1423f46582ee5941b9c30bdada30357b31b35304d` |
| [source-file-hashes.json](source-file-hashes.json) | `c2d74acf22f17f462c6805df973daf0c01645057e95ef8c5579084fb0fb66490` |
| [systemd-verify.json](systemd-verify.json) | `732fb12ce53cba4ffcf46888829b1a689f2f58bb58038096a7e8a6e284f3d5e2` |

Relatório: [OCI_DEPLOY_06_HEATWAVE_BACKUP_RECOVERY_REPORT.md](../../OCI_DEPLOY_06_HEATWAVE_BACKUP_RECOVERY_REPORT.md).
