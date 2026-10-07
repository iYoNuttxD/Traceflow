import { beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({
  repository: {
    claim: vi.fn(),
    findById: vi.fn(),
    updateProgress: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn()
  },
  syncProjectGithubData: vi.fn(),
  reconcileAfterSync: vi.fn(),
  recordOperational: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock('../../src/modules/github/github-sync-run.repository.js', () => ({
  githubSyncRunRepository: boundary.repository
}));
vi.mock('../../src/modules/github/services/sync-project-github.service.js', () => ({
  syncProjectGithubData: boundary.syncProjectGithubData,
  normalizeGithubSyncError: (error) => error.message
}));
vi.mock('../../src/modules/traceability/traceability-alert.service.js', () => ({
  traceabilityAlertService: { reconcileAfterSync: boundary.reconcileAfterSync }
}));
vi.mock('../../src/modules/audit/audit.service.js', () => ({
  auditService: { recordOperational: boundary.recordOperational }
}));
vi.mock('../../src/modules/projects/project.repository.js', () => ({ projectRepository: {} }));
vi.mock('../../src/shared/logger/index.js', () => ({ logger: boundary.logger }));

const { executeGithubSyncRun } =
  await import('../../src/modules/github/services/github-sync-run.service.js');

const run = { id: 31, projectId: 7, requestedByUserId: 2 };
const finished = (status) => ({
  ...run,
  status,
  step: status === 'FAILED' ? 'PULL_REQUESTS' : 'PERSIST',
  startedAt: new Date('2026-10-07T10:00:00.000Z'),
  finishedAt: new Date('2026-10-07T10:00:05.000Z'),
  durationMs: 5000,
  branchCount: 1,
  commitsObserved: 3
});

beforeEach(() => {
  vi.clearAllMocks();
  boundary.repository.claim.mockResolvedValue(true);
  boundary.repository.findById.mockResolvedValue(run);
  boundary.repository.succeed.mockResolvedValue(finished('SUCCEEDED'));
  boundary.repository.fail.mockResolvedValue(finished('FAILED'));
  boundary.recordOperational.mockResolvedValue(undefined);
});

describe('S2-01 G3: reconciliação de alertas no fim do sync', () => {
  it('I12 reconcilia depois de um sync com falha, que continua FAILED', async () => {
    boundary.syncProjectGithubData.mockRejectedValue(
      Object.assign(new Error('rate limit'), { code: 'GITHUB_RATE_LIMITED' })
    );
    boundary.reconcileAfterSync.mockResolvedValue({ created: 1, resolved: 0, kept: 0 });

    const result = await executeGithubSyncRun(run.id);

    expect(boundary.reconcileAfterSync).toHaveBeenCalledWith(run.projectId);
    expect(result.status).toBe('FAILED');
    expect(boundary.repository.fail).toHaveBeenCalledWith(
      run.id,
      expect.objectContaining({ errorCode: 'GITHUB_RATE_LIMITED' })
    );
  });

  it('reconcilia depois de um sync bem-sucedido sem alterar o resultado', async () => {
    boundary.syncProjectGithubData.mockResolvedValue({ summary: {} });
    boundary.reconcileAfterSync.mockResolvedValue({ created: 0, resolved: 0, kept: 0 });

    const withAlerts = await executeGithubSyncRun(run.id);
    boundary.reconcileAfterSync.mockResolvedValue(null);
    const withoutAlerts = await executeGithubSyncRun(run.id);

    expect(boundary.reconcileAfterSync).toHaveBeenCalledTimes(2);
    expect(withAlerts).toEqual(withoutAlerts);
    expect(withAlerts.status).toBe('SUCCEEDED');
  });
});
