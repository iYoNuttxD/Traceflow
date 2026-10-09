import {
  ALERT_SUBJECTS,
  PULL_REQUEST_ALERT,
  TASK_ALERT,
  TRACEABILITY_ALERT_TYPES,
  alertLimitations,
  subjectCode
} from './traceability-alert.policy.js';

const person = (user) => (user ? { id: user.id, name: user.name } : null);

const requirementRef = (requirementId) =>
  requirementId ? { id: requirementId, code: `REQ-${requirementId}` } : null;

function liveSubject(alert) {
  if (alert.type === TASK_ALERT) return alert.task;
  if (alert.type === PULL_REQUEST_ALERT) return alert.pullRequest;
  return alert.issue;
}

function toAlertSubject(alert) {
  const live = liveSubject(alert);
  return {
    type: ALERT_SUBJECTS[alert.type].subjectType,
    id: live?.id ?? null,
    code: live ? subjectCode(alert.type, live) : alert.subjectCode,
    title: live?.title ?? alert.subjectTitle,
    available: Boolean(live),
    githubUrl: live?.githubUrl ?? null
  };
}

function alertContext(alert) {
  if (alert.type === TASK_ALERT) {
    const task = alert.task;
    if (!task) return null;
    return {
      status: task.status,
      requirement: requirementRef(task.requirementId),
      responsible: person(task.responsibleUser),
      pullRequest: task.pullRequest
        ? {
            id: task.pullRequest.id,
            number: task.pullRequest.number,
            title: task.pullRequest.title,
            githubUrl: task.pullRequest.githubUrl ?? null
          }
        : null,
      issueCount: task._count.issueLinks,
      pendingCommitSuggestions: task._count.commitSuggestions
    };
  }
  if (alert.type === PULL_REQUEST_ALERT) {
    const pullRequest = alert.pullRequest;
    if (!pullRequest) return null;
    return {
      number: pullRequest.number,
      title: pullRequest.title,
      sourceBranch: pullRequest.sourceBranch ?? null,
      targetBranch: pullRequest.targetBranch ?? null,
      mergedAt: pullRequest.mergedAtGithub,
      githubUrl: pullRequest.githubUrl ?? null
    };
  }
  const issue = alert.issue;
  if (!issue) return null;
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    closedAt: issue.closedAtGithub,
    githubUrl: issue.githubUrl ?? null
  };
}

export function toAlertDTO(alert) {
  return {
    id: alert.id,
    type: alert.type,
    status: alert.status,
    occurredAt: alert.occurredAt,
    detectedAt: alert.detectedAt,
    resolvedAt: alert.resolvedAt,
    resolutionReason: alert.resolutionReason,
    dismissal: alert.dismissedAt
      ? { at: alert.dismissedAt, reason: alert.dismissalReason, by: person(alert.dismissedBy) }
      : null,
    limitations: alertLimitations(alert),
    subject: toAlertSubject(alert)
  };
}

export function toAlertDetailDTO(alert) {
  return { ...toAlertDTO(alert), context: alertContext(alert) };
}

function toReconciliationDTO(reconciliation) {
  if (!reconciliation) return null;
  const { lastTrigger, lastSucceededAt, lastFailedAt } = reconciliation;
  return {
    lastSucceededAt,
    lastFailedAt,
    lastTrigger,
    stale: Boolean(lastFailedAt) && (!lastSucceededAt || lastFailedAt > lastSucceededAt)
  };
}

export function toAlertSummaryDTO({
  projectId,
  open,
  dismissed,
  integrationExists,
  reconciliation
}) {
  const byType = Object.fromEntries(TRACEABILITY_ALERT_TYPES.map((type) => [type, 0]));
  for (const row of open) byType[row.type] = row._count._all;
  return {
    projectId,
    open: {
      total: Object.values(byType).reduce((sum, count) => sum + count, 0),
      byType
    },
    dismissed: { total: dismissed },
    rules: { taskWithoutCommitActive: integrationExists },
    reconciliation: toReconciliationDTO(reconciliation)
  };
}

export function toUnlinkedTaskDTO(task) {
  return {
    id: task.id,
    code: `TASK-${task.id}`,
    title: task.title,
    status: task.status,
    responsible: person(task.responsibleUser),
    requirement: requirementRef(task.requirementId),
    updatedAt: task.updatedAt
  };
}

export function alertPermissions(role) {
  return {
    canLink: Boolean(role) && role !== 'VIEWER',
    canManage: role === 'MANAGER' || role === 'OWNER'
  };
}
