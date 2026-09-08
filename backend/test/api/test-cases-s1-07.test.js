import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import { readdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  configureTestDatabaseEnvironment,
  deployTestMigrations,
  cleanTestDatabase
} from '../helpers/test-database.js';
import { startTestServer } from '../helpers/http-server.js';
import { createProject } from '../fixtures/factories.js';
let app, prisma;
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4ZkAAAAASUVORK5CYII=',
  'base64'
);
beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ default: app } = await import('../../src/app.js'));
  app = await startTestServer(app);
  await cleanTestDatabase(prisma);
});
afterEach(async () => {
  await cleanTestDatabase(prisma);
});
afterAll(async () => prisma.$disconnect());
async function fixture(role = 'MEMBER') {
  const project = await createProject(prisma);
  const other = await createProject(prisma);
  const agent = request.agent(app);
  const registered = await agent.post('/api/auth/register').send({
    name: 'API Test Executor',
    username: 's107api',
    email: 's107api@example.invalid',
    password: 'SenhaSegura123'
  });
  expect(registered.status).toBe(201);
  await request(app)
    .post('/api/auth/email-verification/verify')
    .send({ token: registered.body.emailVerification.testToken });
  const user = registered.body.user;
  const csrf = registered.body.csrfToken;
  await prisma.projectMembership.create({ data: { projectId: project.id, userId: user.id, role } });
  const pr = await prisma.pullRequest.create({
    data: { projectId: project.id, githubId: '1', number: 1, title: 'Test PR' }
  });
  const input = {
    title: 'API case',
    description: 'Desc',
    preconditions: 'Ready',
    expectedResult: 'Works',
    responsibleUserId: user.id,
    steps: [{ action: 'Click', expectedResult: 'Visible' }]
  };
  const payload = {
    testCaseVersion: 1,
    environment: 'HOMOLOGACAO',
    testedReference: { type: 'PULL_REQUEST', id: pr.id },
    steps: [{ position: 1, result: 'PASS' }]
  };
  const mutate = (method, path) => agent[method](path).set('X-CSRF-Token', csrf);
  const create = async () => {
    const res = await mutate('post', `/api/projects/${project.id}/test-cases`).send(input);
    expect(res.status, res.text).toBe(201);
    return res.body.testCase;
  };
  return { project, other, user, pr, input, payload, agent, csrf, mutate, create };
}
const upload = (f, id, payload = f.payload) =>
  f.mutate('post', `/api/test-cases/${id}/executions`).field('payload', JSON.stringify(payload));
