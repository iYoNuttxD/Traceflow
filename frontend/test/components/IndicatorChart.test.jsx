import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IndicatorChart } from '../../src/features/indicators/components/IndicatorChart.jsx';

describe('Sprint indicator chart integrity', () => {
  it.each(['I45', 'I46'])('does not call unknown historical values no samples (%s)', (metricId) => {
    const { container } = render(
      <IndicatorChart
        title="Histórico"
        indicator={{
          metricId,
          unit: 'HOURS',
          state: 'PARTIAL',
          points: [
            { date: '2026-10-01', ideal: null, remaining: null, scope: null, completed: null }
          ]
        }}
      />
    );
    expect(screen.getByText(/parte das tarefas não possui estimativa/)).toBeVisible();
    expect(screen.queryByText('Sem amostras no período.')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('uses the backend historical scale rather than only the displayed final values', () => {
    const { container } = render(
      <IndicatorChart
        title="Burndown"
        indicator={{
          metricId: 'I45',
          unit: 'HOURS',
          state: 'AVAILABLE',
          coverage: { chartMax: 40 },
          points: [
            { date: '2026-10-01', ideal: 20, remaining: 20 },
            { date: '2026-10-02', ideal: 10, remaining: 0 }
          ]
        }}
      />
    );
    expect(screen.getByText('40 h')).toBeVisible();
    expect(container.querySelector('svg').outerHTML).not.toMatch(/NaN|Infinity/);
  });
});
