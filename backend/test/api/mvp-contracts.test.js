import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import {
  createCommit,
  createIssue,
  createProject,
  createProjectMember,
  createPullRequest,
  createRequirement,
  createTask
} from '../fixtures/factories.js';

let app;
let prisma;

beforeAll(async () => {
  const testDatabaseUrl = configureTestDatabaseEnvironment();
  deployTestMigrations(testDatabaseUrl);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
  await cleanTestDatabase(prisma);
});

afterEach(async () => {
  await cleanTestDatabase(prisma);
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
    githubOwner: 'fake-owner',
    githubRepo: `fake-repo-${suffix}`,
    githubUrl: `https://github.com/fake-owner/fake-repo-${suffix}`,
    status: 'ATIVO'
  };
}

describe('GET /health', () => {
  it('preserva o contrato atual do health check', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      message: 'TRACEFLOW backend structure is ready.'
    });
  });
});

describe('contratos HTTP de projetos', () => {
  it('cria um projeto válido com o status e o envelope atuais', async () => {
    const response = await request(app).post('/api/projects').send(projectBody('create'));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      message: 'Projeto cadastrado com sucesso.',
      project: {
        name: 'Projeto HTTP create',
        responsibleTeam: 'Equipe HTTP artificial',
        status: 'ATIVO',
        githubOwner: 'fake-owner',
        githubRepo: 'fake-repo-create'
      }
    });
    expect(response.body.project.accessCode).toMatch(/^TRC-/);
  });

  it('preserva o erro 400 para body inválido', async () => {
    const response = await request(app).post('/api/projects').send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'O nome do projeto é obrigatório.' });
  });

  it('lista, consulta e atualiza no formato atual', async () => {
    const project = await createProject(prisma, { name: 'Projeto consultável' });

    const listResponse = await request(app).get('/api/projects');
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.projects).toHaveLength(1);
    expect(listResponse.body.projects[0]).toMatchObject({
      id: project.id,
      name: 'Projeto consultável'
    });

    const detailResponse = await request(app).get(`/api/projects/${project.id}`);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body).toEqual({
      project: expect.objectContaining({ id: project.id, name: 'Projeto consultável' })
    });

    const updateResponse = await request(app)
      .put(`/api/projects/${project.id}`)
      .send({ name: 'Projeto atualizado', responsibleTeam: 'Equipe atualizada' });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toMatchObject({
      message: 'Projeto atualizado com sucesso.',
      project: { id: project.id, name: 'Projeto atualizado' }
    });
  });

  it('preserva 404 e o formato de erro para projeto inexistente', async () => {
    const response = await request(app).get('/api/projects/999999');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Projeto não encontrado.' });
  });
});

