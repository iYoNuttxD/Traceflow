import { githubEventNotificationService } from '../modules/notifications/github-event-notification.service.js';
import { notificationService } from '../modules/notifications/notification.service.js';
import { traceabilityNoticeService } from '../modules/notifications/traceability-notice.service.js';
import { traceabilityAlertService } from '../modules/traceability/traceability-alert.service.js';
import { JOB_NAMES } from './job-names.js';

const MINUTE_MS = 60_000;

export const SCHEDULED_JOBS = Object.freeze([
  {
    name: JOB_NAMES.NOTIFICATIONS_DUE,
    intervalMs: 15 * MINUTE_MS,
    maxRunMs: 5 * MINUTE_MS,
    run: ({ signal }) => notificationService.notifyOverdueTasks({ dryRun: false, signal })
  },
  {
    name: JOB_NAMES.GITHUB_EVENT_DISPATCH,
    intervalMs: 5 * MINUTE_MS,
    run: ({ signal }) => githubEventNotificationService.runJob({ dryRun: false, signal })
  },
  {
    name: JOB_NAMES.TRACEABILITY_NOTICE_DISPATCH,
    intervalMs: 5 * MINUTE_MS,
    run: ({ signal }) => traceabilityNoticeService.dispatchAll({ trigger: 'JOB', signal })
  },
  {
    name: JOB_NAMES.TRACEABILITY_ALERTS,
    intervalMs: 60 * MINUTE_MS,
    run: ({ signal }) => traceabilityAlertService.reconcileStaleProjects({ signal })
  }
]);
