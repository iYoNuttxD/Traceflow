import { MemoryRouter, Route, Routes } from 'react-router';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../src/shared/index.js';
import {
  formatInstant,
  validateDismissReason
} from '../../src/features/traceability/model/alert-view.js';
import { AlertDismissForm } from '../../src/features/traceability/components/AlertDismissForm.jsx';

const api = vi.hoisted(() => ({
  getTraceabilityAlerts: vi.fn(),
  getTraceabilityAlertSummary: vi.fn(),
  getTraceabilityAlert: vi.fn(),
  dismissTraceabilityAlert: vi.fn(),
  reconcileTraceabilityAlerts: vi.fn(),
  getTasksWithoutTechnicalLinks: vi.fn()
}));
const tasks = vi.hoisted(() => ({ list: vi.fn(), linkPullRequest: vi.fn(), linkIssue: vi.fn() }));
vi.mock('../../src/features/traceability/api/traceability.api.js', () => api);
vi.mock('../../src/features/tasks/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  tasksApi: tasks
}));
vi.mock('../../src/features/projects/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  ProjectSectionNav: () => <nav aria-label="Navegação do projeto" />
}));

import { TraceabilityAlertsPage } from '../../src/pages/TraceabilityAlertsPage.jsx';
import { UnlinkedTasksPage } from '../../src/pages/UnlinkedTasksPage.jsx';

const manager = { canLink: true, canManage: true };
const TASK = 'TASK_CONCLUDED_WITHOUT_COMMIT';
const PULL_REQUEST = 'PULL_REQUEST_MERGED_WITHOUT_TASK';
const ISSUE = 'ISSUE_CLOSED_WITHOUT_TASK';

const summary = () => ({
  projectId: 9,
  open: { total: 1, byType: {} },
  dismissed: { total: 0 },
  rules: { taskWithoutCommitActive: true },
  permissions: manager
});

function alertOf(type, subject, overrides = {}) {
  return {
    id: 1,
    type,
    status: 'OPEN',
    occurredAt: '2026-10-05T17:32:00.000Z',
    detectedAt: '2026-10-05T17:33:00.000Z',
    resolvedAt: null,
    resolutionReason: null,
    dismissal: null,
    limitations: [],
    subject: { available: true, githubUrl: null, ...subject },
    ...overrides
  };
}

const listing = (alerts) => ({
  projectId: 9,
  status: 'OPEN',
  type: null,
  alerts,
  pagination: { page: 1, limit: 20, total: alerts.length, totalPages: 1 },
  permissions: manager
});

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

beforeEach(() => {
  vi.resetAllMocks();
  api.getTraceabilityAlertSummary.mockResolvedValue(summary());
  api.getTraceabilityAlerts.mockResolvedValue(listing([]));
});

describe('Bateria S2-01 frontend — estados (AT-U-02)', () => {
  it('o estado vazio muda de texto conforme a situação filtrada', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(
      await screen.findByText('Nenhuma inconsistência pendente neste projeto.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Buscar e filtrar/ }));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Situação' }), 'DISMISSED');
    expect(await screen.findByText('Nenhum alerta dispensado.')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Situação' }), 'RESOLVED');
    expect(await screen.findByText('Nenhum alerta resolvido.')).toBeInTheDocument();
  });

  it('429 na primeira carga bloqueia a nova tentativa durante a espera informada', async () => {
    api.getTraceabilityAlerts.mockRejectedValue({
      response: {
        status: 429,
        headers: { 'retry-after': '30' },
        data: { code: 'RATE_LIMITED', message: 'Muitas solicitações.' }
      }
    });
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Muitas solicitações em pouco tempo.' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tentar novamente em \d+s/ })).toBeDisabled();
  });

  it('404 na primeira carga mostra a página de não encontrado, sem vazar o projeto', async () => {
    api.getTraceabilityAlerts.mockRejectedValue({
      response: {
        status: 404,
        data: { code: 'RESOURCE_NOT_FOUND', message: 'Recurso não encontrado.' }
      }
    });
    api.getTraceabilityAlertSummary.mockRejectedValue({
      response: {
        status: 404,
        data: { code: 'RESOURCE_NOT_FOUND', message: 'Recurso não encontrado.' }
      }
    });
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Página não encontrada.' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reprocessar alertas' })).toBeNull();
  });
});

