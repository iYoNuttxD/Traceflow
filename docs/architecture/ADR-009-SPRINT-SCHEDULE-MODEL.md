# ADR-009 — Modelo de sprint, marco e cronograma

- **Estado:** aceita no S1-04 (RF10)
- **Data:** 05/08/2026
- **Responsáveis:** equipe TraceFlow

## Contexto

O cartão S1-04 do roadmap incremental cobre RF10 (definir cronograma do projeto) e RF35 (exibir evolução por sprint). Esta entrega implementa **somente o RF10**; o RF35 fica para um incremento posterior, mas o modelo de dados criado aqui precisa viabilizá-lo sem nova reestruturação.

O produto já possuía `Project`, `Task`, `TaskHistoryEntry` e a autorização por `ProjectMembership` consolidada nas etapas E0–E15. Faltava qualquer noção de planejamento temporal: não havia entidade de sprint, marco ou janela de cronograma.

Existe ainda uma coluna `TaskMovement.sprintId` criada na migration `20260607030000_add_task_movements_for_kanban`, **sem FK e sem model correspondente** — dívida registrada em `docs/refactoring/E0_TECHNICAL_DEBT.md:144`.

## Decisão

### 1. FK singular `Task.sprintId` em vez de tabela de junção

Uma tarefa pertence a no máximo uma sprint. `Task.sprintId Int?` com relação opcional, em vez de um model `SprintTask`.

### 2. `@db.Date` para datas de calendário; `DateTime` para instantes

`Sprint.startDate`, `Sprint.endDate` e `Milestone.dueDate` são dias de calendário e usam `@db.Date`. `Sprint.startedAt` e `Sprint.completedAt` são instantes reais e permanecem `DateTime`.

Isso **diverge deliberadamente** de `Task.deadline`, que é `DateTime` e aceita hora. A divergência é semântica: prazo de tarefa pode ter hora; janela de sprint não.

### 3. Exclusão de sprint com tarefas é bloqueada no service

`DELETE /sprints/:id` retorna `409 SPRINT_HAS_TASKS` enquanto existir tarefa associada. A FK usa `onDelete: SetNull` apenas como rede de segurança contra cascata acidental.

**Corolário obrigatório:** a proibição em estado terminal vale só para **acrescentar** tarefa, nunca para remover. As duas regras combinadas — "não altera tarefas de sprint terminal" e "não exclui sprint com tarefas" — criariam um impasse sem saída, já que estados terminais não transicionam de volta: a sprint ficaria permanentemente presa, sem poder ser esvaziada nem excluída. Isso foi detectado em uso real durante a entrega e corrigido antes da PR.

### 4. Sobreposição de sprints é permitida

Nenhuma validação de janelas cruzadas.

### 5. Valores de enum em português

`SprintStatus` (`PLANEJADA`, `EM_ANDAMENTO`, `CONCLUIDA`, `CANCELADA`) e `MilestoneStatus` (`PENDENTE`, `CONCLUIDO`) usam identificadores em português, diferentemente de `ProjectRole` e `TaskHistoryField`, que usam inglês.

### 6. `startedAt` / `completedAt` persistidos sem uso derivado

Preenchidos na transição de status e apenas gravados nesta entrega. Nenhum cálculo os consome.

### 7. Marco pertence ao projeto, não à sprint

`Milestone` não possui `sprintId`.

### 8. `TaskMovement.sprintId` permanece intocado

Sem FK, sem backfill, sem remoção. Registrado como `S104-F01` no backlog técnico.

## Alternativas consideradas

| Alternativa | Por que foi rejeitada |
|---|---|
| Proibir qualquer alteração no conjunto de tarefas de sprint terminal | Combinada com o bloqueio de exclusão, prende a sprint para sempre. A regra do cartão diz "não **associar**", não "não desassociar" — a leitura restritiva era mais forte que a especificação |
| Tabela de junção `SprintTask` | cardinalidade N:N não corresponde ao domínio — uma tarefa em duas sprints simultâneas tornaria a evolução do RF35 ambígua, exigindo regra de desempate arbitrária |
| `DateTime` para todas as datas | obrigaria normalização manual de hora em todo ponto de escrita e leitura; esquecer em um lugar deslocaria o dia. Com `@db.Date` o MySQL trunca, e o esquecimento é inofensivo |
| `SetNull` como caminho normal de exclusão | a FK age no banco e contorna a aplicação: apagaria vínculos sem gerar `TaskHistoryEntry` nem `AuditEvent`, quebrando o critério de aceite de identificar alterações pós-planejamento |
| Validar sobreposição de sprints | custaria invariante, código de erro e testes sem resolver problema real: com FK singular não há ambiguidade. Projetos legitimamente usam sprints paralelas por frente de trabalho |
| Enums em inglês | `SprintStatus` e `MilestoneStatus` são vocabulário de domínio exibido ao usuário, como `A_FAZER`/`CONCLUIDO` já em uso em `Task.status`. Traduzir só na camada de apresentação criaria dois vocabulários para o mesmo conceito |
| Derivar a linha de base do RF35 de `startDate` | `startDate` é planejamento, não execução: uma sprint criada em julho para começar em agosto teria base errada. `startedAt` registra quando de fato começou |
| Vincular marco a sprint desde já | aumenta a superfície sem necessidade para o critério de aceite; o vínculo pode ser adicionado depois sem quebra de contrato |
| Criar FK em `TaskMovement.sprintId` "de passagem" | exigiria backfill de dados históricos sem evidência de qual sprint cada movimento pertencia; correção de dívida não relacionada dentro de um cartão funcional |

## Consequências positivas

