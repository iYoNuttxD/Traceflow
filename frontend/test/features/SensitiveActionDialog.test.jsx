import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { SensitiveActionDialog } from '../../src/features/settings/SensitiveActionDialog.jsx';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function DialogHarness({ onConfirm = vi.fn() }) {
  const [dialog, setDialog] = useState(null);

  return (
    <>
      <button type="button" onClick={(event) => setDialog({ trigger: event.currentTarget })}>
        Abrir ação
      </button>
      {dialog && (
        <SensitiveActionDialog
          title="Desconectar integração?"
          description="Esta ação interrompe a integração."
          confirmLabel="Desconectar"
          trigger={dialog.trigger}
          onConfirm={onConfirm}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

describe('SensitiveActionDialog focus management', () => {
  it('mantém Tab e Shift+Tab dentro do dialog enquanto a mutation está pendente', async () => {
    const pending = deferred();
    const onConfirm = vi.fn(() => pending.promise);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DialogHarness onConfirm={onConfirm} />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Abrir ação' }));
    const dialog = screen.getByRole('dialog', { name: 'Desconectar integração?' });
    const password = within(dialog).getByLabelText(/Senha atual/);
    await user.type(password, 'senha local segura');
    await user.click(within(dialog).getByRole('button', { name: 'Desconectar' }));

    expect(onConfirm).toHaveBeenCalledOnce();
    const cancel = within(dialog).getByRole('button', { name: 'Cancelar' });
    await waitFor(() => expect(cancel).toHaveFocus());
    expect(cancel).toHaveAttribute('aria-disabled', 'true');
    await user.click(cancel);
    expect(dialog).toBeInTheDocument();
    expect(onConfirm).toHaveBeenCalledOnce();
    await user.tab();
    expect(dialog).toContainElement(document.activeElement);
    await user.tab({ shift: true });
    expect(dialog).toContainElement(document.activeElement);
    expect(document.activeElement).not.toBe(document.body);
  });

  it.each([
    ['Cancelar', async (user) => user.click(screen.getByRole('button', { name: 'Cancelar' }))],
    ['Escape', async (user) => user.keyboard('{Escape}')]
  ])('fecha por %s e devolve o foco ao trigger', async (_action, closeDialog) => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DialogHarness />
      </MemoryRouter>
    );

    const trigger = screen.getByRole('button', { name: 'Abrir ação' });
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await closeDialog(user);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('usa o painel como fallback quando não encontra controles focáveis', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DialogHarness />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Abrir ação' }));
    const dialog = screen.getByRole('dialog');
    for (const control of within(dialog).getAllByRole('button'))
      control.setAttribute('disabled', '');
    within(dialog)
      .getByLabelText(/Senha atual/)
      .setAttribute('disabled', '');
    fireEvent.keyDown(document, { key: 'Tab' });

    expect(dialog).toHaveFocus();
  });

  it('refoca a senha depois de um erro de credencial', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockRejectedValue({
      response: {
        status: 401,
        data: { code: 'INVALID_CREDENTIALS', message: 'Senha atual incorreta.' }
      }
    });
    render(
      <MemoryRouter>
        <DialogHarness onConfirm={onConfirm} />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Abrir ação' }));
    const dialog = screen.getByRole('dialog', { name: 'Desconectar integração?' });
    const password = within(dialog).getByLabelText(/Senha atual/);
    await user.type(password, 'senha incorreta');
    await user.click(within(dialog).getByRole('button', { name: 'Desconectar' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Senha atual incorreta.');
    await waitFor(() => expect(password).toHaveFocus());
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).not.toBe(document.body);
  });
});