describe('contratos de requisitos e vínculo com tarefas', () => {
  it('cria, lista, edita e exclui requisito mantendo a tarefa', async () => {
    const project = await createProject(prisma);

    const createResponse = await request(app)
      .post(`/api/projects/${project.id}/requirements`)
      .send({ title: 'Requisito HTTP', description: 'Descrição artificial' });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      message: 'Requisito cadastrado com sucesso.',
      requirement: {
        projectId: project.id,
        title: 'Requisito HTTP',
        type: 'FUNCIONAL',
        status: 'CADASTRADO',
        tasks: []
      }
    });

    const requirementId = createResponse.body.requirement.id;
    const task = await createTask(prisma, project.id, { requirementId });

    const listResponse = await request(app).get(
      `/api/projects/${project.id}/requirements`
    );
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.total).toBe(1);
    expect(listResponse.body.requirements[0].tasks[0].id).toBe(task.id);

    const updateResponse = await request(app)
      .put(`/api/requirements/${requirementId}`)
      .send({ title: 'Requisito HTTP editado', type: 'NAO_FUNCIONAL' });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.requirement).toMatchObject({
      id: requirementId,
      title: 'Requisito HTTP editado',
      type: 'NAO_FUNCIONAL'
    });

    const deleteResponse = await request(app).delete(`/api/requirements/${requirementId}`);
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

    const linkResponse = await request(app)
      .patch(`/api/tasks/${task.id}/requirement`)
      .send({ requirementId: requirementA.id });
    expect(linkResponse.status).toBe(200);
    expect(linkResponse.body.task).toMatchObject({
      id: task.id,
      requirementId: requirementA.id,
      requirement: { id: requirementA.id }
    });

    const crossProjectResponse = await request(app)
      .patch(`/api/tasks/${task.id}/requirement`)
      .send({ requirementId: requirementB.id });
    expect(crossProjectResponse.status).toBe(400);
    expect(crossProjectResponse.body.message).toContain('não pertence ao mesmo projeto');

    const unlinkResponse = await request(app).delete(`/api/tasks/${task.id}/requirement`);
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

    const detailResponse = await request(app).get(`/api/requirements/${requirement.id}`);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.requirement).toMatchObject({ id: requirement.id });

    const tasksResponse = await request(app).get(`/api/requirements/${requirement.id}/tasks`);
    expect(tasksResponse.status).toBe(200);
    expect(tasksResponse.body).toMatchObject({
      requirementId: requirement.id,
      total: 1,
      tasks: [expect.objectContaining({ id: task.id })]
    });

    const invalidStatusResponse = await request(app)
      .patch(`/api/requirements/${requirement.id}/status`)
      .send({ status: 'INEXISTENTE' });
    expect(invalidStatusResponse.status).toBe(400);
    expect(invalidStatusResponse.body).toEqual({
      message:
        'Status inválido. Use CADASTRADO, APROVADO, EM_IMPLEMENTACAO, VALIDADO ou CONCLUIDO.'
    });

    const earlyCompletionResponse = await request(app).patch(
      `/api/requirements/${requirement.id}/confirm-completion`
    );
    expect(earlyCompletionResponse.status).toBe(400);
    expect(earlyCompletionResponse.body).toEqual({
      message: 'Apenas requisitos validados podem ser concluídos.'
    });

    const statusResponse = await request(app)
      .patch(`/api/requirements/${requirement.id}/status`)
      .send({ status: 'VALIDADO' });
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body).toMatchObject({
      message: 'Status do requisito atualizado com sucesso.',
      requirement: { id: requirement.id, status: 'VALIDADO' }
    });

    const completionResponse = await request(app).patch(
      `/api/requirements/${requirement.id}/confirm-completion`
    );
    expect(completionResponse.status).toBe(200);
    expect(completionResponse.body).toMatchObject({
      message: 'Requisito concluído com sucesso.',
      requirement: { id: requirement.id, status: 'CONCLUIDO' }
    });

    expect((await request(app).get('/api/requirements/999999')).status).toBe(404);
    expect(
      (
        await request(app)
          .post(`/api/projects/${project.id}/requirements`)
          .send({ title: '   ' })
      ).status
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/projects/999999/requirements')
          .send({ title: 'Requisito sem projeto' })
      ).status
    ).toBe(404);
  });

  it('preserva a fórmula atual da cobertura requisito-tarefa', async () => {
    const project = await createProject(prisma);
    const linkedRequirement = await createRequirement(prisma, project.id);
    await createRequirement(prisma, project.id);
    await createTask(prisma, project.id, { requirementId: linkedRequirement.id });

    const response = await request(app).get(
      `/api/projects/${project.id}/traceability/requirement-task-coverage`
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      projectId: project.id,
      totalRequirements: 2,
      linkedRequirements: 1,
      coveragePercentage: 50
    });
  });
});

describe('contratos HTTP de tarefas', () => {
  it('cria tarefa mínima e tarefa com requisito, e lista ambas', async () => {
    const project = await createProject(prisma);
    const requirement = await createRequirement(prisma, project.id);

    const minimalResponse = await request(app)
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

    const linkedResponse = await request(app)
      .post(`/api/projects/${project.id}/tasks`)
      .send({ title: 'Tarefa ligada', requirementId: requirement.id });
    expect(linkedResponse.status).toBe(201);
    expect(linkedResponse.body.task.requirement).toMatchObject({ id: requirement.id });

    const listResponse = await request(app).get(`/api/projects/${project.id}/tasks`);
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

    const detailResponse = await request(app).get(`/api/tasks/${task.id}`);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.task).toMatchObject({
      id: task.id,
      pullRequest: { id: pullRequest.id },
      commits: [expect.objectContaining({ id: commit.id })],
      issues: [expect.objectContaining({ id: issue.id })]
    });

    const updateResponse = await request(app)
      .put(`/api/tasks/${task.id}`)
      .send({ title: 'Tarefa editada', actualEffort: 3 });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.task).toMatchObject({ title: 'Tarefa editada', actualEffort: 3 });

    const deleteResponse = await request(app).delete(`/api/tasks/${task.id}`);
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toEqual({ message: 'Tarefa excluída com sucesso.' });
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toBeNull();
    expect(await prisma.commit.findUnique({ where: { id: commit.id } })).not.toBeNull();
    expect(await prisma.pullRequest.findUnique({ where: { id: pullRequest.id } })).not.toBeNull();
    expect(await prisma.issue.findUnique({ where: { id: issue.id } })).not.toBeNull();
  });

  it('preserva atualização direta de status sem criar TaskMovement', async () => {
    const project = await createProject(prisma);
    const task = await createTask(prisma, project.id);

    const response = await request(app)
      .patch(`/api/tasks/${task.id}/status`)
      .send({ status: 'EM_ANDAMENTO' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      message: 'Status da tarefa atualizado com sucesso.',
      task: { id: task.id, status: 'EM_ANDAMENTO' }
    });
    expect(await prisma.taskMovement.count({ where: { taskId: task.id } })).toBe(0);
    expect((await request(app).get('/api/tasks/invalido')).status).toBe(400);
    expect((await request(app).get('/api/tasks/999999')).status).toBe(404);
  });
});

