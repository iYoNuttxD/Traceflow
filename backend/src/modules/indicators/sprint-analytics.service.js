import { resourceNotFoundError } from '../../shared/errors/index.js';
import { sprintProgressService } from '../sprints/services/sprint-progress.service.js';
import { buildSprintBurnup } from '../sprints/sprint.burnup.calculator.js';
import {
  buildSprintAnalyticsFacts,
  buildSprintVelocity
} from '../sprints/sprint.analytics.calculator.js';
import { indicatorResult } from './indicators.mapper.js';
import { sprintAnalyticsRepository } from './sprint-analytics.repository.js';

const SELECTED_IDS = [
  'I36',
  'I37',
  'I38',
  'I39',
  'I40',
  'I41',
  'I42',
  'I43',
  'I44',
  'I45',
  'I46',
  'I71',
  'I72'
];
const LIMIT_DEFAULT = 20;
const SCOPE_HISTORY_LIMIT = 'SCOPE_REENTRY_EVENTS_COLLAPSED';

function stateForValue(value, missingState = 'UNAVAILABLE', limitations = []) {
  if (value === null) return missingState;
  return limitations.length ? 'PARTIAL' : 'AVAILABLE';
}

function sprintDto(sprint) {
  return sprint
    ? {
        id: sprint.id,
        name: sprint.name,
        status: sprint.status,
        frozen: ['CONCLUIDA', 'CANCELADA'].includes(sprint.status)
      }
    : null;
}

