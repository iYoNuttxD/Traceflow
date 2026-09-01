import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let app;
let prisma;
const password = 'SenhaSegura123!';

beforeAll(async () => {
  const url = configureTestDatabaseEnvironment();
  deployTestMigrations(url);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
  await cleanTestDatabase(prisma);
});

afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function register(email) {
  const agent = request.agent(app);
  const username = `lr1-${email
    .split('@')[0]
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 27)}`;
  const response = await agent.post('/api/auth/register').send({
    name: 'Pessoa LR.1',
    username,
    email,
    password
  });
  expect(response.status).toBe(201);
  const verification = await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: response.body.emailVerification.testToken });
  expect(verification.status).toBe(200);
  return {
    agent,
    user: response.body.user,
    csrf: response.body.csrfToken,
    mutate(method, path) {
      return agent[method](path).set('X-CSRF-Token', response.body.csrfToken);
    }
  };
}

async function createProject(owner, name) {
  const response = await owner
    .mutate('post', '/api/projects')
    .send({ name, responsibleTeam: 'Equipe LR.1' });
  expect(response.status).toBe(201);
  return response.body.project;
}

function variedPath(path, variant) {
  if (variant === 'lowercase') return path.toLowerCase();
  if (variant === 'UPPERCASE') return path.toUpperCase();
  return path
    .split('/')
    .map((segment) =>
      [...segment]
        .map((character, index) =>
          index % 2 === 0 ? character.toLowerCase() : character.toUpperCase()
        )
        .join('')
    )
    .join('/');
}

function expectedStatus(role, requiredRole, successStatus = 200) {
  if (role === 'NONE') return 404;
  const level = { VIEWER: 0, MEMBER: 1, MANAGER: 2, OWNER: 3 };
  return level[role] >= level[requiredRole] ? successStatus : 403;
}

