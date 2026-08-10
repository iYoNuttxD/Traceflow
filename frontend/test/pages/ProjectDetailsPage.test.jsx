import { MemoryRouter, Route, Routes } from 'react-router';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../src/shared/index.js';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), put: vi.fn() },
  syncProjectGithub: vi.fn(),
  getProjectGithubSyncStatus: vi.fn(),
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
  syncProjectGithub: mocks.syncProjectGithub,
  getProjectGithubSyncStatus: mocks.getProjectGithubSyncStatus
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
  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

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
    mocks.getProjectGithubSyncStatus.mockResolvedValue({ run: null });
  });

  it('exibe loading, sincroniza uma vez e apresenta o summary atual', async () => {
    vi.useFakeTimers();
    mocks.syncProjectGithub.mockResolvedValue({
      message: 'Sincronização GitHub iniciada.',
      run: {
        id: 10,
        status: 'QUEUED',
        step: 'QUEUED',
        progress: { branchCount: 0, processedBranches: 0 }
      }
    });
    mocks.getProjectGithubSyncStatus.mockResolvedValueOnce({ run: null }).mockResolvedValue({
      run: {
        id: 10,
        status: 'SUCCEEDED',
        step: 'COMPLETED',
        progress: { branchCount: 4, processedBranches: 4 },
        error: null,
        summary: {
          branches: { found: 4, active: 4 },
          commits: { found: 2, created: 1 },
          pullRequests: { found: 1, created: 0, updated: 1 },
          issues: { found: 1, created: 1, updated: 0 }
        }
      }
    });
    mocks.api.get.mockResolvedValueOnce({ data: { project } }).mockResolvedValue({
      data: {
        project: {
          ...project,
          githubSyncStatus: 'SINCRONIZADO',
          githubLastSyncAt: '2026-01-02T00:00:00Z'
        }
      }
    });
    renderPage();
    expect(screen.getByText('Carregando projeto...')).toBeInTheDocument();
    await act(async () => {});
    const button = screen.getByRole('button', { name: 'Sincronizar' });
    fireEvent.click(button);
    await act(async () => {});
    expect(screen.getByRole('status')).toHaveTextContent('Sincronizando GitHub...');
    await act(async () => vi.advanceTimersByTimeAsync(2500));
    expect(screen.getByText(/Sincronização GitHub concluída com sucesso/)).toHaveTextContent(
      'Branches: 4 encontradas, 4 ativas. Commits: 2 encontrados, 1 novos.'
    );
    expect(mocks.syncProjectGithub).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('continua sincronizando por 30 segundos sem depender do timeout HTTP inicial', async () => {
    vi.useFakeTimers();
    const running = {
      id: 11,
      status: 'RUNNING',
      step: 'COMMITS',
      currentBranch: 'feature/longa',
      progress: { branchCount: 25, processedBranches: 7 }
    };
    mocks.syncProjectGithub.mockResolvedValue({ run: { ...running, status: 'QUEUED' } });
    mocks.getProjectGithubSyncStatus
      .mockResolvedValueOnce({ run: null })
      .mockImplementation(async () => ({
        run: { ...running, progress: { ...running.progress } }
      }));
    const succeeded = {
      run: {
        ...running,
        status: 'SUCCEEDED',
        step: 'COMPLETED',
        currentBranch: null,
        progress: { branchCount: 25, processedBranches: 25 },
        commits: { found: 2, created: 1 },
        summary: {
          branches: { found: 25, active: 25 },
          commits: { found: 100, created: 0 },
          pullRequests: { found: 10, created: 0, updated: 10 },
          issues: { found: 2, created: 0, updated: 2 }
        }
      }
    };
    renderPage();
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Sincronizar' }));
    await act(async () => {});
    for (let index = 0; index < 12; index += 1) {
      await act(async () => vi.advanceTimersByTimeAsync(2500));
    }
    expect(screen.getByRole('status')).toHaveTextContent('Sincronizando GitHub...');
    expect(screen.getByRole('status')).toHaveTextContent('Branches: 7/25');
    expect(screen.queryByText(/Não foi possível sincronizar com o GitHub/)).not.toBeInTheDocument();
    mocks.getProjectGithubSyncStatus.mockResolvedValue(succeeded);
    await act(async () => vi.advanceTimersByTimeAsync(2500));
    expect(screen.getByText(/Sincronização GitHub concluída/)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('restaura uma execução ativa após reload e continua o polling', async () => {
    vi.useFakeTimers();
    const activeRun = {
      id: 12,
      status: 'RUNNING',
      step: 'COMMITS',
      currentBranch: 'develop',
      progress: { branchCount: 8, processedBranches: 3 }
    };
    mocks.getProjectGithubSyncStatus.mockResolvedValueOnce({ run: activeRun }).mockResolvedValue({
      run: {
        ...activeRun,
        status: 'SUCCEEDED',
        step: 'COMPLETED',
        currentBranch: null,
        progress: { branchCount: 8, processedBranches: 8 },
        summary: {
          branches: { found: 8, active: 8 },
          commits: { found: 20, created: 0 },
          pullRequests: { found: 2, created: 0, updated: 2 },
          issues: { found: 0, created: 0, updated: 0 }
        }
      }
    });

    renderPage();
    await act(async () => {});
    expect(screen.getByRole('status')).toHaveTextContent('Branches: 3/8');
    expect(screen.getByRole('status')).toHaveTextContent('Branch: develop');
    expect(mocks.syncProjectGithub).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(2500));
    expect(screen.getByText(/Sincronização GitHub concluída com sucesso/)).toHaveTextContent(
      'Branches: 8 encontradas, 8 ativas.'
    );
    vi.useRealTimers();
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
