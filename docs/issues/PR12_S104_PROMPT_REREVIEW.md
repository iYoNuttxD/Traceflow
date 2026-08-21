# Prompt de correção — Re-review da PR #12 (S1-04: RF10 + RF35)

> **Como usar este documento.** Ele é o enunciado completo do segundo ciclo de correção da PR
> [#12](https://github.com/iYoNuttxD/Traceflow/pull/12) (`joao-dev-v2` → `main`), ancorado no head
> `07663ce40377b6cc27776d58b9ce0bac9c04e4a2`. O parecer atual é **REQUER AJUSTES ANTES DO MERGE**:
> restam **5 HIGH, 1 MEDIUM e 1 LOW**. Leia as seções 0 a 3 antes de escrever qualquer linha;
> execute as fases 1 a 8 na ordem; encerre pela seção 12 (checklist de DoD). Cada fase é um commit
> próprio. Nada aqui é sugestão opcional, salvo o que estiver explicitamente marcado como
> **OPCIONAL**.

---

## 0. Regras de trabalho (invioláveis)

1. **Arquitetura em camadas.** Backend: `Route → Controller → Service → Repository → Prisma`.
   Nenhuma regra de negócio no controller, nenhum acesso ao `prisma` fora de um `*.repository.js`.
   Frontend: `app/routes → pages → features → API`. Nenhuma chamada HTTP direta em componente.
2. **O repository trava e transaciona; o service decide.** O padrão já vigente no módulo é o
   repository expor um método que abre a transação, toma os locks e chama um callback de
   validação/planejamento entregue pelo service. Prisma não sai do repository, regra não sai do
   service, e as duas rodam na mesma transação. **Todo método novo desta correção segue esse mesmo
   formato** — não crie um segundo padrão ao lado.
3. **Histórico e auditoria** (`TaskHistoryEntry` + `AuditEvent`) continuam escritos **na mesma
   transação** da mutação que os originou.
4. **Funções puras continuam puras.** `sprint.calculator.js` e `sprint.progress.calculator.js` não
   chamam `new Date()`, não importam Prisma nem Express.
5. **Comentários explicam o "porquê", não o "o quê"** — mantenha a densidade e o tom já usados nos
   arquivos do módulo `sprints`. Comentário que reescreve o código em português é ruído. Onde este
   documento sugere um comentário, ele indica o *conteúdo* esperado, não o texto literal a colar.
6. **Nunca confiar em ID vindo do frontend** para decidir pertencimento: comparar sempre o
   `projectId` dos registros persistidos.
7. **Ambiente é do João.** Toda operação de banco ou serviço (`migrate dev`, `migrate reset`,
   `db push`, restart de MySQL) deve ser **proposta como comando e aguardar aval**. Não execute
   comando destrutivo por conta própria.
8. **Não use a implementação de `daniel-dev` como referência.** O trabalho é sobre o diff desta PR.
9. **Não amplie o escopo.** Itens fora deste documento vão para `docs/issues/TECHNICAL_BACKLOG.md`.
10. **Não edite migration já aplicada** — nem `20260805120000_add_sprint_milestone_schedule`, nem
    `20260816120000_s104_domain_fixes`. Toda mudança de schema entra em migration nova.

### Comandos de verificação (rodar ao fim de cada fase)

```bash
cd backend && npx prisma validate && npx prisma generate && npm run lint && npm run format:check && npm test
```

```bash
cd frontend && npm run lint && npm run format:check && npm run build && npm test
```

```bash
cd backend && npm run architecture:check && npm run security:secrets
```

> **Pré-requisitos conhecidos deste ambiente.** Os testes de API do backend exigem
> `backend/.env.test`; sem ele as suítes falham por `429`, e o sintoma parece bug de rate limit —
> não é. Se o MySQL recusar credencial válida, verifique antes se há **duas instâncias disputando a
> porta 3306**: o erro se apresenta como senha errada, mas é banco errado.

---

## 1. Estado de partida

### 1.1 O que a PR já corrigiu (não reabrir)

`SprintTask` e snapshots históricos existem; `Milestone` pertence a `Sprint`; as datas preservam o
instante exato; a exclusão de sprint foi desabilitada com `405`; os `404` foram uniformizados; o
limite de 100 tarefas é único; a UI de `VIEWER` não oferece mais controles de escrita; o `replace`
de tarefas é serializável **para requisições sobre a mesma sprint**. Todos os checks da CI estão
verdes: migrations aplicadas em MySQL, 401 testes de backend, 216 de frontend, build, lint, format,
arquitetura, dependency review, auditoria e secret scan.

### 1.2 O que continua aberto

| # | Sev | Achado | Fase |
|---|---|---|---|
| H1 | HIGH | Atualizações parciais concorrentes podem persistir uma janela inválida | Fase 1 |
| H2 | HIGH | Transições concorrentes podem reabrir uma sprint terminal | Fase 2 |
| H3 | HIGH | Uma tarefa pode terminar com duas participações abertas | Fase 3 |
| H5 | HIGH | Marcos podem violar a janela ou a imutabilidade da sprint | Fase 4 |
| H4 | HIGH | Salvamento da sprint A pode sobrescrever o painel da sprint B | Fase 5 |
| L1 | LOW | UI oferece mutações de marco em sprints terminais | Fase 6 |
| M1 | MEDIUM | A matriz técnica ainda contradiz o RF35 atual | Fase 7 |

As fases 1 a 4 são backend, a 5 e a 6 são frontend, a 7 é documentação e a 8 é a suíte de testes que
fecha todas.

### 1.3 Decisões de projeto já confirmadas (não relitigar)

1. **E2E real não bloqueia o merge.** A ausência de jornada E2E de navegador permanece registrada
   como risco de homologação. Não escreva E2E nesta PR; mantenha o item aberto no backlog.
2. **Bancos de commits intermediários não são suportados.** O único caminho oficial de migração é
   `main → head final`. Migration nova é permitida (ver Fase 3, opção B), desde que aplicável nesse
   caminho.
3. **Autorização precede o contrato de método.** Em `DELETE /sprints/:id`, `404` ou `403` podem
   ocorrer antes do `405`. A implementação permanece como está; **a documentação é que precisa
   refletir essa precedência** (Fase 7).

---

## 2. Correções de caminho da review (leia antes de abrir arquivo)

A review cita alguns caminhos que **não existem** neste repositório. Use a coluna da direita.

| Caminho citado na review | Caminho real |
|---|---|
| `backend/src/modules/milestones/services/milestone.service.js` | `backend/src/modules/sprints/services/milestone.service.js` |
| `backend/src/modules/milestones/repositories/milestone.repository.js` | `backend/src/modules/sprints/repositories/milestone.repository.js` |
| `frontend/src/features/schedule/components/ScheduleScreen.jsx` | `frontend/src/features/schedule/pages/ScheduleScreen.jsx` |

Não existe módulo `milestones`: marcos vivem dentro do módulo `sprints`, por serem parte do mesmo
agregado de cronograma. Não crie o módulo para "fazer bater com a review".

Uma imprecisão adicional: a review pede um teste que exija "exatamente um registro com
`closedAt = null`". **O predicado correto é `removedAt IS NULL AND closedAt IS NULL`** — ver §6.4.

---

## 3. Decisão transversal: ordem global de locks e leitura pós-lock

Esta é a raiz comum de H1, H2, H3 e H5. Entenda-a **antes** das fases, porque as quatro dependem
dela.

### 3.1 Por que o lock atual não basta

O ADR-010 D08 já diz que leitura, validação e escrita rodam na mesma transação com
`SELECT ... FOR UPDATE`. O que falta é **a ordem entre travar e ler**.

Em MySQL/InnoDB sob `REPEATABLE READ`, o *read view* da transação nasce na **primeira leitura
consistente** (`SELECT` comum — em Prisma, `findMany`/`findUnique`). A partir daí, toda leitura comum
enxerga aquele retrato, **mesmo depois de a transação ter esperado por um lock**. Uma leitura travada
(`SELECT ... FOR UPDATE`) é *current read*: enxerga o último commit e **não** cria read view.

Consequência prática: se a transação lê antes de travar — ou usa para decidir um dado lido fora dela
e nunca revalidado — ela espera pelo lock e então valida um **passado**. É exatamente o que produz os
quatro achados HIGH de backend.

### 3.2 Regra 1 — locks primeiro, leituras depois

> Dentro de uma transação de cronograma, **todos os `FOR UPDATE` vêm antes de qualquer leitura
> comum**. Nenhum dado lido fora da transação decide a escrita: o que vale é o registro relido depois
> do lock.

Onde o service hoje calcula algo a partir de um registro lido antes da transação (por exemplo
`current` em `updateSprint`, ou `current.status` em `updateSprintStatus`), a leitura pré-transação
passa a servir **apenas** para dois fins legítimos:

- resolver a **identidade** do que precisa ser travado (o `projectId`, o `sprintId` do marco);
- responder `404` cedo, sem abrir transação.

Toda **decisão de domínio** é refeita sobre o registro relido dentro da transação.

### 3.3 Regra 2 — ordem global de aquisição

> `Project → Sprint → Task → SprintTask/Milestone`, sempre nessa ordem, e dentro de cada nível em
> **ordem crescente de `id`** quando houver mais de uma linha.

Essa é a única forma de garantir que não existe ciclo de espera entre as transações do módulo.
Registre a ordem no ADR (Fase 7) e cite-a nos comentários dos repositories.

Situação atual por caminho, e para onde ela vai:

| Caminho | Locks hoje | Locks depois |
|---|---|---|
| Criar sprint | `Project` | `Project` (inalterado) |
| Atualizar janela da sprint | `Project`, e lê depois | `Project` → `Sprint(id)` → `Milestone(sprintId)`, e só então lê |
| Transição de status | `Sprint(id)`, e escreve sem reler | `Project` → `Sprint(id)` → relê → valida → escreve |
| Mutação de escopo | `Sprint(id)` → **lê** → `Task(...)` | `Project` → `Sprint(id)` → `SprintTask(abertas)` → `Task(ids ordenados)` → **só então lê** |
| Marco (create/update/status/delete) | nenhum | `Project` → `Sprint(id ou ids ordenados)` → `Milestone(id)` → relê → valida → escreve |

O lock de `Task` continua vindo **depois** do de `Sprint` em todos os caminhos, e `deleteTask`
(`backend/src/modules/tasks/task.repository.js`) continua tocando `Task` antes de `SprintTask` —
nenhuma das duas ordens se inverte, então não há ciclo.

---

## 4. Fase 1 — H1: atualização parcial concorrente não pode gravar janela inválida

**Arquivos:** `backend/src/modules/sprints/services/sprint-crud.service.js` (`updateSprint`),
`backend/src/modules/sprints/repositories/sprint.repository.js` (`updateWithinProjectLock`),
`backend/src/modules/sprints/sprint.schema.js`, `backend/src/shared/errors/error-codes.js`.

### 4.1 O defeito

`updateSprint` monta a janela com `sprintData.startDate ?? current.startDate` e
`sprintData.endDate ?? current.endDate`, onde `current` foi lido **antes** da transação. Dentro do
lock, o callback de validação já relê a sprint travada (`locked`) para checar `ensureSprintEditable`,
mas **continua validando as datas capturadas de `current`**.

Partindo de `[01, 30]`: uma requisição altera só o fim para `15`, outra só o início para `20`. As
duas validam contra o retrato antigo e passam; conforme a ordem de commit, o banco termina com
`[20, 15]` — janela invertida, que nenhuma validação do domínio aceitaria.

### 4.2 O que fazer

No repository, travar também a própria sprint e seus marcos, e entregar ao callback o retrato
travado inteiro:

```js
// Locks primeiro, leituras depois: em REPEATABLE READ o read view nasce na
// PRIMEIRA leitura comum da transacao. Ler antes de esperar pelo lock congela um
// retrato anterior a espera, e a validacao passa a julgar um passado.
async updateWithinProjectLock(id, projectId, data, auditEvent, validate) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM Project WHERE id = ${projectId} FOR UPDATE`;
    const travada = await tx.$queryRaw`SELECT id FROM Sprint WHERE id = ${id} FOR UPDATE`;
    if (!travada.length) return null;
    // Marcos travados junto: mudar a janela precisa recusar quem ficaria fora
    // dela, e uma criacao de marco simultanea nao pode escapar dessa checagem.
    await tx.$queryRaw`SELECT id FROM Milestone WHERE sprintId = ${id} FOR UPDATE`;

    const sprints = await tx.sprint.findMany({ where: { projectId }, select: sprintSelect });
    const sprint = sprints.find((item) => item.id === id) ?? null;
    const milestones = await tx.milestone.findMany({
      where: { sprintId: id },
      select: { id: true, title: true, dueDate: true }
    });

    await validate({ sprints, sprint, milestones });

    const atualizada = await tx.sprint.update({ where: { id }, data, select: sprintSelect });
    if (auditEvent) await auditRepository.create(auditEvent, tx);
    return atualizada;
  });
}
```

`createWithinProjectLock` passa a chamar `validate({ sprints, sprint: null, milestones: [] })`, para
os dois métodos terem a mesma forma de callback. Ajuste o único chamador (`createSprint`) para
`({ sprints }) => ensureNoOverlap(sprintData, sprints)`.

No service:

```js
async updateSprint(sprintId, data, context = {}) {
  const id = parseSprintId(sprintId);
  // A leitura pre-transacao resolve 404 cedo e diz qual projeto travar. Nada
  // mais: as datas que decidem vem do registro relido sob lock.
  const current = await ensureSprintExists(id);
  const sprintData = ensureAtLeastOneField(
    buildSprintData(data),
    'Informe ao menos um campo para atualizar a sprint.'
  );
  // Janela inteiramente informada nao depende do persistido e pode falhar cedo,
  // com 400 e sem abrir transacao. Janela PARCIAL nao: o complemento so e
  // confiavel depois do lock.
  if (sprintData.startDate && sprintData.endDate) {
    ensureDateRange(sprintData.startDate, sprintData.endDate);
  }

  try {
    const sprint = await sprintRepository.updateWithinProjectLock(
      id,
      current.projectId,
      sprintData,
      buildAuditEvent({ /* inalterado */ }),
      ({ sprints, sprint: locked, milestones }) => {
        if (!locked) throw sprintNotFoundError();
        ensureSprintEditable(locked);
        const startDate = sprintData.startDate ?? locked.startDate;
        const endDate = sprintData.endDate ?? locked.endDate;
        ensureDateRange(startDate, endDate);
        ensureNoOverlap({ startDate, endDate }, sprints, id);
        ensureMilestonesStayWithinWindow(milestones, locked, { startDate, endDate });
      }
    );
    if (sprint === null) throw sprintNotFoundError();
    return sprint;
  } catch (error) {
    if (isUniqueNameViolation(error)) throw sprintNameConflictError();
    throw error;
  }
}
```

`ensureMilestonesStayWithinWindow` é novo em `sprint.schema.js` e resolve a **primeira metade de
H5** (mover a janela não pode empurrar para fora um marco que estava dentro):

```js
// A outra ponta de D11: mover a janela nao pode EMPURRAR PARA FORA um marco que
// estava dentro dela. Validar so na escrita do marco deixava a regra valer por um
// instante — bastava encolher a sprint depois.
//
// O criterio e "estava dentro", e nao "a janela veio no corpo": o formulario do
// painel reenvia as quatro chaves a cada salvamento, e o backfill da s104 vinculou
// a ultima sprint do projeto marcos que nao cabiam em janela nenhuma.
export function ensureMilestonesStayWithinWindow(milestones, currentWindow, nextWindow) {
  const empurrado = milestones.find(
    (milestone) =>
      isWithinWindow(milestone.dueDate, currentWindow) &&
      !isWithinWindow(milestone.dueDate, nextWindow)
  );
  if (empurrado) {
    throw new SprintServiceError(
      `O período informado deixaria o marco "${empurrado.title}" fora da sprint. Ajuste o marco antes de alterar a janela.`,
      409,
      ERROR_CODES.SPRINT_WINDOW_MILESTONE_CONFLICT
    );
  }
  return milestones;
}
```

`isWithinWindow(instant, window)` é o predicado `>= startDate && < endDate` extraído para ser
compartilhado com `ensureMilestoneWithinSprint`: duas comparações separadas podem divergir na borda
semiaberta sem que nenhum teste perceba.

> **Por que o critério não é "a janela mudou".** `ScheduleScreen.submitSprint` monta o payload com
> as quatro chaves a cada salvamento, inclusive num rename — então testar a presença de
> `startDate`/`endDate` no corpo nunca seria falso no uso real, e um marco que o backfill da
> migration `20260816120000_s104_domain_fixes` deixou fora da janela trancaria a sprint até para
> renomear. Comparar valores também não basta: o formulário tem precisão de minuto e a coluna é
> `DATETIME(3)`. O critério de conjunto é imune ao formato do payload.

Adicione `SPRINT_WINDOW_MILESTONE_CONFLICT` a `backend/src/shared/errors/error-codes.js` e à tabela
de códigos de `docs/api/API_CONTRACTS.md`.

### 4.3 Cuidado a não introduzir

Não mantenha o `ensureDateRange(startDate, endDate)` pré-transação com o `current` antigo: sob
concorrência ele pode recusar com `400` uma janela que, contra o registro travado, seria válida. A
checagem antecipada só é legítima quando **as duas datas vêm no payload**.

---

## 5. Fase 2 — H2: transição concorrente não pode reabrir sprint terminal

**Arquivos:** `backend/src/modules/sprints/services/sprint-status.service.js`,
`backend/src/modules/sprints/repositories/sprint.repository.js` (`updateStatus`).

### 5.1 O defeito

`ensureTransitionAllowed(current.status, status)` roda **antes** da transação. O repository trava a
linha da sprint e escreve **sem reler**. Duas requisições partindo de `PLANEJADA` — uma pedindo
`CANCELADA`, outra `EM_ANDAMENTO` — passam as duas pela validação. Se o cancelamento confirmar
primeiro, a segunda ainda grava `EM_ANDAMENTO` por cima de uma sprint terminal, cujas participações
já foram congeladas por `freezeParticipations`. Resultado: sprint aberta com escopo congelado —
status e histórico dizendo coisas diferentes.

### 5.2 O que fazer

O repository passa a expor um método que trava, relê e delega a decisão ao service:

```js
// A transicao e decidida DEPOIS do lock, sobre o status relido: validar antes da
// transacao deixa duas requisicoes partirem do mesmo estado e a segunda escrever
// por cima de uma sprint que a primeira ja encerrou.
async transitionWithinSprintLock(id, projectId, buildChange) {
  return prisma.$transaction(async (tx) => {
    // Project antes de Sprint, na ordem global de D17. A auditoria gravada no fim
    // desta transacao pede lock compartilhado na linha do projeto pela FK; sem
    // tomar o exclusivo agora, esta transacao e a de janela — que trava o projeto
    // primeiro e a sprint depois — se esperariam em ordens opostas.
    await tx.$queryRaw`SELECT id FROM Project WHERE id = ${projectId} FOR UPDATE`;
    const travada = await tx.$queryRaw`SELECT id FROM Sprint WHERE id = ${id} FOR UPDATE`;
    if (!travada.length) return null;

    const atual = await tx.sprint.findUnique({ where: { id }, select: sprintSelect });
    const { data, auditEvent, freezeAt } = await buildChange(atual);

    const sprint = await tx.sprint.update({ where: { id }, data, select: sprintSelect });
    if (freezeAt) await freezeParticipations(tx, id, freezeAt);
    if (auditEvent) await auditRepository.create(auditEvent, tx);
    return sprint;
  });
}
```

Remova `updateStatus` — não deixe os dois caminhos coexistindo — e mova a decisão inteira para o
service:

```js
async updateSprintStatus(sprintId, status, context = {}) {
  const id = parseSprintId(sprintId);
  // Pre-leitura so para o 404 cedo e para saber qual projeto travar. O status
  // que decide e o relido sob lock.
  const current = await ensureSprintExists(id);

  const sprint = await sprintRepository.transitionWithinSprintLock(id, current.projectId, (atual) => {
    const nextStatus = ensureTransitionAllowed(atual.status, status);
    // Um unico instante para a transicao e para o congelamento: dois `new Date()`
    // dariam a sprint um encerramento anterior ao fechamento das suas proprias
    // participacoes.
    const occurredAt = new Date();
    const data = { status: nextStatus };
    if (nextStatus === 'EM_ANDAMENTO') data.startedAt = occurredAt;
    if (nextStatus === 'CONCLUIDA') data.completedAt = occurredAt;
    return {
      data,
      freezeAt: isTerminalSprintStatus(nextStatus) ? occurredAt : null,
      auditEvent: buildAuditEvent({
        actorUserId: context.actorUserId,
        projectId: atual.projectId,
        requestId: context.requestId,
        action: 'SPRINT_STATUS_CHANGED',
        resourceType: 'Sprint',
        resourceId: id,
        metadata: { sprintId: id }
      })
    };
  });

  if (sprint === null) throw sprintNotFoundError();
  return sprint;
}
```

O `projectId` da auditoria passa a vir de `atual`, não da leitura anterior — mesma disciplina.

O contrato HTTP não muda: a transição recusada continua `409 SPRINT_INVALID_TRANSITION`. O que muda é
**quando** ela é avaliada.

---

## 6. Fase 3 — H3: uma tarefa não pode ter duas participações abertas

**Arquivos:** `backend/src/modules/sprints/repositories/sprint.repository.js`
(`mutateScopeWithinSprintLock`), `backend/src/modules/sprints/services/sprint-crud.service.js`
(`buildScopePlan`), `backend/prisma/schema.prisma` (apenas na opção B).

### 6.1 O defeito de concorrência

Hoje a ordem é: trava a `Sprint` → **lê** `sprint`, `participations` e `tasks` → **só então** trava as
`Task` pedidas → lê `activeElsewhere`. As leituras de planejamento acontecem antes do lock das
tarefas, e o read view já nasceu: quando a transação enfim ganha o lock, ela continua planejando
sobre o retrato anterior.

Movendo a mesma tarefa de A para B e para C ao mesmo tempo, uma transação pode abrir B e a outra
abrir C sem enxergar B. O schema garante unicidade só por `[sprintId, taskId]` — nada impede duas
participações abertas em sprints diferentes.

### 6.2 O defeito de seleção (achado adicional, mesmo sintoma sem concorrência)

`activeElsewhere` busca participações com `removedAt: null` em outras sprints — o que inclui
**participações congeladas** (`closedAt != null`, de sprint encerrada) **e** a participação viva. Elas
são reduzidas a um `Map` por `taskId`:

```js
const elsewhereByTask = new Map(activeElsewhere.map((p) => [p.taskId, p]));
```

Com mais de uma participação para a mesma tarefa, **a última do array vence**, e a consulta não tem
`orderBy`. Se a congelada vier por último, `previous.closedAt !== null` e o plano **não fecha a
participação viva** — a tarefa termina aberta em duas sprints, sem nenhuma concorrência envolvida. O
`carriedFromSprintId` também aponta para a sprint errada.

Sequência que reproduz: X participa da sprint A → A é concluída (congela) → X é adicionada a B → X é
adicionada a C. Dependendo da ordem devolvida pelo MySQL, B fica aberta junto com C.

### 6.3 O que fazer — parte 1: locks antes das leituras

```js
async mutateScopeWithinSprintLock(sprintId, requestedTaskIds, buildPlan) {
  return prisma.$transaction(async (tx) => {
    const travada = await tx.$queryRaw`SELECT id FROM Sprint WHERE id = ${sprintId} FOR UPDATE`;
    if (!travada.length) return null;

    // Leitura TRAVADA (nao cria read view) so para descobrir quem ja esta dentro:
    // a saida de uma tarefa mexe na participacao dela tanto quanto a entrada, e
    // sem travar as duas pontas um `replace` que remove X e outro que move X para
    // outra sprint se atropelam.
    const dentro = await tx.$queryRaw`
      SELECT taskId FROM SprintTask
      WHERE sprintId = ${sprintId} AND removedAt IS NULL AND taskId IS NOT NULL
      FOR UPDATE`;

    // Ordem crescente de id: e o que impede que duas transacoes com conjuntos
    // sobrepostos esperem uma pela outra em ordens opostas.
    const idsParaTravar = [
      ...new Set([...requestedTaskIds, ...dentro.map((linha) => Number(linha.taskId))])
    ].sort((a, b) => a - b);
    if (idsParaTravar.length) {
      await tx.$queryRaw`SELECT id FROM Task WHERE id IN (${Prisma.join(idsParaTravar)}) FOR UPDATE`;
    }

    // Só agora as leituras comuns: o read view nasce aqui, depois de toda espera.
    const sprint = await tx.sprint.findUnique({ where: { id: sprintId }, select: sprintSelect });
    const participations = await tx.sprintTask.findMany({ /* inalterado */ });
    const tasks = /* inalterado */;
    const activeElsewhere = requestedTaskIds.length
      ? await tx.sprintTask.findMany({
          where: { taskId: { in: requestedTaskIds }, removedAt: null, sprintId: { not: sprintId } },
          select: sprintTaskSelect,
          // Ordem deterministica: o plano escolhe a participacao viva, e usa a
          // congelada mais recente apenas como origem do carry-over.
          orderBy: [{ closedAt: 'asc' }, { sprintId: 'asc' }]
        })
      : [];

    const plan = await buildPlan({ sprint, participations, tasks, activeElsewhere });
    /* escritas inalteradas */
  });
}
```

Mantenha o comentário existente que justifica a exceção ao "sem SQL bruto" (`$queryRaw` com template
parametrizado é a única forma de tomar lock de linha pelo Prisma) — ele agora cobre três consultas.

### 6.4 O que fazer — parte 2: escolher e fechar a participação certa

Em `buildScopePlan`, substituir o `Map` único por uma separação explícita:

```js
// "Aberta" e `removedAt IS NULL AND closedAt IS NULL`. Uma participacao congelada
// tambem tem `removedAt` nulo — ela nao saiu, a sprint e que fechou — e nao pode
// ser confundida com a participacao viva.
const vivaPorTarefa = new Map();
const congeladaPorTarefa = new Map();
for (const participacao of activeElsewhere) {
  const alvo = participacao.closedAt === null ? vivaPorTarefa : congeladaPorTarefa;
  alvo.set(participacao.taskId, participacao);
}
```

E, no laço de `toAttach`:

```js
const viva = vivaPorTarefa.get(taskId) ?? null;
const congelada = congeladaPorTarefa.get(taskId) ?? null;
// Uma tarefa participa de uma unica sprint por vez: se ela esta viva em outra,
// aquela participacao FECHA aqui, com o status de saida.
if (viva) {
  close.push({
    id: viva.id,
    at: occurredAt,
    reason: REMOVAL_REASONS.MOVIDA,
    exitStatus: taskById.get(taskId)?.status ?? null
  });
}
// Origem do carry-over: de onde ela veio de fato. A sprint encerrada so responde
// por isso quando nao havia participacao viva — reescrever a congelada mudaria
// retroativamente o resultado de um periodo fechado.
const origem = viva ?? congelada;
```

`previous` some; `carriedFromSprintId` passa a usar `origem`, e a entrada de histórico
(`historyEntry(taskId, origem ? String(origem.sprintId) : null, String(sprintId))`) também.

### 6.5 OPCIONAL — parte 3: garantia no schema

Os locks resolvem o problema. Se houver tempo, a invariante pode ser levada ao banco, onde nenhuma
mudança futura de código a contorna. MySQL não tem índice único parcial, mas admite múltiplos `NULL`
num índice único — o que permite uma coluna-espelho:

```prisma
  // Espelha `taskId` enquanto a participacao esta ABERTA e vira NULL quando ela
  // fecha (saida ou congelamento). MySQL nao tem indice unico parcial; o unico
  // sobre esta coluna admite multiplos NULL e e o que faz o BANCO recusar duas
  // participacoes abertas da mesma tarefa.
  openTaskId Int?

  @@unique([openTaskId])
