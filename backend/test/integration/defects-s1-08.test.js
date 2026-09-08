import { afterAll, afterEach, beforeAll, describe, it, expect, vi } from 'vitest';
import {
  configureTestDatabaseEnvironment,
  deployTestMigrations,
  cleanTestDatabase
} from '../helpers/test-database.js';
import { createProject, createRequirement, createTask } from '../fixtures/factories.js';
let prisma,
  cases,
  executions,
  defects,
  defectFactory,
  repoFactory,
  kanban,
  tasks,
  executionFactory,
  caseRepoFactory;
beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ testCaseService: cases } =
    await import('../../src/modules/testCases/services/test-case.service.js'));
  ({ testExecutionService: executions, createTestExecutionService: executionFactory } =
    await import('../../src/modules/testCases/services/test-execution.service.js'));
  ({ defectService: defects, createDefectService: defectFactory } =
    await import('../../src/modules/defects/defect.service.js'));
  ({ createDefectRepository: repoFactory } =
    await import('../../src/modules/defects/repositories/defect.repository.js'));
  ({ createTestCaseRepository: caseRepoFactory } =
    await import('../../src/modules/testCases/repositories/test-case.repository.js'));
  ({ taskKanbanService: kanban } =
    await import('../../src/modules/tasks/services/task-kanban.service.js'));
  ({ taskCrudService: tasks } =
    await import('../../src/modules/tasks/services/task-crud.service.js'));
  await cleanTestDatabase(prisma);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanTestDatabase(prisma);
});
afterAll(async () => prisma.$disconnect());
const page = { page: 1, limit: 20, search: '' };
async function fixture() {
  const project = await createProject(prisma),
    other = await createProject(prisma);
  const user = await prisma.user.create({
    data: { name: 'Defect executor', username: 's108', email: 's108@example.invalid' }
  });
  await prisma.projectMembership.create({
    data: { projectId: project.id, userId: user.id, role: 'MEMBER' }
  });
  const requirement = await createRequirement(prisma, project.id, {
    title: 'Historical requirement'
  });
  const origin = await createTask(prisma, project.id, { title: 'Historical origin' });
  const pr = await prisma.pullRequest.create({
    data: { projectId: project.id, githubId: '108', number: 108, title: 'Detection PR' }
  });
  const context = { actorUserId: user.id };
  const caseInput = {
    title: 'Historical case',
    description: 'Description',
    preconditions: 'Ready',
    expectedResult: 'Expected',
    responsibleUserId: user.id,
    requirementId: requirement.id,
    taskIds: [origin.id],
    steps: [{ action: 'Click', expectedResult: 'Visible' }]
  };
  const tc = await cases.create(project.id, caseInput, context);
  const payload = {
    testCaseVersion: 1,
    environment: 'LOCAL',
    testedReference: { type: 'PULL_REQUEST', id: pr.id },
    steps: [{ position: 1, result: 'FAIL', observedResult: 'Missing' }]
  };
  const execution = await executions.record(tc.id, payload, null, context);
  const input = {
    title: 'Missing element',
    description: 'Element did not appear',
    severity: 'ALTA',
    responsibleUserId: user.id,
    detectedExecutionStepId: execution.steps[0].id,
    requirementId: requirement.id,
    originTaskIds: [origin.id]
  };
  const create = (patch) => defects.create(project.id, { ...input, ...patch }, context);
  const move = (taskId, toStatus) => kanban.moveTask(taskId, { toStatus }, { actor: user });
  const correction = (d, extra) =>
    defects.correction(
      d.id,
      { expectedRevision: d.revision, correctionCycle: d.currentCorrectionCycle, ...extra },
      context
    );
  const retest = (d, result = 'PASS', extra = {}) =>
    executions.record(
      tc.id,
      {
        ...payload,
        steps: [
          { position: 1, result, observedResult: result === 'PASS' ? null : 'Still not executable' }
        ],
        retest: {
          defectId: d.id,
          correctionCycle: d.currentCorrectionCycle,
          expectedRevision: d.revision
        },
        ...extra
      },
      null,
      context
    );
  const ready = async () => {
    let d = await create();
    d = await correction(d, { task: { title: 'Correction' } });
    await move(d.correctionCycles[0].tasks[0].id, 'CONCLUIDO');
    return defects.read(d.id, context);
  };
  return {
    project,
    other,
    user,
    requirement,
    origin,
    pr,
    context,
    caseInput,
    tc,
    payload,
    execution,
    input,
    create,
    move,
    correction,
    retest,
    ready
  };
}
describe('S1-08 persisted domain foundation', () => {
  it('enforces TestCase create/update traceability atomically', async () => {
    const f = await fixture();
    await expect(
      cases.create(f.project.id, { ...f.caseInput, requirementId: null, taskIds: [] }, f.context)
    ).rejects.toMatchObject({ code: 'TEST_CASE_TRACEABILITY_REQUIRED' });
    await expect(
      cases.update(f.tc.id, { expectedVersion: 1, requirementId: null, taskIds: [] }, f.context)
    ).rejects.toMatchObject({ code: 'TEST_CASE_TRACEABILITY_REQUIRED' });
    expect(await prisma.testCaseVersion.count()).toBe(1);
    expect(await prisma.testCaseHistoryEntry.count()).toBe(1);
    expect(
      (await cases.update(f.tc.id, { expectedVersion: 1, requirementId: null }, f.context))
        .currentVersion
    ).toBe(2);
    expect(
      (await cases.create(f.project.id, { ...f.caseInput, taskIds: [] }, f.context)).requirement.id
    ).toBe(f.requirement.id);
  });
  it('detects multiple defects on one FAIL and inherits historical suggestions only', async () => {
    const f = await fixture();
    await cases.update(
      f.tc.id,
      { expectedVersion: 1, title: 'Current title', taskIds: [] },
      f.context
    );
    await prisma.requirement.update({
      where: { id: f.requirement.id },
      data: { title: 'Current requirement' }
    });
    await prisma.task.update({ where: { id: f.origin.id }, data: { title: 'Current task' } });
    const a = await f.create(),
      b = await f.create({ title: 'Second mismatch' });
    expect(a.id).not.toBe(b.id);
    expect(a.status).toBe('ABERTO');
    const found = await defects.candidates(
      f.project.id,
      { ...page, search: 'Historical case' },
      f.context
    );
    expect(found.total).toBe(1);
    expect(found.items[0]).toMatchObject({
      testCase: { title: 'Historical case', version: 1 },
      suggestedRequirement: { title: 'Historical requirement' },
      suggestedOriginTasks: [{ title: 'Historical origin' }]
    });
    expect(found.items[0].existingDefects).toHaveLength(2);
    expect(JSON.stringify(found)).not.toMatch(/storageKey/);
    expect(
      (
        await defects.candidates(
          f.project.id,
          { ...page, search: `EXEC-${f.execution.id}` },
          f.context
        )
      ).total
    ).toBe(1);
  });
  it.each(['PASS', 'BLOCKED'])('rejects detection on %s', async (result) => {
    const f = await fixture();
    const e = await executions.record(
      f.tc.id,
      { ...f.payload, steps: [{ position: 1, result, observedResult: 'Observed' }] },
      null,
      f.context
    );
    await expect(f.create({ detectedExecutionStepId: e.steps[0].id })).rejects.toMatchObject({
      code: 'DEFECT_DETECTION_REQUIRES_FAIL'
    });
    expect(await prisma.defect.count()).toBe(0);
  });
  it('requires own traceability, validates same project, and supports requirement-only/origin-only', async () => {
    const f = await fixture();
    await expect(f.create({ requirementId: null, originTaskIds: [] })).rejects.toMatchObject({
      code: 'DEFECT_TRACEABILITY_REQUIRED'
    });
    const foreign = await createTask(prisma, f.other.id);
    await expect(f.create({ originTaskIds: [foreign.id] })).rejects.toMatchObject({
      statusCode: 404
    });
    const foreignReq = await createRequirement(prisma, f.other.id);
    await expect(f.create({ requirementId: foreignReq.id })).rejects.toMatchObject({
      statusCode: 404
    });
    expect((await f.create({ originTaskIds: [] })).originTasks).toEqual([]);
    expect((await f.create({ requirementId: null })).requirement).toBeNull();
    const d = await f.create();
    await expect(
      defects.update(
        d.id,
        { expectedRevision: d.revision, requirementId: null, originTaskIds: [] },
        f.context
      )
    ).rejects.toMatchObject({ code: 'DEFECT_TRACEABILITY_REQUIRED' });
    expect((await defects.read(d.id, f.context)).revision).toBe(d.revision);
  });
  it('creates normal correction tasks atomically and defaults the singular requirement', async () => {
    const f = await fixture();
    let d = await f.create();
    d = await f.correction(d, { task: { title: 'Fix', responsibleUserId: f.user.id } });
    const task = d.correctionCycles[0].tasks[0];
    expect(task.requirementId).toBe(f.requirement.id);
    expect(task.status).toBe('A_FAZER');
    const dto = await tasks.getTaskById(task.id);
    expect(dto).toMatchObject({
      correctionDefectCount: 1,
      correctionDefects: [{ id: d.id, displayId: `DEF-${d.id}` }]
    });
    await expect(f.correction(d, { taskId: f.origin.id })).rejects.toMatchObject({
      code: 'DEFECT_TASK_ROLE_CONFLICT'
    });
    await expect(f.correction(d, { taskId: task.id })).rejects.toMatchObject({
      code: 'DEFECT_CORRECTION_ALREADY_LINKED'
    });
    await expect(
      defects.update(d.id, { expectedRevision: d.revision, originTaskIds: [task.id] }, f.context)
    ).rejects.toMatchObject({ code: 'DEFECT_TASK_ROLE_CONFLICT' });
    await expect(tasks.deleteTask(task.id, f.context)).rejects.toMatchObject({ statusCode: 409 });
  });
  it('rolls back a newly created task, requirement projection and audit when linking fails', async () => {
    const f = await fixture(),
      d = await f.create();
    const repo = repoFactory();
    const base = repo.transaction.bind(repo);
    repo.transaction = (work) =>
      base((tx) => {
        tx.link = () => {
          throw new Error('injected failure');
        };
        return work(tx);
      });
    const before = [
      await prisma.task.count(),
      await prisma.auditEvent.count(),
      await prisma.defectHistoryEntry.count()
    ];
    await expect(
      defectFactory(repo).correction(
        d.id,
        { expectedRevision: d.revision, correctionCycle: 1, task: { title: 'Must rollback' } },
        f.context
      )
    ).rejects.toThrow('injected failure');
    expect([
      await prisma.task.count(),
      await prisma.auditEvent.count(),
      await prisma.defectHistoryEntry.count()
    ]).toEqual(before);
    expect((await defects.read(d.id, f.context)).revision).toBe(d.revision);
  });
  it('derives lifecycle from all current corrections and ignores origins', async () => {
    const f = await fixture();
    let d = await f.create();
    await f.move(f.origin.id, 'CONCLUIDO');
    expect((await defects.read(d.id, f.context)).status).toBe('ABERTO');
    d = await f.correction(d, { task: { title: 'First fix' } });
    const first = d.correctionCycles[0].tasks[0].id;
    d = await f.correction(d, { task: { title: 'Second fix' } });
    const second = d.correctionCycles[0].tasks[1].id;
    await f.move(first, 'EM_ANDAMENTO');
    expect((await defects.read(d.id, f.context)).status).toBe('EM_CORRECAO');
    await f.move(first, 'CONCLUIDO');
    expect(
      (await defects.list(f.project.id, { ...page, status: 'EM_CORRECAO' }, f.context)).total
    ).toBe(1);
    await f.move(second, 'CONCLUIDO');
    expect((await defects.read(d.id, f.context)).status).toBe('AGUARDANDO_RETESTE');
    await f.move(first, 'A_FAZER');
    expect((await defects.read(d.id, f.context)).status).toBe('EM_CORRECAO');
  });
  it('does not let normal PASS validate; contextual PASS latches validation', async () => {
    const f = await fixture(),
      d = await f.ready();
    await executions.record(
      f.tc.id,
      { ...f.payload, steps: [{ position: 1, result: 'PASS' }] },
      null,
      f.context
    );
    expect((await defects.read(d.id, f.context)).status).toBe('AGUARDANDO_RETESTE');
    const e = await f.retest(d);
    let validated = await defects.read(d.id, f.context);
    expect(validated).toMatchObject({
      status: 'VALIDADO',
      statusReason: { validatedByExecutionId: e.id }
    });
    await f.move(d.correctionCycles[0].tasks[0].id, 'A_FAZER');
    validated = await defects.read(d.id, f.context);
    expect(validated.status).toBe('VALIDADO');
    await expect(f.correction(validated, { task: { title: 'Too late' } })).rejects.toMatchObject({
      code: 'DEFECT_ALREADY_VALIDATED'
    });
    expect((await defects.retests(d.id, { page: 1, limit: 1 }, f.context)).total).toBe(1);
  });
  it('FAIL opens next cycle without reopening tasks; BLOCKED preserves cycle and increments revision', async () => {
    const f = await fixture();
    let d = await f.ready();
    const taskId = d.correctionCycles[0].tasks[0].id;
    await f.retest(d, 'BLOCKED');
    let next = await defects.read(d.id, f.context);
    expect(next).toMatchObject({ status: 'AGUARDANDO_RETESTE', currentCorrectionCycle: 1 });
    expect(next.revision).toBeGreaterThan(d.revision);
    await expect(f.retest(d, 'BLOCKED')).rejects.toMatchObject({ code: 'DEFECT_CONFLICT' });
    await f.retest(next, 'FAIL');
    next = await defects.read(d.id, f.context);
    expect(next).toMatchObject({ status: 'ABERTO', currentCorrectionCycle: 2 });
    expect((await tasks.getTaskById(taskId)).status).toBe('CONCLUIDO');
    await f.move(taskId, 'A_FAZER');
    expect((await defects.read(d.id, f.context)).status).toBe('ABERTO');
    await f.correction(next, { taskId });
    await f.move(taskId, 'CONCLUIDO');
    next = await defects.read(d.id, f.context);
    expect(next.status).toBe('AGUARDANDO_RETESTE');
    expect((await tasks.getTaskById(taskId)).correctionDefectCount).toBe(1);
    await f.retest(next);
    expect((await defects.read(d.id, f.context)).status).toBe('VALIDADO');
  });
  it('rejects early, foreign and stale-version retests without persisting execution', async () => {
    const f = await fixture();
    let d = await f.create();
    await expect(f.retest(d)).rejects.toMatchObject({ code: 'DEFECT_NOT_READY_FOR_RETEST' });
    d = await f.ready();
    await cases.update(f.tc.id, { expectedVersion: 1, title: 'Version two' }, f.context);
    const before = await prisma.testExecution.count();
    await expect(f.retest(d)).rejects.toMatchObject({ code: 'TEST_CASE_VERSION_CONFLICT' });
    expect(await prisma.testExecution.count()).toBe(before);
    await f.retest(d, 'PASS', { testCaseVersion: 2 });
    expect((await defects.read(d.id, f.context)).retests[0].execution.testCaseVersion).toBe(2);
  });
  it('filters operational records and soft deletes without deleting historical relations', async () => {
    const f = await fixture(),
      d = await f.ready();
    for (const filter of [
      { search: `DEF-${d.id}` },
      { severity: 'ALTA' },
      { responsibleUserId: f.user.id },
      { requirementId: f.requirement.id },
      { originTaskId: f.origin.id },
      { correctionTaskId: d.correctionCycles[0].tasks[0].id },
      { testCaseId: f.tc.id }
    ])
      expect((await defects.list(f.project.id, { ...page, ...filter }, f.context)).total).toBe(1);
    await defects.delete(d.id, f.context);
    await expect(defects.read(d.id, f.context)).rejects.toMatchObject({ statusCode: 404 });
    expect((await defects.list(f.project.id, page, f.context)).summary.total).toBe(0);
    expect(await prisma.defectTask.count()).toBe(2);
    expect(await prisma.testExecution.count()).toBe(1);
    expect(
      (await tasks.getTaskById(d.correctionCycles[0].tasks[0].id)).correctionDefects[0].deletedAt
    ).not.toBeNull();
  });
  it('prioritizes current correction references and provides persisted project fallback', async () => {
    const f = await fixture();
    let d = await f.create();
    const pr = await prisma.pullRequest.create({
      data: { projectId: f.project.id, githubId: '109', number: 109, title: 'Fix PR' }
    });
    const fix = await createTask(prisma, f.project.id, { pullRequestId: pr.id });
    d = await f.correction(d, { taskId: fix.id });
    const candidates = await executions.references(
      f.tc.id,
      { limit: 20, search: '', retestDefectId: d.id },
      f.context
    );
    expect(candidates.items[0]).toMatchObject({ id: pr.id, relatedTaskIds: [fix.id] });
    expect(candidates.items.some((r) => r.id === f.pr.id)).toBe(true);
  });
  it('rolls back contextual execution when defect history cannot be committed', async () => {
    const f = await fixture(),
      d = await f.ready(),
      repo = caseRepoFactory();
    const base = repo.transaction.bind(repo);
    repo.transaction = (work) =>
      base((tx) => {
        tx.defects.history = () => {
          throw new Error('history unavailable');
        };
        return work(tx);
      });
    await expect(
      executionFactory({ cases: repo }).record(
        f.tc.id,
        {
          ...f.payload,
          retest: { defectId: d.id, correctionCycle: 1, expectedRevision: d.revision }
        },
        null,
        f.context
      )
    ).rejects.toThrow('history unavailable');
    expect(await prisma.defectRetest.count()).toBe(0);
    expect(await prisma.testExecution.count()).toBe(1);
    expect((await defects.read(d.id, f.context)).status).toBe('AGUARDANDO_RETESTE');
  });
  it.each(['PASS', 'FAIL', 'BLOCKED'])(
    'serializes concurrent %s retests using a shared starting revision',
    async (result) => {
      const f = await fixture(),
        d = await f.ready();
      const outcomes = await Promise.allSettled([f.retest(d, result), f.retest(d, result)]);
      expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.find((r) => r.status === 'rejected').reason).toMatchObject({
        code: 'DEFECT_CONFLICT'
      });
      expect(await prisma.defectRetest.count()).toBe(1);
      expect(await prisma.testExecution.count()).toBe(2);
    }
  );
  it('serializes correction creates with a shared revision without leaving an orphan task', async () => {
    const f = await fixture(),
      d = await f.create();
    const before = await prisma.task.count();
    const outcomes = await Promise.allSettled([
      f.correction(d, { task: { title: 'A' } }),
      f.correction(d, { task: { title: 'B' } })
    ]);
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.task.count()).toBe(before + 1);
  });
  it('serializes multiple task movements and task/retest races under the same project lock', async () => {
    const f = await fixture();
    let d = await f.create();
    d = await f.correction(d, { task: { title: 'Fix A' } });
    d = await f.correction(d, { task: { title: 'Fix B' } });
    const ids = d.correctionCycles[0].tasks.map((t) => t.id);
    await Promise.all(ids.map((id) => f.move(id, 'CONCLUIDO')));
    d = await defects.read(d.id, f.context);
    expect(d.status).toBe('AGUARDANDO_RETESTE');
    // Hold Project, wait until both transaction callbacks are actually running, then release.
    // No sleep, timing assumption or synthetic status write controls the outcome.
    let release, held, arrived;
    const releasePromise = new Promise((r) => (release = r)),
      heldPromise = new Promise((r) => (held = r)),
      arrivedPromise = new Promise((r) => (arrived = r));
    const original = prisma.$transaction.bind(prisma);
    const blocker = original(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Project WHERE id = ${f.project.id} FOR UPDATE`;
      held();
      await releasePromise;
    });
    await heldPromise;
    let starts = 0;
    const spy = vi.spyOn(prisma, '$transaction').mockImplementation((work, options) =>
      original(
        typeof work === 'function'
          ? async (tx) => {
              starts++;
              if (starts === 2) arrived();
              return work(tx);
            }
          : work,
        options
      )
    );
    const outcomesPromise = Promise.allSettled([f.retest(d), f.move(ids[0], 'A_FAZER')]);
    await arrivedPromise;
    release();
    await blocker;
    const outcomes = await outcomesPromise;
    spy.mockRestore();
    expect(outcomes[1].status).toBe('fulfilled');
    const after = await defects.read(d.id, f.context);
    if (outcomes[0].status === 'fulfilled') {
      expect(after.status).toBe('VALIDADO');
      expect(await prisma.defectRetest.count()).toBe(1);
    } else {
      expect(outcomes[0].reason).toMatchObject({ code: 'DEFECT_CONFLICT' });
      expect(after.status).toBe('EM_CORRECAO');
      expect(await prisma.defectRetest.count()).toBe(0);
    }
    expect(
      (await defects.list(f.project.id, { ...page, status: after.status }, f.context)).total
    ).toBe(1);
  });
  it('reconciles one shared correction across multiple defects without conflating roles', async () => {
    const f = await fixture();
    let a = await f.create(),
      b = await f.create({ title: 'Another defect' });
    a = await f.correction(a, { task: { title: 'Shared correction' } });
    const taskId = a.correctionCycles[0].tasks[0].id;
    b = await f.correction(b, { taskId });
    expect((await tasks.getTaskById(taskId)).correctionDefectCount).toBe(2);
    await f.move(taskId, 'CONCLUIDO');
    expect((await defects.read(a.id, f.context)).status).toBe('AGUARDANDO_RETESTE');
    expect((await defects.read(b.id, f.context)).status).toBe('AGUARDANDO_RETESTE');
    await defects.delete(a.id, f.context);
    await f.move(taskId, 'A_FAZER');
    expect((await defects.read(b.id, f.context)).status).toBe('ABERTO');
    expect((await tasks.getTaskById(taskId)).correctionDefectCount).toBe(2);
  });
  it('rejects foreign detection/correction/responsible and a retest through another case', async () => {
    const f = await fixture();
    await prisma.projectMembership.create({
      data: { projectId: f.other.id, userId: f.user.id, role: 'MEMBER' }
    });
    const requirement = await createRequirement(prisma, f.other.id),
      foreignTask = await createTask(prisma, f.other.id);
    const foreignCase = await cases.create(
      f.other.id,
      { ...f.caseInput, requirementId: requirement.id, taskIds: [] },
      f.context
    );
    const pr = await prisma.pullRequest.create({
      data: { projectId: f.other.id, githubId: 'foreign', number: 1, title: 'Foreign PR' }
    });
    const foreignExecution = await executions.record(
      foreignCase.id,
      { ...f.payload, testedReference: { type: 'PULL_REQUEST', id: pr.id } },
      null,
      f.context
    );
    await expect(
      f.create({ detectedExecutionStepId: foreignExecution.steps[0].id })
    ).rejects.toMatchObject({ statusCode: 404 });
    const outsider = await prisma.user.create({
      data: { name: 'Outside', username: 'outside', email: 'outside@example.invalid' }
    });
    await expect(f.create({ responsibleUserId: outsider.id })).rejects.toMatchObject({
      statusCode: 404
    });
    const d = await f.ready();
    await expect(f.correction(d, { taskId: foreignTask.id })).rejects.toMatchObject({
      statusCode: 404
    });
    await expect(
      f.correction(d, { task: { title: 'Foreign requirement', requirementId: requirement.id } })
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      f.correction(d, { task: { title: 'Foreign responsible', responsibleUserId: outsider.id } })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(
      (await defects.list(f.project.id, { ...page, search: 'DEF-' + '9'.repeat(100) }, f.context))
        .total
    ).toBe(0);
    expect(
      (
        await defects.candidates(
          f.project.id,
          { ...page, search: 'EXEC-' + '9'.repeat(100) },
          f.context
        )
      ).total
    ).toBe(0);
    const another = await cases.create(f.project.id, f.caseInput, f.context);
    await expect(
      executions.record(
        another.id,
        {
          ...f.payload,
          retest: { defectId: d.id, correctionCycle: 1, expectedRevision: d.revision }
        },
        null,
        f.context
      )
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(await prisma.defectRetest.count()).toBe(0);
  });
  it('enforces FK, uniqueness and role/cycle checks at storage boundary', async () => {
    const f = await fixture(),
      d = await f.create();
    await expect(
      prisma.defectTask.create({
        data: { defectId: d.id, taskId: f.origin.id, relationType: 'ORIGIN', correctionCycle: 1 }
      })
    ).rejects.toBeDefined();
    await expect(
      prisma.defectTask.create({
        data: { defectId: d.id, taskId: f.origin.id, relationType: 'ORIGIN', correctionCycle: 0 }
      })
    ).rejects.toBeDefined();
    await expect(
      prisma.defect.update({ where: { id: d.id }, data: { currentCorrectionCycle: 0 } })
    ).rejects.toBeDefined();
    await expect(
      prisma.testExecutionStep.delete({ where: { id: f.execution.steps[0].id } })
    ).rejects.toBeDefined();
    expect(await prisma.defect.count()).toBe(1);
  });
  it('serializes definition edits and ordinary execution with contextual retests', async () => {
    const f = await fixture(),
      d = await f.ready();
    const outcomes = await Promise.allSettled([
      f.retest(d),
      cases.update(f.tc.id, { expectedVersion: 1, title: 'Next definition' }, f.context)
    ]);
    expect(outcomes[1].status).toBe('fulfilled');
    if (outcomes[0].status === 'fulfilled')
      expect((await defects.read(d.id, f.context)).status).toBe('VALIDADO');
    else expect(outcomes[0].reason).toMatchObject({ code: 'TEST_CASE_VERSION_CONFLICT' });
    const current = await defects.read(d.id, f.context);
    if (current.status === 'AGUARDANDO_RETESTE') {
      await Promise.all([
        f.retest(current, 'PASS', { testCaseVersion: 2 }),
        executions.record(f.tc.id, { ...f.payload, testCaseVersion: 2 }, null, f.context)
      ]);
    }
    expect((await defects.read(d.id, f.context)).status).toBe('VALIDADO');
    expect(await prisma.defectRetest.count()).toBe(1);
  });
});

describe('S1-08 frontend read projections', () => {
  it('returns current-cycle counts and historical detection identity without raw links', async () => {
    const f = await fixture();
    let d = await f.create();
    d = await f.correction(d, { task: { title: 'Read projection correction' } });
    const listed = await defects.list(f.project.id, page, f.context);
    expect(listed.items[0]).toMatchObject({
      id: d.id,
      correctionTaskCount: 1,
      detectionSummary: {
        testCaseId: d.detection.testCase.id,
        executionId: d.detection.execution.id,
        stepPosition: 1
      }
    });
    expect(listed.items[0]).not.toHaveProperty('taskLinks');
    expect(listed.items[0]).not.toHaveProperty('detectedStep');
  });
  it('exposes persisted active defects on execution steps and omits soft-deleted ones', async () => {
    const f = await fixture();
    const d = await f.create();
    const execution = await executions.detail(d.detection.execution.id, f.context);
    expect(execution.steps[0].detectedDefects).toEqual([
      { id: d.id, title: d.title, severity: d.severity, status: d.status }
    ]);
    await defects.delete(d.id, f.context);
    expect(
      (await executions.detail(d.detection.execution.id, f.context)).steps[0].detectedDefects
    ).toEqual([]);
  });
});
