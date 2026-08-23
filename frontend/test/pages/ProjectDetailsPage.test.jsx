import { MemoryRouter, Route, Routes } from 'react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../src/shared/index.js';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), put: vi.fn() },
  accessCodeApi: { get: vi.fn(), regenerate: vi.fn(), updateRole: vi.fn() },
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
    update: (id, data) => mocks.api.put(`/projects/${id}`, data),
    getAccessCode: (id) => mocks.accessCodeApi.get(id),
    regenerateAccessCode: (id) => mocks.accessCodeApi.regenerate(id),
    updateAccessCodeRole: (id, role) => mocks.accessCodeApi.updateRole(id, role)
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
  githubIntegration: {
    repositoryFullName: 'owner/repo',
    repositoryUrl: 'https://github.com/owner/repo',
    lastSyncStatus: null,
    lastSyncAt: null
  },
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
    mocks.accessCodeApi.get.mockResolvedValue({
      data: {
        accessCode: {
          accessCode: 'TRC-0123456789ABCDEF0123456789ABCDEF',
          role: 'MEMBER',
          inviteLink: 'http://frontend.test/join/TRC-0123456789ABCDEF0123456789ABCDEF'
        }
      }
    });
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

  it('consolida a visão geral em quatro cards e mantém datas como metadata secundária', async () => {
    renderPage();

    const overviewHeading = await screen.findByRole('heading', {
      name: 'Visão geral do projeto'
    });
    const overview = overviewHeading.closest('.card');
    await within(overview).findByRole('heading', { name: 'Acesso ao projeto' });
    expect(overview.querySelectorAll('.overview-summary-card')).toHaveLength(4);
    for (const heading of ['Projeto', 'GitHub', 'Equipe', 'Acesso ao projeto']) {
      expect(within(overview).getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    const projectCard = within(overview)
      .getByRole('heading', { name: 'Projeto' })
      .closest('.overview-project-card');
    expect(within(projectCard).getByText('Ativo')).toBeInTheDocument();
    expect(within(projectCard).getByText('Equipe')).toBeInTheDocument();
    const teamCard = within(overview)
      .getByRole('heading', { name: 'Equipe' })
      .closest('.overview-team-card');
    expect(teamCard).toHaveTextContent(/1\s*membro ativo/);
    expect(
      within(overview).getByRole('link', { name: 'Abrir repositório GitHub owner/repo' })
    ).toHaveAttribute('href', 'https://github.com/owner/repo');
    expect(within(overview).getByText(/Criado em .* · Atualizado em/)).toHaveClass(
      'overview-metadata'
    );
    for (const oldCard of [
      'Status do projeto',
      'Status GitHub',
      'Código de acesso',
      'Última sincronização bem-sucedida',
      'Última tentativa',
      'Criado em',
      'Atualizado em'
    ]) {
      expect(within(overview).queryByText(oldCard, { exact: true })).not.toBeInTheDocument();
    }
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
          githubIntegration: {
            ...project.githubIntegration,
            lastSyncStatus: 'SINCRONIZADO',
            lastSyncAt: '2026-01-02T00:00:00Z'
          }
        }
      }
    });
    renderPage();
    expect(screen.getByText('Carregando projeto...')).toBeInTheDocument();
    await act(async () => {});
    const button = screen.getByRole('button', { name: 'Sincronizar' });
    fireEvent.click(button);
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

  it('respeita Retry-After antes de permitir novo sync', async () => {
    const user = userEvent.setup();
    mocks.syncProjectGithub.mockRejectedValueOnce({
      response: {
        status: 429,
        data: { message: 'Muitas requisições.' },
        headers: { 'retry-after': '9' }
      }
    });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Sincronizar' }));

    expect(await screen.findByRole('button', { name: 'Sincronizar em 9s' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Tente novamente em 9s.');
  });

  it('não expõe erro técnico persistido pela integração', async () => {
    mocks.api.get.mockResolvedValueOnce({
      data: {
        project: {
          ...project,
          githubIntegration: {
            ...project.githubIntegration,
            lastSyncStatus: 'FALHA',
            lastSyncAt: '2026-01-02T10:00:00Z',
            lastSyncAttemptAt: '2026-01-02T11:00:00Z',
            lastSyncError: 'Prisma stack em /app/github-sync.js'
          }
        }
      }
    });
    renderPage();

    expect(
      await screen.findByText('A última sincronização não pôde ser concluída.')
    ).toBeInTheDocument();
    expect(screen.getByText('Sincronizado anteriormente')).toBeInTheDocument();
    expect(screen.getByText('Último sucesso')).toBeInTheDocument();
    expect(screen.getByText('Última tentativa falhou')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Prisma|\/app\/github-sync/);
  });

  it('apresenta o GitHub sem campos artificiais quando não existe integração', async () => {
    mocks.api.get.mockResolvedValueOnce({
      data: { project: { ...project, githubIntegration: null } }
    });
    renderPage();

    const githubCard = (await screen.findByRole('heading', { name: 'GitHub' })).closest(
      '.overview-github-card'
    );
    expect(within(githubCard).getByText('Não integrado')).toBeInTheDocument();
    expect(within(githubCard).getByText('Nenhum repositório conectado.')).toBeInTheDocument();
    expect(within(githubCard).queryByText('Repositório')).not.toBeInTheDocument();
    expect(within(githubCard).queryByText('Última sincronização')).not.toBeInTheDocument();
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
    expect(screen.queryByRole('heading', { name: 'Acesso ao projeto' })).not.toBeInTheDocument();
    expect(mocks.accessCodeApi.get).not.toHaveBeenCalled();
  });

  it('permite ao OWNER mostrar, ocultar, copiar, configurar e regenerar o código', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });
    mocks.accessCodeApi.updateRole.mockResolvedValue({
      data: {
        accessCode: {
          accessCode: 'TRC-0123456789ABCDEF0123456789ABCDEF',
          role: 'VIEWER',
          inviteLink: 'http://frontend.test/join/TRC-0123456789ABCDEF0123456789ABCDEF'
        }
      }
    });
    mocks.accessCodeApi.regenerate.mockResolvedValue({
      data: {
        accessCode: {
          accessCode: 'TRC-FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
          role: 'VIEWER',
          inviteLink: 'http://frontend.test/join/TRC-FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'
        }
      }
    });
    renderPage();

    const code = await screen.findByText('TRC-0123456789ABCDEF0123456789ABCDEF');
    expect(code.closest('.project-access-code-card')).toBeInTheDocument();
    expect(code.closest('.access-code-value-row')).toBeInTheDocument();
    const hideButton = screen.getByRole('button', { name: 'Ocultar código' });
    const regenerateButton = screen.getByRole('button', { name: 'Regenerar código' });
    const copyButton = screen.getByRole('button', { name: 'Copiar link' });
    for (const button of [hideButton, regenerateButton, copyButton]) {
      expect(button).toHaveClass('access-code-icon-button');
      expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }
    expect(screen.getByLabelText('Perfil de entrada').closest('label')).toHaveClass(
      'access-code-role'
    );
    await user.click(hideButton);
    expect(screen.queryByText('TRC-0123456789ABCDEF0123456789ABCDEF')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mostrar código' }));
    await user.selectOptions(screen.getByLabelText('Perfil de entrada'), 'VIEWER');
    expect(mocks.accessCodeApi.updateRole).toHaveBeenCalledWith(1, 'VIEWER');
    await user.click(copyButton);
    expect(writeText).toHaveBeenCalledWith(
      'http://frontend.test/join/TRC-0123456789ABCDEF0123456789ABCDEF'
    );
    await user.click(regenerateButton);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Regenerar' }));
    expect(mocks.accessCodeApi.regenerate).toHaveBeenCalledWith(1);
    expect(await screen.findByText('TRC-FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')).toBeInTheDocument();
  });

  it('não exibe ações do RF41 na visão geral do projeto', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Projeto E9' });
    expect(screen.queryByText('Analisar commits para sugestões')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Atualizar sugestões' })).not.toBeInTheDocument();
  });

  it('apresenta projeto não encontrado com retorno contextual', async () => {
    mocks.api.get.mockRejectedValueOnce({
      response: { status: 404, data: { code: 'PROJECT_NOT_FOUND' } }
    });
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Projeto não encontrado.' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar aos projetos' })).toHaveAttribute(
      'href',
      '/projects'
    );
  });

  it('apresenta erro fatal do projeto sem expor mensagem técnica', async () => {
    mocks.api.get.mockRejectedValueOnce({
      response: {
        status: 500,
        data: { message: 'Prisma connection failed', requestId: 'request-seguro-1' }
      }
    });
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'O TRACEFLOW encontrou um problema.' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(screen.getByText('Código de referência: request-seguro-1')).toBeInTheDocument();
    expect(screen.queryByText(/Prisma connection failed/)).not.toBeInTheDocument();
  });
});
