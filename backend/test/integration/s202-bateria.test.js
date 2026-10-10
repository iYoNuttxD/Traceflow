import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createSprint, createTask } from '../fixtures/factories.js';

let prisma;
let kanban;
let crud;
let notifications;
let service;
let createNotificationService;
let audit;
let privacyService;
let runPrivacyRetention;
let runOverdueNotifications;
let env;
let sequence = 0;

const DAY = 86_400_000;
const SRC = resolve(fileURLToPath(new URL('../../src', import.meta.url)));

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ env } = await import('../../src/config/env.js'));
  ({ taskKanbanService: kanban } =
    await import('../../src/modules/tasks/services/task-kanban.service.js'));
  ({ taskCrudService: crud } =
    await import('../../src/modules/tasks/services/task-crud.service.js'));
  ({ notificationRepository: notifications } =
    await import('../../src/modules/notifications/notification.repository.js'));
  ({ notificationService: service, createNotificationService } =
    await import('../../src/modules/notifications/notification.service.js'));
  ({ auditRepository: audit } = await import('../../src/modules/audit/audit.repository.js'));
  ({ privacyService } = await import('../../src/modules/privacy/privacy.service.js'));
  ({ runPrivacyRetention } = await import('../../src/shared/maintenance/privacy-retention.js'));
  ({ runOverdueNotifications } = await import('../../scripts/notify-overdue-tasks.js'));
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

async function person(projectId, { role = 'MEMBER', isActive = true } = {}) {
  sequence += 1;
  const user = await prisma.user.create({
    data: {
      name: `Pessoa bateria S2-02 ${sequence}`,
      username: `s202intbat${sequence}`,
      email: `s202-intbat-${sequence}@example.invalid`
    }
  });
  if (projectId)
    await prisma.projectMembership.create({ data: { projectId, userId: user.id, role, isActive } });
  return user;
}

const actorOf = (user) => ({ actor: { id: user.id, name: user.name }, requestId: 's202-bateria' });
const move = async (task, toStatus, user) => {
  const current = await prisma.task.findUnique({ where: { id: task.id } });
  return kanban.moveTask(current.id, { toStatus }, actorOf(user));
};
const job = (overrides = {}) =>
  service.notifyOverdueTasks({
    timeZone: 'America/Sao_Paulo',
    lookbackDays: 7,
    dryRun: false,
    ...overrides
  });
const prefer = (userId, type, enabled) =>
  prisma.notificationPreference.create({ data: { userId, type, enabled } });
const at = (iso) => new Date(iso);

