import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IndicatorCard } from '../../src/features/indicators/components/IndicatorCard.jsx';
import { IndicatorChart } from '../../src/features/indicators/components/IndicatorChart.jsx';

const indicator = {
  metricId: 'I21',
  unit: 'DAYS',
  points: [
    { date: '2026-09-22', value: 6, eligibleCount: 3 },
    { date: '2026-09-23', value: null, eligibleCount: 0 },
    { date: '2026-09-24', value: 7, eligibleCount: 2 }
  ],
  assessment: {
    reference: { type: 'PROJECT_BASELINE', label: 'Referência recente', value: 4, unit: 'DAYS' }
  }
};
describe('duration trends', () => {
  it('shows the server reference, preserves gaps and supports keyboard/table access', () => {
    const { container } = render(<IndicatorChart indicator={indicator} title="Cycle Time" />);
    expect(container.querySelector('[data-reference-line]')).toBeInTheDocument();
    expect(screen.getByText(/Referência recente: 4 dias/)).toBeInTheDocument();
    expect(container.querySelector('polyline')).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('img'), { key: 'End' });
    expect(within(screen.getByRole('status')).getByText(/7 dias/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ver dados'));
    expect(screen.getByRole('columnheader', { name: 'Amostra' })).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
  it('includes the reference in the scale and ignores incompatible or absent references', () => {
    const { container, rerender } = render(
      <IndicatorChart
        indicator={{
          ...indicator,
          assessment: { reference: { ...indicator.assessment.reference, value: 10 } }
        }}
        title="Cycle Time"
      />
    );
    expect(screen.getByText('Escala: 0 a 10 dias')).toBeInTheDocument();
    rerender(
      <IndicatorChart
        indicator={{
          ...indicator,
          assessment: { reference: { ...indicator.assessment.reference, unit: 'HOURS' } }
        }}
        title="Cycle Time"
      />
    );
    expect(container.querySelector('[data-reference-line]')).not.toBeInTheDocument();
    rerender(<IndicatorChart indicator={{ ...indicator, assessment: null }} title="Cycle Time" />);
    expect(container.querySelector('[data-reference-line]')).not.toBeInTheDocument();
  });
});

it('selects the first observed duration instead of opening on a missing day', () => {
  render(
    <IndicatorChart
      indicator={{
        ...indicator,
        points: [{ date: '2026-09-21', value: null, eligibleCount: 0 }, ...indicator.points]
      }}
      title="Cycle Time"
    />
  );
  expect(within(screen.getByRole('status')).getByText(/6 dias/)).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('img'), { key: 'ArrowLeft' });
  expect(within(screen.getByRole('status')).getByText(/—/)).toBeInTheDocument();
});
it('discloses a limited ranking without hiding the total count', () => {
  render(
    <IndicatorCard
      indicator={{
        metricId: 'I35',
        state: 'PARTIAL',
        kind: 'LIST',
        value: 11,
        items: Array.from({ length: 10 }, (_, i) => ({
          taskId: i + 1,
          title: `Task ${i + 1}`,
          difference: 2
        })),
        limitations: []
      }}
      metadata={{ title: 'Tasks abaixo' }}
    />
  );
  const table = screen.getByRole('table', { name: 'Registros relacionados · 10 de 11' });
  expect(within(table).getAllByRole('row')).toHaveLength(11);
  for (let id = 1; id <= 10; id++) expect(within(table).getByText(`Task ${id}`)).toBeVisible();
  expect(screen.getByText('11', { selector: 'strong' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'Lista de registros' })).toHaveAttribute(
    'tabindex',
    '0'
  );
});
