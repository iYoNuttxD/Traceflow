import { createMemoryRouter, MemoryRouter, RouterProvider, useParams } from 'react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { INDICATORS } from '../../../backend/src/modules/indicators/indicators.catalog.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({
  dashboard: vi.fn(),
  catalog: vi.fn(),
  preference: vi.fn(),
  savePreference: vi.fn(),
  resetPreference: vi.fn()
}));
vi.mock('../../src/features/indicators/api/indicators.api.js', () => ({ indicatorsApi: api }));
vi.mock('../../src/features/schedule/api/schedule.api.js', () => ({
  scheduleApi: {
    listSprints: () =>
      Promise.resolve({ data: { sprints: [{ id: 7, name: 'Sprint A', status: 'EM_ANDAMENTO' }] } })
  }
}));
import { DashboardPanel } from '../../src/features/indicators/DashboardPanel.jsx';
import { ConfirmProvider } from '../../src/shared/components/ConfirmDialog.jsx';
const policy = {
  minWidgets: 1,
  maxWidgets: 12,
  defaultPreference: {
    configurationVersion: 1,
    widgets: ['I01', 'I23'],
    isDefault: true,
    updatedAt: null
  }
};
const titles = [
  'Progresso atual',
  'Trabalho em andamento',
  'Tempo de ciclo',
  'Compromisso',
  'Total de tarefas',
  'Taxa de sucesso'
];
const metricIds = [
  'I01',
  'I23',
  'I21',
  'I36',
  'I26',
  'I49',
  'I29',
  'I30',
  'I31',
  'I32',
  'I33',
  'I34',
  'I35'
];
const catalog = metricIds.map((metricId, i) => ({
  metricId,
  title: titles[i] ?? `Indicador de tarefas ${i}`,
  category: i < 3 ? 'FLOW' : 'TASK',
  description: 'Descrição',
  customization: {
    customizable: true,
    description: 'Acompanhe a evolução do projeto.',
    sizeClass: 'compact'
  }
}));
let stored;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
function aggregate(filters) {
  return {
    data: {
      projectId: 1,
      view: filters.view,
      viewState: 'AVAILABLE',
      generatedAt: new Date().toISOString(),
      warnings: [],
      sections: [
        {
          id: filters.view === 'CUSTOM' ? 'custom' : 'summary',
          indicators: (filters.widgets?.split(',') ?? ['I01']).map((metricId) => ({
            metricId,
            formula: INDICATORS[metricId].formula,
            sources: INDICATORS[metricId].sources,
            asOf: '2026-10-05T12:00:00Z',
            value: 42,
            unit: 'TASKS',
            kind: 'KPI',
            state: 'AVAILABLE',
            limitations: []
          }))
        }
      ]
    }
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  stored = structuredClone(policy.defaultPreference);
  api.catalog.mockResolvedValue({
    data: { indicators: catalog, views: [], personalization: policy }
  });
  api.preference.mockImplementation(() => Promise.resolve({ data: stored }));
  api.dashboard.mockImplementation((id, filters) => Promise.resolve(aggregate(filters)));
  api.savePreference.mockImplementation((id, config) => {
    stored = { ...config, isDefault: false, updatedAt: new Date().toISOString() };
    return Promise.resolve({ data: stored });
  });
  api.resetPreference.mockImplementation(() => {
    stored = structuredClone(policy.defaultPreference);
    return Promise.resolve({ data: stored });
  });
});
afterEach(cleanup);
function mount(projectId = 1) {
  return render(
    <ConfirmProvider>
      <MemoryRouter
        initialEntries={[
          '/projects/1/indicators?view=custom&startDate=2026-09-01&endDate=2026-09-30&timeZone=UTC&sprintId=7'
        ]}
      >
        <DashboardPanel projectId={projectId} />
      </MemoryRouter>
    </ConfirmProvider>
  );
}
function ProjectDashboard() {
  const { projectId } = useParams();
  return <DashboardPanel projectId={Number(projectId)} />;
}
function mountHistory() {
  const router = createMemoryRouter(
    [{ path: '/projects/:projectId/indicators', element: <ProjectDashboard /> }],
    {
      initialEntries: ['/projects/1/indicators', '/projects/1/indicators?view=custom'],
      initialIndex: 1
    }
  );
  const app = render(
    <ConfirmProvider>
      <RouterProvider router={router} />
    </ConfirmProvider>
  );
  return { ...app, router };
}
async function editor() {
  await userEvent.click(await screen.findByRole('button', { name: 'Personalizar painel' }));
  return screen.findByRole('dialog', { name: 'Personalizar painel' });
}

