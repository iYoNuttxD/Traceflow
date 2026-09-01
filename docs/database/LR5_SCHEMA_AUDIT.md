# LR.5 — Auditoria do schema Prisma e MySQL

## Escopo e método

- baseline: `daniel-dev`, SHA `5b6c733464bc8f0af436faaba38fc1032cc86cc8`, 37 migrations;
- banco de desenvolvimento observado: MySQL `9.7.1`, schema `traceflow`;
- banco de CI declarado: MySQL `8.4.8` em `.github/workflows/ci.yml`;
- fontes: `schema.prisma`, cadeia SQL imutável, `SHOW CREATE TABLE`,
  `INFORMATION_SCHEMA.COLUMNS|STATISTICS|REFERENTIAL_CONSTRAINTS` e `prisma migrate diff`;
- dados emitidos: somente DDL, nomes estruturais e contagens sanitizadas.

O preflight encontrou 25 branches, 25 identidades exatas, 25 identidades ignorando caixa, zero
duplicata exata e zero grupo com variante de caixa. A coluna física ainda usava
`utf8mb4_unicode_ci`; portanto, a migration era necessária e não havia dado incompatível.

## Divergências e decisões

| Tabela | Campo | Prisma | Banco | Decisão |
|---|---|---|---|---|
| `GitBranch` | `name` | `String @db.VarChar(191)`; Prisma não modela collation por campo | antes `VARCHAR(191) utf8mb4_unicode_ci`; depois `VARCHAR(191) utf8mb4_bin` | `CORRIGIR`: migration incremental LR.5; preservar caixa e índice único `(projectId,name)` |
| `GitBranch` | `projectId_name` | `@@unique([projectId,name])` | unique key `GitBranch_projectId_name_key` | `OK`: passa a comparar `name` pela collation binária da coluna |
| `GitHubIdentityTombstone` | fingerprint único | `@unique(map: "GitHubIdentityTombstone_fingerprint_key")` | índice já possuía esse nome desde LR.4 | `CORRIGIR`: mapear o nome físico, sem migration ou rename |
| `ProjectMembership` | identidade e autorização | unique `(projectId,userId)`; índices de papel/estado e usuário/estado | tipos, unique, índices e FKs equivalentes | `OK` |
| `ProjectInvitation` | projeto e atores | FKs obrigatórias/optativas conforme lifecycle | cascata no projeto; atores preservados ou anulados conforme schema | `OK` |
| `GitHubIdentity` | `userId` | relação 1:1, unique e cascade | FK/unique equivalentes | `OK` |
| `ProjectGitHubIntegration` | projeto/repositório | `projectId` e `githubRepositoryId` únicos; instalação opcional | unique/FKs equivalentes; instalação usa `SET NULL` | `OK` |
| `GitHubSyncRun` | exclusão mútua | `activeProjectId @unique`; índices por projeto/status/solicitante | índices equivalentes | `OK` |
| `AuditEvent` | ator/projeto histórico | FKs opcionais com `SET NULL`; índices temporais | regras físicas equivalentes | `OK` |
| enums LR.3/LR.4 | installation/OAuth | valores canônicos do schema | enums expandidos, convertidos e contraídos pelas migrations | `OK` |
| collation padrão | strings comuns | não expressa no Prisma | schema usa `utf8mb4_0900_ai_ci`; tabelas históricas usam `utf8mb4_unicode_ci` | `DOCUMENTAR`: somente `GitBranch.name` exige comparação case-sensitive nesta entrega |

Após as correções, `prisma migrate diff` retornou somente `-- This is an empty migration.`.
Nenhuma divergência de tipo, tamanho, default, enum, FK, índice ou cascade ficou pendente nas
estruturas auditadas.

## Integridade referencial

A auditoria física contou 14 FKs nas tabelas críticas selecionadas e zero órfão em:

- membership → usuário/projeto;
- invitation → projeto;
- GitHub identity → usuário;
- integração/branch → projeto;
- CommitBranch → commit/branch.

Também encontrou zero projeto não excluído sem OWNER ativo. O banco rejeitou uma membership com
usuário inexistente (`P2003`). A criação canônica de projeto e OWNER ocorre na mesma transação;
ao forçar uma FK de OWNER inválida, a criação do projeto foi integralmente revertida. A garantia
de “ao menos um OWNER” é um invariante agregado, protegido pelos services e por transações
serializáveis; MySQL não possui constraint declarativa diferível capaz de expressar esse agregado
sem introduzir trigger ou fonte paralela de ownership, opções rejeitadas por violarem a separação
entre domínio e migration.

## Índices e consultas críticas

Foram inspecionadas 113 definições secundárias e não houve definição exatamente duplicada.
Nenhum índice novo foi criado: a evidência das consultas já está coberta por estruturas existentes.

| Fluxo | Predicado/ordenação dominante | Índice utilizado | Decisão |
|---|---|---|---|
| autorização/membership | projeto+usuário; projeto+papel+ativo; usuário+ativo | unique e dois índices de `ProjectMembership` | manter |
| convite | projeto+e-mail e ordenação por criação | `(projectId,email,createdAt)` e índices simples de prazo/projeto | manter; sem workload que justifique índice maior |
| GitHub sync | execução ativa por projeto e histórico por projeto/data | unique `activeProjectId`, `(projectId,createdAt)`, `(status,updatedAt)` | manter |
| branch | projeto+nome exato; projeto+estado/default | unique `(projectId,name)` e dois índices de estado | manter; somente collation corrigida |
| rastreabilidade | projeto+hash, links por branch/commit e projeto+datas | uniques e índices canônicos de Commit/CommitBranch | manter |
| auditoria | ator/projeto/ação por instante e retenção | quatro índices de `AuditEvent` | manter |

## Concorrência e transações

- membership, convite e access code usam transação `Serializable`;
- o helper repete somente `P2034`, com máximo de três tentativas; nenhum erro Prisma genérico é
  repetido;
- sync usa unique nullable `activeProjectId`, claim condicional e stale recovery;
- privacy revalida request, usuário e último OWNER dentro da transação serializável;
- criação de projeto, OWNER e integração ocorre atomicamente;
- testes concorrentes já cobrem duas despromoções de OWNER, convite/aceite duplicado, movimento de
  tarefa, webhook e sync.

## Migrations e guards

As 37 migrations da baseline não foram modificadas. A migration 38 somente altera a collation de
uma coluna e não contém `DROP`, `DELETE`, backfill ou normalização de nomes. Os contracts E8/LR.2
continuam com guards antes dos `DROP`s; o validador LR.2 confirmou que dado incompatível bloqueia
e é preservado. Erros brutos de migrations históricas continuam identificáveis pelos nomes das
tabelas de guard; a classificação operacional sanitizada e acionável fica nos validadores e no
runbook, sem editar o SQL histórico.

## Parecer

`CORRIGIR`: 2 itens, ambos corrigidos. `DOCUMENTAR`: 1 propriedade física deliberada. Demais
itens: `OK`. Estado final observado: `SCHEMA_CONSISTENT`.
