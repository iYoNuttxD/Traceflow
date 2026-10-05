import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SprintsSummary } from '../../src/features/schedule/components/SprintsSummary.jsx';

describe('Sprint summary estimate coverage', () => {
  it('renders an unknown estimate without exposing null or inventing zero', () => {
    const sprint = {
      id: 1,
      name: 'Sprint ativa',
      status: 'EM_ANDAMENTO',
      startDate: '2026-10-01',
      endDate: '2026-10-08',
      tasks: [
        { status: 'A_FAZER', estimatedEffort: 4 },
        { status: 'A_FAZER', estimatedEffort: null }
      ]
    };
    render(<SprintsSummary sprints={[sprint]} scheduleById={{ 1: sprint }} />);
    expect(screen.getByText(/2 tarefas · — pts/)).toBeVisible();
    expect(screen.queryByText(/null pts|0 pts/)).not.toBeInTheDocument();
  });
});
