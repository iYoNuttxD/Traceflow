import { beforeAll, afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  configureTestDatabaseEnvironment,
  deployTestMigrations,
  cleanTestDatabase
} from '../helpers/test-database.js';
import { runS104LegacyScheduleDates } from '../../scripts/lib/s104-legacy-schedule-dates.js';
let prisma, settingsRepository;
const originalTimezone = process.env.TZ;
beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ settingsRepository } = await import('../../src/modules/settings/settings.repository.js'));
  await cleanTestDatabase(prisma);
});
afterEach(async () => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
  await cleanTestDatabase(prisma);
});
afterAll(async () => prisma.$disconnect());

describe('remaining transaction boundary contracts', () => {
  it('initializes a first password only with fresh proof, consumes it, and rolls back on audit failure', async () => {
    const now = new Date('2030-01-01T00:10:00Z');
    const cutoff = new Date('2030-01-01T00:00:00Z');
    const user = await prisma.user.create({
      data: {
        name: 'Password fixture',
        username: 'password_fixture',
        email: 'password@example.invalid',
        passwordHash: null,
        githubIdentity: {
          create: { githubUserId: 'fixture-77', githubLogin: 'fixture', lastAuthenticatedAt: now }
        }
      }
    });
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: 'first-password-token',
        csrfTokenHash: 'first-password-csrf',
        sessionVersion: user.sessionVersion,
        expiresAt: new Date('2030-01-02'),
        lastReauthenticatedAt: new Date(cutoff.getTime() - 1)
      }
    });
    const other = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: 'other-password-token',
        csrfTokenHash: 'other-password-csrf',
        sessionVersion: user.sessionVersion,
        expiresAt: new Date('2030-01-02')
      }
    });
    const audit = {
      action: 'LOCAL_PASSWORD_INITIALIZED',
      actorType: 'USER',
      actorUserId: user.id,
      resourceType: 'User',
      resourceId: String(user.id),
      result: 'SUCCESS',
      retentionUntil: new Date('2031-01-01T00:00:00Z')
    };
    const initialize = (auditData = audit) =>
      settingsRepository.initializePassword(
        user.id,
        session.id,
        'artificial-password-hash',
        cutoff,
        now,
        auditData
      );
    expect(await initialize()).toEqual({ status: 'reauth_required' });
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toMatchObject({
      passwordHash: null,
      sessionVersion: user.sessionVersion
    });
    await prisma.session.update({
      where: { id: session.id },
      data: { lastReauthenticatedAt: cutoff }
    });
    await expect(initialize({ ...audit, actorUserId: 2147483647 })).rejects.toMatchObject({
      code: 'P2003'
    });
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toMatchObject({
      passwordHash: null,
      sessionVersion: user.sessionVersion
    });
    expect(await prisma.session.findUnique({ where: { id: session.id } })).toMatchObject({
      lastReauthenticatedAt: cutoff
    });
    expect(await prisma.session.findUnique({ where: { id: other.id } })).toMatchObject({
      revokedAt: null
    });
    expect(await initialize()).toEqual({ status: 'initialized' });
    expect(await prisma.session.findUnique({ where: { id: session.id } })).toMatchObject({
      lastReauthenticatedAt: null,
      revokedAt: null,
      sessionVersion: user.sessionVersion + 1
    });
    expect(await prisma.session.findUnique({ where: { id: other.id } })).toMatchObject({
      revokedAt: now
    });
    expect(await initialize()).toEqual({ status: 'already_set' });
    expect(await prisma.auditEvent.count({ where: { action: audit.action } })).toBe(1);
    // Removing the password simulates another credential lifecycle; consumed proof remains unusable.
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: null } });
    expect(await initialize()).toEqual({ status: 'reauth_required' });
  });

  it('rolls back the real schedule transaction when a later milestone write fails', async () => {
    process.env.TZ = 'America/Sao_Paulo';
    const project = await prisma.project.create({
      data: { name: 'Schedule rollback', responsibleTeam: 'QA', accessCode: 'schedule-rollback' }
    });
    const sprint = await prisma.sprint.create({
      data: {
        projectId: project.id,
        name: 'Legacy',
        startDate: new Date('2026-08-09'),
        endDate: new Date('2026-08-10')
      }
    });
    const milestone = await prisma.milestone.create({
      data: { projectId: project.id, title: 'Legacy milestone', dueDate: new Date('2026-08-09') }
    });
    const failure = new Error('controlled second write failure');
    let observedFirstWrite = false;
    const client = {
      sprint: prisma.sprint,
      milestone: prisma.milestone,
      $transaction: (operation) =>
        prisma.$transaction(async (tx) =>
          operation({
            sprint: {
              update: async (args) => {
                const result = await tx.sprint.update(args);
                observedFirstWrite = true;
                expect(result.startDate).toEqual(new Date('2026-08-09T03:00:00Z'));
                expect(result.startDate).toEqual(args.data.startDate);
                return result;
              }
            },
            milestone: {
              update: async () => {
                expect(observedFirstWrite).toBe(true);
                throw failure;
              }
            }
          })
        )
    };
    await expect(runS104LegacyScheduleDates({ client, apply: true })).rejects.toBe(failure);
    expect(observedFirstWrite).toBe(true);
    expect(await prisma.sprint.findUnique({ where: { id: sprint.id } })).toEqual(sprint);
    expect(await prisma.milestone.findUnique({ where: { id: milestone.id } })).toEqual(milestone);
  });
});
