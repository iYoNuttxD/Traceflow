import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getProjectArtifacts = vi.hoisted(() => vi.fn());
vi.mock('../../src/features/github/api/github.api.js', () => ({ getProjectArtifacts }));

import { RepositoryInfoPage } from '../../src/pages/RepositoryInfoPage.jsx';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/1/repository']}>
      <Routes>
        <Route path="/projects/:projectId/repository" element={<RepositoryInfoPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function artifactsResponse(overrides = {}) {
  return {
    project: { id: 1, name: 'Projeto E9' },
    summary: {
      total: 0,
      commits: 0,
      pullRequests: 0,
      issues: 0,
      metadataCompletenessPercentage: 0
    },
    repository: { defaultBranch: 'main', branches: [] },
    artifacts: [],
    ...overrides
  };
}

async function expandFilters(user) {
  const toggle = await screen.findByRole('button', { name: /Filtrar artefatos/ });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await user.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  return screen.getByRole('region', { name: 'Filtrar artefatos' });
}

describe('RepositoryInfoPage RF06', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProjectArtifacts.mockResolvedValue(artifactsResponse());
  });

  it('renderiza header e surfaces C2 sem retorno legado, preservando loading e vazio real', async () => {
    renderPage();

    expect(screen.getByText('Carregando artefatos do repositório...')).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Nenhum artefato importado.' })
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Repositório', level: 1 })).toBeInTheDocument();
    expect(screen.queryByText('Voltar para o projeto')).toBeNull();
    expect(screen.getByRole('region', { name: 'Visão geral do repositório' })).toBeInTheDocument();
    expect(screen.getByText('Branch padrão: main')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Filtrar artefatos/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.getByRole('region', { name: 'Artefatos do repositório' })).toBeInTheDocument();
    expect(getProjectArtifacts).toHaveBeenCalledWith('1', {}, { signal: expect.any(AbortSignal) });
    expect(getProjectArtifacts).toHaveBeenCalledTimes(1);
  });

  it('aplica tipo e datas válidas automaticamente, sem ação de submit', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Nenhum artefato importado.' });
    const filters = await expandFilters(user);

    expect(within(filters).queryByRole('button', { name: 'Aplicar filtros' })).toBeNull();
    await user.selectOptions(within(filters).getByLabelText('Tipo de artefato'), 'pull_request');
    await waitFor(() =>
      expect(getProjectArtifacts).toHaveBeenLastCalledWith(
        '1',
        { type: 'pull_request' },
        { signal: expect.any(AbortSignal) }
      )
    );
    fireEvent.change(within(filters).getByLabelText('Data inicial'), {
      target: { value: '2026-01-01' }
    });
    fireEvent.change(within(filters).getByLabelText('Data final'), {
      target: { value: '2026-01-31' }
    });

    await waitFor(() =>
      expect(getProjectArtifacts).toHaveBeenLastCalledWith(
        '1',
        {
          type: 'pull_request',
          startDate: '2026-01-01',
          endDate: '2026-01-31'
        },
        { signal: expect.any(AbortSignal) }
      )
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Nenhum artefato encontrado para estes filtros.'
      })
    ).toBeInTheDocument();
    expect(screen.getByText('0 artefatos no conjunto filtrado')).toBeInTheDocument();
  });

  it('exibe Limpar somente para filtros confirmados e restaura o catálogo completo', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Nenhum artefato importado.' });
    const filters = await expandFilters(user);
    expect(within(filters).queryByRole('button', { name: 'Limpar filtros' })).toBeNull();

    await user.selectOptions(within(filters).getByLabelText('Tipo de artefato'), 'commit');
    await waitFor(() =>
      expect(getProjectArtifacts).toHaveBeenLastCalledWith(
        '1',
        { type: 'commit' },
        { signal: expect.any(AbortSignal) }
      )
    );
    const clearButton = await within(filters).findByRole('button', { name: 'Limpar filtros' });

    await user.click(clearButton);
    await waitFor(() =>
      expect(getProjectArtifacts).toHaveBeenLastCalledWith(
        '1',
        {},
        { signal: expect.any(AbortSignal) }
      )
    );
    await waitFor(() =>
      expect(within(filters).queryByRole('button', { name: 'Limpar filtros' })).toBeNull()
    );
  });

  it('bloqueia intervalo invertido antes do request', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Nenhum artefato importado.' });
    const filters = await expandFilters(user);

    fireEvent.change(within(filters).getByLabelText('Data inicial'), {
      target: { value: '2026-02-01' }
    });
    await waitFor(() => expect(getProjectArtifacts).toHaveBeenCalledTimes(2));
    const requestsBeforeInvalidInterval = getProjectArtifacts.mock.calls.length;
    fireEvent.change(within(filters).getByLabelText('Data final'), {
      target: { value: '2026-01-31' }
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A data inicial não pode ser posterior à data final.'
    );
    expect(getProjectArtifacts).toHaveBeenCalledTimes(requestsBeforeInvalidInterval);
    expect(screen.queryByRole('heading', { name: /Nenhum artefato/ })).toBeNull();
  });

  it('exibe erro com retry sem estado vazio nem navegação duplicada', async () => {
    const user = userEvent.setup();
    getProjectArtifacts
      .mockRejectedValueOnce({ response: { data: { message: 'Falha artificial.' } } })
      .mockResolvedValueOnce(artifactsResponse());

    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha artificial.');
    expect(screen.queryByRole('heading', { name: /Nenhum artefato/ })).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Voltar ao projeto' })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(
      await screen.findByRole('heading', { name: 'Nenhum artefato importado.' })
    ).toBeVisible();
  });

  it('cancela request obsoleto quando um filtro em edição muda', async () => {
    const user = userEvent.setup();
    let pendingSignal;
    getProjectArtifacts
      .mockResolvedValueOnce(artifactsResponse())
      .mockImplementationOnce((_projectId, _params, options) => {
        pendingSignal = options.signal;
        return new Promise(() => {});
      });

    renderPage();
    await screen.findByRole('heading', { name: 'Nenhum artefato importado.' });
    const filters = await expandFilters(user);
    await user.selectOptions(within(filters).getByLabelText('Tipo de artefato'), 'commit');
    await waitFor(() => expect(pendingSignal).toBeInstanceOf(AbortSignal));

    fireEvent.change(within(filters).getByLabelText('Data inicial'), {
      target: { value: '2026-01-01' }
    });
    await waitFor(() => expect(pendingSignal.aborted).toBe(true));
    expect(getProjectArtifacts).toHaveBeenLastCalledWith(
      '1',
      { type: 'commit', startDate: '2026-01-01' },
      { signal: expect.any(AbortSignal) }
    );
  });

  it('ignora uma resposta obsoleta que conclui depois do filtro mais recente', async () => {
    const user = userEvent.setup();
    let resolveCommit;
    let resolveIssue;
    getProjectArtifacts
      .mockResolvedValueOnce(artifactsResponse())
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveCommit = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveIssue = resolve;
          })
      );

    renderPage();
    await screen.findByRole('heading', { name: 'Nenhum artefato importado.' });
    const filters = await expandFilters(user);
    await user.selectOptions(within(filters).getByLabelText('Tipo de artefato'), 'commit');
    await waitFor(() => expect(resolveCommit).toBeTypeOf('function'));
    await user.selectOptions(within(filters).getByLabelText('Tipo de artefato'), 'issue');
    await waitFor(() => expect(resolveIssue).toBeTypeOf('function'));

    await act(async () => {
      resolveIssue(
        artifactsResponse({
          summary: { total: 1, commits: 0, pullRequests: 0, issues: 1 },
          artifacts: [
            {
              id: 2,
              type: 'issue',
              title: 'Resultado mais recente',
              date: '2026-01-02T00:00:00.000Z'
            }
          ]
        })
      );
    });
    expect(await screen.findByText('Resultado mais recente')).toBeInTheDocument();

    await act(async () => {
      resolveCommit(
        artifactsResponse({
          summary: { total: 1, commits: 1, pullRequests: 0, issues: 0 },
          artifacts: [
            {
              id: 1,
              type: 'commit',
              title: 'Resultado obsoleto',
              date: '2026-01-01T00:00:00.000Z'
            }
          ]
        })
      );
    });
    expect(screen.getByText('Resultado mais recente')).toBeInTheDocument();
    expect(screen.queryByText('Resultado obsoleto')).toBeNull();
  });

  it('renderiza summary, badge e ação GitHub canônica para os artefatos', async () => {
    getProjectArtifacts.mockResolvedValue(
      artifactsResponse({
        summary: {
          total: 1,
          commits: 1,
          pullRequests: 0,
          issues: 0,
          metadataCompletenessPercentage: 100
        },
        artifacts: [
          {
            id: 7,
            type: 'commit',
            title: 'feat: exemplo',
            author: 'Autor minimizado',
            date: '2026-01-01T00:00:00.000Z',
            githubUrl: 'https://github.com/example/repo/commit/abc',
            metadata: { branches: ['main'] }
          }
        ]
      })
    );

    renderPage();
    const title = await screen.findByText('feat: exemplo');
    const row = title.closest('tr');
    expect(row).not.toBeNull();
    expect(within(row).getByText('Commit')).toHaveClass('repository-badge-commit');
    expect(within(row).getByText('Autor minimizado')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    const link = within(row).getByRole('link', { name: 'Abrir no GitHub' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveClass('task-detail-external-link');
    expect(link.querySelector('[data-icon="externalLink"]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('preserva branches, filtro de commit e hierarquia técnica do pull request', async () => {
    const user = userEvent.setup();
    const branches = [
      { name: 'main', isDefault: true },
      { name: 'feature/login', isDefault: false }
    ];
    getProjectArtifacts
      .mockResolvedValueOnce(artifactsResponse({ repository: { defaultBranch: 'main', branches } }))
      .mockResolvedValueOnce(
        artifactsResponse({
          repository: { defaultBranch: 'main', branches },
          summary: {
            total: 2,
            commits: 1,
            pullRequests: 1,
            issues: 0,
            metadataCompletenessPercentage: 100
          },
          artifacts: [
            {
              id: 1,
              type: 'commit',
              title: 'feat: login',
              author: 'Pessoa',
              date: '2026-01-01T00:00:00.000Z',
              metadata: { branches: ['feature/login', 'main'] }
            },
            {
              id: 2,
              type: 'pull_request',
              title: 'Login',
              author: 'Pessoa',
              date: '2026-01-02T00:00:00.000Z',
              metadata: {
                number: 2,
                state: 'open',
                sourceBranch: 'feature/login',
                targetBranch: 'main'
              }
            }
          ]
        })
      );

    renderPage();
    await screen.findByText('Branch padrão: main');
    const filters = await expandFilters(user);
    expect(within(filters).getByRole('option', { name: 'main — padrão' })).toBeInTheDocument();
    expect(within(filters).getByRole('option', { name: 'feature/login' })).toBeInTheDocument();
    await user.selectOptions(within(filters).getByLabelText('Branch'), 'feature/login');

    await waitFor(() =>
      expect(getProjectArtifacts).toHaveBeenLastCalledWith(
        '1',
        { branch: 'feature/login' },
        { signal: expect.any(AbortSignal) }
      )
    );
    const commitRow = (await screen.findByText('feat: login')).closest('tr');
    expect(
      within(commitRow).getByText('feature/login, main').closest('.repository-artifact-status')
    ).toHaveAttribute('title', 'Branches: feature/login, main');
    const pullRequestRow = screen.getByText('Login').closest('tr');
    expect(within(pullRequestRow).getByText('#2 · open')).toBeInTheDocument();
    expect(within(pullRequestRow).getByText('feature/login → main')).toBeInTheDocument();
  });

  it('mantém o aviso contextual de que branch não se aplica a Issues', async () => {
    const user = userEvent.setup();
    const repository = {
      defaultBranch: 'main',
      branches: [{ name: 'main', isDefault: true }]
    };
    getProjectArtifacts.mockResolvedValue(artifactsResponse({ repository }));

    renderPage();
    await screen.findByText('Branch padrão: main');
    const filters = await expandFilters(user);
    await user.selectOptions(within(filters).getByLabelText('Tipo de artefato'), 'issue');
    await user.selectOptions(within(filters).getByLabelText('Branch'), 'main');

    expect(
      within(filters).getByText(
        'Issues pertencem ao repositório como um todo; o filtro de branch não se aplica a elas.'
      )
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(getProjectArtifacts).toHaveBeenLastCalledWith(
        '1',
        { type: 'issue', branch: 'main' },
        { signal: expect.any(AbortSignal) }
      )
    );
  });
});