describe('S2-02 bateria de integração — RF30 (bloco S)', () => {
  it('NT-S-01 tabela de decisão: 5 tipos de responsável × 3 estados de preferência', async () => {
    const project = await createProject(prisma);
    const actor = await person(project.id, { role: 'MANAGER' });
    const expected = [];
    for (const kind of ['none', 'other', 'self', 'inactive', 'former'])
      for (const preference of ['absent', true, false]) {
        let responsible = null;
        if (kind === 'other') responsible = await person(project.id);
        if (kind === 'self') responsible = actor;
        if (kind === 'inactive') responsible = await person(project.id, { isActive: false });
        if (kind === 'former') responsible = await person();
        if (responsible && preference !== 'absent' && kind !== 'self')
          await prefer(responsible.id, 'TASK_STATUS_CHANGED', preference);
        const task = await createTask(prisma, project.id, {
          title: `${kind}-${preference}`,
          responsibleUserId: responsible?.id ?? null
        });
        if (kind === 'self' && preference !== 'absent')
          await prisma.notificationPreference.upsert({
            where: { userId_type: { userId: actor.id, type: 'TASK_STATUS_CHANGED' } },
            create: { userId: actor.id, type: 'TASK_STATUS_CHANGED', enabled: preference },
            update: { enabled: preference }
          });
        await move(task, 'EM_ANDAMENTO', actor);
        const rows = await prisma.notification.count({ where: { taskId: task.id } });
        expected.push([
          `${kind}/${preference}`,
          rows,
          kind === 'other' && preference !== false ? 1 : 0
        ]);
      }

    expect(expected.map(([label, rows]) => [label, rows])).toEqual(
      expected.map(([label, , want]) => [label, want])
    );
  });

  it('NT-S-03 só transitionStatus cria TaskMovement no código de produção', () => {
    const files = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.js')) files.push(path);
      }
    };
    walk(SRC);
    const writers = files.filter((file) =>
      /taskMovement\.(?:create|createMany|upsert)\s*\(/.test(readFileSync(file, 'utf8'))
    );

    expect(writers.map((file) => file.replaceAll('\\', '/').split('/src/')[1])).toEqual([
      'modules/tasks/repositories/task-movement.repository.js'
    ]);
  });

  it('NT-S-04 A→B→C→A gera três notificações com origem, destino e chave exatos', async () => {
    const project = await createProject(prisma);
    const actor = await person(project.id, { role: 'MANAGER' });
    const responsible = await person(project.id);
    const task = await createTask(prisma, project.id, { responsibleUserId: responsible.id });

    const ids = [];
    for (const status of ['EM_ANDAMENTO', 'CONCLUIDO', 'A_FAZER'])
      ids.push((await move(task, status, actor)).movement.id);

    const rows = await prisma.notification.findMany({ orderBy: { id: 'asc' } });
    expect(rows.map((row) => [row.fromStatus, row.toStatus, row.dedupeKey])).toEqual([
      ['A_FAZER', 'EM_ANDAMENTO', `TASK_STATUS_CHANGED:movement:${ids[0]}`],
      ['EM_ANDAMENTO', 'CONCLUIDO', `TASK_STATUS_CHANGED:movement:${ids[1]}`],
      ['CONCLUIDO', 'A_FAZER', `TASK_STATUS_CHANGED:movement:${ids[2]}`]
    ]);
  });

  it('NT-S-05 mover em sprint encerrada → 409 TASK_SPRINT_LOCKED e nenhuma notificação', async () => {
    const project = await createProject(prisma);
    const actor = await person(project.id, { role: 'MANAGER' });
    const responsible = await person(project.id);
    for (const status of ['CONCLUIDA', 'CANCELADA']) {
      const sprint = await createSprint(prisma, project.id, { status });
      const task = await createTask(prisma, project.id, {
        responsibleUserId: responsible.id,
        sprintId: sprint.id
      });
      await expect(move(task, 'EM_ANDAMENTO', actor)).rejects.toMatchObject({
        statusCode: 409,
        code: 'TASK_SPRINT_LOCKED'
      });
    }
    expect(await prisma.notification.count()).toBe(0);
  });

  it('NT-S-06 mudar responsável, prioridade, prazo ou título não gera TASK_STATUS_CHANGED', async () => {
    const project = await createProject(prisma);
    const actor = await person(project.id, { role: 'MANAGER' });
    const responsible = await person(project.id);
    const successor = await person(project.id);
    const task = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
    const context = { actorUserId: actor.id, requestId: 's202-bateria' };

    await crud.updateTask(task.id, { priority: 'ALTA' }, context);
    await crud.updateTask(task.id, { deadline: '2026-12-01' }, context);
    await crud.updateTask(task.id, { title: 'Novo título' }, context);
    await crud.updateTask(task.id, { responsibleUserId: successor.id }, context);

    expect(await prisma.notification.count()).toBe(0);
    expect(
      await prisma.taskHistoryEntry.count({ where: { taskId: task.id } })
    ).toBeGreaterThanOrEqual(3);
  });

  it('NT-S-07 trocar o responsável e mover → só o novo recebe', async () => {
    const project = await createProject(prisma);
    const actor = await person(project.id, { role: 'MANAGER' });
    const [before, after] = [await person(project.id), await person(project.id)];
    const task = await createTask(prisma, project.id, { responsibleUserId: before.id });

    await crud.updateTask(task.id, { responsibleUserId: after.id }, { actorUserId: actor.id });
    await move(task, 'EM_ANDAMENTO', actor);

    const rows = await prisma.notification.findMany();
    expect(rows.map((row) => row.recipientUserId)).toEqual([after.id]);
  });

  it('NT-S-08 título de 191 caracteres com emoji na fronteira é copiado inteiro e não muda com a renomeação', async () => {
    const project = await createProject(prisma);
    const actor = await person(project.id, { role: 'MANAGER' });
    const responsible = await person(project.id);
    const title = `${'a'.repeat(189)}😀b`;
    const task = await createTask(prisma, project.id, { title, responsibleUserId: responsible.id });

    await move(task, 'EM_ANDAMENTO', actor);
    await crud.updateTask(task.id, { title: 'Renomeada' }, { actorUserId: actor.id });

    const [row] = await prisma.notification.findMany();
    expect(Array.from(title)).toHaveLength(191);
    expect(row.taskTitle).toBe(title);
    const [dto] = (await service.list(responsible.id, { status: 'ALL' })).notifications;
    expect(dto.task.title).toBe(title);
  });

  it('NT-S-09 VIEWER responsável recebe a notificação', async () => {
    const project = await createProject(prisma);
    const actor = await person(project.id, { role: 'MANAGER' });
    const viewer = await person(project.id, { role: 'VIEWER' });
    const task = await crud.createTask(
      project.id,
      { title: 'Tarefa do VIEWER', responsibleUserId: viewer.id },
      { actorUserId: actor.id }
    );

    await move(task, 'EM_ANDAMENTO', actor);

    expect(await prisma.notification.count({ where: { recipientUserId: viewer.id } })).toBe(1);
  });

  it('NT-S-10 ator anonimizado aparece pseudonimizado; ator ausente vira null', async () => {
    const project = await createProject(prisma);
    await person(project.id, { role: 'OWNER' });
    const actor = await person(project.id, { role: 'MANAGER' });
    const other = await person(project.id, { role: 'MANAGER' });
    const responsible = await person(project.id);
    const first = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
    const second = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
    await move(first, 'EM_ANDAMENTO', actor);
    await move(second, 'EM_ANDAMENTO', other);
    await prisma.privacyRequest.create({
      data: {
        userId: actor.id,
        type: 'ACCOUNT_DELETION',
        scheduledFor: new Date(Date.now() - 1000)
      }
    });

    await privacyService.processDueDeletions({ dryRun: false });
    await prisma.notification.updateMany({
      where: { taskId: second.id },
      data: { actorUserId: null }
    });

    const list = (await service.list(responsible.id, { status: 'ALL' })).notifications;
    const byTask = Object.fromEntries(list.map((item) => [item.task.id, item.context.actor]));
    expect(byTask[first.id].id).toBe(actor.id);
    expect(byTask[first.id].name).not.toBe(actor.name);
    expect(byTask[second.id]).toBeNull();
  });

  it('NT-S-11 tarefa excluída mantém a notificação sem link e com o título copiado', async () => {
    const project = await createProject(prisma);
    const actor = await person(project.id, { role: 'OWNER' });
    const responsible = await person(project.id);
    const task = await createTask(prisma, project.id, {
      title: 'Tarefa que será excluída',
      responsibleUserId: responsible.id
    });
    await move(task, 'EM_ANDAMENTO', actor);

    await crud.deleteTask(task.id, { actorUserId: actor.id });

    const [dto] = (await service.list(responsible.id, { status: 'ALL' })).notifications;
    expect(dto.task).toEqual({
      id: null,
      code: null,
      title: 'Tarefa que será excluída',
      available: false
    });
    expect(dto.link).toBeNull();
  });

  it('NT-S-12 falha antes da notificação (auditoria) desfaz movimento, histórico e status', async () => {
    const project = await createProject(prisma);
    const actor = await person(project.id, { role: 'MANAGER' });
    const responsible = await person(project.id);
    const task = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
    vi.spyOn(audit, 'create').mockRejectedValueOnce(new Error('falha injetada na auditoria'));

    await expect(move(task, 'EM_ANDAMENTO', actor)).rejects.toThrow();

    expect((await prisma.task.findUnique({ where: { id: task.id } })).status).toBe('A_FAZER');
    expect(await prisma.taskMovement.count()).toBe(0);
    expect(await prisma.taskHistoryEntry.count({ where: { taskId: task.id } })).toBe(0);
    expect(await prisma.notification.count()).toBe(0);
  });
});

