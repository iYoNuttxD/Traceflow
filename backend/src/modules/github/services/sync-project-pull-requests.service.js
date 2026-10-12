import { pullRequestRepository } from '../../pullRequests/pullRequest.repository.js';
import { logger } from '../../../shared/logger/index.js';

export async function syncProjectPullRequests({
  project,
  repository,
  githubClient,
  assertActive = async () => {}
}) {
  const summary = { found: 0, created: 0, updated: 0, transitions: 0 };

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
    summary.transitions += result.transitions;
    if (result.transitions)
      logger.info('Transições de pull requests vinculadas registradas.', {
        event: 'github_artifact_transitions_recorded',
        projectId: project.id,
        artifact: 'PULL_REQUEST',
        transitions: result.transitions,
        linkedTasks: result.linkedTasks
      });
    if (result.anomalies)
      logger.warn('Pull request mesclada voltou a outro estado no GitHub.', {
        event: 'github_pull_request_state_anomaly',
        projectId: project.id,
        count: result.anomalies
      });
  }

  return summary;
}
