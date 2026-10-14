import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GraphStatus, graphFields } from '../../src/features/traceability/components/GraphNode.jsx';
import { TaskTraceability } from '../../src/features/tasks/components/TaskTraceability.jsx';

describe('Estados GitHub na experiência em português', () => {
  it.each([
    ['PULL_REQUEST', 'closed', 'Fechado'],
    ['ISSUE', 'open', 'Aberto']
  ])('traduz o estado de %s no nó e no inspector', (type, state, label) => {
    render(<GraphStatus type={type} detail={{ state }} />);
    expect(screen.getByText(label)).toBeVisible();
    expect(screen.queryByText(state)).toBeNull();
    expect(graphFields(type, { state })).toContainEqual(['Estado', label]);
  });

  it('apresenta PR e Issue da Task sem enums brutos', () => {
    render(
      <TaskTraceability
        task={{
          pullRequest: { number: 18, title: 'Correção', state: 'closed' },
          issues: [{ id: 1, number: 2, title: 'Falha', state: 'open', labels: [] }]
        }}
      />
    );
    expect(screen.getByText('Fechado')).toBeVisible();
    expect(screen.getByText(/Aberto/)).toBeVisible();
    expect(screen.queryByText(/closed|open/)).toBeNull();
  });
});
