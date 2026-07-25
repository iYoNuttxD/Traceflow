import { describe, expect, it } from 'vitest';
import {
  auditTaskPullRequests,
  canonicalProjectPatch,
  checksumIds,
  mapLegacyRole,
  mapProjectMemberToMembership,
  normalizeArtifactType,
  reconcileArtifactRecords,
  reconcileTraceLinkRecords,
  resolveUniqueUserByName,
  taskPullRequestReconciliationPlan
} from '../../scripts/lib/e8-reconciliation.js';
import { buildContractDecision } from '../../scripts/lib/e8-contract.js';
import { assertMaintenanceDatabase } from '../../scripts/lib/database-safety.js';

const project = { id: 1 };
const task = { id: 10, projectId: 1, requirementId: null, pullRequestId: null };
const pullRequest = { id: 20, projectId: 1, githubId: 'pr-20', number: 20 };

describe('E8 contract canônico', () => {
  it('audita e reconcilia o vínculo singular Task–PullRequest', () => {
    const links = [{ id: 1, taskId: task.id, pullRequestId: pullRequest.id }];
    expect(auditTaskPullRequests({ links, tasks: [task], pullRequests: [pullRequest] })).toMatchObject({
      totalRecords: 1,
      joinsWithoutTaskPullRequestId: 1,
      tasksWithMultiplePullRequests: 0,
      conflicts: 0
    });
    expect(taskPullRequestReconciliationPlan({ links, tasks: [task], pullRequests: [pullRequest] })).toEqual({
      updates: [{ taskId: task.id, pullRequestId: pullRequest.id }],
      conflicts: 0
    });
  });

  it('bloqueia múltiplas PRs e divergência entre join e FK', () => {
    const secondPullRequest = { id: 21, projectId: 1 };
    const links = [
      { taskId: task.id, pullRequestId: pullRequest.id },
      { taskId: task.id, pullRequestId: secondPullRequest.id }
    ];
    expect(taskPullRequestReconciliationPlan({ links, tasks: [task], pullRequests: [pullRequest, secondPullRequest] })).toMatchObject({ updates: [], conflicts: 1 });
    expect(taskPullRequestReconciliationPlan({
      links: [links[0]],
      tasks: [{ ...task, pullRequestId: secondPullRequest.id }],
      pullRequests: [pullRequest, secondPullRequest]
    })).toMatchObject({ updates: [], conflicts: 1 });
  });

  it('reconcilia artefatos por projeto e classifica dado ambíguo ou convertível', () => {
    expect(normalizeArtifactType('pull-request')).toBe('PULL_REQUEST');
    const result = reconcileArtifactRecords({
      projects: [project],
      artifacts: [
        { id: 1, projectId: 1, type: 'COMMIT', sha: 'abc' },
        { id: 2, projectId: 1, type: 'PR', externalId: '22' },
        { id: 3, projectId: 1, type: 'COMMIT', sha: 'novo-hash' },
        { id: 4, projectId: 1, type: 'DESCONHECIDO' }
      ],
      commits: [{ id: 1, projectId: 1, hash: 'abc' }],
      pullRequests: [{ id: 2, projectId: 1, githubId: 'pr-22', number: 22 }],
      issues: []
    });
    expect(result.report).toMatchObject({ examined: 4, matchedCommit: 1, matchedPullRequest: 1, convertibleCommit: 1, unknownType: 1, exclusiveRecords: 1 });
    expect(result.convertibleCommits).toHaveLength(1);
  });

  it('materializa TraceLink tipado e bloqueia tipo desconhecido', () => {
    const commit = { id: 30, projectId: 1 };
    const trace = reconcileTraceLinkRecords({
      traceLinks: [
        { id: 1, projectId: 1, sourceType: 'TASK', sourceId: task.id, targetType: 'COMMIT', targetId: commit.id },
        { id: 2, projectId: 1, sourceType: 'TASK', sourceId: task.id, targetType: 'CUSTOM', targetId: 99 }
      ],
      tasks: [task], requirements: [], commits: [commit], pullRequests: [], issues: [], taskCommits: [], taskIssues: []
    });
    expect(trace.plan.taskCommits).toEqual([{ taskId: task.id, commitId: commit.id }]);
    expect(trace.report).toMatchObject({ pending: 1, unsupported: 1, exclusiveRecords: 1 });
  });

  it('bloqueia contract com conflito, dado exclusivo ou consumidor ativo', () => {
    const audit = {
      taskPullRequests: { tablePresent: true, totalRecords: 1, reconciled: 0, exclusiveRecords: 1, conflicts: 1 },
      artifacts: { tablePresent: true, examined: 0, reconciled: 0, exclusiveRecords: 0, ambiguous: 0 },
      traceLinks: { tablePresent: true, examined: 0, reconciled: 0, exclusiveRecords: 0, conflicts: 0 }
    };
    const decision = buildContractDecision({
      audit,
      consumers: { taskPullRequest: 0, githubArtifact: 1, traceLink: 0 },
      dependencies: { taskPullRequest: 0, githubArtifact: 0, traceLink: 0 }
    });
    expect(decision.taskPullRequest.removable).toBe(false);
    expect(decision.githubArtifact.removable).toBe(false);
    expect(decision.traceLink.removable).toBe(true);
  });

  it('mantém helpers anteriores determinísticos e sem exposição de PII', () => {
    expect(checksumIds([3, 1, 3, 2])).toBe(checksumIds([1, 2, 3]));
    expect(mapLegacyRole('dono')).toBe('OWNER');
    expect(mapLegacyRole('papel-historico')).toBeNull();
    const memberships = [{ userId: 7, isActive: true, user: { name: 'Pessoa Artificial', email: 'pessoa@example.invalid' } }];
    expect(resolveUniqueUserByName(' pessoa artificial ', memberships)).toEqual({ status: 'MATCHED', userId: 7 });
    expect(mapProjectMemberToMembership({ email: 'PESSOA@example.invalid' }, memberships)).toEqual({ status: 'MATCHED', userId: 7 });
    expect(canonicalProjectPatch({ githubOwner: 'owner', githubRepo: 'repo' })).toMatchObject({ githubRepositoryFullName: 'owner/repo' });
  });

  it('protege apply em desenvolvimento e produção, liberando banco de teste', () => {
    expect(assertMaintenanceDatabase({ databaseUrl: 'mysql://u:p@localhost/traceflow_test', developmentDatabaseUrl: 'mysql://u:p@localhost/traceflow', apply: true })).toContain('traceflow_test');
    expect(() => assertMaintenanceDatabase({ databaseUrl: 'mysql://u:p@localhost/traceflow', apply: true })).toThrow(/confirm-development/);
    expect(() => assertMaintenanceDatabase({ databaseUrl: 'mysql://u:p@localhost/traceflow_production', apply: true })).toThrow(/confirm-production/);
  });
});