const ZONE_CUTOFFS = [
  ['America/Sao_Paulo', '2026-10-10', '2026-10-11T03:00:00.000Z'],
  ['UTC', '2026-10-10', '2026-10-11T00:00:00.000Z'],
  ['Asia/Tokyo', '2026-10-10', '2026-10-10T15:00:00.000Z'],
  ['America/New_York', '2026-10-10', '2026-10-11T04:00:00.000Z'],
  ['Europe/Lisbon', '2026-10-10', '2026-10-10T23:00:00.000Z'],
  ['Pacific/Kiritimati', '2026-10-10', '2026-10-10T10:00:00.000Z'],
  ['Pacific/Pago_Pago', '2026-10-10', '2026-10-11T11:00:00.000Z']
];

const DST_CUTOFFS = [
  ['America/New_York', '2026-03-07', '2026-03-08T05:00:00.000Z'],
  ['America/New_York', '2026-03-08', '2026-03-09T04:00:00.000Z'],
  ['America/New_York', '2026-10-31', '2026-11-01T04:00:00.000Z'],
  ['America/New_York', '2026-11-01', '2026-11-02T05:00:00.000Z'],
  ['Europe/Lisbon', '2026-03-28', '2026-03-29T00:00:00.000Z'],
  ['Europe/Lisbon', '2026-03-29', '2026-03-29T23:00:00.000Z'],
  ['Europe/Lisbon', '2026-10-24', '2026-10-24T23:00:00.000Z'],
  ['Europe/Lisbon', '2026-10-25', '2026-10-26T00:00:00.000Z'],
  ['America/Sao_Paulo', '2018-11-03', '2018-11-04T03:00:00.000Z'],
  ['America/Sao_Paulo', '2019-02-16', '2019-02-17T03:00:00.000Z']
];

async function overdueScenario(dueDate) {
  const project = await createProject(prisma);
  const responsible = await person(project.id);
  const task = await createTask(prisma, project.id, {
    responsibleUserId: responsible.id,
    deadline: new Date(`${dueDate}T00:00:00.000Z`)
  });
  return { project, responsible, task };
}

