import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { validateTestDatabaseUrl } from './lib/database-safety.js';

dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: false, quiet: true });
dotenv.config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });

const migrations = [
  '20260925120000_s2_p5_1_sprint_burnup_history',
  '20260925123000_s2_p5_1_burnup_project_scope'
];
const sourceUrl = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
const sourceName = new URL(sourceUrl).pathname.slice(1);
const disposableName = `${sourceName}_s2_p5_1_upgrade_validation`;
if (!/^[a-zA-Z0-9_]+_test_s2_p5_1_upgrade_validation$/.test(disposableName)) {
  throw new Error('Nome do schema descartável P5.1 recusado.');
}
const target = new URL(sourceUrl);
target.pathname = `/${disposableName}`;
const admin = new PrismaClient({ datasourceUrl: sourceUrl });
const root = mkdtempSync(join(tmpdir(), 'traceflow-s2-p5-1-'));
const prismaDirectory = join(root, 'prisma');
const migrationDirectory = join(prismaDirectory, 'migrations');
const schemaPath = join(prismaDirectory, 'schema.prisma');
const sourcePrisma = resolve(process.cwd(), 'prisma');
const prismaEntry = resolve(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
let created = false;

function deploy() {
  const result = spawnSync(
    process.execPath,
    [prismaEntry, 'migrate', 'deploy', '--schema', schemaPath],
    {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: target.toString() },
      encoding: 'utf8'
    }
  );
  if (result.status !== 0) throw new Error(`Deploy P5.1 falhou: ${result.stderr || result.stdout}`);
}

async function seed(client) {
  await client.$executeRawUnsafe(
    "INSERT INTO Project (name,responsibleTeam,accessCode,createdAt,updatedAt) VALUES ('P5.1 fixture','Equipe','P51-UPGRADE',NOW(3),NOW(3))"
  );
  const [{ id: projectId }] = await client.$queryRawUnsafe(
    "SELECT id FROM Project WHERE accessCode='P51-UPGRADE'"
  );
  await client.$executeRawUnsafe(
    "INSERT INTO Sprint (projectId,name,startDate,endDate,status,startedAt,planningSnapshotAt,createdAt,updatedAt) VALUES (?, 'Ativa', DATE_SUB(NOW(3), INTERVAL 2 DAY), DATE_ADD(NOW(3), INTERVAL 5 DAY), 'EM_ANDAMENTO', DATE_SUB(NOW(3), INTERVAL 2 DAY), DATE_SUB(NOW(3), INTERVAL 2 DAY), NOW(3), NOW(3))",
    projectId
  );
  await client.$executeRawUnsafe(
    "INSERT INTO Sprint (projectId,name,startDate,endDate,status,startedAt,planningSnapshotAt,closedAt,createdAt,updatedAt) VALUES (?, 'Antiga', DATE_SUB(NOW(3), INTERVAL 12 DAY), DATE_SUB(NOW(3), INTERVAL 5 DAY), 'CONCLUIDA', DATE_SUB(NOW(3), INTERVAL 12 DAY), DATE_SUB(NOW(3), INTERVAL 12 DAY), DATE_SUB(NOW(3), INTERVAL 5 DAY), NOW(3), NOW(3))",
    projectId
  );
  const sprints = await client.$queryRawUnsafe(
    'SELECT id,name FROM Sprint WHERE projectId = ? ORDER BY id',
    projectId
  );
  await client.$executeRawUnsafe(
    "INSERT INTO Task (projectId,title,status,estimatedEffort,createdAt,updatedAt) VALUES (?, 'Task preservada','CONCLUIDO',5,NOW(3),NOW(3))",
    projectId
  );
  const [{ id: taskId }] = await client.$queryRawUnsafe(
    "SELECT id FROM Task WHERE projectId = ? AND title = 'Task preservada'",
    projectId
  );
  for (const sprint of sprints) {
    await client.$executeRawUnsafe(
      'INSERT INTO SprintTask (projectId,sprintId,taskId,taskTitleSnapshot,addedAt,plannedAtStart,pointsAtPlanning) VALUES (?,?,?,?,NOW(3),true,5)',
      projectId,
      sprint.id,
      taskId,
      'Task preservada'
    );
  }
  await client.$executeRawUnsafe(
    "INSERT INTO TaskEffortHistoryEntry (projectId,taskId,sessionId,eventType,source,previousSeconds,newSeconds,snapshotStartedAt,occurredAt) VALUES (?, ?, 1, 'EDITED', 'MANUAL', 3600, 7200, NOW(3), NOW(3))",
    projectId,
    taskId
  );
  return { projectId, taskId, sprints };
}

