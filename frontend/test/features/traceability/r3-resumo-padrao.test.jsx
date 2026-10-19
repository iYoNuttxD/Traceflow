import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const trace = vi.hoisted(() => ({ getTraceabilityAlertSummary: vi.fn() }));
vi.mock('../../../src/features/traceability/api/traceability.api.js', () => trace);

const { InconsistencySummary } =
  await import('../../../src/features/traceability/components/InconsistencySummary.jsx');
const { formatInstant } = await import('../../../src/features/traceability/model/alert-view.js');

const SUCCEEDED = '2026-10-17T09:00:00.000Z';
const FAILED = '2026-10-18T10:00:00.000Z';
const PERMISSIONS = {
  OWNER: { canLink: true, canDismiss: true, canManage: true },
  MANAGER: { canLink: true, canDismiss: true, canManage: true },
  MEMBER: { canLink: true, canDismiss: false, canManage: false },
  VIEWER: { canLink: false, canDismiss: false, canManage: false }
};

function summary({ byType = {}, reconciliation = {}, permissions = PERMISSIONS.MANAGER } = {}) {
  return {
    projectId: 9,
    open: { total: Object.values(byType).reduce((sum, count) => sum + count, 0), byType },
    dismissed: { total: 0 },
    rules: { taskWithoutCommitActive: true, integrationConnected: true },
    reconciliation: {
      state: 'CURRENT',
      lastAttemptAt: SUCCEEDED,
      lastSucceededAt: SUCCEEDED,
      lastFailedAt: null,
      lastTrigger: 'SCHEDULED',
      ...reconciliation
    },
    permissions
  };
}

const renderSummary = () =>
  render(
    <MemoryRouter>
      <InconsistencySummary projectId="9" />
    </MemoryRouter>
  );

const groupOf = () => screen.findByRole('group', { name: 'Inconsistências abertas' });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('UX-R3-03 — atualização interna das inconsistências, sem o botão', () => {
  it.each(Object.keys(PERMISSIONS))('R-01 %s não vê botão de reprocessar', async (role) => {
    trace.getTraceabilityAlertSummary.mockResolvedValue(
      summary({
        permissions: PERMISSIONS[role],
        reconciliation: { state: 'STALE', lastFailedAt: FAILED }
      })
    );
    renderSummary();

    const group = await groupOf();
    await within(group).findByText(/podem estar desatualizados/);

    expect(within(group).queryByRole('button')).toBeNull();
    expect(group).not.toHaveTextContent(/Reprocessar|reprocessar/);
  });

  it('R-02 antes da primeira reconciliação, as contagens mostram "—" e o texto explica', async () => {
    trace.getTraceabilityAlertSummary.mockResolvedValue(
      summary({
        reconciliation: {
          state: 'PENDING_FIRST',
          lastAttemptAt: null,
          lastSucceededAt: null,
          lastTrigger: null
        }
      })
    );
    renderSummary();

    const group = await groupOf();
    const status = await within(group).findByRole('status');

    expect(status).toHaveTextContent(
      'As inconsistências deste projeto ainda não foram calculadas.'
    );
    expect(within(group).getAllByText('—')).toHaveLength(3);
    expect(within(group).queryByText('0')).toBeNull();
    expect(within(group).queryByRole('link')).toBeNull();
  });

  it('R-03 desatualizado diz o que houve e quando, sem instrução de clique nem horário prometido', async () => {
    trace.getTraceabilityAlertSummary
      .mockResolvedValueOnce(
        summary({
          byType: { ISSUE_CLOSED_WITHOUT_TASK: 2 },
          reconciliation: { state: 'STALE', lastAttemptAt: FAILED, lastFailedAt: FAILED }
        })
      )
      .mockResolvedValueOnce(
        summary({ reconciliation: { state: 'STALE', lastAttemptAt: FAILED } })
      );
    const first = renderSummary();

    const failed = await within(await groupOf()).findByRole('status');
    expect(failed).toHaveTextContent(
      `A última atualização das inconsistências falhou em ${formatInstant(FAILED)}. Os números podem estar desatualizados.`
    );
    expect(screen.getByRole('link', { name: '2 issues fechadas sem tarefa' })).toBeInTheDocument();
    first.unmount();

    renderSummary();
    const old = await within(await groupOf()).findByRole('status');
    expect(old).toHaveTextContent(
      `A última atualização das inconsistências foi em ${formatInstant(SUCCEEDED)}. Os números podem estar desatualizados.`
    );
    for (const notice of [failed, old])
      expect(notice.textContent).not.toMatch(/clique|Use |Peça|próxima|tente/i);
  });

  it('R-04 erro ao carregar o resumo mostra o estado de erro, nunca zero, e a nova tentativa recupera', async () => {
    const user = userEvent.setup();
    trace.getTraceabilityAlertSummary
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce(summary({ byType: { TASK_CONCLUDED_WITHOUT_COMMIT: 1 } }));
    renderSummary();

    const retry = await screen.findByRole('button', { name: /Tentar novamente/ });
    const group = await groupOf();

    expect(within(group).queryByText('0')).toBeNull();
    expect(within(group).queryByText('—')).toBeNull();
    await user.click(retry);
    expect(
      await screen.findByRole('link', { name: '1 tarefa concluída sem commit' })
    ).toBeInTheDocument();
  });
});
