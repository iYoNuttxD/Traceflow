import { MemoryRouter, Route, Routes } from 'react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../src/shared/index.js';
import { formatInstant } from '../../src/features/traceability/model/alert-view.js';

const api = vi.hoisted(() => ({
  getTraceabilityAlerts: vi.fn(),
  getTraceabilityAlertSummary: vi.fn(),
  getTraceabilityAlert: vi.fn(),
  dismissTraceabilityAlert: vi.fn(),
  reconcileTraceabilityAlerts: vi.fn()
}));
const tasks = vi.hoisted(() => ({
  list: vi.fn(),
  linkPullRequest: vi.fn(),
  linkIssue: vi.fn()
}));
vi.mock('../../src/features/traceability/api/traceability.api.js', () => api);
vi.mock('../../src/features/tasks/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  tasksApi: tasks
}));
vi.mock('../../src/features/projects/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  ProjectSectionNav: ({ activeSection }) => (
    <nav aria-label="Navegação do projeto" data-active={activeSection} />
  )
}));

import { TraceabilityAlertsPage } from '../../src/pages/TraceabilityAlertsPage.jsx';

const roles = {
  VIEWER: { canLink: false, canManage: false },
  MEMBER: { canLink: true, canManage: false },
  MANAGER: { canLink: true, canManage: true }
};

function summary({ total = 0, byType = {}, rules = true, permissions = roles.MANAGER } = {}) {
  return {
    projectId: 9,
    open: { total, byType },
    dismissed: { total: 0 },
    rules: { taskWithoutCommitActive: rules },
    permissions
  };
}

function taskAlert(id, overrides = {}) {
  return {
    id,
    type: 'TASK_CONCLUDED_WITHOUT_COMMIT',
    status: 'OPEN',
    occurredAt: '2026-10-05T17:32:00.000Z',
    detectedAt: '2026-10-05T17:33:00.000Z',
    resolvedAt: null,
    resolutionReason: null,
    dismissal: null,
    limitations: [],
    subject: {
      type: 'TASK',
      id: 100 + id,
      code: `TASK-${100 + id}`,
      title: `Tarefa ${id}`,
      available: true,
      githubUrl: null
    },
    ...overrides
  };
}

function pullRequestAlert(id) {
  return taskAlert(id, {
    type: 'PULL_REQUEST_MERGED_WITHOUT_TASK',
    subject: {
      type: 'PULL_REQUEST',
      id: 70,
      code: 'PR #45',
      title: 'Ajusta CI',
      available: true,
      githubUrl: 'https://github.com/traceflow/repo/pull/45'
    }
  });
}

function listing(alerts, { page = 1, totalPages = 1, total = alerts.length, permissions } = {}) {
  return {
    projectId: 9,
    status: 'OPEN',
    type: null,
    alerts,
    pagination: { page, limit: 20, total, totalPages },
    permissions: permissions || roles.MANAGER
  };
}

