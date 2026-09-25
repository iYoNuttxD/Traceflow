import { resourceNotFoundError } from '../../shared/errors/index.js';
import { calculateProjectProgress } from './calculators/project-progress.calculator.js';
import {
  calculateDistribution,
  combineActivity
} from './calculators/responsibility-activity.calculator.js';
import { indicatorResult } from './indicators.mapper.js';
import { indicatorsRepository } from './indicators.repository.js';
import { githubFreshness } from './policies/indicator-freshness.policy.js';
import { normalizeIndicatorPeriod } from './policies/indicator-period.policy.js';
import { activityState } from './policies/indicator-state.policy.js';

function publicPeriod(period) {
  return {
    startDate: period.startDate,
    endDate: period.endDate,
    timeZone: period.timeZone,
    startInclusive: period.startInclusive.toISOString(),
    endExclusive: period.endExclusive.toISOString()
  };
}

export const indicatorsService = {
  async progress(projectId) {
    const facts = await indicatorsRepository.readProgress(Number(projectId));
    if (!facts) throw resourceNotFoundError('Project');
    const total = facts.counts.reduce((sum, row) => sum + row._count._all, 0);
    const completed = facts.counts.find((row) => row.status === 'CONCLUIDO')?._count._all ?? 0;
    return indicatorResult(
      'I01',
      Number(projectId),
      {
        ...calculateProjectProgress({ total, completed }),
        limitations: ['CURRENT_STATE_ONLY', 'HARD_DELETED_TASKS_EXCLUDED']
      },
      facts.asOf.toISOString()
    );
  },

  async activity(projectId, query, normalizedPeriod = null) {
    const id = Number(projectId);
    const period = normalizedPeriod ?? normalizeIndicatorPeriod(query);
    const facts = await indicatorsRepository.readActivity(id, period);
    if (!facts) throw resourceNotFoundError('Project');
    const asOf = facts.asOf.toISOString();
    const periodDto = publicPeriod(period);
    const tasks = calculateDistribution(facts.taskRows);
    const taskState = tasks.unassociated > 0 ? 'PARTIAL' : 'AVAILABLE';
    const taskResult = indicatorResult(
      'I03',
      id,
      {
        value: tasks.total,
        state: taskState,
        period: periodDto,
        distribution: tasks,
        limitations: [
          ...(tasks.unassociated ? ['RESPONSIBLE_NOT_RESOLVABLE'] : []),
          ...(tasks.unassignedHistoricalCount ? ['LEGACY_RESPONSIBLE_SNAPSHOT_MISSING'] : []),
          'HARD_DELETED_TASK_HISTORY_NOT_RECOVERABLE'
        ]
      },
      asOf
    );

    const hasConfirmedMain = Boolean(
      facts.branch?.lastSyncedGeneration && facts.branch?.lastSyncedHeadSha
    );
    const commits = calculateDistribution(facts.commitRows ?? []);
    const freshness = githubFreshness(facts.project.githubIntegration, facts.branch);
    const commitState = !hasConfirmedMain
      ? 'UNAVAILABLE'
      : freshness.stale
        ? 'STALE'
        : commits.unassociated > 0
          ? 'PARTIAL'
          : 'AVAILABLE';
    const commitResult = indicatorResult(
      'I02',
      id,
      {
        value: hasConfirmedMain ? commits.total : null,
        state: commitState,
        period: periodDto,
        distribution: hasConfirmedMain ? commits : null,
        sourceUpdatedAt: freshness.sourceUpdatedAt,
        sourceSyncStatus: freshness.sourceSyncStatus,
        limitations: [
          ...(!facts.branch ? ['MAIN_BRANCH_NOT_OBSERVED'] : []),
          ...(facts.branch && !hasConfirmedMain ? ['MAIN_MEMBERSHIP_NOT_CONFIRMED'] : []),
          ...(commits.unassociated && hasConfirmedMain ? ['COMMIT_AUTHOR_NOT_ASSOCIATED'] : []),
          ...freshness.limitations
        ]
      },
      asOf
    );

    const activity = indicatorResult(
      'I05',
      id,
      {
        value: {
          completedTasks: tasks.total,
          commits: hasConfirmedMain ? commits.total : null
        },
        state: activityState(commitResult, taskResult),
        period: periodDto,
        people: combineActivity(commits, tasks, { commitsAvailable: hasConfirmedMain }),
        unassociated: {
          completedTasks: tasks.unassociated,
          commits: hasConfirmedMain ? commits.unassociated : null,
          unassignedHistoricalCount: tasks.unassignedHistoricalCount
        },
        sourceUpdatedAt: freshness.sourceUpdatedAt,
        sourceSyncStatus: freshness.sourceSyncStatus,
        components: { commits: commitResult.state, completedTasks: taskResult.state },
        limitations: [
          ...new Set([...commitResult.limitations, ...taskResult.limitations]),
          'CURRENT_MEMBERSHIP_ONLY',
          'ACTIVITY_IS_NOT_PERFORMANCE'
        ]
      },
      asOf
    );
    return { projectId: id, period: periodDto, indicators: [commitResult, taskResult, activity] };
  }
};