describe('S1-07 authenticated HTTP contract', () => {
  it('CRUD, versions/history/list pagination, stale update and soft delete', async () => {
    const f = await fixture();
    const row = await f.create();
    const base = `/api/test-cases/${row.id}`;
    expect((await f.agent.get(base)).body.testCase.description).toBe('Desc');
    expect(
      (await f.mutate('put', base).send({ expectedVersion: 1, title: 'Version 2' })).body.testCase
        .currentVersion
    ).toBe(2);
    expect(
      (await f.mutate('put', base).send({ expectedVersion: 1, title: 'stale' })).body.code
    ).toBe('TEST_CASE_VERSION_CONFLICT');
    expect(
      (await f.mutate('patch', `${base}/status`).send({ expectedVersion: 2, status: 'INATIVO' }))
        .body.testCase
    ).toMatchObject({ status: 'INATIVO', currentVersion: 2, description: 'Desc' });
    expect((await f.agent.get(`${base}/versions?limit=1`)).body).toMatchObject({
      total: 2,
      limit: 1,
      items: [{ version: 2 }]
    });
    expect((await f.agent.get(`${base}/history?limit=1`)).body.nextCursor).toBeTypeOf('string');
    expect(
      (await f.agent.get(`/api/projects/${f.project.id}/test-cases?status=INATIVO`)).body
    ).toMatchObject({ total: 1, summary: { total: 1, active: 0 } });
    expect((await f.mutate('delete', base).send({})).status).toBe(204);
    expect((await f.agent.get(base)).status).toBe(404);
  });
  it.each(['MEMBER', 'MANAGER', 'OWNER'])(
    '%s executes without ownership restriction and downloads real evidence',
    async (role) => {
      const f = await fixture(role);
      const row = await f.create();
      const res = await upload(f, row.id)
        .attach('stepEvidence.1', png, { filename: '../screen.png', contentType: 'text/html' })
        .attach('evidence', Buffer.from('{"ok":true}'), {
          filename: 'result.json',
          contentType: 'application/octet-stream'
        });
      expect(res.status, res.text).toBe(201);
      const execution = res.body.execution;
      expect(execution).toMatchObject({
        result: 'PASS',
        executedByUserId: f.user.id,
        executedByDisplayNameSnapshot: 'API Test Executor',
        testCaseVersion: 1
      });
      expect(execution.evidence).toHaveLength(2);
      expect(JSON.stringify(execution)).not.toMatch(/storageKey|staging-|private\/tmp/);
      const evidence = execution.evidence.find((e) => e.scope === 'STEP');
      expect(evidence).toMatchObject({
        mimeType: 'image/png',
        sha256: createHash('sha256').update(png).digest('hex'),
        originalName: 'screen.png'
      });
      const download = await f.agent.get(evidence.contentUrl);
      expect(download.status).toBe(200);
      expect(download.headers).toMatchObject({
        'content-type': 'image/png',
        'content-length': String(png.length),
        'x-content-type-options': 'nosniff'
      });
      expect(download.headers['content-disposition']).toContain('attachment;');
      expect(download.body).toEqual(png);
      await f.mutate('delete', `/api/test-cases/${row.id}`).send({});
      expect((await f.agent.get(`/api/test-executions/${execution.id}`)).status).toBe(200);
      expect((await f.agent.get(evidence.contentUrl)).status).toBe(200);
      // Files are owned by this test; cleanup uses only persisted private keys after streaming is complete.
      const { unlink } = await import('node:fs/promises');
      for (const item of await prisma.testEvidence.findMany())
        await unlink(`${await realpath(process.env.TEST_EVIDENCE_STORAGE_DIR)}/${item.storageKey}`);
    }
  );
  it('VIEWER reads every history surface/download but cannot mutate or upload', async () => {
    const f = await fixture();
    const row = await f.create();
    const recorded = await upload(f, row.id).attach('evidence', png, { filename: 'a.png' });
    expect(recorded.status, recorded.text).toBe(201);
    const execution = recorded.body.execution;
    await prisma.projectMembership.updateMany({
      where: { userId: f.user.id },
      data: { role: 'VIEWER' }
    });
    for (const path of [
      `/api/projects/${f.project.id}/test-cases`,
      `/api/test-cases/${row.id}`,
      `/api/test-cases/${row.id}/versions`,
      `/api/test-cases/${row.id}/history`,
      `/api/test-cases/${row.id}/executions`,
      `/api/test-cases/${row.id}/tested-references`,
      `/api/test-executions/${execution.id}`,
      execution.evidence[0].contentUrl
    ])
      expect((await f.agent.get(path)).status).toBe(200);
    for (const [method, path, body] of [
      ['post', `/api/projects/${f.project.id}/test-cases`, f.input],
      ['put', `/api/test-cases/${row.id}`, { expectedVersion: 1, title: 'x' }],
      ['patch', `/api/test-cases/${row.id}/status`, { expectedVersion: 1, status: 'INATIVO' }],
      ['delete', `/api/test-cases/${row.id}`, {}]
    ])
      expect((await f.mutate(method, path).send(body)).status).toBe(403);
    expect((await upload(f, row.id)).status).toBe(403);
    const { unlink } = await import('node:fs/promises');
    for (const item of await prisma.testEvidence.findMany())
      await unlink(`${await realpath(process.env.TEST_EVIDENCE_STORAGE_DIR)}/${item.storageKey}`);
  });
  it('anonymous 401, CSRF enforcement, inactive membership and opaque foreign resources', async () => {
    const f = await fixture();
    const row = await f.create();
    const execution = (await upload(f, row.id)).body.execution;
    expect((await request(app).get(`/api/test-cases/${row.id}`)).status).toBe(401);
    expect(
      (await f.agent.post(`/api/projects/${f.project.id}/test-cases`).send(f.input)).status
    ).toBe(403);
    expect(
      (
        await f.agent
          .post(`/api/test-cases/${row.id}/executions`)
          .field('payload', JSON.stringify(f.payload))
      ).status
    ).toBe(403);
    expect((await f.agent.get(`/api/projects/${f.other.id}/test-cases`)).status).toBe(404);
    await prisma.projectMembership.updateMany({
      where: { userId: f.user.id },
      data: { isActive: false }
    });
    for (const path of [
      `/api/test-cases/${row.id}`,
      `/api/test-executions/${execution.id}`,
      `/api/test-evidence/999999/content`
    ]) {
      const response = await f.agent.get(path);
      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Recurso não encontrado.');
    }
  });
  it('requires canonical multipart and strict authority/step/reference validation', async () => {
    const f = await fixture();
    const row = await f.create();
    expect(
      (await f.mutate('post', `/api/test-cases/${row.id}/executions`).send(f.payload)).status
    ).toBe(415);
    for (const payload of [
      { ...f.payload, result: 'PASS' },
      { ...f.payload, executedByUserId: f.user.id },
      { ...f.payload, executedAt: '2020-01-01' },
      { ...f.payload, testedReference: null },
      { ...f.payload, testedReference: { type: 'ISSUE', id: 1 } },
      { ...f.payload, steps: [{ position: 1, result: 'FAIL' }] },
      { ...f.payload, steps: [{ position: 2, result: 'PASS' }] }
    ])
      expect((await upload(f, row.id, payload)).status).toBe(400);
    expect((await upload(f, row.id, { ...f.payload, testCaseVersion: 2 })).status).toBe(409);
    expect(await prisma.testExecution.count()).toBe(0);
  });
  it('rejects unknown/duplicate fields, bad signatures and destinations; cleans all attempt files', async () => {
    const f = await fixture();
    const row = await f.create();
    const before = await readdir(process.env.TEST_EVIDENCE_STORAGE_DIR);
    for (const builder of [
      () => upload(f, row.id).field('payload', '{}'),
      () => upload(f, row.id).field('extra', 'x'),
      () => upload(f, row.id).attach('other', png, { filename: 'x.png' }),
      () => upload(f, row.id).attach('evidence', png, { filename: 'x.svg' }),
      () => upload(f, row.id).attach('evidence', Buffer.from('fake'), { filename: 'x.png' }),
      () => upload(f, row.id).attach('evidence', Buffer.from('{bad}'), { filename: 'x.json' }),
      () => upload(f, row.id).attach('stepEvidence.2', png, { filename: 'x.png' }),
      () => upload(f, row.id).attach('stepEvidence.1', Buffer.from('ok'), { filename: 'x.txt' })
    ]) {
      const res = await builder();
      expect([400, 413], res.text).toContain(res.status);
      expect(await readdir(process.env.TEST_EVIDENCE_STORAGE_DIR)).toEqual(before);
    }
    expect(await prisma.testExecution.count()).toBe(0);
    expect(await prisma.testEvidence.count()).toBe(0);
  });
  it('enforces per-step and general quotas before accepting an execution', async () => {
    const f = await fixture();
    const row = await f.create();
    for (const [field, count] of [
      ['evidence', 6],
      ['stepEvidence.1', 4]
    ]) {
      let req = upload(f, row.id);
      for (let i = 0; i < count; i++) req = req.attach(field, png, { filename: `${i}.png` });
      expect([400, 413]).toContain((await req).status);
    }
    expect(await prisma.testExecution.count()).toBe(0);
  });
  it('accepts exactly 20 files and rejects the 21st without partial data', async () => {
    const f = await fixture();
    f.input.steps = Array.from({ length: 6 }, (_, i) => ({
      action: `Step ${i + 1}`,
      expectedResult: 'OK'
    }));
    const row = await f.create();
    const payload = {
      ...f.payload,
      steps: f.input.steps.map((_, i) => ({ position: i + 1, result: 'PASS' }))
    };
    const requestWith = (count) => {
      let req = upload(f, row.id, payload);
      for (let i = 0; i < count; i++) {
        const field = i < 5 ? 'evidence' : `stepEvidence.${Math.floor((i - 5) / 3) + 1}`;
        req = req.attach(field, png, { filename: `${i}.png` });
      }
      return req;
    };
    const res = await requestWith(20);
    expect(res.status, res.text).toBe(201);
    expect(res.body.execution.evidence).toHaveLength(20);
    expect((await requestWith(21)).status).toBe(413);
    expect(await prisma.testExecution.count()).toBe(1);
    expect(await prisma.testEvidence.count()).toBe(20);
    const { unlink } = await import('node:fs/promises');
    for (const item of await prisma.testEvidence.findMany())
      await unlink(`${await realpath(process.env.TEST_EVIDENCE_STORAGE_DIR)}/${item.storageKey}`);
  });
  it('validates filters and cursors without accepting unknown query fields', async () => {
    const f = await fixture();
    const row = await f.create();
    for (const query of [
      'limit=101',
      'page=0',
      'status=INVALID',
      'latestResult=INVALID',
      'responsibleUserId=x',
      'unknown=1'
    ])
      expect((await f.agent.get(`/api/projects/${f.project.id}/test-cases?${query}`)).status).toBe(
        400
      );
    expect((await f.agent.get(`/api/test-cases/${row.id}/history?cursor=bad`)).status).toBe(400);
    expect((await f.agent.get(`/api/test-cases/${row.id}/tested-references?limit=51`)).status).toBe(
      400
    );
  });
});
