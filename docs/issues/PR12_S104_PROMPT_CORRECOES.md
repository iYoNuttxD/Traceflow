# Prompt de correção — PR #12 (S1-04: RF10 + RF35)

> **Como usar este documento.** Ele é o enunciado completo do trabalho de correção da
> PR [#12](https://github.com/iYoNuttxD/Traceflow/pull/12) (`joao-dev-v2` → `main`), que recebeu
> parecer **REQUEST CHANGES**. Leia as seções 0 a 2 antes de escrever qualquer linha; execute as
> fases 1 a 8 na ordem; encerre pela seção 11 (checklist de DoD). Cada fase é um commit próprio.
> Nada aqui é sugestão opcional: o que estiver marcado como **BLOQUEIA MERGE** precisa estar feito
> e testado antes de pedir nova revisão.

---

## 0. Regras de trabalho (invioláveis)

1. **Arquitetura em camadas.** Backend: `Route → Controller → Service → Repository → Prisma`.
   Nenhuma regra de negócio no controller, nenhum acesso ao `prisma` fora de um `*.repository.js`.
   Frontend: `app/routes → pages → features → API`. Nenhuma chamada HTTP direta em componente.
2. **Zod estrito** em toda entrada HTTP (`strictObject`); campo desconhecido é `400 VALIDATION_ERROR`.
3. **Histórico e auditoria** (`TaskHistoryEntry` + `AuditEvent`) são escritos **na mesma transação**
   da mutação que os originou. Nunca depois, nunca fora.
4. **Funções puras continuam puras.** `sprint.calculator.js` e `sprint.progress.calculator.js` não
   podem chamar `new Date()`, não importam Prisma nem Express. O instante é sempre injetado.
5. **Comentários explicam o "porquê", não o "o quê"** — mantenha a densidade e o tom já usados nos
   arquivos do módulo `sprints`. Comentário que reescreve o código em português é ruído.
6. **Nunca confiar em ID vindo do frontend** para decidir pertencimento: comparar sempre o
   `projectId` dos registros persistidos.
7. **Ambiente é do João.** Toda operação de banco ou serviço (`migrate dev`, `migrate reset`,
   `db push`, restart de MySQL) deve ser **proposta como comando e aguardar aval**. Não execute
   comando destrutivo por conta própria.
8. **Não use a implementação de `daniel-dev` como referência.** O trabalho é sobre o diff desta PR.
9. **Não amplie o escopo.** Itens fora deste documento vão para `docs/issues/TECHNICAL_BACKLOG.md`.
10. **Não edite migration já aplicada** (`20260805120000_add_sprint_milestone_schedule`). Toda
    mudança de schema entra em migration nova. Ver §3.4.

### Comandos de verificação (rodar ao fim de cada fase)

```bash
cd backend && npx prisma validate && npx prisma generate && npm run lint && npm test
```

```bash
cd frontend && npm run lint && npm run build && npm test
```

> **Pré-requisito conhecido:** os testes de API do backend exigem `backend/.env.test`. Sem ele as
> suítes falham por `429`, e o sintoma parece bug de rate limit — não é. Se o MySQL recusar
> credencial válida, verifique antes se há **duas instâncias disputando a porta 3306**; o erro se
> apresenta como senha errada, mas é banco errado.

---

## 1. Decisões de domínio canônicas

Estas decisões foram confirmadas pela equipe **depois** que a PR foi escrita. Onde o código ou o
ADR-009 disser o contrário, **o código e o ADR estão errados**.

| ID | Decisão | Estado atual na PR |
|---|---|---|
| **D01** | Uma tarefa pode participar de **várias sprints ao longo do tempo**. Cada participação é um registro histórico próprio, consultável, que preserva o **último status observado** naquela sprint. | ❌ `Task.sprintId` singular apaga a participação anterior |
| **D02** | Um projeto tem vários marcos; **todo marco pertence a uma sprint** (mesmo projeto). A conclusão do marco fica ancorada num período de desenvolvimento. | ❌ `Milestone` só se relaciona a `Project` |
| **D03** | Sprints do mesmo projeto são **sequenciais e não podem se sobrepor**. | ❌ ADR-009 §4 declara sobreposição permitida; não há validação |
| **D04** | Sprint `CONCLUIDA`/`CANCELADA` é **registro imutável**: composição, status de saída e resultado do RF35 ficam congelados. Movimentação posterior da tarefa não altera o passado. | ❌ Remoção de tarefa e exclusão da sprint continuam permitidas |
| **D05** | `Sprint.startDate`, `Sprint.endDate`, `Milestone.dueDate` e `Task.deadline` preservam o **instante exato** (data + hora). Armazenamento em UTC; conversão só na apresentação. | ❌ `@db.Date` trunca hora, minuto, segundo e fuso |
| **D06** | **Sprint não é excluída**, em nenhum estado. Não existe caminho de exclusão física nem soft-delete nesta entrega. | ❌ `DELETE /sprints/:id` existe e é usado pela UI |
| **D07** | Entrar em `EM_ANDAMENTO` **não fecha o escopo**. Tarefas podem ser adicionadas depois, mas precisam ser **sinalizadas como incluídas após o início**. `startedAt` é *baseline*, não trava. | ⚠️ Semântica de "fechamento" no ADR conflita com o comportamento real |
| **D08** | Toda mutação de escopo/janela é **serializável**: leitura, validação, cálculo de delta e escrita acontecem numa única transação com lock. | ❌ Deltas calculados fora da transação |
| **D09** | O histórico de participação **sobrevive à exclusão da tarefa**. | ❌ `deleteTask` apaga `TaskHistoryEntry` e o passado da sprint some |
| **D10** | Existe **um único limite de domínio** para tarefas por sprint, aplicado em todas as rotas. | ❌ PUT em lote limita a 100; associação individual não limita |

### 1.1 Decisões complementares (confirmadas em 16/08/2026)

Estavam abertas quando este documento foi escrito; foram decididas pela equipe e valem como as
demais. Mantenha cada uma isolada atrás de uma constante ou função nomeada — não porque possam
mudar, mas porque regra de domínio espalhada por vários arquivos deixa de ser uma regra só.

| ID | Decisão | Consequência |
|---|---|---|
| **D11** | `Milestone.dueDate` precisa cair **dentro** da janela da sprint | validar em create/update → `400 MILESTONE_DUE_DATE_OUTSIDE_SPRINT` |
| **D12** | Marco de sprint encerrada **não** pode ser editado, concluído nem excluído | congela junto com a sprint → `409 SPRINT_LOCKED` |
| **D13** | `DELETE /sprints/:id` permanece roteado e responde `405 SPRINT_DELETE_NOT_SUPPORTED` | rota removida devolveria `404`, indistinguível de "sprint não existe" |
| **D14** | Limite único de **100** tarefas por sprint, em todas as rotas | o editor em lote passa a representar qualquer estado aceito pela API individual |
| **D15** | A janela `from`/`to` do cronograma continua sendo **dia de calendário, interpretado em UTC** | `from` = início do dia; `to` = início do dia seguinte (exclusivo). A limitação de fuso para UTC-3 é aceita e precisa constar do ADR-010 |

---

## 2. Mapa achado → fase

| Achado do parecer | Severidade | Fase |
|---|---|---|
| FK singular apaga participação histórica | HIGH | 3, 4, 5 |
| Marco sem relação com sprint | HIGH | 3, 4, 6 |
| Sprints sobrepostas permitidas | HIGH | 4 |
| `@db.Date` descarta o horário exato | HIGH | 3, 6, 7 |
| Sprint encerrada perde escopo e é excluída | HIGH | 4, 6 |
| Escopo pós-início sem sinalização persistente | HIGH | 3, 4, 5 |
| `replaceTasks` não é serializável | HIGH | 4 |
| Respostas fora de ordem no frontend | HIGH | 6 |
| Verificação de sprint vazia fora da transação | HIGH | 4 (eliminado por D06) |
| Excluir Task apaga evidência do histórico | HIGH | 3, 4 |
| Limite de 100 incoerente entre rotas | MEDIUM | 5 |
| 404 como oráculo de existência | MEDIUM | 7 |
| Documentação contradiz o estado do RF35 | MEDIUM | 8 |
| DoD exige E2E proporcional ao risco | MEDIUM | 9 |
| VIEWER recebe controles de mutação | LOW | 6 |

---

## 3. Fase 1 — Modelo de dados

**Arquivos:** `backend/prisma/schema.prisma`, `backend/prisma/migrations/<nova>/migration.sql`.
**Bloqueia merge:** sim.

### 3.1 `SprintTask` — participação histórica (D01, D09)

Substitui a semântica de "tarefa pertence a uma sprint" por "tarefa **participou** de uma sprint,
com entrada, saída e status de saída". A FK `Task.sprintId` **permanece**, mas muda de papel: passa
a ser o **ponteiro para a participação ativa**, mantido na mesma transação. Isso preserva as
consultas existentes, garante no banco o invariante "no máximo uma sprint ativa por tarefa" e evita
reescrever todo o contrato de tarefas — enquanto `SprintTask` vira a **fonte de verdade do
histórico**. Documente essa dualidade no ADR-010 e cubra-a com um teste de invariante (§10.2).

```prisma
// Participacao de uma tarefa em uma sprint (RF10/RF35).
// Fonte de verdade do historico: sobrevive ao encerramento da sprint e a
// exclusao da tarefa. `Task.sprintId` e apenas o ponteiro da participacao
// ATIVA, escrito na mesma transacao — nunca a origem do passado.
model SprintTask {
  id                  Int                      @id @default(autoincrement())
  projectId           Int
  sprintId            Int
  taskId              Int?
  taskTitleSnapshot   String
  addedAt             DateTime                 @default(now())
  // Sinaliza inclusao posterior ao inicio da execucao (D07). Gravado na
  // entrada, nunca recalculado: `startedAt` pode mudar de leitura depois.
  addedAfterStart     Boolean                  @default(false)
  carriedFromSprintId Int?
  removedAt           DateTime?
  removalReason       SprintTaskRemovalReason?
  // Ultimo status observado NESTA sprint. Congelado na saida ou no
  // encerramento; e o que torna o RF35 da sprint fechada irretroativo (D04).
  exitStatus          String?
  closedAt            DateTime?

  project           Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  sprint            Sprint  @relation("SprintMembership", fields: [sprintId], references: [id], onDelete: Cascade)
  task              Task?   @relation(fields: [taskId], references: [id], onDelete: SetNull)
  carriedFromSprint Sprint? @relation("SprintCarryOver", fields: [carriedFromSprintId], references: [id], onDelete: SetNull)

  // Uma participacao por par sprint+tarefa: reentrada REABRE o registro em vez
  // de criar outro, coerente com a regra ja vigente de que "saiu e voltou" nao
  // conta como entrada nem saida. `taskId` nulo (tarefa excluida) nao colide:
  // no MySQL o indice unico admite multiplos NULL.
  @@unique([sprintId, taskId])
  @@index([sprintId, removedAt])
  @@index([taskId, removedAt])
  @@index([carriedFromSprintId])
  @@index([projectId, addedAt])
}

enum SprintTaskRemovalReason {
  MOVIDA
  REMOVIDA
  TAREFA_EXCLUIDA
}
```

Back-relations obrigatórias:

- em `Sprint`: `sprintTasks SprintTask[] @relation("SprintMembership")` e
  `carriedOverTasks SprintTask[] @relation("SprintCarryOver")`;
- em `Task`: `sprintParticipations SprintTask[]`;
- em `Project`: `sprintTasks SprintTask[]`.

**Enum em português** por coerência com `SprintStatus`/`MilestoneStatus`, que já são vocabulário de
domínio exibido ao usuário. Registre no ADR-010.

### 3.2 `Milestone.sprintId` obrigatório (D02)

```prisma
model Milestone {
  // ...
  sprintId Int
  sprint   Sprint @relation(fields: [sprintId], references: [id], onDelete: Restrict)

  @@index([sprintId, status])
}
```

`onDelete: Restrict` é coerente com D06 (sprint nunca é excluída) e falha alto caso alguém
reintroduza exclusão.

### 3.3 Instantes exatos (D05)

Remova `@db.Date` de `Sprint.startDate`, `Sprint.endDate` e `Milestone.dueDate`. Os três passam a
ser `DateTime` puro (`DATETIME(3)` no MySQL). `Task.deadline` já é `DateTime` e não muda.

### 3.4 Migration nova, aditiva e em etapas

Crie `backend/prisma/migrations/20260816120000_s104_domain_fixes/migration.sql`. **Não edite** a
migration anterior: ela já foi aplicada no ambiente local e editá-la produz drift.

```sql
-- S1-04 (correcao): participacao historica, marco por sprint e instantes exatos.

-- 1. Datas de cronograma passam a guardar o instante exato (D05).
--    A conversao DATE -> DATETIME preenche 00:00:00.000; nenhuma linha se perde.
ALTER TABLE `Sprint`
  MODIFY COLUMN `startDate` DATETIME(3) NOT NULL,
  MODIFY COLUMN `endDate`   DATETIME(3) NOT NULL;

ALTER TABLE `Milestone`
  MODIFY COLUMN `dueDate` DATETIME(3) NOT NULL;

-- 2. Participacao historica (D01/D09).
CREATE TABLE `SprintTask` (
  `id`                  INTEGER NOT NULL AUTO_INCREMENT,
  `projectId`           INTEGER NOT NULL,
  `sprintId`            INTEGER NOT NULL,
  `taskId`              INTEGER NULL,
  `taskTitleSnapshot`   VARCHAR(191) NOT NULL,
  `addedAt`             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `addedAfterStart`     BOOLEAN NOT NULL DEFAULT false,
  `carriedFromSprintId` INTEGER NULL,
  `removedAt`           DATETIME(3) NULL,
  `removalReason`       ENUM('MOVIDA', 'REMOVIDA', 'TAREFA_EXCLUIDA') NULL,
  `exitStatus`          VARCHAR(191) NULL,
  `closedAt`            DATETIME(3) NULL,

  UNIQUE INDEX `SprintTask_sprintId_taskId_key`(`sprintId`, `taskId`),
  INDEX `SprintTask_sprintId_removedAt_idx`(`sprintId`, `removedAt`),
  INDEX `SprintTask_taskId_removedAt_idx`(`taskId`, `removedAt`),
  INDEX `SprintTask_carriedFromSprintId_idx`(`carriedFromSprintId`),
  INDEX `SprintTask_projectId_addedAt_idx`(`projectId`, `addedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill do vinculo atual. `addedAfterStart = false` e premissa explicita:
-- nao existe evidencia de inclusao pos-inicio para dados anteriores a esta regra.
INSERT INTO `SprintTask`
  (`projectId`, `sprintId`, `taskId`, `taskTitleSnapshot`, `addedAt`, `addedAfterStart`)
SELECT t.`projectId`, t.`sprintId`, t.`id`, t.`title`, t.`createdAt`, false
FROM `Task` t
WHERE t.`sprintId` IS NOT NULL;

ALTER TABLE `SprintTask`
  ADD CONSTRAINT `SprintTask_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `SprintTask_sprintId_fkey` FOREIGN KEY (`sprintId`) REFERENCES `Sprint`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `SprintTask_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `Task`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `SprintTask_carriedFromSprintId_fkey` FOREIGN KEY (`carriedFromSprintId`) REFERENCES `Sprint`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Marco pertence a uma sprint (D02). Tres etapas: coluna nula, backfill, NOT NULL.
ALTER TABLE `Milestone` ADD COLUMN `sprintId` INTEGER NULL;

UPDATE `Milestone` m
SET m.`sprintId` = (
  SELECT s.`id` FROM `Sprint` s
  WHERE s.`projectId` = m.`projectId`
    AND m.`dueDate` >= s.`startDate`
    AND m.`dueDate` <  s.`endDate`
  ORDER BY s.`startDate` ASC
  LIMIT 1
)
WHERE m.`sprintId` IS NULL;

-- Fallback: ultima sprint do projeto quando a data nao cai em nenhuma janela.
UPDATE `Milestone` m
SET m.`sprintId` = (
  SELECT s.`id` FROM `Sprint` s
  WHERE s.`projectId` = m.`projectId`
  ORDER BY s.`startDate` DESC
  LIMIT 1
)
WHERE m.`sprintId` IS NULL;

ALTER TABLE `Milestone`
  MODIFY COLUMN `sprintId` INTEGER NOT NULL,
  ADD INDEX `Milestone_sprintId_status_idx`(`sprintId`, `status`),
  ADD CONSTRAINT `Milestone_sprintId_fkey` FOREIGN KEY (`sprintId`) REFERENCES `Sprint`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
```

> **PARE se o backfill deixar `Milestone.sprintId` nulo** (projeto com marco e sem nenhuma sprint).
> Não invente vínculo. Rode a checagem abaixo, reporte ao João e proponha as opções: (a) criar uma
> sprint de acolhimento no projeto, (b) apagar os marcos órfãos de desenvolvimento, (c) manter a
> coluna nula com obrigatoriedade só no service. **Aguarde o aval.**

```bash
mysql -u <user> -p -e "SELECT id, projectId, title FROM traceflow.Milestone WHERE sprintId IS NULL;"
```

### 3.5 Aplicação da migration

Proponha ao João e aguarde aval antes de rodar:

```bash
cd backend && npx prisma migrate dev --name s104_domain_fixes
```

**Critérios de aceite da Fase 1**

- `npx prisma validate` e `npx prisma generate` passam;
- a migration aplica em banco com dados e o backfill não deixa `Milestone.sprintId` nulo;
- nenhuma tabela ou coluna existente é removida;
- `SELECT` de sanidade confirma uma linha em `SprintTask` para cada `Task.sprintId` não nulo.

---

## 4. Fase 2 — Invariantes de sprint no service

**Arquivos:** `backend/src/modules/sprints/services/*.js`,
`backend/src/modules/sprints/repositories/sprint.repository.js`,
`backend/src/modules/sprints/sprint.schema.js`.
**Bloqueia merge:** sim.

### 4.1 Padrão de transação com lock (D08)

O bug de concorrência não se resolve movendo código: resolve-se **serializando** a janela entre a
leitura e a escrita. Em MySQL (REPEATABLE READ) "consultar e depois inserir" continua sendo corrida.
Adote o padrão abaixo, que mantém Prisma no repository e regra no service:

```js
// sprint.repository.js
// O service entrega uma funcao PURA de planejamento; o repository garante que
// ela rode sobre um snapshot travado, dentro da mesma transacao da escrita.
// Sem o lock, duas requisicoes leem o mesmo estado e aplicam deltas
// incompativeis — atomicidade por item nao e semantica de "replace".
async withProjectLock(projectId, buildPlan) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM Project WHERE id = ${projectId} FOR UPDATE`;
    const sprints = await tx.sprint.findMany({ where: { projectId }, select: sprintSelect });
    const plan = await buildPlan({ sprints });      // pode lancar SprintServiceError
    return applyPlan(tx, plan);
  });
},

async withSprintLock(sprintId, buildPlan) {
  return prisma.$transaction(async (tx) => {
    const [sprint] = await tx.$queryRaw`
      SELECT id, projectId, status, startedAt, completedAt FROM Sprint WHERE id = ${sprintId} FOR UPDATE`;
    if (!sprint) return null;
    const participations = await tx.sprintTask.findMany({ where: { sprintId } });
    const plan = await buildPlan({ sprint, participations, tx });
    return applyPlan(tx, plan);
  });
}
```

Regras: `$queryRaw` **sempre** com template parametrizado (nunca concatenação); a exceção ao "sem SQL
bruto" precisa ficar registrada na seção de segurança do ADR-010; o `buildPlan` recebe o snapshot e
devolve o plano (attach/detach/history/audit) ou lança erro de domínio — nada é escrito fora dele.

### 4.2 Sobreposição proibida (D03)

Em `createSprint` e `updateSprint`, dentro de `withProjectLock`:

```js
// Intervalo semiaberto [startDate, endDate): a sprint seguinte pode comecar
// exatamente no instante em que a anterior termina, e nunca antes.
export function overlaps(a, b) {
  return a.startDate < b.endDate && b.startDate < a.endDate;
}
```

- Comparar contra todas as sprints do projeto, **excluindo a própria** em edição.
- Erro: `409 SPRINT_OVERLAP`, mensagem "Já existe uma sprint neste período. As sprints do projeto não
  podem se sobrepor."
- Manter `ensureDateRange` (`startDate < endDate`, agora estrito: janela de duração zero não é sprint).

### 4.3 Escopo da sprint (D01, D04, D07, D08, D10)

Reescreva `sprintCrudService.replaceTasks` como `setSprintScope`, inteiramente dentro de
`withSprintLock`. Sequência obrigatória, toda ela na transação:

1. revalidar existência e status da sprint travada;
2. **se terminal → `409 SPRINT_SCOPE_LOCKED`** para qualquer alteração, inclusive remoção (D04
   revoga o "corolário do impasse" do ADR-009 §3: o impasse existia porque havia exclusão física;
   com D06 ele desaparece);
3. carregar as tarefas pedidas e recusar as de outro projeto com a mesma disciplina anti-oráculo já
   usada hoje (`actorSeesProject` → `404` idêntico a inexistente);
4. aplicar o limite único de domínio (`SPRINT_MAX_TASKS = 100`, D14) sobre o conjunto **resultante**
   → `409 SPRINT_TASK_LIMIT_REACHED`;
5. calcular o delta contra as participações **ativas** (`removedAt = null`);
6. para cada saída: `removedAt = now`, `exitStatus = <status atual da Task>`,
   `removalReason = MOVIDA | REMOVIDA`;
7. para cada entrada: criar ou **reabrir** a participação (`removedAt = null`), gravando
   `addedAfterStart = sprint.startedAt !== null`, `carriedFromSprintId = <sprint ativa anterior>` e
   `taskTitleSnapshot`; se a tarefa estava ativa em outra sprint, **fechar aquela participação**
   com `removalReason = MOVIDA` na mesma transação;
8. atualizar o ponteiro `Task.sprintId`;
9. gravar `TaskHistoryEntry` (`field: SPRINT`, convenção de troca A→B em entrada única, já
   documentada) e `AuditEvent`.

### 4.4 Encerramento congela o registro (D04)

Em `sprintStatusService.updateSprintStatus`, ao transicionar para `CONCLUIDA` ou `CANCELADA`,
**na mesma transação**:

```js
// Congelar o ultimo status observado nesta sprint. Sem isso, concluir a tarefa
// depois — ou leva-la para a sprint seguinte — reescreveria retroativamente o
// resultado de um periodo ja encerrado.
await tx.sprintTask.updateMany({
  where: { sprintId: id, removedAt: null, closedAt: null },
  data: { closedAt: now }
});
// exitStatus precisa do status individual: uma leitura + writes por participacao.
```

`EM_ANDAMENTO` continua gravando `startedAt`, agora explicitamente como **baseline**, não como trava
(D07). Nenhuma trava de escopo nasce dessa transição.

### 4.5 Exclusão de sprint (D06)

- `sprintCrudService.deleteSprint`: **remover a lógica**. A rota permanece registrada e responde
  `405 SPRINT_DELETE_NOT_SUPPORTED` antes de qualquer leitura ou mutação (D13).
- Remover `countTasks` do repository e o código `SPRINT_HAS_TASKS` de `error-codes.js` (documentar
  como código aposentado em `API_CONTRACTS.md`).
- Isso elimina, por construção, a corrida entre `countTasks` e `delete`.

### 4.6 Marcos (D02)

Em `milestone.service.js`:

- `createMilestone` passa a exigir `sprintId`; ausente → `400 MILESTONE_SPRINT_REQUIRED`;
- validar que a sprint existe e é do **mesmo projeto**, com a disciplina anti-oráculo do
  `task-sprint.service.js` (sem membership no outro projeto → `404 SPRINT_NOT_FOUND` idêntico a
  inexistente; com membership → `400 MILESTONE_SPRINT_PROJECT_MISMATCH`);
- D11: validar `dueDate` dentro de `[sprint.startDate, sprint.endDate)` →
  `400 MILESTONE_DUE_DATE_OUTSIDE_SPRINT`;
- D12: bloquear update/status/delete de marco cuja sprint esteja em estado terminal →
  `409 SPRINT_LOCKED`;
- `updateMilestone` aceita troca de `sprintId` sujeita às mesmas validações.

### 4.7 Exclusão de tarefa não reescreve o passado (D09)

Em `backend/src/modules/tasks/task.repository.js`, `deleteTask`, **antes** do `task.delete` e dentro
da mesma transação:

```js
// A participacao historica sobrevive a exclusao operacional da tarefa: o
// denominador da sprint encerrada nao pode mudar porque alguem apagou a task.
// `taskId` vira NULL pela FK; o snapshot preserva titulo e status de saida.
await tx.sprintTask.updateMany({
  where: { taskId: id, removedAt: null },
  data: { removedAt: now, removalReason: 'TAREFA_EXCLUIDA', exitStatus: task.status }
});
```

Não apague linhas de `SprintTask`. A limpeza de `TaskHistoryEntry` que já existe permanece — a
evidência do RF35 deixou de depender dela.

**Critérios de aceite da Fase 2**

- nenhum service lê estado, decide e escreve fora de uma transação com lock;
- sprint terminal rejeita qualquer alteração de escopo e não pode ser excluída;
- mover tarefa entre sprints fecha a participação anterior com `exitStatus` e abre a seguinte com
  `carriedFromSprintId`;
- marco sem sprint válida é recusado.

---

## 5. Fase 3 — RF35 sobre a participação histórica

**Arquivos:** `backend/src/modules/sprints/sprint.progress.calculator.js`,
`backend/src/modules/sprints/services/sprint-progress.service.js`, repository.
**Bloqueia merge:** sim.

O cálculo deixa de reconstruir escopo a partir de `TaskHistoryEntry` e passa a ler `SprintTask`, que
é registro estável. `TaskHistoryEntry` continua sendo escrito (auditoria e contrato), mas **não é
mais fonte do número**.

Nova assinatura da função pura:

```js
export function buildSprintProgress({ sprint, participations, cutoff })
```

Cada `participation` chega ao calculator já normalizada pelo service:
`{ taskId, addedAfterStart, addedAt, removedAt, removalReason, exitStatus, currentStatus, carriedFromSprintId, movedToSprintId }`.

Regras:

| Campo | Definição |
|---|---|
| `baseline` | `{ kind: 'STARTED_AT', at: startedAt }` ou `{ kind: 'OPEN', at: null }` (sprint `PLANEJADA`) |
| `frozen` | `true` quando a sprint é terminal |
| `cutoff` | `completedAt`/`closedAt` quando congelada; instante da consulta quando aberta |
| status efetivo | `exitStatus ?? currentStatus` — **sprint congelada nunca lê `currentStatus`** |
| `planned` | participações com `addedAfterStart === false` (inclui as que saíram) |
| `current` | participações com `removedAt === null` |
| `scopeChange.added` | `addedAfterStart === true`, com `at: addedAt` e `fromSprintId: carriedFromSprintId` |
| `scopeChange.removed` | `removedAt !== null && addedAfterStart === false`, com `at: removedAt`, `toSprintId` e `reason` |
| `carryOver` | participações cuja tarefa continuou noutra sprint — derivado de `SprintTask` com `carriedFromSprintId = sprint.id` |

Mantenha `buildMetric` como fórmula única e `percentage: null` quando o denominador é zero.

O repository ganha `findParticipationsBySprint(sprintId)` com um único `findMany` que traz a
participação e o `status` atual da task por `include`/`select` — sem N+1 e sem varrer
`TaskHistoryEntry`. Remova `findSprintHistorySince`, `findTaskStatusesBySprint` e
`findTaskStatusesByIds` se ficarem sem consumidor.

`sprintProgressQuerySchema` continua recusando `at`, agora com motivo atualizado: sprint aberta não
tem série histórica de status; sprint encerrada devolve sempre o resultado congelado.

**Critérios de aceite da Fase 3**

- concluir uma tarefa depois do encerramento da Sprint 1 **não** muda nenhum número da Sprint 1;
- mover a tarefa para a Sprint 2 preserva o `exitStatus` na Sprint 1 e a marca como carry-over na 2;
- excluir a tarefa não muda o denominador de nenhuma sprint encerrada;
- tarefa incluída depois de `startedAt` aparece em `scopeChange.added` sem que o escopo esteja travado.

---

## 6. Fase 4 — Contrato HTTP e validação

**Arquivos:** `backend/src/modules/sprints/sprint.validation.js`, `sprint.schema.js`,
`sprint.routes.js`, `sprint.controller.js`, `backend/src/shared/errors/error-codes.js`.
**Bloqueia merge:** sim (parte), MEDIUM (limite).

### 6.1 Datas com instante (D05)

- `parseCalendarDate` → `parseInstant(value, label)`: aceita ISO-8601 completo **com** offset e
  também `YYYY-MM-DD` (interpretado como `T00:00:00Z`, documentado). **Elimine
  `truncateToUtcDay` do caminho de escrita** — truncar silenciosamente uma entrada com hora é
  perda de dado, não normalização.
- `sprint.validation.js`: `startDate`/`endDate`/`dueDate` passam a usar `isoDateTime`.
- Respostas serializam em ISO-8601 UTC (`toISOString()`), inclusive no agregado do cronograma —
  `toDateOnlyString` deixa de ser usado para sprints e marcos.
- `sprint.calculator.js`: `durationInDays` continua inclusiva **por dia UTC** (contrato não muda),
  mas `intersectsRange`/`isWithinRange` passam a comparar **instantes**. Por D15, o filtro `from`/`to`
  continua em dia de calendário: `from` vira início do dia UTC e `to`, início do dia seguinte,
  exclusivo.

### 6.2 Limite único (D10, D14)

- Constante `SPRINT_MAX_TASKS = 100` exportada de `sprint.schema.js`, usada por
  `replaceSprintTasksBodySchema` **e** pela associação individual (`PATCH /tasks/:id/sprint`) e pelo
  cálculo do conjunto resultante em `setSprintScope`.
- Novo código: `409 SPRINT_TASK_LIMIT_REACHED`.

### 6.3 Novos códigos de erro

Acrescente em `error-codes.js` e documente em `API_CONTRACTS.md`:

`SPRINT_OVERLAP` (409), `SPRINT_SCOPE_LOCKED` (409), `SPRINT_DELETE_NOT_SUPPORTED` (405),
`SPRINT_TASK_LIMIT_REACHED` (409), `MILESTONE_SPRINT_REQUIRED` (400),
`MILESTONE_SPRINT_PROJECT_MISMATCH` (400), `MILESTONE_DUE_DATE_OUTSIDE_SPRINT` (400).

Aposente `SPRINT_HAS_TASKS`.

### 6.4 Payloads

- `POST/PUT /projects/:projectId/milestones` e `/milestones/:id` passam a aceitar/exigir `sprintId`;
- `GET /sprints/:id/tasks` devolve a participação (`addedAfterStart`, `addedAt`, `carriedFromSprintId`,
  `exitStatus`) além do DTO minimizado atual — **sem** incluir e-mail ou qualquer dado pessoal novo;
- `GET /sprints/:id/progress` ganha `frozen`, `carryOver` e `reason` em `scopeChange.removed`.

---

## 7. Fase 5 — Frontend

**Arquivos:** `frontend/src/features/schedule/**`.
**Bloqueia merge:** sim (corrida e exclusão), LOW (VIEWER).

### 7.1 Respostas fora de ordem (HIGH)

`selectSprint` e `showProgress` aplicam qualquer resposta que chegue, sem verificar se a seleção
ainda é a mesma. Abrir A e imediatamente B faz a tela exibir B com as tarefas de A — e o botão
salvar envia os IDs de A para B, alterando o recurso errado.

Correção: uma instância dedicada de `useAbortableRequest` por painel (`sprintTasksRequest`,
`progressRequest`) **mais** uma guarda de identidade antes de aplicar o resultado:

```jsx
const selectedSprintRef = useRef(null);

const selectSprint = async (sprint) => {
  if (selectedSprint?.id === sprint.id) { /* fecha */ }
  selectedSprintRef.current = sprint.id;
  // ...
  const result = await sprintTasksRequest.run(async (signal) => { /* ... */ });
  // `run` ja descarta resposta abortada; a guarda cobre o caso em que a
  // requisicao anterior resolveu antes do abort chegar ao axios.
  if (!result || selectedSprintRef.current !== sprint.id) return;
  // aplica
};
```

Aplique o mesmo em `showProgress` e no `finally` que desliga o *loading* — desligar o spinner da
requisição errada é o mesmo bug com outra fantasia.

### 7.2 Exclusão de sprint some da UI (D06)

Remover `removeSprint`, a prop `onDelete` de `SprintList`, o botão correspondente e
`scheduleApi.removeSprint`. Remover também o fluxo de "esvaziar sprint encerrada para poder
excluir" em `submitSprintTasks` e o texto do `SprintTasksPanel` que instrui o usuário a fazer isso.

### 7.3 Sprint encerrada é somente leitura (D04)

`SprintTasksPanel`: em sprint terminal, nenhuma caixa é marcável ou desmarcável e o botão salvar não
aparece. Exibir a composição congelada com o `exitStatus` de cada tarefa. Substituir o texto atual
("Você ainda pode remover as que já estão associadas...") por um que descreva registro histórico.

### 7.4 Marco vinculado a sprint (D02)

`MilestoneForm` ganha um seletor de sprint obrigatório, alimentado pela lista já carregada em
`ScheduleScreen`. `MilestoneList` e `ScheduleAgenda` exibem a sprint do marco. Validação local
espelha D11 e D12 (data dentro da janela da sprint; marco de sprint encerrada não editável) — o
backend continua sendo a autoridade.

### 7.5 Datas com hora (D05)

`SprintForm` e `MilestoneForm` trocam `type="date"` por `type="datetime-local"`; o valor é convertido
para ISO-8601 com offset antes de enviar, e formatado no fuso local na exibição. O `.slice(0, 10)`
usado hoje em `editSprint`/`editMilestone` **destrói a hora** e precisa sair. O filtro `from`/`to` da
agenda permanece `type="date"` (D15).

### 7.6 Sinalização de escopo e carry-over (D07)

`SprintTasksPanel` marca tarefas com `addedAfterStart` ("incluída após o início") e
`SprintProgressPanel` mostra `carryOver` e o motivo da saída.

### 7.7 VIEWER não recebe controle de mutação (LOW)

Buscar a membership do usuário via um `scheduleApi.getMembership(projectId)` novo — método próprio no
`schedule.api.js`, pelo mesmo motivo já documentado em `listProjectTasks`: importar de
`features/members` criaria acoplamento entre features. Com `currentMembership.role === 'VIEWER'`,
ocultar formulários de sprint/marco e ações de mutação. O backend continua sendo a autoridade final;
isto é UX, não autorização.

### 7.8 Validação visual obrigatória

Antes de abrir a revisão, conferir a tela nos **dois extremos**: projeto com 1 sprint / 1 marco /
0 tarefas e projeto com ~20 sprints, ~50 marcos e ~200 tarefas. Layout que só funciona em um dos
extremos não passa.

---

## 8. Fase 6 — Segurança: uniformizar o 404

**Arquivos:** `backend/src/middlewares/auth/project-authorization.middleware.js`,
`backend/src/modules/*/`, testes de contrato.
**Bloqueia merge:** não isoladamente (MEDIUM, `S104-F05`).

Hoje um recurso existente em projeto alheio responde `RESOURCE_NOT_FOUND` e um ID inexistente
responde `SPRINT_NOT_FOUND`/`TASK_NOT_FOUND`. A diferença confirma existência: um usuário autenticado
itera IDs e mapeia recursos fora do seu alcance.

- Unificar status, código e mensagem para "não existe" e "não visível" em `/sprints/:id`,
  `/milestones/:id`, `/tasks/:id` e `/requirements/:id`. Recomendado: `404 RESOURCE_NOT_FOUND`,
  mensagem "Recurso não encontrado.", com o detalhe preservado apenas no log interno (`requestId`).
- Atualizar `schedule-contracts.test.js`, que **hoje fixa a divergência por teste** — a mudança
  precisa ser deliberada, não silenciosa.
- Atualizar `docs/api/API_CONTRACTS.md` e `docs/security/AUTHORIZATION_MATRIX.md`.
- Se a equipe preferir adiar, **não deixe implícito**: mantenha `S104-F05` aberto no backlog com a
  decisão registrada e diga isso na descrição da PR.

---

## 9. Fase 7 — Documentação

**Bloqueia merge:** sim (contradição do RF35 e ADR desalinhado).

### 9.1 `docs/architecture/ADR-010-SPRINT-DOMAIN-CORRECTIONS.md` (novo)

ADR não se reescreve: cria-se o sucessor. O ADR-010 **supersede as decisões 1, 2, 3, 4, 7 e 9 do
ADR-009** e precisa conter:

- contexto: o alinhamento de domínio posterior à PR #12;
- decisão por decisão (D01–D10), com a alternativa rejeitada e o porquê;
- a distinção explícita entre **baseline** (`startedAt`), **escopo mutável** e **fechamento
  imutável** (encerramento) — três conceitos que o ADR-009 misturou;
- a dualidade `SprintTask` (fonte de verdade) × `Task.sprintId` (ponteiro derivado), com o teste de
  invariante que a sustenta;
- semântica de intervalo: `[startDate, endDate)`, semiaberto;
- decisão de fuso (D15): armazenamento UTC, apresentação local, janela do cronograma interpretada em
  UTC — a limitação para UTC-3 (um filtro "até 14/08" recorta em `15/08T00:00Z`, ou seja
  `14/08T21:00` em Brasília) é **aceita explicitamente**, não um descuido;
- uso de `$queryRaw ... FOR UPDATE` como exceção deliberada ao "sem SQL bruto", com justificativa;
- impactos de segurança e privacidade: `SprintTask` guarda snapshot de título e status — **não**
  guarda dado pessoal novo; a retenção do snapshot após exclusão da tarefa precisa constar da
  política de retenção (LGPD: minimização e prazo, não retenção indefinida por padrão).

### 9.2 `docs/architecture/ADR-009-SPRINT-SCHEDULE-MODEL.md`

Alterar apenas o cabeçalho: `**Estado:** parcialmente superada pelo ADR-010 (decisões 1, 2, 3, 4, 7 e
9)`. Não reescrever o histórico.

### 9.3 `docs/api/API_CONTRACTS.md`

- **Corrigir a contradição:** a seção "Atualização S1-04 (RF10)" afirma que o RF35 não faz parte da
  entrega e que o cartão permanece aberto, enquanto páginas adiante documentam
  `GET /sprints/:id/progress` e o ADR/backlog marcam o cartão como fechado. Consolidar **uma única**
  afirmação.
- Atualizar decisões (a), (c), (d) e (g) — todas invertidas por D02, D04, D03 e D06.
- Documentar os novos códigos de erro, o `sprintId` obrigatório em marcos, os campos novos do RF35,
  o limite único e o novo formato de data.

### 9.4 Backlog e roadmap

- `docs/issues/TECHNICAL_BACKLOG.md`: fechar ou reescopar `S104-F05`; manter `S104-F01`
  (`TaskMovement.sprintId` órfão) e `S104-F03` (paginação); registrar `S104-F06` (mover `buildMetric`
  para `shared/`); abrir item para a política de retenção do snapshot.
- `TRACEFLOW_ROADMAP_INCREMENTAL.md`: marcar o checklist técnico do S1-04 conforme o estado **real**;
  só declarar o cartão concluído quando a Fase 8 estiver verde.

---

## 10. Fase 8 — Testes

**Bloqueia merge:** sim.

### 10.1 Unitários — `backend/test/unit/sprint.progress.calculator.test.js`

- sprint congelada usa `exitStatus` e ignora `currentStatus`;
- conclusão posterior da tarefa não altera planejado, concluído, percentual nem composição;
- carry-over Sprint 1 → Sprint 2 mantém o registro da 1 e cria participação nova na 2;
- tarefa incluída após `startedAt` entra em `scopeChange.added`;
- tarefa removida permanece no denominador de `planned`;
- denominador zero → `percentage: null`, `hasData: false`;
- pureza: nenhum `new Date()` dentro do calculator (teste com fake timers ou injeção).

### 10.2 Unitários — invariantes e datas

- `overlaps` nos limites: fim == início (permitido), 1 ms antes (recusado), contido, envolvente;
- `parseInstant` preserva hora, minuto, segundo e offset; `2026-08-14T23:59:59-03:00` **não** vira
  `2026-08-15T00:00:00Z`;
- horário de verão e fusos negativos/positivos;
- invariante `Task.sprintId` ⇔ participação ativa única em `SprintTask`.

### 10.3 API — `backend/test/api/schedule-contracts.test.js`

- criar sprint sobreposta → `409 SPRINT_OVERLAP`; sequencial → `201`;
- alterar escopo de sprint terminal (adicionar **ou** remover) → `409 SPRINT_SCOPE_LOCKED`;
- `DELETE /sprints/:id` → `405 SPRINT_DELETE_NOT_SUPPORTED` em todos os estados, sem efeito colateral;
- marco sem `sprintId` → `400`; marco com sprint de outro projeto → `404` ou `400` conforme
  visibilidade; `dueDate` fora da janela → `400` (D11); marco de sprint terminal → `409` (D12);
- limite único: 101ª tarefa recusada tanto no PUT em lote quanto na associação individual, e sprint
  com 100 tarefas ainda aceita um PUT que só remove (D14);
- janela do cronograma: `to=2026-08-14` inclui evento em `14/08T23:00Z` e exclui `15/08T00:00Z` (D15);
- papéis: `VIEWER` lê e recebe `403` em toda mutação; isolamento entre projetos em todos os métodos;
- 404 uniforme (Fase 6), substituindo a asserção que hoje fixa a divergência.

### 10.4 Integração — `backend/test/integration/rf10-sprint-schedule.test.js`

- jornada completa: criar sprint → iniciar → associar → adicionar após início → mover para a sprint
  seguinte → encerrar → verificar imutabilidade;
- **concorrência** (os testes que faltam e são o motivo dos achados HIGH):
  - dois `PUT /sprints/:id/tasks` simultâneos → política determinística (last-write-wins completo ou
    conflito explícito), nunca união silenciosa;
  - duas criações simultâneas de sprints sobrepostas → exatamente uma passa;
  - associação concorrente durante encerramento → estado final coerente com D04;
- exclusão da tarefa não altera o RF35 de sprint encerrada.

### 10.5 Frontend — `frontend/test/features/ScheduleScreen.test.jsx`

- alternância rápida A→B com resposta de A chegando depois: a tela mostra **B com dados de B**, e
  salvar envia os IDs de B;
- fechar o painel durante a carga não aplica a resposta que chega depois;
- `VIEWER` não vê formulários nem ações de mutação;
- sprint terminal renderiza somente leitura;
- formulário de marco exige sprint;
- campo de data preserva a hora no ciclo editar → salvar.

### 10.6 E2E (`S104-F02` / `E15-F10`)

O DoD do roadmap (§4) pede fluxos ponta a ponta proporcionais ao risco, e os riscos desta entrega
atravessam frontend, API e banco. Se a infraestrutura de E2E for aprovada, cubra no mínimo: criar
sprints sequenciais, rejeitar sobreposição, associar após o início com sinalização, carry-over,
encerrar e verificar imutabilidade, marco vinculado, permissões `VIEWER`/`EDITOR`. **Se não for
aprovada agora**, registre isso explicitamente na PR e **não declare o S1-04 plenamente homologado**.

---

## 11. Checklist final (Definition of Done)

Marque só o que estiver verificado por teste ou por execução real.

- [ ] `SprintTask` criado, com backfill aplicado e histórico consultável (D01)
- [ ] `Milestone.sprintId` obrigatório, validado por projeto e por janela (D02, D11)
- [ ] Sobreposição de sprints recusada, inclusive sob concorrência (D03)
- [ ] Sprint encerrada imutável: escopo, resultado e marcos congelados (D04, D12)
- [ ] Datas preservam o instante exato de ponta a ponta, do formulário ao banco (D05)
- [ ] `DELETE /sprints/:id` responde `405` sem efeito colateral; UI sem exclusão (D06, D13)
- [ ] `startedAt` é baseline; inclusão posterior sinalizada e persistida (D07)
- [ ] Toda mutação de escopo/janela roda em transação com lock (D08)
- [ ] Exclusão de tarefa não reescreve sprint encerrada (D09)
- [ ] Limite de 100 aplicado em todas as rotas (D10, D14)
- [ ] Janela do cronograma em dia UTC, com a limitação de fuso documentada (D15)
- [ ] Corrida de resposta no frontend eliminada e coberta por teste
- [ ] VIEWER sem controles de mutação
- [ ] 404 uniformizado **ou** decisão de adiamento registrada no backlog e na PR
- [ ] ADR-010 escrito; ADR-009 marcado como parcialmente superado
- [ ] `API_CONTRACTS.md` sem contradição sobre o RF35
- [ ] Roadmap e backlog refletindo o estado real do cartão
- [ ] `npm run lint`, `npm test` e `npm run build` verdes no backend e no frontend
- [ ] Tela validada com dados mínimos **e** em escala

### Plano de commits

```text
feat(sprints): adiciona participacao historica SprintTask e marco por sprint   # Fase 1
feat(sprints): serializa escopo e proibe sobreposicao e exclusao de sprint     # Fase 2
feat(sprints): recalcula RF35 sobre a participacao historica                   # Fase 3
feat(sprints): atualiza contrato de datas, limites e codigos de erro           # Fase 4
feat(schedule): corrige corrida de selecao e adapta UI ao dominio revisado     # Fases 5
fix(security): uniformiza 404 de recurso inexistente e invisivel               # Fase 6
docs(adr): registra ADR-010 e realinha contratos, backlog e roadmap            # Fase 7
test(sprints): cobre imutabilidade, carry-over, concorrencia e fusos           # Fase 8
```

---

## 12. O que **não** fazer

- Não introduzir soft-delete de sprint "de passagem": D06 diz que não há exclusão, não que há
  exclusão disfarçada.
- Não editar a migration `20260805120000_add_sprint_milestone_schedule`.
- Não rodar `prisma migrate reset` sem aval explícito do João.
- Não apagar linhas de `SprintTask` em nenhum fluxo.
- Não usar a implementação de `daniel-dev` como referência.
- Não marcar o S1-04 como concluído enquanto a Fase 8 não estiver verde.
- Não resolver `TaskMovement.sprintId` (`S104-F01`) nesta PR: é dívida não relacionada, com backfill
  próprio.
