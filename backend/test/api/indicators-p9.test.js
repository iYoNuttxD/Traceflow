import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { defaultDashboardPreference } from '../../src/modules/indicators/personalized-dashboard.catalog.js';
let prisma, app;
let serial = 0;
const hash = (s) => createHash('sha256').update(s).digest('hex');
beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
  app = await startTestServer(app);
  await cleanTestDatabase(prisma);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanTestDatabase(prisma);
});
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});
async function actor() {
  const n = ++serial;
  const user = await prisma.user.create({
    data: {
      name: `P9 ${n}`,
      username: `p9_${n}`,
      email: `p9_${n}@example.invalid`,
      emailVerifiedAt: new Date()
    }
  });
  const token = `p9-${n}`;
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hash(token),
      csrfTokenHash: hash('p9-csrf'),
      sessionVersion: user.sessionVersion,
      expiresAt: new Date(Date.now() + 600000)
    }
  });
  const { authService } = await import('../../src/modules/auth/auth.service.js');
  return { ...user, token, csrf: authService.csrfToken({ tokenHash: hash(token) }) };
}
async function project(user, role = 'OWNER') {
  return prisma.project.create({
    data: {
      name: 'P9 artificial',
      responsibleTeam: 'QA',
      accessCode: `P9-${++serial}`,
      memberships: { create: { userId: user.id, role } }
    }
  });
}
function call(p, user, method = 'get', endpoint = 'indicator-preference') {
  let req = request(app)[method](`/api/projects/${p.id}/${endpoint}`);
  if (user)
    req = req.set('Cookie', `traceflow_session=${user.token}`).set('X-CSRF-Token', user.csrf);
  return req;
}
const config = (widgets) => ({ configurationVersion: 1, widgets });
const ids = (r) => r.body.sections.flatMap((s) => s.indicators.map((i) => i.metricId));

