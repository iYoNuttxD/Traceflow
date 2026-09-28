const round = (value) => Math.round(value * 100) / 100;

// Exposes the existing model's factual comparison; it does not define targets or scores.
export function healthReference(metricId, result) {
  if (!result) return { reference: null, delta: null };
  const b = result.basis;
  let type,
    label,
    current,
    value,
    unit,
    relative = false;
  if (result.reasonCode === 'BASELINE_REGRESSION') {
    type = 'PROJECT_BASELINE';
    label = 'Referência recente';
    current = b.current;
    value = b.previous;
    unit = metricId === 'I15' ? 'HOURS' : 'DAYS';
    relative = true;
  } else if (result.reasonCode === 'OPEN_PR_AGE') {
    type = 'MERGE_BASELINE';
    label = 'Tempo típico até merge';
    current = b.averageOpenAgeDays;
    value = b.medianMergeHours / 24;
    unit = 'DAYS';
    relative = true;
  } else if (result.reasonCode === 'STAGE_GAP') {
    type = 'PROJECT_STAGE';
    label = b.expectedMetricId === 'I01' ? 'Progresso do projeto' : 'Cobertura de implementação';
    current = b.current;
    value = b.expected;
    unit = 'PERCENT';
  } else if (result.reasonCode === 'EFFORT_DEVIATION') {
    type = 'SPRINT_ESTIMATE';
    label = 'Esforço estimado';
    current = b.actualHours;
    value = b.estimatedHours;
    unit = 'HOURS';
  } else if (result.reasonCode === 'BURNDOWN_GAP') {
    type = 'SPRINT_IDEAL';
    label = 'Trabalho restante ideal';
    current = b.actualRemaining;
    value = b.idealRemaining;
    unit = 'HOURS';
  } else return { reference: null, delta: null };
  return {
    reference: { type, label, value: round(value), unit },
    delta: {
      value: round(relative ? ((current - value) / value) * 100 : current - value),
      unit: relative ? 'PERCENT' : unit === 'PERCENT' ? 'PERCENTAGE_POINTS' : unit
    }
  };
}
