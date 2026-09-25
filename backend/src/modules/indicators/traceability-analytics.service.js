import { resourceNotFoundError } from '../../shared/errors/index.js';
import { requirementProjectionRepository } from '../traceability/requirement-projection.repository.js';
import { projectIndicatorCoverage } from '../traceability/requirement-traceability.policy.js';
import { indicatorResult } from './indicators.mapper.js';
import { githubFreshness } from './policies/indicator-freshness.policy.js';
import { percentage } from './calculators/statistics.calculator.js';

export const traceabilityAnalyticsService = {
  async read(projectId, now = () => new Date()) {
    const id = Number(projectId);
    const facts = await requirementProjectionRepository.readIndicatorSummary(id);
    if (!facts) throw resourceNotFoundError('Project');
    const summary = projectIndicatorCoverage(facts.rows);
    const denominator = summary.totalRequirements;
    const timestamp = now().toISOString();
    const freshness = githubFreshness(facts.project.githubIntegration, facts.branch);
    const result = (metricId, numerator, options = {}) => {
      const stale = options.githubDependent && freshness.stale && denominator > 0;
      return indicatorResult(
        metricId,
        id,
        {
          value: denominator ? percentage(numerator, denominator) : null,
          numerator,
          denominator,
          state: denominator ? (stale ? 'STALE' : 'AVAILABLE') : 'NO_DATA',
          ...(options.githubDependent
            ? {
                sourceUpdatedAt: freshness.sourceUpdatedAt?.toISOString() ?? null,
                sourceSyncStatus: freshness.sourceSyncStatus,
                limitations: freshness.limitations
              }
            : {})
        },
        timestamp
      );
    };
    const indicators = [
      result('I61', summary.requirementsWithTasks),
      result('I62', summary.requirementsWithTechnicalEvidence, { githubDependent: true }),
      result('I63', summary.requirementsWithTestCase),
      result('I64', summary.requirementsWithActiveDefect),
      result('I65', summary.validatedRequirements, { githubDependent: true }),
      result('I66', summary.implementedRequirements, { githubDependent: true }),
      indicatorResult(
        'I67',
        id,
        {
          value: summary.averageProgress.percentage,
          numerator: summary.averageProgress.numerator,
          denominator,
          state: summary.averageProgress.hasData ? 'AVAILABLE' : 'NO_DATA'
        },
        timestamp
      )
    ];
    return { projectId: id, generatedAt: timestamp, indicators };
  }
};
