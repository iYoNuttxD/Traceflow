# E0 — Inventário Prisma e migrations

## Estado verificado

- Provider: MySQL; Prisma Client `6.19.3` resolvido pelo lockfile.
- `npx prisma validate`: aprovado.
- `npx prisma generate`: aprovado.
- `npx prisma migrate status`: 15 migrations encontradas; banco local `traceflow` em `localhost:3306` reportado como atualizado.
- Esta verificação não confirma ambientes compartilhados, homologação ou produção.
- Nenhuma alteração de schema ou migration foi realizada.

## Models

| Model | Finalidade e relações | Índices/constraints e exclusão | Uso atual (módulos/rotas) | Dados pessoais/sensíveis | Duplicações/inconsistências | Estado |
|---|---|---|---|---|---|---|
| Project | Agregado central; 1:N com Requirement, Task, ProjectMember, TaskMovement, GithubArtifact, TraceLink, Commit, PullRequest, Issue | PK `id`; unique repository ID/full name e `accessCode`; relações sem `onDelete` explícito exceto filhos específicos | projects, github sync, artifacts, tasks, requirements, traceability; quase todas as telas | equipe responsável; URL/repositório privado; código/link de convite; erro de sync | Três campos legados `githubOwner/repo/url` coexistem com seis `githubRepository*`; status são strings | EM_USO |
| Requirement | Requisito do projeto; N:1 Project, 1:N Task | Sem índice explícito em `projectId`; FK com delete padrão Restrict | requirements, tasks e traceability | descrição pode conter nomes/contexto | TODO diz relação futura, mas `Task.requirementId` já a implementa; `type/status` livres | EM_USO |
| Task | Unidade de trabalho; N:1 Project/Requirement; N:1 opcional PullRequest; 1:N movements, TaskCommit, TaskIssue | Índice apenas `pullRequestId`; `onDelete:SetNull` na PR; outras relações sem política explícita | tasks/Kanban/traceability e respectivas páginas | responsável textual, descrição, prazo, esforço/produtividade | PR singular limita N:N; `responsible` não referencia membro; status/prioridade livres | EM_USO |
| TaskCommit | Junção N:N Task↔Commit | Unique `(taskId,commitId)`, índices individuais; cascata dos dois lados | vínculos manuais e traceability | Indireto via autor do commit | Coexiste com TraceLink genérico e GithubArtifact | EM_USO |
| TaskIssue | Junção N:N Task↔Issue | Unique `(taskId,issueId)`, índices; cascata | vínculos manuais e traceability | Indireto via autores/assignees | Coexiste com TraceLink genérico e GithubArtifact | EM_USO |
| ProjectMember | Membro textual do projeto; N:1 Project, 1:N movements | Unique `(projectId,email)`; índice project; relação Project Restrict | convites/membros, seleção de responsável por movimento | nome, e-mail, papel, participação, datas | Não há User/identidade; email nullable permite múltiplos membros sem email | EM_USO |
| TaskMovement | Histórico do Kanban; N:1 Project/Task, N:1 opcional ProjectMember | Índices project/task/member/movedAt; Project/Task Restrict, membro SetNull | move/list/metrics; KanbanPage | `movedBy` textual, vínculo ao membro, data e atividade | `movedBy` duplica nome; `sprintId` não possui FK/model; autoria não autenticada | EM_USO |
| GithubArtifact | Generalização legada de Commit/PR/Issue | Unique `(projectId,type,externalId)`; sem índices adicionais; Project Restrict | Nenhum repository/service atual persiste ou lê este model | autor, descrição e URLs potenciais | Duplica integralmente models específicos; `externalId` nullable reduz garantia do unique | CANDIDATO_A_LEGADO |
| TraceLink | Vínculo genérico por tipos/IDs textuais | Apenas PK e FK de projeto; sem unique, índices ou FKs para origem/destino | Rotas de mutação/consulta associadas retornam 501; model não é lido | Pode relacionar atividade de pessoas indiretamente | Duplica TaskCommit/TaskIssue/Task.requirementId/Task.pullRequestId; sem integridade referencial | CANDIDATO_A_LEGADO |
| Commit | Commit importado; N:1 Project; 1:N TaskCommit | Unique `(projectId,hash)`; Project `onDelete:Cascade`; sem índice separado por data/branch | sync, lista, artefatos, tarefas e traceability | nome, e-mail e login do autor; mensagem | Também representável por GithubArtifact; TODO de vínculo está desatualizado | EM_USO |
| PullRequest | PR importada; N:1 Project; 1:N Task via FK em Task | Unique `(projectId,githubId)` e `(projectId,number)`; Project Cascade | sync, lista, artefatos, tarefa e traceability | login do autor; descrição pode conter PII | Duplica GithubArtifact; relação física permite várias tasks por PR, mas cada task só uma PR | EM_USO |
| Issue | Issue importada; N:1 Project; 1:N TaskIssue | Unique `(projectId,githubId)` e `(projectId,number)`; Project Cascade | sync, lista, artefatos, tarefa e traceability | autor, assignee, descrição, labels/milestone | Duplica GithubArtifact | EM_USO |

