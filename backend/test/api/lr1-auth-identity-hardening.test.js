import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { ERROR_CODES } from '../../src/shared/errors/index.js';

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

async function register(email, { verify = true, username } = {}) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: 'Pessoa LR.1',
    username:
      username ||
      `lr1-${email
        .split('@')[0]
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 27)}`,
    email,
    password
  });
  expect(response.status).toBe(201);
  const verificationToken = response.body.emailVerification.testToken;
  if (verify) {
    const verification = await request(app)
      .post('/api/auth/email-verification/verify')
      .send({ token: verificationToken });
    expect(verification.status).toBe(200);
  }
  return {
    agent,
    user: response.body.user,
    csrf: response.body.csrfToken,
    verificationToken,
    mutate(method, path) {
      return agent[method](path).set('X-CSRF-Token', response.body.csrfToken);
    }
  };
}

async function createProject(owner, name = 'Projeto LR.1') {
  const response = await owner
    .mutate('post', '/api/projects')
    .send({ name, responsibleTeam: 'Equipe LR.1' });
  expect(response.status).toBe(201);
  return response.body.project;
}

describe('LR.1 - hardening de autenticação e identidade', () => {
  it('bloqueia mutations de /auth para contas restritas e preserva me, csrf e logout', async () => {
    for (const status of ['DEACTIVATED', 'DELETION_PENDING']) {
      const auth = await register(`${status.toLowerCase()}@example.invalid`);
      await prisma.user.update({
        where: { id: auth.user.id },
        data: { accountStatus: status, isActive: status !== 'DEACTIVATED' }
      });
      const expectedCode =
        status === 'DEACTIVATED'
          ? ERROR_CODES.ACCOUNT_DEACTIVATED
          : ERROR_CODES.ACCOUNT_DELETION_PENDING;

      expect((await auth.agent.get('/api/auth/me')).status).toBe(200);
      expect((await auth.agent.get('/api/auth/csrf')).status).toBe(200);
      const blocked = [
        await auth.mutate('patch', '/api/auth/username').send({ username: 'nao-permitido' }),
        await auth.mutate('post', '/api/auth/change-password').send({
          currentPassword: password,
          password: 'NovaSenhaRobusta456!'
        }),
        await auth.mutate('post', '/api/auth/email-verification/resend').send({}),
        await auth.mutate('post', '/api/auth/github/reauth/start').send({})
      ];
      for (const response of blocked) {
        expect(response).toMatchObject({ status: 403, body: { code: expectedCode } });
      }
      expect(
        (
          await request(app)
            .post('/api/auth/forgot-password')
            .send({ email: `${status.toLowerCase()}@example.invalid` })
        ).status
      ).toBe(200);
      expect((await auth.mutate('post', '/api/auth/logout').send({})).status).toBe(204);
    }
  });

  it('não autentica conta ANONYMIZED no pipeline real', async () => {
    const auth = await register('anonymized-lr1@example.invalid');
    await prisma.user.update({
      where: { id: auth.user.id },
      data: { accountStatus: 'ANONYMIZED', isActive: false }
    });

    for (const response of [
      await auth.agent.get('/api/auth/me'),
      await auth.mutate('patch', '/api/auth/username').send({ username: 'anonimo' }),
      await auth.mutate('post', '/api/auth/change-password').send({
        currentPassword: password,
        password: 'NovaSenhaRobusta456!'
      })
    ]) {
      expect(response).toMatchObject({
        status: 401,
        body: { code: ERROR_CODES.AUTHENTICATION_REQUIRED }
      });
    }
  });

  it('reserva /auth/username ao bootstrap e impede bypass do cooldown de Settings', async () => {
    const ordinary = await register('ordinary-username@example.invalid', {
      username: 'ordinary-user'
    });
    expect(
      (await ordinary.mutate('patch', '/api/auth/username').send({ username: 'bypass-inicial' }))
        .status
    ).toBe(409);

    const changed = await ordinary
      .mutate('patch', '/api/settings/account/username')
      .send({ username: 'ordinary-changed' });
    expect(changed.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: ordinary.user.id } })).toMatchObject({
      username: 'ordinary-changed',
      usernameChangedAt: expect.any(Date)
    });

    expect(
      await ordinary
        .mutate('patch', '/api/settings/account/username')
        .send({ username: 'cooldown-blocked' })
    ).toMatchObject({
      status: 409,
      body: { code: ERROR_CODES.USERNAME_CHANGE_COOLDOWN }
    });
    expect(
      (await ordinary.mutate('patch', '/api/auth/username').send({ username: 'cooldown-bypass' }))
        .status
    ).toBe(409);

    const bootstrap = await register('bootstrap-username@example.invalid', {
      username: 'technical-bootstrap'
    });
    await prisma.user.update({
      where: { id: bootstrap.user.id },
      data: { mustSetUsername: true }
    });
    const completed = await bootstrap
      .mutate('patch', '/api/auth/username')
      .send({ username: 'bootstrap-real' });
    expect(completed).toMatchObject({
      status: 200,
      body: { user: { username: 'bootstrap-real', mustSetUsername: false } }
    });

    const duplicate = await register('duplicate-username@example.invalid', {
      username: 'already-owned'
    });
    await prisma.user.update({
      where: { id: bootstrap.user.id },
      data: { mustSetUsername: true }
    });
    expect(
      await bootstrap
        .mutate('patch', '/api/auth/username')
        .send({ username: duplicate.user.username })
    ).toMatchObject({ status: 409, body: { code: ERROR_CODES.CONFLICT } });
  });

  it('invalida reset pendente nas duas trocas voluntárias de senha', async () => {
    const authFlow = await register('auth-password-change@example.invalid');
    const authReset = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'auth-password-change@example.invalid' });
    const newAuthPassword = 'NovaSenhaAuth456!';
    expect(
      (
        await authFlow.mutate('post', '/api/auth/change-password').send({
          currentPassword: password,
          password: newAuthPassword
        })
      ).status
    ).toBe(200);
    expect(
      (
        await request(app).post('/api/auth/reset-password').send({
          token: authReset.body.testToken,
          password: 'ResetIndevido789!'
        })
      ).status
    ).toBe(400);
    expect(
      (
        await request(app).post('/api/auth/login').send({
          identifier: 'auth-password-change@example.invalid',
          password: newAuthPassword,
          rememberMe: false
        })
      ).status
    ).toBe(200);

    const settingsFlow = await register('settings-password-change@example.invalid');
    const settingsReset = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'settings-password-change@example.invalid' });
    const newSettingsPassword = 'NovaSenhaSettings456!';
    expect(
      (
        await settingsFlow.mutate('post', '/api/settings/security/password').send({
          currentPassword: password,
          newPassword: newSettingsPassword,
          confirmation: newSettingsPassword
        })
      ).status
    ).toBe(200);
    expect(
      (
        await request(app).post('/api/auth/reset-password').send({
          token: settingsReset.body.testToken,
          password: 'OutroResetIndevido789!'
        })
      ).status
    ).toBe(400);
    expect(
      (
        await request(app).post('/api/auth/login').send({
          identifier: 'settings-password-change@example.invalid',
          password: newSettingsPassword,
          rememberMe: false
        })
      ).status
    ).toBe(200);
  });

  it('converte corrida real de cadastro em uma criação e um conflito opaco', async () => {
    const body = {
      name: 'Cadastro concorrente',
      username: 'register-race-lr1',
      email: 'register-race-lr1@example.invalid',
      password
    };
    const responses = await Promise.all([
      request(app).post('/api/auth/register').send(body),
      request(app).post('/api/auth/register').send(body)
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(responses.find(({ status }) => status === 409)).toMatchObject({
      body: { code: ERROR_CODES.CONFLICT, message: 'Não foi possível criar a conta.' }
    });
    expect(await prisma.user.count({ where: { email: body.email } })).toBe(1);
  });

  it('exige e-mail verificado antes de listar, aceitar ou recusar convites pessoais', async () => {
    expect(ERROR_CODES.EMAIL_VERIFICATION_REQUIRED).toBe('EMAIL_VERIFICATION_REQUIRED');
    const owner = await register('owner-personal-invite@example.invalid');
    const project = await createProject(owner, 'Convite pessoal LR1');
    const ownInvitation = await owner
      .mutate('post', `/api/projects/${project.id}/invitations`)
      .send({ email: 'victim-personal@example.invalid', role: 'MEMBER' });
    const otherInvitation = await owner
      .mutate('post', `/api/projects/${project.id}/invitations`)
      .send({ email: 'other-personal@example.invalid', role: 'VIEWER' });
    const victim = await register('victim-personal@example.invalid', { verify: false });

    const blocked = [
      await victim.agent.get('/api/projects/invitations/mine'),
      await victim
        .mutate('post', `/api/projects/invitations/${ownInvitation.body.invitation.id}/accept`)
        .send({}),
      await victim
        .mutate('post', `/api/projects/invitations/${ownInvitation.body.invitation.id}/decline`)
        .send({}),
      await victim
        .mutate('post', `/api/projects/invitations/${otherInvitation.body.invitation.id}/accept`)
        .send({})
    ];
    for (const response of blocked) {
      expect(response).toMatchObject({
        status: 403,
        body: { code: ERROR_CODES.EMAIL_VERIFICATION_REQUIRED }
      });
      expect(JSON.stringify(response.body)).not.toMatch(
        /Convite pessoal|MEMBER|VIEWER|other-personal/i
      );
    }
    expect(
      await prisma.projectMembership.findUnique({
        where: { projectId_userId: { projectId: project.id, userId: victim.user.id } }
      })
    ).toBeNull();
    expect(
      await prisma.projectInvitation.findUnique({
        where: { id: ownInvitation.body.invitation.id }
      })
    ).toMatchObject({ acceptedAt: null, declinedAt: null });

    expect(
      (
        await request(app)
          .post('/api/auth/email-verification/verify')
          .send({ token: victim.verificationToken })
      ).status
    ).toBe(200);
    const mine = await victim.agent.get('/api/projects/invitations/mine');
    expect(mine.body.invitations.map(({ id }) => id)).toEqual([ownInvitation.body.invitation.id]);
    expect(
      (
        await victim
          .mutate('post', `/api/projects/invitations/${ownInvitation.body.invitation.id}/accept`)
          .send({})
      ).status
    ).toBe(200);

    const verifiedOther = await register('verified-other@example.invalid');
    expect(
      await verifiedOther
        .mutate('post', `/api/projects/invitations/${otherInvitation.body.invitation.id}/accept`)
        .send({})
    ).toMatchObject({ status: 404, body: { code: ERROR_CODES.RESOURCE_NOT_FOUND } });

    const declineRecipient = await register('decline-personal@example.invalid');
    const declineInvitation = await owner
      .mutate('post', `/api/projects/${project.id}/invitations`)
      .send({ email: 'decline-personal@example.invalid', role: 'VIEWER' });
    expect(
      (
        await declineRecipient
          .mutate(
            'post',
            `/api/projects/invitations/${declineInvitation.body.invitation.id}/decline`
          )
          .send({})
      ).status
    ).toBe(200);
  });

  it('preserva os estados terminais atuais dos convites pessoais', async () => {
    const owner = await register('owner-terminal-invite@example.invalid');
    const recipient = await register('recipient-terminal-invite@example.invalid');
    const project = await createProject(owner, 'Estados de convite LR1');
    const now = new Date();
    const invitations = await Promise.all([
      prisma.projectInvitation.create({
        data: {
          projectId: project.id,
          email: recipient.user.email,
          role: 'MEMBER',
          tokenHash: 'a'.repeat(64),
          expiresAt: new Date(now.getTime() - 1000),
          createdById: owner.user.id
        }
      }),
      prisma.projectInvitation.create({
        data: {
          projectId: project.id,
          email: recipient.user.email,
          role: 'MEMBER',
          tokenHash: 'b'.repeat(64),
          expiresAt: new Date(now.getTime() + 60000),
          revokedAt: now,
          createdById: owner.user.id
        }
      }),
      prisma.projectInvitation.create({
        data: {
          projectId: project.id,
          email: recipient.user.email,
          role: 'MEMBER',
          tokenHash: 'c'.repeat(64),
          expiresAt: new Date(now.getTime() + 60000),
          acceptedAt: now,
          acceptedById: recipient.user.id,
          createdById: owner.user.id
        }
      }),
      prisma.projectInvitation.create({
        data: {
          projectId: project.id,
          email: recipient.user.email,
          role: 'MEMBER',
          tokenHash: 'd'.repeat(64),
          expiresAt: new Date(now.getTime() + 60000),
          declinedAt: now,
          declinedById: recipient.user.id,
          createdById: owner.user.id
        }
      })
    ]);
    const expected = [
      [410, ERROR_CODES.INVITATION_EXPIRED],
      [409, ERROR_CODES.INVITATION_REVOKED],
      [409, ERROR_CODES.INVITATION_ALREADY_USED],
      [409, ERROR_CODES.INVITATION_DECLINED]
    ];

    for (const [index, invitation] of invitations.entries()) {
      expect(
        await recipient.mutate('post', `/api/projects/invitations/${invitation.id}/accept`).send({})
      ).toMatchObject({ status: expected[index][0], body: { code: expected[index][1] } });
    }
    expect((await recipient.agent.get('/api/projects/invitations/mine')).body.invitations).toEqual(
      []
    );
  });
});
