import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import {
  createIssue,
  createProject,
  createPullRequest,
  createTask
} from '../fixtures/factories.js';

let prisma;
let env;
let alertService;
let noticeService;
let noticeRepository;
let notificationService;
let taskLinks;
let settingsRepository;
let runPrivacyRetention;
let toNotificationExportItem;
let sequence = 0;

const TYPE = 'TRACEABILITY_INCONSISTENCY';
const DAY = 86_400_000;
const MERGED_AT = new Date('2026-10-10T12:00:00.000Z');
const CLOSED_AT = new Date('2026-10-11T12:00:00.000Z');

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ env } = await import('../../src/config/env.js'));
  ({ traceabilityAlertService: alertService } =
    await import('../../src/modules/traceability/traceability-alert.service.js'));
  ({ traceabilityNoticeService: noticeService } =
    await import('../../src/modules/notifications/traceability-notice.service.js'));
  ({ traceabilityNoticeRepository: noticeRepository } =
    await import('../../src/modules/notifications/traceability-notice.repository.js'));
  ({ notificationService } =
    await import('../../src/modules/notifications/notification.service.js'));
  ({ taskLinkRepository: taskLinks } =
    await import('../../src/modules/tasks/repositories/task-link.repository.js'));
  ({ settingsRepository } = await import('../../src/modules/settings/settings.repository.js'));
  ({ runPrivacyRetention } = await import('../../src/shared/maintenance/privacy-retention.js'));
  ({ toNotificationExportItem } =
    await import('../../src/modules/notifications/notification.mapper.js'));
  await cleanTestDatabase(prisma);
}, 60000);

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function person(projectId, { role = 'MEMBER', isActive = true, joinedAt } = {}) {
  sequence += 1;
  const user = await prisma.user.create({
    data: {
      name: `Pessoa aviso ${sequence}`,
      username: `pr26aviso${sequence}`,
      email: `pr26-aviso-${sequence}@example.invalid`
    }
  });
  await prisma.projectMembership.create({
    data: { projectId, userId: user.id, role, isActive, ...(joinedAt ? { joinedAt } : {}) }
  });
  return user;
}

async function scenario() {
  const project = await createProject(prisma);
  return {
    project,
    owner: await person(project.id, { role: 'OWNER' }),
    manager: await person(project.id, { role: 'MANAGER' }),
    member: await person(project.id, { role: 'MEMBER' }),
    viewer: await person(project.id, { role: 'VIEWER' })
  };
}

function mergedPullRequest(projectId, overrides = {}) {
  sequence += 1;
  return createPullRequest(prisma, projectId, {
    number: sequence,
    state: 'closed',
    mergedAtGithub: MERGED_AT,
    closedAtGithub: MERGED_AT,
    githubUrl: `https://github.com/o/r/pull/${sequence}`,
    ...overrides
  });
}

function closedIssue(projectId, overrides = {}) {
  sequence += 1;
  return createIssue(prisma, projectId, {
    number: sequence,
    state: 'closed',
    closedAtGithub: CLOSED_AT,
    githubUrl: `https://github.com/o/r/issues/${sequence}`,
    ...overrides
  });
}

const reconcile = (projectId) => alertService.reconcileProject(projectId, { trigger: 'MANUAL' });
const alertsOf = (projectId) =>
  prisma.traceabilityAlert.findMany({ where: { projectId }, orderBy: { id: 'asc' } });
const noticesOf = (where = {}) =>
  prisma.notification.findMany({
    where: { type: TYPE, ...where },
    orderBy: [{ recipientUserId: 'asc' }, { traceabilityAlertId: 'asc' }]
  });
const inconsistenciesOf = async (userId) =>
  (
    await notificationService.list(userId, { status: 'ALL', group: 'INCONSISTENCIES' })
  ).notifications.toSorted((left, right) => left.id - right.id);

async function pendingAlert(projectId, detectedAt, overrides = {}) {
  const pullRequest = await mergedPullRequest(projectId);
  return prisma.traceabilityAlert.create({
    data: {
      projectId,
      type: 'PULL_REQUEST_MERGED_WITHOUT_TASK',
      dedupeKey: `PULL_REQUEST_MERGED_WITHOUT_TASK:${pullRequest.id}`,
      pullRequestId: pullRequest.id,
      subjectCode: `PR #${pullRequest.number}`,
      subjectTitle: pullRequest.title,
      occurredAt: MERGED_AT,
      detectedAt,
      noticeState: 'PENDING',
      ...overrides
    }
  });
}

