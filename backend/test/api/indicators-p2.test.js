import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let prisma;
let app;
let serial = 0;
const activityQuery = '?startDate=2026-09-01&endDate=2026-09-30&timeZone=UTC';

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
  app = await startTestServer(app);
  await cleanTestDatabase(prisma);
});
afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  if (prisma) {
    await cleanTestDatabase(prisma);
    await prisma.$disconnect();
  }
});

async function user(name) {
  const suffix = ++serial;
  const created = await prisma.user.create({
    data: {
      name,
      username: `indicator_p2_${suffix}`,
      email: `indicator_p2_${suffix}@example.invalid`,
      passwordHash: 'artificial',
      emailVerifiedAt: new Date()
    }
  });
  const token = `indicator-session-${suffix}`;
  await prisma.session.create({
    data: {
      userId: created.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      csrfTokenHash: createHash('sha256').update('artificial').digest('hex'),
      sessionVersion: created.sessionVersion,
      expiresAt: new Date(Date.now() + 600000)
    }
  });
  return { ...created, token };
}

async function project(owner, name = 'Indicadores') {
  const created = await prisma.project.create({
    data: {
      name,
      responsibleTeam: 'Equipe artificial',
      accessCode: `IND-P2-${++serial}`,
      memberships: { create: { userId: owner.id, role: 'OWNER' } }
    }
  });
  return created;
}

function get(path, actor) {
  const call = request(app).get(path);
  return actor ? call.set('Cookie', `traceflow_session=${actor.token}`) : call;
}

async function task(projectId, status = 'A_FAZER', responsibleUserId = null) {
  return prisma.task.create({
    data: {
      projectId,
      title: `Task artificial ${++serial}`,
      status,
      responsibleUserId
    }
  });
}

async function movement(projectId, taskId, toStatus, date, responsibleUserIdSnapshot = null) {
  return prisma.taskMovement.create({
    data: {
      projectId,
      taskId,
      fromStatus: toStatus === 'CONCLUIDO' ? 'EM_ANDAMENTO' : 'CONCLUIDO',
      toStatus,
      movedBy: 'fixture',
      movedAt: new Date(date),
      responsibleUserIdSnapshot
    }
  });
}

async function mainBranch(projectId, { confirmed = true, stale = false } = {}) {
  return prisma.gitBranch.create({
    data: {
      projectId,
      name: 'main',
      isDefault: false,
      lastSeenAt: new Date(),
      headSha: stale ? 'new-head' : 'old-head',
      lastSyncedHeadSha: confirmed ? 'old-head' : null,
      lastSyncedGeneration: confirmed ? 'generation-1' : null
    }
  });
}

async function commit(projectId, branchId, date, authorGithubUserId = null) {
  const row = await prisma.commit.create({
    data: {
      projectId,
      hash: `indicator-p2-${++serial}`,
      date: new Date(date),
      authorGithubUserId
    }
  });
  await prisma.commitBranch.create({
    data: {
      commitId: row.id,
      branchId,
      lastObservedGeneration: 'generation-1'
    }
  });
  return row;
}

