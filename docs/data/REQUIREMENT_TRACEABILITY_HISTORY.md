# Requirement — projeção e histórico de rastreabilidade (S1-09, Etapa 2)

## Autoridade e separação

As decisões humanas da Etapa 2 substituem as propostas abertas da Etapa 1. O [baseline](../traceability/S1_09_TRACEABILITY_RULES_BASELINE.md) conserva a auditoria original e registra a resolução. A nova `situation` é derivada; não é um workflow manual nem escreve `Requirement.status`.

O terminal real de Requirement é **CONCLUIDO**. APROVADO é também produzido automaticamente quando todas as Tasks estão A_FAZER; não representa o aceite terminal exigido para concluir a cadeia. VALIDADO persistido significa todas as Tasks concluídas no recálculo antigo, sem comprovar TestExecution PASS.

O calculator compartilhado mantém `getImplementationStatus`, inclusive seu override por Requirement.status=CONCLUIDO. `getImplementationStage` extrai a mesma regra de Tasks/evidência sem esse override. A nova projeção usa esse estágio; os DTOs antigos permanecem iguais.

## Implementação herdada

- Progresso: Tasks atuais CONCLUIDO / total, arredondado a duas casas; denominador zero resulta em percentage=null e hasData=false; escalar legado zero.
- Média antiga: média por Requirement dos percentuais já arredondados, incluindo zero para requisito sem Tasks; não ponderada por quantidade de Tasks.
- Evidência técnica: ao menos um PR ou TaskCommit ligado às Tasks do Requirement. Issue não conta; não se exige merge, referência por Task ou upload.
- IMPLEMENTADO: pelo menos uma Task, todas CONCLUIDO e evidência técnica. Correções são Tasks comuns: entram no denominador se seu requirementId apontar ao requisito.
- Contagens de artefatos preservam número de vínculos; não prometem artefatos distintos.

## As onze situações e a precedência

A primeira condição satisfeita vence. Desde a revisão humana da Etapa 5 (2026-09-11), qualidade prioritária precede implementação incompleta. As linhas 7–11 exigem estágio técnico IMPLEMENTADO.

| Ordem | Situação | Condição |
|---|---|---|
| 1 | COM_FALHA | Defect relevante ABERTO ou passo FAIL atual sem Defect ativo que o represente, independentemente do progresso |
| 2 | EM_CORRECAO | Nenhuma condição anterior; Defect relevante EM_CORRECAO |
| 3 | AGUARDANDO_RETESTE | Nenhuma condição anterior; Defect relevante AGUARDANDO_RETESTE |
| 4 | SEM_RASTREABILIDADE | Nenhuma condição anterior e zero Tasks atuais |
| 5 | PLANEJADO | Nenhuma condição anterior; Tasks presentes, nenhuma DONE/EM_ANDAMENTO e nenhuma evidência técnica |
| 6 | EM_DESENVOLVIMENTO | Nenhuma condição anterior; trabalho iniciado/evidência presente, mas falta implementação completa |
| 7 | IMPLEMENTADO | Zero TestCases ativos relevantes |
| 8 | AGUARDANDO_VALIDACAO | Há casos relevantes e nenhum tem execução da currentVersion |
| 9 | EM_VALIDACAO | Validação iniciada, mas não são todos PASS; inclui BLOCKED e nunca executado parcial |
| 10 | CONCLUIDO | Todos os casos relevantes PASS, nenhum Defect pendente e Requirement.status=CONCLUIDO |
| 11 | VALIDADO | Mesma aprovação de qualidade, porém Requirement.status não terminal |

Um conjunto vazio não aprova validação. Defect ABERTO vence outro EM_CORRECAO; EM_CORRECAO vence AGUARDANDO_RETESTE. A ordem não depende do último evento recebido. Qualidade prioritária não espera 100% de implementação: 25% + Defect EM_CORRECAO resulta em EM_CORRECAO, mantendo 25% de progresso. Sem falhas/Defects pendentes, Task EM_ANDAMENTO continua EM_DESENVOLVIMENTO.

## TestCases, execuções e Defects relevantes

Q(R) é a união de TestCases ATIVO, não excluídos, do mesmo projeto, com requirementId=R ou ligados por TestCaseTask a uma Task cujo requirementId atual seja R. Deduplicação por TestCase.id. Uma Task reatribuída muda a relevância atual; snapshots antigos permanecem intactos.

