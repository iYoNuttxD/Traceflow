import { MemoryRouter, Route, Routes } from 'react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('RepositoryInfoPage RF06', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProjectArtifacts.mockResolvedValue(artifactsResponse());
  });

  it('preserva loading, vazio e endpoint consolidado sem filtros', async () => {
    renderPage();
    expect(screen.getByText('Carregando artefatos do repositório...')).toBeInTheDocument();
    expect(
      await screen.findByText('Nenhum artefato GitHub foi importado para este projeto.')
    ).toBeInTheDocument();
    expect(getProjectArtifacts).toHaveBeenCalledWith('1', {}, { signal: expect.any(AbortSignal) });
    expect(getProjectArtifacts).toHaveBeenCalledTimes(1);
  });

  it('combina tipo e intervalo de datas no filtro existente', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Nenhum artefato GitHub foi importado para este projeto.');
    await user.selectOptions(screen.getByLabelText('Tipo de artefato'), 'pull_request');
    await user.type(screen.getByLabelText('Data inicial'), '2026-01-01');
    await user.type(screen.getByLabelText('Data final'), '2026-01-31');
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    expect(getProjectArtifacts).toHaveBeenLastCalledWith(
      '1',
      {
        type: 'pull_request',
        startDate: '2026-01-01',
        endDate: '2026-01-31'
      },
      { signal: expect.any(AbortSignal) }
    );
    expect(
      await screen.findByText('Nenhum artefato encontrado para os filtros selecionados.')
    ).toBeInTheDocument();
  });

  it('não envia filtros opcionais vazios e recarrega sem eles ao limpar', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Nenhum artefato GitHub foi importado para este projeto.');

    await user.selectOptions(screen.getByLabelText('Tipo de artefato'), 'commit');
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    expect(getProjectArtifacts).toHaveBeenLastCalledWith(
      '1',
      { type: 'commit' },
      { signal: expect.any(AbortSignal) }
    );

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(getProjectArtifacts).toHaveBeenLastCalledWith(
      '1',
      {},
      { signal: expect.any(AbortSignal) }
    );
  });

  it('bloqueia intervalo invertido antes do request', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Nenhum artefato GitHub foi importado para este projeto.');

    fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: '2026-02-01' } });
    fireEvent.change(screen.getByLabelText('Data final'), { target: { value: '2026-01-31' } });
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'A data inicial não pode ser posterior à data final.'
    );
    expect(getProjectArtifacts).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Nenhum artefato/)).not.toBeInTheDocument();
  });

  it('exibe erro com retry sem estado vazio nem navegação duplicada', async () => {
    const user = userEvent.setup();
    getProjectArtifacts
      .mockRejectedValueOnce({ response: { data: { message: 'Falha artificial.' } } })
      .mockResolvedValueOnce(artifactsResponse());

    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha artificial.');
    expect(screen.queryByText(/Nenhum artefato/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Voltar para o projeto' })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(
      await screen.findByText('Nenhum artefato GitHub foi importado para este projeto.')
    ).toBeInTheDocument();
  });

  it('cancela request obsoleto quando o filtro muda', async () => {
    const user = userEvent.setup();
    let pendingSignal;
    getProjectArtifacts
      .mockResolvedValueOnce(artifactsResponse())
      .mockImplementationOnce((_projectId, _params, options) => {
        pendingSignal = options.signal;
        return new Promise(() => {});
      });

    renderPage();
    await screen.findByText('Nenhum artefato GitHub foi importado para este projeto.');
    await user.selectOptions(screen.getByLabelText('Tipo de artefato'), 'commit');
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() => expect(pendingSignal).toBeInstanceOf(AbortSignal));

    fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: '2026-01-01' } });
    expect(pendingSignal.aborted).toBe(true);
  });

  it('renderiza resumo e artefatos retornados pelo RF06', async () => {
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
            metadata: { branch: 'main' }
          }
        ]
      })
    );

    renderPage();
    expect(await screen.findByText('feat: exemplo')).toBeInTheDocument();
    expect(screen.getByText('Autor minimizado')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('exibe branches, filtra commits e mostra fluxo completo de pull request', async () => {
    const user = userEvent.setup();
    getProjectArtifacts
      .mockResolvedValueOnce(
        artifactsResponse({
          repository: {
            defaultBranch: 'main',
            branches: [
              { name: 'main', isDefault: true },
              { name: 'feature/login', isDefault: false }
            ]
          }
        })
      )
      .mockResolvedValueOnce(
        artifactsResponse({
          repository: {
            defaultBranch: 'main',
            branches: [
              { name: 'main', isDefault: true },
              { name: 'feature/login', isDefault: false }
            ]
          },
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
    await screen.findByRole('option', { name: 'feature/login' });
    expect(screen.getByRole('option', { name: 'main — padrão' })).toBeInTheDocument();
    expect(screen.getByText('Branches')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Branches do repositório' })
    ).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Branch'), 'feature/login');
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));

    expect(getProjectArtifacts).toHaveBeenLastCalledWith(
      '1',
      { branch: 'feature/login' },
      { signal: expect.any(AbortSignal) }
    );
    expect(await screen.findByText('Branches: feature/login, main')).toBeInTheDocument();
    expect(screen.getByText(/feature\/login → main/)).toBeInTheDocument();
  });
});
