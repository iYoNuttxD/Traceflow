import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../src/shared/index.js';

const mocks = vi.hoisted(() => ({
  projects: {
    get: vi.fn(),
    update: vi.fn(),
    getAccessCode: vi.fn(),
    regenerateAccessCode: vi.fn(),
    updateAccessCodeRole: vi.fn()
  },
  members: {
    list: vi.fn(),
    invitations: vi.fn(),
    leave: vi.fn(),
    invite: vi.fn(),
    updateRole: vi.fn(),
    deactivate: vi.fn(),
    reactivate: vi.fn(),
    transfer: vi.fn(),
    revokeInvitation: vi.fn()
  },
  refreshProjects: vi.fn()
}));

vi.mock('../../src/features/projects/api/projects.api.js', () => ({
  projectsApi: mocks.projects
}));
vi.mock('../../src/features/members/members.api.js', () => ({ membersApi: mocks.members }));
vi.mock('../../src/features/projects/hooks/ProjectsCatalogContext.jsx', () => ({
  useProjectsCatalog: () => ({ refreshProjects: mocks.refreshProjects })
}));

import { ProjectEditPage } from '../../src/pages/ProjectEditPage.jsx';
import { ProjectMembersPage } from '../../src/pages/ProjectMembersPage.jsx';

const project = {
  id: 7,
  name: 'Projeto administrativo',
  description: 'Descrição atual',
  responsibleTeam: 'Equipe atual',
  status: 'ATIVO'
};

const ownerMembershipData = {
  currentMembership: { id: 1, role: 'OWNER', isActive: true },
  members: [
    {
      id: 1,
      role: 'OWNER',
      isActive: true,
      joinedAt: '2030-01-02T12:00:00.000Z',
      user: {
        name: 'Pessoa proprietária',
        username: 'owner-artificial',
        email: 'owner@example.invalid'
      }
    }
  ]
};

let navigateAdmin;

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function EditHarness() {
  navigateAdmin = useNavigate();
  return (
    <ConfirmProvider>
      <ProjectEditPage />
    </ConfirmProvider>
  );
}

function MembersHarness() {
  navigateAdmin = useNavigate();
  return (
    <ConfirmProvider>
      <ProjectMembersPage />
    </ConfirmProvider>
  );
}

