import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createTask } from '../fixtures/factories.js';

let prisma;
let app;
let env;
let service;
let createNotificationService;
let kanban;
let privacyService;
let settingsRepository;
let runOverdueNotifications;
let sequence = 0;
const password = 'SenhaSegura123';
const DAY = 86_400_000;
const ZONE = 'America/Sao_Paulo';

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ env } = await import('../../src/config/env.js'));
  ({ notificationService: service, createNotificationService } =
    await import('../../src/modules/notifications/notification.service.js'));
  ({ taskKanbanService: kanban } =
    await import('../../src/modules/tasks/services/task-kanban.service.js'));
  ({ privacyService } = await import('../../src/modules/privacy/privacy.service.js'));
  ({ settingsRepository } = await import('../../src/modules/settings/settings.repository.js'));
  ({ runOverdueNotifications } = await import('../../scripts/notify-overdue-tasks.js'));
  const { default: application } = await import('../../src/app.js');
  app = await startTestServer(application);
  await cleanTestDatabase(prisma);
}, 60000);

afterEach(async () => cleanTestDatabase(prisma));

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function person(projectId, { role = 'MEMBER', isActive = true, accountStatus } = {}) {
  sequence += 1;
  const user = await prisma.user.create({
    data: {
      name: `Pessoa reteste S2-02 ${sequence}`,
      username: `s202rtint${sequence}`,
      email: `s202-rtint-${sequence}@example.invalid`,
      ...(accountStatus ? { accountStatus } : {})
    }
  });
  if (projectId)
    await prisma.projectMembership.create({ data: { projectId, userId: user.id, role, isActive } });
  return user;
}

async function account() {
  sequence += 1;
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: `Conta reteste ${sequence}`,
    username: `s202rtacc${sequence}`,
    email: `s202-rtacc-${sequence}@example.invalid`,
    password
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: response.body.emailVerification.testToken });
  return {
    user: response.body.user,
    agent,
    put: (preferences) =>
      agent
        .put('/api/settings/notifications')
        .set('X-CSRF-Token', response.body.csrfToken)
        .send({ preferences })
  };
}

const at = (iso) => new Date(iso);
const serviceAt = (iso) => createNotificationService({ clock: () => at(iso) });
const job = (now, overrides = {}) =>
  service.notifyOverdueTasks({
    now: at(now),
    timeZone: ZONE,
    lookbackDays: 7,
    dryRun: false,
    ...overrides
  });
const moveBy = (actor, task, toStatus) =>
  kanban.moveTask(
    task.id,
    { toStatus },
    { actor: { id: actor.id, name: actor.name }, requestId: 's202-reteste' }
  );
const audits = (userId) =>
  prisma.auditEvent.findMany({
    where: { action: 'NOTIFICATION_PREFERENCES_UPDATED', actorUserId: userId },
    orderBy: { id: 'asc' }
  });
const overdueTo = (user) =>
  prisma.notification.count({ where: { recipientUserId: user.id, type: 'TASK_OVERDUE' } });
const statusTo = (user) =>
  prisma.notification.count({ where: { recipientUserId: user.id, type: 'TASK_STATUS_CHANGED' } });
const OFF = { TASK_STATUS_CHANGED: true, TASK_OVERDUE: false };
const ON = { TASK_STATUS_CHANGED: true, TASK_OVERDUE: true };

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

function utcDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

async function dueTask(projectId, responsibleUserId, dueDate) {
  return createTask(prisma, projectId, {
    responsibleUserId,
    deadline: at(`${dueDate}T00:00:00.000Z`)
  });
}

