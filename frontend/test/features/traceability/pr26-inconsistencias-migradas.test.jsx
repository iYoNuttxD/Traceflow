import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const trace = vi.hoisted(() => ({
  getTraceabilityAlert: vi.fn(),
  getTraceabilityAlerts: vi.fn(),
  dismissTraceabilityAlert: vi.fn(),
  getTraceabilityAlertSummary: vi.fn(),
  reconcileTraceabilityAlerts: vi.fn()
}));
const tasks = vi.hoisted(() => ({ list: vi.fn(), linkPullRequest: vi.fn(), linkIssue: vi.fn() }));
const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  listMembers: vi.fn(),
  getProjectArtifacts: vi.fn()
}));

vi.mock('../../../src/features/traceability/api/traceability.api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  ...trace
}));
vi.mock('../../../src/features/tasks/api/tasks.api.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, tasksApi: { ...actual.tasksApi, ...tasks } };
});
vi.mock('../../../src/features/projects/api/projects.api.js', () => ({
  projectsApi: { get: mocks.getProject }
}));
vi.mock('../../../src/features/members/members.api.js', () => ({
  membersApi: { list: mocks.listMembers }
}));
vi.mock('../../../src/features/github/api/github.api.js', () => ({
  getProjectArtifacts: mocks.getProjectArtifacts
}));

const { RepositoryInfoScreen } =
  await import('../../../src/features/github/pages/RepositoryInfoScreen.jsx');
const { InconsistencySummary } =
  await import('../../../src/features/traceability/components/InconsistencySummary.jsx');
const { TaskInconsistencySection } =
  await import('../../../src/features/traceability/components/TaskInconsistencySection.jsx');
const { AlertDismissForm } =
  await import('../../../src/features/traceability/components/AlertDismissForm.jsx');
const { formatInstant, validateDismissReason } =
  await import('../../../src/features/traceability/model/alert-view.js');
const { ConfirmProvider } = await import('../../../src/shared/index.js');

const roles = {
  VIEWER: { canLink: false, canManage: false },
  MEMBER: { canLink: true, canManage: false },
  MANAGER: { canLink: true, canManage: true }
};
const MERGED = '2026-10-05T17:32:00.000Z';
const DETECTED = '2026-10-05T17:33:00.000Z';
const PR_URL = 'https://github.com/traceflow/repo/pull/45';

function prAlert(overrides = {}) {
  return {
    id: 12,
    type: 'PULL_REQUEST_MERGED_WITHOUT_TASK',
    status: 'OPEN',
    occurredAt: MERGED,
    detectedAt: DETECTED,
    resolvedAt: null,
    resolutionReason: null,
    dismissal: null,
    limitations: [],
    subject: {
      type: 'PULL_REQUEST',
      id: 70,
      code: 'PR #45',
      title: 'Ajusta CI',
      available: true,
      githubUrl: PR_URL
    },
    ...overrides
  };
}

function prDetail(alert = prAlert(), permissions = roles.MANAGER, context = {}) {
  return {
    alert: {
      ...alert,
      context: {
        number: 45,
        title: alert.subject.title,
        sourceBranch: 'ci',
        targetBranch: 'main',
        mergedAt: MERGED,
        githubUrl: alert.subject.githubUrl,
        ...context
      }
    },
    permissions
  };
}

const pullRequest = {
  id: 70,
  type: 'pull_request',
  title: 'Ajusta CI',
  author: 'carla',
  date: MERGED,
  githubUrl: PR_URL,
  metadata: { number: 45, state: 'merged', sourceBranch: 'ci', targetBranch: 'main' },
  inconsistency: {
    alertId: 12,
    status: 'OPEN',
    detectedAt: DETECTED,
    resolvedAt: null,
    dismissedAt: null
  }
};

function history(alerts = [], permissions = roles.MANAGER) {
  return {
    alerts,
    pagination: { page: 1, limit: 50, total: alerts.length, totalPages: 1 },
    permissions
  };
}

function renderRepository(entry = '/projects/9/repository') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ConfirmProvider>
        <Routes>
          <Route path="/projects/:projectId/repository" element={<RepositoryInfoScreen />} />
        </Routes>
      </ConfirmProvider>
    </MemoryRouter>
  );
}

async function openInconsistency(user) {
  const trigger = await screen.findByRole('button', { name: 'Ver inconsistência da PR #45' });
  await user.click(trigger);
  return {
    trigger,
    dialog: await screen.findByRole('dialog', { name: 'Inconsistência · PR #45' })
  };
}