describe('S2-02 bateria de integração — corte, fuso e janela pelo job (bloco P)', () => {
  it.each([...ZONE_CUTOFFS, ...DST_CUTOFFS])(
    'NT-P-01/02 %s, prazo %s: vence exatamente em %s e não 1 ms antes',
    async (timeZone, dueDate, cutoff) => {
      const { project } = await overdueScenario(dueDate);
      const before = await job({
        projectId: project.id,
        timeZone,
        now: new Date(Date.parse(cutoff) - 1)
      });
      const exact = await job({ projectId: project.id, timeZone, now: at(cutoff) });

      expect(before.scanned).toBe(0);
      expect(exact).toMatchObject({ eligible: 1, created: 1 });
      const [row] = await prisma.notification.findMany({ where: { projectId: project.id } });
      expect(row.dueDate.toISOString().slice(0, 10)).toBe(dueDate);
    }
  );

  it('NT-P-03 o job dá o mesmo resultado com TZ=UTC, Asia/Tokyo e America/Sao_Paulo no processo', () => {
    const module = pathToFileURL(join(SRC, 'modules/notifications/notification.service.js')).href;
    const code = `
      const { createNotificationService } = await import(${JSON.stringify(module)});
      const inserted = [];
      const tasks = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, title: 't' + i, status: 'A_FAZER', responsibleUserId: 7, deadline: new Date(Date.UTC(2026, 9, 1 + i, i % 24, 30)) }));
      const repository = {
        listActiveProjectIds: async () => [1],
        findOverdueCandidates: async (_p, { from, to }) => tasks.filter((t) => t.deadline >= from && t.deadline < to),
        countOutsideWindow: async (_p, before) => tasks.filter((t) => t.deadline < before).length,
        activeMemberIds: async () => new Set([7]),
        disabledRecipientIds: async () => new Set(),
        existingOverdueKeys: async () => new Set(),
        insertOverdue: async (rows) => { inserted.push(...rows.map((r) => [r.dedupeKey, r.dueDate.toISOString()])); return rows.length; }
      };
      const silent = { info() {}, warn() {}, error() {} };
      const job = createNotificationService({ repository, log: silent, configuration: {} });
      const out = [];
      for (const now of ['2026-10-12T02:59:59.999Z', '2026-10-12T03:00:00.000Z', '2026-10-20T12:00:00.000Z', '2026-11-05T00:00:00.000Z']) {
        const { durationMs, ...report } = await job.notifyOverdueTasks({ now: new Date(now), timeZone: 'America/Sao_Paulo', lookbackDays: 7, dryRun: false });
        out.push(report);
      }
      process.stdout.write(JSON.stringify({ out, inserted }));
    `;
    const results = ['UTC', 'Asia/Tokyo', 'America/Sao_Paulo'].map((TZ) => {
      const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
        env: { ...process.env, TZ },
        encoding: 'utf8'
      });
      expect(run.status, run.stderr).toBe(0);
      return run.stdout;
    });

    expect(results[1]).toBe(results[0]);
    expect(results[2]).toBe(results[0]);
    expect(JSON.parse(results[0]).inserted.length).toBeGreaterThan(0);
  });

  it('NT-P-04 janela: corte exatamente em now − 7 d entra; 1 ms depois sai como OUTSIDE_WINDOW', async () => {
    const inside = await overdueScenario('2026-10-10');
    const outside = await overdueScenario('2026-10-10');
    const cutoff = Date.parse('2026-10-11T03:00:00.000Z');

    const edge = await job({ projectId: inside.project.id, now: new Date(cutoff + 7 * DAY) });
    const late = await job({ projectId: outside.project.id, now: new Date(cutoff + 7 * DAY + 1) });

    expect(edge).toMatchObject({ created: 1, excluded: { OUTSIDE_WINDOW: 0 } });
    expect(late).toMatchObject({ created: 0, excluded: { OUTSIDE_WINDOW: 1 } });
  });

  it('NT-P-05/H6 prazo enviado com hora e fuso vira a data UTC, como a regra publicada diz', async () => {
    const project = await createProject(prisma);
    const actor = await person(project.id, { role: 'MANAGER' });
    const responsible = await person(project.id);
    const task = await crud.createTask(
      project.id,
      {
        title: 'Prazo com hora',
        deadline: '2026-10-10T22:30:00-03:00',
        responsibleUserId: responsible.id
      },
      { actorUserId: actor.id }
    );

    const early = await job({ projectId: project.id, now: at('2026-10-11T03:00:00.000Z') });
    const late = await job({ projectId: project.id, now: at('2026-10-12T03:00:00.000Z') });

    const stored = await prisma.task.findUnique({ where: { id: task.id } });
    expect(stored.deadline.toISOString()).toBe('2026-10-11T01:30:00.000Z');
    expect(early.created).toBe(0);
    expect(late.created).toBe(1);
    const [row] = await prisma.notification.findMany();
    expect(row.dueDate.toISOString().slice(0, 10)).toBe('2026-10-11');
  });

  it('NT-P-06 adiar, antecipar, remover e restaurar o prazo', async () => {
    const { project, task } = await overdueScenario('2026-10-15');
    const run = (now) => job({ projectId: project.id, now: at(now) });

    expect((await run('2026-10-14T12:00:00.000Z')).created).toBe(0);
    await prisma.task.update({
      where: { id: task.id },
      data: { deadline: at('2026-10-20T00:00:00.000Z') }
    });
    expect((await run('2026-10-16T12:00:00.000Z')).created).toBe(0);
    await prisma.task.update({
      where: { id: task.id },
      data: { deadline: at('2026-10-12T00:00:00.000Z') }
    });
    expect((await run('2026-10-16T12:00:00.000Z')).created).toBe(1);
    await prisma.task.update({ where: { id: task.id }, data: { deadline: null } });
    expect((await run('2026-10-16T13:00:00.000Z')).scanned).toBe(0);
    await prisma.task.update({
      where: { id: task.id },
      data: { deadline: at('2026-10-12T00:00:00.000Z') }
    });
    expect(await run('2026-10-16T14:00:00.000Z')).toMatchObject({ created: 0, alreadyNotified: 1 });

    expect((await prisma.notification.findMany()).map((row) => row.dedupeKey)).toEqual([
      `TASK_OVERDUE:${task.id}:2026-10-12`
    ]);
  });

  it('NT-P-07 concluída antes do corte não vence; concluída depois de notificada mantém a notificação', async () => {
    const before = await overdueScenario('2026-10-10');
    const after = await overdueScenario('2026-10-10');
    await prisma.task.update({ where: { id: before.task.id }, data: { status: 'CONCLUIDO' } });

    await job({ now: at('2026-10-11T03:00:00.000Z') });
    await prisma.task.update({ where: { id: after.task.id }, data: { status: 'CONCLUIDO' } });
    await job({ now: at('2026-10-11T04:00:00.000Z') });

    const rows = await prisma.notification.findMany();
    expect(rows.map((row) => row.taskId)).toEqual([after.task.id]);
  });

  it('NT-P-08 prazo de hoje às 23:59:59,999 locais ainda não vence', async () => {
    const { project } = await overdueScenario('2026-10-10');
    const report = await job({ projectId: project.id, now: at('2026-10-11T02:59:59.999Z') });
    expect(report).toMatchObject({ scanned: 0, eligible: 0 });
  });

  it('NT-P-09 ordem das exclusões no job, provada por pares', async () => {
    const project = await createProject(prisma);
    const inactive = await person(project.id, { isActive: false });
    await prefer(inactive.id, 'TASK_OVERDUE', false);
    const now = at('2026-10-20T12:00:00.000Z');
    await createTask(prisma, project.id, { deadline: at('2026-10-01T00:00:00.000Z') });
    await createTask(prisma, project.id, { deadline: at('2026-10-15T00:00:00.000Z') });
    await createTask(prisma, project.id, {
      responsibleUserId: inactive.id,
      deadline: at('2026-10-15T00:00:00.000Z')
    });

    const report = await job({ projectId: project.id, now });

    expect(report.excluded).toEqual({
      OUTSIDE_WINDOW: 1,
      NO_RESPONSIBLE: 1,
      INACTIVE_MEMBER: 1,
      PREFERENCE_OFF: 0
    });
  });
});

