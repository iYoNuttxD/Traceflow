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
const CLOSED_AGAIN_AT = '2026-10-12T16:00:00Z';
const MERGED_AT = '2026-10-12T14:00:00Z';

let prisma;
let syncProjectGithubData;
let issueRepository;
let pullRequestRepository;
let githubEventRepository;
let traceabilityAlertService;
let sequence = 0;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ syncProjectGithubData } =
    await import('../../src/modules/github/services/sync-project-github.service.js'));
  ({ issueRepository } = await import('../../src/modules/issues/issue.repository.js'));
  ({ pullRequestRepository } =
    await import('../../src/modules/pullRequests/pullRequest.repository.js'));
  ({ githubEventRepository } =
    await import('../../src/modules/notifications/github-event.repository.js'));
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

const mergedPullRequest = (number, overrides = {}) =>
  rawPullRequest(number, 'closed', { closed_at: MERGED_AT, merged_at: MERGED_AT, ...overrides });

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
    listPullRequestLifecycleEventPages: vi.fn(() => pages([])),
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
const eventsOf = (project) =>
  prisma.gitHubArtifactEvent.findMany({
    where: { projectId: project.id },
    include: { targets: { orderBy: { taskId: 'asc' } } },
    orderBy: { id: 'asc' }
  });
const targetIds = (event) => event.targets.map((target) => target.taskId);

