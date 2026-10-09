import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let prisma;
let app;
const asOf = new Date('2026-09-30T12:00:00Z');
const futurePeriod = 'startDate=2026-10-01&endDate=2026-10-02&timeZone=UTC';
const token = 'health-future-period';

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
  app = await startTestServer(app);
  await cleanTestDatabase(prisma);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  if (prisma) {
    await cleanTestDatabase(prisma);
    await prisma.$disconnect();
  }
});

async function fixture({ github = false } = {}) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(asOf);
  const user = await prisma.user.create({
    data: {
      name: 'Health regression',
      username: 'health_future',
      email: 'health-future@example.invalid',
      emailVerifiedAt: asOf
    }
  });
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      csrfTokenHash: createHash('sha256').update('health-future-csrf').digest('hex'),
      sessionVersion: user.sessionVersion,
      expiresAt: new Date(asOf.getTime() + 600000)
    }
  });
  const project = await prisma.project.create({
    data: {
      name: 'Future-period health',
      responsibleTeam: 'QA',
      accessCode: 'HEALTH-FUTURE',
      memberships: { create: { userId: user.id, role: 'OWNER' } }
    }
  });
  const requirement = await prisma.requirement.create({
    data: { projectId: project.id, title: 'Current requirement' }
  });
  await prisma.task.create({
    data: {
      projectId: project.id,
      requirementId: requirement.id,
      title: 'Current task',
      responsibleUserId: user.id,
      estimatedEffort: 4
    }
  });
  const testCase = await prisma.testCase.create({
    data: {
      projectId: project.id,
      requirementId: requirement.id,
      title: 'Current passing case',
      preconditions: 'Ready',
      expectedResult: 'Works',
      responsibleUserId: user.id
    }
  });
  const version = await prisma.testCaseVersion.create({
    data: { testCaseId: testCase.id, version: 1, snapshotJson: { title: testCase.title } }
  });
  const commit = await prisma.commit.create({
    data: { projectId: project.id, hash: 'a'.repeat(40) }
  });
  await prisma.testExecution.create({
    data: {
      projectId: project.id,
      testCaseId: testCase.id,
      testCaseVersionId: version.id,
      testCaseVersion: 1,
      environment: 'LOCAL',
      result: 'PASS',
      testedReferenceType: 'COMMIT',
      testedCommitId: commit.id,
      testedReferenceSnapshot: { hash: commit.hash },
      executedByDisplayNameSnapshot: 'Artificial executor',
      executedAt: new Date('2026-09-30T08:00:00Z')
    }
  });
  if (github)
    await prisma.projectGitHubIntegration.create({
      data: {
        projectId: project.id,
        status: 'ACTIVE',
        lastSyncAt: asOf,
        lastSyncStatus: 'SINCRONIZADO',
        pullRequestLifecycleCoverageFrom: new Date('2026-09-01T00:00:00Z'),
        pullRequestLifecycleSyncedAt: asOf
      }
    });
  return project;
}

async function dashboard(projectId, selection) {
  const response = await request(app)
    .get(`/api/projects/${projectId}/indicators/dashboard?${futurePeriod}&${selection}`)
    .set('Cookie', `traceflow_session=${token}`);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body;
}

describe('Project Health with an entirely future period', () => {
  it('keeps current TestCase health independent of GENERAL, CUSTOM and category widgets', async () => {
    const project = await fixture();
    const general = await dashboard(project.id, 'view=GENERAL');
    for (const selection of [
      'view=CUSTOM&widgets=I52&includeProjectHealth=false',
      'view=CUSTOM&widgets=I53',
      'view=CUSTOM&widgets=I49,I52,I58',
      'view=QUALITY&includeProjectHealth=true'
    ]) {
      const response = await dashboard(project.id, selection);
      expect(response.projectHealth, selection).toEqual(general.projectHealth);
    }
    expect(general.projectHealth).toMatchObject({
      score: null,
      status: 'UNASSESSED',
      coverage: 58.46,
      calculatedAt: asOf.toISOString(),
      window: null,
      assessments: {
        I52: { score: 100, status: 'HEALTHY', basis: { pass: 1, total: 1 } }
      }
    });
    // Without GitHub, technical signals and I63's technical comparison are inapplicable.
    // Coverage is (20 planning + 15 traceability + 25 * (40/85)) / 80 = 58.46%.
    expect(general.projectHealth.dimensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'PLANNING', coverage: 100 }),
        expect.objectContaining({
          id: 'TRACEABILITY',
          coverage: 100,
          assessedSignals: ['I61']
        }),
        expect.objectContaining({
          id: 'QUALITY',
          coverage: 47.06,
          assessedSignals: ['I52', 'I64']
        })
      ])
    );
    for (const metricId of ['I04', 'I15', 'I20', 'I21', 'I49', 'I58'])
      expect(general.projectHealth.assessments[metricId]).toMatchObject({
        score: null,
        status: 'UNASSESSED'
      });
  });

  it('keeps the current empty PR queue independent of selected GitHub widgets', async () => {
    const project = await fixture({ github: true });
    const general = await dashboard(project.id, 'view=GENERAL');
    for (const selection of [
      'view=CUSTOM&widgets=I10',
      'view=CUSTOM&widgets=I04,I15,I73',
      'view=GITHUB&includeProjectHealth=true'
    ]) {
      const response = await dashboard(project.id, selection);
      expect(response.projectHealth, selection).toEqual(general.projectHealth);
    }
    expect(general.projectHealth.assessments.I73).toMatchObject({
      score: 100,
      status: 'HEALTHY',
      reasonCode: 'NO_OPEN_PRS'
    });
  });
});
