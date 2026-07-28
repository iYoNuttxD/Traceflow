# Inventário final de legado — E15

Baseline: branch `daniel-dev`, commit `35b6d40`. A classificação combina busca global, rotas, imports, testes, migrations, auditorias sanitizadas E8/E11 e contratos documentados. Ausência textual isolada não foi usada como prova.

| Item | Localização/tipo | Referências e dados | RF/contrato | Classificação | Decisão | Evidência |
|---|---|---|---|---|---|---|
| `TaskPullRequest` | tabela/model N:N removido | sem runtime; tabela ausente, zero linha/conflito/órfão | RF09 singular | REMOVE | já removido; manter história/recovery | migrations E8, `e8:audit`, architecture check |
| `GithubArtifact` | model genérico removido | sem runtime; tabela ausente e zero dado exclusivo | RF03–RF06/RF53 tipados | REMOVE | já removido; não recriar | migrations E8, audit e testes de reconciliação |
| `TraceLink` | model genérico removido | sem runtime; tabela ausente e zero vínculo residual | RF09/RF11/RF12/RF48 | REMOVE | já removido; relações específicas são canônicas | migrations E8, audit e ADR-006 |
| Scripts E8 e seus testes | manutenção/recovery | imports somente por scripts/testes; testam upgrade e guards | integridade de migration | KEEP | preservar para upgrade, auditoria e disaster recovery | `scripts/e8-*`, testes unit/integration |
| `ProjectMember` | model legado | 3 registros no banco auditado; join/access code e histórico ainda usam | compatibilidade RF24/RF26/RF51 | DEPRECATE | não é identidade; remover só após migração de contratos/dados | schema, project-members service, E11 audit |
| `POST /projects/:projectId/members` | endpoint legado | backend ativo; sem consumer UI atual, mas contrato público/testes de validação | compatibilidade de membros | DEPRECATE | manter; convites/memberships são o fluxo canônico | route, API contracts, authorization matrix |
| `POST /projects/join` e `/join/:accessCode` | fluxo legado | backend e frontend ativos; `accessCode` persistido | compatibilidade de convite | DEPRECATE | manter rate limit; convite opaco é canônico | app limiter, JoinProjectPage, ADR-008 |
| `Project.accessCode/inviteLink` | campos legados | seis projetos auditados; UI ainda exibe link/código | convite legado | DEPRECATE | preservar até retirada coordenada do fluxo | schema, ProjectDetails, project-invite service |
| `githubOwner/githubRepo/githubUrl` | aliases de Project | sync e frontend usam fallback/compatibilidade | RF01/RF02/RF21/RF22 | DEPRECATE | campos `githubRepository*` são canônicos; contract futuro exige backfill | schema, project schema/services, tests E9 |
| `Task.responsible` | snapshot textual | 8 Tasks sem ID e 1 Task canônica; nenhuma associação segura disponível | RF51 | DEPRECATE | preservar leitura; novas escritas usam `responsibleUserId` | `e11:legacy:audit`, architecture check |
| `TaskMovement.movedBy/projectMemberId` | snapshot/referência histórica | 10 movimentos não reconciliáveis; 2 canônicos | RF08/RF38 | DEPRECATE | manter valores e ID canônico nulo quando sem prova | audit E11, ADR-008, retention policy |
| `DELETE /api/projects/:id` | placeholder `501` | rota/teste/contrato ativos; política de cascata/retention não homologada | exclusão de projeto não definida | INVESTIGATE | não remover nem implementar na E15 | controller, API contract, test 501 |
| Rotas genéricas antigas de trace links/artifacts | contratos removidos | nenhuma rota/runtime; testes garantem 404 | substituídas na E10 | REMOVE | permanecer ausentes | traceability routes e caracterização API |
| `projectController.listMembers/getById` | adaptadores backend mortos | zero rota/import/test consumer | nenhum | REMOVE | removidos na E15 | `rg` global antes/depois |
| `projectMembersService.listProjectMembers` | método backend morto | único consumer era controller morto | nenhum | REMOVE | removido na E15 | `rg` global antes/depois |
| `projectMembersApi.addProjectMember` | método frontend morto | zero consumer runtime/test | endpoint legado permanece backend | REMOVE | removido sem alterar contrato HTTP | `rg` global e regressão frontend |
| Pages finas e `index.js` públicos | adaptadores arquiteturais | usados por lazy routes/imports públicos | navegação E12/E13 | KEEP | fazem parte da fronteira de domínio | AppRoutes, architecture check, build chunks |
| Scripts E6/E11/privacidade | manutenção operacional | comandos versionados; dry-run/guards e testes | identidade/LGPD | KEEP | não são temporários de runtime | package scripts, testes e políticas |
| TODOs de bootstrap/filtros já entregues | comentários | comportamento existe ou pertence a backlog externo | transversal | REMOVE | comentários soltos removidos; futuro registrado em issues | busca final e `TECHNICAL_BACKLOG.md` |
| `frontend/src/assets/.gitkeep` | placeholder vazio | zero import/asset | nenhum | REMOVE | removido na E15 | busca global e build |
| Documentos E0–E14 | evidência histórica | podem descrever o baseline de sua data | auditoria da refatoração | KEEP | não reescrever fatos históricos; docs finais indicam estado vigente | `docs/refactoring/` |

## Dados auditados

O audit sanitizado no banco de desenvolvimento registrou 6 projetos, 9 Tasks, 12 movimentos, 351 commits, 46 Pull Requests, 5 Issues, 11 `TaskCommit`, 5 `TaskIssue` e 71 eventos de auditoria. As três tabelas removidas na E8 estão ausentes. Nenhum nome, e-mail, descrição, token ou payload foi incluído neste inventário.

Nenhuma migration foi criada na E15: todo candidato persistido remanescente possui consumidor ou dado exclusivo/sem reconciliação comprovada.

