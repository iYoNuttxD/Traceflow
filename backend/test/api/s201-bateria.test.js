import { startTestServer } from '../helpers/http-server.js';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import {
  createCommit,
  createIssue,
  createProject,
  createPullRequest,
  createTask
} from '../fixtures/factories.js';

const githubBoundary = vi.hoisted(() => ({ client: null }));
vi.mock('../../src/modules/github/github.client.js', () => ({
  githubInstallationClientFactory: { forInstallation: () => githubBoundary.client }
}));

let app;
let prisma;
let githubAppService;
let alertService;
let alertRepository;
let sequence = 0;
const password = 'SenhaSegura123';
const FUTURE = new Date('2099-01-10T09:30:00.000Z');
const REASON = 'Justificativa válida para a bateria.';
const ALERT_KEYS = [
  'detectedAt',
  'dismissal',
  'id',
  'limitations',
  'occurredAt',
  'resolutionReason',
  'resolvedAt',
  'status',
  'subject',
  'type'
];

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ githubAppService } = await import('../../src/modules/github/github-app.service.js'));
  ({ traceabilityAlertService: alertService } =
    await import('../../src/modules/traceability/traceability-alert.service.js'));
  ({ traceabilityAlertRepository: alertRepository } =
    await import('../../src/modules/traceability/traceability-alert.repository.js'));
  ({ default: app } = await import('../../src/app.js'));
  app = await startTestServer(app);
  await cleanTestDatabase(prisma);
}, 60000);
beforeEach(() => vi.restoreAllMocks());
afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function register(role, projectId) {
  sequence += 1;
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: `Pessoa bateria ${sequence}`,
    username: `s201bat${sequence}`,
    email: `s201-bateria-${sequence}@example.invalid`,
    password
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: response.body.emailVerification.testToken });
  if (projectId)
    await prisma.projectMembership.create({
      data: { projectId, userId: response.body.user.id, role }
    });
  return {
    agent,
    user: response.body.user,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', response.body.csrfToken)
  };
}

const integrated = () =>
  createProject(prisma, { githubOwner: 'traceflow', githubRepo: `bateria-${(sequence += 1)}` });
const base = (projectId) => `/api/projects/${projectId}/traceability`;

async function list(auth, projectId, query = {}) {
  const response = await auth.agent.get(`${base(projectId)}/alerts`).query(query);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body;
}

const openAlerts = async (auth, projectId) => (await list(auth, projectId)).alerts;
const resolvedAlerts = async (auth, projectId) =>
  (await list(auth, projectId, { status: 'RESOLVED' })).alerts;

async function newTask(member, projectId, title = `Tarefa ${(sequence += 1)}`) {
  const response = await member.mutate('post', `/api/projects/${projectId}/tasks`).send({ title });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.task;
}

async function setStatus(member, taskId, status) {
  const response = await member.mutate('patch', `/api/tasks/${taskId}/status`).send({ status });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
}

async function moveTask(member, taskId, toStatus) {
  const response = await member.mutate('patch', `/api/tasks/${taskId}/move`).send({ toStatus });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
}

async function expectStatus(promise, status) {
  const response = await promise;
  expect(response.status, JSON.stringify(response.body)).toBe(status);
  return response;
}

const dismiss = (auth, projectId, alertId, body = { reason: REASON }) =>
  auth.mutate('post', `${base(projectId)}/alerts/${alertId}/dismiss`).send(body);
const reconcile = (auth, projectId) =>
  auth.mutate('post', `${base(projectId)}/alerts/reconcile`).send({});

async function issueAlert(projectId, auth) {
  await createIssue(prisma, projectId, { state: 'closed', closedAtGithub: FUTURE });
  await expectStatus(reconcile(auth, projectId), 200);
  const [alert] = await openAlerts(auth, projectId);
  return alert;
}

const repository = {
  githubRepositoryId: '9301',
  name: 'repositorio-bateria',
  owner: 'usuario-bateria',
  fullName: 'usuario-bateria/repositorio-bateria',
  url: 'https://github.com/usuario-bateria/repositorio-bateria',
  defaultBranch: 'trunk',
  private: true,
  description: 'Repositório artificial da bateria'
};

async function* pages(...values) {
  for (const value of values) yield value;
}