describe('LR.1 - autorização project-scoped fail closed', () => {
  it('preserva a matriz de papéis em lowercase, UPPERCASE e MixedCase nas rotas críticas', async () => {
    const owner = await register('owner-matrix@example.invalid');
    const viewer = await register('viewer-matrix@example.invalid');
    const member = await register('member-matrix@example.invalid');
    const manager = await register('manager-matrix@example.invalid');
    const outsider = await register('outsider-matrix@example.invalid');
    const project = await createProject(owner, 'Matriz adversarial LR1');

    for (const [actor, role] of [
      [viewer, 'VIEWER'],
      [member, 'MEMBER'],
      [manager, 'MANAGER']
    ]) {
      await prisma.projectMembership.create({
        data: { projectId: project.id, userId: actor.user.id, role }
      });
    }

    const requirement = (
      await owner
        .mutate('post', `/api/projects/${project.id}/requirements`)
        .send({ title: 'RF adversarial' })
    ).body.requirement;
    const task = (
      await owner
        .mutate('post', `/api/projects/${project.id}/tasks`)
        .send({ title: 'Tarefa adversarial' })
    ).body.task;
    const patchTargetUser = await prisma.user.create({
      data: {
        name: 'Alvo patch',
        username: 'lr1-target-patch',
        email: 'target-patch@example.invalid',
        emailVerifiedAt: new Date()
      }
    });
    const patchTarget = await prisma.projectMembership.create({
      data: { projectId: project.id, userId: patchTargetUser.id, role: 'VIEWER' }
    });
    const deleteTargets = [];
    for (let index = 0; index < 3; index += 1) {
      const user = await prisma.user.create({
        data: {
          name: `Alvo delete ${index}`,
          username: `lr1-target-delete-${index}`,
          email: `target-delete-${index}@example.invalid`,
          emailVerifiedAt: new Date()
        }
      });
      deleteTargets.push(
        await prisma.projectMembership.create({
          data: { projectId: project.id, userId: user.id, role: 'VIEWER' }
        })
      );
    }

    const actors = [
      ['NONE', outsider],
      ['VIEWER', viewer],
      ['MEMBER', member],
      ['MANAGER', manager],
      ['OWNER', owner]
    ];
    const variants = ['lowercase', 'UPPERCASE', 'MixedCase'];
    const results = [];

    for (const [variantIndex, variant] of variants.entries()) {
      const routes = [
        {
          name: 'GET project',
          method: 'get',
          path: `/api/projects/${project.id}`,
          requiredRole: 'VIEWER'
        },
        {
          name: 'PUT project',
          method: 'put',
          path: `/api/projects/${project.id}`,
          requiredRole: 'OWNER',
          body: { name: `Projeto ${variant}` }
        },
        {
          name: 'GET access-code',
          method: 'get',
          path: `/api/projects/${project.id}/access-code`,
          requiredRole: 'OWNER'
        },
        {
          name: 'GET invitations',
          method: 'get',
          path: `/api/projects/${project.id}/invitations`,
          requiredRole: 'OWNER'
        },
        {
          name: 'PATCH member',
          method: 'patch',
          path: `/api/projects/${project.id}/members/${patchTarget.id}`,
          requiredRole: 'OWNER',
          body: { role: 'MEMBER' }
        },
        {
          name: 'DELETE member',
          method: 'delete',
          path: `/api/projects/${project.id}/members/${deleteTargets[variantIndex].id}`,
          requiredRole: 'OWNER',
          successStatus: 204,
          body: {}
        },
        {
          name: 'PATCH github sync-settings',
          method: 'patch',
          path: `/api/projects/${project.id}/github/sync-settings`,
          requiredRole: 'OWNER',
          successStatus: 400,
          body: { githubAutoSyncEnabled: variantIndex % 2 === 0 }
        },
        {
          name: 'GET requirement',
          method: 'get',
          path: `/api/requirements/${requirement.id}`,
          requiredRole: 'VIEWER'
        },
        {
          name: 'GET task',
          method: 'get',
          path: `/api/tasks/${task.id}`,
          requiredRole: 'VIEWER'
        }
      ];

      for (const [role, actor] of actors) {
        for (const route of routes) {
          const path = variedPath(route.path, variant);
          const response = route.body
            ? await actor.mutate(route.method, path).send(route.body)
            : await actor.agent[route.method](path);
          const expected = expectedStatus(role, route.requiredRole, route.successStatus);
          results.push({ route: route.name, role, variant, expected, actual: response.status });
          expect(response.status, JSON.stringify(results.at(-1))).toBe(expected);
          if (route.name === 'PATCH github sync-settings' && response.status === 200) {
            expect(response.body.project).not.toHaveProperty('accessCode');
            expect(response.body.project).not.toHaveProperty('accessCodeRole');
            expect(response.body.project).not.toHaveProperty('inviteLink');
          }
        }
      }
    }

    expect(results).toHaveLength(135);
    expect(results.every(({ expected, actual }) => expected === actual)).toBe(true);
  });

  it('bloqueia a cadeia de tomada cross-project e promoção a OWNER por MEMBER', async () => {
    const ownerA = await register('owner-a-takeover@example.invalid');
    const ownerB = await register('owner-b-takeover@example.invalid');
    const memberA = await register('member-a-takeover@example.invalid');
    const projectA = await createProject(ownerA, 'Projeto A');
    const projectB = await createProject(ownerB, 'Projeto B');
    await prisma.projectMembership.create({
      data: { projectId: projectA.id, userId: memberA.user.id, role: 'MEMBER' }
    });
    const targetUser = await prisma.user.create({
      data: {
        name: 'Alvo promoção',
        username: 'lr1-promotion-target',
        email: 'promotion-target@example.invalid',
        emailVerifiedAt: new Date()
      }
    });
    const targetA = await prisma.projectMembership.create({
      data: { projectId: projectA.id, userId: targetUser.id, role: 'VIEWER' }
    });
    const ownerBMembership = await prisma.projectMembership.findUnique({
      where: { projectId_userId: { projectId: projectB.id, userId: ownerB.user.id } }
    });

    expect((await ownerA.agent.get(`/api/PROJECTS/${projectB.id}`)).status).toBe(404);
    expect((await ownerA.agent.get(`/api/PROJECTS/${projectB.id}/ACCESS-CODE`)).status).toBe(404);
    expect(
      (
        await ownerA
          .mutate('patch', `/api/PROJECTS/${projectB.id}/MEMBERS/${ownerBMembership.id}`)
          .send({ role: 'OWNER' })
      ).status
    ).toBe(404);
    expect(
      (
        await memberA
          .mutate('patch', `/api/projects/${projectA.id}/MEMBERS/${targetA.id}`)
          .send({ role: 'OWNER' })
      ).status
    ).toBe(403);
    expect(
      await prisma.projectMembership.findUnique({ where: { id: ownerBMembership.id } })
    ).toMatchObject({ projectId: projectB.id, role: 'OWNER', isActive: true });
    expect(await prisma.projectMembership.findUnique({ where: { id: targetA.id } })).toMatchObject({
      projectId: projectA.id,
      role: 'VIEWER',
      isActive: true
    });
  });

  it('responde 404 opaco para projeto ou recurso filho inexistente antes do controller', async () => {
    const user = await register('missing-project@example.invalid');
    const missingId = 999999;
    const responses = [
      await user
        .mutate('post', `/api/projects/${missingId}/invitations`)
        .send({ email: 'invitee@example.invalid', role: 'MEMBER' }),
      await user.agent.get(`/api/projects/${missingId}/members`),
      await user.agent.get(`/api/projects/${missingId}/access-code`),
      await user.mutate('put', `/api/projects/${missingId}`).send({ name: 'Inexistente' }),
      await user.agent.get('/api/requirements/999999'),
      await user.agent.get('/api/tasks/999999'),
      await user.agent.get('/api/projects/999999999999999999999999')
    ];

    for (const response of responses) {
      expect(response).toMatchObject({
        status: 404,
        body: { code: 'RESOURCE_NOT_FOUND', message: 'Recurso não encontrado.' }
      });
      expect(JSON.stringify(response.body)).not.toMatch(/P\d{4}|stack|node_modules/i);
    }
  });
});
