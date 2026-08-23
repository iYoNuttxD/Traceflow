# LR.2.1 — Fechamento do recovery da consolidação de legado

## Baseline

- Branch: `daniel-dev`.
- SHA inicial: `a024d521883478fc103c0bb4513f25221ca04ad3`.
- Working tree inicial: limpa.
- Escopo: somente recovery de pessoa/movimento pré-LR.2 e correção do gate de whitespace.
- Nenhuma migration histórica, inclusive
  `20260820120000_lr2_contract_legacy_consolidation`, foi alterada.

## Finding

O guard LR.2 bloqueia qualquer linha em `ProjectMember` e qualquer
`TaskMovement.projectMemberId` não nulo. Os fluxos históricos E6/E11 conseguiam materializar
parte do estado canônico, mas não eliminavam esses dois resíduos. Assim, o recovery documentado
antes da LR.2.1 não desbloqueava o contract em uma base populada.

Também foi confirmado que a evidência anterior de `git diff --check: PASS` era inconsistente: a
auditoria LR.2 continha trailing whitespace nas linhas de data e branch.

## Causa raiz

E6 tinha responsabilidade de expand/backfill de `User` e `ProjectMembership`; E11 conciliava
atores e responsabilidades. Nenhum deles era dono da contração final de `ProjectMember` e
`projectMemberId`. O runbook os apresentava como recovery suficiente, embora os guards exigissem
ausência física da linha e nulificação da referência.

## Correção

- `scripts/lr2-legacy-recovery.js`: interface operacional, dry-run por padrão e apply explícito
  protegido para desenvolvimento/produção.
- `scripts/lib/lr2-legacy-recovery.js`: inspeção SQL do schema histórico, resolução determinística
  por e-mail normalizado, equivalência estrita de papel/estado, criação apenas de membership
  ausente, reconciliação de `movedByUserId`, nulificação da referência e remoção posterior.
- Apply atômico: qualquer irresolúvel produz `BLOCKED` antes de escrever; mudanças observadas
  durante a execução abortam a transação.
- Preflight pós-recovery: repete as contagens conceituais dos quatro guards LR.2 para
  `ProjectMember`, `projectMemberId`, branch de commit sem link e alias GitHub não materializável;
  somente zero em todas produz `SAFE_TO_CONTRACT`.
- O script não cria `User`, não infere por nome e não sobrescreve membership ou ator canônico
  divergente. Esses casos permanecem `UNRESOLVED_LEGACY_DATA` por categoria sanitizada.
- E6/E11 permanecem como ferramentas históricas; a nova responsabilidade não foi acoplada ao
  runtime HTTP e não existe dual-write.

O recovery deve ser executado com writes da aplicação suspensos e backup verificado.

## Cenários testados

| Cenário | Preflight inicial | Recovery | Contract | Resultado |
| --- | --- | --- | --- | --- |
| legado reconciliável imediatamente pré-LR.2 | `BLOCKED`, 1 membro e 1 referência | cria 1 membership, materializa ator, nulifica referência e remove membro; dry-run seguinte zero | LR.2 aplica e `migrate status` fica verde | `PASS` |
| legado não reconciliável sem `User` | `BLOCKED` | dry-run/apply `BLOCKED`; linha e referência preservadas | guard LR.2 continua bloqueando | `PASS` |
| idempotência | zero após primeiro apply | segundo apply sem alteração | apto ao contract | `PASS` |
| banco já canônico | zero | dry-run e apply `ALREADY_CANONICAL`, sem erro ou escrita | não aplicável, contract já presente | `PASS` |

O E2E usa exclusivamente dois bancos temporários derivados de `TEST_DATABASE_URL`, aplica todas
as migrations até imediatamente antes da LR.2, semeia dados artificiais e remove os bancos ao
final. No cenário reconciliável, `Project`, `User`, `Task`, `ProjectMembership`, ator canônico do
movimento, `CommitBranch`, `GitBranch`, integração GitHub e access code são conferidos após o
contract. No cenário irresolúvel, a linha e a referência legadas são conferidas após o abort e
novamente após o guard recusar a migration.

Testes focalizados adicionais cobrem planejamento do dry-run/apply, papéis legados, associação
equivalente, conflito de membership, conflito de ator, exigência de membership ativa, saída sem
PII e remoção somente quando não há blockers.

## Gates finais

Todas as rodadas finais foram executadas com Node `22.23.2` e npm `11.19.0`.

| Gate | Resultado |
| --- | --- |
| recovery E2E pré-LR.2 | `PASS`; quatro guards, apply atômico, idempotência, irresolúvel protegido, contract/status e no-op canônico |
| lint, format e architecture backend | `PASS` |
| secret scan | `PASS`; 307 arquivos |
| unit backend | `PASS`; 36 arquivos, 229 testes |
| integration/API backend | `PASS`; 14 arquivos/157 testes; 2 arquivos/5 testes históricos `N/A` |
| suíte backend integral | `PASS`; 50 arquivos/386 testes; 2 arquivos/5 testes históricos `N/A` |
| coverage backend | `PASS`; 88,28% statements, 74,69% branches, 91,87% functions, 90,88% lines |
| Prisma format/validate/generate | `PASS` |
| migrations desenvolvimento/teste | `PASS`; 35 migrations, sem pendência |
| validadores vazio, LR.2 legado e recovery LR.2.1 | `PASS` |
| npm audit backend/frontend | `PASS`; 0 vulnerabilidades |
| frontend lint, format, 203 testes, coverage e build | `PASS`; 380 módulos no build |

Uma repetição intermediária de `test:unit` teve um `404` isolado no teste de erro HTTP que
esperava `500`. O arquivo isolado passou com 19/19 e a repetição completa passou com 229/229; as
suítes integral e de coverage também passaram sem alteração funcional para mascarar o evento.

## Gate documental

O trailing whitespace de `docs/legacy/LR_2_LEGACY_AUDIT.md` foi removido. A divergência com o
`PASS` registrado no relatório original está explicitamente reconhecida nesta correção, sem
ocultação ou relaxamento do gate. `git diff --check` foi reexecutado e retornou código zero.

## Resíduos permitidos

As ocorrências restantes de `ProjectMember`/`projectMemberId` ficam limitadas a migrations
históricas imutáveis, recovery dedicado, testes do recovery e documentação histórica/operacional.
Não há ocorrência em runtime atual, API, DTO, frontend ou schema Prisma atual.

## Resultado final

**LR.2.1 CONCLUÍDA — SAFE_TO_PROCEED_LR3**