describe('Indicator Engine P2 — API persistida', () => {
  it('RF15 agrega estado atual sem cruzar projetos e distingue 0/0 de 0/10', async () => {
    const actor = await user('Ana');
    const a = await project(actor, 'A');
    const b = await project(actor, 'B');
    expect((await get(`/api/projects/${a.id}/indicators/progress`, actor)).body).toMatchObject({
      metricId: 'I01',
      rf: 'RF15',
      value: null,
      denominator: 0,
      state: 'NO_DATA',
      period: null
    });
    for (let i = 0; i < 10; i++) await task(a.id, i < 4 ? 'CONCLUIDO' : 'A_FAZER');
    for (let i = 0; i < 20; i++) await task(b.id, 'CONCLUIDO');
    const first = await get(`/api/projects/${a.id}/indicators/progress`, actor);
    expect(first.body).toMatchObject({
      value: 40,
      numerator: 4,
      denominator: 10,
      state: 'AVAILABLE'
    });
    expect((await get(`/api/projects/${b.id}/indicators/progress`, actor)).body.value).toBe(100);
    await prisma.task.updateMany({ where: { projectId: a.id }, data: { status: 'A_FAZER' } });
    expect((await get(`/api/projects/${a.id}/indicators/progress`, actor)).body).toMatchObject({
      value: 0,
      numerator: 0,
      denominator: 10,
      state: 'AVAILABLE'
    });
  });

  it('RF16 usa main literal, generation, identidade estável, limites e não associados', async () => {
    const actor = await user('Daniel');
    const p = await project(actor);
    await prisma.gitHubIdentity.create({
      data: {
        userId: actor.id,
        githubUserId: '9001',
        githubLogin: 'login-renomeado'
      }
    });
    await prisma.projectGitHubIntegration.create({
      data: {
        projectId: p.id,
        status: 'ACTIVE',
        lastSyncStatus: 'SINCRONIZADO',
        lastSyncAt: new Date('2026-10-01T00:00:00Z'),
        defaultBranch: 'develop'
      }
    });
    const main = await mainBranch(p.id);
    const develop = await prisma.gitBranch.create({
      data: {
        projectId: p.id,
        name: 'develop',
        isDefault: true,
        lastSeenAt: new Date(),
        headSha: 'develop-head',
        lastSyncedHeadSha: 'develop-head',
        lastSyncedGeneration: 'develop-generation'
      }
    });
    const alsoDevelop = await commit(p.id, main.id, '2026-09-01T00:00:00Z', '9001');
    await prisma.commitBranch.create({
      data: {
        commitId: alsoDevelop.id,
        branchId: develop.id,
        lastObservedGeneration: 'develop-generation'
      }
    });
    await commit(p.id, main.id, '2026-09-30T23:59:59Z', '9001');
    await commit(p.id, main.id, '2026-09-20T12:00:00Z');
    await commit(p.id, main.id, '2026-10-01T00:00:00Z', '9001');
    const developOnly = await prisma.commit.create({
      data: {
        projectId: p.id,
        hash: 'develop-only',
        date: new Date('2026-09-15T00:00:00Z'),
        authorGithubUserId: '9001'
      }
    });
    await prisma.commitBranch.create({
      data: {
        commitId: developOnly.id,
        branchId: develop.id,
        lastObservedGeneration: 'develop-generation'
      }
    });
    const response = await get(`/api/projects/${p.id}/indicators/activity${activityQuery}`, actor);
    expect(response.status).toBe(200);
    const [commits, tasks, activity] = response.body.indicators;
    expect(commits).toMatchObject({
      metricId: 'I02',
      value: 3,
      state: 'PARTIAL',
      distribution: {
        total: 3,
        associated: 2,
        unassociated: 1,
        people: [{ userId: actor.id, displayName: 'Daniel', count: 2 }]
      }
    });
    expect(tasks).toMatchObject({ metricId: 'I03', value: 0, state: 'AVAILABLE' });
    expect(activity).toMatchObject({
      metricId: 'I05',
      state: 'PARTIAL',
      value: { completedTasks: 0, commits: 3 },
      people: [{ userId: actor.id, completedTasks: 0, commits: 2 }],
      unassociated: { commits: 1, completedTasks: 0 }
    });
    expect(JSON.stringify(response.body)).not.toMatch(/9001|login-renomeado|example\.invalid/);
    expect(activity).not.toHaveProperty('score');
  });

  it('RF17 usa última conclusão vigente no corte, snapshot e legado nulo', async () => {
    const daniel = await user('Daniel');
    const joao = await user('João');
    const p = await project(daniel);
    await prisma.projectMembership.create({ data: { projectId: p.id, userId: joao.id } });
    const first = await task(p.id, 'CONCLUIDO', joao.id);
    await movement(p.id, first.id, 'CONCLUIDO', '2026-09-03T00:00:00Z', daniel.id);
    const reopened = await task(p.id, 'CONCLUIDO', joao.id);
    await movement(p.id, reopened.id, 'CONCLUIDO', '2026-09-05T00:00:00Z', daniel.id);
    await movement(p.id, reopened.id, 'EM_ANDAMENTO', '2026-09-06T00:00:00Z', joao.id);
    await movement(p.id, reopened.id, 'CONCLUIDO', '2026-09-07T00:00:00Z', joao.id);
    const open = await task(p.id, 'EM_ANDAMENTO', daniel.id);
    await movement(p.id, open.id, 'CONCLUIDO', '2026-09-08T00:00:00Z', daniel.id);
    await movement(p.id, open.id, 'EM_ANDAMENTO', '2026-09-09T00:00:00Z', daniel.id);
    const legacy = await task(p.id, 'CONCLUIDO', joao.id);
    await movement(p.id, legacy.id, 'CONCLUIDO', '2026-09-10T00:00:00Z');
    const response = await get(`/api/projects/${p.id}/indicators/activity${activityQuery}`, daniel);
    expect(response.status).toBe(200);
    const tasks = response.body.indicators[1];
    expect(tasks).toMatchObject({
      value: 3,
      state: 'PARTIAL',
      distribution: {
        total: 3,
        associated: 2,
        unassociated: 1,
        unassignedHistoricalCount: 1,
        people: expect.arrayContaining([
          { userId: daniel.id, displayName: 'Daniel', count: 1 },
          { userId: joao.id, displayName: 'João', count: 1 }
        ])
      }
    });
    expect(response.body.indicators[2]).toMatchObject({
      state: 'PARTIAL',
      unassociated: { completedTasks: 1, unassignedHistoricalCount: 1 }
    });
    expect(response.body.indicators[2].people.every((person) => person.commits === null)).toBe(
      true
    );
  });

  it('RF17 respeita bordas UTC do dia civil no fuso pedido', async () => {
    const actor = await user('Ana');
    const p = await project(actor);
    for (const instant of [
      '2026-09-01T02:59:59.999Z',
      '2026-09-01T03:00:00.000Z',
      '2026-09-02T02:59:59.999Z',
      '2026-09-02T03:00:00.000Z'
    ]) {
      const row = await task(p.id, 'CONCLUIDO', actor.id);
      await movement(p.id, row.id, 'CONCLUIDO', instant, actor.id);
    }
    const response = await get(
      `/api/projects/${p.id}/indicators/activity?startDate=2026-09-01&endDate=2026-09-01&timeZone=America/Sao_Paulo`,
      actor
    );
    expect(response.status).toBe(200);
    expect(response.body.period).toMatchObject({
      startInclusive: '2026-09-01T03:00:00.000Z',
      endExclusive: '2026-09-02T03:00:00.000Z'
    });
    expect(response.body.indicators[1]).toMatchObject({ value: 2, state: 'AVAILABLE' });
  });

  it('RF36 reúne duas dimensões por pessoa sem score e conserva grupos desconhecidos', async () => {
    const daniel = await user('Daniel');
    const joao = await user('João');
    const p = await project(daniel);
    await prisma.projectMembership.create({ data: { projectId: p.id, userId: joao.id } });
    await prisma.gitHubIdentity.createMany({
      data: [
        { userId: daniel.id, githubUserId: 'github-1', githubLogin: 'daniel' },
        { userId: joao.id, githubUserId: 'github-2', githubLogin: 'joao' }
      ]
    });
    await prisma.projectGitHubIntegration.create({
      data: {
        projectId: p.id,
        status: 'ACTIVE',
        lastSyncStatus: 'SINCRONIZADO',
        lastSyncAt: new Date('2026-10-01T00:00:00Z')
      }
    });
    const main = await mainBranch(p.id);
    for (const [identity, count] of [
      ['github-1', 5],
      ['github-2', 4],
      [null, 2]
    ]) {
      for (let i = 0; i < count; i++) {
        await commit(p.id, main.id, '2026-09-15T12:00:00Z', identity);
      }
    }
    for (const [responsible, count] of [
      [daniel.id, 3],
      [joao.id, 2],
      [null, 1]
    ]) {
      for (let i = 0; i < count; i++) {
        const row = await task(p.id, 'CONCLUIDO', responsible);
        await movement(p.id, row.id, 'CONCLUIDO', '2026-09-16T12:00:00Z', responsible);
      }
    }
    const response = await get(`/api/projects/${p.id}/indicators/activity${activityQuery}`, daniel);
    expect(response.status).toBe(200);
    const [commits, tasks, combined] = response.body.indicators;
    expect(commits).toMatchObject({ value: 11, state: 'PARTIAL' });
    expect(tasks).toMatchObject({ value: 6, state: 'PARTIAL' });
    expect(combined).toMatchObject({
      state: 'PARTIAL',
      value: { completedTasks: 6, commits: 11 },
      people: [
        { userId: daniel.id, displayName: 'Daniel', completedTasks: 3, commits: 5 },
        { userId: joao.id, displayName: 'João', completedTasks: 2, commits: 4 }
      ],
      unassociated: { completedTasks: 1, commits: 2, unassignedHistoricalCount: 1 }
    });
    expect(combined).not.toHaveProperty('score');
    expect(combined.people.every((person) => !('rank' in person))).toBe(true);
  });

  it('RF16 diferencia main ausente, fotografia não confirmada e última coleta falha', async () => {
    const actor = await user('Ana');
    const p = await project(actor);
    const path = `/api/projects/${p.id}/indicators/activity${activityQuery}`;
    await prisma.gitBranch.create({
      data: {
        projectId: p.id,
        name: 'develop',
        isDefault: true,
        lastSeenAt: new Date()
      }
    });
    expect((await get(path, actor)).body.indicators[0]).toMatchObject({
      value: null,
      state: 'UNAVAILABLE'
    });
    const branch = await mainBranch(p.id, { confirmed: false });
    expect((await get(path, actor)).body.indicators[0]).toMatchObject({
      value: null,
      state: 'UNAVAILABLE',
      limitations: expect.arrayContaining(['MAIN_MEMBERSHIP_NOT_CONFIRMED'])
    });
    await prisma.gitBranch.update({
      where: { id: branch.id },
      data: {
        lastSyncedHeadSha: 'old-head',
        lastSyncedGeneration: 'generation-1'
      }
    });
    await prisma.projectGitHubIntegration.create({
      data: {
        projectId: p.id,
        status: 'ACTIVE',
        lastSyncStatus: 'FALHA',
        lastSyncAt: new Date('2026-09-20T00:00:00Z')
      }
    });
    await commit(p.id, branch.id, '2026-09-10T00:00:00Z');
    const known = (await get(path, actor)).body.indicators[0];
    expect(known).toMatchObject({ value: 1, state: 'STALE', sourceSyncStatus: 'FALHA' });
    await prisma.commit.updateMany({
      where: { projectId: p.id },
      data: {
        authorGithubUserId: 'unlinked'
      }
    });
    const stale = (await get(path, actor)).body.indicators[0];
    expect(stale.state).toBe('STALE');
    expect(stale.limitations).toContain('GITHUB_SYNC_FAILED');
  });

  it('aplica autenticação, VIEWER, 404 opaco e validação de período', async () => {
    const owner = await user('Owner');
    const viewer = await user('Viewer');
    const stranger = await user('Stranger');
    const p = await project(owner);
    await prisma.projectMembership.create({
      data: {
        projectId: p.id,
        userId: viewer.id,
        role: 'VIEWER'
      }
    });
    const path = `/api/projects/${p.id}/indicators/progress`;
    expect((await get(path)).status).toBe(401);
    expect((await get(path, viewer)).status).toBe(200);
    expect((await get(path, stranger)).status).toBe(404);
    const activity = `/api/projects/${p.id}/indicators/activity`;
    for (const query of [
      '?startDate=2026-02-30&endDate=2026-09-01&timeZone=UTC',
      '?startDate=2026-10-01&endDate=2026-09-01&timeZone=UTC',
      '?startDate=2026-09-01&endDate=2026-09-30&timeZone=Invalid/Zone'
    ])
      expect((await get(`${activity}${query}`, viewer)).status).toBe(400);
    await prisma.project.update({ where: { id: p.id }, data: { deletedAt: new Date() } });
    expect((await get(path, owner)).status).toBe(404);
  });
});