describe('PR #26 avisos de inconsistência — destinatários (TF-REV-008, RF39, RF40)', () => {
  it('I-01 os quatro papéis recebem um aviso por alerta de PR mesclada e de issue fechada sem tarefa', async () => {
    const { project, owner, manager, member, viewer } = await scenario();
    const pullRequest = await mergedPullRequest(project.id, { title: 'Ajusta login' });
    const issue = await closedIssue(project.id, { title: 'Corrigir login' });

    await reconcile(project.id);

    const [prAlert, issueAlert] = await alertsOf(project.id);
    expect([prAlert, issueAlert].map((alert) => [alert.type, alert.noticeState])).toEqual([
      ['PULL_REQUEST_MERGED_WITHOUT_TASK', 'DISPATCHED'],
      ['ISSUE_CLOSED_WITHOUT_TASK', 'DISPATCHED']
    ]);
    expect(prAlert.noticedAt).toBeInstanceOf(Date);
    const rows = await noticesOf();
    const people = [owner, manager, member, viewer];
    expect(
      rows.map((row) => [row.recipientUserId, row.traceabilityAlertId, row.dedupeKey])
    ).toEqual(
      people.flatMap((user) =>
        [prAlert, issueAlert].map((alert) => [user.id, alert.id, `${TYPE}:alert:${alert.id}`])
      )
    );
    expect(rows.every((row) => row.taskId === null && row.taskTitle === null)).toBe(true);
    expect(
      (await inconsistenciesOf(viewer.id)).map(({ type, task, link, context }) => ({
        type,
        task,
        link,
        context
      }))
    ).toEqual([
      {
        type: TYPE,
        task: null,
        link: `/projects/${project.id}/repository?alerta=${prAlert.id}`,
        context: {
          occurredAt: MERGED_AT,
          artifact: {
            kind: 'PULL_REQUEST',
            number: pullRequest.number,
            title: 'Ajusta login',
            url: pullRequest.githubUrl
          },
          alert: {
            id: prAlert.id,
            type: 'PULL_REQUEST_MERGED_WITHOUT_TASK',
            status: 'OPEN',
            resolvedAt: null,
            dismissedAt: null
          },
          batch: null
        }
      },
      {
        type: TYPE,
        task: null,
        link: `/projects/${project.id}/repository?alerta=${issueAlert.id}`,
        context: {
          occurredAt: CLOSED_AT,
          artifact: {
            kind: 'ISSUE',
            number: issue.number,
            title: 'Corrigir login',
            url: issue.githubUrl
          },
          alert: {
            id: issueAlert.id,
            type: 'ISSUE_CLOSED_WITHOUT_TASK',
            status: 'OPEN',
            resolvedAt: null,
            dismissedAt: null
          },
          batch: null
        }
      }
    ]);
  });

  it('I-01 desvincular a PR da tarefa avisa depois do commit da mudança; o alerta da tarefa não avisa', async () => {
    const { project, owner, manager, member, viewer } = await scenario();
    const pullRequest = await mergedPullRequest(project.id);
    const task = await createTask(prisma, project.id, { pullRequestId: pullRequest.id });
    await reconcile(project.id);
    expect(await noticesOf()).toEqual([]);

    await taskLinks.setPullRequest(task.id, null);

    const alerts = await alertsOf(project.id);
    expect(alerts.map((alert) => [alert.type, alert.noticeState])).toEqual([
      ['PULL_REQUEST_MERGED_WITHOUT_TASK', 'DISPATCHED']
    ]);
    expect((await noticesOf()).map((row) => row.recipientUserId)).toEqual(
      [owner.id, manager.id, member.id, viewer.id].sort((left, right) => left - right)
    );

    await prisma.task.update({ where: { id: task.id }, data: { status: 'CONCLUIDO' } });
    await reconcile(project.id);
    const taskAlert = (await alertsOf(project.id)).find(
      (alert) => alert.type === 'TASK_CONCLUDED_WITHOUT_COMMIT'
    );
    expect(taskAlert.noticeState).toBe('NOT_APPLICABLE');
    expect(await prisma.notification.count({ where: { type: TYPE } })).toBe(4);
  });

  it('I-02 conta inativa e membership inativa não recebem', async () => {
    const { project, owner } = await scenario();
    const deactivated = await person(project.id);
    await prisma.user.update({
      where: { id: deactivated.id },
      data: { accountStatus: 'DEACTIVATED' }
    });
    const departed = await person(project.id, { isActive: false });
    await mergedPullRequest(project.id);

    await reconcile(project.id);

    const recipients = new Set((await noticesOf()).map((row) => row.recipientUserId));
    expect(recipients.has(owner.id)).toBe(true);
    expect(recipients.has(deactivated.id)).toBe(false);
    expect(recipients.has(departed.id)).toBe(false);
    expect(recipients.size).toBe(4);
  });

  it('I-03 quem entrou depois da detecção não recebe o aviso daquele alerta', async () => {
    const { project, owner } = await scenario();
    const detectedAt = new Date();
    const alert = await pendingAlert(project.id, detectedAt);
    const late = await person(project.id, { joinedAt: new Date(detectedAt.getTime() + 1) });

    await noticeService.dispatchProject(project.id);

    const recipients = (await noticesOf({ traceabilityAlertId: alert.id })).map(
      (row) => row.recipientUserId
    );
    expect(recipients).toContain(owner.id);
    expect(recipients).not.toContain(late.id);
    expect(recipients).toHaveLength(4);
  });

  it('I-08 preferência desligada, ou religada depois da detecção, não recebe', async () => {
    const { project, owner, manager, member } = await scenario();
    const detectedAt = new Date();
    await prisma.notificationPreference.createMany({
      data: [
        { userId: manager.id, type: TYPE, enabled: false },
        {
          userId: member.id,
          type: TYPE,
          enabled: true,
          enabledAt: new Date(detectedAt.getTime() + 1)
        },
        {
          userId: owner.id,
          type: TYPE,
          enabled: true,
          enabledAt: new Date(detectedAt.getTime() - 1)
        }
      ]
    });
    const alert = await pendingAlert(project.id, detectedAt);

    await noticeService.dispatchProject(project.id);

    const recipients = (await noticesOf({ traceabilityAlertId: alert.id })).map(
      (row) => row.recipientUserId
    );
    expect(recipients).toContain(owner.id);
    expect(recipients).not.toContain(manager.id);
    expect(recipients).not.toContain(member.id);
    expect(recipients).toHaveLength(2);
  });
});

