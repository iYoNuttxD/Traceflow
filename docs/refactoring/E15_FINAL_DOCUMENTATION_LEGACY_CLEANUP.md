# E15 — Documentação final, auditoria e remoção controlada do legado

## 1. Título e objetivo

Encerramento formal do plano E0–E15 mediante reconciliação entre código, banco, API, testes, CI e documentação. A etapa não adiciona funcionalidade nem associa identidade histórica sem evidência.

## 2. Branch e commit inicial

- Branch: `daniel-dev`
- Commit baseline: `35b6d40` (`fix(security): update React Router to resolve GHSA-qwww-vcr4-c8h2`)
- Estado inicial: arquivos rastreados limpos; três documentos locais não rastreados e preexistentes foram preservados.

## 3. Escopo executado

- auditoria de routes, controllers, services, repositories, schemas, migrations, frontend, testes, workflows e documentação E0–E14;
- execução dos gates reais e migrations em MySQL isolado;
- auditorias sanitizadas E8/E11 sobre o banco local, sem mutação;
- inventário e classificação integral dos candidatos a legado;
- remoção de quatro adaptadores/placeholder sem consumers comprovados;
- arquitetura vigente, matriz RF técnica, ADR final, runbooks e evidências ASVS/LGPD.

Ambiente medido: Node local `25.9.0`, npm `11.12.1` e cliente MySQL `9.6.0`; a CI permanece canônica em Node 22 e serviço `mysql:8.4.8`. O primeiro gate de banco, sem `TEST_DATABASE_URL`, foi corretamente bloqueado pelo guard; a validação prosseguiu somente após criar datasource local isolado. O startup na porta padrão encontrou `EADDRINUSE` por processo preexistente e o smoke foi repetido na porta 31015, sem encerrar o processo alheio. O primeiro `mysqldump` evidenciou ausência dos privilégios `PROCESS`/`LOCK TABLES`; o procedimento mínimo documentado passou com `--no-tablespaces`, transação única e sem lock de tabela.

## 4. Inventário do legado

O inventário detalhado está em `docs/legacy/LEGACY_INVENTORY.md`. A classificação foi baseada em referências, contratos, testes, migrations e dados — nunca somente na ausência de texto.

## 5. Itens mantidos

- relações canônicas `Task.requirementId`, `Task.pullRequestId`, `TaskCommit`, `TaskIssue` e `TaskCommitSuggestion`;
- `TaskMovement`, `TaskHistoryEntry`, `AuditEvent`, identidade de sessão e responsável canônico;
- scripts E6/E8/E11 e privacidade, necessários para operação, recovery e prova de migration;
- pages finas, barrels públicos e componentes usados pelo lazy loading;
- documentos E0–E14 como evidência histórica de cada baseline.

## 6. Itens removidos

- `projectController.listMembers` e `projectController.getById`, sem rota/import consumidor;
- `projectMembersService.listProjectMembers`, cujo único consumidor era o controller morto;
- `projectMembersApi.addProjectMember`, sem consumidor frontend/teste;
- `frontend/src/assets/.gitkeep`, diretório placeholder sem asset/import;
- comentários TODO já entregues ou substituídos pelo backlog rastreável.

Os models `TaskPullRequest`, `GithubArtifact` e `TraceLink` já haviam sido removidos com migrations protegidas na E8; a E15 confirmou ausência de runtime e tabela residual.

## 7. Itens migrados

Nenhum dado foi migrado na E15. A auditoria comprovou que toda migração canônica anterior permanece aplicada. Dados textuais sem identidade inequívoca foram preservados.

## 8. Itens depreciados

- `ProjectMember`, POST legado de membro e join por `accessCode`;
- `Project.accessCode/inviteLink`;
- aliases `githubOwner/githubRepo/githubUrl`;
- `Task.responsible` e `TaskMovement.movedBy/projectMemberId` como snapshots históricos.

Cada contract futuro exige zero consumer/dado exclusivo, reconciliação, backup e migration nova.

## 9. Itens sob investigação

`DELETE /api/projects/:id` permanece `501`. Exclusão exige decisão de retenção, cascata, auditoria e recuperação; não foi removida nem implementada nesta etapa.

## 10. Migrations criadas

Nenhuma. As 25 migrations existentes não foram editadas e aplicaram do zero em banco isolado. Não havia candidato destrutivo seguro ou necessário.

## 11. Documentação atualizada

- READMEs principal, backend e frontend;
- arquitetura vigente e contexto arquitetural;
- contratos API, autorização, retenção, inventário pessoal, threat model, segredos, dependências e ASVS;
- roadmap E0–E15, inventário de legado, backlog técnico e matriz RF.

## 12. ADRs atualizados

- ADR-002: provider de e-mail e operação real;
- ADR-003: modelo de autorização e único `501` vigente;
- ADR-006: modelo canônico e remoção das rotas genéricas;
- ADR-008 novo: contrato final de compatibilidade e dados anteriores à identidade.