describe('vínculos técnicos', () => {
  it('vincula e desvincula pull request, rejeitando projeto diferente', async () => {
    const projectA = await createProject(prisma);
    const projectB = await createProject(prisma);
    const task = await createTask(prisma, projectA.id);
    const pullRequestA = await createPullRequest(prisma, projectA.id);
    const pullRequestB = await createPullRequest(prisma, projectB.id);

    const linkResponse = await request(app)
      .patch(`/api/tasks/${task.id}/pull-request`)
      .send({ pullRequestId: pullRequestA.id });
    expect(linkResponse.status).toBe(200);
    expect(linkResponse.body.task.pullRequest.id).toBe(pullRequestA.id);

    const crossResponse = await request(app)
      .patch(`/api/tasks/${task.id}/pull-request`)
      .send({ pullRequestId: pullRequestB.id });
    expect(crossResponse.status).toBe(400);

    const unlinkResponse = await request(app).delete(`/api/tasks/${task.id}/pull-request`);
    expect(unlinkResponse.status).toBe(200);
    expect(unlinkResponse.body.task.pullRequest).toBeNull();
  });

  it('caracteriza vínculo, duplicidade, projeto diferente e remoção de commit', async () => {
    const projectA = await createProject(prisma);
    const projectB = await createProject(prisma);
    const task = await createTask(prisma, projectA.id);
    const commitA = await createCommit(prisma, projectA.id);
    const commitB = await createCommit(prisma, projectB.id);

    const linkResponse = await request(app)
      .post(`/api/tasks/${task.id}/commits`)
      .send({ commitId: commitA.id });
    expect(linkResponse.status).toBe(201);
    expect(linkResponse.body.commits[0]).toMatchObject({
      id: commitA.id,
      shortHash: commitA.hash.slice(0, 7)
    });

    expect(
      (await request(app).post(`/api/tasks/${task.id}/commits`).send({ commitId: commitA.id }))
        .status
    ).toBe(409);
    expect(
      (await request(app).post(`/api/tasks/${task.id}/commits`).send({ commitId: commitB.id }))
        .status
    ).toBe(400);

    const unlinkResponse = await request(app).delete(
      `/api/tasks/${task.id}/commits/${commitA.id}`
    );
    expect(unlinkResponse.status).toBe(200);
    expect(unlinkResponse.body.commits).toEqual([]);
  });

  it('caracteriza vínculo, duplicidade, projeto diferente e remoção de issue', async () => {
    const projectA = await createProject(prisma);
    const projectB = await createProject(prisma);
    const task = await createTask(prisma, projectA.id);
    const issueA = await createIssue(prisma, projectA.id);
    const issueB = await createIssue(prisma, projectB.id);

    const linkResponse = await request(app)
      .post(`/api/tasks/${task.id}/issues`)
      .send({ issueId: issueA.id });
    expect(linkResponse.status).toBe(201);
    expect(linkResponse.body.issues[0]).toMatchObject({ id: issueA.id });

    expect(
      (await request(app).post(`/api/tasks/${task.id}/issues`).send({ issueId: issueA.id }))
        .status
    ).toBe(409);
    expect(
      (await request(app).post(`/api/tasks/${task.id}/issues`).send({ issueId: issueB.id }))
        .status
    ).toBe(400);

    const unlinkResponse = await request(app).delete(
      `/api/tasks/${task.id}/issues/${issueA.id}`
    );
    expect(unlinkResponse.status).toBe(200);
    expect(unlinkResponse.body.issues).toEqual([]);
  });

  it('preserva os contratos de listagem de commits e issues', async () => {
    const project = await createProject(prisma);
    const task = await createTask(prisma, project.id);
    const commit = await createCommit(prisma, project.id);
    const issue = await createIssue(prisma, project.id);
    await prisma.taskCommit.create({ data: { taskId: task.id, commitId: commit.id } });
    await prisma.taskIssue.create({ data: { taskId: task.id, issueId: issue.id } });

    const commitsResponse = await request(app).get(`/api/tasks/${task.id}/commits`);
    expect(commitsResponse.status).toBe(200);
    expect(commitsResponse.body).toEqual({
      total: 1,
      commits: [expect.objectContaining({ id: commit.id, shortHash: commit.hash.slice(0, 7) })]
    });

    const issuesResponse = await request(app).get(`/api/tasks/${task.id}/issues`);
    expect(issuesResponse.status).toBe(200);
    expect(issuesResponse.body).toEqual({
      total: 1,
      issues: [expect.objectContaining({ id: issue.id })]
    });
  });
});

