import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { buildAuthorizationFixture } from './helpers/authorization-fixture.js';

let app;
let prisma;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  const { default: instance } = await import('../../src/app.js');
  app = await startTestServer(instance);
  await cleanTestDatabase(prisma);
}, 60000);

afterEach(async () => cleanTestDatabase(prisma));

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function textColumns() {
  const [{ db }] = await prisma.$queryRaw`SELECT DATABASE() AS db`;
  return prisma.$queryRaw`
    SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ${db}
      AND DATA_TYPE IN ('varchar', 'text', 'mediumtext', 'longtext', 'json')
      AND TABLE_NAME <> '_prisma_migrations'`;
}

async function occurrences(markers) {
  const hits = [];
  for (const { t, c } of await textColumns()) {
    for (const marker of markers) {
      const [{ n }] = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS n FROM \`${t}\` WHERE CAST(\`${c}\` AS CHAR) LIKE ?`,
        `%${marker}%`
      );
      if (Number(n) > 0) hits.push(`${t}.${c}: ${marker}`);
    }
  }
  return hits;
}

async function rowsOfProject(projectId, taskIds) {
  const [{ db }] = await prisma.$queryRaw`SELECT DATABASE() AS db`;
  const withProject = await prisma.$queryRaw`
    SELECT TABLE_NAME AS t FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ${db} AND COLUMN_NAME = 'projectId'`;
  const withTaskOnly = await prisma.$queryRaw`
    SELECT TABLE_NAME AS t FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ${db} AND COLUMN_NAME = 'taskId' AND TABLE_NAME NOT IN (
      SELECT TABLE_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ${db} AND COLUMN_NAME = 'projectId')`;
  const counts = {};
  for (const { t } of withProject) {
    const [{ n }] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS n FROM \`${t}\` WHERE projectId = ?`,
      projectId
    );
    if (Number(n) > 0) counts[t] = Number(n);
  }
  for (const { t } of withTaskOnly) {
    const [{ n }] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS n FROM \`${t}\` WHERE taskId IN (${taskIds.map(() => '?').join(',')})`,
      ...taskIds
    );
    if (Number(n) > 0) counts[t] = Number(n);
  }
  return counts;
}

describe('ciclo de vida de dados pessoais e de projeto', () => {
  it('H32: a anonimização tira nome, e-mail e username do titular de todo o banco', async () => {
    const { accounts, ids, project } = await buildAuthorizationFixture(app, prisma);
    const member = accounts.member;
    const execution = await member.agent
      .post(`/api/test-cases/${ids.testCase}/executions`)
      .set('X-CSRF-Token', member.csrf)
      .field(
        'payload',
        JSON.stringify({
          testCaseVersion: 1,
          environment: 'LOCAL',
          testedReference: { type: 'PULL_REQUEST', id: ids.pullRequest },
          steps: [{ position: 1, result: 'PASS', observedResult: 'Visível' }]
        })
      );
    expect(execution.status, execution.text).toBe(201);
    await member.send('PATCH', `/api/tasks/${ids.task}/move`, { toStatus: 'EM_ANDAMENTO' });
    await member.send('PUT', `/api/projects/${project.id}/indicator-preference`, {
      configurationVersion: 1,
      widgets: ['I01']
    });
    await prisma.gitHubSyncRun.create({
      data: { projectId: project.id, requestedByUserId: member.user.id, status: 'FAILED' }
    });
    const user = await prisma.user.findUnique({ where: { id: member.user.id } });
    const markers = [user.name, user.email, user.username];
    const before = (await occurrences(markers)).map((hit) => hit.toLowerCase());
    expect(before).toEqual(
      expect.arrayContaining([
        `taskmovement.movedby: ${user.name.toLowerCase()}`,
        `testexecution.executedbydisplaynamesnapshot: ${user.name.toLowerCase()}`
      ])
    );
    await prisma.privacyRequest.create({
      data: {
        userId: member.user.id,
        type: 'ACCOUNT_DELETION',
        scheduledFor: new Date(Date.now() - 1000)
      }
    });
    const { privacyService } = await import('../../src/modules/privacy/privacy.service.js');
    expect(await privacyService.processDueDeletions({ dryRun: false })).toMatchObject({
      processed: 1
    });
    expect(await occurrences(markers)).toEqual([]);
  }, 180000);

  it('H34: a exclusão definitiva do projeto não deixa linha órfã em nenhum módulo', async () => {
    const { accounts, ids, project } = await buildAuthorizationFixture(app, prisma);
    await accounts.member.send('PATCH', `/api/tasks/${ids.task}/move`, {
      toStatus: 'EM_ANDAMENTO'
    });
    await accounts.member.send('PUT', `/api/projects/${project.id}/indicator-preference`, {
      configurationVersion: 1,
      widgets: ['I01']
    });
    await prisma.notification.create({
      data: {
        recipientUserId: accounts.viewer.user.id,
        projectId: project.id,
        taskId: ids.task,
        type: 'TASK_STATUS_CHANGED',
        dedupeKey: 'conformidade-h34',
        taskTitle: 'Tarefa da varredura',
        fromStatus: 'A_FAZER',
        toStatus: 'EM_ANDAMENTO',
        actorUserId: accounts.member.user.id
      }
    });
    await prisma.gitHubSyncRun.create({
      data: { projectId: project.id, requestedByUserId: accounts.owner.user.id, status: 'FAILED' }
    });
    const taskIds = (
      await prisma.task.findMany({ where: { projectId: project.id }, select: { id: true } })
    ).map((task) => task.id);
    expect(Object.keys(await rowsOfProject(project.id, taskIds)).length).toBeGreaterThan(20);
    expect((await accounts.owner.send('DELETE', `/api/projects/${project.id}`)).status).toBe(200);
    const permanent = await accounts.owner.send('DELETE', `/api/projects/${project.id}/permanent`, {
      confirmationName: project.name
    });
    expect(permanent.status).toBe(200);
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeNull();
    expect(await rowsOfProject(project.id, taskIds)).toEqual({});
  }, 180000);
});