function detail(alert, context) {
  return {
    alert: {
      ...alert,
      context:
        context ||
        (alert.subject.type === 'TASK'
          ? {
              status: 'CONCLUIDO',
              requirement: { id: 3, code: 'REQ-3' },
              responsible: { id: 2, name: 'Ana' },
              pullRequest: null,
              issueCount: 0,
              pendingCommitSuggestions: 0
            }
          : {
              number: 45,
              title: 'Ajusta CI',
              sourceBranch: 'ci',
              targetBranch: 'main',
              mergedAt: '2026-10-05T17:32:00.000Z',
              githubUrl: 'https://github.com/traceflow/repo/pull/45'
            })
    },
    permissions: roles.MANAGER
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function renderPage() {
  return render(
    <ConfirmProvider>
      <MemoryRouter initialEntries={['/projects/9/traceability/alerts']}>
        <Routes>
          <Route
            path="/projects/:projectId/traceability/alerts"
            element={<TraceabilityAlertsPage />}
          />
        </Routes>
      </MemoryRouter>
    </ConfirmProvider>
  );
}

async function openDetails(user, code) {
  await user.click(await screen.findByRole('button', { name: `Ver detalhes do alerta ${code}` }));
  return screen.findByRole('dialog');
}

const conflict = (code) => ({
  response: { status: 409, data: { code, message: 'Este alerta já foi resolvido.' } }
});

beforeEach(() => {
  vi.resetAllMocks();
  api.getTraceabilityAlertSummary.mockResolvedValue(summary());
  api.getTraceabilityAlerts.mockResolvedValue(listing([]));
});

describe('S2-01 tela de alertas: volumes de dados', () => {
  it('F1 sem alertas mostra o resumo textual e o item Alertas sem contagem', async () => {
    renderPage();

    expect(await screen.findByText('Nenhum alerta aberto.')).toBeInTheDocument();
    expect(
      await screen.findByText('Nenhuma inconsistência pendente neste projeto.')
    ).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Seções da rastreabilidade' });
    expect(within(nav).getByRole('link', { name: 'Alertas' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('F2 um alerta mostra tipo, situação, sujeito, data do fato e da detecção', async () => {
    api.getTraceabilityAlertSummary.mockResolvedValue(
      summary({ total: 1, byType: { TASK_CONCLUDED_WITHOUT_COMMIT: 1 } })
    );
    api.getTraceabilityAlerts.mockResolvedValue(listing([taskAlert(1)]));
    renderPage();

    const card = await screen.findByRole('article', {
      name: 'Tarefa concluída sem commit: TASK-101'
    });
    expect(within(card).getByText('Aberto')).toBeInTheDocument();
    expect(within(card).getByText('Tarefa 1')).toBeInTheDocument();
    expect(
      within(card).getByText(`Concluída em ${formatInstant('2026-10-05T17:32:00.000Z')}`)
    ).toBeInTheDocument();
    expect(
      within(card).getByText(`Detectado em ${formatInstant('2026-10-05T17:33:00.000Z')}`)
    ).toBeInTheDocument();
    expect(screen.getByText('1 alerta aberto: 1 tarefa concluída sem commit.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Alertas (1)' })).toBeInTheDocument();
  });

  it('F3 carrega mais alertas acrescentando sem duplicar por id', async () => {
    const first = Array.from({ length: 20 }, (_, index) => taskAlert(index + 1));
    const second = [
      taskAlert(20),
      ...Array.from({ length: 5 }, (_, index) => taskAlert(21 + index))
    ];
    api.getTraceabilityAlerts
      .mockResolvedValueOnce(listing(first, { total: 25, totalPages: 2 }))
      .mockResolvedValueOnce(listing(second, { page: 2, total: 25, totalPages: 2 }));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Carregar mais alertas' }));

    await waitFor(() =>
      expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(25)
    );
    expect(api.getTraceabilityAlerts).toHaveBeenLastCalledWith(
      '9',
      { status: 'OPEN', type: '', page: 2, limit: 20 },
      expect.objectContaining({ fresh: true })
    );
    expect(screen.queryByRole('button', { name: 'Carregar mais alertas' })).toBeNull();
  });

  it('F12 alerta sem data de conclusão diz que ela está indisponível', async () => {
    api.getTraceabilityAlerts.mockResolvedValue(
      listing([taskAlert(1, { occurredAt: null, limitations: ['COMPLETION_TIME_UNAVAILABLE'] })])
    );
    renderPage();

    expect(await screen.findByText('Data da conclusão indisponível')).toBeInTheDocument();
  });

  it('F13 avisa quando a regra de tarefa sem commit está inativa', async () => {
    api.getTraceabilityAlertSummary.mockResolvedValue(summary({ rules: false }));
    renderPage();

    expect(
      await screen.findByText(
        'O alerta de tarefa concluída sem commit fica ativo quando o projeto tem um repositório GitHub integrado.'
      )
    ).toBeInTheDocument();
  });
});

describe('S2-01 tela de alertas: filtros e concorrência', () => {
  it('F4 troca situação e tipo, e limpar volta ao padrão', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Nenhum alerta aberto.');
    await user.click(screen.getByRole('button', { name: /Buscar e filtrar/ }));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Situação' }), 'RESOLVED');
    await waitFor(() =>
      expect(api.getTraceabilityAlerts).toHaveBeenLastCalledWith(
        '9',
        { status: 'RESOLVED', type: '', page: 1, limit: 20 },
        expect.anything()
      )
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Tipo' }),
      'ISSUE_CLOSED_WITHOUT_TASK'
    );
    await waitFor(() =>
      expect(api.getTraceabilityAlerts).toHaveBeenLastCalledWith(
        '9',
        { status: 'RESOLVED', type: 'ISSUE_CLOSED_WITHOUT_TASK', page: 1, limit: 20 },
        expect.anything()
      )
    );
    expect(await screen.findByText('Nenhum alerta corresponde aos filtros.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(() =>
      expect(api.getTraceabilityAlerts).toHaveBeenLastCalledWith(
        '9',
        { status: 'OPEN', type: '', page: 1, limit: 20 },
        expect.anything()
      )
    );
  });

  it('F5 resposta antiga não sobrescreve a do filtro atual', async () => {
    const stale = deferred();
    api.getTraceabilityAlerts
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(listing([taskAlert(2)]));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /Buscar e filtrar/ }));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Situação' }), 'DISMISSED');
    expect(await screen.findByText('Tarefa 2')).toBeInTheDocument();
    await act(async () => stale.resolve(listing([taskAlert(1)])));

    expect(screen.queryByText('Tarefa 1')).toBeNull();
    expect(screen.getByText('Tarefa 2')).toBeInTheDocument();
  });

  it('F15 erro de rede na primeira carga oferece tentar novamente', async () => {
    api.getTraceabilityAlerts
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce(listing([taskAlert(1)]));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Tentar novamente/ }));

    expect(await screen.findByText('Tarefa 1')).toBeInTheDocument();
  });
});

