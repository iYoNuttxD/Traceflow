import { startTestServer } from '../helpers/http-server.js';
import request from 'supertest';
import { createHash } from 'node:crypto';
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
  createRequirement,
  createTask,
  setAuthenticatedFixtureUser
} from '../fixtures/factories.js';

let app;
let prisma;
let authService;
let api;
const sessionToken = 'e6-characterization-session-token';
let csrfToken;
let sessionUserId;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

beforeAll(async () => {
  const testDatabaseUrl = configureTestDatabaseEnvironment();
  deployTestMigrations(testDatabaseUrl);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ authService } = await import('../../src/modules/auth/auth.service.js'));
  ({ default: app } = await import('../../src/app.js'));
  app = await startTestServer(app);
  await cleanTestDatabase(prisma);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanTestDatabase(prisma);
  setAuthenticatedFixtureUser(undefined);
});

beforeEach(async () => {
  const user = await prisma.user.create({
    data: {
      name: 'Usuário E6 artificial',
      username: 'usuario-e6-artificial',
      email: 'e6@example.invalid',
      passwordHash: 'fixture-only',
      emailVerifiedAt: new Date()
    }
  });
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: sha256(sessionToken),
      csrfTokenHash: sha256('legacy-csrf-placeholder'),
      sessionVersion: user.sessionVersion,
      expiresAt: new Date(Date.now() + 60000)
    }
  });
  sessionUserId = user.id;
  csrfToken = authService.csrfToken(session);
  setAuthenticatedFixtureUser(user.id);
  const secured = (method) => (path) => {
    const client = request(app);
    return client[method](path)
      .set('Cookie', `traceflow_session=${sessionToken}`)
      .set('X-CSRF-Token', csrfToken);
  };
  api = {
    get: secured('get'),
    post: secured('post'),
    put: secured('put'),
    patch: secured('patch'),
    delete: secured('delete')
  };
});

afterAll(async () => {
  if (prisma) {
    await cleanTestDatabase(prisma);
    await prisma.$disconnect();
  }
});

function projectBody(suffix = 'a') {
  return {
    name: `Projeto HTTP ${suffix}`,
    description: 'Projeto fictício para caracterização',
    responsibleTeam: 'Equipe HTTP artificial',
    status: 'ATIVO'
  };
}

function expectValidationError(response, field) {
  expect(response.status).toBe(400);
  expect(response.body).toMatchObject({
    code: 'VALIDATION_ERROR',
    details: expect.arrayContaining([expect.objectContaining({ field })]),
    requestId: expect.any(String)
  });
  expect(response.body.message).toEqual(expect.any(String));
  expect(response.headers['x-request-id']).toBe(response.body.requestId);
  expect(response.body).not.toHaveProperty('stack');
}

describe('GET /health', () => {
  it('preserva o contrato atual do health check', async () => {
    const response = await api.get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      message: 'TRACEFLOW backend structure is ready.'
    });
  });

  it('expõe liveness sem readiness e sinaliza falha da dependência essencial', async () => {
    const liveResponse = await api.get('/health/live');
    expect(liveResponse.status).toBe(200);
    expect(liveResponse.body).toEqual({ status: 'ok' });

    const readyResponse = await api.get('/health/ready');
    expect(readyResponse.status).toBe(200);
    expect(readyResponse.body).toEqual({ status: 'ready' });
    const { createHealthHandlers } = await import('../../src/shared/http/health.js');
    const readinessCheck = vi.fn();
    const handlers = createHealthHandlers({ readinessCheck });
    const res = { json: vi.fn(), status: vi.fn() };
    res.status.mockReturnValue(res);
    handlers.live({}, res);
    handlers.health({}, res);
    expect(readinessCheck).not.toHaveBeenCalled();
    for (const result of [false, new Error('private-dependency-details')]) {
      readinessCheck.mockReset();
      if (result instanceof Error) readinessCheck.mockRejectedValue(result);
      else readinessCheck.mockResolvedValue(result);
      await handlers.ready({}, res);
      expect(readinessCheck).toHaveBeenCalledExactlyOnceWith();
      expect(res.status).toHaveBeenLastCalledWith(503);
      expect(res.json).toHaveBeenLastCalledWith({
        status: 'not_ready',
        message: 'Dependência essencial indisponível.'
      });
    }
  });

  it('gera, aceita e substitui request ID com segurança', async () => {
    const generated = await api.get('/health');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const accepted = await api.get('/health').set('X-Request-Id', 'cliente-seguro');
    expect(accepted.headers['x-request-id']).toBe('cliente-seguro');

    const replaced = await api
      .get('/health')
      .set('X-Request-Id', 'inválido com espaços e conteúdo arbitrário');
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(replaced.headers['x-request-id']).toMatch(uuid);
    const { resolveRequestId } =
      await import('../../src/middlewares/request-context.middleware.js');
    expect(resolveRequestId('x'.repeat(64))).toBe('x'.repeat(64));
    expect(resolveRequestId(['first', 'second'])).toBe('first');
    for (const value of ['x'.repeat(65), [], ['invalid id'], undefined])
      expect(resolveRequestId(value)).toMatch(uuid);
  });

  it('retorna 404 estruturado para rota desconhecida', async () => {
    const response = await api.get('/rota-inexistente').set('X-Request-Id', 'req-404');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      message: 'Rota não encontrada.',
      code: 'ROUTE_NOT_FOUND',
      requestId: 'req-404'
    });
  });
});

describe('contratos HTTP de projetos', () => {
  it('cria um projeto válido com o status e o envelope atuais', async () => {
    const response = await api.post('/api/projects').send(projectBody('create'));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      message: 'Projeto cadastrado com sucesso.',
      project: {
        name: 'Projeto HTTP create',
        responsibleTeam: 'Equipe HTTP artificial',
        status: 'ATIVO'
      }
    });
    expect(response.body.project).not.toHaveProperty('accessCode');
  });

  it('preserva o erro 400 para body inválido', async () => {
    const response = await api.post('/api/projects').send({});

    expectValidationError(response, 'name');
    expect(response.body.message).toBe('O nome do projeto é obrigatório.');
  });

  it('lista, consulta e atualiza no formato atual', async () => {
    const project = await createProject(prisma, { name: 'Projeto consultável' });

    const listResponse = await api.get('/api/projects');
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.projects).toHaveLength(1);
    expect(listResponse.body.projects[0]).toMatchObject({
      id: project.id,
      name: 'Projeto consultável'
    });

    const detailResponse = await api.get(`/api/projects/${project.id}`);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body).toEqual({
      project: expect.objectContaining({ id: project.id, name: 'Projeto consultável' })
    });

    const updateResponse = await api
      .put(`/api/projects/${project.id}`)
      .send({ name: 'Projeto atualizado', responsibleTeam: 'Equipe atualizada' });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toMatchObject({
      message: 'Projeto atualizado com sucesso.',
      project: { id: project.id, name: 'Projeto atualizado', responsibleTeam: 'Equipe atualizada' }
    });
    const persisted = await api.get(`/api/projects/${project.id}`);
    expect(persisted.status).toBe(200);
    expect(persisted.body.project).toMatchObject({
      name: 'Projeto atualizado',
      responsibleTeam: 'Equipe atualizada'
    });
  });

  it('preserva 404 e o formato de erro para projeto inexistente', async () => {
    const response = await api.get('/api/projects/999999');

    expect(response).toMatchObject({
      status: 404,
      body: {
        message: 'Recurso não encontrado.',
        code: 'RESOURCE_NOT_FOUND',
        requestId: expect.any(String)
      }
    });
  });
});

