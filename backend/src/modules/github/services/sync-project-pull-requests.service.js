import { pullRequestRepository } from '../../pullRequests/pullRequest.repository.js';

export async function syncProjectPullRequests({ project, repository, githubClient }) {
  const summary = { found: 0, created: 0, updated: 0 };

  for await (const page of githubClient.listPullRequestPages({
    owner: repository.owner,
    repo: repository.name
  })) {
    const pullRequests = page.map((pullRequest) => ({ ...pullRequest, projectId: project.id }));
    const result = await pullRequestRepository.upsertMany(pullRequests);
    summary.found += pullRequests.length;
    summary.created += result.created;
    summary.updated += result.updated;
  }

  return summary;
}
