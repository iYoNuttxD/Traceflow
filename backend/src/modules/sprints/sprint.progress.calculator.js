// Evolucao por sprint (RF35). Funcoes puras: sem Prisma, sem Express, sem I/O.
// O instante de corte e SEMPRE injetado por parametro; nunca chamar new Date()
// aqui dentro, pela mesma razao de sprint.calculator.js — o resultado precisa ser
// identico em qualquer fuso e reproduzivel entre execucoes.
import { buildMetric } from '../traceability/index.js';

const CONCLUIDO = 'CONCLUIDO';

function toSprintId(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Sprint ainda PLANEJADA nao fechou o planejamento: sem `startedAt` a pergunta
// "o que mudou depois do planejamento" nao tem referencia, entao a base fica
// ABERTA e o escopo planejado e, por definicao, o escopo atual.
// `startDate` foi deliberadamente rejeitado como base pelo ADR-009 §6: e data
// planejada, nao execucao.
export function resolveBaseline(sprint) {
  const at = toIso(sprint?.startedAt);
  return at ? { kind: 'STARTED_AT', at } : { kind: 'OPEN', at: null };
}

// Estado de cada tarefa NO INSTANTE DA BASE, reconstruido do historico.
//
// A regra que torna isso exato: para uma tarefa que se moveu depois da base, o
// `fromValue` da PRIMEIRA movimentacao posterior descreve onde ela estava na base
// — nada aconteceu entre a base e esse evento. Para uma tarefa sem movimentacao
// posterior, o estado atual e o mesmo da base.
//
// Reconstruir assim, em vez de somar e subtrair conjuntos, e o que faz o calculo
// sobreviver a sequencias como "saiu e voltou": a algebra de conjuntos erraria o
// sinal nesse caso, a reconstrucao cronologica nao.
export function membersAtBaseline({ currentTaskIds, history, sprintId }) {
  const alvo = String(sprintId);
  const primeiraMovimentacao = new Map();

  for (const entry of history) {
    const anterior = primeiraMovimentacao.get(entry.taskId);
    if (!anterior || new Date(entry.occurredAt) < new Date(anterior.occurredAt)) {
      primeiraMovimentacao.set(entry.taskId, entry);
    }
  }

  const naBase = new Set();
  for (const taskId of currentTaskIds) {
    if (!primeiraMovimentacao.has(taskId)) naBase.add(taskId);
  }
  for (const [taskId, entry] of primeiraMovimentacao) {
    if (entry.fromValue === alvo) naBase.add(taskId);
  }
  return naBase;
}

// Entradas e saidas LIQUIDAS entre a base e o corte. Interessa o saldo, nao o
// log bruto: uma tarefa que saiu e voltou nao entrou nem saiu do escopo.
export function buildScopeChange({ plannedIds, currentTaskIds, history, sprintId }) {
  const alvo = String(sprintId);
  const atuais = new Set(currentTaskIds);
  const ultimaEntrada = new Map();
  const ultimaSaida = new Map();

  for (const entry of history) {
    if (entry.toValue === alvo) {
      const anterior = ultimaEntrada.get(entry.taskId);
      if (!anterior || new Date(entry.occurredAt) >= new Date(anterior.occurredAt)) {
        ultimaEntrada.set(entry.taskId, entry);
      }
    }
    if (entry.fromValue === alvo) {
      const anterior = ultimaSaida.get(entry.taskId);
      if (!anterior || new Date(entry.occurredAt) >= new Date(anterior.occurredAt)) {
        ultimaSaida.set(entry.taskId, entry);
      }
    }
  }

  const added = [];
  for (const taskId of atuais) {
    if (plannedIds.has(taskId)) continue;
    const entry = ultimaEntrada.get(taskId);
    added.push({
      taskId,
      at: entry ? toIso(entry.occurredAt) : null,
      fromSprintId: entry ? toSprintId(entry.fromValue) : null
    });
  }

  const removed = [];
  for (const taskId of plannedIds) {
    if (atuais.has(taskId)) continue;
    const entry = ultimaSaida.get(taskId);
    removed.push({
      taskId,
      at: entry ? toIso(entry.occurredAt) : null,
      toSprintId: entry ? toSprintId(entry.toValue) : null
    });
  }

  const porTarefa = (a, b) => a.taskId - b.taskId;
  return { added: added.sort(porTarefa), removed: removed.sort(porTarefa) };
}

// `buildMetric` devolve percentage null quando o denominador e zero. Zero e nulo
// sao estados diferentes: "nada concluido" nao e "nao ha o que medir".
function metric(taskIds, statusById) {
  const concluidas = [...taskIds].filter((id) => statusById.get(id) === CONCLUIDO).length;
  return buildMetric(concluidas, taskIds.size);
}

// Ponto de entrada. `cutoff` e um Date injetado pelo service.
//
// `historyTasks` existe porque o escopo planejado inclui tarefas que JA SAIRAM da
// sprint: elas nao aparecem em `currentTasks` e, sem o status delas, o numerador
// de `planned` contaria toda tarefa removida como nao concluida.
export function buildSprintProgress({ sprint, currentTasks, historyTasks = [], history, cutoff }) {
  const baseline = resolveBaseline(sprint);
  const currentTaskIds = currentTasks.map((task) => task.id);
  const statusById = new Map(
    [...historyTasks, ...currentTasks].map((task) => [task.id, task.status])
  );

  // Base aberta: nada e "posterior ao planejamento", entao o historico nao entra
  // no calculo e planejado e atual coincidem por definicao.
  const historico = baseline.kind === 'OPEN' ? [] : history;
  const plannedIds = membersAtBaseline({ currentTaskIds, history: historico, sprintId: sprint.id });
  const scopeChange = buildScopeChange({
    plannedIds,
    currentTaskIds,
    history: historico,
    sprintId: sprint.id
  });

  return {
    sprintId: sprint.id,
    projectId: sprint.projectId,
    status: sprint.status,
    cutoff: toIso(cutoff),
    baseline,
    planned: metric(plannedIds, statusById),
    current: metric(new Set(currentTaskIds), statusById),
    scopeChange
  };
}
