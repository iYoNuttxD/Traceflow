# LR.2 — Auditoria, consolidação canônica e remoção segura de legado

## Baseline

- Data: 20/08/2026.
- Branch: `daniel-dev`.
- SHA inicial factual: `bf53d1c3b553d1a40e6b9af91d3935bbdc01acf5`.
- Estado esperado no pedido: `f3a2a4c` com 24 arquivos LR.1 não commitados.
- Estado encontrado: árvore limpa e alinhada a `origin/daniel-dev`; `bf53d1c` é um commit
  posterior que já contém aqueles 24 arquivos da LR.1.
- A LR.2 partiu do estado factual sem reset, stash, checkout, rebase ou alteração de histórico.

## Política adotada

Compatibilidade pré-release não é preservada sem justificativa atual comprovada. Requisito,
consumidor, dado necessário, recovery, integridade ou integração externa podem justificar
permanência; origem histórica isolada não justifica. Migrations publicadas continuam imutáveis.
A decisão está formalizada no ADR-011; o ADR-008 foi preservado e marcado como substituído.

## Inventário

A matriz detalhada em `docs/legacy/LR_2_LEGACY_AUDIT.md` decidiu 20 candidatos:

| Decisão | Quantidade |
| --- | ---: |
| `REMOVE` | 7 |
| `MIGRATE_THEN_REMOVE` | 4 |
| `KEEP_CANONICAL` | 6 |
| `KEEP_RECOVERY_ONLY`/histórico | 3 |
| `BLOCKED` ou sem decisão | 0 |

Em termos de resultado, 11 candidatos foram contraídos, 6 foram reafirmados como canônicos e
3 ficaram estritamente limitados a recovery/evidência histórica.

## Removidos

| Elemento | Motivo | Substituto canônico | Migration | Testes |
| --- | --- | --- | --- | --- |
| rotas duplicadas `/api/account/*` de perfil, sessões, exportação, desativação e exclusão | frontend e produto usam Settings | `/api/settings/*` | não | seis famílias retornam `404`; Settings e reativação continuam ativas |
| router/controller/validation HTTP antigo de privacy | sem outro consumidor | Settings; worker de anonimização preservado | não | API e worker |
| `ProjectMember` | zero linha e nenhuma função exclusiva | `User` + `ProjectMembership` | sim, com guard | schema, API e cenário de bloqueio artificial |
| `TaskMovement.projectMemberId` | zero referência e ator canônico disponível | `movedByUserId`; `movedBy` textual preservado | sim, com guard | schema, movement e privacy |
| `POST /projects/:projectId/members` e service correspondente | criava participação fora do fluxo atual | invitation, access code e `ProjectMembership` | não | `404 ROUTE_NOT_FOUND` e contagem de memberships inalterada |
| `Commit.branch` | 226/226 valores tinham vínculo equivalente | `GitBranch` + `CommitBranch`; DTO `branches[]` | sim, com guard | unit, integração multibranch, API e UI |
| 15 aliases/estados GitHub em `Project` | duplicavam identidade/configuração/sync | `ProjectGitHubIntegration` | sim, com backfill e guard | integração, sync, cardinalidade, API e UI |
| `Project.inviteLink` | valor derivável e zero linha preenchida | `FRONTEND_URL` + `accessCode` no DTO OWNER | sim | access code/API/frontend |
| facade `project-invite.service.js` | zero consumidor | services de access code/invitation/membership | não | imports, lint e architecture check |
| aliases frontend `projectMembersApi`/`listProjectMembers` | duplicavam o barrel ativo | `membersApi` | não | páginas de acesso, tasks e kanban |
| redirect `/account/privacy` | não há release público/consumer comprovado | `/settings/privacy` | não | rotas, build e architecture check |
| alias npm `accounts:process-deletions` | duplicava comando operacional | `privacy:deletions` | não | coerência de package scripts |

A migration remove uma tabela e 18 colunas: `ProjectMember`, `TaskMovement.projectMemberId`,
`Commit.branch`, 15 campos GitHub de `Project` e `Project.inviteLink`. Quatro campos operacionais
necessários foram adicionados à integração canônica: `repositoryPrivate`, `integratedAt`,
`autoSyncEnabled` e `lastSyncAttemptAt`.