describe('contratos de requisitos e vínculo com tarefas', () => {
  it('cria, lista, edita e exclui requisito mantendo a tarefa', async () => {
    const project = await createProject(prisma);

    const createResponse = await api
      .post(`/api/projects/${project.id}/requirements`)
      .send({ title: 'Requisito HTTP', description: 'Descrição artificial' });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      message: 'Requisito cadastrado com sucesso.',
      requirement: {
        projectId: project.id,
        title: 'Requisito HTTP',
        type: 'FUNCIONAL',
        status: 'PLANEJADO',
        tasks: []
      }
    });

    const requirementId = createResponse.body.requirement.id;
    const task = await createTask(prisma, project.id, { requirementId });

    const listResponse = await api.get(`/api/projects/${project.id}/requirements`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.total).toBe(1);
    expect(listResponse.body.requirements[0].tasks[0].id).toBe(task.id);

    const updateResponse = await api
      .put(`/api/requirements/${requirementId}`)
      .send({ title: 'Requisito HTTP editado', type: 'NAO_FUNCIONAL' });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.requirement).toMatchObject({
      id: requirementId,
      title: 'Requisito HTTP editado',
      type: 'NAO_FUNCIONAL'
    });

    const deleteResponse = await api.delete(`/api/requirements/${requirementId}`);
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toEqual({ message: 'Requisito excluído com sucesso.' });
    expect(await prisma.requirement.findUnique({ where: { id: requirementId } })).toBeNull();
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toMatchObject({
      requirementId: null
    });
  });

  it('vincula e desvincula tarefa e rejeita vínculo entre projetos', async () => {
    const projectA = await createProject(prisma);
    const projectB = await createProject(prisma);
    const task = await createTask(prisma, projectA.id);
    const requirementA = await createRequirement(prisma, projectA.id);
    const requirementB = await createRequirement(prisma, projectB.id);

    const linkResponse = await api
      .patch(`/api/tasks/${task.id}/requirement`)
      .send({ requirementId: requirementA.id });
    expect(linkResponse.status).toBe(200);
    expect(linkResponse.body.task).toMatchObject({
      id: task.id,
      requirementId: requirementA.id,
      requirement: { id: requirementA.id }
    });

    const auditBeforeRejection = await prisma.auditEvent.count();
    const crossProjectResponse = await api
      .patch(`/api/tasks/${task.id}/requirement`)
      .send({ requirementId: requirementB.id });
    expect(crossProjectResponse.status).toBe(400);
    expect(crossProjectResponse.body.message).toContain('não pertence ao mesmo projeto');
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toMatchObject({
      requirementId: requirementA.id
    });
    expect(await prisma.auditEvent.count()).toBe(auditBeforeRejection);

    const unlinkResponse = await api.delete(`/api/tasks/${task.id}/requirement`);
    expect(unlinkResponse.status).toBe(200);
    expect(unlinkResponse.body.task.requirementId).toBeNull();
  });

  it('preserva detalhe, status, conclusão e erros atuais de requisito', async () => {
    const project = await createProject(prisma);
    const requirement = await createRequirement(prisma, project.id);
    const task = await createTask(prisma, project.id, {
      requirementId: requirement.id,
      status: 'CONCLUIDO'
    });

    const detailResponse = await api.get(`/api/requirements/${requirement.id}`);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.requirement).toMatchObject({ id: requirement.id });

    const tasksResponse = await api.get(`/api/requirements/${requirement.id}/tasks`);
    expect(tasksResponse.status).toBe(200);
    expect(tasksResponse.body).toMatchObject({
      requirementId: requirement.id,
      total: 1,
      tasks: [expect.objectContaining({ id: task.id })]
    });

    const invalidStatusResponse = await api
      .patch(`/api/requirements/${requirement.id}/status`)
      .send({ status: 'INEXISTENTE' });
    expectValidationError(invalidStatusResponse, 'status');
    expect(invalidStatusResponse.body.message).toBe(
      'Status inválido. Use PLANEJADO, EM_VALIDACAO, EM_CORRECAO, CADASTRADO, APROVADO, EM_IMPLEMENTACAO, VALIDADO, CONCLUIDO, PENDENTE, EM_ANDAMENTO, CANCELADO.'
    );

    const earlyCompletionResponse = await api.patch(
      `/api/requirements/${requirement.id}/confirm-completion`
    );
    expect(earlyCompletionResponse.status).toBe(409);
    for (const status of ['APROVADO', 'VALIDADO', 'CONCLUIDO', 'EM_IMPLEMENTACAO']) {
      const response = await api
        .patch(`/api/requirements/${requirement.id}/status`)
        .send({ status });
      expect(response.status).toBe(409);
      expect(response.body.message).toContain('derivado automaticamente');
    }
    expect((await api.get(`/api/requirements/${requirement.id}`)).body.requirement.status).toBe(
      requirement.status
    );

    expect((await api.get('/api/requirements/999999')).status).toBe(404);
    expect(
      (await api.post(`/api/projects/${project.id}/requirements`).send({ title: '   ' })).status
    ).toBe(400);
    expect(
      (await api.post('/api/projects/999999/requirements').send({ title: 'Requisito sem projeto' }))
        .status
    ).toBe(404);
  });

  it('preserva a fórmula atual da cobertura requisito-tarefa', async () => {
    const project = await createProject(prisma);
    const linkedRequirement = await createRequirement(prisma, project.id);
    await createRequirement(prisma, project.id);
    await createTask(prisma, project.id, { requirementId: linkedRequirement.id });

    const response = await api.get(
      `/api/projects/${project.id}/traceability/requirement-task-coverage`
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      projectId: project.id,
      totalRequirements: 2,
      linkedRequirements: 1,
      coveragePercentage: 50,
      coverage: { numerator: 1, denominator: 2, percentage: 50, hasData: true }
    });
  });

  it('atualiza o conjunto Requirement–Task atomicamente, com idempotência e auditoria', async () => {
    const project = await createProject(prisma);
    const otherProject = await createProject(prisma);
    const requirement = await createRequirement(prisma, project.id);
    const previousRequirement = await createRequirement(prisma, project.id);
    const firstTask = await createTask(prisma, project.id, { requirementId: requirement.id });
    const reassignedTask = await createTask(prisma, project.id, {
      requirementId: previousRequirement.id
    });
    const foreignTask = await createTask(prisma, otherProject.id);

    const rejected = await api
      .put(`/api/requirements/${requirement.id}/tasks`)
      .send({ taskIds: [reassignedTask.id, foreignTask.id] });
    expect(rejected.status).toBe(400);
    expect(await prisma.task.findUnique({ where: { id: firstTask.id } })).toMatchObject({
      requirementId: requirement.id
    });
    expect(await prisma.task.findUnique({ where: { id: reassignedTask.id } })).toMatchObject({
      requirementId: previousRequirement.id
    });

    const { auditRepository } = await import('../../src/modules/audit/audit.repository.js');
    const auditBeforeFailure = await prisma.auditEvent.findMany({ orderBy: { id: 'asc' } });
    const auditFailure = vi
      .spyOn(auditRepository, 'createMany')
      .mockImplementationOnce(async (_events, tx) => {
        expect(await tx.task.findUnique({ where: { id: firstTask.id } })).toMatchObject({
          requirementId: null
        });
        expect(await tx.task.findUnique({ where: { id: reassignedTask.id } })).toMatchObject({
          requirementId: requirement.id
        });
        throw new Error('injected audit failure');
      });
    expect(
      (
        await api
          .put(`/api/requirements/${requirement.id}/tasks`)
          .send({ taskIds: [reassignedTask.id] })
      ).status
    ).toBe(500);
    expect(auditFailure).toHaveBeenCalledOnce();
    auditFailure.mockRestore();
    expect(await prisma.task.findUnique({ where: { id: firstTask.id } })).toMatchObject({
      requirementId: requirement.id
    });
    expect(await prisma.task.findUnique({ where: { id: reassignedTask.id } })).toMatchObject({
      requirementId: previousRequirement.id
    });
    expect(await prisma.auditEvent.findMany({ orderBy: { id: 'asc' } })).toEqual(
      auditBeforeFailure
    );

    const updated = await api
      .put(`/api/requirements/${requirement.id}/tasks`)
      .send({ taskIds: [reassignedTask.id] });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      requirement: {
        id: requirement.id,
        tasks: [expect.objectContaining({ id: reassignedTask.id })]
      },
      reassignedTasks: [
        { taskId: reassignedTask.id, previousRequirementId: previousRequirement.id }
      ],
      changes: { linked: 1, unlinked: 1 }
    });
    expect(await prisma.task.findUnique({ where: { id: firstTask.id } })).toMatchObject({
      requirementId: null
    });

    const auditCount = await prisma.auditEvent.count({
      where: { action: { in: ['REQUIREMENT_TASK_LINKED', 'REQUIREMENT_TASK_UNLINKED'] } }
    });
    expect(auditCount).toBe(2);
    const repeated = await api
      .put(`/api/requirements/${requirement.id}/tasks`)
      .send({ taskIds: [reassignedTask.id] });
    expect(repeated.body.changes).toEqual({ linked: 0, unlinked: 0 });
    expect(
      await prisma.auditEvent.count({
        where: { action: { in: ['REQUIREMENT_TASK_LINKED', 'REQUIREMENT_TASK_UNLINKED'] } }
      })
    ).toBe(auditCount);
  });
});