describe('Kanban e histórico', () => {
  it('monta o quadro e persiste tarefa e movimento na mesma operação', async () => {
    const project = await createProject(prisma);
    const member = await createProjectMember(prisma, project.id, {
      name: 'Movimentador artificial'
    });
    const task = await createTask(prisma, project.id);

    const boardResponse = await request(app).get(`/api/projects/${project.id}/kanban`);
    expect(boardResponse.status).toBe(200);
    expect(boardResponse.body).toMatchObject({
      projectId: project.id,
      totals: { A_FAZER: 1, EM_ANDAMENTO: 0, CONCLUIDO: 0, total: 1 }
    });
    expect(boardResponse.body.columns.A_FAZER[0].id).toBe(task.id);

    const moveResponse = await request(app)
      .patch(`/api/tasks/${task.id}/move`)
      .send({ toStatus: 'EM_ANDAMENTO', projectMemberId: member.id });
    expect(moveResponse.status).toBe(200);
    expect(moveResponse.body).toMatchObject({
      message: 'Tarefa movida com sucesso.',
      task: { id: task.id, status: 'EM_ANDAMENTO' },
      movement: {
        taskId: task.id,
        fromStatus: 'A_FAZER',
        toStatus: 'EM_ANDAMENTO',
        movedBy: 'Movimentador artificial',
        projectMemberId: member.id
      }
    });

    expect(await prisma.task.findUnique({ where: { id: task.id } })).toMatchObject({
      status: 'EM_ANDAMENTO'
    });
    expect(await prisma.taskMovement.count({ where: { taskId: task.id } })).toBe(1);

    const movementsResponse = await request(app)
      .get(`/api/projects/${project.id}/kanban/movements`)
      .query({
        startDate: '2020-01-01',
        endDate: '2030-12-31',
        movedBy: 'Movimentador artificial'
      });
    expect(movementsResponse.status).toBe(200);
    expect(movementsResponse.body.total).toBe(1);
    expect(movementsResponse.body.movements[0]).toMatchObject({
      taskId: task.id,
      taskTitle: task.title,
      movedBy: 'Movimentador artificial'
    });

    const metricsResponse = await request(app)
      .get(`/api/projects/${project.id}/kanban/metrics`)
      .query({ startDate: '2020-01-01', endDate: '2030-12-31' });
    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.body.totalMovements).toBe(1);
  });

  it('rejeita movimento para a coluna atual sem criar histórico', async () => {
    const project = await createProject(prisma);
    const task = await createTask(prisma, project.id);

    const response = await request(app)
      .patch(`/api/tasks/${task.id}/move`)
      .send({ toStatus: 'A_FAZER', movedBy: 'Ator textual artificial' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'A tarefa já está nesta coluna.' });
    expect(await prisma.taskMovement.count()).toBe(0);
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

    const metricsResponse = await request(app).get(`/api/projects/${project.id}/tasks/metrics`);
    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.body).toMatchObject({
      projectId: project.id,
      indicator: 'Volume de planejamento',
      metric: 'Quantidade de tarefas cadastradas',
      totalTasksCreated: 2
    });

    for (const kind of ['pull-request', 'commit', 'issue']) {
      const response = await request(app).get(
        `/api/projects/${project.id}/traceability/${kind}-coverage`
      );
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        projectId: project.id,
        totalTasks: 2,
        linkedTasks: 1,
        coveragePercentage: 50
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

    const matrixResponse = await request(app).get(
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

    const detailResponse = await request(app).get(
      `/api/projects/${project.id}/traceability/requirements/${requirementIssue.id}`
    );
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body).toMatchObject({
      projectId: project.id,
      requirement: {
        id: requirementIssue.id,
        hasTechnicalEvidence: false,
        implementationStatus: 'PLANEJADO'
      },
      tasks: [
        expect.objectContaining({
          id: issueTask.id,
          pullRequest: null,
          commits: [],
          issues: [expect.objectContaining({ id: issue.id })]
        })
      ]
    });
  });
});

describe('baseline dos endpoints 501', () => {
  it.each([
    ['delete', '/api/projects/1'],
    ['get', '/api/projects/1/github/artifacts'],
    ['post', '/api/projects/1/trace-links'],
    ['get', '/api/requirements/1/traceability'],
    ['get', '/api/tasks/1/traceability'],
    ['get', '/api/github-artifacts/1/traceability'],
    ['delete', '/api/trace-links/1']
  ])('%s %s continua retornando 501', async (method, path) => {
    const response = await request(app)[method](path);

    expect(response.status).toBe(501);
    expect(response.body).toHaveProperty('message');
  });
});
