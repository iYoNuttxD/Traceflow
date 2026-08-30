import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn()
}));
const invitationsMock = vi.hoisted(() => ({
  list: vi.fn(),
  accept: vi.fn(),
  decline: vi.fn()
}));

vi.mock('../../src/features/projects/api/projects.api.js', () => ({
  projectsApi: {
    list: () => apiMock.get('/projects'),
    listGithubInstallations: () => apiMock.get('/github/app/installations'),
    listGithubRepositories: (installationId, projectId) =>
      apiMock.get(`/github/app/installations/${installationId}/repositories`, {
        params: projectId ? { projectId } : undefined
      }),
    listAllGithubRepositories: (projectId) =>
      apiMock.get('/github/app/repositories', {
        params: projectId ? { projectId } : undefined
      }),
    startGithubInstallation: (data) => apiMock.post('/github/app/installations/start', data),
    connectGithubRepository: (projectId, data) =>
      apiMock.put(`/projects/${projectId}/github/integration`, data),
    create: (data) => apiMock.post('/projects', data),
    createFromGithub: (data) => apiMock.post('/projects/from-github', data)
  }
}));
vi.mock('../../src/features/invitations/personal-invitations.api.js', () => ({
  personalInvitationsApi: invitationsMock
}));

import { ProjectsCatalogProvider } from '../../src/features/projects/index.js';
import { ProjectsPage } from '../../src/pages/ProjectsPage.jsx';

const fakeRepository = {
  githubRepositoryId: '501',
  githubInstallationId: '77',
  accountLogin: 'usuario-artificial',
  name: 'repositorio-artificial',
  owner: 'usuario-artificial',
  fullName: 'usuario-artificial/repositorio-artificial',
  url: 'https://github.com/usuario-artificial/repositorio-artificial',
  defaultBranch: 'main',
  private: false,
  description: 'Repositório artificial'
};

function renderPage(initialEntries = ['/projects']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ProjectsCatalogProvider>
        <ProjectsPage />
      </ProjectsCatalogProvider>
    </MemoryRouter>
  );
}

function mockInitialRequests({
  projects = [],
  repositories = [fakeRepository],
  installations = [
    {
      githubInstallationId: '77',
      accountLogin: 'usuario-artificial',
      accountType: 'User'
    }
  ]
} = {}) {
  apiMock.get.mockImplementation((url) => {
    if (url === '/projects') {
      return Promise.resolve({ data: { projects } });
    }

    if (url === '/github/app/installations') {
      return Promise.resolve({
        data: {
          installations
        }
      });
    }

    if (url === '/github/app/repositories') {
      return Promise.resolve({ data: { repositories } });
    }

    return Promise.reject(new Error(`URL inesperada: ${url}`));
  });
}

async function openCreateFlow(user) {
  await user.click(screen.getByRole('button', { name: /^Novo projeto/ }));
  const dialog = screen.getByRole('dialog', { name: 'Novo projeto' });
  await user.click(within(dialog).getByRole('button', { name: /Criar projeto/ }));
  return screen.getByRole('dialog', { name: 'Criar projeto' });
}