describe('S2-02 bateria de integração — job (bloco J)', () => {
  it('NT-J-01 dry-run não grava e o apply repetido não cria nada', async () => {
    const { project } = await overdueScenario('2026-10-15');
    const now = at('2026-10-20T12:00:00.000Z');

    const dry = await job({ projectId: project.id, now, dryRun: true });
    const rowsAfterDry = await prisma.notification.count();
    const apply = await job({ projectId: project.id, now });
    const again = await job({ projectId: project.id, now });

    expect(dry).toMatchObject({ dryRun: true, eligible: 1, created: 0, wouldCreate: 1 });
    expect(rowsAfterDry).toBe(0);
    expect(apply).toMatchObject({ created: 1, alreadyNotified: 0 });
    expect(again).toMatchObject({ created: 0, alreadyNotified: 1 });
  });

  it('NT-J-04 falha de um projeto (repository real) não impede o outro', async () => {
    const ok = await overdueScenario('2026-10-15');
    const broken = await overdueScenario('2026-10-15');
    const original = notifications.findOverdueCandidates.bind(notifications);
    vi.spyOn(notifications, 'findOverdueCandidates').mockImplementation((projectId, range) => {
      if (projectId === broken.project.id) {
        const error = new Error('Lock wait timeout exceeded');
        error.code = 'P2034';
        return Promise.reject(error);
      }
      return original(projectId, range);
    });

    const report = await job({ now: at('2026-10-20T12:00:00.000Z') });

    expect(report).toMatchObject({ projects: 2, failed: 1, created: 1 });
    expect(await prisma.notification.count({ where: { projectId: ok.project.id } })).toBe(1);
  });

  it('NT-J-05 a saída tem exatamente os campos documentados', async () => {
    await overdueScenario('2026-10-15');
    const now = at('2026-10-20T12:00:00.000Z');
    const common = [
      'alreadyNotified',
      'created',
      'dryRun',
      'durationMs',
      'eligible',
      'excluded',
      'failed',
      'lookbackDays',
      'projects',
      'scanned',
      'timeZone',
      'updated'
    ];

    const dry = await job({ now, dryRun: true });
    const apply = await job({ now });

    expect(Object.keys(dry).sort()).toEqual([...common, 'wouldCreate'].sort());
    expect(Object.keys(apply).sort()).toEqual(common);
    expect(Object.keys(apply.excluded).sort()).toEqual([
      'INACTIVE_MEMBER',
      'NO_RESPONSIBLE',
      'OUTSIDE_WINDOW',
      'PREFERENCE_OFF'
    ]);
    expect(apply.updated).toBe('NOT_APPLICABLE');
  });

  it('NT-J-06 log do job sem título, nome nem e-mail, com fuso e instante em UTC', async () => {
    const project = await createProject(prisma);
    const responsible = await person(project.id);
    await createTask(prisma, project.id, {
      title: 'Linha forjada\r\n{"level":"error","message":"forjado"}',
      responsibleUserId: responsible.id,
      deadline: at('2026-10-15T00:00:00.000Z')
    });
    const calls = [];
    const log = {
      info: (message, context) => calls.push(['info', message, context]),
      warn: (message, context) => calls.push(['warn', message, context]),
      error: (message, context) => calls.push(['error', message, context])
    };

    await createNotificationService({ log }).notifyOverdueTasks({
      now: at('2026-10-20T12:00:00.000Z'),
      timeZone: 'America/Sao_Paulo',
      lookbackDays: 7,
      dryRun: false
    });

    const text = JSON.stringify(calls);
    for (const forbidden of ['forjado', 'Linha forjada', responsible.name, responsible.email])
      expect(text).not.toContain(forbidden);
    expect(calls[0][2]).toMatchObject({
      event: 'notifications_due_started',
      timeZone: 'America/Sao_Paulo',
      now: '2026-10-20T12:00:00.000Z'
    });
    expect(calls.at(-1)[2]).toMatchObject({ event: 'notifications_due_completed', created: 1 });
  });

  it('NT-J-07 projeto excluído fica fora e restaurado volta a entrar', async () => {
    const { project } = await overdueScenario('2026-10-15');
    const now = at('2026-10-20T12:00:00.000Z');
    await prisma.project.update({ where: { id: project.id }, data: { deletedAt: now } });

    const hidden = await job({ now });
    await prisma.project.update({ where: { id: project.id }, data: { deletedAt: null } });
    const restored = await job({ now });

    expect(hidden.projects).toBe(0);
    expect(restored).toMatchObject({ projects: 1, created: 1 });
  });

  it('NT-J-09/H16 --project-id inexistente termina sem varrer nada', async () => {
    const writes = [];
    const code = await runOverdueNotifications({
      args: ['--apply', '--project-id=2147483000'],
      service,
      databaseUrl: env.databaseUrl,
      write: (text) => writes.push(text),
      writeError: (text) => writes.push(text)
    });

    expect(JSON.parse(writes[0])).toMatchObject({ projects: 0, failed: 0 });
    expect(code).toBe(0);
  });
});