describe('contratos HTTP de tarefas', () => {
  it('cria tarefa mínima e tarefa com requisito, e lista ambas', async () => {
    const project = await createProject(prisma);
    const requirement = await createRequirement(prisma, project.id);

    const minimalResponse = await api
      .post(`/api/projects/${project.id}/tasks`)
      .send({ title: 'Tarefa mínima' });
    expect(minimalResponse.status).toBe(201);
    expect(minimalResponse.body.task).toMatchObject({
      title: 'Tarefa mínima',
      priority: 'MEDIA',
      status: 'A_FAZER',
      commits: [],
      issues: []
    });

    const linkedResponse = await api
      .post(`/api/projects/${project.id}/tasks`)
      .send({ title: 'Tarefa ligada', requirementId: requirement.id });
    expect(linkedResponse.status).toBe(201);
    expect(linkedResponse.body.task.requirement).toMatchObject({ id: requirement.id });

    const listResponse = await api.get(`/api/projects/${project.id}/tasks`);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.total).toBe(2);
    expect(listResponse.body.tasks).toHaveLength(2);
  });

  it('consulta, edita e exclui a tarefa preservando artefatos importados', async () => {
    const project = await createProject(prisma);
    const pullRequest = await createPullRequest(prisma, project.id);
    const commit = await createCommit(prisma, project.id);
    const issue = await createIssue(prisma, project.id);
    const task = await createTask(prisma, project.id, { pullRequestId: pullRequest.id });
    await prisma.taskCommit.create({ data: { taskId: task.id, commitId: commit.id } });
    await prisma.taskIssue.create({ data: { taskId: task.id, issueId: issue.id } });

    const detailResponse = await api.get(`/api/tasks/${task.id}`);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.task).toMatchObject({
      id: task.id,
      pullRequest: { id: pullRequest.id },
      commits: [expect.objectContaining({ id: commit.id })],
      issues: [expect.objectContaining({ id: issue.id })]
    });

    const updateResponse = await api
      .put(`/api/tasks/${task.id}`)
      .send({ title: 'Tarefa editada', estimatedEffort: 3 });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.task).toMatchObject({ title: 'Tarefa editada', estimatedEffort: 3 });

    const unrelatedTask = await createTask(prisma, project.id);
    for (const id of [task.id, unrelatedTask.id]) {
      await prisma.taskMovement.create({
        data: {
          projectId: project.id,
          taskId: id,
          fromStatus: 'A_FAZER',
          toStatus: 'EM_ANDAMENTO',
          movedBy: 'fixture',
          movedByUserId: sessionUserId
        }
      });
      await prisma.taskHistoryEntry.create({
        data: {
          projectId: project.id,
          taskId: id,
          actorUserId: sessionUserId,
          field: 'STATUS',
          fromValue: 'A_FAZER',
          toValue: 'EM_ANDAMENTO'
        }
      });
    }
    const deleteResponse = await api.delete(`/api/tasks/${task.id}`);
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toEqual({ message: 'Tarefa excluída com sucesso.' });
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toBeNull();
    expect(await prisma.commit.findUnique({ where: { id: commit.id } })).not.toBeNull();
    expect(await prisma.pullRequest.findUnique({ where: { id: pullRequest.id } })).not.toBeNull();
    expect(await prisma.issue.findUnique({ where: { id: issue.id } })).not.toBeNull();
    expect(await prisma.taskCommit.count({ where: { taskId: task.id } })).toBe(0);
    expect(await prisma.taskIssue.count({ where: { taskId: task.id } })).toBe(0);
    expect(await prisma.taskMovement.count({ where: { taskId: task.id } })).toBe(0);
    expect(await prisma.taskHistoryEntry.count({ where: { taskId: task.id } })).toBe(0);
    expect(await prisma.taskMovement.count({ where: { taskId: unrelatedTask.id } })).toBe(1);
    expect(await prisma.taskHistoryEntry.count({ where: { taskId: unrelatedTask.id } })).toBe(1);
    expect(
      await prisma.auditEvent.findFirst({
        where: { action: 'TASK_DELETED', resourceId: String(task.id) }
      })
    ).not.toBeNull();
  });

  it('faz a rota direta de status usar movimento, histórico e auditoria atômicos', async () => {
    const project = await createProject(prisma);
    const task = await createTask(prisma, project.id);

    const response = await api
      .patch(`/api/tasks/${task.id}/status`)
      .send({ status: 'EM_ANDAMENTO' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      message: 'Status da tarefa atualizado com sucesso.',
      task: { id: task.id, status: 'EM_ANDAMENTO' }
    });
    expect(await prisma.taskMovement.count({ where: { taskId: task.id } })).toBe(1);
    expect(await prisma.taskHistoryEntry.findFirst({ where: { taskId: task.id } })).toMatchObject({
      field: 'STATUS',
      fromValue: 'A_FAZER',
      toValue: 'EM_ANDAMENTO'
    });
    expect(
      await prisma.auditEvent.findFirst({
        where: { action: 'TASK_MOVED', resourceId: String(task.id) }
      })
    ).not.toBeNull();
    const { auditRepository } = await import('../../src/modules/audit/audit.repository.js');
    const auditBeforeFailure = await prisma.auditEvent.findMany({ orderBy: { id: 'asc' } });
    const auditFailure = vi
      .spyOn(auditRepository, 'create')
      .mockImplementationOnce(async (_event, tx) => {
        expect(await tx.taskMovement.count({ where: { taskId: task.id } })).toBe(2);
        expect(await tx.taskHistoryEntry.count({ where: { taskId: task.id } })).toBe(2);
        throw new Error('injected audit failure');
      });
    expect(
      (await api.patch(`/api/tasks/${task.id}/status`).send({ status: 'CONCLUIDO' })).status
    ).toBe(500);
    expect(auditFailure).toHaveBeenCalledOnce();
    auditFailure.mockRestore();
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toMatchObject({
      status: 'EM_ANDAMENTO'
    });
    expect(await prisma.taskMovement.count({ where: { taskId: task.id } })).toBe(1);
    expect(await prisma.taskHistoryEntry.count({ where: { taskId: task.id } })).toBe(1);
    expect(await prisma.auditEvent.findMany({ orderBy: { id: 'asc' } })).toEqual(
      auditBeforeFailure
    );
    expect((await api.get('/api/tasks/invalido')).status).toBe(400);
    expect((await api.get('/api/tasks/999999')).status).toBe(404);
  });
});

