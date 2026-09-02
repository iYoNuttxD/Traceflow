# LR.5 — Banco, migrations, consistência e hardening operacional

## Baseline

- branch: `daniel-dev`;
- SHA inicial: `5b6c733464bc8f0af436faaba38fc1032cc86cc8`;
- working tree inicial: limpa;
- migrations iniciais: 37;
- banco de desenvolvimento auditado: MySQL `9.7.1`, 25 branches canônicas;
- runtime de validação: Node.js `v22.23.2`;
- nenhuma migration histórica, TCC, commit, push, merge, rebase, reset, stash ou PR foi alterada.

## Decisões aplicadas

```text
Branch names preservam a caixa original.
Database representa Git fielmente.
Migrations históricas são imutáveis.
Constraints do banco são a autoridade de unicidade e integridade referencial.
Retry transacional é limitado exclusivamente a P2034.
```

`GitBranch.name` passou de `utf8mb4_unicode_ci` para `utf8mb4_bin`. A mudança amplia o conjunto
de nomes representáveis e não normaliza, mescla ou reescreve dados. A tabela mantém sua collation
padrão histórica; apenas a coluna cuja semântica vem do Git usa comparação binária.

## Findings tratados

| ID | Problema | Correção | Testes |
|---|---|---|---|
| LR5-01 | unique `(projectId,name)` comparava nomes de branch sem diferenciar caixa | migration incremental muda somente `GitBranch.name` para `utf8mb4_bin`; preflight sanitizado | três variantes de caixa em criação, busca, filtro, sync e três vínculos de traceability |
| LR5-02 | Prisma não representava a collation física e sugeria rename do índice LR.4 | tipo nativo documentado; índice tombstone mapeado ao nome físico existente; auditoria por `SHOW CREATE`/`INFORMATION_SCHEMA` | `migrate diff` vazio após correção |
| LR5-03 | cadeia vazia não provava upgrade com dados | validador cria bancos temporários pré-LR.5 populado e histórico, migra e compara contagens | vazio, populado e histórico `PASS`, sem reset |
| LR5-04 | contracts destrutivos precisavam permanecer bloqueantes | migrations históricas preservadas; validador LR.2 continua semeando incompatibilidade e confirma bloqueio antes dos `DROP`s | guard LR.2 e recovery LR.2.1 `PASS` |
| LR5-05 | FKs, órfãos e ownership precisavam de evidência física | auditoria de 14 FKs selecionadas e oito consultas de órfãos; criação Project+OWNER atômica | zero órfão, zero projeto sem OWNER; FK P2003 e rollback do projeto sem owner |
| LR5-06 | índices não tinham consolidação LR.5 | 113 definições secundárias auditadas contra consultas críticas | zero definição exatamente duplicada; nenhum índice especulativo criado |
| LR5-07 | concorrência/retry precisavam permanecer restritos | preservados `Serializable`, retry de até 3 somente para `P2034`, uniques/claims de convite, sync e privacy | suites de concorrência existentes e 411 testes backend `PASS` |
| LR5-08 | CI aplicava migrations, mas não exercitava os três estados nem contract | workflow ganhou empty chain, upgrade LR.5, guard LR.2 e audit físico; política CI exige os comandos | política CI 6/6 `PASS` |
| LR5-09 | scripts de manutenção não estavam classificados em uma entrega única | inventário abaixo e execução de todos os fluxos ativos/recovery em audit/dry-run | zero script quebrado ou apontando silenciosamente para modelo removido |

## Migration e preflight

- migration nova: `20260821120000_lr5_gitbranch_case_sensitive`;
- migration final: 38 de 38 em desenvolvimento e teste;
- preflight real anterior: 25 branches, 25 exatas, 25 folded, zero duplicata exata, zero
  grupo com variantes e zero órfão;
- decisão anterior: `MIGRATION_REQUIRED`;
- auditoria posterior: `utf8mb4_bin`, 25/25 registros preservados e
  `SCHEMA_CONSISTENT`;
- nenhum `DROP`, `DELETE`, backfill ou transformação de nome foi usado.

## Validação de evolução

| Cenário | Fixture | Resultado |
|---|---|---|
| A — vazio | banco temporário sem dados + 38 migrations | `PASS`; zero registros residuais |
| B — populado | User, Project/OWNER, Requirement, Task, Commit/Branch, GitHub integration e privacy | `PASS`; todas as contagens antes/depois iguais; três variantes e links preservados |
| C — histórico | branch inativa/reativada, commit/link, convite, deletion request e integração `RECONNECT_REQUIRED` | `PASS`; estado e contagens preservados |
| contract incompatível | `ProjectMember` artificial não reconciliado pré-LR.2 | `PASS`; migration bloqueada antes da contração e dado preservado |
| recovery histórico | estado imediatamente pré-LR.2 e caso irresolúvel | `PASS`; recovery atômico/idempotente e contract posterior válido |

Todos os bancos usados pelos validadores tinham nomes estritamente reconhecidos como teste,
foram criados para a execução e removidos ao final. Nenhum banco existente foi resetado.

## Auditorias

### Schema e collation