try {
  const existing = await admin.$queryRawUnsafe(
    'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
    disposableName
  );
  if (existing.length)
    throw new Error('Schema descartável P5.1 já existe; remoção manual necessária.');
  await admin.$executeRawUnsafe(`CREATE DATABASE \`${disposableName}\``);
  created = true;
  mkdirSync(migrationDirectory, { recursive: true });
  cpSync(join(sourcePrisma, 'schema.prisma'), schemaPath);
  cpSync(
    join(sourcePrisma, 'migrations', 'migration_lock.toml'),
    join(migrationDirectory, 'migration_lock.toml')
  );
  for (const entry of readdirSync(join(sourcePrisma, 'migrations'), { withFileTypes: true })) {
    if (!entry.isDirectory() || migrations.includes(entry.name)) continue;
    cpSync(join(sourcePrisma, 'migrations', entry.name), join(migrationDirectory, entry.name), {
      recursive: true
    });
  }
  deploy();
  const before = new PrismaClient({ datasourceUrl: target.toString() });
  let fixture;
  try {
    fixture = await seed(before);
  } finally {
    await before.$disconnect();
  }
  for (const migration of migrations) {
    cpSync(join(sourcePrisma, 'migrations', migration), join(migrationDirectory, migration), {
      recursive: true
    });
    deploy();
  }
  const after = new PrismaClient({ datasourceUrl: target.toString() });
  try {
    const [active, old, task, effort, events] = await Promise.all([
      after.sprint.findUnique({ where: { id: fixture.sprints[0].id } }),
      after.sprint.findUnique({ where: { id: fixture.sprints[1].id } }),
      after.task.findUnique({ where: { id: fixture.taskId } }),
      after.taskEffortHistoryEntry.count({ where: { taskId: fixture.taskId } }),
      after.sprintBurnupEvent.findMany({ where: { projectId: fixture.projectId } })
    ]);
    if (
      !active?.burnupCoverageStartedAt ||
      old?.burnupCoverageStartedAt !== null ||
      task?.estimatedEffort !== 5 ||
      effort !== 1 ||
      events.length !== 1 ||
      events[0].sprintId !== active.id ||
      events[0].type !== 'BASELINE_TASK' ||
      events[0].newPoints !== 5 ||
      events[0].occurredAt.getTime() !== active.burnupCoverageStartedAt.getTime()
    )
      throw new Error('Upgrade P5.1 não preservou dados ou ancorou incorretamente a Sprint ativa.');
    const foreignProject = await after.project.create({
      data: { name: 'Outro projeto', responsibleTeam: 'Equipe', accessCode: 'P51-FOREIGN' }
    });
    let crossProjectRejected = false;
    try {
      await after.sprintBurnupEvent.create({
        data: {
          projectId: foreignProject.id,
          sprintId: active.id,
          taskKey: fixture.taskId,
          type: 'TASK_ADDED',
          newPoints: 5,
          toStatus: 'A_FAZER'
        }
      });
    } catch (error) {
      crossProjectRejected = error.code === 'P2003';
    }
    if (!crossProjectRejected) throw new Error('FK composta aceitou evento cross-project.');
    process.stdout.write(
      `${JSON.stringify({ schema: disposableName, upgrade: 'ok', activeAnchor: true, oldCoverage: null, effortPreserved: effort, events: events.length, crossProjectRejected })}\n`
    );
  } finally {
    await after.$disconnect();
  }
} finally {
  if (created) await admin.$executeRawUnsafe(`DROP DATABASE \`${disposableName}\``);
  await admin.$disconnect();
  rmSync(root, { recursive: true, force: true });
}