describe('vínculos técnicos', () => {
  it('vincula e desvincula pull request, rejeitando projeto diferente', async () => {
    const projectA = await createProject(prisma);
    const projectB = await createProject(prisma);
    const task = await createTask(prisma, projectA.id);
    const pullRequestA = await createPullRequest(prisma, projectA.id);
    const pullRequestB = await createPullRequest(prisma, projectB.id);

    const linkResponse = await api
      .patch(`/api/tasks/${task.id}/pull-request`)
      .send({ pullRequestId: pullRequestA.id });
    expect(linkResponse.status).toBe(200);
    expect(linkResponse.body.task.pullRequest.id).toBe(pullRequestA.id);

    const crossResponse = await api
      .patch(`/api/tasks/${task.id}/pull-request`)
      .send({ pullRequestId: pullRequestB.id });
    expect(crossResponse.status).toBe(400);
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toMatchObject({
      pullRequestId: pullRequestA.id
    });
    expect(
      await prisma.auditEvent.count({
        where: { action: { in: ['TASK_PULL_REQUEST_LINKED', 'TASK_PULL_REQUEST_UNLINKED'] } }
      })
    ).toBe(1);

    const unlinkResponse = await api.delete(`/api/tasks/${task.id}/pull-request`);
    expect(unlinkResponse.status).toBe(200);
    expect(unlinkResponse.body.task.pullRequest).toBeNull();
    expect(
      await prisma.auditEvent.count({
        where: { action: { in: ['TASK_PULL_REQUEST_LINKED', 'TASK_PULL_REQUEST_UNLINKED'] } }
      })
    ).toBe(2);
    expect(
      await prisma.auditEvent.findMany({
        where: { action: { in: ['TASK_PULL_REQUEST_LINKED', 'TASK_PULL_REQUEST_UNLINKED'] } },
        orderBy: { id: 'asc' },
        select: { action: true, resourceType: true, resourceId: true, actorUserId: true }
      })
    ).toEqual(
      ['TASK_PULL_REQUEST_LINKED', 'TASK_PULL_REQUEST_UNLINKED'].map((action) => ({
        action,
        resourceType: 'PullRequest',
        resourceId: String(pullRequestA.id),
        actorUserId: sessionUserId
      }))
    );
  });

  it('caracteriza vínculo, duplicidade, projeto diferente e remoção de commit', async () => {
    const projectA = await createProject(prisma);
    const projectB = await createProject(prisma);
    const task = await createTask(prisma, projectA.id);
    const commitA = await createCommit(prisma, projectA.id);
    const commitB = await createCommit(prisma, projectB.id);

    const linkResponse = await api
      .post(`/api/tasks/${task.id}/commits`)
      .send({ commitId: commitA.id });
    expect(linkResponse.status).toBe(201);
    expect(linkResponse.body.commits[0]).toMatchObject({
      id: commitA.id,
      shortHash: commitA.hash.slice(0, 7)
    });

    expect(
      (await api.post(`/api/tasks/${task.id}/commits`).send({ commitId: commitA.id })).status
    ).toBe(409);
    expect(
      (await api.post(`/api/tasks/${task.id}/commits`).send({ commitId: commitB.id })).status
    ).toBe(400);

    const unlinkResponse = await api.delete(`/api/tasks/${task.id}/commits/${commitA.id}`);
    expect(unlinkResponse.status).toBe(200);
    expect(unlinkResponse.body.commits).toEqual([]);
    expect(
      await prisma.auditEvent.count({
        where: { action: { in: ['TASK_COMMIT_LINKED', 'TASK_COMMIT_UNLINKED'] } }
      })
    ).toBe(2);
  });

  it('caracteriza vínculo, duplicidade, projeto diferente e remoção de issue', async () => {
    const projectA = await createProject(prisma);
    const projectB = await createProject(prisma);
    const task = await createTask(prisma, projectA.id);
    const issueA = await createIssue(prisma, projectA.id);
    const issueB = await createIssue(prisma, projectB.id);

    const linkResponse = await api
      .post(`/api/tasks/${task.id}/issues`)
      .send({ issueId: issueA.id });
    expect(linkResponse.status).toBe(201);
    expect(linkResponse.body.issues[0]).toMatchObject({ id: issueA.id });

    expect(
      (await api.post(`/api/tasks/${task.id}/issues`).send({ issueId: issueA.id })).status
    ).toBe(409);
    expect(
      (await api.post(`/api/tasks/${task.id}/issues`).send({ issueId: issueB.id })).status
    ).toBe(400);

    const unlinkResponse = await api.delete(`/api/tasks/${task.id}/issues/${issueA.id}`);
    expect(unlinkResponse.status).toBe(200);
    expect(unlinkResponse.body.issues).toEqual([]);
    expect(
      await prisma.auditEvent.count({
        where: { action: { in: ['TASK_ISSUE_LINKED', 'TASK_ISSUE_UNLINKED'] } }
      })
    ).toBe(2);
  });

  it('preserva os contratos de listagem de commits e issues', async () => {
    const project = await createProject(prisma);
    const task = await createTask(prisma, project.id);
    const commit = await createCommit(prisma, project.id);
    const issue = await createIssue(prisma, project.id);
    await prisma.taskCommit.create({ data: { taskId: task.id, commitId: commit.id } });
    await prisma.taskIssue.create({ data: { taskId: task.id, issueId: issue.id } });

    const commitsResponse = await api.get(`/api/tasks/${task.id}/commits`);
    expect(commitsResponse.status).toBe(200);
    expect(commitsResponse.body).toEqual({
      total: 1,
      commits: [expect.objectContaining({ id: commit.id, shortHash: commit.hash.slice(0, 7) })]
    });

    const issuesResponse = await api.get(`/api/tasks/${task.id}/issues`);
    expect(issuesResponse.status).toBe(200);
    expect(issuesResponse.body).toEqual({
      total: 1,
      issues: [expect.objectContaining({ id: issue.id })]
    });
  });
});