describe('S2-02 reteste — correções verificadas no banco (bloco V)', () => {
  it('RT-V-02 vinte rodadas de três PUT distintos e um igual ao inicial, pela API, têm trilha coerente', async () => {
    const choices = [
      { TASK_STATUS_CHANGED: false, TASK_OVERDUE: true },
      { TASK_STATUS_CHANGED: true, TASK_OVERDUE: false },
      { TASK_STATUS_CHANGED: false, TASK_OVERDUE: false },
      { TASK_STATUS_CHANGED: true, TASK_OVERDUE: true }
    ];
    const outcomes = [];
    for (let round = 0; round < 20; round += 1) {
      const owner = await account();
      const responses = await Promise.all(choices.map((choice) => owner.put(choice)));
      const final = (await owner.agent.get('/api/settings/notifications')).body.preferences;
      outcomes.push({
        statuses: responses.map((response) => response.status),
        final,
        replayed: replay(await audits(owner.user.id))
      });
    }

    for (const outcome of outcomes) {
      expect(outcome.statuses).toEqual([200, 200, 200, 200]);
      expect(outcome.replayed).toEqual(outcome.final);
    }
  }, 120000);

  it('RT-V-03 com enabledAt gravado pela API, o vencimento anterior à religação não notifica e o posterior notifica', async () => {
    const owner = await account();
    const project = await createProject(prisma);
    await prisma.projectMembership.create({
      data: { projectId: project.id, userId: owner.user.id, role: 'MEMBER' }
    });
    const today = Date.now();
    const before = await dueTask(project.id, owner.user.id, utcDate(today - 3 * DAY));
    const after = await dueTask(project.id, owner.user.id, utcDate(today));

    expect((await owner.put(OFF)).status).toBe(200);
    expect((await owner.put(ON)).status).toBe(200);
    const report = await job(new Date(today + 3 * DAY).toISOString(), { projectId: project.id });
    const created = await prisma.notification.findMany({
      where: { recipientUserId: owner.user.id, type: 'TASK_OVERDUE' }
    });

    expect(report).toMatchObject({ created: 1, excluded: { PREFERENCE_OFF: 1 } });
    expect(created.map((row) => row.taskId)).toEqual([after.id]);
    expect(before.id).not.toBe(after.id);
  });

  it('RT-V-04 job: conta restrita conta em INACTIVE_ACCOUNT nos três estados, ACTIVE notifica', async () => {
    const project = await createProject(prisma);
    const counts = {};
    for (const accountStatus of ['ACTIVE', 'DEACTIVATED', 'DELETION_PENDING', 'ANONYMIZED']) {
      const responsible = await person(project.id, { accountStatus });
      await dueTask(project.id, responsible.id, '2026-10-15');
      counts[accountStatus] = responsible;
    }

    const report = await job('2026-10-16T12:00:00.000Z', { projectId: project.id });

    expect(report).toMatchObject({ created: 1, excluded: { INACTIVE_ACCOUNT: 3 } });
    expect(await overdueTo(counts.ACTIVE)).toBe(1);
  });

  it('RT-V-06 --project-id inexistente, excluído e em purga: código 2 em dry-run e apply; projeto válido sem vencida: 0', async () => {
    const valid = await createProject(prisma);
    const removed = await createProject(prisma);
    await prisma.project.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });
    const purging = await createProject(prisma);
    await prisma.project.update({
      where: { id: purging.id },
      data: { deletedAt: new Date(Date.now() - 40 * DAY) }
    });
    const run = async (args) => {
      const errors = [];
      const code = await runOverdueNotifications({
        args,
        service,
        databaseUrl: env.databaseUrl,
        write: () => {},
        writeError: (text) => errors.push(text)
      });
      return [code, errors.join('').includes('--project-id=')];
    };

    const results = {};
    for (const [name, id] of [
      ['inexistente', 2147483000],
      ['excluido', removed.id],
      ['purga', purging.id],
      ['valido', valid.id]
    ])
      for (const mode of ['--dry-run', '--apply'])
        results[`${name} ${mode}`] = await run([mode, `--project-id=${id}`]);

    expect(results).toEqual({
      'inexistente --dry-run': [2, true],
      'inexistente --apply': [2, true],
      'excluido --dry-run': [2, true],
      'excluido --apply': [2, true],
      'purga --dry-run': [2, true],
      'purga --apply': [2, true],
      'valido --dry-run': [0, false],
      'valido --apply': [0, false]
    });
  });

  it.each([
    ['Pacific/Apia', '2011-12-29', '2011-12-30T10:00:00.000Z'],
    ['Pacific/Fakaofo', '2011-12-29', '2011-12-30T11:00:00.000Z'],
    ['Pacific/Kwajalein', '1993-08-20', '1993-08-21T12:00:00.000Z'],
    ['Pacific/Kiritimati', '1994-12-30', '1994-12-31T10:00:00.000Z']
  ])('RT-V-08 %s pelo job: prazo %s vence em %s, não 1 ms antes', async (zone, dueDate, cutoff) => {
    const project = await createProject(prisma);
    const responsible = await person(project.id);
    await dueTask(project.id, responsible.id, dueDate);
    const instant = Date.parse(cutoff);

    const early = await job(new Date(instant - 1).toISOString(), {
      projectId: project.id,
      timeZone: zone
    });
    const exact = await job(cutoff, { projectId: project.id, timeZone: zone });

    expect([early.created, exact.created]).toEqual([0, 1]);
  });
});

