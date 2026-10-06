import { requirementProjectionRepository } from '../traceability/requirement-projection.repository.js';
import { resourceNotFoundError } from '../../shared/errors/index.js';
import {
  calculateDefectStates,
  calculateQualityFacts,
  calculateRequirementConcentration
} from './calculators/quality-analytics.calculator.js';
import { indicatorResult } from './indicators.mapper.js';
import { qualityAnalyticsRepository } from './quality-analytics.repository.js';
import { normalizeIndicatorPeriod } from './policies/indicator-period.policy.js';

export const qualityAnalyticsService = {
  async requirementConcentration(projectId, context) {
    const id = Number(projectId);
    const facts = await context.read('requirementProjection', () =>
      requirementProjectionRepository.readIndicatorSummary(id)
    );
    if (!facts) throw resourceNotFoundError('Project');
    const items = context.calculate('requirementConcentration', () =>
      calculateRequirementConcentration(facts.rows)
    );
    return {
      indicators: [
        indicatorResult(
          'I59',
          id,
          {
            value: null,
            state: items.length ? 'AVAILABLE' : 'NO_DATA',
            kind: 'LIST',
            items,
            limitations: ['DEFECT_MAY_APPEAR_IN_MULTIPLE_REQUIREMENTS']
          },
          context.asOf.toISOString()
        )
      ]
    };
  },
  async defectStates(projectId, now = () => new Date()) {
    const id = Number(projectId);
    const rows = await qualityAnalyticsRepository.readDefectStates(id);
    if (!rows) throw resourceNotFoundError('Project');
    const defects = calculateDefectStates(rows);
    return indicatorResult(
      'I53',
      id,
      {
        value: defects,
        state: 'AVAILABLE',
        distribution: defects,
        components: { activeDefects: defects.active }
      },
      now().toISOString()
    );
  },
  async read(projectId, query, now = () => new Date(), normalizedPeriod = null, options = {}) {
    const id = Number(projectId);
    const period = normalizedPeriod ?? normalizeIndicatorPeriod(query);
    const asOf = now();
    const context = options.readContext;
    const ids = options.requestedIds;
    const matchesHealthPeriod =
      context?.healthPeriod?.startInclusive.getTime() === period.startInclusive.getTime() &&
      context?.healthPeriod?.endExclusive.getTime() === period.endExclusive.getTime();
    // Health signals only share a temporal read when its actual bounds match the view.
    const effectiveIds = context && matchesHealthPeriod ? context.qualityIds : ids;
    const projection =
      context && (!effectiveIds || effectiveIds.includes('I59'))
        ? await context.read('requirementProjection', () =>
            requirementProjectionRepository.readIndicatorSummary(id)
          )
        : null;
    const load = () =>
      qualityAnalyticsRepository.read(id, period, {
        requestedIds: effectiveIds,
        sharedProjection: Boolean(context)
      });
    const factsRequest = context
      ? context.read(
          `quality:${period.startInclusive.toISOString()}:${period.endExclusive.toISOString()}`,
          load
        )
      : load();
    if (context && (!effectiveIds || effectiveIds.includes('I52'))) {
      context.shareRead('qualityCaseHealth', factsRequest);
    }
    const facts = await factsRequest;
    if (!facts) throw resourceNotFoundError('Project');
    if (projection) facts.requirementRows = projection.rows;
    const values = calculateQualityFacts(facts);
    const timestamp = asOf.toISOString();
    const periodDto = {
      startDate: period.startDate,
      endDate: period.endDate,
      timeZone: period.timeZone,
      startInclusive: period.startInclusive.toISOString(),
      endExclusive: period.endExclusive.toISOString()
    };
    const incomplete = period.endExclusive > asOf;
    const result = (metricId, value, state, extras = {}, historical = false) => {
      const limitations = extras.limitations ?? [];
      return indicatorResult(
        metricId,
        id,
        {
          value,
          state:
            historical && incomplete && ['AVAILABLE', 'NO_DATA'].includes(state)
              ? 'PARTIAL'
              : state,
          period: historical ? periodDto : null,
          ...extras,
          limitations:
            historical && incomplete ? [...limitations, 'PERIOD_NOT_COMPLETE'] : limitations
        },
        timestamp
      );
    };
    const rate = (metricId, category) =>
      result(
        metricId,
        values.rates[category],
        values.executions.total ? 'AVAILABLE' : 'NO_DATA',
        { numerator: values.executions[category], denominator: values.executions.total },
        true
      );
    const hidden = (count) => (count ? ['SOFT_DELETED_DEFECTS_EXCLUDED'] : []);
    const definitions = [
      () =>
        result(
          'I48',
          values.executions,
          values.executions.total ? 'AVAILABLE' : 'NO_DATA',
          { distribution: values.executions },
          true
        ),
      () => rate('I49', 'PASS'),
      () => rate('I50', 'FAIL'),
      () => rate('I51', 'BLOCKED'),
      () =>
        result('I52', values.health, values.health.total ? 'AVAILABLE' : 'NO_DATA', {
          distribution: values.health
        }),
      () =>
        result('I53', values.defects, 'AVAILABLE', {
          distribution: values.defects,
          components: { activeDefects: values.defects.active }
        }),
      () => result('I54', values.severity, 'AVAILABLE', { distribution: values.severity }),
      () =>
        result(
          'I55',
          values.created.value,
          values.created.excluded ? 'PARTIAL' : 'AVAILABLE',
          {
            eligibleCount: values.created.value,
            excludedCount: values.created.excluded,
            limitations: hidden(values.created.excluded)
          },
          true
        ),
      () =>
        result(
          'I56',
          values.validated.value,
          values.validated.excluded ? 'PARTIAL' : 'AVAILABLE',
          {
            eligibleCount: values.validated.value,
            excludedCount: values.validated.excluded,
            limitations: [
              ...hidden(values.validated.deletedExcluded),
              ...(values.validated.legacyExcluded
                ? ['LEGACY_VALIDATION_WITHOUT_EVENT_UNDATED']
                : [])
            ]
          },
          true
        ),
      () =>
        result(
          'I57',
          values.correction.value,
          values.correction.eligibleCount
            ? values.correction.excludedCount
              ? 'PARTIAL'
              : 'AVAILABLE'
            : values.correction.excludedCount
              ? 'UNAVAILABLE'
              : 'NO_DATA',
          {
            eligibleCount: values.correction.eligibleCount,
            excludedCount: values.correction.excludedCount,
            limitations: values.correction.excludedCount
              ? ['VALIDATION_HISTORY_INCOMPLETE_OR_INVALID']
              : []
          },
          true
        ),
      () =>
        result(
          'I58',
          values.retests.value,
          values.retests.distribution.total
            ? values.retests.excludedCount
              ? 'PARTIAL'
              : 'AVAILABLE'
            : values.retests.excludedCount
              ? 'UNAVAILABLE'
              : 'NO_DATA',
          {
            numerator: values.retests.distribution.PASS,
            denominator: values.retests.distribution.total,
            distribution: values.retests.distribution,
            excludedCount: values.retests.excludedCount,
            limitations: hidden(values.retests.excludedCount)
          },
          true
        ),
      () =>
        result('I59', null, values.requirements.length ? 'AVAILABLE' : 'NO_DATA', {
          kind: 'LIST',
          items: values.requirements,
          limitations: ['DEFECT_MAY_APPEAR_IN_MULTIPLE_REQUIREMENTS']
        }),
      () =>
        result('I60', null, values.originTasks.length ? 'AVAILABLE' : 'NO_DATA', {
          kind: 'LIST',
          items: values.originTasks
        })
    ];
    const allIds = Array.from({ length: 13 }, (_, index) => `I${48 + index}`);
    const indicators = definitions.flatMap((create, index) =>
      !ids || ids.includes(allIds[index]) ? [create()] : []
    );
    return { projectId: id, generatedAt: timestamp, period: periodDto, indicators };
  }
};
