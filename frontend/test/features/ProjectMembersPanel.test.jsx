import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../src/shared/index.js';

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn()
}));
vi.mock('../../src/api/http-client.js', () => ({ httpClient: apiMock }));
import { ProjectMembersPanel } from '../../src/features/members/ProjectMembersPanel.jsx';

const member = {
  id: 2,
  role: 'MEMBER',
  isActive: true,
  joinedAt: '2030-01-02T12:00:00.000Z',
  user: {
    name: 'Pessoa artificial',
    username: 'pessoa-artificial',
    email: 'p***@example.invalid'
  }
};

function renderPanel(activeView = 'team') {
  return render(
    <ConfirmProvider>
      <ProjectMembersPanel projectId="1" activeView={activeView} />
    </ConfirmProvider>
  );
}

function mockList(role = 'OWNER') {
  apiMock.get.mockImplementation((path) => {
    if (path.endsWith('/members'))
      return Promise.resolve({
        data: { currentMembership: { id: 1, role, isActive: true }, members: [member] }
      });
    if (path.endsWith('/invitations')) return Promise.resolve({ data: { invitations: [] } });
    return Promise.reject(new Error(`URL inesperada: ${path}`));
  });
}

describe('ProjectMembersPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exibe dados minimizados e oculta administração para MEMBER', async () => {
    mockList('MEMBER');
    renderPanel();
    expect(await screen.findByText('Pessoa artificial')).toBeInTheDocument();
    expect(screen.getByText('@pessoa-artificial')).toBeInTheDocument();
    expect(screen.getByText('p***@example.invalid')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desativar' })).not.toBeInTheDocument();
    expect(apiMock.get).not.toHaveBeenCalledWith('/projects/1/invitations');
    expect(screen.getByRole('heading', { name: 'Sua participação' })).toBeInTheDocument();
  });

  it('permite ao OWNER alterar papel e recarrega a lista', async () => {
    mockList('OWNER');
    apiMock.patch.mockResolvedValue({ data: { membership: { ...member, role: 'MANAGER' } } });
    const user = userEvent.setup();
    renderPanel();
    const select = await screen.findByLabelText('Perfil de Pessoa artificial');
    expect(select.closest('label')).toHaveTextContent(/^Perfil/);
    const memberCard = screen.getByText('Pessoa artificial').closest('.member-item');
    expect(memberCard.querySelector('.member-item-header')).toBeInTheDocument();
    expect(memberCard.querySelector('.member-actions')).toBeInTheDocument();
    expect(memberCard.querySelector('.member-action-buttons')).toBeInTheDocument();
    await user.selectOptions(select, 'MANAGER');
    await waitFor(() =>
      expect(apiMock.patch).toHaveBeenCalledWith('/projects/1/members/2', { role: 'MANAGER' })
    );
  });

  it('permite saída própria confirmada sem tentar recarregar o projeto', async () => {
    mockList('MEMBER');
    apiMock.delete.mockResolvedValue({});
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Sair do projeto' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sair' }));
    expect(apiMock.delete).toHaveBeenCalledWith('/projects/1/members/me');
    expect(await screen.findByText('Você saiu do projeto.')).toBeInTheDocument();
  });

  it('confirma a desativação de membro', async () => {
    mockList('OWNER');
    apiMock.delete.mockResolvedValue({});
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Desativar' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desativar' }));
    expect(apiMock.delete).toHaveBeenCalledWith('/projects/1/members/2');
  });

  it('envia convite na visualização de Convites sem expor token', async () => {
    mockList('OWNER');
    apiMock.post.mockResolvedValue({
      data: {
        invitation: { id: 4, email: 'invite@example.invalid', role: 'VIEWER' },
        emailDelivery: { status: 'accepted', accepted: true }
      }
    });
    const user = userEvent.setup();
    renderPanel('invitations');
    expect(await screen.findByText('Nenhum convite pendente.')).toBeInTheDocument();
    await user.type(await screen.findByLabelText('E-mail'), 'invite@example.invalid');
    await user.selectOptions(screen.getByLabelText('Perfil do convite'), 'VIEWER');
    expect(screen.getByLabelText('E-mail').closest('form')).toHaveClass('invitation-form');
    await user.click(screen.getByRole('button', { name: 'Enviar convite' }));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith('/projects/1/invitations', {
        email: 'invite@example.invalid',
        role: 'VIEWER'
      })
    );
    expect(await screen.findByText(/E-mail enviado com sucesso/)).toBeInTheDocument();
  });

  it('mostra histórico de convite e permite revogar somente estado pendente', async () => {
    apiMock.get.mockImplementation((path) => {
      if (path.endsWith('/members'))
        return Promise.resolve({
          data: { currentMembership: { id: 1, role: 'OWNER', isActive: true }, members: [member] }
        });
      if (path.endsWith('/invitations'))
        return Promise.resolve({
          data: {
            invitations: [
              {
                id: 10,
                email: 'pending@example.invalid',
                role: 'MEMBER',
                status: 'PENDING',
                createdAt: '2030-01-01T12:00:00.000Z',
                expiresAt: '2030-01-08T12:00:00.000Z'
              },
              {
                id: 11,
                email: 'declined@example.invalid',
                role: 'VIEWER',
                status: 'DECLINED',
                createdAt: '2030-01-01T12:00:00.000Z',
                expiresAt: '2030-01-08T12:00:00.000Z'
              }
            ]
          }
        });
      return Promise.reject(new Error(`URL inesperada: ${path}`));
    });
    renderPanel('invitations');
    expect(await screen.findByText('pending@example.invalid')).toBeInTheDocument();
    expect(screen.getByText('Recusado')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Revogar' })).toHaveLength(1);
  });

  it('explica e bloqueia ações que removeriam o último proprietário', async () => {
    apiMock.get.mockImplementation((path) => {
      if (path.endsWith('/members'))
        return Promise.resolve({
          data: {
            currentMembership: { id: 1, role: 'OWNER', isActive: true },
            members: [{ ...member, id: 1, role: 'OWNER' }]
          }
        });
      if (path.endsWith('/invitations')) return Promise.resolve({ data: { invitations: [] } });
      return Promise.reject(new Error(`URL inesperada: ${path}`));
    });
    renderPanel();
    expect(await screen.findByText(/Adicione outro proprietário/)).toBeInTheDocument();
    expect(screen.getByLabelText('Perfil de Pessoa artificial')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Desativar' })).toBeDisabled();
  });

  it('filtra membros por nome, username e perfil de forma combinada', async () => {
    const members = [
      {
        ...member,
        id: 1,
        role: 'OWNER',
        user: { ...member.user, name: 'Ana Artificial', username: 'alpha-owner' }
      },
      {
        ...member,
        id: 2,
        role: 'MEMBER',
        user: { ...member.user, name: 'Bruno Artificial', username: 'BetaDev' }
      },
      {
        ...member,
        id: 3,
        role: 'VIEWER',
        user: { ...member.user, name: 'Carla Artificial', username: 'gamma-viewer' }
      }
    ];
    apiMock.get.mockImplementation((path) => {
      if (path.endsWith('/members'))
        return Promise.resolve({
          data: { currentMembership: { id: 1, role: 'OWNER', isActive: true }, members }
        });
      if (path.endsWith('/invitations')) return Promise.resolve({ data: { invitations: [] } });
      return Promise.reject(new Error(`URL inesperada: ${path}`));
    });
    const user = userEvent.setup();
    renderPanel();

    const search = await screen.findByLabelText('Buscar membro');
    const searchControl = search.closest('.member-search-control');
    expect(searchControl).toBeInTheDocument();
    expect(searchControl.querySelector('[data-icon="search"]')).toBeInTheDocument();
    await user.type(search, 'BETADEV');
    expect(screen.getByText('Bruno Artificial')).toBeInTheDocument();
    expect(screen.queryByText(/Ana Artificial/)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filtrar por perfil'), 'OWNER');
    expect(screen.getByText('Nenhum membro encontrado.')).toBeInTheDocument();

    await user.clear(search);
    expect(screen.getByText(/Ana Artificial/)).toBeInTheDocument();
    expect(screen.queryByText('Bruno Artificial')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filtrar por perfil'), 'VIEWER');
    await user.type(search, 'carla');
    expect(screen.getByText('Carla Artificial')).toBeInTheDocument();
  });
});