function renderEdit() {
  return render(
    <MemoryRouter initialEntries={['/projects/7/edit']}>
      <Routes>
        <Route path="/projects/:projectId/edit" element={<EditHarness />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderMembers() {
  return render(
    <MemoryRouter initialEntries={['/projects/7/members']}>
      <Routes>
        <Route path="/projects/:projectId/members" element={<MembersHarness />} />
        <Route path="/projects" element={<h1>Projetos</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('rotas administrativas de projeto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateAdmin = undefined;
    mocks.projects.get.mockResolvedValue({ data: { project } });
    mocks.projects.getAccessCode.mockResolvedValue({
      data: {
        accessCode: {
          accessCode: 'TRC-0123456789ABCDEF0123456789ABCDEF',
          role: 'MEMBER',
          inviteLink: 'http://frontend.test/join/TRC-0123456789ABCDEF0123456789ABCDEF'
        }
      }
    });
    mocks.members.list.mockResolvedValue(ownerMembershipData);
    mocks.members.invitations.mockResolvedValue([]);
    mocks.members.leave.mockResolvedValue({});
    mocks.refreshProjects.mockResolvedValue([]);
  });

  it('migra edição para rota OWNER e preserva campos e payload', async () => {
    const user = userEvent.setup();
    mocks.projects.update.mockResolvedValue({
      data: {
        message: 'Projeto atualizado com sucesso.',
        project: { ...project, name: 'Projeto atualizado' }
      }
    });
    renderEdit();

    expect(await screen.findByRole('heading', { name: 'Editar projeto' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument();
    expect(screen.queryByText('Voltar à visão geral')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para visão geral' })).toHaveAttribute(
      'href',
      '/projects/7'
    );
    const nameInput = screen.getByLabelText('Nome do projeto *');
    await user.clear(nameInput);
    await user.type(nameInput, 'Projeto atualizado');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() =>
      expect(mocks.projects.update).toHaveBeenCalledWith('7', {
        name: 'Projeto atualizado',
        description: 'Descrição atual',
        responsibleTeam: 'Equipe atual',
        status: 'ATIVO'
      })
    );
    expect(await screen.findByText('Projeto atualizado com sucesso.')).toBeInTheDocument();
    expect(mocks.refreshProjects).toHaveBeenCalledOnce();
  });

  it('não apresenta formulário de edição a papel sem permissão', async () => {
    mocks.members.list.mockResolvedValue({
      currentMembership: { id: 2, role: 'MEMBER', isActive: true },
      members: []
    });
    renderEdit();

    expect(
      await screen.findByRole('heading', { name: 'Você não possui acesso a esta página.' })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome do projeto *')).not.toBeInTheDocument();
    expect(mocks.projects.update).not.toHaveBeenCalled();
  });

  it('move membros e código de acesso para a rota dedicada de OWNER', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });
    mocks.projects.updateAccessCodeRole.mockResolvedValue({
      data: {
        accessCode: {
          accessCode: 'TRC-0123456789ABCDEF0123456789ABCDEF',
          role: 'VIEWER',
          inviteLink: 'http://frontend.test/join/TRC-0123456789ABCDEF0123456789ABCDEF'
        }
      }
    });
    mocks.projects.regenerateAccessCode.mockResolvedValue({
      data: {
        accessCode: {
          accessCode: 'TRC-FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
          role: 'VIEWER',
          inviteLink: 'http://frontend.test/join/TRC-FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'
        }
      }
    });
    renderMembers();

    expect(await screen.findByText(/Pessoa proprietária/)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument();
    expect(screen.queryByText('Voltar à visão geral')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para visão geral' })).toHaveAttribute(
      'href',
      '/projects/7'
    );
    expect(screen.getByRole('tab', { name: 'Equipe' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Convites' }));
    expect(screen.getByRole('tab', { name: 'Convites' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Acesso por código ou link' })).toBeInTheDocument();
    expect(await screen.findByText('TRC-0123456789ABCDEF0123456789ABCDEF')).toBeInTheDocument();
    for (const name of ['Ocultar código', 'Regenerar código', 'Copiar link']) {
      const iconButton = screen.getByRole('button', { name });
      expect(iconButton).toHaveClass('access-code-icon-button');
      expect(iconButton).not.toHaveClass('button-secondary');
      expect(iconButton.querySelector('.traceflow-icon')).toBeInTheDocument();
    }
    await user.selectOptions(screen.getByLabelText('Perfil de entrada'), 'VIEWER');
    expect(mocks.projects.updateAccessCodeRole).toHaveBeenCalledWith('7', 'VIEWER');
    await user.click(screen.getByRole('button', { name: 'Copiar link' }));
    expect(writeText).toHaveBeenCalledWith(
      'http://frontend.test/join/TRC-0123456789ABCDEF0123456789ABCDEF'
    );
    const regenerateTrigger = screen.getByRole('button', { name: 'Regenerar código' });
    const visibilityControl = screen.getByRole('button', { name: 'Ocultar código' });
    await user.click(regenerateTrigger);
    const confirmation = screen.getByRole('dialog', { name: 'Regenerar código de acesso' });
    expect(within(confirmation).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await user.click(within(confirmation).getByRole('button', { name: 'Regenerar' }));
    expect(mocks.projects.regenerateAccessCode).toHaveBeenCalledWith('7');
    expect(await screen.findByText('TRC-FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')).toBeInTheDocument();
    expect(visibilityControl).toHaveFocus();
  });

  it('mantém consulta de membros para MEMBER sem expor administração do código', async () => {
    mocks.members.list.mockResolvedValue({
      ...ownerMembershipData,
      currentMembership: { id: 2, role: 'MEMBER', isActive: true }
    });
    renderMembers();

    expect(await screen.findByText(/Pessoa proprietária/)).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Convites' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Acesso por código ou link' })
    ).not.toBeInTheDocument();
    expect(mocks.projects.getAccessCode).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Enviar convite' })).not.toBeInTheDocument();
  });

  it('invalida o catálogo e substitui a rota após saída confirmada', async () => {
    mocks.members.list.mockResolvedValue({
      ...ownerMembershipData,
      currentMembership: { id: 2, role: 'MEMBER', isActive: true }
    });
    const user = userEvent.setup();
    renderMembers();

    await user.click(await screen.findByRole('button', { name: 'Sair do projeto' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sair' }));

    expect(mocks.members.leave).toHaveBeenCalledWith('7');
    expect(mocks.refreshProjects).toHaveBeenCalledOnce();
    expect(await screen.findByRole('heading', { name: 'Projetos' })).toBeInTheDocument();
  });

  it('preserva a rota e o catálogo quando a saída falha', async () => {
    mocks.members.list.mockResolvedValue({
      ...ownerMembershipData,
      currentMembership: { id: 2, role: 'MEMBER', isActive: true }
    });
    mocks.members.leave.mockRejectedValue({
      response: { status: 409, data: { message: 'Não foi possível sair deste projeto.' } }
    });
    const user = userEvent.setup();
    renderMembers();

    await user.click(await screen.findByRole('button', { name: 'Sair do projeto' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sair' }));

    expect(await screen.findByText('Não foi possível sair deste projeto.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Membros do projeto' })).toBeInTheDocument();
    expect(mocks.refreshProjects).not.toHaveBeenCalled();
  });

  it('não deixa a autorização OWNER de A habilitar o formulário MEMBER de B', async () => {
    const membershipA = deferred();
    const projectB = { ...project, id: 8, name: 'Projeto B' };
    mocks.projects.get.mockImplementation((projectId) =>
      Promise.resolve({ data: { project: projectId === '7' ? project : projectB } })
    );
    mocks.members.list.mockImplementation((projectId) =>
      projectId === '7'
        ? membershipA.promise
        : Promise.resolve({
            currentMembership: { id: 8, role: 'MEMBER', isActive: true },
            members: []
          })
    );
    renderEdit();
    await waitFor(() => expect(mocks.members.list).toHaveBeenCalledWith('7', expect.any(Object)));

    act(() => navigateAdmin('/projects/8/edit'));
    expect(
      await screen.findByRole('heading', { name: 'Você não possui acesso a esta página.' })
    ).toBeInTheDocument();

    await act(async () => {
      membershipA.resolve(ownerMembershipData);
      await membershipA.promise;
    });
    expect(
      screen.getByRole('heading', { name: 'Você não possui acesso a esta página.' })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome do projeto *')).not.toBeInTheDocument();
  });

  it('mantém members B sem controls OWNER quando a lista de A chega atrasada', async () => {
    const membersA = deferred();
    const projectB = { ...project, id: 8, name: 'Projeto B' };
    mocks.projects.get.mockImplementation((projectId) =>
      Promise.resolve({ data: { project: projectId === '7' ? project : projectB } })
    );
    mocks.members.list.mockImplementation((projectId) =>
      projectId === '7'
        ? membersA.promise
        : Promise.resolve({
            ...ownerMembershipData,
            currentMembership: { id: 8, role: 'MEMBER', isActive: true }
          })
    );
    renderMembers();
    await waitFor(() => expect(mocks.members.list).toHaveBeenCalledWith('7', expect.any(Object)));

    act(() => navigateAdmin('/projects/8/members'));
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Voltar para visão geral' })).toHaveAttribute(
        'href',
        '/projects/8'
      )
    );
    expect(screen.queryByRole('tab', { name: 'Convites' })).not.toBeInTheDocument();

    await act(async () => {
      membersA.resolve(ownerMembershipData);
      await membersA.promise;
    });
    expect(screen.queryByRole('tab', { name: 'Convites' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desativar' })).not.toBeInTheDocument();
    expect(mocks.projects.getAccessCode).not.toHaveBeenCalledWith('8');
  });

  it('ignora o projeto A atrasado no loader da rota de membros', async () => {
    const projectA = deferred();
    const projectB = { ...project, id: 8, name: 'Projeto B' };
    mocks.projects.get.mockImplementation((projectId) =>
      projectId === '7' ? projectA.promise : Promise.resolve({ data: { project: projectB } })
    );
    mocks.members.list.mockResolvedValue({
      ...ownerMembershipData,
      currentMembership: { id: 8, role: 'MEMBER', isActive: true }
    });
    renderMembers();
    await waitFor(() => expect(mocks.projects.get).toHaveBeenCalledWith('7', expect.any(Object)));

    act(() => navigateAdmin('/projects/8/members'));
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Voltar para visão geral' })).toHaveAttribute(
        'href',
        '/projects/8'
      )
    );

    await act(async () => {
      projectA.resolve({ data: { project } });
      await projectA.promise;
    });
    expect(screen.getByRole('link', { name: 'Voltar para visão geral' })).toHaveAttribute(
      'href',
      '/projects/8'
    );
    expect(screen.queryByText('Projeto administrativo')).not.toBeInTheDocument();
  });
});
