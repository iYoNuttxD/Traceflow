import { startTestServer } from '../helpers/http-server.js';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let app;
let prisma;
const password = 'SenhaSegura123';

beforeAll(async () => {
  const url = configureTestDatabaseEnvironment();
  deployTestMigrations(url);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
  app = await startTestServer(app);
  await cleanTestDatabase(prisma);
});

afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function register(email, name = 'Pessoa L5.1') {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name,
    username: `l5${email
      .split('@')[0]
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 27)}`,
    email,
    password
  });
  await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: response.body.emailVerification.testToken });
  return {
    agent,
    csrf: response.body.csrfToken,
    mutate(method, path) {
      return agent[method](path).set('X-CSRF-Token', response.body.csrfToken);
    }
  };
}

async function createProject(owner, name = 'Projeto L5.1') {
  const response = await owner.mutate('post', '/api/projects').send({
    name,
    responsibleTeam: 'Equipe L5.1'
  });
  expect(response.status).toBe(201);
  return response.body.project;
}

describe('L5.1 - código de acesso e convites pessoais', () => {
  it('gera código forte para projeto comum sem expor capability nos DTOs gerais', async () => {
    const owner = await register('owner-code@example.invalid');
    const project = await createProject(owner);

    expect(project).not.toHaveProperty('accessCode');
    expect(project).not.toHaveProperty('inviteLink');
    expect(project).not.toHaveProperty('accessCodeRole');
    const stored = await prisma.project.findUnique({ where: { id: project.id } });
    expect(stored).toMatchObject({ accessCodeRole: 'MEMBER' });
    expect(stored.accessCode).toMatch(/^TRC-[0-9A-F]{32}$/);
    const otherProject = await createProject(owner, 'Outro projeto');
    const otherStored = await prisma.project.findUnique({ where: { id: otherProject.id } });
    expect(new Set([stored.accessCode, otherStored.accessCode]).size).toBe(2);

    const list = await owner.agent.get('/api/projects');
    const details = await owner.agent.get(`/api/projects/${project.id}`);
    expect(list.body.projects[0]).not.toHaveProperty('accessCode');
    expect(details.body.project).not.toHaveProperty('accessCode');
  });

  it('restringe configuração ao OWNER e aceita somente MEMBER ou VIEWER', async () => {
    const owner = await register('owner-settings@example.invalid');
    const project = await createProject(owner);
    const member = await register('member-settings@example.invalid');
    const memberUser = await prisma.user.findUnique({
      where: { email: 'member-settings@example.invalid' }
    });
    await prisma.projectMembership.create({
      data: { projectId: project.id, userId: memberUser.id, role: 'MEMBER' }
    });

    const ownerView = await owner.agent.get(`/api/projects/${project.id}/access-code`);
    expect(ownerView).toMatchObject({
      status: 200,
      body: {
        accessCode: {
          accessCode: expect.stringMatching(/^TRC-[0-9A-F]{32}$/),
          role: 'MEMBER',
          inviteLink: expect.stringContaining('/join/TRC-')
        }
      }
    });
    expect((await member.agent.get(`/api/projects/${project.id}/access-code`)).status).toBe(403);

    expect(
      (
        await owner
          .mutate('patch', `/api/projects/${project.id}/access-code`)
          .send({ role: 'VIEWER' })
      ).body.accessCode.role
    ).toBe('VIEWER');
    for (const role of ['OWNER', 'MANAGER', 'INVALID']) {
      const rejected = await owner
        .mutate('patch', `/api/projects/${project.id}/access-code`)
        .send({ role });
      expect(rejected).toMatchObject({ status: 400, body: { code: 'VALIDATION_ERROR' } });
    }
    expect(
      await prisma.projectMembership.findUnique({
        where: { projectId_userId: { projectId: project.id, userId: memberUser.id } }
      })
    ).toMatchObject({ role: 'MEMBER' });
  });

  it('usa identidade da sessão e papel configurado sem gravar ProjectMember legado', async () => {
    const owner = await register('owner-join@example.invalid');
    const project = await createProject(owner);
    const configuration = (
      await owner
        .mutate('patch', `/api/projects/${project.id}/access-code`)
        .send({ role: 'VIEWER' })
    ).body.accessCode;
    const joiner = await register('joiner@example.invalid', 'Identidade real');

    const spoof = await joiner.mutate('post', '/api/projects/join').send({
      accessCode: configuration.accessCode,
      name: 'Outra pessoa',
      email: 'outra@example.invalid',
      role: 'OWNER'
    });
    expect(spoof).toMatchObject({ status: 400, body: { code: 'VALIDATION_ERROR' } });

    const joined = await joiner
      .mutate('post', '/api/projects/join')
      .send({ accessCode: configuration.accessCode.toLowerCase() });
    expect(joined).toMatchObject({
      status: 201,
      body: {
        project: { id: project.id, name: 'Projeto L5.1' },
        membership: { role: 'VIEWER' }
      }
    });
    const user = await prisma.user.findUnique({ where: { email: 'joiner@example.invalid' } });
    expect(
      await prisma.projectMembership.findUnique({
        where: { projectId_userId: { projectId: project.id, userId: user.id } }
      })
    ).toMatchObject({ role: 'VIEWER', isActive: true });
    expect(prisma.projectMember).toBeUndefined();

    const memberProject = await createProject(owner, 'Projeto com acesso MEMBER');
    const memberCode = (await prisma.project.findUnique({ where: { id: memberProject.id } }))
      .accessCode;
    const memberJoiner = await register('member-joiner@example.invalid');
    const memberJoined = await memberJoiner
      .mutate('post', '/api/projects/join')
      .send({ accessCode: memberCode });
    expect(memberJoined).toMatchObject({
      status: 201,
      body: { project: { id: memberProject.id }, membership: { role: 'MEMBER' } }
    });
  });

  it('não altera membership ativa nem reativa membership inativa por código', async () => {
    const owner = await register('owner-existing@example.invalid');
    const project = await createProject(owner);
    const code = (await prisma.project.findUnique({ where: { id: project.id } })).accessCode;
    const joiner = await register('existing@example.invalid');
    const user = await prisma.user.findUnique({ where: { email: 'existing@example.invalid' } });
    await prisma.projectMembership.create({
      data: { projectId: project.id, userId: user.id, role: 'MANAGER' }
    });

    expect(
      await joiner.mutate('post', '/api/projects/join').send({ accessCode: code })
    ).toMatchObject({ status: 409, body: { code: 'PROJECT_MEMBER_ALREADY_EXISTS' } });
    await prisma.projectMembership.update({
      where: { projectId_userId: { projectId: project.id, userId: user.id } },
      data: { isActive: false }
    });
    expect(
      await joiner.mutate('post', '/api/projects/join').send({ accessCode: code })
    ).toMatchObject({ status: 409, body: { code: 'PROJECT_MEMBERSHIP_INACTIVE' } });
    expect(
      await prisma.projectMembership.findUnique({
        where: { projectId_userId: { projectId: project.id, userId: user.id } }
      })
    ).toMatchObject({ role: 'MANAGER', isActive: false });
  });

  it('regenera atomicamente, invalida códigos anteriores e nunca audita a capability', async () => {
    const owner = await register('owner-rotate@example.invalid');
    const project = await createProject(owner);
    const oldCode = (await prisma.project.findUnique({ where: { id: project.id } })).accessCode;

    const responses = await Promise.all([
      owner.mutate('post', `/api/projects/${project.id}/access-code/regenerate`).send({}),
      owner.mutate('post', `/api/projects/${project.id}/access-code/regenerate`).send({})
    ]);
    expect(responses.every(({ status }) => status === 200)).toBe(true);
    const responseCodes = responses.map(({ body }) => body.accessCode.accessCode);
    expect(new Set([oldCode, ...responseCodes]).size).toBe(3);
    const stored = await prisma.project.findUnique({ where: { id: project.id } });
    expect(responseCodes).toContain(stored.accessCode);

    const invalidCodes = [oldCode, ...responseCodes.filter((code) => code !== stored.accessCode)];
    for (const invalid of invalidCodes) {
      expect(
        (await owner.agent.get('/api/projects/join/details').query({ accessCode: invalid })).status
      ).toBe(404);
    }
    expect(
      (await owner.agent.get('/api/projects/join/details').query({ accessCode: stored.accessCode }))
        .body.details
    ).toMatchObject({ project: { id: project.id }, role: 'MEMBER' });
    const events = await prisma.auditEvent.findMany({
      where: { action: 'PROJECT_ACCESS_CODE_REGENERATED', projectId: project.id }
    });
    expect(events).toHaveLength(2);
    expect(JSON.stringify(events)).not.toContain('TRC-');
  });

  it('bloqueia conta restrita e código inválido sem revelar projeto', async () => {
    const user = await register('restricted-join@example.invalid');
    const storedUser = await prisma.user.findUnique({
      where: { email: 'restricted-join@example.invalid' }
    });
    await prisma.user.update({
      where: { id: storedUser.id },
      data: { accountStatus: 'DEACTIVATED', isActive: false }
    });
    expect(
      await user.mutate('post', '/api/projects/join').send({ accessCode: 'TRC-NOT-VALID' })
    ).toMatchObject({ status: 403, body: { code: 'ACCOUNT_DEACTIVATED' } });

    const active = await register('active-invalid@example.invalid');
    expect(
      await active.mutate('post', '/api/projects/join').send({ accessCode: 'TRC-NOT-VALID' })
    ).toMatchObject({ status: 404, body: { code: 'PROJECT_ACCESS_CODE_INVALID' } });
  });

  it('lista somente convites pendentes do próprio e-mail e aceita/recusa por id', async () => {
    const owner = await register('owner-mine@example.invalid');
    const project = await createProject(owner, 'Projeto dos convites');
    const invitee = await register('invitee-mine@example.invalid');
    const other = await register('other-mine@example.invalid');
    const first = await owner
      .mutate('post', `/api/projects/${project.id}/invitations`)
      .send({ email: 'INVITEE-MINE@example.invalid', role: 'MEMBER' });
    const second = await owner
      .mutate('post', `/api/projects/${project.id}/invitations`)
      .send({ email: 'other-mine@example.invalid', role: 'VIEWER' });

    const mine = await invitee.agent.get('/api/projects/invitations/mine');
    expect(mine.body.invitations).toEqual([
      expect.objectContaining({
        id: first.body.invitation.id,
        project: { id: project.id, name: 'Projeto dos convites' },
        role: 'MEMBER',
        status: 'PENDING'
      })
    ]);
    expect(mine.body.invitations[0]).not.toHaveProperty('tokenHash');
    expect(
      await other
        .mutate('post', `/api/projects/invitations/${first.body.invitation.id}/accept`)
        .send({})
    ).toMatchObject({ status: 404, body: { code: 'RESOURCE_NOT_FOUND' } });

    const accepted = await invitee
      .mutate('post', `/api/projects/invitations/${first.body.invitation.id}/accept`)
      .send({});
    expect(accepted).toMatchObject({ status: 200, body: { membership: { role: 'MEMBER' } } });
    expect((await invitee.agent.get('/api/projects/invitations/mine')).body.invitations).toEqual(
      []
    );

    const declined = await other
      .mutate('post', `/api/projects/invitations/${second.body.invitation.id}/decline`)
      .send({});
    expect(declined).toMatchObject({ status: 200, body: { message: 'Convite recusado.' } });
    expect((await other.agent.get('/api/projects/invitations/mine')).body.invitations).toEqual([]);
  });

  it('filtra expirados e mantém aceite por token e dashboard no mesmo núcleo concorrente', async () => {
    const owner = await register('owner-race-mine@example.invalid');
    const project = await createProject(owner, 'Projeto concorrente');
    const invitee = await register('invitee-race-mine@example.invalid');
    const created = await owner
      .mutate('post', `/api/projects/${project.id}/invitations`)
      .send({ email: 'invitee-race-mine@example.invalid', role: 'VIEWER' });

    const responses = await Promise.all([
      invitee
        .mutate('post', `/api/projects/invitations/${created.body.invitation.id}/accept`)
        .send({}),
      invitee.mutate('post', '/api/projects/invitations/accept').send({ token: created.body.token })
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const user = await prisma.user.findUnique({
      where: { email: 'invitee-race-mine@example.invalid' }
    });
    expect(
      await prisma.projectMembership.count({ where: { projectId: project.id, userId: user.id } })
    ).toBe(1);

    const expired = await owner
      .mutate('post', `/api/projects/${project.id}/invitations`)
      .send({ email: 'expired-mine@example.invalid', role: 'MEMBER' });
    await prisma.projectInvitation.update({
      where: { id: expired.body.invitation.id },
      data: { expiresAt: new Date(Date.now() - 1000) }
    });
    const expiredUser = await register('expired-mine@example.invalid');
    expect(
      (await expiredUser.agent.get('/api/projects/invitations/mine')).body.invitations
    ).toEqual([]);
  });
});
