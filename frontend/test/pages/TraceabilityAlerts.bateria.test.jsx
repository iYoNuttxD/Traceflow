import { MemoryRouter, Route, Routes } from 'react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../src/shared/index.js';

const api = vi.hoisted(() => ({
  getTraceabilityAlerts: vi.fn(),
  getTraceabilityAlertSummary: vi.fn(),
  getTraceabilityAlert: vi.fn(),
  dismissTraceabilityAlert: vi.fn(),
  reconcileTraceabilityAlerts: vi.fn()
}));
vi.mock('../../src/features/traceability/api/traceability.api.js', () => api);
vi.mock('../../src/features/projects/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  ProjectSectionNav: () => <nav aria-label="Navegação do projeto" />
}));

import { TraceabilityAlertsPage } from '../../src/pages/TraceabilityAlertsPage.jsx';

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
