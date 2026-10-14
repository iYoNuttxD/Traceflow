# PR23-FIX-04 — Incidente e recuperação do banco de desenvolvimento

## Causa e responsabilidade

Não havia autorização para apagar o banco de desenvolvimento. O teste novo
`backend/test/api/dashboard-failure-isolation.test.js` importava repositories antes de
`configureTestDatabaseEnvironment()`. O Prisma já havia inicializado a conexão com `traceflow`;
alterar `DATABASE_URL` depois não redirecionou esse cliente. `cleanTestDatabase` verificava a
URL configurada, mas não o schema efetivo da conexão, e executou a limpeza em desenvolvimento.
A responsabilidade pela introdução e execução desse teste foi do agente.

## Recuperação autorizada e executada

- Autorização do usuário: “recupere os dados perdidos agora”.
- Alvo: MySQL local, schema `traceflow`; nenhum reset, truncate ou recriação desse schema.
- Origem: `binlog.000015`, transação de 06/10/2026 às 18:44:45–18:44:46, America/Sao_Paulo.
- Posições: início `181661297`, evento de commit `183079284`.
- `binlog_row_image=FULL`: imagens completas anteriores às exclusões disponíveis.
- Foram selecionadas as primeiras imagens anteriores por chave primária, incluindo UPDATEs
  causados por exclusões em cascata. Não foram fabricados dados por seed.
- Ensaio isolado: `traceflow_recovery_20261006_v2`; uma tentativa anterior incompleta ficou
  separada em `traceflow_recovery_20261006`, sem uso como fonte da recuperação final.
- Restauração de desenvolvimento confirmada às 19:29:14 de 06/10/2026, America/Sao_Paulo.

## Resultado verificado

**10.651 linhas restauradas em 54 tabelas.** Entre elas:

| Entidade | Linhas |
| --- | ---: |
| Projetos | 13 |
| Usuários | 52 |
| Requisitos | 13 |
| Tarefas | 47 |
| Movimentações de tarefas | 79 |
| Sprints | 15 |
| Vínculos Sprint/Tarefa | 57 |
| Eventos históricos de Burnup | 81 |
| Commits | 562 |
| Vínculos Commit/Branch | 3.530 |
| Pull Requests | 63 |
| Eventos de lifecycle de PR | 43 |
| Casos de teste | 16 |
| Execuções de teste | 32 |
| Defeitos | 9 |
| Eventos de auditoria | 4.888 |

A reprodução utilizou imagens binárias nativas, preservando IDs, campos, datas, relações e
snapshots. Os bytes de todos os campos das 10.651 linhas do ensaio foram comparados aos
before-images originais: correspondência completa. O dump ordenado dos dados restaurados em
`traceflow` foi idêntico ao do ensaio verificado. Foram conferidas 116 relações de chave
estrangeira em desenvolvimento: **zero referências ausentes**.

SHA-256 do dump dos dados recuperados:
`688eebc8fa088a4a0f13580bf17f4b05848ba4572dbc45eb96f4792878fdf84c`.

## Registros criados depois do incidente

Um novo login após a exclusão criou sete registros: uma conta, uma identidade GitHub, uma
sessão, um estado OAuth e três eventos de auditoria. A identidade GitHub conflitou com a
original; a tentativa de restauração foi revertida atomicamente.

Os sete registros foram preservados no schema `traceflow_postincident_20261006` e em dump
privado. Somente essas chaves identificadas foram retiradas de `traceflow`, na mesma transação
que restaurou as linhas originais. Nenhuma exclusão global foi usada na recuperação. A sessão
criada após o incidente ficou no arquivo separado; pode ser necessário autenticar novamente.

## Arquivos privados de recuperação

Backup persistente, já ignorado pelo Git:
`backend/.local/database-recovery-20261006/`.

Contém a transação original, binlog de reposição, manifest de contagens, verificações,
dump anterior à recuperação e `recovered-development-data.sql`. Diretório com permissão
`0700`; arquivos com `0600`. Valores de linhas, cookies e credenciais não foram publicados.
Há também uma cópia de trabalho em `/private/tmp/traceflow-recovery-20261006/`.