## Mantidos

| Categoria | Elemento | Motivo |
| --- | --- | --- |
| `CANONICAL` | `ProjectMembership`, `ProjectInvitation`, `GitHubIdentity`, `ProjectGitHubIntegration`, `GitBranch` e `CommitBranch` | fontes atuais de identidade, acesso, integração e multibranch |
| `CANONICAL` | `Project.accessCode`/`accessCodeRole` | capability atual, forte e limitada a MEMBER/VIEWER |
| `CANONICAL` | `/api/account/reactivation/start`, `/confirm` e `/account/audit-events` | responsabilidades próprias, não aliases de Settings |
| `HISTORICAL_SNAPSHOT` | `Task.responsible`, `TaskMovement.movedBy` | preservam apresentação anterior; nunca autorizam ou identificam |
| `RECOVERY_ONLY` | scripts E8 | auditoria/reconciliação de estados pré-E8 |
| `RECOVERY_ONLY` | fontes E6/E11 dependentes de `ProjectMember`/`projectMemberId` | uso antes da LR.2 com checkout/schema correspondente; no schema atual encerram `N/A` explícito |
| `HISTORICAL_ONLY` | nomes removidos em migrations e documentos E0–E15 | evidência imutável da evolução |
| `CANONICAL_ARCHITECTURE` | wrappers `pages → features` e `project.service` agregador | fronteiras usadas, sem segunda implementação |

## Dados auditados e preservados

Somente contagens sanitizadas foram emitidas.

| Medida | Antes | Depois |
| --- | ---: | ---: |
| projetos | 11 | 11 |
| commits | 226 | 226 |
| integrações GitHub | 2 | 6 |
| projetos com aliases determinísticos e sem integração | 4 | 0 |
| access codes | 11 | 11 |
| branches canônicas | 25 | 25 |
| vínculos Commit–Branch | 2.268 | 2.268 |
| movimentos | 0 | 0 |
| `ProjectMember` | 0 | tabela removida |
| `TaskMovement.projectMemberId` preenchido | 0 | coluna removida |
| `Project.inviteLink` preenchido | 0 | coluna removida |

Antes do contract, 226 commits tinham `Commit.branch`; nenhum estava sem vínculo canônico
equivalente e 216 apareciam em múltiplas branches. As duas integrações existentes não tinham
divergência de identidade; quatro projetos foram materializados deterministicamente como
`RECONNECT_REQUIRED`, sem inventar instalação, repository ID ou default branch. Os estados e
instantes operacionais mais atuais de `Project` foram preservados na integração.

## Migration

- Nova migration incremental:
  `20260820120000_lr2_contract_legacy_consolidation`.
- Nenhuma das 34 migrations anteriores foi editada, renomeada, removida ou reordenada.
- Guards precedem os `DROP`s de pessoa/movimento, branch e integração GitHub.
- Rollback operacional continua sendo restore/roll-forward; nenhum banco foi resetado.

| Cenário | Resultado | Evidência |
| --- | --- | --- |
| A — banco vazio | `PASS` | 35 migrations; 0 users, sessions, email changes e integrations |
| B — baseline populada | `PASS` | migration aplicada no banco de desenvolvimento; 11 projetos e 226 commits preservados; status sem pendências |
| C — legado representativo | `PASS` | aliases GitHub reconciliados, `CommitBranch` preservado e estruturas removidas; fixture `ProjectMember` não reconciliada bloqueada antes dos `DROP`s |

Saídas resumidas dos validadores:

```text
empty: migrations=ok, users=0, sessions=0, emailChanges=0, integrations=0
legacy: migrations=ok, projectMemberGuard=blocked-unreconciled-data-before-drop,
        integration=reconciled, branchLinks=1, removedLegacyStructures=true
```

## Gates finais

Todos os comandos abaixo foram executados com Node `22.22.0` e npm `11.19.0`.

### Backend e Prisma