function githubDouble({ pullRequests = [], issues = [] } = {}) {
  return {
    getRepository: vi.fn().mockResolvedValue(repository),
    listRepositoryPages: vi.fn(() => pages([repository])),
    listBranchPages: vi.fn(() => pages([{ name: 'trunk', headSha: null }])),
    listCommitPages: vi.fn(() => pages([])),
    listPullRequestPages: vi.fn(() => pages(pullRequests)),
    listIssuePages: vi.fn(() => pages(issues))
  };
}

async function connectRepository(owner, projectId) {
  const installation = await prisma.gitHubInstallation.create({
    data: {
      githubInstallationId: '77',
      accountId: '700',
      accountLogin: 'usuario-bateria',
      accountType: 'User',
      installedAt: new Date(),
      status: 'ACTIVE'
    }
  });
  vi.spyOn(githubAppService, 'resolveAuthorizedRepository').mockResolvedValue({
    installation,
    repository
  });
  vi.spyOn(githubAppService, 'assertRepositoryAvailable').mockResolvedValue(null);
  await expectStatus(
    owner
      .mutate('put', `/api/projects/${projectId}/github/integration`)
      .send({ githubInstallationId: '77', githubRepositoryId: repository.githubRepositoryId }),
    200
  );
}

describe('Bateria S2-01 — RF13 pelos caminhos públicos de escrita (bloco T)', () => {
  it('AT-T-01/02 concluir por status ou por movimentação alerta só em projeto integrado e sem commit', async () => {
    const project = await integrated();
    const plain = await createProject(prisma);
    const member = await register('MEMBER', project.id);
    await prisma.projectMembership.create({
      data: { projectId: plain.id, userId: member.user.id, role: 'MEMBER' }
    });
    const byStatus = await newTask(member, project.id);
    const byMove = await newTask(member, project.id);
    const withCommit = await newTask(member, project.id);
    const notIntegrated = await newTask(member, plain.id);
    const commit = await createCommit(prisma, project.id);
    await expectStatus(
      member.mutate('post', `/api/tasks/${withCommit.id}/commits`).send({ commitId: commit.id }),
      201
    );

    await setStatus(member, byStatus.id, 'EM_ANDAMENTO');
    expect(await openAlerts(member, project.id)).toEqual([]);
    await setStatus(member, byStatus.id, 'CONCLUIDO');
    await moveTask(member, byMove.id, 'CONCLUIDO');
    await setStatus(member, withCommit.id, 'CONCLUIDO');
    await setStatus(member, notIntegrated.id, 'CONCLUIDO');

    const open = await openAlerts(member, project.id);
    expect(open.map((alert) => [alert.type, alert.subject.id]).sort()).toEqual(
      [
        ['TASK_CONCLUDED_WITHOUT_COMMIT', byMove.id],
        ['TASK_CONCLUDED_WITHOUT_COMMIT', byStatus.id]
      ].sort()
    );
    for (const alert of open) expect(alert.occurredAt).toEqual(expect.any(String));
    expect(await openAlerts(member, plain.id)).toEqual([]);
  });

  it('AT-T-02 a criação de tarefa não aceita status, então não há atalho para nascer concluída', async () => {
    const project = await integrated();
    const member = await register('MEMBER', project.id);

    const response = await member
      .mutate('post', `/api/projects/${project.id}/tasks`)
      .send({ title: 'Nasce concluída', status: 'CONCLUIDO' });

    expect(response.status).toBe(400);
    expect(await openAlerts(member, project.id)).toEqual([]);
  });

  it('AT-T-03 vincular commit resolve; desvincular cria uma ocorrência nova e preserva a anterior', async () => {
    const project = await integrated();
    const member = await register('MEMBER', project.id);
    const task = await newTask(member, project.id);
    const commit = await createCommit(prisma, project.id);
    await setStatus(member, task.id, 'CONCLUIDO');
    const [first] = await openAlerts(member, project.id);

    await expectStatus(
      member.mutate('post', `/api/tasks/${task.id}/commits`).send({ commitId: commit.id }),
      201
    );
    expect(await openAlerts(member, project.id)).toEqual([]);
    await expectStatus(member.mutate('delete', `/api/tasks/${task.id}/commits/${commit.id}`), 200);

    const [second] = await openAlerts(member, project.id);
    expect(second.id).not.toBe(first.id);
    expect(second.subject.id).toBe(task.id);
    expect(await resolvedAlerts(member, project.id)).toEqual([
      expect.objectContaining({ id: first.id, resolutionReason: 'COMMIT_LINKED' })
    ]);
  });

  it('AT-T-06 excluir tarefa com alerta dispensado resolve como TASK_DELETED e mantém a dispensa', async () => {
    const project = await integrated();
    const member = await register('MEMBER', project.id);
    const manager = await register('MANAGER', project.id);
    const task = await newTask(member, project.id, 'Documentação de deploy');
    await setStatus(member, task.id, 'CONCLUIDO');
    const [alert] = await openAlerts(member, project.id);
    await expectStatus(dismiss(manager, project.id, alert.id), 200);

    await expectStatus(member.mutate('delete', `/api/tasks/${task.id}`), 200);

    expect(await resolvedAlerts(member, project.id)).toEqual([
      expect.objectContaining({
        id: alert.id,
        resolutionReason: 'TASK_DELETED',
        dismissal: expect.objectContaining({ reason: REASON }),
        subject: expect.objectContaining({
          id: null,
          available: false,
          title: 'Documentação de deploy'
        })
      })
    ]);
  });
});

