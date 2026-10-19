import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const { TaskInconsistencySection } =
  await import('../../../src/features/traceability/components/TaskInconsistencySection.jsx');

const REASON = 'Tarefa de documentação, sem código.';

function alert(id, overrides = {}) {
  return {
    id,
    type: 'TASK_CONCLUDED_WITHOUT_COMMIT',
    status: 'OPEN',
    occurredAt: '2026-10-12T17:30:00.000Z',
    detectedAt: '2026-10-12T17:31:00.000Z',
    resolvedAt: null,
    resolutionReason: null,
    dismissal: null,
    limitations: [],
    context: { integrationConnected: true, pendingCommitSuggestions: 0 },
    subject: {
      type: 'TASK',
      id: 31,
      code: 'TASK-31',
      title: 'Publicar entrega',
      available: true,
      githubUrl: null
    },
    ...overrides
  };
}

const dismissed = (id) =>
  alert(id, {
    status: 'DISMISSED',
    dismissal: { at: '2026-10-13T12:00:00.000Z', reason: REASON, by: { id: 3, name: 'Carla Dias' } }
  });

const page = (alerts) => ({
  alerts,
  pagination: { page: 1, limit: 50, total: alerts.length, totalPages: alerts.length ? 1 : 0 },
  permissions: { canManage: true, canLink: true }
});

function renderSection(props = {}) {
  return render(
    <MemoryRouter>
      <TaskInconsistencySection
        projectId={5}
        taskId={31}
        canLink
        onLinkCommit={() => {}}
        {...props}
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TF-REV-010 — histórico de inconsistências da tarefa sem alerta aberto', () => {
  it('H-01 sem alerta aberto e com alerta dispensado, o histórico aparece com a justificativa', async () => {
    trace.getTraceabilityAlerts.mockResolvedValue(page([dismissed(400)]));
    const user = userEvent.setup();

    renderSection({ openAlertId: null });

    const toggle = await screen.findByRole('button', { name: 'Histórico (1)' });
    expect(screen.getByRole('heading', { name: 'Inconsistências anteriores' })).toBeInTheDocument();
    await user.click(toggle);
    expect(screen.getByText(/Dispensada por Carla Dias/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(REASON))).toBeInTheDocument();
    expect(trace.getTraceabilityAlerts).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ status: 'ALL', taskId: 31 }),
      expect.anything()
    );
  });

  it('H-02 depois de dispensar o último alerta, a seção continua com o histórico', async () => {
    trace.getTraceabilityAlert
      .mockResolvedValueOnce({ alert: alert(501), permissions: { canManage: true } })
      .mockResolvedValue({ alert: dismissed(501), permissions: { canManage: true } });
    trace.getTraceabilityAlerts
      .mockResolvedValueOnce(page([alert(501)]))
      .mockResolvedValue(page([dismissed(501)]));
    trace.dismissTraceabilityAlert.mockResolvedValue({ alert: dismissed(501) });
    const user = userEvent.setup();

    renderSection({ openAlertId: 501 });
    await user.click(await screen.findByRole('button', { name: 'Dispensar' }));
    await user.type(screen.getByLabelText('Justificativa'), REASON);
    await user.click(screen.getByRole('button', { name: 'Dispensar' }));

    expect(
      await screen.findByText('Inconsistência dispensada. O registro continua no histórico.')
    ).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Histórico (1)' }));
    expect(screen.getByText(new RegExp(REASON))).toBeInTheDocument();
  });

  it('H-03 tarefa sem histórico não mostra nada', async () => {
    trace.getTraceabilityAlerts.mockResolvedValue(page([]));

    const { container } = renderSection({ openAlertId: null });

    await waitFor(() => expect(trace.getTraceabilityAlerts).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByRole('button', { name: /Histórico/ })).not.toBeInTheDocument();
  });

  it('H-04 reabrir os detalhes depois de recarregar mantém o acesso ao histórico', async () => {
    trace.getTraceabilityAlerts.mockResolvedValue(page([dismissed(400), dismissed(401)]));

    const first = renderSection({ openAlertId: null });
    expect(await screen.findByRole('button', { name: 'Histórico (2)' })).toBeInTheDocument();
    first.unmount();
    renderSection({ openAlertId: null });

    expect(await screen.findByRole('button', { name: 'Histórico (2)' })).toBeInTheDocument();
    expect(trace.getTraceabilityAlerts).toHaveBeenCalledTimes(2);
  });
});
