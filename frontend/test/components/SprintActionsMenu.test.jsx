import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SprintActionsMenu } from '../../src/features/schedule/components/SprintActionsMenu.jsx';

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
  it('anuncia que abre um menu e o estado de aberto', async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = gatilho();
    expect(trigger).toHaveAttribute('aria-haspopup', 'true');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('group', { name: 'Ações da sprint Sprint 1' })).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Ver tarefas' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fora do menu' }));
    expect(screen.queryByRole('button', { name: 'Ver tarefas' })).not.toBeInTheDocument();
    expect(acao.onSelect).not.toHaveBeenCalled();
  });

  it('fecha no Escape e devolve o foco ao gatilho', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(gatilho());
    expect(screen.getByRole('button', { name: 'Ver tarefas' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Ver tarefas' })).not.toBeInTheDocument();
    expect(gatilho()).toHaveFocus();
  });

  it('fecha na rolagem — o menu é fixed e não acompanha a lista', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(gatilho());
    expect(screen.getByRole('button', { name: 'Ver tarefas' })).toBeInTheDocument();

    fireEvent.scroll(document.body);
    expect(screen.queryByRole('button', { name: 'Ver tarefas' })).not.toBeInTheDocument();
  });

  it('escolher um item fecha o menu e executa a ação', async () => {
    const user = userEvent.setup();
    const acao = item();
    render(<SprintActionsMenu sprintName="Sprint 1" items={[acao]} />);

    await user.click(gatilho());
    await user.click(screen.getByRole('button', { name: 'Ver tarefas' }));

    expect(acao.onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Ver tarefas' })).not.toBeInTheDocument();
    expect(gatilho()).toHaveAttribute('aria-expanded', 'false');
  });

  it('desabilitado não abre', async () => {
    const user = userEvent.setup();
    render(<SprintActionsMenu sprintName="Sprint 1" items={[item()]} disabled />);

    const trigger = gatilho();
    expect(trigger).toBeDisabled();
    await user.click(trigger);
    expect(screen.queryByRole('button', { name: 'Ver tarefas' })).not.toBeInTheDocument();
  });
});