describe('P9 personal preference and custom aggregate', () => {
  it.each(['VIEWER', 'MEMBER', 'MANAGER', 'OWNER'])(
    '%s can read/write/reset only their personal layout; GET never writes',
    async (role) => {
      const user = await actor();
      const p = await project(user, role);
      expect((await call(p, user)).body).toEqual(defaultDashboardPreference());
      expect(await prisma.projectDashboardPreference.count()).toBe(0);
      const saved = await call(p, user, 'put').send(config(['I21', 'I01']));
      expect(saved.status, JSON.stringify(saved.body)).toBe(200);
      expect(saved.body).toMatchObject({
        ...config(['I21', 'I01']),
        isDefault: false,
        updatedAt: expect.any(String)
      });
      expect((await call(p, user)).body).toEqual(saved.body);
      await call(p, user, 'put').send(config(['I49']));
      expect(await prisma.projectDashboardPreference.count()).toBe(1);
      expect((await call(p, user, 'delete')).body).toEqual(defaultDashboardPreference());
      expect(await prisma.projectDashboardPreference.count()).toBe(0);
    }
  );
  it('isolates users, projects, and reloads through a new session', async () => {
    const a = await actor();
    const b = await actor();
    const p = await project(a);
    const q = await project(a);
    await prisma.projectMembership.create({
      data: { projectId: p.id, userId: b.id, role: 'VIEWER' }
    });
    await call(p, a, 'put').send(config(['I01']));
    expect((await call(p, b)).body).toEqual(defaultDashboardPreference());
    expect((await call(q, a)).body).toEqual(defaultDashboardPreference());
    await call(p, b, 'put').send(config(['I47']));
    await prisma.session.create({
      data: {
        userId: a.id,
        tokenHash: hash('new-p9-session'),
        csrfTokenHash: hash('p9-csrf'),
        sessionVersion: a.sessionVersion,
        expiresAt: new Date(Date.now() + 600000)
      }
    });
    expect((await call(p, { ...a, token: 'new-p9-session' })).body.widgets).toEqual(['I01']);
    expect((await call(p, b)).body.widgets).toEqual(['I47']);
  });
  it.each([
    {},
    { widgets: ['I01'] },
    { ...config(['I01']), userId: 1 },
    config([]),
    config(['I01', 'I01']),
    config(['I99']),
    config(['I03']),
    config(['I68']),
    { ...config(['I01']), configurationVersion: 2 },
    config(Array.from({ length: 13 }, (_, i) => `I${String(i + 20).padStart(2, '0')}`)),
    config('I01')
  ])('rejects invalid configuration %j without writing', async (body) => {
    const user = await actor();
    const p = await project(user);
    expect((await call(p, user, 'put').send(body)).status).toBe(400);
    expect(await prisma.projectDashboardPreference.count()).toBe(0);
  });
  it('enforces authentication, opaque project scope, inactive membership and CSRF', async () => {
    const user = await actor();
    const other = await actor();
    const p = await project(user);
    for (const method of ['get', 'put', 'delete']) {
      expect(
        (await call(p, null, method).send(method === 'put' ? config(['I01']) : {})).status
      ).toBe(401);
      expect(
        (await call(p, other, method).send(method === 'put' ? config(['I01']) : {})).status
      ).toBe(404);
    }
    expect(
      (
        await request(app)
          .put(`/api/projects/${p.id}/indicator-preference`)
          .set('Cookie', `traceflow_session=${user.token}`)
          .send(config(['I01']))
      ).status
    ).toBe(403);
    await prisma.projectMembership.updateMany({
      where: { projectId: p.id },
      data: { isActive: false }
    });
    expect((await call(p, user)).status).toBe(404);
  });
  it('retains inaccessible preferences during soft deletion, restores, then cascades real purge', async () => {
    const user = await actor();
    const p = await project(user);
    await call(p, user, 'put').send(config(['I01']));
    const { projectDeletionService } =
      await import('../../src/modules/projects/services/project-deletion.service.js');
    await projectDeletionService.requestDeletion(p.id, user.id);
    for (const method of ['get', 'put', 'delete'])
      expect(
        (await call(p, user, method).send(method === 'put' ? config(['I21']) : {})).status
      ).toBe(404);
    expect(await prisma.projectDashboardPreference.count()).toBe(1);
    await projectDeletionService.restore(p.id, user.id);
    expect((await call(p, user)).body.widgets).toEqual(['I01']);
    await projectDeletionService.requestDeletion(p.id, user.id);
    await projectDeletionService.purge(p.id, user.id, p.name);
    expect(await prisma.projectDashboardPreference.count()).toBe(0);
  });
  it('exports only the actor preference in active accessible projects', async () => {
    const user = await actor();
    const other = await actor();
    const p = await project(user);
    await prisma.projectMembership.create({
      data: { projectId: p.id, userId: other.id, role: 'MEMBER' }
    });
    await call(p, user, 'put').send(config(['I01']));
    await call(p, other, 'put').send(config(['I21']));
    const { settingsRepository } =
      await import('../../src/modules/settings/settings.repository.js');
    expect((await settingsRepository.exportData(user.id)).dashboardPreferences).toEqual([
      expect.objectContaining({ projectId: p.id, configuration: { widgets: ['I01'] } })
    ]);
    await prisma.project.update({ where: { id: p.id }, data: { deletedAt: new Date() } });
    expect((await settingsRepository.exportData(user.id)).dashboardPreferences).toEqual([]);
  });
  it('returns requested order only, independent full Health, same filter semantics and bounded source reads', async () => {
    const user = await actor();
    const p = await project(user);
    const sprint = await prisma.sprint.create({
      data: {
        projectId: p.id,
        name: 'P9 Sprint',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-15'),
        status: 'EM_ANDAMENTO',
        startedAt: new Date('2026-09-01')
      }
    });
    await prisma.task.create({
      data: { projectId: p.id, title: 'WIP', status: 'EM_ANDAMENTO', estimatedEffort: 4 }
    });
    const query = `startDate=2026-09-01&endDate=2026-09-30&timeZone=UTC&sprintId=${sprint.id}`;
    const { flowTaskService } = await import('../../src/modules/indicators/flow-task.service.js');
    const read = vi.spyOn(flowTaskService, 'read');
    const result = await call(
      p,
      user,
      'get',
      `indicators/dashboard?view=CUSTOM&widgets=I23,I21,I45&${query}`
    );
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(ids(result)).toEqual(['I23', 'I21', 'I45']);
    expect(read).toHaveBeenCalledTimes(1);
    const [wip, cycle, burndown] = result.body.sections[0].indicators;
    expect(wip).toMatchObject({
      value: 1,
      period: null,
      appliedFilters: { period: false, sprint: false }
    });
    expect(cycle.appliedFilters.period).toBe(true);
    expect(burndown.appliedFilters.sprint).toBe(true);
    const general = await call(p, user, 'get', `indicators/dashboard?view=GENERAL&${query}`);
    const one = await call(p, user, 'get', `indicators/dashboard?view=CUSTOM&widgets=I49&${query}`);
    for (const key of ['score', 'coverage', 'status', 'dimensions', 'drivers']) {
      expect(result.body.projectHealth[key]).toEqual(general.body.projectHealth[key]);
      expect(one.body.projectHealth[key]).toEqual(general.body.projectHealth[key]);
    }
    expect(result.body.sections[0].indicators.every((i) => i.assessment)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(result.body))).toBeLessThan(256 * 1024);
  });
  it.each([
    'view=CUSTOM',
    'view=CUSTOM&widgets=I68',
    'view=CUSTOM&widgets=I01,I01',
    'view=GENERAL&widgets=I01',
    'view=CUSTOM&widgets=I01&startDate=2024-01-01&endDate=2026-01-01&timeZone=UTC'
  ])('validates custom query %s', async (query) => {
    const user = await actor();
    const p = await project(user);
    expect((await call(p, user, 'get', `indicators/dashboard?${query}`)).status).toBe(400);
  });
});
