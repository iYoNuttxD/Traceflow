import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTestServer } from '../helpers/http-server.js';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

const github = vi.hoisted(() => ({ forInstallation: vi.fn() }));
vi.mock('../../src/modules/github/github.client.js', () => ({
  githubInstallationClientFactory: github
}));

let app;
let prisma;
let owner;
let projectRepository;
const basicData = { name: 'Projeto local', responsibleTeam: 'Equipe local' };

async function register(suffix, verified = true) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: `Pessoa ${suffix}`,
    username: `local_${suffix}`,
    email: `${suffix}@example.invalid`,
    password: 'SenhaArtificial123!'
  });
  expect(response.status).toBe(201);
  if (verified) {
    const verification = await request(app).post('/api/auth/email-verification/verify').send({
      token: response.body.emailVerification.testToken
    });
    expect(verification.status).toBe(200);
  }
  return {
    agent,
    user: response.body.user,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', response.body.csrfToken)
  };
}

async function createLocalProject() {
  const response = await owner.mutate('post', '/api/projects').send(basicData);
  expect(response.status).toBe(201);
  expect(response.body.project.githubIntegration).toBeNull();
  return response.body.project;
}

beforeAll(async () => {
  const target = configureTestDatabaseEnvironment();
  deployTestMigrations(target);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ projectRepository } = await import('../../src/modules/projects/project.repository.js'));
  const { default: application } = await import('../../src/app.js');
  app = await startTestServer(application);
});

beforeEach(async () => {
  await cleanTestDatabase(prisma);
  vi.clearAllMocks();
  github.forInstallation.mockImplementation(() => {
    throw new Error('Projeto local não pode consultar o GitHub.');
  });
  owner = await register('owner');
});

afterAll(async () => {
  if (prisma) {
    await cleanTestDatabase(prisma);
    await prisma.$disconnect();
  }
});

