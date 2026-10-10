import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let prisma;
let service;
let sequence = 0;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ notificationService: service } =
    await import('../../src/modules/notifications/notification.service.js'));
  await cleanTestDatabase(prisma);
}, 60000);

afterEach(async () => cleanTestDatabase(prisma));

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function person(projectId, { role = 'MEMBER', isActive = true } = {}) {
  sequence += 1;
  const user = await prisma.user.create({
    data: {
      name: `Pessoa correções S2-02 ${sequence}`,
      username: `s202corr${sequence}`,
      email: `s202-corr-${sequence}@example.invalid`
    }
  });
  if (projectId)
    await prisma.projectMembership.create({ data: { projectId, userId: user.id, role, isActive } });
  return user;
}

const audits = (userId) =>
  prisma.auditEvent.findMany({
    where: { action: 'NOTIFICATION_PREFERENCES_UPDATED', actorUserId: userId },
    orderBy: { id: 'asc' }
  });

function replay(events) {
  let state = { TASK_STATUS_CHANGED: true, TASK_OVERDUE: true };
  for (const event of events) {
    const changed = event.metadataJson.changedTypes.split(',');
    state = Object.fromEntries(
      Object.entries(state).map(([type, value]) => [type, changed.includes(type) ? !value : value])
    );
  }
  return state;
}

describe('S2-02 correções — PUT de preferências serializado (S202-A02)', () => {
  it('C4-01 H11: dez rodadas de dois primeiros PUT simultâneos têm auditoria coerente com o estado final', async () => {
    const outcomes = [];
    for (let round = 0; round < 10; round += 1) {
      const user = await person();
      await Promise.all([
        service.updatePreferences(user.id, { TASK_STATUS_CHANGED: false, TASK_OVERDUE: true }),
        service.updatePreferences(user.id, { TASK_STATUS_CHANGED: true, TASK_OVERDUE: false })
      ]);
      const final = (await service.preferences(user.id)).preferences;
      outcomes.push({ final, replayed: replay(await audits(user.id)) });
    }

    for (const { final, replayed } of outcomes) expect(replayed).toEqual(final);
  });

  it('C4-01 dois PUT simultâneos iguais geram uma auditoria', async () => {
    const user = await person();
    const choice = { TASK_STATUS_CHANGED: false, TASK_OVERDUE: true };

    await Promise.all([
      service.updatePreferences(user.id, choice),
      service.updatePreferences(user.id, choice)
    ]);

    expect(await audits(user.id)).toHaveLength(1);
  });

  it('C4-01 PUT sem mudança não audita nem regrava a preferência', async () => {
    const user = await person();
    const choice = { TASK_STATUS_CHANGED: false, TASK_OVERDUE: true };
    await service.updatePreferences(user.id, choice);
    const before = await prisma.notificationPreference.findMany({
      where: { userId: user.id },
      orderBy: { type: 'asc' }
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    await service.updatePreferences(user.id, choice);

    const after = await prisma.notificationPreference.findMany({
      where: { userId: user.id },
      orderBy: { type: 'asc' }
    });
    expect(after.map((row) => [row.type, row.updatedAt.getTime()])).toEqual(
      before.map((row) => [row.type, row.updatedAt.getTime()])
    );
    expect(await audits(user.id)).toHaveLength(1);
  });
});