describe('PR #26 avisos de inconsistência — leitura e estado (TF-REV-008)', () => {
  it('I-04 a leitura é individual e não mexe no alerta', async () => {
    const { project, owner, viewer } = await scenario();
    await mergedPullRequest(project.id);
    await reconcile(project.id);
    const [ownerNotice] = await inconsistenciesOf(owner.id);

    await notificationService.markRead(owner.id, ownerNotice.id, true);

    expect((await inconsistenciesOf(owner.id))[0].readAt).toBeInstanceOf(Date);
    expect((await inconsistenciesOf(viewer.id))[0].readAt).toBeNull();
    expect((await alertsOf(project.id))[0].status).toBe('OPEN');
  });

  it('I-05 dispensar ou resolver o alerta não apaga nem marca o aviso como lido; o aviso mostra o estado atual', async () => {
    const { project, manager, viewer } = await scenario();
    const dismissed = await mergedPullRequest(project.id);
    const resolved = await closedIssue(project.id);
    await reconcile(project.id);
    const alerts = await alertsOf(project.id);
    const dismissedAlert = alerts.find((alert) => alert.pullRequestId === dismissed.id);
    const resolvedAlert = alerts.find((alert) => alert.issueId === resolved.id);

    await alertService.dismiss(
      project.id,
      dismissedAlert.id,
      { reason: 'PR de dependências, sem tarefa.' },
      { actorUserId: manager.id, requestId: 'req-i05' }
    );
    const task = await createTask(prisma, project.id);
    await taskLinks.createIssue(task.id, resolved.id);

    const notices = await inconsistenciesOf(viewer.id);
    expect(notices).toHaveLength(2);
    expect(notices.every((notice) => notice.readAt === null)).toBe(true);
    const byAlert = new Map(notices.map((notice) => [notice.context.alert.id, notice]));
    expect(byAlert.get(dismissedAlert.id).context.alert).toMatchObject({
      status: 'DISMISSED',
      dismissedAt: expect.any(Date),
      resolvedAt: null
    });
    expect(byAlert.get(resolvedAlert.id).context.alert).toMatchObject({
      status: 'RESOLVED',
      resolvedAt: expect.any(Date)
    });
  });

  it('I-06 repetir a reconciliação e o despacho não duplica, nem depois de uma queda entre a inserção e a marcação', async () => {
    const { project } = await scenario();
    await mergedPullRequest(project.id);
    await closedIssue(project.id);

    await reconcile(project.id);
    await reconcile(project.id);
    await noticeService.dispatchProject(project.id);
    await prisma.traceabilityAlert.updateMany({
      where: { projectId: project.id },
      data: { noticeState: 'PENDING', noticedAt: null }
    });
    const report = await noticeService.dispatchProject(project.id);

    expect(report).toMatchObject({ alerts: 2, created: 0 });
    expect(await prisma.notification.count({ where: { type: TYPE } })).toBe(8);
    expect((await alertsOf(project.id)).every((alert) => alert.noticeState === 'DISPATCHED')).toBe(
      true
    );
  });

  it('I-06 a falha do despacho não desfaz a reconciliação; o alerta fica pendente para a próxima', async () => {
    const { project } = await scenario();
    await mergedPullRequest(project.id);
    vi.spyOn(noticeRepository, 'insertNotices').mockRejectedValueOnce(
      Object.assign(new Error('Deadlock found when trying to get lock'), { code: 'P2034' })
    );

    const first = await reconcile(project.id);

    expect(first).toMatchObject({ created: 1 });
    expect((await alertsOf(project.id))[0].noticeState).toBe('PENDING');
    expect(await prisma.notification.count({ where: { type: TYPE } })).toBe(0);

    await reconcile(project.id);

    expect((await alertsOf(project.id))[0].noticeState).toBe('DISPATCHED');
    expect(await prisma.notification.count({ where: { type: TYPE } })).toBe(4);
  });
});

