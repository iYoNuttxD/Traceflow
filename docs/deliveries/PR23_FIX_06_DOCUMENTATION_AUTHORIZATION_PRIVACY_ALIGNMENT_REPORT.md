# PR23-FIX-06 — Documentation, Authorization & Privacy Alignment

Data: 08/10/2026. Escopo técnico do repositório; documentos acadêmicos oficiais não alterados.

## 1. Baseline

- Checkout: `/Users/daniel/Coding/Traceflow`; branch `daniel-dev`.
- HEAD: `e5a52fa0f478aa1e25865d4f91b3f967e815b9f5`.
- Working tree inicialmente limpa; `git diff --check` e `git diff --stat` sem saída.
- Shell: Node 26.10.0 / npm 11.19.1. Gates: **Node 22.23.3 / npm 10.9.9**.
- Sem commit/push, reescrita Git, screenshots, mudança de indicador, Health ou UI.

## 2. Review findings addressed

Conferidos autorização, export, schema/migrations, anonimização, membership/purge, rotas frontend,
catálogo, inventário, roadmap e relatórios IND-P*/PR23-FIX-01…05. A única alteração de domínio é a
minimização da preferência pessoal ao encerrar a participação. A documentação foi ajustada ao
comportamento real; não foi alterado o produto para coincidir com texto antigo.

## 3. Authorization route inventory

Prefixo de todas as rotas: `/api/projects/:projectId`. Fronteira comum: sessão autenticada,
conta ativa, projeto acessível e membership ativa. Papel mínimo **VIEWER**, inclusive preferência.

| Método | Sufixo | Escopo | Leitura/escrita |
| --- | --- | --- | --- |
| GET | `/indicators/progress` | Projeto autorizado | Leitura |
| GET | `/indicators/activity` | Projeto autorizado | Leitura |
| GET | `/indicators/github` | Projeto autorizado | Leitura |
| GET | `/indicators/tasks` | Projeto autorizado | Leitura |
| GET | `/indicators/sprints` | Projeto autorizado | Leitura |
| GET | `/indicators/quality` | Projeto autorizado | Leitura |
| GET | `/indicators/traceability` | Projeto autorizado | Leitura |
| GET | `/indicators/dashboard` | Projeto autorizado | Leitura |
| GET | `/indicators/catalog` | Projeto autorizado | Leitura |
| GET | `/indicator-preference` | Próprio usuário/projeto | Leitura sem escrita |
| PUT | `/indicator-preference` | Próprio usuário/projeto | Save explícito; CSRF |
| DELETE | `/indicator-preference` | Próprio usuário/projeto | Reset explícito; CSRF |

Extração de `indicators.routes.js` confrontada com a matriz: **12 rotas, zero ausências**.
Health compacto usa dashboard `view=GENERAL&healthOnly=true`; não existe endpoint adicional.

## 4. Indicator endpoint authorization

Sessão ausente: 401. Projeto inacessível/membership ausente ou inativa: 404 opaco.
Policy central e repository exigem projeto não excluído e membership ativa. OWNER é contextual,
não admin global. Mutações pessoais revalidam a participação sob locks na transação.

## 5. VIEWER personal-preference exception

VIEWER permanece read-only no domínio compartilhado; pode ler/salvar/resetar apenas sua
personalização. O controller deriva `userId` da sessão. Corpo não escolhe titular. A documentação
não concede escrita em Tasks/Requirements/Sprints pela exceção.

## 6. ProjectDashboardPreference privacy inventory

Campos reais: `id`, `projectId`, `userId`, `configurationVersion`, `configuration` JSON,
`createdAt`, `updatedAt`. Unique usuário/projeto, índice userId e cascades para Project/User.
Finalidade: seleção e ordem pessoais, sem armazenamento de resultados analíticos.
GET tolerante a legado é apresentação apenas; novos saves continuam estritos (FIX-05).

## 7. Personal export audit

Conferidos no serviço os 23 arquivos de dados e `manifest.json`, listados no
[inventário](../privacy/PERSONAL_DATA_INVENTORY.md). Explicitados:

- `indicator-preferences.json`: titular e projetos acessíveis/membership ativa;
- `task-responsibility-movements.json`: responsabilidade persistida no movimento;
- `github-authored-commits.json`: identidade GitHub por ID exato, nunca nome/email heurístico.