describe('S2-02 bateria de integração — concorrência e massa (bloco K)', () => {
  it('NT-K-01 20 movimentos simultâneos de tarefas diferentes → 20 notificações distintas', async () => {
    const project = await createProject(prisma);
    const actor = await person(project.id, { role: 'MANAGER' });
    const responsible = await person(project.id);
    const tasks = [];
    for (let index = 0; index < 20; index += 1)
      tasks.push(await createTask(prisma, project.id, { responsibleUserId: responsible.id }));

    const results = await Promise.allSettled(
      tasks.map((task) => move(task, 'EM_ANDAMENTO', actor))
    );

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(20);
    const keys = (await prisma.notification.findMany()).map((row) => row.dedupeKey);
    expect(new Set(keys).size).toBe(20);
  });

  it('NT-K-02 100 movimentos seguidos ("em massa") → 100 notificações', async () => {
    const project = await createProject(prisma);
    const actor = await person(project.id, { role: 'MANAGER' });
    const responsible = await person(project.id);
    const tasks = [];
    for (let index = 0; index < 100; index += 1)
      tasks.push(await createTask(prisma, project.id, { responsibleUserId: responsible.id }));

    for (const task of tasks) await move(task, 'EM_ANDAMENTO', actor);

    expect(await prisma.notification.count({ where: { recipientUserId: responsible.id } })).toBe(
      100
    );
  }, 120000);

  it('NT-K-04 job simultâneo a movimentos e à troca de responsável → sem duplicata e o novo responsável recebe', async () => {
    const project = await createProject(prisma);
    const actor = await person(project.id, { role: 'MANAGER' });
    const [first, second] = [await person(project.id), await person(project.id)];
    const overdue = await createTask(prisma, project.id, {
      responsibleUserId: first.id,
      deadline: at('2026-10-15T00:00:00.000Z')
    });
    const moving = [];
    for (let index = 0; index < 5; index += 1)
      moving.push(await createTask(prisma, project.id, { responsibleUserId: second.id }));
    const now = at('2026-10-20T12:00:00.000Z');

    await Promise.all([
      job({ now }),
      job({ now }),
      crud.updateTask(overdue.id, { responsibleUserId: second.id }, { actorUserId: actor.id }),
      ...moving.map((task) => move(task, 'EM_ANDAMENTO', actor))
    ]);
    await job({ now });

    const rows = await prisma.notification.findMany();
    const pairs = rows.map((row) => `${row.recipientUserId}|${row.dedupeKey}`);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(
      rows.filter((row) => row.type === 'TASK_OVERDUE' && row.recipientUserId === second.id)
    ).toHaveLength(1);
    expect(rows.filter((row) => row.type === 'TASK_STATUS_CHANGED')).toHaveLength(5);
  });

  it('NT-K-05 marcar todas simultâneo à criação: contador coerente e nenhuma leitura anterior à criação', async () => {
    const project = await createProject(prisma);
    const actor = await person(project.id, { role: 'MANAGER' });
    const responsible = await person(project.id);
    for (let round = 0; round < 10; round += 1) {
      const task = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
      await Promise.all([service.markAllRead(responsible.id), move(task, 'EM_ANDAMENTO', actor)]);
    }

    const rows = await prisma.notification.findMany({ where: { recipientUserId: responsible.id } });
    expect(rows).toHaveLength(10);
    expect(rows.every((row) => !row.readAt || row.readAt >= row.createdAt)).toBe(true);
    expect((await service.unreadCount(responsible.id)).unreadCount).toBe(
      rows.filter((row) => !row.readAt).length
    );
  });

  it('NT-K-06 marcar lida e não lida ao mesmo tempo termina num estado válido', async () => {
    const project = await createProject(prisma);
    const owner = await person(project.id);
    const row = await prisma.notification.create({
      data: {
        recipientUserId: owner.id,
        projectId: project.id,
        type: 'TASK_OVERDUE',
        dedupeKey: 'TASK_OVERDUE:1:2026-10-10',
        taskTitle: 'Concorrência de leitura',
        dueDate: at('2026-10-10T00:00:00.000Z')
      }
    });

    for (let round = 0; round < 10; round += 1)
      await Promise.all([
        service.markRead(owner.id, row.id, true),
        service.markRead(owner.id, row.id, false)
      ]);

    const final = await prisma.notification.findUnique({ where: { id: row.id } });
    expect(final.readAt === null || final.readAt instanceof Date).toBe(true);
  });

  it('NT-K-07 três jobs simultâneos não duplicam', async () => {
    await overdueScenario('2026-10-15');
    const now = at('2026-10-20T12:00:00.000Z');

    const reports = await Promise.all([job({ now }), job({ now }), job({ now })]);

    expect(reports.reduce((sum, report) => sum + report.created, 0)).toBe(1);
    expect(await prisma.notification.count()).toBe(1);
  });
});

