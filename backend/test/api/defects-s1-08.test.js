import { beforeAll, afterEach, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import {
  configureTestDatabaseEnvironment,
  deployTestMigrations,
  cleanTestDatabase
} from '../helpers/test-database.js';
import { startTestServer } from '../helpers/http-server.js';
import { createProject, createRequirement } from '../fixtures/factories.js';
let prisma, app;
beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
  app = await startTestServer(app);
  await cleanTestDatabase(prisma);
});
afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => prisma.$disconnect());
async function fixture() {
  const project = await createProject(prisma),
    other = await createProject(prisma),
    agent = request.agent(app);
  const registration = await agent.post('/api/auth/register').send({
    name: 'Defect API',
    username: 's108api',
    email: 's108api@example.invalid',
    password: 'SenhaSegura123'
  });
  expect(registration.status).toBe(201);
  await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: registration.body.emailVerification.testToken });
  const user = registration.body.user,
    csrf = registration.body.csrfToken;
  await prisma.projectMembership.create({
    data: { projectId: project.id, userId: user.id, role: 'MEMBER' }
  });
  const requirement = await createRequirement(prisma, project.id),
    pr = await prisma.pullRequest.create({
      data: { projectId: project.id, githubId: '108', number: 108, title: 'API PR' }
    });
  const mutate = (method, path) => agent[method](path).set('X-CSRF-Token', csrf);
  const tcResponse = await mutate('post', `/api/projects/${project.id}/test-cases`).send({
    title: 'Case',
    description: 'Description',
    preconditions: 'Ready',
    expectedResult: 'Works',
    responsibleUserId: user.id,
    requirementId: requirement.id,
    steps: [{ action: 'Open', expectedResult: 'Visible' }]
  });
  expect(tcResponse.status, tcResponse.text).toBe(201);
  const tc = tcResponse.body.testCase;
  const payload = {
    testCaseVersion: 1,
    environment: 'LOCAL',
    testedReference: { type: 'PULL_REQUEST', id: pr.id },
    steps: [{ position: 1, result: 'FAIL', observedResult: 'Not visible' }]
  };
  const upload = (body = payload) =>
    mutate('post', `/api/test-cases/${tc.id}/executions`).field('payload', JSON.stringify(body));
  const execution = await upload();
  expect(execution.status, execution.text).toBe(201);
  const input = {
    title: 'Missing item',
    description: 'Not visible',
    severity: 'MEDIA',
    responsibleUserId: user.id,
    requirementId: requirement.id,
    detectedExecutionStepId: execution.body.execution.steps[0].id
  };
  const root = `/api/projects/${project.id}/defects`;
  const create = async () => {
    const res = await mutate('post', root).send(input);
    expect(res.status, res.text).toBe(201);
    return res.body.defect;
  };
  return { project, other, agent, mutate, user, root, input, create, upload, payload, tc };
}
describe('S1-08 authenticated API', () => {
  it.each(['MEMBER', 'MANAGER', 'OWNER'])(
    '%s manages defects, history, candidates and soft deletion',
    async (role) => {
      const f = await fixture();
      await prisma.projectMembership.updateMany({ where: { userId: f.user.id }, data: { role } });
      let d = await f.create();
      const base = `/api/defects/${d.id}`;
      const updated = await f
        .mutate('put', base)
        .send({ expectedRevision: d.revision, severity: 'CRITICA', title: 'Updated' });
      expect(updated.status, updated.text).toBe(200);
      d = updated.body.defect;
      expect((await f.agent.get(`${base}/history?limit=1`)).body.total).toBe(3);
      expect((await f.agent.get(`${base}/retests`)).body.total).toBe(0);
      expect((await f.agent.get(`${f.root}?severity=CRITICA`)).body.summary.total).toBe(1);
      expect((await f.agent.get(`${f.root}/detection-candidates`)).body.total).toBe(1);
      expect(
        (await f.mutate('put', base).send({ expectedRevision: d.revision, status: 'VALIDADO' }))
          .status
      ).toBe(400);
      expect((await f.mutate('delete', base).send({})).status).toBe(204);
      expect((await f.agent.get(base)).status).toBe(404);
    }
  );
  it('VIEWER reads every surface and cannot mutate', async () => {
    const f = await fixture(),
      d = await f.create(),
      base = `/api/defects/${d.id}`;
    await prisma.projectMembership.updateMany({
      where: { userId: f.user.id },
      data: { role: 'VIEWER' }
    });
    for (const path of [
      f.root,
      `${f.root}/detection-candidates`,
      base,
      `${base}/history`,
      `${base}/retests`
    ])
      expect((await f.agent.get(path)).status, path).toBe(200);
    for (const [method, path, body] of [
      ['post', f.root, f.input],
      ['put', base, { expectedRevision: d.revision, title: 'Denied' }],
      ['delete', base, {}],
      [
        'post',
        `${base}/correction-tasks`,
        { expectedRevision: d.revision, correctionCycle: 1, task: { title: 'Denied' } }
      ]
    ])
      expect((await f.mutate(method, path).send(body)).status).toBe(403);
  });
  it('hides foreign and inactive membership and rejects missing CSRF', async () => {
    const f = await fixture(),
      d = await f.create(),
      base = `/api/defects/${d.id}`;
    expect((await f.agent.post(f.root).send(f.input)).status).toBe(403);
    expect((await f.agent.get(`/api/projects/${f.other.id}/defects`)).status).toBe(404);
    expect(
      (await f.mutate('post', `/api/projects/${f.other.id}/defects`).send(f.input)).status
    ).toBe(404);
    await prisma.projectMembership.updateMany({
      where: { userId: f.user.id },
      data: { isActive: false }
    });
    for (const path of [
      base,
      `${base}/history`,
      `${base}/retests`,
      f.root,
      `${f.root}/detection-candidates`
    ])
      expect((await f.agent.get(path)).status).toBe(404);
    expect((await request(app).get(base)).status).toBe(401);
  });
  it('records contextual retest with real evidence in the existing execution endpoint', async () => {
    const f = await fixture();
    let d = await f.create();
    const linked = await f
      .mutate('post', `/api/defects/${d.id}/correction-tasks`)
      .send({ expectedRevision: d.revision, correctionCycle: 1, task: { title: 'Fix' } });
    expect(linked.status, linked.text).toBe(201);
    d = linked.body.defect;
    const taskId = d.correctionCycles[0].tasks[0].id;
    const { taskKanbanService } =
      await import('../../src/modules/tasks/services/task-kanban.service.js');
    await taskKanbanService.moveTask(taskId, { toStatus: 'CONCLUIDO' }, { actor: f.user });
    d = (await f.agent.get(`/api/defects/${d.id}`)).body.defect;
    const payload = {
      ...f.payload,
      steps: [{ position: 1, result: 'PASS' }],
      retest: { defectId: d.id, correctionCycle: 1, expectedRevision: d.revision }
    };
    const retest = await f
      .upload(payload)
      .attach(
        'stepEvidence.1',
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4ZkAAAAASUVORK5CYII=',
          'base64'
        ),
        { filename: 'proof.png' }
      );
    expect(retest.status, retest.text).toBe(201);
    expect(retest.body.execution.evidence).toHaveLength(1);
    const evidence = retest.body.execution.evidence[0];
    expect((await f.agent.get(evidence.contentUrl)).status).toBe(200);
    expect((await f.agent.get(`/api/defects/${d.id}`)).body.defect.status).toBe('VALIDADO');
    expect((await f.upload(payload)).status).toBe(409);
  });
});
