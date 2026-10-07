import { prisma } from '../../database/prismaClient.js';
import { auditRepository } from '../audit/audit.repository.js';
import { lockActiveProject } from '../projects/active-project-write.js';
import { ProjectServiceError } from '../projects/project.schema.js';
import {
  ACTIVE_ALERT_STATUSES,
  ISSUE_ALERT,
  PULL_REQUEST_ALERT,
  TASK_ALERT,
  TRACEABILITY_ALERT_TYPES,
  alertCreateData,
  alertDedupeKey,
  alertOccurredAt,
  evaluateIssueAlert,
  evaluatePullRequestAlert,
  evaluateTaskAlert,
  sortAlertCandidates,
  subjectIdFromDedupeKey,
  taskCompletionInstant
} from './traceability-alert.policy.js';

const activeStatuses = [...ACTIVE_ALERT_STATUSES];

function uniqueIds(ids = []) {
  return [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))].sort((a, b) => a - b);
}

async function ruleContext(tx, projectId) {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { createdAt: true, githubIntegration: { select: { id: true } } }
  });
  if (!project) throw new ProjectServiceError('Projeto não encontrado.', 404);
  return { cutoff: project.createdAt, integrationExists: Boolean(project.githubIntegration) };
}

const subjectRules = {
  [TASK_ALERT]: {
    async candidates(tx, projectId, rule) {
      if (!rule.integrationExists) return [];
      const rows = await tx.task.findMany({
        where: { projectId, status: 'CONCLUIDO', commitLinks: { none: {} } },
        select: { id: true }
      });
      return rows.map((row) => row.id);
    },
    subjects(tx, projectId, ids) {
      return tx.task.findMany({
        where: { projectId, id: { in: ids } },
        select: { id: true, title: true, status: true, _count: { select: { commitLinks: true } } }
      });
    },
    evaluate(subject, rule) {
      return evaluateTaskAlert({
        task: subject,
        commitCount: subject?._count.commitLinks ?? 0,
        integrationExists: rule.integrationExists
      });
    }
  },
  [PULL_REQUEST_ALERT]: {
    async candidates(tx, projectId, rule) {
      const rows = await tx.pullRequest.findMany({
        where: { projectId, mergedAtGithub: { gte: rule.cutoff }, tasks: { none: {} } },
        select: { id: true }
      });
      return rows.map((row) => row.id);
    },
    subjects(tx, projectId, ids) {
      return tx.pullRequest.findMany({
        where: { projectId, id: { in: ids } },
        select: {
          id: true,
          number: true,
          title: true,
          mergedAtGithub: true,
          _count: { select: { tasks: true } }
        }
      });
    },
    evaluate(subject, rule) {
      return evaluatePullRequestAlert({
        pullRequest: subject,
        linkedTaskCount: subject?._count.tasks ?? 0,
        cutoff: rule.cutoff
      });
    }
  },
  [ISSUE_ALERT]: {
    async candidates(tx, projectId, rule) {
      const rows = await tx.issue.findMany({
        where: {
          projectId,
          state: 'closed',
          closedAtGithub: { gte: rule.cutoff },
          taskLinks: { none: {} }
        },
        select: { id: true }
      });
      return rows.map((row) => row.id);
    },
    subjects(tx, projectId, ids) {
      return tx.issue.findMany({
        where: { projectId, id: { in: ids } },
        select: {
          id: true,
          number: true,
          title: true,
          state: true,
          closedAtGithub: true,
          _count: { select: { taskLinks: true } }
        }
      });
    },
    evaluate(subject, rule) {
      return evaluateIssueAlert({
        issue: subject,
        linkedTaskCount: subject?._count.taskLinks ?? 0,
        cutoff: rule.cutoff
      });
    }
  }
};

async function completionInstants(tx, taskIds) {
  if (!taskIds.length) return new Map();
  const entries = await tx.taskHistoryEntry.findMany({
    where: { taskId: { in: taskIds }, field: 'STATUS', toValue: 'CONCLUIDO' },
    select: { taskId: true, field: true, toValue: true, occurredAt: true }
  });
  const byTask = Map.groupBy(entries, (entry) => entry.taskId);
  return new Map(taskIds.map((id) => [id, taskCompletionInstant(byTask.get(id) || [])]));
}

function activeAlertsForSubjects(tx, projectId, requested) {
  const keys = TRACEABILITY_ALERT_TYPES.flatMap((type) =>
    requested[type].map((id) => alertDedupeKey(type, id))
  );
  if (!keys.length) return [];
  return tx.traceabilityAlert.findMany({
    where: { projectId, activeKey: { in: keys } },
    select: { id: true, type: true, dedupeKey: true }
  });
}

