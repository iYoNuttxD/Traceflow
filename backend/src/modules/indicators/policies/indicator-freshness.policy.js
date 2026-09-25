export function githubFreshness(integration, branch) {
  const sourceUpdatedAt = integration?.lastSyncAt ?? null;
  const sourceSyncStatus = integration?.lastSyncStatus ?? null;
  const limitations = [];
  if (integration?.status !== 'ACTIVE') limitations.push('GITHUB_INTEGRATION_NOT_ACTIVE');
  if (['FALHA', 'BLOQUEADO'].includes(sourceSyncStatus)) limitations.push('GITHUB_SYNC_FAILED');
  if (branch?.headSha !== branch?.lastSyncedHeadSha) limitations.push('MAIN_HEAD_NOT_RECONCILED');
  return {
    sourceUpdatedAt,
    sourceSyncStatus,
    stale: limitations.length > 0,
    limitations
  };
}
