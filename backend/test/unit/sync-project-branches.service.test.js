import { beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({ syncObserved: vi.fn() }));
vi.mock('../../src/modules/github/github-branch.repository.js', () => ({
  githubBranchRepository: repository
}));

const { syncProjectBranches } =
  await import('../../src/modules/github/services/sync-project-branches.service.js');

async function* pages(...items) {
  for (const item of items) yield item;
}

describe('syncProjectBranches', () => {
  beforeEach(() => vi.clearAllMocks());

  it('consome todas as páginas, deduplica e identifica a default', async () => {
    const githubClient = {
      listBranchPages: vi.fn(() =>
        pages(
          [{ name: 'main', headSha: 'A' }],
          [
            { name: 'feature', headSha: 'B' },
            { name: 'main', headSha: 'A2' }
          ]
        )
      )
    };
    repository.syncObserved.mockResolvedValue([
      { id: 1, name: 'main', headSha: 'A2', isDefault: true, isActive: true },
      { id: 2, name: 'feature', headSha: 'B', isDefault: false, isActive: true }
    ]);

    const result = await syncProjectBranches({
      project: { id: 7 },
      repository: { owner: 'owner', name: 'repo', defaultBranch: 'main' },
      githubClient
    });

    expect(repository.syncObserved).toHaveBeenCalledWith(
      7,
      [
        { name: 'main', headSha: 'A2' },
        { name: 'feature', headSha: 'B' }
      ],
      'main',
      expect.any(Date)
    );
    expect(result.summary).toEqual({ found: 2, active: 2, defaultBranch: 'main' });
  });

  it('não inativa o histórico quando o GitHub devolve lista vazia', async () => {
    await expect(
      syncProjectBranches({
        project: { id: 7 },
        repository: { owner: 'owner', name: 'repo', defaultBranch: 'main' },
        githubClient: { listBranchPages: () => pages([]) }
      })
    ).rejects.toMatchObject({ statusCode: 502 });
    expect(repository.syncObserved).not.toHaveBeenCalled();
  });
});
