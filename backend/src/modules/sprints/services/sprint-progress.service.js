// Evolucao por sprint (RF35). Coordena a consulta e delega o calculo ao modulo
// puro; nenhuma regra de percentual mora aqui.
import { sprintRepository } from '../repositories/sprint.repository.js';
import { buildSprintProgress } from '../sprint.progress.calculator.js';
import { parseSprintId } from '../sprint.schema.js';
import { ensureSprintExists } from './sprint-crud.service.js';

export const sprintProgressService = {
  async getSprintProgress(sprintId) {
    const id = parseSprintId(sprintId);
    const sprint = await ensureSprintExists(id);

    // O instante de corte e capturado UMA vez e injetado no calculo, que
    // permanece puro e deterministico. Em sprint encerrada ele nem e usado:
    // o corte passa a ser o encerramento.
    const cutoff = new Date();
    const participations = await sprintRepository.findParticipationsBySprint(id);

    return buildSprintProgress({ sprint, participations, cutoff });
  }
};