## Bloqueio da causa imediata

- Repositories do teste novo passam a ser importados dinamicamente após configurar o alvo.
- `cleanTestDatabase` exige `NODE_ENV=test` e consulta `SELECT DATABASE()` na mesma
  transação das exclusões. Qualquer schema diferente de `TEST_DATABASE_URL` bloqueia a limpeza.
- 12 testes de proteção passaram com Node 22.23.3, usando apenas clientes simulados. Incluem
  variável apontando para testes com cliente conectado em desenvolvimento: nenhuma exclusão.
- Testes com acesso real ao banco e ensaios de volume não foram retomados após a recuperação.
- Nenhum commit/push ou mudança de schema do banco de desenvolvimento foi executado.

## Estado da entrega original após a recuperação, antes da revalidação

**Recuperação dos dados apagados: concluída e verificada.**

PR23-FIX-04 permanece **CHANGES REQUIRED — BLOCKING / DATABASE / REGRESSION**. O PASS de
segurança de execução não pode ser inferido dos gates que causaram este incidente.

## Reforço após a solicitação de impedir recorrência

- O cliente Prisma em `NODE_ENV=test` agora fixa `datasourceUrl` na construção, usando
  exclusivamente `TEST_DATABASE_URL` validada. Ausência ou destino inválido interrompe a
  inicialização antes de construir o cliente; imports antecipados não herdam mais o datasource
  de desenvolvimento. A validação de URLs é compartilhada pelo runtime e pelos scripts.
- O benchmark exige `--apply` antes de inicializar o acesso ao banco. A limpeza verifica,
  na mesma transação, schema conectado, IDs válidos e propriedade do projeto/usuário pelo
  identificador exclusivo da execução. Escopo ausente ou propriedade divergente bloqueia
  todas as exclusões.
- Os validadores de migrations foram inspecionados estaticamente: os caminhos de DROP
  identificados referem-se a schemas temporários cuja criação teve sucesso na própria execução.
  Nenhum desses validadores foi executado nesta revisão.
- **40 testes passaram com Node 22**, todos usando clientes simulados ou recusa do benchmark
  antes da conexão. Cobrem import antecipado, alvo ausente/inválido, cliente conectado ao schema
  errado, escopo indefinido e fixtures de outra execução. Lint dos arquivos afetados e architecture
  check passaram. Esta revisão não executou exclusões reais nem revalidou a suíte full com banco.

## Encerramento após revalidação isolada — 06/10/2026

Após o pedido explícito de concluir PR23-FIX-04, os gates foram reexecutados em um schema novo:
`traceflow_pr23_fix04_test_20261006`. Foi usada credencial com permissão somente nesse schema,
sem acesso a `traceflow`; uma leitura real de desenvolvimento foi recusada antes e depois dos
gates. Nenhuma credencial privilegiada foi entregue aos processos de teste. O datasource
implícito também foi isolado, apontando para um schema inexistente com a credencial restrita.

Passaram 1.683 testes backend (cinco skips legados), 1.409 frontend, coverage, lint, format,
build, Prisma, architecture, validação local de CI e security/audit completo sem vulnerabilidades.
O ensaio HTTP com 5.000 Tasks/20.000 TaskMovements e cinco requests simultâneas passou no
schema isolado; sua limpeza removeu somente as fixtures da própria execução.

O dump privado de `traceflow` antes/depois dessa revalidação foi byte-for-byte idêntico:
SHA-256 `7ccad6b521ca32d6ea6ee34ad82b4ce53c427d42b215022869427ec510db901e`.
Os dados de desenvolvimento foram preservados nesta retomada. Os backups de recuperação e
os schemas de ensaio anteriores foram mantidos; nenhum foi removido para encerrar a entrega.

O bloqueio de execução segura e a pendência Quality foram encerrados com evidência nova,
registrada no [relatório final FIX-04](PR23_FIX_04_DASHBOARD_PERFORMANCE_FAILURE_ISOLATION_REPORT.md).
**PR23-FIX-04: PASS LOCAL após revalidação.** Este encerramento não altera os fatos nem o
veredito da execução anterior que causou o incidente. Sem commit/push ou início do FIX-05.
