import { resourceNotFoundError } from '../../shared/errors/index.js';
import { calculateFlowTaskHistory } from './calculators/flow-task.calculator.js';
import { calculateTaskCurrent } from './calculators/task-current.calculator.js';
import { flowTaskRepository } from './flow-task.repository.js';
import { indicatorResult } from './indicators.mapper.js';
import {
  createIndicatorLocalDateKey,
  normalizeIndicatorPeriod
} from './policies/indicator-period.policy.js';
import { roundMetric } from './calculators/statistics.calculator.js';

const HISTORY_LIMIT = 'HARD_DELETED_TASK_HISTORY_NOT_RECOVERABLE';

function publicPeriod(period) {
  return {
    startDate: period.startDate,
    endDate: period.endDate,
    timeZone: period.timeZone,
    startInclusive: period.startInclusive.toISOString(),
    endExclusive: period.endExclusive.toISOString()
  };
}

function responsible(row) {
  return row.responsibleUserId == null
    ? null
    : { userId: Number(row.responsibleUserId), name: row.responsibleName };
}

function taskItem(row, difference = null) {
  return {
    taskId: Number(row.id),
    title: row.title,
    status: row.status,
    responsible: responsible(row),
    ...(row.deadline ? { deadline: row.deadline.toISOString() } : {}),
    ...(row.estimatedEffort != null
      ? { estimatedEffort: roundMetric(Number(row.estimatedEffort)) }
      : {}),
    ...(row.actualEffort != null ? { actualEffort: roundMetric(Number(row.actualEffort)) } : {}),
    ...(difference != null ? { difference: roundMetric(difference(row)) } : {})
  };
}

function durationState(sample) {
  if (sample.eligibleCount === 0) return sample.excludedCount ? 'UNAVAILABLE' : 'NO_DATA';
  return sample.excludedCount ? 'PARTIAL' : 'AVAILABLE';
}

