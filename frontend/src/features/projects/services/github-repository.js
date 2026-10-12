export function normalizeRepository(repository) {
  const fullName = repository.fullName || '';
  const githubRepositoryId = String(repository.githubRepositoryId || '');

  return {
    id: githubRepositoryId,
    githubRepositoryId,
    owner: typeof repository.owner === 'string' ? repository.owner : '',
    name: repository.name || '',
    fullName,
    url: repository.url || '',
    description: repository.description || '',
    private: repository.private === true,
    defaultBranch: repository.defaultBranch || '',
    alreadyConnected: repository.alreadyConnected === true,
    connectedToCurrentProject: repository.connectedToCurrentProject === true,
    selectable: repository.selectable !== false,
    githubInstallationId: String(repository.githubInstallationId || ''),
    accountLogin: repository.accountLogin || '',
    connectedProject: repository.connectedProject || null,
    pendingDeletion: repository.pendingDeletion || null
  };
}
