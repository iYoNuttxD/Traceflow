import { MemoryRouter } from 'react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn()
}));

vi.mock('../../src/features/projects/api/projects.api.js', () => ({
  projectsApi: {
    list: () => apiMock.get('/projects'),
    listGithubInstallations: () => apiMock.get('/github/app/installations'),
    listGithubRepositories: (installationId, projectId) =>
      apiMock.get(`/github/app/installations/${installationId}/repositories`, {
        params: projectId ? { projectId } : undefined
      }),
    startGithubInstallation: (data) => apiMock.post('/github/app/installations/start', data),
    connectGithubRepository: (projectId, data) =>
      apiMock.put(`/projects/${projectId}/github/integration`, data),
    create: (data) => apiMock.post('/projects', data),
    createFromGithub: (data) => apiMock.post('/projects/from-github', data)
  }
}));

import { ProjectsPage } from '../../src/pages/ProjectsPage.jsx';

const fakeRepository = {
  githubRepositoryId: '501',
  name: 'repositorio-artificial',
  owner: 'usuario-artificial',
  fullName: 'usuario-artificial/repositorio-artificial',
  url: 'https://github.com/usuario-artificial/repositorio-artificial',
  defaultBranch: 'main',
  private: false,
  description: 'Repositório artificial'
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ProjectsPage />
    </MemoryRouter>
  );
}

function mockInitialRequests({ projects = [], repositories = [fakeRepository] } = {}) {
  apiMock.get.mockImplementation((url) => {
    if (url === '/projects') {
      return Promise.resolve({ data: { projects } });
    }

    if (url === '/github/app/installations') {
      return Promise.resolve({
        data: {
          installations: [
            {
              githubInstallationId: '77',
              accountLogin: 'usuario-artificial',
              accountType: 'User'
            }
          ]
        }
      });
    }

    if (url === '/github/app/installations/77/repositories') {
      return Promise.resolve({ data: { repositories } });
    }

    return Promise.reject(new Error(`URL inesperada: ${url}`));
  });
}

describe('ProjectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra loading e depois o estado vazio', async () => {
    mockInitialRequests({ projects: [] });
    renderPage();

    expect(screen.getByText('Carregando projetos...')).toBeInTheDocument();
    expect(await screen.findByText('Nenhum projeto cadastrado ainda.')).toBeInTheDocument();
  });

  it('renderiza a lista no formato atual', async () => {
    mockInitialRequests({
      projects: [
        {
          id: 1,
          name: 'Projeto artificial',
          description: 'Descrição artificial',
          responsibleTeam: 'Equipe artificial',
          githubOwner: 'usuario-artificial',
          githubRepo: 'repositorio-artificial',
          status: 'ATIVO'
        }
      ]
    });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Projeto artificial' })).toBeInTheDocument();
    expect(screen.getByText('Equipe: Equipe artificial')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver detalhes e editar' })).toHaveAttribute(
      'href',
      '/projects/1'
    );
  });

  it('mostra o erro atual quando projetos não carregam', async () => {
    apiMock.get.mockRejectedValue({
      response: { data: { message: 'Falha artificial da API' } }
    });
    renderPage();

    expect(await screen.findByText('Falha artificial da API')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Instalar ou autorizar GitHub App' })
    ).toBeInTheDocument();
  });

  it('submete o formulário pelo endpoint especializado e recarrega a lista', async () => {
    const user = userEvent.setup();
    mockInitialRequests({ projects: [] });
    apiMock.post.mockResolvedValue({ data: { message: 'Projeto cadastrado com sucesso.' } });
    renderPage();
    await screen.findByText('Nenhum projeto cadastrado ainda.');

    await user.type(screen.getByLabelText('Nome do projeto *'), 'Projeto submetido');
    await user.type(screen.getByLabelText('Área ou equipe responsável *'), 'Equipe submetida');
    await user.selectOptions(
      screen.getByLabelText('Repositório GitHub *'),
      fakeRepository.fullName
    );
    await user.click(screen.getByRole('button', { name: 'Cadastrar projeto' }));

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith(
        '/projects/from-github',
        expect.objectContaining({
          name: 'Projeto submetido',
          responsibleTeam: 'Equipe submetida',
          githubInstallationId: '77',
          githubRepositoryId: fakeRepository.githubRepositoryId
        })
      );
    });
    expect(await screen.findByText('Projeto cadastrado com sucesso.')).toBeInTheDocument();
  });

  it('lista todos os repositórios e desabilita somente o já utilizado', async () => {
    const repositories = [
      { ...fakeRepository, selectable: true, alreadyConnected: false },
      {
        ...fakeRepository,
        githubRepositoryId: '502',
        name: 'ocupado',
        fullName: 'usuario-artificial/ocupado',
        url: 'https://github.com/usuario-artificial/ocupado',
        defaultBranch: 'develop',
        selectable: false,
        alreadyConnected: true
      },
      {
        ...fakeRepository,
        githubRepositoryId: '503',
        name: 'disponivel',
        fullName: 'usuario-artificial/disponivel',
        url: 'https://github.com/usuario-artificial/disponivel',
        defaultBranch: 'trunk',
        selectable: true,
        alreadyConnected: false
      }
    ];
    mockInitialRequests({ repositories });
    renderPage();

    const select = await screen.findByLabelText('Repositório GitHub *');
    await waitFor(() => expect(select.querySelectorAll('option')).toHaveLength(4));
    const options = [...select.querySelectorAll('option')];
    expect(options.find((option) => option.value.endsWith('/ocupado'))).toBeDisabled();
    expect(options.find((option) => option.value.endsWith('/disponivel'))).toBeEnabled();
    expect(options.find((option) => option.value.endsWith('/ocupado')).textContent).toMatch(
      /branch develop.*já utilizado/
    );
    expect(
      screen.getByRole('link', { name: 'Gerenciar acesso da instalação no GitHub' })
    ).toHaveAttribute('href', 'https://github.com/settings/installations/77');
  });

  it('mostra estado vazio quando a instalação não possui repositórios', async () => {
    mockInitialRequests({ repositories: [] });
    renderPage();
    expect(
      await screen.findByText(/Esta instalação não possui repositórios autorizados/)
    ).toBeInTheDocument();
  });
});