O relatório detalhado está em `docs/database/LR5_SCHEMA_AUDIT.md`. `SHOW CREATE TABLE GitBranch`
confirmou `VARCHAR(191) COLLATE utf8mb4_bin`, unique `(projectId,name)`, dois índices de estado e FK
`ON DELETE/UPDATE CASCADE`. O diff Prisma/MySQL final é vazio.

### Integridade

- 14 FKs nas tabelas críticas selecionadas;
- zero órfão nas oito relações verificadas;
- zero projeto não excluído sem OWNER ativo;
- membership sem usuário rejeitada pela FK;
- falha ao criar OWNER reverteu também o Project na mesma transação;
- snapshots históricos com `SET NULL` permanecem deliberados e documentados.

### Performance

Não houve evidência para índice novo. Os índices atuais cobrem autorização, membership, branch,
sync, traceability e audit conforme os predicados efetivos. Não há índice secundário com definição
exatamente duplicada no banco auditado.

### Concorrência

Membership, invitation, access code e privacy usam transações serializáveis nos invariantes
críticos. O helper central repete somente `P2034`, no máximo três vezes. Sync usa unique
`activeProjectId`, claim condicional e stale detection. Não existe retry genérico de erro Prisma.

## Inventário de scripts

| Script | Classe | Motivo/estado atual |
|---|---|---|
| `backfill-e6-memberships.js` | `RECOVERY` | pré-LR.2; retorna `N/A LR2_CONTRACT_APPLIED` no schema atual |
| `check-architecture.js` | `ACTIVE` | gate arquitetural |
| `check-secrets.js` | `ACTIVE` | gate de segredos, incluindo placeholders CI controlados |
| `cleanup-auth-records.js` | `ACTIVE` | retenção operacional, dry-run por padrão |
| `e11-legacy-responsibility-audit.js` | `RECOVERY` | pré-LR.2; `N/A` explícito no schema atual |
| `e11-reconcile-legacy-responsibilities.js` | `RECOVERY` | pré-LR.2; não acessa coluna removida no schema atual |
| `e8-contract.js` | `RECOVERY` | valida/contrai somente baselines E8; no schema atual confirma ausência |
| `e8-reconcile.js` | `RECOVERY` | reconciliação E8, dry-run seguro e zero pendência atual |
| `e8-schema-audit.js` | `RECOVERY` | auditoria de estruturas E8 com detecção de tabela ausente |
| `lr2-legacy-recovery.js` | `RECOVERY` | recovery canônico pré-contract; `ALREADY_CANONICAL` atual |
| `privacy-retention.js` | `ACTIVE` | manutenção de retenção, dry-run por padrão |
| `process-account-deletions.js` | `ACTIVE` | processor LR.4, dry-run por padrão |
| `test-database.js` | `ACTIVE` | deploy/status protegido por `TEST_DATABASE_URL` |
| `validate-empty-migrations.js` | `ACTIVE` | cenário A da cadeia completa |
| `validate-lr2-legacy-migration.js` | `ACTIVE` | contract guard obrigatório na CI |
| `validate-lr2-recovery.js` | `RECOVERY` | prova E2E do recovery LR.2.1 |
| `lr5-schema-audit.js` | `ACTIVE` | preflight/audit físico e sanitizado |
| `validate-lr5-migration.js` | `ACTIVE` | cenários B/C, integridade e case sensitivity |

Não há script `ONE_TIME`, `DEPRECATED` ou `REMOVE` remanescente. Ferramentas recovery não fazem
parte do runtime HTTP e encerram explicitamente quando a estrutura histórica não existe.

## Gates finais

Todos os gates finais abaixo usaram Node.js `v22.23.2`.

| Gate | Resultado |
|---|---|
| Prisma format/validate/generate | `PASS` |
| migrate status desenvolvimento/teste | `PASS`; 38 migrations |
| Prisma/MySQL diff | `PASS`; migration vazia |
| schema audit desenvolvimento/teste | `PASS`; `SCHEMA_CONSISTENT` |
| vazio/populado/histórico/contract/recovery | `PASS` |
| backend lint/format/architecture | `PASS` |
| backend unit | `PASS`; 37 arquivos, 247 testes |
| backend integration/API | `PASS`; 14 arquivos/164 testes; 2 arquivos/5 testes históricos `N/A` |
| backend integral | `PASS`; 51 arquivos/411 testes; 2 arquivos/5 testes históricos `N/A` |
| backend coverage | `PASS`; 88,83% statements, 75,39% branches, 92,54% functions, 91,37% lines |
| frontend lint/format/test/build | `PASS`; 34 arquivos/205 testes; 381 módulos no build |
| frontend coverage | `PASS`; 61,04% statements, 59,00% branches, 52,27% functions, 62,27% lines |
| política CI | `PASS`; 6 testes |
| backend/frontend npm audit | `PASS`; zero vulnerabilidades |
| secret scan | `PASS` |
| `git diff --check` | `PASS` |

O ambiente local não possui Docker; por isso a imagem MySQL `8.4.8` declarada na CI não foi
instanciada fora do workflow nesta execução. A CI foi fortalecida para executar todos os cenários
com essa versão quando a branch for publicada; nenhuma ação remota foi autorizada ou realizada.
Isso não substitui a evidência local obtida no MySQL real `9.7.1`.

## Resultado

**LR.5 CONCLUÍDA — PRONTO PARA LR.6.**
