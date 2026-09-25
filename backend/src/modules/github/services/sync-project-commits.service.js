import { commitRepository } from '../../commits/commit.repository.js';
import { commitSuggestionService } from '../../traceability/commit-suggestion.service.js';
import { githubBranchRepository } from '../github-branch.repository.js';
import { logger } from '../../../shared/logger/index.js';

const noProgress = async () => {};

async function persistPage({ commits, knownCommits, projectId }) {
  const uniquePageCommits = [
    ...new Map(commits.filter(({ hash }) => hash).map((commit) => [commit.hash, commit])).values()
  ];
  const unknownHashes = uniquePageCommits
    .map(({ hash }) => hash)
    .filter((hash) => !knownCommits.has(hash));
  const existing = await commitRepository.findByProjectIdAndHashes(projectId, unknownHashes);
  existing.forEach((commit) => knownCommits.set(commit.hash, commit));

  await commitRepository.fillGithubAuthorIds(
    projectId,
    uniquePageCommits.filter(
      ({ hash, authorGithubUserId }) =>
        authorGithubUserId != null &&
        knownCommits.has(hash) &&
        knownCommits.get(hash).authorGithubUserId == null
    )
  );

  const newCommits = uniquePageCommits.filter(({ hash }) => !knownCommits.has(hash));
  const created = await commitRepository.createMany(newCommits);
  const newlyPersisted = await commitRepository.findByProjectIdAndHashes(
    projectId,
    newCommits.map(({ hash }) => hash)
  );
  newlyPersisted.forEach((commit) => knownCommits.set(commit.hash, commit));

  const persistedPage = uniquePageCommits.map(({ hash }) => knownCommits.get(hash)).filter(Boolean);

  if (created.count > 0) {
    const newHashes = new Set(newCommits.map(({ hash }) => hash));
    await commitSuggestionService.detectForCommits(
      projectId,
      newlyPersisted.filter(({ hash }) => newHashes.has(hash))
    );
  }

  return { created: created.count, commitIds: persistedPage.map(({ id }) => id) };
}

export async function syncProjectCommits({
  project,
  repository,
  branches,
  githubClient,
  onProgress = noProgress,
  assertActive = noProgress
}) {
  const uniqueHashes = new Set();
  const knownCommits = new Map();
  const summary = {
    found: 0,
    foundAcrossBranches: 0,
    unique: 0,
    created: 0,
    skipped: 0,
    linksCreated: 0,
    pages: 0,
    branchesSkipped: 0
  };
  let processedBranches = 0;

  for (const branch of branches) {
    const branchStartedAt = Date.now();
    const unchanged = Boolean(
      branch.headSha && branch.lastSyncedGeneration && branch.lastSyncedHeadSha === branch.headSha
    );
    let branchPages = 0;
    let branchCommits = 0;
    const observedCommitIds = [];

    logger.info('Sincronização de commits da branch iniciada.', {
      event: 'github_branch_sync_started',
      projectId: project.id,
      branch: branch.name,
      unchanged
    });
    await onProgress({ currentBranch: branch.name });
    await assertActive();

    if (unchanged) {
      const persistedCommits = await commitRepository.findByBranchId(branch.id);
      persistedCommits.forEach((commit) => {
        knownCommits.set(commit.hash, commit);
        uniqueHashes.add(commit.hash);
      });
      branchCommits = persistedCommits.length;
      summary.foundAcrossBranches += branchCommits;
      summary.branchesSkipped += 1;
      processedBranches += 1;
      await onProgress({
        processedBranches,
        currentBranch: null,
        commitsFound: uniqueHashes.size,
        commitsObserved: summary.foundAcrossBranches
      });
      logger.info('Sincronização de commits da branch concluída.', {
        event: 'github_branch_sync_completed',
        projectId: project.id,
        branch: branch.name,
        durationMs: Date.now() - branchStartedAt,
        pages: 0,
        commitsFound: branchCommits,
        unchanged: true
      });
      continue;
    }

    try {
      if (!branch.headSha)
        throw new Error('Branch sem head SHA; varredura completa não comprovável.');
      for await (const page of githubClient.listCommitPages({
        owner: repository.owner,
        repo: repository.name,
        branch: branch.headSha
      })) {
        await assertActive();
        const commits = page.map(({ branch: _legacyBranch, ...commit }) => ({
          ...commit,
          projectId: project.id
        }));
        commits.forEach(({ hash }) => uniqueHashes.add(hash));
        const persisted = await persistPage({
          commits,
          knownCommits,
          projectId: project.id
        });

        branchPages += 1;
        branchCommits += commits.length;
        summary.pages += 1;
        summary.foundAcrossBranches += commits.length;
        summary.created += persisted.created;
        observedCommitIds.push(...persisted.commitIds);
        await onProgress({
          commitPages: summary.pages,
          commitsFound: uniqueHashes.size,
          commitsObserved: summary.foundAcrossBranches,
          commitsCreated: summary.created,
          commitLinksCreated: summary.linksCreated
        });
      }

      await assertActive();
      const links = await githubBranchRepository.reconcileMembership(
        project.id,
        branch.id,
        branch.headSha,
        observedCommitIds
      );
      summary.linksCreated += links.count;
      processedBranches += 1;
      await onProgress({ processedBranches, currentBranch: null });
      logger.info('Sincronização de commits da branch concluída.', {
        event: 'github_branch_sync_completed',
        projectId: project.id,
        branch: branch.name,
        durationMs: Date.now() - branchStartedAt,
        pages: branchPages,
        commitsFound: branchCommits,
        unchanged: false
      });
    } catch (error) {
      logger.warn('Sincronização de commits interrompida em uma branch.', {
        event: 'github_branch_commit_sync_failed',
        projectId: project.id,
        branch: branch.name,
        durationMs: Date.now() - branchStartedAt,
        pages: branchPages,
        commitsFound: branchCommits,
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
