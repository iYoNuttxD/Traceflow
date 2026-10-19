import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createTask } from '../fixtures/factories.js';
import { mapGithubIssue, mapGithubPullRequest } from '../../src/modules/github/github.mapper.js';

const boundary = vi.hoisted(() => ({ client: null }));
vi.mock('../../src/modules/github/github.client.js', () => ({
  githubInstallationClientFactory: { forInstallation: () => boundary.client }
}));

const OWNER = 'usuario-s203';
const REPOSITORY = 'repositorio-s203';
const PROJECT_CREATED_AT = new Date('2026-08-01T12:00:00.000Z');
const OPENED_AT = '2026-10-01T10:00:00Z';
const UPDATED_AT = '2026-10-12T11:00:00Z';
const CLOSED_AT = '2026-10-12T13:00:00Z';
const REOPENED_AT = '2026-10-12T15:00:00Z';

let prisma;
let syncProjectGithubData;
let traceabilityAlertService;
let sequence = 0;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ syncProjectGithubData } =
    await import('../../src/modules/github/services/sync-project-github.service.js'));
  ({ traceabilityAlertService } =
    await import('../../src/modules/traceability/traceability-alert.service.js'));
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

async function* pages(...values) {
  for (const value of values) yield value;
}

const rawIssue = (number, state, overrides = {}) => ({
  id: 50000 + number,
  number,
  title: `Issue ${number} · relato`,
  body: 'corpo da issue com dado sensível',
  state,
  user: { login: 'autor-github-s203' },
  assignee: { login: 'responsavel-github-s203' },
  labels: [{ id: 1, name: 'rotulo-s203', color: 'ff0000', description: null }],
  milestone: null,
  html_url: `https://github.com/${OWNER}/${REPOSITORY}/issues/${number}`,
  created_at: OPENED_AT,
  updated_at: UPDATED_AT,
  closed_at: state === 'closed' ? CLOSED_AT : null,
  token: 'ghs_tokenquenuncadevevazar',
  ...overrides
});

const rawPullRequest = (number, state, overrides = {}) => ({
  id: 70000 + number,
  number,
  title: `PR ${number} · ajuste`,
  body: 'corpo da PR com dado sensível',
  state,
  user: { login: 'autor-github-s203' },
  head: { ref: `feature/${number}` },
  base: { ref: 'trunk' },
  html_url: `https://github.com/${OWNER}/${REPOSITORY}/pull/${number}`,
  created_at: OPENED_AT,
  updated_at: UPDATED_AT,
  closed_at: state === 'closed' ? CLOSED_AT : null,
  merged_at: null,
  token: 'ghs_tokenquenuncadevevazar',
  ...overrides
});

function githubDouble(project, { issuePages = [[]], pullRequestPages = [[]] } = {}) {
  return {
    getRepository: vi.fn().mockResolvedValue({
      githubRepositoryId: project.repositoryId,
      name: REPOSITORY,
      owner: OWNER,
      fullName: `${OWNER}/${REPOSITORY}`,
      url: `https://github.com/${OWNER}/${REPOSITORY}`,
      defaultBranch: 'trunk',
      private: true,
      description: null
    }),
    listBranchPages: vi.fn(() => pages([{ name: 'trunk', headSha: 'trunk-head' }])),
    listCommitPages: vi.fn(() => pages([])),
    listPullRequestPages: vi.fn(() =>
      pages(...pullRequestPages.map((page) => page.map(mapGithubPullRequest)))
    ),
    listRepositoryEventPages: vi.fn(() => pages([])),
    listIssuePages: vi.fn(() =>
      pages(...issuePages.map((page) => page.map(mapGithubIssue).filter(Boolean)))
    )
  };
}

async function integratedProject() {
  sequence += 1;
  const installation = await prisma.gitHubInstallation.create({
    data: {
      githubInstallationId: `s203-detect-${sequence}`,
      accountId: `s203-account-${sequence}`,
      accountLogin: OWNER,
      accountType: 'User',
      installedAt: new Date(),
      status: 'ACTIVE'
    }
  });
  const project = await createProject(prisma, { createdAt: PROJECT_CREATED_AT });
  const repositoryId = String(93000 + sequence);
  await prisma.projectGitHubIntegration.create({
    data: {
      projectId: project.id,
      installationId: installation.id,
      githubRepositoryId: repositoryId,
      repositoryName: REPOSITORY,
      repositoryFullName: `${OWNER}/${REPOSITORY}`,
      repositoryUrl: `https://github.com/${OWNER}/${REPOSITORY}`,
      defaultBranch: 'trunk',
      status: 'ACTIVE'
    }
  });
  return { ...project, repositoryId };
}

function sync(project, { issues, pullRequests, issuePages, pullRequestPages } = {}) {
  boundary.client = githubDouble(project, {
    issuePages: issuePages || [issues || []],
    pullRequestPages: pullRequestPages || [pullRequests || []]
  });
  return syncProjectGithubData(project.id);
}

const issueRow = (project, number) =>
  prisma.issue.findUnique({ where: { projectId_number: { projectId: project.id, number } } });
const pullRequestRow = (project, number) =>
  prisma.pullRequest.findUnique({ where: { projectId_number: { projectId: project.id, number } } });
const linkIssue = (task, issue) =>
  prisma.taskIssue.create({ data: { taskId: task.id, issueId: issue.id } });
const linkPullRequest = (task, pullRequest) =>
  prisma.task.update({ where: { id: task.id }, data: { pullRequestId: pullRequest.id } });

describe('S2-03 detecção: linha de base e issue (D2, C1)', () => {
  it('E6 issue sem vínculo fechada não gera evento e continua virando alerta do S2-01', async () => {
    const project = await integratedProject();
    await sync(project, { issues: [rawIssue(1, 'open')] });

    await sync(project, { issues: [rawIssue(1, 'closed')] });
    await traceabilityAlertService.reconcileProject(project.id, {
      dryRun: false,
      trigger: 'MANUAL'
    });

    expect(await prisma.gitHubArtifactEvent.count()).toBe(0);
    expect(
      await prisma.traceabilityAlert.findMany({
        where: { projectId: project.id },
        select: { type: true, status: true }
      })
    ).toEqual([{ type: 'ISSUE_CLOSED_WITHOUT_TASK', status: 'OPEN' }]);
  });
});

describe('S2-03 detecção: pull request (D2, C2)', () => {
  it('E8 mudança só de título, corpo, rótulo, autor ou branch não gera evento', async () => {
    const project = await integratedProject();
    await sync(project, {
      issues: [rawIssue(1, 'open')],
      pullRequests: [rawPullRequest(2, 'open')]
    });
    await linkIssue(await createTask(prisma, project.id), await issueRow(project, 1));
    await linkPullRequest(await createTask(prisma, project.id), await pullRequestRow(project, 2));

    await sync(project, {
      issues: [
        rawIssue(1, 'open', {
          title: 'Título novo',
          body: 'outro corpo',
          labels: [],
          user: { login: 'outra-pessoa' },
          updated_at: REOPENED_AT
        })
      ],
      pullRequests: [
        rawPullRequest(2, 'open', { title: 'Outro título', head: { ref: 'feature/outra' } })
      ]
    });

    expect(await prisma.gitHubArtifactEvent.count()).toBe(0);
    expect((await issueRow(project, 1)).title).toBe('Título novo');
  });
});
