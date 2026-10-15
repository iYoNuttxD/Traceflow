import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import {
  buildAuthorizationFixture,
  concreteRoute,
  projectScopedRoute
} from './helpers/authorization-fixture.js';
import { guardedBy, inventoryRoutes } from './helpers/route-inventory.js';

let app;
let prisma;
let fixture;
let inventory;

const ownerOnly = [
  ['PUT', /^\/api\/projects\/:id$/],
  ['DELETE', /^\/api\/projects\/:id$/],
  ['GET', /^\/api\/projects\/:projectId\/access-code$/],
  ['PATCH', /^\/api\/projects\/:projectId\/access-code$/],
  ['POST', /^\/api\/projects\/:projectId\/access-code\/regenerate$/],
  ['PATCH', /^\/api\/projects\/:projectId\/members\/:membershipId$/],
  ['DELETE', /^\/api\/projects\/:projectId\/members\/:membershipId$/],
  ['POST', /^\/api\/projects\/:projectId\/members\/:membershipId\/reactivate$/],
  ['POST', /^\/api\/projects\/:projectId\/ownership\/transfer$/],
  ['GET', /^\/api\/projects\/:projectId\/invitations$/],
  ['POST', /^\/api\/projects\/:projectId\/invitations$/],
  ['DELETE', /^\/api\/projects\/:projectId\/invitations\/:invitationId$/],
  ['PUT', /^\/api\/projects\/:projectId\/github\/integration$/],
  ['PATCH', /^\/api\/projects\/:projectId\/github\/sync-settings$/],
  ['GET', /^\/api\/projects\/:projectId\/audit-events$/]
];

const managerOrAbove = [
  ['POST', /^\/api\/projects\/:projectId\/github\/sync$/],
  ['POST', /^\/api\/projects\/:projectId\/traceability\/alerts\/:alertId\/dismiss$/],
  ['POST', /^\/api\/projects\/:projectId\/traceability\/alerts\/reconcile$/]
];

const viewerMayWrite = new Set([
  'DELETE /api/projects/:projectId/members/me',
  'PUT /api/projects/:projectId/indicator-preference',
  'DELETE /api/projects/:projectId/indicator-preference'
]);

const deletedProjectRoutes = new Set([
  'POST /api/projects/:id/restore',
  'DELETE /api/projects/:id/permanent'
]);

const sweepable = (route) =>
  projectScopedRoute(route.path) && !deletedProjectRoutes.has(`${route.method} ${route.path}`);

const matches = (route, rules) =>
  rules.some(([method, pattern]) => route.method === method && pattern.test(route.path));

const byRisk = (routes) =>
  [...routes].sort((a, b) => Number(a.method !== 'GET') - Number(b.method !== 'GET'));

async function deviationsOf(account, routes, expected) {
  const deviations = [];
  for (const route of byRisk(routes)) {
    const response = await account.send(route.method, concreteRoute(route.path, fixture.ids));
    if (response.status !== expected) {
      deviations.push(`${route.method} ${route.path} -> ${response.status}`);
    }
  }
  return deviations;
}

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  const { default: instance } = await import('../../src/app.js');
  inventory = inventoryRoutes(instance);
  app = await startTestServer(instance);
  await cleanTestDatabase(prisma);
  fixture = await buildAuthorizationFixture(app, prisma);
}, 120_000);

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

