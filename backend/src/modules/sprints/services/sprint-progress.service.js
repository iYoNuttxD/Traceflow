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
    const frozen = ['CONCLUIDA', 'CANCELADA'].includes(sprint.status);
    const [participations, burndownData] = await Promise.all([
      sprintRepository.findParticipationsBySprint(id, frozen),
      sprintRepository.findBurndownDataBySprint(sprint)
    ]);

    const historicalLimitations = [];
    if (sprint.startedAt && !sprint.planningSnapshotAt) {
      historicalLimitations.push('LEGACY_PLANNING_SNAPSHOT_UNAVAILABLE');
    }
    const missingClosingPoints =
      frozen && burndownData.some((p) => p.removedAt === null && p.points === null);
    if (missingClosingPoints) historicalLimitations.push('LEGACY_CLOSING_POINTS_UNAVAILABLE');
    if (frozen && !sprint.closedAt && !sprint.completedAt) {
      historicalLimitations.push('LEGACY_CLOSING_CUTOFF_UNAVAILABLE');
    }
    if (frozen && participations.some((p) => !p.exitStatus)) {
      historicalLimitations.push('LEGACY_CLOSING_STATUS_UNAVAILABLE');
    }
    return {
      historicalLimitations,
      ...buildSprintProgress({ sprint, participations, cutoff }),
      burndown: buildSprintBurndown({
        sprint,
        participations: missingClosingPoints ? [] : burndownData,
        cutoff
      })
    };
  }
};