describe('Kanban e histórico', () => {
  it('aceita responsável e status na mesma mutation HTTP e congela o estado resultante', async () => {
    const project = await createProject(prisma);
    const task = await createTask(prisma, project.id);
    const responsible = await prisma.user.findFirst({
      where: { username: 'usuario-e6-artificial' }
    });
    const response = await api.patch(`/api/tasks/${task.id}/status`).send({
      status: 'CONCLUIDO',
      responsibleUserId: responsible.id
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.task).toMatchObject({
      status: 'CONCLUIDO',
      responsibleUserId: responsible.id
    });
    expect(await prisma.taskMovement.findFirst({ where: { taskId: task.id } })).toMatchObject({
      toStatus: 'CONCLUIDO',
      responsibleUserIdSnapshot: responsible.id
    });
    expect(
      await prisma.taskHistoryEntry.count({ where: { taskId: task.id, field: 'RESPONSIBLE' } })
    ).toBe(1);
  });

  it('monta o quadro e persiste tarefa e movimento na mesma operação', async () => {
    const project = await createProject(prisma);
    const task = await createTask(prisma, project.id);

    const boardResponse = await api.get(`/api/projects/${project.id}/kanban`);
    expect(boardResponse.status).toBe(200);
    expect(boardResponse.body).toMatchObject({
      projectId: project.id,
      totals: { A_FAZER: 1, EM_ANDAMENTO: 0, CONCLUIDO: 0, total: 1 }
    });
    expect(boardResponse.body.columns.A_FAZER[0].id).toBe(task.id);

    const moveResponse = await api
      .patch(`/api/tasks/${task.id}/move`)
      .send({ toStatus: 'EM_ANDAMENTO' });
    expect(moveResponse.status).toBe(200);
    expect(moveResponse.body).toMatchObject({
      message: 'Tarefa movida com sucesso.',
      task: { id: task.id, status: 'EM_ANDAMENTO' },
      movement: {
        taskId: task.id,
        fromStatus: 'A_FAZER',
        toStatus: 'EM_ANDAMENTO',
        movedBy: 'Usuário E6 artificial'
      }
    });

    expect(await prisma.task.findUnique({ where: { id: task.id } })).toMatchObject({
      status: 'EM_ANDAMENTO'
    });
    expect(await prisma.taskMovement.count({ where: { taskId: task.id } })).toBe(1);
    expect(
      await prisma.taskHistoryEntry.count({ where: { taskId: task.id, field: 'STATUS' } })
    ).toBe(1);

    const otherProject = await createProject(prisma);
    const otherTask = await createTask(prisma, otherProject.id);
    await prisma.taskMovement.createMany({
      data: [
        {
          projectId: project.id,
          taskId: task.id,
          fromStatus: 'A_FAZER',
          toStatus: 'EM_ANDAMENTO',
          movedBy: 'Other actor',
          movedAt: new Date('2026-01-01')
        },
        {
          projectId: project.id,
          taskId: task.id,
          fromStatus: 'A_FAZER',
          toStatus: 'EM_ANDAMENTO',
          movedBy: 'Usuário E6 artificial',
          movedAt: new Date('2019-12-31')
        },
        {
          projectId: otherProject.id,
          taskId: otherTask.id,
          fromStatus: 'A_FAZER',
          toStatus: 'EM_ANDAMENTO',
          movedBy: 'Usuário E6 artificial',
          movedAt: new Date('2026-01-01')
        }
      ]
    });
    const movementsResponse = await api.get(`/api/projects/${project.id}/kanban/movements`).query({
      startDate: '2020-01-01',
      endDate: '2030-12-31',
      movedBy: 'Usuário E6 artificial'
    });
    expect(movementsResponse.status).toBe(200);
    expect(movementsResponse.body.total).toBe(1);
    expect(movementsResponse.body.movements.map(({ id }) => id)).toEqual([
      moveResponse.body.movement.id
    ]);
    expect(movementsResponse.body.movements[0]).toMatchObject({
      taskId: task.id,
      taskTitle: task.title,
      movedBy: 'Usuário E6 artificial'
    });

    const metricsResponse = await api
      .get(`/api/projects/${project.id}/kanban/metrics`)
      .query({ startDate: '2020-01-01', endDate: '2030-12-31' });
    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.body.totalMovements).toBe(2);
  });

  it('rejeita movimento para a coluna atual sem criar histórico', async () => {
    const project = await createProject(prisma);
    const task = await createTask(prisma, project.id);

    const response = await api.patch(`/api/tasks/${task.id}/move`).send({ toStatus: 'A_FAZER' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'A tarefa já está nesta coluna.' });
    expect(await prisma.taskMovement.count()).toBe(0);
    expect(await prisma.taskHistoryEntry.count()).toBe(0);
  });

  it('rejeita ator enviado no body e sempre deriva a autoria da sessão', async () => {
    const project = await createProject(prisma);
    const task = await createTask(prisma, project.id);
    const forged = await api.patch(`/api/tasks/${task.id}/move`).send({
      toStatus: 'EM_ANDAMENTO',
      movedBy: 'Ator forjado'
    });
    expectValidationError(forged, 'movedBy');
    expect(await prisma.taskMovement.count()).toBe(0);

    expect(
      (await api.patch(`/api/tasks/${task.id}/move`).send({ toStatus: 'EM_ANDAMENTO' })).status
    ).toBe(200);
    const movement = await prisma.taskMovement.findFirst({ where: { taskId: task.id } });
    expect(movement).toMatchObject({ movedBy: 'Usuário E6 artificial' });
    expect(movement).not.toHaveProperty('projectMemberId');
    expect(movement.movedByUserId).toBe(sessionUserId);
    expect(await prisma.taskHistoryEntry.findFirst({ where: { taskId: task.id } })).toMatchObject({
      actorUserId: sessionUserId
    });
    expect(
      await prisma.auditEvent.findFirst({
        where: { action: 'TASK_MOVED', resourceId: String(task.id) }
      })
    ).toMatchObject({ actorUserId: sessionUserId });
  });

  it('registra prazo, responsável e prioridade e pagina o histórico no backend', async () => {
    const project = await createProject(prisma);
    const responsible = await prisma.user.create({
      data: {
        name: 'Responsável E11',
        username: 'responsavel-e11',
        email: 'responsavel-e11@example.invalid',
        passwordHash: 'fixture-only'
      }
    });
    await prisma.projectMembership.create({
      data: { projectId: project.id, userId: responsible.id, role: 'MEMBER' }
    });
    const task = await createTask(prisma, project.id);

    const updated = await api.put(`/api/tasks/${task.id}`).send({
      deadline: '2026-08-10',
      priority: 'ALTA',
      responsibleUserId: responsible.id
    });
    expect(updated.status).toBe(200);
    expect(updated.body.task).toMatchObject({
      responsibleUserId: responsible.id,
      responsibleUser: { id: responsible.id, name: 'Responsável E11' },
      responsible: 'Responsável E11'
    });
    expect(await prisma.taskHistoryEntry.count({ where: { taskId: task.id } })).toBe(3);

    await api
      .put(`/api/tasks/${task.id}`)
      .send({ deadline: '2026-08-10', priority: 'ALTA', responsibleUserId: responsible.id });
    expect(await prisma.taskHistoryEntry.count({ where: { taskId: task.id } })).toBe(3);

    const firstPage = await api
      .get(`/api/projects/${project.id}/tasks/history`)
      .query({ page: 1, limit: 2 });
    expect(firstPage.status).toBe(200);
    expect(firstPage.body).toMatchObject({
      total: 3,
      pagination: { page: 1, limit: 2, total: 3, totalPages: 2 }
    });
    expect(firstPage.body.items).toHaveLength(2);
    const secondPage = await api
      .get(`/api/projects/${project.id}/tasks/history`)
      .query({ page: 2, limit: 2 });
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.items).toHaveLength(1);
    const storedHistory = await prisma.taskHistoryEntry.findMany({
      where: { taskId: task.id },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }]
    });
    expect([...firstPage.body.items, ...secondPage.body.items].map(({ id }) => id)).toEqual(
      storedHistory.map(({ id }) => id)
    );
    expect(storedHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'PRIORITY', fromValue: 'MEDIA', toValue: 'ALTA' }),
        expect.objectContaining({
          field: 'DEADLINE',
          fromValue: null,
          toValue: '2026-08-10T00:00:00.000Z'
        }),
        expect.objectContaining({
          field: 'RESPONSIBLE',
          fromValue: null,
          toValue: String(responsible.id)
        })
      ])
    );
    expect(firstPage.body.items[0].actor).toEqual(
      expect.objectContaining({ name: 'Usuário E6 artificial' })
    );
    const filtered = await api
      .get(`/api/projects/${project.id}/tasks/history`)
      .query({ field: 'RESPONSIBLE' });
    expect(filtered.status).toBe(200);
    expect(filtered.body).toMatchObject({
      total: 1,
      items: [expect.objectContaining({ field: 'RESPONSIBLE', toValue: String(responsible.id) })]
    });
  });

  it('rejeita responsável sem membership ativa no mesmo projeto', async () => {
    const project = await createProject(prisma);
    const otherProject = await createProject(prisma);
    const outsideUser = await prisma.user.create({
      data: {
        name: 'Responsável externo',
        username: 'responsavel-externo-e11',
        email: 'responsavel-externo-e11@example.invalid',
        passwordHash: 'fixture-only'
      }
    });
    await prisma.projectMembership.create({
      data: { projectId: otherProject.id, userId: outsideUser.id, role: 'MEMBER' }
    });

    const crossProject = await api
      .post(`/api/projects/${project.id}/tasks`)
      .send({ title: 'Tarefa protegida', responsibleUserId: outsideUser.id });
    expect(crossProject.status).toBe(400);
    expect(crossProject.body).toEqual({
      message: 'Usuário responsável não pertence ao projeto.'
    });

    await prisma.projectMembership.create({
      data: {
        projectId: project.id,
        userId: outsideUser.id,
        role: 'MEMBER',
        isActive: false
      }
    });
    const inactive = await api
      .post(`/api/projects/${project.id}/tasks`)
      .send({ title: 'Tarefa protegida', responsibleUserId: outsideUser.id });
    expect(inactive.status).toBe(400);
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(0);

    const textual = await api
      .post(`/api/projects/${project.id}/tasks`)
      .send({ title: 'Tarefa textual', responsible: 'Nome enviado pelo cliente' });
    expectValidationError(textual, 'responsible');
  });

  it('protege atualização concorrente do mesmo status com conflito e sem histórico duplicado', async () => {
    const project = await createProject(prisma);
    const task = await createTask(prisma, project.id);
    const { taskMovementRepository } =
      await import('../../src/modules/tasks/repositories/task-movement.repository.js');
    const original = taskMovementRepository.transitionStatus.bind(taskMovementRepository);
    let release;
    const bothRead = new Promise((resolve) => {
      release = resolve;
    });
    let arrivals = 0;
    vi.spyOn(taskMovementRepository, 'transitionStatus').mockImplementation(async (input) => {
      expect(input.task.status).toBe('A_FAZER');
      if (++arrivals === 2) release();
      await bothRead;
      return original(input);
    });
    const [first, second] = await Promise.all([
      api.patch(`/api/tasks/${task.id}/move`).send({ toStatus: 'EM_ANDAMENTO' }),
      api.patch(`/api/tasks/${task.id}/move`).send({ toStatus: 'CONCLUIDO' })
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const winner = [first, second].find(({ status }) => status === 200);
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toMatchObject({
      status: winner.body.task.status
    });
    expect(await prisma.taskMovement.findFirst({ where: { taskId: task.id } })).toMatchObject({
      fromStatus: 'A_FAZER',
      toStatus: winner.body.task.status
    });
    expect(await prisma.taskHistoryEntry.findFirst({ where: { taskId: task.id } })).toMatchObject({
      fromValue: 'A_FAZER',
      toValue: winner.body.task.status
    });
    expect(await prisma.taskMovement.count({ where: { taskId: task.id } })).toBe(1);
    expect(
      await prisma.taskHistoryEntry.count({ where: { taskId: task.id, field: 'STATUS' } })
    ).toBe(1);
    expect(
      await prisma.auditEvent.count({
        where: { action: 'TASK_MOVED', resourceId: String(task.id) }
      })
    ).toBe(1);
  });

  it('preserva métricas de tarefas e coberturas técnicas atuais', async () => {
    const project = await createProject(prisma);
    const pullRequest = await createPullRequest(prisma, project.id);
    const commit = await createCommit(prisma, project.id);
    const issue = await createIssue(prisma, project.id);
    const linkedTask = await createTask(prisma, project.id, {
      pullRequestId: pullRequest.id
    });
    await createTask(prisma, project.id);
    await prisma.taskCommit.create({ data: { taskId: linkedTask.id, commitId: commit.id } });
    await prisma.taskIssue.create({ data: { taskId: linkedTask.id, issueId: issue.id } });

    const metricsResponse = await api.get(`/api/projects/${project.id}/tasks/metrics`);
    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.body).toMatchObject({
      projectId: project.id,
      indicator: 'Volume de planejamento',
      metric: 'Quantidade de tarefas cadastradas',
      totalTasksCreated: 2
    });

    for (const kind of ['pull-request', 'commit', 'issue']) {
      const response = await api.get(`/api/projects/${project.id}/traceability/${kind}-coverage`);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        projectId: project.id,
        totalTasks: 2,
        linkedTasks: 1,
        coveragePercentage: 50,
        coverage: { numerator: 1, denominator: 2, percentage: 50, hasData: true }
      });
    }
  });
});