```

Exige migration nova (aditiva), backfill (`openTaskId = taskId` onde
`removedAt IS NULL AND closedAt IS NULL`, `NULL` no resto) e manutenção do campo em **todos** os
caminhos que abrem, reabrem, removem, congelam (`freezeParticipations`) ou fecham por exclusão de
tarefa (`task.repository.js:deleteTask`). Se qualquer um desses caminhos for esquecido, o índice
passa a recusar operações legítimas — só faça se a Fase 8 cobrir os cinco.

---

## 7. Fase 4 — H5: marcos não podem violar janela nem imutabilidade

**Arquivos:** `backend/src/modules/sprints/services/milestone.service.js`,
`backend/src/modules/sprints/repositories/milestone.repository.js`.

A primeira metade de H5 (reduzir a janela revalida os marcos) foi feita na Fase 1. Esta fase trata da
segunda: `create`, `update`, `updateStatus` e `delete` de marco validam a sprint **antes** da
transação, sem travá-la nem revalidá-la durante a escrita. Uma mutação de marco pode confirmar depois
que outra requisição encerrou a sprint — deixando registro novo dentro de um período que já virou
histórico.

### 7.1 O padrão

O repository de marcos passa a abrir transação com lock, no formato já usado pelo de sprints. Ele
precisa importar `Prisma` de `@prisma/client` para `Prisma.join`.

```js
// Ordem global: Sprint antes de Milestone, e sprints em ordem crescente de id
// quando a atualizacao muda o marco de sprint (as duas sao travadas).
async mutateWithinSprintLock(sprintIds, { milestoneId = null, validate, write }) {
  return prisma.$transaction(async (tx) => {
    const ordenados = [...new Set(sprintIds)].sort((a, b) => a - b);
    await tx.$queryRaw`SELECT id FROM Sprint WHERE id IN (${Prisma.join(ordenados)}) FOR UPDATE`;
    if (milestoneId) {
      await tx.$queryRaw`SELECT id FROM Milestone WHERE id = ${milestoneId} FOR UPDATE`;
    }

    const sprints = await tx.sprint.findMany({
      where: { id: { in: ordenados } },
      select: { id: true, projectId: true, status: true, startDate: true, endDate: true }
    });
    const milestone = milestoneId
      ? await tx.milestone.findUnique({ where: { id: milestoneId }, select: milestoneSelect })
      : null;

    await validate({ sprints, milestone });
    return write(tx);
  });
}
```

`create`, `update` e `delete` passam a ser casos desse método (ou três métodos finos que o chamam),
sempre com `auditRepository.create` dentro da mesma transação, como já é hoje.

### 7.2 O que cada operação valida sob lock

| Operação | Sprints a travar | Revalidar dentro da transação |
|---|---|---|
| `createMilestone` | a sprint informada | existe; pertence ao projeto; `ensureSprintEditable`; `ensureMilestoneWithinSprint(dueDate, sprint)` |
| `updateMilestone` | união de `{ marco.sprintId lido antes, payload.sprintId }` | marco ainda existe; `ensureSprintEditable` na sprint **atual** e na **de destino**; `ensureMilestoneWithinSprint` contra a de destino |
| `updateMilestoneStatus` | a sprint do marco | marco existe; `ensureSprintEditable` |
| `deleteMilestone` | a sprint do marco | marco existe; `ensureSprintEditable` |

### 7.3 O marco pode ter mudado de sprint entre a pré-leitura e o lock

`update`, `updateStatus` e `delete` descobrem qual sprint travar a partir do marco lido **antes** da
transação. Se outra requisição mover o marco nesse intervalo, a sprint travada é a errada. Depois de
reler o marco sob lock, compare:

```js
// A sprint a travar sai do marco lido antes da transacao. Se ele mudou de sprint
// nesse intervalo, travamos a sprint errada e nao ha como validar com honestidade:
// recusar e pedir nova tentativa e melhor do que decidir sobre a sprint que ja nao
// e a dele.
if (!ordenados.includes(milestone.sprintId)) {
  throw new SprintServiceError(
    'O marco mudou de sprint durante a operação. Recarregue e tente novamente.',
    409,
    ERROR_CODES.MILESTONE_SPRINT_CHANGED
  );
}
```

Adicione `MILESTONE_SPRINT_CHANGED` a `error-codes.js` e à tabela de `API_CONTRACTS.md`. Mover marco
entre sprints é raro; um `409` honesto com pedido de retry é preferível a uma validação silenciosa
sobre a sprint errada.

### 7.4 Preservar o que já está certo

`ensureMilestoneSprint` continua sendo o guarda anti-oráculo (`404` para quem não enxerga o outro
projeto, `400` para quem enxerga). Ele depende de `authorizationService`, que faz I/O — **mantenha
essa checagem fora da transação**, na pré-validação, e deixe dentro do lock apenas as invariantes de
domínio (existência, `projectId` do registro travado, estado e janela). Prolongar o lock por I/O de
autorização seria trocar um defeito por outro.

---

## 8. Fase 5 — H4: salvar a sprint A não pode sobrescrever o painel da sprint B

**Arquivo:** `frontend/src/features/schedule/pages/ScheduleScreen.jsx` (`submitSprintTasks`).

### 8.1 O defeito

`submitSprintTasks` lê `selectedSprint.id` no momento da chamada, mas ao voltar aplica
`setSprintTasks` e `setSelectedTaskIds` **incondicionalmente**. Se o usuário salvar A e selecionar B
enquanto o `PUT` e o `GET` seguinte estão em voo, a resposta atrasada de A sobrescreve o painel de B.
Como `SprintTasksPanel` sincroniza `selection` com `selectedTaskIds` via `useEffect`, o próximo
salvamento envia **os IDs de A para B** — alterando o recurso errado.

`selectSprint` e `showProgress` já resolvem isso com `selectedSprintRef`/`progressSprintRef`; a
mutação ficou de fora.

### 8.2 O que fazer

```js
const submitSprintTasks = async (taskIds) => {
  // A sprint alvo e congelada no inicio da operacao. `selectedSprint` e estado de
  // render: ao voltar do servidor ele ja pode ser outra sprint.
  const sprintId = selectedSprint.id;
  const sprintName = selectedSprint.name;
  setSubmitting(true);
  try {
    // A mutacao NAO e abortada: cancelar um PUT em voo deixaria o servidor num
    // estado que a tela nao sabe qual e. O que se descarta e o resultado.
    await scheduleApi.replaceSprintTasks(sprintId, taskIds);
    // Nomear a sprint no aviso: sem isso, "tarefas atualizadas" aparece enquanto a
    // tela ja mostra outra sprint, e o usuario le como se fosse sobre esta.
    feedback(`Tarefas da sprint "${sprintName}" atualizadas com sucesso.`);
    await refreshSchedule();
    if (selectedSprintRef.current !== sprintId) return;

    // Rebusca em vez de confiar no que foi enviado: `addedAfterStart` e a origem do
    // carry-over sao decididos no servidor.
    const resultado = await sprintTasksRequest.run((signal) =>
      scheduleApi.listSprintTasks(sprintId, { signal })
    );
    if (!resultado || selectedSprintRef.current !== sprintId) return;
    const tarefas = resultado.data.tasks || [];
    setSprintTasks(tarefas);
    setSelectedTaskIds(tarefas.map((task) => task.id));
  } catch (requestError) {
    if (selectedSprintRef.current !== sprintId) return;
    handleFailure(requestError, 'Não foi possível atualizar as tarefas da sprint.');
  } finally {
    setSubmitting(false);
  }
};
```

Pontos que a implementação precisa respeitar:

- **A guarda vem antes de qualquer `set*` do painel.** `refreshSchedule` pode continuar
  incondicional: o agregado é do projeto, não da sprint selecionada.
- **Usar a mesma instância `sprintTasksRequest`** para a rebusca é correto e desejado: se o usuário
  selecionar B durante o `GET`, `selectSprint` aborta esse `GET` ao iniciar o seu. A checagem de
  `selectedSprintRef.current` e o `run` acontecem no mesmo bloco síncrono, então não há janela em que
  a rebusca aborte a carga de B.
- **`setSubmitting(false)` continua no `finally`**: `submitting` é indicador de tela, não de sprint.
- Não troque isso por "cancelar o `PUT`": um `replace` abortado no cliente pode ter sido aplicado no
  servidor, e a tela não teria como saber.

---

## 9. Fase 6 — L1: UI não oferece mutação de marco em sprint terminal

**Arquivos:** `frontend/src/features/schedule/components/MilestoneList.jsx`,
`frontend/src/features/schedule/pages/ScheduleScreen.jsx`, CSS do cronograma.

### 9.1 O defeito

Os controles do marco são escondidos para `VIEWER`, mas não pelo estado da sprint dona. Numa sprint
`CONCLUIDA` ou `CANCELADA`, "Editar", "Concluir", "Reabrir" e "Excluir" continuam clicáveis e
terminam em `409 SPRINT_LOCKED` — a mesma regra conhecida virando descoberta pelo erro que o ciclo
anterior já tinha eliminado para sprints.

`SprintTasksPanel` já faz o certo (`const congelada = isTerminalSprint(sprint.status)`); a lista de
marcos ficou de fora.

### 9.2 O que fazer

A lista de marcos vem de `listMilestones`, cujo `select` traz `sprintId` mas não o status da sprint.
`ScheduleScreen` já monta `sprintNames` a partir de `sprints`; monte do mesmo jeito um mapa de status
e passe-o adiante:

```jsx
const sprintStatuses = Object.fromEntries(sprints.map((item) => [item.id, item.status]));
...
<MilestoneList
  milestones={milestones}
  sprintStatuses={sprintStatuses}
  busyMilestoneId={busyMilestoneId}
  readOnly={somenteLeitura}
  ...
