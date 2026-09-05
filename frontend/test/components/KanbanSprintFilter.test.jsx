import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { KanbanSprintFilter } from '../../src/features/tasks/components/KanbanSprintFilter.jsx';

const sprints = Array.from({ length: 10 }, (_, index) => ({
  id: index + 1,
  name: `Sprint ${String(index + 1).padStart(2, '0')}`
}));

describe('KanbanSprintFilter', () => {
  it('limita o catálogo inicial e pesquisa localmente quando há muitas Sprints', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <KanbanSprintFilter
        sprints={sprints}
        selectedIds={[]}
        statusLabels={Object.fromEntries(sprints.map((sprint) => [sprint.id, 'Planejada']))}
        onToggle={onToggle}
        onClear={vi.fn()}
      />
    );

    const trigger = screen.getByRole('button', { name: /Projeto inteiro/ });
    await user.click(trigger);
    expect(screen.getAllByRole('checkbox')).toHaveLength(9);
    const projectOption = screen.getByRole('checkbox', { name: /Projeto inteiro/ });
    expect(projectOption).toBeChecked();
    expect(projectOption.closest('li')).toBe(screen.getAllByRole('listitem')[0]);
    expect(screen.getByText('Todas as tarefas do projeto')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Pesquisar Sprint'), '10');
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    await user.click(screen.getByRole('checkbox', { name: /Sprint 10/ }));
    expect(onToggle).toHaveBeenCalledWith(10);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('mantém o projeto inteiro quando não há Sprints', () => {
    render(
      <KanbanSprintFilter sprints={[]} selectedIds={[]} onToggle={vi.fn()} onClear={vi.fn()} />
    );

    expect(screen.getByRole('button', { name: /Projeto inteiro/ })).toBeDisabled();
    expect(screen.getByText('Sem Sprints cadastradas')).toBeInTheDocument();
  });
});
