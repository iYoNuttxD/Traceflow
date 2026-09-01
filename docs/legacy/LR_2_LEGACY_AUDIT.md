# LR.2 — Auditoria de legado e decisão de contração

Data da auditoria: 2026-08-20
Branch auditada: `daniel-dev`
Baseline factual: `bf53d1c3b553d1a40e6b9af91d3935bbdc01acf5`

## Escopo e regra de decisão

Esta auditoria precede qualquer remoção estrutural da LR.2. O `HEAD` encontrado difere do
baseline `f3a2a4c` descrito no pedido: `bf53d1c` é um commit adicional que contém o conjunto
de 24 arquivos da LR.1. A árvore de trabalho estava limpa e alinhada a `origin/daniel-dev`.
Nenhum histórico Git foi reescrito.

Uma contração recebe `SAFE_TO_CONTRACT` somente quando os dados atuais estão reconciliados,
o caminho canônico está identificado e a migração consegue bloquear estados que não possam
ser descartados com segurança. Dados e ferramentas históricas permanecem apenas quando têm
função explícita de recuperação ou de evidência.

## Evidência de dados

As consultas foram somente leitura e expuseram apenas contagens e divergências, sem dados
pessoais, tokens ou conteúdo de negócio.

| Verificação | Resultado |
| --- | ---: |
| `ProjectMember` | 0 registros |
| `TaskMovement.projectMemberId` preenchido | 0 registros |
| `Commit` | 226 registros |
| `Commit.branch` preenchido | 226 registros |
| commit com branch textual sem `CommitBranch` equivalente | 0 registros |
| commit com mais de uma branch canônica | 216 registros |
| `Project` | 11 registros |
| `ProjectGitHubIntegration` | 2 registros ativos e completos |
| projeto com aliases GitHub e sem integração | 4 registros |
| alias legado com `githubRepositoryId` e sem integração | 0 registros |
| divergência de identidade/metadados entre aliases e integração | 0 registros |
| divergência de estado/instante de sincronização | 2 registros |
| `Project.inviteLink` preenchido | 0 registros |
| `Project.accessCode` preenchido | 11 registros |
| `Task.responsible` preenchido | 0 de 1 tarefa |
| `TaskMovement` | 0 registros |

Os quatro projetos sem integração têm `owner`, nome e URL coerentes. Eles podem ser
representados deterministicamente por uma integração `RECONNECT_REQUIRED`, sem inventar
installation, repository id ou branch padrão. Nas duas integrações existentes, os campos
operacionais atualmente escritos em `Project` devem prevalecer no backfill de status e
datas; a identidade coincide.

## Inventário consolidado