describe('Bateria S2-01 — PR e issue pelos caminhos públicos (bloco G)', () => {
  it('AT-G-04 vincular a PR resolve; remover o vínculo cria uma ocorrência nova', async () => {
    const project = await integrated();
    const manager = await register('MANAGER', project.id);
    const pullRequest = await createPullRequest(prisma, project.id, {
      state: 'closed',
      mergedAtGithub: FUTURE,
      closedAtGithub: FUTURE
    });
    const task = await newTask(manager, project.id);
    await expectStatus(reconcile(manager, project.id), 200);
    const [first] = await openAlerts(manager, project.id);
    expect(first.type).toBe('PULL_REQUEST_MERGED_WITHOUT_TASK');

    await expectStatus(
      manager
        .mutate('patch', `/api/tasks/${task.id}/pull-request`)
        .send({ pullRequestId: pullRequest.id }),
      200
    );
    expect(await openAlerts(manager, project.id)).toEqual([]);
    await expectStatus(manager.mutate('delete', `/api/tasks/${task.id}/pull-request`), 200);

    const [second] = await openAlerts(manager, project.id);
    expect(second).toMatchObject({ type: 'PULL_REQUEST_MERGED_WITHOUT_TASK' });
    expect(second.id).not.toBe(first.id);
    expect(await resolvedAlerts(manager, project.id)).toEqual([
      expect.objectContaining({ id: first.id, resolutionReason: 'PULL_REQUEST_LINKED' })
    ]);
  });

  it('AT-G-05 PR compartilhada só alerta quando a última tarefa sai', async () => {
    const project = await integrated();
    const member = await register('MEMBER', project.id);
    const pullRequest = await createPullRequest(prisma, project.id, {
      state: 'closed',
      mergedAtGithub: FUTURE,
      closedAtGithub: FUTURE
    });
    const first = await newTask(member, project.id);
    const second = await newTask(member, project.id);
    for (const task of [first, second])
      await expectStatus(
        member
          .mutate('patch', `/api/tasks/${task.id}/pull-request`)
          .send({ pullRequestId: pullRequest.id }),
        200
      );

    await expectStatus(member.mutate('delete', `/api/tasks/${first.id}`), 200);
    expect(await openAlerts(member, project.id)).toEqual([]);
    await expectStatus(member.mutate('delete', `/api/tasks/${second.id}`), 200);

    expect((await openAlerts(member, project.id)).map((alert) => alert.type)).toEqual([
      'PULL_REQUEST_MERGED_WITHOUT_TASK'
    ]);
  });

  it('AT-G-10/AT-Q-08 os três tipos têm o mesmo DTO, e o contexto segue o tipo', async () => {
    const project = await integrated();
    const manager = await register('MANAGER', project.id);
    await createTask(prisma, project.id, { status: 'CONCLUIDO' });
    await createPullRequest(prisma, project.id, {
      state: 'closed',
      mergedAtGithub: FUTURE,
      closedAtGithub: FUTURE,
      githubUrl: 'https://github.com/traceflow/bateria/pull/9'
    });
    await createIssue(prisma, project.id, {
      state: 'closed',
      closedAtGithub: FUTURE,
      githubUrl: 'https://github.com/traceflow/bateria/issues/4'
    });
    await expectStatus(reconcile(manager, project.id), 200);

    const alerts = await openAlerts(manager, project.id);
    expect(alerts.map((alert) => alert.type).sort()).toEqual([
      'ISSUE_CLOSED_WITHOUT_TASK',
      'PULL_REQUEST_MERGED_WITHOUT_TASK',
      'TASK_CONCLUDED_WITHOUT_COMMIT'
    ]);
    for (const alert of alerts) {
      expect(Object.keys(alert).sort()).toEqual(ALERT_KEYS);
      expect(Object.keys(alert.subject).sort()).toEqual([
        'available',
        'code',
        'githubUrl',
        'id',
        'title',
        'type'
      ]);
      expect(alert.detectedAt).toEqual(expect.any(String));
    }
    const contextKeys = {};
    for (const alert of alerts) {
      const detail = await manager.agent.get(`${base(project.id)}/alerts/${alert.id}`);
      contextKeys[alert.type] = Object.keys(detail.body.alert.context).sort();
    }
    expect(contextKeys).toEqual({
      TASK_CONCLUDED_WITHOUT_COMMIT: [
        'issueCount',
        'pendingCommitSuggestions',
        'pullRequest',
        'requirement',
        'responsible',
        'status'
      ],
      PULL_REQUEST_MERGED_WITHOUT_TASK: [
        'githubUrl',
        'mergedAt',
        'number',
        'sourceBranch',
        'targetBranch',
        'title'
      ],
      ISSUE_CLOSED_WITHOUT_TASK: ['closedAt', 'githubUrl', 'number', 'state', 'title']
    });
  });
});

