import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  dashboard: vi.fn(),
  members: vi.fn(),
  sync: vi.fn(),
  sprints: vi.fn(),
  projects: vi.fn()
}));
vi.mock('../../src/features/projects/index.js', async (original) => ({
  ...(await original()),
  useProjectsCatalog: mocks.projects
}));
vi.mock('../../src/features/members/index.js', () => ({ membersApi: { list: mocks.members } }));
vi.mock('../../src/features/github/index.js', () => ({ getProjectGithubSyncStatus: mocks.sync }));
vi.mock('../../src/features/indicators/api/indicators.api.js', () => ({
  indicatorsApi: { dashboard: mocks.dashboard, catalog: mocks.catalog }
}));
vi.mock('../../src/features/schedule/api/schedule.api.js', () => ({
  scheduleApi: { listSprints: mocks.sprints }
}));
import { IndicatorsPage } from '../../src/pages/IndicatorsPage.jsx';
import { ProjectHealthSummary } from '../../src/features/indicators/components/ProjectHealthSummary.jsx';
const health = (score) => ({
  score,
  status: 'HEALTHY',
  coverage: 80,
  assessedDimensions: 4,
  dimensions: [{ id: 'PLANNING', score, status: 'HEALTHY' }],
  drivers: { positive: [], negative: [] }
});
const data = (score) => ({
  data: {
    projectHealth: health(score),
    sections: [],
    viewState: 'NO_DATA',
    requestedFilters: {},
    context: {},
    warnings: []
  }
});
let navigate;
function Harness() {
  navigate = useNavigate();
  return <IndicatorsPage />;
}
function page() {
  return render(
    <MemoryRouter initialEntries={['/projects/1/indicators']}>
      <Routes>
        <Route path="/projects/:projectId/indicators" element={<Harness />} />
      </Routes>
    </MemoryRouter>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.projects.mockReturnValue({
    projects: [
      { id: 1, name: 'Um' },
      { id: 2, name: 'Dois' }
    ],
    loading: false
  });
  mocks.catalog.mockResolvedValue({ data: { indicators: [] } });
  mocks.dashboard.mockResolvedValue(data(84));
  mocks.members.mockResolvedValue({ members: [], currentMembership: { role: 'VIEWER' } });
  mocks.sync.mockResolvedValue({ run: null });
  mocks.sprints.mockResolvedValue({ data: { sprints: [] } });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe('P8.5 Indicators workspace', () => {
  it('renders the project route, canonical summary, active navigation and a single collapsed filter for VIEWER', async () => {
    page();
    expect(
      await screen.findByRole('heading', { name: 'Indicadores', level: 1 })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Indicadores' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Indicadores' })).toHaveAttribute(
      'href',
      '/projects/1/indicators'
    );
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Visão geral dos indicadores' })).toHaveTextContent(
        '84 / 100'
      )
    );
    expect(screen.getAllByRole('tab')).toHaveLength(9);
    expect(screen.getByRole('button', { name: /Buscar e filtrar/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.getAllByRole('button', { name: 'Atualizar indicadores' })).toHaveLength(1);
    expect(mocks.dashboard).toHaveBeenCalledWith(
      1,
      { view: 'GENERAL', includeProjectHealth: true },
      expect.any(Object)
    );
  });
  it('clears old summary and ignores the old project response even if transport ignores abort', async () => {
    let finish;
    mocks.dashboard.mockImplementation((id) =>
      id === 1
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(data(63))
    );
    page();
    await waitFor(() => expect(mocks.dashboard).toHaveBeenCalledOnce());
    await act(async () => navigate('/projects/2/indicators'));
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Visão geral dos indicadores' })).toHaveTextContent(
        '63 / 100'
      )
    );
    await act(async () => finish(data(99)));
    expect(
      screen.getByRole('region', { name: 'Visão geral dos indicadores' })
    ).not.toHaveTextContent('99 / 100');
    expect(screen.getByRole('link', { name: 'Indicadores' })).toHaveAttribute(
      'href',
      '/projects/2/indicators'
    );
  });
  it('refetches indicators and summary together only after a confirmed sync, never on focus or visibility', async () => {
    vi.useFakeTimers();
    mocks.sync
      .mockResolvedValueOnce({ run: { id: 4, status: 'RUNNING' } })
      .mockResolvedValue({ run: { id: 4, status: 'SUCCEEDED' } });
    mocks.dashboard.mockResolvedValueOnce(data(54)).mockResolvedValue(data(88));
    page();
    await act(async () => {});
    expect(screen.getByRole('region', { name: 'Visão geral dos indicadores' })).toHaveTextContent(
      '54 / 100'
    );
    await act(async () => vi.advanceTimersByTimeAsync(2500));
    expect(mocks.dashboard).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('region', { name: 'Visão geral dos indicadores' })).toHaveTextContent(
      '88 / 100'
    );
    const probes = mocks.sync.mock.calls.length;
    fireEvent.blur(window);
    fireEvent.focus(window);
    fireEvent(document, new Event('visibilitychange'));
    await act(async () => vi.advanceTimersByTimeAsync(30000));
    expect(mocks.dashboard).toHaveBeenCalledTimes(2);
    expect(mocks.sync).toHaveBeenCalledTimes(probes);
  });
  it('retries a transient status failure and refreshes once the observed run completes', async () => {
    vi.useFakeTimers();
    mocks.sync
      .mockResolvedValueOnce({ run: { id: 4, status: 'RUNNING' } })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ run: { id: 4, status: 'SUCCEEDED' } });
    page();
    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(2500));
    expect(mocks.dashboard).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTimeAsync(2500));
    expect(mocks.sync).toHaveBeenCalledTimes(3);
    expect(mocks.dashboard).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(20000));
    expect(mocks.sync).toHaveBeenCalledTimes(3);
  });
  it('bounds offline retries and does not restart on focus', async () => {
    vi.useFakeTimers();
    mocks.sync.mockRejectedValue(new Error('offline'));
    page();
    await act(async () => {});
    for (const delay of [2500, 5000, 10000]) {
      const calls = mocks.sync.mock.calls.length;
      await act(async () => vi.advanceTimersByTimeAsync(delay - 1));
      expect(mocks.sync).toHaveBeenCalledTimes(calls);
      await act(async () => vi.advanceTimersByTimeAsync(1));
      expect(mocks.sync).toHaveBeenCalledTimes(calls + 1);
    }
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(mocks.sync).toHaveBeenCalledTimes(4);
    fireEvent.focus(window);
    await act(async () => {});
    expect(mocks.sync).toHaveBeenCalledTimes(4);
    await act(async () => vi.advanceTimersByTimeAsync(2500));
    expect(mocks.sync).toHaveBeenCalledTimes(4);
  });
  it.each(['project', 'unmount'])(
    'does not retry a failed obsolete probe after %s',
    async (change) => {
      vi.useFakeTimers();
      let rejectOld;
      mocks.sync.mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectOld = reject;
        })
      );
      const view = page();
      await act(async () => {});
      const oldSignal = mocks.sync.mock.calls[0][1].signal;
      if (change === 'project') await act(async () => navigate('/projects/2/indicators'));
      else view.unmount();
      await act(async () => {});
      const currentCalls = mocks.sync.mock.calls.length;
      await act(async () => rejectOld(new Error('late offline')));
      await act(async () => vi.advanceTimersByTimeAsync(60000));
      expect(mocks.sync).toHaveBeenCalledTimes(currentCalls);
      expect(oldSignal.aborted).toBe(true);
    }
  );
  it('cancels an already scheduled retry on project navigation', async () => {
    vi.useFakeTimers();
    mocks.sync.mockRejectedValueOnce(new Error('offline'));
    page();
    await act(async () => {});
    await act(async () => navigate('/projects/2/indicators'));
    await act(async () => vi.advanceTimersByTimeAsync(60000));
    expect(mocks.sync).toHaveBeenCalledTimes(2);
    expect(mocks.sync.mock.calls[1][0]).toBe(2);
  });
  it('does not query inaccessible or deleted projects absent from the authorized catalog', async () => {
    mocks.projects.mockReturnValue({ projects: [], loading: false });
    page();
    expect(mocks.dashboard).not.toHaveBeenCalled();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
  it('compact overview keeps only health without coverage, drivers or a CTA, with retry and project authority', async () => {
    mocks.dashboard.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(data(71));
    render(
      <MemoryRouter>
        <ProjectHealthSummary projectId={1} />
      </MemoryRouter>
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');
    expect(mocks.dashboard).toHaveBeenCalledWith(
      1,
      { view: 'GENERAL', healthOnly: true },
      { signal: expect.any(AbortSignal), fresh: true }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    const summary = screen.getByRole('region', { name: 'Saúde do projeto' });
    await waitFor(() => expect(summary).toHaveTextContent('71 / 100'));
    expect(within(summary).queryByRole('link')).not.toBeInTheDocument();
    expect(summary).not.toHaveTextContent(/Principal área|Cobertura/);
    expect(within(summary).queryByText('Planejamento')).not.toBeInTheDocument();
    expect(within(summary).queryByRole('tablist')).not.toBeInTheDocument();
  });
});
