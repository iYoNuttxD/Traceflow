import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { KanbanDialog } from '../../src/features/tasks/components/KanbanDialog.jsx';

// O diálogo interno é renderizado dentro do DOM do externo, como acontece com o
// histórico de sessões dentro dos detalhes da tarefa.
function NestedDialogs({ onCloseOuter }) {
  const [innerOpen, setInnerOpen] = useState(false);
  return (
    <KanbanDialog title="Detalhes da tarefa" onClose={onCloseOuter}>
      <button type="button" onClick={() => setInnerOpen(true)}>
        Ver sessões registradas
      </button>
      {innerOpen && (
        <KanbanDialog title="Sessões" onClose={() => setInnerOpen(false)}>
          <button type="button">Filtrar</button>
        </KanbanDialog>
      )}
    </KanbanDialog>
  );
}

describe('KanbanDialog — teclado com diálogos aninhados', () => {
  it('Escape fecha apenas o diálogo do topo, preservando o ancestral', async () => {
    const user = userEvent.setup();
    const onCloseOuter = vi.fn();
    render(<NestedDialogs onCloseOuter={onCloseOuter} />);

    await user.click(screen.getByRole('button', { name: 'Ver sessões registradas' }));
    const inner = await screen.findByRole('dialog', { name: 'Sessões' });
    await user.click(within(inner).getByRole('button', { name: 'Filtrar' }));

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Sessões' })).toBeNull();
    expect(onCloseOuter).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Detalhes da tarefa' })).toBeInTheDocument();

    // Com o interno fechado, o ancestral volta a responder ao teclado.
    await user.keyboard('{Escape}');
    expect(onCloseOuter).toHaveBeenCalledTimes(1);
  });

  it('sem aninhamento, Escape continua fechando o diálogo aberto', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <KanbanDialog title="Detalhes da tarefa" onClose={onClose}>
        <button type="button">Editar</button>
      </KanbanDialog>
    );
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
