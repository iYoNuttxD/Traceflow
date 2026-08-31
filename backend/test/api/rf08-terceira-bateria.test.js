import request from 'supertest';
import { createHash } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import {
  createProject,
  createSprint,
  createTask,
  setAuthenticatedFixtureUser
} from '../fixtures/factories.js';

let app;
let prisma;
let api;
const sessionToken = 'rf08-terceira-bateria-session-token';
const csrfToken = 'rf08-terceira-bateria-csrf-token';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

beforeAll(async () => {
  const testDatabaseUrl = configureTestDatabaseEnvironment();
  deployTestMigrations(testDatabaseUrl);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
  await cleanTestDatabase(prisma);
});

afterEach(async () => {
  await cleanTestDatabase(prisma);
  setAuthenticatedFixtureUser(undefined);
});

beforeEach(async () => {
  const user = await prisma.user.create({
    data: {
      name: 'Usuário RF08 artificial',
      email: 'rf08@example.invalid',
      passwordHash: 'fixture-only'
    }
  });
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: sha256(sessionToken),
      csrfTokenHash: sha256(csrfToken),
      sessionVersion: user.sessionVersion,
      expiresAt: new Date(Date.now() + 60000)
    }
  });
  setAuthenticatedFixtureUser(user.id);
  const secured = (method) => (path) =>
    request(app)
      [method](path)
      .set('Cookie', `traceflow_session=${sessionToken}`)
      .set('x-csrf-token', csrfToken);
  api = {
    get: (path) => request(app).get(path).set('Cookie', `traceflow_session=${sessionToken}`),
    patch: secured('patch')
  };
});

describe('RF08 terceira bateria — contrato do move consumido pelo painel de detalhes', () => {
  it('o corpo de sucesso devolve a tarefa completa que o dialogo espalha', async () => {
    const project = await createProject(prisma);
    const sprint = await createSprint(prisma, project.id, { status: 'EM_ANDAMENTO' });
    const task = await createTask(prisma, project.id, { sprintId: sprint.id });

    const response = await api
      .patch(`/api/tasks/${task.id}/move`)
      .send({ toStatus: 'EM_ANDAMENTO' });

    expect(response.status).toBe(200);
    expect(response.body.task).toMatchObject({
      id: task.id,
      projectId: project.id,
      title: task.title,
      status: 'EM_ANDAMENTO',
      priority: 'MEDIA',
      sprintId: sprint.id
    });
    expect(response.body.task).toHaveProperty('deadline');
    expect(response.body.task).toHaveProperty('responsible');
    expect(response.body.task).toHaveProperty('pullRequest');
    expect(Array.isArray(response.body.task.commits)).toBe(true);
    expect(Array.isArray(response.body.task.issues)).toBe(true);
  });

});
