import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import { readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  configureTestDatabaseEnvironment,
  deployTestMigrations,
  cleanTestDatabase
} from '../helpers/test-database.js';
import { startTestServer } from '../helpers/http-server.js';
import { assertTestEvidenceRoot } from '../helpers/test-evidence-environment.js';
import { createProject, createRequirement } from '../fixtures/factories.js';
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
    username: 'u' + randomUUID().replaceAll('-', '').slice(0, 16),
    email: randomUUID() + '@example.invalid',
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
  const requirement = await createRequirement(prisma, project.id);
  const input = {
    requirementId: requirement.id,
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
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { rm, readFile } from 'node:fs/promises';
const checksum = (bytes) => createHash('sha256').update(bytes).digest('hex');
const descriptor = (bytes, name = 'result.json', field = 'evidence') => ({
  name,
  field,
  sizeBytes: bytes.length,
  sha256: checksum(bytes)
});
const small = Buffer.from('{"ok":true}');
async function begin(f, files = [descriptor(small)], idempotencyKey = randomUUID()) {
  const row = await f.create();
  const path = `/api/test-cases/${row.id}/execution-uploads`;
  const response = await f.mutate('post', path).send({ idempotencyKey, testCaseVersion: 1, files });
  return {
    ...f,
    row,
    path,
    input: { idempotencyKey, testCaseVersion: 1, files },
    response,
    session: response.body
  };
}
function part(f, file = 0, index = 0, bytes = small, options = {}) {
  return f
    .mutate(
      'put',
      `${f.path}/${f.session.uploadId}/files/${f.session.files[file].id}/parts/${index}`
    )
    .set('Content-Type', 'application/octet-stream')
    .set('X-Chunk-SHA256', options.sha256 || checksum(bytes))
    .set('X-Chunk-Offset', String(options.offset ?? index * 8388608))
    .send(bytes);
}
const finish = (f, payload = f.payload) =>
  f.mutate('post', `${f.path}/${f.session.uploadId}/complete`).send(payload);
const status = (f) => f.agent.get(`${f.path}/${f.session.uploadId}`);
const cancel = (f) => f.mutate('delete', `${f.path}/${f.session.uploadId}`);
afterEach(async () => {
  vi.restoreAllMocks();
  const root = assertTestEvidenceRoot();
  for (const name of await readdir(root))
    await rm(`${root}/${name}`, { recursive: true, force: true });
});
describe('OCI-04.1 authenticated resumable evidence HTTP', () => {
  it('U01 U08 U14: small upload, init/part/confirmation replay, canonical download and one audit', async () => {
    const f = await begin(await fixture());
    expect(f.response.status, f.response.text).toBe(201);
    expect(JSON.stringify(f.session)).not.toMatch(/storageKey|staging|part-/);
    expect((await f.mutate('post', f.path).send(f.input)).body.uploadId).toBe(f.session.uploadId);
    expect((await part(f)).body.confirmedBytes).toBe(small.length);
    expect((await part(f)).status).toBe(200);
    const first = await finish(f);
    expect(first.status, first.text).toBe(200);
    const repeated = await finish(f);
    expect(repeated.body.execution).toEqual(first.body.execution);
    expect(await prisma.testExecution.count()).toBe(1);
    expect(await prisma.testEvidence.count()).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: 'TEST_EXECUTION_RECORDED' } })).toBe(1);
    const evidence = await prisma.testEvidence.findFirst();
    const content = await f.agent.get(`/api/test-evidence/${evidence.id}/content`);
    expect(content.text).toBe(small.toString());
    expect((await status(f)).body.sessionStatus).toBe('COMPLETED');
    expect((await cancel(f)).status).toBe(409);
    expect((await finish(f, { ...f.payload, environment: 'LOCAL' })).body.code).toBe(
      'UPLOAD_PAYLOAD_CONFLICT'
    );
    expect((await f.agent.get(f.path)).body.uploads).toHaveLength(1);
  });
  it('U02 U11: accepts parts out of order and resumes from DB after service recreation', async () => {
    const data = Buffer.alloc(8388608 + 17, 'a');
    const f = await begin(await fixture(), [descriptor(data, 'log.txt')]);
    expect((await part(f, 0, 1, data.subarray(8388608))).status).toBe(200);
    const { createEvidenceUploadService } =
      await import('../../src/modules/testCases/services/evidence-upload.service.js');
    const restored = await createEvidenceUploadService().status(f.row.id, f.session.uploadId, {
      actorUserId: f.user.id
    });
    expect(restored.confirmedBytes).toBe(17);
    expect(restored.files[0].receivedParts[0].index).toBe(1);
    expect((await part(f, 0, 0, data.subarray(0, 8388608))).status).toBe(200);
    expect((await finish(f)).status).toBe(200);
    expect((await prisma.testEvidence.findFirst()).sha256).toBe(checksum(data));
  });
  it('U09 U10 U12 U13: rejects divergent, missing, corrupt and wrong-length parts without publishing', async () => {
    const f = await begin(await fixture());
    expect((await finish(f)).body.code).toBe('UPLOAD_PARTS_MISSING');
    expect((await part(f, 0, 0, small, { sha256: '0'.repeat(64) })).status).toBe(422);
    expect((await part(f, 0, 0, small.subarray(1))).status).toBe(400);
    expect((await part(f, 0, 0, Buffer.concat([small, small]))).status).toBe(413);
    expect((await part(f, 0, 0, small, { offset: 1 })).status).toBe(400);
    expect((await part(f, 0, 5)).status).toBe(400);
    expect((await part(f)).status).toBe(200);
    expect((await part(f, 0, 0, Buffer.from('{"no":true}'))).body.code).toBe(
      'UPLOAD_PART_CONFLICT'
    );
    expect(await prisma.testEvidence.count()).toBe(0);
    expect((await status(f)).body.confirmedBytes).toBe(small.length);
  });
  it('rejects a final checksum mismatch and disguised content using canonical validation', async () => {
    const f = await begin(await fixture(), [{ ...descriptor(small), sha256: '1'.repeat(64) }]);
    await part(f);
    expect((await finish(f)).body.code).toBe('UPLOAD_FILE_CHECKSUM_MISMATCH');
    await cancel(f);
    const bad = Buffer.from('<script>alert(1)</script>');
    const second = await begin(await fixture(), [descriptor(bad, 'screen.png', 'stepEvidence.1')]);
    await part(second, 0, 0, bad);
    expect((await finish(second)).status).toBe(400);
    expect(await prisma.testEvidence.count()).toBe(0);
  });
  it.each([
    ['individual', [{ ...descriptor(small), sizeBytes: 10485761 }]],
    ['video', [{ ...descriptor(small, 'movie.mp4'), sizeBytes: 52428801 }]],
    ['general-count', Array.from({ length: 6 }, () => descriptor(small))],
    ['step-count', Array.from({ length: 4 }, () => descriptor(png, 'shot.png', 'stepEvidence.1'))],
    [
      'aggregate',
      Array.from({ length: 3 }, () => ({ ...descriptor(small, 'movie.mp4'), sizeBytes: 52428800 }))
    ]
  ])('U04 U05 U06: %s cannot bypass existing functional limits', async (_label, files) => {
    const f = await begin(await fixture(), files);
    expect(f.response.status).toBe(413);
    expect(await prisma.evidenceUpload.count()).toBe(0);
  });
  it('rejects unknown step, foreign scope and divergent init replay', async () => {
    const f = await begin(await fixture());
    expect(
      (
        await f
          .mutate('post', f.path)
          .send({ ...f.input, files: [descriptor(small, 'other.json')] })
      ).status
    ).toBe(409);
    for (const files of [
      [descriptor(png, 'shot.png', 'stepEvidence.2')],
      [descriptor(small, 'result.json', 'stepEvidence.1')],
      [descriptor(small, '../secret.key')]
    ]) {
      expect(
        (await f.mutate('post', f.path).send({ ...f.input, idempotencyKey: randomUUID(), files }))
          .status
      ).toBe(400);
    }
  });
  it('U15 U16: expiry/cancellation are terminal; cleanup is idempotent and protects committed files', async () => {
    const f = await begin(await fixture());
    await part(f);
    await prisma.evidenceUpload.update({
      where: { id: f.session.uploadId },
      data: { expiresAt: new Date(0) }
    });
    expect((await part(f)).status).toBe(410);
    const { evidenceUploadService } =
      await import('../../src/modules/testCases/services/evidence-upload.service.js');
    expect(await evidenceUploadService.cleanup({ dryRun: true })).toMatchObject({
      eligible: 1,
      cleaned: 0
    });
    expect(await evidenceUploadService.cleanup({ dryRun: false })).toMatchObject({
      cleaned: 1,
      failed: 0
    });
    expect(await evidenceUploadService.cleanup({ dryRun: false })).toMatchObject({ failed: 0 });
    const fresh = await begin(await fixture());
    await part(fresh);
    expect((await cancel(fresh)).status).toBe(200);
    expect((await cancel(fresh)).status).toBe(200);
    expect((await part(fresh)).status).toBe(410);
    expect(await prisma.testEvidence.count()).toBe(0);
  });
  it.each(['post', 'put', 'delete'])(
    'A07 A08: %s mutation requires valid CSRF before touching upload storage',
    async (method) => {
      const f = await begin(await fixture());
      const path =
        method === 'post'
          ? `${f.path}/${f.session.uploadId}/complete`
          : method === 'put'
            ? `${f.path}/${f.session.uploadId}/files/${f.session.files[0].id}/parts/0`
            : `${f.path}/${f.session.uploadId}`;
      for (const token of ['', 'invalid']) {
        let req = f.agent[method](path);
        if (token) req = req.set('X-CSRF-Token', token);
        expect((await req.send({})).status).toBe(403);
      }
      expect((await status(f)).body.confirmedBytes).toBe(0);
    }
  );
  it.each([
    'viewer',
    'revoked',
    'disabled',
    'deleted',
    'other-project',
    'other-user',
    'unauthenticated'
  ])('A01-A06 A09: %s cannot read/write another active upload', async (scenario) => {
    const f = await begin(await fixture());
    let expected = 403;
    if (scenario === 'viewer')
      await prisma.projectMembership.updateMany({
        where: { userId: f.user.id },
        data: { role: 'VIEWER' }
      });
    if (scenario === 'revoked') {
      await prisma.projectMembership.updateMany({
        where: { userId: f.user.id },
        data: { isActive: false }
      });
      expected = 404;
    }
    if (scenario === 'disabled')
      await prisma.user.update({
        where: { id: f.user.id },
        data: { isActive: false, accountStatus: 'DEACTIVATED' }
      });
    if (scenario === 'deleted') {
      await prisma.project.update({ where: { id: f.project.id }, data: { deletedAt: new Date() } });
      expected = 404;
    }
    if (scenario === 'other-project') {
      const other = await prisma.testCase.create({
        data: {
          projectId: f.other.id,
          responsibleUserId: f.user.id,
          title: 'Foreign',
          status: 'ATIVO',
          preconditions: '',
          expectedResult: ''
        }
      });
      f.path = `/api/test-cases/${other.id}/execution-uploads`;
      expected = 404;
    }
    if (scenario === 'other-user') {
      await prisma.evidenceUpload.update({
        where: { id: f.session.uploadId },
        data: { userId: f.user.id + 10000 }
      });
      expected = 404;
    }
    if (scenario === 'unauthenticated') {
      f.mutate = (method, path) => request(app)[method](path);
      expected = 401;
    }
    expect((await part(f)).status).toBe(expected);
    expect((await finish(f)).status).toBe(expected);
    expect((await cancel(f)).status).toBe(expected);
    expect(await prisma.testEvidence.count()).toBe(0);
  });
  it('A10: invalid reference/step payload cannot associate received files; valid retry remains possible', async () => {
    const f = await begin(await fixture(), [
      descriptor(png, 'screen.png', 'stepEvidence.1'),
      descriptor(small)
    ]);
    await part(f, 0, 0, png);
    await part(f, 1);
    const foreign = await prisma.pullRequest.create({
      data: { projectId: f.other.id, githubId: 'foreign', number: 1, title: 'Other' }
    });
    expect(
      (await finish(f, { ...f.payload, testedReference: { type: 'PULL_REQUEST', id: foreign.id } }))
        .status
    ).toBe(404);
    expect(await prisma.testEvidence.count()).toBe(0);
    // A payload is sticky after a finalize attempt; changing association requires a new operation.
    expect((await finish(f)).body.code).toBe('UPLOAD_PAYLOAD_CONFLICT');
  });
  it('U17 U18 U20: files survive a partial promotion/DB failure and retry commits one execution', async () => {
    const f = await begin(await fixture());
    await part(f);
    const { resumableEvidenceStorage: storage } =
      await import('../../src/modules/testCases/storage/resumable-evidence.storage.js');
    const promote = storage.promote.bind(storage);
    vi.spyOn(storage, 'promote').mockImplementationOnce(async (...args) => {
      await promote(...args);
      throw Error('injected-fs-failure');
    });
    expect((await finish(f)).status).toBe(500);
    expect(await prisma.testEvidence.count()).toBe(0);
    const { testCaseRepository: repo } =
      await import('../../src/modules/testCases/repositories/test-case.repository.js');
    const transaction = repo.transaction.bind(repo);
    vi.spyOn(repo, 'transaction').mockImplementationOnce((work, trace) =>
      transaction((tx) => {
        tx.audit = async () => {
          throw Error('injected-db-failure');
        };
        return work(tx);
      }, trace)
    );
    expect((await finish(f)).status).toBe(500);
    expect(await prisma.testExecution.count()).toBe(0);
    expect((await finish(f)).status).toBe(200);
    expect(await prisma.testEvidence.count()).toBe(1);
    expect(await prisma.testExecution.count()).toBe(1);
  });
  it('E2E07: lost response after COMMIT returns the same receipt, including after cleanup', async () => {
    const f = await begin(await fixture());
    await part(f);
    const { testExecutionService: executions } =
      await import('../../src/modules/testCases/services/test-execution.service.js');
    const record = executions.record.bind(executions);
    vi.spyOn(executions, 'record').mockImplementationOnce(async (...args) => {
      await record(...args);
      throw Error('lost-response');
    });
    expect((await finish(f)).status).toBe(500);
    const confirmed = await prisma.testExecution.findFirst();
    expect((await finish(f)).body.execution.id).toBe(confirmed.id);
    const { evidenceUploadService: uploads } =
      await import('../../src/modules/testCases/services/evidence-upload.service.js');
    expect(await uploads.cleanup({ dryRun: false })).toMatchObject({ cleaned: 1, failed: 0 });
    expect((await finish(f)).body.execution.id).toBe(confirmed.id);
    expect(await prisma.testExecution.count()).toBe(1);
    const stored = await prisma.testEvidence.findFirst();
    expect(await readFile(`${assertTestEvidenceRoot()}/${stored.storageKey}`)).toEqual(small);
  });
  it('serializes same/different part claims and fences cancel during streaming', async () => {
    const f = await begin(await fixture(), [descriptor(small), descriptor(small, 'other.json')]);
    const { resumableEvidenceStorage: storage } =
      await import('../../src/modules/testCases/storage/resumable-evidence.storage.js');
    const receive = storage.receive.bind(storage),
      entered = Promise.withResolvers(),
      resume = Promise.withResolvers();
    vi.spyOn(storage, 'receive').mockImplementationOnce(async (...args) => {
      entered.resolve();
      await resume.promise;
      return receive(...args);
    });
    const first = part(f).then((res) => res);
    await entered.promise;
    for (const index of [0, 1]) {
      const response = await part(f, index);
      expect(response.status).toBe(429);
      expect(response.headers['retry-after']).toBe('3');
    }
    expect((await cancel(f)).status).toBe(200);
    resume.resolve();
    expect((await first).body.code).toBe('UPLOAD_LEASE_LOST');
    expect((await status(f)).body.confirmedBytes).toBe(0);
    expect(await prisma.testEvidence.count()).toBe(0);
  });
  it.each(['membership', 'session', 'account'])(
    'rechecks %s revocation before publishing an in-flight part',
    async (kind) => {
      const f = await begin(await fixture());
      const { resumableEvidenceStorage: storage } =
        await import('../../src/modules/testCases/storage/resumable-evidence.storage.js');
      const receive = storage.receive.bind(storage),
        entered = Promise.withResolvers(),
        resume = Promise.withResolvers();
      vi.spyOn(storage, 'receive').mockImplementationOnce(async (...args) => {
        entered.resolve();
        await resume.promise;
        return receive(...args);
      });
      const first = part(f).then((res) => res);
      await entered.promise;
      if (kind === 'membership')
        await prisma.projectMembership.updateMany({
          where: { userId: f.user.id },
          data: { isActive: false }
        });
      if (kind === 'session')
        await prisma.session.updateMany({
          where: { userId: f.user.id },
          data: { revokedAt: new Date() }
        });
      if (kind === 'account')
        await prisma.user.update({
          where: { id: f.user.id },
          data: { accountStatus: 'DEACTIVATED' }
        });
      resume.resolve();
      expect([401, 403, 404]).toContain((await first).status);
      expect(
        (await prisma.evidenceUpload.findUnique({ where: { id: f.session.uploadId } })).filesJson[0]
          .parts
      ).toEqual({});
    }
  );
  it('concurrent complete, cancel and expiry have a single fenced outcome', async () => {
    const f = await begin(await fixture());
    await part(f);
    const { resumableEvidenceStorage: storage } =
      await import('../../src/modules/testCases/storage/resumable-evidence.storage.js');
    const assemble = storage.assemble.bind(storage),
      entered = Promise.withResolvers(),
      resume = Promise.withResolvers();
    vi.spyOn(storage, 'assemble').mockImplementationOnce(async (...args) => {
      entered.resolve();
      await resume.promise;
      return assemble(...args);
    });
    const first = finish(f).then((res) => res);
    await entered.promise;
    expect((await finish(f)).status).toBe(429);
    await prisma.evidenceUpload.update({
      where: { id: f.session.uploadId },
      data: { expiresAt: new Date(0) }
    });
    const { evidenceUploadService: uploads } =
      await import('../../src/modules/testCases/services/evidence-upload.service.js');
    expect(await uploads.cleanup({ dryRun: false })).toMatchObject({ cleaned: 0 });
    await cancel(f);
    resume.resolve();
    expect((await first).body.code).toBe('UPLOAD_LEASE_LOST');
    expect(await prisma.testExecution.count()).toBe(0);
  });
  it('quotas reject the fourth pending session without creating storage or changing functional caps', async () => {
    const f = await begin(await fixture());
    for (let i = 0; i < 2; i++)
      expect(
        (await f.mutate('post', f.path).send({ ...f.input, idempotencyKey: randomUUID() })).status
      ).toBe(201);
    const fourth = await f
      .mutate('post', f.path)
      .send({ ...f.input, idempotencyKey: randomUUID() });
    expect(fourth.status).toBe(429);
    expect(fourth.body.code).toBe('UPLOAD_QUOTA_EXCEEDED');
    expect(await prisma.evidenceUpload.count()).toBe(3);
  });
  it('preserves strict JSON/content-type boundaries and does not widen other APIs', async () => {
    const f = await begin(await fixture());
    expect(
      (
        await f
          .mutate('post', `${f.path}/${f.session.uploadId}/complete`)
          .send({ padding: 'x'.repeat(6291456) })
      ).status
    ).toBe(413);
    expect((await f.mutate('post', f.path).send({ padding: 'x'.repeat(110000) })).status).toBe(413);
    expect(
      (
        await f
          .mutate('put', `${f.path}/${f.session.uploadId}/files/${f.session.files[0].id}/parts/0`)
          .send({})
      ).status
    ).toBe(415);
    expect(
      (
        await f
          .mutate('put', '/api/test-cases/999')
          .set('Content-Type', 'application/octet-stream')
          .send(small)
      ).status
    ).toBe(415);
  });
});