describe('GITHUB-01 — projeto sem integração', () => {
  it('persiste dados básicos e OWNER sem App, identidade GitHub ou integração fictícia', async () => {
    const created = await owner.mutate('post', '/api/projects').send({
      ...basicData,
      name: '  Projeto local  ',
      description: '  Acompanhamento local  '
    });
    expect(created.status).toBe(201);
    const project = created.body.project;
    expect(project).toMatchObject({
      ...basicData,
      description: 'Acompanhamento local',
      status: 'ATIVO',
      githubIntegration: null
    });
    expect(project).not.toHaveProperty('accessCode');
    const stored = await prisma.project.findUnique({
      where: { id: project.id },
      include: { memberships: true, githubIntegration: true }
    });
    expect(stored.githubIntegration).toBeNull();
    expect(stored.memberships).toEqual([
      expect.objectContaining({ userId: owner.user.id, role: 'OWNER', isActive: true })
    ]);
    expect(await prisma.projectGitHubIntegration.count()).toBe(0);
    expect(await prisma.gitHubInstallation.count()).toBe(0);
    expect(await prisma.gitHubIdentity.count()).toBe(0);
    expect(
      await prisma.auditEvent.count({ where: { projectId: project.id, action: 'PROJECT_CREATED' } })
    ).toBe(1);
    expect(github.forInstallation).not.toHaveBeenCalled();
  });

  it('mantém listagem, detalhe, edição, Requirements, Tasks e recuperação locais', async () => {
    const project = await createLocalProject();
    const path = `/api/projects/${project.id}`;
    const listed = await owner.agent.get('/api/projects');
    expect(listed.body.projects).toEqual([
      expect.objectContaining({ id: project.id, githubIntegration: null })
    ]);
    const detail = await owner.agent.get(path);
    expect(detail.status).toBe(200);
    expect(detail.body.project.githubIntegration).toBeNull();
    const edited = await owner
      .mutate('put', path)
      .send({ name: 'Projeto editado', description: 'Local' });
    expect(edited.status).toBe(200);
    expect(edited.body.project).toMatchObject({ name: 'Projeto editado', githubIntegration: null });
    const requirement = await owner
      .mutate('post', `${path}/requirements`)
      .send({ title: 'RF local' });
    expect(requirement.status).toBe(201);
    const task = await owner
      .mutate('post', `${path}/tasks`)
      .send({ title: 'Task local', requirementId: requirement.body.requirement.id });
    expect(task.status).toBe(201);
    expect((await owner.agent.get(`${path}/requirements`)).status).toBe(200);
    expect((await owner.agent.get(`${path}/tasks`)).status).toBe(200);
    expect((await owner.mutate('delete', path).send({})).status).toBe(200);
    expect((await owner.agent.get(path)).status).toBe(404);
    const deleted = await owner.agent.get('/api/projects');
    expect(deleted.body.projects).toEqual([]);
    expect(deleted.body.deletedProjects).toEqual([expect.objectContaining({ id: project.id })]);
    expect((await owner.mutate('post', `${path}/restore`).send({})).status).toBe(200);
    expect((await owner.agent.get(path)).body.project.githubIntegration).toBeNull();
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(1);
    expect(
      await prisma.projectMembership.count({
        where: { projectId: project.id, userId: owner.user.id, role: 'OWNER', isActive: true }
      })
    ).toBe(1);
    expect(github.forInstallation).not.toHaveBeenCalled();
  });

  it('bloqueia sync/configuração GitHub sem integração e consulta artefatos vazios sem falha', async () => {
    const project = await createLocalProject();
    const path = `/api/projects/${project.id}`;
    const artifacts = await owner.agent.get(`${path}/artifacts`);
    expect(artifacts.status).toBe(200);
    expect(artifacts.body).toMatchObject({
      artifacts: [],
      repository: { defaultBranch: null, branches: [] },
      summary: { total: 0 }
    });
    const status = await owner.agent.get(`${path}/github/sync/status`);
    expect(status.status).toBe(200);
    expect(status.body).toEqual({
      run: null,
      automation: {
        status: 'UNAVAILABLE',
        reason: 'WORKER_NOT_OBSERVED',
        nextSyncAt: null,
        lastHeartbeatAt: null,
        checkedAt: expect.any(String)
      }
    });
    expect((await owner.mutate('post', `${path}/github/sync`).send({})).status).toBe(400);
    expect(
      (
        await owner
          .mutate('patch', `${path}/github/sync-settings`)
          .send({ githubAutoSyncEnabled: true })
      ).status
    ).toBe(400);
    expect(await prisma.gitHubSyncRun.count()).toBe(0);
    expect(github.forInstallation).not.toHaveBeenCalled();
  });

  it('preserva NO_DATA/UNASSESSED e ausência de stale no projeto vazio', async () => {
    const project = await createLocalProject();
    const dashboard = await owner.agent.get(
      `/api/projects/${project.id}/indicators/dashboard?view=GENERAL`
    );
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.projectHealth).toMatchObject({ score: null, status: 'UNASSESSED' });
    expect(dashboard.body.freshness.github).toBeNull();
    const indicators = dashboard.body.sections.flatMap((section) => section.indicators);
    expect(indicators.length).toBeGreaterThan(0);
    expect(indicators.every((indicator) => indicator.state !== 'STALE')).toBe(true);
    expect(indicators.find((indicator) => indicator.metricId === 'I45')).toMatchObject({
      state: 'NO_DATA',
      value: null
    });
    expect(
      indicators
        .filter((indicator) => indicator.state === 'NO_DATA')
        .every((indicator) => indicator.value === null)
    ).toBe(true);
    expect(github.forInstallation).not.toHaveBeenCalled();
  });

  it.each(['/api/projects', '/api/projects/from-github'])(
    'preserva sessão, verificação e CSRF em %s',
    async (path) => {
      const body = path.endsWith('from-github')
        ? { githubInstallationId: '77', githubRepositoryId: '501' }
        : basicData;
      expect((await request(app).post(path).send(body)).status).toBe(401);
      expect((await owner.agent.post(path).send(body)).status).toBe(403);
      const unverified = await register('unverified', false);
      const denied = await unverified.mutate('post', path).send(body);
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe('EMAIL_VERIFICATION_REQUIRED');
      expect(await prisma.project.count()).toBe(0);
      expect(github.forInstallation).not.toHaveBeenCalled();
    }
  );

  it.each([
    {},
    { name: '' },
    { name: '   ' },
    { name: 12 },
    { name: 'a'.repeat(256) },
    { name: 'Projeto', responsibleTeam: '' },
    { name: 'Projeto', responsibleTeam: '   ' },
    { ...basicData, status: 'AGUARDANDO_INTEGRACAO' },
    { ...basicData, githubRepositoryId: '' },
    { ...basicData, githubIntegration: null }
  ])('rejeita payload inválido sem persistência: %j', async (body) => {
    const response = await owner.mutate('post', '/api/projects').send(body);
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(await prisma.project.count()).toBe(0);
    expect(await prisma.projectMembership.count()).toBe(0);
  });

  it('reverte Project se a membership inicial não puder ser criada', async () => {
    await expect(
      projectRepository.createProject(
        { ...basicData, accessCode: 'ROLLBACK-LOCAL-01' },
        owner.user.id + 1000000
      )
    ).rejects.toMatchObject({ code: 'P2003' });
    expect(await prisma.project.count()).toBe(0);
    expect(await prisma.projectMembership.count()).toBe(0);
  });

  it('preserva isolamento entre projetos e edição exclusiva de OWNER', async () => {
    const project = await createLocalProject();
    const other = await register('other');
    const path = `/api/projects/${project.id}`;
    expect((await other.agent.get('/api/projects')).body.projects).toEqual([]);
    for (const route of [
      path,
      `${path}/members`,
      `${path}/requirements`,
      `${path}/tasks`,
      `${path}/artifacts`
    ]) {
      expect((await other.agent.get(route)).status).toBe(404);
    }
    expect((await other.mutate('put', path).send({ name: 'Intrusão' })).status).toBe(404);
    await prisma.projectMembership.create({
      data: { projectId: project.id, userId: other.user.id, role: 'VIEWER' }
    });
    expect((await other.agent.get(path)).status).toBe(200);
    expect((await other.mutate('put', path).send({ name: 'Intrusão' })).status).toBe(403);
    expect((await owner.agent.get(path)).body.project.name).toBe(basicData.name);
  });
});

