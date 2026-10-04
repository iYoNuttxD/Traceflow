import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IndicatorCard } from '../../src/features/indicators/components/IndicatorCard.jsx';
const item = {
  metricId: 'I28',
  state: 'AVAILABLE',
  kind: 'COUNT',
  unit: 'COUNT',
  value: 0,
  limitations: []
};
function card(overrides = {}) {
  return render(
    <IndicatorCard indicator={{ ...item, ...overrides }} metadata={{ title: 'Tasks atrasadas' }} />
  );
}
describe('indicator presentation contract', () => {
  it.each(['AVAILABLE', 'NO_DATA', 'UNAVAILABLE', 'PARTIAL'])(
    'shares the same heading/help primitive in %s',
    (state) => {
      const { container } = card({ state, value: state === 'AVAILABLE' ? 0 : null });
      expect(container.querySelector('.indicator-card__heading-row h4')).toHaveTextContent(
        'Tasks atrasadas'
      );
      expect(
        screen.getByRole('button', { name: 'Informações sobre Tasks atrasadas' })
      ).toHaveAttribute('aria-haspopup', 'dialog');
      expect(screen.getByText(state === 'AVAILABLE' ? '0' : '—')).toBeVisible();
      if (state === 'UNAVAILABLE') expect(screen.getByText('Indisponível')).toBeVisible();
      if (state === 'PARTIAL') expect(screen.getByText('Dados parciais')).toBeVisible();
    }
  );
  it('explains a healthy share without claiming there are no delayed tasks', () => {
    card({
      value: 4,
      assessment: {
        status: 'HEALTHY',
        reasonCode: 'TASK_SHARE',
        basis: { count: 4, totalTasks: 40 }
      }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Informações sobre Tasks atrasadas' }));
    const help = screen.getByRole('dialog');
    expect(help).toHaveTextContent('4 de 40 Tasks estão atrasadas.');
    expect(help).not.toHaveTextContent(/reasonCode|TASK_SHARE|metricId|definitionVersion/);
  });
  it('uses the backend factual exception for empty PR aging without inventing zero duration', () => {
    card({
      metricId: 'I73',
      state: 'NO_DATA',
      value: null,
      assessment: { status: 'HEALTHY', reasonCode: 'NO_OPEN_PRS', basis: { openPullRequests: 0 } }
    });
    expect(screen.getByText('Nenhuma PR aberta.')).toBeVisible();
    expect(screen.getByText('Saudável')).toBeVisible();
    expect(screen.getByText('—')).toBeVisible();
    expect(screen.queryByText(/Nenhum dado elegível/)).not.toBeInTheDocument();
  });
  it('does not infer a healthy queue from an unassessed empty value', () => {
    card({ metricId: 'I73', state: 'NO_DATA', value: null, assessment: { status: 'UNASSESSED' } });
    expect(screen.queryByText('Saudável')).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhuma PR aberta.')).not.toBeInTheDocument();
  });
  it('keeps retest distribution counts distinct from its percentage', () => {
    card({
      metricId: 'I58',
      unit: 'PERCENT',
      value: 50,
      distribution: { PASS: 1, FAIL: 1, BLOCKED: 0 }
    });
    expect(screen.getByText('50%')).toBeVisible();
    expect(screen.queryByText('1%')).not.toBeInTheDocument();
  });
  it('keeps a backend reference accessible in the progress label', () => {
    card({
      metricId: 'I66',
      unit: 'PERCENT',
      value: 25,
      assessment: {
        status: 'CRITICAL',
        reference: {
          type: 'STAGE_PROGRESS',
          label: 'Progresso do projeto',
          value: 70,
          unit: 'PERCENT'
        }
      }
    });
    expect(screen.getByRole('progressbar')).toHaveAccessibleName(
      /25%.*Referência: Progresso do projeto, 70%/
    );
  });
  it('deduplicates a shared missing-effort limitation in the section while retaining its partial state', () => {
    render(
      <IndicatorCard
        indicator={{
          ...item,
          metricId: 'I31',
          state: 'PARTIAL',
          value: 12,
          limitations: ['TASK_ESTIMATE_MISSING']
        }}
        metadata={{ title: 'Estimativa' }}
        sharedLimitations={['EFFORT_SAMPLE_INCOMPLETE']}
      />
    );
    expect(screen.getByText('12')).toBeVisible();
    expect(screen.queryByText(/Parte das tarefas/)).not.toBeInTheDocument();
  });
});

it.each(['COUNT', 'LIST', 'SERIES'])(
  'owns Health and Data State in the canonical header for %s',
  (kind) => {
    const { container } = card({
      kind,
      state: 'PARTIAL',
      value: 4,
      assessment: { status: 'ATTENTION' }
    });
    const header = container.querySelector('.indicator-card__header');
    expect(within(header).getByText('Atenção')).toBeVisible();
    expect(within(header).getByText('Dados parciais')).toBeVisible();
    expect(within(header).getByRole('button')).toHaveAccessibleName(
      'Informações sobre Tasks atrasadas'
    );
    expect(container.querySelector('.indicator-card__headline')).toHaveTextContent('4');
  }
);

it('separates commit association from people and renders each responsible proportionally', () => {
  card({
    metricId: 'I02',
    kind: 'DISTRIBUTION',
    value: null,
    distribution: {
      associated: 93,
      unassociated: 26,
      unknown: 0,
      people: [
        { userId: 1, displayName: 'Daniel', count: 67 },
        { userId: 2, displayName: 'João', count: 18 },
        { userId: 3, displayName: 'Gabriel', count: 8 }
      ]
    }
  });
  const association = screen.getByRole('region', { name: 'Associação' });
  const people = screen.getByRole('region', { name: 'Por responsável' });
  expect(association).not.toHaveTextContent('Daniel');
  expect(people).not.toHaveTextContent('Associados');
  const bars = people.querySelectorAll('.indicator-card__bar > span');
  expect(bars).toHaveLength(3);
  expect(bars[0]).toHaveStyle({ width: '100%' });
  expect(parseFloat(bars[1].style.width)).toBeCloseTo((18 / 67) * 100);
  expect(parseFloat(bars[2].style.width)).toBeCloseTo((8 / 67) * 100);
});

it('shows an explicit empty people group without manufacturing a person', () => {
  card({
    metricId: 'I02',
    kind: 'DISTRIBUTION',
    value: null,
    distribution: { associated: 0, unassociated: 4, people: [] }
  });
  expect(screen.getByRole('region', { name: 'Por responsável' })).toHaveTextContent(
    'Nenhum responsável associado neste período.'
  );
});

it('puts carry-over direction counts before details without mixing in bars', () => {
  const { container } = card({
    metricId: 'I43',
    kind: 'LIST',
    value: { incoming: 2, outgoing: 1 },
    items: [{ taskId: 3, title: 'Task transferida', direction: 'OUTGOING' }]
  });
  const headline = container.querySelector('.indicator-card__headline');
  const table = screen.getByRole('table');
  expect(headline).toHaveTextContent('2 entradas · 1 saída');
  expect(headline.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(container.querySelector('.indicator-card__bar')).toBeNull();
  expect(table).toHaveTextContent('Transferida para outra Sprint');
});

it.each(['LIST', 'SERIES'])('shows a dash for partial %s without observations', (kind) => {
  const { container } = card({ kind, state: 'PARTIAL', value: null, points: [], items: [] });
  expect(container.querySelector('.indicator-card__headline')).toHaveTextContent('—');
  expect(container.querySelector('.indicator-card__header')).toHaveTextContent('Dados parciais');
  expect(screen.queryByText('0')).toBeNull();
});
it('does not reserve an empty notice paragraph for an otherwise populated partial result', () => {
  const { container } = card({ state: 'PARTIAL', value: 4 });
  expect(container.querySelector('.indicator-card__notice')).toBeNull();
});
