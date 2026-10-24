import { resourceNotFoundError } from '../../shared/errors/index.js';
import { requirementProjectionRepository } from '../traceability/requirement-projection.repository.js';
import { projectIndicatorCoverage } from '../traceability/requirement-traceability.policy.js';
import { indicatorResult } from './indicators.mapper.js';
import { githubFreshness } from './policies/indicator-freshness.policy.js';
import { percentage } from './calculators/statistics.calculator.js';

export const traceabilityAnalyticsService = {
  async read(projectId, now = () => new Date(), context = null) {
    const id = Number(projectId);
    const load = () => requirementProjectionRepository.readIndicatorSummary(id);
    const facts = await (context ? context.read('requirementProjection', load) : load());
    if (!facts) throw resourceNotFoundError('Project');
    const summary = context
      ? context.calculate('requirementCoverage', () => projectIndicatorCoverage(facts.rows))
      : projectIndicatorCoverage(facts.rows);
    const denominator = summary.totalRequirements;
    const timestamp = now().toISOString();
    const freshness = githubFreshness(facts.project.githubIntegration, facts.branch);
    const cohort = summary.githubCohort;
    const sourceScope =
      summary.lifecycleBasis.github > 0
        ? summary.lifecycleBasis.local > 0
          ? 'MIXED'
          : 'GITHUB'
        : 'LOCAL';
    // Public metrics retain their global denominator. Only Health comparisons are scoped
    // away from requirements whose immutable lifecycle never required technical evidence.
    const healthComparison = (field, implementationReference = false) => {
      if (!summary.lifecycleBasis.local) return undefined;
      const numerator = cohort[field];
      return {
        scope: 'GITHUB_REQUIREMENTS',
        applicable: cohort.totalRequirements > 0,
        numerator,
        denominator: cohort.totalRequirements,
        value: percentage(numerator, cohort.totalRequirements),
        expectedValue: implementationReference
          ? percentage(cohort.implementedRequirements, cohort.totalRequirements)
          : percentage(cohort.tasksDone, cohort.tasksTotal),
        expectedNumerator: implementationReference
          ? cohort.implementedRequirements
          : cohort.tasksDone,
        expectedDenominator: implementationReference ? cohort.totalRequirements : cohort.tasksTotal
      };
    };
    const result = (metricId, numerator, options = {}) => {
      const notConfigured = options.githubDependent && !facts.project.githubIntegration;
      const stale = options.githubDependent && freshness.stale && denominator > 0;
      return indicatorResult(
        metricId,
        id,
        {
          value: denominator && !notConfigured ? percentage(numerator, denominator) : null,
          numerator: notConfigured ? null : numerator,
          denominator,
          ...(options.sourceScope ? { sourceScope: options.sourceScope } : {}),
          ...(options.healthComparison
            ? { components: { healthComparison: options.healthComparison } }
            : {}),
          state: notConfigured
            ? 'UNAVAILABLE'
            : denominator
              ? stale
                ? 'STALE'
                : 'AVAILABLE'
              : 'NO_DATA',
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
      result('I62', summary.requirementsWithTechnicalEvidence, {
        githubDependent: true,
        healthComparison: healthComparison('requirementsWithTechnicalEvidence')
      }),
      result('I63', summary.requirementsWithTestCase, {
        healthComparison: healthComparison('requirementsWithTestCase', true)
      }),
      result('I64', summary.requirementsWithActiveDefect),
      result('I65', summary.validatedRequirements, {
        githubDependent: summary.lifecycleBasis.github > 0,
        sourceScope,
        healthComparison: healthComparison('validatedRequirements', true)
      }),
      result('I66', summary.implementedRequirements, {
        githubDependent: true,
        healthComparison: healthComparison('implementedRequirements')
      }),
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
