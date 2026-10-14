import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CollapsibleFilterPanel, FilterActions } from '../../src/features/schedule/index.js';

describe('shared filter footer', () => {
  it('places clear after the fields only when there is applied or draft content', async () => {
    const clear = vi.fn();
    const view = (props = {}) => (
      <CollapsibleFilterPanel onClear={clear} {...props}>
        <label>
          Busca
          <input />
        </label>
      </CollapsibleFilterPanel>
    );
    const { container, rerender } = render(view());
    const toggle = screen.getByRole('button', { name: /Buscar e filtrar/ });
    await userEvent.click(toggle);
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull();
    rerender(view({ canClear: true }));
    const footer = container.querySelector('.filter-actions');
    expect(footer.parentElement.lastElementChild).toBe(footer);
    expect(
      screen.getByRole('textbox').compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(clear).toHaveBeenCalledOnce();
    await userEvent.click(toggle);
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull();
    expect(toggle).toHaveFocus();
    rerender(view({ activeCount: 1 }));
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Limpar filtros' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Filtrar' })).toBeNull();
  });

  it('retains explicit form submission and secondary clear in the same footer', () => {
    const apply = vi.fn((event) => event.preventDefault());
    const clear = vi.fn();
    render(
      <form onSubmit={apply}>
        <input aria-label="Busca" />
        <FilterActions canClear onClear={clear} applyLabel="Filtrar" />
      </form>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(clear).toHaveBeenCalledOnce();
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
    expect(apply).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Filtrar' })).toHaveClass('button-primary');
  });
});