const mutations = [
  {
    method: 'PUT',
    apiMethod: 'savePreference',
    initialWidgets: ['I01', 'I23'],
    savedWidgets: ['I23', 'I01'],
    edit: async (dialog) => {
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Mover Trabalho em andamento para cima' })
      );
    }
  },
  {
    method: 'DELETE',
    apiMethod: 'resetPreference',
    initialWidgets: ['I21'],
    savedWidgets: policy.defaultPreference.widgets,
    edit: async (dialog) => {
      await userEvent.click(within(dialog).getByRole('button', { name: 'Restaurar padrão' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Restaurar', exact: true }));
    }
  }
];

describe.each(mutations)('pending $method preference ownership', (mutation) => {
  it.each(['before Forward', 'after Forward'])(
    'reconciles a confirmed write %s after Back unmounts the editor',
    async (completion) => {
      stored = { ...stored, widgets: mutation.initialWidgets, isDefault: false };
      const pending = deferred();
      api[mutation.apiMethod].mockReturnValueOnce(pending.promise);
      const { router } = mountHistory();
      const dialog = await editor();
      await mutation.edit(dialog);
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
      expect(api[mutation.apiMethod]).toHaveBeenCalledOnce();

      await act(() => router.navigate(-1));
      expect(router.state.location.search).toBe('');
      expect(screen.getByRole('tab', { name: 'Geral' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await waitFor(() => expect(api.dashboard).toHaveBeenCalledTimes(2));

      if (completion === 'after Forward') {
        await act(() => router.navigate(1));
        await waitFor(() => expect(widgetOrder()).toEqual(mutation.initialWidgets));
        expect(screen.getByRole('button', { name: 'Personalizar painel' })).toBeDisabled();
      }

      stored = {
        ...stored,
        widgets: mutation.savedWidgets,
        isDefault: mutation.method === 'DELETE'
      };
      await act(() => pending.resolve({ data: stored }));

      if (completion === 'before Forward') {
        // Reconciliation does not navigate back, reopen the editor, or load an inactive view.
        expect(router.state.location.search).toBe('');
        expect(api.dashboard).toHaveBeenCalledTimes(2);
        await act(() => router.navigate(1));
      }

      await waitFor(() => expect(widgetOrder()).toEqual(mutation.savedWidgets));
      expect(router.state.location.search).toBe('?view=custom');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByText(/^Painel (salvo|restaurado)/)).not.toBeInTheDocument();
      expect(api.preference).toHaveBeenCalledOnce();
      expect(api.dashboard.mock.calls.at(-1)[1].widgets).toBe(mutation.savedWidgets.join(','));
      expect(api.dashboard).toHaveBeenCalledTimes(completion === 'before Forward' ? 3 : 4);
      expect(screen.getByRole('button', { name: 'Personalizar painel' })).toBeEnabled();

      const reopened = await editor();
      expect(
        within(reopened)
          .getAllByRole('button', { name: /^Reordenar / })
          .map((handle) => handle.getAttribute('aria-label'))
      ).toEqual(
        mutation.savedWidgets.map(
          (id, index) =>
            `Reordenar ${titles[metricIds.indexOf(id)]}, posição ${index + 1} de ${mutation.savedWidgets.length}`
        )
      );
      expect(within(reopened).getByRole('button', { name: 'Salvar' })).toBeDisabled();
    }
  );

  it.each(['before returning', 'after returning'])(
    'reads the confirmed state %s after leaving for another project and returning',
    async (completion) => {
      stored = { ...stored, widgets: mutation.initialWidgets, isDefault: false };
      const pending = deferred();
      api[mutation.apiMethod].mockReturnValueOnce(pending.promise);
      const { router } = mountHistory();
      const dialog = await editor();
      await mutation.edit(dialog);
      await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

      await act(() => router.navigate('/projects/2/indicators'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Geral' })).toHaveAttribute('aria-selected', 'true');
      expect(api.preference).toHaveBeenCalledOnce();

      if (completion === 'after returning') {
        await act(() => router.navigate(-1));
        expect(router.state.location.pathname).toBe('/projects/1/indicators');
        expect(screen.getByRole('button', { name: 'Personalizar painel' })).toBeDisabled();
        expect(api.preference).toHaveBeenCalledOnce();
      }

      stored = {
        ...stored,
        widgets: mutation.savedWidgets,
        isDefault: mutation.method === 'DELETE'
      };
      await act(() => pending.resolve({ data: stored }));

      if (completion === 'before returning') {
        expect(router.state.location.pathname).toBe('/projects/2/indicators');
        expect(api.preference).toHaveBeenCalledOnce();
        await act(() => router.navigate(-1));
      }

      await waitFor(() => expect(widgetOrder()).toEqual(mutation.savedWidgets));
      expect(api.preference).toHaveBeenCalledTimes(2);
      expect(api.preference.mock.calls.every(([id]) => id === 1)).toBe(true);
      expect(api.dashboard.mock.calls.at(-1)[1].widgets).toBe(mutation.savedWidgets.join(','));
      expect(screen.getByRole('button', { name: 'Personalizar painel' })).toBeEnabled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByText(/^Painel (salvo|restaurado)/)).not.toBeInTheDocument();
    }
  );

  it('loads the confirmed preference after the entire owner unmounts and mounts again', async () => {
    stored = { ...stored, widgets: mutation.initialWidgets, isDefault: false };
    const pending = deferred();
    api[mutation.apiMethod].mockReturnValueOnce(pending.promise);
    const app = mount();
    const dialog = await editor();
    await mutation.edit(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    app.unmount();
    stored = {
      ...stored,
      widgets: mutation.savedWidgets,
      isDefault: mutation.method === 'DELETE'
    };
    await act(() => pending.resolve({ data: stored }));
    mount();
    await waitFor(() => expect(widgetOrder()).toEqual(mutation.savedWidgets));
    expect(api.preference).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Painel (salvo|restaurado)/)).not.toBeInTheDocument();
  });

  it('keeps the confirmed preference and allows a fresh edit after an abandoned write fails', async () => {
    stored = { ...stored, widgets: mutation.initialWidgets, isDefault: false };
    const pending = deferred();
    api[mutation.apiMethod].mockReturnValueOnce(pending.promise);
    const { router } = mountHistory();
    const dialog = await editor();
    await mutation.edit(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await act(() => router.navigate(-1));
    await act(() => router.navigate(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Personalizar painel' })).toBeDisabled();
    await act(() => pending.reject(new Error('write failed')));
    await waitFor(() => expect(widgetOrder()).toEqual(mutation.initialWidgets));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Painel (salvo|restaurado)/)).not.toBeInTheDocument();
    expect(api.preference).toHaveBeenCalledOnce();

    const reopened = await editor();
    await mutation.edit(reopened);
    await userEvent.click(within(reopened).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(widgetOrder()).toEqual(mutation.savedWidgets));
    expect(api[mutation.apiMethod]).toHaveBeenCalledTimes(2);
  });

  it('does not replace the next project preference or close its editor on an old success', async () => {
    stored = { ...stored, widgets: mutation.initialWidgets, isDefault: false };
    const pending = deferred();
    api[mutation.apiMethod].mockReturnValueOnce(pending.promise);
    const app = mount();
    const dialog = await editor();
    await mutation.edit(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    api.preference.mockResolvedValueOnce({
      data: { ...stored, widgets: ['I26'], isDefault: false }
    });
    app.rerender(
      <ConfirmProvider>
        <MemoryRouter>
          <DashboardPanel projectId={2} />
        </MemoryRouter>
      </ConfirmProvider>
    );
    await waitFor(() => expect(widgetOrder()).toEqual(['I26']));
    const nextEditor = await editor();
    const dashboardCalls = api.dashboard.mock.calls.length;
    await act(() => pending.resolve({ data: { ...stored, widgets: mutation.savedWidgets } }));
    expect(widgetOrder()).toEqual(['I26']);
    expect(screen.getByRole('dialog', { name: 'Personalizar painel' })).toBe(nextEditor);
    expect(within(nextEditor).getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(screen.queryByText(/^Painel (salvo|restaurado)/)).not.toBeInTheDocument();
    expect(api.dashboard).toHaveBeenCalledTimes(dashboardCalls);
  });
});
function widgetOrder() {
  return [
    ...screen.getByRole('region', { name: 'Meu painel' }).querySelectorAll('[data-metric-id]')
  ].map((el) => el.dataset.metricId);
}

describe('P9 personalized workspace', () => {
  it('loads default without opening editor; sends one aggregate and preserves global filters/view changes', async () => {
    mount();
    await waitFor(() => expect(widgetOrder()).toEqual(policy.defaultPreference.widgets));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.dashboard).toHaveBeenCalledTimes(1);
    expect(api.dashboard.mock.calls[0][1]).toMatchObject({
      view: 'CUSTOM',
      widgets: 'I01,I23',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      sprintId: '7'
    });
    await userEvent.click(screen.getByRole('tab', { name: 'Fluxo' }));
    expect(screen.queryByRole('button', { name: 'Personalizar painel' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Meu painel' }));
    await waitFor(() => expect(widgetOrder()).toEqual(['I01', 'I23']));
    expect(api.preference).toHaveBeenCalledTimes(1);
    expect(api.dashboard.mock.calls.at(-1)[1].sprintId).toBe('7');
  });
  it('searches friendly text/categories; add/remove/reorder are drafts; cancel returns focus', async () => {
    mount();
    const dialog = await editor();
    await waitFor(() => expect(within(dialog).getByRole('searchbox')).toHaveFocus());
    await userEvent.type(within(dialog).getByRole('searchbox'), 'tempo');
    expect(within(dialog).getByRole('button', { name: 'Adicionar: Tempo de ciclo' })).toBeEnabled();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Adicionar: Tempo de ciclo' })
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Mover Tempo de ciclo para cima' })
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Remover Progresso atual do painel' })
    );
    expect(api.savePreference).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(widgetOrder()).toEqual(['I01', 'I23']);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Personalizar painel' })).toHaveFocus()
    );
  });
  it('saves exact order once, reloads aggregate, persists after remount', async () => {
    const app = mount();
    const dialog = await editor();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Mover Trabalho em andamento para cima' })
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(widgetOrder()).toEqual(['I23', 'I01']));
    expect(api.savePreference).toHaveBeenCalledExactlyOnceWith(1, {
      configurationVersion: 1,
      widgets: ['I23', 'I01']
    });
    expect(api.dashboard).toHaveBeenCalledTimes(2);
    const feedback = screen.getByText('Painel salvo').closest('[role="status"]');
    expect(feedback).toHaveAttribute('aria-live', 'polite');
    expect(feedback.closest('.feedback-region--transient')).not.toBeNull();
    expect(
      within(screen.getByRole('tabpanel')).queryByText(/Painel salvo/)
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Painel salvo.')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Personalizar painel' })).toHaveFocus()
    );
    app.unmount();
    mount();
    await waitFor(() => expect(widgetOrder()).toEqual(['I23', 'I01']));
  });
  it('restores only the draft until Save, DELETE returns backend default', async () => {
    stored = { ...stored, widgets: ['I21'], isDefault: false };
    mount();
    let dialog = await editor();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restaurar padrão' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Restaurar', exact: true }));
    expect(api.resetPreference).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(widgetOrder()).toEqual(['I21']);
    dialog = await editor();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restaurar padrão' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Restaurar', exact: true }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(widgetOrder()).toEqual(policy.defaultPreference.widgets));
    expect(api.resetPreference).toHaveBeenCalledOnce();
    expect(api.savePreference).not.toHaveBeenCalled();
    expect(
      screen.getByText('Painel restaurado ao padrão').closest('[role="status"]')
    ).not.toBeNull();
    expect(
      within(screen.getByRole('tabpanel')).queryByText(/Painel restaurado/)
    ).not.toBeInTheDocument();
  });
  it('enforces min/max, no duplicates, category and compact empty search', async () => {
    stored = { ...stored, widgets: metricIds.slice(0, 12) };
    mount();
    const dialog = await editor();
    expect(within(dialog).getByText('12 de 12 indicadores')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Adicionar: Indicador de tarefas 12' })
    ).toBeDisabled();
    expect(
      within(dialog).getByRole('button', { name: 'Selecionado: Progresso atual' })
    ).toBeDisabled();
    await userEvent.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Categoria' }),
      'FLOW'
    );
    expect(
      within(dialog).queryByRole('button', { name: 'Selecionado: Total de tarefas' })
    ).not.toBeInTheDocument();
    await userEvent.type(within(dialog).getByRole('searchbox'), 'inexistente');
    expect(within(dialog).getByText('Nenhum indicador encontrado.')).toBeInTheDocument();
    for (const button of within(dialog).getAllByRole('button', { name: /^Remover/ }))
      await userEvent.click(button);
    expect(within(dialog).getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });
  it('keeps draft on write failure and separates confirmed save from aggregate failure', async () => {
    mount();
    const dialog = await editor();
    api.savePreference.mockRejectedValueOnce(new Error('offline'));
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Mover Trabalho em andamento para cima' })
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Sua seleção foi mantida');
    expect(within(dialog).getAllByRole('button', { name: /^Reordenar / })[0]).toHaveAccessibleName(
      'Reordenar Trabalho em andamento, posição 1 de 2'
    );
    expect(document.querySelector('.feedback-region--transient')).toBeNull();
    api.dashboard.mockRejectedValueOnce(new Error('GET failed'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(
      await screen.findByText('Painel salvo. Não foi possível atualizar os dados agora.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert').closest('.feedback-region--transient')).not.toBeNull();
    expect(screen.queryByText(/Não foi possível salvar/)).not.toBeInTheDocument();
    expect(screen.queryByText('Não foi possível carregar os indicadores.')).not.toBeInTheDocument();
    expect(stored.widgets).toEqual(['I23', 'I01']);
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente', exact: true }));
    await waitFor(() => expect(widgetOrder()).toEqual(['I23', 'I01']));
    expect(screen.queryByText(/Painel salvo/)).not.toBeInTheDocument();
  });
  it('prevents concurrent saves, no writes on interactions, focus/visibility do not refetch', async () => {
    const pending = deferred();
    mount();
    const dialog = await editor();
    api.savePreference.mockReturnValueOnce(pending.promise);
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Mover Trabalho em andamento para cima' })
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    fireEvent.submit(dialog.querySelector('form'));
    expect(api.savePreference).toHaveBeenCalledOnce();
    fireEvent(window, new Event('focus'));
    fireEvent(document, new Event('visibilitychange'));
    expect(api.dashboard).toHaveBeenCalledTimes(1);
    expect(api.preference).toHaveBeenCalledTimes(1);
    await act(() => pending.resolve({ data: { ...stored, widgets: ['I23', 'I01'] } }));
  });
  it('discards an old project preference response and closes draft on project switch', async () => {
    const old = deferred();
    api.preference.mockReturnValueOnce(old.promise);
    const app = mount();
    app.rerender(
      <ConfirmProvider>
        <MemoryRouter>
          <DashboardPanel projectId={2} />
        </MemoryRouter>
      </ConfirmProvider>
    );
    await act(() => old.resolve({ data: { ...stored, widgets: ['I21'] } }));
    expect(api.dashboard.mock.calls.filter(([project]) => project === 1)).toHaveLength(0);
  });
});