| ID | Elemento | Tipo | Canônico atual | Consumidores de runtime | Consumidores de teste | Dado exclusivo | Recuperação | Decisão |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LR2-001 | `/api/account/personal-data`, `/profile`, `/sessions`, `/deactivate` e `/deletion-request` | rotas REST | `/api/settings/*` e processador de exclusão | montagem de `privacy.routes`, controller e limiter específico | `privacy-governance.test.js` e contratos antigos | nenhum; frontend usa settings | histórico Git | `REMOVE` — `SAFE_TO_CONTRACT` |
| LR2-002 | `/api/account/reactivation/start` e `/confirm` | rotas REST | as próprias rotas públicas de reativação | settings routes/controller/service | testes de reativação | fluxo ativo | n/a | `KEEP_CANONICAL` |
| LR2-003 | service/repository de privacidade usados por anonimização e exclusão | serviço/repositório | processador `processDueDeletions` | worker e scripts de privacidade | testes do processador | estado de exclusão e anonimização | scripts operacionais | `KEEP_CANONICAL` |
| LR2-004 | métodos de privacy exclusivos das rotas `/api/account/*` removidas | serviço/repositório | settings e processador | somente controller legado | testes das rotas legadas | nenhum | histórico Git | `REMOVE` — `SAFE_TO_CONTRACT` |
| LR2-005 | `ProjectMember` | tabela/modelo | `User` + `ProjectMembership` | endpoint legado de inclusão e referências antigas | recovery LR.2.1 e testes históricos E6/E11 | 0 registros | `lr2:recovery:*`: resolve `User`, prova/cria membership equivalente e remove somente com zero irresolúveis | `MIGRATE_THEN_REMOVE` — guardará qualquer linha não reconciliada |
| LR2-006 | `TaskMovement.projectMemberId` | coluna/relação | `movedByUserId` | nenhum escritor canônico | recovery LR.2.1 e fixtures históricas E11 | 0 referências | `lr2:recovery:*`: prova ator canônico, preenche `movedByUserId` e nulifica a referência na mesma transação | `MIGRATE_THEN_REMOVE` — guardará valor não nulo |
| LR2-007 | `POST /projects/:projectId/members` | rota REST | convites, entrada por código e `ProjectMembership` | controller/service legado | contratos antigos | nenhum | histórico Git | `REMOVE` — `SAFE_TO_CONTRACT` |
| LR2-008 | `Commit.branch` | coluna/alias de saída | `GitBranch` + `CommitBranch` e `branches[]` | busca, artefatos, tarefas e rastreabilidade | testes multibranch/contratos | nenhum: 226/226 têm link equivalente | guard de migração | `MIGRATE_THEN_REMOVE` — `SAFE_TO_CONTRACT` |
| LR2-009 | aliases GitHub em `Project` | colunas/DTO | `ProjectGitHubIntegration` | projeto, sync, artefatos e frontend | testes E9/GitHub/UI | 4 projetos sem linha canônica; 2 estados de sync mais atuais | backfill determinístico e `RECONNECT_REQUIRED` | `MIGRATE_THEN_REMOVE` — `SAFE_TO_CONTRACT` |
| LR2-010 | `Project.inviteLink` persistido | coluna | URL derivada de `accessCode` | escrita na regeneração | testes de acesso | 0 valores; `accessCode` existe em 11 projetos | derivação em runtime | `REMOVE` — `SAFE_TO_CONTRACT` |
| LR2-011 | `Project.accessCode` e papel de entrada | dados de acesso | os próprios campos | entrada e regeneração de código | testes L5.1/LR.1 | dados ativos | n/a | `KEEP_CANONICAL` |
| LR2-012 | `project-invite.service.js` | facade sem consumidor | services de access code/membership | nenhum | nenhum | nenhum | histórico Git | `REMOVE` |
| LR2-013 | `projectMembersApi` e `listProjectMembers` | aliases frontend | `membersApi` e `list` | páginas de entrada, tarefas e kanban | mocks frontend | nenhum | histórico Git | `REMOVE` após migrar consumidores |
| LR2-014 | redirect `/account/privacy` | alias de navegação | `/settings/privacy` | `AppRoutes` | nenhum consumidor identificado | nenhum | histórico Git | `REMOVE` |
| LR2-015 | wrappers de páginas | limite arquitetural | wrappers de rota sobre features | roteador frontend | testes de páginas | n/a | n/a | `KEEP_CANONICAL` |
| LR2-016 | `TraceLink`, `GithubArtifact`, `TaskPullRequest` | modelos E8 removidos | relações tipadas atuais | nenhum em schema/runtime | reconciliação histórica | somente migrações históricas | scripts E8 | `KEEP_RECOVERY_ONLY` / `KEEP_HISTORICAL_DOC_ONLY` |
| LR2-017 | scripts E6 e E11 | ferramenta de reconciliação | `ProjectMembership`, atores por `User` | nenhum runtime web | testes específicos | necessários somente para DB pré-LR.2 com guard acionado | execução manual antes da LR.2 | `KEEP_RECOVERY_ONLY` |
| LR2-018 | scripts E8 | ferramenta de recuperação | modelos tipados atuais | nenhum runtime web | testes de reconciliação | recuperação de snapshot pré-E8 | execução manual controlada | `KEEP_RECOVERY_ONLY` |
| LR2-019 | snapshots textuais `Task.responsible` e `TaskMovement.movedBy` | histórico desnormalizado | IDs de `User` para identidade operacional | apresentação/auditoria histórica | E11 | texto histórico pode não ter mapeamento seguro | reconciliação E11 quando aplicável | `KEEP_CANONICAL` como snapshot histórico, nunca como identidade de autorização |
| LR2-020 | `projectService` agregador | facade modular | fronteira pública do módulo Projects | controller | testes do módulo | n/a | n/a | `KEEP_CANONICAL` |

## Preflight destrutivo

Resultado desta baseline: **`SAFE_TO_CONTRACT`**.

A migração LR.2 deve abortar, sem derrubar estruturas, se encontrar:

- qualquer `ProjectMember` ainda não reconciliado;
- qualquer `TaskMovement.projectMemberId` não nulo;
- `Commit.branch` não vazio sem `CommitBranch` de mesmo nome;
- aliases GitHub com identidade que não possa ser materializada em
  `ProjectGitHubIntegration`.

Não há `BLOCKED` na base auditada. Em outra base populada, um guard acionado significa
`BLOCKED` até a execução e conferência do roteiro de recuperação aplicável; não autoriza
inferência de identidade, vínculo, instalação ou branch.

### Fechamento operacional LR.2.1

A verificação independente pós-LR.2 demonstrou que E6/E11 criavam ou reconciliavam estado
canônico, mas não removiam `ProjectMember` nem nulificavam todas as referências
`projectMemberId`; portanto, não bastavam para liberar os guards. A ferramenta dedicada
`lr2-legacy-recovery.js` passou a executar a convergência final de forma transacional, dry-run por
padrão, com abort total quando houver qualquer dado irresolúvel e preflight pós-recovery. Os
scripts E6/E11 permanecem classificados como históricos e não são apresentados como fechamento
do contract.

## Contrato depois da consolidação

- identidade GitHub de projeto: exclusivamente `ProjectGitHubIntegration`;
- associação de pessoas: exclusivamente `User` + `ProjectMembership`;
- branches de commit: exclusivamente `GitBranch` + `CommitBranch`;
- entrada em projeto: `accessCode`, com link calculado sob demanda;
- configurações e operações da conta: `/api/settings/*`, preservando as rotas públicas
  específicas de reativação;
- modelos removidos continuam permitidos somente em migrações históricas, documentação
  histórica e ferramentas explicitamente classificadas como recuperação.
