# ADR-008 — Contract final de compatibilidade e dados legados

- **Substituída por:** ADR-011 na política de compatibilidade pré-release e no contract LR.2
- **Estado:** aceita na E15
- **Data:** 26/07/2026

## Contexto

Após as E8–E14, o runtime já não usa `TaskPullRequest`, `GithubArtifact` ou `TraceLink`. Permanecem estruturas com consumidores ou dados históricos: `ProjectMember`, `Project.accessCode/inviteLink`, aliases GitHub, `Task.responsible`, `TaskMovement.movedBy/projectMemberId` e o placeholder de exclusão de projeto.

A auditoria E15 encontrou oito Tasks somente com responsável textual e dez movimentos sem autoria canônica comprovável. Nenhum movimento é reconciliável pela evidência técnica definida na E11. Comparação por nome não é prova de identidade.

## Decisão

- Models removidos na E8 permanecem apenas em migrations históricas, scripts de reconciliação, guards, testes e documentação histórica.
- `ProjectMembership`, `responsibleUserId` e `movedByUserId` são canônicos.
- Snapshots textuais e `projectMemberId` são preservados como dados pré-identidade; leitura de fallback é permitida, autorização por texto é proibida.
- `ProjectMember`, join por `accessCode`, POST legado de membro e aliases GitHub ficam `DEPRECATE`, pois ainda possuem contrato/consumidores.
- `DELETE /api/projects/:id` permanece `501` até existir decisão de retenção, cascata, auditoria e recuperação.
- Scripts E6/E8/E11 permanecem `KEEP` como ferramentas de upgrade, auditoria e disaster recovery; não são importados pelo runtime.

## Critério para contract futuro

Remoção física exige, cumulativamente: zero consumer, contrato depreciado com migração dos clientes, auditoria de dados, zero informação exclusiva, backup testado, migration nova com guard, testes de upgrade e plano de roll-forward. Registros sem evidência permanecem nulos no identificador canônico; nenhuma membership é criada artificialmente.

## Consequências

A E15 não cria migration destrutiva. O schema conserva compatibilidade explícita e a documentação deixa de tratar esses campos como identidade. A manutenção futura tem critérios verificáveis e não pode usar ausência de referência textual como prova isolada.