const conflict = (code, message = 'Este alerta já foi resolvido.') => ({
  response: { status: 409, data: { code, message } }
});

beforeEach(() => {
  vi.clearAllMocks();
  delete window.__s201;
  mocks.getProject.mockResolvedValue({
    data: {
      project: {
        id: 9,
        name: 'TraceFlow',
        githubIntegration: { status: 'ACTIVE', lastSyncStatus: 'SUCESSO' }
      }
    }
  });
  mocks.listMembers.mockResolvedValue({ currentMembership: { role: 'MANAGER' }, members: [] });
  mocks.getProjectArtifacts.mockResolvedValue({
    summary: { total: 1, commits: 0, pullRequests: 1, issues: 0 },
    repository: { defaultBranch: 'main', branches: [] },
    artifacts: [pullRequest]
  });
  trace.getTraceabilityAlert.mockResolvedValue(prDetail());
  trace.getTraceabilityAlerts.mockResolvedValue(history([prAlert()]));
});

describe('PR #26 casos migrados da tela de alertas: detalhe e permissões (S2-01 F2, F6, F7, AT-U-04)', () => {
  it('F2 AT-U-04 o detalhe da PR mostra tipo, situação, branches, merge, detecção e o GitHub em nova aba', async () => {
    const user = userEvent.setup();
    trace.getTraceabilityAlert.mockResolvedValue(
      prDetail(prAlert(), roles.MANAGER, { sourceBranch: null })
    );
    renderRepository();

    const { dialog } = await openInconsistency(user);

    expect(await within(dialog).findByText('PR mesclada sem tarefa')).toBeInTheDocument();
    expect(within(dialog).getByText('Aberta')).toBeInTheDocument();
    expect(within(dialog).getByText('PR #45 · Ajusta CI')).toBeInTheDocument();
    expect(within(dialog).getByText('origem não informada → main')).toBeInTheDocument();
    expect(within(dialog).getByText(`Mesclada em ${formatInstant(MERGED)}`)).toBeInTheDocument();
    expect(within(dialog).getByText(`Detectada em ${formatInstant(DETECTED)}`)).toBeInTheDocument();
    const github = within(dialog).getByRole('link', { name: /Abrir no GitHub/ });
    expect(github).toHaveAttribute('href', PR_URL);
    expect(github).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('F6 VIEWER não vê vincular nem dispensar, e mantém o GitHub', async () => {
    const user = userEvent.setup();
    trace.getTraceabilityAlert.mockResolvedValue(prDetail(prAlert(), roles.VIEWER));
    renderRepository();

    const { dialog } = await openInconsistency(user);

    expect(await within(dialog).findByText('PR #45 · Ajusta CI')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Vincular a uma tarefa' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Dispensar' })).toBeNull();
    expect(within(dialog).getByRole('link', { name: /Abrir no GitHub/ })).toBeInTheDocument();
  });

  it('F7 MEMBER vincula mas não dispensa', async () => {
    const user = userEvent.setup();
    trace.getTraceabilityAlert.mockResolvedValue(prDetail(prAlert(), roles.MEMBER));
    renderRepository();

    const { dialog } = await openInconsistency(user);

    expect(
      await within(dialog).findByRole('button', { name: 'Vincular a uma tarefa' })
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Dispensar' })).toBeNull();
  });

  it('AT-U-04 issue de item excluído mostra o snapshot, avisa e não oferece vínculo nem histórico', async () => {
    trace.getTraceabilityAlert.mockResolvedValue({
      alert: {
        ...prAlert({
          id: 13,
          type: 'ISSUE_CLOSED_WITHOUT_TASK',
          status: 'RESOLVED',
          resolvedAt: '2026-10-06T10:00:00.000Z',
          resolutionReason: 'RULE_NO_LONGER_APPLIES',
          subject: {
            type: 'ISSUE',
            id: null,
            code: 'Issue #8',
            title: 'Snapshot da issue',
            available: false,
            githubUrl: null
          }
        }),
        context: null
      },
      permissions: roles.MANAGER
    });
    renderRepository('/projects/9/repository?alerta=13');

    const dialog = await screen.findByRole('dialog', { name: 'Inconsistência' });
    expect(await within(dialog).findByText('Snapshot da issue')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'O item desta inconsistência foi excluído. Os dados exibidos são os da detecção.'
      )
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Vincular a uma tarefa' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Dispensar' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /^Histórico/ })).toBeNull();
  });
});