describe('matriz e detalhe de rastreabilidade', () => {
  it('preserva fórmulas atuais para requisitos sem tarefa, PR, commit e somente issue', async () => {
    const project = await createProject(prisma);
    const requirementEmpty = await createRequirement(prisma, project.id, {
      title: 'Sem tarefa'
    });
    const requirementTaskOnly = await createRequirement(prisma, project.id, {
      title: 'Somente tarefa'
    });
    const requirementPr = await createRequirement(prisma, project.id, { title: 'Com PR' });
    const requirementCommit = await createRequirement(prisma, project.id, {
      title: 'Com commit'
    });
    const requirementIssue = await createRequirement(prisma, project.id, {
      title: 'Somente issue'
    });
    await createTask(prisma, project.id, { requirementId: requirementTaskOnly.id });

    const pullRequest = await createPullRequest(prisma, project.id);
    await createTask(prisma, project.id, {
      requirementId: requirementPr.id,
      pullRequestId: pullRequest.id
    });

    const commit = await createCommit(prisma, project.id);
    const commitTask = await createTask(prisma, project.id, {
      requirementId: requirementCommit.id,
      status: 'CONCLUIDO'
    });
    await prisma.taskCommit.create({ data: { taskId: commitTask.id, commitId: commit.id } });

    const issue = await createIssue(prisma, project.id);
    const issueTask = await createTask(prisma, project.id, {
      requirementId: requirementIssue.id
    });
    await prisma.taskIssue.create({ data: { taskId: issueTask.id, issueId: issue.id } });

    const matrixResponse = await api.get(
      `/api/projects/${project.id}/traceability/requirements-matrix`
    );
    expect(matrixResponse.status).toBe(200);
    expect(matrixResponse.body.summary).toMatchObject({
      totalRequirements: 5,
      requirementsWithTasks: 4,
      requirementsWithTechnicalEvidence: 2,
      implementedRequirements: 1,
      averageProgressPercentage: 20
    });
    expect(matrixResponse.body.summary.averageProgress).toEqual({
      numerator: 100,
      denominator: 5,
      percentage: 20,
      hasData: true
    });
    expect(matrixResponse.body.pagination).toMatchObject({ page: 1, limit: 20, total: 5 });

    const byTitle = Object.fromEntries(
      matrixResponse.body.requirements.map((requirement) => [requirement.title, requirement])
    );
    expect(byTitle['Sem tarefa']).toMatchObject({
      id: requirementEmpty.id,
      tasksCount: 0,
      progressPercentage: 0,
      hasTechnicalEvidence: false,
      implementationStatus: 'SEM_RASTREABILIDADE'
    });
    expect(byTitle['Somente tarefa']).toMatchObject({
      tasksCount: 1,
      hasTechnicalEvidence: false,
      implementationStatus: 'PLANEJADO'
    });
    expect(byTitle['Com PR']).toMatchObject({
      pullRequestsCount: 1,
      hasTechnicalEvidence: true,
      implementationStatus: 'EM_DESENVOLVIMENTO'
    });
    expect(byTitle['Com commit']).toMatchObject({
      commitsCount: 1,
      progressPercentage: 100,
      hasTechnicalEvidence: true,
      implementationStatus: 'IMPLEMENTADO'
    });
    expect(byTitle['Somente issue']).toMatchObject({
      issuesCount: 1,
      hasTechnicalEvidence: false,
      implementationStatus: 'PLANEJADO'
    });

    const detailResponse = await api.get(
      `/api/projects/${project.id}/traceability/requirements/${requirementIssue.id}`
    );
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body).toMatchObject({
      projectId: project.id,
      perspective: { type: 'REQUIREMENT', id: requirementIssue.id },
      summary: { hasTechnicalEvidence: false, implementationStatus: 'PLANEJADO' },
      pagination: { scope: 'tasks', total: 1 }
    });
    expect(detailResponse.body.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: `requirement:${requirementIssue.id}`, type: 'REQUIREMENT' }),
        expect.objectContaining({ id: `task:${issueTask.id}`, type: 'TASK' }),
        expect.objectContaining({ id: `issue:${issue.id}`, type: 'ISSUE' })
      ])
    );
    expect(detailResponse.body.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'REQUIREMENT_TASK',
          source: `requirement:${requirementIssue.id}`,
          target: `task:${issueTask.id}`
        }),
        expect.objectContaining({
          type: 'TASK_ISSUE',
          source: `task:${issueTask.id}`,
          target: `issue:${issue.id}`
        })
      ])
    );
    expect(JSON.stringify(detailResponse.body)).not.toContain('authorEmail');

    const pagedMatrix = await api.get(
      `/api/projects/${project.id}/traceability/requirements-matrix?page=1&limit=2`
    );
    expect(pagedMatrix.body.requirements).toHaveLength(2);
    expect(pagedMatrix.body.summary.totalRequirements).toBe(5);
    expect(pagedMatrix.body.pagination).toMatchObject({ total: 5, totalPages: 3 });
  });

  it('usa o mesmo grafo canônico nas perspectivas de tarefa e artefato', async () => {
    const project = await createProject(prisma);
    const otherProject = await createProject(prisma);
    const requirement = await createRequirement(prisma, project.id);
    const task = await createTask(prisma, project.id, { requirementId: requirement.id });
    const commit = await createCommit(prisma, project.id, {
      authorEmail: 'privado@example.invalid'
    });
    const issue = await createIssue(prisma, project.id);
    const pullRequest = await createPullRequest(prisma, project.id);
    await prisma.task.update({ where: { id: task.id }, data: { pullRequestId: pullRequest.id } });
    await prisma.taskCommit.create({ data: { taskId: task.id, commitId: commit.id } });
    await prisma.taskIssue.create({ data: { taskId: task.id, issueId: issue.id } });

    const taskGraph = await api.get(`/api/projects/${project.id}/traceability/tasks/${task.id}`);
    expect(taskGraph.status).toBe(200);
    expect(taskGraph.body.perspective).toEqual({ type: 'TASK', id: task.id });
    expect(new Set(taskGraph.body.nodes.map((node) => node.id)).size).toBe(
      taskGraph.body.nodes.length
    );
    expect(new Set(taskGraph.body.edges.map((edge) => edge.id)).size).toBe(
      taskGraph.body.edges.length
    );
    expect(taskGraph.body.edges.map((edge) => edge.type).sort()).toEqual([
      'REQUIREMENT_TASK',
      'TASK_COMMIT',
      'TASK_ISSUE',
      'TASK_PULL_REQUEST'
    ]);
    expect(JSON.stringify(taskGraph.body)).not.toContain('authorEmail');

    const secondArtifactPage = await api.get(
      `/api/projects/${project.id}/traceability/tasks/${task.id}?page=2&limit=1`
    );
    expect(secondArtifactPage.body).toMatchObject({
      summary: { hasTechnicalEvidence: true, artifactsCount: 3 },
      pagination: { page: 2, limit: 1, total: 3, scope: 'artifacts' }
    });
    expect(secondArtifactPage.body.edges).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'TASK_COMMIT' })])
    );
    expect(
      (await api.get(`/api/projects/${otherProject.id}/traceability/tasks/${task.id}`)).status
    ).toBe(404);

    const sibling = await createTask(prisma, project.id, {
      requirementId: requirement.id,
      pullRequestId: pullRequest.id
    });
    await prisma.taskCommit.create({ data: { taskId: sibling.id, commitId: commit.id } });
    await prisma.taskIssue.create({ data: { taskId: sibling.id, issueId: issue.id } });
    for (const [type, artifact] of [
      ['commit', commit],
      ['pull-request', pullRequest],
      ['issue', issue]
    ]) {
      const response = await api.get(
        `/api/projects/${project.id}/traceability/artifacts/${type}/${artifact.id}`
      );
      expect(response.status).toBe(200);
      const artifactType = type.toUpperCase().replace('-', '_');
      const edgeType = `TASK_${artifactType}`;
      expect(response.body).toMatchObject({
        projectId: project.id,
        perspective: { type: artifactType, id: artifact.id },
        pagination: { scope: 'tasks', total: 2 }
      });
      expect(
        response.body.nodes
          .map(({ id, type }) => ({ id, type }))
          .sort((a, b) => a.id.localeCompare(b.id))
      ).toEqual(
        [
          { id: `${type}:${artifact.id}`, type: artifactType },
          { id: `requirement:${requirement.id}`, type: 'REQUIREMENT' },
          { id: `task:${task.id}`, type: 'TASK' },
          { id: `task:${sibling.id}`, type: 'TASK' }
        ].sort((a, b) => a.id.localeCompare(b.id))
      );
      const expectedEdges = [task.id, sibling.id].flatMap((id) => [
        { type: edgeType, source: `task:${id}`, target: `${type}:${artifact.id}` },
        { type: 'REQUIREMENT_TASK', source: `requirement:${requirement.id}`, target: `task:${id}` }
      ]);
      expect(
        response.body.edges.map(({ type, source, target }) => ({ type, source, target }))
      ).toEqual(expect.arrayContaining(expectedEdges));
      expect(response.body.edges).toHaveLength(4);
      const pages = await Promise.all(
        [1, 2].map((page) =>
          api
            .get(`/api/projects/${project.id}/traceability/artifacts/${type}/${artifact.id}`)
            .query({ page, limit: 1 })
        )
      );
      expect(pages.map(({ status }) => status)).toEqual([200, 200]);
      expect(
        pages
          .flatMap(({ body }) =>
            body.nodes.filter(({ type }) => type === 'TASK').map(({ entityId }) => entityId)
          )
          .sort((a, b) => a - b)
      ).toEqual([task.id, sibling.id].sort((a, b) => a - b));
    }

    expect(
      (await api.get(`/api/projects/${project.id}/traceability/artifacts/branch/${commit.id}`))
        .status
    ).toBe(400);
    expect(
      (await api.get(`/api/projects/${otherProject.id}/traceability/artifacts/commit/${commit.id}`))
        .status
    ).toBe(404);
  });
});

