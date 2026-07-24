import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn()
}));

vi.mock('../../src/api/api.js', () => ({ api: apiMock }));

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

    if (url === '/github/repositories') {
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
    expect(screen.getByText('Não foi possível carregar os repositórios do GitHub.')).toBeInTheDocument();
  });

  it('submete o formulário com o contrato atual e recarrega a lista', async () => {
    const user = userEvent.setup();
    mockInitialRequests({ projects: [] });
    apiMock.post.mockResolvedValue({ data: { message: 'Projeto cadastrado com sucesso.' } });
    renderPage();
    await screen.findByText('Nenhum projeto cadastrado ainda.');

    await user.type(screen.getByLabelText('Nome do projeto *'), 'Projeto submetido');
    await user.type(
      screen.getByLabelText('Área ou equipe responsável *'),
      'Equipe submetida'
    );
    await user.selectOptions(
      screen.getByLabelText('Repositório GitHub *'),
      fakeRepository.fullName
    );
    await user.click(screen.getByRole('button', { name: 'Cadastrar projeto' }));

    await waitFor(() => {
      expect(apiMock.post).toHaveBeenCalledWith(
        '/projects',
        expect.objectContaining({
          name: 'Projeto submetido',
          responsibleTeam: 'Equipe submetida',
          githubOwner: fakeRepository.owner,
          githubRepo: fakeRepository.name,
          githubUrl: fakeRepository.url
        })
      );
    });
    expect(await screen.findByText('Projeto cadastrado com sucesso.')).toBeInTheDocument();
  });
});
