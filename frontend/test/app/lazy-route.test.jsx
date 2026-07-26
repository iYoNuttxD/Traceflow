import { Suspense } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../../src/shared/components/ErrorBoundary.jsx';
import { RouteLoadingFallback } from '../../src/app/routes/AppRoutes.jsx';
import { lazyNamed } from '../../src/app/routes/lazy-route.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('lazy routes', () => {
  it('oferece fallback acessível enquanto o chunk carrega e renderiza após resolver', async () => {
    const module = deferred();
    const LazyPage = lazyNamed(() => module.promise, 'ExamplePage');
    render(
      <Suspense fallback={<RouteLoadingFallback />}>
        <LazyPage />
      </Suspense>
    );

    expect(screen.getByRole('status')).toHaveTextContent('Carregando página...');
    module.resolve({ ExamplePage: () => <h1>Página carregada</h1> });
    expect(await screen.findByRole('heading', { name: 'Página carregada' })).toBeInTheDocument();
  });

  it('encaminha falha de import dinâmico ao ErrorBoundary sem expor stack', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const LazyPage = lazyNamed(() => Promise.reject(new Error('caminho local secreto')), 'Missing');
    render(
      <ErrorBoundary>
        <Suspense fallback={<RouteLoadingFallback />}>
          <LazyPage />
        </Suspense>
      </ErrorBoundary>
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível exibir esta página.'
    );
    expect(screen.queryByText('caminho local secreto')).not.toBeInTheDocument();
    consoleError.mockRestore();
  });
});