describe('ProjectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invitationsMock.list.mockResolvedValue([]);
  });

  it('mostra loading e depois o estado vazio', async () => {
    const user = userEvent.setup();
    mockInitialRequests({ projects: [] });
    renderPage();

    expect(screen.getByText('Carregando projetos...')).toBeInTheDocument();
    expect(await screen.findByText('Nenhum projeto cadastrado ainda.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Projetos' })).toBeInTheDocument();
    expect(screen.getByText('Gerencie e acompanhe seus projetos.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Código ou link de acesso')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nome do projeto *')).not.toBeInTheDocument();
    expect(apiMock.get.mock.calls.filter(([url]) => url === '/projects')).toHaveLength(1);

    const newProject = screen.getByRole('button', { name: /^Novo projeto/ });
    expect(newProject).toHaveAttribute('aria-haspopup', 'dialog');
    await user.click(newProject);
    const chooser = screen.getByRole('dialog', { name: 'Novo projeto' });
    expect(within(chooser).getByRole('button', { name: /Criar projeto/ })).toBeInTheDocument();
    await user.click(within(chooser).getByRole('button', { name: /Entrar com código/ }));
    expect(screen.getByLabelText('Código ou link de acesso')).toBeInTheDocument();
    expect(
      screen.getByText('Use o código ou link compartilhado pelo proprietário do projeto.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Cole um código ou link de acesso compartilhado.')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Voltar às opções')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Voltar às opções' }));
    expect(screen.getByRole('dialog', { name: 'Novo projeto' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(newProject).toHaveFocus();
  });

  it('retorna do fluxo de criação ao chooser e mantém o fechamento explícito', async () => {
    const user = userEvent.setup();
    mockInitialRequests({ projects: [] });
    renderPage();
    await screen.findByText('Nenhum projeto cadastrado ainda.');
    const trigger = screen.getByRole('button', { name: /^Novo projeto/ });
    await openCreateFlow(user);

    expect(screen.queryByText('Voltar às opções')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Voltar às opções' }));
    const chooser = screen.getByRole('dialog', { name: 'Novo projeto' });
    await user.click(within(chooser).getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('transfere o foco entre chooser e criação sem alterar a restauração do Close', async () => {
    const user = userEvent.setup();
    mockInitialRequests({ projects: [] });
    renderPage();
    await screen.findByText('Nenhum projeto cadastrado ainda.');
    const trigger = screen.getByRole('button', { name: /^Novo projeto/ });

    await user.click(trigger);
    let dialog = screen.getByRole('dialog', { name: 'Novo projeto' });
    await user.click(within(dialog).getByRole('button', { name: /Criar projeto/ }));
    dialog = screen.getByRole('dialog', { name: 'Criar projeto' });
    expect(screen.getByLabelText('Nome do projeto *')).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);

    const submit = within(dialog).getByRole('button', { name: 'Cadastrar projeto' });
    submit.focus();
    await user.tab();
    const back = within(dialog).getByRole('button', { name: 'Voltar às opções' });
    expect(back).toHaveFocus();
    await user.click(back);

    dialog = screen.getByRole('dialog', { name: 'Novo projeto' });
    const createChoice = within(dialog).getByRole('button', { name: /Criar projeto/ });
    expect(createChoice).toHaveFocus();
    await user.click(createChoice);
    expect(screen.getByLabelText('Nome do projeto *')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('transfere o foco entre chooser e entrada por código e preserva Escape', async () => {
    const user = userEvent.setup();
    mockInitialRequests({ projects: [] });
    renderPage();
    await screen.findByText('Nenhum projeto cadastrado ainda.');
    const trigger = screen.getByRole('button', { name: /^Novo projeto/ });

    await user.click(trigger);
    let dialog = screen.getByRole('dialog', { name: 'Novo projeto' });
    await user.click(within(dialog).getByRole('button', { name: /Entrar com código/ }));
    dialog = screen.getByRole('dialog', { name: 'Entrar com código' });
    expect(screen.getByLabelText('Código ou link de acesso')).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);

    const continueButton = within(dialog).getByRole('button', { name: 'Continuar' });
    continueButton.focus();
    await user.tab();
    const back = within(dialog).getByRole('button', { name: 'Voltar às opções' });
    expect(back).toHaveFocus();
    await user.click(back);

    dialog = screen.getByRole('dialog', { name: 'Novo projeto' });
    const joinChoice = within(dialog).getByRole('button', { name: /Entrar com código/ });
    expect(joinChoice).toHaveFocus();
    await user.click(joinChoice);
    expect(screen.getByLabelText('Código ou link de acesso')).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('lista convites pessoais, aceita e oferece abertura do projeto', async () => {
    const user = userEvent.setup();
    invitationsMock.list.mockResolvedValue([
      {
        id: 21,
        project: { id: 9, name: 'Projeto convidado' },
        role: 'VIEWER',
        expiresAt: '2030-08-20T12:00:00.000Z'
      }
    ]);
    invitationsMock.accept.mockResolvedValue({ membership: { projectId: 9, role: 'VIEWER' } });
    mockInitialRequests({ projects: [] });
    renderPage();

    expect(await screen.findByText('Projeto convidado')).toBeInTheDocument();
    expect(screen.getByText(/Papel:/)).toHaveTextContent('Visualizador');
    await user.click(screen.getByRole('button', { name: 'Aceitar' }));
    expect(invitationsMock.accept).toHaveBeenCalledWith(21);
    expect(
      await screen.findByText('Você agora participa do projeto “Projeto convidado”.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir projeto' })).toHaveAttribute(
      'href',
      '/projects/9'
    );
  });

  it('recusa convite pessoal e o remove da lista pendente', async () => {
    const user = userEvent.setup();
    invitationsMock.list.mockResolvedValue([
      {
        id: 22,
        project: { id: 10, name: 'Projeto recusado' },
        role: 'MEMBER',
        expiresAt: '2030-08-20T12:00:00.000Z'
      }
    ]);
    invitationsMock.decline.mockResolvedValue({});
    mockInitialRequests({ projects: [] });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Recusar' }));
    expect(invitationsMock.decline).toHaveBeenCalledWith(22);
    expect(await screen.findByText('Convite recusado.')).toBeInTheDocument();
    expect(screen.queryByText('Projeto recusado')).not.toBeInTheDocument();
  });

  it('renderiza project card como link único sem botão redundante', async () => {
    mockInitialRequests({
      projects: [
        {
          id: 1,
          name: 'Projeto artificial',
          description: 'Descrição artificial',
          responsibleTeam: 'Equipe artificial',
          githubIntegration: {
            repositoryFullName: 'usuario-artificial/repositorio-artificial',
            status: 'ACTIVE'
          },
          status: 'ATIVO'
        }
      ]
    });
    renderPage();

    const projectLink = await screen.findByRole('link', {
      name: 'Abrir projeto Projeto artificial'
    });
    expect(projectLink).toHaveAttribute('href', '/projects/1');
    expect(projectLink).toHaveTextContent('Equipe artificial');
    expect(projectLink).toHaveTextContent('usuario-artificial/repositorio-artificial');
    expect(projectLink).toHaveTextContent('Ativo');
    expect(screen.queryByText(/Ver detalhes/)).not.toBeInTheDocument();
  });

  it('mostra o erro atual quando projetos não carregam', async () => {
    apiMock.get.mockRejectedValue({
      response: { data: { message: 'Falha artificial da API' } }
    });
    renderPage();

    expect(await screen.findByText('Falha artificial da API')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('submete o formulário pelo endpoint especializado e recarrega a lista', async () => {
    const user = userEvent.setup();
    mockInitialRequests({ projects: [] });
    apiMock.post.mockResolvedValue({ data: { message: 'Projeto cadastrado com sucesso.' } });
    renderPage();
    await screen.findByText('Nenhum projeto cadastrado ainda.');
    await openCreateFlow(user);

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

  it('impede duas criações concorrentes antes da atualização visual do botão', async () => {
    let resolveCreate;
    mockInitialRequests({ projects: [] });
    apiMock.post.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Nenhum projeto cadastrado ainda.');
    await openCreateFlow(user);
    await user.type(screen.getByLabelText('Nome do projeto *'), 'Projeto único');
    await user.type(screen.getByLabelText('Área ou equipe responsável *'), 'Equipe única');
    await user.selectOptions(
      screen.getByLabelText('Repositório GitHub *'),
      fakeRepository.fullName
    );
    const form = screen.getByRole('button', { name: 'Cadastrar projeto' }).closest('form');

    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(apiMock.post).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Salvando...' })).toBeDisabled();
    await act(async () => resolveCreate({ data: { message: 'Projeto cadastrado com sucesso.' } }));
  });

  it('lista repositórios agregados e explica o projeto já vinculado sem ocultá-lo', async () => {
    const repositories = [
      { ...fakeRepository, selectable: true, alreadyConnected: false },
      {
        ...fakeRepository,
        githubRepositoryId: '502',
        name: 'ocupado',
        fullName: 'usuario-artificial/ocupado',
        url: 'https://github.com/usuario-artificial/ocupado',
        defaultBranch: 'develop',
        selectable: true,
        alreadyConnected: true,
        connectedProject: { id: 12, name: 'Projeto existente' },
        githubInstallationId: '77'
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
      },
      {
        ...fakeRepository,
        githubRepositoryId: '504',
        name: 'ocupado-sem-acesso',
        fullName: 'usuario-artificial/ocupado-sem-acesso',
        url: 'https://github.com/usuario-artificial/ocupado-sem-acesso',
        selectable: true,
        alreadyConnected: true,
        connectedProject: null
      }
    ];
    mockInitialRequests({ repositories });
    renderPage();
    await openCreateFlow(userEvent.setup());

    const select = await screen.findByLabelText('Repositório GitHub *');
    await waitFor(() => expect(select.querySelectorAll('option')).toHaveLength(5));
    const options = [...select.querySelectorAll('option')];
    expect(options.find((option) => option.value.endsWith('/ocupado'))).toBeEnabled();
    expect(options.find((option) => option.value.endsWith('/disponivel'))).toBeEnabled();
    expect(options.find((option) => option.value.endsWith('/ocupado')).textContent).toMatch(
      /branch develop.*vinculado a Projeto existente/
    );
    await userEvent.setup().selectOptions(select, 'usuario-artificial/ocupado');
    const duplicateCallout = screen.getByText(/já está vinculado ao projeto/).closest('aside');
    expect(duplicateCallout).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver projeto' })).toHaveAttribute(
      'href',
      '/projects/12'
    );
    await userEvent.setup().click(within(duplicateCallout).getByRole('button', { name: 'Fechar' }));
    await userEvent.setup().selectOptions(select, 'usuario-artificial/ocupado-sem-acesso');
    expect(
      screen.getByText('Este repositório já está vinculado a outro projeto.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver projeto' })).not.toBeInTheDocument();
    expect(screen.getByText(/GitHub App conectada/)).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Gerenciar acesso no GitHub' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/GitHub App conectada/).closest('.project-form__repository-field')
    ).toBeInTheDocument();
  });

  it('explica quando a GitHub App não possui repositórios concedidos', async () => {
    const user = userEvent.setup();
    mockInitialRequests({ repositories: [] });
    renderPage();
    await openCreateFlow(user);
    expect(
      await screen.findByText(
        'A GitHub App não possui repositórios concedidos. Gerencie o acesso da instalação no GitHub.'
      )
    ).toBeInTheDocument();
  });

  it('não exige renovação OAuth pessoal quando a GitHub App está conectada', async () => {
    const user = userEvent.setup();
    mockInitialRequests();
    renderPage();
    await openCreateFlow(user);

    expect(
      await screen.findByRole('option', { name: /usuario-artificial\/repositorio-artificial/ })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Repositório GitHub *')).toBeEnabled();
    expect(screen.queryByText(/autorização GitHub precisa ser renovada/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Renovar acesso GitHub/i })
    ).not.toBeInTheDocument();
  });

  it('mantém o formulário e mostra erro da Installation durante a criação', async () => {
    const user = userEvent.setup();
    mockInitialRequests();
    apiMock.post.mockRejectedValue({
      response: {
        status: 409,
        data: {
          code: 'CONFLICT',
          message: 'O repositório não está mais disponível para esta instalação.'
        }
      }
    });
    renderPage();
    await openCreateFlow(user);

    await user.type(screen.getByLabelText('Nome do projeto *'), 'Projeto com acesso alterado');
    await user.type(screen.getByLabelText('Área ou equipe responsável *'), 'Equipe artificial');
    await user.selectOptions(
      screen.getByLabelText('Repositório GitHub *'),
      fakeRepository.fullName
    );
    await user.click(screen.getByRole('button', { name: 'Cadastrar projeto' }));

    expect(
      await screen.findByText('O repositório não está mais disponível para esta instalação.')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Repositório GitHub *')).toBeEnabled();
    expect(screen.getByLabelText('Nome do projeto *')).toHaveValue('Projeto com acesso alterado');
  });

  it('mostra erro da Installation durante a reconexão sem oferecer OAuth pessoal', async () => {
    const user = userEvent.setup();
    mockInitialRequests();
    apiMock.put.mockRejectedValue({
      response: {
        status: 409,
        data: {
          code: 'CONFLICT',
          message: 'A GitHub App não pode mais acessar este repositório.'
        }
      }
    });
    renderPage(['/projects?projectId=12']);

    await user.selectOptions(
      await screen.findByLabelText('Repositório GitHub *'),
      fakeRepository.fullName
    );
    await user.click(screen.getByRole('button', { name: 'Concluir reconexão' }));

    await waitFor(() => {
      expect(apiMock.put).toHaveBeenCalledWith('/projects/12/github/integration', {
        githubInstallationId: '77',
        githubRepositoryId: fakeRepository.githubRepositoryId
      });
    });
    expect(
      await screen.findByText('A GitHub App não pode mais acessar este repositório.')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Renovar acesso GitHub/i })
    ).not.toBeInTheDocument();
  });

  it('distingue quando nenhuma instalação foi registrada', async () => {
    const user = userEvent.setup();
    mockInitialRequests({ installations: [], repositories: [] });
    renderPage();
    await openCreateFlow(user);

    const connectLinks = await screen.findAllByRole('link', { name: /Conectar GitHub App/ });
    expect(connectLinks).toHaveLength(2);
    expect(screen.getByLabelText('Repositório GitHub *')).toBeDisabled();
    for (const link of connectLinks) {
      expect(link).toHaveAttribute('href', '/settings/integrations');
    }
    expect(
      screen.queryByRole('button', { name: /Instalar|autorizar|atualizar acesso/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Gerenciar acesso no GitHub' })
    ).not.toBeInTheDocument();
  });

  it('atualiza instalações e informa sucesso após retorno do callback', async () => {
    const user = userEvent.setup();
    mockInitialRequests();
    renderPage(['/projects?github=connected&installationId=77']);

    expect(
      await screen.findByText('GitHub App vinculada ao TraceFlow. Os acessos foram atualizados.')
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        apiMock.get.mock.calls.filter(([url]) => url === '/github/app/installations').length
      ).toBeGreaterThanOrEqual(2);
    });
    await openCreateFlow(user);
    expect(screen.getByText('GitHub App conectada · usuario-artificial')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Adicionar ou atualizar acesso' })
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole('option', { name: /usuario-artificial\/repositorio-artificial/ })
    ).toBeInTheDocument();
  });

  it('mostra mensagem sanitizada quando o callback falha', async () => {
    mockInitialRequests({ installations: [], repositories: [] });
    renderPage(['/projects?github=error&reason=github_callback_failed']);

    expect(
      await screen.findByText(
        'Não foi possível concluir a autorização da GitHub App. Inicie o fluxo novamente.'
      )
    ).toBeInTheDocument();
  });
});
