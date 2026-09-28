import { SummaryPanel } from '../../../shared/index.js';
import { HEALTH_DIMENSION_LABELS, HEALTH_STATUS_LABELS } from '../health-display.js';

export function IndicatorsSummary({ health, loading }) {
  const metrics = [
    {
      label: 'Saúde',
      value: health?.score == null ? '—' : `${Math.round(health.score)} / 100`,
      detail: health ? HEALTH_STATUS_LABELS[health.status] : 'Aguardando leitura'
    }
  ];
  for (const id of ['PLANNING', 'FLOW', 'QUALITY', 'TRACEABILITY']) {
    const dimension = health?.dimensions?.find((d) => d.id === id);
    metrics.push({
      label: HEALTH_DIMENSION_LABELS[id],
      value: dimension?.score == null ? '—' : `${Math.round(dimension.score)} / 100`,
      detail: dimension ? HEALTH_STATUS_LABELS[dimension.status] : 'Aguardando leitura'
    });
  }
  return (
    <SummaryPanel
      title="Visão geral dos indicadores"
      description={
        health
          ? `Cobertura da avaliação: ${Math.round(health.coverage)}%`
          : 'Saúde e principais dimensões do projeto.'
      }
      metrics={metrics}
      busy={loading}
    />
  );
}
