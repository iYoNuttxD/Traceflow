import { beforeEach, describe, expect, it, vi } from 'vitest';
import { traceabilityService } from '../../src/modules/traceability/traceability.service.js';

const repo = vi.hoisted(() => ({
  findProjectById: vi.fn(),
  countTasksByProject: vi.fn(),
  countTasksWithPullRequest: vi.fn(),
  countTasksWithCommit: vi.fn(),
  countTasksWithIssue: vi.fn(),
  countRequirementsByProject: vi.fn(),
  countRequirementsWithTasks: vi.fn()
}));
vi.mock('../../src/modules/traceability/traceability.repository.js', () => ({
  traceabilityRepository: repo
}));
beforeEach(() => {
  vi.clearAllMocks();
  repo.findProjectById.mockResolvedValue({ id: 1, githubIntegration: null });
  repo.countTasksByProject.mockResolvedValue(2);
  repo.countTasksWithPullRequest.mockResolvedValue(0);
  repo.countTasksWithCommit.mockResolvedValue(0);
  repo.countTasksWithIssue.mockResolvedValue(0);
  repo.countRequirementsByProject.mockResolvedValue(2);
  repo.countRequirementsWithTasks.mockResolvedValue(1);
});

describe('standalone traceability coverage', () => {
  it.each(['getPullRequestCoverage', 'getCommitCoverage', 'getIssueCoverage'])(
    '%s does not report a missing integration as zero-percent coverage',
    async (method) => {
      expect(await traceabilityService[method](1)).toEqual({
        projectId: 1,
        totalTasks: 2,
        linkedTasks: 0,
        coveragePercentage: null,
        coverage: {
          numerator: null,
          denominator: 2,
          percentage: null,
          hasData: false,
          state: 'UNAVAILABLE',
          limitations: ['GITHUB_NOT_CONFIGURED']
        }
      });
    }
  );
  it('preserves integrated coverage and local requirement-task coverage', async () => {
    expect(await traceabilityService.getRequirementTaskCoverage(1)).toMatchObject({
      coveragePercentage: 50,
      coverage: { numerator: 1, denominator: 2, percentage: 50, hasData: true }
    });
    repo.findProjectById.mockResolvedValue({ id: 1, githubIntegration: { id: 7 } });
    repo.countTasksWithCommit.mockResolvedValue(1);
    expect(await traceabilityService.getCommitCoverage(1)).toEqual({
      projectId: 1,
      totalTasks: 2,
      linkedTasks: 1,
      coveragePercentage: 50,
      coverage: { numerator: 1, denominator: 2, percentage: 50, hasData: true }
    });
  });
});
