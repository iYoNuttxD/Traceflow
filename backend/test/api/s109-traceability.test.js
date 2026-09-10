import { beforeAll, afterEach, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import {
  configureTestDatabaseEnvironment,
  deployTestMigrations,
  cleanTestDatabase
} from '../helpers/test-database.js';
import { startTestServer } from '../helpers/http-server.js';
import { createProject, createRequirement, createTask } from '../fixtures/factories.js';
let prisma, app, reconcileProject;
beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
  ({ reconcileProject } =
    await import('../../src/modules/traceability/requirement-reconciliation.repository.js'));
  app = await startTestServer(app);
  await cleanTestDatabase(prisma);
});
afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => prisma.$disconnect());
async function fixture(role = 'VIEWER') {
  const project = await createProject(prisma),
    other = await createProject(prisma);
  const user = await prisma.user.create({
    data: {
      name: 'Projection reader',
      username: 's109api',
      email: 's109api@example.invalid',
      emailVerifiedAt: new Date()
    }
  });
  await prisma.projectMembership.create({ data: { projectId: project.id, userId: user.id, role } });
  const token = 'artificial-s109-session';
  await prisma.session.create({
    data: {
      userId: user.id,
      sessionVersion: user.sessionVersion,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      csrfTokenHash: createHash('sha256').update('csrf').digest('hex'),
      expiresAt: new Date(Date.now() + 60000)
    }
  });
  const get = (path) => request(app).get(path).set('Cookie', `traceflow_session=${token}`);
  const a = await createRequirement(prisma, project.id, { title: 'Alpha' }),
    b = await createRequirement(prisma, project.id, { title: 'Beta' });
  await createTask(prisma, project.id, { requirementId: b.id });
  const foreign = await createRequirement(prisma, other.id);
  return {
    project,
    other,
    user,
    get,
    a,
    b,
    foreign,
    root: `/api/projects/${project.id}/traceability`
  };
}
describe('S109 authenticated projection API', () => {
  it.each(['VIEWER', 'MEMBER', 'MANAGER', 'OWNER'])(
    '%s reads without GET writes and preserves legacy contracts',
    async (role) => {
      const f = await fixture(role);
      const list = await f.get(`${f.root}/requirements`);
      expect(list.status, list.text).toBe(200);
      expect(list.body.items).toHaveLength(2);
      expect(list.body.summary.bySituation.PLANEJADO).toBe(1);
      const current = await f.get(`${f.root}/requirements/${f.b.id}/current`);
      expect(current.status, current.text).toBe(200);
      expect(current.body.situation).toBe('PLANEJADO');
      const history = await f.get(`${f.root}/requirements/${f.b.id}/history`);
      expect(history.status).toBe(200);
      expect(history.body).toEqual({ items: [], nextCursor: null });
      expect(await prisma.requirementTraceabilityState.count()).toBe(0);
      expect(await prisma.requirementTraceabilityHistoryEntry.count()).toBe(0);
      const legacy = await f.get(`${f.root}/requirements-matrix?limit=1`);
      expect(legacy.status).toBe(200);
      expect(legacy.body.summary.totalRequirements).toBe(2);
      expect(legacy.body.requirements).toHaveLength(1);
      expect(legacy.body.requirements[0]).toHaveProperty('implementationStatus');
      const graph = await f.get(`${f.root}/requirements/${f.b.id}`);
      expect(graph.status).toBe(200);
      expect(graph.body.nodes.length).toBeGreaterThan(0);
    }
  );
  it('filters the full server set before pagination and preserves global summary', async () => {
    const f = await fixture();
    const response = await f.get(
      `${f.root}/requirements?search=Alpha&situation=SEM_RASTREABILIDADE&requirementStatus=CADASTRADO&hasTests=false&hasOpenDefects=false&hasTechnicalEvidence=false&limit=1`
    );
    expect(response.status, response.text).toBe(200);
    expect(response.body.items[0].requirement.id).toBe(f.a.id);
    expect(response.body.pagination).toEqual({ page: 1, limit: 1, total: 1, totalPages: 1 });
    expect(response.body.summary.total).toBe(2);
    expect(response.body.filteredSummary.total).toBe(1);
    const page2 = await f.get(`${f.root}/requirements?page=2&limit=1`);
    expect(page2.body.items[0].requirement.id).toBe(f.a.id);
    const empty = await f.get(`${f.root}/requirements?situation=CONCLUIDO`);
    expect(empty.body.items).toEqual([]);
    expect(empty.body.pagination.totalPages).toBe(0);
    for (const query of [
      'situation=BOGUS',
      'requirementStatus=BOGUS',
      'hasTests=yes',
      'limit=101',
      'page=0',
      'unknown=1'
    ])
      expect((await f.get(`${f.root}/requirements?${query}`)).status).toBe(400);
  });
  it('paginates scoped immutable history and rejects a foreign cursor', async () => {
    const f = await fixture();
    await reconcileProject(f.project.id, { dryRun: false });
    const task = await createTask(prisma, f.project.id, { requirementId: f.a.id });
    await reconcileProject(f.project.id, { dryRun: false });
    await prisma.task.update({ where: { id: task.id }, data: { status: 'EM_ANDAMENTO' } });
    await reconcileProject(f.project.id, { dryRun: false });
    await prisma.task.delete({ where: { id: task.id } });
    const path = `${f.root}/requirements/${f.a.id}/history`;
    const first = await f.get(`${path}?limit=1`);
    expect(first.status, first.text).toBe(200);
    expect(first.body.items[0].toSituation).toBe('EM_DESENVOLVIMENTO');
    const second = await f.get(`${path}?limit=1&cursor=${first.body.nextCursor}`);
    expect(second.body.items[0].toSituation).toBe('PLANEJADO');
    const third = await f.get(`${path}?limit=1&cursor=${second.body.nextCursor}`);
    expect(third.body.items[0]).toMatchObject({
      fromSituation: null,
      reason: 'BASELINE_INITIALIZED'
    });
    expect(third.body.nextCursor).toBeNull();
    expect(
      (await f.get(`${f.root}/requirements/${f.b.id}/history?cursor=${first.body.nextCursor}`))
        .status
    ).toBe(400);
    expect((await f.get(`${path}?cursor=garbage`)).status).toBe(400);
  });
  it('rejects foreign requirements, inaccessible projects and unauthenticated reads', async () => {
    const f = await fixture();
    for (const suffix of ['current', 'history'])
      expect((await f.get(`${f.root}/requirements/${f.foreign.id}/${suffix}`)).status).toBe(404);
    expect((await f.get(`/api/projects/${f.other.id}/traceability/requirements`)).status).toBe(404);
    expect((await request(app).get(`${f.root}/requirements`)).status).toBe(401);
    await prisma.projectMembership.updateMany({
      where: { userId: f.user.id },
      data: { isActive: false }
    });
    expect((await f.get(`${f.root}/requirements`)).status).toBe(404);
  });
});