async function qualityFixture(existingProject) {
  const project = existingProject || (await createLocalProject());
  const path = `/api/projects/${project.id}`;
  const requirementResponse = await owner.mutate('post', `${path}/requirements`).send({
    title: 'Validar entrega local'
  });
  expect(requirementResponse.status, requirementResponse.text).toBe(201);
  const requirement = requirementResponse.body.requirement;
  const taskResponse = await owner.mutate('post', `${path}/tasks`).send({
    title: 'Implementar entrega local',
    requirementId: requirement.id
  });
  expect(taskResponse.status, taskResponse.text).toBe(201);
  const task = taskResponse.body.task;
  const response = await owner.mutate('post', `${path}/test-cases`).send({
    title: 'Validar versão entregue',
    preconditions: 'Versão local disponível',
    expectedResult: 'Entrega funciona',
    responsibleUserId: owner.user.id,
    requirementId: requirement.id,
    taskIds: [task.id],
    steps: [{ action: 'Abrir entrega', expectedResult: 'Entrega visível' }]
  });
  expect(response.status, response.text).toBe(201);
  const testCase = response.body.testCase;
  const payload = {
    testCaseVersion: 1,
    environment: 'LOCAL',
    testedReference: { type: 'MANUAL', version: 'release-local-1' },
    steps: [{ position: 1, result: 'PASS' }]
  };
  return {
    project,
    requirement,
    task,
    testCase,
    payload,
    upload: (body = payload, auth = owner) =>
      auth
        .mutate('post', `/api/test-cases/${testCase.id}/executions`)
        .field('payload', JSON.stringify(body)),
    projection: () => owner.agent.get(`${path}/traceability/requirements/${requirement.id}/current`)
  };
}

async function completeTask(id) {
  const response = await owner
    .mutate('patch', `/api/tasks/${id}/move`)
    .send({ toStatus: 'CONCLUIDO' });
  expect(response.status, response.text).toBe(200);
  expect(response.body.task.status).toBe('CONCLUIDO');
}

async function addIntegration(projectId) {
  // Persist the integration boundary directly: no remote account, network call or worker.
  return prisma.projectGitHubIntegration.create({
    data: {
      projectId,
      githubRepositoryId: `local-test-${projectId}`,
      repositoryFullName: 'fixture/local',
      status: 'RECONNECT_REQUIRED'
    }
  });
}

