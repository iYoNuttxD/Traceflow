import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createTask } from '../fixtures/factories.js';

let prisma;
let env;
let privacyService;
let runPrivacyRetention;
let deletionService;
let storage;
let sequence = 0;

const DAY = 86_400_000;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ env } = await import('../../src/config/env.js'));
  ({ privacyService } = await import('../../src/modules/privacy/privacy.service.js'));
  ({ runPrivacyRetention } = await import('../../src/shared/maintenance/privacy-retention.js'));
  ({ createProjectDeletionService: deletionService } =
    await import('../../src/modules/projects/services/project-deletion.service.js'));
  const { LocalTestEvidenceStorage } =
    await import('../../src/modules/testCases/storage/local-test-evidence.storage.js');
  storage = new LocalTestEvidenceStorage({
    directory: process.env.TEST_EVIDENCE_STORAGE_DIR,
    environment: 'test'
  });
  await cleanTestDatabase(prisma);
}, 60000);

afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function person(projectId, role = 'MEMBER') {
  sequence += 1;
  const user = await prisma.user.create({
    data: {
      name: `Pessoa privacidade ${sequence}`,
      username: `s202priv${sequence}`,
      email: `s202-priv-${sequence}@example.invalid`
    }
  });
  if (projectId)
    await prisma.projectMembership.create({ data: { projectId, userId: user.id, role } });
  return user;
}

async function notify(recipientUserId, projectId, overrides = {}) {
  sequence += 1;
  return prisma.notification.create({
    data: {
      recipientUserId,
      projectId,
      type: 'TASK_OVERDUE',
      dedupeKey: `TASK_OVERDUE:${sequence}:2026-10-10`,
      taskTitle: `Tarefa ${sequence}`,
      dueDate: new Date('2026-10-10T00:00:00.000Z'),
      ...overrides
    }
  });
}

describe('S2-02 privacidade e retenção (D13)', () => {
  it('anonimizar apaga as notificações e preferências do titular e mantém as de outros', async () => {
    const project = await createProject(prisma);
    await person(project.id, 'OWNER');
    const subject = await person(project.id);
    const other = await person(project.id);
    await notify(subject.id, project.id);
    await prisma.notificationPreference.create({
      data: { userId: subject.id, type: 'TASK_OVERDUE', enabled: false }
    });
    const acted = await notify(other.id, project.id, {
      type: 'TASK_STATUS_CHANGED',
      dedupeKey: 'TASK_STATUS_CHANGED:movement:1',
      fromStatus: 'A_FAZER',
      toStatus: 'EM_ANDAMENTO',
      actorUserId: subject.id,
      dueDate: null
    });
    await prisma.privacyRequest.create({
      data: {
        userId: subject.id,
        type: 'ACCOUNT_DELETION',
        scheduledFor: new Date(Date.now() - 1000)
      }
    });

    expect(await privacyService.processDueDeletions({ dryRun: false })).toMatchObject({
      processed: 1
    });

    expect(await prisma.notification.count({ where: { recipientUserId: subject.id } })).toBe(0);
    expect(await prisma.notificationPreference.count({ where: { userId: subject.id } })).toBe(0);
    const kept = await prisma.notification.findUnique({
      where: { id: acted.id },
      include: { actor: { select: { name: true } } }
    });
    expect(kept.actorUserId).toBe(subject.id);
    expect(kept.actor.name).not.toBe(subject.name);
  });

  it('a purga do projeto remove as notificações dele e preserva as de outros projetos', async () => {
    const project = await createProject(prisma);
    const owner = await person(project.id, 'OWNER');
    const other = await createProject(prisma);
    const task = await createTask(prisma, project.id, { responsibleUserId: owner.id });
    await notify(owner.id, project.id, { taskId: task.id });
    const elsewhere = await notify(owner.id, other.id);
    const service = deletionService({ storage });

    await service.requestDeletion(project.id, owner.id);
    await expect(service.purge(project.id, owner.id, project.name)).resolves.toMatchObject({
      purged: true
    });

    expect(await prisma.notification.count({ where: { projectId: project.id } })).toBe(0);
    expect(await prisma.notification.findUnique({ where: { id: elsewhere.id } })).not.toBeNull();
  });

  it('a retenção apaga notificações com mais de 180 dias, com dry-run antes', async () => {
    const project = await createProject(prisma);
    const owner = await person(project.id);
    const now = new Date('2026-10-20T12:00:00.000Z');
    const old = await notify(owner.id, project.id, {
      createdAt: new Date(now.getTime() - 181 * DAY)
    });
    const limit = await notify(owner.id, project.id, {
      createdAt: new Date(now.getTime() - 180 * DAY)
    });
    const recent = await notify(owner.id, project.id, {
      createdAt: new Date(now.getTime() - DAY)
    });
    const configuration = { ...env, notificationRetentionDays: 180 };

    const dryRun = await runPrivacyRetention({ apply: false, now, configuration });
    expect(dryRun.counts.notifications).toBe(1);
    expect(await prisma.notification.count()).toBe(3);

    const applied = await runPrivacyRetention({ apply: true, now, configuration });
    expect(applied.counts.notifications).toBe(1);
    expect(await prisma.notification.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await prisma.notification.findUnique({ where: { id: limit.id } })).not.toBeNull();
    expect(await prisma.notification.findUnique({ where: { id: recent.id } })).not.toBeNull();
  });
});