it('clears confirmed feedback on project change and does not replay it when returning', async () => {
  const { router } = mountHistory();
  const dialog = await editor();
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Mover Trabalho em andamento para cima' })
  );
  await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
  expect(await screen.findByText('Painel salvo')).toBeInTheDocument();
  await act(() => router.navigate('/projects/2/indicators?view=custom'));
  expect(screen.queryByText(/^Painel (salvo|restaurado)/)).not.toBeInTheDocument();
  await act(() => router.navigate(-1));
  await waitFor(() => expect(widgetOrder()).toEqual(['I23', 'I01']));
  expect(screen.queryByText(/^Painel (salvo|restaurado)/)).not.toBeInTheDocument();
});

describe('P9.1 controls', () => {
  const transfer = () => ({ setData: vi.fn(), setDragImage: vi.fn() });
  const handles = (dialog) => within(dialog).getAllByRole('button', { name: /^Reordenar / });
  const names = (dialog) => handles(dialog).map((handle) => handle.getAttribute('aria-label'));

  it('keeps tabs and actions in one toolbar; refresh changes only the aggregate', async () => {
    mount();
    await waitFor(() => expect(widgetOrder()).toEqual(['I01', 'I23']));
    const toolbar = screen.getByRole('tablist').parentElement;
    expect(within(toolbar).getByRole('button', { name: 'Personalizar painel' })).toBeVisible();
    const refresh = within(toolbar).getByRole('button', { name: 'Atualizar indicadores' });
    expect(refresh).toHaveAttribute('title', 'Atualizar indicadores');
    await userEvent.click(refresh);
    await waitFor(() => expect(api.dashboard).toHaveBeenCalledTimes(2));
    expect(api.catalog).toHaveBeenCalledOnce();
    expect(api.preference).toHaveBeenCalledOnce();
    expect(api.savePreference).not.toHaveBeenCalled();
  });

  it('drags only the handle, shows destination, changes draft without requests and cancels', async () => {
    mount();
    const dialog = await editor();
    const [first, last] = handles(dialog);
    const dataTransfer = transfer();
    expect(first).toHaveAttribute('draggable', 'true');
    expect(first.closest('li')).not.toHaveAttribute('draggable');
    fireEvent.dragStart(last, { dataTransfer });
    fireEvent.dragOver(first.closest('li'), { dataTransfer });
    expect(last.closest('li')).toHaveAttribute('data-dragging', 'true');
    expect(first.closest('li')).toHaveAttribute('data-drop', 'before');
    // Hovering does not yet move the draft or load dashboard data.
    expect(names(dialog)[0]).toMatch(/Progresso atual/);
    fireEvent.drop(first.closest('li'), { dataTransfer });
    fireEvent.dragEnd(last, { dataTransfer });
    expect(names(dialog)).toEqual([
      'Reordenar Trabalho em andamento, posição 1 de 2',
      'Reordenar Progresso atual, posição 2 de 2'
    ]);
    await waitFor(() => expect(handles(dialog)[0]).toHaveFocus());
    expect(api.savePreference).not.toHaveBeenCalled();
    expect(api.dashboard).toHaveBeenCalledOnce();
    expect(api.preference).toHaveBeenCalledOnce();
    expect(api.catalog).toHaveBeenCalledOnce();
    expect(widgetOrder()).toEqual(['I01', 'I23']);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(widgetOrder()).toEqual(['I01', 'I23']);
    expect(names(await editor())[0]).toMatch(/Progresso atual/);
  });

  it('drops downward at the end and saves exactly one ordered array', async () => {
    stored = { ...stored, widgets: ['I01', 'I23', 'I21'] };
    mount();
    const dialog = await editor();
    const [first, , last] = handles(dialog);
    const dataTransfer = transfer();
    fireEvent.dragStart(first, { dataTransfer });
    fireEvent.dragOver(last.closest('li'), { dataTransfer });
    expect(last.closest('li')).toHaveAttribute('data-drop', 'after');
    fireEvent.drop(last.closest('li'), { dataTransfer });
    expect(api.savePreference).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(widgetOrder()).toEqual(['I23', 'I21', 'I01']));
    expect(api.savePreference).toHaveBeenCalledExactlyOnceWith(1, {
      configurationVersion: 1,
      widgets: ['I23', 'I21', 'I01']
    });
    expect(api.dashboard).toHaveBeenCalledTimes(2);
  });

  it('abandons canceled/outside drags and ignores external drops', async () => {
    mount();
    const dialog = await editor();
    const [first, last] = handles(dialog);
    const dataTransfer = transfer();
    fireEvent.drop(first.closest('li'), { dataTransfer });
    fireEvent.dragStart(last, { dataTransfer });
    fireEvent.dragOver(first.closest('li'), { dataTransfer });
    fireEvent.dragEnd(last, { dataTransfer });
    expect(names(dialog)[0]).toMatch(/Progresso atual/);
    expect(dialog.querySelector('[data-drop]')).not.toBeInTheDocument();
    expect(dialog.querySelector('[data-dragging]')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(api.savePreference).not.toHaveBeenCalled();
  });

  it('reorders using arrow keys on handle, preserves focus and bounds, retains tap fallback', async () => {
    mount();
    const dialog = await editor();
    handles(dialog)[1].focus();
    await userEvent.keyboard('{ArrowUp}');
    await waitFor(() => expect(handles(dialog)[0]).toHaveFocus());
    expect(names(dialog)[0]).toMatch(/Trabalho em andamento/);
    await userEvent.keyboard('{ArrowUp}');
    expect(names(dialog)[0]).toMatch(/Trabalho em andamento/);
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(handles(dialog)[1]).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}');
    expect(names(dialog)[1]).toMatch(/Trabalho em andamento/);
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Mover Trabalho em andamento para cima' })
    );
    expect(names(dialog)[0]).toMatch(/Trabalho em andamento/);
    expect(api.savePreference).not.toHaveBeenCalled();
  });
});