/>
```

Em `MilestoneList`, reaproveite `isTerminalSprint` de `schedule-display.js`:

```jsx
// Marco de sprint encerrada acompanha a imutabilidade dela (ADR-010 D12). Oferecer
// o botao e transformar uma regra conhecida numa descoberta pelo 409.
const congelada = isTerminalSprint(sprintStatuses[milestone.sprintId]);
const somenteLeitura = readOnly || congelada;
```

E, quando `congelada` for verdadeiro **e** o usuário não for `VIEWER`, renderize no lugar do grupo de
ações uma indicação textual do motivo — o congelamento precisa ser legível, não apenas ausente:

```jsx
{congelada && !readOnly && (
  <p className="milestone-frozen">Sprint encerrada: este marco é registro histórico.</p>
)}
```

`VIEWER` continua sem nenhuma das duas coisas: para ele o motivo é permissão, não estado, e a tela já
comunica isso em outro lugar.

Acrescente o estilo correspondente no CSS do cronograma, seguindo o padrão já usado por
`milestone-overdue` (texto, nunca só cor).

---

## 10. Fase 7 — M1 e documentação

### 10.1 `docs/traceability/RF_TECHNICAL_MATRIX.md`

Três mudanças.

**a) Linha do RF35** — hoje descreve a persistência como `Sprint.startedAt, Task.status/sprintId,
TaskHistoryEntry (SPRINT)`, que é o modelo anterior à PR. Substituir por `SprintTask (participação,
exitStatus, addedAfterStart, carriedFromSprintId), Sprint.startedAt/completedAt`. A evidência de
teste deve citar também `rf10-sprint-schedule`.

**b) Linha do RF10** — a coluna de persistência ainda lidera por `Task.sprintId`. O ponteiro continua
existindo (é a resposta para "sem sprint" no presente), mas **a fonte de verdade histórica é
`SprintTask`**. Reescrever para `Sprint, Milestone (sprintId), SprintTask, Task.sprintId (ponteiro
corrente), TaskHistoryEntry (SPRINT)`.

**c) Intervalo de não implementados** — a linha

```text
- RF13, RF15–RF18, RF29–RF37, RF39–RF40, RF42–RF46 e RF54–RF64 não foram implementados como capacidades completas.
```

declara RF29–RF37 como não implementados, e esse intervalo contém o RF35, que a própria matriz marca
como `IMPLEMENTADO`. Trocar o intervalo por enumeração que o exclua:

```text
- RF13, RF15–RF18, RF29–RF34, RF36, RF37, RF39–RF40, RF42–RF46 e RF54–RF64 não foram implementados como capacidades completas.
```

E o bullet imediatamente acima, que hoje diz "não constituem, sozinhos, RF33–RF36 completos", passa a
citar **RF33, RF34 e RF36** — o RF35 saiu desse conjunto.

Antes de dar a fase por encerrada, releia a matriz inteira procurando outro intervalo que engula um
RF implementado: o defeito é de forma, não só desta linha.

### 10.2 `docs/architecture/ADR-010-SPRINT-DOMAIN-CORRECTIONS.md`

Acrescente duas decisões, no mesmo tom das existentes:

- **D17 — Ordem global de locks e leitura pós-lock.** O conteúdo da §3 deste documento: por que o
  `FOR UPDATE` sozinho não basta sob `REPEATABLE READ`, a regra "locks primeiro, leituras depois", e
  a ordem `Project → Sprint → Task → SprintTask/Milestone`, com ids crescentes dentro de cada nível,
  e a razão de todo caminho tomar o exclusivo do projeto já na entrada.
  Referencie D08, que ela completa (não substitui).
- **D18 — A janela da sprint e seus marcos são validados juntos.** Reduzir a janela recusa com `409`
  se algum marco vinculado ficaria fora dela; mutações de marco revalidam a sprint sob o mesmo lock.
  Referencie D11 e D12.

### 10.3 `docs/api/API_CONTRACTS.md`

- Registrar os códigos novos: `SPRINT_WINDOW_MILESTONE_CONFLICT` (409) e, se a Fase 4 o introduzir,
  `MILESTONE_SPRINT_CHANGED` (409).
- Na seção do `DELETE /sprints/:id`, documentar a **precedência confirmada**: autorização e
  existência são avaliadas antes do contrato de método, então `404` ou `403` podem preceder o `405`.
  Hoje o texto sugere que o `405` é a resposta invariável; ele é a resposta **para quem já passou pela
  autorização**.

### 10.4 `docs/issues/TECHNICAL_BACKLOG.md`

Confirmar que a jornada E2E (`S104-F02`) segue registrada como pendência de homologação, com a
decisão de que **não bloqueia o merge** desta PR.

---

## 11. Fase 8 — Testes

Sete cenários faltam. Nenhuma fase pode ser dada por encerrada sem o seu.

### 11.1 Concorrência de backend — `backend/test/integration/rf10-sprint-schedule.test.js`

Crie um `describe('concorrencia sob lock', ...)`. Regras para todos os testes desta seção:

- Dispare as duas operações com `Promise.allSettled`, nunca `Promise.all`: **é esperado** que uma das
  duas falhe (`409` de domínio, ou erro de lock do InnoDB), e o teste não pode depender de qual.
- **Afirme sobre o estado final do banco**, não sobre qual requisição venceu. O invariante é o que
  está sendo testado.
- Verifique que o pool do Prisma permite ao menos duas conexões simultâneas (`connection_limit` na
  `DATABASE_URL` de teste); com uma só, os testes passam por serialização acidental e não provam nada.
- Mantenha as transações curtas: `innodb_lock_wait_timeout` padrão é 50 s e um teste mal escrito
  pendura a suíte. Se precisar, aumente o timeout do `it` explicitamente.

| Teste | Cenário | Asserção |
|---|---|---|
| updates parciais concorrentes | sprint `[01, 30]`; uma requisição envia só `endDate: 15`, outra só `startDate: 20` | a sprint final tem `startDate < endDate`; nunca `[20, 15]` |
| transições concorrentes | sprint `PLANEJADA`; uma pede `CANCELADA`, outra `EM_ANDAMENTO` | status final terminal **ou** `EM_ANDAMENTO`, e nunca terminal com participação sem `closedAt`, nem `EM_ANDAMENTO` com participações congeladas |
| mesma tarefa para dois destinos | X viva em A; `replace` simultâneo em B e em C incluindo X | exatamente **um** `SprintTask` de X com `removedAt = null AND closedAt = null`; a participação em A fechada com `removalReason = MOVIDA` |
| redução de janela com marco | sprint `[01, 30]` com marco em `20`; encolher a janela para `[01, 10]` | `409 SPRINT_WINDOW_MILESTONE_CONFLICT`; janela e marco inalterados |
| fechamento concorrente × mutação de marco | concluir a sprint enquanto um `create`/`update`/`delete` de marco está em voo | ou o marco foi gravado antes do fechamento, ou recusado com `409`; nunca marco criado/alterado depois do `completedAt` |

Acrescente também o caso **sem concorrência** do §6.2: X em sprint A concluída, depois em B (aberta),
depois `replace` em C incluindo X. Asserção: a participação em B fica com `removedAt` preenchido, a de
A permanece congelada e intocada, e `carriedFromSprintId` da participação em C aponta para **B**. Esse
teste falha na implementação atual — é a prova de que o achado adicional é real.

### 11.2 Contratos de API — `backend/test/api/schedule-contracts.test.js`

- `PUT /sprints/:id` que reduz a janela empurrando um marco para fora → `409` com o novo código.
- Se `MILESTONE_SPRINT_CHANGED` for introduzido, cubra o código no mapa de erros.
- Confirme que a mensagem de `SPRINT_WINDOW_MILESTONE_CONFLICT` nomeia o marco em conflito.

### 11.3 Unitários — `backend/test/unit/sprint.service.test.js`

- `buildScopePlan` com `activeElsewhere` contendo uma congelada **e** uma viva da mesma tarefa, nas
  duas ordens de array: o plano fecha a viva, preserva a congelada e usa a viva como
  `carriedFromSprintId` nos dois casos.
- `ensureMilestonesStayWithinWindow`: marco exatamente em `startDate` passa; exatamente em `endDate`
  falha (janela semiaberta, D11); lista vazia passa.

### 11.4 Frontend — `frontend/test/features/ScheduleScreen.test.jsx`

- **"salvar A e selecionar B antes da resposta não sobrescreve o painel de B"**: resolva
  `replaceSprintTasks` com uma promise controlada; entre o clique em salvar e a resolução, selecione
  B; depois resolva. Asserções: o painel exibe as tarefas de B; `listSprintTasks` **não** foi chamado
  para A depois da troca; um novo salvamento envia os IDs de B.
- **"marco de sprint encerrada não oferece ações"**: um marco em sprint `CONCLUIDA` e outro em sprint
  `EM_ANDAMENTO`, mesmo projeto, papel diferente de `VIEWER`. Asserções: o primeiro não tem os botões
  "Editar", "Concluir"/"Reabrir" e "Excluir", e exibe o texto de congelamento; o segundo tem os três.
- **"VIEWER não vê nem ações nem aviso de congelamento"**: garante que a Fase 6 não introduziu ruído
  no caminho de leitura.

---

## 12. Checklist final (Definition of Done)

Marque só o que estiver verificado por teste ou por execução real.

- [x] H1 — janela validada sobre o registro relido sob lock; update parcial concorrente coberto
- [x] H2 — transição decidida depois do lock; transições concorrentes cobertas
- [x] H3 — locks de `Task` e `SprintTask` tomados antes das leituras de planejamento; movimento
      concorrente para dois destinos coberto
- [x] H3 (adicional) — participação viva distinguida da congelada; caso sequencial A→B→C coberto
- [x] H5 — redução de janela revalida marcos; mutações de marco travam e revalidam a sprint
- [ ] H4 — salvamento de A não escreve no painel de B; regressão coberta
- [ ] L1 — marcos de sprint terminal em modo leitura, com motivo legível, coberto por teste
- [ ] M1 — matriz técnica alinhada ao modelo persistente; nenhum intervalo engolindo RF implementado
- [ ] ADR-010 com D17 e D18; `API_CONTRACTS.md` com os códigos novos e a precedência do `405`
- [ ] `npm run lint`, `npm run format:check` e `npm test` verdes no backend e no frontend
- [ ] `npm run build` verde no frontend; `architecture:check` e `security:secrets` verdes no backend
- [ ] Tela validada **com dados mínimos e em escala** (sprint sem marco, sprint com dezenas deles)
- [ ] E2E (`S104-F02`) permanece aberta no backlog, com a decisão de não bloquear o merge registrada

### Plano de commits

```text
fix(sprints): valida janela da sprint sobre o registro travado                 # Fase 1
fix(sprints): decide transicao de status depois do lock da sprint              # Fase 2
fix(sprints): trava tarefas antes de planejar a mutacao de escopo              # Fase 3
fix(sprints): coordena marcos e janela da sprint pelo mesmo lock               # Fase 4
fix(schedule): descarta resposta de salvamento de sprint nao selecionada       # Fase 5
fix(schedule): congela acoes de marco em sprint encerrada                      # Fase 6
docs(traceability): realinha RF10 e RF35 e registra D17 e D18                  # Fase 7
test(sprints): cobre concorrencia de janela, status, escopo e marcos           # Fase 8
```

---

## 13. O que **não** fazer

- Não criar um módulo `backend/src/modules/milestones` para "fazer bater com os caminhos da review".
- Não mover regra de negócio para dentro do repository: o lock é dele, a decisão continua no service.
- Não colocar chamada de autorização (`authorizationService`) dentro de transação com lock.
- Não trocar o isolamento global do banco para `READ COMMITTED` como atalho: a correção é de ordem
  entre travar e ler, e mudar o isolamento afetaria módulos que não estão nesta PR.
- Não abortar mutações em voo no frontend para resolver corrida de resposta: descarte o resultado,
  não o `PUT`.
- Não editar migrations já aplicadas; nem rodar `prisma migrate reset` sem aval explícito do João.
- Não escrever E2E nesta PR (decisão 1 da §1.3).
- Não marcar o S1-04 como concluído enquanto a Fase 8 não estiver verde.
