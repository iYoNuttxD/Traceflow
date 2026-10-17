import { pullRequestRepository } from '../../pullRequests/pullRequest.repository.js';
import { logger } from '../../../shared/logger/index.js';

export async function syncProjectPullRequests({
  project,
  repository,
  githubClient,
  onProgress = async () => {},
  assertActive = async () => {}
}) {
  const summary = { found: 0, created: 0, updated: 0 };

  for await (const page of githubClient.listPullRequestPages({
    owner: repository.owner,
    repo: repository.name
  })) {
    await assertActive();
    const pullRequests = page.map((pullRequest) => ({ ...pullRequest, projectId: project.id }));
    const result = await pullRequestRepository.upsertMany(pullRequests);
    summary.found += pullRequests.length;
    summary.created += result.created;
    summary.updated += result.updated;
    if (result.anomalies)
      logger.warn('Pull request mesclada voltou a outro estado no GitHub.', {
        event: 'github_pull_request_state_anomaly',
        projectId: project.id,
        count: result.anomalies
      });
    await onProgress({
      pullRequestsFound: summary.found,
      pullRequestsCreated: summary.created,
      pullRequestsUpdated: summary.updated
    });
  }

  return summary;
}
