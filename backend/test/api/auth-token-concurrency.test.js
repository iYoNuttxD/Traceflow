import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let app;
let prisma;
let authService;
let authRepository;

beforeAll(async () => {
  const url = configureTestDatabaseEnvironment();
  deployTestMigrations(url);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ authService } = await import('../../src/modules/auth/auth.service.js'));
  ({ authRepository } = await import('../../src/modules/auth/auth.repository.js'));
  const { default: application } = await import('../../src/app.js');
  app = await startTestServer(application);
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

async function fixture(model) {
  const user = await prisma.user.create({
    data: {
      name: 'Token concurrency fixture',
      username: 'token-concurrency',
      email: 'token-concurrency@example.invalid',
      passwordHash: await authService.hashPassword('InicialSegura123!')
    }
  });
  const token = randomBytes(32).toString('base64url');
  await prisma[model].create({
    data: {
      userId: user.id,
      tokenHash: authService.hashToken(token),
      expiresAt: new Date(Date.now() + 60_000)
    }
  });
  return { user, token };
}

// Hold the two real reads until both have observed the unused token. Database
// writes and HTTP responses remain real; scheduling cannot hide the replay.
async function concurrentTokenReads(method, operations) {
  const original = authRepository[method].bind(authRepository);
  let arrivals = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const spy = vi.spyOn(authRepository, method).mockImplementation(async (...args) => {
    const record = await original(...args);
    arrivals += 1;
    if (arrivals === operations.length) release();
    await gate;
    return record;
  });
  try {
    const results = await Promise.allSettled(
      operations.map((operation) => Promise.resolve(operation).finally(release))
    );
    expect(arrivals).toBe(operations.length);
    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected) throw rejected.reason;
    return results.map((result) => result.value);
  } finally {
    release();
    spy.mockRestore();
  }
}

describe('single-use authentication tokens under concurrency', () => {
  it('confirms only one reset and invalidates the previous sessions', async () => {
    const { user, token } = await fixture('passwordResetToken');
    const session = await authService.issueSession(user);
    const responses = await concurrentTokenReads('findResetToken', [
      request(app).post('/api/auth/reset-password').send({ token, password: 'NovaSeguraA123!' }),
      request(app).post('/api/auth/reset-password').send({ token, password: 'NovaSeguraB123!' })
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 400]);
    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stored.sessionVersion).toBe(user.sessionVersion + 1);
    expect(await authService.authenticate(session.token)).toBeNull();
    expect(await prisma.auditEvent.count({ where: { action: 'PASSWORD_RESET_COMPLETED' } })).toBe(
      1
    );
  });

  it('rejects a reset revoked after the preflight, preserving the confirmed password', async () => {
    const { user, token } = await fixture('passwordResetToken');
    const replacement = await authService.hashPassword('ConfirmadaSegura123!');
    const original = authRepository.findResetToken.bind(authRepository);
    vi.spyOn(authRepository, 'findResetToken').mockImplementationOnce(async (...args) => {
      const record = await original(...args);
      await authRepository.changePassword(user.id, replacement);
      return record;
    });
    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'ObsoletaSegura123!' });
    expect(response.status).toBe(400);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toMatchObject({
      passwordHash: replacement,
      sessionVersion: user.sessionVersion + 1
    });
  });

  it('rolls back the password and token if session revocation fails, allowing a safe retry', async () => {
    const { user, token } = await fixture('passwordResetToken');
    const transaction = prisma.$transaction.bind(prisma);
    const spy = vi.spyOn(prisma, '$transaction').mockImplementationOnce((work, options) =>
      transaction(
        (tx) =>
          work(
            new Proxy(tx, {
              get(target, property) {
                if (property !== 'session') return target[property];
                return {
                  ...target.session,
                  updateMany() {
                    throw new Error('simulated session revocation failure');
                  }
                };
              }
            })
          ),
        options
      )
    );
    const send = () =>
      request(app).post('/api/auth/reset-password').send({ token, password: 'NovaSegura123!' });
    expect((await send()).status).toBe(500);
    spy.mockRestore();
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toMatchObject({
      passwordHash: user.passwordHash,
      sessionVersion: user.sessionVersion
    });
    expect(await prisma.passwordResetToken.findFirst({ where: { userId: user.id } })).toMatchObject(
      {
        usedAt: null
      }
    );
    expect((await send()).status).toBe(200);
  });

  it.each([
    ['passwordResetToken', 'findResetToken', '/api/auth/reset-password'],
    ['emailVerificationToken', 'findEmailVerificationToken', '/api/auth/email-verification/verify']
  ])('rejects %s expiring between preflight and commit', async (model, method, path) => {
    const { user, token } = await fixture(model);
    const original = authRepository[method].bind(authRepository);
    vi.spyOn(authRepository, method).mockImplementationOnce(async (...args) => {
      const record = await original(...args);
      await prisma[model].update({
        where: { id: record.id },
        data: { expiresAt: new Date(Date.now() - 1000) }
      });
      return record;
    });
    const body = model === 'passwordResetToken' ? { token, password: 'NovaSegura123!' } : { token };
    expect((await request(app).post(path).send(body)).status).toBe(400);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toMatchObject({
      passwordHash: user.passwordHash,
      emailVerifiedAt: null,
      sessionVersion: user.sessionVersion
    });
  });

  it('confirms an email verification token once even when both reads see it unused', async () => {
    const { token } = await fixture('emailVerificationToken');
    const responses = await concurrentTokenReads('findEmailVerificationToken', [
      request(app).post('/api/auth/email-verification/verify').send({ token }),
      request(app).post('/api/auth/email-verification/verify').send({ token })
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 400]);
    expect(await prisma.auditEvent.count({ where: { action: 'EMAIL_VERIFIED' } })).toBe(1);
  });

  it('does not verify an email with a token invalidated after the preflight', async () => {
    const { user, token } = await fixture('emailVerificationToken');
    const original = authRepository.findEmailVerificationToken.bind(authRepository);
    vi.spyOn(authRepository, 'findEmailVerificationToken').mockImplementationOnce(
      async (...args) => {
        const record = await original(...args);
        await authRepository.expireEmailVerificationTokens(user.id);
        return record;
      }
    );
    const response = await request(app).post('/api/auth/email-verification/verify').send({ token });
    expect(response.status).toBe(400);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toMatchObject({
      emailVerifiedAt: null
    });
  });
});