export const flowTaskService = {
  async currentSummary(projectId, now = () => new Date()) {
    const id = Number(projectId);
    const asOf = now();
    const facts = await flowTaskRepository.read(id, null, asOf, { currentSummaryOnly: true });
    if (!facts) throw resourceNotFoundError('Project');
    const current = calculateTaskCurrent(facts.aggregate, facts.statuses);
    const timestamp = asOf.toISOString();
    return {
      projectId: id,
      indicators: [
        indicatorResult('I23', id, { value: current.wip, state: 'AVAILABLE' }, timestamp),
        indicatorResult(
          'I28',
          id,
          {
            value: current.overdue,
            state: 'AVAILABLE',
            kind: 'LIST',
            items: facts.overdue.map((row) => taskItem(row))
          },
          timestamp
        )
      ]
    };
  },
  async read(projectId, query, now = () => new Date(), normalizedPeriod = null) {
    const id = Number(projectId);
    const period = normalizedPeriod ?? normalizeIndicatorPeriod(query);
    const asOf = now();
    const facts = await flowTaskRepository.read(id, period, asOf);
    if (!facts) throw resourceNotFoundError('Project');
    const current = calculateTaskCurrent(facts.aggregate, facts.statuses);
    const flow = calculateFlowTaskHistory({
      tasks: facts.tasks,
      movements: facts.movements,
      period,
      asOf,
      dateKey: createIndicatorLocalDateKey(period.timeZone)
    });
    const periodDto = publicPeriod(period);
    const timestamp = asOf.toISOString();
    const periodIncomplete = period.endExclusive > asOf;
    const result = (metricId, value, state, extras = {}) =>
      indicatorResult(
        metricId,
        id,
        { value, state, period: extras.period === undefined ? null : extras.period, ...extras },
        timestamp
      );
    const historical = (metricId, value, state, extras = {}) => {
      const { limitations = [], ...rest } = extras;
      const effectiveState =
        periodIncomplete && ['AVAILABLE', 'NO_DATA'].includes(state) ? 'PARTIAL' : state;
      return result(metricId, value, effectiveState, {
        period: periodDto,
        ...rest,
        limitations: [
          HISTORY_LIMIT,
          ...(periodIncomplete ? ['PERIOD_NOT_COMPLETE'] : []),
          ...limitations
        ]
      });
    };
    const currentResult = (metricId, value, state = 'AVAILABLE', extras = {}) =>
      result(metricId, value, state, extras);
    const estimateCoverage = {
      totalTasks: current.total,
      tasksWithEstimate: current.withEstimate
    };
    const actualCoverage = {
      totalTasks: current.total,
      tasksWithActual: current.withActual
    };
    const comparableCoverage = {
      totalTasks: current.total,
      tasksWithEstimate: current.withEstimate,
      tasksWithActual: current.withActual,
      comparableTasks: current.comparable
    };
    const indicators = [
      historical('I20', flow.lead.value, durationState(flow.lead), {
        eligibleCount: flow.lead.eligibleCount,
        excludedCount: flow.lead.excludedCount,
        limitations: flow.lead.excludedCount ? ['INCOMPLETE_OR_INVALID_COMPLETION_HISTORY'] : []
      }),
      historical('I21', flow.cycle.value, durationState(flow.cycle), {
        eligibleCount: flow.cycle.eligibleCount,
        excludedCount: flow.cycle.excludedCount,
        limitations: flow.cycle.excludedCount ? ['MISSING_FIRST_IN_PROGRESS_OR_COMPLETION'] : []
      }),
      historical(
        'I22',
        flow.throughput.value,
        flow.throughput.excludedCount ? 'PARTIAL' : 'AVAILABLE',
        {
          kind: 'SERIES',
          points: flow.throughput.points,
          excludedCount: flow.throughput.excludedCount,
          limitations: flow.throughput.excludedCount ? ['UNOBSERVED_COMPLETION_HISTORY'] : []
        }
      ),
      currentResult('I23', current.wip),
      currentResult(
        'I24',
        null,
        flow.aging.value
          ? flow.aging.excludedCount
            ? 'PARTIAL'
            : 'AVAILABLE'
          : flow.aging.excludedCount
            ? 'UNAVAILABLE'
            : 'NO_DATA',
        {
          kind: 'LIST',
          items: flow.aging.items,
          eligibleCount: flow.aging.value,
          excludedCount: flow.aging.excludedCount,
          limitations: flow.aging.excludedCount ? ['WIP_ENTRY_HISTORY_NOT_VERIFIABLE'] : []
        }
      ),
      historical(
        'I25',
        null,
        flow.cumulative.eligibleCount && flow.cumulative.points.length ? 'PARTIAL' : 'UNAVAILABLE',
        {
          kind: 'SERIES',
          points: flow.cumulative.eligibleCount ? flow.cumulative.points : [],
          eligibleCount: flow.cumulative.eligibleCount,
          excludedCount: flow.cumulative.excludedCount,
          scope: { projectId: id, cohort: 'OBSERVED_SURVIVING_TASKS' },
          limitations: [
            'INITIAL_STATE_NOT_GLOBALLY_PROVEN',
            ...(flow.cumulative.excludedCount ? ['TASK_HISTORY_CHAIN_INCOMPLETE'] : []),
            ...(!flow.cumulative.points.length ? ['NO_COMPLETED_CIVIL_DAYS'] : [])
          ]
        }
      ),
      currentResult('I26', current.total, 'AVAILABLE', {
        limitations: ['HARD_DELETED_TASKS_EXCLUDED']
      }),
      currentResult(
        'I27',
        {
          A_FAZER: current.statuses.A_FAZER,
          EM_ANDAMENTO: current.statuses.EM_ANDAMENTO,
          CONCLUIDO: current.statuses.CONCLUIDO
        },
        current.statuses.unknownCount ? 'PARTIAL' : 'AVAILABLE',
        {
          distribution: current.statuses,
          limitations: current.statuses.unknownCount ? ['UNKNOWN_TASK_STATUS_EXCLUDED'] : []
        }
      ),
      currentResult('I28', current.overdue, 'AVAILABLE', {
        kind: 'LIST',
        items: facts.overdue.map((row) => taskItem(row))
      }),
      currentResult('I29', current.unassigned),
      currentResult('I30', current.withoutEstimate),
      currentResult(
        'I31',
        current.estimatedHours,
        current.withEstimate
          ? current.withEstimate < current.total
            ? 'PARTIAL'
            : 'AVAILABLE'
          : 'NO_DATA',
        {
          coverage: estimateCoverage,
          limitations: current.withEstimate < current.total ? ['TASK_ESTIMATE_MISSING'] : []
        }
      ),
      currentResult(
        'I32',
        current.actualHours,
        current.withActual
          ? current.withActual < current.total
            ? 'PARTIAL'
            : 'AVAILABLE'
          : 'NO_DATA',
        {
          coverage: actualCoverage,
          limitations: [
            ...(current.withActual < current.total ? ['TASK_ACTUAL_EFFORT_MISSING'] : []),
            'ACTUAL_EFFORT_ALREADY_INCLUDES_SESSIONS_AND_LEGACY'
          ]
        }
      ),
      currentResult(
        'I33',
        current.differenceHours,
        current.comparable
          ? current.comparable < current.withEstimate
            ? 'PARTIAL'
            : 'AVAILABLE'
          : 'NO_DATA',
        {
          coverage: comparableCoverage,
          limitations:
            current.comparable < current.withEstimate ? ['COMPARISON_SAMPLE_INCOMPLETE'] : []
        }
      ),
      currentResult(
        'I34',
        current.above,
        current.comparable
          ? current.comparable < current.withEstimate
            ? 'PARTIAL'
            : 'AVAILABLE'
          : 'NO_DATA',
        {
          kind: 'LIST',
          items: facts.above.map((row) =>
            taskItem(row, (item) => Number(item.actualEffort) - Number(item.estimatedEffort))
          ),
          coverage: comparableCoverage,
          limitations:
            current.comparable < current.withEstimate ? ['COMPARISON_SAMPLE_INCOMPLETE'] : []
        }
      ),
      currentResult(
        'I35',
        current.below,
        current.completedComparable
          ? current.completedComparable < current.completedWithEstimate
            ? 'PARTIAL'
            : 'AVAILABLE'
          : 'NO_DATA',
        {
          kind: 'LIST',
          items: facts.below.map((row) =>
            taskItem(row, (item) => Number(item.estimatedEffort) - Number(item.actualEffort))
          ),
          coverage: {
            ...comparableCoverage,
            completedComparableTasks: current.completedComparable,
            completedTasksWithEstimate: current.completedWithEstimate
          },
          limitations:
            current.completedComparable < current.completedWithEstimate
              ? ['COMPLETED_TASK_ACTUAL_EFFORT_MISSING']
              : []
        }
      )
    ];
    return { projectId: id, period: periodDto, indicators };
  }
};
