# TRACEFLOW S1-09 — COPILOT REVIEW TARGETED CORRECTIONS REPORT

Date: 2026-09-12  
Branch: `daniel-dev`  
HEAD: `fba81a413978dfb58c1fa6570eb252a81967d19d`  
PR: [#20](https://github.com/iYoNuttxD/Traceflow/pull/20)

## Resultado e baseline

**S1-09 COPILOT REVIEW TARGETED CORRECTIONS — PASS LOCAL.**

BLOCKING conhecidos restantes no escopo desta rodada: **0**. IMPORTANT conhecidos
restantes no escopo desta rodada: **0**. A revalidação independente final permanece
pendente; este relatório não encerra S1-09 nem aprova o merge.

Baseline consultada nesta rodada: árvore limpa; branch/HEAD acima; PR OPEN,
base `main@205b6def1af2231bbbe855de01df3eef2686a3db`, head igual ao HEAD local,
MERGEABLE e mergeStateStatus BLOCKED. Os cinco checks remotos estavam SUCCESS
(Quality, Backend Tests, Frontend Tests, Supply Chain e Dependency Review), com
CI `34712784053`. Esses checks validam a baseline publicada, não este diff local
sem commit. Nenhum thread foi resolvido e nenhuma ação de escrita foi feita no GitHub.

## Findings

| Finding | Severity do comentário | Valid? | Root cause | Fix | Regression |
|---|---|---|---|---|---|
| Personal export TestCases | HIGH | Não se aplica como vazamento na baseline | `User.responsibleTestCases` já limita `responsibleUserId` pelo vínculo Prisma | Predicado explícito `responsibleUserId: userId`, sem ampliar escopo | A recebe TC-A, não TC-B; teste passou antes e depois |
| Personal export Executions | HIGH | Não se aplica como vazamento na baseline | `User.testExecutions` já limita `executedByUserId` | Predicado explícito `executedByUserId: userId` | A recebe EXEC-A, não EXEC-B nem ator nulo com snapshot de nome igual ao de A |
| Personal export Evidence | HIGH | Não se aplica como vazamento na baseline | `User.testEvidence` já limita `uploadedByUserId` | Predicado explícito `uploadedByUserId: userId` | A recebe EV-A, não EV-B nem uploader nulo; nome, hash e referência da evidência de B ausentes |
| Projection materializes full project | MEDIUM | VALID / FIXED | Service carregava todas as projeções detalhadas antes de filtrar e fazer slice | Agregados escalares em lotes, classificação canônica e detalhes apenas dos IDs da página | Baseline carregou 60 detalhes para retornar 20; após fix carrega exatamente os IDs retornados, inclusive filtro de 17 com página de 5 |
| EvidenceViewer stale mediaError | MEDIUM | VALID / FIXED | Estado de erro não acompanhava mudança de `file.id` na mesma instância | Effect dependente de `file.id` limpa `mediaError` | Image/video A falha → B → C válidos, sem key/remount; erro de C → PDF D |

Não foram fabricadas três regressões vermelhas de privacidade. A suíte real S1-07,
com o novo cenário cross-user e o repository ainda sem os predicados explícitos,
passou **30 testes**. Membership e ownership eram combinados pela consulta
`prisma.user.findUnique({ where: { id: userId }, select: ... })` e suas relações.
Os predicados solicitados tornam esse limite explícito, mas não são apresentados
como correção de três vazamentos comprovados.

Antes das correções funcionais, o teste de paginação falhou comparando 60 IDs
detalhados com os 20 IDs da página. Os dois novos testes do viewer falharam no
preview B (33 passaram, 2 falharam). Após os fixes, essas mesmas asserções passaram.
Uma seleção pontual por `-t` omitiu testes fora do filtro; isso não acrescentou
skips ao código. Erros iniciais de preparação de fixture/instrumentação foram
corrigidos nos testes, sem tratá-los como falhas de produto.

## Personal export audit

Inspecionados o select completo de `settingsRepository.exportData`, as relações
do schema e todas as seções produzidas por `buildExportArchive`. A/B abaixo são
usuários distintos, ambos com membership ativa no mesmo projeto. A classificação
de acesso foi mantida: dado da conta; colaboração própria; contexto compartilhado
de projeto autorizado. Exportação pessoal não foi convertida em backup do projeto.

| Export collection | Scope contract | Filter implemented | Cross-user regression / evidência |
|---|---|---|---|
| profile | Conta do titular | User por ID; allowlist de campos | Revisão do select + testes de settings/ZIP |
| memberships | Participações atuais do titular | Relação User + `isActive: true` | Settings API: membership antiga excluída |
| projects | Contexto dos projetos atualmente autorizados | Projetos das memberships ativas; metadata minimizada | Settings API: projeto antigo ausente |
| requirements | Conteúdo compartilhado dos projetos autorizados | Requirements dos projetos acima | Settings API: requisito de projeto antigo ausente; autoria individual não é o contrato desta coleção |
| test-cases | Responsabilidade própria | Relação User + `responsibleUserId`, membership ativa, `deletedAt: null` | Novo teste real A/B; A preservado, B excluído |
| test-executions | Execuções próprias | Relação User + `executedByUserId`, membership ativa | Novo teste A/B e ator nulo; não usa nome histórico |
| test-evidence | Uploads próprios, apenas metadata | Relação User + `uploadedByUserId`, membership ativa; sem storageKey | Novo teste A/B, uploader nulo e minimização |
| tasks | Responsabilidade própria | `responsibleTasks` por ID canônico + membership ativa | Select/schema inspecionados; settings API exclui projeto antigo |
| task-comments | Autoria própria, corrente | `taskComments` via authorUserId + membership ativa + deletedAt nulo | Settings API exclui comentário apagado e projeto antigo |
| task-time-entries | Sessões próprias encerradas | `startedTimeEntries` via startedById + membership ativa + endedAt não nulo | Settings API exclui sessão aberta e projeto antigo |
| sessions | Sessões do titular | Relação User; publicId e metadata, sem hash de sessão | Select/schema e minimização do ZIP; suites de auth/settings |
| privacy-requests | Solicitações do titular | Relação User; campos permitidos | Select/schema; suite privacy-governance |
| data-exports | Metadata das exportações do titular | Relação User; sem bytes ou credenciais | Select/schema; settings/privacidade |
| email-change-history | Histórico de e-mail do titular | Relação User; sem token/hash de confirmação | Select/schema; settings/privacidade |
| audit-events | Eventos cujo ator é o titular | Relação User via actorUserId; metadata minimizada, sem IP/payload | Select/schema; testes de auditoria/privacidade |
| github-identity | Identidade vinculada ao titular | Relação individual User; sem OAuth token | Select/schema; testes de settings/auth |
| github-integrations | Autorizações pessoais e contexto autorizado | Autorizações via User; integrações da instalação limitadas a projetos com membership ativa | Select/schema; suites de settings/privacidade; nenhuma autorização pessoal de B selecionada |

`manifest.json` é metadata técnica gerada. Convites, credenciais, tokens de reset,
states OAuth/SMTP, códigos de acesso a projeto e conteúdo binário dos uploads não
foram acrescentados ao arquivo. Não se encontrou outra coleção own-only filtrada
somente por membership. Não há nova regressão A/B dedicada para cada uma das
coleções antigas: a tabela distingue inspeção de implementação e testes existentes
da nova prova integrada das três coleções de qualidade.

O novo cenário também desativa a membership de A e comprova as três coleções de
qualidade vazias. `TestCase.responsibleUserId` é obrigatório no schema; valores nulos
legítimos foram exercitados em executor/uploader. Nenhuma atribuição por nome ou
e-mail foi introduzida. Permanecem as limitações documentadas de conteúdo livre,
arquivos históricos e cobertura não integral de históricos funcionais; esta rodada
não redefine sua política nem promete anonimização universal. Nenhuma nova OPEN
QUESTION de ownership foi necessária para as coleções atualmente exportadas.

## Projection performance e autoridade

Antes: `full project projection → filter → slice` no service.

Depois, no repository e em uma transação RepeatableRead:

1. Ler até 200 IDs/títulos por cursor `id DESC`.
2. Consultar contagens escalares de implementação, validação e defeitos desses IDs.
3. Aplicar as autoridades existentes `getImplementationStageFromCounts`,
   `deriveSituation`, `deriveRequirementLifecycleStatus`, `matchesProjection` e
   `projectionSummary`; acumular summaries e reter somente os IDs da página.
4. Carregar o payload detalhado uma vez, limitado a esses IDs.

SQL agrega fatos relacionais; não decide lifecycle/situação. A regra de estágio
técnico foi extraída sem alteração de comportamento para ser compartilhada pela
projeção detalhada e pela classificação dos agregados. GET continua sem escrever
cache ou histórico; nenhuma dependência do State persistido como autoridade.

| Requirements | limit | Lotes escalares | Requirements detalhados | Leituras SQL de dados |
|---:|---:|---|---:|---:|
| 1 | 20 | 1 | 1 | 15 |
| 20 | 20 | 20 | 20 | 15 |
| 100 | 20 | 100 | 20 | 15 |
| 201 | 20 | 200 + 1 | 20 | 17 |

Contagens são asserções sobre queries reais (`SELECT`/`WITH`), separadas de
SET/BEGIN/COMMIT. A instrumentação também inspeciona `take`, IDs retornados pela
carga detalhada e `where.id.in`. A fixture tem TestCase/Defect compartilhados por
Tasks dos requisitos, verificando deduplicação de vínculo direto e indireto.
Não há consulta individual por Requirement, TestCase ou Defect.

A fixture adicional de **60** requisitos comprova páginas 1/2 de 20 sem duplicados,
total 60 e 3 páginas; filtro **17 EM_CORRECAO**, limit 5, total 17 e 4 páginas;
summary global preservado; filteredSummary do conjunto de 17; página fora do total
sem carga detalhada. Search por REQ-id/título, páginas de busca e filtros combinados
continuam equivalentes ao resultado da projeção completa de referência. Os testes
de lifecycle existentes também comparam a listagem filtrada ao current detalhado.

Limite: summaries exatos ainda exigem ler métricas do projeto inteiro. O número de
consultas cresce por lote, não é constante para projetos ilimitados. O payload
detalhado fica limitado aos requisitos da página e suas relações; uma única cadeia
pode conter muitas relações. Não foi usado limite frágil de tempo de execução.

## EvidenceViewer

O contrato exige `file.id`; o reset acontece no effect dessa identidade, sem reset
no corpo da renderização. Testes do componente real fazem rerender sem key:
imagem/vídeo A com erro → B → C; novo erro → PDF D. PDF usa fallback nativo de object
e também deixa de herdar o erro de mídia anterior.

Os testes adicionais montam `GraphEntityDetails` e `DefectFlow` reais com APIs
simuladas, viewer e hook de conteúdo reais. Disparam A com erro e o callback de B
pelo botão do body que continua montado, embora oculto, forçando a troca sem remount;
verificam preview B e revogação das duas object URLs. É teste de integração de
componentes, não alegação de clique humano em um controle oculto. As suites existentes
também preservam download, foco, cancelamento e cleanup. Nenhum caller, hook, API de
conteúdo, CSS ou contrato de blob foi alterado. Não houve homologação manual em
navegador nesta rodada; a evidência é automatizada em DOM.

## Testes e gates locais

Runtime Node 22.23.2; frontend com `NODE_OPTIONS=--no-experimental-webstorage`.
Integração no MySQL de testes validado pelo helper canônico, com isolamento e
cleanup das fixtures. O sandbox inicialmente bloqueou conexão/rede; execuções reais
foram repetidas com acesso autorizado. Nenhum banco de desenvolvimento foi usado
para essas fixtures.

| Execução | Resultado |
|---|---|
| Privacy focused: S1-07 + settings-l2 + privacy-governance + auth-authorization + settings.service + e7-privacy-audit | 101 PASS / 6 arquivos |
| Projection focused: integração S1-09, API e policies/calculator | 79 PASS / 4 arquivos |
| Evidence focused final, incluindo callers, focus, defects e workspace/grafo | 165 PASS / 12 arquivos |
| Evidence crítica ×10, sem retry | 165 PASS em cada rodada |
| Backend unit | 757 PASS |
| Backend integration/API | 517 PASS + 5 skips legados |
| Backend coverage ×3 consecutivas | 1.274 PASS + 5 skips em cada rodada |
| Backend coverage S/B/F/L, rodadas 1; 2; 3 | 91,45/82,69/94,89/93,72%; 91,46/82,71/94,89/93,72%; 91,46/82,71/94,89/93,72% |
| Frontend full / coverage | 1.137 PASS em cada execução |
| Frontend coverage S/B/F/L | 81,84/77,03/77,51/84,00% |
| Lint / format:check | PASS backend e frontend |
| Build | PASS frontend; aviso não bloqueante de chunk size |
| Architecture | PASS |
| Secrets | PASS |
| Audit-policy e workflow-policy tests | 12 PASS |
| npm audit backend | Consulta real: 6 moderate, 0 high, 0 critical; saída npm 1 por advisories |
| npm audit frontend | Consulta real: 3 moderate, 0 high, 0 critical; saída npm 1 por advisories |
| Supply chain / audit policy canônica | PASS ambos; zero exceções; bloqueia high/critical |
| git diff --check | PASS |

Audit não foi descrito como zero vulnerabilidades: as ocorrências moderate são
residuais nas dependências já existentes (backend: Vitest e cadeia Express/qs;
frontend: Vitest). A política vigente passou sem exceções. Nenhum pacote ou lockfile
foi alterado. Os cinco skips são os canônicos de E6/E11 pré-LR.2; nenhum skip novo,
threshold reduzido ou retry foi acrescentado.

## Documentação, diff e encerramento

- `PERSONAL_DATA_INVENTORY.md` e `DATA_RETENTION_POLICY.md`: revalidados, sem mudança;
  continuam exigindo responsabilidade/execução/upload próprios e acesso atual.
- `API_CONTRACTS.md`, `REQUIREMENT_TRACEABILITY_HISTORY.md` e a seção vigente de
  `S1_09_TRACEABILITY_RULES_BASELINE.md`: descrição técnica da paginação atualizada;
  registros históricos da Etapa 1 preservados.
- Roadmap: implementação concluída, correções adicionais de review registradas e
  revalidação independente final pendente; S1-09 não marcado CONCLUÍDO.
- Diff integral inspecionado, incluindo arquivos novos. Schema/migrations,
  package.json/lockfiles e contratos de autorização preservados. Sem segunda policy
  de situação, inferência de identidade, paginação cosmética ou debug de produção.
- Temporários desta rodada removidos após consolidar evidências neste relatório.
  Nenhum arquivo preexistente foi limpo. Sem commit, push, merge, rebase, reset,
  clean, stash ou alteração de threads remotos. HEAD permanece o da baseline.

Próximo passo: **revalidação independente final**, incluindo estes cinco comentários,
diff final e CI da revisão publicada. Trabalho desta rodada encerrado aqui.
