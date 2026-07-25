# E8 — Plano futuro de contract

Nenhuma remoção abaixo pertence à migration expand da E8.

| Candidato | Condição de remoção | Verificação/consumidores restantes | Migration e rollback roll-forward | Etapa |
|---|---|---|---|---|
| `GithubArtifact` | zero dado exclusivo e zero consumer | `e8:audit` unmatched=0; authorization/placeholders migrados | copiar divergências para models específicos; remover só depois; recriar tabela/restaurar snapshot se necessário | E9/E10 |
| `TraceLink` | todos os tipos cobertos por relações tipadas e placeholders decididos | reconcile conflicts/unsupported=0; authorization e endpoints 501 | materializar joins, comparar checksums, remover em migration isolada | E10 |
| `ProjectMember` | todos reconciliados e nenhum movimento/import runtime | backfill E6/E8 zero pendência; `rg projectMember` | manter ProjectMembership; remover FKs/campo em etapas separadas | E11/E15 |
| `Task.responsible` | toda atribuição resolvida ou texto histórico preservado em auditoria apropriada | tasks com `responsibleUserId IS NULL AND responsible IS NOT NULL` = 0 | tornar ID obrigatório quando aplicável; remover string depois | E11 |
| `TaskMovement.movedBy` | cobertura integral de `movedByUserId` e política para ator sistema | movimentos sem ator canônico = 0 | manter User SetNull/ator técnico; remover fallback depois | E11 |
| `TaskMovement.projectMemberId` | ProjectMember removível e nenhum filtro/UI legado | `rg projectMemberId`; zero movimentos dependentes | remover FK/campo após migração de filtros | E11/E12 |
| `Task.pullRequestId` | todos os consumidores usam TaskPullRequest e contrato N:N aprovado | missing canonical=0; testes HTTP/UI migrados | remover FK singular em migration contract; rollback recria/backfill somente se no máximo um join por Task | E9/E10 |
| `githubRepo/githubUrl` | todos os projetos têm campos canônicos e frontend/API não usa aliases | projectCanonicalFields=0; `rg githubRepo|githubUrl` | parar dual-write, remover aliases em migration posterior | E9/E12 |
| `githubOwner/githubRepositoryName` | decisão de derivar sempre de fullName confirmada | fullName válido para 100%; sync sem fallback | migrar parser e só depois remover | E9 |

Qualquer contract exige backup/restauração testados, contagens antes/depois, janela operacional, plano de lock e PR separado. SQL destrutivo não foi criado nesta entrega.