describe('S2-01 tela de alertas: permissões e ações', () => {
  it('F6 VIEWER não vê reprocessar, vincular nem dispensar', async () => {
    api.getTraceabilityAlertSummary.mockResolvedValue(summary({ permissions: roles.VIEWER }));
    api.getTraceabilityAlerts.mockResolvedValue(
      listing([pullRequestAlert(1)], { permissions: roles.VIEWER })
    );
    api.getTraceabilityAlert.mockResolvedValue(detail(pullRequestAlert(1)));
    const user = userEvent.setup();
    renderPage();

    const dialog = await openDetails(user, 'PR #45');

    expect(await within(dialog).findByText('PR #45 · Ajusta CI')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Vincular a uma tarefa' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Dispensar alerta' })).toBeNull();
    expect(within(dialog).getByRole('link', { name: /Abrir no GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/traceflow/repo/pull/45'
    );
    expect(screen.queryByRole('button', { name: 'Reprocessar alertas' })).toBeNull();
  });

  it('F7 MEMBER vincula mas não dispensa', async () => {
    api.getTraceabilityAlerts.mockResolvedValue(
      listing([pullRequestAlert(1)], { permissions: roles.MEMBER })
    );
    api.getTraceabilityAlert.mockResolvedValue(detail(pullRequestAlert(1)));
    const user = userEvent.setup();
    renderPage();

    const dialog = await openDetails(user, 'PR #45');

    expect(
      await within(dialog).findByRole('button', { name: 'Vincular a uma tarefa' })
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Dispensar alerta' })).toBeNull();
  });

  it('F8 MANAGER dispensa com justificativa validada e a tela relê', async () => {
    const alert = taskAlert(1);
    api.getTraceabilityAlerts.mockResolvedValue(listing([alert]));
    api.getTraceabilityAlert.mockResolvedValue(detail(alert));
    api.dismissTraceabilityAlert.mockResolvedValue({ alert, changed: true });
    const user = userEvent.setup();
    renderPage();
    const dialog = await openDetails(user, 'TASK-101');

    await user.click(await within(dialog).findByRole('button', { name: 'Dispensar alerta' }));
    await user.type(within(dialog).getByLabelText('Justificativa'), 'curto');
    await user.click(within(dialog).getByRole('button', { name: 'Dispensar alerta' }));
    expect(
      within(dialog).getByText('A justificativa deve ter entre 10 e 500 caracteres.')
    ).toBeInTheDocument();
    expect(api.dismissTraceabilityAlert).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText('Justificativa'), ' demais: documentação.');
    await user.click(within(dialog).getByRole('button', { name: 'Dispensar alerta' }));

    expect(await within(dialog).findByText('Alerta dispensado.')).toBeInTheDocument();
    expect(api.dismissTraceabilityAlert).toHaveBeenCalledWith(
      '9',
      1,
      'curto demais: documentação.'
    );
    expect(api.getTraceabilityAlert).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(api.getTraceabilityAlerts).toHaveBeenCalledTimes(2));
    expect(api.getTraceabilityAlertSummary).toHaveBeenCalledTimes(2);
  });

  it('F9 dispensar alerta já resolvido explica e relê', async () => {
    const alert = taskAlert(1);
    api.getTraceabilityAlerts.mockResolvedValue(listing([alert]));
    api.getTraceabilityAlert.mockResolvedValue(detail(alert));
    api.dismissTraceabilityAlert.mockRejectedValue(conflict('TRACEABILITY_ALERT_NOT_OPEN'));
    const user = userEvent.setup();
    renderPage();
    const dialog = await openDetails(user, 'TASK-101');

    await user.click(await within(dialog).findByRole('button', { name: 'Dispensar alerta' }));
    await user.type(within(dialog).getByLabelText('Justificativa'), 'Justificativa suficiente.');
    await user.click(within(dialog).getByRole('button', { name: 'Dispensar alerta' }));

    expect(
      await within(dialog).findByText('Este alerta já foi resolvido. A lista foi atualizada.')
    ).toBeInTheDocument();
    expect(api.getTraceabilityAlert).toHaveBeenCalledTimes(2);
  });

  it('F10 vincula a PR a uma tarefa sem PR e relê o alerta', async () => {
    api.getTraceabilityAlerts.mockResolvedValue(listing([pullRequestAlert(1)]));
    api.getTraceabilityAlert.mockResolvedValue(detail(pullRequestAlert(1)));
    tasks.list.mockResolvedValue({
      data: { tasks: [{ id: 7, title: 'Login', pullRequest: null }] }
    });
    tasks.linkPullRequest.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    const dialog = await openDetails(user, 'PR #45');

    await user.click(await within(dialog).findByRole('button', { name: 'Vincular a uma tarefa' }));
    await user.type(within(dialog).getByRole('combobox', { name: 'Tarefa' }), 'Log');
    await user.click(await screen.findByRole('option', { name: 'TASK-7 · Login' }));
    await user.click(within(dialog).getByRole('button', { name: 'Vincular à tarefa' }));

    expect(await within(dialog).findByText('Vínculo salvo em TASK-7.')).toBeInTheDocument();
    expect(tasks.linkPullRequest).toHaveBeenCalledWith(7, 70);
    expect(api.getTraceabilityAlert).toHaveBeenCalledTimes(2);
  });

  it('F11 substituir a PR de uma tarefa exige confirmação e cancelar não grava', async () => {
    api.getTraceabilityAlerts.mockResolvedValue(listing([pullRequestAlert(1)]));
    api.getTraceabilityAlert.mockResolvedValue(detail(pullRequestAlert(1)));
    tasks.list.mockResolvedValue({
      data: { tasks: [{ id: 12, title: 'Cadastro', pullRequest: { id: 8, number: 7 } }] }
    });
    const user = userEvent.setup();
    renderPage();
    const dialog = await openDetails(user, 'PR #45');

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

  it('alerta de tarefa leva ao Kanban com a tarefa aberta', async () => {
    api.getTraceabilityAlerts.mockResolvedValue(listing([taskAlert(1)]));
    api.getTraceabilityAlert.mockResolvedValue(detail(taskAlert(1)));
    const user = userEvent.setup();
    renderPage();
    const dialog = await openDetails(user, 'TASK-101');

    expect(
      await within(dialog).findByRole('link', { name: 'Abrir tarefa no Kanban' })
    ).toHaveAttribute('href', '/projects/9/kanban?task=101');
    expect(within(dialog).getByText('REQ-3')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Vincular a uma tarefa' })).toBeNull();
  });

  it('F14 reprocessar mostra as contagens devolvidas pelo servidor', async () => {
    api.reconcileTraceabilityAlerts.mockResolvedValue({
      projectId: 9,
      result: { created: 2, resolved: 1, kept: 5 }
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Reprocessar alertas' }));

    expect(
      await screen.findByText('Reprocessamento concluído: 2 novos, 1 resolvido, 5 mantidos.')
    ).toBeInTheDocument();
    expect(api.reconcileTraceabilityAlerts).toHaveBeenCalledWith('9');
    await waitFor(() => expect(api.getTraceabilityAlertSummary).toHaveBeenCalledTimes(2));
  });

  it('F16 alerta que saiu da lista leva o foco ao título da lista ao fechar', async () => {
    const alert = taskAlert(1);
    api.getTraceabilityAlerts
      .mockResolvedValueOnce(listing([alert]))
      .mockResolvedValue(listing([]));
    api.getTraceabilityAlert.mockResolvedValue(detail(alert));
    api.dismissTraceabilityAlert.mockResolvedValue({ alert, changed: true });
    const user = userEvent.setup();
    renderPage();
    const dialog = await openDetails(user, 'TASK-101');

    await user.click(await within(dialog).findByRole('button', { name: 'Dispensar alerta' }));
    await user.type(within(dialog).getByLabelText('Justificativa'), 'Justificativa suficiente.');
    await user.click(within(dialog).getByRole('button', { name: 'Dispensar alerta' }));
    await within(dialog).findByText('Alerta dispensado.');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Ver detalhes do alerta TASK-101' })).toBeNull()
    );
    await user.click(within(dialog).getByRole('button', { name: /^Fechar/ }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Alertas' })).toHaveFocus());
  });

  it('F16 fechar o detalhe devolve o foco ao botão de origem', async () => {
    api.getTraceabilityAlerts.mockResolvedValue(listing([taskAlert(1)]));
    api.getTraceabilityAlert.mockResolvedValue(detail(taskAlert(1)));
    const user = userEvent.setup();
    renderPage();
    const dialog = await openDetails(user, 'TASK-101');

    await user.click(within(dialog).getByRole('button', { name: /^Fechar/ }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ver detalhes do alerta TASK-101' })).toHaveFocus()
    );
  });
});
