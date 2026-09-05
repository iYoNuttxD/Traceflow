import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createTask } from '../fixtures/factories.js';
let prisma, service;
beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ sprintService: service } = await import('../../src/modules/sprints/sprint.service.js'));
  await cleanTestDatabase(prisma);
});
afterEach(() => cleanTestDatabase(prisma));
afterAll(() => prisma.$disconnect());
const data = (name = 'Sprint QA', startDate = '2026-10-01', endDate = '2026-10-05') => ({
  name,
  startDate,
  endDate
});
const create = (projectId, payload = data()) => service.createSprint(projectId, payload);

describe('BR-SPRINT-021 — active name uniqueness', () => {
  it('rejects active duplicates and rename collisions, reuses deleted names and preserves collation', async () => {
    const p = await createProject(prisma);
    const a = await create(p.id, data('Sprint Á'));
    await expect(create(p.id, data('sprint a', '2026-11-01', '2026-11-05'))).rejects.toMatchObject({
      code: 'SPRINT_NAME_IN_USE'
    });
    const b = await create(p.id, data('Outra', '2026-11-01', '2026-11-05'));
    await expect(service.updateSprint(b.id, { name: 'Sprint Á' })).rejects.toMatchObject({
      code: 'SPRINT_NAME_IN_USE'
    });
    await service.deleteSprint(a.id);
    const before = await prisma.sprint.findUnique({ where: { id: a.id } });
    expect(before.activeNameKey).toBeNull();
    const renamed = await service.updateSprint(b.id, { name: 'Sprint Á' });
    expect(renamed.id).toBe(b.id);
    expect((await prisma.sprint.findUnique({ where: { id: b.id } })).activeNameKey).toBe(
      'Sprint Á'
    );
    expect(await prisma.sprint.findUnique({ where: { id: a.id } })).toEqual(before);
    const otherProject = await createProject(prisma);
    expect((await create(otherProject.id, data('Sprint Á'))).name).toBe('Sprint Á');
  });

  it('five delete/recreate cycles retain six IDs, original names and exactly one current key', async () => {
    const p = await createProject(prisma);
    let current = await create(p.id);
    const historical = [];
    for (let cycle = 0; cycle < 5; cycle++) {
      await service.deleteSprint(current.id);
      historical.push(await prisma.sprint.findUnique({ where: { id: current.id } }));
      const next = await create(p.id);
      expect(next.id).not.toBe(current.id);
      current = next;
    }
    const rows = await prisma.sprint.findMany({
      where: { projectId: p.id },
      orderBy: { id: 'asc' }
    });
    expect(rows).toHaveLength(6);
    expect(rows.slice(0, 5)).toEqual(historical);
    expect(rows.every((r) => r.name === 'Sprint QA')).toBe(true);
    expect(rows.filter((r) => r.deletedAt).every((r) => r.activeNameKey === null)).toBe(true);
    expect(rows.filter((r) => !r.deletedAt)).toMatchObject([
      { id: current.id, activeNameKey: 'Sprint QA' }
    ]);
    expect((await service.findSprintsByProject(p.id)).map((s) => s.id)).toEqual([current.id]);
  });

  it('database itself rejects duplicates and refuses an explicit forged key', async () => {
    const p = await createProject(prisma);
    const original = await create(p.id);
    const row = {
      projectId: p.id,
      name: original.name,
      startDate: new Date('2026-11-01'),
      endDate: new Date('2026-11-05')
    };
    await expect(prisma.sprint.create({ data: row })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.sprint.create({ data: { ...row, activeNameKey: null } })).rejects.toThrow();
    expect(await prisma.sprint.count({ where: { projectId: p.id, deletedAt: null } })).toBe(1);
    await service.deleteSprint(original.id);
    const next = await prisma.sprint.create({ data: row });
    expect(next.activeNameKey).toBe(original.name);
  });

  it('concurrent same-name creates have one winner even with disjoint periods', async () => {
    const p = await createProject(prisma);
    const results = await Promise.allSettled([
      create(p.id),
      create(p.id, data('Sprint QA', '2026-11-01', '2026-11-05'))
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected').reason.code).toBe('SPRINT_NAME_IN_USE');
    expect(await prisma.sprint.count({ where: { projectId: p.id, deletedAt: null } })).toBe(1);
  });

  it.each(['delete-first', 'create-first'])(
    'delete/create is serializable: %s dispatch',
    async (order) => {
      const p = await createProject(prisma);
      const a = await create(p.id);
      const remove = () => service.deleteSprint(a.id);
      const insert = () => create(p.id, data('Sprint QA', '2026-11-01', '2026-11-05'));
      const actions = order === 'delete-first' ? [remove, insert] : [insert, remove];
      const results = await Promise.allSettled(actions.map((fn) => fn()));
      const deletion = results[order === 'delete-first' ? 0 : 1];
      const creation = results[order === 'delete-first' ? 1 : 0];
      expect(deletion.status).toBe('fulfilled');
      if (creation.status === 'rejected') {
        expect(creation.reason.code).toBe('SPRINT_NAME_IN_USE');
        await insert();
      }
      const rows = await prisma.sprint.findMany({ where: { projectId: p.id } });
      expect(rows).toHaveLength(2);
      expect(rows.filter((r) => r.deletedAt)).toMatchObject([
        { id: a.id, name: 'Sprint QA', activeNameKey: null }
      ]);
      expect(rows.filter((r) => !r.deletedAt)).toHaveLength(1);
    }
  );

  it('reusing a completed deleted name preserves closing snapshots and all historical pointers', async () => {
    const p = await createProject(prisma);
    const a = await create(p.id);
    const actor = await prisma.user.create({
      data: {
        name: 'History QA',
        username: 'historyreuse',
        email: 'historyreuse@example.invalid',
        passwordHash: 'x'
      }
    });
    const context = { actorUserId: actor.id };
    const task = await createTask(prisma, p.id, { estimatedEffort: 5 });
    await service.replaceTasks(a.id, [task.id], context);
    await service.updateSprintStatus(a.id, 'EM_ANDAMENTO', context);
    await service.updateSprintStatus(a.id, 'CONCLUIDA', context);
    const frozen = await prisma.sprintTask.findMany({ where: { sprintId: a.id } });
    await service.deleteSprint(a.id, context);
    const tombstone = await prisma.sprint.findUnique({ where: { id: a.id } });
    const next = await create(p.id);
    expect(next.id).not.toBe(a.id);
    expect(await prisma.sprint.findUnique({ where: { id: a.id } })).toEqual(tombstone);
    expect(await prisma.sprintTask.findMany({ where: { sprintId: a.id } })).toEqual(frozen);
    expect(await prisma.sprintTask.count({ where: { sprintId: next.id } })).toBe(0);
  });
});

const migration = readFileSync(
  new URL(
    '../../prisma/migrations/20260905030000_sprint_active_name_uniqueness/migration.sql',
    import.meta.url
  ),
  'utf8'
);
function runMigration(table) {
  const sql = migration
    .replaceAll('`Sprint`', '`' + table + '`')
    .replaceAll("TABLE_NAME = 'Sprint'", "TABLE_NAME = '" + table + "'");
  // Prisma Migrate/CLI uses the text protocol needed by MySQL PREPARE.
  return spawnSync(
    process.execPath,
    [
      resolve('node_modules/prisma/build/index.js'),
      'db',
      'execute',
      '--stdin',
      '--schema',
      'prisma/schema.prisma'
    ],
    {
      input: sql,
      encoding: 'utf8',
      env: process.env
    }
  );
}
describe('FIX-04 incremental migration with pre-migration rows', () => {
  it.each(['utf8mb4_unicode_ci', 'utf8mb4_bin'])(
    'preserves historical rows and existing collation %s',
    async (collation) => {
      const table = 'Fix04NameMigration';
      try {
        await prisma.$executeRawUnsafe(
          `CREATE TABLE \`${table}\` (id INT PRIMARY KEY, projectId INT NOT NULL, name VARCHAR(191) COLLATE ${collation} NOT NULL, deletedAt DATETIME(3) NULL, historical JSON NULL, UNIQUE KEY Sprint_projectId_name_key (projectId,name)) ENGINE=InnoDB`
        );
        await prisma.$executeRawUnsafe(
          `INSERT INTO \`${table}\` VALUES (1,1,'Sprint Á',NULL,JSON_OBJECT('id',1)),(2,1,'Deleted',NOW(3),JSON_OBJECT('id',2)),(3,1,'Deleted 2',NOW(3),JSON_OBJECT('id',3))`
        );
        const before = await prisma.$queryRawUnsafe(`SELECT * FROM \`${table}\` ORDER BY id`);
        const migrationResult = runMigration(table);
        expect(migrationResult.stderr).not.toMatch(/Error:/);
        expect(migrationResult.status).toBe(0);
        const after = await prisma.$queryRawUnsafe(
          `SELECT id,projectId,name,deletedAt,historical,activeNameKey FROM \`${table}\` ORDER BY id`
        );
        expect(
          after.map((row) =>
            Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'activeNameKey'))
          )
        ).toEqual(before);
        expect(after.map((r) => r.activeNameKey)).toEqual(['Sprint Á', null, null]);
        const cols = await prisma.$queryRawUnsafe(
          `SELECT COLUMN_NAME, COLLATION_NAME, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${table}' AND COLUMN_NAME IN ('name','activeNameKey')`
        );
        expect(cols.every((c) => c.COLLATION_NAME === collation)).toBe(true);
        expect(cols.find((c) => c.COLUMN_NAME === 'activeNameKey').EXTRA).toBe('STORED GENERATED');
        await prisma.$executeRawUnsafe(
          `INSERT INTO \`${table}\` (id,projectId,name) VALUES (4,1,'Deleted')`
        );
        await expect(
          prisma.$executeRawUnsafe(
            `INSERT INTO \`${table}\` (id,projectId,name) VALUES (5,1,'Deleted')`
          )
        ).rejects.toThrow();
      } finally {
        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${table}\``);
      }
    }
  );

  it('fails explicitly on active duplicates instead of selecting a survivor', async () => {
    const table = 'Fix04DuplicateMigration';
    try {
      await prisma.$executeRawUnsafe(
        `CREATE TABLE \`${table}\` (id INT PRIMARY KEY, projectId INT NOT NULL, name VARCHAR(191) NOT NULL, deletedAt DATETIME(3) NULL, KEY Sprint_projectId_name_key (projectId,name)) ENGINE=InnoDB`
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO \`${table}\` VALUES (1,1,'Duplicate',NULL),(2,1,'Duplicate',NULL)`
      );
      const migrationResult = runMigration(table);
      expect(migrationResult.status).not.toBe(0);
      expect(migrationResult.stderr).toContain('P2002');
      expect(migrationResult.stderr).toContain('Sprint_projectId_activeNameKey_key');
      expect(await prisma.$queryRawUnsafe(`SELECT id,name FROM \`${table}\` ORDER BY id`)).toEqual([
        { id: 1, name: 'Duplicate' },
        { id: 2, name: 'Duplicate' }
      ]);
      const cols = await prisma.$queryRawUnsafe(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${table}' AND COLUMN_NAME='activeNameKey'`
      );
      expect(cols).toHaveLength(0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${table}\``);
    }
  });
});
