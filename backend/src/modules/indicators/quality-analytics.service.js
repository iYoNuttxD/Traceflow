import { resourceNotFoundError } from '../../shared/errors/index.js';
import { calculateQualityFacts } from './calculators/quality-analytics.calculator.js';
import { indicatorResult } from './indicators.mapper.js';
import { qualityAnalyticsRepository } from './quality-analytics.repository.js';
import { normalizeIndicatorPeriod } from './policies/indicator-period.policy.js';

export const qualityAnalyticsService = {
  async read(projectId, query, now = () => new Date()) {
    const id = Number(projectId);
    const period = normalizeIndicatorPeriod(query);
    const asOf = now();
    const facts = await qualityAnalyticsRepository.read(id, period);
    if (!facts) throw resourceNotFoundError('Project');
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
    const indicators = [
      result(
        'I48',
        values.executions,
        values.executions.total ? 'AVAILABLE' : 'NO_DATA',
        { distribution: values.executions },
        true
      ),
      rate('I49', 'PASS'),
      rate('I50', 'FAIL'),
      rate('I51', 'BLOCKED'),
      result('I52', values.health, values.health.total ? 'AVAILABLE' : 'NO_DATA', {
        distribution: values.health
      }),
      result('I53', values.defects, 'AVAILABLE', {
        distribution: values.defects,
        components: { activeDefects: values.defects.active }
      }),
      result('I54', values.severity, 'AVAILABLE', { distribution: values.severity }),
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
      result(
        'I56',
        values.validated.value,
        values.validated.excluded ? 'PARTIAL' : 'AVAILABLE',
        {
          eligibleCount: values.validated.value,
          excludedCount: values.validated.excluded,
          limitations: [
            ...hidden(values.validated.deletedExcluded),
            ...(values.validated.legacyExcluded ? ['LEGACY_VALIDATION_WITHOUT_EVENT_UNDATED'] : [])
          ]
        },
        true
      ),
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
      result('I59', null, values.requirements.length ? 'AVAILABLE' : 'NO_DATA', {
        kind: 'LIST',
        items: values.requirements,
        limitations: ['DEFECT_MAY_APPEAR_IN_MULTIPLE_REQUIREMENTS']
      }),
      result('I60', null, values.originTasks.length ? 'AVAILABLE' : 'NO_DATA', {
        kind: 'LIST',
        items: values.originTasks
      })
    ];
    return { projectId: id, generatedAt: timestamp, period: periodDto, indicators };
  }
};