## 13. Runbooks criados

- `docs/runbooks/GITHUB_INTEGRATION.md`;
- `docs/runbooks/DATABASE_MIGRATIONS.md`;
- `docs/runbooks/BACKUP_RESTORE.md`;
- `docs/runbooks/INCIDENT_RESPONSE.md`.

## 14. Evidências ASVS

`docs/security/ASVS_BASELINE.md` usa exclusivamente `ATENDIDO`, `PARCIAL`, `NÃO ATENDIDO` e `NÃO APLICÁVEL`, com arquivo, teste, endpoint ou workflow por evidência. Não há declaração de conformidade integral ASVS L2.

## 15. Evidências LGPD

`docs/privacy/PERSONAL_DATA_INVENTORY.md` registra dado, finalidade, origem, persistência, acesso, retenção, exclusão, anonimização, risco e controle. Oito Tasks e dez movimentos anteriores à identidade continuam preservados sem associação artificial. Validação jurídica e operação de backups/logs permanecem externas ao código.

## 16. Resultados dos testes

Baseline e resultado final a serem idênticos após a consolidação:

- Backend: 27 arquivos, 198 testes (108 unitários e 90 de integração/API).
- Frontend: 25 arquivos, 83 testes.
- Scripts de política/CI: 10 testes.

Os testes de integração usaram MySQL `traceflow_e15_test`, criado e removido exclusivamente para a validação.

Instalações limpas com `npm ci`, lint e verificação de formatação passaram nos dois projetos. Os dez testes dos scripts de política de audit/CI também passaram.

## 17. Resultados de cobertura

- Backend: 86,52% statements; 73,39% branches; 88,72% functions; 88,82% lines.
- Frontend: 53,31% statements; 49,20% branches; 46,03% functions; 55,04% lines.

Nenhum arquivo foi excluído artificialmente da cobertura.

## 18. Resultados de build

O build Vite passou com 352 módulos. Entrada inicial: 288,57 kB (94,71 kB gzip); chunk de rastreabilidade: 188,95 kB. O backend não possui script de build: sua validação ocorre por lint, Prisma, arquitetura, testes e startup.

## 19. Resultados de segurança

- architecture check e scanner de segredos aprovados;
- audit backend/frontend e política executável: zero vulnerabilidades, zero exceções;
- lockfiles: 347 entradas backend e 308 frontend com metadata de licença; não existe gate jurídico automatizado de compatibilidade;
- migrations aplicadas do zero e status sem pendências;
- backup/restore em bancos artificiais: 21 tabelas antes/depois, temporários removidos;
- auditorias E8/E11 emitiram somente IDs técnicos e contagens.
- smoke isolado na porta 31015: health, live e ready retornaram `200`; rotas protegidas sem sessão retornaram `401` seguro; o teste autenticado preserva o único `501`.

## 20. Riscos residuais

- convite/access code e models/aliases de compatibilidade ainda ativos;
- oito responsáveis e dez movimentos sem identidade comprovável;
- exclusão de projeto não definida;
- rate limit e lock GitHub locais à instância;
- secret manager, backup agendado, monitoramento e configuração de proxy/TLS dependem do deploy;
- ausência de SBOM, gate de licenças e E2E real;
- validação jurídica LGPD pendente.

## 21. Limitações conhecidas

O smoke externo do GitHub não foi executado porque exigiria credencial/repositório reais e efeito externo; clients e fluxos permanecem cobertos por testes sem rede. A branch protection remota não foi alterada nem pode ser comprovada pelo checkout. Não há script de smoke ou build backend dedicado.

## 22. Pendências futuras convertidas em issues

Treze itens identificados foram registrados com requisito, impacto, prioridade e condição de início em `docs/issues/TECHNICAL_BACKLOG.md`. Não foram abertas issues remotas, pois a tarefa proíbe push/PR e não autoriza mutação no GitHub.

## 23. Critérios de aceite

- arquitetura, rotas, API, autorização e matriz RF reconciliadas;
- todos os candidatos classificados; nenhuma remoção sem evidência;
- migrations históricas intactas e dados sem prova preservados;
- nenhum model genérico reintroduzido e apenas um `501` documentado;
- TODOs de runtime resolvidos ou convertidos em backlog;
- runbooks, evidências ASVS/LGPD e riscos explícitos;
- lint, format, migrations, testes, cobertura, build, arquitetura, secrets e audits aprovados.

## 24. Conclusão da etapa

**Estado: CONCLUÍDA COM RESSALVAS.**

O plano de refatoração foi encerrado com o código e a documentação reconciliados. As ressalvas são operacionais, jurídicas e contratos legados com dados/consumers reais; removê-los na E15 violaria a política de preservação. Não há falha funcional conhecida nos gates executados, mas não se declara conformidade integral ASVS/LGPD nem prontidão operacional sem as validações externas listadas.
