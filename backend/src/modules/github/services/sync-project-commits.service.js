import { commitRepository } from '../../commits/commit.repository.js';
import { commitSuggestionService } from '../../traceability/commit-suggestion.service.js';

export async function syncProjectCommits({ project, repository, githubClient }) {
  const summary = { found: 0, created: 0, skipped: 0 };

  for await (const page of githubClient.listCommitPages({
    owner: repository.owner,
    repo: repository.name,
    branch: repository.defaultBranch
  })) {
    const commits = page.map((commit) => ({ ...commit, projectId: project.id }));
    const existingHashes = new Set(await commitRepository.findHashesByProjectId(
      project.id,
      commits.map(({ hash }) => hash)
    ));
    const newCommits = commits.filter(({ hash }) => !existingHashes.has(hash));
    const result = await commitRepository.createMany(newCommits);
    if (result.count > 0) {
      const persistedCommits = await commitRepository.findByProjectIdAndHashes(
        project.id,
        newCommits.map(({ hash }) => hash)
      );
      await commitSuggestionService.detectForCommits(project.id, persistedCommits);
    }

    summary.found += commits.length;
    summary.created += result.count;
    summary.skipped += commits.length - result.count;
  }

  return summary;
}