describe('Bateria S2-01 frontend — detalhe por tipo (AT-U-04)', () => {
  it('PR mostra número, branches, data do merge e o link do GitHub', async () => {
    const alert = alertOf(PULL_REQUEST, {
      type: 'PULL_REQUEST',
      id: 70,
      code: 'PR #45',
      title: 'Ajusta CI',
      githubUrl: 'https://github.com/traceflow/repo/pull/45'
    });
    api.getTraceabilityAlerts.mockResolvedValue(listing([alert]));
    api.getTraceabilityAlert.mockResolvedValue({
      alert: {
        ...alert,
        context: {
          number: 45,
          title: 'Ajusta CI',
          sourceBranch: null,
          targetBranch: 'main',
          mergedAt: '2026-10-05T17:32:00.000Z',
          githubUrl: 'https://github.com/traceflow/repo/pull/45'
        }
      },
      permissions: manager
    });
    const user = userEvent.setup();
    renderPage();

    const dialog = await openDetails(user, 'PR #45');

    expect(await within(dialog).findByText('PR #45 · Ajusta CI')).toBeInTheDocument();
    expect(within(dialog).getByText('origem não informada → main')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /Abrir no GitHub/ })).toHaveAttribute(
      'rel',
      'noopener noreferrer'
    );
  });

  it('issue de sujeito excluído mostra o snapshot, avisa e não oferece vínculo', async () => {
    const alert = alertOf(
      ISSUE,
      { type: 'ISSUE', id: null, code: 'Issue #8', title: 'Snapshot da issue', available: false },
      {
        status: 'RESOLVED',
        resolvedAt: '2026-10-06T10:00:00.000Z',
        resolutionReason: 'RULE_NO_LONGER_APPLIES'
      }
    );
    api.getTraceabilityAlerts.mockResolvedValue(listing([alert]));
    api.getTraceabilityAlert.mockResolvedValue({
      alert: { ...alert, context: null },
      permissions: manager
    });
    const user = userEvent.setup();
    renderPage();

    const dialog = await openDetails(user, 'Issue #8');

    expect(await within(dialog).findByText('Snapshot da issue')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'O item deste alerta foi excluído. Os dados exibidos são os da detecção.'
      )
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Vincular a uma tarefa' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Dispensar alerta' })).toBeNull();
  });

  it('Esc fecha o detalhe e devolve o foco ao botão de origem', async () => {
    const alert = alertOf(TASK, { type: 'TASK', id: 101, code: 'TASK-101', title: 'Tarefa 1' });
    api.getTraceabilityAlerts.mockResolvedValue(listing([alert]));
    api.getTraceabilityAlert.mockResolvedValue({
      alert: {
        ...alert,
        context: {
          status: 'CONCLUIDO',
          requirement: null,
          responsible: null,
          pullRequest: null,
          issueCount: 0,
          pendingCommitSuggestions: 0
        }
      },
      permissions: manager
    });
    const user = userEvent.setup();
    renderPage();
    const trigger = await screen.findByRole('button', { name: 'Ver detalhes do alerta TASK-101' });

    await user.click(trigger);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });
});

describe('Bateria S2-01 frontend — conteúdo vindo do GitHub (AT-U-09)', () => {
  it('título com HTML é texto e URL javascript: não vira link executável', async () => {
    const hostile = '<img src=x onerror="window.__s201=1"></script>';
    const alert = alertOf(PULL_REQUEST, {
      type: 'PULL_REQUEST',
      id: 70,
      code: 'PR #46',
      title: hostile,
      githubUrl: 'javascript:window.__s201=2'
    });
    api.getTraceabilityAlerts.mockResolvedValue(listing([alert]));
    api.getTraceabilityAlert.mockResolvedValue({
      alert: {
        ...alert,
        context: {
          number: 46,
          title: hostile,
          sourceBranch: 'a',
          targetBranch: 'b',
          mergedAt: null,
          githubUrl: 'javascript:window.__s201=2'
        }
      },
      permissions: manager
    });
    const user = userEvent.setup();
    const { container } = renderPage();

    const dialog = await openDetails(user, 'PR #46');

    expect(await within(dialog).findAllByText(hostile, { exact: false })).not.toHaveLength(0);
    expect(container.ownerDocument.querySelector('img[src="x"]')).toBeNull();
    const link = within(dialog).getByRole('link', { name: /Abrir no GitHub/ });
    expect(link.getAttribute('href')).not.toMatch(/^javascript:window/);
    expect(window.__s201).toBeUndefined();
  });
});