describe('OCI-04.1 full functional envelope', () => {
  it('U03 U05 U07: two 50 MiB videos plus almost 6 MiB UTF-8 JSON commit once with all requests below Cloudflare', async () => {
    const f = await fixture();
    f.input.steps = Array.from({ length: 100 }, (_, i) => ({
      action: 'Step ' + i,
      expectedResult: 'Expected'
    }));
    f.payload.steps = Array.from({ length: 100 }, (_, i) => ({
      position: i + 1,
      result: 'PASS',
      observedResult: '測'.repeat(20000)
    }));
    const sample = await readFile(new URL('../fixtures/test-evidence/sample.mp4', import.meta.url));
    const video = Buffer.alloc(50 * 1048576);
    sample.copy(video);
    video.writeUInt32BE(video.length - sample.length, sample.length);
    video.write('free', sample.length + 4, 'ascii');
    const upload = await begin(f, [
      descriptor(video, 'step.mp4', 'stepEvidence.1'),
      descriptor(video, 'general.mp4')
    ]);
    expect(upload.response.status, upload.response.text).toBe(201);
    const sizes = [];
    for (let file = 0; file < 2; file++)
      for (let offset = 0; offset < video.length; offset += 8388608) {
        const chunk = video.subarray(offset, offset + 8388608);
        sizes.push(chunk.length);
        const received = await part(upload, file, offset / 8388608, chunk);
        expect(received.status, received.text).toBe(200);
      }
    expect(await prisma.testEvidence.count()).toBe(0);
    const jsonBytes = Buffer.byteLength(JSON.stringify(upload.payload));
    sizes.push(jsonBytes);
    expect(jsonBytes).toBeGreaterThan(6000000);
    expect(jsonBytes).toBeLessThanOrEqual(6291456);
    expect(sizes.every((size) => size < 100000000)).toBe(true);
    const result = await finish(upload);
    expect(result.status, result.text).toBe(200);
    expect(result.body.execution.steps).toHaveLength(100);
    const evidence = await prisma.testEvidence.findMany();
    expect(evidence.map((row) => row.sizeBytes)).toEqual([52428800, 52428800]);
    expect(evidence.every((row) => row.sha256 === checksum(video))).toBe(true);
    expect(evidence.find((row) => row.scope === 'STEP').executionStepId).not.toBeNull();
    expect(evidence.find((row) => row.scope === 'EXECUTION').executionStepId).toBeNull();
    expect((await status(upload)).body.confirmedBytes).toBe(104857600);
  });
  it('U06: all 20 allowed files retain their step/general associations', async () => {
    const f = await fixture();
    f.input.steps = Array.from({ length: 5 }, (_, i) => ({
      action: 'Step ' + i,
      expectedResult: 'Expected'
    }));
    f.payload.steps = Array.from({ length: 5 }, (_, i) => ({ position: i + 1, result: 'PASS' }));
    const files = Array.from({ length: 20 }, (_, i) =>
      descriptor(
        png,
        'shot-' + i + '.png',
        i < 5 ? 'evidence' : 'stepEvidence.' + (1 + Math.floor((i - 5) / 3))
      )
    );
    const upload = await begin(f, files);
    for (let i = 0; i < 20; i++) expect((await part(upload, i, 0, png)).status).toBe(200);
    expect((await finish(upload)).status).toBe(200);
    expect(await prisma.testEvidence.count()).toBe(20);
    expect(await prisma.testEvidence.count({ where: { scope: 'EXECUTION' } })).toBe(5);
    expect(await prisma.testEvidence.count({ where: { scope: 'STEP' } })).toBe(15);
  });
});

