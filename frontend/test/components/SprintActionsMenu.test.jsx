import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SprintActionsMenu } from '../../src/features/schedule/components/SprintActionsMenu.jsx';
import { ConfirmProvider, useConfirm } from '../../src/shared/components/ConfirmDialog.jsx';

const item = (overrides = {}) => ({
  key: 'ver-tarefas',
  label: 'Ver tarefas',
  onSelect: vi.fn(),
  ...overrides
});

function renderMenu(props = {}) {
  return render(
    <div>
      <button type="button">Fora do menu</button>
      <SprintActionsMenu
        sprintName="Sprint 1"
        items={[item(), ...(props.extraItems || [])]}
        {...props}
      />
    </div>
  );
}

const gatilho = () => screen.getByRole('button', { name: 'Mais ações da sprint Sprint 1' });

describe('SprintActionsMenu', () => {
  it('devolve o foco ao gatilho ao cancelar a confirmação aberta por uma ação', async () => {
    function DeleteMenu() {
      const confirm = useConfirm();
      return (
        <SprintActionsMenu
          sprintName="Sprint 1"
          items={[
            item({
              label: 'Excluir',
              onSelect: () => confirm({ title: 'Excluir sprint', description: 'Confirme a ação.' })
            })
          ]}
        />
      );
    }
    const user = userEvent.setup();
    render(
      <ConfirmProvider>
        <DeleteMenu />
      </ConfirmProvider>
    );
    await user.click(gatilho());
    await user.click(screen.getByRole('menuitem', { name: 'Excluir' }));
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(gatilho()).toHaveFocus());
  });

  it('mantém o menu dentro da altura da janela e permite rolar os próprios itens', async () => {
    const bounds = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function () {
        return this.getAttribute('role') === 'menu'
          ? { width: 216, height: 600, top: 0, bottom: 600, left: 0, right: 216 }
          : { width: 44, height: 44, top: 100, bottom: 144, left: 200, right: 244 };
      });
    try {
      const user = userEvent.setup();
      renderMenu();
      await user.click(gatilho());
      const menu = screen.getByRole('menu');
      expect(Number.parseFloat(menu.style.top)).toBeGreaterThanOrEqual(8);
      expect(Number.parseFloat(menu.style.top) + 600).toBeLessThanOrEqual(window.innerHeight - 8);
      fireEvent.scroll(menu);
      expect(menu).toBeInTheDocument();
    } finally {
      bounds.mockRestore();
    }
  });

  it('anuncia que abre um menu e o estado de aberto', async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = gatilho();
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'Ações da sprint Sprint 1' })).toBeInTheDocument();
  });

  it('fecha ao clicar fora, sem acionar item nenhum', async () => {
    const user = userEvent.setup();
    const acao = item();
    render(
      <div>
        <button type="button">Fora do menu</button>
        <SprintActionsMenu sprintName="Sprint 1" items={[acao]} />
      </div>
    );

    await user.click(gatilho());
    expect(screen.getByRole('menuitem', { name: 'Ver tarefas' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fora do menu' }));
    expect(screen.queryByRole('menuitem', { name: 'Ver tarefas' })).not.toBeInTheDocument();
    expect(acao.onSelect).not.toHaveBeenCalled();
  });

  it('fecha no Escape e devolve o foco ao gatilho', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(gatilho());
    expect(screen.getByRole('menuitem', { name: 'Ver tarefas' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menuitem', { name: 'Ver tarefas' })).not.toBeInTheDocument();
    expect(gatilho()).toHaveFocus();
  });

  it('fecha na rolagem — o menu é fixed e não acompanha a lista', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(gatilho());
    expect(screen.getByRole('menuitem', { name: 'Ver tarefas' })).toBeInTheDocument();

    fireEvent.scroll(document.body);
    expect(screen.queryByRole('menuitem', { name: 'Ver tarefas' })).not.toBeInTheDocument();
  });

  it('escolher um item fecha o menu e executa a ação', async () => {
    const user = userEvent.setup();
    const acao = item();
    render(<SprintActionsMenu sprintName="Sprint 1" items={[acao]} />);

    await user.click(gatilho());
    await user.click(screen.getByRole('menuitem', { name: 'Ver tarefas' }));

    expect(acao.onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menuitem', { name: 'Ver tarefas' })).not.toBeInTheDocument();
    expect(gatilho()).toHaveAttribute('aria-expanded', 'false');
  });

  it('desabilitado não abre', async () => {
    const user = userEvent.setup();
    render(<SprintActionsMenu sprintName="Sprint 1" items={[item()]} disabled />);

    const trigger = gatilho();
    expect(trigger).toBeDisabled();
    await user.click(trigger);
    expect(screen.queryByRole('menuitem', { name: 'Ver tarefas' })).not.toBeInTheDocument();
  });

  it('navega pelos itens com setas e Home/End', async () => {
    const user = userEvent.setup();
    renderMenu({ extraItems: [item({ key: 'editar', label: 'Editar' })] });

    await user.click(gatilho());
    const first = screen.getByRole('menuitem', { name: 'Ver tarefas' });
    const last = screen.getByRole('menuitem', { name: 'Editar' });
    await waitFor(() => expect(first).toHaveFocus());

    await user.keyboard('{ArrowDown}');
    expect(last).toHaveFocus();
    await user.keyboard('{Home}');
    expect(first).toHaveFocus();
    await user.keyboard('{End}');
    expect(last).toHaveFocus();
  });
});
