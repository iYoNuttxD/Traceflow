import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('../../src/features/projects/api/projects.api.js', () => ({
  projectsApi: { list: mocks.list }
}));

import {
  ProjectsCatalogProvider,
  useProjectsCatalog
} from '../../src/features/projects/hooks/ProjectsCatalogContext.jsx';

let currentCatalog;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function CatalogProbe() {
  currentCatalog = useProjectsCatalog();
  return (
    <div>
      <span>{currentCatalog.projects.map((project) => project.name).join(', ')}</span>
      <span data-testid="catalog-state">
        {currentCatalog.loading ? 'loading' : 'loaded'}/
        {currentCatalog.refreshing ? 'refreshing' : 'idle'}
      </span>
      {currentCatalog.error && <span role="alert">{currentCatalog.error.message}</span>}
    </div>
  );
}

function renderCatalog() {
  return render(
    <ProjectsCatalogProvider>
      <CatalogProbe />
    </ProjectsCatalogProvider>
  );
}

describe('ProjectsCatalogProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentCatalog = undefined;
  });

  it('preserva a carga única inicial e mantém o catálogo durante refresh', async () => {
    const refresh = deferred();
    mocks.list
      .mockResolvedValueOnce({ data: { projects: [{ id: 1, name: 'Inicial' }] } })
      .mockReturnValueOnce(refresh.promise);
    renderCatalog();

    expect(await screen.findByText('Inicial')).toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledOnce();

    let refreshPromise;
    act(() => {
      refreshPromise = currentCatalog.refreshProjects();
    });
    expect(screen.getByText('Inicial')).toBeInTheDocument();
    expect(screen.getByTestId('catalog-state')).toHaveTextContent('loaded/refreshing');

    await act(async () => {
      refresh.resolve({ data: { projects: [{ id: 2, name: 'Atualizado' }] } });
      await refreshPromise;
    });
    expect(screen.getByText('Atualizado')).toBeInTheDocument();
    expect(screen.getByTestId('catalog-state')).toHaveTextContent('loaded/idle');
  });

  it('aplica latest-wins quando refreshes respondem fora de ordem', async () => {
    const first = deferred();
    const second = deferred();
    mocks.list
      .mockResolvedValueOnce({ data: { projects: [{ id: 1, name: 'Inicial' }] } })
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    renderCatalog();
    await screen.findByText('Inicial');

    let firstPromise;
    let secondPromise;
    act(() => {
      firstPromise = currentCatalog.refreshProjects();
      secondPromise = currentCatalog.refreshProjects();
    });

    await act(async () => {
      second.resolve({ data: { projects: [{ id: 3, name: 'Mais recente' }] } });
      await secondPromise;
    });
    expect(screen.getByText('Mais recente')).toBeInTheDocument();

    await act(async () => {
      first.resolve({ data: { projects: [{ id: 2, name: 'Obsoleto' }] } });
      await firstPromise;
    });
    expect(screen.getByText('Mais recente')).toBeInTheDocument();
    expect(screen.queryByText('Obsoleto')).not.toBeInTheDocument();
  });

  it('ignora erro stale sem substituir o catálogo ou o estado atual', async () => {
    const stale = deferred();
    const current = deferred();
    mocks.list
      .mockResolvedValueOnce({ data: { projects: [{ id: 1, name: 'Inicial' }] } })
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(current.promise);
    renderCatalog();
    await screen.findByText('Inicial');

    let stalePromise;
    let currentPromise;
    act(() => {
      stalePromise = currentCatalog.refreshProjects();
      currentPromise = currentCatalog.refreshProjects();
    });
    await act(async () => {
      current.resolve({ data: { projects: [{ id: 2, name: 'Catálogo vigente' }] } });
      await currentPromise;
    });
    await act(async () => {
      stale.reject(new Error('falha obsoleta'));
      await stalePromise;
    });

    expect(screen.getByText('Catálogo vigente')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('catalog-state')).toHaveTextContent('loaded/idle');
  });
});