| Gate | Resultado |
| --- | --- |
| lint | `PASS` |
| format check | `PASS` |
| architecture check | `PASS`; nenhuma violação |
| secret scan | `PASS`; 304 arquivos |
| unit | `PASS`; 35 arquivos, 222 testes |
| integration/API | `PASS`; 14 arquivos e 157 testes; 2 arquivos/5 testes `N/A` pré-LR.2 |
| `npm test` | `PASS`; 49 arquivos e 379 testes; 2 arquivos/5 testes `N/A` pré-LR.2 |
| coverage | `PASS`; 88,28% statements, 74,69% branches, 91,87% functions, 90,88% lines |
| `npm audit` | `PASS`; 0 vulnerabilidades |
| Prisma format/validate/generate | `PASS` |
| migrate status desenvolvimento/teste | `PASS`; 35 migrations, schemas atualizados |
| deploy idempotente em teste | `PASS`; nenhuma migration pendente |
| validadores vazio/legado LR.2 | `PASS` |

Os cinco testes `N/A` são exclusivamente as suites E6/E11 que exigem o schema anterior ao
contract. Os três comandos de recovery correspondentes foram executados em dry-run no schema
atual e encerraram com código zero e `reason=LR2_CONTRACT_APPLIED`, sem tentar acessar colunas
removidas.

## Correção pós-verificação — LR.2.1

A verificação independente posterior à LR.2 encontrou duas inconsistências reais antes da LR.3:

1. os recoveries E6/E11 conseguiam criar/reconciliar estado canônico, porém deixavam
   `ProjectMember` e/ou `TaskMovement.projectMemberId`; por isso o guard da própria LR.2
   continuaria bloqueando uma base pré-contract populada;
2. este relatório registrou `git diff --check` como `PASS`, mas a verificação independente
   encontrou trailing whitespace em `docs/legacy/LR_2_LEGACY_AUDIT.md`.

A LR.2.1 não alterou a migration aplicada nem enfraqueceu seus guards. Foi criado o recovery
operacional dedicado `backend/scripts/lr2-legacy-recovery.js`, dry-run por padrão, apoiado por SQL
para o schema histórico e por uma transação atômica no apply. Ele exige identidade determinística,
associação equivalente, ator canônico coerente e zero irresolúveis antes de materializar
`movedByUserId`, nulificar `projectMemberId` e remover `ProjectMember`. O preflight é repetido após
a operação e somente então retorna `SAFE_TO_CONTRACT`.

O validador E2E `db:test:validate-lr2-recovery` cobre legado reconciliável, dado irresolúvel sem
perda, segunda execução idempotente, banco já canônico e aplicação/status da LR.2 após o recovery.
O whitespace foi removido e o gate foi reexecutado de verdade na LR.2.1. A evidência detalhada e
o parecer de prontidão estão em `docs/deliveries/LR_2_1_LEGACY_RECOVERY_CLOSURE.md`.

### Frontend

| Gate | Resultado |
| --- | --- |
| lint | `PASS` |
| format check | `PASS` |
| testes | `PASS`; 34 arquivos, 203 testes |
| coverage | `PASS`; 61,05% statements, 58,73% branches, 52,07% functions, 62,25% lines |
| build | `PASS`; 380 módulos transformados |
| `npm audit` | `PASS`; 0 vulnerabilidades |

Houve ciclos intermediários vermelhos enquanto fixtures e assertions ainda descreviam campos
removidos. Depois da migração dessas fixtures, as rodadas finais acima ficaram verdes. Uma
execução intermediária de integração retornou um `401` isolado e uma cobertura teve `socket
hang up`; ambos passaram ao repetir o arquivo e os gates integrais, sem mudança funcional para
mascarar os eventos.

## Evidência não automatizada

- Browser/E2E visual: `N/A` para esta entrega; não é convertido em `PASS`.
- SMTP e GitHub App reais: `N/A`; nenhuma integração externa foi acionada.
- Restore/backup de produção: `N/A`; os validadores usaram apenas bancos temporários artificiais.

## Estado Git e conclusão

A working tree contém apenas a LR.2 sobre o baseline factual já commitado da LR.1: 84 arquivos
modificados, 5 removidos e 5 novos, totalizando 94 paths. `git diff --check` passou. Nenhum
commit, push, merge, rebase, branch, stash, comentário ou alteração de PR foi realizado.

**LR.2 — CONCLUÍDA**

Mensagem de commit sugerida, sem criar o commit:

```text
refactor(legacy): consolidate canonical models and remove obsolete compatibility paths
```
