import { issueRepository } from '../../issues/issue.repository.js';
import { logger } from '../../../shared/logger/index.js';

export async function syncProjectIssues({
  project,
  repository,
  githubClient,
  assertActive = async () => {}
}) {
  const summary = { found: 0, created: 0, updated: 0, transitions: 0 };

  for await (const page of githubClient.listIssuePages({
    owner: repository.owner,
    repo: repository.name
  })) {
    await assertActive();
    const issues = page.map((issue) => ({ ...issue, projectId: project.id }));
    const result = await issueRepository.upsertMany(issues);
    summary.found += issues.length;
    summary.created += result.created;
    summary.updated += result.updated;
    summary.transitions += result.transitions;
    if (result.transitions)
      logger.info('Transições de issues vinculadas registradas.', {
        event: 'github_artifact_transitions_recorded',
        projectId: project.id,
        artifact: 'ISSUE',
        transitions: result.transitions,
        linkedTasks: result.linkedTasks
      });
  }

  return summary;
}
