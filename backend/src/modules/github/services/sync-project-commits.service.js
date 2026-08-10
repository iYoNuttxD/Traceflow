import { commitRepository } from '../../commits/commit.repository.js';
import { commitSuggestionService } from '../../traceability/commit-suggestion.service.js';
import { logger } from '../../../shared/logger/index.js';

export async function syncProjectCommits({ project, repository, branches, githubClient }) {
  const uniqueHashes = new Set();
  const summary = {
    found: 0,
    foundAcrossBranches: 0,
    unique: 0,
    created: 0,
    skipped: 0,
    linksCreated: 0
  };

  for (const branch of branches) {
    try {
      for await (const page of githubClient.listCommitPages({
        owner: repository.owner,
        repo: repository.name,
        branch: branch.name
      })) {
        const commits = page.map((commit) => ({
          ...commit,
          branch: branch.name,
          projectId: project.id
        }));
        commits.forEach(({ hash }) => uniqueHashes.add(hash));
        const existingHashes = new Set(
          await commitRepository.findHashesByProjectId(
            project.id,
            commits.map(({ hash }) => hash)
          )
        );
        const newCommits = commits.filter(({ hash }) => !existingHashes.has(hash));
        const created = await commitRepository.createMany(newCommits);
        const persistedCommits = await commitRepository.findByProjectIdAndHashes(
          project.id,
          commits.map(({ hash }) => hash)
        );
        const links = await commitRepository.createBranchLinks(
          persistedCommits.map((commit) => ({ commitId: commit.id, branchId: branch.id }))
        );

        if (created.count > 0) {
          const newHashes = new Set(newCommits.map(({ hash }) => hash));
          await commitSuggestionService.detectForCommits(
            project.id,
            persistedCommits.filter(({ hash }) => newHashes.has(hash))
          );
        }

        summary.foundAcrossBranches += commits.length;
        summary.created += created.count;
        summary.linksCreated += links.count;
      }
    } catch (error) {
      logger.warn('Sincronização de commits interrompida em uma branch.', {
        event: 'github_branch_commit_sync_failed',
        branch: branch.name,
        errorCode: error.code || 'GITHUB_BRANCH_SYNC_FAILED'
      });
      throw error;
    }
  }

  summary.unique = uniqueHashes.size;
  summary.found = summary.unique;
  summary.skipped = summary.foundAcrossBranches - summary.created;
  return summary;
}
