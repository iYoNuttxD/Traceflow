import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROJECT_RECOVERY_WINDOW_MS,
  createProjectDeletionService
} from '../../src/modules/projects/services/project-deletion.service.js';

const project = {
  id: 12,
  name: 'TraceFlow',
  deletedAt: new Date('2026-09-21T00:00:00.000Z'),
  deletionScheduledFor: new Date('2026-10-21T00:00:00.000Z'),
  githubIntegration: {
    githubRepositoryId: '9001',
    repositoryFullName: 'trace/flow'
  },
  memberships: [{ role: 'OWNER' }]
};

function doubles() {
  const repository = {
    requestDeletion: vi.fn(),
    restore: vi.fn(),
    context: vi.fn(),
    claimPurge: vi.fn(),
    evidence: vi.fn().mockResolvedValue([]),
    prepareStorageCleanup: vi.fn().mockResolvedValue([]),
    pendingStorageCleanup: vi.fn().mockResolvedValue([]),
    deleteProjectGraph: vi.fn().mockResolvedValue(true),
    releasePurge: vi.fn().mockResolvedValue(),
    dueProjects: vi.fn().mockResolvedValue([]),
    cleanupReadyStorageItem: vi.fn().mockResolvedValue(true),
    claimReadyStorageCleanup: vi.fn(),
    failStorageCleanup: vi.fn(),
    stageStorageItem: vi.fn().mockResolvedValue(true),
    restoreStorageItem: vi.fn().mockResolvedValue(true)
  };
  const storage = {
    stageForPurge: vi.fn(),
    restoreFromPurge: vi.fn(),
    deletePurged: vi.fn()
  };
  return { repository, storage, service: createProjectDeletionService({ repository, storage }) };
}

describe('ProjectDeletionService', () => {
  let repository;
  let storage;
  let service;

  beforeEach(() => {
    ({ repository, storage, service } = doubles());
  });

  it('uses an exact 30-day UTC interval and returns the minimized pending DTO', async () => {
    const now = new Date('2026-09-21T00:00:00.000Z');
    repository.requestDeletion.mockImplementation(async (input) => ({
      outcome: 'DELETED',
      project: { ...project, deletedAt: input.now, deletionScheduledFor: input.scheduledFor }
    }));

    const result = await service.requestDeletion(12, 7, { now });

    expect(repository.requestDeletion).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 12,
        userId: 7,
        now,
        scheduledFor: new Date(now.getTime() + PROJECT_RECOVERY_WINDOW_MS)
      })
    );
    expect(result).toEqual({
      projectId: 12,
      projectName: 'TraceFlow',
      deletionScheduledFor: new Date('2026-10-21T00:00:00.000Z'),
      repositoryIdentifier: '9001',
      repositoryFullName: 'trace/flow'
    });
  });

  it.each([
    ['FORBIDDEN', 403, 'PROJECT_DELETION_FORBIDDEN'],
    ['ALREADY_DELETED', 409, 'PROJECT_ALREADY_DELETED'],
    ['NOT_FOUND', 404, 'PROJECT_NOT_FOUND']
  ])('maps deletion outcome %s', async (outcome, statusCode, code) => {
    repository.requestDeletion.mockResolvedValue({ outcome });
    await expect(service.requestDeletion(12, 7)).rejects.toMatchObject({ statusCode, code });
  });

  it('restores only a historical OWNER before expiry', async () => {
    repository.restore.mockResolvedValue({
      outcome: 'RESTORED',
      project: { id: 12, name: 'TraceFlow' }
    });
    await expect(service.restore(12, 7)).resolves.toMatchObject({ id: 12, name: 'TraceFlow' });
    repository.restore.mockResolvedValue({ outcome: 'FORBIDDEN' });
    await expect(service.restore(12, 8)).rejects.toMatchObject({
      statusCode: 403,
      code: 'PROJECT_RESTORE_FORBIDDEN'
    });
    repository.restore.mockResolvedValue({ outcome: 'EXPIRED' });
    await expect(service.restore(12, 7)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('requires exact project-name confirmation before claiming permanent deletion', async () => {
    repository.claimPurge.mockResolvedValue({ outcome: 'INVALID_CONFIRMATION' });
    await expect(service.purge(12, 7, 'traceflow')).rejects.toMatchObject({
      code: 'PROJECT_DELETION_CONFIRMATION_INVALID'
    });
    expect(repository.claimPurge).toHaveBeenCalledWith(
      12,
      expect.any(Date),
      expect.objectContaining({ userId: 7, confirmationName: 'traceflow' })
    );
  });

  it('stages evidence, deletes the graph and keeps failed filesystem cleanup for retry', async () => {
    repository.claimPurge.mockResolvedValue({ outcome: 'CLAIMED', token: 'claim-a' });
    repository.evidence.mockResolvedValue([{ storageKey: '12345678-1234-4234-8234-123456789abc' }]);
    const item = {
      id: 3,
      projectId: 12,
      storageKey: '12345678-1234-4234-8234-123456789abc',
      purgeKey: 'abcdefab-1234-4234-8234-123456789abc'
    };
    repository.prepareStorageCleanup.mockResolvedValue([item]);
    repository.pendingStorageCleanup.mockResolvedValueOnce([
      {
        ...item,
        status: 'READY'
      }
    ]);
    repository.cleanupReadyStorageItem.mockRejectedValue(
      Object.assign(new Error('storage'), { code: 'EACCES' })
    );

    await expect(service.purge(12, 7, 'TraceFlow')).resolves.toEqual({
      purged: true,
      storageFailures: 1
    });
    expect(repository.stageStorageItem).toHaveBeenCalledWith(12, 'claim-a', item, storage);
    expect(repository.deleteProjectGraph).toHaveBeenCalledWith(12, 'claim-a', expect.any(Object));
    expect(repository.failStorageCleanup).toHaveBeenCalledWith(3, 'claim-a', 'EACCES');
  });

  it('uses explicit time for due purge and never sleeps', async () => {
    const now = new Date('2026-10-22T00:00:00.000Z');
    repository.dueProjects.mockResolvedValue([{ id: 12 }]);
    repository.claimPurge.mockResolvedValue({ outcome: 'CLAIMED', token: 'claim-due' });
    const result = await service.processDue({ now, dryRun: false });
    expect(result).toMatchObject({ count: 1, processed: 1, failed: 0 });
    expect(repository.claimPurge).toHaveBeenCalledWith(
      12,
      now,
      expect.objectContaining({ dueOnly: true })
    );
  });
});
