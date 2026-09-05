import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SprintProgressPanel } from '../../src/features/schedule/components/SprintProgressPanel.jsx';
import { SprintList } from '../../src/features/schedule/components/SprintList.jsx';
import { MilestoneSprintsPanel } from '../../src/features/schedule/components/MilestoneSprintsPanel.jsx';
import { getScheduleTasks } from '../../src/features/schedule/components/schedule-calendar.js';
import { getSprintDisplayMetrics } from '../../src/features/schedule/components/schedule-display.js';

const historicalSummary = {
  totalTasks: 3,
  completedTasks: 1,
  totalPoints: 21,
  completedPoints: 3,
  percentage: 14,
  historicalLimitations: []
};
const sprint = {
  id: 1,
  name: 'Sprint 1',
  milestoneId: 1,
  status: 'CONCLUIDA',
  startDate: '2026-09-01',
  endDate: '2026-09-05',
  historicalSummary
};
const currentTasks = [
  { id: 1, status: 'CONCLUIDO', estimatedEffort: 13, sprintId: 1 },
  { id: 2, status: 'CONCLUIDO', estimatedEffort: 1, sprintId: 2 },
  { id: 4, status: 'EM_ANDAMENTO', estimatedEffort: 34, sprintId: 2 }
];
const scheduleSprint = { ...sprint, tasks: currentTasks };
const progress = {
  frozen: true,
  historicalSummary,
  baseline: { kind: 'STARTED_AT', at: '2026-09-01' },
  planned: { hasData: true, numerator: 1, denominator: 2, percentage: 50 },
  current: { hasData: true, numerator: 1, denominator: 3, percentage: 33.33 },
  scopeChange: { added: [], removed: [] },
  cutoff: '2026-09-04',
  burndown: { hasData: false, totalPoints: 21, days: [] }
};

describe('frozen terminal presentation', () => {
  it.each(['PLANEJADA', 'EM_ANDAMENTO'])(
    'keeps %s metrics live after current status/effort updates',
    (status) => {
      const live = { ...scheduleSprint, status };
      expect(getSprintDisplayMetrics(live)).toMatchObject({ points: 48, done: 2, percent: 29 });
      expect(
        getSprintDisplayMetrics({ ...live, tasks: [{ status: 'CONCLUIDO', estimatedEffort: 8 }] })
      ).toMatchObject({ points: 8, done: 1, percent: 100 });
    }
  );
  it.each(['CONCLUIDA', 'CANCELADA'])(
    'never falls back to current Task data for legacy %s',
    (status) => {
      const legacy = { ...sprint, status, historicalSummary: null };
      render(
        <SprintList
          sprints={[legacy]}
          scheduleById={{ 1: { ...scheduleSprint, historicalSummary: null } }}
          readOnly
        />
      );
      expect(screen.getByText('Dados históricos indisponíveis.')).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
      expect(screen.queryByText('48')).not.toBeInTheDocument();
      expect(screen.queryByText('29%')).not.toBeInTheDocument();
    }
  );
  it('propagates an unknown terminal total instead of showing a partial Milestone point sum', () => {
    const legacy = { ...sprint, historicalSummary: null };
    render(
      <MilestoneSprintsPanel
        milestone={{ id: 1, title: 'Marco' }}
        sprints={[legacy]}
        scheduleById={{ 1: { ...scheduleSprint, historicalSummary: null } }}
      />
    );
    expect(screen.getByLabelText('Resumo das Sprints do marco')).toHaveTextContent('— pts');
    expect(screen.getByText('Dados históricos indisponíveis.')).toBeInTheDocument();
  });
  it('keeps evolution top metrics at 1/3, 3/21 and 14% despite current 2/3 and 48 points', () => {
    render(
      <SprintProgressPanel sprint={sprint} scheduleSprint={scheduleSprint} progress={progress} />
    );
    const panel = screen.getByRole('region', { name: 'Evolução da sprint Sprint 1' });
    expect(within(panel).getByText('1 de 3')).toBeInTheDocument();
    expect(within(panel).getByText('3 de 21')).toBeInTheDocument();
    expect(within(panel).getByText('14%')).toBeInTheDocument();
    expect(within(panel).queryByText('29%')).not.toBeInTheDocument();
  });
  it('keeps terminal cards frozen', () => {
    render(<SprintList sprints={[sprint]} scheduleById={{ 1: scheduleSprint }} readOnly />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '14');
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      '3 de 21 pontos concluídos'
    );
  });
  it('sums 21 historical plus 35 live points in Milestones, preserving 50% by Sprints', () => {
    const next = {
      ...sprint,
      id: 2,
      name: 'Sprint 2',
      status: 'EM_ANDAMENTO',
      historicalSummary: null,
      tasks: currentTasks.slice(1)
    };
    render(
      <MilestoneSprintsPanel
        milestone={{ id: 1, title: 'Marco' }}
        sprints={[sprint, next]}
        scheduleById={{ 1: scheduleSprint, 2: next }}
      />
    );
    expect(screen.getByLabelText('Resumo das Sprints do marco')).toHaveTextContent('56 pts');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  });
});

describe('Schedule current context', () => {
  it('keeps a Task without its own deadline undated after carry-over', () => {
    const task = { id: 8, sprintId: 2, deadline: null };
    expect(
      getScheduleTasks({
        sprints: [
          { ...sprint, tasks: [task] },
          { ...sprint, id: 2, tasks: [task] }
        ]
      })[0]
    ).toMatchObject({ day: null, deadline: null });
  });
  it.each([2, null, 1])(
    'uses Task.sprintId=%s independently of history order and retains own deadline',
    (sprintId) => {
      const task = { id: 8, sprintId, deadline: '2026-09-10', title: 'Current Task' };
      const s1 = { ...sprint, tasks: [task] };
      const s2 = { ...sprint, id: 2, name: 'Sprint 2', tasks: [task] };
      const first = getScheduleTasks({ sprints: [s1, s2] });
      const reverse = getScheduleTasks({ sprints: [s2, s1] });
      expect(first).toEqual(reverse);
      expect(first).toHaveLength(1);
      expect(first[0]).toMatchObject({
        sprintId,
        sprintName: sprintId ? `Sprint ${sprintId}` : null,
        deadline: task.deadline
      });
    }
  );
});
