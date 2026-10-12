import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  listAllGithubRepositories: vi.fn(),
  listGithubInstallations: vi.fn()
}));
const github = vi.hoisted(() => ({
  connectProject: vi.fn(),
  syncProject: vi.fn(),
  syncStatus: vi.fn(),
  updateSyncSettings: vi.fn()
}));
vi.mock('../../src/features/projects/api/projects.api.js', () => ({ projectsApi: api }));
vi.mock('../../src/features/github/api/github.api.js', () => ({ githubApi: github }));

import { ProjectGitHubIntegration } from '../../src/features/projects/components/ProjectGitHubIntegration.jsx';

function httpError(status, message) {
  return { response: { status, data: { message } } };
}

const repository = {
  githubRepositoryId: '501',
  githubInstallationId: '77',
  owner: 'team',
  name: 'repo',
  fullName: 'team/repo',
  url: 'https://github.com/team/repo',
  defaultBranch: 'main',
  selectable: true
};
const integration = {
  status: 'ACTIVE',
  repositoryFullName: 'team/repo',
  repositoryUrl: repository.url,
  defaultBranch: 'main',
  lastSyncStatus: 'PENDENTE',
  lastSyncAt: null,
  autoSyncEnabled: false
};
const local = { id: 7, name: 'Projeto local', githubIntegration: null };
let persisted;
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function view(project = local, role = 'OWNER') {
  return (
    <MemoryRouter initialEntries={[`/projects/${project.id}/edit#github-integration`]}>
      <ProjectGitHubIntegration key={project.id} project={project} role={role} />
    </MemoryRouter>
  );
}
async function selectRepository(user) {
  await user.click(screen.getByRole('button', { name: 'Conectar repositório' }));
  await screen.findByRole('option', { name: /team\/repo/ });
  await user.selectOptions(screen.getByLabelText('Repositório GitHub *'), 'team/repo');
}
beforeEach(() => {
  vi.resetAllMocks();
  persisted = { ...local, githubIntegration: { ...integration } };
  api.get.mockImplementation(async () => ({ data: { project: persisted } }));
  api.listGithubInstallations.mockResolvedValue({
    data: { installations: [{ githubInstallationId: '77', accountLogin: 'team' }] }
  });
  api.listAllGithubRepositories.mockResolvedValue({ data: { repositories: [repository] } });
  github.syncStatus.mockResolvedValue({
    run: null,
    automation: { status: 'AVAILABLE', nextSyncAt: null }
  });
  github.connectProject.mockResolvedValue({
    project: persisted,
    initialSync: { status: 'QUEUED', run: { status: 'QUEUED' } }
  });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('configuração GitHub do projeto', () => {
  it('abre somente sob demanda; navegação contextual, cancelamento e Escape devolvem foco', async () => {
    const user = userEvent.setup();
    render(view());
    expect(screen.getByText('Não conectado')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Integração GitHub' })).toHaveFocus();
    expect(api.listAllGithubRepositories).not.toHaveBeenCalled();
    await selectRepository(user);
    expect(screen.getByText('Repositório selecionado:')).toHaveTextContent('team/repo');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conectar repositório' })).toHaveFocus();
    await selectRepository(user);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(github.connectProject).not.toHaveBeenCalled();
  });

  it.each(['MANAGER', 'MEMBER', 'VIEWER'])(
    '%s lê sem vincular ou configurar preferência',
    async (role) => {
      const rendered = render(view(local, role));
      expect(screen.getByText('Não conectado')).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Conectar repositório' })
      ).not.toBeInTheDocument();
      rendered.rerender(view({ ...persisted, id: 8 }, role));
      expect(screen.getByRole('link', { name: 'team/repo' })).toBeVisible();
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
      expect(Boolean(screen.queryByRole('button', { name: 'Sincronizar agora' }))).toBe(
        role === 'MANAGER'
      );
    }
  );

  it('confirma vínculo uma única vez com IDs canônicos e fecha a seleção', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    github.connectProject.mockReturnValue(pending.promise);
    render(view());
    await selectRepository(user);
    const submit = screen.getByRole('button', { name: 'Vincular repositório' });
    await user.dblClick(submit);
    expect(github.connectProject).toHaveBeenCalledTimes(1);
    expect(github.connectProject).toHaveBeenCalledWith(7, {
      githubInstallationId: '77',
      githubRepositoryId: '501'
    });
    await act(async () => pending.resolve({ project: persisted, initialSync: { run: null } }));
    expect(await screen.findByText('Repositório vinculado com sucesso.')).toBeVisible();
    expect(screen.getByText('Conectado')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Conectar repositório' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Integração GitHub' })).toHaveFocus();
    expect(screen.getByText('main')).toBeVisible();
    expect(screen.queryByText('501')).not.toBeInTheDocument();
  });

  it.each([403, 404, 409, 503])(
    'vínculo rejeitado %s preserva estado sem sucesso falso',
    async (status) => {
      const user = userEvent.setup();
      github.connectProject.mockRejectedValue(
        httpError(
          status,
          status === 409
            ? 'Este repositório já está vinculado a outro projeto.'
            : 'Não foi possível vincular o repositório.'
        )
      );
      render(view());
      await selectRepository(user);
      await user.click(screen.getByRole('button', { name: 'Vincular repositório' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        status === 503 ? /temporariamente indisponível/ : /repositório/
      );
      expect(screen.getByText('Não conectado')).toBeVisible();
      expect(screen.queryByText('Repositório vinculado com sucesso.')).not.toBeInTheDocument();
      expect(api.get).not.toHaveBeenCalled();
    }
  );

  it('confirmação + GET falho mantém vínculo e retry repete somente a leitura', async () => {
    const user = userEvent.setup();
    api.get.mockRejectedValueOnce(new Error('offline'));
    render(view());
    await selectRepository(user);
    await user.click(screen.getByRole('button', { name: 'Vincular repositório' }));
    expect(await screen.findByText(/A última ação confirmada foi preservada/)).toBeVisible();
    expect(screen.getByText('Repositório vinculado com sucesso.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'team/repo' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Tentar atualizar dados' }));
    await waitFor(() =>
      expect(screen.queryByText(/A última ação confirmada/)).not.toBeInTheDocument()
    );
    expect(github.connectProject).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it.each(['sem instalação', 'sem repositórios', 'erro externo'])(
    'trata descoberta: %s',
    async (scenario) => {
      if (scenario === 'sem instalação')
        api.listGithubInstallations.mockResolvedValue({ data: { installations: [] } });
      if (scenario !== 'erro externo')
        api.listAllGithubRepositories.mockResolvedValue({ data: { repositories: [] } });
      else api.listAllGithubRepositories.mockRejectedValue(httpError(503, 'GitHub indisponível.'));
      const user = userEvent.setup();
      render(view());
      await user.click(screen.getByRole('button', { name: 'Conectar repositório' }));
      await waitFor(() =>
        expect(screen.getByLabelText('Repositório GitHub *')).not.toHaveTextContent(
          'Carregando repositórios...'
        )
      );
      expect(screen.getByRole('button', { name: 'Vincular repositório' })).toBeDisabled();
      expect(screen.getByRole('link', { name: 'Gerenciar acesso ao GitHub' })).toHaveAttribute(
        'href',
        '/settings/integrations'
      );
      expect(github.connectProject).not.toHaveBeenCalled();
    }
  );

  it('filtra instalação e busca no mesmo seletor, limpa seleção e bloqueia reserva', async () => {
    api.listGithubInstallations.mockResolvedValue({
      data: {
        installations: [
          { githubInstallationId: '77', accountLogin: 'team' },
          { githubInstallationId: '88', accountLogin: 'other' }
        ]
      }
    });
    api.listAllGithubRepositories.mockResolvedValue({
      data: {
        repositories: [
          repository,
          {
            ...repository,
            githubRepositoryId: '502',
            githubInstallationId: '88',
            fullName: 'other/private',
            selectable: false,
            alreadyConnected: true
          }
        ]
      }
    });
    const user = userEvent.setup();
    render(view());
    await selectRepository(user);
    await user.selectOptions(screen.getByLabelText('Conta GitHub'), '88');
    expect(screen.getByLabelText('Repositório GitHub *')).toHaveValue('');
    expect(screen.queryByRole('option', { name: /team\/repo/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /other\/private/ })).toBeDisabled();
    await user.type(screen.getByRole('searchbox', { name: 'Buscar repositório' }), 'missing');
    expect(screen.getByText('Nenhum repositório corresponde à busca.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Vincular repositório' })).toBeDisabled();
  });

  it.each(['ACTIVE', 'RECONNECT_REQUIRED', 'DISCONNECTED'])(
    'apresenta integração %s sem expor troca/desvínculo',
    async (status) => {
      render(
        view({
          ...persisted,
          githubIntegration: { ...integration, status, lastSyncAt: '2026-10-09T12:00:00Z' }
        })
      );
      expect(screen.getByRole('link', { name: 'team/repo' })).toBeVisible();
      expect(screen.getByText(/09\/10\/2026/)).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Conectar repositório' })
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Trocar|Desvincular/ })).not.toBeInTheDocument();
      expect(Boolean(screen.queryByRole('button', { name: 'Sincronizar agora' }))).toBe(
        status === 'ACTIVE'
      );
      if (status === 'RECONNECT_REQUIRED')
        expect(screen.getByRole('button', { name: 'Reconectar repositório' })).toBeVisible();
      await waitFor(() => expect(github.syncStatus).toHaveBeenCalled());
    }
  );

  it('falha de sync inicial conserva conexão e permite retry real', async () => {
    const user = userEvent.setup();
    github.connectProject.mockResolvedValue({
      project: persisted,
      initialSync: { status: 'FAILED', run: null }
    });
    github.syncProject.mockResolvedValue({ run: { status: 'SUCCEEDED' } });
    render(view());
    await selectRepository(user);
    await user.click(screen.getByRole('button', { name: 'Vincular repositório' }));
    expect(await screen.findByText('Conectado')).toBeVisible();
    expect(screen.getByText('Falha na última sincronização')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Tentar sincronizar novamente' }));
    expect(await screen.findByText('Sincronização GitHub concluída com sucesso.')).toBeVisible();
    expect(github.syncProject).toHaveBeenCalledWith(7);
    expect(screen.getByRole('link', { name: 'team/repo' })).toBeVisible();
  });

  it('rejeição da solicitação de sync mantém integração e retry', async () => {
    const user = userEvent.setup();
    github.syncProject.mockRejectedValue(httpError(403, 'Acesso ao GitHub indisponível.'));
    render(view(persisted));
    await user.click(screen.getByRole('button', { name: 'Sincronizar agora' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Acesso ao GitHub indisponível.');
    expect(screen.getByText('Conectado')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sincronizar agora' })).toBeEnabled();
  });

  it('respeita o Retry-After do cooldown da instalação sem repetir automaticamente a sincronização', async () => {
    vi.useFakeTimers();
    github.syncProject.mockRejectedValue({
      response: {
        status: 429,
        headers: { 'retry-after': '120' },
        data: { message: 'Aguarde o limite do GitHub.' }
      }
    });
    render(view(persisted));
    await act(async () => {});
    const button = screen.getByRole('button', { name: 'Sincronizar agora' });
    await act(async () => fireEvent.click(button));
    expect(button).toBeDisabled();
    for (let second = 0; second < 61; second++)
      await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(button).toBeDisabled();
    expect(github.syncProject).toHaveBeenCalledTimes(1);
    for (let second = 0; second < 59; second++)
      await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(button).toBeEnabled();
    expect(github.syncProject).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])(
    'confirma preferência persistida %s sem estado otimista falso',
    async (enabled) => {
      const user = userEvent.setup();
      const pending = deferred();
      github.updateSyncSettings.mockReturnValue(pending.promise);
      const project = {
        ...persisted,
        githubIntegration: { ...integration, autoSyncEnabled: !enabled }
      };
      render(view(project));
      const checkbox = screen.getByRole('switch', { name: 'Sincronização automática' });
      await user.click(checkbox);
      expect(checkbox.checked).toBe(!enabled);
      expect(checkbox).toBeDisabled();
      persisted = { ...persisted, githubIntegration: { ...integration, autoSyncEnabled: enabled } };
      await act(async () => pending.resolve({ project: persisted }));
      expect(checkbox.checked).toBe(enabled);
      expect(github.updateSyncSettings).toHaveBeenCalledWith(7, enabled);
      expect(screen.getByText('Preferência de sincronização automática salva.')).toBeVisible();
    }
  );

  it('rejeição da preferência conserva valor confirmado e não anuncia sucesso', async () => {
    const user = userEvent.setup();
    github.updateSyncSettings.mockRejectedValue(httpError(403, 'Sem permissão.'));
    render(view(persisted));
    await user.click(screen.getByRole('switch', { name: 'Sincronização automática' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão.');
    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(
      screen.queryByText('Preferência de sincronização automática salva.')
    ).not.toBeInTheDocument();
  });

  it.each(['connect', 'settings', 'refresh', 'status'])(
    'resposta tardia %s de A não aparece em B',
    async (operation) => {
      const user = userEvent.setup();
      const pending = deferred();
      const rendered = render(
        view(operation === 'connect' || operation === 'refresh' ? local : persisted)
      );
      if (operation === 'connect' || operation === 'refresh') {
        if (operation === 'connect') github.connectProject.mockReturnValue(pending.promise);
        else api.get.mockReturnValue(pending.promise);
        await selectRepository(user);
        await user.click(screen.getByRole('button', { name: 'Vincular repositório' }));
      } else if (operation === 'settings') {
        github.updateSyncSettings.mockReturnValue(pending.promise);
        await user.click(screen.getByRole('switch'));
      } else {
        github.syncStatus.mockReturnValue(pending.promise);
        // A new mutation starts a fresh probe after invalidating the initial read.
        github.updateSyncSettings.mockResolvedValue({ project: persisted });
        await user.click(screen.getByRole('switch'));
      }
      rendered.rerender(view({ ...local, id: 8, name: 'Projeto B' }));
      await act(async () =>
        pending.resolve({
          project: persisted,
          data: { project: persisted },
          run: { status: 'RUNNING' }
        })
      );
      expect(screen.getByText('Não conectado')).toBeVisible();
      expect(screen.queryByRole('link', { name: 'team/repo' })).not.toBeInTheDocument();
      expect(screen.queryByText('Repositório vinculado com sucesso.')).not.toBeInTheDocument();
    }
  );

  it('mutation de preferência invalida GET anterior ao vínculo confirmado', async () => {
    const user = userEvent.setup();
    const stale = deferred();
    const fresh = deferred();
    api.get.mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise);
    render(view());
    await selectRepository(user);
    await user.click(screen.getByRole('button', { name: 'Vincular repositório' }));
    await screen.findByText('Conectado');
    persisted = { ...persisted, githubIntegration: { ...integration, autoSyncEnabled: true } };
    github.updateSyncSettings.mockResolvedValue({ project: persisted });
    await user.click(screen.getByRole('switch'));
    await act(async () => stale.resolve({ data: { project: local } }));
    expect(screen.getByText('Conectado')).toBeVisible();
    expect(screen.getByRole('switch')).toBeChecked();
    await act(async () => fresh.resolve({ data: { project: persisted } }));
    expect(screen.getByRole('switch')).toBeChecked();
  });

  it('request de sync não significa conclusão; polling mostra falha e depois sucesso', async () => {
    vi.useFakeTimers();
    render(view(persisted));
    await act(async () => {});
    const queued = { status: 'QUEUED' };
    github.syncProject.mockResolvedValue({ run: queued });
    github.syncStatus.mockResolvedValue({ run: queued });
    fireEvent.click(screen.getByRole('button', { name: 'Sincronizar agora' }));
    await act(async () => {});
    expect(screen.getByText('Sincronização pendente')).toBeVisible();
    expect(
      screen.queryByText('Sincronização GitHub concluída com sucesso.')
    ).not.toBeInTheDocument();
    github.syncStatus.mockResolvedValue({ run: { status: 'FAILED' } });
    await act(async () => vi.advanceTimersByTimeAsync(2500));
    expect(screen.getByText('Falha na última sincronização')).toBeVisible();
    expect(screen.getByText('Conectado')).toBeVisible();
    github.syncStatus.mockResolvedValue({
      run: { status: 'RUNNING', progress: { processedBranches: 1, branchCount: 2 } }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tentar sincronizar novamente' }));
    await act(async () => {});
    expect(screen.getByText('Branches: 1/2')).toBeVisible();
    github.syncStatus.mockResolvedValue({ run: { status: 'SUCCEEDED' } });
    await act(async () => vi.advanceTimersByTimeAsync(2500));
    expect(screen.getByText('Sincronização GitHub concluída com sucesso.')).toBeVisible();
    expect(github.syncProject).toHaveBeenCalledTimes(2);
  });

  it('falha do polling oferece consulta explícita sem fingir falha de sync', async () => {
    const user = userEvent.setup();
    github.syncStatus.mockRejectedValueOnce(httpError(503, 'Consulta indisponível.'));
    render(view(persisted));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'O serviço está temporariamente indisponível.'
    );
    await user.click(screen.getByRole('button', { name: 'Consultar sincronização novamente' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(github.syncProject).not.toHaveBeenCalled();
    expect(
      within(screen.getByRole('region', { name: 'Integração GitHub' })).getByText('Conectado')
    ).toBeVisible();
  });
  it('detecta execução automática iniciada em outra instância e acompanha as mesmas etapas', async () => {
    vi.useFakeTimers();
    render(view(persisted));
    await act(async () => {});
    const automatic = {
      id: 91,
      origin: 'AUTOMATIC',
      status: 'RUNNING',
      step: 'BRANCHES',
      startedAt: '2026-10-11T12:00:00Z',
      progress: { branchCount: 2, processedBranches: 0 }
    };
    github.syncStatus.mockResolvedValue({ run: automatic });
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    expect(screen.getByText('Sincronizando automaticamente')).toBeVisible();
    expect(screen.getByText('Etapa atual: branches')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sincronizando...' })).toBeDisabled();
    expect(github.syncProject).not.toHaveBeenCalled();
    github.syncStatus.mockResolvedValue({
      run: { ...automatic, step: 'ISSUES', progress: { branchCount: 2, processedBranches: 2 } }
    });
    await act(async () => vi.advanceTimersByTimeAsync(2500));
    expect(screen.getByText('Etapa atual: issues')).toBeVisible();
    persisted.githubIntegration = {
      ...integration,
      autoSyncEnabled: true,
      lastSyncStatus: 'SINCRONIZADO',
      lastSyncAt: '2026-10-11T12:01:00Z',
      nextSyncAt: '2026-10-11T12:35:00Z'
    };
    github.syncStatus.mockResolvedValue({
      run: { ...automatic, status: 'SUCCEEDED', step: 'COMPLETED' }
    });
    await act(async () => vi.advanceTimersByTimeAsync(2500));
    expect(screen.getByRole('button', { name: 'Sincronizar agora' })).toBeEnabled();
    expect(screen.getByText('Próxima sincronização').nextElementSibling).not.toHaveTextContent(
      'Agendamento indisponível'
    );
    expect(screen.queryByText('Sincronizando automaticamente')).not.toBeInTheDocument();
  });

  it('refresh durante execução automática restaura bloqueio e permite desligar somente execuções futuras', async () => {
    vi.useFakeTimers();
    persisted.githubIntegration.autoSyncEnabled = true;
    github.syncStatus.mockResolvedValue({
      run: { id: 92, origin: 'AUTOMATIC', status: 'RUNNING', step: 'COMMITS' }
    });
    github.updateSyncSettings.mockImplementation(async () => {
      persisted.githubIntegration.autoSyncEnabled = false;
      return { project: persisted };
    });
    render(view(persisted));
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Sincronizando...' })).toBeDisabled();
    fireEvent.click(screen.getByRole('switch'));
    await act(async () => {});
    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(screen.getByText(/A execução atual continuará/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sincronizando...' })).toBeDisabled();
    expect(github.syncProject).not.toHaveBeenCalled();
  });

  it('reconcilia também uma execução curta concluída entre duas consultas ociosas', async () => {
    vi.useFakeTimers();
    render(view(persisted));
    await act(async () => {});
    github.syncStatus.mockResolvedValue({
      run: { id: 93, origin: 'AUTOMATIC', status: 'FAILED', step: 'ISSUES' }
    });
    persisted.githubIntegration = {
      ...integration,
      autoSyncEnabled: true,
      lastSyncStatus: 'FALHA',
      nextSyncAt: '2026-10-11T14:00:00Z'
    };
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    expect(screen.getByText('Falha na última sincronização')).toBeVisible();
    expect(screen.getByText('Conectado')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tentar sincronizar novamente' })).toBeEnabled();
    expect(screen.getByText('Próxima sincronização')).toBeVisible();
  });

  it('pausa consultas em aba oculta e reconcilia ao retornar', async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    render(view(persisted));
    await act(async () => {});
    const calls = github.syncStatus.mock.calls.length;
    visibility.mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(github.syncStatus).toHaveBeenCalledTimes(calls);
    visibility.mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    await act(async () => {});
    expect(github.syncStatus).toHaveBeenCalledTimes(calls + 1);
    visibility.mockRestore();
  });

  it('apresenta agenda indisponível sem calcular horário no cliente', async () => {
    persisted.githubIntegration.autoSyncEnabled = true;
    render(view(persisted));
    expect(await screen.findByText('Agendamento indisponível')).toBeVisible();
    expect(
      screen.queryByText(/execução automática ainda não está disponível/)
    ).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Automação' })).toBeVisible();
  });
  it('não promete um horário sem worker e reconcilia disponibilidade e nova agenda pelo polling', async () => {
    vi.useFakeTimers();
    persisted.githubIntegration.autoSyncEnabled = true;
    persisted.githubIntegration.nextSyncAt = '2026-10-11T04:49:01.815Z';
    github.syncStatus.mockResolvedValue({
      run: null,
      automation: {
        status: 'UNAVAILABLE',
        reason: 'WORKER_NOT_OBSERVED',
        nextSyncAt: persisted.githubIntegration.nextSyncAt
      }
    });
    render(view(persisted));
    await act(async () => {});
    expect(screen.getByText('Aguardando serviço de sincronização')).toBeVisible();
    expect(screen.getByText(/Serviço de sincronização automática indisponível/)).toBeVisible();
    expect(screen.getByRole('switch', { name: 'Sincronização automática' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Sincronizar agora' })).toBeEnabled();
    github.syncStatus.mockResolvedValue({
      run: null,
      automation: { status: 'AVAILABLE', nextSyncAt: '2026-10-11T05:10:00Z' }
    });
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    expect(
      screen.queryByText(/Serviço de sincronização automática indisponível/)
    ).not.toBeInTheDocument();
    expect(screen.getByText('Próxima sincronização').nextElementSibling).toHaveTextContent(
      new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
        new Date('2026-10-11T05:10:00Z')
      )
    );
    github.syncStatus.mockResolvedValue({
      run: null,
      automation: { status: 'UNAVAILABLE', nextSyncAt: '2026-10-11T05:10:00Z' }
    });
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    expect(screen.getByText('Aguardando serviço de sincronização')).toBeVisible();
  });
  it('não mantém sucesso de uma execução anterior durante nova automática ou falha', async () => {
    vi.useFakeTimers();
    github.syncStatus.mockResolvedValue({ run: { id: 100, status: 'SUCCEEDED' } });
    render(view(persisted));
    await act(async () => {});
    expect(screen.getByText('Sincronização GitHub concluída com sucesso.')).toBeVisible();
    github.syncStatus.mockResolvedValue({
      run: { id: 101, origin: 'AUTOMATIC', status: 'RUNNING', step: 'COMMITS' }
    });
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    expect(
      screen.queryByText('Sincronização GitHub concluída com sucesso.')
    ).not.toBeInTheDocument();
    github.syncStatus.mockResolvedValue({
      run: { id: 101, origin: 'AUTOMATIC', status: 'FAILED' }
    });
    await act(async () => vi.advanceTimersByTimeAsync(2500));
    expect(screen.getByText('Falha na última sincronização')).toBeVisible();
    expect(
      screen.queryByText('Sincronização GitHub concluída com sucesso.')
    ).not.toBeInTheDocument();
  });
});