async function connectThroughApi(projectId) {
  const installation = await prisma.gitHubInstallation.create({
    data: {
      githubInstallationId: '77',
      accountId: '700',
      accountLogin: 'fixture',
      accountType: 'Organization',
      status: 'ACTIVE',
      installedAt: new Date()
    }
  });
  await prisma.gitHubInstallationAuthorization.create({
    data: { userId: owner.user.id, installationId: installation.id, verifiedAt: new Date() }
  });
  github.forInstallation.mockResolvedValue({
    async *listRepositoryPages() {
      yield [
        {
          githubRepositoryId: '501',
          name: 'local',
          owner: 'fixture',
          fullName: 'fixture/local',
          url: 'https://github.com/fixture/local',
          defaultBranch: 'main',
          private: true
        }
      ];
    }
  });
  const { githubSyncService } = await import('../../src/modules/github/githubSync.service.js');
  const requestSync = githubSyncService.requestProjectGithubSync;
  const scheduled = [];
  const spy = vi
    .spyOn(githubSyncService, 'requestProjectGithubSync')
    .mockImplementation((id, userId) =>
      requestSync(id, userId, { schedule: (runId) => scheduled.push(runId) })
    );
  try {
    const response = await owner
      .mutate('put', `/api/projects/${projectId}/github/integration`)
      .send({ githubInstallationId: '77', githubRepositoryId: '501' });
    expect(response.status, response.text).toBe(200);
    expect(scheduled).toHaveLength(1);
  } finally {
    spy.mockRestore();
  }
}

