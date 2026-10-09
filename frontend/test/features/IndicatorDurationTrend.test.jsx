import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
    expect(
      screen.getByText('10 dias', { selector: '.dashboard-chart__scale span' })
    ).toBeInTheDocument();
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
  expect(within(screen.getByRole('status')).getByText(/6 dias/)).toBeInTheDocument();
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
  const table = screen.getByRole('table', { name: '10 de 11 registros' });
  expect(within(table).getAllByRole('row')).toHaveLength(11);
  for (let id = 1; id <= 10; id++) expect(within(table).getByText(`Task ${id}`)).toBeVisible();
  expect(screen.getByText('11', { selector: 'strong' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'Registros de Tasks abaixo' })).toHaveAttribute(
    'tabindex',
    '0'
  );
});

it('renders one useful duration sample compactly even across many empty buckets', () => {
  const { container } = render(
    <IndicatorChart
      title="Lead Time"
      indicator={{
        ...indicator,
        metricId: 'I20',
        points: [
          { date: '2026-09-21', value: null, eligibleCount: 0 },
          { date: '2026-09-22', value: 0, eligibleCount: 1 },
          { date: '2026-09-23', value: null, eligibleCount: 0 }
        ]
      }}
    />
  );
  expect(container.querySelector('svg')).toBeNull();
  expect(screen.queryByText('Ver dados')).not.toBeInTheDocument();
  expect(screen.getByText('0 dias')).toBeInTheDocument();
  expect(screen.getByText('1 Task na amostra.')).toBeInTheDocument();
});
it('keeps consecutive samples connected while preserving sparse gaps and the outlier', () => {
  const { container } = render(
    <IndicatorChart
      title="Lead Time"
      indicator={{
        ...indicator,
        metricId: 'I20',
        points: [
          { date: '2026-09-21', value: 1, eligibleCount: 1 },
          { date: '2026-09-22', value: 90, eligibleCount: 1 },
          { date: '2026-09-23', value: null, eligibleCount: 0 },
          { date: '2026-09-24', value: 2, eligibleCount: 1 }
        ]
      }}
    />
  );
  expect(container.querySelectorAll('polyline')).toHaveLength(1);
  expect(container.querySelector('polyline').getAttribute('points').split(' ')).toHaveLength(2);
  expect(
    screen.getByText('90 dias', { selector: '.dashboard-chart__scale span' })
  ).toBeInTheDocument();
});

it('skips leading, middle and trailing gaps with every navigation key, retaining real zero', () => {
  const points = [null, 0, null, 7, null].map((value, i) => ({
    date: `2026-09-${21 + i}`,
    value,
    eligibleCount: value === null ? 0 : 1
  }));
  const { rerender } = render(
    <IndicatorChart indicator={{ ...indicator, points }} title="Cycle Time" />
  );
  const chart = screen.getByRole('img');
  const selected = screen.getByRole('status');
  expect(chart).toHaveAccessibleName(/2 dias com amostra/);
  for (const [key, value] of [
    ['Home', 0],
    ['ArrowLeft', 0],
    ['ArrowRight', 7],
    ['ArrowRight', 7],
    ['End', 7],
    ['ArrowLeft', 0]
  ]) {
    fireEvent.keyDown(chart, { key });
    expect(selected).toHaveTextContent(`${value} dias`);
    expect(selected).not.toHaveTextContent('Amostra: 0');
  }
  fireEvent.keyDown(chart, { key: 'End' });
  // A replacement response can turn the old active index into a gap.
  rerender(
    <IndicatorChart
      indicator={{
        ...indicator,
        points: points.map((p, i) => ({ ...p, value: i === 1 ? 2 : i === 2 ? 3 : null }))
      }}
      title="Cycle Time"
    />
  );
  expect(selected).toHaveTextContent('2 dias');
});

it('ignores a pointer over an empty day and selects an observed zero', () => {
  const points = [0, null, 7].map((value, i) => ({
    date: `2026-09-${22 + i}`,
    value,
    eligibleCount: value === null ? 0 : 1
  }));
  render(<IndicatorChart indicator={{ ...indicator, points }} title="Cycle Time" />);
  const chart = screen.getByRole('img');
  const rect = vi.spyOn(chart, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 640 });
  const pointer = (x) => {
    const event = new Event('pointermove', { bubbles: true });
    Object.defineProperty(event, 'clientX', { value: x });
    fireEvent(chart, event);
  };
  pointer(640);
  expect(screen.getByRole('status')).toHaveTextContent('7 dias');
  pointer(320);
  expect(screen.getByRole('status')).toHaveTextContent('7 dias');
  pointer(0);
  expect(screen.getByRole('status')).toHaveTextContent('0 dias');
  rect.mockRestore();
});
