import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), put: vi.fn() },
  syncProjectGithub: vi.fn(),
  scanCommitSuggestions: vi.fn(),
  membersApi: {
    list: vi.fn(), invitations: vi.fn(), leave: vi.fn(), invite: vi.fn(),
    updateRole: vi.fn(), deactivate: vi.fn(), reactivate: vi.fn(), transfer: vi.fn(),
    revokeInvitation: vi.fn()
  }
}));

vi.mock('../../src/api/api.js', () => ({
  api: mocks.api,
  syncProjectGithub: mocks.syncProjectGithub,
  scanCommitSuggestions: mocks.scanCommitSuggestions
}));
vi.mock('../../src/features/members/members.api.js', () => ({ membersApi: mocks.membersApi }));

import { ProjectDetailsPage } from '../../src/pages/ProjectDetailsPage.jsx';

const project = {
  id: 1, name: 'Projeto E9', description: 'Descrição', responsibleTeam: 'Equipe',
  status: 'ATIVO', githubRepositoryFullName: 'owner/repo',
  githubRepositoryUrl: 'https://github.com/owner/repo', githubSyncStatus: 'NUNCA_SINCRONIZADO',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z'
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/1']}>
      <Routes><Route path="/projects/:id" element={<ProjectDetailsPage />} /></Routes>
    </MemoryRouter>
  );
}

describe('ProjectDetailsPage E9', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.api.get.mockResolvedValue({ data: { project } });
    mocks.membersApi.list.mockResolvedValue({
      currentMembership: { id: 1, role: 'OWNER' },
      members: [{ id: 1, role: 'OWNER', isActive: true, user: { name: 'Owner', email: 'owner@example.invalid' } }]
    });
    mocks.membersApi.invitations.mockResolvedValue([]);
    mocks.scanCommitSuggestions.mockResolvedValue({
      scannedCommits: 4,
      detectedReferences: 3,
      createdSuggestions: 2,
      skippedSuggestions: 1
    });
  });

  it('exibe loading, sincroniza uma vez e apresenta o summary atual', async () => {
    const user = userEvent.setup();
    mocks.syncProjectGithub.mockResolvedValue({
      message: 'Sincronização com GitHub concluída.',
      project: { ...project, githubSyncStatus: 'SINCRONIZADO', githubLastSyncAt: '2026-01-02T00:00:00Z' },
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
    expect(await screen.findByText(/Sincronização GitHub concluída com sucesso/)).toHaveTextContent('Commits: 2 encontrados, 1 novos.');
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
    mocks.membersApi.list.mockResolvedValue({ currentMembership: { id: 2, role: 'MEMBER' }, members: [] });
    renderPage();
    await screen.findByRole('heading', { name: 'Projeto E9' });
    expect(screen.queryByRole('button', { name: 'Sincronizar' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Analisar commits para sugestões' })).toBeInTheDocument();
  });

  it('analisa commits históricos no contexto do projeto e mostra apenas contagens', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Analisar commits para sugestões' }));
    expect(mocks.scanCommitSuggestions).toHaveBeenCalledWith('1');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Commits analisados: 4; referências detectadas: 3; sugestões criadas: 2; sugestões ignoradas: 1.'
    );
  });

  it('oculta o scan histórico para VIEWER', async () => {
    mocks.membersApi.list.mockResolvedValue({ currentMembership: { id: 3, role: 'VIEWER' }, members: [] });
    renderPage();
    await screen.findByRole('heading', { name: 'Projeto E9' });
    expect(screen.queryByRole('button', { name: 'Analisar commits para sugestões' })).not.toBeInTheDocument();
  });
});