- O RF35 consome `startedAt`, `completedAt` e o histórico `SPRINT` sem nova migration.
- Uma consulta simples (`WHERE sprintId = ?`) responde "quais tarefas estão nesta sprint", sem join extra.
- O bloqueio de exclusão preserva a integridade do histórico: nenhum vínculo desaparece sem trilha.
- `@db.Date` elimina uma classe inteira de bugs de fuso horário nas datas de cronograma.
- O índice `[projectId, sprintId]` cobre a consulta do cronograma sem varredura.

## Consequências negativas

- Uma tarefa não pode ser compartilhada entre sprints. Se o domínio evoluir para exigir isso, será necessária migration para tabela de junção, com backfill.
- O bloqueio de exclusão obriga o usuário a desassociar tarefas antes de excluir uma sprint — passo extra na interface.
- Enums em português criam inconsistência de vocabulário com os enums técnicos existentes.
- `startedAt`/`completedAt` ficam gravados sem consumidor até o RF35, o que pode parecer código morto na revisão.
- `Task.sprintId` passou a aparecer no payload de **todos** os endpoints de tarefa, porque `formatTask()` faz spread do registro. É mudança de contrato, documentada em `API_CONTRACTS.md`.

## Impactos de segurança e privacidade

**Segurança.** O ponto crítico foi a autorização. `resolveProjectId` retorna `null` quando nenhum padrão de path casa, e o middleware então executa `return next()` **sem verificar membership**. Sem estender o resolvedor para `/sprints/:id` e `/milestones/:id`, qualquer usuário autenticado leria, editaria e excluiria sprints e marcos de qualquer projeto — IDOR/BOLA direto (ASVS 8.2.2 e 8.3.1). A extensão foi tratada como item bloqueante, com teste de isolamento cruzado em todos os métodos e regressão dos recursos já existentes.

Defesa em profundidade: os services comparam `projectId` de tarefa e sprint a partir dos registros persistidos, nunca do body; os repositories filtram por `projectId` no `where`. `requiredRole` não foi alterado — cada regex novo naquele caminho é superfície de regressão, e ele roda em toda requisição da API.

**Privacidade.** Nenhuma categoria nova de dado pessoal. `Sprint` e `Milestone` são dados de projeto. A associação referencia `actorUserId`, já inventariado via `TaskHistoryEntry` e `AuditEvent`. O DTO do cronograma expõe `responsibleUserId` e nunca e-mail. O cronograma não calcula indicadores individuais e não deve ser usado para inferir desempenho humano, conforme a seção 14.3 do documento de arquitetura.

## Adendo — RF35: linha de base e instante de corte

- **Estado:** aceito no S1-04 (RF35), fechando o cartão.

### Decisão 9 — a linha de base do planejamento é `Sprint.startedAt`

O critério "tarefas adicionadas ou removidas após o planejamento são identificáveis" exige um marco. Adotamos `startedAt`: o planejamento fecha quando a sprint entra em `EM_ANDAMENTO`. É coerente com a Decisão 6, que criou o campo exatamente para isso, e com a rejeição de `startDate` — data planejada não é execução.

Sprint ainda `PLANEJADA` tem `startedAt` nulo e base `OPEN`: o planejamento não fechou, então o escopo planejado **é** o atual e não existe "adicionada depois". É o comportamento correto, não um caso degenerado.

**Alternativas consideradas.** `createdAt` trataria como planejado todo o período de montagem do escopo. Snapshot explícito exigiria entidade nova e migration, contrariando a Decisão 6.

### Decisão 10 — corte no passado é recusado com `400`

`Task.status` guarda apenas o estado atual. Aceitar `at` no passado e responder com o status de hoje devolveria um número carimbado com uma data que ele não representa — a métrica enganosa que a seção 10.5 do documento de arquitetura proíbe. O parâmetro é recusado explicitamente, nunca ignorado em silêncio.

**Consequência negativa aceita:** não há série histórica. Suportá-la exigiria reconstruir também `field: STATUS`, com custo de consulta bem maior.

### Consequências

- Nenhuma migration: o RF35 consome `startedAt` e o histórico `SPRINT` já existentes, confirmando a Decisão 6.
- A consulta do histórico usa `projectId + field + occurredAt`, que aproveita os índices existentes. **Não há índice em `toValue`/`fromValue`**, então a discriminação por sprint acontece em memória, sobre um conjunto já limitado ao projeto e ao período.
- `buildMetric` passou a ser exportado pelo índice do módulo `traceability`, para que a evolução use a mesma definição de percentual do indicador de progresso. Duas fórmulas divergentes sobre o mesmo conjunto de tarefas seriam defeito de contrato.

**Impactos de segurança.** Endpoint somente-leitura endereçado por ID: a superfície é IDOR/BOLA, coberta pelo `resolveProjectId` já existente para `/sprints/:id`. Nenhuma consulta usa SQL bruto. Sprint de projeto alheio não expõe conteúdo; a divergência de código entre `RESOURCE_NOT_FOUND` e `SPRINT_NOT_FOUND` é anterior e vale para todo o app — registrada no backlog.

**Impactos de privacidade.** Nenhuma categoria nova de dado pessoal. A resposta traz apenas `taskId`; não há recorte por responsável, e a métrica não deve ser usada para inferir desempenho individual (seção 14.3).

## Rastreabilidade

- Cartão: S1-04, **completo**: RF10 e RF35.
- Requisitos: RF10 e RF35.
- Contratos: `docs/api/API_CONTRACTS.md`, seção "Atualização S1-04 (RF10)".
- Autorização: `docs/security/AUTHORIZATION_MATRIX.md`.
- Evidência ASVS: `docs/security/ASVS_BASELINE.md`.
- Pendências: `S104-F01` a `S104-F04` em `docs/issues/TECHNICAL_BACKLOG.md`.