describe('validação HTTP negativa da E4', () => {
  it('valida IDs, boolean, accessCode, campos suportados e contratos removidos de Projects', async () => {
    const project = await createProject(prisma);
    expectValidationError(await api.get('/api/projects/invalido'), 'id');
    expectValidationError(await api.delete('/api/projects/invalido'), 'id');

    expectValidationError(
      await api
        .post('/api/projects')
        .send({ ...projectBody('url'), githubUrl: 'https://example.com/repo' }),
      'githubUrl'
    );
    expectValidationError(
      await api
        .patch(`/api/projects/${project.id}/github/sync-settings`)
        .send({ githubAutoSyncEnabled: 'true' }),
      'githubAutoSyncEnabled'
    );
    const removedMemberRoute = await api
      .post(`/api/projects/${project.id}/members`)
      .send({ name: 'Pessoa', email: 'invalido', role: 'MEMBRO' });
    expect(removedMemberRoute).toMatchObject({
      status: 404,
      body: { code: 'ROUTE_NOT_FOUND' }
    });
    expectValidationError(
      await api.post('/api/projects/join').send({ accessCode: '', name: 'Pessoa' }),
      'accessCode'
    );
    expectValidationError(
      await api.post('/api/projects').send({ ...projectBody('unknown'), campoInventado: true }),
      'campoInventado'
    );
  });

  it('valida entradas de Requirements sem alterar erros de domínio', async () => {
    const project = await createProject(prisma);
    const requirement = await createRequirement(prisma, project.id);
    expectValidationError(await api.get('/api/requirements/invalido'), 'id');
    expectValidationError(
      await api.post(`/api/projects/${project.id}/requirements`).send({ title: '' }),
      'title'
    );
    expectValidationError(
      await api
        .post(`/api/projects/${project.id}/requirements`)
        .send({ title: 'RF', type: 'OUTRO' }),
      'type'
    );
    expectValidationError(
      await api.patch(`/api/requirements/${requirement.id}/status`).send({ status: 'OUTRO' }),
      'status'
    );
    expectValidationError(
      await api.get(`/api/projects/${project.id}/requirements?search=${'a'.repeat(256)}`),
      'search'
    );
    expectValidationError(
      await api
        .post(`/api/projects/${project.id}/requirements`)
        .send({ title: 'RF', segredo: 'nao-retornar' }),
      'segredo'
    );
  });

  it('valida entradas de Tasks, vínculos e filtros', async () => {
    const project = await createProject(prisma);
    const task = await createTask(prisma, project.id);
    expectValidationError(await api.get('/api/tasks/1.5'), 'id');
    expectValidationError(
      await api.post(`/api/projects/${project.id}/tasks`).send({ title: '' }),
      'title'
    );
    expectValidationError(
      await api
        .post(`/api/projects/${project.id}/tasks`)
        .send({ title: 'Tarefa', estimatedEffort: -1 }),
      'estimatedEffort'
    );
    expectValidationError(
      await api
        .post(`/api/projects/${project.id}/tasks`)
        .send({ title: 'Tarefa', deadline: '2026-02-30' }),
      'deadline'
    );
    expectValidationError(
      await api
        .post(`/api/projects/${project.id}/tasks`)
        .send({ title: 'Tarefa', priority: 'URGENTE' }),
      'priority'
    );
    expectValidationError(
      await api.patch(`/api/tasks/${task.id}/status`).send({ status: 'OUTRO' }),
      'status'
    );
    expectValidationError(
      await api.patch(`/api/tasks/${task.id}/requirement`).send({ requirementId: 'abc' }),
      'requirementId'
    );
    expectValidationError(
      await api.post(`/api/tasks/${task.id}/commits`).send({ commitId: 0 }),
      'commitId'
    );
    expectValidationError(
      await api.post(`/api/tasks/${task.id}/issues`).send({ issueId: -2 }),
      'issueId'
    );
    expectValidationError(
      await api.get(
        `/api/projects/${project.id}/tasks/metrics?startDate=2026-12-31&endDate=2026-01-01`
      ),
      'endDate'
    );
    expectValidationError(
      await api
        .post(`/api/projects/${project.id}/tasks`)
        .send({ title: 'Tarefa', campoInventado: true }),
      'campoInventado'
    );
  });

  it('valida schemas HTTP de GitHub, Artifacts e Traceability', async () => {
    const project = await createProject(prisma);
    expectValidationError(await api.get('/api/projects/x/commits'), 'projectId');
    expectValidationError(
      await api.get(`/api/projects/${project.id}/issues?search=${'a'.repeat(256)}`),
      'search'
    );
    expectValidationError(
      await api.get(`/api/projects/${project.id}/artifacts?type=branch`),
      'type'
    );
    expectValidationError(
      await api.get(`/api/projects/${project.id}/artifacts?startDate=2026-02-30`),
      'startDate'
    );
    expectValidationError(
      await api.get('/api/projects/x/traceability/requirements-matrix'),
      'projectId'
    );
    expectValidationError(
      await api.get(`/api/projects/${project.id}/traceability/requirements/x`),
      'requirementId'
    );
  });

  it('não retorna valores sensíveis nem internals no erro', async () => {
    const secret = 'token-super-secreto';
    const response = await api
      .post('/api/projects')
      .set('X-Request-Id', 'e4-seguro')
      .send({ ...projectBody('secret'), token: secret });
    expectValidationError(response, 'token');
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toMatch(/Zod|schema|stack/i);
    expect(response.body.requestId).toBe('e4-seguro');
  });
});