describe('PR #26 avisos de inconsistência — lote (TF-REV-008, ⚑4)', () => {
  it('I-07 acima de 10 alertas da mesma detecção sai um aviso-resumo por pessoa; com 10, um por alerta', async () => {
    const { project, viewer } = await scenario();
    for (let index = 0; index < 9; index += 1) await mergedPullRequest(project.id);
    for (let index = 0; index < 3; index += 1) await closedIssue(project.id);

    await reconcile(project.id);

    const rows = await noticesOf();
    expect(rows).toHaveLength(4);
    const detectedAt = (await alertsOf(project.id))[0].detectedAt;
    expect(rows.every((row) => row.traceabilityAlertId === null)).toBe(true);
    expect(new Set(rows.map((row) => row.dedupeKey))).toEqual(
      new Set([`${TYPE}:batch:${project.id}:${detectedAt.getTime()}`])
    );
    expect((await alertsOf(project.id)).every((alert) => alert.noticeState === 'DISPATCHED')).toBe(
      true
    );
    const [summary] = await inconsistenciesOf(viewer.id);
    expect(summary).toMatchObject({
      task: null,
      link: `/projects/${project.id}/repository?inconsistencia=OPEN`,
      context: {
        artifact: null,
        alert: null,
        batch: { total: 12, pullRequests: 9, issues: 3 }
      }
    });

    const other = await scenario();
    for (let index = 0; index < 10; index += 1) await mergedPullRequest(other.project.id);
    await reconcile(other.project.id);
    expect(await prisma.notification.count({ where: { projectId: other.project.id } })).toBe(40);
  });
});

describe('PR #26 avisos de inconsistência — privacidade e visibilidade (TF-REV-008)', () => {
  it('I-09 a exportação traz os avisos do titular e a retenção apaga os antigos', async () => {
    const { project, viewer } = await scenario();
    const pullRequest = await mergedPullRequest(project.id);
    await reconcile(project.id);
    const [alert] = await alertsOf(project.id);

    const exported = (await settingsRepository.exportData(viewer.id)).notifications;
    expect(exported.map(toNotificationExportItem)).toEqual([
      expect.objectContaining({
        type: TYPE,
        taskId: null,
        taskTitle: null,
        traceabilityAlertId: alert.id,
        batchSummary: null,
        githubEvent: 'PULL_REQUEST_MERGED',
        artifactNumber: pullRequest.number,
        artifactTitle: pullRequest.title,
        artifactUrl: pullRequest.githubUrl,
        githubOccurredAt: MERGED_AT,
        visible: true
      })
    ]);
    expect(exported).toEqual([
      expect.objectContaining({
        type: TYPE,
        projectId: project.id,
        taskId: null,
        taskTitle: null,
        traceabilityAlertId: alert.id,
        batchSummary: null,
        githubEvent: 'PULL_REQUEST_MERGED',
        artifactNumber: pullRequest.number,
        artifactUrl: pullRequest.githubUrl,
        githubOccurredAt: MERGED_AT
      })
    ]);

    const now = new Date();
    await prisma.notification.updateMany({
      where: { type: TYPE, recipientUserId: viewer.id },
      data: { createdAt: new Date(now.getTime() - 181 * DAY) }
    });
    const { counts } = await runPrivacyRetention({
      client: prisma,
      now,
      apply: true,
      configuration: env
    });

    expect(counts.notifications).toBe(1);
    expect(await prisma.notification.count({ where: { recipientUserId: viewer.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { type: TYPE } })).toBe(3);
  });

  it('I-10 quem saiu do projeto deixa de ver o aviso, e o aviso volta com a membership', async () => {
    const { project, member } = await scenario();
    await mergedPullRequest(project.id);
    await reconcile(project.id);
    expect(await inconsistenciesOf(member.id)).toHaveLength(1);

    await prisma.projectMembership.updateMany({
      where: { projectId: project.id, userId: member.id },
      data: { isActive: false }
    });
    expect(await inconsistenciesOf(member.id)).toEqual([]);
    expect((await notificationService.unreadCount(member.id)).unreadCount).toBe(0);

    await prisma.projectMembership.updateMany({
      where: { projectId: project.id, userId: member.id },
      data: { isActive: true }
    });
    expect(await inconsistenciesOf(member.id)).toHaveLength(1);
  });
});
