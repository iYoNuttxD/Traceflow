import { beforeEach, describe, expect, it, vi } from 'vitest';

const httpClient = vi.hoisted(() => ({
  get: vi.fn(() => Promise.resolve({ data: {} })),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn()
}));

vi.mock('../../src/api/http-client.js', () => ({ httpClient }));

import { githubApi } from '../../src/features/github/api/github.api.js';
import { requirementsApi } from '../../src/features/requirements/api/requirements.api.js';
import { tasksApi, kanbanApi } from '../../src/features/tasks/api/tasks.api.js';
import { traceabilityApi } from '../../src/features/traceability/api/traceability.api.js';
import { compactParams } from '../../src/shared/utils/compact-params.js';

describe('compactParams', () => {
  beforeEach(() => vi.clearAllMocks());

  it('remove valores opcionais ausentes e preserva zero, false e valores válidos', () => {
    expect(compactParams({
      empty: '',
      spaces: '   ',
      nil: null,
      missing: undefined,
      page: 1,
      offset: 0,
      enabled: false,
      search: 'task'
    })).toEqual({ page: 1, offset: 0, enabled: false, search: 'task' });
  });

  it('compacta filtros nas APIs de GitHub, requirements, tasks, histórico e rastreabilidade', async () => {
    const dirtyParams = { search: '  ', startDate: '', endDate: null, page: 1, limit: 20, active: false };
    const cleanParams = { page: 1, limit: 20, active: false };

    await githubApi.artifacts(3, dirtyParams);
    requirementsApi.listByProject(3, dirtyParams);
    tasksApi.list(3, dirtyParams);
    kanbanApi.listTaskHistory(3, dirtyParams);
    await traceabilityApi.matrix(3, dirtyParams);

    expect(httpClient.get).toHaveBeenNthCalledWith(1, '/projects/3/artifacts', { params: cleanParams });
    expect(httpClient.get).toHaveBeenNthCalledWith(2, '/projects/3/requirements', { params: cleanParams });
    expect(httpClient.get).toHaveBeenNthCalledWith(3, '/projects/3/tasks', { params: cleanParams });
    expect(httpClient.get).toHaveBeenNthCalledWith(4, '/projects/3/tasks/history', { params: cleanParams });
    expect(httpClient.get).toHaveBeenNthCalledWith(5, '/projects/3/traceability/requirements-matrix', { params: cleanParams });
  });
});
