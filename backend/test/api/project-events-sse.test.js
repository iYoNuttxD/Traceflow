import http from 'node:http';
import { once } from 'node:events';
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
let server;
let port;
const password = 'SenhaSegura123';

beforeAll(async () => {
  const url = configureTestDatabaseEnvironment();
  deployTestMigrations(url);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
  await cleanTestDatabase(prisma);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  port = server.address().port;
});

afterEach(async () => {
  const { projectEventPublisher } = await import('../../src/shared/events/index.js');
  projectEventPublisher.closeAll('test_cleanup');
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  const { projectEventPublisher } = await import('../../src/shared/events/index.js');
  projectEventPublisher.closeAll('test_shutdown');
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
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
  let membership;
  if (projectId) {
    membership = await prisma.projectMembership.create({
      data: { projectId, userId: response.body.user.id, role }
    });
  }
  return {
    agent,
    membership,
    user: response.body.user,
    cookie: response.headers['set-cookie'].map((value) => value.split(';')[0]).join('; '),
    mutate: (method, path) => agent[method](path).set('X-CSRF-Token', response.body.csrfToken)
  };
}

function openStream(path, cookie) {
  const messages = [];
  const waiters = [];
  let buffer = '';
  let resolveClosed;
  const closed = new Promise((resolve) => {
    resolveClosed = resolve;
  });

  const responsePromise = new Promise((resolve, reject) => {
    const clientRequest = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'GET',
        headers: { Accept: 'text/event-stream', Cookie: cookie }
      },
      (response) => {
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          buffer += chunk;
          let boundary = buffer.indexOf('\n\n');
          while (boundary >= 0) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const dataLine = block.split('\n').find((line) => line.startsWith('data: '));
            if (dataLine) {
              const message = JSON.parse(dataLine.slice(6));
              const waiter = waiters.shift();
              if (waiter) waiter(message);
              else messages.push(message);
            }
            boundary = buffer.indexOf('\n\n');
          }
        });
        response.once('close', resolveClosed);
        resolve({
          response,
          messages,
          closed,
          nextMessage() {
            if (messages.length) return Promise.resolve(messages.shift());
            return new Promise((resolveMessage) => waiters.push(resolveMessage));
          },
          close() {
            clientRequest.destroy();
            response.destroy();
          }
        });
      }
    );
    clientRequest.once('error', reject);
    clientRequest.end();
  });

  return responsePromise;
}

describe('project-scoped SSE para comentários', () => {
  it('propaga create/edit/delete, é idempotente no payload e isola outro projeto', async () => {
    const projectA = await createProject(prisma);
    const projectB = await createProject(prisma);
    const author = await register('sse-author@example.invalid', 'MEMBER', projectA.id);
    const subscriber = await register('sse-subscriber@example.invalid', 'MEMBER', projectA.id);
    await prisma.projectMembership.create({
      data: { projectId: projectB.id, userId: subscriber.user.id, role: 'VIEWER' }
    });
    const task = await createTask(prisma, projectA.id);
    const streamA = await openStream(`/api/projects/${projectA.id}/events`, subscriber.cookie);
    const streamB = await openStream(`/api/projects/${projectB.id}/events`, subscriber.cookie);
    expect(streamA.response.statusCode).toBe(200);
    expect(streamA.response.headers).toMatchObject({
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no'
    });

    const created = await author
      .mutate('post', `/api/tasks/${task.id}/comments`)
      .send({ content: 'Comentário colaborativo.' });
    expect(created.status).toBe(201);
    const createdEvent = await streamA.nextMessage();
    expect(createdEvent).toMatchObject({
      type: 'task.comment.created',
      projectId: projectA.id,
      taskId: task.id,
      data: {
        comment: {
          id: created.body.comment.id,
          content: 'Comentário colaborativo.',
          canEdit: false,
          canDelete: false
        }
      }
    });
    expect(JSON.stringify(createdEvent)).not.toContain('email');
    expect(JSON.stringify(createdEvent)).not.toContain('session');
    expect(streamB.messages).toHaveLength(0);

    const edited = await author
      .mutate('patch', `/api/tasks/${task.id}/comments/${created.body.comment.id}`)
      .send({ content: 'Comentário revisado.' });
    expect(edited.status).toBe(200);
    expect(await streamA.nextMessage()).toMatchObject({
      type: 'task.comment.updated',
      data: { comment: { content: 'Comentário revisado.', editedAt: expect.any(String) } }
    });

    const deleted = await author.mutate(
      'delete',
      `/api/tasks/${task.id}/comments/${created.body.comment.id}`
    );
    expect(deleted.status).toBe(200);
    expect(await streamA.nextMessage()).toMatchObject({
      type: 'task.comment.deleted',
      data: {
        comment: {
          content: null,
          deletionActorType: 'AUTHOR',
          canEdit: false,
          canDelete: false
        }
      }
    });

    const eventCount = streamA.messages.length;
    expect(
      (
        await subscriber
          .mutate('patch', `/api/tasks/${task.id}/comments/${created.body.comment.id}`)
          .send({ content: 'Falha.' })
      ).status
    ).toBe(404);
    expect(streamA.messages).toHaveLength(eventCount);

    streamA.close();
    streamB.close();
    await Promise.all([streamA.closed, streamB.closed]);
    const { projectEventPublisher } = await import('../../src/shared/events/index.js');
    await expect.poll(() => projectEventPublisher.subscriberCount()).toBe(0);
  });

  it('nega anônimo/não membro, permite VIEWER e fecha ao revogar membership', async () => {
    const project = await createProject(prisma);
    const owner = await register('sse-owner@example.invalid', 'OWNER', project.id);
    const viewer = await register('sse-viewer@example.invalid', 'VIEWER', project.id);
    const outsider = await register('sse-outsider@example.invalid');

    expect((await request(app).get(`/api/projects/${project.id}/events`)).status).toBe(401);
    expect((await outsider.agent.get(`/api/projects/${project.id}/events`)).status).toBe(404);
    expect((await viewer.agent.get(`/api/projects/${project.id}/events?token=x`)).status).toBe(400);

    const stream = await openStream(`/api/projects/${project.id}/events`, viewer.cookie);
    expect(stream.response.statusCode).toBe(200);
    expect(
      (await owner.mutate('delete', `/api/projects/${project.id}/members/${viewer.membership.id}`))
        .status
    ).toBe(204);
    await stream.closed;
    expect((await viewer.agent.get(`/api/projects/${project.id}/events`)).status).toBe(404);
  });
});
