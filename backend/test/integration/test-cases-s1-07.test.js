import { afterAll, afterEach, beforeAll, describe, it, expect, vi } from 'vitest';
import { readFile, mkdtemp, readdir, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  configureTestDatabaseEnvironment,
  deployTestMigrations,
  cleanTestDatabase
} from '../helpers/test-database.js';
import { createProject, createRequirement, createTask } from '../fixtures/factories.js';
import { LocalTestEvidenceStorage } from '../../src/modules/testCases/storage/local-test-evidence.storage.js';
let prisma, cases, executions, caseFactory, executionFactory, repositoryFactory, settings;
const directories = [];
beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ testCaseService: cases, createTestCaseService: caseFactory } =
    await import('../../src/modules/testCases/services/test-case.service.js'));
  ({ testExecutionService: executions, createTestExecutionService: executionFactory } =
    await import('../../src/modules/testCases/services/test-execution.service.js'));
  ({ createTestCaseRepository: repositoryFactory } =
    await import('../../src/modules/testCases/repositories/test-case.repository.js'));
  ({ settingsRepository: settings } =
    await import('../../src/modules/settings/settings.repository.js'));
  await cleanTestDatabase(prisma);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanTestDatabase(prisma);
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});
afterAll(async () => prisma.$disconnect());
async function fixture({ links = true } = {}) {
  const project = await createProject(prisma);
  const otherProject = await createProject(prisma);
  const user = await prisma.user.create({
    data: { name: 'S107 Executor', username: 's107executor', email: 's107@example.invalid' }
  });
  const second = await prisma.user.create({
    data: {
      name: 'S107 Responsible',
      username: 's107responsible',
      email: 's107responsible@example.invalid'
    }
  });
  await prisma.projectMembership.createMany({
    data: [
      { projectId: project.id, userId: user.id, role: 'MEMBER' },
      { projectId: project.id, userId: second.id, role: 'VIEWER' }
    ]
  });
  const requirement = await createRequirement(prisma, project.id, {
    title: 'Original requirement'
  });
  const task = await createTask(prisma, project.id, { title: 'Original task' });
  const pr = await prisma.pullRequest.create({
    data: {
      projectId: project.id,
      githubId: '100',
      number: 42,
      title: 'Original PR',
      state: 'open',
      githubUrl: 'https://github.com/example/test/pull/42'
    }
  });
  const commit = await prisma.commit.create({
    data: {
      projectId: project.id,
      hash: 'abcdef123456',
      message: 'Original commit',
      authorName: 'Commit author',
      authorEmail: 'private@example.invalid'
    }
  });
  await prisma.task.update({ where: { id: task.id }, data: { pullRequestId: pr.id } });
  await prisma.taskCommit.create({ data: { taskId: task.id, commitId: commit.id } });
  const context = { actorUserId: user.id };
  const input = {
    title: 'Case',
    description: 'Description',
    preconditions: 'Ready',
    expectedResult: 'Works',
    responsibleUserId: second.id,
    requirementId: requirement.id,
    taskIds: links ? [task.id] : [],
    steps: [
      { action: 'First', expectedResult: 'First result' },
      { action: 'Second', expectedResult: 'Second result' }
    ]
  };
  const payload = {
    testCaseVersion: 1,
    environment: 'LOCAL',
    testedReference: { type: 'PULL_REQUEST', id: pr.id },
    steps: [
      { position: 1, result: 'PASS' },
      { position: 2, result: 'PASS' }
    ]
  };
  const create = (patch = {}) => cases.create(project.id, { ...input, ...patch }, context);
  return {
    project,
    otherProject,
    user,
    second,
    requirement,
    task,
    pr,
    commit,
    context,
    input,
    payload,
    create
  };
}
const page = { page: 1, limit: 20 };
async function storedEvidence(
  bytes = Buffer.from('{"ok":true}'),
  name = 'result.json',
  field = 'evidence'
) {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 's107-integration-'));
  directories.push(directory);
  const storage = new LocalTestEvidenceStorage({ directory, environment: 'test' });
  const attempt = await storage.begin();
  await storage.receive(attempt, {
    fieldname: field,
    originalname: name,
    stream: Readable.from([bytes])
  });
  return { storage, attempt, directory };
}
describe('S1-07 persisted definitions', () => {
  it.each([false, true])(
    'creates complete typed v1, traceability=%s and minimal audit',
    async (links) => {
      const f = await fixture({ links });
      const row = await f.create();
      expect(row).toMatchObject({
        displayId: `TC-${row.id}`,
        currentVersion: 1,
        taskCount: links ? 1 : 0,
        responsible: { id: f.second.id },
        status: 'ATIVO'
      });
      const version = await prisma.testCaseVersion.findFirst();
      expect(version.snapshotJson).toMatchObject({
        schemaVersion: 1,
        title: 'Case',
        steps: [
          { position: 1, action: 'First', expectedResult: 'First result' },
          { position: 2, action: 'Second', expectedResult: 'Second result' }
        ]
      });
      expect(await prisma.testCaseHistoryEntry.count()).toBe(1);
      const audit = await prisma.auditEvent.findFirst({ where: { action: 'TEST_CASE_CREATED' } });
      expect(audit.metadataJson).toEqual({
        version: 1,
        stepCount: 2,
        taskCount: links ? 1 : 0,
        hasRequirement: true
      });
      expect(JSON.stringify(audit)).not.toContain('Description');
    }
  );
  it('accepts requirement-only and tasks-only definitions', async () => {
    const f = await fixture();
    expect((await f.create({ taskIds: [] })).taskCount).toBe(0);
    expect((await f.create({ requirementId: null })).requirement).toBeNull();
  });
  it('rejects missing, foreign and inactive responsible, requirement/task mismatch without partial rows', async () => {
    const f = await fixture();
    const foreignTask = await createTask(prisma, f.otherProject.id);
    const foreignReq = await createRequirement(prisma, f.otherProject.id);
    for (const patch of [
      { responsibleUserId: 999999 },
      { requirementId: foreignReq.id },
      { taskIds: [f.task.id, foreignTask.id] }
    ])
      await expect(f.create(patch)).rejects.toMatchObject({ statusCode: 404 });
    await prisma.projectMembership.updateMany({
      where: { userId: f.second.id },
      data: { isActive: false }
    });
    await expect(f.create()).rejects.toMatchObject({ statusCode: 404 });
    expect(await prisma.testCase.count()).toBe(0);
    expect(await prisma.testCaseVersion.count()).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0);
  });
  it('preserves definition v1/v2/v3, ignores task set order and normalized no-op', async () => {
    const f = await fixture();
    const t2 = await createTask(prisma, f.project.id);
    const row = await f.create({ taskIds: [f.task.id, t2.id] });
    const edit = (patch, expectedVersion) =>
      cases.update(row.id, { ...patch, expectedVersion }, f.context);
    expect((await edit({ title: ' Case ', taskIds: [t2.id, f.task.id] }, 1)).currentVersion).toBe(
      1
    );
    expect((await edit({ title: 'Changed' }, 1)).currentVersion).toBe(2);
    expect((await edit({ steps: [...f.input.steps].reverse() }, 2)).currentVersion).toBe(3);
    expect((await cases.versions(row.id, page, f.context)).items.map((v) => v.version)).toEqual([
      3, 2, 1
    ]);
    expect((await cases.versions(row.id, { page: 2, limit: 1 }, f.context)).items[0].version).toBe(
      2
    );
    await expect(edit({ title: 'Stale' }, 1)).rejects.toMatchObject({
      statusCode: 409,
      code: 'TEST_CASE_VERSION_CONFLICT'
    });
  });
  it('status/responsible-only changes never create versions or reset optional fields', async () => {
    const f = await fixture();
    const row = await f.create();
    const updated = await cases.update(
      row.id,
      { expectedVersion: 1, status: 'INATIVO', responsibleUserId: f.user.id },
      f.context
    );
    expect(updated).toMatchObject({
      currentVersion: 1,
      status: 'INATIVO',
      description: 'Description',
      requirementId: f.requirement.id,
      taskCount: 1
    });
    expect(await prisma.testCaseVersion.count()).toBe(1);
    expect(
      (await cases.history(row.id, { limit: 30 }, f.context)).items.map((i) => i.action)
    ).toEqual(['RESPONSIBLE_CHANGED', 'STATUS_CHANGED', 'CREATED']);
    expect(
      (await cases.update(row.id, { expectedVersion: 1, status: 'ATIVO' }, f.context))
        .currentVersion
    ).toBe(1);
  });
  it('freezes referenced titles across later mutations and creates version for relinking', async () => {
    const f = await fixture();
    const row = await f.create();
    await prisma.requirement.update({
      where: { id: f.requirement.id },
      data: { title: 'New requirement' }
    });
    await prisma.task.update({ where: { id: f.task.id }, data: { title: 'New task' } });
    const old = (await cases.versions(row.id, page, f.context)).items[0];
    expect(old.snapshotJson.requirement.title).toBe('Original requirement');
    expect(old.snapshotJson.tasks[0].title).toBe('Original task');
    expect(
      (await cases.update(row.id, { expectedVersion: 1, requirementId: null }, f.context))
        .currentVersion
    ).toBe(2);
  });
  it('soft deletes without destroying any historical child, and hides all operational reads', async () => {
    const f = await fixture();
    const row = await f.create();
    const files = await storedEvidence();
    const service = executionFactory({ storage: files.storage });
    const execution = await service.record(row.id, f.payload, files.attempt, f.context);
    await cases.delete(row.id, f.context);
    expect((await prisma.testCase.findUnique({ where: { id: row.id } })).deletedById).toBe(
      f.user.id
    );
    for (const table of ['testCaseVersion', 'testExecution', 'testEvidence'])
      expect(await prisma[table].count()).toBe(1);
    expect(await prisma.testExecutionStep.count()).toBe(2);
    expect(await prisma.testCaseStep.count()).toBe(2);
    await expect(cases.read(row.id, f.context)).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      cases.update(row.id, { expectedVersion: 1, title: 'x' }, f.context)
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(executions.record(row.id, f.payload, null, f.context)).rejects.toMatchObject({
      statusCode: 404
    });
    expect((await cases.list(f.project.id, page, f.context)).summary.total).toBe(0);
    expect((await service.detail(execution.id, f.context)).caseVersionSnapshot.title).toBe('Case');
    const content = await service.content(execution.evidence[0].id, f.context);
    content.stream.destroy();
  });
});
describe('S1-07 immutable execution', () => {
  it.each(['PULL_REQUEST', 'COMMIT'])(
    'executes imported %s as authenticated member, independently of responsible',
    async (type) => {
      const f = await fixture();
      const row = await f.create();
      const payload = {
        ...f.payload,
        testedReference: { type, id: type === 'COMMIT' ? f.commit.id : f.pr.id },
        steps: [
          { position: 2, result: 'BLOCKED', observedResult: 'blocked' },
          { position: 1, result: 'FAIL', observedResult: 'wrong' }
        ]
      };
      const result = await executions.record(row.id, payload, null, f.context);
      expect(result).toMatchObject({
        result: 'FAIL',
        executedByUserId: f.user.id,
        executedByDisplayNameSnapshot: f.user.name,
        testCaseVersion: 1,
        steps: [
          { position: 1, actionSnapshot: 'First', result: 'FAIL' },
          { position: 2, result: 'BLOCKED' }
        ]
      });
      expect(result.testedReferenceSnapshot.type).toBe(type);
      expect(result.executedAt).toBeInstanceOf(Date);
      expect(
        (await prisma.auditEvent.findFirst({ where: { action: 'TEST_EXECUTION_RECORDED' } }))
          .metadataJson
      ).toEqual({ version: 1, result: 'FAIL', stepCount: 2, evidenceCount: 0 });
    }
  );
  it('refuses inactive/stale/foreign refs and malformed step sets atomically', async () => {
    const f = await fixture();
    const row = await f.create();
    const foreign = await prisma.commit.create({
      data: { projectId: f.otherProject.id, hash: 'foreign' }
    });
    for (const payload of [
      { ...f.payload, testCaseVersion: 2 },
      { ...f.payload, testedReference: { type: 'COMMIT', id: foreign.id } },
      { ...f.payload, steps: [{ position: 1, result: 'PASS' }] },
      {
        ...f.payload,
        steps: [
          { position: 1, result: 'PASS' },
          { position: 1, result: 'PASS' }
        ]
      }
    ])
      await expect(executions.record(row.id, payload, null, f.context)).rejects.toBeDefined();
    await cases.update(row.id, { expectedVersion: 1, status: 'INATIVO' }, f.context);
    await expect(executions.record(row.id, f.payload, null, f.context)).rejects.toMatchObject({
      code: 'TEST_CASE_INACTIVE'
    });
    expect(await prisma.testExecution.count()).toBe(0);
  });
  it('serves only historical definition, PR and executor display after current changes', async () => {
    const f = await fixture();
    const row = await f.create();
    const result = await executions.record(row.id, f.payload, null, f.context);
    const before = await executions.detail(result.id, f.context);
    await cases.update(row.id, { expectedVersion: 1, title: 'Changed current' }, f.context);
    await prisma.pullRequest.update({
      where: { id: f.pr.id },
      data: { title: 'Synced title', state: 'closed' }
    });
    await prisma.user.update({ where: { id: f.user.id }, data: { name: 'Renamed' } });
    expect(await executions.detail(result.id, f.context)).toEqual(before);
  });
  it('freezes commit snapshot without email and does not consult current commit for history', async () => {
    const f = await fixture();
    const row = await f.create();
    const result = await executions.record(
      row.id,
      { ...f.payload, testedReference: { type: 'COMMIT', id: f.commit.id } },
      null,
      f.context
    );
    const before = result.testedReferenceSnapshot;
    await prisma.commit.update({
      where: { id: f.commit.id },
      data: { message: 'Changed', authorName: 'Changed' }
    });
    expect((await executions.detail(result.id, f.context)).testedReferenceSnapshot).toEqual(before);
    expect(JSON.stringify(before)).not.toContain('private@example');
  });
  it('returns related deduped imported candidates, with project fallback only when searching', async () => {
    const f = await fixture();
    const t2 = await createTask(prisma, f.project.id, { pullRequestId: f.pr.id });
    await prisma.taskCommit.create({ data: { taskId: t2.id, commitId: f.commit.id } });
    const row = await f.create({ taskIds: [f.task.id, t2.id] });
    await prisma.pullRequest.create({
      data: { projectId: f.project.id, githubId: 'unrelated', number: 77, title: 'Unrelated PR' }
    });
    const related = await executions.references(row.id, { search: '', limit: 20 }, f.context);
    expect(related.items).toHaveLength(2);
    expect(related.items[0].relatedTaskIds.sort()).toEqual([f.task.id, t2.id].sort());
    expect(
      (await executions.references(row.id, { search: '77', limit: 20 }, f.context)).items[0]
    ).toMatchObject({ number: 77, relatedTaskIds: [] });
    expect(
      (await executions.references(row.id, { search: 'abcdef', limit: 20 }, f.context)).items
    ).toHaveLength(1);
    expect(
      (await executions.references(row.id, { search: 'no-match', limit: 20 }, f.context)).items
    ).toEqual([]);
  });
  it('enforces reference XOR and evidence scope in the database', async () => {
    const f = await fixture();
    const row = await f.create();
    const result = await executions.record(row.id, f.payload, null, f.context);
    await expect(
      prisma.testExecution.update({
        where: { id: result.id },
        data: { testedCommitId: f.commit.id }
      })
    ).rejects.toBeDefined();
    await expect(
      prisma.testEvidence.create({
        data: {
          projectId: f.project.id,
          executionId: result.id,
          scope: 'STEP',
          kind: 'TEXT',
          originalName: 'x',
          mimeType: 'text/plain',
          sizeBytes: 1,
          sha256: 'a'.repeat(64),
          storageKey: 'x'
        }
      })
    ).rejects.toBeDefined();
  });
});
describe('S1-07 list aggregation, history and privacy', () => {
  it('filters independently and in combination; project summary depends only on latest execution', async () => {
    const f = await fixture();
    const a = await f.create({ title: 'Alpha' });
    const b = await f.create({
      title: 'Beta',
      status: 'INATIVO',
      taskIds: [],
      responsibleUserId: f.user.id
    });
    // Represent a pre-S1-08 orphan without bypassing the public creation invariant.
    await prisma.testCase.update({ where: { id: b.id }, data: { requirementId: null } });
    const failure = {
      ...f.payload,
      steps: [
        { position: 1, result: 'FAIL', observedResult: 'wrong' },
        { position: 2, result: 'PASS' }
      ]
    };
    await executions.record(a.id, failure, null, f.context);
    await executions.record(a.id, f.payload, null, f.context);
    const summary = {
      total: 2,
      active: 1,
      withoutTraceability: 1,
      neverExecuted: 1,
      withFailure: 0
    };
    for (const query of [
      { search: `TC-${a.id}` },
      { search: 'Alpha' },
      { status: 'ATIVO' },
      { responsibleUserId: f.second.id },
      { requirementId: f.requirement.id },
      { taskId: f.task.id },
      { latestResult: 'PASS' },
      { status: 'ATIVO', taskId: f.task.id, latestResult: 'PASS' }
    ]) {
      const list = await cases.list(f.project.id, { ...page, ...query }, f.context);
      expect(list.items.map((i) => i.id)).toEqual([a.id]);
      expect(list.summary).toEqual(summary);
    }
    expect(
      (await cases.list(f.project.id, { ...page, latestResult: 'NEVER_EXECUTED' }, f.context))
        .items[0].id
    ).toBe(b.id);
    expect(
      (await cases.list(f.project.id, { ...page, latestResult: 'FAIL' }, f.context)).items
    ).toEqual([]);
    expect((await cases.list(f.project.id, { page: 2, limit: 1 }, f.context)).items[0].id).toBe(
      a.id
    );
    await executions.record(a.id, failure, null, f.context);
    expect((await cases.list(f.project.id, page, f.context)).summary.withFailure).toBe(1);
  });
  it('paginates same-timestamp history and execution without duplicates or gaps', async () => {
    const f = await fixture();
    const row = await f.create();
    for (let i = 0; i < 3; i++) await executions.record(row.id, f.payload, null, f.context);
    const stamp = new Date('2026-01-01');
    await prisma.testExecution.updateMany({ data: { executedAt: stamp } });
    let cursor;
    const ids = [];
    do {
      const result = await executions.list(row.id, { limit: 1, cursor }, f.context);
      ids.push(...result.items.map((i) => i.id));
      cursor = result.nextCursor;
    } while (cursor);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
    await cases.update(row.id, { expectedVersion: 1, title: 'v2', status: 'INATIVO' }, f.context);
    await prisma.testCaseHistoryEntry.updateMany({ data: { occurredAt: stamp } });
    const h = [];
    cursor = undefined;
    do {
      const result = await cases.history(row.id, { limit: 1, cursor }, f.context);
      h.push(...result.items.map((i) => i.id));
      cursor = result.nextCursor;
    } while (cursor);
    expect(new Set(h).size).toBe(3);
  });
  it('exports own active-project collaboration metadata without storage keys or other users', async () => {
    const f = await fixture();
    const row = await f.create({ responsibleUserId: f.user.id });
    const files = await storedEvidence();
    await executionFactory({ storage: files.storage }).record(
      row.id,
      f.payload,
      files.attempt,
      f.context
    );
    const data = await settings.exportData(f.user.id);
    expect(data.responsibleTestCases).toHaveLength(1);
    expect(data.testExecutions).toHaveLength(1);
    expect(data.testEvidence).toHaveLength(1);
    expect(JSON.stringify(data.testEvidence)).not.toContain('storageKey');
    const other = await settings.exportData(f.second.id);
    expect(other.testExecutions).toEqual([]);
    expect(other.testEvidence).toEqual([]);
    await prisma.projectMembership.updateMany({
      where: { userId: f.user.id },
      data: { isActive: false }
    });
    const inactive = await settings.exportData(f.user.id);
    expect(inactive.responsibleTestCases).toEqual([]);
    expect(inactive.testExecutions).toEqual([]);
    expect(inactive.testEvidence).toEqual([]);
  });
});
describe('S1-07 final auditable invariant', () => {
  it('preserves v3, five PASS steps, PNG step 3, MP4 step 5 and JSON after all current owners change', async () => {
    const f = await fixture();
    const steps = Array.from({ length: 5 }, (_, i) => ({
      action: `Action ${i + 1}`,
      expectedResult: `Expected ${i + 1}`
    }));
    const row = await f.create({ steps });
    await cases.update(row.id, { expectedVersion: 1, title: 'v2' }, f.context);
    await cases.update(row.id, { expectedVersion: 2, title: 'v3' }, f.context);
    await prisma.user.update({ where: { id: f.user.id }, data: { name: 'Daniel' } });
    await prisma.pullRequest.update({ where: { id: f.pr.id }, data: { number: 91 } });
    const files = await storedEvidence(Buffer.from('{"response":"ok"}'), 'response.json');
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4ZkAAAAASUVORK5CYII=',
      'base64'
    );
    const mp4 = await readFile(new URL('../fixtures/test-evidence/sample.mp4', import.meta.url));
    for (const [bytes, name, field] of [
      [png, 'screenshot-step3.png', 'stepEvidence.3'],
      [mp4, 'video-step5.mp4', 'stepEvidence.5']
    ])
      await files.storage.receive(files.attempt, {
        originalname: name,
        fieldname: field,
        stream: Readable.from([bytes])
      });
    const service = executionFactory({ storage: files.storage });
    const execution = await service.record(
      row.id,
      {
        ...f.payload,
        testCaseVersion: 3,
        environment: 'HOMOLOGACAO',
        steps: steps.map((_, i) => ({ position: i + 1, result: 'PASS' }))
      },
      files.attempt,
      f.context
    );
    expect(execution).toMatchObject({
      testCaseVersion: 3,
      executedByDisplayNameSnapshot: 'Daniel',
      environment: 'HOMOLOGACAO',
      result: 'PASS',
      testedReferenceSnapshot: { number: 91 }
    });
    expect(execution.steps).toHaveLength(5);
    expect(execution.evidence.map((e) => e.originalName)).toEqual([
      'response.json',
      'screenshot-step3.png',
      'video-step5.mp4'
    ]);
    await cases.update(row.id, { expectedVersion: 3, title: 'v4' }, f.context);
    await prisma.pullRequest.update({ where: { id: f.pr.id }, data: { state: 'closed' } });
    await prisma.task.update({ where: { id: f.task.id }, data: { title: 'Changed' } });
    await prisma.requirement.update({
      where: { id: f.requirement.id },
      data: { title: 'Changed' }
    });
    await prisma.user.update({ where: { id: f.user.id }, data: { name: 'Changed' } });
    expect(await service.detail(execution.id, f.context)).toEqual(execution);
  });
});
describe('S1-07 account anonymization policy', () => {
  it('neutralizes known display identity without deleting definitions, execution or evidence', async () => {
    const f = await fixture();
    const row = await f.create();
    await cases.update(row.id, { expectedVersion: 1, responsibleUserId: f.user.id }, f.context);
    const files = await storedEvidence();
    const execution = await executionFactory({ storage: files.storage }).record(
      row.id,
      f.payload,
      files.attempt,
      f.context
    );
    await prisma.privacyRequest.create({
      data: { userId: f.user.id, type: 'ACCOUNT_DELETION', scheduledFor: new Date('2020-01-01') }
    });
    const { privacyService } = await import('../../src/modules/privacy/privacy.service.js');
    expect(await privacyService.processDueDeletions({ dryRun: false })).toMatchObject({
      processed: 1,
      failed: 0
    });
    const user = await prisma.user.findUnique({ where: { id: f.user.id } });
    expect(user.accountStatus).toBe('ANONYMIZED');
    const persisted = await prisma.testExecution.findUnique({ where: { id: execution.id } });
    expect(persisted.executedByDisplayNameSnapshot).toBe(user.name);
    expect(
      (await prisma.testCaseHistoryEntry.findFirst({ where: { action: 'RESPONSIBLE_CHANGED' } }))
        .metadataJson.to.name
    ).toBe(user.name);
    expect(await prisma.testCaseVersion.count()).toBe(1);
    expect(await prisma.testEvidence.count()).toBe(1);
    expect(await readdir(files.directory)).toHaveLength(1);
  });
});
describe('S1-07 storage/database compensation', () => {
  it('stores general JSON with private metadata, rejects foreign readers and compensates DB audit failure', async () => {
    const f = await fixture();
    const row = await f.create();
    const files = await storedEvidence();
    const repo = repositoryFactory();
    const original = repo.transaction.bind(repo);
    repo.transaction = (work) =>
      original((tx) => {
        tx.audit = () => {
          throw Error('injected database failure');
        };
        return work(tx);
      });
    await expect(
      executionFactory({ cases: repo, storage: files.storage }).record(
        row.id,
        f.payload,
        files.attempt,
        f.context
      )
    ).rejects.toThrow('injected');
    expect(await prisma.testExecution.count()).toBe(0);
    expect(await prisma.testExecutionStep.count()).toBe(0);
    expect(await readdir(files.directory)).toEqual([]);
  });
  it('storage failure rejects before locking/persisting execution', async () => {
    const f = await fixture();
    const row = await f.create();
    const storage = {
      prepare: vi.fn().mockRejectedValue(Error('storage unavailable')),
      cleanup: vi.fn()
    };
    const repo = repositoryFactory();
    const transaction = vi.spyOn(repo, 'transaction');
    await expect(
      executionFactory({ cases: repo, storage }).record(row.id, f.payload, {}, f.context)
    ).rejects.toThrow('storage unavailable');
    expect(transaction).not.toHaveBeenCalled();
    expect(await prisma.testExecution.count()).toBe(0);
    expect(storage.cleanup).toHaveBeenCalled();
  });
});
// A deterministic barrier pauses the winner after acquiring the actual MySQL row lock.
function barrier() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function gatedRepo() {
  const entered = barrier(),
    release = barrier();
  const repo = repositoryFactory();
  const transaction = repo.transaction.bind(repo);
  repo.transaction = (work) =>
    transaction((tx) => {
      const lock = tx.lock.bind(tx);
      tx.lock = async (id) => {
        const row = await lock(id);
        entered.resolve();
        await release.promise;
        return row;
      };
      return work(tx);
    });
  return { repo, entered, release };
}
describe('S1-07 deterministic row-lock races (no sleeps)', () => {
  it('two editors with v1 produce exactly one v2 and one 409', async () => {
    const f = await fixture();
    const row = await f.create();
    const gate = gatedRepo();
    const first = caseFactory(gate.repo).update(
      row.id,
      { expectedVersion: 1, title: 'Winner' },
      f.context
    );
    await gate.entered.promise;
    const second = cases.update(row.id, { expectedVersion: 1, title: 'Loser' }, f.context);
    const settled = Promise.allSettled([first, second]);
    gate.release.resolve();
    const results = await settled;
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].reason).toMatchObject({ code: 'TEST_CASE_VERSION_CONFLICT' });
    expect(await prisma.testCaseVersion.count()).toBe(2);
  });
  it.each(['update', 'delete', 'status'])(
    '%s wins lock before execute; execution cannot bypass new state',
    async (operation) => {
      const f = await fixture();
      const row = await f.create();
      const gate = gatedRepo();
      const service = caseFactory(gate.repo);
      const first =
        operation === 'delete'
          ? service.delete(row.id, f.context)
          : service.update(
              row.id,
              {
                expectedVersion: 1,
                ...(operation === 'status' ? { status: 'INATIVO' } : { title: 'New version' })
              },
              f.context
            );
      await gate.entered.promise;
      const second = executions.record(row.id, f.payload, null, f.context);
      const settled = Promise.allSettled([first, second]);
      gate.release.resolve();
      const result = await settled;
      expect(result[0].status).toBe('fulfilled');
      expect(result[1].status).toBe('rejected');
      expect(result[1].reason.statusCode).toBe(operation === 'delete' ? 404 : 409);
      expect(await prisma.testExecution.count()).toBe(0);
    }
  );
  it.each(['update', 'delete', 'status'])(
    'execute wins lock before %s; historical execution remains v1',
    async (operation) => {
      const f = await fixture();
      const row = await f.create();
      const gate = gatedRepo();
      const first = executionFactory({ cases: gate.repo }).record(
        row.id,
        f.payload,
        null,
        f.context
      );
      await gate.entered.promise;
      const second =
        operation === 'delete'
          ? cases.delete(row.id, f.context)
          : cases.update(
              row.id,
              {
                expectedVersion: 1,
                ...(operation === 'status' ? { status: 'INATIVO' } : { title: 'New version' })
              },
              f.context
            );
      const settled = Promise.allSettled([first, second]);
      gate.release.resolve();
      const result = await settled;
      expect(result.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
      expect(
        (await executions.detail(result[0].value.id, f.context)).caseVersionSnapshot.title
      ).toBe('Case');
      expect(await prisma.testExecution.count()).toBe(1);
    }
  );
});