describe('OCI-04.1 admission, recovery and commit fencing', () => {
  it.each(['ACTIVE_PROJECT', 'ACTIVE_GLOBAL', 'TEMP_USER_BYTES', 'TEMP_GLOBAL_BYTES'])(
    'enforces persistent %s quota',
    async (name) => {
      const f = await begin(await fixture());
      const { createEvidenceUploadService } =
        await import('../../src/modules/testCases/services/evidence-upload.service.js');
      const { uploadLimits } =
        await import('../../src/modules/testCases/uploads/upload-contract.js');
      const service = createEvidenceUploadService({ limits: { ...uploadLimits({}), [name]: 1 } });
      await expect(
        service.initiate(
          f.row.id,
          { ...f.input, idempotencyKey: randomUUID() },
          { actorUserId: f.user.id }
        )
      ).rejects.toMatchObject({ code: 'UPLOAD_QUOTA_EXCEEDED' });
      expect(await prisma.evidenceUpload.count()).toBe(1);
    }
  );
  it('fails closed on low disk without accepting a part or publishing evidence', async () => {
    const f = await begin(await fixture());
    const { resumableEvidenceStorage: storage } =
      await import('../../src/modules/testCases/storage/resumable-evidence.storage.js');
    vi.spyOn(storage, 'freeBytes').mockResolvedValue(0);
    expect((await part(f)).status).toBe(507);
    expect(
      (await f.mutate('post', f.path).send({ ...f.input, idempotencyKey: randomUUID() })).status
    ).toBe(507);
    expect((await status(f)).body.confirmedBytes).toBe(0);
  });
  it.each(['init', 'part'])(
    'lost %s acknowledgement recovers its durable receipt',
    async (phase) => {
      const f = await begin(await fixture());
      const { evidenceUploadRepository: repo } =
        await import('../../src/modules/testCases/repositories/evidence-upload.repository.js');
      const transaction = repo.transaction.bind(repo);
      let counter = 0;
      const target = phase === 'init' ? 1 : 2;
      vi.spyOn(repo, 'transaction').mockImplementation(async (...args) => {
        const result = await transaction(...args);
        counter++;
        if (counter === target) throw Error('acknowledgement lost');
        return result;
      });
      if (phase === 'init') {
        const input = { ...f.input, idempotencyKey: randomUUID() };
        expect((await f.mutate('post', f.path).send(input)).status).toBe(500);
        const retry = await f.mutate('post', f.path).send(input);
        expect(retry.status).toBe(201);
        expect(await prisma.evidenceUpload.count()).toBe(2);
      } else {
        expect((await part(f)).status).toBe(500);
        expect((await status(f)).body.confirmedBytes).toBe(small.length);
        expect((await part(f)).status).toBe(200);
        expect((await finish(f)).status).toBe(200);
        expect(await prisma.testEvidence.count()).toBe(1);
      }
    }
  );
  it('two independent sessions for identical files create two explicitly requested executions', async () => {
    const first = await begin(await fixture());
    const response = await first
      .mutate('post', first.path)
      .send({ ...first.input, idempotencyKey: randomUUID() });
    const second = { ...first, session: response.body };
    expect(first.session.uploadId).not.toBe(second.session.uploadId);
    expect((await Promise.all([part(first), part(second)])).map((res) => res.status)).toEqual([
      200, 200
    ]);
    expect((await Promise.all([finish(first), finish(second)])).map((res) => res.status)).toEqual([
      200, 200
    ]);
    expect(await prisma.testExecution.count()).toBe(2);
    expect(
      new Set((await prisma.testEvidence.findMany()).map((file) => file.storageKey)).size
    ).toBe(2);
  });
  it('a valid finalization lease survives TTL expiry and cleanup cannot remove its active files', async () => {
    const f = await begin(await fixture());
    await part(f);
    const { resumableEvidenceStorage: storage } =
      await import('../../src/modules/testCases/storage/resumable-evidence.storage.js');
    const original = storage.assemble.bind(storage),
      entered = Promise.withResolvers(),
      resume = Promise.withResolvers();
    vi.spyOn(storage, 'assemble').mockImplementationOnce(async (...args) => {
      entered.resolve();
      await resume.promise;
      return original(...args);
    });
    const first = finish(f).then((res) => res);
    await entered.promise;
    await prisma.evidenceUpload.update({
      where: { id: f.session.uploadId },
      data: { expiresAt: new Date() }
    });
    const { evidenceUploadService: uploads } =
      await import('../../src/modules/testCases/services/evidence-upload.service.js');
    expect(await uploads.cleanupOne(f.session.uploadId)).toBe('BUSY');
    resume.resolve();
    expect((await first).status).toBe(200);
    expect(await prisma.testEvidence.count()).toBe(1);
  });
  it('the committed transaction wins a late cancellation and preserves immutable evidence', async () => {
    const f = await begin(await fixture());
    await part(f);
    const { resumableEvidenceStorage: storage } =
      await import('../../src/modules/testCases/storage/resumable-evidence.storage.js');
    const original = storage.promote.bind(storage),
      entered = Promise.withResolvers(),
      resume = Promise.withResolvers();
    vi.spyOn(storage, 'promote').mockImplementationOnce(async (...args) => {
      entered.resolve();
      await resume.promise;
      return original(...args);
    });
    const first = finish(f).then((res) => res);
    await entered.promise;
    const cancellation = cancel(f).then((res) => res);
    resume.resolve();
    expect((await first).status).toBe(200);
    expect((await cancellation).status).toBe(409);
    expect(await prisma.testEvidence.count()).toBe(1);
  });
  it('cleanup failure preserves ownership and retry never erases committed evidence', async () => {
    const f = await begin(await fixture());
    await part(f);
    const { resumableEvidenceStorage: storage } =
      await import('../../src/modules/testCases/storage/resumable-evidence.storage.js');
    const prune = storage.prune.bind(storage);
    vi.spyOn(storage, 'prune').mockImplementation(async (row, options) => {
      if (options?.all) throw Error('filesystem unavailable');
      return prune(row, options);
    });
    expect((await finish(f)).status).toBe(200);
    expect(
      (await prisma.evidenceUpload.findUnique({ where: { id: f.session.uploadId } })).cleanedAt
    ).toBeNull();
    vi.restoreAllMocks();
    const { evidenceUploadService: uploads } =
      await import('../../src/modules/testCases/services/evidence-upload.service.js');
    expect(await uploads.cleanup({ dryRun: false })).toMatchObject({ cleaned: 1, failed: 0 });
    expect(await uploads.cleanup({ dryRun: false })).toMatchObject({ inspected: 0 });
    expect(await prisma.testEvidence.count()).toBe(1);
  });
});

describe('persistent concurrency budgets', () => {
  it.each(['user', 'global'])(
    'refuses a new writer while the %s lease budget is occupied',
    async (scope) => {
      const actor = await fixture();
      const count = scope === 'user' ? 2 : 4;
      const occupied = [];
      for (let index = 0; index < count; index++) {
        const f = await begin(scope === 'user' ? actor : await fixture());
        expect(f.response.status).toBe(201);
        occupied.push(f.session.uploadId);
        await prisma.evidenceUpload.update({
          where: { id: f.session.uploadId },
          data: {
            leaseToken: randomUUID(),
            leaseUntil: new Date(Date.now() + 90000)
          }
        });
      }
      const next = await begin(actor);
      expect(next.response.status).toBe(201);
      expect((await part(next)).body.code).toBe('UPLOAD_BUSY');
      expect((await status(next)).body.confirmedBytes).toBe(0);
      await prisma.evidenceUpload.update({
        where: { id: occupied[0] },
        data: { leaseUntil: new Date(0) }
      });
      expect((await part(next)).status).toBe(200);
    }
  );
});
