import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const trace = vi.hoisted(() => ({
  getTraceabilityAlert: vi.fn(),
  getTraceabilityAlerts: vi.fn(),
  dismissTraceabilityAlert: vi.fn()
}));

vi.mock('../../../src/features/traceability/api/traceability.api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  ...trace
}));

const { AlertDetails } =
  await import('../../../src/features/traceability/components/AlertDetails.jsx');
const { formatInstant } = await import('../../../src/features/traceability/model/alert-view.js');

const MERGED = '2026-10-12T17:30:00.000Z';
const PR_TITLE = 'Corrigir o login social';

function pullRequestAlert(overrides = {}) {
  return {
    id: 77,
    type: 'PULL_REQUEST_MERGED_WITHOUT_TASK',
    status: 'OPEN',
    occurredAt: MERGED,
    detectedAt: '2026-10-12T17:31:00.000Z',
    resolvedAt: null,
    resolutionReason: null,
    dismissal: null,
    limitations: [],
    subject: {
      type: 'PULL_REQUEST',
      id: 12,
      code: 'PR #12',
      title: PR_TITLE,
      available: true,
      githubUrl: 'https://github.com/usuario/repositorio/pull/12'
    },
    context: {
      number: 12,
      title: PR_TITLE,
      sourceBranch: 'feature/login',
      targetBranch: 'main',
      mergedAt: MERGED
    },
    ...overrides
  };
}

const history = (alerts = []) => ({
  alerts,
  pagination: { page: 1, limit: 50, total: alerts.length, totalPages: alerts.length ? 1 : 0 },
  permissions: { canManage: true, canLink: true }
});

function renderDetails(alert) {
  trace.getTraceabilityAlert.mockResolvedValue({
    alert,
    permissions: { canManage: true, canLink: true }
  });
  return render(
    <MemoryRouter>
      <AlertDetails projectId={5} alertId={alert.id} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  trace.getTraceabilityAlerts.mockResolvedValue(history());
});

describe('UX-R2-01 — detalhe da inconsistência compacto', () => {
  it('M-01 a identificação da PR aparece uma vez', async () => {
    const { container } = renderDetails(pullRequestAlert());

    await screen.findByRole('region', { name: 'Motivo' });

    expect(container.textContent.split(PR_TITLE)).toHaveLength(2);
    expect(container.textContent.split('PR #12')).toHaveLength(2);
  });

  it('M-02 a data do merge aparece uma vez, no motivo', async () => {
    const { container } = renderDetails(pullRequestAlert());

    const reason = await screen.findByRole('region', { name: 'Motivo' });

    expect(within(reason).getByText(`Mesclada em ${formatInstant(MERGED)}`)).toBeInTheDocument();
    expect(container.textContent.split(formatInstant(MERGED))).toHaveLength(2);
  });

  it('M-03 os blocos seguem a ordem motivo, dados e ações', async () => {
    renderDetails(pullRequestAlert());

    const reason = await screen.findByRole('region', { name: 'Motivo' });
    const data = screen.getByRole('region', { name: 'Dados' });
    const actions = screen.getByRole('group', { name: 'Ações da inconsistência' });

    expect(reason.compareDocumentPosition(data) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(data.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(data).getByText('feature/login → main')).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: 'Dispensar' })).toBeInTheDocument();
  });

  it('M-04 dispensa e histórico continuam no detalhe', async () => {
    trace.getTraceabilityAlerts.mockResolvedValue(
      history([pullRequestAlert({ id: 60, status: 'RESOLVED', resolvedAt: MERGED })])
    );
    renderDetails(
      pullRequestAlert({
        status: 'DISMISSED',
        dismissal: {
          at: '2026-10-13T12:00:00.000Z',
          reason: 'PR de dependência automática.',
          by: { id: 3, name: 'Carla Dias' }
        }
      })
    );

    const data = await screen.findByRole('region', { name: 'Dados' });

    expect(within(data).getByText(/Carla Dias/)).toBeInTheDocument();
    expect(within(data).getByText(/PR de dependência automática\./)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Histórico (1)' })).toBeInTheDocument();
  });
});
