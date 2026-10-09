import { sprintRepository } from '../repositories/sprint.repository.js';
import { buildSprintProgress } from '../sprint.progress.calculator.js';
import { buildSprintBurndown } from '../sprint.burndown.calculator.js';
import { buildSprintHistoricalProjection } from '../sprint.historical.projection.js';
import { buildSprintEffort } from '../sprint.effort.calculator.js';
import { buildSprintHistoricalSummary } from '../sprint.summary.calculator.js';
import { parseSprintId } from '../sprint.schema.js';
import { ensureSprintExists } from './sprint-crud.service.js';

export const sprintProgressService = {
  async getSprintIndicatorFacts(sprintId, cutoff = new Date()) {
    const id = parseSprintId(sprintId);
    const sprint = await ensureSprintExists(id);

    const frozen = ['CONCLUIDA', 'CANCELADA'].includes(sprint.status);
    const [participations, burndownData, effortRows, historicalEvents] = await Promise.all([
      sprintRepository.findParticipationsBySprint(id, frozen),
      sprintRepository.findBurndownDataBySprint(sprint),
      sprintRepository.findEffortRowsBySprint(id, frozen),
      sprint.burnupCoverageStartedAt ? sprintRepository.findHistoricalEventsBySprint(id) : []
    ]);
    const historicalProjection = sprint.burnupCoverageStartedAt
      ? buildSprintHistoricalProjection({ sprint, events: historicalEvents, cutoff })
      : null;

    const historicalSummary = buildSprintHistoricalSummary(
      sprint,
      participations,
      historicalEvents
    );
    const historicalLimitations = [...(historicalSummary?.historicalLimitations ?? [])];
    if (sprint.startedAt && !sprint.planningSnapshotAt) {
      historicalLimitations.push('LEGACY_PLANNING_SNAPSHOT_UNAVAILABLE');
    }
    if (frozen && !sprint.closedAt && !sprint.completedAt) {
      historicalLimitations.push('LEGACY_CLOSING_CUTOFF_UNAVAILABLE');
    }
    if (frozen && participations.some((p) => !p.exitStatus)) {
      historicalLimitations.push('LEGACY_CLOSING_STATUS_UNAVAILABLE');
    }
    if (frozen && participations.some((p) => p.removedAt === null && !p.carryOverKnown)) {
      historicalLimitations.push('UNKNOWN_LEGACY_CARRY_OVER');
    }
    const progress = {
      historicalSummary,
      historicalLimitations: [...new Set(historicalLimitations)],
      ...buildSprintProgress({ sprint, participations, cutoff }),
      effort: buildSprintEffort(effortRows),
      burndown: buildSprintBurndown({
        sprint,
        participations: burndownData,
        cutoff,
        projection: historicalProjection
      })
    };
    return {
      sprint,
      participations,
      burndownData,
      progress,
      historicalProjection,
      historicalEvents
    };
  },

  async getSprintProgress(sprintId) {
    const { progress } = await sprintProgressService.getSprintIndicatorFacts(sprintId);
    return progress;
  }
};