describe('baseline dos endpoints removidos e lifecycle de Project', () => {
  it('trata DELETE Project inexistente como 404 opaco', async () => {
    const response = await api.delete('/api/projects/1');
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });

  it('remove os contratos genéricos legados para recursos acessíveis', async () => {
    const project = await createProject(prisma);
    const task = await createTask(prisma, project.id);
    const requirement = await createRequirement(prisma, project.id);
    const commit = await createCommit(prisma, project.id);
    for (const [method, path] of [
      ['post', `/api/projects/${project.id}/trace-links`],
      ['get', `/api/requirements/${requirement.id}/traceability`],
      ['get', `/api/tasks/${task.id}/traceability`],
      ['get', `/api/github-artifacts/${commit.id}/traceability`],
      ['delete', `/api/trace-links/${commit.id}`]
    ]) {
      const response = await api[method](path);
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ROUTE_NOT_FOUND');
    }
    expect((await api.get(`/api/tasks/${task.id}`)).status).toBe(200);
    expect((await api.get(`/api/requirements/${requirement.id}`)).status).toBe(200);
  });

  it('remove o placeholder GitHub redundante sem afetar o endpoint canônico de artifacts', async () => {
    const project = await createProject(prisma);
    const response = await api.get(`/api/projects/${project.id}/github/artifacts`);
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('ROUTE_NOT_FOUND');
    const commit = await createCommit(prisma, project.id);
    const canonical = await api.get(`/api/projects/${project.id}/artifacts`);
    expect(canonical.status).toBe(200);
    expect(canonical.body.artifacts).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: commit.id })])
    );
  });
});
