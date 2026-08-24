// Maquina de estados da sprint (RF10).
// PLANEJADA -> EM_ANDAMENTO | CANCELADA
// EM_ANDAMENTO -> CONCLUIDA | CANCELADA
// Estados terminais nao transicionam.
//
// Tres regras do ADR-011 vivem aqui, todas dentro do mesmo lock: so uma sprint
// em andamento por projeto (D06), devolucao ao backlog no encerramento (D07) e
// conclusao automatica do marco (D05).
import { sprintRepository } from '../repositories/sprint.repository.js';
import { buildAuditEvent } from '../../audit/audit.service.js';
import {
  allMilestoneSprintsConcluded,
  ensureSingleActiveSprint,
  ensureTransitionAllowed,
  isTerminalSprintStatus,
  parseSprintId,
  sprintNotFoundError
} from '../sprint.schema.js';
import { ensureSprintExists } from './sprint-crud.service.js';

const CONCLUIDO = 'CONCLUIDO';

// Tarefas que nao chegaram ao fim voltam para o backlog (ADR-011 D07). O que se
// limpa e o PONTEIRO da participacao ativa (`Task.sprintId`, ADR-010 D01) — a
// participacao em si ja foi congelada com `exitStatus` e continua respondendo
// pelo RF35 do periodo encerrado.
//
// Sem isto a tarefa ficaria presa numa sprint congelada: o quadro a mostraria
// somente leitura para sempre, e nao haveria como leva-la a sprint seguinte.
function planBacklogReturn({ sprint, tasks, actorUserId }) {
  const pendentes = tasks.filter(
    (task) => task.sprintId === sprint.id && task.status !== CONCLUIDO
  );
  return {
    taskIds: pendentes.map((task) => task.id),
    // Mesma convencao ja usada pela mutacao de escopo: a saida da sprint e uma
    // entrada de `field: SPRINT` com `toValue` nulo.
    historyEntries: pendentes.map((task) => ({
      projectId: sprint.projectId,
      taskId: task.id,
      actorUserId,
      field: 'SPRINT',
      fromValue: String(sprint.id),
      toValue: null
    }))
  };
}

export const sprintStatusService = {
  async updateSprintStatus(sprintId, status, context = {}) {
    const id = parseSprintId(sprintId);
    // A leitura de fora da transacao resolve o 404 cedo e diz qual projeto travar.
    // Nada mais: o status que decide a transicao e o relido sob lock (ADR-010 D17).
    // Validar contra este aqui deixava duas requisicoes partirem do mesmo estado,
    // e a segunda reabria o que a primeira encerrou.
    const current = await ensureSprintExists(id);

    const resultado = await sprintRepository.transitionWithinSprintLock(
      id,
      current.projectId,
      ({ sprint: atual, sprints, tasks, milestoneSprints }) => {
        const nextStatus = ensureTransitionAllowed(atual.status, status);

        // Sobre o retrato travado, nunca sobre a leitura anterior: iniciar duas
        // sprints ao mesmo tempo passaria nas duas checagens feitas fora do lock.
        if (nextStatus === 'EM_ANDAMENTO') ensureSingleActiveSprint(sprints, id);

        // Um unico instante para a transicao e para o congelamento: dois
        // `new Date()` dariam a uma sprint um encerramento anterior ao fechamento
        // das suas proprias participacoes.
        const occurredAt = new Date();
        // `startedAt` e a linha de base do planejamento (RF35), NAO uma trava: o
        // escopo continua alteravel depois do inicio, apenas sinalizado como
        // inclusao posterior. Quem congela e o estado terminal.
        const data = { status: nextStatus };
        if (nextStatus === 'EM_ANDAMENTO') data.startedAt = occurredAt;
        if (nextStatus === 'CONCLUIDA') data.completedAt = occurredAt;

        const terminal = isTerminalSprintStatus(nextStatus);
        const backlog = terminal
          ? planBacklogReturn({ sprint: atual, tasks, actorUserId: context.actorUserId })
          : null;

        // O marco fecha quando todas as suas sprints nao canceladas terminam. A
        // sprint em transicao entra na conta com o status NOVO: ela ainda nao foi
        // escrita, e usar o antigo faria a ultima sprint de um marco nunca
        // conclui-lo.
        const irmas = milestoneSprints.map((sprint) =>
          sprint.id === id ? { ...sprint, status: nextStatus } : sprint
        );
        const milestone =
          nextStatus === 'CONCLUIDA' && atual.milestoneId && allMilestoneSprintsConcluded(irmas)
            ? { id: atual.milestoneId, status: 'CONCLUIDO' }
            : null;

        return {
          data,
          // Entrar em estado terminal congela a composicao: cada participacao
          // ainda ativa guarda o status que a tarefa tinha AQUI. Sem isso,
          // conclui-la depois — ou leva-la para a sprint seguinte — reescreveria
          // o resultado de um periodo ja encerrado (ADR-010 D04).
          freezeAt: terminal ? occurredAt : null,
          backlog,
          milestone,
          auditEvent: buildAuditEvent({
            actorUserId: context.actorUserId,
            // Do registro travado, pela mesma razao do status.
            projectId: atual.projectId,
            requestId: context.requestId,
            action: 'SPRINT_STATUS_CHANGED',
            resourceType: 'Sprint',
            resourceId: id,
            metadata: { sprintId: id }
          })
        };
      }
    );

    // null significa que a sprint sumiu entre a checagem e o lock.
    if (resultado === null) throw sprintNotFoundError();
    return resultado;
  }
};
