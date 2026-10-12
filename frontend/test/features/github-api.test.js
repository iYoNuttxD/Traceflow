import { describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({ put: vi.fn() }));
vi.mock('../../src/api/http-client.js', () => ({ httpClient: client }));
const { githubApi } = await import('../../src/features/github/api/github.api.js');

describe('contrato de vinculação GitHub para GITHUB-03', () => {
  it('retorna vínculo confirmado com estado de sync independente', async () => {
    const payload = { githubInstallationId: '77', githubRepositoryId: '501' };
    const response = {
      project: { id: 9, githubIntegration: { status: 'ACTIVE' } },
      initialSync: { status: 'FAILED', run: null, error: { code: 'GITHUB_INITIAL_SYNC_FAILED' } }
    };
    client.put.mockResolvedValueOnce({ data: response });
    await expect(githubApi.connectProject(9, payload)).resolves.toEqual(response);
    expect(client.put).toHaveBeenCalledWith('/projects/9/github/integration', payload);
  });

  it('propaga conflito de vinculação para o caller sem simular sucesso', async () => {
    const conflict = {
      response: { status: 409, data: { code: 'GITHUB_PROJECT_ALREADY_CONNECTED' } }
    };
    client.put.mockRejectedValueOnce(conflict);
    await expect(
      githubApi.connectProject(9, { githubInstallationId: '77', githubRepositoryId: '501' })
    ).rejects.toBe(conflict);
  });
});
