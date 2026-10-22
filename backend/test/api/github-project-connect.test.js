import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import { concurrentTransactions } from '../helpers/transaction-arrival-barrier.js';
import {
  assertConnectedTestDatabase,
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { ExternalServiceError } from '../../src/shared/errors/index.js';

const boundary = vi.hoisted(() => ({ forInstallation: vi.fn() }));
vi.mock('../../src/modules/github/github.client.js', () => ({
  githubInstallationClientFactory: boundary
}));

let app, prisma, owner, installation, client, sync, requestSync, auditRepository, projectRepository;
let scheduled;
const repo = (id = '501') => ({
  githubRepositoryId: id,
  name: `repo-${id}`,
  owner: 'traceflow',
  fullName: `traceflow/repo-${id}`,
  url: `https://github.com/traceflow/repo-${id}`,
  defaultBranch: 'main',
  private: true
});
const selection = (id = '501') => ({ githubInstallationId: '77', githubRepositoryId: id });
const endpoint = (id) => `/api/projects/${id}/github/integration`;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function* pages(items) {
  yield items;
}

async function register(suffix, verified = true) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: `Pessoa ${suffix}`,
    username: `connect_${suffix}`,
    email: `${suffix}@example.invalid`,
    password: 'SenhaArtificial123!'
  });
  expect(response.status).toBe(201);
  if (verified) {
    expect(
      (
        await request(app).post('/api/auth/email-verification/verify').send({
          token: response.body.emailVerification.testToken
        })
      ).status
    ).toBe(200);
  }
  return {
    agent,
    user: response.body.user,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', response.body.csrfToken)
  };
}

async function localProject(auth = owner, extra = {}) {
  const response = await auth.mutate('post', '/api/projects').send({
    name: 'Projeto local preservado',
    responsibleTeam: 'Equipe local',
    description: 'Histórico local',
    ...extra
  });
  expect(response.status).toBe(201);
  expect(response.body.project.githubIntegration).toBeNull();
  return response.body.project;
}

function connect(project, body = selection(), auth = owner) {
  return auth.mutate('put', endpoint(project.id)).send(body);
}

async function authorize(userId, installationId = installation.id) {
  await prisma.gitHubInstallationAuthorization.create({
    data: { userId, installationId, verifiedAt: new Date() }
  });
}

async function assertUnlinked(project) {
  expect(
    await prisma.projectGitHubIntegration.findUnique({ where: { projectId: project.id } })
  ).toBeNull();
  expect(await prisma.gitHubSyncRun.count({ where: { projectId: project.id } })).toBe(0);
  expect(
    await prisma.projectMembership.count({
      where: { projectId: project.id, role: 'OWNER', isActive: true }
    })
  ).toBe(1);
  expect(
    await prisma.auditEvent.count({
      where: { projectId: project.id, action: 'GITHUB_PROJECT_CONNECTED' }
    })
  ).toBe(0);
}

async function complete(run) {
  return sync.executeGithubSyncRun(run.id);
}

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  await assertConnectedTestDatabase(prisma);
  ({ githubSyncService: sync } = await import('../../src/modules/github/githubSync.service.js'));
  requestSync = sync.requestProjectGithubSync;
  ({ auditRepository } = await import('../../src/modules/audit/audit.repository.js'));
  ({ projectRepository } = await import('../../src/modules/projects/project.repository.js'));
  const { default: application } = await import('../../src/app.js');
  app = await startTestServer(application);
});

beforeEach(async () => {
  await cleanTestDatabase(prisma);
  vi.clearAllMocks();
  scheduled = [];
  // Use the canonical scheduler seam: real runs, claims, ingestion and DB, without
  // racing cleanup against a worker. Tests explicitly release queued work.
  vi.spyOn(sync, 'requestProjectGithubSync').mockImplementation((projectId, userId) =>
    requestSync(projectId, userId, { schedule: (id) => scheduled.push(id) })
  );
  client = {
    listRepositoryPages: vi.fn(() => pages([repo(), repo('502')])),
    getRepository: vi.fn(async (_owner, name) => repo(name.replace('repo-', ''))),
    listBranchPages: vi.fn(() => pages([{ name: 'main', headSha: 'head-501' }])),
    listCommitPages: vi.fn(() => pages([])),
    listPullRequestPages: vi.fn(() => pages([])),
    listRepositoryEventPages: vi.fn(() => pages([])),
    listIssuePages: vi.fn(() => pages([]))
  };
  boundary.forInstallation.mockResolvedValue(client);
  owner = await register('owner');
  installation = await prisma.gitHubInstallation.create({
    data: {
      githubInstallationId: '77',
      accountId: '700',
      accountLogin: 'traceflow',
      accountType: 'Organization',
      status: 'ACTIVE',
      installedAt: new Date()
    }
  });
  await authorize(owner.user.id);
});

afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (prisma) {
    await cleanTestDatabase(prisma);
    await prisma.$disconnect();
  }
});

async function localGraph(projectId) {
  const context = { actorUserId: owner.user.id };
  const { testCaseService } =
    await import('../../src/modules/testCases/services/test-case.service.js');
  const { testExecutionService } =
    await import('../../src/modules/testCases/services/test-execution.service.js');
  const { defectService } = await import('../../src/modules/defects/defect.service.js');
  const requirement = await prisma.requirement.create({
    data: { projectId, title: 'Requisito local' }
  });
  const milestone = await prisma.milestone.create({
    data: { projectId, title: 'Marco local', dueDate: new Date('2030-01-31') }
  });
  const sprint = await prisma.sprint.create({
    data: {
      projectId,
      name: 'Sprint local',
      milestoneId: milestone.id,
      startDate: new Date('2030-01-01'),
      endDate: new Date('2030-01-14')
    }
  });
  const task = await prisma.task.create({
    data: {
      projectId,
      requirementId: requirement.id,
      sprintId: sprint.id,
      title: 'Tarefa local',
      responsibleUserId: owner.user.id
    }
  });
  await prisma.sprintTask.create({
    data: { projectId, sprintId: sprint.id, taskId: task.id, taskTitleSnapshot: task.title }
  });
  await prisma.taskMovement.create({
    data: {
      projectId,
      taskId: task.id,
      fromStatus: 'A_FAZER',
      toStatus: 'EM_ANDAMENTO',
      movedBy: owner.user.name,
      movedByUserId: owner.user.id
    }
  });
  await prisma.taskHistoryEntry.create({
    data: {
      projectId,
      taskId: task.id,
      actorUserId: owner.user.id,
      field: 'STATUS',
      fromValue: 'A_FAZER',
      toValue: 'EM_ANDAMENTO'
    }
  });
  await prisma.taskComment.create({
    data: {
      projectId,
      taskId: task.id,
      authorUserId: owner.user.id,
      content: 'Comentário preservado'
    }
  });
  await prisma.taskTimeEntry.create({
    data: {
      projectId,
      taskId: task.id,
      source: 'MANUAL',
      startedById: owner.user.id,
      endedById: owner.user.id,
      startedAt: new Date('2026-10-01T12:00:00Z'),
      endedAt: new Date('2026-10-01T13:00:00Z'),
      durationSeconds: 3600
    }
  });
  // Local historical evidence may predate a canonical integration (legacy/import).
  const pr = await prisma.pullRequest.create({
    data: { projectId, githubId: 'local-evidence', number: 99, title: 'Referência preservada' }
  });
  const tc = await testCaseService.create(
    projectId,
    {
      title: 'Caso local',
      preconditions: 'Pronto',
      expectedResult: 'Resultado',
      responsibleUserId: owner.user.id,
      requirementId: requirement.id,
      taskIds: [task.id],
      steps: [{ action: 'Verificar', expectedResult: 'Visível' }]
    },
    context
  );
  const execution = await testExecutionService.record(
    tc.id,
    {
      testCaseVersion: 1,
      environment: 'LOCAL',
      testedReference: { type: 'PULL_REQUEST', id: pr.id },
      steps: [{ position: 1, result: 'FAIL', observedResult: 'Falha local' }]
    },
    null,
    context
  );
  await defectService.create(
    projectId,
    {
      title: 'Defeito local',
      description: 'Preservar',
      severity: 'ALTA',
      responsibleUserId: owner.user.id,
      detectedExecutionStepId: execution.steps[0].id,
      requirementId: requirement.id,
      originTaskIds: [task.id]
    },
    context
  );
}