describe('GITHUB-01 — ciclo de qualidade sem integração', () => {
  it('executa FAIL, defeito, correção concluída e reteste PASS sem artefato GitHub fictício', async () => {
    const f = await qualityFixture();
    expect(f.testCase.capabilities.canUseManualReference).toBe(true);
    expect(f.requirement.lifecycleBasis).toBe('LOCAL');
    expect((await f.projection()).body).toMatchObject({
      requirement: { lifecycleBasis: 'LOCAL', status: 'PLANEJADO' },
      situation: 'PLANEJADO'
    });
    await completeTask(f.task.id);
    expect((await f.projection()).body).toMatchObject({
      requirement: { status: 'EM_VALIDACAO' },
      situation: 'AGUARDANDO_VALIDACAO',
      implementation: { basis: 'LOCAL', implemented: true, technicalImplemented: false }
    });
    const failed = await f.upload({
      ...f.payload,
      testedReference: { type: 'MANUAL', version: '  release-local-1  ' },
      steps: [{ position: 1, result: 'FAIL', observedResult: 'Entrega não abre' }]
    });
    expect(failed.status, failed.text).toBe(201);
    expect(failed.body.execution).toMatchObject({
      result: 'FAIL',
      testedReferenceType: 'MANUAL',
      testedPullRequestId: null,
      testedCommitId: null,
      testedReferenceSnapshot: f.payload.testedReference
    });
    expect((await f.projection()).body).toMatchObject({
      validation: { fail: 1, pass: 0 },
      situation: 'COM_FALHA',
      requirement: { status: 'EM_CORRECAO' }
    });
    const created = await owner.mutate('post', `/api/projects/${f.project.id}/defects`).send({
      title: 'Entrega não abre',
      description: 'Falha na versão local',
      severity: 'MEDIA',
      responsibleUserId: owner.user.id,
      requirementId: f.requirement.id,
      detectedExecutionStepId: failed.body.execution.steps[0].id
    });
    expect(created.status, created.text).toBe(201);
    let defect = created.body.defect;
    const correction = await owner
      .mutate('post', `/api/defects/${defect.id}/correction-tasks`)
      .send({
        expectedRevision: defect.revision,
        correctionCycle: 1,
        task: { title: 'Corrigir entrega local' }
      });
    expect(correction.status, correction.text).toBe(201);
    defect = correction.body.defect;
    const correctionTaskId = defect.correctionCycles[0].tasks[0].id;
    // Merely scheduling a correction does not mean work has started (S1-08).
    expect(defect.status).toBe('ABERTO');
    expect((await f.projection()).body.situation).toBe('COM_FALHA');
    const started = await owner
      .mutate('patch', `/api/tasks/${correctionTaskId}/move`)
      .send({ toStatus: 'EM_ANDAMENTO' });
    expect(started.status, started.text).toBe(200);
    expect(started.body.task.status).toBe('EM_ANDAMENTO');
    expect((await owner.agent.get(`/api/defects/${defect.id}`)).body.defect.status).toBe(
      'EM_CORRECAO'
    );
    expect((await f.projection()).body.situation).toBe('EM_CORRECAO');
    await completeTask(correctionTaskId);
    defect = (await owner.agent.get(`/api/defects/${defect.id}`)).body.defect;
    expect(defect.status).toBe('AGUARDANDO_RETESTE');
    expect((await f.projection()).body.situation).toBe('AGUARDANDO_RETESTE');
    const passed = await f.upload({
      ...f.payload,
      testedReference: { type: 'MANUAL', version: 'release-local-2' },
      retest: { defectId: defect.id, correctionCycle: 1, expectedRevision: defect.revision }
    });
    expect(passed.status, passed.text).toBe(201);
    expect(passed.body.execution.result).toBe('PASS');
    expect((await owner.agent.get(`/api/defects/${defect.id}`)).body.defect.status).toBe(
      'VALIDADO'
    );
    const projection = await f.projection();
    expect(projection.status).toBe(200);
    expect(projection.body.validation).toMatchObject({ testCasesTotal: 1, pass: 1, fail: 0 });
    expect(projection.body.defects).toMatchObject({
      total: 1,
      validated: 1,
      open: 0,
      waitingRetest: 0
    });
    expect(projection.body).toMatchObject({
      requirement: { lifecycleBasis: 'LOCAL', status: 'CONCLUIDO' },
      situation: 'CONCLUIDO',
      implementation: {
        basis: 'LOCAL',
        implemented: true,
        technicalImplemented: false,
        technicalEvidence: false
      },
      evidence: { implementation: false, validation: true }
    });
    expect(
      (await owner.agent.get(`/api/requirements/${f.requirement.id}`)).body.requirement
    ).toMatchObject({ lifecycleBasis: 'LOCAL', status: 'CONCLUIDO' });
    expect(await prisma.testExecution.count()).toBe(2);
    expect(await prisma.defectRetest.count()).toBe(1);
    expect(await prisma.pullRequest.count()).toBe(0);
    expect(await prisma.commit.count()).toBe(0);
    expect(await prisma.projectGitHubIntegration.count()).toBe(0);
    expect(github.forInstallation).not.toHaveBeenCalled();
    // detectedDefects is live navigation data, so capture it after the defect cycle.
    // The immutable execution/version/reference snapshots must still match their original receipts.
    const executionsBeforeLink = [];
    for (const original of [failed.body.execution, passed.body.execution]) {
      const detail = await owner.agent.get(`/api/test-executions/${original.id}`);
      expect(detail.status, detail.text).toBe(200);
      expect(detail.body.execution).toMatchObject({
        result: original.result,
        testedReferenceType: original.testedReferenceType,
        testedPullRequestId: original.testedPullRequestId,
        testedCommitId: original.testedCommitId,
        testedReferenceSnapshot: original.testedReferenceSnapshot,
        caseVersionSnapshot: original.caseVersionSnapshot
      });
      expect(detail.body.execution.steps).toMatchObject(
        original.steps.map((step) => {
          const snapshot = { ...step };
          delete snapshot.detectedDefects;
          return snapshot;
        })
      );
      executionsBeforeLink.push(detail.body.execution);
    }
    await connectThroughApi(f.project.id);
    const afterLink = await f.projection();
    expect(afterLink.body).toEqual(projection.body);
    expect(await prisma.requirement.findUnique({ where: { id: f.requirement.id } })).toMatchObject({
      lifecycleBasis: 'LOCAL',
      status: 'CONCLUIDO'
    });
    for (const execution of executionsBeforeLink) {
      expect(
        (await owner.agent.get(`/api/test-executions/${execution.id}`)).body.execution
      ).toEqual(execution);
    }
    const newRequirement = await owner
      .mutate('post', `/api/projects/${f.project.id}/requirements`)
      .send({ title: 'Novo requisito integrado' });
    expect(newRequirement.status, newRequirement.text).toBe(201);
    expect(newRequirement.body.requirement.lifecycleBasis).toBe('GITHUB');
    const technicalCoverage = await owner.agent.get(
      `/api/projects/${f.project.id}/traceability/commit-coverage`
    );
    expect(technicalCoverage.status).toBe(200);
    expect(technicalCoverage.body.coverage).toMatchObject({
      numerator: 0,
      percentage: 0,
      hasData: true
    });
  });

  it('invalida conclusão local ao editar versão ou reabrir tarefa sem apagar PASS histórico', async () => {
    const f = await qualityFixture();
    await completeTask(f.task.id);
    const firstPass = await f.upload();
    expect(firstPass.status, firstPass.text).toBe(201);
    expect((await f.projection()).body.requirement.status).toBe('CONCLUIDO');
    await connectThroughApi(f.project.id);
    const commit = await prisma.commit.create({
      data: {
        projectId: f.project.id,
        hash: 'e'.repeat(40),
        message: 'Nova versão após integração'
      }
    });
    const updated = await owner
      .mutate('put', `/api/test-cases/${f.testCase.id}`)
      .send({ expectedVersion: 1, title: 'Validar comportamento atualizado' });
    expect(updated.status, updated.text).toBe(200);
    expect(updated.body.testCase.currentVersion).toBe(2);
    expect((await f.projection()).body).toMatchObject({
      requirement: { lifecycleBasis: 'LOCAL', status: 'EM_VALIDACAO' },
      situation: 'AGUARDANDO_VALIDACAO',
      validation: { neverExecuted: 1, pass: 0 }
    });
    const stale = await f.upload();
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('TEST_CASE_VERSION_CONFLICT');
    const newPass = await f.upload({
      ...f.payload,
      testCaseVersion: 2,
      testedReference: { type: 'COMMIT', id: commit.id }
    });
    expect(newPass.status, newPass.text).toBe(201);
    expect((await f.projection()).body.requirement.status).toBe('CONCLUIDO');
    const reopened = await owner
      .mutate('patch', `/api/tasks/${f.task.id}/move`)
      .send({ toStatus: 'EM_ANDAMENTO' });
    expect(reopened.status, reopened.text).toBe(200);
    expect((await f.projection()).body).toMatchObject({
      requirement: { lifecycleBasis: 'LOCAL', status: 'EM_IMPLEMENTACAO' },
      situation: 'EM_DESENVOLVIMENTO',
      implementation: { implemented: false },
      validation: { pass: 1 }
    });
    expect(
      (await owner.agent.get(`/api/test-executions/${firstPass.body.execution.id}`)).body.execution
    ).toEqual(firstPass.body.execution);
    expect(await prisma.testExecution.count()).toBe(2);
  });

  it.each(['LOCAL', 'GITHUB'])(
    'rejeita override da base %s na criação e edição do requisito',
    async (lifecycleBasis) => {
      const f = await qualityFixture();
      const created = await owner
        .mutate('post', `/api/projects/${f.project.id}/requirements`)
        .send({ title: 'Override proibido', lifecycleBasis });
      expect(created.status, created.text).toBe(400);
      const changed = await owner
        .mutate('put', `/api/requirements/${f.requirement.id}`)
        .send({ title: 'Override proibido', lifecycleBasis });
      expect(changed.status, changed.text).toBe(400);
      expect(await prisma.requirement.count()).toBe(1);
      expect(
        await prisma.requirement.findUnique({ where: { id: f.requirement.id } })
      ).toMatchObject({ lifecycleBasis: 'LOCAL', title: f.requirement.title });
    }
  );

  it('mantém critério técnico para requisito GITHUB mesmo com tarefa concluída e PASS', async () => {
    const project = await createLocalProject();
    await addIntegration(project.id);
    const f = await qualityFixture(project);
    expect(f.requirement.lifecycleBasis).toBe('GITHUB');
    expect(f.testCase.capabilities.canUseManualReference).toBe(false);
    await completeTask(f.task.id);
    const commit = await prisma.commit.create({
      data: { projectId: project.id, hash: 'd'.repeat(40), message: 'Entrega integrada' }
    });
    const passed = await f.upload({
      ...f.payload,
      testedReference: { type: 'COMMIT', id: commit.id }
    });
    expect(passed.status, passed.text).toBe(201);
    expect((await f.projection()).body).toMatchObject({
      requirement: { lifecycleBasis: 'GITHUB', status: 'EM_IMPLEMENTACAO' },
      situation: 'EM_DESENVOLVIMENTO',
      validation: { pass: 1 },
      implementation: { basis: 'GITHUB', implemented: false, technicalImplemented: false }
    });
    const linked = await owner
      .mutate('post', `/api/tasks/${f.task.id}/commits`)
      .send({ commitId: commit.id });
    expect(linked.status, linked.text).toBe(201);
    expect((await f.projection()).body).toMatchObject({
      requirement: { lifecycleBasis: 'GITHUB', status: 'CONCLUIDO' },
      situation: 'CONCLUIDO',
      implementation: { basis: 'GITHUB', implemented: true, technicalImplemented: true },
      evidence: { implementation: true }
    });
    const unlinked = await owner
      .mutate('delete', `/api/tasks/${f.task.id}/commits/${commit.id}`)
      .send({});
    expect(unlinked.status, unlinked.text).toBe(200);
    expect((await f.projection()).body.requirement.status).toBe('EM_IMPLEMENTACAO');
    expect(github.forInstallation).not.toHaveBeenCalled();
  });

  it.each([
    { type: 'MANUAL' },
    { type: 'MANUAL', version: '' },
    { type: 'MANUAL', version: '   ' },
    { type: 'MANUAL', version: null },
    { type: 'MANUAL', version: 1 },
    { type: 'MANUAL', version: 'a'.repeat(201) },
    { type: 'MANUAL', version: 'v1', id: 1 },
    { type: 'MANUAL', version: 'v1', githubUrl: 'https://example.invalid' }
  ])('rejeita referência manual inválida sem execução parcial: %j', async (testedReference) => {
    const f = await qualityFixture();
    const response = await f.upload({ ...f.payload, testedReference });
    expect(response.status, response.text).toBe(400);
    expect(await prisma.testExecution.count()).toBe(0);
    expect(await prisma.testExecutionStep.count()).toBe(0);
    expect(await prisma.testEvidence.count()).toBe(0);
  });

  it('mantém cobertura técnica indisponível mesmo com tarefa e execução locais', async () => {
    const f = await qualityFixture();
    expect((await f.upload()).status).toBe(201);
    for (const artifact of ['pull-request', 'commit', 'issue']) {
      const response = await owner.agent.get(
        `/api/projects/${f.project.id}/traceability/${artifact}-coverage`
      );
      expect(response.status, response.text).toBe(200);
      expect(response.body).toMatchObject({
        coveragePercentage: null,
        coverage: {
          numerator: null,
          denominator: 1,
          percentage: null,
          hasData: false,
          state: 'UNAVAILABLE',
          limitations: ['GITHUB_NOT_CONFIGURED']
        }
      });
    }
    expect(github.forInstallation).not.toHaveBeenCalled();
  });

  it('impõe no MySQL a exclusividade das referências manual, PR e commit', async () => {
    const f = await qualityFixture();
    const response = await f.upload();
    expect(response.status, response.text).toBe(201);
    const id = response.body.execution.id;
    const pr = await prisma.pullRequest.create({
      data: { projectId: f.project.id, githubId: 'check-pr', number: 1, title: 'Referência real' }
    });
    const commit = await prisma.commit.create({
      data: { projectId: f.project.id, hash: 'c'.repeat(40) }
    });
    const before = await prisma.testExecution.findUnique({ where: { id } });
    for (const [type, prId, commitId] of [
      ['MANUAL', pr.id, null],
      ['MANUAL', null, commit.id],
      ['MANUAL', pr.id, commit.id],
      ['PULL_REQUEST', null, null],
      ['PULL_REQUEST', null, commit.id],
      ['PULL_REQUEST', pr.id, commit.id],
      ['COMMIT', null, null],
      ['COMMIT', pr.id, null],
      ['COMMIT', pr.id, commit.id]
    ]) {
      await expect(prisma.$executeRaw`
        UPDATE TestExecution SET testedReferenceType=${type}, testedPullRequestId=${prId}, testedCommitId=${commitId}
        WHERE id=${id}
      `).rejects.toThrow(/TestExecution_primary_reference_check/);
      expect(await prisma.testExecution.findUnique({ where: { id } })).toEqual(before);
    }
  });

  it('preserva autenticação, CSRF, VIEWER, isolamento e inativação na execução manual', async () => {
    const f = await qualityFixture();
    const path = `/api/test-cases/${f.testCase.id}`;
    expect(
      (await request(app).post(`${path}/executions`).field('payload', JSON.stringify(f.payload)))
        .status
    ).toBe(401);
    expect(
      (await owner.agent.post(`${path}/executions`).field('payload', JSON.stringify(f.payload)))
        .status
    ).toBe(403);
    const outsider = await register('quality_outsider');
    expect((await f.upload(f.payload, outsider)).status).toBe(404);
    await prisma.projectMembership.create({
      data: { projectId: f.project.id, userId: outsider.user.id, role: 'VIEWER' }
    });
    expect((await outsider.agent.get(path)).body.testCase.capabilities.canUseManualReference).toBe(
      false
    );
    expect((await f.upload(f.payload, outsider)).status).toBe(403);
    const inactive = await owner
      .mutate('patch', `${path}/status`)
      .send({ expectedVersion: 1, status: 'INATIVO' });
    expect(inactive.status, inactive.text).toBe(200);
    expect(inactive.body.testCase.capabilities.canUseManualReference).toBe(false);
    const denied = await f.upload();
    expect(denied.status).toBe(409);
    expect(denied.body.code).toBe('TEST_CASE_INACTIVE');
    expect(await prisma.testExecution.count()).toBe(0);
  });

  it('preserva histórico manual depois da integração e mantém snapshots PR/commit imutáveis', async () => {
    const f = await qualityFixture();
    const manual = await f.upload();
    expect(manual.status, manual.text).toBe(201);
    const manualSnapshot = manual.body.execution;
    await addIntegration(f.project.id);
    expect(
      (await owner.agent.get(`/api/test-cases/${f.testCase.id}`)).body.testCase.capabilities
        .canUseManualReference
    ).toBe(false);
    const denied = await f.upload();
    expect(denied.status).toBe(409);
    expect(denied.body.code).toBe('TEST_EXECUTION_MANUAL_REFERENCE_UNAVAILABLE');
    expect(
      (await owner.agent.get(`/api/test-executions/${manualSnapshot.id}`)).body.execution
    ).toEqual(manualSnapshot);
    const pr = await prisma.pullRequest.create({
      data: { projectId: f.project.id, githubId: 'quality-pr', number: 1, title: 'Título original' }
    });
    const commit = await prisma.commit.create({
      data: { projectId: f.project.id, hash: 'a'.repeat(40), message: 'Mensagem original' }
    });
    for (const [type, reference, model, update] of [
      ['PULL_REQUEST', pr, prisma.pullRequest, { title: 'Título alterado' }],
      ['COMMIT', commit, prisma.commit, { message: 'Mensagem alterada' }]
    ]) {
      const executed = await f.upload({
        ...f.payload,
        testedReference: { type, id: reference.id }
      });
      expect(executed.status, executed.text).toBe(201);
      const snapshot = executed.body.execution.testedReferenceSnapshot;
      await model.update({ where: { id: reference.id }, data: update });
      const detail = await owner.agent.get(`/api/test-executions/${executed.body.execution.id}`);
      expect(detail.status).toBe(200);
      expect(detail.body.execution.testedReferenceSnapshot).toEqual(snapshot);
    }
    const history = await owner.agent.get(`/api/test-cases/${f.testCase.id}/executions`);
    expect(history.status, history.text).toBe(200);
    expect(history.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: manualSnapshot.id,
          testedReference: f.payload.testedReference
        })
      ])
    );
    expect(await prisma.testExecution.count()).toBe(3);
    expect(github.forInstallation).not.toHaveBeenCalled();
  });

  it.each(['PULL_REQUEST', 'COMMIT'])(
    'oculta referência %s de outro projeto sem degradar para manual',
    async (type) => {
      const f = await qualityFixture();
      const other = await createLocalProject();
      const reference =
        type === 'PULL_REQUEST'
          ? await prisma.pullRequest.create({
              data: { projectId: other.id, githubId: 'foreign-pr', number: 2, title: 'Privado' }
            })
          : await prisma.commit.create({
              data: { projectId: other.id, hash: 'b'.repeat(40), message: 'Privado' }
            });
      const response = await f.upload({
        ...f.payload,
        testedReference: { type, id: reference.id }
      });
      expect(response.status, response.text).toBe(404);
      expect(await prisma.testExecution.count()).toBe(0);
    }
  );
});