describe('Bateria S2-01 — estados e transições (bloco E)', () => {
  it('AT-E-02 a ocorrência nova não herda a dispensa da anterior', async () => {
    const project = await integrated();
    const member = await register('MEMBER', project.id);
    const manager = await register('MANAGER', project.id);
    const task = await newTask(member, project.id);
    const commit = await createCommit(prisma, project.id);
    await setStatus(member, task.id, 'CONCLUIDO');
    const [first] = await openAlerts(member, project.id);
    await expectStatus(dismiss(manager, project.id, first.id), 200);

    await expectStatus(
      member.mutate('post', `/api/tasks/${task.id}/commits`).send({ commitId: commit.id }),
      201
    );
    await expectStatus(member.mutate('delete', `/api/tasks/${task.id}/commits/${commit.id}`), 200);

    const [recurrence] = await openAlerts(member, project.id);
    expect(recurrence.id).not.toBe(first.id);
    expect(recurrence.dismissal).toBeNull();
    const [resolved] = await resolvedAlerts(member, project.id);
    expect(resolved.dismissal).toMatchObject({ reason: REASON });
  });

  it('AT-E-03 não existe rota para criar, reabrir, editar ou apagar alerta', async () => {
    const project = await integrated();
    const manager = await register('MANAGER', project.id);
    const alert = await issueAlert(project.id, manager);
    const path = `${base(project.id)}/alerts`;

    const attempts = [
      manager.mutate('post', path).send({ type: 'ISSUE_CLOSED_WITHOUT_TASK' }),
      manager.mutate('post', `${path}/${alert.id}/reopen`).send({}),
      manager.mutate('post', `${path}/${alert.id}/resolve`).send({}),
      manager.mutate('patch', `${path}/${alert.id}`).send({ status: 'RESOLVED' }),
      manager.mutate('put', `${path}/${alert.id}/dismiss`).send({ reason: REASON }),
      manager.mutate('delete', `${path}/${alert.id}`)
    ];

    for (const response of await Promise.all(attempts))
      expect([404, 405]).toContain(response.status);
    expect(await openAlerts(manager, project.id)).toEqual([
      expect.objectContaining({ id: alert.id, status: 'OPEN', dismissal: null })
    ]);
  });

  it('AT-E-06 campos de resolução e de dispensa só aparecem no estado que os produz', async () => {
    const project = await integrated();
    const member = await register('MEMBER', project.id);
    const manager = await register('MANAGER', project.id);
    const dismissedTask = await newTask(member, project.id);
    const resolvedTask = await newTask(member, project.id);
    const openTask = await newTask(member, project.id);
    for (const task of [dismissedTask, resolvedTask, openTask])
      await setStatus(member, task.id, 'CONCLUIDO');
    const bySubject = Object.fromEntries(
      (await openAlerts(member, project.id)).map((alert) => [alert.subject.id, alert])
    );
    await expectStatus(dismiss(manager, project.id, bySubject[dismissedTask.id].id), 200);
    await setStatus(member, resolvedTask.id, 'EM_ANDAMENTO');

    const [open] = (await openAlerts(member, project.id)).filter(
      (alert) => alert.subject.id === openTask.id
    );
    const [dismissed] = (await list(member, project.id, { status: 'DISMISSED' })).alerts;
    const [resolved] = await resolvedAlerts(member, project.id);

    expect(open).toMatchObject({ resolvedAt: null, resolutionReason: null, dismissal: null });
    expect(dismissed).toMatchObject({
      status: 'DISMISSED',
      resolvedAt: null,
      resolutionReason: null,
      dismissal: { at: expect.any(String), reason: REASON, by: { id: manager.user.id } }
    });
    expect(resolved).toMatchObject({
      status: 'RESOLVED',
      resolvedAt: expect.any(String),
      resolutionReason: 'TASK_REOPENED',
      dismissal: null
    });
  });
});

