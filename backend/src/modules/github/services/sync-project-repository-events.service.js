import { logger } from '../../../shared/logger/index.js';
import { githubRepositoryEventsRepository } from '../github-repository-events.repository.js';

export async function syncProjectRepositoryEvents({
  project,
  repository,
  githubClient,
  onProgress = async () => {},
  assertActive = async () => {}
}) {
  const summary = {
    lifecycleEventsObserved: 0,
    lifecycleEventsCreated: 0,
    issueEventsObserved: 0,
    issueEventsCreated: 0,
    githubEventsRecorded: 0
  };
  const readStartedAt = new Date();
  await githubRepositoryEventsRepository.begin(project.id, readStartedAt);
  const events = { PULL_REQUEST: [], ISSUE: [] };
  for await (const page of githubClient.listRepositoryEventPages({
    owner: repository.owner,
    repo: repository.name
  })) {
    await assertActive();
    for (const { kind, ...event } of page) events[kind].push(event);
    await onProgress({});
  }
  await assertActive();
  const persisted = await githubRepositoryEventsRepository.record(project.id, {
    pullRequestEvents: events.PULL_REQUEST,
    issueEvents: events.ISSUE,
    readStartedAt
  });
  summary.lifecycleEventsObserved = events.PULL_REQUEST.length;
  summary.lifecycleEventsCreated = persisted.pullRequests.count;
  summary.issueEventsObserved = events.ISSUE.length;
  summary.issueEventsCreated = persisted.issues.count;
  summary.githubEventsRecorded = persisted.recorded;
  if (persisted.recorded)
    logger.info('Eventos de issues e pull requests vinculadas registrados.', {
      event: 'github_artifact_events_recorded',
      projectId: project.id,
      events: persisted.recorded
    });

  return summary;
}
