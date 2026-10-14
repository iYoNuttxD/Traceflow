import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { TaskMoveMenu } from '../../src/features/tasks/components/TaskMoveMenu.jsx';

it('restores focus after the enabled DOM commits, even when the move promise settles earlier', async () => {
  let finish;
  const onMove = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const task = { id: 1, title: 'Entrega', status: 'A_FAZER' };
  const frame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  try {
    const { rerender } = render(<TaskMoveMenu task={task} onMove={onMove} />);
    const trigger = screen.getByRole('button', { name: 'Mover tarefa Entrega' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mover para Em Andamento' }));
    rerender(<TaskMoveMenu task={task} onMove={onMove} disabled />);
    await act(async () => {
      finish();
    });
    expect(trigger).toBeDisabled();
    expect(trigger).not.toHaveFocus();
    rerender(<TaskMoveMenu task={task} onMove={onMove} />);
    expect(trigger).toHaveFocus();
    expect(onMove).toHaveBeenCalledTimes(1);
  } finally {
    frame.mockRestore();
  }
});