describe('Bateria S2-01 — dispensa (bloco D)', () => {
  it('AT-D-03 justificativa de tipo errado responde 400 sem ecoar o valor', async () => {
    const project = await integrated();
    const manager = await register('MANAGER', project.id);
    const alert = await issueAlert(project.id, manager);
    const marker = 'MARCADOR-BATERIA-ECO';
    const bodies = [
      { reason: '' },
      { reason: '            ' },
      { reason: 1234567890123 },
      { reason: null },
      { reason: [marker, marker] },
      { reason: { text: marker } },
      { reason: true }
    ];

    for (const body of bodies) {
      const response = await dismiss(manager, project.id, alert.id, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(response.body)).not.toContain(marker);
    }
    expect((await openAlerts(manager, project.id))[0].status).toBe('OPEN');
  });

  it('AT-D-08 (H4) variantes de caminho não deixam MEMBER nem VIEWER dispensar', async () => {
    const project = await integrated();
    const manager = await register('MANAGER', project.id);
    const member = await register('MEMBER', project.id);
    const viewer = await register('VIEWER', project.id);
    const alert = await issueAlert(project.id, manager);
    const root = base(project.id);
    const variants = [
      `${root}/alerts/${alert.id}/dismiss/`,
      `${root}/ALERTS/${alert.id}/DISMISS`,
      `${root}/Alerts/${alert.id}/Dismiss/`,
      `${root}//alerts/${alert.id}/dismiss`,
      `${root}/alerts/${alert.id}%2Fdismiss`,
      `${root}/alerts/0${alert.id}/dismiss`
    ];

    for (const auth of [member, viewer])
      for (const path of variants) {
        const response = await auth.mutate('post', path).send({ reason: REASON });
        expect(response.status, path).not.toBe(200);
        expect([403, 404]).toContain(response.status);
      }
    expect(await openAlerts(manager, project.id)).toEqual([
      expect.objectContaining({ id: alert.id, dismissal: null })
    ]);
  });

  it('AT-D-09 identificador malformado ou fora da faixa nunca vira 500 nem outro alerta', async () => {
    const project = await integrated();
    const viewer = await register('VIEWER', project.id);
    const manager = await register('MANAGER', project.id);
    const alert = await issueAlert(project.id, manager);
    const malformed = ['0', '-1', '1e2', '1.5', 'abc', '2147483648', '99999999999999999999'];

    for (const id of malformed) {
      const read = await viewer.agent.get(`${base(project.id)}/alerts/${id}`);
      const write = await dismiss(manager, project.id, id);
      expect([400, 404], `GET ${id}`).toContain(read.status);
      expect([400, 404], `POST ${id}`).toContain(write.status);
    }
    const padded = await viewer.agent.get(`${base(project.id)}/alerts/00${alert.id}`);
    expect(padded.status).toBe(200);
    expect(padded.body.alert.id).toBe(alert.id);
  });

  it('AT-V-04 papel rebaixado entre a leitura e a dispensa é recusado', async () => {
    const project = await integrated();
    const manager = await register('MANAGER', project.id);
    const alert = await issueAlert(project.id, manager);
    await expectStatus(manager.agent.get(`${base(project.id)}/alerts/${alert.id}`), 200);

    await prisma.projectMembership.updateMany({
      where: { projectId: project.id, userId: manager.user.id },
      data: { role: 'MEMBER' }
    });

    expect((await dismiss(manager, project.id, alert.id)).status).toBe(403);
    expect((await openAlerts(manager, project.id))[0].dismissal).toBeNull();
  });
});