Para cada caso, selecionar somente a última TestExecution de **currentVersion**, por executedAt DESC, id DESC. Execuções comuns e retestes participam dessa seleção. `validation.neverExecuted` significa ausência de execução dessa versão, mesmo que uma versão anterior tenha PASS. Ambiente/referência não criam outro filtro implícito. BLOCKED é execução realizada e validação incompleta; não é FAIL. A API S1-07 continua apresentando seu latestExecution histórico de qualquer versão.

D(R) é a união de Defects não excluídos do mesmo projeto com requirementId=R ou DefectTask ORIGIN → Task.requirementId=R, deduplicada por Defect.id. CORRECTION isolada não cria origem; o TestCase de detecção também não substitui os vínculos próprios do Defect. Inativar/excluir TestCase não remove um Defect pendente do agregado.

Para cada passo FAIL da execução corrente, verificar se existe Defect ativo, do mesmo projeto, com **detectedExecutionStepId exatamente igual ao passo**. A cobertura do passo não depende de o Defect estar diretamente relacionado a R: essa é uma dimensão distinta de D(R). Um passo não coberto mantém COM_FALHA, mesmo se outro está em correção. Defect removido não cobre falha atual. Defect ativo VALIDADO pode representar uma detecção antiga; um novo FAIL é outro passo. PASS comum não valida Defect; só o reteste contextual preservado de S1-08 faz isso.

## DTO atual e evidências

```json
{
  "requirement": { "id": 4, "displayId": "REQ-4", "title": "Checkout", "status": "VALIDADO" },
  "progress": { "numerator": 2, "denominator": 2, "percentage": 100, "hasData": true, "tasksTotal": 2, "tasksDone": 2 },
  "implementation": { "legacyStage": "IMPLEMENTADO", "legacyImplementationStatus": "IMPLEMENTADO", "implemented": true, "technicalEvidence": true },
  "artifacts": { "pullRequests": 1, "commits": 0, "issues": 0 },
  "validation": { "testCasesTotal": 2, "neverExecuted": 0, "pass": 2, "fail": 0, "blocked": 0 },
  "defects": { "total": 0, "open": 0, "inCorrection": 0, "waitingRetest": 0, "validated": 0 },
  "evidence": { "implementation": true, "validation": true, "correction": "NOT_APPLICABLE" },
  "hasUntreatedFailure": false,
  "situation": "VALIDADO"
}
```

- `evidence.implementation`: o booleano técnico herdado.
- `evidence.validation`: existe pelo menos uma execução relevante da versão atual, independentemente de PASS/FAIL/BLOCKED.
- `evidence.correction`: NOT_APPLICABLE quando D(R) atual é vazio; PRESENT se cada Defect atual tem CORRECTION Task no ciclo atual com PR/commit e pelo menos um reteste contextual desse ciclo; MISSING nos demais casos. Não significa reteste PASS nem garante correspondência exata entre referência retestada e artefato da correção. Não afirma que jamais existiu Defect excluído.

Flags são projeções informativas. A presença de artefato de correção não foi aprovada como uma exigência adicional de CONCLUIDO; as relações/status canônicos governam a situação.

## Persistência funcional

Migration incremental `20260910120000_s109_requirement_traceability` cria:

- `RequirementTraceabilityState`: id, requirementId UNIQUE, currentSituation, updatedAt. FK Requirement CASCADE: o estado atual desaparece com a exclusão física do requisito.
- `RequirementTraceabilityHistoryEntry`: id, projectId, requirementId, fromSituation nullable, toSituation, reason, sourceEntityType/id opcionais, metadataJson, occurredAt. Índice por projectId/requirementId/occurredAt/id. requirementId e sourceEntityId são identidades históricas sem FK ao recurso removível; excluir Requirement/Task não apaga entradas. FK Project CASCADE define retenção pelo ciclo do projeto.
- Índice de TestExecution por testCaseId/testCaseVersion/executedAt/id para a seleção corrente. Migrations anteriores não foram alteradas.

