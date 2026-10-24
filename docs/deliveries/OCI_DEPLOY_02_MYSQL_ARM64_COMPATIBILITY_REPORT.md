# OCI-DEPLOY-02 — MySQL e ARM64: relatório de compatibilidade

Data: 13/10/2026, America/Sao_Paulo. As execuções finais terminaram em 14/10/2026 UTC.

**Classificação: OCI-DEPLOY-02 — PARTIAL / BLOCKED.**

## 1. Resumo executivo

A compatibilidade local foi demonstrada com **MySQL Community 26.7.0, Prisma 6.12.0,
Node 22.23.2 e Oracle Linux 9.8 ARM64**, em VM descartável com virtualização nativa.
Também foi executada a comparação MySQL **8.4.8 × 26.7.0 no mesmo host macOS ARM64**.
Nenhuma incompatibilidade funcional do TraceFlow foi comprovada nesses ambientes.

Em cada um dos três ambientes finais:

- 67 migrations aplicadas; ledger completo, checksums corretos e zero pendências/falhas.
- Seis CHECKs rejeitaram INSERTs e UPDATEs inválidos, com erro MySQL 3819.
- 274 índices, 408 posições de colunas em índices e 116 foreign keys inspecionados.
- Coluna gerada STORED, unicidade nullable e collation binária validadas funcionalmente.
- 14 invocações de validators históricos/drift aprovadas.
- **833 testes API/integração aprovados, zero falhas e cinco skips legados**, em 60 arquivos
  descobertos. Skips não foram contabilizados como aprovação.
- Deadlock, retry limitado, NOWAIT, lock timeout, rollback transacional e isolamento
  exercitados em MySQL real.
- Prisma/Argon2 e importação do backend aprovados antes e depois de `npm prune --omit=dev`.

**O bloqueio restante é a homologação específica do HeatWave gerenciado e de sua conexão
TLS/identidade/configuração.** Os testes locais usaram loopback; o Prisma não negociou TLS
nessas conexões. Isso não é uma validação de conexão segura para produção. Não houve acesso
ao banco OCI, alteração de infraestrutura, commit, push ou deploy.

Não há fundamento experimental nesta entrega para atualizar Prisma, editar migrations
históricas ou alterar repositories/scheduler. A próxima etapa de contrato de produção pode
ser revisada para autorização, mas este resultado não autoriza migrations em produção.

## 2. Baseline e escopo dos arquivos

| Item                          | Evidência                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| Repositório                   | `iYoNuttxD/Traceflow`, checkout `/Users/daniel/Coding/Traceflow`                       |
| Branch inicial/final          | `daniel-dev`                                                                           |
| HEAD inicial/final            | `11eeea3137b0bccc8fcc69597e31ad26ea700a5c`                                             |
| Working tree inicial          | Limpo                                                                                  |
| Working tree final            | Somente arquivos novos desta entrega; nenhum arquivo rastreado preexistente modificado |
| Prisma CLI / Client instalado | `6.12.0` / `6.12.0`                                                                    |
| Schema                        | 58 models; 32 enums                                                                    |
| Migrations SQL                | 67                                                                                     |
| Node / npm do host            | `22.23.3` / `10.9.9`                                                                   |
| Node / npm do guest Linux     | `22.23.2` / `10.9.8`, iguais às versões informadas para a VM OCI                       |
| Argon2 do lockfile            | `0.44.0`                                                                               |

A entrega segue P1 da auditoria OCI-DEPLOY-01 fornecida na conversa. Foram considerados
`docs/runbooks/DATABASE_MIGRATIONS.md`, `GITHUB_AUTOMATIC_SYNC.md`, arquitetura, CI, os
validators existentes e os contratos de isolamento. A arquitetura Route → Controller →
Service → Repository → Prisma → MySQL foi preservada.

Arquivos adicionados:

| Arquivo                                                    | Finalidade e limite                                                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `backend/scripts/validate-oci-mysql-compatibility.js`      | Orquestra somente um mysqld novo, workspace isolado, fases, relatórios e limpeza com propriedade.         |
| `backend/scripts/lib/oci-compatibility-safety.js`          | Reutiliza o guard de testes e restringe host, porta, namespace, identidade, erros, sanitização e limpeza. |
| `backend/scripts/lib/oci-compatibility-probes.js`          | Ledger, metadados físicos, fixtures sintéticas, Prisma, Argon2 e runtime após prune.                      |
| `backend/scripts/lib/oci-compatibility-concurrency.js`     | Deadlock real com o helper existente, NOWAIT, timeouts e leitura repetível.                               |
| `backend/scripts/oci-compatibility-probe.js`               | Entrada dos probes, executada somente pelo runner proprietário.                                           |
| `backend/test/unit/oci-mysql-compatibility.test.js`        | Controles negativos e proteção de relatórios/limpeza, sem conexão a banco.                                |
| `docs/runbooks/OCI_MYSQL_COMPATIBILITY.md`                 | Procedimento de repetição, limites, segurança e planejamento TLS/HeatWave.                                |
| Este relatório e `docs/deliveries/evidence/oci-deploy-02/` | Evidência sanitizada e comparação reproduzível.                                                           |

