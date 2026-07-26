import { MemoryRouter, Route, Routes } from 'react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../src/shared/index.js';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), put: vi.fn() },
  syncProjectGithub: vi.fn(),
  membersApi: {
    list: vi.fn(),
    invitations: vi.fn(),
    leave: vi.fn(),
    invite: vi.fn(),
    updateRole: vi.fn(),
    deactivate: vi.fn(),
    reactivate: vi.fn(),
    transfer: vi.fn(),
    revokeInvitation: vi.fn()
  }
}));

vi.mock('../../src/features/projects/api/projects.api.js', () => ({
  projectsApi: {
    get: (id) => mocks.api.get(`/projects/${id}`),
    update: (id, data) => mocks.api.put(`/projects/${id}`, data)
  }
}));
vi.mock('../../src/features/github/api/github.api.js', () => ({
  syncProjectGithub: mocks.syncProjectGithub
}));
vi.mock('../../src/features/members/members.api.js', () => ({ membersApi: mocks.membersApi }));

import { ProjectDetailsPage } from '../../src/pages/ProjectDetailsPage.jsx';

const project = {
  id: 1,
  name: 'Projeto E9',
  description: 'Descrição',
  responsibleTeam: 'Equipe',
  status: 'ATIVO',
  githubRepositoryFullName: 'owner/repo',
  githubRepositoryUrl: 'https://github.com/owner/repo',
  githubSyncStatus: 'NUNCA_SINCRONIZADO',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z'
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/1']}>
      <Routes>
        <Route
          path="/projects/:id"
          element={
            <ConfirmProvider>
              <ProjectDetailsPage />
            </ConfirmProvider>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProjectDetailsPage E9', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.api.get.mockResolvedValue({ data: { project } });
    mocks.membersApi.list.mockResolvedValue({
      currentMembership: { id: 1, role: 'OWNER' },
      members: [
        {
          id: 1,
          role: 'OWNER',
          isActive: true,
          user: { name: 'Owner', email: 'owner@example.invalid' }
        }
      ]
    });
    mocks.membersApi.invitations.mockResolvedValue([]);
  });

  it('exibe loading, sincroniza uma vez e apresenta o summary atual', async () => {
    const user = userEvent.setup();
    mocks.syncProjectGithub.mockResolvedValue({
      message: 'Sincronização com GitHub concluída.',
      project: {
        ...project,
        githubSyncStatus: 'SINCRONIZADO',
        githubLastSyncAt: '2026-01-02T00:00:00Z'
      },
      summary: {
        commits: { found: 2, created: 1 },
        pullRequests: { found: 1, created: 0, updated: 1 },
        issues: { found: 1, created: 1, updated: 0 }
      }
    });
    renderPage();
    expect(screen.getByText('Carregando projeto...')).toBeInTheDocument();
    const button = await screen.findByRole('button', { name: 'Sincronizar' });
    await user.click(button);
    expect(await screen.findByText(/Sincronização GitHub concluída com sucesso/)).toHaveTextContent(
      'Commits: 2 encontrados, 1 novos.'
    );
    expect(mocks.syncProjectGithub).toHaveBeenCalledOnce();
  });

  it.each([
    [409, 'Sincronização do GitHub já está em andamento para este projeto.'],
    [429, 'Muitas requisições. Tente novamente mais tarde.'],
    [403, 'Você não possui permissão para esta operação.']
  ])('preserva mensagem segura para erro %s e mantém dados anteriores', async (status, message) => {
    const user = userEvent.setup();
    mocks.syncProjectGithub.mockRejectedValue({ response: { status, data: { message } } });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Sincronizar' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Projeto E9' })).toBeInTheDocument();
    await waitFor(() => expect(mocks.api.get).toHaveBeenCalledTimes(2));
  });

  it('oculta a ação de sync para MEMBER', async () => {
    mocks.membersApi.list.mockResolvedValue({
      currentMembership: { id: 2, role: 'MEMBER' },
      members: []
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Projeto E9' });
    expect(screen.queryByRole('button', { name: 'Sincronizar' })).not.toBeInTheDocument();
    expect(screen.queryByText('Analisar commits para sugestões')).not.toBeInTheDocument();
  });

  it('não exibe ações do RF41 na visão geral do projeto', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Projeto E9' });
    expect(screen.queryByText('Analisar commits para sugestões')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Atualizar sugestões' })).not.toBeInTheDocument();
  });
});