Contadores não são persistidos. metadataJson contém somente rulesVersion (2 nas entradas criadas após a revisão da Etapa 5; 1 nas entradas anteriores, preservadas); sem cópias de PII, conteúdo de testes, arquivos, tokens ou snapshots artificiais. O histórico é de transições de situação, não de cada mudança de progresso. AuditEvent técnico mantém sua finalidade e retenção próprias.

Primeira observação: uma entrada BASELINE_INITIALIZED, fromSituation=null, toSituation calculada no momento da adoção. Pode acontecer no script ou na primeira mutação abrangida. Não se inventa o caminho anterior. Mesmo em Requirement recém-criado usa-se essa razão inicial, com sourceEntityType=Requirement e seu ID. Depois, somente from!=to grava estado e histórico na mesma transação. No-op não altera updatedAt nem insere entrada. GET não inicializa nem reconcilia.

Uma nova versão pode regredir CONCLUIDO para AGUARDANDO_VALIDACAO/EM_VALIDACAO. A conclusão antiga continua registrada. Nenhum endpoint permite editar/apagar transições ou definir situação manualmente. O histórico de um Requirement fisicamente excluído permanece no banco, mas não é exposto pela rota operacional de um requisito inexistente (404).

## Reconciliação e concorrência

`traceabilityMutation` / `traceabilityTransaction` são a fronteira de repositório compartilhada, sem import de services de Task/TestCase/Defect. Project é o primeiro lock; as operações originais mantêm depois seus locks de Sprint/Task/Defect/TestCase. Transações de escrita usam ReadCommitted, com o orçamento existente de 15 segundos, sem retry/sleep. Reconciliação externa também adquire Project antes de carregar dados e estado, cobrindo inicialização concorrente sem State existente.

A fronteira captura IDs afetados antes/depois, executa a mutação canônica e reconcilia a união. State+history e mutação compartilham a transação. Falha de histórico impede o commit inteiro; não há uma resposta de sucesso seguida por rollback de mutação já confirmada. Reteste reconcilia após registrar execução e completar a transição de Defect, evitando eventos intermediários falsos.

| Mutação | Alcance reconciliado |
|---|---|
| Requirement create/update/status/confirmCompletion/delete | Requisito e caminhos atuais afetados por suas Tasks; histórico preservado no DELETE |
| Replacement de Requirement.tasks | Conjuntos antigo/novo, Tasks movidas e qualidade compartilhada |
| Task create/update/delete/reassignment | Requirement anterior/novo; casos ligados e seus demais Requirements; Defects ORIGIN/CORRECTION e Requirements afetados |
| Task movement | Mesmo alcance, depois do recálculo canônico dos Defects de correção |
| PR/commit/issue attach/detach | Requirement da Task e dependências compartilhadas; Issue mantém o booleano técnico falso quando isolada |
| Confirmação RF41 | Requirements alcançados pela Task cujo TaskCommit foi confirmado |
| TestCase create/update/status/version/delete | União dos Requirements alcançados antes e depois |
| TestExecution comum | Requirements atuais do TestCase |
| Defect create/update/relink/delete/correction | Vínculos próprios antigos/novos, Requirements de Tasks de correção criadas e casos alcançados pela detecção |
| DefectRetest PASS/FAIL/BLOCKED | Requirements do TestCase e do Defect, após lifecycle canônico |

GitHub sync auditado importa/atualiza metadados de PR/commit/issue e sugestões; não cria/remove TaskCommit, TaskIssue ou Task.pullRequestId. Estado/merge/metadados do GitHub não participam da evidência antiga. Logo sync não tem transição S1-09 a reconciliar. A confirmação humana RF41, que efetivamente cria o vínculo, possui o hook. Operações de Sprint/marco alteram escopo de planejamento, não status/requirementId técnico; snapshots congelados permanecem intactos. Neutralização de nomes por privacidade também não altera os predicados.

## Reconciliação após revisão da policy

```bash
cd backend
node scripts/reconcile-requirement-traceability.js --project-id=4 --dry-run --policy
node scripts/reconcile-requirement-traceability.js --project-id=4 --apply --policy
```

