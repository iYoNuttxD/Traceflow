import { durationSample, median, percentage, roundMetric } from './statistics.calculator.js';

function distribution(rows, key, values) {
  const counts = Object.fromEntries(values.map((value) => [value, 0]));
  for (const row of rows) {
    if (Object.hasOwn(counts, row[key])) counts[row[key]] += Number(row._count?._all ?? row.total);
  }
  return { ...counts, total: Object.values(counts).reduce((sum, value) => sum + value, 0) };
}

export function calculateDefectStates(rows) {
  const defects = distribution(rows, 'status', [
    'ABERTO',
    'EM_CORRECAO',
    'AGUARDANDO_RETESTE',
    'VALIDADO'
  ]);
  return {
    ...defects,
    active: defects.ABERTO + defects.EM_CORRECAO + defects.AGUARDANDO_RETESTE
  };
}

export function calculateHealthQualityFacts({ executionResults, caseHealth, retests: retestRows }) {
  const executions = distribution(executionResults, 'result', ['PASS', 'FAIL', 'BLOCKED']);
  const health = distribution(caseHealth, 'result', ['PASS', 'FAIL', 'BLOCKED', 'NEVER_EXECUTED']);
  const retests = distribution(
    retestRows.filter((row) => Boolean(row.visible)),
    'result',
    ['PASS', 'FAIL', 'BLOCKED']
  );
  const excludedRetests = retestRows
    .filter((row) => !row.visible)
    .reduce((sum, row) => sum + Number(row.total), 0);
  return {
    executions,
    health,
    retests: {
      distribution: retests,
      value: percentage(retests.PASS, retests.total),
      excludedCount: excludedRetests
    }
  };
}

export function calculateQualityFacts(facts) {
  const { executions, health, retests } = calculateHealthQualityFacts(facts);
  const defects = calculateDefectStates(facts.defectStates);
  const severity = distribution(facts.severities, 'severity', [
    'BAIXA',
    'MEDIA',
    'ALTA',
    'CRITICA'
  ]);
  const visibleValidation = facts.firstValidated.filter((row) => !row.deletedAt);
  const sample = durationSample(visibleValidation, 'createdAt', 'firstValidatedAt', 86400000);
  const deletedValidation = facts.firstValidated.length - visibleValidation.length;
  const correctionExcluded = sample.excludedCount + deletedValidation + facts.legacyValidated;
  const requirements = calculateRequirementConcentration(facts.requirementRows);
  const originTasks = facts.originTasks.map((row) => ({
    taskId: Number(row.taskId),
    title: row.title,
    defectCount: Number(row.defectCount)
  }));
  return {
    executions,
    rates: Object.fromEntries(
      ['PASS', 'FAIL', 'BLOCKED'].map((key) => [key, percentage(executions[key], executions.total)])
    ),
    health,
    defects,
    severity,
    created: { value: Number(facts.created.visible), excluded: Number(facts.created.excluded) },
    validated: {
      value: Number(facts.validated.visible),
      excluded: Number(facts.validated.excluded) + facts.legacyValidated,
      deletedExcluded: Number(facts.validated.excluded),
      legacyExcluded: facts.legacyValidated
    },
    correction: {
      value: sample.eligibleCount ? roundMetric(median(sample.durations)) : null,
      eligibleCount: sample.eligibleCount,
      excludedCount: correctionExcluded
    },
    retests,
    requirements,
    originTasks
  };
}

export function calculateRequirementConcentration(rows) {
  return rows
    .filter((row) => row.defects.total > 0)
    .sort((a, b) => b.defects.total - a.defects.total || a.requirement.id - b.requirement.id)
    .slice(0, 10)
    .map((row) => ({
      requirementId: row.requirement.id,
      displayId: row.requirement.displayId,
      title: row.requirement.title,
      defectCount: row.defects.total
    }));
}
