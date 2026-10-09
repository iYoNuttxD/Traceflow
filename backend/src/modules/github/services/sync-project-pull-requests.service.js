import { pullRequestRepository } from '../../pullRequests/pullRequest.repository.js';

export async function syncProjectPullRequests({
  project,
  repository,
  githubClient,
  onProgress = async () => {},
  assertActive = async () => {}
}) {
  const summary = {
    found: 0,
    created: 0,
    updated: 0,
    lifecycleEventsObserved: 0,
    lifecycleEventsCreated: 0
  };

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
    await onProgress({
      pullRequestsFound: summary.found,
      pullRequestsCreated: summary.created,
      pullRequestsUpdated: summary.updated
    });
  }

  // Repository-wide pagination avoids one external request per PR. Nothing is
  // marked complete if any page fails; existing append-only events remain.
  const events = [];
  for await (const page of githubClient.listPullRequestLifecycleEventPages({
    owner: repository.owner,
    repo: repository.name
  })) {
    await assertActive();
    events.push(...page);
    await onProgress({});
  }
  await assertActive();
  const persisted = await pullRequestRepository.appendLifecycleEvents(project.id, events);
  summary.lifecycleEventsObserved = events.length;
  summary.lifecycleEventsCreated = persisted.count;

  return summary;
}
