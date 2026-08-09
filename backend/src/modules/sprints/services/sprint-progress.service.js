// Evolucao por sprint (RF35). Coordena as consultas e delega o calculo ao modulo
// puro; nenhuma regra de percentual mora aqui.
import { sprintRepository } from '../repositories/sprint.repository.js';
import { buildSprintProgress, resolveBaseline } from '../sprint.progress.calculator.js';
import { parseSprintId } from '../sprint.schema.js';
import { ensureSprintExists } from './sprint-crud.service.js';

export const sprintProgressService = {
  async getSprintProgress(sprintId) {
    const id = parseSprintId(sprintId);
    const sprint = await ensureSprintExists(id);

    // O instante de corte e capturado UMA vez e injetado no calculo, que
    // permanece puro e deterministico.
    const cutoff = new Date();
    const baseline = resolveBaseline(sprint);

    const currentTasks = await sprintRepository.findTaskStatusesBySprint(id);

    // Base aberta (sprint ainda PLANEJADA): nada e posterior ao planejamento,
    // entao nem consultamos o historico.
    const history =
      baseline.kind === 'OPEN'
        ? []
        : await sprintRepository.findSprintHistorySince(sprint.projectId, new Date(baseline.at));

    // Tarefas citadas no historico podem ter saido da sprint: sem o status delas
    // o escopo planejado contaria toda removida como nao concluida.
    const atuais = new Set(currentTasks.map((task) => task.id));
    const ausentes = [...new Set(history.map((entry) => entry.taskId))].filter(
      (taskId) => !atuais.has(taskId)
    );
    const historyTasks = ausentes.length
      ? await sprintRepository.findTaskStatusesByIds(ausentes)
      : [];

    return buildSprintProgress({ sprint, currentTasks, historyTasks, history, cutoff });
  }
};
