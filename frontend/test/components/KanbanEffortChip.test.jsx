import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KanbanBoard } from '../../src/features/tasks/components/KanbanBoard.jsx';

const task = (overrides = {}) => ({
  id: 1,
  title: 'Corrigir frete',
  status: 'A_FAZER',
  priority: 'MEDIA',
  responsibleUser: { id: 1, name: 'Ana Ribeiro' },
  ...overrides
});
const board = (tasks) => ({
  columns: { A_FAZER: tasks, EM_ANDAMENTO: [], CONCLUIDO: [] },
  totals: { A_FAZER: tasks.length, EM_ANDAMENTO: 0, CONCLUIDO: 0, total: tasks.length }
});
const noop = () => {};

function renderBoard(tasks) {
  return render(
    <KanbanBoard
      board={board(tasks)}
      onSelectTask={noop}
      onOpenHistory={noop}
      onTaskDragStart={noop}
      onTaskDragEnd={noop}
      onColumnDragOver={noop}
      onColumnDragLeave={noop}
      onColumnDrop={noop}
    />
  );
}

const chip = (id = 1) => screen.queryByTestId(`kanban-task-effort-${id}`);

describe('Kanban — cronômetro de esforço no cartão (S1-06)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mostra o total registrado contra a estimativa com a cor do estado', () => {
    renderBoard([
      task({ id: 1, estimatedEffort: 8, actualEffort: 2 }),
      task({ id: 2, estimatedEffort: 1, actualEffort: 2 }),
      task({ id: 3, estimatedEffort: 4, actualEffort: 3 }),
      task({ id: 4, actualEffort: 1.5 })
    ]);
    expect(chip(1)).toHaveTextContent('2h/ 8h · 25%');
    expect(chip(1)).toHaveClass('kanban-task__effort--accent');
    expect(chip(1)).toHaveAttribute('title', 'Esforço registrado 2h de 8h estimadas (25%)');
    expect(chip(2)).toHaveTextContent('200%');
    expect(chip(2)).toHaveClass('kanban-task__effort--danger');
    expect(chip(3)).toHaveClass('kanban-task__effort--warning');
    expect(chip(4)).toHaveTextContent('1h30min');
    expect(chip(4)).toHaveClass('kanban-task__effort--neutral');
  });

  it('omite o indicador sem dado de esforço e em tarefas congeladas', () => {
    renderBoard([
      task({ id: 1 }),
      task({ id: 2, isFrozen: true, snapshotAvailable: true, estimatedEffort: 5, actualEffort: 2 })
    ]);
    expect(chip(1)).toBeNull();
    expect(chip(2)).toBeNull();
  });

  it('com sessão em andamento mostra o relógio vivo e quem iniciou', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T12:00:00.000Z'));
    renderBoard([
      task({
        id: 1,
        estimatedEffort: 2,
        actualEffort: 1,
        runningTimer: {
          id: 9,
          startedAt: '2026-09-08T11:30:00.000Z',
          startedBy: { id: 2, name: 'Bruno Lima' }
        }
      })
    ]);
    // 1h registrada + 30min de sessão viva = 75% das 2h estimadas.
    expect(chip(1)).toHaveTextContent('00:30:00');
    expect(chip(1)).toHaveTextContent('75%');
    expect(chip(1)).toHaveClass('kanban-task__effort--running', 'kanban-task__effort--warning');
    expect(chip(1)).toHaveAttribute(
      'title',
      'Cronômetro em andamento por Bruno Lima · total 1h30min de 2h estimadas (75%)'
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(chip(1)).toHaveTextContent('00:30:02');
  });
});
