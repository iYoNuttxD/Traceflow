import { randomUUID } from 'node:crypto';
import { logger } from '../../shared/logger/index.js';
import { auditRepository } from '../audit/audit.repository.js';
import { buildAuditEvent } from '../audit/audit.service.js';
import { githubEventRepository } from './github-event.repository.js';
import {
  CLAIM_LEASE_MS,
  DISPATCH_BATCH_SIZE,
  GITHUB_EVENT_EXCLUSIONS,
  JOB_MAX_BATCHES,
  emptyOutcome,
  githubEventDedupeKey,
  notificationTypeOf,
  participantExclusion,
  preferenceAllowsEvent
} from './github-event.policy.js';
import { snapshotTitle } from './notification.policy.js';
import { notificationRepository } from './notification.repository.js';

const DEFAULT_ERROR_CODE = 'GITHUB_EVENT_DISPATCH_FAILED';
const SAFE_CODE = /^[A-Za-z0-9_]{1,64}$/;
const unique = (values) => [...new Set(values)];
const keyOf = (row) => `${row.recipientUserId}|${row.dedupeKey}`;

function errorCodeOf(error) {
  const code = String(error?.code ?? '');
  return SAFE_CODE.test(code) ? code : DEFAULT_ERROR_CODE;
}

function notPersisted() {
  return Object.assign(new Error('Notificação não persistida.'), {
    code: 'NOTIFICATION_NOT_PERSISTED'
  });
}

function emptyReport(dryRun) {
  return {
    dryRun,
    projects: 0,
    scanned: 0,
    claimed: 0,
    busy: 0,
    claimLost: 0,
    dispatched: 0,
    created: 0,
    alreadyNotified: 0,
    excluded: emptyOutcome().excluded,
    retryScheduled: 0,
    failed: 0,
    failedStock: 0
  };
}

function addOutcome(report, outcome) {
  report.created += outcome.created;
  report.alreadyNotified += outcome.alreadyNotified;
  for (const reason of GITHUB_EVENT_EXCLUSIONS) report.excluded[reason] += outcome.excluded[reason];
}