describe('S2-02 bateria de integração — privacidade e ciclo de vida (bloco D)', () => {
  it('NT-D-03 retenção: −180 d −1 ms sai, −180 d fica, e a auditoria soma as notificações', async () => {
    const project = await createProject(prisma);
    const owner = await person(project.id);
    const now = at('2026-10-20T12:00:00.000Z');
    const make = (createdAt, key) =>
      prisma.notification.create({
        data: {
          recipientUserId: owner.id,
          projectId: project.id,
          type: 'TASK_OVERDUE',
          dedupeKey: key,
          taskTitle: key,
          createdAt
        }
      });
    const gone = await make(new Date(now.getTime() - 180 * DAY - 1), 'a');
    const kept = await make(new Date(now.getTime() - 180 * DAY), 'b');

    const result = await runPrivacyRetention({
      apply: true,
      now,
      configuration: { ...env, notificationRetentionDays: 180 }
    });

    expect(result.counts.notifications).toBe(1);
    expect(await prisma.notification.findUnique({ where: { id: gone.id } })).toBeNull();
    expect(await prisma.notification.findUnique({ where: { id: kept.id } })).not.toBeNull();
    const [event] = await prisma.auditEvent.findMany({
      where: { action: 'RETENTION_CLEANUP_EXECUTED' }
    });
    expect(event.metadataJson.count).toBe(
      Object.values(result.counts).reduce((sum, count) => sum + count, 0)
    );
  });

  it('NT-D-04 exclusão recuperável oculta e a restauração exibe de novo', async () => {
    const project = await createProject(prisma);
    const actor = await person(project.id, { role: 'MANAGER' });
    const responsible = await person(project.id);
    const task = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
    await move(task, 'EM_ANDAMENTO', actor);

    await prisma.project.update({ where: { id: project.id }, data: { deletedAt: new Date() } });
    const hidden = await service.list(responsible.id, { status: 'ALL' });
    await prisma.project.update({ where: { id: project.id }, data: { deletedAt: null } });
    const shown = await service.list(responsible.id, { status: 'ALL' });

    expect(hidden.notifications).toHaveLength(0);
    expect(hidden.unreadCount).toBe(0);
    expect(shown.notifications).toHaveLength(1);
  });
});