describe('PR #26 casos migrados: dispensa e vínculo (S2-01 F8–F11, AT-U-05, AT-U-06)', () => {
  it('F8 MANAGER dispensa com justificativa validada, relê o alerta e a lista do Repositório', async () => {
    const user = userEvent.setup();
    trace.dismissTraceabilityAlert.mockResolvedValue({ alert: prAlert(), changed: true });
    renderRepository();
    const { dialog } = await openInconsistency(user);

    await user.click(await within(dialog).findByRole('button', { name: 'Dispensar' }));
    await user.type(within(dialog).getByLabelText('Justificativa'), 'curto');
    await user.click(within(dialog).getByRole('button', { name: 'Dispensar' }));
    expect(
      within(dialog).getByText('A justificativa deve ter entre 10 e 500 caracteres.')
    ).toBeInTheDocument();
    expect(trace.dismissTraceabilityAlert).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText('Justificativa'), ' demais: dependências.');
    await user.click(within(dialog).getByRole('button', { name: 'Dispensar' }));

    expect(await within(dialog).findByText('Inconsistência dispensada.')).toBeInTheDocument();
    expect(trace.dismissTraceabilityAlert).toHaveBeenCalledWith(
      '9',
      12,
      'curto demais: dependências.'
    );
    expect(trace.getTraceabilityAlert).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(mocks.getProjectArtifacts).toHaveBeenCalledTimes(2));
  });

  it('F9 dispensar inconsistência já resolvida explica e relê', async () => {
    const user = userEvent.setup();
    trace.dismissTraceabilityAlert.mockRejectedValue(conflict('TRACEABILITY_ALERT_NOT_OPEN'));
    renderRepository();
    const { dialog } = await openInconsistency(user);

    await user.click(await within(dialog).findByRole('button', { name: 'Dispensar' }));
    await user.type(within(dialog).getByLabelText('Justificativa'), 'Justificativa suficiente.');
    await user.click(within(dialog).getByRole('button', { name: 'Dispensar' }));

    expect(
      await within(dialog).findByText(
        'Esta inconsistência já foi resolvida. A lista foi atualizada.'
      )
    ).toBeInTheDocument();
    expect(trace.getTraceabilityAlert).toHaveBeenCalledTimes(2);
  });

  it('AT-U-06 dispensa recusada pelo servidor mostra a mensagem dele e mantém a inconsistência', async () => {
    const user = userEvent.setup();
    trace.dismissTraceabilityAlert.mockRejectedValue({
      response: { status: 403, data: { code: 'FORBIDDEN', message: 'Perfil sem permissão.' } }
    });
    renderRepository();
    const { dialog } = await openInconsistency(user);

    await user.click(await within(dialog).findByRole('button', { name: 'Dispensar' }));
    await user.type(within(dialog).getByLabelText('Justificativa'), 'Justificativa suficiente.');
    await user.click(within(dialog).getByRole('button', { name: 'Dispensar' }));

    expect(await within(dialog).findByText('Perfil sem permissão.')).toBeInTheDocument();
    expect(trace.getTraceabilityAlert).toHaveBeenCalledTimes(1);
  });

  it('F10 vincula a PR a uma tarefa sem PR e relê o alerta e a lista', async () => {
    const user = userEvent.setup();
    tasks.list.mockResolvedValue({
      data: { tasks: [{ id: 7, title: 'Login', pullRequest: null }] }
    });
    tasks.linkPullRequest.mockResolvedValue({});
    renderRepository();
    const { dialog } = await openInconsistency(user);

    await user.click(await within(dialog).findByRole('button', { name: 'Vincular a uma tarefa' }));
    await user.type(within(dialog).getByRole('combobox', { name: 'Tarefa' }), 'Log');
    await user.click(await screen.findByRole('option', { name: 'TASK-7 · Login' }));
    await user.click(within(dialog).getByRole('button', { name: 'Vincular à tarefa' }));

    expect(await within(dialog).findByText('Vínculo salvo em TASK-7.')).toBeInTheDocument();
    expect(tasks.linkPullRequest).toHaveBeenCalledWith(7, 70);
    expect(trace.getTraceabilityAlert).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(mocks.getProjectArtifacts).toHaveBeenCalledTimes(2));
  });

  it('F11 substituir a PR de uma tarefa exige confirmação e cancelar não grava', async () => {
    const user = userEvent.setup();
    tasks.list.mockResolvedValue({
      data: { tasks: [{ id: 12, title: 'Cadastro', pullRequest: { id: 8, number: 7 } }] }
    });
    renderRepository();
    const { dialog } = await openInconsistency(user);

    await user.click(await within(dialog).findByRole('button', { name: 'Vincular a uma tarefa' }));
    await user.type(within(dialog).getByRole('combobox', { name: 'Tarefa' }), 'Cad');
    await user.click(await screen.findByRole('option', { name: 'TASK-12 · Cadastro' }));
    await user.click(within(dialog).getByRole('button', { name: 'Vincular à tarefa' }));

    expect(
      await screen.findByText(
        'A tarefa TASK-12 já está vinculada à PR #7. Substituir? A PR #7 ficará sem tarefa e poderá gerar um novo alerta.'
      )
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(tasks.linkPullRequest).not.toHaveBeenCalled();
  });

  it('AT-U-05 vincular sem escolher tarefa pede a tarefa; falha do servidor aparece no formulário', async () => {
    const user = userEvent.setup();
    tasks.list.mockResolvedValue({
      data: { tasks: [{ id: 7, title: 'Login', pullRequest: null }] }
    });
    tasks.linkPullRequest.mockRejectedValue({
      response: { status: 409, data: { code: 'TASK_SPRINT_LOCKED', message: 'Tarefa congelada.' } }
    });
    renderRepository();
    const { dialog } = await openInconsistency(user);
    await user.click(await within(dialog).findByRole('button', { name: 'Vincular a uma tarefa' }));

    await user.click(within(dialog).getByRole('button', { name: 'Vincular à tarefa' }));
    expect(
      await within(dialog).findByText('Escolha a tarefa que deve receber o vínculo.')
    ).toBeInTheDocument();
    await user.type(within(dialog).getByRole('combobox', { name: 'Tarefa' }), 'Log');
    await user.click(await screen.findByRole('option', { name: 'TASK-7 · Login' }));
    await user.click(within(dialog).getByRole('button', { name: 'Vincular à tarefa' }));

    expect(await within(dialog).findByText('Tarefa congelada.')).toBeInTheDocument();
  });

  it('AT-U-05 o histórico mostra resolução e dispensa por conta removida como "pessoa removida"', async () => {
    const user = userEvent.setup();
    trace.getTraceabilityAlerts.mockResolvedValue(
      history([
        prAlert(),
        prAlert({
          id: 11,
          status: 'DISMISSED',
          detectedAt: '2026-10-01T10:00:00.000Z',
          dismissal: { at: '2026-10-02T10:00:00.000Z', reason: 'Sem código.', by: null }
        }),
        prAlert({
          id: 10,
          status: 'RESOLVED',
          detectedAt: '2026-09-20T10:00:00.000Z',
          resolvedAt: '2026-09-21T10:00:00.000Z',
          resolutionReason: 'PULL_REQUEST_LINKED'
        })
      ])
    );
    renderRepository();
    const { dialog } = await openInconsistency(user);

    const toggle = await within(dialog).findByRole('button', { name: 'Histórico (2)' });
    await waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);

    const items = within(dialog).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(
      `Dispensada por pessoa removida em ${formatInstant('2026-10-02T10:00:00.000Z')}`
    );
    expect(items[0]).toHaveTextContent('Justificativa: “Sem código.”');
    expect(items[1]).toHaveTextContent(
      `Resolvida em ${formatInstant('2026-09-21T10:00:00.000Z')} · PR vinculada a uma tarefa`
    );
    expect(trace.getTraceabilityAlerts).toHaveBeenCalledWith(
      '9',
      { status: 'ALL', pullRequestId: 70, limit: 50 },
      expect.objectContaining({ fresh: true })
    );
  });
});