describe('Bateria S2-01 — consultas, filtros e paginação (bloco Q)', () => {
  it('AT-Q-01/02/03 query inválida, repetida ou fora da faixa responde 400', async () => {
    const project = await integrated();
    const viewer = await register('VIEWER', project.id);
    const alertsPath = `${base(project.id)}/alerts`;
    const unlinkedPath = `${base(project.id)}/tasks-without-technical-links`;
    const invalid = [
      [alertsPath, 'status=open'],
      [alertsPath, 'type=TASK'],
      [alertsPath, 'type=task_concluded_without_commit'],
      [alertsPath, 'status=OPEN&status=RESOLVED'],
      [alertsPath, 'limit=1&limit=2'],
      [alertsPath, 'page=0'],
      [alertsPath, 'limit=0'],
      [alertsPath, 'limit=abc'],
      [alertsPath, 'page=-1'],
      [alertsPath, 'page=1.5'],
      [alertsPath, 'status[]=OPEN'],
      [unlinkedPath, 'status=concluido'],
      [unlinkedPath, 'status=CONCLUIDO&status=A_FAZER'],
      [unlinkedPath, 'limit=101'],
      [unlinkedPath, 'search=x']
    ];

    for (const [path, query] of invalid) {
      const response = await viewer.agent.get(`${path}?${query}`);
      expect(response.status, `${path}?${query}`).toBe(400);
    }
    for (const query of ['limit=1', 'limit=100', 'page=1&limit=20', 'status=DISMISSED'])
      expect((await viewer.agent.get(`${alertsPath}?${query}`)).status, query).toBe(200);
  });

  it('AT-Q-04 a ordem é detectedAt desc e id desc, inclusive no empate', async () => {
    const project = await integrated();
    const manager = await register('MANAGER', project.id);
    for (let index = 0; index < 3; index += 1)
      await createIssue(prisma, project.id, { state: 'closed', closedAtGithub: FUTURE });
    await expectStatus(reconcile(manager, project.id), 200);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await createIssue(prisma, project.id, { state: 'closed', closedAtGithub: FUTURE });
    await expectStatus(reconcile(manager, project.id), 200);

    const alerts = await openAlerts(manager, project.id);

    expect(alerts).toHaveLength(4);
    for (let index = 1; index < alerts.length; index += 1) {
      const previous = alerts[index - 1];
      const current = alerts[index];
      const later = Date.parse(previous.detectedAt) > Date.parse(current.detectedAt);
      const tieBroken = previous.detectedAt === current.detectedAt && previous.id > current.id;
      expect(later || tieBroken, JSON.stringify([previous, current])).toBe(true);
    }
  });

  it('AT-Q-06 o resumo soma o projeto inteiro e bate com a listagem', async () => {
    const project = await integrated();
    const manager = await register('MANAGER', project.id);
    for (let index = 0; index < 23; index += 1)
      await createIssue(prisma, project.id, { state: 'closed', closedAtGithub: FUTURE });
    await createTask(prisma, project.id, { status: 'CONCLUIDO' });
    await expectStatus(reconcile(manager, project.id), 200);
    const page = await list(manager, project.id, { limit: 5 });
    await expectStatus(dismiss(manager, project.id, page.alerts[0].id), 200);

    const summary = (await manager.agent.get(`${base(project.id)}/alerts/summary`)).body;
    const open = await list(manager, project.id, { limit: 1 });
    const dismissed = await list(manager, project.id, { status: 'DISMISSED', limit: 1 });

    expect(summary.open.total).toBe(open.pagination.total);
    expect(summary.open.total).toBe(23);
    expect(Object.values(summary.open.byType).reduce((sum, value) => sum + value, 0)).toBe(23);
    expect(summary.dismissed.total).toBe(dismissed.pagination.total);
  });

  it('AT-Q-06 o resumo de um projeto não conta alertas de outro (M11)', async () => {
    const projectA = await integrated();
    const projectB = await integrated();
    const managerA = await register('MANAGER', projectA.id);
    const managerB = await register('MANAGER', projectB.id);
    for (let index = 0; index < 3; index += 1)
      await createIssue(prisma, projectB.id, { state: 'closed', closedAtGithub: FUTURE });
    await createTask(prisma, projectB.id, { status: 'CONCLUIDO' });
    await expectStatus(reconcile(managerB, projectB.id), 200);
    const foreign = await openAlerts(managerB, projectB.id);
    await expectStatus(dismiss(managerB, projectB.id, foreign[0].id), 200);
    const own = await issueAlert(projectA.id, managerA);

    const summary = (await managerA.agent.get(`${base(projectA.id)}/alerts/summary`)).body;

    expect(own.type).toBe('ISSUE_CLOSED_WITHOUT_TASK');
    expect(summary.open).toEqual({
      total: 1,
      byType: {
        TASK_CONCLUDED_WITHOUT_COMMIT: 0,
        PULL_REQUEST_MERGED_WITHOUT_TASK: 0,
        ISSUE_CLOSED_WITHOUT_TASK: 1
      }
    });
    expect(summary.dismissed.total).toBe(0);
  });

  it('AT-Q-10 alerta de outro projeto e id inexistente produzem a mesma resposta', async () => {
    const projectA = await integrated();
    const projectB = await integrated();
    const managerA = await register('MANAGER', projectA.id);
    const viewerB = await register('VIEWER', projectB.id);
    const foreign = await issueAlert(projectA.id, managerA);
    const strip = ({ requestId: _requestId, ...rest }) => rest;

    const foreignRead = await viewerB.agent.get(`${base(projectB.id)}/alerts/${foreign.id}`);
    const missingRead = await viewerB.agent.get(
      `${base(projectB.id)}/alerts/${foreign.id + 100000}`
    );

    expect(foreignRead.status).toBe(404);
    expect(missingRead.status).toBe(404);
    expect(strip(foreignRead.body)).toEqual(strip(missingRead.body));
  });

  it('AT-Q-11 leituras não criam, não resolvem e não auditam alertas', async () => {
    const project = await integrated();
    const viewer = await register('VIEWER', project.id);
    const manager = await register('MANAGER', project.id);
    await createTask(prisma, project.id, { status: 'CONCLUIDO' });
    await createIssue(prisma, project.id, { state: 'closed', closedAtGithub: FUTURE });
    const auditsBefore = await prisma.auditEvent.count({ where: { projectId: project.id } });

    for (let round = 0; round < 2; round += 1) {
      await viewer.agent.get(`${base(project.id)}/alerts`);
      await viewer.agent.get(`${base(project.id)}/alerts/summary`);
      await viewer.agent.get(`${base(project.id)}/alerts/999999`);
      await viewer.agent.get(`${base(project.id)}/tasks-without-technical-links`);
    }

    const summary = (await viewer.agent.get(`${base(project.id)}/alerts/summary`)).body;
    expect(summary.open.total).toBe(0);
    expect(await prisma.auditEvent.count({ where: { projectId: project.id } })).toBe(auditsBefore);
    const reconciled = await expectStatus(reconcile(manager, project.id), 200);
    expect(reconciled.body.result.created).toBe(2);
  });

  it('AT-Q-13 RF58 ordena por updatedAt desc e id desc e não vaza tarefa de outro projeto', async () => {
    const project = await createProject(prisma);
    const other = await createProject(prisma);
    const viewer = await register('VIEWER', project.id);
    const instant = new Date('2026-09-01T12:00:00.000Z');
    const older = await createTask(prisma, project.id, {
      updatedAt: new Date('2026-08-01T12:00:00.000Z')
    });
    const tieLow = await createTask(prisma, project.id, { updatedAt: instant });
    const tieHigh = await createTask(prisma, project.id, { updatedAt: instant });
    const newest = await createTask(prisma, project.id, {
      updatedAt: new Date('2026-10-01T12:00:00.000Z')
    });
    await createTask(prisma, other.id);

    const response = await viewer.agent.get(`${base(project.id)}/tasks-without-technical-links`);

    expect(response.body.tasks.map((task) => task.id)).toEqual([
      newest.id,
      tieHigh.id,
      tieLow.id,
      older.id
    ]);
  });

  it('V4.1.1/V14.3.2 as seis rotas e seus erros respondem JSON com charset e sem cache', async () => {
    const project = await integrated();
    const manager = await register('MANAGER', project.id);
    const alert = await issueAlert(project.id, manager);
    const root = base(project.id);

    const responses = [
      await manager.agent.get(`${root}/alerts`),
      await manager.agent.get(`${root}/alerts/summary`),
      await manager.agent.get(`${root}/alerts/${alert.id}`),
      await manager.agent.get(`${root}/tasks-without-technical-links`),
      await reconcile(manager, project.id),
      await dismiss(manager, project.id, alert.id),
      await manager.agent.get(`${root}/alerts?status=x`),
      await manager.agent.get(`${root}/alerts/999999`),
      await dismiss(manager, project.id, alert.id, { reason: 'x' })
    ];

    for (const response of responses) {
      expect(response.headers['content-type']).toMatch(/^application\/json; charset=utf-8$/);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-powered-by']).toBeUndefined();
    }
  });
});