export async function alertScopeForTasks(tx, projectId, taskIds) {
  const ids = uniqueIds(taskIds);
  if (!projectId || !ids.length) return { pullRequestIds: [], issueIds: [] };
  const tasks = await tx.task.findMany({
    where: { projectId, id: { in: ids } },
    select: { pullRequestId: true, issueLinks: { select: { issueId: true } } }
  });
  return {
    pullRequestIds: uniqueIds(tasks.map((task) => task.pullRequestId)),
    issueIds: uniqueIds(tasks.flatMap((task) => task.issueLinks.map((link) => link.issueId)))
  };
}

export async function reconcileTraceabilityAlerts(
  tx,
  {
    projectId,
    taskIds = [],
    pullRequestIds = [],
    issueIds = [],
    full = false,
    dryRun = false,
    now = new Date()
  }
) {
  if (!dryRun) await lockActiveProject(tx, projectId);
  const rule = await ruleContext(tx, projectId);
  const requested = {
    [TASK_ALERT]: uniqueIds(taskIds),
    [PULL_REQUEST_ALERT]: uniqueIds(pullRequestIds),
    [ISSUE_ALERT]: uniqueIds(issueIds)
  };
  const activeAlerts = full
    ? await tx.traceabilityAlert.findMany({
        where: { projectId, status: { in: activeStatuses } },
        select: { id: true, type: true, dedupeKey: true }
      })
    : await activeAlertsForSubjects(tx, projectId, requested);
  const activeByKey = new Map(activeAlerts.map((alert) => [alert.dedupeKey, alert]));
  const toCreate = [];
  const toResolve = new Map();
  let kept = 0;

  for (const type of TRACEABILITY_ALERT_TYPES) {
    const rules = subjectRules[type];
    const ids = full
      ? uniqueIds([
          ...(await rules.candidates(tx, projectId, rule)),
          ...activeAlerts
            .filter((alert) => alert.type === type)
            .map((alert) => subjectIdFromDedupeKey(alert.dedupeKey))
        ])
      : requested[type];
    if (!ids.length) continue;
    const subjects = new Map(
      (await rules.subjects(tx, projectId, ids)).map((subject) => [subject.id, subject])
    );
    const creating = [];
    for (const id of ids) {
      const subject = subjects.get(id) ?? null;
      const verdict = rules.evaluate(subject, rule);
      const alert = activeByKey.get(alertDedupeKey(type, id));
      if (verdict.active && !alert) creating.push(subject);
      else if (!verdict.active && alert)
        toResolve.set(verdict.resolutionReason, [
          ...(toResolve.get(verdict.resolutionReason) || []),
          alert.id
        ]);
      else if (alert) kept += 1;
    }
    const instants =
      type === TASK_ALERT
        ? await completionInstants(
            tx,
            creating.map((subject) => subject.id)
          )
        : new Map();
    for (const subject of creating)
      toCreate.push(
        alertCreateData({
          projectId,
          type,
          subject,
          occurredAt: alertOccurredAt(type, subject, instants.get(subject.id) ?? null),
          detectedAt: now
        })
      );
  }

  const pendingResolutions = [...toResolve.values()].reduce((sum, ids) => sum + ids.length, 0);
  if (dryRun) return { created: toCreate.length, resolved: pendingResolutions, kept };

  let created = 0;
  if (toCreate.length)
    created = (
      await tx.traceabilityAlert.createMany({
        data: sortAlertCandidates(toCreate),
        skipDuplicates: true
      })
    ).count;
  let resolved = 0;
  for (const [resolutionReason, ids] of toResolve) {
    const update = await tx.traceabilityAlert.updateMany({
      where: { projectId, id: { in: ids }, status: { in: activeStatuses } },
      data: { status: 'RESOLVED', resolvedAt: now, resolutionReason }
    });
    resolved += update.count;
  }
  return { created, resolved, kept };
}

const alertInclude = {
  task: { select: { id: true, title: true, status: true } },
  pullRequest: { select: { id: true, number: true, title: true, githubUrl: true } },
  issue: { select: { id: true, number: true, title: true, githubUrl: true } },
  dismissedBy: { select: { id: true, name: true } }
};

