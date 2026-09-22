import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { httpClient, resetHttpSessionScope } from '../../src/api/http-client.js';
import { projectsApi } from '../../src/features/projects/api/projects.api.js';
import {
  ProjectsCatalogProvider,
  useProjectsCatalog
} from '../../src/features/projects/hooks/ProjectsCatalogContext.jsx';

const originalAdapter = httpClient.defaults.adapter;
let catalog;

function deferred() {
  let resolve;
  const promise = new Promise((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

function CatalogProbe() {
  catalog = useProjectsCatalog();
  return (
    <div>
      <span data-testid="active">{catalog.projects.map((project) => project.name).join(',')}</span>
      <span data-testid="deleted">
        {catalog.deletedProjects.map((project) => project.name).join(',')}
      </span>
    </div>
  );
}

afterEach(() => {
  httpClient.defaults.adapter = originalAdapter;
  resetHttpSessionScope();
});

it('descarta GET coalescido anterior a DELETE confirmado e preserva catálogo/quick projects', async () => {
  const oldGet = deferred();
  const started = deferred();
  let getCalls = 0;
  httpClient.defaults.adapter = (config) => {
    if (config.method === 'get' && config.url === '/projects') {
      getCalls += 1;
      if (getCalls === 1) {
        started.resolve();
        return oldGet.promise;
      }
      return Promise.resolve({ status: 200, config, data: { projects: [], deletedProjects: [] } });
    }
    return Promise.resolve({ status: 200, config, data: { message: 'Exclusão confirmada.' } });
  };
  render(
    <ProjectsCatalogProvider>
      <CatalogProbe />
    </ProjectsCatalogProvider>
  );
  await started.promise;
  await projectsApi.requestDeletion(1);

  await act(async () => {
    await catalog.refreshProjects({ mutation: { type: 'DELETED', projectId: 1 } });
  });
  expect(getCalls).toBe(2);
  oldGet.resolve({
    status: 200,
    data: { projects: [{ id: 1, name: 'Projeto antigo' }], deletedProjects: [] }
  });
  await act(async () => {
    await oldGet.promise;
  });
  expect(screen.getByTestId('active')).toBeEmptyDOMElement();
  expect(screen.getByTestId('deleted')).toBeEmptyDOMElement();
});

it('remove projeto definitivamente excluído mesmo se a leitura nova ainda estiver stale', async () => {
  httpClient.defaults.adapter = (config) =>
    Promise.resolve({
      status: 200,
      config,
      data: { projects: [], deletedProjects: [{ id: 2, name: 'Projeto apagado' }] }
    });
  render(
    <ProjectsCatalogProvider>
      <CatalogProbe />
    </ProjectsCatalogProvider>
  );
  await screen.findByText('Projeto apagado');
  await act(async () => {
    await catalog.refreshProjects({ mutation: { type: 'PURGED', projectId: 2 } });
  });
  expect(screen.getByTestId('deleted')).toBeEmptyDOMElement();
});

it('reconcilia restore por GET fresh sem aceitar lista anterior de projetos excluídos', async () => {
  const oldGet = deferred();
  const started = deferred();
  let getCalls = 0;
  httpClient.defaults.adapter = (config) => {
    if (config.method === 'get' && config.url === '/projects') {
      getCalls += 1;
      if (getCalls === 1) {
        started.resolve();
        return oldGet.promise;
      }
      return Promise.resolve({
        status: 200,
        config,
        data: { projects: [{ id: 4, name: 'Recuperado' }], deletedProjects: [] }
      });
    }
    return Promise.resolve({ status: 200, config, data: { message: 'Recuperado.' } });
  };
  render(
    <ProjectsCatalogProvider>
      <CatalogProbe />
    </ProjectsCatalogProvider>
  );
  await started.promise;
  await projectsApi.restore(4);
  await act(async () => {
    await catalog.refreshProjects({ mutation: { type: 'RESTORED', projectId: 4 } });
  });
  oldGet.resolve({
    status: 200,
    data: { projects: [], deletedProjects: [{ id: 4, name: 'Pendente antigo' }] }
  });
  await act(async () => {
    await oldGet.promise;
  });
  expect(getCalls).toBe(2);
  expect(screen.getByTestId('active')).toHaveTextContent('Recuperado');
  expect(screen.getByTestId('deleted')).toBeEmptyDOMElement();
});

it('preserva projeto recém-criado quando um GET pré-criação responde por último', async () => {
  const oldGet = deferred();
  const started = deferred();
  let getCalls = 0;
  httpClient.defaults.adapter = (config) => {
    if (config.method === 'get' && config.url === '/projects') {
      getCalls += 1;
      if (getCalls === 1) {
        started.resolve();
        return oldGet.promise;
      }
      return Promise.resolve({
        status: 200,
        config,
        data: { projects: [{ id: 5, name: 'Projeto novo' }], deletedProjects: [] }
      });
    }
    return Promise.resolve({ status: 201, config, data: { message: 'Criado.' } });
  };
  render(
    <ProjectsCatalogProvider>
      <CatalogProbe />
    </ProjectsCatalogProvider>
  );
  await started.promise;
  await projectsApi.createFromGithub({ name: 'Projeto novo' });
  await act(async () => {
    await catalog.refreshProjects({ fresh: true });
  });
  oldGet.resolve({ status: 200, data: { projects: [], deletedProjects: [] } });
  await act(async () => {
    await oldGet.promise;
  });
  expect(getCalls).toBe(2);
  expect(screen.getByTestId('active')).toHaveTextContent('Projeto novo');
});