O teste de ZIP agora confere presença e conteúdo dos três arquivos, além do manifest e ausência
de hashes/tokens. Teste de repository/API confirma exclusão de preferências de projetos inacessíveis
sem vazar dados de outro usuário. Não se prometeu export integral de todos os dados do projeto.

## 8. SprintBurnupEvent retention

Conferidos schema e migrations `20260925120000_s2_p5_1_sprint_burnup_history` e
`20260925123000_s2_p5_1_burnup_project_scope`. Eventos guardam pontos/status/tempo e `taskKey`,
sem nome, email ou ator pessoal. A chave não tem FK Task: eventos sobrevivem à exclusão da tarefa.
Soft delete preserva; hard purge Sprint/Project faz cascade. Correlação técnica indireta é possível;
não se inventou titular, arquivo pessoal ou prazo autônomo de retenção.

## 9. Per-person indicator privacy assessment

I02/I03/I05: finalidade de contexto técnico, `userId`/`displayName`/contagens, visibilidade VIEWER+
no projeto. Identificação por GitHub ID ou snapshot de responsabilidade, com elegibilidade de
contas/membros ativos. Sem correspondência por texto. Pessoas ordenadas por nome/ID; contagens
sem vínculo elegível permanecem em grupo sem associação. I05 mantém unidades separadas.
Sem score humano, ranking ou leaderboard. No Health, são contexto. I36 é esforço planejado da
Sprint e não representa RF36 por pessoa. Retenção acompanha fontes, sem perfil analítico persistido.

## 10. Membership deactivation behavior

Antes: `setActiveSafely(false)` desativava membership, mas retinha preferência inacessível ao
usuário/export. Não foi encontrado requisito explícito de recuperar esse layout ao reativar.
Decisão: minimização por par usuário/projeto, tanto na remoção pelo OWNER quanto na saída voluntária.
Reativação retorna default e permite novo save. Desativação reversível da conta e soft delete de
projeto continuam operações distintas, com retenção preservada conforme implementação.

## 11. Privacy code changes, if any

`project-membership.repository.js`: `deleteMany({where:{projectId,userId}})` na mesma transação
serializável do estado de membership/audit, após os guards de último OWNER. Locks existentes
Project → membership também serializam o save pessoal. Nenhum cleanup assíncrono/global.
Falha de audit causa rollback da participação e da preferência. Outras preferências permanecem.
Anonimização já removia preferências; foi acrescentada assertion explícita ao teste existente.
Purge real e soft delete/restore continuam cobertos pelo teste existente de preferência.

**No migration required.** Nenhuma alteração de schema, migration aplicada ou banco de desenvolvimento.

## 12. UI Surface Inventory corrections

- Workspace e Geral: `/projects/:projectId/indicators`, `IndicatorsScreen`/`DashboardPanel`.
- Meu Painel/editor: `components/CustomDashboard` e `components/DashboardEditor`.
- Overview: `ProjectDetailsScreen` com `ProjectHealthSummary` compacto; não dashboard completo.
- Cinco entradas canônicas explícitas; ID histórico do Health detalhado preservado e explicado.
- Corrigida linha corrompida de pesquisa de marcos; normalizados statuses fora da taxonomia.
- FeedbackRegion documentado conforme transient/inline real, sem alegar inexistência de toast/help.

Sem nova homologação visual. Entradas novas têm TECHNICALLY VERIFIED. Status antigos de validação
foram normalizados conservando evidência e limitações existentes, sem promoção por inferência.

## 13. Surface count reconciliation

Resumo antigo: 213, divergente do corpo. Auditoria encontrou 226 linhas completas e uma linha
canônica corrompida: 227 registros antes das cinco entradas explícitas desta rodada.

Censo final: **232** surfaces. Visual: C2 COMPLETE 200; LEGACY 1; HYBRID 18; NOT REVIEWED 13;
NOT APPLICABLE 0. Validação: VISUALLY APPROVED 61; TECHNICALLY VERIFIED 170;
STRUCTURALLY IDENTIFIED 1; ENVIRONMENT BLOCKED/NOT VALIDATED 0.

