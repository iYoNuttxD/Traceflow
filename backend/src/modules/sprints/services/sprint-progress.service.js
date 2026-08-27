import { sprintRepository } from '../repositories/sprint.repository.js';
import { buildSprintProgress } from '../sprint.progress.calculator.js';
import { buildSprintBurndown } from '../sprint.burndown.calculator.js';
import { parseSprintId } from '../sprint.schema.js';
import { ensureSprintExists } from './sprint-crud.service.js';

export const sprintProgressService = {
  async getSprintProgress(sprintId) {
    const id = parseSprintId(sprintId);
    const sprint = await ensureSprintExists(id);

    const cutoff = new Date();
    const [participations, burndownData] = await Promise.all([
      sprintRepository.findParticipationsBySprint(id),
      sprintRepository.findBurndownDataBySprint(sprint)
    ]);

    return {
      ...buildSprintProgress({ sprint, participations, cutoff }),
      burndown: buildSprintBurndown({ sprint, participations: burndownData, cutoff })
    };
  }
};
