# Prompt de correção final — PR #12 (pós-integração da `main`)

> **Como usar este documento.** Ele é o enunciado completo do trabalho que fecha a PR
> [#12](https://github.com/iYoNuttxD/Traceflow/pull/12) (`joao-dev-v2` → `main`), que recebeu o
> parecer **REQUEST CHANGES** na revisão feita sobre o HEAD já integrado
> (`9548a2c8395d5fa948c83ca4e05d75b58937e961`).
>
> Leia as seções 0 a 2 antes de escrever qualquer linha. Execute as fases 3 a 8 na ordem. Encerre
> pela seção 10 (checklist de DoD). Cada fase é um commit próprio.
>
> **Diferença em relação ao `PR12_S104_PROMPT_CORRECOES.md`:** aquele documento tratava do domínio
> de sprints (S1-04) antes da integração. Este trata apenas dos três blockers remanescentes e dos
> ajustes correlatos. Nada do que já foi entregue precisa ser refeito.

---

## 0. Regras de trabalho (invioláveis)

1. **Arquitetura em camadas.** Backend: `Route → Controller → Service → Repository → Prisma`.
   Nenhuma regra de negócio no controller, nenhum acesso ao `prisma` fora de um `*.repository.js`.
   Frontend: `app/routes → pages → features → API`. Nenhuma chamada HTTP direta em componente.
2. **Regra de domínio no Service, transação no Repository.** Quando a regra precisar rodar *dentro*
   da transação, use o padrão de callback já estabelecido em `sprint.repository.js`
   (`updateWithinProjectLock(..., validate)` e `transitionWithinSprintLock(..., buildChange)`): o
   repository abre a transação, trava e relê; o service decide. Não mova regra para o repository.
3. **Zod estrito** em toda entrada HTTP (`strictObject`); campo desconhecido é `400 VALIDATION_ERROR`.
4. **Histórico e auditoria** (`TaskHistoryEntry` + `AuditEvent`) são escritos **na mesma transação**
   da mutação que os originou.
5. **Sem comentário narrativo.** Os arquivos de `sprints/` e `schedule/` estão hoje com **zero**
   comentários e devem continuar assim. Racional de decisão vai para ADR ou para `docs/`, nunca
   para o código. Se um trecho só se explica com parágrafo, extraia função com nome bom.
6. **Nunca confiar em ID vindo do frontend** para decidir pertencimento: comparar sempre o
   `projectId` dos registros persistidos.
7. **Ambiente é do João.** Toda operação de banco ou serviço (`migrate dev`, `migrate reset`,
   `db push`, restart de MySQL) deve ser **proposta como comando e aguardar aval**. Não execute
   comando destrutivo por conta própria.
8. **Não amplie o escopo.** Itens fora deste documento vão para `docs/issues/TECHNICAL_BACKLOG.md`.
9. **Nenhuma migration nesta rodada.** As três correções bloqueantes são de código, não de schema.
   Se você achar que precisa mexer no schema, pare e reavalie: provavelmente errou o diagnóstico.

### Comandos de verificação (rodar ao fim de cada fase)

```bash
cd backend && npx prisma validate && npm run lint && npm test
```

```bash
cd frontend && npm run lint && npm run build && npm test
```

> **Pré-requisito conhecido:** os testes de API do backend exigem `backend/.env.test`. Sem ele as
> suítes falham por `429`, e o sintoma parece bug de rate limit — não é. Se o MySQL recusar
> credencial válida, verifique antes se há **duas instâncias disputando a porta 3306**; o erro se
> apresenta como senha errada, mas é banco errado.

---

## 1. Veredito da análise — achado a achado

Cada item do parecer foi reconferido contra o código do HEAD atual antes de virar tarefa. O status
abaixo é o que vale; onde o parecer errou, está dito.

| # | Achado do parecer | Status da verificação | Ação |
|---|---|---|---|
| B1 | Corrida encerramento de sprint × movimento Kanban | **CONFIRMADO** | Fase 3 |
| B2 | Falha de refresh vira erro falso de mutation | **CONFIRMADO — e pior que o descrito** | Fase 4 |
| B3 | Contexto antigo sobrescreve projeto atual no cronograma | **CONFIRMADO** | Fase 5 |
| I1 | `SPRINT_MILESTONE_REQUIRED` prometido × `VALIDATION_ERROR` no runtime | **CONFIRMADO — causa raiz identificada** | Fase 6 |
| I2 | Novas surfaces ausentes do `UI_SURFACE_INVENTORY.md` | **CONFIRMADO** | Fase 8 |
| I3 | Carga inicial do Kanban não é current-context-wins | **CONFIRMADO — preexistente da `main`** | Fase 7 |

### 1.1 Correção de rota — I2 foi validado depois

Numa primeira análise este achado foi classificado como improcedente: uma busca por
`UI_SURFACE_INVENTORY` no repositório não retornava nada, `docs/design/` não existia e
`CONTRIBUTING.md` tinha 72 linhas, sem qualquer regra de inventário.

**A busca foi feita na árvore errada.** A verificação rodou sobre a base local (`4465bc7`), que
tinha divergido do HEAD revisado (`9548a2c`) e não continha a integração da `main`. No HEAD que o
parecer avaliou, `docs/design/UI_SURFACE_INVENTORY.md` existe, veio com o merge, e a regra está
exatamente onde o parecer apontou — `CONTRIBUTING.md:71-85`, seção "Rastreabilidade de superfícies
de UI", incluindo a exigência de que `VISUALLY APPROVED` dependa do
[Visual Validation Log](../design/validation/VISUAL_VALIDATION_LOG.md).

O achado é válido e virou trabalho na Fase 8. Lição de método: conferir a afirmação de um parecer
contra **o commit que o parecer declara ter revisado**, não contra a árvore que estiver aberta.

---

## 2. Mapa achado → fase

```
Fase 3  B1   backend/src/modules/tasks/services/task-kanban.service.js
             backend/src/modules/tasks/repositories/task-movement.repository.js
             backend/src/database/locks.js (novo)
Fase 4  B2   frontend/src/features/schedule/hooks/useScheduleData.js
             frontend/src/features/schedule/pages/SprintsScreen.jsx
             frontend/src/features/schedule/pages/MilestonesScreen.jsx
Fase 5  B3   frontend/src/features/schedule/hooks/useScheduleData.js
Fase 6  I1   backend/src/modules/sprints/sprint.validation.js
             backend/test/api/rf08-rf10-rf35-caixa-preta.test.js
Fase 7  I3   frontend/src/features/tasks/pages/KanbanScreen.jsx
Fase 8  doc  docs/api/API_CONTRACTS.md, ADR, TECHNICAL_BACKLOG.md
        I2   docs/design/UI_SURFACE_INVENTORY.md
```

---

## 3. Fase 3 — B1: movimento de tarefa atômico com o encerramento da sprint

**BLOQUEIA MERGE.**

### 3.1 O defeito, no código atual

`backend/src/modules/tasks/services/task-kanban.service.js:42-63` lê a tarefa e a sprint **fora** de
qualquer transação:

```js
const task = await ensureTaskExists(id);          // linha 44
await ensureProjectExists(task.projectId);        // linha 45
if (task.sprintId) {
  const sprint = await taskRepository.findSprintById(task.sprintId);   // linha 49
  if (sprint && isTerminalSprintStatus(sprint.status)) { ... }         // linha 50
}
const result = await taskMovementRepository.transitionStatus({ task, ... });  // linha 63
```

`backend/src/modules/tasks/repositories/task-movement.repository.js:31-36` abre a transação já com o
snapshot velho e protege apenas o status:

```js
const changed = await tx.task.updateMany({
  where: { id: task.id, projectId: task.projectId, status: task.status },
  data: { status: toStatus }
});
```

Não há lock, não há releitura da sprint e o `sprintId` gravado no `TaskMovement` (linha 47) vem do
snapshot anterior.

Do outro lado, `sprint.repository.js:152-220` (`transitionWithinSprintLock`) encerra a sprint sob
locks reais: `lockProject` → `Sprint FOR UPDATE` → `SprintTask FOR UPDATE` → `Task FOR UPDATE` →
`Milestone FOR UPDATE`, e chama `freezeParticipations` para congelar o estado terminal.

Intercalação possível hoje:

```text
A  lê Task e Sprint (ativa)              -- fora de transação
B  abre transação, trava tudo, encerra a sprint, congela o snapshot terminal
B  commit
A  abre transação e atualiza a Task, gravando Movement/History com a sprint antiga
```

O resultado não equivale a "A antes de B" nem a "B antes de A": o snapshot terminal registra um
status e a tarefa termina em outro — ou a tarefa volta ao backlog pelo `backlog.taskIds` de B
enquanto o movimento de A registra a sprint antiga.

### 3.2 A correção

A chave é que **`transitionWithinSprintLock` já toma `lockProject` como primeiro lock**. Se o caminho
de movimento tomar o mesmo lock de projeto na abertura da sua transação, as duas operações passam a
serializar na linha de `Project` e a intercalação deixa de existir. Não invente um esquema novo:
reaproveite o que o módulo de sprints já usa.

**Passo 1 — extrair o helper de lock.** Hoje `lockProject` é privado em
`sprint.repository.js:83-85`, e `milestone.repository.js` mantém sua própria cópia. Com um terceiro
consumidor, extraia para `backend/src/database/locks.js`:

```js
export function lockProject(tx, projectId) {
  return tx.$queryRaw`SELECT id FROM Project WHERE id = ${projectId} FOR UPDATE`;
}
```

Faça `sprint.repository.js` e `milestone.repository.js` importarem daí e **remova as cópias locais**
— sem alterar comportamento. Se preferir não tocar no módulo de sprints nesta PR, duplicar o helper
em `task-movement.repository.js` é aceitável, mas então registre a duplicação no backlog.

**Passo 2 — travar, reler e revalidar dentro da transação.** `transitionStatus` passa a receber um
callback `validate` (padrão da regra 0.2) e a ordem de lock **Project → Sprint → Task**, idêntica à
de `transitionWithinSprintLock`, para não criar ciclo de deadlock:

```js
async transitionStatus({ task, toStatus, actor, auditEvent, calculateRequirementStatus, validate }) {
  return prisma.$transaction(async (tx) => {
    await lockProject(tx, task.projectId);

    const [antes] = await tx.$queryRaw`
      SELECT sprintId FROM Task WHERE id = ${task.id} AND projectId = ${task.projectId}`;
    if (!antes) return { conflict: true };
    const sprintId = antes.sprintId == null ? null : Number(antes.sprintId);

    let sprint = null;
    if (sprintId) {
      const [travada] = await tx.$queryRaw`
        SELECT id, status FROM Sprint WHERE id = ${sprintId} FOR UPDATE`;
      sprint = travada ?? null;
    }

    const [atual] = await tx.$queryRaw`
      SELECT id, status, sprintId, requirementId FROM Task WHERE id = ${task.id} FOR UPDATE`;
    if (!atual) return { conflict: true };
    const sprintAtual = atual.sprintId == null ? null : Number(atual.sprintId);
    if (sprintAtual !== sprintId) return { conflict: true };

    await validate({ status: atual.status, sprint });

    const changed = await tx.task.updateMany({
      where: { id: task.id, projectId: task.projectId, status: atual.status, sprintId: sprintAtual },
      data: { status: toStatus }
    });
    if (changed.count !== 1) return { conflict: true };
    ...
  });
}
```

Regras do trecho restante da transação:

- `fromStatus` do `TaskMovement` e o `fromValue` do `TaskHistoryEntry` passam a usar `atual.status`,
  **não** `task.status` do snapshot;
- `sprintId` do `TaskMovement` passa a usar `sprintAtual`, **não** `task.sprintId`;
- `recalculateRequirement` passa a usar `atual.requirementId`;
- a leitura sem lock do `sprintId` (primeiro `$queryRaw`) existe só para descobrir *qual* sprint
  travar; a igualdade `sprintAtual !== sprintId` verificada depois do lock é o que garante que ela
  não mudou no meio. Se mudou, devolva `conflict` — o cliente recarrega e tenta de novo.

**Passo 3 — a regra continua no service.** `task-kanban.service.js` deixa de consultar a sprint antes
da transação e passa a injetar a regra:

```js
const result = await taskMovementRepository.transitionStatus({
  task,
  toStatus: payload.toStatus,
  actor,
  calculateRequirementStatus,
  validate: ({ status, sprint }) => {
    if (sprint && isTerminalSprintStatus(sprint.status)) {
      throw new TaskServiceError(
        'Sprint concluída ou cancelada não pode ter tarefas movidas.',
        409,
        ERROR_CODES.TASK_SPRINT_LOCKED,
        { exposeTechnicalDetails: true }
      );
    }
    if (status === toStatus) {
      throw new TaskServiceError('A tarefa já está nesta coluna.', 400);
    }
  },
  auditEvent: buildAuditEvent({ ... })
});
```

Cuidados:

- a checagem `task.status === payload.toStatus` das linhas 60-62 **migra para dentro do `validate`**,
  porque a leitura de fora pode estar velha. Mantenha o mesmo status HTTP (400) e a mesma mensagem;
- a exceção lançada de dentro do callback aborta a transação — é o comportamento desejado. Confirme
  que o handler de erro converte `TaskServiceError` corretamente mesmo vindo de dentro do
  `$transaction`;
- `ensureTaskExists` / `ensureProjectExists` continuam antes, para preservar o 404 opaco de recurso
  fora do projeto. Só a **regra terminal** e a **comparação de status** vão para dentro.

### 3.3 Testes obrigatórios

Em `backend/test/integration/rf10-sprint-schedule.test.js`:

1. **Encerramento vence movimento tardio.** Segure o movimento até a sprint encerrar, então libere:
   a resposta deve ser `409` (`TASK_SPRINT_LOCKED` ou conflito), e o `GET` da tarefa deve devolver
   exatamente o status congelado pelo encerramento. Nenhum `TaskMovement` novo pode existir.
2. **Movimento vence encerramento tardio.** Ordem invertida: o movimento conclui, o encerramento
   congela o status **já movido**. O `TaskMovement` gravado deve apontar para a sprint correta.
3. **Sprint trocada no meio.** A tarefa muda de sprint entre a leitura e a transação → `409` de
   conflito, sem escrita parcial.
4. Em todos: assertar que `TaskMovement`, `TaskHistoryEntry` e `AuditEvent` ou existem os três, ou
   não existe nenhum.

Para orquestrar a concorrência, dispare as duas promises e controle a ordem de resolução
explicitamente; não use `setTimeout` como sincronização.

---

## 4. Fase 4 — B2: sucesso de mutation não pode virar erro de refresh

**BLOQUEIA MERGE.**

### 4.1 O defeito, no código atual

Em `SprintsScreen.jsx` e `MilestonesScreen.jsx` a mutation e o refresh dividem o mesmo `try`, e o
refresh vem **depois** do `feedback(...)`. Como `handleFailure` faz `setSuccess('')` antes de
`setError(...)` (`useScheduleData.js:96-99`), uma falha de refresh **apaga o sucesso já exibido e o
substitui por um erro que não aconteceu**.

Sites confirmados:

| Arquivo | Função | Refresh dentro do `try` | Mensagem falsa |
|---|---|---|---|
| `SprintsScreen.jsx` | `submitSprint` | `await Promise.all([refreshSprints(), refreshSchedule()])` | "Não foi possível salvar a sprint." |
| `SprintsScreen.jsx` | `changeSprintStatus` | `await Promise.all([refreshSchedule(), ...])` | "Não foi possível atualizar o status da sprint." |
| `MilestonesScreen.jsx` | `submitMilestone` | `await Promise.all([refreshMilestones(), refreshSchedule(), ...])` | "Não foi possível salvar o marco." |
| `MilestonesScreen.jsx` | `toggleMilestoneStatus` | `await refreshSchedule()` | "Não foi possível atualizar o status do marco." |
| `MilestonesScreen.jsx` | `removeMilestone` | `await refreshSchedule()` | "Não foi possível excluir o marco." |

O caso mais grave é `removeMilestone`: o marco **foi** excluído, a lista local **já** o removeu, e
mesmo assim a tela afirma que a exclusão falhou. Em `submitMilestone`, um retry do usuário cria
marco duplicado.

### 4.2 A correção

**Passo 1 — dar ao hook um terceiro estado.** `useScheduleData.js` ganha uma função que registra
falha de atualização **sem apagar o sucesso**:

```js
const refreshFailed = useCallback(() => {
  setError(
    'A ação foi concluída, mas não foi possível atualizar os dados exibidos. Recarregue a página.'
  );
}, []);
```

E um utilitário que fecha a mutation antes de tocar no refresh:

```js
const settle = useCallback(
  async (message, refresh) => {
    feedback(message);
    try {
      await refresh();
    } catch {
      refreshFailed();
    }
  },
  [feedback, refreshFailed]
);
```

Exporte `settle` no retorno do hook.

**Passo 2 — verificar a renderização simultânea.** As telas precisam conseguir mostrar o banner de
sucesso **e** o aviso de atualização ao mesmo tempo. Se hoje o JSX renderiza `error` e `success` em
ramos exclusivos, ajuste para que ambos apareçam. Sem isso o aviso some e o usuário não sabe que a
lista está velha.

**Passo 3 — reescrever os cinco sites.** Padrão:

```js
try {
  const { data } = await scheduleApi.updateSprintStatus(sprint.id, status);
  setSprints((current) => current.map((item) => (item.id === sprint.id ? data.sprint : item)));
  if (selectedSprint?.id === sprint.id) setSelectedSprint(data.sprint);
  await settle(data.message, () =>
    Promise.all([
      refreshSchedule(),
      data.milestoneCompleted ? refreshMilestones() : Promise.resolve()
    ])
  );
} catch (requestError) {
  handleFailure(requestError, 'Não foi possível atualizar o status da sprint.');
} finally {
  setBusySprintId(null);
}
```

O `catch` externo passa a cobrir **somente** a chamada de mutation. Tudo que for refresh entra pelo
`settle`.

**Passo 4 — não confundir com o partial success que já existe.** `submitSprint` (aviso de tarefas) e
`submitMilestone` (aviso de sprints) já tratam sucesso parcial de forma explícita e **correta**.
Preserve esse comportamento: onde já existe `avisoTarefas` / `avisoSprints`, a mensagem específica
continua vencendo a genérica de refresh.

**Passo 5 — retry recarrega leitura, não repete mutation.** Se houver botão de "tentar novamente"
associado a esse estado, ele deve chamar `loadAll()`, nunca reenviar a mutation.

### 4.3 Testes obrigatórios

Em `frontend/test/features/SprintsScreen.test.jsx` e `MilestonesScreen.test.jsx`, um caso por site:
mock da mutation resolvendo com sucesso e do refresh correspondente **rejeitando**. Assertar que:

- a mensagem de sucesso da ação aparece;
- a mensagem falsa de falha ("Não foi possível salvar…", "Não foi possível excluir…") **não** aparece;
- o aviso de atualização aparece;
- em `removeMilestone`, o marco permanece fora da lista.

---

## 5. Fase 5 — B3: cronograma é current-context-wins

**BLOQUEIA MERGE.**

### 5.1 O defeito, no código atual

`frontend/src/features/schedule/hooks/useScheduleData.js`:

- **linhas 62-64:** o `finally` roda `setLoading(false)` mesmo quando a carga foi abortada. A carga
  do projeto novo, ainda em voo, tem seu `loading` derrubado pela carga velha — a tela pinta
  "vazio" ou dados parciais antes da hora;
- **linhas 69-85:** `refreshSchedule`, `refreshSprints` e `refreshMilestones` chamam a API **sem
  `signal`**, sem token de geração e sem verificar o `projectId` corrente. Um refresh disparado em A
  que resolva depois da carga de B escreve os dados de A por cima de B;
- **troca de projeto:** nada limpa `project`, `schedule`, `sprints`, `milestones` nem
  `currentMembership`. Enquanto B carrega, a rota nova mostra dados, papel e controles de A — e
  `somenteLeitura` (linha 113) deriva do membership antigo, então os controles podem aparecer
  liberados para quem em B é `VIEWER`. O backend continua autoritativo e recusaria a mutation, mas a
  UI oferece a ação errada.

### 5.2 A correção

**Passo 1 — token de geração.**

```js
const generationRef = useRef(0);

const isCurrent = useCallback((generation) => generation === generationRef.current, []);
```

**Passo 2 — invalidar e limpar na troca de projeto.** Um efeito que roda quando `projectId` muda,
**antes** da carga: incrementa `generationRef.current`, zera `project`, `schedule`, `sprints`,
`milestones` e `currentMembership`, e recoloca `loading = true`. Nenhum dado do projeto anterior
pode sobreviver à troca.

**Passo 3 — guardar todo `setState` assíncrono.** `loadAll` captura a geração no início e verifica
antes de cada escrita, inclusive no `finally`:

```js
const loadAll = useCallback(async (range = {}) => {
  const generation = ++generationRef.current;
  setLoading(true);
  setError('');
  setForbidden(false);
  try {
    const result = await run(async (signal) => { ... });
    if (!result || !isCurrent(generation)) return;
    setProject(result.project);
    ...
  } catch (requestError) {
    if (!isCurrent(generation)) return;
    reportFailure(requestError, 'Não foi possível carregar o cronograma.');
  } finally {
    if (isCurrent(generation)) setLoading(false);
  }
}, [projectId, reportFailure, run, isCurrent]);
```

**Passo 4 — refreshes abortáveis e guardados.** Cada refresh ganha sua **própria** instância de
`useAbortableRequest` (uma instância compartilhada faria um refresh cancelar o outro, já que
`run` aborta a chamada anterior — ver `useAbortableRequest.js:14`), passa o `signal` adiante e só
escreve se a geração ainda for a corrente:

```js
const scheduleRequest = useAbortableRequest();

const refreshSchedule = useCallback(async (range = {}) => {
  const generation = generationRef.current;
  const response = await scheduleRequest.run((signal) =>
    scheduleApi.getSchedule(projectId, range, { signal })
  );
  if (!response || !isCurrent(generation)) return;
  setSchedule(response.data);
}, [projectId, scheduleRequest, isCurrent]);
```

Idem para `refreshSprints` e `refreshMilestones`.

> **Atenção à interação com a Fase 4.** `settle` precisa continuar distinguindo *falha real* de
> *cancelamento*. Um refresh abortado por troca de projeto resolve como `undefined` e **não** é
> falha: não pode disparar `refreshFailed()`. Como `run` já engole o cancelamento e devolve
> `undefined` em vez de lançar, o `catch` do `settle` naturalmente não é acionado — confirme que
> segue assim depois da mudança e cubra com teste.

**Passo 5 — cleanup no unmount.** O `useEffect` de cleanup do `useAbortableRequest` já aborta a
requisição corrente de cada instância. Garanta que todas as instâncias novas estão no mesmo hook,
não criadas dentro de callbacks.

### 5.3 Testes obrigatórios

Em `frontend/test/features/ScheduleScreen.test.jsx` (ou arquivo próprio do hook):

1. **Resposta A/B fora de ordem.** Monte com `projectId = A`, troque para `B`, faça a resposta de A
   resolver **depois** da de B. Assertar que a tela mostra B: dados, papel e controles.
2. **Refresh obsoleto.** Dispare `refreshSprints()` em A, troque para B, resolva a de A depois.
   Assertar que `sprints` continua sendo o de B.
3. **`loading` não é derrubado pela carga velha.** Carga de A abortada não pode deixar
   `loading = false` enquanto B ainda carrega.
4. **Sem vazamento de papel.** A com `MANAGER`, B com `VIEWER`: durante a carga de B, os controles de
   mutação não podem estar habilitados.
5. **Cancelamento não é erro.** Refresh abortado por troca de projeto não exibe o aviso da Fase 4.

---

## 6. Fase 6 — I1: código de erro do contrato bate com o runtime

### 6.1 O defeito, com a causa raiz

`docs/api/API_CONTRACTS.md:448` promete `SPRINT_MILESTONE_REQUIRED` (400) para "criação de sprint sem
marco". O código existe em `error-codes.js:42` e é lançado em `sprint.schema.js:296-305`.

**Mas a regra é inalcançável por HTTP.** `sprint.validation.js:48-54` declara:

```js
export const createSprintBodySchema = strictObject({
  ...
  milestoneId: positiveInteger('ID do marco inválido.')
});
```

`milestoneId` é obrigatório e não-nulo no Zod. `validateRequest` recusa antes do service, com
`400 VALIDATION_ERROR`, tanto no caso "campo ausente" quanto em `milestoneId: null`. O
`SPRINT_MILESTONE_REQUIRED` do service nunca é emitido nesse caminho — só o teste unitário
(`sprint.service.test.js:298`), que chama o service direto, o alcança.

O `RF10_RF35_RELATORIO_TESTES.md:551-554` e o `CASOS_CAIXA_PRETA.md:137` já registram a divergência
como **ACHADO CP-A1**.

### 6.2 A correção

Alinhe o **emissor** ao contrato, não o contrário: o código já existe no registro, no service, no
teste unitário e no `ASVS_BASELINE.md`. Torne o Zod permissivo o bastante para a regra de domínio
falar:

```js
milestoneId: positiveInteger('ID do marco inválido.').nullable().optional()
```

Com isso, campo ausente e `milestoneId: null` atravessam a validação de payload e chegam a
`buildSprintData`, que responde `400 SPRINT_MILESTONE_REQUIRED`. Um `milestoneId` malformado
(string, zero, negativo) continua `400 VALIDATION_ERROR` — que é o correto.

Confirme que `updateSprintBodySchema` (linhas 56-65) **não** muda: lá `milestoneId: null` é
desassociação legítima.

### 6.3 Corrigir o teste CP-PE-01

`backend/test/api/rf08-rf10-rf35-caixa-preta.test.js:370-387` tem uma asserção duplicada — as linhas
384 e 385 verificam ambas `semCampo`, e `comNull` só é conferido quanto ao status:

```js
expect(semCampo.status).toBe(400);
expect(semCampo.status).toBe(400);   // <-- deveria ser comNull
expect(comNull.status).toBe(400);
```

Reescreva cobrindo os dois caminhos com o código:

```js
expect(semCampo.status).toBe(400);
expect(semCampo.body.code).toBe('SPRINT_MILESTONE_REQUIRED');
expect(comNull.status).toBe(400);
expect(comNull.body.code).toBe('SPRINT_MILESTONE_REQUIRED');
```

Adicione um caso negativo: `milestoneId: 'abc'` → `400 VALIDATION_ERROR`.

Atualize `docs/issues/RF08_RF10_RF35_CASOS_CAIXA_PRETA.md` fechando o ACHADO CP-A1, e verifique se
`schedule-contracts.test.js` tem asserção equivalente que precise acompanhar.

---

## 7. Fase 7 — I3: carga inicial do Kanban

Preexistente da `main`, mas a PR acrescentou o catálogo de sprints ao mesmo fluxo, então entra junto.

`frontend/src/features/tasks/pages/KanbanScreen.jsx:200-256`: o `Promise.all` de seis chamadas não
tem `signal` nem guard de contexto. O `loadedProjectIdRef` (linhas ~262-266) impede recarga do
**mesmo** projeto, mas não impede que a resposta de A sobrescreva o quadro de B na troca.

Aplique o mesmo padrão da Fase 5: geração/contexto, `signal` propagado às chamadas que aceitam,
guard antes de cada `setState`, limpeza do estado na troca de projeto — incluindo `projectSprints` e
`sprintFilter`, que são o estado novo desta PR.

Preserve dois comportamentos atuais que estão corretos:

- a falha de `listSprints` cai para lista vazia sem derrubar o quadro (o `.catch` no `Promise.all`);
- as sprints pedidas na URL só são aplicadas ao filtro depois de validadas contra o catálogo
  carregado.

Teste: resposta A/B fora de ordem no Kanban, assertando quadro, catálogo de sprints e filtro do
projeto corrente.

> Os arquivos de `tasks/` usam comentários narrativos, diferente de `sprints/` e `schedule/`. Ao
> editar, siga a regra 0.5 e **não acrescente** comentários novos; se um comentário existente ficar
> falso depois da mudança, corrija-o ou remova-o.

---

## 8. Fase 8 — Documentação

1. `docs/api/API_CONTRACTS.md` — se a Fase 6 mudou o momento em que `SPRINT_MILESTONE_REQUIRED` é
   emitido, deixe explícito na tabela de códigos que ele cobre campo ausente **e** `null` na
   criação, e que `milestoneId` malformado continua `VALIDATION_ERROR`.
2. **ADR** — registre a decisão da Fase 3: o movimento de tarefa serializa com o encerramento de
   sprint pelo lock de `Project`, com ordem `Project → Sprint → Task` idêntica à de
   `transitionWithinSprintLock`. Anexe à ADR-010/ADR-011 ou abra uma nova, seguindo a numeração
   corrente. **Aqui é onde vai o racional que não pode virar comentário no código.**
3. `docs/issues/TECHNICAL_BACKLOG.md` — registre os não-bloqueantes:
   - endpoint atômico para salvar marco e reassociar sprints (hoje são `PUT`s sequenciais com
     sucesso parcial explícito);
   - convergir `TaskDetailsPanel` para a primitive canônica de dialog (trap, Escape, retorno de foco)
     — lacuna legacy, não regressão desta PR;
   - se você duplicou `lockProject` em vez de extrair, a dívida da terceira cópia;
   - decisão de processo sobre adotar (ou não) um inventário de surfaces de UI — ver §11.
4. `docs/issues/RF08_RF10_RF35_CASOS_CAIXA_PRETA.md` — fechar o ACHADO CP-A1.
5. `docs/design/UI_SURFACE_INVENTORY.md` — **I2, obrigatório por `CONTRIBUTING.md:71-85`.**
   Catalogar as surfaces novas de Sprints, Milestones e Schedule, mais o filtro de sprint do Kanban
   e o estado de aviso criado na Fase 4. Cada linha traz rota, owner, trigger, papéis e os estados
   auxiliares (loading, empty, error, success, permission). Atualizar os totais entre os marcadores
   `INVENTORY_COUNTS`. Nenhuma surface pode receber `VISUALLY APPROVED` enquanto não constar do
   Visual Validation Log — enquanto a §9 não for feita, todas ficam `TECHNICALLY VERIFIED`.

---

## 9. Validação visual obrigatória

O parecer marcou as três páginas novas como **NOT VISUALLY VALIDATED**: nenhuma foi renderizada na
revisão. Antes de pedir nova revisão, suba a aplicação e confira, em Light **e** Dark:

- `/sprints`, `/milestones`, `/schedule` com **dados mínimos** (zero sprints, zero marcos) e **em
  escala** (muitas sprints, agenda cheia) — os dois extremos, não só o meio;
- os estados novos das Fases 4 e 5: sucesso com aviso de atualização visíveis juntos, e a troca de
  projeto sem piscar dados do projeto anterior;
- viewports relevantes e alvos de toque;
- foco visível nos controles alterados.

Anexe as evidências na PR.

---

## 10. Checklist final (Definition of Done)

**Bloqueantes**

- [ ] Movimento de tarefa abre transação com `lockProject`, relê Task e Sprint sob `FOR UPDATE` na
      ordem `Project → Sprint → Task` e revalida a regra terminal lá dentro.
- [ ] `TaskMovement` e `TaskHistoryEntry` usam o status e o `sprintId` relidos, nunca o snapshot.
- [ ] Divergência de sprint entre leitura e transação devolve `409` sem escrita parcial.
- [ ] Teste de integração concorrente nas duas ordens (encerrar↔mover) passando.
- [ ] Os cinco sites de mutation do Sprints/Milestones separam sucesso de falha de refresh.
- [ ] Falha de refresh não apaga o sucesso e não sugere repetir a mutation.
- [ ] Testes de mutation-ok/refresh-falha passando nas duas telas.
- [ ] `useScheduleData` tem token de geração, limpeza na troca de projeto e guard em todo `setState`.
- [ ] Os três refreshes são abortáveis, cada um com sua instância, e verificam a geração.
- [ ] `setLoading(false)` só roda para a geração corrente.
- [ ] Testes A/B fora de ordem passando, incluindo o de papel/`somenteLeitura`.
- [ ] Cancelamento por troca de projeto não é reportado como falha de atualização.

**Importantes**

- [ ] `POST /projects/:id/sprints` sem marco devolve `400 SPRINT_MILESTONE_REQUIRED` (ausente e `null`).
- [ ] `milestoneId` malformado continua `400 VALIDATION_ERROR`.
- [ ] CP-PE-01 sem asserção duplicada e validando `body.code`.
- [ ] Carga do Kanban é current-context-wins, incluindo catálogo de sprints e filtro.
- [ ] Surfaces novas catalogadas no `UI_SURFACE_INVENTORY.md`, com totais atualizados e
      nenhuma marcada como `VISUALLY APPROVED` sem entrada no Visual Validation Log.

**Transversais**

- [ ] Nenhuma migration nova; `npx prisma validate` passa.
- [ ] Nenhum comentário narrativo novo em `sprints/`, `schedule/` ou `tasks/`.
- [ ] Backend: lint, unitários, integração e API verdes.
- [ ] Frontend: lint, build e testes verdes.
- [ ] Cobertura não regride em relação ao HEAD atual (back: 89,80% statements; front: 76,40%).
- [ ] Validação visual da seção 9 feita e anexada.
- [ ] ADR e backlog atualizados.
- [ ] CI verde no novo HEAD.

### Plano de commits

```
fix(kanban): serializa movimento de tarefa com encerramento de sprint
fix(schedule): separa sucesso de mutation de falha de refresh
fix(schedule): aplica current-context-wins nas cargas do cronograma
fix(sprints): emite SPRINT_MILESTONE_REQUIRED na criacao sem marco
fix(kanban): aplica current-context-wins na carga inicial do quadro
docs(pr12): registra decisao de lock e fecha o achado CP-A1
```

---

## 11. Itens deliberadamente fora de escopo

- **Domínio de comentários (Edit/Delete).** Corretamente classificado como `NOT IMPLEMENTED`.
  Pertence ao card S1-05. Não comece a UI antes do contrato backend: qualquer rótulo "Editado",
  tombstone ou distinção por ator seria `CONTRACT GAP`. Em particular, não invente papel
  "Administrador" — `OWNER` é papel contextual de projeto, não autoridade global.
- **Endpoint atômico marco↔sprints** e **dialog do `TaskDetailsPanel`.** Backlog, conforme §8.3.