function prDetail(alert) {
  return {
    alert: {
      ...alert,
      context: {
        number: 45,
        title: 'Ajusta CI',
        sourceBranch: 'ci',
        targetBranch: 'main',
        mergedAt: '2026-10-05T17:32:00.000Z',
        githubUrl: null
      }
    },
    permissions: manager
  };
}

const prAlert = () =>
  alertOf(PULL_REQUEST, { type: 'PULL_REQUEST', id: 70, code: 'PR #45', title: 'Ajusta CI' });

describe('Bateria S2-01 frontend — falhas e estados residuais (AT-U-02, AT-U-05, AT-U-06)', () => {
  it('alerta resolvido e dispensado por conta removida mostra motivo e "pessoa removida"', async () => {
    api.getTraceabilityAlerts.mockResolvedValue(
      listing([
        alertOf(
          TASK,
          { type: 'TASK', id: null, code: 'TASK-5', title: 'Snapshot', available: false },
          {
            status: 'RESOLVED',
            resolvedAt: '2026-10-06T10:00:00.000Z',
            resolutionReason: 'TASK_DELETED',
            dismissal: { at: '2026-10-05T10:00:00.000Z', reason: 'Sem código.', by: null }
          }
        )
      ])
    );
    renderPage();

    expect(await screen.findByText(/Dispensado por pessoa removida/)).toBeInTheDocument();
    expect(screen.getByText(/Resolvido em/)).toBeInTheDocument();
  });

  it('vincular sem escolher tarefa pede a tarefa; falha do servidor aparece no formulário', async () => {
    api.getTraceabilityAlerts.mockResolvedValue(listing([prAlert()]));
    api.getTraceabilityAlert.mockResolvedValue(prDetail(prAlert()));
    tasks.list.mockResolvedValue({
      data: { tasks: [{ id: 7, title: 'Login', pullRequest: null }] }
    });
    tasks.linkPullRequest.mockRejectedValue({
      response: { status: 409, data: { code: 'TASK_SPRINT_LOCKED', message: 'Tarefa congelada.' } }
    });
    const user = userEvent.setup();
    renderPage();
    const dialog = await openDetails(user, 'PR #45');
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

  it('dispensa recusada pelo servidor mostra a mensagem dele e mantém o alerta', async () => {
    api.getTraceabilityAlerts.mockResolvedValue(listing([prAlert()]));
    api.getTraceabilityAlert.mockResolvedValue(prDetail(prAlert()));
    api.dismissTraceabilityAlert.mockRejectedValue({
      response: { status: 403, data: { code: 'FORBIDDEN', message: 'Perfil sem permissão.' } }
    });
    const user = userEvent.setup();
    renderPage();
    const dialog = await openDetails(user, 'PR #45');

    await user.click(await within(dialog).findByRole('button', { name: 'Dispensar alerta' }));
    await user.type(within(dialog).getByLabelText('Justificativa'), 'Justificativa suficiente.');
    await user.click(within(dialog).getByRole('button', { name: /^Dispensar/ }));

    expect(await within(dialog).findByText('Perfil sem permissão.')).toBeInTheDocument();
    expect(api.getTraceabilityAlert).toHaveBeenCalledTimes(1);
  });

  it('falha ao carregar a página seguinte do RF58 oferece tentar de novo a mesma página', async () => {
    const unlinked = (id) => ({
      id,
      code: `TASK-${id}`,
      title: `Tarefa ${id}`,
      status: 'CONCLUIDO',
      responsible: null,
      requirement: null,
      updatedAt: '2026-10-05T17:32:00.000Z'
    });
    const result = (items, page, totalPages) => ({
      projectId: 9,
      status: null,
      tasks: items,
      pagination: { page, limit: 20, total: 21, totalPages }
    });
    api.getTasksWithoutTechnicalLinks
      .mockResolvedValueOnce(
        result(
          Array.from({ length: 20 }, (_, i) => unlinked(i + 1)),
          1,
          2
        )
      )
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce(result([unlinked(21)], 2, 2));
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/projects/9/traceability/unlinked-tasks']}>
        <Routes>
          <Route
            path="/projects/:projectId/traceability/unlinked-tasks"
            element={<UnlinkedTasksPage />}
          />
        </Routes>
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Carregar mais tarefas' }));
    await user.click(await screen.findByRole('button', { name: /Tentar novamente/ }));

    expect(await screen.findByText('Tarefa 21')).toBeInTheDocument();
    expect(api.getTasksWithoutTechnicalLinks).toHaveBeenLastCalledWith(
      '9',
      expect.objectContaining({ page: 2 }),
      expect.anything()
    );
  });
});

describe('Correções S2-01 frontend — resumo com falha e alertas desatualizados (S201-A06, S201-A05)', () => {
  const viewer = { canLink: false, canManage: false };
  const withReconciliation = (reconciliation, permissions = manager) => ({
    ...summary(),
    permissions,
    reconciliation
  });
  const failure = {
    lastSucceededAt: '2026-10-07T10:00:00.000Z',
    lastFailedAt: '2026-10-08T10:00:00.000Z',
    lastTrigger: 'GITHUB_SYNC',
    stale: true
  };

  it('C4-01 falha só no resumo mostra erro com nova tentativa, e a nova tentativa recupera', async () => {
    api.getTraceabilityAlertSummary
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce({ ...summary(), open: { total: 1, byType: { [PULL_REQUEST]: 1 } } });
    api.getTraceabilityAlerts.mockResolvedValue(listing([prAlert()]));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Ajusta CI')).toBeInTheDocument();
    const summaryRegion = screen.getByRole('region', { name: 'Resumo dos alertas' });
    expect(within(summaryRegion).queryByText('Carregando resumo dos alertas...')).toBeNull();
    await user.click(
      await within(summaryRegion).findByRole('button', { name: /Tentar novamente/ })
    );

    expect(await within(summaryRegion).findByText(/1 alerta aberto/)).toBeInTheDocument();
  });

  it('C4-02 alertas desatualizados: MANAGER vê o aviso e o reprocessamento', async () => {
    api.getTraceabilityAlertSummary.mockResolvedValue(withReconciliation(failure));
    renderPage();

    const notice = await screen.findByText(/podem estar desatualizados/);
    expect(notice.textContent).toContain(formatInstant(failure.lastFailedAt));
    expect(notice.textContent).toContain('Reprocessar alertas');
    expect(screen.getByRole('button', { name: 'Reprocessar alertas' })).toBeInTheDocument();
  });

  it('C4-03 alertas desatualizados: VIEWER é orientado a pedir a um gestor', async () => {
    api.getTraceabilityAlertSummary.mockResolvedValue(withReconciliation(failure, viewer));
    api.getTraceabilityAlerts.mockResolvedValue({ ...listing([]), permissions: viewer });
    renderPage();

    const notice = await screen.findByText(/podem estar desatualizados/);
    expect(notice.textContent).toContain('gestor');
    expect(screen.queryByRole('button', { name: 'Reprocessar alertas' })).toBeNull();
  });

  it('C4-04 sem falha registrada, ou com sucesso mais recente, não há aviso', async () => {
    api.getTraceabilityAlertSummary
      .mockResolvedValueOnce(withReconciliation({ ...failure, stale: false }))
      .mockResolvedValueOnce(withReconciliation(null));
    const first = renderPage();
    expect(
      await screen.findByText('Nenhuma inconsistência pendente neste projeto.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/podem estar desatualizados/)).toBeNull();
    first.unmount();

    renderPage();
    expect(
      await screen.findByText('Nenhuma inconsistência pendente neste projeto.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/podem estar desatualizados/)).toBeNull();
  });
});

describe('Correções S2-01 frontend — justificativa em caracteres (S201-A02)', () => {
  const emoji = '\u{1F600}';

  it('C5-02 o contador e a validação contam caracteres, e o campo não corta em unidades UTF-16', () => {
    const onSubmit = vi.fn();
    render(<AlertDismissForm busy={false} onSubmit={onSubmit} onCancel={() => {}} />);
    const field = screen.getByLabelText('Justificativa');

    fireEvent.change(field, { target: { value: emoji.repeat(5) } });
    expect(screen.getByText('5 de 500 caracteres · mínimo 10')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Dispensar/ }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A justificativa deve ter entre 10 e 500 caracteres.'
    );

    fireEvent.change(field, { target: { value: emoji.repeat(500) } });
    expect(screen.getByText('500 de 500 caracteres · mínimo 10')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Dispensar/ }));
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
