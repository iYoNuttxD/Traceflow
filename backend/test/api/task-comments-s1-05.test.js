import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject, createTask } from '../fixtures/factories.js';

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
afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function register(email, role, projectId) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: `Pessoa ${email.split('@')[0]}`,
    username: `u${email
      .split('@')[0]
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 29)}`,
    email,
    password
  });
  await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: response.body.emailVerification.testToken });
  if (projectId) {
    await prisma.projectMembership.create({
      data: { projectId, userId: response.body.user.id, role }
    });
  }
  return {
    agent,
    user: response.body.user,
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', response.body.csrfToken)
  };
}

const createComment = (taskId, projectId, authorUserId, content) =>
  prisma.taskComment.create({ data: { projectId, taskId, authorUserId, content } });

describe('S1-05 — comentários das tarefas (RF29/RF31)', () => {
  it('registra comentário com autor da sessão, valida conteúdo e audita', async () => {
    const project = await createProject(prisma);
    const member = await register('s105-member@example.invalid', 'MEMBER', project.id);
    const task = await createTask(prisma, project.id);
    const path = `/api/tasks/${task.id}/comments`;

    const created = await member.mutate('post', path).send({ content: '  Primeiro comentário.  ' });
    expect(created).toMatchObject({
      status: 201,
      body: {
        comment: {
          taskId: task.id,
          content: 'Primeiro comentário.',
          editedAt: null,
          author: { id: member.user.id },
          canEdit: true,
          canDelete: true
        }
      }
    });

    const persisted = await prisma.taskComment.findUnique({
      where: { id: created.body.comment.id }
    });
    expect(persisted).toMatchObject({
      projectId: project.id,
      taskId: task.id,
      authorUserId: member.user.id,
      deletedAt: null
    });

    expect((await member.mutate('post', path).send({ content: '' })).status).toBe(400);
    expect((await member.mutate('post', path).send({ content: '   ' })).status).toBe(400);
    expect((await member.mutate('post', path).send({ content: 'a'.repeat(2001) })).status).toBe(
      400
    );
    expect((await member.mutate('post', path).send({ content: 'ok', extra: true })).status).toBe(
      400
    );
    expect((await member.mutate('post', path).send({ content: 'a'.repeat(2000) })).status).toBe(
      201
    );

    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'TASK_COMMENT_CREATED', resourceId: String(created.body.comment.id) }
    });
    expect(audit).toMatchObject({
      actorUserId: member.user.id,
      projectId: project.id,
      resourceType: 'TaskComment',
      metadataJson: { taskId: task.id }
    });
  });

  it('pagina de forma estável sem perder nem duplicar registros', async () => {
    const project = await createProject(prisma);
    const member = await register('s105-pager@example.invalid', 'MEMBER', project.id);
    const task = await createTask(prisma, project.id);
    for (let index = 1; index <= 7; index += 1) {
      await createComment(task.id, project.id, member.user.id, `Comentário ${index}`);
    }

    const firstPage = await member.agent.get(`/api/tasks/${task.id}/comments?page=1&limit=5`);
    const secondPage = await member.agent.get(`/api/tasks/${task.id}/comments?page=2&limit=5`);
    expect(firstPage).toMatchObject({
      status: 200,
      body: {
        taskId: task.id,
        total: 7,
        permissions: { canComment: true, canModerate: false },
        pagination: { page: 1, limit: 5, total: 7, totalPages: 2 }
      }
    });
    expect(firstPage.body.comments).toHaveLength(5);
    expect(secondPage.body.comments).toHaveLength(2);

    const ids = [...firstPage.body.comments, ...secondPage.body.comments].map(({ id }) => id);
    expect(new Set(ids).size).toBe(7);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
    expect(firstPage.body.comments[0].content).toBe('Comentário 7');
  });

  it('permite leitura a VIEWER e bloqueia criação, edição e exclusão', async () => {
    const project = await createProject(prisma);
    const member = await register('s105-author@example.invalid', 'MEMBER', project.id);
    const viewer = await register('s105-viewer@example.invalid', 'VIEWER', project.id);
    const task = await createTask(prisma, project.id);
    const comment = await createComment(task.id, project.id, member.user.id, 'Visível a todos.');

    const list = await viewer.agent.get(`/api/tasks/${task.id}/comments`);
    expect(list).toMatchObject({
      status: 200,
      body: {
        permissions: { canComment: false, canModerate: false },
        comments: [{ id: comment.id, canEdit: false, canDelete: false }]
      }
    });

    expect(
      (await viewer.mutate('post', `/api/tasks/${task.id}/comments`).send({ content: 'x' })).status
    ).toBe(403);
    expect(
      (
        await viewer
          .mutate('patch', `/api/tasks/${task.id}/comments/${comment.id}`)
          .send({ content: 'x' })
      ).status
    ).toBe(403);
    expect(
      (await viewer.mutate('delete', `/api/tasks/${task.id}/comments/${comment.id}`)).status
    ).toBe(403);
  });

  it('restringe a edição ao autor, marca editedAt e audita', async () => {
    const project = await createProject(prisma);
    const author = await register('s105-editor@example.invalid', 'MEMBER', project.id);
    const otherMember = await register('s105-other@example.invalid', 'MEMBER', project.id);
    const owner = await register('s105-owner-edit@example.invalid', 'OWNER', project.id);
    const task = await createTask(prisma, project.id);
    const comment = await createComment(task.id, project.id, author.user.id, 'Texto original.');
    const path = `/api/tasks/${task.id}/comments/${comment.id}`;

    expect((await otherMember.mutate('patch', path).send({ content: 'invadido' })).status).toBe(
      403
    );
    expect((await owner.mutate('patch', path).send({ content: 'moderado' })).status).toBe(403);
    expect((await prisma.taskComment.findUnique({ where: { id: comment.id } })).content).toBe(
      'Texto original.'
    );

    const edited = await author.mutate('patch', path).send({ content: 'Texto revisado.' });
    expect(edited).toMatchObject({
      status: 200,
      body: { comment: { id: comment.id, content: 'Texto revisado.' } }
    });
    expect(edited.body.comment.editedAt).not.toBeNull();
    expect(
      await prisma.auditEvent.count({
        where: { action: 'TASK_COMMENT_UPDATED', resourceId: String(comment.id) }
      })
    ).toBe(1);
  });

  it('aplica a política de exclusão e preserva o registro com exclusão lógica', async () => {
    const project = await createProject(prisma);
    const author = await register('s105-del-author@example.invalid', 'MEMBER', project.id);
    const otherMember = await register('s105-del-member@example.invalid', 'MEMBER', project.id);
    const manager = await register('s105-del-manager@example.invalid', 'MANAGER', project.id);
    const task = await createTask(prisma, project.id);
    const own = await createComment(task.id, project.id, author.user.id, 'Do autor.');
    const moderated = await createComment(task.id, project.id, author.user.id, 'Para moderação.');

    expect(
      (await otherMember.mutate('delete', `/api/tasks/${task.id}/comments/${own.id}`)).status
    ).toBe(403);

    expect((await author.mutate('delete', `/api/tasks/${task.id}/comments/${own.id}`)).status).toBe(
      200
    );
    expect(
      (await manager.mutate('delete', `/api/tasks/${task.id}/comments/${moderated.id}`)).status
    ).toBe(200);

    const list = await author.agent.get(`/api/tasks/${task.id}/comments`);
    expect(list.body).toMatchObject({ total: 0, comments: [] });

    const preservedOwn = await prisma.taskComment.findUnique({ where: { id: own.id } });
    expect(preservedOwn.deletedAt).not.toBeNull();
    expect(preservedOwn.deletedById).toBe(author.user.id);
    const preservedModerated = await prisma.taskComment.findUnique({
      where: { id: moderated.id }
    });
    expect(preservedModerated.deletedById).toBe(manager.user.id);
    expect(preservedModerated.content).toBe('Para moderação.');

    expect(
      (
        await author
          .mutate('patch', `/api/tasks/${task.id}/comments/${own.id}`)
          .send({ content: 'ressuscitado' })
      ).status
    ).toBe(404);
    expect(
      (await manager.mutate('delete', `/api/tasks/${task.id}/comments/${own.id}`)).status
    ).toBe(404);
    expect(
      await prisma.auditEvent.count({
        where: { action: 'TASK_COMMENT_DELETED', projectId: project.id }
      })
    ).toBe(2);
  });

  it('bloqueia acesso sem membership e comentário fora da tarefa informada', async () => {
    const project = await createProject(prisma);
    const member = await register('s105-scope@example.invalid', 'MEMBER', project.id);
    const outsider = await register('s105-outsider@example.invalid');
    const taskA = await createTask(prisma, project.id);
    const taskB = await createTask(prisma, project.id);
    const comment = await createComment(taskA.id, project.id, member.user.id, 'Da tarefa A.');

    expect((await outsider.agent.get(`/api/tasks/${taskA.id}/comments`)).status).toBe(404);
    expect(
      (
        await outsider
          .mutate('post', `/api/tasks/${taskA.id}/comments`)
          .send({ content: 'intruso' })
      ).status
    ).toBe(404);

    expect(
      (
        await member
          .mutate('patch', `/api/tasks/${taskB.id}/comments/${comment.id}`)
          .send({ content: 'trocado' })
      ).status
    ).toBe(404);
    expect(
      (await member.mutate('delete', `/api/tasks/${taskB.id}/comments/${comment.id}`)).status
    ).toBe(404);
    expect((await member.agent.get(`/api/tasks/${taskA.id + 10000}/comments`)).status).toBe(404);
  });
});
