import { prisma } from '../../database/prismaClient.js';
import { loadRequirementProjections } from './requirement-projection.repository.js';

const person = { select: { name: true } };
const identity = { select: { id: true, title: true } };
// A fixed set of relation queries; no database call is made inside an entity loop.
export async function loadExpandedGraph(tx, projectId, requirementId) {
  const requirement = await tx.requirement.findFirst({
    where: { id: requirementId, projectId },
    select: { id: true, projectId: true, title: true, status: true }
  });
  if (!requirement) return null;
  const cases = await tx.testCase.findMany({
    where: {
      projectId,
      deletedAt: null,
      OR: [{ requirementId }, { taskLinks: { some: { task: { projectId, requirementId } } } }]
    },
    select: {
      id: true,
      title: true,
      status: true,
      requirementId: true,
      currentVersion: true,
      responsibleUser: person,
      taskLinks: { where: { task: { projectId } }, select: { taskId: true } },
      _count: { select: { executions: true } }
    },
    orderBy: { id: 'asc' }
  });
  const defects = await tx.defect.findMany({
    where: {
      projectId,
      deletedAt: null,
      OR: [
        { requirementId },
        { taskLinks: { some: { relationType: 'ORIGIN', task: { projectId, requirementId } } } },
        { detectedStep: { execution: { projectId, testCaseId: { in: cases.map((c) => c.id) } } } }
      ]
    },
    select: {
      id: true,
      title: true,
      severity: true,
      status: true,
      requirementId: true,
      responsibleUser: person,
      currentCorrectionCycle: true,
      detectedStep: { select: { id: true, position: true, executionId: true } },
      taskLinks: {
        where: { task: { projectId } },
        select: { taskId: true, relationType: true, correctionCycle: true }
      },
      retests: { select: { testExecutionId: true, correctionCycle: true }, orderBy: { id: 'desc' } }
    },
    orderBy: { id: 'asc' }
  });
  const executions = await tx.testExecution.findMany({
    where: {
      projectId,
      OR: [
        { testCaseId: { in: cases.map((c) => c.id) } },
        {
          id: {
            in: defects.flatMap((d) => [
              d.detectedStep.executionId,
              ...d.retests.map((r) => r.testExecutionId)
            ])
          }
        }
      ]
    },
    select: {
      id: true,
      testCaseId: true,
      testCaseVersion: true,
      result: true,
      environment: true,
      executedAt: true,
      executedByDisplayNameSnapshot: true,
      testedReferenceSnapshot: true,
      _count: { select: { steps: true, evidence: true } }
    },
    orderBy: [{ executedAt: 'desc' }, { id: 'desc' }]
  });
  const tasks = await tx.task.findMany({
    where: {
      projectId,
      OR: [
        { requirementId },
        {
          id: {
            in: [
              ...cases.flatMap((c) => c.taskLinks.map((l) => l.taskId)),
              ...defects.flatMap((d) => d.taskLinks.map((l) => l.taskId))
            ]
          }
        }
      ]
    },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      estimatedEffort: true,
      actualEffort: true,
      requirementId: true,
      responsible: true,
      responsibleUser: person,
      sprint: { select: { id: true, name: true } },
      requirement: identity,
      pullRequestId: true,
      commitLinks: { where: { commit: { projectId } }, select: { commitId: true } },
      issueLinks: { where: { issue: { projectId } }, select: { issueId: true } }
    },
    orderBy: { id: 'asc' }
  });
  const [pullRequests, commits, issues, steps, projections] = await Promise.all([
    tx.pullRequest.findMany({
      where: { projectId, id: { in: tasks.map((t) => t.pullRequestId).filter(Boolean) } },
      select: {
        id: true,
        number: true,
        title: true,
        state: true,
        authorUsername: true,
        createdAtGithub: true,
        closedAtGithub: true,
        mergedAtGithub: true,
        sourceBranch: true,
        targetBranch: true,
        githubUrl: true
      },
      orderBy: { id: 'asc' }
    }),
    tx.commit.findMany({
      where: { projectId, id: { in: tasks.flatMap((t) => t.commitLinks.map((l) => l.commitId)) } },
      select: {
        id: true,
        hash: true,
        message: true,
        authorName: true,
        authorUsername: true,
        date: true,
        githubUrl: true
      },
      orderBy: { id: 'asc' }
    }),
    tx.issue.findMany({
      where: { projectId, id: { in: tasks.flatMap((t) => t.issueLinks.map((l) => l.issueId)) } },
      select: {
        id: true,
        number: true,
        title: true,
        state: true,
        authorUsername: true,
        createdAtGithub: true,
        closedAtGithub: true,
        githubUrl: true
      },
      orderBy: { id: 'asc' }
    }),
    tx.testExecutionStep.groupBy({
      by: ['executionId', 'result'],
      where: { execution: { projectId }, executionId: { in: executions.map((e) => e.id) } },
      _count: { _all: true }
    }),
    loadRequirementProjections(tx, projectId, [requirementId])
  ]);
  return {
    requirement,
    tasks,
    cases,
    executions,
    defects,
    pullRequests,
    commits,
    issues,
    steps,
    projection: projections[0]
  };
}
export function readExpandedGraph(projectId, requirementId) {
  return prisma.$transaction((tx) => loadExpandedGraph(tx, projectId, requirementId), {
    isolationLevel: 'RepeatableRead'
  });
}
