import { beforeEach, describe, expect, it, vi } from 'vitest';
import { indicatorsService } from '../../src/modules/indicators/indicators.service.js';

const readActivity = vi.hoisted(() => vi.fn());
vi.mock('../../src/modules/indicators/indicators.repository.js', () => ({
  indicatorsRepository: { readActivity }
}));
const query = { startDate: '2026-09-01', endDate: '2026-09-30', timeZone: 'UTC' };
const asOf = new Date('2026-10-01T12:00:00Z');
const integration = { status: 'ACTIVE', lastSyncStatus: 'PENDENTE', lastSyncAt: null };
const branch = {
  name: 'main',
  headSha: 'head',
  lastSyncedHeadSha: 'head',
  lastSyncedGeneration: 'one'
};
async function read(githubIntegration, main, commitRows = []) {
  readActivity.mockResolvedValue({
    project: { githubIntegration },
    branch: main,
    commitRows,
    taskRows: [],
    asOf
  });
  return (await indicatorsService.activity(1, query)).indicators;
}
beforeEach(() => vi.clearAllMocks());

describe('GitHub activity applicability diagnostics', () => {
  it('does not report missing branches for an intentionally unconfigured source', async () => {
    const [commits] = await read(null, null);
    expect(commits).toMatchObject({
      value: null,
      state: 'UNAVAILABLE',
      sourceUpdatedAt: null,
      sourceSyncStatus: null,
      limitations: ['GITHUB_NOT_CONFIGURED']
    });
  });
  it('does not report snapshot errors or expose residual commits without an integration', async () => {
    const [commits, , combined] = await read(null, branch, [
      { userId: 1, displayName: 'Local', count: 9 }
    ]);
    expect(commits).toMatchObject({
      value: null,
      state: 'UNAVAILABLE',
      limitations: ['GITHUB_NOT_CONFIGURED']
    });
    expect(combined.value.commits).toBeNull();
    expect(combined.people).toEqual([]);
  });
  it('retains missing-main and unconfirmed-snapshot diagnoses for configured GitHub', async () => {
    expect((await read(integration, null))[0]).toMatchObject({
      value: null,
      state: 'UNAVAILABLE',
      limitations: ['MAIN_BRANCH_NOT_OBSERVED']
    });
    expect(
      (
        await read(integration, { ...branch, lastSyncedHeadSha: null, lastSyncedGeneration: null })
      )[0]
    ).toMatchObject({
      value: null,
      state: 'UNAVAILABLE',
      limitations: ['MAIN_MEMBERSHIP_NOT_CONFIRMED', 'MAIN_HEAD_NOT_RECONCILED']
    });
  });
  it('retains known data and STALE after a configured collection failure', async () => {
    const [commits] = await read(
      { ...integration, lastSyncStatus: 'FALHA', lastSyncAt: asOf },
      branch,
      [{ userId: 1, displayName: 'Member', count: 1 }]
    );
    expect(commits).toMatchObject({
      value: 1,
      state: 'STALE',
      sourceSyncStatus: 'FALHA',
      limitations: ['GITHUB_SYNC_FAILED']
    });
  });
});