describe('S2-03 detecção: linha de base e issue (D2, C1)', () => {
  it('E1 importar, vincular e sincronizar de novo sem mudança não gera evento', async () => {
    const project = await integratedProject();
    const issues = [rawIssue(1, 'open'), rawIssue(2, 'closed')];
    const pullRequests = [rawPullRequest(3, 'open'), mergedPullRequest(4)];
    const first = await sync(project, { issues, pullRequests });
    for (const [number, row] of [
      [1, await issueRow(project, 1)],
      [2, await issueRow(project, 2)]
    ])
      await linkIssue(await createTask(prisma, project.id, { title: `Tarefa ${number}` }), row);
    await linkPullRequest(await createTask(prisma, project.id), await pullRequestRow(project, 3));
    await linkPullRequest(await createTask(prisma, project.id), await pullRequestRow(project, 4));

    const second = await sync(project, { issues, pullRequests });

    expect(first.summary.issues).toMatchObject({ created: 2, updated: 0, transitions: 0 });
    expect(second.summary.issues).toMatchObject({ created: 0, updated: 0, transitions: 0 });
    expect(second.summary.pullRequests).toMatchObject({ updated: 0, transitions: 0 });
    expect(await prisma.gitHubArtifactEvent.count()).toBe(0);
  });

  it('E2 issue vinculada a duas tarefas, de aberta para fechada, gera um ISSUE_CLOSED com o retrato', async () => {
    const project = await integratedProject();
    await sync(project, { issues: [rawIssue(1, 'open')] });
    const issue = await issueRow(project, 1);
    const [first, second] = [
      await createTask(prisma, project.id),
      await createTask(prisma, project.id)
    ];
    await linkIssue(first, issue);
    await linkIssue(second, issue);

    const result = await sync(project, { issues: [rawIssue(1, 'closed')] });

    const events = await eventsOf(project);
    expect(result.summary.issues.transitions).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'ISSUE_CLOSED',
      issueId: issue.id,
      pullRequestId: null,
      artifactNumber: 1,
      artifactTitle: 'Issue 1 · relato',
      artifactUrl: `https://github.com/${OWNER}/${REPOSITORY}/issues/1`,
      occurredAt: new Date(CLOSED_AT),
      linkedTaskCount: 2,
      occurrenceKey: `ISSUE_CLOSED:${issue.id}:${new Date(CLOSED_AT).toISOString()}`,
      status: 'PENDING',
      attempts: 0,
      outcome: null
    });
    expect(targetIds(events[0])).toEqual([first.id, second.id].sort((a, b) => a - b));
    expect(events[0].nextAttemptAt.getTime()).toBe(events[0].detectedAt.getTime());
  });

  it('E3 sincronizar de novo, ou receber a mesma issue duas vezes na mesma sincronização, não duplica', async () => {
    const project = await integratedProject();
    await sync(project, { issues: [rawIssue(1, 'open'), rawIssue(2, 'open')] });
    await linkIssue(await createTask(prisma, project.id), await issueRow(project, 1));
    await linkIssue(await createTask(prisma, project.id), await issueRow(project, 2));

    await sync(project, { issues: [rawIssue(1, 'closed'), rawIssue(2, 'open')] });
    await sync(project, { issues: [rawIssue(1, 'closed'), rawIssue(2, 'open')] });
    await sync(project, {
      issuePages: [[rawIssue(2, 'closed'), rawIssue(1, 'closed')], [rawIssue(2, 'closed')]]
    });

    const events = await eventsOf(project);
    expect(events.map((event) => [event.artifactNumber, event.type])).toEqual([
      [1, 'ISSUE_CLOSED'],
      [2, 'ISSUE_CLOSED']
    ]);
  });

  it('E4 reabrir gera ISSUE_REOPENED; fechar de novo gera outro ISSUE_CLOSED com outra chave', async () => {
    const project = await integratedProject();
    await sync(project, { issues: [rawIssue(1, 'open')] });
    await linkIssue(await createTask(prisma, project.id), await issueRow(project, 1));

    await sync(project, { issues: [rawIssue(1, 'closed')] });
    await sync(project, { issues: [rawIssue(1, 'open', { updated_at: REOPENED_AT })] });
    await sync(project, {
      issues: [rawIssue(1, 'closed', { closed_at: CLOSED_AGAIN_AT, updated_at: CLOSED_AGAIN_AT })]
    });

    const events = await eventsOf(project);
    expect(events.map((event) => [event.type, event.occurredAt.toISOString()])).toEqual([
      ['ISSUE_CLOSED', new Date(CLOSED_AT).toISOString()],
      ['ISSUE_REOPENED', new Date(REOPENED_AT).toISOString()],
      ['ISSUE_CLOSED', new Date(CLOSED_AGAIN_AT).toISOString()]
    ]);
    expect(new Set(events.map((event) => event.occurrenceKey)).size).toBe(3);
  });

  it('E5 fechada para fechada com outra data gera ISSUE_CLOSED; com a mesma data, nada', async () => {
    const project = await integratedProject();
    await sync(project, { issues: [rawIssue(1, 'closed'), rawIssue(2, 'closed')] });
    await linkIssue(await createTask(prisma, project.id), await issueRow(project, 1));
    await linkIssue(await createTask(prisma, project.id), await issueRow(project, 2));

    await sync(project, {
      issues: [rawIssue(1, 'closed', { closed_at: CLOSED_AGAIN_AT }), rawIssue(2, 'closed')]
    });

    const events = await eventsOf(project);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'ISSUE_CLOSED',
      artifactNumber: 1,
      occurredAt: new Date(CLOSED_AGAIN_AT)
    });
  });

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
  it('E7 merge, fechamento sem merge, merge depois de fechada e novo fechamento geram evento; reabertura não', async () => {
    const project = await integratedProject();
    await sync(project, {
      pullRequests: [
        rawPullRequest(10, 'open'),
        rawPullRequest(11, 'open'),
        rawPullRequest(12, 'closed'),
        rawPullRequest(13, 'closed'),
        rawPullRequest(14, 'closed'),
        mergedPullRequest(15)
      ]
    });
    const tasks = {};
    for (const number of [10, 11, 12, 13, 14, 15]) {
      tasks[number] = await createTask(prisma, project.id);
      await linkPullRequest(tasks[number], await pullRequestRow(project, number));
    }
    const anomaly = vi.spyOn(githubEventRepository, 'recordTransitions');

    const result = await sync(project, {
      pullRequests: [
        mergedPullRequest(10),
        rawPullRequest(11, 'closed'),
        mergedPullRequest(12),
        rawPullRequest(13, 'closed', { closed_at: CLOSED_AGAIN_AT }),
        rawPullRequest(14, 'open'),
        rawPullRequest(15, 'open')
      ]
    });

    const events = await eventsOf(project);
    expect(result.summary.pullRequests.transitions).toBe(4);
    expect(events.map((event) => [event.artifactNumber, event.type, targetIds(event)])).toEqual([
      [10, 'PULL_REQUEST_MERGED', [tasks[10].id]],
      [11, 'PULL_REQUEST_CLOSED', [tasks[11].id]],
      [12, 'PULL_REQUEST_MERGED', [tasks[12].id]],
      [13, 'PULL_REQUEST_CLOSED', [tasks[13].id]]
    ]);
    expect(events.every((event) => event.issueId === null && event.pullRequestId !== null)).toBe(
      true
    );
    expect(events[0].occurredAt).toEqual(new Date(MERGED_AT));
    expect(await anomaly.mock.results[0].value).toMatchObject({ anomalies: 1 });
  });

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

