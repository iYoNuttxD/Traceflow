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
const NOW = new Date('2026-10-20T12:00:00.000Z');

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
      name: `Pessoa privacidade S2-03 ${sequence}`,
      username: `s203priv${sequence}`,
      email: `s203-priv-${sequence}@example.invalid`
    }
  });
  if (projectId)
    await prisma.projectMembership.create({ data: { projectId, userId: user.id, role } });
  return user;
}

async function githubEvent(projectId, overrides = {}) {
  sequence += 1;
  return prisma.gitHubArtifactEvent.create({
    data: {
      projectId,
      type: 'ISSUE_CLOSED',
      artifactNumber: sequence,
      artifactTitle: `Issue ${sequence}`,
      artifactUrl: `https://github.com/usuario-s203/repositorio-s203/issues/${sequence}`,
      occurredAt: NOW,
      detectedAt: NOW,
      linkedTaskCount: 1,
      occurrenceKey: `ISSUE_CLOSED:${sequence}:${NOW.toISOString()}`,
      status: 'DISPATCHED',
      ...overrides
    }
  });
}

async function githubNotification(recipientUserId, projectId, overrides = {}) {
  sequence += 1;
  return prisma.notification.create({
    data: {
      recipientUserId,
      projectId,
      type: 'ISSUE_EVENT',
      dedupeKey: `ISSUE_EVENT:event:${sequence}:task:${sequence}`,
      taskTitle: `Tarefa ${sequence}`,
      githubEvent: 'ISSUE_CLOSED',
      artifactNumber: 45,
      artifactTitle: 'Corrigir login',
      artifactUrl: 'https://github.com/usuario-s203/repositorio-s203/issues/45',
      githubOccurredAt: NOW,
      ...overrides
    }
  });
}

describe('S2-03 privacidade e retenção (D16)', () => {
  it('PV2 a retenção apaga eventos processados com mais de 180 dias e nunca os pendentes', async () => {
    const project = await createProject(prisma);
    const old = new Date(NOW.getTime() - 181 * DAY);
    const limit = new Date(NOW.getTime() - 180 * DAY);
    const oldDispatched = await githubEvent(project.id, { detectedAt: old });
    const oldFailed = await githubEvent(project.id, { detectedAt: old, status: 'FAILED' });
    const oldPending = await githubEvent(project.id, { detectedAt: old, status: 'PENDING' });
    const oldProcessing = await githubEvent(project.id, {
      detectedAt: old,
      status: 'PROCESSING'
    });
    const atLimit = await githubEvent(project.id, { detectedAt: limit });
    const recent = await githubEvent(project.id, { detectedAt: new Date(NOW.getTime() - DAY) });
    const configuration = { ...env, notificationRetentionDays: 180 };

    const dryRun = await runPrivacyRetention({ apply: false, now: NOW, configuration });
    expect(dryRun.counts.githubArtifactEvents).toBe(2);
    expect(await prisma.gitHubArtifactEvent.count()).toBe(6);

    const applied = await runPrivacyRetention({ apply: true, now: NOW, configuration });
    expect(applied.counts.githubArtifactEvents).toBe(2);
    const remaining = new Set(
      (await prisma.gitHubArtifactEvent.findMany({ select: { id: true } })).map((row) => row.id)
    );
    expect(remaining).toEqual(new Set([oldPending.id, oldProcessing.id, atLimit.id, recent.id]));
    expect(remaining.has(oldDispatched.id) || remaining.has(oldFailed.id)).toBe(false);
    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'RETENTION_CLEANUP_EXECUTED' },
      select: { metadataJson: true }
    });
    expect(audit.metadataJson.count).toBe(
      Object.values(applied.counts).reduce((sum, count) => sum + count, 0)
    );
  });

  it('PV3 a anonimização apaga as notificações do GitHub do titular e mantém a fila', async () => {
    const project = await createProject(prisma);
    await person(project.id, 'OWNER');
    const subject = await person(project.id);
    const other = await person(project.id);
    await githubNotification(subject.id, project.id);
    await githubNotification(subject.id, project.id, {
      type: 'PULL_REQUEST_EVENT',
      githubEvent: 'PULL_REQUEST_MERGED'
    });
    const kept = await githubNotification(other.id, project.id);
    const event = await githubEvent(project.id);
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
    expect(await prisma.notification.findUnique({ where: { id: kept.id } })).not.toBeNull();
    expect(await prisma.gitHubArtifactEvent.findUnique({ where: { id: event.id } })).not.toBeNull();
  });

  it('PV4 a purga do projeto remove eventos, retrato e notificações dele e preserva os de outro projeto', async () => {
    const project = await createProject(prisma);
    const owner = await person(project.id, 'OWNER');
    const other = await createProject(prisma);
    const task = await createTask(prisma, project.id, { responsibleUserId: owner.id });
    const event = await githubEvent(project.id, { targets: { create: [{ taskId: task.id }] } });
    await githubNotification(owner.id, project.id, { taskId: task.id });
    const elsewhere = await githubEvent(other.id);
    const elsewhereNotification = await githubNotification(owner.id, other.id);
    const service = deletionService({ storage });

    await service.requestDeletion(project.id, owner.id);
    await expect(service.purge(project.id, owner.id, project.name)).resolves.toMatchObject({
      purged: true
    });

    expect(await prisma.gitHubArtifactEvent.findUnique({ where: { id: event.id } })).toBeNull();
    expect(await prisma.gitHubArtifactEventTask.count({ where: { eventId: event.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { projectId: project.id } })).toBe(0);
    expect(
      await prisma.gitHubArtifactEvent.findUnique({ where: { id: elsewhere.id } })
    ).not.toBeNull();
    expect(
      await prisma.notification.findUnique({ where: { id: elsewhereNotification.id } })
    ).not.toBeNull();
  });
});