export const sprintAnalyticsService = {
  async read(projectId, query) {
    const id = Number(projectId);
    const limit = query.limit ?? LIMIT_DEFAULT;
    const generatedAt = new Date().toISOString();
    const history = await sprintAnalyticsRepository.readProjectHistory(id);
    if (!history) throw resourceNotFoundError('Project');

    let selected = null;
    let selectionLimitation = 'NO_ACTIVE_SPRINT';
    if (query.sprintId != null) {
      selected = history.sprints.find((sprint) => sprint.id === query.sprintId) ?? null;
      if (!selected) throw resourceNotFoundError('Sprint');
      selectionLimitation = null;
    } else {
      const active = history.sprints.filter((sprint) => sprint.status === 'EM_ANDAMENTO');
      if (active.length === 1) {
        selected = active[0];
        selectionLimitation = null;
      } else if (active.length > 1) selectionLimitation = 'MULTIPLE_ACTIVE_SPRINTS';
    }

    const selectedScope = { projectId: id, ...(selected ? { sprintId: selected.id } : {}) };
    const result = (metricId, value, state, extras = {}, scope = selectedScope) =>
      indicatorResult(metricId, id, { value, state, scope, ...extras }, generatedAt);
    const velocity = buildSprintVelocity(history.sprints, history.closingParticipations, limit);
    const velocityState = velocity.eligibleCount
      ? velocity.excludedCount
        ? 'PARTIAL'
        : 'AVAILABLE'
      : velocity.excludedCount
        ? 'UNAVAILABLE'
        : 'NO_DATA';
    const velocityResult = result(
      'I47',
      null,
      velocityState,
      {
        kind: 'SERIES',
        points: velocity.points,
        eligibleCount: velocity.eligibleCount,
        excludedCount: velocity.excludedCount,
        coverage: {
          completedSprints: velocity.eligibleCount + velocity.excludedCount,
          returnedSprints: velocity.points.length,
          truncatedCount: velocity.truncatedCount,
          limit
        },
        limitations: [
          ...(velocity.excludedCount ? ['INCOMPLETE_TERMINAL_SNAPSHOT_EXCLUDED'] : []),
          ...(velocity.truncatedCount ? ['VELOCITY_LIMIT_APPLIED'] : [])
        ]
      },
      { projectId: id, cohort: 'COMPLETED_SPRINTS' }
    );

    if (!selected) {
      const state = selectionLimitation === 'NO_ACTIVE_SPRINT' ? 'NO_DATA' : 'UNAVAILABLE';
      const indicators = SELECTED_IDS.map((metricId) =>
        result(metricId, null, state, {
          limitations: [selectionLimitation],
          ...(['I45', 'I46'].includes(metricId) ? { kind: 'SERIES', points: [] } : {})
        })
      );
      return {
        projectId: id,
        generatedAt,
        sprint: null,
        indicators: [...indicators, velocityResult]
      };
    }

    const canonical = await sprintProgressService.getSprintIndicatorFacts(
      selected.id,
      new Date(generatedAt)
    );
    if (canonical.sprint.projectId !== id) throw resourceNotFoundError('Sprint');
    const burnup = buildSprintBurnup({
      sprint: canonical.sprint,
      projection: canonical.historicalProjection,
      cutoff: new Date(generatedAt)
    });
    const facts = buildSprintAnalyticsFacts(canonical);
    const { sprint } = canonical;
    const sourceUpdatedAt = facts.frozen
      ? ((sprint.closedAt ?? sprint.completedAt)?.toISOString() ?? null)
      : null;
    const selectedResult = (metricId, value, state, extras = {}) =>
      result(metricId, value, state, { sourceUpdatedAt, ...extras });
    const planningLimitations = facts.planningKnown
      ? []
      : sprint.startedAt
        ? ['LEGACY_PLANNING_SNAPSHOT_UNAVAILABLE']
        : ['SPRINT_NOT_STARTED'];
    const planningMissingState = sprint.startedAt ? 'UNAVAILABLE' : 'NO_DATA';
    const terminalLimitations = facts.frozen ? facts.historicalLimitations : [];
    const scopeState = !sprint.startedAt
      ? 'NO_DATA'
      : facts.planningKnown
        ? 'AVAILABLE'
        : 'PARTIAL';
    const scopeLimitations = !facts.planningKnown ? planningLimitations : [];
    const effort = facts.effort;
    const effortState =
      effort.tasks === 0
        ? 'NO_DATA'
        : effort.incomplete || terminalLimitations.length
          ? 'PARTIAL'
          : 'AVAILABLE';
    const hasRealBurndown = Boolean(sprint.startedAt && facts.burndown.hasData);
    const lastBurndownDay = facts.burndown.days.at(-1)?.date;
    const nextBurndownDay = lastBurndownDay
      ? new Date(Date.parse(`${lastBurndownDay}T00:00:00.000Z`) + 86400000)
      : null;
    const burndownTruncated = Boolean(
      hasRealBurndown &&
      facts.burndown.days.length === 180 &&
      nextBurndownDay &&
      sprint.endDate > nextBurndownDay
    );
    const legacyBurndownState = !sprint.startedAt
      ? 'NO_DATA'
      : !facts.burndown.hasData
        ? terminalLimitations.length
          ? 'UNAVAILABLE'
          : 'NO_DATA'
        : terminalLimitations.length || burndownTruncated
          ? 'PARTIAL'
          : 'AVAILABLE';
    const historicalBurndownState = facts.burndown.historicalState;
    const burndownState =
      historicalBurndownState === 'AVAILABLE' && terminalLimitations.length
        ? 'PARTIAL'
        : (historicalBurndownState ?? legacyBurndownState);
    const incomingItems = facts.incoming.map((item) => ({ direction: 'INCOMING', ...item }));
    const outgoingItems = facts.outgoing.map((item) => ({ direction: 'OUTGOING', ...item }));
    const selectedIndicators = [
      selectedResult(
        'I36',
        facts.plannedPoints,
        stateForValue(facts.plannedPoints, planningMissingState, scopeLimitations),
        { limitations: planningLimitations }
      ),
      selectedResult(
        'I37',
        facts.currentPoints,
        stateForValue(facts.currentPoints, 'UNAVAILABLE', terminalLimitations),
        { limitations: terminalLimitations }
      ),
      selectedResult(
        'I38',
        facts.deliveredPoints,
        stateForValue(facts.deliveredPoints, 'UNAVAILABLE', terminalLimitations),
        { limitations: terminalLimitations }
      ),
      selectedResult(
        'I39',
        facts.plannedTasks,
        stateForValue(facts.plannedTasks, planningMissingState, scopeLimitations),
        { limitations: planningLimitations }
      ),
      selectedResult(
        'I40',
        facts.deliveredTasks,
        stateForValue(facts.deliveredTasks, 'UNAVAILABLE', terminalLimitations),
        { limitations: terminalLimitations }
      ),
      selectedResult('I41', sprint.startedAt ? facts.added.length : null, scopeState, {
        kind: 'LIST',
        items: sprint.startedAt ? facts.added : [],
        limitations: [...scopeLimitations, SCOPE_HISTORY_LIMIT]
      }),
      selectedResult('I42', sprint.startedAt ? facts.removed.length : null, scopeState, {
        kind: 'LIST',
        items: sprint.startedAt ? facts.removed : [],
        limitations: [...scopeLimitations, SCOPE_HISTORY_LIMIT]
      }),
      selectedResult(
        'I43',
        { incoming: facts.incoming.length, outgoing: facts.outgoing.length },
        'AVAILABLE',
        {
          kind: 'LIST',
          items: [...incomingItems, ...outgoingItems],
          limitations: ['CARRY_OVER_REENTRY_HISTORY_MAY_BE_COLLAPSED']
        }
      ),
      selectedResult(
        'I44',
        {
          estimatedHours: effort.estimatedHours,
          actualHours: effort.actualHours,
          differenceHours: effort.differenceHours
        },
        effortState,
        {
          coverage: {
            tasks: effort.tasks,
            tasksWithEstimate: effort.tasksWithEstimate,
            tasksWithActual: effort.tasksWithActual,
            tasksWithUnknownEstimate: effort.tasksWithUnknownEstimate,
            tasksWithUnknownActual: effort.tasksWithUnknownActual
          },
          components: {
            status: effort.status,
            incomplete: effort.incomplete,
            differencePercent: effort.differencePercent,
            usagePercent: effort.usagePercent
          },
          limitations: [
            ...terminalLimitations,
            ...(effort.incomplete ? ['SPRINT_EFFORT_INCOMPLETE'] : [])
          ]
        }
      ),
      selectedResult('I45', null, burndownState, {
        kind: 'SERIES',
        points: hasRealBurndown ? facts.burndown.days : [],
        coverage: {
          totalPoints: hasRealBurndown ? facts.burndown.totalPoints : null,
          frozen: facts.burndown.frozen,
          cutoffDate: facts.burndown.cutoffDate,
          truncated: burndownTruncated
        },
        limitations: [
          ...terminalLimitations,
          ...(facts.burndown.historicalLimitations ?? []),
          ...(!sprint.startedAt ? ['SPRINT_NOT_STARTED'] : []),
          ...(sprint.startedAt && !facts.burndown.hasData ? ['BURNDOWN_DATA_UNAVAILABLE'] : []),
          ...(burndownTruncated ? ['BURNDOWN_MAX_180_DAYS'] : [])
        ]
      }),
      selectedResult('I46', null, burnup.state, {
        kind: 'SERIES',
        points: burnup.points,
        coverage: burnup.coverage,
        limitations: burnup.limitations
      }),
      selectedResult(
        'I71',
        sprint.startedAt
          ? {
              addedCount: facts.added.length,
              removedCount: facts.removed.length,
              changed: facts.added.length + facts.removed.length > 0
            }
          : null,
        scopeState,
        { limitations: [...scopeLimitations, SCOPE_HISTORY_LIMIT] }
      ),
      selectedResult(
        'I72',
        facts.frozen ? null : facts.incoming.length,
        facts.frozen ? 'NO_DATA' : 'AVAILABLE',
        {
          kind: 'LIST',
          items: facts.frozen ? [] : facts.incoming,
          limitations: facts.frozen ? ['CURRENT_STATE_NOT_APPLICABLE_TO_TERMINAL_SPRINT'] : []
        }
      )
    ];
    return {
      projectId: id,
      generatedAt,
      sprint: sprintDto(sprint),
      indicators: [...selectedIndicators, velocityResult]
    };
  }
};