export function createGithubEventNotificationService({
  repository = githubEventRepository,
  notifications = notificationRepository,
  audit = auditRepository,
  log = logger,
  clock = () => new Date(),
  newToken = randomUUID
} = {}) {
  async function evaluate(event) {
    const type = notificationTypeOf(event.type);
    const participation = await repository.participationOf(
      event.projectId,
      event.targets.map((target) => target.taskId)
    );
    const pairs = [];
    for (const [taskId, task] of participation)
      for (const userId of task.participants) pairs.push({ taskId, title: task.title, userId });

    const userIds = unique(pairs.map((pair) => pair.userId));
    const checked = userIds.length;
    const [accounts, members, preferences] = checked
      ? await Promise.all([
          notifications.activeAccountIds(userIds),
          notifications.activeMemberIds(event.projectId, userIds),
          repository.preferencesOf(userIds, type)
        ])
      : [new Set(), new Set(), new Map()];

    const classified = pairs.map((pair) => ({
      ...pair,
      key: githubEventDedupeKey(type, event.id, pair.taskId),
      reason: participantExclusion({
        accountActive: accounts.has(pair.userId),
        membershipActive: members.has(pair.userId),
        preferenceAllowed: preferenceAllowsEvent(preferences.get(pair.userId), event.detectedAt)
      })
    }));
    const rows = classified
      .filter((pair) => !pair.reason)
      .map((pair) => ({
        recipientUserId: pair.userId,
        projectId: event.projectId,
        taskId: pair.taskId,
        type,
        dedupeKey: pair.key,
        taskTitle: snapshotTitle(pair.title),
        githubEvent: event.type,
        artifactNumber: event.artifactNumber,
        artifactTitle: event.artifactTitle,
        artifactUrl: event.artifactUrl,
        githubOccurredAt: event.occurredAt
      }));
    return { participation, classified, rows };
  }

  function outcomeOf(event, evaluation, survivors, before, after) {
    const outcome = emptyOutcome();
    const living = [...evaluation.participation.keys()].filter((taskId) => survivors.has(taskId));
    outcome.tasks = living.length;
    outcome.excluded.NO_TASK = Math.max(event.linkedTaskCount - living.length, 0);
    for (const taskId of living)
      if (!evaluation.participation.get(taskId).participants.length)
        outcome.excluded.NO_PARTICIPANT += 1;
    for (const pair of evaluation.classified) {
      if (!survivors.has(pair.taskId)) continue;
      outcome.participants += 1;
      if (pair.reason) {
        outcome.excluded[pair.reason] += 1;
        continue;
      }
      outcome.eligible += 1;
      const key = `${pair.userId}|${pair.key}`;
      if (before.has(key)) outcome.alreadyNotified += 1;
      else if (after.has(key)) outcome.created += 1;
    }
    return outcome;
  }

  async function dispatchClaimed(eventId, token, now) {
    const event = await repository.findClaimed(eventId, token);
    if (!event) return null;
    const evaluation = await evaluate(event);
    const before = await repository.persistedKeys(evaluation.rows);
    await repository.insertNotifications(evaluation.rows.filter((row) => !before.has(keyOf(row))));
    const after = await repository.persistedKeys(evaluation.rows);
    const survivors = await repository.existingTaskIds([...evaluation.participation.keys()]);
    if (evaluation.rows.some((row) => survivors.has(row.taskId) && !after.has(keyOf(row))))
      throw notPersisted();
    const outcome = outcomeOf(event, evaluation, survivors, before, after);
    return (await repository.finish(eventId, token, { outcome, now })) ? outcome : null;
  }

  function recordClaimLost(eventId, projectId, report) {
    report.claimLost += 1;
    log.warn('A reserva do evento do GitHub venceu e outro despachante o retomou.', {
      event: 'github_event_notification_claim_lost',
      eventId,
      projectId
    });
  }

  async function recordFailure(eventId, projectId, token, now, error, report) {
    const errorCode = errorCodeOf(error);
    let result;
    try {
      result = await repository.release(eventId, token, { now, errorCode });
    } catch (releaseError) {
      report.retryScheduled += 1;
      log.warn('Falha ao devolver o evento do GitHub à fila; ele volta depois da reserva.', {
        event: 'github_event_notification_release_failed',
        eventId,
        projectId,
        errorCode: errorCodeOf(releaseError)
      });
      return;
    }
    if (result.state === 'LOST') {
      recordClaimLost(eventId, projectId, report);
      return;
    }
    log.warn('Tentativa de despacho de evento do GitHub falhou.', {
      event: 'github_event_notification_attempt_failed',
      eventId,
      projectId,
      attempt: result.attempts,
      errorCode
    });
    if (result.state === 'RETRY') {
      report.retryScheduled += 1;
      return;
    }
    report.failed += 1;
    log.error('Evento do GitHub não pôde ser despachado depois das tentativas.', {
      event: 'github_event_notification_failed',
      eventId,
      projectId,
      attempts: result.attempts,
      errorCode
    });
  }

  async function dispatchOne(eventId, projectId, report) {
    const now = clock();
    const token = newToken();
    const claimed = await repository.claim(eventId, {
      token,
      now,
      claimedUntil: new Date(now.getTime() + CLAIM_LEASE_MS)
    });
    if (!claimed) {
      report.busy += 1;
      return;
    }
    report.claimed += 1;
    try {
      const outcome = await dispatchClaimed(eventId, token, now);
      if (!outcome) {
        recordClaimLost(eventId, projectId, report);
        return;
      }
      report.dispatched += 1;
      addOutcome(report, outcome);
    } catch (error) {
      await recordFailure(eventId, projectId, token, now, error, report);
    }
  }

  async function preview(eventId, report) {
    const event = await repository.findForPreview(eventId);
    if (!event) return;
    const evaluation = await evaluate(event);
    const before = await repository.persistedKeys(evaluation.rows);
    const outcome = outcomeOf(
      event,
      evaluation,
      new Set(evaluation.participation.keys()),
      before,
      before
    );
    addOutcome(report, outcome);
    report.wouldCreate += outcome.eligible - outcome.alreadyNotified;
  }

  async function requeue(projectId, dryRun, report) {
    if (dryRun) {
      report.wouldRequeue = await repository.countFailed({ projectId });
      return;
    }
    report.requeued = await repository.requeueFailed({ projectId, now: clock() });
    if (report.requeued)
      await audit.create(
        buildAuditEvent({
          projectId,
          action: 'GITHUB_EVENT_NOTIFICATIONS_REQUEUED',
          resourceType: 'GitHubArtifactEvent',
          metadata: { count: report.requeued }
        })
      );
  }

  async function run({ projectId = null, dryRun, retryFailed = false, maxBatches }) {
    const startedAt = Date.now();
    const report = emptyReport(dryRun);
    if (dryRun) report.wouldCreate = 0;
    if (retryFailed) await requeue(projectId, dryRun, report);
    if (!dryRun) report.failed += await repository.failInterrupted({ projectId, now: clock() });

    const projects = new Set();
    const seen = [];
    const batches = dryRun ? 1 : maxBatches;
    for (let batch = 0; batch < batches; batch += 1) {
      const due = await repository.findDueEventIds({
        projectId,
        now: clock(),
        limit: dryRun ? DISPATCH_BATCH_SIZE * maxBatches : DISPATCH_BATCH_SIZE,
        exclude: seen
      });
      if (!due.length) break;
      for (const { id, projectId: eventProjectId } of due) {
        seen.push(id);
        projects.add(eventProjectId);
        report.scanned += 1;
        if (dryRun) await preview(id, report);
        else await dispatchOne(id, eventProjectId, report);
      }
    }

    const now = clock();
    const [failedStock, queue] = await Promise.all([
      repository.countFailed({ projectId }),
      repository.queueSummary({ projectId, now })
    ]);
    report.projects = projects.size;
    report.failedStock = failedStock;
    report.pendingAfter = queue.pending;
    report.dueAfter = queue.due;
    report.oldestDueAgeSeconds = queue.oldestDueAt
      ? Math.max(0, Math.floor((now.getTime() - queue.oldestDueAt.getTime()) / 1000))
      : null;
    report.durationMs = Date.now() - startedAt;

    const failures = report.failed + report.retryScheduled;
    log[failures || failedStock ? 'warn' : 'info'](
      'Despacho de notificações do GitHub concluído.',
      {
        event: 'github_event_notifications_dispatch_completed',
        dryRun,
        projects: report.projects,
        scanned: report.scanned,
        claimed: report.claimed,
        busy: report.busy,
        claimLost: report.claimLost,
        dispatched: report.dispatched,
        created: report.created,
        alreadyNotified: report.alreadyNotified,
        ...Object.fromEntries(
          GITHUB_EVENT_EXCLUSIONS.map((reason) => [`excluded${reason}`, report.excluded[reason]])
        ),
        retryScheduled: report.retryScheduled,
        failed: report.failed,
        failedStock: report.failedStock,
        pendingAfter: report.pendingAfter,
        dueAfter: report.dueAfter,
        oldestDueAgeSeconds: report.oldestDueAgeSeconds,
        durationMs: report.durationMs
      }
    );
    return report;
  }

  return {
    runJob({ projectId = null, dryRun = true, retryFailed = false } = {}) {
      return run({ projectId, dryRun, retryFailed, maxBatches: JOB_MAX_BATCHES });
    },

    async dispatchAfterSync(projectId) {
      try {
        return await run({ projectId, dryRun: false, maxBatches: 1 });
      } catch (error) {
        log.warn('Falha ao despachar as notificações do GitHub depois da sincronização.', {
          event: 'github_event_notifications_dispatch_failed',
          projectId,
          errorCode: errorCodeOf(error)
        });
        return null;
      }
    },

    isActiveProject(projectId) {
      return repository.isActiveProject(projectId);
    }
  };
}

export const githubEventNotificationService = createGithubEventNotificationService();
