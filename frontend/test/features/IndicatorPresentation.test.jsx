import { fireEvent, render, screen } from '@testing-library/react';
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
