# E10 — Requisitos e rastreabilidade canônica

## Estado

**CONCLUÍDA.** A E10 refatorou capacidades existentes, concluiu as perspectivas project-scoped de tarefa e artefato, tornou a atualização Requirement–Task atômica e removeu contratos genéricos incompatíveis com o modelo canônico. O RF41 permanece **BLOQUEADO POR AMBIGUIDADE FUNCIONAL DOCUMENTADA**, condição expressamente permitida para o fechamento desta etapa.

## Baseline

- Branch: `daniel-dev`.
- Commit inicial: `7e64243f` (`refactor(github): aprimora fluxo existente de projetos e sincronização`).
- Data: 25/07/2026.
- Baseline E9: 163 testes backend, 32 frontend; coberturas de 84,25%/70,46%/86,28%/86,91% no backend e 22,59%/22,85%/20,20%/22,81% no frontend.
- Alterações preexistentes preservadas: os PDFs do TCC e ASVS e `TRACEFLOW_MAPEAMENTO_REFATORACAO.md`, todos não rastreados.
- O schema Prisma e as 23 migrations herdadas não foram alterados.

## RFs homologados

| RF | Capacidade herdada | Trabalho E10 | Estado final |
|---|---|---|---|
| RF09 | Task → PullRequest singular | integrado às consultas canônicas | HOMOLOGADO |
| RF11 | Task ↔ Commit | integrado às consultas canônicas | HOMOLOGADO |
| RF12 | Task ↔ Issue | integrado às consultas canônicas | HOMOLOGADO |
| RF41 | sugestão Commit → Task | regra documental auditada | BLOQUEADO |
| RF48 | Requirement → Task singular no lado Task | atualização de conjunto transacional | APRIMORADO |
| RF49 | consulta por requisito | DTO único e paginação | REFATORADO |
| RF52 | consulta por tarefa | perspectiva project-scoped | CONCLUÍDO |
| RF53 | consulta reversa por artefato tipado | perspectiva project-scoped | CONCLUÍDO |

O TCC diz apenas que a mensagem contém o identificador da tarefa “no formato ID”; não define prefixo, delimitador, posição nem expressão sintática. Implementar RF41 exigiria inventar uma regex e poderia sugerir tarefas erradas. Por isso nenhuma sugestão ou vínculo automático foi criado. A futura decisão deve definir sintaxe inequívoca, exemplos positivos/negativos e compatibilidade com mensagens históricas.

## Modelo e arquitetura

A fonte de verdade continua sendo:

```text
Requirement.tasks / Task.requirementId
Task.pullRequestId
TaskCommit
TaskIssue
Commit | PullRequest | Issue
```

`TraceLink`, `GithubArtifact` e `TaskPullRequest` não foram recriados. Os nomes `REQUIREMENT_TASK`, `TASK_COMMIT`, `TASK_PULL_REQUEST` e `TASK_ISSUE` existem somente como tipos de aresta no DTO.

Antes, fórmulas de cobertura estavam espalhadas entre Requirements, Tasks e Traceability; o detalhe de requisito tinha shape próprio; perspectivas de tarefa/artefato eram placeholders genéricos; e a matriz carregava árvores completas. Agora:

```text
routes → controller → traceability service → repository → Prisma
                              ↓
                       calculator + mapper
```

- `traceability.calculator.js` é a única fonte das métricas, progresso, evidência e status derivado;
- `traceability.mapper.js` produz matriz e grafos sem PII desnecessária;
- `traceability.repository.js` executa consultas project-scoped, seleciona campos mínimos e pagina coleções;
- Requirements mantém status persistido e invariantes; ele não é substituído por `implementationStatus` derivado.

## Status, evidência e fórmulas

O recálculo persistido foi preservado:

```text
sem tarefas                 → CADASTRADO
todas A_FAZER               → APROVADO
todas CONCLUIDO             → VALIDADO
demais combinações          → EM_IMPLEMENTACAO
VALIDADO + confirmação      → CONCLUIDO
```

`implementationStatus` é derivado para consulta e não sobrescreve o status persistido. Commit ou PullRequest constitui evidência técnica; Issue isolada é contexto, não evidência de implementação.

Todas as métricas novas seguem:

```json
{"numerator":0,"denominator":0,"percentage":null,"hasData":false}
```

Se há denominador, `percentage` pode ser `0` e `hasData` é `true`. Campos escalares históricos de cobertura foram preservados, usando `0` quando não há denominador, para não romper consumers anteriores.

O summary global da matriz é calculado sobre todos os requisitos do projeto e não somente sobre a página. A fórmula histórica de média por requisito foi preservada, agora exposta também como métrica estruturada.

## Atualização atômica Requirement–Task

`PUT /api/requirements/:id/tasks` recebe até 100 IDs positivos, únicos. O caso de uso:

1. valida requisito e todas as tarefas;
2. rejeita recursos de outro projeto;
3. calcula vínculos criados, removidos e reassociados;
4. atualiza o conjunto, os status afetados e os eventos de auditoria na mesma transação;
5. devolve o requisito atualizado, mudanças e reassociações.

A operação é idempotente e falha antes da transação se qualquer ID for inválido ou desconhecido. A exclusão de requisito continua desvinculando tarefas sem apagar tarefas, PRs, commits, issues ou eventos.