describe('Bateria S2-01 — reprocessamento (bloco R)', () => {
  it('AT-R-02 corpo não vazio no reprocessamento responde 400', async () => {
    const project = await integrated();
    const manager = await register('MANAGER', project.id);

    const response = await manager
      .mutate('post', `${base(project.id)}/alerts/reconcile`)
      .send({ force: true });

    expect(response.status).toBe(400);
  });

  it('AT-R-03 (H4) variantes de caminho não deixam MEMBER nem VIEWER reprocessar', async () => {
    const project = await integrated();
    const member = await register('MEMBER', project.id);
    const viewer = await register('VIEWER', project.id);
    await createIssue(prisma, project.id, { state: 'closed', closedAtGithub: FUTURE });
    const root = base(project.id);

    for (const auth of [member, viewer])
      for (const path of [`${root}/alerts/reconcile/`, `${root}/ALERTS/RECONCILE`]) {
        const response = await auth.mutate('post', path).send({});
        expect(response.status, path).toBe(403);
      }
    expect(await openAlerts(member, project.id)).toEqual([]);
  });

  it('AT-R-04 o limitador recusa a sexta chamada por usuário e projeto, com Retry-After', async () => {
    const projectA = await integrated();
    const projectB = await integrated();
    const manager = await register('MANAGER', projectA.id);
    const otherManager = await register('MANAGER', projectA.id);
    await prisma.projectMembership.create({
      data: { projectId: projectB.id, userId: manager.user.id, role: 'MANAGER' }
    });

    for (let call = 0; call < 5; call += 1)
      await expectStatus(reconcile(manager, projectA.id), 200);
    const limited = await reconcile(manager, projectA.id);

    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    await expectStatus(reconcile(manager, projectB.id), 200);
    await expectStatus(reconcile(otherManager, projectA.id), 200);
  });
});