O ID acima é ilustrativo; conferir o ambiente e o projeto antes de aplicar. `--policy` usa a razão `TRACEABILITY_POLICY_RECONCILIATION`, apresentada como “Situação reconciliada após atualização das regras de rastreabilidade”. Sem a flag, a razão continua `RECONCILIATION`. Primeira observação permanece `BASELINE_INITIALIZED`. Nenhuma entrada anterior é reescrita; somente uma diferença de situação produz transição e estado no mesmo commit transacional. A segunda reconciliação sem mudança insere zero entradas, sem alterar `updatedAt`.

## Inicialização e recuperação operacional

```bash
cd backend
node scripts/reconcile-requirement-traceability.js --project-id=4 --dry-run
node scripts/reconcile-requirement-traceability.js --project-id=4 --apply
```

O padrão é dry-run; requer project-id positivo e rejeita flags desconhecidas/contraditórias. Não executa migrations, não reseta DB e não expurga dados. Informa quantidade de requisitos, quantidade sem State e transições previstas com from/to. Apply usa a mesma policy/transação do runtime; reexecutar não duplica eventos. Divergência real de um State existente registra RECONCILIATION, sem reconstrução retroativa.

A ferramenta deve ser apontada ao ambiente pretendido pelo operador via DATABASE_URL. Nesta entrega somente bancos locais descartáveis foram usados para mutações e adoção; aplicação da migration e do baseline no ambiente de desenvolvimento/produção é uma operação posterior de implantação.

## Consultas, filtros e limites

Endpoints GET sob `/api/projects/:projectId/traceability`:

- `/requirements`: listagem nova para cards, com items, summary global, filteredSummary e pagination.
- `/requirements/:requirementId/current`: um DTO atual completo.
- `/requirements/:requirementId/history`: `{items,nextCursor}`, ordem occurredAt DESC/id DESC; limite padrão 30, máximo 100; cursor vinculado ao projeto/requisito.

Filtros: search (título sem diferenciar maiúsculas ou REQ-id exato), situation (11 valores), requirementStatus (enum vigente), hasTests, hasOpenDefects, hasTechnicalEvidence. Booleanos aceitam true/false; hasOpenDefects significa qualquer Defect pendente (ABERTO/EM_CORRECAO/AGUARDANDO_RETESTE). Lista usa page=1, limit=20, máximo 100 e ordenação por Requirement.id DESC. Os filtros são aplicados no servidor ao conjunto completo antes do recorte da página, nunca pelo frontend à página recebida.

summary.bySituation contém todas as onze contagens; withDefect soma COM_FALHA+EM_CORRECAO+AGUARDANDO_RETESTE. Não reúne VALIDADO com EM_VALIDACAO implicitamente. filteredSummary usa o conjunto filtrado; summary permanece global.

Leitura de projeção usa snapshot RepeatableRead e grupos de consultas Prisma por domínio, com seleção SQL correlacionada/indexada da execução corrente. Não carrega histórico inteiro de execuções, uploads ou arquivos. Uma execução corrente por caso; reteste mais recente por Defect. O custo de consultas observado foi **11 para 1 e para 20 Requirements** com qualidade. Não há N+1 por Requirement/TestCase/Defect.

**Limite de escala explícito:** a listagem carrega o agregado atual de todo o projeto e filtra/pagina em memória no servidor, para manter uma policy única e summary coerente sem depender da adoção do State persistido. Volume de Tasks, vínculos, casos e correções cresce com o projeto, apesar do número constante de consultas. Não é paginação SQL de toda a cadeia nem benchmark de projetos ilimitados. O histórico tem paginação no banco. O grafo legado, inclusive sua limitação de métricas sobre a página identificada na Etapa 1, permanece intacto nesta etapa; o novo current não usa esse recorte.

Leituras exigem membership ativa VIEWER/MEMBER/MANAGER/OWNER. Sessão ausente → 401; projeto sem acesso ou requisito de outro projeto → 404 opaco. Não existe API de escrita manual de situation.

## Verificação

Policy, projeção/DB, transações/reconciliação, API/IDOR/cursor e contagem de queries são cobertos nas suítes `requirement-traceability.test.js`, `s109-traceability.test.js` de integração e API. A evidência de gates, repetibilidade e migrations está no [relatório da Etapa 2](../deliveries/S1_09_BACKEND_PROJECTION_SITUATION_HISTORY_REPORT.md). Cards, filtros visuais, summary novo, histórico visual e expansão do React Flow permanecem pendentes.