Nenhuma dependência foi adicionada. Não foram alterados `src/`, schema, migrations,
lockfiles, workflows, configuração da GitHub App, Cloudflare ou documentação acadêmica.

## 3. Ambientes e procedência

| Ambiente                         | Execução                                                          | Node    | MySQL                         | Limitação                                                                       |
| -------------------------------- | ----------------------------------------------------------------- | ------- | ----------------------------- | ------------------------------------------------------------------------------- |
| macOS, Darwin 27.0.0, ARM64      | Binários nativos oficiais, processos novos                        | 22.23.3 | 8.4.8 e 26.7.0                | Não é Linux; `lower_case_table_names=2`.                                        |
| Oracle Linux Server 9.8, aarch64 | Guest Lima 2.2.1/VZ, virtualização ARM64 nativa, sem Rosetta/QEMU | 22.23.2 | 26.7.0                        | 2 CPUs/4 GiB; não reproduz hardware Ampere nem latência/restrições gerenciadas. |
| HeatWave Always Free OCI         | **NÃO EXECUTADO**                                                 | —       | 26.7.0 informada pelo usuário | Reservado para produção; nenhum schema de teste criado.                         |

Guest Linux: kernel `6.12.0-204.92.4.2.el9uek.aarch64`, glibc **2.34**, OpenSSL do sistema
**3.5.8**, OpenSSL do Node **3.5.7**, SELinux **Enforcing**. Instalou-se libaio e atualizaram-se
openssl/openssl-libs/tar **somente no guest descartável**. A imagem oficial OL9U8 foi
verificada por SHA-256. Não houve mounts do host, encaminhamento de agente SSH, uso de chaves
pessoais ou portas da aplicação encaminhadas. A VM foi parada e excluída após recolher os
relatórios. Todos os mysqld da tarefa foram encerrados e seus datadirs removidos pelo runner.

### 3.1. Artefatos verificados

Os três pacotes MySQL vieram de domínios oficiais Oracle/MySQL. MD5 publicado/CDN conferido,
SHA-256 calculado e assinatura GPG validada com fingerprint oficial
`BCA43417C3B485DD128EC6D4B7B3B788A8D3785C`, usando a chave renovada de 2025.

| Artefato                                | SHA-256                                                            |
| --------------------------------------- | ------------------------------------------------------------------ |
| MySQL 8.4.8 macOS ARM64                 | `76e4f531afd972a14fcd31a25fa6d6befa57e1ad17b9dbc710fc66da8cfa48f9` |
| MySQL 26.7.0 macOS ARM64                | `57fb68a4b566823ce588cee7a32feabb3970d1a8622a0c3a7ca37c1ca56610da` |
| MySQL 26.7.0 Linux glibc 2.28 ARM64     | `894da547042baf5f7da6eac72252978dc3da146aca706dbbae2f4176aded34b4` |
| Node 22.23.2 Linux ARM64 `.tar.xz`      | `fff4078c5def658577f92c88db7db3bc0072924bfb93fe52c1e744a54e94abb8` |
| Oracle Linux 9.8 ARM64 cloud image b182 | `4793c3ec49d9f8b27a932d3bd88ec45d08249c5195faa3b0fac876ab0d5f5856` |
| Lima 2.2.1 Darwin ARM64                 | `9e9eacce88f37e185c346bad73aa6136f738d8cdf8c3bb23cd42b071824bc66e` |

URLs, tamanhos, MD5 e verificações constam de [provenance.json](evidence/oci-deploy-02/provenance.json).
A verificação GPG posterior confirmou os pacotes originalmente obtidos por HTTPS/checksum.
O `codesign --verify --deep --strict` do mysqld macOS 26.7 retornou assinatura inválida no
host Darwin 27; o binário não foi alterado ou reassinado. A assinatura GPG do arquivo de
distribuição passou; não se declarou aprovação de notarização/codesign macOS.

