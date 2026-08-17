// Evolucao por sprint (RF35). Funcoes puras: sem Prisma, sem Express, sem I/O.
// O instante de corte e SEMPRE injetado por parametro; nunca chamar new Date()
// aqui dentro, pela mesma razao de sprint.calculator.js — o resultado precisa ser
// identico em qualquer fuso e reproduzivel entre execucoes.
//
// A fonte do calculo e a participacao (SprintTask), nao o historico de eventos.
// Reconstruir o escopo a partir de TaskHistoryEntry funcionava enquanto a tarefa
// pertencia a uma sprint por vez, mas dependia de registros mutaveis e do status
// ATUAL da tarefa: concluir a tarefa depois mudava o resultado de uma sprint ja
// encerrada. A participacao guarda o que foi observado aqui, e isso nao muda.
import { buildMetric } from '../traceability/index.js';

const CONCLUIDO = 'CONCLUIDO';
const TERMINAL = ['CONCLUIDA', 'CANCELADA'];

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

// Status que vale PARA ESTA SPRINT. `exitStatus` congela o que foi observado
// aqui — na saida da tarefa ou no encerramento —, e so na falta dele o status
// atual entra. Uma sprint encerrada depois deste modelo sempre tem exitStatus;
// as encerradas antes dele caem no status atual, limitacao conhecida do backfill.
export function effectiveStatus(participation) {
  return participation.exitStatus ?? participation.currentStatus;
}

function metric(participations) {
  const concluidas = participations.filter(
    (participation) => effectiveStatus(participation) === CONCLUIDO
  ).length;
  // `buildMetric` devolve percentage null quando o denominador e zero. Zero e
  // nulo sao estados diferentes: "nada concluido" nao e "nao ha o que medir".
  return buildMetric(concluidas, participations.length);
}

const porTarefa = (a, b) => (a.taskId ?? 0) - (b.taskId ?? 0);

// Ponto de entrada. `cutoff` e um Date injetado pelo service.
export function buildSprintProgress({ sprint, participations = [], cutoff }) {
  const frozen = TERMINAL.includes(sprint.status);
  const baseline = resolveBaseline(sprint);

  const current = participations.filter((participation) => participation.removedAt === null);
  // Base aberta: nada e "posterior ao planejamento", entao planejado e atual
  // coincidem por definicao e o vaivem durante o planejamento nao conta.
  const planned =
    baseline.kind === 'OPEN'
      ? current
      : // Removida continua no denominador do planejado: ela FOI planejada, e
        // tira-la de la esconderia escopo que a sprint nao entregou.
        participations.filter((participation) => !participation.addedAfterStart);

  const scopeChange =
    baseline.kind === 'OPEN'
      ? { added: [], removed: [] }
      : {
          // Saldo liquido: quem entrou depois do inicio e saiu nao entrou nem
          // saiu do escopo, e nao aparece em nenhuma das duas listas.
          added: participations
            .filter(
              (participation) => participation.addedAfterStart && participation.removedAt === null
            )
            .map((participation) => ({
              taskId: participation.taskId,
              at: toIso(participation.addedAt),
              fromSprintId: participation.carriedFromSprintId ?? null
            }))
            .sort(porTarefa),
          removed: participations
            .filter(
              (participation) => !participation.addedAfterStart && participation.removedAt !== null
            )
            .map((participation) => ({
              taskId: participation.taskId,
              at: toIso(participation.removedAt),
              toSprintId: participation.movedToSprintId ?? null,
              reason: participation.removalReason ?? null,
              exitStatus: participation.exitStatus ?? null
            }))
            .sort(porTarefa)
        };

  // Tarefas que continuaram em outra sprint. O registro daqui nao muda por causa
  // disso: e justamente o que a continuidade precisa preservar.
  const carryOver = participations
    .filter((participation) => participation.movedToSprintId)
    .map((participation) => ({
      taskId: participation.taskId,
      toSprintId: participation.movedToSprintId,
      exitStatus: participation.exitStatus ?? null,
      at: toIso(participation.removedAt)
    }))
    .sort(porTarefa);

  return {
    sprintId: sprint.id,
    projectId: sprint.projectId,
    status: sprint.status,
    // Sprint encerrada devolve sempre o mesmo resultado, entao o corte e o
    // encerramento — nao o momento em que alguem consultou.
    frozen,
    cutoff: frozen ? (toIso(sprint.completedAt) ?? toIso(cutoff)) : toIso(cutoff),
    baseline,
    planned: metric(planned),
    current: metric(current),
    scopeChange,
    carryOver
  };
}