O censo inclui somente tabelas de 19 colunas; apêndices históricos menores não são novas surfaces.
IDs com e sem backticks são considerados. `scripts/check-ui-inventory.mjs` rejeita IDs duplicados,
colunas inválidas, status desconhecidos e resumo divergente. `--write` é explícito; CI apenas valida.
Três testes cobrem documento real e regressões de counts/status/estrutura; sem dependência nova.

## 14. FRONTEND_STRUCTURE corrections

Documentadas as fronteiras routes → pages → features → client compartilhado em
`frontend/src/api/http-client.js`. Rotas/owners confrontados com AppRoutes e consumers atuais.
Overview não monta DashboardPanel; Health compacto usa `healthOnly`. Preservados generation guards,
request por aggregate e autoridade de cálculos no backend.

## 15. P10 terminology correction

Relatório, catálogo, roadmap e heading do log descrevem IND-P10 como **revisão interna final**.
Matriz RF recebe a distinção. Busca conferiu ausência de caracterização indevida do P10; referências
legítimas a cálculo independente e à revisão S1-09 não foram substituídas globalmente.

## 16. Roadmap phase naming

Prefixo canônico **IND-P***. S2-01…S2-10 continuam cartões do roadmap. Nomes de arquivos históricos
não foram alterados; 25 relatórios receberam notas curtas de alias e link ao mapeamento.
Novas entregas PR23-FIX-* permanecem inequívocas.

## 17. Phase → card mapping

