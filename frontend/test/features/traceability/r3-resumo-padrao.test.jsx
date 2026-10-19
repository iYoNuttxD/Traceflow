import { readFileSync } from 'node:fs';
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

const OWN_CSS = 'src/features/traceability/components/InconsistencySummary.css';
const SUMMARY_CSS = 'src/features/schedule/pages/SprintsScreen.css';
const TRACEABILITY_CSS = 'src/features/traceability/pages/TraceabilityScreen.css';
const escaped = (text) => text.replace(/[.()]/g, (character) => `\\${character}`);
const ruleOf = (css, selector) =>
  css.match(new RegExp(`(?:^|\\n)${escaped(selector)} \\{([^}]*)\\}`))?.[1] ?? '';

describe('UX-R3-02 — inconsistências no padrão do resumo', () => {
  it('R-05 as contagens usam as células e a tipografia das métricas de requisito', async () => {
    trace.getTraceabilityAlertSummary.mockResolvedValue(
      summary({ byType: { TASK_CONCLUDED_WITHOUT_COMMIT: 3 } })
    );
    renderSummary();

    const group = await groupOf();
    await within(group).findByRole('link', { name: '3 tarefas concluídas sem commit' });
    const list = group.querySelector('dl');

    expect(list).toHaveClass('requirement-metrics', 'trace-inconsistency-summary__metrics');
    expect([...list.children]).toHaveLength(3);
    for (const cell of list.children) {
      expect(cell).toHaveClass('sprints-summary__metric');
      expect([...cell.children].map((node) => node.tagName)).toEqual(['DT', 'DD']);
    }
    const own = readFileSync(OWN_CSS, 'utf8');
    expect(own).not.toMatch(/__metrics d[td][^{]*\{[^}]*(font-size|font-weight|text-transform)/);
    expect(ruleOf(readFileSync(TRACEABILITY_CSS, 'utf8'), '.requirement-metrics dd')).toMatch(
      /font-size: var\(--font-size-5\);[\s\S]*font-weight: var\(--font-weight-bold\);/
    );
  });

  it('R-06 os números são links com nome acessível, alcançados pelo teclado na ordem das células', async () => {
    trace.getTraceabilityAlertSummary.mockResolvedValue(
      summary({
        byType: {
          TASK_CONCLUDED_WITHOUT_COMMIT: 3,
          PULL_REQUEST_MERGED_WITHOUT_TASK: 1204,
          ISSUE_CLOSED_WITHOUT_TASK: 1
        }
      })
    );
    const user = userEvent.setup();
    renderSummary();

    const links = await within(await groupOf()).findAllByRole('link');

    expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
      '3 tarefas concluídas sem commit',
      '1.204 PRs mescladas sem tarefa',
      '1 issue fechada sem tarefa'
    ]);
    expect(links.map((link) => link.textContent)).toEqual(['3', '1.204', '1']);
    for (const link of links) {
      await user.tab();
      expect(link).toHaveFocus();
    }
  });

  it('R-07 o título fica no recuo horizontal das células, e o grupo não recua a faixa', () => {
    const own = readFileSync(OWN_CSS, 'utf8');
    const horizontal = (block) => block.match(/padding: ([^;]+);/)?.[1].split(' ')[1];

    expect(horizontal(ruleOf(own, '.trace-inconsistency-summary__heading'))).toBe('var(--space-5)');
    expect(horizontal(ruleOf(readFileSync(SUMMARY_CSS, 'utf8'), '.sprints-summary__metric'))).toBe(
      'var(--space-5)'
    );
    expect(ruleOf(own, '.trace-inconsistency-summary')).not.toMatch(/padding/);
  });

  it('R-08 três colunas, e uma abaixo de 34rem, sem célula órfã', () => {
    const own = readFileSync(OWN_CSS, 'utf8');
    const narrow = own.match(/@container sprints-page \(max-width: 34rem\) \{([\s\S]*?)\n\}/)?.[1];

    expect(ruleOf(own, '.requirement-metrics.trace-inconsistency-summary__metrics')).toMatch(
      /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/
    );
    expect(narrow).toMatch(
      /\.requirement-metrics\.trace-inconsistency-summary__metrics \{\s*grid-template-columns: minmax\(0, 1fr\);/
    );
    expect(readFileSync(TRACEABILITY_CSS, 'utf8')).toMatch(
      /@container sprints-page \(max-width: 34rem\) \{[\s\S]*?\.requirement-metrics \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/
    );
  });
});