describe('S2-03 detecção: atomicidade, concorrência e retrato (D4, D5, C4, C5)', () => {
  it('E9 falha depois de gravar o evento desfaz estado, evento e retrato; a sincronização seguinte detecta uma vez', async () => {
    const project = await integratedProject();
    await sync(project, { issues: [rawIssue(1, 'open')] });
    await linkIssue(await createTask(prisma, project.id), await issueRow(project, 1));
    const original = githubEventRepository.recordTransitions;
    vi.spyOn(githubEventRepository, 'recordTransitions').mockImplementationOnce(async (...args) => {
      await original.apply(githubEventRepository, args);
      throw new Error('falha injetada depois da gravação do evento');
    });

    await expect(sync(project, { issues: [rawIssue(1, 'closed')] })).rejects.toThrow(
      'falha injetada'
    );
    expect((await issueRow(project, 1)).state).toBe('open');
    expect(await prisma.gitHubArtifactEvent.count()).toBe(0);
    expect(await prisma.gitHubArtifactEventTask.count()).toBe(0);

    await sync(project, { issues: [rawIssue(1, 'closed')] });
    expect((await eventsOf(project)).map((event) => event.type)).toEqual(['ISSUE_CLOSED']);
  });

  it('E10 duas gravações simultâneas da mesma transição geram um evento só', async () => {
    const project = await integratedProject();
    await sync(project, { issues: [rawIssue(1, 'open')] });
    await linkIssue(await createTask(prisma, project.id), await issueRow(project, 1));
    const closed = [{ ...mapGithubIssue(rawIssue(1, 'closed')), projectId: project.id }];

    const results = await Promise.all([
      issueRepository.upsertMany(closed),
      issueRepository.upsertMany(closed)
    ]);

    expect(results.map((result) => result.transitions).sort()).toEqual([0, 1]);
    expect(await prisma.gitHubArtifactEvent.count()).toBe(1);
  });

  it('E11 o retrato é o da transição: vínculo posterior não entra, vínculo removido antes não conta', async () => {
    const project = await integratedProject();
    await sync(project, { issues: [rawIssue(1, 'open'), rawIssue(2, 'open')] });
    const [before, after, removed] = [
      await createTask(prisma, project.id),
      await createTask(prisma, project.id),
      await createTask(prisma, project.id)
    ];
    await linkIssue(before, await issueRow(project, 1));
    await linkIssue(removed, await issueRow(project, 2));
    await prisma.taskIssue.deleteMany({ where: { taskId: removed.id } });

    await sync(project, { issues: [rawIssue(1, 'closed'), rawIssue(2, 'closed')] });
    await linkIssue(after, await issueRow(project, 1));
    await prisma.taskIssue.deleteMany({ where: { taskId: before.id } });

    const events = await eventsOf(project);
    expect(events).toHaveLength(1);
    expect(events[0].artifactNumber).toBe(1);
    expect(targetIds(events[0])).toEqual([before.id]);
  });

  it('E12 tarefa de outro projeto nunca entra no retrato, nem com vínculo forjado no banco', async () => {
    const project = await integratedProject();
    const other = await createProject(prisma);
    await sync(project, { issues: [rawIssue(1, 'open'), rawIssue(2, 'open')] });
    const own = await createTask(prisma, project.id);
    const foreign = await createTask(prisma, other.id);
    await linkIssue(own, await issueRow(project, 1));
    await linkIssue(foreign, await issueRow(project, 1));
    await linkIssue(foreign, await issueRow(project, 2));

    await sync(project, { issues: [rawIssue(1, 'closed'), rawIssue(2, 'closed')] });

    const events = await eventsOf(project);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ artifactNumber: 1, linkedTaskCount: 1 });
    expect(targetIds(events[0])).toEqual([own.id]);
  });

  it('E13 estado legado nulo não gera evento, e nada do GitHub cru chega à fila (C6)', async () => {
    const project = await integratedProject();
    await sync(project, { issues: [rawIssue(1, 'open'), rawIssue(2, 'open')] });
    await linkIssue(await createTask(prisma, project.id), await issueRow(project, 1));
    await linkIssue(await createTask(prisma, project.id), await issueRow(project, 2));
    await prisma.issue.update({
      where: { id: (await issueRow(project, 2)).id },
      data: { state: null }
    });

    await sync(project, { issues: [rawIssue(1, 'closed'), rawIssue(2, 'closed')] });

    const events = await eventsOf(project);
    expect(events.map((event) => event.artifactNumber)).toEqual([1]);
    const serialized = JSON.stringify(events);
    for (const raw of [
      'ghs_',
      'corpo da issue',
      'autor-github-s203',
      'responsavel-github-s203',
      'rotulo-s203'
    ])
      expect(serialized).not.toContain(raw);
    expect((await issueRow(project, 1)).description).toBe('corpo da issue com dado sensível');
  });

  it('E14 uma página de 100 PRs com 100 transições cabe com folga no tempo da transação', async () => {
    const project = await integratedProject();
    const numbers = Array.from({ length: 100 }, (_, index) => 100 + index);
    await sync(project, { pullRequests: numbers.map((number) => rawPullRequest(number, 'open')) });
    for (const number of numbers)
      await linkPullRequest(
        await createTask(prisma, project.id),
        await pullRequestRow(project, number)
      );
    const page = (build) =>
      numbers.map((number) => ({ ...mapGithubPullRequest(build(number)), projectId: project.id }));

    let startedAt = Date.now();
    const unchanged = await pullRequestRepository.upsertMany(
      page((number) => rawPullRequest(number, 'open'))
    );
    const withoutTransitionsMs = Date.now() - startedAt;
    startedAt = Date.now();
    const changed = await pullRequestRepository.upsertMany(
      page((number) => mergedPullRequest(number))
    );
    const withTransitionsMs = Date.now() - startedAt;

    expect(unchanged.transitions).toBe(0);
    expect(changed.transitions).toBe(100);
    expect(await prisma.gitHubArtifactEventTask.count()).toBe(100);
    expect(withoutTransitionsMs, `sem transições: ${withoutTransitionsMs} ms`).toBeLessThan(4000);
    expect(withTransitionsMs, `com 100 transições: ${withTransitionsMs} ms`).toBeLessThan(4000);
  });
});

describe('S2-03 detecção: estado regravado por fora (D5)', () => {
  it('E15 a mesma transição detectada de novo depois de uma regravação externa não duplica nem derruba a sincronização', async () => {
    const project = await integratedProject();
    await sync(project, { issues: [rawIssue(1, 'open')] });
    await linkIssue(await createTask(prisma, project.id), await issueRow(project, 1));
    await sync(project, { issues: [rawIssue(1, 'closed')] });
    await prisma.issue.update({
      where: { id: (await issueRow(project, 1)).id },
      data: { state: 'open', closedAtGithub: null }
    });

    const again = await sync(project, { issues: [rawIssue(1, 'closed')] });

    expect(again.summary.issues.transitions).toBe(0);
    expect((await eventsOf(project)).map((event) => event.type)).toEqual(['ISSUE_CLOSED']);
    expect((await issueRow(project, 1)).state).toBe('closed');
  });
});