[Tabela canônica](../../TRACEFLOW_ROADMAP_INCREMENTAL.md#fases-internas-de-indicadores-ind)
cobre IND-P0…P10 e subfases. Motor/produtividade vinculados a S2-04; qualidade/auditabilidade/
consolidação/personalização a S2-05; fundação, histórico e validações transversais explicados.
Não equivale fase = cartão, não cria RF oficial, não encerra S2-04/S2-05 automaticamente.
Escopo dos demais cartões não alterado.

## 18. Duplicate P8.6C disambiguation

- **IND-P8.6C-1**: `S2_P8_6C_FINAL_INDICATORS_VALIDATION_REPORT.md`, 28/09/2026.
- **IND-P8.6C-2**: `S2_P8_6C_INDICATORS_VISUAL_DATA_HARDENING_REPORT.md`, 03/10/2026.

Links recíprocos e roadmap distinguem a validação inicial do hardening posterior. Decisões como
Overview sem CTA são atribuídas à -2, não retroativamente à -1.

## 19. RF matrix alignment

RF55 conserva fórmula/regra, fonte e clock sob demanda (FIX-02/FIX-02.1). Referências da matriz
apontam workspace atual, autorização e privacidade com componentes/testes reais. Não alterados
RFs oficiais, Health, fórmulas ou resultados funcionais dos fixes anteriores.

## 20. Documentation link validation

Verificação dos destinos relativos dos documentos modificados: sem destino ausente após retificação.
Pacote P8.4 já retificado no FIX-02: caminhos foram preservados como texto histórico, não links válidos.
Também ausentes neste checkout/índice: pacotes binários FIX-02/FIX-02.1 citados no inventário/log.
Observações históricas foram preservadas, mas as entradas de ajuda foram alinhadas a
TECHNICALLY VERIFIED sem alegação de arquivos disponíveis. Isso não altera o status funcional RF55.
Não foram criadas imagens ou provas retroativas. Links novos de fases apontam arquivos existentes.

## 21. Tests

Focados iniciais: 5 arquivos / **109 testes PASS** (autorização, preferências, privacidade,
settings/export, exclusão de projeto). Inclusos testes novos de deactivate/leave, escopo exato,
reactivate/default, rollback e guard último OWNER. Testes de export/anonimização foram reforçados
em seguida; execução focada final: **6 arquivos / 122 testes PASS**, além da cobertura completa final.

Runtime funcional exercitado por servidor Express real em listener IPv4 efêmero, sessão/CSRF,
HTTP e Prisma no schema isolado: save → deactivate/leave → preferência removida → 404 → reactivate
→ default → novo save. Não houve navegador ou captura; o fluxo alterado é transacional backend.

## 22. Database isolation

`TEST_DATABASE_URL` obrigatório; credencial `tf_fix04_qa_20261006` restrita ao schema
`traceflow_pr23_fix04_test_20261006`. Preflight confirmou schema e read_only=0; tentativa de leitura
de `traceflow.Project` foi negada pelo MySQL. URL implícita usa a mesma credencial restrita em schema
inexistente e também foi negada. Nenhuma credencial de desenvolvimento entrou no processo de testes.

Suites com persistência executadas sequencialmente, usando os guards canônicos de identidade da
base na transação de cleanup. Sem fallback de TEST_DATABASE_URL para DATABASE_URL.
Preflight repetido após os testes: mesmo schema; leitura de desenvolvimento e conexão implícita novamente negadas.
Arquivos privados de execução/credencial permanecem ignorados; nenhum segredo neste relatório.

## 23. Full gates

| Gate | Resultado local |
| --- | --- |
| Backend focados finais | 6 arquivos, 122 testes PASS |
| Backend full | 145 arquivos PASS, 2 arquivos / 5 testes skips legados; 1.696 testes PASS |
| Backend coverage | PASS: statements 92,42%; branches 86,61%; functions 95,59%; lines 94,73% |
| Backend lint / format | PASS |
| Frontend full | 116 arquivos, 1.423 testes PASS com `--maxWorkers=1` |
| Frontend coverage | PASS: statements 85,81%; branches 80,46%; functions 81,68%; lines 88,28%; 1.423 testes |
| Frontend lint / format / build | PASS; aviso existente de tamanho de chunk |
| Prisma validate / generate | PASS; schema inalterado, sem migration nova |
| Architecture | PASS, nenhuma violação |
| CI policy / audit policy / inventário | 86 checks PASS; `validateRepositoryCi()` true |
| Quality: Prettier workflow/scripts/policy | PASS |
| Canonical dependency gate | Backend e frontend PASS; nenhuma exceção aplicada |
| npm audit completo (inclui dev) | Backend 0 / frontend 0 vulnerabilidades |
| Secret scan | PASS |
| Rotas / export / fases | 12 rotas documentadas; 23 arquivos de dados conferidos; 25 aliases históricos |
| Links relativos modificados | Destinos existentes, sem links de evidência ausente apresentados como disponíveis |
| Inventário | 232 linhas canônicas; taxonomia/counts verificados |
| git diff --check | PASS |

Comandos backend: `npm test`, `npm run test:coverage`, `npm run lint`, `npm run format:check`,
`npx prisma validate`, `npx prisma generate`, `npm run architecture:check`, `npm run security:secrets`.
Persistência sempre via wrapper local com credencial/schema isolados; ambiente implícito bloqueado.
Frontend: `npm test -- --maxWorkers=1`, `npm run test:coverage -- --maxWorkers=1`, lint, format e build.
CI local: `node --test scripts/validate-ci.test.mjs scripts/check-npm-audit.test.mjs scripts/check-ui-inventory.test.mjs`;
gates `check-npm-audit.mjs` por workspace, audit completo e `git diff --check`.
Sem mudança de thresholds, timeout, skips, retry ou configuração de paralelismo versionada.

## 24. Remaining limitations

- Esta rodada não gera aprovação visual, jurídica, operacional ou review independente.
- Dados anteriores de memberships já inativas não receberam expurgo retroativo: não há backfill
  ou varredura no banco de desenvolvimento. A regra é aplicada transacionalmente a novas saídas/
  desativações; anonimização e purge mantêm seus caminhos existentes.
- Há 5 skips legados backend; nenhum novo skip, retry ou relaxamento de assertion/timeout.
- A primeira execução frontend com paralelismo padrão teve timeouts e erros em cascata de teardown.
  Execução completa com `--maxWorkers=1` passou, sem mudança de código frontend ou limites de teste.
  O resultado inicial não foi omitido; não constitui prova de estabilidade do paralelismo nessa máquina.
- Build mantém aviso de chunk grande do grafo, fora do escopo documental.
- CI local não equivale a execução remota do GitHub Actions; não houve publicação.

## 25. Final verdict

**PR23-FIX-06 DOCUMENTATION, AUTHORIZATION & PRIVACY ALIGNMENT — PASS LOCAL**

Concluído no escopo desta rodada, com as limitações de evidência e ambiente acima. Nenhum teste
utilizou o banco de desenvolvimento; nenhuma captura ou alteração acadêmica foi produzida.
Sem commit/push. PR23-FIX-07 não iniciado; S2-04/S2-05 não promovidos automaticamente a DONE.

Sugestão de commit: `fix: align authorization privacy and indicator documentation`.