describe('S2-02 bateria de integração — métrica oficial (bloco M)', () => {
  it('NT-M-01 cobertura do RF30 recalculada do banco, sem depender do código de criação', async () => {
    const project = await createProject(prisma);
    const actor = await person(project.id, { role: 'MANAGER' });
    const responsible = await person(project.id);
    const inactive = await person(project.id, { isActive: false });
    const optedOut = await person(project.id);
    await prefer(optedOut.id, 'TASK_STATUS_CHANGED', false);
    const plan = [
      [responsible, actor],
      [responsible, actor],
      [responsible, actor],
      [null, actor],
      [inactive, actor],
      [responsible, responsible],
      [optedOut, actor]
    ];
    for (const [owner, who] of plan) {
      const task = await createTask(prisma, project.id, { responsibleUserId: owner?.id ?? null });
      await move(task, 'EM_ANDAMENTO', who);
    }

    const movements = await prisma.taskMovement.findMany({ include: { task: true } });
    const members = new Set(
      (
        await prisma.projectMembership.findMany({
          where: { projectId: project.id, isActive: true }
        })
      ).map((row) => row.userId)
    );
    const off = new Set(
      (await prisma.notificationPreference.findMany({ where: { enabled: false } })).map(
        (row) => row.userId
      )
    );
    const eligible = movements.filter(
      (movement) =>
        movement.task.responsibleUserId &&
        movement.task.responsibleUserId !== movement.movedByUserId &&
        members.has(movement.task.responsibleUserId) &&
        !off.has(movement.task.responsibleUserId)
    );
    const rows = await prisma.notification.findMany();
    const delivered = eligible.filter((movement) =>
      rows.some(
        (row) =>
          row.dedupeKey === `TASK_STATUS_CHANGED:movement:${movement.id}` &&
          row.recipientUserId === movement.task.responsibleUserId &&
          row.actorUserId === movement.movedByUserId
      )
    );

    expect(movements).toHaveLength(7);
    expect(eligible).toHaveLength(3);
    expect(delivered).toHaveLength(3);
    expect(rows).toHaveLength(3);
  });

  it('NT-M-02 a saída do job do RF59 bate com as linhas gravadas', async () => {
    const project = await createProject(prisma);
    const responsible = await person(project.id);
    for (const day of ['13', '15', '19'])
      await createTask(prisma, project.id, {
        responsibleUserId: responsible.id,
        deadline: at(`2026-10-${day}T00:00:00.000Z`)
      });
    await createTask(prisma, project.id, { deadline: at('2026-10-15T00:00:00.000Z') });

    const report = await job({ projectId: project.id, now: at('2026-10-20T12:00:00.000Z') });

    expect(report.eligible).toBe(report.created + report.alreadyNotified);
    expect(report.created).toBe(
      await prisma.notification.count({ where: { type: 'TASK_OVERDUE' } })
    );
    expect(report.scanned).toBe(report.eligible + report.excluded.NO_RESPONSIBLE);
  });

  it('NT-M-03/H2 contagens por execução: um único evento aparece em várias execuções', async () => {
    const { project } = await overdueScenario('2026-10-10');
    const cutoff = Date.parse('2026-10-11T03:00:00.000Z');
    const runs = [];
    for (let hour = 0; hour <= 10 * 24; hour += 6)
      runs.push(await job({ projectId: project.id, now: new Date(cutoff + hour * 3600_000) }));

    const sum = (field) => runs.reduce((total, run) => total + run[field], 0);
    const outside = runs.reduce((total, run) => total + run.excluded.OUTSIDE_WINDOW, 0);

    expect(sum('created')).toBe(1);
    expect(sum('eligible')).toBe(29);
    expect(outside).toBe(12);
  });
});

describe('S2-02 bateria de integração — orçamento de desempenho (⚑5)', () => {
  async function bulkTasks(projectId, responsibleUserId, count) {
    const rows = Array.from({ length: count }, (_, index) => ({
      projectId,
      title: `Carga ${index}`,
      priority: 'MEDIA',
      status: ['A_FAZER', 'EM_ANDAMENTO', 'CONCLUIDO'][index % 3],
      responsibleUserId: index % 7 === 0 ? null : responsibleUserId,
      deadline: new Date(Date.UTC(2026, 8, 1 + (index % 60)))
    }));
    for (let start = 0; start < rows.length; start += 1000)
      await prisma.task.createMany({ data: rows.slice(start, start + 1000) });
  }

  it('NT-J-08 job ≤ 1 s por 10.000 tarefas num projeto (10.000 e 50.000)', async () => {
    const timings = {};
    for (const count of [10000, 50000]) {
      const project = await createProject(prisma);
      const responsible = await person(project.id);
      await bulkTasks(project.id, responsible.id, count);
      const started = performance.now();
      await job({ projectId: project.id, now: at('2026-10-20T12:00:00.000Z') });
      timings[count] = performance.now() - started;
    }

    expect(timings[10000]).toBeLessThanOrEqual(1000);
    expect(timings[50000]).toBeLessThanOrEqual(5000);
  }, 300000);

  it('NT-J-08 lista e contador ≤ 300 ms com 1.000 notificações do usuário', async () => {
    const project = await createProject(prisma);
    const owner = await person(project.id);
    const rows = Array.from({ length: 1000 }, (_, index) => ({
      recipientUserId: owner.id,
      projectId: project.id,
      type: 'TASK_OVERDUE',
      dedupeKey: `TASK_OVERDUE:${index}:2026-10-10`,
      taskTitle: `Carga ${index}`,
      readAt: index % 2 ? new Date() : null
    }));
    await prisma.notification.createMany({ data: rows });

    const timings = [];
    for (const call of [
      () => service.list(owner.id, { status: 'ALL', page: 1, limit: 20 }),
      () => service.list(owner.id, { status: 'UNREAD', page: 25, limit: 20 }),
      () => service.unreadCount(owner.id)
    ]) {
      await call();
      const started = performance.now();
      await call();
      timings.push(performance.now() - started);
    }

    expect(Math.max(...timings)).toBeLessThanOrEqual(300);
  }, 120000);
});