## Inventário das migrations

| Migration | Alteração principal | Observações/riscos de evolução |
|---|---|---|
| `20260604224631_add_github_fields_to_project` | Cria Project, Requirement, Task, GithubArtifact e TraceLink | Migration inicial já contém três conceitos depois duplicados/tipados; descrições curtas em VARCHAR |
| `20260605120000_create_commit_model` | Cria Commit e FK cascade | Introduz duplicação com GithubArtifact; guarda e-mail de autor |
| `20260606120000_create_pull_request_model` | Cria PullRequest | Duas unique keys; descrição TEXT |
| `20260606130000_create_issue_model` | Cria Issue | Labels JSON; dados pessoais GitHub |
| `20260606140000_add_github_sync_settings_to_project` | Adiciona auto sync/último sync | Não existe job automático apesar do campo |
| `20260606233000_add_responsible_team_to_project` | Adiciona/backfill `responsibleTeam` | Backfill usa `Não informada`; mudança NOT NULL em duas etapas dentro da mesma migration |
| `20260607021903_add_task_module` | Backfill prioridade e adiciona responsible | Responsável textual, sem identidade |
| `20260607024213_use_integer_task_effort` | DOUBLE→INTEGER para esforços | Possível perda/arredondamento em dados antigos não é verificado pela migration |
| `20260607030000_add_task_movements_for_kanban` | Cria TaskMovement | `sprintId` solto; FKs Restrict podem bloquear exclusão, mitigada por delete manual da task |
| `20260607170000_adjust_kanban_project_members` | Convites, ProjectMember e vínculo no movimento | Backfill de código determinístico; convite sem expiração/uso/revogação |
| `20260607190000_add_requirement_module` | Backfill/type NOT NULL | Comentário associa default a RF15, embora RF15 seja indicador no documento oficial |
| `20260608120000_add_task_pull_request_relation` | FK opcional Task→PullRequest | Cardinalidade singular por tarefa |
| `20260610120000_add_task_commit_links` | Cria TaskCommit | Junção tipada adequada, mas legado permanece |
| `20260610130000_add_task_issue_links` | Cria TaskIssue | Junção tipada adequada, mas legado permanece |
| `20260611120000_add_github_sync_status_to_project` | Status/erro/tentativa de sync | Estados e tamanho do erro não têm enum; aplicação limita a 255 |

## Relações e políticas de exclusão observadas

- Project→Commit/PullRequest/Issue: cascade configurado nos models específicos.
- TaskCommit e TaskIssue: cascade quando Task ou artefato é apagado.
- Task→PullRequest: SetNull ao apagar PR.
- Task→Requirement e ProjectMember→TaskMovement: SetNull.
- Demais relações Project/Requirement/Task usam comportamento Prisma/MySQL padrão (predominantemente Restrict), sem política explicitada no schema.
- Services implementam transações manuais para excluir Task e Requirement preservando artefatos. Não há endpoint implementado para excluir Project.

## Riscos de migração e consistência

1. **ALTO — modelos duplicados:** consolidar `GithubArtifact`/`TraceLink` sem inventário de dados e backfill pode perder vínculos históricos.
2. **ALTO — campos GitHub duplicados:** consumidores aceitam fallback entre `githubRepo` e `githubRepositoryName`; remoção direta quebra sync/UI.
3. **ALTO — identidade textual:** migrar ProjectMember, Task.responsible e TaskMovement.movedBy exige reconciliação, tratamento de homônimos e retenção.
4. **ALTO — cardinalidade de PR:** eventual N:N precisa expand/backfill antes de remover `Task.pullRequestId`.
5. **MÉDIO — strings livres:** status/tipos/papéis podem conter valores históricos não previstos; enum direto pode falhar.
6. **MÉDIO — índices ausentes:** coleções filtram por projectId, datas, status, autor e texto sem cobertura de índices adequada.
7. **MÉDIO — pertencimento composto:** FKs garantem existência, mas não garantem no banco que Task/Requirement/artefato pertençam ao mesmo Project; hoje o service valida alguns vínculos.
8. **MÉDIO — cascatas assimétricas:** exclusão futura de projeto terá efeitos diferentes entre models específicos e genéricos.
9. **BAIXO — versão:** manifests aceitam Prisma `^6.0.0`, lock resolveu 6.19.3 e a ferramenta informou major 7 disponível; nenhuma atualização foi realizada.

## Dados pessoais no schema

- ProjectMember: `name`, `email`, `role`, participação e timestamps.
- Task: `responsible`, descrição, prazo e esforço.
- TaskMovement: `movedBy`, membro, ação e timestamp.
- Commit: `authorName`, `authorEmail`, `authorUsername`, mensagem e data.
- PullRequest/Issue: logins de autor/assignee, título/descrição, datas e URLs.
- Project: equipe, repositório privado, convite/código e erro de integração.

Não existe campo ou política de retenção, anonimização, finalidade, consentimento/base legal ou auditoria de acesso no schema atual. Isso é inventário técnico, não conclusão jurídica.