async function snapshot(projectId) {
  const models = [
    'projectMembership',
    'requirement',
    'task',
    'sprint',
    'sprintTask',
    'milestone',
    'taskMovement',
    'taskHistoryEntry',
    'taskComment',
    'taskTimeEntry',
    'testCase',
    'testExecution',
    'testCaseHistoryEntry',
    'defect',
    'defectHistoryEntry',
    'pullRequest'
  ];
  const result = { project: await prisma.project.findUnique({ where: { id: projectId } }) };
  for (const model of models)
    result[model] = await prisma[model].findMany({ where: { projectId }, orderBy: { id: 'asc' } });
  for (const [model, relation] of [
    ['testCaseTask', 'testCase'],
    ['testCaseStep', 'testCase'],
    ['testCaseVersion', 'testCase'],
    ['defectTask', 'defect'],
    ['testExecutionStep', 'execution']
  ]) {
    result[model] = await prisma[model].findMany({
      where: { [relation]: { projectId } },
      orderBy: { id: 'asc' }
    });
  }
  result.audit = await prisma.auditEvent.findMany({
    where: { projectId, action: { not: 'GITHUB_PROJECT_CONNECTED' } },
    orderBy: { id: 'asc' }
  });
  return result;
}

describe('GITHUB-02 — conexão posterior pela rota canônica', () => {
  it('preserva integralmente o grafo local e confirma integração antes do sync', async () => {
    const project = await localProject();
    await localGraph(project.id);
    const before = await snapshot(project.id);
    const response = await owner
      .mutate('put', endpoint(project.id))
      .set('X-Request-Id', 'github02-link')
      .send(selection());
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(await snapshot(project.id)).toEqual(before);
    expect(await prisma.project.count()).toBe(1);
    expect(await prisma.gitHubIdentity.count()).toBe(0);
    expect(response.body.project).toMatchObject({
      id: project.id,
      name: project.name,
      githubIntegration: {
        status: 'ACTIVE',
        githubRepositoryId: '501',
        repositoryFullName: repo().fullName,
        repositoryUrl: repo().url,
        defaultBranch: 'main',
        repositoryPrivate: true,
        lastSyncStatus: 'PENDENTE',
        autoSyncEnabled: false,
        lastSyncAt: null
      }
    });
    expect(response.body.initialSync).toMatchObject({
      status: 'QUEUED',
      error: null,
      run: { projectId: project.id, status: 'QUEUED' }
    });
    expect(scheduled).toEqual([response.body.initialSync.run.id]);
    expect(JSON.stringify(response.body)).not.toMatch(
      /installationId|accessCode|privateKey|tokenHash|authorEmail/
    );
    expect(boundary.forInstallation).toHaveBeenCalledWith('77');
    const audit = await prisma.auditEvent.findMany({
      where: { action: 'GITHUB_PROJECT_CONNECTED' }
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorUserId: owner.user.id,
      projectId: project.id,
      resourceId: String(response.body.integration.id),
      requestId: 'github02-link',
      metadataJson: { githubRepositoryId: '501' }
    });
    const read = await owner.agent.get(`/api/projects/${project.id}`);
    expect(read.body.project.githubIntegration).toEqual(response.body.project.githubIntegration);
    expect((await complete(response.body.initialSync.run)).status).toBe('SUCCEEDED');
    const after = await owner.agent.get(`/api/projects/${project.id}`);
    expect(after.body.project.githubIntegration).toMatchObject({
      status: 'ACTIVE',
      lastSyncStatus: 'SINCRONIZADO',
      lastSyncError: null
    });
  });

  it('confirma repositório sem branches e conserva a falha de sync canônica sem desfazer o vínculo', async () => {
    const project = await localProject();
    client.listBranchPages.mockImplementation(() => pages([]));
    const response = await connect(project);
    expect(response.status).toBe(200);
    const run = await complete(response.body.initialSync.run);
    expect(run.status).toBe('FAILED');
    expect(run.error.message).toBe('O GitHub não retornou branches acessíveis para o repositório.');
    expect(await prisma.commit.count()).toBe(0);
    expect(await prisma.projectGitHubIntegration.count()).toBe(1);
  });

  it.each(['VIEWER', 'MEMBER', 'MANAGER'])('rejeita %s antes de consultar GitHub', async (role) => {
    const project = await localProject();
    const actor = await register(role.toLowerCase());
    await prisma.projectMembership.create({
      data: { projectId: project.id, userId: actor.user.id, role }
    });
    expect((await connect(project, selection(), actor)).status).toBe(403);
    expect(boundary.forInstallation).not.toHaveBeenCalled();
    await assertUnlinked(project);
  });

  it('preserva 401, CSRF, e-mail verificado e estado de conta', async () => {
    const project = await localProject();
    expect((await request(app).put(endpoint(project.id)).send(selection())).status).toBe(401);
    const csrf = await owner.agent.put(endpoint(project.id)).send(selection());
    expect(csrf.status).toBe(403);
    expect(csrf.body.code).toBe('CSRF_INVALID');
    await prisma.user.update({ where: { id: owner.user.id }, data: { emailVerifiedAt: null } });
    const unverified = await connect(project);
    expect(unverified.status).toBe(403);
    expect(unverified.body.code).toBe('EMAIL_VERIFICATION_REQUIRED');
    await prisma.user.update({
      where: { id: owner.user.id },
      data: { emailVerifiedAt: new Date(), accountStatus: 'DELETION_PENDING' }
    });
    const inactive = await connect(project);
    expect(inactive.status).toBe(403);
    expect(inactive.body.code).toBe('ACCOUNT_DELETION_PENDING');
    expect(boundary.forInstallation).not.toHaveBeenCalled();
    await assertUnlinked(project);
  });

  it('retorna o mesmo 404 opaco para sem membership, inexistente e projeto excluído', async () => {
    const project = await localProject();
    const outsider = await register('outsider');
    const hidden = await connect(project, selection(), outsider);
    const missing = await connect({ id: 2147483647 });
    expect(hidden.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(hidden.body.message).toBe(missing.body.message);
    expect(hidden.body.code).toBe(missing.body.code);
    expect((await owner.mutate('delete', `/api/projects/${project.id}`).send({})).status).toBe(200);
    const deleted = await connect(project);
    expect(deleted.status).toBe(404);
    expect(deleted.body.message).toBe(missing.body.message);
    expect(boundary.forInstallation).not.toHaveBeenCalled();
    await assertUnlinked(project);
  });

  it.each([
    {},
    { githubInstallationId: '77' },
    { githubInstallationId: 'bad', githubRepositoryId: '501' },
    { githubInstallationId: '77', githubRepositoryId: -1 },
    { ...selection(), repositoryUrl: 'https://attacker.invalid' },
    { ...selection(), userId: 1 },
    { ...selection(), githubRepositoryId: '' }
  ])('rejeita payload inválido/autoridade redundante %j', async (body) => {
    const project = await localProject();
    const response = await connect(project, body);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(boundary.forInstallation).not.toHaveBeenCalled();
    await assertUnlinked(project);
  });

  it.each(['MISSING', 'UNAUTHORIZED', 'SUSPENDED', 'REMOVED'])(
    'rejeita instalação %s sem consulta externa',
    async (state) => {
      const project = await localProject();
      if (state === 'UNAUTHORIZED') await prisma.gitHubInstallationAuthorization.deleteMany();
      if (['SUSPENDED', 'REMOVED'].includes(state))
        await prisma.gitHubInstallation.update({
          where: { id: installation.id },
          data: { status: state }
        });
      const response = await connect(project, {
        ...selection(),
        githubInstallationId: state === 'MISSING' ? '999' : '77'
      });
      expect(response.status).toBe(403);
      expect(boundary.forInstallation).not.toHaveBeenCalled();
      await assertUnlinked(project);
    }
  );

  it('rejeita repositório inexistente ou fora da instalação autorizada', async () => {
    const project = await localProject();
    client.listRepositoryPages.mockImplementation(() => pages([repo('502')]));
    const response = await connect(project);
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('RESOURCE_NOT_FOUND');
    await assertUnlinked(project);
  });

  it('não persiste nada se GitHub falha antes da confirmação e permite tentar novamente', async () => {
    const project = await localProject();
    const before = await snapshot(project.id);
    boundary.forInstallation.mockRejectedValueOnce(
      new ExternalServiceError(
        'GitHub temporariamente indisponível.',
        503,
        'EXTERNAL_SERVICE_ERROR'
      )
    );
    const response = await connect(project);
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toMatch(/stack|secret|privateKey/);
    await assertUnlinked(project);
    expect(await snapshot(project.id)).toEqual(before);
    expect((await connect(project)).status).toBe(200);
  });

  it('traduz o erro 500 normalizado pelo client para indisponibilidade 503 segura', async () => {
    const project = await localProject();
    boundary.forInstallation.mockRejectedValueOnce(
      new ExternalServiceError('Private provider diagnostic', 500, 'EXTERNAL_SERVICE_ERROR', {
        useFallbackMessage: true
      })
    );
    const response = await connect(project);
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      code: 'EXTERNAL_SERVICE_ERROR',
      message: 'GitHub temporariamente indisponível. Tente vincular o repositório novamente.'
    });
    expect(JSON.stringify(response.body)).not.toContain('Private provider diagnostic');
    await assertUnlinked(project);
  });

  it.each([
    [403, 'GITHUB_AUTH_FAILED'],
    [404, 'RESOURCE_NOT_FOUND'],
    [429, 'GITHUB_RATE_LIMITED']
  ])('preserva erro externo %s/%s sem integração parcial', async (status, code) => {
    const project = await localProject();
    boundary.forInstallation.mockRejectedValueOnce(
      new ExternalServiceError('Acesso GitHub indisponível.', status, code)
    );
    const response = await connect(project);
    expect(response.status).toBe(status);
    expect(response.body.code).toBe(code);
    expect(response.body.message).not.toBe('Erro interno ao processar solicitação.');
    await assertUnlinked(project);
  });

  it.each(['INATIVO', 'ARQUIVADO'])(
    'preserva status administrativo %s conforme a política central de escrita',
    async (status) => {
      const project = await localProject(owner, { status });
      const response = await connect(project);
      expect(response.status).toBe(200);
      expect(response.body.project.status).toBe(status);
    }
  );

  it('preserva reserva ativa, carência, privacidade e libera somente depois do purge', async () => {
    const first = await localProject();
    expect((await connect(first)).status).toBe(200);
    const second = await localProject();
    const activeConflict = await connect(second);
    expect(activeConflict.status).toBe(409);
    expect(activeConflict.body.details?.connectedProject?.id).toBe(first.id);
    const outsider = await register('otherowner');
    await authorize(outsider.user.id);
    const foreign = await localProject(outsider);
    const opaque = await connect(foreign, selection(), outsider);
    expect(opaque.status).toBe(409);
    expect(opaque.body.details).toBeUndefined();
    expect(JSON.stringify(opaque.body)).not.toContain(first.name);
    expect((await owner.mutate('delete', `/api/projects/${first.id}`).send({})).status).toBe(200);
    const pending = await connect(second);
    expect(pending.status).toBe(409);
    expect(pending.body.code).toBe('PROJECT_PENDING_DELETION');
    const hiddenPending = await connect(foreign, selection(), outsider);
    expect(hiddenPending.status).toBe(409);
    expect(hiddenPending.body.code).toBe('PROJECT_REPOSITORY_UNAVAILABLE');
    expect(hiddenPending.body.details).toBeUndefined();
    expect(
      (
        await owner
          .mutate('delete', `/api/projects/${first.id}/permanent`)
          .send({ confirmationName: first.name })
      ).status
    ).toBe(200);
    expect((await connect(second)).status).toBe(200);
    expect(await prisma.projectGitHubIntegration.count()).toBe(1);
  });

  it('repetição ou troca não sobrescreve integração, configuração ou histórico e não agenda sync extra', async () => {
    const project = await localProject();
    const response = await connect(project);
    await complete(response.body.initialSync.run);
    await owner
      .mutate('patch', `/api/projects/${project.id}/github/sync-settings`)
      .send({ githubAutoSyncEnabled: true });
    const before = await prisma.projectGitHubIntegration.findUnique({
      where: { projectId: project.id }
    });
    const externalCalls = boundary.forInstallation.mock.calls.length;
    const same = await connect(project);
    expect(same.status).toBe(409);
    expect(same.body.code).toBe('GITHUB_PROJECT_ALREADY_CONNECTED');
    const other = await connect(project, selection('502'));
    expect(other.status).toBe(409);
    expect(other.body.code).toBe('GITHUB_REPOSITORY_SWAP_FORBIDDEN');
    expect(boundary.forInstallation).toHaveBeenCalledTimes(externalCalls);
    expect(
      await prisma.projectGitHubIntegration.findUnique({ where: { projectId: project.id } })
    ).toEqual(before);
    expect(await prisma.auditEvent.count({ where: { action: 'GITHUB_PROJECT_CONNECTED' } })).toBe(
      1
    );
    expect(scheduled).toHaveLength(1);
  });

  it('preserva reconexão legada do mesmo repositório sem substituir a instalação', async () => {
    const project = await localProject();
    const response = await connect(project);
    await prisma.projectGitHubIntegration.update({
      where: { projectId: project.id },
      data: { status: 'RECONNECT_REQUIRED', lastSyncStatus: 'BLOQUEADO' }
    });
    const secondInstallation = await prisma.gitHubInstallation.create({
      data: {
        githubInstallationId: '88',
        accountId: '800',
        accountLogin: 'other',
        accountType: 'User',
        status: 'ACTIVE',
        installedAt: new Date()
      }
    });
    await authorize(owner.user.id, secondInstallation.id);
    expect((await connect(project, { ...selection(), githubInstallationId: '88' })).status).toBe(
      409
    );
    const reconnected = await connect(project);
    expect(reconnected.status).toBe(200);
    expect(reconnected.body.integration.id).toBe(response.body.integration.id);
    expect(reconnected.body.integration.integratedAt).toBe(response.body.integration.integratedAt);
    expect(reconnected.body.initialSync).toBeNull();
    expect(scheduled).toHaveLength(1);
  });

  it('duas transações de projetos distintos disputam um repositório: exatamente uma confirma', async () => {
    const first = await localProject(),
      second = await localProject();
    const responses = await concurrentTransactions(prisma, [
      () => connect(first),
      () => connect(second)
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(await prisma.projectGitHubIntegration.count()).toBe(1);
    expect(await prisma.project.count()).toBe(2);
    expect(await prisma.projectMembership.count({ where: { role: 'OWNER' } })).toBe(2);
    expect(await prisma.auditEvent.count({ where: { action: 'GITHUB_PROJECT_CONNECTED' } })).toBe(
      1
    );
    expect(scheduled).toHaveLength(1);
  });

  it('reconexão legada sem ID só aceita a identidade conhecida pelo nome completo', async () => {
    const project = await localProject();
    const legacy = await prisma.projectGitHubIntegration.create({
      data: {
        projectId: project.id,
        repositoryFullName: repo().fullName,
        repositoryName: repo().name,
        status: 'RECONNECT_REQUIRED',
        autoSyncEnabled: true
      }
    });
    await prisma.commit.create({
      data: { projectId: project.id, hash: 'legacy-local', message: 'Histórico preservado' }
    });
    const rejected = await connect(project, selection('502'));
    expect(rejected.status).toBe(409);
    expect(rejected.body.code).toBe('GITHUB_REPOSITORY_SWAP_FORBIDDEN');
    expect(
      await prisma.projectGitHubIntegration.findUnique({ where: { projectId: project.id } })
    ).toEqual(legacy);
    const reconnected = await connect(project);
    expect(reconnected.status).toBe(200);
    expect(reconnected.body.integration).toMatchObject({
      id: legacy.id,
      githubRepositoryId: '501',
      status: 'ACTIVE',
      autoSyncEnabled: true
    });
    expect(reconnected.body.initialSync).toBeNull();
    expect(await prisma.commit.count()).toBe(1);
    expect(scheduled).toHaveLength(0);
  });

  it.each(['501', '502'])(
    'duas transações do mesmo projeto com repo 501/%s não sobrescrevem nem duplicam',
    async (id) => {
      const project = await localProject();
      const responses = await concurrentTransactions(prisma, [
        () => connect(project),
        () => connect(project, selection(id))
      ]);
      expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
      const winner = responses.find(({ status }) => status === 200);
      expect(
        await prisma.projectGitHubIntegration.findUnique({ where: { projectId: project.id } })
      ).toMatchObject({ githubRepositoryId: winner.body.integration.githubRepositoryId });
      expect(await prisma.projectGitHubIntegration.count()).toBe(1);
      expect(await prisma.auditEvent.count({ where: { action: 'GITHUB_PROJECT_CONNECTED' } })).toBe(
        1
      );
      expect(scheduled).toHaveLength(1);
    }
  );

  it.each(['DELETE', 'ROLE', 'MEMBERSHIP', 'INSTALLATION', 'AUTHORIZATION'])(
    'revalida %s alterado durante a espera externa, sem manter lock no GitHub',
    async (change) => {
      const project = await localProject();
      const reached = deferred(),
        resume = deferred();
      client.listRepositoryPages.mockImplementationOnce(() =>
        (async function* () {
          reached.resolve();
          await resume.promise;
          yield [repo()];
        })()
      );
      const pending = connect(project).then((response) => response);
      await reached.promise;
      try {
        if (change === 'DELETE')
          expect(
            (await owner.mutate('delete', `/api/projects/${project.id}`).send({})).status
          ).toBe(200);
        if (change === 'ROLE')
          await prisma.projectMembership.update({
            where: { projectId_userId: { projectId: project.id, userId: owner.user.id } },
            data: { role: 'MANAGER' }
          });
        if (change === 'MEMBERSHIP')
          await prisma.projectMembership.update({
            where: { projectId_userId: { projectId: project.id, userId: owner.user.id } },
            data: { isActive: false }
          });
        if (change === 'INSTALLATION')
          await prisma.gitHubInstallation.update({
            where: { id: installation.id },
            data: { status: 'SUSPENDED' }
          });
        if (change === 'AUTHORIZATION') await prisma.gitHubInstallationAuthorization.deleteMany();
      } finally {
        resume.resolve();
      }
      const response = await pending;
      expect(response.status).toBe(['DELETE', 'MEMBERSHIP'].includes(change) ? 404 : 403);
      expect(await prisma.projectGitHubIntegration.count()).toBe(0);
      expect(scheduled).toHaveLength(0);
    }
  );

  it('rollback inclui integração e auditoria se a gravação transacional falha', async () => {
    const project = await localProject();
    const before = await snapshot(project.id);
    vi.spyOn(auditRepository, 'create').mockRejectedValueOnce(
      new Error('Artificial audit persistence failure')
    );
    const failed = await connect(project);
    expect(failed.status).toBe(500);
    await assertUnlinked(project);
    expect(await snapshot(project.id)).toEqual(before);
    expect((await connect(project)).status).toBe(200);
  });

  it('falha ao solicitar sync não vira falha de vinculação e permite retry canônico', async () => {
    const project = await localProject();
    sync.requestProjectGithubSync.mockRejectedValueOnce(new Error('Internal persistence detail'));
    const response = await connect(project);
    expect(response.status).toBe(200);
    expect(response.body.initialSync).toMatchObject({
      status: 'FAILED',
      run: null,
      error: { code: 'GITHUB_INITIAL_SYNC_FAILED' }
    });
    expect(response.body.project.githubIntegration).toMatchObject({
      status: 'ACTIVE',
      lastSyncStatus: 'FALHA'
    });
    expect(JSON.stringify(response.body)).not.toContain('Internal persistence detail');
    expect(await prisma.projectGitHubIntegration.count()).toBe(1);
    const retry = await owner.mutate('post', `/api/projects/${project.id}/github/sync`).send({});
    expect(retry.status).toBe(202);
    expect((await complete(retry.body.run)).status).toBe('SUCCEEDED');
    expect(await prisma.projectGitHubIntegration.count()).toBe(1);
  });

  it('mesmo se o registro da falha posterior falhar, responde vínculo confirmado', async () => {
    const project = await localProject();
    sync.requestProjectGithubSync.mockRejectedValueOnce(new Error('Private schedule failure'));
    vi.spyOn(projectRepository, 'markGithubSyncFailed').mockRejectedValueOnce(
      new Error('Private DB failure')
    );
    const response = await connect(project);
    expect(response.status).toBe(200);
    expect(response.body.initialSync.status).toBe('FAILED');
    expect(await prisma.projectGitHubIntegration.count()).toBe(1);
    expect(JSON.stringify(response.body)).not.toMatch(
      /Private schedule failure|Private DB failure/
    );
  });

  it('falha parcial de sync preserva integração/reserva e retry não duplica artefatos', async () => {
    const project = await localProject();
    client.listCommitPages.mockImplementation(() =>
      pages([{ hash: 'github02-sha', message: 'Commit', date: new Date('2026-10-01') }])
    );
    client.listPullRequestPages.mockImplementation(() =>
      pages([{ githubId: 'pr-501', number: 1, title: 'PR', state: 'open' }])
    );
    client.listRepositoryEventPages.mockImplementation(() =>
      pages([
        {
          kind: 'PULL_REQUEST',
          providerEventId: 'event-501',
          number: 1,
          eventType: 'CLOSED',
          occurredAt: new Date('2026-10-02')
        }
      ])
    );
    client.listIssuePages.mockImplementationOnce(() =>
      (async function* () {
        throw new Error('Sensitive external payload');
      })()
    );
    const response = await connect(project);
    const failed = await complete(response.body.initialSync.run);
    expect(failed.status).toBe('FAILED');
    expect(failed.step).toBe('ISSUES');
    expect(await prisma.commit.count()).toBe(1);
    expect(await prisma.pullRequest.count()).toBe(1);
    expect(await prisma.pullRequestLifecycleEvent.count()).toBe(0);
    expect(failed.error.message).not.toContain('Sensitive');
    expect(
      await prisma.projectGitHubIntegration.findUnique({ where: { projectId: project.id } })
    ).toMatchObject({ status: 'ACTIVE', lastSyncStatus: 'FALHA' });
    const second = await localProject();
    expect((await connect(second)).status).toBe(409);
    client.listIssuePages.mockImplementation(() =>
      pages([{ githubId: 'issue-501', number: 2, title: 'Issue', state: 'open' }])
    );
    for (let iteration = 0; iteration < 2; iteration += 1) {
      const retry = await owner.mutate('post', `/api/projects/${project.id}/github/sync`).send({});
      expect(retry.status).toBe(202);
      expect((await complete(retry.body.run)).status).toBe('SUCCEEDED');
    }
    for (const model of ['commit', 'pullRequest', 'issue', 'gitBranch'])
      expect(await prisma[model].count({ where: { projectId: project.id } })).toBe(1);
    expect(await prisma.commitBranch.count()).toBe(1);
    expect(await prisma.pullRequestLifecycleEvent.count()).toBe(1);
    expect(await prisma.projectGitHubIntegration.count()).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: 'GITHUB_PROJECT_CONNECTED' } })).toBe(
      1
    );
  });

  it('mantém ambos os cadastros e usa a mesma reserva com criação GitHub-backed', async () => {
    const local = await localProject();
    const integrated = await owner
      .mutate('post', '/api/projects/from-github')
      .send({ ...selection(), name: 'Integrado', responsibleTeam: 'Equipe' });
    expect(integrated.status).toBe(201);
    expect(integrated.body.project.githubIntegration.status).toBe('ACTIVE');
    expect((await connect(local)).status).toBe(409);
    expect((await connect(local, selection('502'))).status).toBe(200);
    expect(await prisma.project.count()).toBe(2);
    expect(await prisma.projectMembership.count({ where: { role: 'OWNER' } })).toBe(2);
  });

  it('criação GitHub-backed e vinculação posterior concorrentes compartilham a mesma reserva', async () => {
    const project = await localProject();
    const [linked, created] = await concurrentTransactions(prisma, [
      () => connect(project),
      () => owner.mutate('post', '/api/projects/from-github').send(selection())
    ]);
    expect([linked.status, created.status].filter((status) => status === 409)).toHaveLength(1);
    expect(linked.status).toBe(created.status === 201 ? 409 : 200);
    expect(created.status).toBe(linked.status === 200 ? 409 : 201);
    expect(await prisma.projectGitHubIntegration.count()).toBe(1);
    const expectedProjects = created.status === 201 ? 2 : 1;
    expect(await prisma.project.count()).toBe(expectedProjects);
    expect(await prisma.projectMembership.count({ where: { role: 'OWNER' } })).toBe(
      expectedProjects
    );
    expect(scheduled).toHaveLength(linked.status === 200 ? 1 : 0);
  });
});
