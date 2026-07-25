import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanTestDatabase, configureTestDatabaseEnvironment, deployTestMigrations } from '../helpers/test-database.js';
import { createCommit, createProject, createTask } from '../fixtures/factories.js';

let app;
let prisma;
const password = 'SenhaSegura123';

beforeAll(async () => {
  const url = configureTestDatabaseEnvironment();
  deployTestMigrations(url);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
  await cleanTestDatabase(prisma);
});
afterEach(() => cleanTestDatabase(prisma));
afterAll(async () => { await cleanTestDatabase(prisma); await prisma.$disconnect(); });

async function register(email, role, projectId) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({ name: 'Pessoa RF41', email, password });
  if (projectId) {
    await prisma.projectMembership.create({ data: { projectId, userId: response.body.user.id, role } });
  }
  return {
    agent,
    user: response.body.user,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', response.body.csrfToken)
  };
}

describe('RF41 — sugestões persistidas Commit → Task', () => {
  it('analisa histórico, aceita somente o padrão oficial e não reabre rejeições', async () => {
    const project = await createProject(prisma);
    const otherProject = await createProject(prisma);
    const owner = await register('rf41-owner@example.invalid', 'OWNER', project.id);
    const task1 = await createTask(prisma, project.id);
    const task2 = await createTask(prisma, project.id);
    const foreignTask = await createTask(prisma, otherProject.id);
    await createCommit(prisma, project.id, { message: `[TASK-${task1.id}] [task-${task2.id}] [TASK-${task1.id}] [TASK-${foreignTask.id}]` });
    await createCommit(prisma, project.id, { message: `TASK-${task1.id} #${task1.id} [ISSUE-${task1.id}] [TASK-ABC]` });
    const linkedCommit = await createCommit(prisma, project.id, { message: `[TASK-${task1.id}]` });
    await prisma.taskCommit.create({ data: { taskId: task1.id, commitId: linkedCommit.id } });
    const rejectedCommit = await createCommit(prisma, project.id, { message: `[TASK-${task2.id}]` });
    await prisma.taskCommitSuggestion.create({
      data: { projectId: project.id, taskId: task2.id, commitId: rejectedCommit.id, status: 'REJECTED', reviewedAt: new Date(), reviewedByUserId: owner.user.id }
    });

    const first = await owner.mutate('post', `/api/projects/${project.id}/traceability/commit-suggestions/scan`).send({});
    expect(first).toMatchObject({
      status: 200,
      body: { scannedCommits: 4, detectedReferences: 5, createdSuggestions: 2, skippedSuggestions: 3 }
    });
    const second = await owner.mutate('post', `/api/projects/${project.id}/traceability/commit-suggestions/scan`).send({});
    expect(second.body).toMatchObject({ createdSuggestions: 0, skippedSuggestions: 5 });
    expect(await prisma.taskCommitSuggestion.count({ where: { projectId: project.id, status: 'PENDING' } })).toBe(2);
    expect(await prisma.taskCommitSuggestion.count({ where: { commitId: rejectedCommit.id, status: 'PENDING' } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { projectId: project.id, action: 'TASK_COMMIT_SUGGESTIONS_SCANNED' } })).toBe(2);
  });

  it('pagina DTO minimizado e aplica VIEWER+, MEMBER+ e isolamento', async () => {
    const project = await createProject(prisma);
    const task = await createTask(prisma, project.id);
    const commit = await createCommit(prisma, project.id, { message: `[TASK-${task.id}]`, authorEmail: 'privado@example.invalid' });
    const suggestion = await prisma.taskCommitSuggestion.create({ data: { projectId: project.id, taskId: task.id, commitId: commit.id } });
    const viewer = await register('rf41-viewer@example.invalid', 'VIEWER', project.id);
    const outsider = await register('rf41-outsider@example.invalid');

    const list = await viewer.agent.get(`/api/projects/${project.id}/traceability/commit-suggestions?page=1&limit=1`);
    expect(list).toMatchObject({ status: 200, body: { status: 'PENDING', permissions: { canReview: false }, pagination: { page: 1, limit: 1, total: 1 } } });
    expect(list.body.suggestions[0]).toMatchObject({ id: suggestion.id, task: { id: task.id }, commit: { id: commit.id } });
    expect(JSON.stringify(list.body)).not.toContain('authorEmail');
    expect(JSON.stringify(list.body)).not.toContain('privado@example.invalid');
    expect((await viewer.mutate('post', `/api/projects/${project.id}/traceability/commit-suggestions/${suggestion.id}/confirm`).send({})).status).toBe(403);
    expect((await outsider.agent.get(`/api/projects/${project.id}/traceability/commit-suggestions`)).status).toBe(404);
  });

  it('confirma de forma idempotente, cria TaskCommit uma vez e audita', async () => {
    const project = await createProject(prisma);
    const member = await register('rf41-member@example.invalid', 'MEMBER', project.id);
    const task = await createTask(prisma, project.id);
    const commit = await createCommit(prisma, project.id, { message: `[TASK-${task.id}]` });
    const suggestion = await prisma.taskCommitSuggestion.create({ data: { projectId: project.id, taskId: task.id, commitId: commit.id } });
    const path = `/api/projects/${project.id}/traceability/commit-suggestions/${suggestion.id}/confirm`;

    expect((await member.mutate('post', path).send({})).body).toMatchObject({ changed: true, suggestion: { status: 'CONFIRMED' } });
    expect((await member.mutate('post', path).send({})).body).toMatchObject({ changed: false, suggestion: { status: 'CONFIRMED' } });
    expect((await member.mutate('post', path.replace('/confirm', '/reject')).send({})).status).toBe(409);
    expect(await prisma.taskCommit.count({ where: { taskId: task.id, commitId: commit.id } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: 'TASK_COMMIT_SUGGESTION_CONFIRMED', resourceId: String(suggestion.id) } })).toBe(1);
    const audit = await prisma.auditEvent.findFirst({ where: { action: 'TASK_COMMIT_SUGGESTION_CONFIRMED', resourceId: String(suggestion.id) } });
    expect(audit.metadataJson).toEqual({ suggestionId: suggestion.id, taskId: task.id, commitId: commit.id });
  });

  it('rejeita de forma idempotente sem criar TaskCommit e preserva a decisão', async () => {
    const project = await createProject(prisma);
    const member = await register('rf41-reject@example.invalid', 'MEMBER', project.id);
    const task = await createTask(prisma, project.id);
    const commit = await createCommit(prisma, project.id, { message: `[TASK-${task.id}]` });
    const suggestion = await prisma.taskCommitSuggestion.create({ data: { projectId: project.id, taskId: task.id, commitId: commit.id } });
    const path = `/api/projects/${project.id}/traceability/commit-suggestions/${suggestion.id}/reject`;

    expect((await member.mutate('post', path).send({})).body).toMatchObject({ changed: true, suggestion: { status: 'REJECTED' } });
    expect((await member.mutate('post', path).send({})).body).toMatchObject({ changed: false, suggestion: { status: 'REJECTED' } });
    expect((await member.mutate('post', path.replace('/reject', '/confirm')).send({})).status).toBe(409);
    expect(await prisma.taskCommit.count({ where: { taskId: task.id, commitId: commit.id } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { action: 'TASK_COMMIT_SUGGESTION_REJECTED', resourceId: String(suggestion.id) } })).toBe(1);
    expect((await member.mutate('post', `/api/projects/${project.id}/traceability/commit-suggestions/scan`).send({})).body.createdSuggestions).toBe(0);
  });

  it('bloqueia sugestão inconsistente entre projetos sem vínculo ou auditoria', async () => {
    const project = await createProject(prisma);
    const otherProject = await createProject(prisma);
    const member = await register('rf41-cross@example.invalid', 'MEMBER', project.id);
    const task = await createTask(prisma, otherProject.id);
    const commit = await createCommit(prisma, otherProject.id);
    const suggestion = await prisma.taskCommitSuggestion.create({ data: { projectId: project.id, taskId: task.id, commitId: commit.id } });
    const response = await member.mutate('post', `/api/projects/${project.id}/traceability/commit-suggestions/${suggestion.id}/confirm`).send({});
    expect(response.status).toBe(404);
    expect(await prisma.taskCommit.count({ where: { taskId: task.id, commitId: commit.id } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { resourceId: String(suggestion.id), action: 'TASK_COMMIT_SUGGESTION_CONFIRMED' } })).toBe(0);
    expect((await prisma.taskCommitSuggestion.findUnique({ where: { id: suggestion.id } })).status).toBe('PENDING');
  });
});