it('retries failed preference reads without falling back to a false default', async () => {
  api.preference.mockRejectedValueOnce(new Error('offline'));
  mount();
  expect(await screen.findByText('Não foi possível carregar seu painel.')).toBeInTheDocument();
  expect(api.dashboard).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await waitFor(() => expect(widgetOrder()).toEqual(policy.defaultPreference.widgets));
});

it('preserves focus at reorder boundaries and traps Tab inside the canonical dialog', async () => {
  mount();
  const dialog = await editor();
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Mover Trabalho em andamento para cima' })
  );
  await waitFor(() =>
    expect(
      within(dialog).getByRole('button', { name: 'Mover Trabalho em andamento para baixo' })
    ).toHaveFocus()
  );
  within(dialog).getByRole('button', { name: 'Salvar' }).focus();
  await userEvent.keyboard('{Tab}');
  expect(within(dialog).getByRole('button', { name: 'Fechar personalizar painel' })).toHaveFocus();
  await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
  expect(within(dialog).getByRole('button', { name: 'Salvar' })).toHaveFocus();
});

it('reuses catalog calculation details in Meu painel without displaying them permanently', async () => {
  const user = userEvent.setup();
  mount();
  const trigger = await screen.findByRole('button', { name: /Informações sobre Progresso atual/ });
  await user.click(trigger);
  const help = screen.getByRole('dialog');
  const disclosure = within(help).getByRole('button', { name: 'Detalhes do cálculo' });
  expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  expect(within(help).getByText('Como é calculado')).not.toBeVisible();
  await user.click(disclosure);
  expect(help).toHaveTextContent(INDICATORS.I01.formula);
  expect(help).toHaveTextContent('Tarefas do projeto');
  expect(help).toHaveTextContent('Calculado com dados até');
  expect(help).toHaveTextContent('05/10/2026');
  expect(help.querySelector('.dashboard-help__rule-group')).toHaveTextContent('÷ Total');
  expect(
    [...help.querySelectorAll('.dashboard-help__rule-group')].some((group) =>
      group.textContent.includes('× 100')
    )
  ).toBe(true);
});