const alertDetailInclude = {
  ...alertInclude,
  task: {
    select: {
      id: true,
      title: true,
      status: true,
      requirementId: true,
      responsibleUser: { select: { id: true, name: true } },
      pullRequest: { select: { id: true, number: true, title: true, githubUrl: true } },
      _count: {
        select: {
          issueLinks: true,
          commitSuggestions: { where: { status: 'PENDING' } }
        }
      }
    }
  },
  pullRequest: {
    select: {
      id: true,
      number: true,
      title: true,
      githubUrl: true,
      sourceBranch: true,
      targetBranch: true,
      mergedAtGithub: true
    }
  },
  issue: {
    select: {
      id: true,
      number: true,
      title: true,
      githubUrl: true,
      state: true,
      closedAtGithub: true
    }
  }
};

const alertOrder = [{ detectedAt: 'desc' }, { id: 'desc' }];

export const traceabilityAlertRepository = {
  async list(projectId, { status, type, skip, take }) {
    const where = { projectId, status, ...(type ? { type } : {}) };
    const [total, alerts] = await prisma.$transaction([
      prisma.traceabilityAlert.count({ where }),
      prisma.traceabilityAlert.findMany({
        where,
        include: alertInclude,
        orderBy: alertOrder,
        skip,
        take
      })
    ]);
    return { total, alerts };
  },

  async summary(projectId) {
    const [open, dismissed, integration] = await prisma.$transaction([
      prisma.traceabilityAlert.groupBy({
        by: ['type'],
        where: { projectId, status: 'OPEN' },
        _count: { _all: true },
        orderBy: { type: 'asc' }
      }),
      prisma.traceabilityAlert.count({ where: { projectId, status: 'DISMISSED' } }),
      prisma.projectGitHubIntegration.findUnique({ where: { projectId }, select: { id: true } })
    ]);
    return { open, dismissed, integrationExists: Boolean(integration) };
  },

  findById(projectId, alertId) {
    return prisma.traceabilityAlert.findFirst({
      where: { id: alertId, projectId },
      select: { id: true, type: true, status: true }
    });
  },

  findDetail(projectId, alertId) {
    return prisma.traceabilityAlert.findFirst({
      where: { id: alertId, projectId },
      include: alertDetailInclude
    });
  },

  async findMembershipRole(projectId, userId) {
    const membership = await prisma.projectMembership.findFirst({
      where: { projectId, userId, isActive: true, project: { deletedAt: null } },
      select: { role: true }
    });
    return membership?.role ?? null;
  },

  dismiss({ projectId, alertId, userId, reason, now, auditEvent }) {
    return prisma.$transaction(
      async (tx) => {
        await lockActiveProject(tx, projectId);
        const current = await tx.traceabilityAlert.findFirst({
          where: { id: alertId, projectId },
          select: { id: true, status: true }
        });
        if (!current) return { outcome: 'NOT_FOUND' };
        if (current.status === 'DISMISSED')
          return {
            outcome: 'UNCHANGED',
            alert: await tx.traceabilityAlert.findUnique({
              where: { id: alertId },
              include: alertInclude
            })
          };
        if (current.status !== 'OPEN') return { outcome: 'INVALID_STATUS' };
        await tx.traceabilityAlert.updateMany({
          where: { id: alertId, projectId, status: 'OPEN' },
          data: {
            status: 'DISMISSED',
            dismissedAt: now,
            dismissedByUserId: userId,
            dismissalReason: reason
          }
        });
        await auditRepository.create(auditEvent, tx);
        return {
          outcome: 'UPDATED',
          alert: await tx.traceabilityAlert.findUnique({
            where: { id: alertId },
            include: alertInclude
          })
        };
      },
      { isolationLevel: 'ReadCommitted', timeout: 15000 }
    );
  },

  async listUnlinkedTasks(projectId, { status, skip, take }) {
    const where = {
      projectId,
      pullRequestId: null,
      commitLinks: { none: {} },
      issueLinks: { none: {} },
      ...(status ? { status } : {})
    };
    const [total, tasks] = await prisma.$transaction([
      prisma.task.count({ where }),
      prisma.task.findMany({
        where,
        select: {
          id: true,
          title: true,
          status: true,
          updatedAt: true,
          requirementId: true,
          responsibleUser: { select: { id: true, name: true } }
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take
      })
    ]);
    return { total, tasks };
  },

  reconcileProject(projectId, { dryRun, now = new Date() }, client = prisma) {
    return client.$transaction(
      (tx) => reconcileTraceabilityAlerts(tx, { projectId, full: true, dryRun, now }),
      { isolationLevel: dryRun ? 'RepeatableRead' : 'ReadCommitted', timeout: 15000 }
    );
  },

  async findActiveProjectIds() {
    const rows = await prisma.project.findMany({
      where: { deletedAt: null },
      select: { id: true },
      orderBy: { id: 'asc' }
    });
    return rows.map((row) => row.id);
  }
};