describe('Bateria S2-01 — fim do sync (bloco S)', () => {
  it('AT-S-03 (H5) falha na reconciliação pós-sync não muda o sync e só o reprocessamento recupera', async () => {
    const project = await createProject(prisma, {
      createdAt: new Date('2026-08-01T12:00:00.000Z')
    });
    const owner = await register('OWNER', project.id);
    await connectRepository(owner, project.id);
    githubBoundary.client = githubDouble({
      pullRequests: [
        {
          githubId: 'pr-bateria-1',
          number: 1,
          title: 'PR mesclada da bateria',
          state: 'closed',
          targetBranch: 'trunk',
          mergedAtGithub: new Date('2026-08-10T09:30:00.000Z'),
          closedAtGithub: new Date('2026-08-10T09:30:00.000Z')
        }
      ]
    });
    const afterSync = vi.spyOn(alertService, 'reconcileAfterSync');
    vi.spyOn(alertRepository, 'reconcileProject').mockRejectedValueOnce(
      Object.assign(new Error('falha injetada'), { code: 'P1001' })
    );

    await expectStatus(
      owner.mutate('post', `/api/projects/${project.id}/github/sync`).send({}),
      202
    );
    await vi.waitFor(() => expect(afterSync.mock.results.length).toBe(1), {
      timeout: 10000,
      interval: 10
    });
    await afterSync.mock.results[0].value;
    const status = await owner.agent.get(`/api/projects/${project.id}/github/sync/status`);
    const summary = (await owner.agent.get(`${base(project.id)}/alerts/summary`)).body;

    expect(status.body.run.status).toBe('SUCCEEDED');
    expect(summary.open.total).toBe(0);
    expect(Object.keys(summary).sort()).toEqual([
      'dismissed',
      'open',
      'permissions',
      'projectId',
      'rules'
    ]);
    const recovered = await expectStatus(reconcile(owner, project.id), 200);
    expect(recovered.body.result.created).toBe(1);
  });
});