describe('H09 — varredura de autorização gerada do roteador', () => {
  it('anônimo recebe 401 em toda rota autenticada', async () => {
    const authenticated = inventory.routes.filter(
      (route) =>
        route.handlers.includes('authenticate') ||
        guardedBy(route, inventory.middlewares, 'authenticate')
    );
    expect(authenticated.length).toBeGreaterThan(150);
    const deviations = [];
    for (const route of authenticated) {
      const call = request(app)[route.method.toLowerCase()](concreteRoute(route.path, fixture.ids));
      const response = route.method === 'GET' ? await call : await call.send({});
      if (response.status !== 401)
        deviations.push(`${route.method} ${route.path} -> ${response.status}`);
    }
    expect(deviations).toEqual([]);
  });

  it('não membro recebe 404 opaco em toda rota de projeto', async () => {
    const routes = inventory.routes.filter(sweepable);
    expect(routes.length).toBeGreaterThan(100);
    expect(await deviationsOf(fixture.accounts.outsider, routes, 404)).toEqual([]);
  });

  it('VIEWER recebe 403 em toda escrita de projeto, salvo as três da matriz', async () => {
    const routes = inventory.routes.filter(
      (route) =>
        sweepable(route) &&
        route.method !== 'GET' &&
        !viewerMayWrite.has(`${route.method} ${route.path}`)
    );
    expect(await deviationsOf(fixture.accounts.viewer, routes, 403)).toEqual([]);
  });

  it('MEMBER recebe 403 nas rotas de MANAGER e de OWNER', async () => {
    const routes = inventory.routes.filter(
      (route) => matches(route, ownerOnly) || matches(route, managerOrAbove)
    );
    expect(routes).toHaveLength(ownerOnly.length + managerOrAbove.length);
    expect(await deviationsOf(fixture.accounts.member, routes, 403)).toEqual([]);
  });

  it('MANAGER recebe 403 nas rotas só de OWNER', async () => {
    const routes = inventory.routes.filter((route) => matches(route, ownerOnly));
    expect(routes).toHaveLength(ownerOnly.length);
    expect(await deviationsOf(fixture.accounts.manager, routes, 403)).toEqual([]);
  });

  it('autoria: só o autor edita o comentário e só o autor ou a moderação exclui', async () => {
    const { accounts, ids } = fixture;
    const memberComment = `/api/tasks/${ids.task}/comments/${ids.comment}`;
    const ownerComment = `/api/tasks/${ids.task}/comments/${ids.ownerComment}`;
    const ownerEntry = `/api/tasks/${ids.task}/time-entries/${ids.ownerEntry}`;
    const edit = { content: 'Texto alterado por terceiro' };
    expect((await accounts.manager.send('PATCH', memberComment, edit)).status).toBe(403);
    expect((await accounts.owner.send('PATCH', memberComment, edit)).status).toBe(403);
    expect((await accounts.member.send('PATCH', ownerComment, edit)).status).toBe(403);
    expect((await accounts.member.send('DELETE', ownerComment)).status).toBe(403);
    expect((await accounts.member.send('DELETE', ownerEntry)).status).toBe(403);
    const comments = await prisma.taskComment.findMany({
      where: { id: { in: [ids.comment, ids.ownerComment] } }
    });
    expect(comments.map((comment) => comment.content).sort()).toEqual([
      'Comentário do dono',
      'Comentário do membro'
    ]);
    expect(await prisma.taskTimeEntry.count({ where: { id: ids.ownerEntry } })).toBe(1);
  });

  it('restaurar e excluir em definitivo: só o OWNER do projeto excluído', async () => {
    const { accounts } = fixture;
    const created = await accounts.owner.send('POST', '/api/projects', {
      name: 'Projeto C excluído',
      responsibleTeam: 'Equipe C'
    });
    expect(created.status).toBe(201);
    const deleted = created.body.project;
    for (const [tag, role] of [
      ['manager', 'MANAGER'],
      ['member', 'MEMBER'],
      ['viewer', 'VIEWER']
    ]) {
      await prisma.projectMembership.create({
        data: { projectId: deleted.id, userId: accounts[tag].user.id, role }
      });
    }
    expect((await accounts.owner.send('DELETE', `/api/projects/${deleted.id}`)).status).toBe(200);
    const restore = `/api/projects/${deleted.id}/restore`;
    const permanent = `/api/projects/${deleted.id}/permanent`;
    const body = { confirmationName: deleted.name };
    expect((await accounts.outsider.send('POST', restore)).status).toBe(404);
    expect((await accounts.outsider.send('DELETE', permanent, body)).status).toBe(404);
    for (const tag of ['manager', 'member', 'viewer']) {
      expect((await accounts[tag].send('POST', restore)).status, tag).toBe(403);
      expect((await accounts[tag].send('DELETE', permanent, body)).status, tag).toBe(403);
    }
    expect(await prisma.project.findUnique({ where: { id: deleted.id } })).toMatchObject({
      name: 'Projeto C excluído'
    });
  });

  it('as negativas não alteram o projeto nem os seus recursos', async () => {
    const project = await prisma.project.findUnique({ where: { id: fixture.project.id } });
    expect(project).toMatchObject({ name: 'Projeto A da varredura', deletedAt: null });
    expect(await prisma.projectMembership.count({ where: { projectId: fixture.project.id } })).toBe(
      4
    );
    expect(await prisma.task.count({ where: { projectId: fixture.project.id } })).toBe(1);
    expect(await prisma.projectInvitation.count({ where: { projectId: fixture.project.id } })).toBe(
      1
    );
  });
});