O frontend substituiu os loops de PATCH/DELETE pelo único request atômico. O salvamento dos campos do requisito continua sendo o contrato existente e ocorre antes da substituição do conjunto; a atomicidade garantida nesta E10 abrange integralmente o conjunto de vínculos.

## Matriz e DTO único de grafo

`GET /api/projects/:projectId/traceability/requirements-matrix` retorna:

```text
projectId + summary global + requirements da página + pagination
```

A página usa dados resumidos e contagens, sem mensagens/descrições integrais de artifacts. O número de queries não cresce por requirement/task.

As três perspectivas detalhadas usam:

```json
{
  "projectId": 1,
  "perspective": { "type": "REQUIREMENT", "id": 10 },
  "summary": {},
  "nodes": [],
  "edges": [],
  "pagination": {}
}
```

IDs são namespaced (`requirement:10`, `task:20`, `commit:30`, `pull-request:40`, `issue:50`). Nodes e edges são deduplicados; o frontend apenas posiciona e renderiza o grafo fornecido pelo backend.

### Perspectivas

- RF49: `GET /projects/:projectId/traceability/requirements/:requirementId`, com tasks paginadas e artifacts vinculados.
- RF52: `GET /projects/:projectId/traceability/tasks/:taskId`, com artifacts paginados diretamente no banco.
- RF53: `GET /projects/:projectId/traceability/artifacts/:artifactType/:artifactId`, com `commit`, `pull-request` ou `issue` e tasks reversas paginadas.

Todas validam membership e pertencimento ao projeto. Ausência de membership ou recurso divergente retorna 404; papel insuficiente em mutações retorna 403. `Commit.authorEmail` não integra o grafo.

Na perspectiva de requisito, a página de tasks é limitada a 100 e cada tipo de vínculo por task possui limite defensivo de 100 no carregamento. A perspectiva dedicada da tarefa é a operação indicada para navegar coleções maiores com paginação total correta.

## Contratos genéricos removidos

Após busca de consumers, foram removidos os registros dos cinco placeholders do domínio:

```text
POST   /projects/:projectId/trace-links
GET    /requirements/:requirementId/traceability
GET    /tasks/:taskId/traceability
GET    /github-artifacts/:artifactId/traceability
DELETE /trace-links/:id
```

Eles agora seguem o 404 global. Nenhuma implementação genérica foi criada. `DELETE /projects/:id` permanece o único endpoint 501 e está fora do escopo.

## Frontend

- `RequirementsPage` usa a substituição atômica de vínculos;
- `TraceabilityPage` consome matriz paginada, summary global e métricas com zero/ausência;
- `TraceabilityFlow` recebe nodes/edges canônicos e renderiza requisito, tarefa, commit, pull request e issue;
- loading, vazio, erro, seleção e navegação foram preservados;
- `TraceabilityList.jsx`, sem consumer, foi removido;
- nenhuma biblioteca visual ou dependência foi adicionada.

## Auditoria e privacidade

Vínculos Requirement–Task atômicos registram eventos dentro da transação. As mutações individuais existentes de Requirement, PullRequest, Commit e Issue passaram a registrar metadata allowlisted com IDs técnicos e ação, sem descrição, mensagem de commit, e-mail, body ou payload GitHub. Falha de auditoria nas operações individuais mantém o fallback operacional herdado; o conjunto atômico não confirma sem os eventos correspondentes.

## Testes e validações

Foram adicionados/ajustados testes para fórmula única, zero/ausência, evidência técnica, matriz global paginada, DTO único, todas as perspectivas, isolamento entre projetos, minimização de e-mail, conjunto atômico, rollback, idempotência, auditoria, autorização, remoção de placeholders e frontend. Nenhum teste de integração usa banco mockado.

Resultado final:

| Suíte | Testes | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|---:|
| Backend | 166 | 85,23% | 71,40% | 86,88% | 87,88% |
| Frontend | 38 | 31,44% | 29,72% | 26,36% | 32,28% |

No backend, 90 testes unitários e 76 de integração/API passaram em 23 arquivos. No frontend, 38 testes passaram em 14 arquivos e o build Vite foi aprovado; permanece apenas o aviso preexistente de chunk principal superior a 500 kB. Todas as métricas de cobertura cresceram em relação à E9.

`prisma format`, `prisma validate`, `prisma generate`, `db:test:migrate` e `db:test:status` passaram; as 23 migrations continuam aplicadas e sem pendências no MySQL isolado `traceflow_test`. `architecture:check` e `security:secrets` passaram, com 200 arquivos inspecionados pelo scanner. O audit do backend encontrou zero vulnerabilidades. O frontend preserva duas ocorrências altas direta/transitiva do advisory de React Router em modo RSC; o TRACEFLOW usa SPA com `BrowserRouter`, e a correção proposta pelo npm é uma mudança incompatível. Nenhum `audit fix` foi executado.

Não foram adicionadas dependências, migrations ou mocks de runtime. Os testes não chamaram GitHub real e nenhum banco de desenvolvimento foi resetado.

## Riscos e bloqueios para E11

- RF41 depende de definição funcional inequívoca do identificador na mensagem de commit.
- O grafo de requisito limita defensivamente artifacts por task; coleções extensas devem ser navegadas pela perspectiva paginada da tarefa.
- A média global mantém a fórmula histórica por requisito; mudança de ponderação exige decisão funcional própria.
- E11 não foi iniciada.
