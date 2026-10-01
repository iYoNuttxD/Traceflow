import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let prisma;
let cleanupAuthRecords;
let runPrivacyRetention;
const now = new Date('2030-02-01T00:00:00.000Z');
const cutoff = new Date('2030-01-02T00:00:00.000Z');
const old = new Date('2030-01-01T23:59:59.999Z');
const future = new Date('2030-03-01T00:00:00.000Z');

beforeAll(async () => {
  const url = configureTestDatabaseEnvironment();
  deployTestMigrations(url);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ cleanupAuthRecords } = await import('../../src/shared/maintenance/auth-cleanup.js'));
  ({ runPrivacyRetention } = await import('../../src/shared/maintenance/privacy-retention.js'));
});
beforeEach(() => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function createUser() {
  return prisma.user.create({
    data: {
      name: 'Maintenance fixture',
      username: 'maintenance-fixture',
      email: 'maintenance@example.invalid',
      passwordHash: null
    }
  });
}

async function ids(model) {
  return (await model.findMany({ select: { id: true }, orderBy: { id: 'asc' } })).map(
    ({ id }) => id
  );
}

describe('maintenance retention against real persisted rows', () => {
  it('auth dry-run preserves every session; apply removes only old expired or revoked sessions', async () => {
    const user = await createUser();
    const fixtures = [
      { label: 'active', expiresAt: future, revokedAt: null },
      { label: 'recently-expired', expiresAt: new Date('2030-01-31T00:00:00Z'), revokedAt: null },
      { label: 'expiry-boundary', expiresAt: cutoff, revokedAt: null },
      { label: 'revocation-boundary', expiresAt: future, revokedAt: cutoff },
      { label: 'recently-revoked', expiresAt: future, revokedAt: new Date('2030-01-31T00:00:00Z') },
      { label: 'old-expired', expiresAt: old, revokedAt: null },
      { label: 'old-revoked', expiresAt: future, revokedAt: old }
    ];
    const records = [];
    for (const { label, ...dates } of fixtures) {
      records.push(
        await prisma.session.create({
          data: {
            userId: user.id,
            tokenHash: `fixture-${label}`,
            csrfTokenHash: 'fixture-csrf',
            sessionVersion: 1,
            ...dates
          }
        })
      );
    }
    const configuration = {
      sessionRetentionDays: 30,
      passwordResetRetentionDays: 7,
      invitationRetentionDays: 30,
      emailVerificationRetentionDays: 7,
      githubConnectionStateRetentionDays: 7,
      githubWebhookDeliveryRetentionDays: 30
    };
    const options = { client: prisma, configuration, now };
    expect(await cleanupAuthRecords(options)).toMatchObject({
      mode: 'dry-run',
      counts: { sessions: 2 }
    });
    expect(await ids(prisma.session)).toEqual(records.map(({ id }) => id));
    expect(await cleanupAuthRecords({ ...options, apply: true })).toMatchObject({
      mode: 'apply',
      counts: { sessions: 2 }
    });
    const retained = records.slice(0, 5).map(({ id }) => id);
    expect(await ids(prisma.session)).toEqual(retained);
    expect(await cleanupAuthRecords({ ...options, apply: true })).toMatchObject({
      counts: { sessions: 0 }
    });
    expect(await ids(prisma.session)).toEqual(retained);
  });

  it('privacy cleanup preserves pending/recent/boundary records and records actual deletion counts', async () => {
    const user = await createUser();
    const requests = [];
    // Each terminal status has both an expired and a still-retained row.
    for (const status of ['PENDING', 'COMPLETED', 'CANCELLED', 'REJECTED']) {
      for (const updatedAt of [old, cutoff, now]) {
        requests.push(
          await prisma.privacyRequest.create({
            data: {
              userId: user.id,
              type: 'DATA_EXPORT',
              status,
              updatedAt
            }
          })
        );
      }
    }
    const expirations = [new Date('2030-01-31T23:59:59.999Z'), now, future];
    const audits = [];
    const exports = [];
    for (const expiresAt of expirations) {
      audits.push(
        await prisma.auditEvent.create({
          data: {
            actorType: 'SYSTEM',
            action: 'FIXTURE',
            resourceType: 'Maintenance',
            retentionUntil: expiresAt
          }
        })
      );
      exports.push(
        await prisma.personalDataExport.create({
          data: {
            userId: user.id,
            status: 'COMPLETED',
            expiresAt
          }
        })
      );
    }
    const options = {
      client: prisma,
      now,
      configuration: { privacyRequestRetentionDays: 30, auditRetentionDays: 365 }
    };
    const counts = { auditEvents: 1, privacyRequests: 3, personalDataExports: 1 };
    expect(await runPrivacyRetention(options)).toEqual({ mode: 'dry-run', counts });
    expect(await ids(prisma.privacyRequest)).toEqual(requests.map(({ id }) => id));
    expect(await ids(prisma.auditEvent)).toEqual(audits.map(({ id }) => id));
    expect(await ids(prisma.personalDataExport)).toEqual(exports.map(({ id }) => id));

    expect(await runPrivacyRetention({ ...options, apply: true })).toEqual({
      mode: 'apply',
      counts
    });
    // Fixture positions, rather than the production filter, define the expected survivors.
    const retainedRequests = [0, 1, 2, 4, 5, 7, 8, 10, 11].map((index) => requests[index].id);
    expect(await ids(prisma.privacyRequest)).toEqual(retainedRequests);
    expect(await ids(prisma.personalDataExport)).toEqual([exports[1].id, exports[2].id]);
    expect(
      await prisma.auditEvent.findMany({
        where: { action: 'FIXTURE' },
        select: { id: true },
        orderBy: { id: 'asc' }
      })
    ).toEqual([{ id: audits[1].id }, { id: audits[2].id }]);
    const events = await prisma.auditEvent.findMany({
      where: { action: 'RETENTION_CLEANUP_EXECUTED' }
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorType: 'SYSTEM',
      result: 'SUCCESS',
      metadataJson: { count: 5 },
      retentionUntil: new Date('2031-02-01T00:00:00Z')
    });

    expect(await runPrivacyRetention({ ...options, apply: true })).toEqual({
      mode: 'apply',
      counts: { auditEvents: 0, privacyRequests: 0, personalDataExports: 0 }
    });
    expect(await ids(prisma.privacyRequest)).toEqual(retainedRequests);
    expect(await ids(prisma.personalDataExport)).toEqual([exports[1].id, exports[2].id]);
    expect(await prisma.auditEvent.count({ where: { action: 'FIXTURE' } })).toBe(2);
    expect(
      (
        await prisma.auditEvent.findMany({
          where: { action: 'RETENTION_CLEANUP_EXECUTED' },
          orderBy: { id: 'asc' }
        })
      ).map(({ metadataJson }) => metadataJson)
    ).toEqual([{ count: 5 }, { count: 0 }]);
  });
});
