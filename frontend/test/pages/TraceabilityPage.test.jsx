import { MemoryRouter, Route, Routes, Link } from 'react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RequirementCard,
  RequirementSummary
} from '../../src/features/traceability/components/RequirementCatalog.jsx';
import { RequirementHistory } from '../../src/features/traceability/components/RequirementHistory.jsx';
import { TraceabilityPhaseTrail } from '../../src/features/traceability/components/TraceabilityPhaseTrail.jsx';
import {
  situations,
  overviewMetrics
} from '../../src/features/traceability/model/requirement-view.js';
const api = vi.hoisted(() => ({
  getRequirementsTraceability: vi.fn(),
  getRequirementTraceability: vi.fn(),
  getRequirementSituationHistory: vi.fn()
}));
vi.mock('../../src/features/traceability/api/traceability.api.js', () => api);
vi.mock('../../src/features/traceability/components/TraceabilityFlow.jsx', () => ({
  TraceabilityFlow: ({ traceability }) => (
    <div data-testid="flow">{traceability.nodes.map((node) => node.data.title).join(' | ')}</div>
  )
}));
import { TraceabilityPage } from '../../src/pages/TraceabilityPage.jsx';
function item(id = 10, situation = 'EM_DESENVOLVIMENTO') {
  return {
    requirement: { id, displayId: `REQ-${id}`, title: `Requisito ${id}`, status: 'APROVADO' },
    situation,
    progress: { percentage: 25, tasksTotal: 4, tasksDone: 1 },
    artifacts: { pullRequests: 2, commits: 3, issues: 4 },
    validation: { testCasesTotal: 8, pass: 2, fail: 1, blocked: 3, neverExecuted: 2 },
    defects: { total: 5, open: 1, inCorrection: 2, waitingRetest: 1, validated: 1 },
    evidence: { implementation: true, validation: false, correction: 'MISSING' }
  };
}
function result(items = [item()], page = 1, totalPages = 1) {
  return {
    items,
    summary: {
      total: 40,
      bySituation: {
        PLANEJADO: 5,
        EM_DESENVOLVIMENTO: 6,
        IMPLEMENTADO: 7,
        AGUARDANDO_VALIDACAO: 2,
        EM_VALIDACAO: 3,
        VALIDADO: 4,
        CONCLUIDO: 1
      },
      withDefect: 9
    },
    pagination: { page, totalPages, total: 40 }
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const graph = (title) => ({ nodes: [{ data: { title } }] });
const event = (id, reason = 'TASK_STATUS_CHANGED') => ({
  id,
  reason,
  fromSituation: 'CONCLUIDO',
  toSituation: 'AGUARDANDO_VALIDACAO',
  sourceEntityType: 'Task',
  sourceEntityId: 5,
  occurredAt: '2026-09-10T12:00:00Z'
});
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/9/traceability']}>
      <Link to="/projects/8/traceability">Projeto B</Link>
      <Routes>
        <Route path="/projects/:projectId/traceability" element={<TraceabilityPage />} />
      </Routes>
    </MemoryRouter>
  );
}
async function filters(user) {
  await user.click(await screen.findByRole('button', { name: /Buscar e filtrar/ }));
}
async function settle(request, value) {
  await act(async () => request.resolve(value));
}
beforeEach(() => {
  vi.resetAllMocks();
  api.getRequirementsTraceability.mockResolvedValue(result());
  api.getRequirementTraceability.mockResolvedValue(graph('Grafo atual'));
  api.getRequirementSituationHistory.mockResolvedValue({ items: [], nextCursor: null });
});
describe('Requirement projections and cards', () => {
  it('represents reached phases independently from progress and follows a current regression', () => {
    const projection = item(4, 'EM_CORRECAO');
    const { rerender } = render(<TraceabilityPhaseTrail projection={projection} />);
    expect(
      screen.getByRole('listitem', { name: 'Implementação: Já alcançada' })
    ).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Correção: Atual' })).toHaveAttribute(
      'aria-current',
      'step'
    );
    rerender(<TraceabilityPhaseTrail projection={{ ...projection, situation: 'CONCLUIDO' }} />);
    expect(screen.getByRole('listitem', { name: 'Conclusão: Atual' })).toHaveAttribute(
      'aria-current',
      'step'
    );
    rerender(
      <TraceabilityPhaseTrail projection={{ ...projection, situation: 'AGUARDANDO_VALIDACAO' }} />
    );
    expect(screen.getByRole('listitem', { name: 'Validação: Atual' })).toHaveAttribute(
      'aria-current',
      'step'
    );
    expect(
      screen.getByRole('listitem', { name: 'Conclusão: Ainda não alcançada' })
    ).toBeInTheDocument();
    expect(projection.progress.percentage).toBe(25);
    expect(projection.situation).toBe('EM_CORRECAO');
  });
  it('does not invent a correction cycle for a concluded chain without defects', () => {
    render(
      <TraceabilityPhaseTrail projection={{ situation: 'CONCLUIDO', defects: { total: 0 } }} />
    );
    expect(
      screen.getByRole('listitem', { name: 'Correção: Ainda não alcançada' })
    ).toBeInTheDocument();
  });
  it('describes the overview and uses the same authoritative situations as the four cards', () => {
    const items = ['EM_CORRECAO', 'COM_FALHA', 'EM_DESENVOLVIMENTO', 'SEM_RASTREABILIDADE'].map(
      (s, i) => item(i + 1, s)
    );
    const summary = {
      total: 4,
      withDefect: 2,
      bySituation: { CONCLUIDO: 0, ...Object.fromEntries(items.map((i) => [i.situation, 1])) }
    };
    render(
      <>
        <RequirementSummary summary={summary} />
        {items.map((i) => (
          <RequirementCard key={i.requirement.id} item={i} />
        ))}
      </>
    );
    expect(screen.getByText(/Acompanhe a distribuição dos requisitos/)).toBeInTheDocument();
    expect(overviewMetrics(summary).map((m) => m[1])).toEqual([4, 1, 0, 2, 0]);
    expect(
      screen.getAllByText(/^(Em correção|Com falha)$/, { selector: '.requirement-situation' })
    ).toHaveLength(2);
  });
  it.each(Object.keys(situations))(
    'presents authoritative situation %s independently from status/progress',
    (situation) => {
      render(<RequirementCard item={item(10, situation)} onSelect={vi.fn()} onHistory={vi.fn()} />);
      expect(
        screen.getByText(situations[situation][0], { selector: '.requirement-situation' })
      ).toBeInTheDocument();
      expect(screen.queryByText(/Status do requisito:/)).not.toBeInTheDocument();
      expect(
        screen.getByRole('list', { name: 'Evolução das fases da rastreabilidade' })
      ).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    }
  );
  it('sums only server overview buckets, never the loaded page', () => {
    expect(overviewMetrics(result().summary).map((m) => m[1])).toEqual([40, 18, 9, 9, 1]);
    render(<RequirementSummary />);
    expect(screen.getAllByText('—')).toHaveLength(5);
  });
  it('keeps null progress and correction not applicable distinct from zero and missing', () => {
    const data = item();
    data.progress = { percentage: null, tasksTotal: 0, tasksDone: 0 };
    data.evidence.correction = 'NOT_APPLICABLE';
    render(<RequirementCard item={data} />);
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    expect(screen.getByText('Nenhuma tarefa relacionada')).toBeInTheDocument();
    expect(screen.getByLabelText('Correção: Não aplicável')).toBeInTheDocument();
  });
  it('renders authoritative counts/evidence without recomputation', () => {
    const data = item();
    data.evidence.correction = 'PRESENT';
    render(<RequirementCard item={data} />);
    for (const label of [
      'PRs: 2',
      'Commits: 3',
      'Issues: 4',
      'PASS: 2',
      'FAIL: 1',
      'BLOCKED: 3',
      'Pendentes: 2',
      'Abertos: 1',
      'Em correção: 2',
      'Aguardando reteste: 1',
      'Validados: 1',
      'Correção: Presente'
    ])
      expect(screen.getByLabelText(label)).toBeInTheDocument();
  });
  it('supports distinct keyboard actions without duplicate activation', async () => {
    const user = userEvent.setup(),
      onSelect = vi.fn(),
      onHistory = vi.fn();
    render(<RequirementCard item={item()} selected onSelect={onSelect} onHistory={onHistory} />);
    screen.getByRole('button', { name: 'Ver rastreabilidade' }).focus();
    await user.keyboard('{Enter}');
    await user.tab();
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onHistory).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('article')).toHaveAttribute('aria-current', 'true');
  });
});
describe('Traceability catalog', () => {
  it('closes during load, returns focus and never reopens from a late response', async () => {
    const user = userEvent.setup(),
      pending = deferred();
    api.getRequirementTraceability.mockReturnValue(pending.promise);
    renderPage();
    const trigger = await screen.findByRole('button', { name: 'Ver rastreabilidade' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Fechar rastreabilidade — req-10' }));
    await settle(pending, graph('antigo'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('uses projections and preserves graph contract and heading focus', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('Ver rastreabilidade'));
    expect(await screen.findByTestId('flow')).toHaveTextContent('Grafo atual');
    expect(api.getRequirementTraceability).toHaveBeenCalledWith(
      '9',
      10,
      { expanded: true, limit: 100 },
      { signal: expect.any(AbortSignal) }
    );
    expect(screen.getByRole('dialog', { name: 'Rastreabilidade — REQ-10' })).toBeInTheDocument();
  });
  it('presents connection errors without empty state or internal details', async () => {
    api.getRequirementsTraceability.mockRejectedValueOnce({
      response: { status: 503, data: { message: 'stack: private' } }
    });
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'Não foi possível conectar ao TRACEFLOW.' })
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('private');
    expect(
      screen.queryByText('Nenhum requisito cadastrado para este projeto.')
    ).not.toBeInTheDocument();
  });
  it('renders empty projection and collapsed filters', async () => {
    api.getRequirementsTraceability.mockResolvedValue(result([]));
    renderPage();
    expect(
      await screen.findByText('Nenhum requisito cadastrado para este projeto.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Buscar e filtrar/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });
  it('has no empty clear-action wrapper and resets active filters', async () => {
    const user = userEvent.setup(),
      view = renderPage();
    await filters(user);
    expect(view.container.querySelector('.planning-filter-panel__actions')).toBeNull();
    await user.selectOptions(screen.getByLabelText('Situação'), 'COM_FALHA');
    await waitFor(() =>
      expect(api.getRequirementsTraceability).toHaveBeenLastCalledWith(
        '9',
        expect.objectContaining({ situation: 'COM_FALHA', page: 1 }),
        expect.anything()
      )
    );
    await user.click(screen.getByText('Limpar filtros'));
    await waitFor(() =>
      expect(view.container.querySelector('.planning-filter-panel__actions')).toBeNull()
    );
  });
  it.each([
    ['Status do requisito', 'requirementStatus', 'CONCLUIDO'],
    ['Com casos de teste', 'hasTests', 'false'],
    ['Com defeitos pendentes', 'hasOpenDefects', 'true'],
    ['Com evidência técnica', 'hasTechnicalEvidence', 'false']
  ])('sends %s to backend', async (label, key, value) => {
    const user = userEvent.setup();
    renderPage();
    await filters(user);
    await user.selectOptions(screen.getByLabelText(label), value);
    await waitFor(() =>
      expect(api.getRequirementsTraceability).toHaveBeenLastCalledWith(
        '9',
        expect.objectContaining({ [key]: value, page: 1 }),
        expect.anything()
      )
    );
  });
  it('debounces search and immediately invalidates pending response', async () => {
    const user = userEvent.setup(),
      old = deferred();
    api.getRequirementsTraceability.mockReturnValueOnce(old.promise);
    renderPage();
    await filters(user);
    await user.type(screen.getByPlaceholderText('REQ-id ou título'), 'REQ-22');
    await settle(old, result([item(99)]));
    expect(screen.queryByText('Requisito 99')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(api.getRequirementsTraceability).toHaveBeenLastCalledWith(
        '9',
        expect.objectContaining({ search: 'REQ-22', page: 1 }),
        expect.anything()
      )
    );
    expect(api.getRequirementsTraceability).toHaveBeenCalledTimes(2);
  });
  it('deduplicates pages and rejects obsolete append after filtering', async () => {
    const user = userEvent.setup(),
      more = deferred();
    api.getRequirementsTraceability
      .mockResolvedValueOnce(result([item(10)], 1, 3))
      .mockResolvedValueOnce(result([item(10), item(11)], 2, 3))
      .mockReturnValueOnce(more.promise)
      .mockResolvedValue(result([item(20)]));
    renderPage();
    await user.click(await screen.findByText('Carregar mais requisitos'));
    await screen.findByText('Requisito 11');
    expect(screen.getAllByText('Requisito 10')).toHaveLength(1);
    await user.click(screen.getByText('Carregar mais requisitos'));
    await filters(user);
    await user.selectOptions(screen.getByLabelText('Situação'), 'CONCLUIDO');
    await screen.findByText('Requisito 20');
    await settle(more, result([item(99)], 3, 3));
    expect(screen.queryByText('Requisito 99')).not.toBeInTheDocument();
  });
  it('keeps latest filter response when transport ignores abort', async () => {
    const user = userEvent.setup(),
      a = deferred(),
      b = deferred();
    api.getRequirementsTraceability
      .mockResolvedValueOnce(result())
      .mockReturnValueOnce(a.promise)
      .mockReturnValueOnce(b.promise);
    renderPage();
    await filters(user);
    await user.selectOptions(screen.getByLabelText('Situação'), 'COM_FALHA');
    await waitFor(() => expect(api.getRequirementsTraceability).toHaveBeenCalledTimes(2));
    await user.selectOptions(screen.getByLabelText('Situação'), 'CONCLUIDO');
    await waitFor(() => expect(api.getRequirementsTraceability).toHaveBeenCalledTimes(3));
    await settle(b, result([item(20)]));
    await settle(a, result([item(99)]));
    expect(screen.getByText('Requisito 20')).toBeInTheDocument();
    expect(screen.queryByText('Requisito 99')).not.toBeInTheDocument();
  });
  it('ignores obsolete project response', async () => {
    const user = userEvent.setup(),
      old = deferred();
    api.getRequirementsTraceability
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue(result([item(8)]));
    renderPage();
    await user.click(screen.getByText('Projeto B'));
    await screen.findByText('Requisito 8');
    await settle(old, result([item(99)]));
    expect(screen.queryByText('Requisito 99')).not.toBeInTheDocument();
  });
  it('keeps graph B after late graph A failure', async () => {
    const user = userEvent.setup(),
      a = deferred(),
      b = deferred();
    api.getRequirementsTraceability.mockResolvedValue(result([item(10), item(11)]));
    api.getRequirementTraceability.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    renderPage();
    await user.click((await screen.findAllByText('Ver rastreabilidade'))[0]);
    await user.click(screen.getByRole('button', { name: 'Fechar rastreabilidade — req-10' }));
    await user.click(screen.getAllByText('Ver rastreabilidade')[1]);
    await settle(b, graph('Grafo B'));
    await act(async () => a.reject(new Error('antigo')));
    expect(screen.getByTestId('flow')).toHaveTextContent('Grafo B');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('retries graph without erasing catalog', async () => {
    const user = userEvent.setup();
    api.getRequirementTraceability.mockRejectedValueOnce(new Error('failed'));
    renderPage();
    await user.click(await screen.findByText('Ver rastreabilidade'));
    await screen.findByRole('alert');
    expect(screen.getByRole('dialog')).toHaveTextContent('Requisito 10');
    await user.click(screen.getByText('Tentar novamente'));
    await screen.findByTestId('flow');
    expect(api.getRequirementsTraceability).toHaveBeenCalledTimes(1);
  });
  it('opens history and returns focus after Escape', async () => {
    const user = userEvent.setup();
    renderPage();
    const trigger = await screen.findByText('Histórico');
    await user.click(trigger);
    await screen.findByRole('dialog', { name: 'Histórico — REQ-10 · Requisito 10' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(api.getRequirementTraceability).not.toHaveBeenCalled();
  });
});
describe('Requirement history', () => {
  it('renders baseline without invented prior situation and factual regression', async () => {
    api.getRequirementSituationHistory.mockResolvedValue({
      items: [{ ...event(1, 'BASELINE_INITIALIZED'), fromSituation: null }, event(2)],
      nextCursor: null
    });
    render(<RequirementHistory projectId="9" requirementId={10} />);
    await screen.findByText('Baseline da rastreabilidade registrado');
    expect(
      screen.getByText('Situação inicial observada: Aguardando validação')
    ).toBeInTheDocument();
    expect(screen.getByText('Concluído → Aguardando validação')).toBeInTheDocument();
    expect(screen.getByText('Status da tarefa alterado')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/TASK_STATUS_CHANGED|DONE|Situação indisponível/);
  });
  it('paginates opaque cursor, deduplicates and retries same cursor', async () => {
    const user = userEvent.setup();
    api.getRequirementSituationHistory
      .mockResolvedValueOnce({ items: [event(2)], nextCursor: 'opaque-cursor' })
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce({ items: [event(2), event(1, 'RECONCILIATION')], nextCursor: null });
    render(<RequirementHistory projectId="9" requirementId={10} />);
    await user.click(await screen.findByText('Carregar mais eventos'));
    await user.click(await screen.findByText('Tentar novamente'));
    await screen.findByText('Rastreabilidade reconciliada');
    expect(screen.getAllByText('Status da tarefa alterado')).toHaveLength(1);
    expect(api.getRequirementSituationHistory).toHaveBeenLastCalledWith(
      '9',
      10,
      { limit: 30, cursor: 'opaque-cursor' },
      { signal: expect.any(AbortSignal) }
    );
    expect(screen.queryByText('Carregar mais eventos')).not.toBeInTheDocument();
  });
  it('rejects late history A after opening B', async () => {
    const user = userEvent.setup(),
      a = deferred();
    api.getRequirementsTraceability.mockResolvedValue(result([item(10), item(11)]));
    api.getRequirementSituationHistory
      .mockReturnValueOnce(a.promise)
      .mockResolvedValueOnce({ items: [event(2, 'RECONCILIATION')], nextCursor: null });
    renderPage();
    await user.click((await screen.findAllByText('Histórico'))[0]);
    await user.keyboard('{Escape}');
    await user.click(screen.getAllByText('Histórico')[1]);
    await screen.findByText('Rastreabilidade reconciliada');
    await settle(a, { items: [event(1)], nextCursor: null });
    expect(
      within(screen.getByRole('dialog')).queryByText('Status da tarefa alterado')
    ).not.toBeInTheDocument();
  });
});

describe('Additional traceability regressions', () => {
  it.each([
    ['EM_DESENVOLVIMENTO', 'IMPLEMENTADO'],
    ['IMPLEMENTADO', 'AGUARDANDO_VALIDACAO'],
    ['EM_VALIDACAO', 'COM_FALHA'],
    ['COM_FALHA', 'EM_CORRECAO'],
    ['EM_CORRECAO', 'AGUARDANDO_RETESTE'],
    ['AGUARDANDO_RETESTE', 'VALIDADO'],
    ['AGUARDANDO_RETESTE', 'CONCLUIDO']
  ])('renders historical transition %s to %s', async (from, to) => {
    api.getRequirementSituationHistory.mockResolvedValue({
      items: [{ ...event(1), fromSituation: from, toSituation: to }],
      nextCursor: null
    });
    render(<RequirementHistory projectId="9" requirementId={10} />);
    expect(
      await screen.findByText(`${situations[from][0]} → ${situations[to][0]}`)
    ).toBeInTheDocument();
  });
  it('rejects search A after search B resolves', async () => {
    const user = userEvent.setup(),
      a = deferred(),
      b = deferred();
    api.getRequirementsTraceability
      .mockResolvedValueOnce(result())
      .mockReturnValueOnce(a.promise)
      .mockReturnValueOnce(b.promise);
    renderPage();
    await filters(user);
    await user.type(screen.getByPlaceholderText('REQ-id ou título'), 'A');
    await waitFor(() => expect(api.getRequirementsTraceability).toHaveBeenCalledTimes(2));
    await user.clear(screen.getByPlaceholderText('REQ-id ou título'));
    await user.type(screen.getByPlaceholderText('REQ-id ou título'), 'B');
    await waitFor(() => expect(api.getRequirementsTraceability).toHaveBeenCalledTimes(3));
    await settle(b, result([item(22)]));
    await settle(a, result([item(99)]));
    expect(screen.getByText('Requisito 22')).toBeInTheDocument();
    expect(screen.queryByText('Requisito 99')).not.toBeInTheDocument();
  });
  it('retries the failed catalog page without duplicating existing items', async () => {
    const user = userEvent.setup();
    api.getRequirementsTraceability
      .mockResolvedValueOnce(result([item(10)], 1, 2))
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce(result([item(11)], 2, 2));
    renderPage();
    await user.click(await screen.findByText('Carregar mais requisitos'));
    await user.click(await screen.findByText('Tentar novamente'));
    await screen.findByText('Requisito 11');
    expect(screen.getAllByText('Requisito 10')).toHaveLength(1);
    expect(api.getRequirementsTraceability).toHaveBeenLastCalledWith(
      '9',
      expect.objectContaining({ page: 2 }),
      expect.anything()
    );
  });
  it('clears selected graph and filters when visiting a different project', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('Ver rastreabilidade'));
    await screen.findByTestId('flow');
    await filters(user);
    await user.selectOptions(screen.getByLabelText('Situação'), 'COM_FALHA');
    await user.click(screen.getByText('Projeto B'));
    await screen.findByText('Requisito 10');
    expect(screen.queryByTestId('flow')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Buscar e filtrar/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(api.getRequirementsTraceability).toHaveBeenLastCalledWith(
      '8',
      expect.objectContaining({ situation: '', search: '', page: 1 }),
      expect.anything()
    );
  });
});
