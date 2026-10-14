import './GitHubSyncProgress.css';

export const syncStepLabels = {
  QUEUED: 'aguardando início',
  REPOSITORY: 'repositório',
  BRANCHES: 'branches',
  COMMITS: 'commits',
  PULL_REQUESTS: 'pull requests',
  ISSUES: 'issues',
  PERSIST: 'persistência',
  COMPLETED: 'concluída'
};

export function GitHubSyncProgress({ run }) {
  if (!run || !['QUEUED', 'RUNNING'].includes(run.status)) return null;
  return (
    <div className="github-sync-progress" role="status" aria-live="polite">
      <strong>
        {run.origin === 'AUTOMATIC' ? 'Sincronizando automaticamente' : 'Sincronizando GitHub...'}
      </strong>
      <span>Etapa atual: {syncStepLabels[run.step] || run.step}</span>
      {run.progress?.branchCount > 0 && (
        <span>
          Branches: {run.progress.processedBranches ?? 0}/{run.progress.branchCount}
        </span>
      )}
      {run.currentBranch && <span>Branch: {run.currentBranch}</span>}
      {run.startedAt && (
        <span>
          Iniciada em{' '}
          {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
            new Date(run.startedAt)
          )}
        </span>
      )}
    </div>
  );
}