A chave pública antiga de 2023 produziu `EXPKEYSIG`. A chave oficial renovada de 2025,
com o mesmo fingerprint, produziu `GOODSIG` e `VALIDSIG`. O aviso `TRUST_UNDEFINED` refere-se
ao keyring temporário sem web of trust; o fingerprint foi comparado à
[publicação oficial MySQL](https://dev.mysql.com/doc/refman/26.7/en/checking-gpg-signature.html).

### 3.2. Identidade e configuração retornadas pelo servidor

Valores comuns aos três alvos: `version_comment=MySQL Community Server - GPL`,
`transaction_isolation=REPEATABLE-READ`, `time_zone=+00:00`, `system_time_zone=UTC`,
`character_set_server=utf8mb4`, `collation_server=utf8mb4_0900_ai_ci`, engine `InnoDB`.

`sql_mode` real em todos:

```text
ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION
```

| Variável                                   | 8.4.8 macOS                            | 26.7.0 macOS                           | 26.7.0 Oracle Linux                    |
| ------------------------------------------ | -------------------------------------- | -------------------------------------- | -------------------------------------- |
| `VERSION()`                                | 8.4.8                                  | 26.7.0                                 | 26.7.0                                 |
| `version_compile_os`                       | macos15                                | macos15                                | Linux                                  |
| `version_compile_machine`                  | arm64                                  | arm64                                  | aarch64                                |
| `lower_case_table_names`                   | 2                                      | 2                                      | 0                                      |
| Host / porta                               | 127.0.0.1:62810                        | 127.0.0.1:55483                        | 127.0.0.1:56093, dentro do guest       |
| Schema descartável                         | `tf_oci_f32674b8ca96_test`             | `tf_oci_3912b1300563_test`             | `tf_oci_2e0bdc75a43a_test`             |
| UUID                                       | `cc374644-c761-11f1-9133-89f221cea7d9` | `d162a3de-c761-11f1-94a9-86e6eff91374` | `daf9f5ab-c761-11f1-8062-525555f2a32f` |
| Propriedade e PID                          | Verificados                            | Verificados                            | Verificados                            |
| Acesso administrativo com usuário de teste | Negado                                 | Negado                                 | Negado                                 |
| Credencial incorreta                       | Rejeitada                              | Rejeitada                              | Rejeitada                              |

Schemas da aplicação foram criados em `utf8mb4_unicode_ci`, como registrado pelo validator
LR5; a collation de servidor acima não substitui a collation de cada objeto. UUID, datadir e
nonce independentes foram verificados antes de qualquer fixture. Não houve conexão a um
servidor existente, à porta 3306 local ou ao endpoint privado OCI.

## 4. Migrations e inventário SQL

**67/67** aplicadas a banco vazio nos três alvos por `prisma migrate deploy`, seguidas de
`migrate status`. A leitura de `_prisma_migrations` confirmou nomes, checksums SHA-256,
`finished_at` preenchido, nenhum `rolled_back_at`, zero pendências e zero falhas.
Hash da cadeia, calculado pelo runner sobre nome + SQL de cada migration ordenada:
`cc0e91a9b1185f5cead6e688e74881f5b6babcd9e69a0d1302fb9bfae7e693d6`.

Os 274 índices incluem 59 PRIMARY e 215 secundários. A estrutura inspecionada tem 116 FKs
com regras ON DELETE/ON UPDATE, seis CHECKs e a coluna gerada de Sprint. O validator de drift
aprovou a cadeia inteira, incluindo seu controle negativo de FK. Não houve baselining,
`db push`, reset ou edição de SQL histórico.

| Recurso real e arquivo de referência                                                                                                                      | Risco avaliado                                | Evidência / limite                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `DATETIME(3)`, JSON, ENUM e BOOLEAN em `prisma/schema.prisma` e migrations                                                                                | Médio: precisão, NULL, modo SQL               | Precisão `.123`, snapshots JSON, persistência de estados e CRUD reais; não é teste de todos os limites máximos de tipos.   |
| TEXT/MEDIUMTEXT de casos, execuções e defeitos em `20260907120000_s1_07_test_cases` e `20260908190000_s108_defect_foundation`                             | Baixo/médio: representação e tamanho          | Cadeia e suítes de qualidade aprovadas; limites máximos de tamanho não foram objeto de stress.                             |
| DOUBLE e esforço em `20260906120000_s1_06_task_time_entries`, `20260906150000_s1_06_half_hour_estimates` e `20260910120000_s1_06_preserve_legacy_effort`  | Médio: precisão e backfill                    | Valores fracionários/NULL e validators históricos aprovados.                                                               |
| CHECKs de Project, TestExecution, TestEvidence, Defect, DefectTask e DefectRetest                                                                         | Alto: integridade efetiva                     | Seis INSERTs e seis UPDATEs inválidos rejeitados em cada alvo, erro 3819 com nome correto.                                 |
| FKs e índices compostos de `SprintBurnupEvent`, memberships e rastreabilidade                                                                             | Alto: projeto, referências e exclusão         | Metadados, Cascade/Restrict/SetNull e FK composta entre projetos testados; BOLA e escopo também cobertos pela API.         |
| `Sprint.activeNameKey`, `20260905030000_sprint_active_name_uniqueness`                                                                                    | Alto: DDL dinâmica, geração e unicidade       | `PREPARE` executado pela migration; expressão CASE, STORED, duplicidade ativa recusada, nomes excluídos com NULL aceitos.  |
| `GitBranch.name`, `20260821120000_lr5_gitbranch_case_sensitive`                                                                                           | Alto: collation                               | `utf8mb4_bin`, variantes de caixa distintas, duplicata exata recusada e comparação correta.                                |
| CTE/UNION em `modules/traceability/requirement-projection-summary.repository.js`; UNION ALL em `modules/tasks/repositories/task-time-entry.repository.js` | Médio: SQL bruto e conjuntos                  | Probes e suítes de projeção/esforço aprovados.                                                                             |
| JSON_EXTRACT em `modules/privacy/privacy.repository.js`; TIMESTAMPDIFF em repositories de indicadores                                                     | Médio: privacidade, datas e agregação         | Query temporal/JSON controlada e suítes de privacidade/indicadores aprovadas.                                              |
| NOWAIT em `github-sync-run.repository.js` e `projects/active-project-write.js`                                                                            | Alto: progresso e fencing                     | Erro 3572 real, resposta rápida sob lock e contratos de scheduler aprovados.                                               |
| Serializable em `database/serializable-transaction.js`; transações dos repositories                                                                       | Alto: deadlock, retry, rollback               | Deadlock P2034 real recuperado pelo helper sem alterações; timeout P2028 com rollback; snapshot RepeatableRead preservado. |
| Backfills LR2/LR5/LR9, S2 e GitHub em `scripts/validate-*-migration.js`                                                                                   | Alto: dados anteriores e semântica de upgrade | Fixtures históricas sintéticas em schemas separados e identificados; nenhum dado real importado.                           |

Quatorze invocações executadas: LR5 audit, empty, LR5, LR9, LR2 legacy, S2-P1, S2-P3,
S2-P5.1, dashboard preference, task responsibility, GitHub sync padrão/liveness/actor e
schema drift. Os comandos e seus outputs completos estão nos JSONs de execução.

## 5. Prisma

Client e CLI **6.12.0** foram preservados. `validate`, `generate`, inicialização/conexão,
CRUD, relações, paginação, filtros, ordenação, agregação e transações passaram nas suítes
existentes. O Client continuou após prune; todos os probes finalizaram `$disconnect`.
Hash de versão do engine informado pelo Client:
`8047c96bbd92db98a2abc7c9323ce77c02c89dbc`.

O MySQL 26.7 não consta nominalmente na
[matriz de suporte v6 consultada](https://www.prisma.io/docs/orm/v6/reference/supported-databases).
Esta evidência cobre a baseline e os casos executados. Não implica certificação de todas
as funcionalidades MySQL/Prisma nem suporte oficial ao serviço HeatWave.

A aplicação usa o pool do engine; não fixa limites no construtor. API e worker separados
terão pools separados. `connection_limit`, `pool_timeout`, `connect_timeout` e orçamento
conjunto ainda precisam ser definidos e testados no contrato de produção. Não foi feito
benchmark de carga ou saturação de conexões.

## 6. ARM64, nativos e artefato

O guest executou **Linux ARM64 nativo via VZ**, sem emulação de ISA. Engine realmente
carregado após prune:

```text
.prisma/client/libquery_engine-linux-arm64-openssl-3.0.x.so.node
argon2/prebuilds/linux-arm64/argon2.armv8.glibc.node
```

Argon2id gerou hash, confirmou senha correta e rejeitou senha incorreta com parâmetros da
aplicação: memória 19456 KiB, timeCost 2, parallelism 1. `process.report` foi usado somente
para ler nomes de shared objects; o relatório de processo completo, que poderia conter
ambiente, não foi persistido.

Procedimento aprovado: código allowlisted → `npm ci` no guest → `prisma generate` → testes
→ `npm prune --omit=dev --ignore-scripts` → importar `src/app.js`, conectar Prisma e executar
Argon2 novamente. Vitest estava ausente no resultado. Nenhum `node_modules` macOS foi
transferido para Linux. O CLI Prisma pode continuar instalado por sua relação de peer
com o Client; remover cegamente seus engines quebraria o artefato.

Prisma/Argon2 são nativos do runtime. Rolldown 1.1.5, Lightning CSS 1.33.0 e fsevents 2.3.3
aparecem no tooling do backend; os lockfiles incluem variantes Linux dos dois primeiros e fsevents é opcional para Darwin.
A instalação e a suíte Linux passaram; não houve probe isolado de Lightning CSS. O frontend possui outro conjunto
de versões de tooling, inspecionado no lockfile; seu build Linux não foi executado nesta
entrega de artefato de backend. Os arquivos do browser não exigem engine Node em produção.
Pacotes podem conter prebuilds não utilizados de outras plataformas; a prova é da biblioteca
correta efetivamente carregada, sem afirmar que todos os prebuilds foram removidos.

Ainda não foram testados os serviços systemd, permissões de releases, Nginx, Cloudflare,
armazenamento persistente de uploads ou limites reais da VM OCI. A importação do grafo da API
não substitui esses gates operacionais.

## 7. Comparação MySQL

| Critério                          | 8.4.8 macOS ARM64                      | 26.7.0 macOS ARM64   | 26.7.0 OL9.8 ARM64   |
| --------------------------------- | -------------------------------------- | -------------------- | -------------------- |
| Migrations / ledger               | 67/67, PASS                            | 67/67, PASS          | 67/67, PASS          |
| CHECKs: INSERT / UPDATE inválidos | 6/6 + 6/6 rejeitados                   | 6/6 + 6/6 rejeitados | 6/6 + 6/6 rejeitados |
| Coluna gerada / nullable unique   | PASS                                   | PASS                 | PASS                 |
| Collation de branch               | utf8mb4_bin, PASS                      | utf8mb4_bin, PASS    | utf8mb4_bin, PASS    |
| Prisma e runtime após prune       | PASS                                   | PASS                 | PASS                 |
| FKs e relações                    | PASS                                   | PASS                 | PASS                 |
| CTE/UNION/JSON/temporal           | PASS                                   | PASS                 | PASS                 |
| Deadlock / retry Serializable     | P2034; 3 tentativas somadas, 2 commits | Igual                | Igual                |
| NOWAIT                            | P2010/3572, 1 ms                       | P2010/3572, 1 ms     | P2010/3572, 1 ms     |
| Lock timeout                      | P2010/1205, 1006 ms                    | P2010/1205, 1007 ms  | P2010/1205, 1006 ms  |
| Timeout transacional              | P2028, rollback                        | Igual                | Igual                |
| Suítes API/integração             | 833 PASS, 5 skips                      | 833 PASS, 5 skips    | 833 PASS, 5 skips    |
| TLS do Prisma local               | Cipher ausente                         | Cipher ausente       | Cipher ausente       |
| HeatWave / certificado gerenciado | Não executado                          | Não executado        | Não executado        |

Não foi executado MySQL 8.4.8 em Linux nesta entrega. A comparação entre versões foi feita
no mesmo macOS; a validação adicional de 26.7 em Linux elimina a dependência exclusiva de
resultado Darwin para o alvo principal.

Os fingerprints brutos macOS coincidem (`513e1b00…`); o Linux retornou `256c9a66…` porque a
ordenação de INFORMATION_SCHEMA colocou `_prisma_migrations` no final dos índices, em vez
do começo. **Todos os campos e todas as linhas são equivalentes após ordenar os arrays
por seu conteúdo completo**, preservando posições de colunas, nomes, regras e expressões.
O fingerprint canônico dos três é
`64fc2fa786d60e873c956a888a77cc45b05ca4c76a388b6c6c253ebed34cc93f`.
Não foi descartada diferença de DDL para obter essa igualdade.

Ver [comparison.json](evidence/oci-deploy-02/comparison.json). Para repetir a comparação
somente lendo as evidências:

```python
import json
from pathlib import Path
root = Path('docs/deliveries/evidence/oci-deploy-02')
structures = []
for path in sorted(root.glob('mysql-*.json')):
    report = json.loads(path.read_text())
    phase = next(p for p in report['phases'] if p['name'] == 'physical-and-semantic-contracts')
    structure = phase['result']['structure']
    structures.append({k: sorted(v, key=lambda row: json.dumps(row, sort_keys=True))
                       if isinstance(v, list) else v for k, v in structure.items()})
assert len(structures) == 3
assert all(s == structures[0] for s in structures)
```

## 8. Concorrência e GitHub Sync

E1–E9 reutilizaram os testes existentes de `github-automatic-sync.test.js`,
`github-sync-contention.test.js` e suítes transacionais/API relacionadas. E10 acrescentou
um experimento real, sem modificar o helper de produção. Não foram usadas instalações,
projetos, credenciais ou chamadas autenticadas reais do GitHub.

| Cenário                      | Evidência efetiva                                                                                     | Resultado nos três alvos |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------ |
| E1 reserva concorrente       | Duas instâncias disputam o mesmo projeto; uma execução ativa                                          | PASS                     |
| E2 manual × automático       | Ordem manual-primeiro e automático-primeiro                                                           | PASS                     |
| E3 projetos distintos        | Slots e limites globais de reservas                                                                   | PASS                     |
| E4 mesma instalação          | Exclusividade por instalação                                                                          | PASS                     |
| E5 lease/heartbeat expirados | Recuperação QUEUED/stale, preservação de run terminal                                                 | PASS                     |
| E6 fencing                   | Worker obsoleto, escritor pausado e artefatos persistentes                                            | PASS                     |
| E7 NOWAIT                    | Código SQL 3572 e sete operações sob lock de Project de 6,5 s; outro projeto permanece operacional    | PASS                     |
| E8 falha transacional        | Falha de reserva/schedule e persistência terminal; rollback e ausência de parcial                     | PASS                     |
| E9 exclusão lógica           | Fencing durante exclusão, restauração sem autoridade obsoleta                                         | PASS                     |
| E10 contenção real           | Duas transações bloqueiam linhas em ordem inversa; P2034, retry existente limitado, integridade final | PASS                     |

O probe E10 confirma um único deadlock, duas transações confirmadas e contador final 3 em
cada linha, sem contabilizar a escrita revertida. Também força lock timeout de 1 s, timeout
interativo de 100 ms com espera controlada e leitura RepeatableRead enquanto outra conexão
confirma alteração. Esses limites pertencem apenas às fixtures; os timeouts/retries da
aplicação não foram aumentados. Os nomes de todas as assertions e seus estados estão nos JSONs.

## 9. Segurança e preservação

- Nenhum dado de desenvolvimento ou produção foi alterado por esta execução.
- Nenhum schema, usuário, seed ou migration foi criado/executado no MySQL OCI.
- Nenhum recurso OCI foi criado/modificado; nenhum recurso pago foi provisionado.
- Dados foram exclusivamente sintéticos; `.env`, uploads reais e credenciais pessoais não
  foram copiados aos workspaces ou ao artefato.
- TEST_DATABASE_URL foi explícita para toda suíte persistente. O runner recusa DATABASE_URL
  externa, destino OCI/DEV, DNS, portas comuns, root e namespaces ambíguos.
- Nonce, UUID, PID e datadir comprovaram a propriedade antes das fixtures. As contas de teste
  tinham somente grants do prefixo temporário e falharam ao ler `mysql.user`.
- Credenciais efêmeras ficaram em memória/arquivos temporários protegidos; relatórios não
  contêm URL com senha, nonce ou senha root. Não houve exposição de credenciais.
- Todas as execuções que criaram servidores registraram `serverStopped=true` e
  `ownedDirectoryRemoved=true`. A VM descartável foi encerrada e removida.
- O working tree preexistente, migrations aplicadas e documentação acadêmica foram preservados.

O runner não é uma sandbox contra um operador malicioso: o pacote MySQL deve ser autenticado
antes da execução, conforme o runbook. SIGKILL do runner/queda do host pode impedir cleanup;
nessa situação a ferramenta não autoriza limpeza global de mysqld/datadirs.

## 10. HeatWave e TLS — pendente

**Compatibilidade demonstrada com MySQL Community 26.7.0 isolado** é distinta de
**compatibilidade ainda não homologada no HeatWave gerenciado**.

Nenhum valor real de certificado, plugin de autenticação, grants, max_connections,
require_secure_transport, cipher ou configuração do HeatWave foi consultado nesta entrega.
A versão 26.7.0 e o endpoint OCI permanecem informações fornecidas pelo usuário.

O [runbook](../runbooks/OCI_MYSQL_COMPATIBILITY.md#13-tls-e-heatwave-gate-separado) define a
estratégia: cadeia confiável, identidade DNS/IP válida, `sslaccept=strict`, CA protegida,
contas separadas de aplicação/migrations, testes negativos de certificado e orçamento
conjunto dos pools. Certificado do Nginx/Cloudflare não é certificado do MySQL.

Diferença administrativa confirmada na documentação: HeatWave mantém `partial_revokes`
habilitado, exige grants por nome completo e restringe alterações de tabelas de sistema e
variáveis globais. Portanto, o grant por prefixo usado no laboratório não deve ser copiado
para o serviço gerenciado. [Limitações oficiais](https://docs.oracle.com/en-us/iaas/mysql-database/doc/unsupported-features.html).

Também ficam pendentes manutenção/reconexão, limites de conexões e privilégios, certificados
service-defined/BYOC, backup/restauração e observabilidade sob o serviço. Oracle documenta
as opções de certificado e manutenção em
[Advanced Options](https://docs.oracle.com/en-us/iaas/mysql-database/doc/advanced-options.html).
Nenhum default permissivo de certificado deve ser aceito como solução definitiva.

Só existe um Always Free reservado para produção. Homologação destrutiva exige um ambiente
gerenciado separado, expressamente autorizado, com decisão humana sobre disponibilidade,
custo e credenciais. A ausência desse ambiente mantém este gate bloqueado; não autoriza
usar produção como laboratório.

## 11. Falhas, diferenças e correções do validador

Não foi encontrada incompatibilidade de aplicação que exigisse correção de negócio,
migration ou dependência. O histórico de tentativas foi preservado em
[attempts.json](evidence/oci-deploy-02/attempts.json).

| Ocorrência                                                 | Causa / arquivo                                          | Severidade e tratamento                                                                                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Bind de porta bloqueado pela sandbox                       | Ambiente local; runner                                   | Falha de ambiente. Reexecutado com permissão para listener local, sempre criando servidor novo. Diagnóstico passou a distinguir EPERM/EACCES.  |
| Serialização BigInt no primeiro probe 26.7                 | `oci-compatibility-probes.js`                            | Erro da ferramenta nova, sem incompatibilidade SQL. Conversão explícita na serialização; cleanup aprovado.                                     |
| Ordenação de nomes do ledger no primeiro 8.4               | `oci-compatibility-probes.js`                            | Erro da ferramenta: collation SQL versus ordenação JS para underscore. Comparação ordenada dos mesmos nomes; checksums continuaram exigidos.   |
| Sobrescrita de relatório existente identificada na revisão | `validate-oci-mysql-compatibility.js`                    | Corrigida antes da entrega: só assume propriedade do arquivo após criação exclusiva. Teste negativo confirma preservação do conteúdo anterior. |
| Formatação de arquivo novo                                 | Probe                                                    | Corrigida com Prettier; format check final aprovado.                                                                                           |
| Cinco testes legados ignorados                             | Suites pré-LR.2 já existentes                            | Não se aplicam ao schema atual; não foram habilitados artificialmente nem contados como PASS. Validators históricos foram executados.          |
| Fingerprint bruto diferente no Linux                       | Ordenação de linhas INFORMATION_SCHEMA                   | Diferença aceitável de apresentação; comparação integral normalizada provou equivalência.                                                      |
| Codesign macOS e chave GPG antiga expirada                 | Ferramentas/procedência                                  | Não contornados. GPG dos pacotes validado com chave oficial renovada; codesign não aprovado. Sem impacto demonstrado no runtime Linux.         |
| TLS/HeatWave                                               | Ambiente gerenciado indisponível para testes autorizados | Bloqueador de homologação de produção, sem alteração nesta entrega.                                                                            |

Na revisão final também foi protegido o encerramento do primeiro Client se a autenticação
da segunda conexão do probe falhar. Um teste unitário confirma desconexão sem iniciar
fixtures ou cleanup SQL. Essa correção de falha na inicialização foi feita após as suítes
persistentes; os cenários SQL dessas suítes não foram alterados. Os 38 testes unitários
finais passaram em uma cópia sem `.env`.

Após revisar a cobertura, acrescentaram-se deadlock real e INSERTs inválidos aos CHECKs.
As execuções completas foram repetidas em instâncias novas para validar essas alterações
no próprio ferramental. Não houve repetição automática de teste de produto até obter verde,
redução de assertions, retries adicionais no scheduler ou alteração de migrations.

Os cinco skips, em cada alvo, são quatro casos de
`test/integration/e11-legacy-responsibility.test.js` e um de
`test/integration/e6-backfill.test.js`, condicionados à existência do schema pré-LR.2.
O JSON preserva os nomes individuais.

## 12. Gates e evidências

| Gate / comando                                                                                                           | Resultado                            | Contagem / limite                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Runner completo, `node scripts/validate-oci-mysql-compatibility.js --mysql-base ... --expected-version ... --report ...` | PASS nas fases locais dos três alvos | Cada execução tem identidade, versões, timestamps e cleanup. Classificação global permanece PARTIAL/BLOCKED. |
| Prisma `validate` / `generate`                                                                                           | PASS                                 | Nos workspaces sem `.env`, Prisma 6.12.0.                                                                    |
| Prisma `migrate deploy` / `status` + ledger                                                                              | PASS                                 | 67/67 por alvo, 0 pendentes/falhas/checksums divergentes.                                                    |
| Validators históricos e schema drift                                                                                     | PASS                                 | 14 invocações por alvo; inclui controle negativo de drift.                                                   |
| `vitest run test/api test/integration --reporter=json`                                                                   | PASS com skips declarados            | 833 aprovados, 0 falhas, 5 skips de 838 testes por alvo.                                                     |
| `vitest run test/unit/oci-mysql-compatibility.test.js test/unit/serializable-transaction.test.js`                        | PASS                                 | 38 testes, 0 skips, 0 falhas; 35 dos guards novos e 3 do helper existente. Sem queries persistentes.         |
| `eslint src test scripts vitest.config.js`                                                                               | PASS                                 | Backend; novo probe de INSERT também verificado após sua adição.                                             |
| `prettier --check` nos JS/package.json do backend                                                                        | PASS                                 | Ajuste inicial no arquivo novo corrigido.                                                                    |
| `node scripts/check-architecture.js`                                                                                     | PASS                                 | Nenhuma violação.                                                                                            |
| `node scripts/check-secrets.js`                                                                                          | PASS                                 | 642 arquivos na execução registrada; evidências sanitizadas revisadas separadamente.                         |
| `node scripts/check-npm-audit.mjs <copia-do-projeto> docs/security/npm-audit-exceptions.json`                            | PASS, backend e frontend             | 0 high, 0 critical, 0 exceções; manifests/lockfiles isolados, sem configs npm pessoais.                      |
| Comparação de estrutura completa                                                                                         | PASS                                 | 3 estruturas equivalentes; nenhuma coluna/regra descartada.                                                  |
| HeatWave/TLS e operação OCI                                                                                              | NÃO EXECUTADO                        | Nenhum resultado local foi usado para declarar aprovação gerenciada.                                         |
| Coverage total / build frontend / CI remota / testes de carga                                                            | NÃO EXECUTADO nesta entrega          | Sem mudanças de runtime/frontend/CI; não se declarou execução desses gates.                                  |

Evidências finais completas:

- [MySQL 8.4.8 macOS ARM64](evidence/oci-deploy-02/mysql-8.4.8-macos-arm64.json).
- [MySQL 26.7.0 macOS ARM64](evidence/oci-deploy-02/mysql-26.7.0-macos-arm64.json).
- [MySQL 26.7.0 Oracle Linux 9.8 ARM64](evidence/oci-deploy-02/mysql-26.7.0-oracle-linux-9.8-arm64.json).
- [Comparação](evidence/oci-deploy-02/comparison.json),
  [auditoria de dependências](evidence/oci-deploy-02/dependency-audit.json),
  [procedência](evidence/oci-deploy-02/provenance.json),
  [testes unitários](evidence/oci-deploy-02/unit-tests.json),
  [gates finais](evidence/oci-deploy-02/gates.json) e
  [histórico de tentativas](evidence/oci-deploy-02/attempts.json).

Os testes de aplicação foram executados em cópias isoladas com o mesmo código da baseline
mais o ferramental novo. Não foram executados contra o `.env` ou banco persistente do checkout.

## 13. Decisões e próxima entrega

1. **Prisma:** manter 6.12.0 para a próxima avaliação; não houve necessidade comprovada de
   upgrade por compatibilidade. Registrar o risco residual de suporte oficial não explícito
   a 26.7 e repetir a matriz após qualquer upgrade.
2. **Migrations:** manter as 67 intactas. Aplicação local em vazio e validators históricos
   passaram; produção exige autorização própria, backup/restauração comprovados, usuário
   DDL dedicado e revisão da identidade/configuração do alvo.
3. **Homologação gerenciada:** decidir se haverá ambiente HeatWave separado e qual orçamento.
   Não criar recursos pagos nem schemas de teste na instância de produção automaticamente.
4. **Conexão segura:** definir certificado/CA/hostname, strict TLS, contas, pools e timeouts;
   exigir testes positivos e negativos antes de liberar migrations ou runtime em produção.
5. **Operação:** preparar contrato de ambiente e runtime, serviços API/Worker e releases em
   uma entrega própria; esta execução não validou implantação, rollback operacional ou carga.

Próxima entrega recomendada para revisão e autorização explícita:
**OCI-DEPLOY-03 — Production Environment Contract & Runtime Preparation**, mantendo o gate
HeatWave pendente até uma decisão específica. Nenhuma etapa OCI-DEPLOY-03 foi iniciada.

**OCI-DEPLOY-02 — PARTIAL / BLOCKED:** compatibilidade local MySQL 26.7 e Linux ARM64
comprovada no alcance descrito; homologação HeatWave/TLS gerenciada ainda pendente.