describe('S2-02 reteste — PUT serializado (N-L)', () => {
  it('RT-N-L-01 vinte PUT simultâneos do mesmo usuário: sem erro, trilha coerente, estado final válido', async () => {
    const user = await person();
    const choices = Array.from({ length: 20 }, (_, index) => ({
      TASK_STATUS_CHANGED: index % 2 === 0,
      TASK_OVERDUE: index % 3 === 0
    }));

    const results = await Promise.allSettled(
      choices.map((choice) => service.updatePreferences(user.id, choice))
    );
    const final = (await service.preferences(user.id)).preferences;

    expect(results.filter((result) => result.status === 'rejected')).toEqual([]);
    expect(replay(await audits(user.id))).toEqual(final);
    expect(choices).toContainEqual(final);
  }, 60000);

  it('RT-N-L-02 PUT concorrente à desativação da conta: sem deadlock, estado coerente', async () => {
    const outcomes = [];
    for (let round = 0; round < 10; round += 1) {
      const user = await person();
      const results = await Promise.allSettled([
        service.updatePreferences(user.id, OFF),
        settingsRepository.deactivate(user.id, 0, new Date(), {
          actorUserId: user.id,
          action: 'ACCOUNT_DEACTIVATED',
          resourceType: 'User',
          resourceId: String(user.id),
          retentionUntil: new Date(Date.now() + DAY)
        })
      ]);
      const stored = await prisma.user.findUnique({ where: { id: user.id } });
      outcomes.push({
        rejected: results
          .filter((result) => result.status === 'rejected')
          .map((result) => result.reason?.code || result.reason?.message),
        accountStatus: stored.accountStatus,
        audits: (await audits(user.id)).length
      });
    }

    for (const outcome of outcomes) {
      expect(outcome.rejected).toEqual([]);
      expect(outcome.accountStatus).toBe('DEACTIVATED');
      expect(outcome.audits).toBe(1);
    }
  }, 60000);

  it('RT-N-L-02 PUT concorrente à anonimização (só alcançável abaixo da API): registra o resultado', async () => {
    const outcomes = [];
    for (let round = 0; round < 10; round += 1) {
      const project = await createProject(prisma);
      await person(project.id, { role: 'OWNER' });
      const user = await person(project.id);
      await prisma.notificationPreference.create({
        data: { userId: user.id, type: 'TASK_STATUS_CHANGED', enabled: false }
      });
      await prisma.privacyRequest.create({
        data: {
          userId: user.id,
          type: 'ACCOUNT_DELETION',
          scheduledFor: new Date(Date.now() - 1000)
        }
      });
      const results = await Promise.allSettled([
        service.updatePreferences(user.id, OFF),
        privacyService.processDueDeletions({ dryRun: false })
      ]);
      outcomes.push({
        rejected: results
          .filter((result) => result.status === 'rejected')
          .map((result) => String(result.reason?.code || result.reason?.message).slice(0, 40)),
        anonymized: (await prisma.user.findUnique({ where: { id: user.id } })).accountStatus,
        preferencesLeft: await prisma.notificationPreference.count({ where: { userId: user.id } })
      });
    }

    process.stdout.write(`RT-N-L-02 anonimizacao ${JSON.stringify(outcomes)}\n`);
    expect(outcomes).toHaveLength(10);
  }, 120000);

  it('RT-N-L-03 PUT de usuários diferentes em paralelo não se serializam', async () => {
    const users = [];
    for (let index = 0; index < 12; index += 1) users.push(await person());
    const single = performance.now();
    await service.updatePreferences(users[0].id, OFF);
    const singleMs = performance.now() - single;

    const started = performance.now();
    await Promise.all(users.slice(1).map((user) => service.updatePreferences(user.id, OFF)));
    const parallelMs = performance.now() - started;

    process.stdout.write(`RT-N-L-03 ${JSON.stringify({ singleMs, parallelMs })}\n`);
    expect(parallelMs).toBeLessThan(singleMs * 11);
  });

  it('RT-N-L-04 primeiro PUT sem mudança não cria linha nem auditoria, e o GET devolve o padrão', async () => {
    const user = await person();

    await service.updatePreferences(user.id, ON);

    expect(await prisma.notificationPreference.count({ where: { userId: user.id } })).toBe(0);
    expect(await audits(user.id)).toHaveLength(0);
    expect((await service.preferences(user.id)).preferences).toEqual(ON);
  });

  it('RT-N-L-05 PUT esperando um bloqueio além do tempo da transação responde erro genérico, sem detalhe técnico', async () => {
    const owner = await account();
    const bystander = await account();
    let release;
    const holding = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM User WHERE id = ${owner.user.id} FOR UPDATE`;
        await new Promise((resolve) => {
          release = resolve;
          setTimeout(resolve, 7000);
        });
      },
      { timeout: 15000, maxWait: 5000 }
    );
    await new Promise((resolve) => setTimeout(resolve, 300));

    const response = await owner.put(OFF);
    const other = await bystander.agent.get('/api/settings/notifications');
    const next = await owner.agent.get('/api/settings/notifications');
    const second = await owner.agent.get('/api/settings/notifications');
    release?.();
    await holding;
    const afterRelease = await bystander.agent.get('/api/settings/notifications');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await prisma.$queryRaw`SELECT 1`;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    process.stdout.write(
      `RT-N-L-05 ${JSON.stringify({ status: response.status, code: response.body.code, other: [other.status, other.body.code], next: [next.status, next.body.code], second: second.status, otherAfterRelease: afterRelease.status })}\n`
    );
    expect(response.status).not.toBe(200);
    expect(JSON.stringify(response.body)).not.toMatch(/prisma|P20\d\d|transaction|SELECT|stack/i);
    expect(response.body.requestId).toEqual(expect.any(String));
  }, 30000);
});

describe('S2-02 reteste — enabledAt (N-E)', () => {
  async function scenario(dueDate = '2026-10-15') {
    const project = await createProject(prisma);
    const responsible = await person(project.id);
    const task = await dueTask(project.id, responsible.id, dueDate);
    await serviceAt('2026-10-01T00:00:00.000Z').updatePreferences(responsible.id, OFF);
    return { project, responsible, task };
  }

  it.each([
    ['1 ms antes do corte', '2026-10-16T02:59:59.999Z', 1],
    ['no instante do corte', '2026-10-16T03:00:00.000Z', 1],
    ['1 ms depois do corte', '2026-10-16T03:00:00.001Z', 0]
  ])('RT-N-E-01 religar %s (%s) → %i notificação', async (_, reenableAt, expected) => {
    const { project, responsible } = await scenario();
    await serviceAt(reenableAt).updatePreferences(responsible.id, ON);

    await job('2026-10-16T12:00:00.000Z', { projectId: project.id });

    expect(await overdueTo(responsible)).toBe(expected);
  });

  it('RT-N-E-02 ligar e desligar várias vezes: vale a última religação', async () => {
    const { project, responsible } = await scenario();
    for (const [instant, choice] of [
      ['2026-10-15T00:00:00.000Z', ON],
      ['2026-10-15T06:00:00.000Z', OFF],
      ['2026-10-16T06:00:00.000Z', ON],
      ['2026-10-16T07:00:00.000Z', OFF],
      ['2026-10-16T08:00:00.000Z', ON]
    ])
      await serviceAt(instant).updatePreferences(responsible.id, choice);

    const report = await job('2026-10-16T12:00:00.000Z', { projectId: project.id });

    expect(report).toMatchObject({ created: 0, excluded: { PREFERENCE_OFF: 1 } });
  });

  it('RT-N-E-03 prazo antecipado para corte antes de religar não notifica; adiado para corte depois notifica', async () => {
    const { project, responsible, task } = await scenario('2026-10-20');
    await serviceAt('2026-10-18T12:00:00.000Z').updatePreferences(responsible.id, ON);

    await prisma.task.update({
      where: { id: task.id },
      data: { deadline: at('2026-10-15T00:00:00.000Z') }
    });
    const earlier = await job('2026-10-19T12:00:00.000Z', { projectId: project.id });
    await prisma.task.update({
      where: { id: task.id },
      data: { deadline: at('2026-10-19T00:00:00.000Z') }
    });
    const later = await job('2026-10-21T12:00:00.000Z', { projectId: project.id });

    expect(earlier).toMatchObject({ created: 0, excluded: { PREFERENCE_OFF: 1 } });
    expect(later.created).toBe(1);
  });

  it('RT-N-E-05 anonimização apaga a preferência com o enabledAt', async () => {
    const project = await createProject(prisma);
    await person(project.id, { role: 'OWNER' });
    const user = await person(project.id);
    await serviceAt('2026-10-01T00:00:00.000Z').updatePreferences(user.id, OFF);
    await serviceAt('2026-10-02T00:00:00.000Z').updatePreferences(user.id, ON);
    await prisma.privacyRequest.create({
      data: { userId: user.id, type: 'ACCOUNT_DELETION', scheduledFor: new Date(Date.now() - 1000) }
    });

    await privacyService.processDueDeletions({ dryRun: false });

    expect(await prisma.notificationPreference.count({ where: { userId: user.id } })).toBe(0);
  });

  it('RT-N-E-07 RF30 ignora enabledAt: desligar e religar antes do movimento notifica', async () => {
    const project = await createProject(prisma);
    const actor = await person(project.id, { role: 'MANAGER' });
    const responsible = await person(project.id);
    const task = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
    await serviceAt('2026-10-01T00:00:00.000Z').updatePreferences(responsible.id, {
      TASK_STATUS_CHANGED: false,
      TASK_OVERDUE: true
    });
    await serviceAt('2026-10-02T00:00:00.000Z').updatePreferences(responsible.id, ON);

    await moveBy(actor, task, 'EM_ANDAMENTO');

    expect(await statusTo(responsible)).toBe(1);
  });
});

describe('S2-02 reteste — contas restritas (N-A) e métrica (M)', () => {
  const STATUSES = ['ACTIVE', 'DEACTIVATED', 'DELETION_PENDING', 'ANONYMIZED'];
  const PREFERENCES = ['ausente', true, false];

  function expectedReason({ accountStatus, isActive, preference }) {
    if (accountStatus !== 'ACTIVE') return 'INACTIVE_ACCOUNT';
    if (!isActive) return 'INACTIVE_MEMBER';
    if (preference === false) return 'PREFERENCE_OFF';
    return null;
  }

  it('RT-N-A-01 48 combinações de conta × membership × preferência × RF seguem a tabela', async () => {
    const project = await createProject(prisma);
    const actor = await person(project.id, { role: 'MANAGER' });
    const rows = [];
    for (const accountStatus of STATUSES)
      for (const isActive of [true, false])
        for (const preference of PREFERENCES) {
          const responsible = await person(project.id, { isActive, accountStatus });
          if (preference !== 'ausente')
            for (const type of ['TASK_STATUS_CHANGED', 'TASK_OVERDUE'])
              await prisma.notificationPreference.create({
                data: { userId: responsible.id, type, enabled: preference }
              });
          const moved = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
          await moveBy(actor, moved, 'EM_ANDAMENTO');
          await dueTask(project.id, responsible.id, '2026-10-15');
          rows.push({ responsible, accountStatus, isActive, preference });
        }

    const report = await job('2026-10-16T12:00:00.000Z', { projectId: project.id });
    const table = [];
    for (const row of rows) {
      const reason = expectedReason(row);
      table.push([
        `${row.accountStatus}/${row.isActive}/${row.preference}`,
        [await statusTo(row.responsible), await overdueTo(row.responsible)],
        reason ? [0, 0] : [1, 1]
      ]);
    }
    const expectedCounts = { INACTIVE_ACCOUNT: 0, INACTIVE_MEMBER: 0, PREFERENCE_OFF: 0 };
    for (const row of rows) {
      const reason = expectedReason(row);
      if (reason) expectedCounts[reason] += 1;
    }

    expect(table.map(([label, actual]) => [label, actual])).toEqual(
      table.map(([label, , expected]) => [label, expected])
    );
    expect(report.excluded).toMatchObject(expectedCounts);
  }, 120000);

  it('RT-N-A-02 conta reativada dentro da janela notifica na varredura seguinte; fora da janela vira OUTSIDE_WINDOW', async () => {
    const project = await createProject(prisma);
    const inside = await person(project.id, { accountStatus: 'DEACTIVATED' });
    const outside = await person(project.id, { accountStatus: 'DEACTIVATED' });
    await dueTask(project.id, inside.id, '2026-10-15');
    await dueTask(project.id, outside.id, '2026-10-01');

    await job('2026-10-16T12:00:00.000Z', { projectId: project.id });
    await prisma.user.updateMany({
      where: { id: { in: [inside.id, outside.id] } },
      data: { accountStatus: 'ACTIVE' }
    });
    const after = await job('2026-10-17T12:00:00.000Z', { projectId: project.id });

    expect(await overdueTo(inside)).toBe(1);
    expect(await overdueTo(outside)).toBe(0);
    expect(after.excluded.OUTSIDE_WINDOW).toBe(1);
  });

  it('RT-N-A-03 mudança de estado da conta concorrente ao movimento: sem erro e no máximo uma notificação', async () => {
    const project = await createProject(prisma);
    const actor = await person(project.id, { role: 'MANAGER' });
    const outcomes = [];
    for (let round = 0; round < 10; round += 1) {
      const responsible = await person(project.id);
      const task = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
      const results = await Promise.allSettled([
        moveBy(actor, task, 'EM_ANDAMENTO'),
        prisma.user.update({
          where: { id: responsible.id },
          data: { accountStatus: 'DEACTIVATED' }
        })
      ]);
      outcomes.push([
        results.map((result) => result.status),
        await statusTo(responsible),
        await prisma.taskMovement.count({ where: { taskId: task.id } })
      ]);
    }

    for (const [statuses, notifications, movements] of outcomes) {
      expect(statuses).toEqual(['fulfilled', 'fulfilled']);
      expect(movements).toBe(1);
      expect(notifications).toBeLessThanOrEqual(1);
    }
  });

  it('RT-N-A-04/RT-M-01 métrica recalculada do banco com um evento de cada um dos cinco motivos', async () => {
    const project = await createProject(prisma);
    const actor = await person(project.id, { role: 'MANAGER' });
    const eligible = await person(project.id);
    const restricted = await person(project.id, { accountStatus: 'DEACTIVATED' });
    const inactive = await person(project.id, { isActive: false });
    const optedOut = await person(project.id);
    for (const type of ['TASK_STATUS_CHANGED', 'TASK_OVERDUE'])
      await prisma.notificationPreference.create({
        data: { userId: optedOut.id, type, enabled: false }
      });
    for (const [owner, who] of [
      [eligible, actor],
      [null, actor],
      [eligible, eligible],
      [restricted, actor],
      [inactive, actor],
      [optedOut, actor]
    ]) {
      const task = await createTask(prisma, project.id, { responsibleUserId: owner?.id ?? null });
      await moveBy(who, task, 'EM_ANDAMENTO');
    }
    for (const owner of [eligible, null, restricted, inactive, optedOut])
      await dueTask(project.id, owner?.id ?? null, '2026-10-15');
    await dueTask(project.id, eligible.id, '2026-09-01');

    const report = await job('2026-10-16T12:00:00.000Z', { projectId: project.id });
    const movements = await prisma.taskMovement.findMany({ include: { task: true } });
    const users = new Map(
      (await prisma.user.findMany()).map((user) => [user.id, user.accountStatus])
    );
    const members = new Set(
      (
        await prisma.projectMembership.findMany({
          where: { projectId: project.id, isActive: true }
        })
      ).map((row) => row.userId)
    );
    const off = new Set(
      (
        await prisma.notificationPreference.findMany({
          where: { type: 'TASK_STATUS_CHANGED', enabled: false }
        })
      ).map((row) => row.userId)
    );
    const eligibleMovements = movements.filter(
      (movement) =>
        movement.task.responsibleUserId &&
        movement.task.responsibleUserId !== movement.movedByUserId &&
        users.get(movement.task.responsibleUserId) === 'ACTIVE' &&
        members.has(movement.task.responsibleUserId) &&
        !off.has(movement.task.responsibleUserId)
    );
    const statusRows = await prisma.notification.findMany({
      where: { type: 'TASK_STATUS_CHANGED' }
    });

    expect(movements).toHaveLength(6);
    expect(eligibleMovements).toHaveLength(1);
    expect(statusRows).toHaveLength(1);
    expect(statusRows[0].dedupeKey).toBe(`TASK_STATUS_CHANGED:movement:${eligibleMovements[0].id}`);
    expect(report).toMatchObject({
      eligible: 1,
      created: 1,
      excluded: {
        OUTSIDE_WINDOW: 1,
        NO_RESPONSIBLE: 1,
        INACTIVE_ACCOUNT: 1,
        INACTIVE_MEMBER: 1,
        PREFERENCE_OFF: 1
      }
    });
  });
});

describe('S2-02 reteste — job (N-J)', () => {
  it('RT-N-J-01/R10 banco de produção sem confirmação e projeto inexistente: a recusa de produção vence (1); em dry-run vale o 2', async () => {
    const run = async (args) => {
      const errors = [];
      const code = await runOverdueNotifications({
        args,
        service,
        databaseUrl: 'mysql://usuario:senha@localhost:3306/traceflow_prod',
        write: () => {},
        writeError: (text) => errors.push(text)
      });
      return [code, errors.join('').slice(0, 60)];
    };

    const apply = await run(['--apply', '--project-id=2147483000']);
    const dry = await run(['--dry-run', '--project-id=2147483000']);

    expect(apply[0]).toBe(1);
    expect(apply[1]).toMatch(/confirm-production/);
    expect(dry[0]).toBe(2);
  });

  it('RT-N-J-02 a saída tem as cinco chaves de excluded em dry-run e em apply', async () => {
    const project = await createProject(prisma);
    const dry = await job('2026-10-16T12:00:00.000Z', { projectId: project.id, dryRun: true });
    const apply = await job('2026-10-16T12:00:00.000Z', { projectId: project.id });

    for (const report of [dry, apply])
      expect(Object.keys(report.excluded)).toEqual([
        'OUTSIDE_WINDOW',
        'NO_RESPONSIBLE',
        'INACTIVE_ACCOUNT',
        'INACTIVE_MEMBER',
        'PREFERENCE_OFF'
      ]);
  });

  it('RT-N-J-04 OUTSIDE_WINDOW conta toda tarefa aberta com corte antes da janela, notificada ou não', async () => {
    const project = await createProject(prisma);
    const responsible = await person(project.id);
    await dueTask(project.id, responsible.id, '2026-09-01');
    await dueTask(project.id, null, '2026-09-02');
    await createTask(prisma, project.id, {
      responsibleUserId: responsible.id,
      status: 'CONCLUIDO',
      deadline: at('2026-09-03T00:00:00.000Z')
    });
    const notified = await dueTask(project.id, responsible.id, '2026-10-01');
    await job('2026-10-02T12:00:00.000Z', { projectId: project.id });

    const later = await job('2026-10-20T12:00:00.000Z', { projectId: project.id });

    expect(await overdueTo(responsible)).toBe(1);
    expect(later.excluded.OUTSIDE_WINDOW).toBe(3);
    expect(notified.id).toBeGreaterThan(0);
  });
});

describe('S2-02 reteste — desempenho (⚑5)', () => {
  it('RT-N-C-10 lista por cursor com 10.000 notificações: cada página ≤ 300 ms; EXPLAIN registrado', async () => {
    const project = await createProject(prisma);
    const owner = await person(project.id);
    const rows = Array.from({ length: 10000 }, (_, index) => ({
      recipientUserId: owner.id,
      projectId: project.id,
      type: 'TASK_OVERDUE',
      dedupeKey: `TASK_OVERDUE:${index}:2026-10-10`,
      taskTitle: `Carga ${index}`,
      createdAt: new Date(Date.UTC(2026, 0, 1) + Math.floor(index / 3) * 60_000),
      readAt: index % 2 ? new Date() : null
    }));
    for (let start = 0; start < rows.length; start += 2000)
      await prisma.notification.createMany({ data: rows.slice(start, start + 2000) });

    const timings = {};
    for (const status of ['UNREAD', 'ALL']) {
      let cursor;
      let pages = 0;
      let seen = 0;
      let worst = 0;
      do {
        const started = performance.now();
        const page = await service.list(owner.id, {
          status,
          limit: 100,
          ...(cursor ? { cursor: decode(cursor) } : {})
        });
        worst = Math.max(worst, performance.now() - started);
        seen += page.notifications.length;
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor && pages < 200);
      timings[status] = { pages, seen, worstMs: Math.round(worst) };
    }
    const middle = new Date(Date.UTC(2026, 0, 1) + 1000 * 60_000);
    const explain = {};
    for (const [status, unread] of [
      ['UNREAD', 'AND n.readAt IS NULL '],
      ['ALL', '']
    ]) {
      const rows = await prisma.$queryRawUnsafe(
        `EXPLAIN SELECT n.id FROM Notification n WHERE n.recipientUserId = ? ${unread}AND (n.createdAt < ? OR (n.createdAt = ? AND n.id < ?)) ORDER BY n.createdAt DESC, n.id DESC LIMIT 101`,
        owner.id,
        middle,
        middle,
        5000
      );
      explain[status] = rows.map((row) =>
        Object.values(row).map((value) => (typeof value === 'bigint' ? Number(value) : value))
      );
    }

    process.stdout.write(`RT-N-C-10 ${JSON.stringify({ timings, explain })}\n`);
    expect(timings.UNREAD.seen).toBe(5000);
    expect(timings.ALL.seen).toBe(10000);
    expect(Math.max(timings.UNREAD.worstMs, timings.ALL.worstMs)).toBeLessThanOrEqual(300);
  }, 300000);

  it('RT-N-X-02 exportação com 5.000 notificações em 50 projetos ≤ 5 s', async () => {
    const owner = await person();
    for (let projectIndex = 0; projectIndex < 50; projectIndex += 1) {
      const project = await createProject(prisma);
      await prisma.projectMembership.create({
        data: {
          projectId: project.id,
          userId: owner.id,
          role: 'MEMBER',
          isActive: projectIndex % 5 !== 0
        }
      });
      await prisma.notification.createMany({
        data: Array.from({ length: 100 }, (_, index) => ({
          recipientUserId: owner.id,
          projectId: project.id,
          type: 'TASK_OVERDUE',
          dedupeKey: `TASK_OVERDUE:${projectIndex}:${index}`,
          taskTitle: `Carga ${projectIndex}-${index}`
        }))
      });
    }

    const selects = async () => {
      const [row] = await prisma.$queryRawUnsafe("SHOW GLOBAL STATUS LIKE 'Com_select'");
      return Number(Object.values(row)[1]);
    };
    const selectsBefore = await selects();
    const started = performance.now();
    const data = await settingsRepository.exportData(owner.id);
    const elapsed = performance.now() - started;
    const queries = (await selects()) - selectsBefore;

    process.stdout.write(
      `RT-N-X-02 ${JSON.stringify({ elapsedMs: Math.round(elapsed), notifications: data.notifications.length, selects: queries })}\n`
    );
    expect(data.notifications).toHaveLength(5000);
    expect(elapsed).toBeLessThanOrEqual(5000);
    expect(queries).toBeLessThan(500);
  }, 300000);
});

function decode(cursor) {
  const [createdAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  return { createdAt: new Date(createdAt), id: Number(id) };
}