describe('PR #26 casos migrados: conteúdo do GitHub e foco (S2-01 AT-U-09, F16)', () => {
  it('AT-U-09 título com HTML é texto e URL javascript: não vira link executável', async () => {
    const user = userEvent.setup();
    const hostile = '<img src=x onerror="window.__s201=1"></script>';
    const alert = prAlert({
      subject: {
        type: 'PULL_REQUEST',
        id: 70,
        code: 'PR #45',
        title: hostile,
        available: true,
        githubUrl: 'javascript:window.__s201=2'
      }
    });
    trace.getTraceabilityAlert.mockResolvedValue(
      prDetail(alert, roles.MANAGER, { mergedAt: null, githubUrl: 'javascript:window.__s201=2' })
    );
    renderRepository();
    const { dialog } = await openInconsistency(user);

    expect(await within(dialog).findAllByText(hostile, { exact: false })).not.toHaveLength(0);
    expect(document.querySelector('img[src="x"]')).toBeNull();
    const link = within(dialog).getByRole('link', { name: /Abrir no GitHub/ });
    expect(link.getAttribute('href')).not.toMatch(/^javascript:window/);
    expect(window.__s201).toBeUndefined();
  });

  it('F16 fechar devolve o foco ao botão "Ver inconsistência"; Esc também', async () => {
    const user = userEvent.setup();
    renderRepository();
    const { trigger, dialog } = await openInconsistency(user);

    await within(dialog).findByText('PR #45 · Ajusta CI');
    await user.click(within(dialog).getByRole('button', { name: /^Fechar/ }));
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    await screen.findByRole('dialog', { name: 'Inconsistência · PR #45' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });
});

describe('PR #26 casos migrados: tarefa e resumo (S2-01 F12, F13, F14, C4)', () => {
  function taskDetail(overrides = {}, context = {}) {
    return {
      alert: {
        ...prAlert({
          id: 501,
          type: 'TASK_CONCLUDED_WITHOUT_COMMIT',
          subject: {
            type: 'TASK',
            id: 31,
            code: 'TASK-31',
            title: 'Publicar entrega',
            available: true,
            githubUrl: null
          },
          ...overrides
        }),
        context: {
          status: 'CONCLUIDO',
          requirement: null,
          responsible: null,
          pullRequest: null,
          issueCount: 0,
          pendingCommitSuggestions: 0,
          integrationConnected: true,
          ...context
        }
      },
      permissions: roles.MANAGER
    };
  }

  function renderSection(props = {}) {
    return render(
      <MemoryRouter>
        <TaskInconsistencySection
          projectId="9"
          taskId={31}
          openAlertId={501}
          canLink
          onLinkCommit={vi.fn()}
          {...props}
        />
      </MemoryRouter>
    );
  }

  function summary({ rules = true, permissions = roles.MANAGER, reconciliation = null } = {}) {
    return {
      projectId: 9,
      open: { total: 0, byType: {} },
      dismissed: { total: 0 },
      rules: { taskWithoutCommitActive: true, integrationConnected: rules },
      reconciliation,
      permissions
    };
  }

  const renderSummary = () =>
    render(
      <MemoryRouter>
        <InconsistencySummary projectId="9" />
      </MemoryRouter>
    );

  it('F12 inconsistência sem data de conclusão diz que ela está indisponível', async () => {
    trace.getTraceabilityAlert.mockResolvedValue(
      taskDetail({ occurredAt: null, limitations: ['COMPLETION_TIME_UNAVAILABLE'] })
    );
    renderSection();

    expect(
      await screen.findByText(/^Data da conclusão indisponível · detectada em/)
    ).toBeInTheDocument();
  });

  it('F13 sem repositório conectado: a seção explica e não oferece vincular commit; o resumo também explica', async () => {
    trace.getTraceabilityAlert.mockResolvedValue(taskDetail({}, { integrationConnected: false }));
    const { unmount } = renderSection();

    expect(
      await screen.findByText(
        /Projeto sem repositório conectado: nenhum commit pode ser vinculado\./
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vincular commit' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Abrir o repositório do projeto' })).toHaveAttribute(
      'href',
      '/projects/9/repository'
    );
    unmount();

    trace.getTraceabilityAlertSummary.mockResolvedValue(summary({ rules: false }));
    renderSummary();
    expect(
      await screen.findByText(/Toda tarefa concluída fica como concluída sem commit/)
    ).toBeInTheDocument();
  });

  it('F14 reprocessar mostra as contagens devolvidas pelo servidor e relê o resumo', async () => {
    const user = userEvent.setup();
    trace.getTraceabilityAlertSummary.mockResolvedValue(summary());
    trace.reconcileTraceabilityAlerts.mockResolvedValue({
      projectId: 9,
      result: { created: 2, resolved: 1, kept: 5 }
    });
    renderSummary();

    await user.click(await screen.findByRole('button', { name: 'Reprocessar inconsistências' }));

    expect(
      await screen.findByText('Reprocessamento concluído: 2 novos, 1 resolvido, 5 mantidos.')
    ).toBeInTheDocument();
    expect(trace.reconcileTraceabilityAlerts).toHaveBeenCalledWith('9');
    await waitFor(() => expect(trace.getTraceabilityAlertSummary).toHaveBeenCalledTimes(2));
  });

  it('C4-01 falha no resumo mostra erro com nova tentativa, e a nova tentativa recupera', async () => {
    const user = userEvent.setup();
    trace.getTraceabilityAlertSummary
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce({
        ...summary(),
        open: { total: 1, byType: { PULL_REQUEST_MERGED_WITHOUT_TASK: 1 } }
      });
    renderSummary();

    await user.click(await screen.findByRole('button', { name: /Tentar novamente/ }));

    expect(
      await screen.findByRole('link', { name: '1 PR mesclada sem tarefa' })
    ).toBeInTheDocument();
  });

  it.each([
    ['MANAGER', roles.MANAGER, 'Use Reprocessar inconsistências para atualizá-las.', true],
    [
      'VIEWER',
      roles.VIEWER,
      'Peça a um gestor do projeto para reprocessar as inconsistências.',
      false
    ]
  ])(
    'C4-02 C4-03 números desatualizados: %s vê a orientação certa',
    async (_, permissions, guidance, canReprocess) => {
      const failed = '2026-10-08T10:00:00.000Z';
      trace.getTraceabilityAlertSummary.mockResolvedValue(
        summary({
          permissions,
          reconciliation: {
            lastSucceededAt: '2026-10-07T10:00:00.000Z',
            lastFailedAt: failed,
            lastTrigger: 'GITHUB_SYNC',
            stale: true
          }
        })
      );
      renderSummary();

      const notice = await screen.findByText(/podem estar desatualizados/);
      expect(notice).toHaveTextContent(formatInstant(failed));
      expect(notice).toHaveTextContent(guidance);
      expect(Boolean(screen.queryByRole('button', { name: 'Reprocessar inconsistências' }))).toBe(
        canReprocess
      );
    }
  );

  it('C4-04 sem falha registrada, ou com sucesso mais recente, não há aviso', async () => {
    trace.getTraceabilityAlertSummary
      .mockResolvedValueOnce(
        summary({ reconciliation: { lastFailedAt: null, lastSucceededAt: null, stale: false } })
      )
      .mockResolvedValueOnce(summary());
    const first = renderSummary();
    expect(await screen.findByText('Nenhuma inconsistência aberta.')).toBeInTheDocument();
    expect(screen.queryByText(/podem estar desatualizados/)).toBeNull();
    first.unmount();

    renderSummary();
    expect(await screen.findByText('Nenhuma inconsistência aberta.')).toBeInTheDocument();
    expect(screen.queryByText(/podem estar desatualizados/)).toBeNull();
  });
});

describe('PR #26 casos migrados: justificativa em caracteres (S2-01 C5)', () => {
  const emoji = '\u{1F600}';

  it('C5-02 o contador e a validação contam caracteres, e o campo não corta em unidades UTF-16', () => {
    const onSubmit = vi.fn();
    render(<AlertDismissForm busy={false} onSubmit={onSubmit} onCancel={() => {}} />);
    const field = screen.getByLabelText('Justificativa');

    fireEvent.change(field, { target: { value: emoji.repeat(5) } });
    expect(screen.getByText('5 de 500 caracteres · mínimo 10')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dispensar' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A justificativa deve ter entre 10 e 500 caracteres.'
    );

    fireEvent.change(field, { target: { value: emoji.repeat(500) } });
    expect(screen.getByText('500 de 500 caracteres · mínimo 10')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dispensar' }));
    expect(onSubmit).toHaveBeenCalledWith(emoji.repeat(500));
    expect(field).not.toHaveAttribute('maxlength');
  });

  it('C5-03 a regra do formulário é a mesma do servidor', () => {
    expect(validateDismissReason(emoji.repeat(9))).not.toBe('');
    expect(validateDismissReason(emoji.repeat(10))).toBe('');
    expect(validateDismissReason(emoji.repeat(500))).toBe('');
    expect(validateDismissReason(emoji.repeat(501))).not.toBe('');
    expect(validateDismissReason(`  ${'a'.repeat(10)}  `)).toBe('');
  });
});
