import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createTask } from '../fixtures/factories.js';

const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}));
vi.mock('../../src/shared/logger/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  logger: loggerMock
}));

const NOW = new Date('2026-10-20T12:00:00.000Z');
const OCCURRED = new Date('2026-10-20T10:00:00.000Z');
const MINUTE = 60_000;
const at = (ms) => new Date(NOW.getTime() + ms);
const PROJECT_CREATED_AT = new Date('2026-08-01T12:00:00.000Z');

let prisma;
let issueRepository;
let githubEventRepository;
let createGithubEventNotificationService;
let sequence = 0;

beforeAll(async () => {
  const testDatabaseUrl = configureTestDatabaseEnvironment();
  deployTestMigrations(testDatabaseUrl);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ issueRepository } = await import('../../src/modules/issues/issue.repository.js'));
  ({ githubEventRepository } =
    await import('../../src/modules/notifications/github-event.repository.js'));
  ({ createGithubEventNotificationService } =
    await import('../../src/modules/notifications/github-event-notification.service.js'));
  await cleanTestDatabase(prisma);
}, 60000);

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

const service = (now = NOW, overrides = {}) =>
  createGithubEventNotificationService({
    clock: () => now,
    configuration: { githubEventNotificationsLookbackDays: 7 },
    ...overrides
  });
const runJob = (now = NOW, options = {}, overrides = {}) =>
  service(now, overrides).runJob({ dryRun: false, ...options });

async function person(projectId, { role = 'MEMBER', isActive = true } = {}) {
  sequence += 1;
  const user = await prisma.user.create({
    data: {
      name: `Pessoa correção ${sequence}`,
      username: `s203cor${sequence}`,
      email: `s203-cor-${sequence}@example.invalid`
    }
  });
  if (projectId)
    await prisma.projectMembership.create({
      data: { projectId, userId: user.id, role, isActive }
    });
  return user;
}

const newProject = (overrides = {}) =>
  createProject(prisma, { createdAt: PROJECT_CREATED_AT, ...overrides });

function issueRow(project, number) {
  return prisma.issue.create({
    data: {
      projectId: project.id,
      githubId: `s203-cor-issue-${project.id}-${number}`,
      number,
      title: `Issue ${number}`,
      labels: [],
      githubUrl: `https://github.com/usuario-s203/repositorio-s203/issues/${number}`,
      state: 'open',
      closedAtGithub: null
    }
  });
}

const issueItem = (issue, received) => ({
  projectId: issue.projectId,
  githubId: issue.githubId,
  number: issue.number,
  title: issue.title,
  githubUrl: issue.githubUrl,
  labels: [],
  closedAtGithub: null,
  updatedAtGithub: OCCURRED,
  ...received
});

const closeIssue = (issue, { when = OCCURRED, detectedAt = NOW } = {}) =>
  issueRepository.upsertMany([issueItem(issue, { state: 'closed', closedAtGithub: when })], {
    detectedAt
  });

const eventsOf = (projectId) =>
  prisma.gitHubArtifactEvent.findMany({
    where: { projectId },
    include: { targets: { orderBy: { taskId: 'asc' } } },
    orderBy: { id: 'asc' }
  });
const recipientsOf = async (where = {}) =>
  (await prisma.notification.findMany({ where, select: { recipientUserId: true } }))
    .map((row) => row.recipientUserId)
    .sort((left, right) => left - right);

async function linkedIssueScenario() {
  const project = await newProject();
  const responsible = await person(project.id);
  const task = await createTask(prisma, project.id, { responsibleUserId: responsible.id });
  sequence += 1;
  const issue = await issueRow(project, sequence);
  await prisma.taskIssue.create({ data: { taskId: task.id, issueId: issue.id } });
  return { project, responsible, task, issue };
}

describe('S2-03 correções — Fase 0: comportamento descrito na regra (S203-A13 a, c)', () => {
  it('C0-01 a primeira sincronização depois da implantação gera evento para a transição desde a anterior; a primeira observação não gera', async () => {
    const { project, responsible, issue } = await linkedIssueScenario();
    const firstSeen = {
      projectId: project.id,
      githubId: `s203-cor-issue-nova-${project.id}`,
      number: 9000,
      title: 'Issue vista pela primeira vez',
      githubUrl: 'https://github.com/usuario-s203/repositorio-s203/issues/9000',
      labels: [],
      state: 'closed',
      closedAtGithub: OCCURRED,
      updatedAtGithub: OCCURRED
    };

    await issueRepository.upsertMany(
      [issueItem(issue, { state: 'closed', closedAtGithub: OCCURRED }), firstSeen],
      { detectedAt: NOW }
    );

    const events = await eventsOf(project.id);
    expect(events.map((event) => [event.type, event.artifactNumber])).toEqual([
      ['ISSUE_CLOSED', issue.number]
    ]);
    await runJob();
    expect(await recipientsOf({ projectId: project.id })).toEqual([responsible.id]);
  });

  it('C0-02 depois de uma retomada, created + alreadyNotified = eligible e a cobertura pela soma é 100%', async () => {
    const { project, issue } = await linkedIssueScenario();
    await closeIssue(issue);
    vi.spyOn(githubEventRepository, 'finish').mockRejectedValueOnce(new Error('queda'));
    vi.spyOn(githubEventRepository, 'release').mockRejectedValueOnce(new Error('queda'));

    await runJob();
    vi.restoreAllMocks();
    await runJob(at(3 * MINUTE));

    const [event] = await eventsOf(project.id);
    const { created, alreadyNotified, eligible } = event.outcome;
    expect(event.status).toBe('DISPATCHED');
    expect({ created, alreadyNotified, eligible }).toEqual({
      created: 0,
      alreadyNotified: 1,
      eligible: 1
    });
    expect(((created + alreadyNotified) / eligible) * 100).toBe(100);
    expect(await prisma.notification.count()).toBe(1);
  });
});
