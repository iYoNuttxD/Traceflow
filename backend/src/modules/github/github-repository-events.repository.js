import { withActiveProjectWrite } from '../projects/active-project-write.js';
import { issueRepository } from '../issues/issue.repository.js';
import { pullRequestRepository } from '../pullRequests/pullRequest.repository.js';
import { githubEventRepository } from '../notifications/github-event.repository.js';

export const githubRepositoryEventsRepository = {
  begin(projectId, readStartedAt) {
    return githubEventRepository.ensureCoverage(projectId, readStartedAt);
  },

  record(projectId, { pullRequestEvents, issueEvents, readStartedAt }, completedAt = new Date()) {
    return withActiveProjectWrite(
      projectId,
      async (tx) => {
        const pullRequests = await pullRequestRepository.insertLifecycleEvents(
          tx,
          projectId,
          pullRequestEvents,
          completedAt
        );
        const issues = await issueRepository.insertLifecycleEvents(tx, projectId, issueEvents);
        const recorded = await githubEventRepository.recordFromLifecycle(tx, {
          projectId,
          pullRequests: pullRequests.inserted,
          issues: issues.inserted,
          detectedAt: completedAt
        });
        await githubEventRepository.advanceCoverage(tx, projectId, readStartedAt);
        return {
          pullRequests: { count: pullRequests.count, ignoredCount: pullRequests.ignoredCount },
          issues: { count: issues.count, ignoredCount: issues.ignoredCount },
          recorded
        };
      },
      { timeout: 120000 }
    );
  }
};
