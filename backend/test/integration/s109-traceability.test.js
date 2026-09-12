import { writeFileSync } from 'node:fs';
import { beforeAll, afterEach, afterAll, describe, it, expect, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  configureTestDatabaseEnvironment,
  deployTestMigrations,
  cleanTestDatabase
} from '../helpers/test-database.js';
import {
  createProject,
  createRequirement,
  createTask,
  createCommit,
  createIssue
} from '../fixtures/factories.js';
let prisma,
  cases,
  executions,
  defects,
  kanban,
  tasks,
  taskLinks,
  requirements,
  requirementStatus,
  taskRequirement,
  load,
  reconcile,
  reconcileProject,
  transaction;
beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ testCaseService: cases } =
    await import('../../src/modules/testCases/services/test-case.service.js'));
  ({ testExecutionService: executions } =
    await import('../../src/modules/testCases/services/test-execution.service.js'));
  ({ defectService: defects } = await import('../../src/modules/defects/defect.service.js'));
  ({ taskKanbanService: kanban } =
    await import('../../src/modules/tasks/services/task-kanban.service.js'));
  ({ taskCrudService: tasks } =
    await import('../../src/modules/tasks/services/task-crud.service.js'));
  ({ taskLinkRepository: taskLinks } =
    await import('../../src/modules/tasks/repositories/task-link.repository.js'));
  ({ requirementRepository: requirements } =
    await import('../../src/modules/requirements/requirement.repository.js'));
  ({ requirementStatusService: requirementStatus } =
    await import('../../src/modules/requirements/services/requirement-status.service.js'));
  ({ taskRequirementService: taskRequirement } =
    await import('../../src/modules/tasks/services/task-requirement.service.js'));
  ({ loadRequirementProjections: load } =
    await import('../../src/modules/traceability/requirement-projection.repository.js'));
  ({
    reconcileRequirements: reconcile,
    reconcileProject,
    traceabilityTransaction: transaction
  } = await import('../../src/modules/traceability/requirement-reconciliation.repository.js'));
  await cleanTestDatabase(prisma);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanTestDatabase(prisma);
});
afterAll(async () => prisma.$disconnect());
async function fixture() {
  const project = await createProject(prisma);
  const requirement = await createRequirement(prisma, project.id);
  const user = await prisma.user.create({
    data: { name: 'S109 executor', username: 's109', email: 's109@example.invalid' }
  });
  await prisma.projectMembership.create({
    data: { projectId: project.id, userId: user.id, role: 'MEMBER' }
  });
  const pr = await prisma.pullRequest.create({
    data: { projectId: project.id, githubId: '109', number: 109, title: 'S109 PR' }
  });
  const context = { actorUserId: user.id };
  const caseInput = {
    title: 'S109 case',
    description: 'Description',
    preconditions: 'Ready',
    expectedResult: 'Works',
    responsibleUserId: user.id,
    requirementId: requirement.id,
    taskIds: [],
    steps: [{ action: 'Open', expectedResult: 'Visible' }]
  };
  const createCase = (patch = {}) => cases.create(project.id, { ...caseInput, ...patch }, context);
  const execute = (tc, result = 'PASS', retest) =>
    executions.record(
      tc.id,
      {
        testCaseVersion: tc.currentVersion,
        environment: 'LOCAL',
        testedReference: { type: 'PULL_REQUEST', id: pr.id },
        steps: tc.steps.map((s) => ({
          position: s.position,
          result,
          observedResult: result === 'PASS' ? null : 'Observed mismatch'
        })),
        ...(retest
          ? {
              retest: {
                defectId: retest.id,
                expectedRevision: retest.revision,
                correctionCycle: retest.currentCorrectionCycle
              }
            }
          : {})
      },
      null,
      context
    );
  const createDefect = (execution, patch = {}) =>
    defects.create(
      project.id,
      {
        title: 'Mismatch',
        description: 'Failure',
        severity: 'ALTA',
        responsibleUserId: user.id,
        requirementId: requirement.id,
        detectedExecutionStepId: execution.steps[0].id,
        originTaskIds: [],
        ...patch
      },
      context
    );
  const move = (id, toStatus) => kanban.moveTask(id, { toStatus }, { actor: user });
  const current = async (id = requirement.id) => (await load(prisma, project.id, [id]))[0];
  const state = async (expected, id = requirement.id) => {
    const projection = await current(id);
    expect(projection.situation).toBe(expected);
    expect((await prisma.requirement.findUnique({ where: { id } })).status).toBe(
      projection.requirement.status
    );
    expect(
      (await prisma.requirementTraceabilityState.findUnique({ where: { requirementId: id } }))
        .currentSituation
    ).toBe(expected);
  };
  const history = () =>
    prisma.requirementTraceabilityHistoryEntry.findMany({
      where: { requirementId: requirement.id },
      orderBy: { id: 'asc' }
    });
  const ready = async () => {
    const t = await tasks.createTask(
      project.id,
      { title: 'Implement', requirementId: requirement.id },
      context
    );
    await taskLinks.setPullRequest(t.id, pr.id);
    await move(t.id, 'CONCLUIDO');
    return t;
  };
  return {
    project,
    requirement,
    user,
    pr,
    context,
    createCase,
    execute,
    createDefect,
    move,
    current,
    state,
    history,
    ready
  };
}

describe('S1-09 persisted projection and transitions', () => {
  it('initializes only a truthful baseline; dry-run and repeated reconciliation write nothing', async () => {
    const f = await fixture();
    await createTask(prisma, f.project.id, {
      requirementId: f.requirement.id,
      status: 'EM_ANDAMENTO'
    });
    const dry = await reconcileProject(f.project.id);
    expect(dry).toMatchObject({
      requirements: 1,
      withoutState: 1,
      changes: [
        { fromSituation: null, toSituation: 'EM_DESENVOLVIMENTO', reason: 'BASELINE_INITIALIZED' }
      ]
    });
    expect(await prisma.requirementTraceabilityState.count()).toBe(0);
    expect(await f.history()).toEqual([]);
    await reconcileProject(f.project.id, { dryRun: false });
    const before = await prisma.requirementTraceabilityState.findMany();
    expect((await reconcileProject(f.project.id, { dryRun: false })).changes).toEqual([]);
    expect(await prisma.requirementTraceabilityState.findMany()).toEqual(before);
    expect(await f.history()).toHaveLength(1);
  });
  it('records the full canonical lifecycle and regression without rewriting the conclusion', async () => {
    const f = await fixture();
    await reconcileProject(f.project.id, { dryRun: false });
    const task = await tasks.createTask(
      f.project.id,
      { title: 'Work', requirementId: f.requirement.id },
      f.context
    );
    await f.state('PLANEJADO');
    await f.move(task.id, 'EM_ANDAMENTO');
    await f.state('EM_DESENVOLVIMENTO');
    await taskLinks.setPullRequest(task.id, f.pr.id);
    await f.move(task.id, 'CONCLUIDO');
    await f.state('IMPLEMENTADO');
    const tc = await f.createCase();
    const second = await f.createCase({ title: 'Second case' });
    await f.state('AGUARDANDO_VALIDACAO');
    await f.execute(second);
    await f.state('AGUARDANDO_VALIDACAO');
    const failure = await f.execute(tc, 'FAIL');
    await f.state('COM_FALHA');
    let d = await f.createDefect(failure);
    d = await defects.correction(
      d.id,
      {
        expectedRevision: d.revision,
        correctionCycle: 1,
        task: { title: 'Correction', requirementId: null }
      },
      f.context
    );
    const correction = d.correctionCycles[0].tasks[0];
    await f.move(correction.id, 'EM_ANDAMENTO');
    await f.state('EM_CORRECAO');
    await f.move(correction.id, 'CONCLUIDO');
    await f.state('AGUARDANDO_RETESTE');
    d = await defects.read(d.id, f.context);
    await f.execute(tc, 'BLOCKED', d);
    await f.state('AGUARDANDO_RETESTE');
    d = await defects.read(d.id, f.context);
    await f.execute(tc, 'PASS', d);
    await expect(requirementStatus.confirmCompletion(f.requirement.id)).rejects.toMatchObject({
      statusCode: 409
    });
    await f.state('CONCLUIDO');
    const completed = (await f.history()).at(-1);
    await cases.update(tc.id, { expectedVersion: 1, title: 'Version 2' }, f.context);
    await f.state('AGUARDANDO_VALIDACAO');
    expect(
      await prisma.requirementTraceabilityHistoryEntry.findUnique({ where: { id: completed.id } })
    ).toEqual(completed);
    const history = await f.history();
    expect(history.map((row) => row.toSituation)).toEqual([
      'SEM_RASTREABILIDADE',
      'PLANEJADO',
      'EM_DESENVOLVIMENTO',
      'IMPLEMENTADO',
      'AGUARDANDO_VALIDACAO',
      'COM_FALHA',
      'EM_CORRECAO',
      'AGUARDANDO_RETESTE',
      'CONCLUIDO',
      'AGUARDANDO_VALIDACAO'
    ]);
    expect(history.at(-1).reason).toBe('TESTCASE_UPDATED');
    expect(history.slice(1).every((row, i) => row.fromSituation === history[i].toSituation)).toBe(
      true
    );
  });
  it('reconciles both sides of task moves, shared cases and physical deletion', async () => {
    const f = await fixture();
    const task = await f.ready();
    const b = await requirements.createRequirement(f.project.id, { title: 'B' });
    await createTask(prisma, f.project.id, {
      requirementId: b.id,
      status: 'CONCLUIDO',
      pullRequestId: f.pr.id
    });
    const tc = await f.createCase({ requirementId: null, taskIds: [task.id] });
    await f.execute(tc);
    await f.state('CONCLUIDO');
    await taskRequirement.linkRequirement(task.id, { requirementId: b.id }, f.context);
    await f.state('SEM_RASTREABILIDADE');
    await f.state('CONCLUIDO', b.id);
    expect((await load(prisma, f.project.id, [b.id]))[0].validation.testCasesTotal).toBe(1);
    await tasks.deleteTask(task.id, f.context);
    await f.state('IMPLEMENTADO', b.id);
    expect(await prisma.testCaseVersion.count({ where: { testCaseId: tc.id } })).toBe(1);
  });
  it('reconciles test relinks, inactive/deleted cases and requirement physical deletion while preserving history', async () => {
    const f = await fixture();
    await f.ready();
    const b = await requirements.createRequirement(f.project.id, { title: 'B' });
    await createTask(prisma, f.project.id, {
      requirementId: b.id,
      status: 'CONCLUIDO',
      pullRequestId: f.pr.id
    });
    let tc = await f.createCase();
    await f.execute(tc);
    await f.state('CONCLUIDO');
    tc = await cases.update(tc.id, { expectedVersion: 1, requirementId: b.id }, f.context);
    await f.state('IMPLEMENTADO');
    await f.state('AGUARDANDO_VALIDACAO', b.id);
    await cases.update(tc.id, { expectedVersion: tc.currentVersion, status: 'INATIVO' }, f.context);
    await f.state('IMPLEMENTADO', b.id);
    await cases.update(tc.id, { expectedVersion: tc.currentVersion, status: 'ATIVO' }, f.context);
    await f.state('AGUARDANDO_VALIDACAO', b.id);
    await cases.delete(tc.id, f.context);
    await f.state('IMPLEMENTADO', b.id);
    const history = await f.history();
    await requirements.deleteRequirement(f.requirement.id);
    expect(await f.history()).toEqual(history);
    expect(
      await prisma.requirementTraceabilityState.findUnique({
        where: { requirementId: f.requirement.id }
      })
    ).toBeNull();
  });
  it('checks every failed step, deleted defects and ordinary PASS independently of retest', async () => {
    const f = await fixture();
    await f.ready();
    const tc = await f.createCase({
      steps: [
        { action: 'A', expectedResult: 'A' },
        { action: 'B', expectedResult: 'B' }
      ]
    });
    const failure = await f.execute(tc, 'FAIL');
    let d = await f.createDefect(failure);
    d = await defects.correction(
      d.id,
      {
        expectedRevision: d.revision,
        correctionCycle: 1,
        task: { title: 'Fix', requirementId: null }
      },
      f.context
    );
    await f.move(d.correctionCycles[0].tasks[0].id, 'EM_ANDAMENTO');
    await f.state('COM_FALHA');
    const second = await f.createDefect(failure, { detectedExecutionStepId: failure.steps[1].id });
    await defects.correction(
      second.id,
      {
        expectedRevision: second.revision,
        correctionCycle: 1,
        taskId: d.correctionCycles[0].tasks[0].id
      },
      f.context
    );
    await f.state('EM_CORRECAO');
    await defects.delete(second.id, f.context);
    await f.state('COM_FALHA');
    await f.execute(tc);
    await f.state('EM_CORRECAO');
    expect((await defects.read(d.id, f.context)).status).toBe('EM_CORRECAO');
  });
  it('uses direct and ORIGIN defect paths; correction-only path never counts as origin; relinks reconcile former and new requirements', async () => {
    const f = await fixture();
    const origin = await f.ready();
    const b = await requirements.createRequirement(f.project.id, { title: 'B' });
    const correction = await createTask(prisma, f.project.id, {
      requirementId: b.id,
      status: 'CONCLUIDO',
      pullRequestId: f.pr.id
    });
    const tc = await f.createCase();
    const failure = await f.execute(tc, 'FAIL');
    let d = await f.createDefect(failure, { originTaskIds: [origin.id] });
    expect((await f.current()).defects.total).toBe(1);
    d = await defects.correction(
      d.id,
      { expectedRevision: d.revision, correctionCycle: 1, taskId: correction.id },
      f.context
    );
    expect((await f.current(b.id)).defects.total).toBe(0);
    await defects.update(
      d.id,
      { expectedRevision: d.revision, requirementId: b.id, originTaskIds: [] },
      f.context
    );
    await f.state('EM_VALIDACAO');
    await f.state('AGUARDANDO_RETESTE', b.id);
    await f.execute(tc, 'FAIL');
    await f.state('COM_FALHA');
  });
  it('retest FAIL reopens a new cycle atomically and never leaves an intermediate validated history', async () => {
    const f = await fixture();
    await f.ready();
    const tc = await f.createCase();
    let d = await f.createDefect(await f.execute(tc, 'FAIL'));
    const correction = await createTask(prisma, f.project.id, { status: 'CONCLUIDO' });
    d = await defects.correction(
      d.id,
      { expectedRevision: d.revision, correctionCycle: 1, taskId: correction.id },
      f.context
    );
    await f.state('AGUARDANDO_RETESTE');
    await f.execute(tc, 'FAIL', d);
    await f.state('COM_FALHA');
    expect((await defects.read(d.id, f.context)).currentCorrectionCycle).toBe(2);
    expect((await f.history()).at(-1)).toMatchObject({
      fromSituation: 'AGUARDANDO_RETESTE',
      toSituation: 'COM_FALHA',
      reason: 'DEFECT_RETEST_RECORDED'
    });
  });
  it('artifact attach/detach, issue-only links and replacement of requirement tasks reconcile without fabricated transitions', async () => {
    const f = await fixture();
    const t = await f.ready();
    await taskLinks.setPullRequest(t.id, null);
    await f.state('EM_DESENVOLVIMENTO');
    const issue = await createIssue(prisma, f.project.id);
    await taskLinks.createIssue(t.id, issue.id);
    await f.state('EM_DESENVOLVIMENTO');
    const commit = await createCommit(prisma, f.project.id);
    await taskLinks.createCommit(t.id, commit.id);
    await f.state('IMPLEMENTADO');
    await taskLinks.deleteCommit(t.id, commit.id);
    await f.state('EM_DESENVOLVIMENTO');
    await taskLinks.deleteIssue(t.id, issue.id);
    await requirements.replaceRequirementTasks({
      requirementId: f.requirement.id,
      taskIds: [],
      relatedStatusUpdates: [],
      auditEvents: [],
      status: 'CADASTRADO'
    });
    await f.state('SEM_RASTREABILIDADE');
    await tasks.updateTask(
      t.id,
      { title: 'Reassigned', requirementId: f.requirement.id },
      f.context
    );
    await f.state('EM_DESENVOLVIMENTO');
    await taskRequirement.unlinkRequirement(t.id, f.context);
    await f.state('SEM_RASTREABILIDADE');
  });
  it('appends a policy reconciliation transition once and preserves all previous history', async () => {
    const f = await fixture();
    await f.ready();
    const tc = await f.createCase();
    const failed = await f.execute(tc, 'FAIL');
    await f.createDefect(failed);
    await prisma.task.updateMany({
      where: { projectId: f.project.id },
      data: { status: 'EM_ANDAMENTO' }
    });
    // State captured by the former policy; old entries remain immutable.
    await prisma.requirementTraceabilityState.update({
      where: { requirementId: f.requirement.id },
      data: { currentSituation: 'EM_DESENVOLVIMENTO' }
    });
    const before = await f.history();
    const options = { dryRun: false, reason: 'TRACEABILITY_POLICY_RECONCILIATION' };
    const result = await reconcileProject(f.project.id, options);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      fromSituation: 'EM_DESENVOLVIMENTO',
      toSituation: 'COM_FALHA',
      reason: options.reason,
      metadataJson: { rulesVersion: 3 }
    });
    expect((await f.history()).slice(0, -1)).toEqual(before);
    expect((await reconcileProject(f.project.id, options)).changes).toHaveLength(0);
    expect(await f.history()).toHaveLength(before.length + 1);
  });
  it('rolls canonical mutation, state and history back together on history failure', async () => {
    const f = await fixture();
    await reconcileProject(f.project.id, { dryRun: false });
    const history = await f.history();
    const guarded = prisma.$extends({
      query: {
        requirementTraceabilityHistoryEntry: {
          create() {
            throw new Error('controlled history failure');
          }
        }
      }
    });
    await expect(
      transaction(
        { projectId: f.project.id, requirementIds: [f.requirement.id] },
        (tx) =>
          tx.task.create({
            data: {
              projectId: f.project.id,
              requirementId: f.requirement.id,
              title: 'Must roll back'
            }
          }),
        guarded
      )
    ).rejects.toThrow('controlled history failure');
    expect(await prisma.task.count()).toBe(0);
    await f.state('SEM_RASTREABILIDADE');
    expect(await f.history()).toEqual(history);
  });
  it('reopens automatic conclusion for new tasks, cases, versions and failures, then concludes again', async () => {
    const f = await fixture();
    await f.ready();
    const tc = await f.createCase();
    await f.execute(tc);
    await f.state('CONCLUIDO');
    const original = await f.history();
    const added = await tasks.createTask(
      f.project.id,
      { title: 'New work', requirementId: f.requirement.id },
      f.context
    );
    await f.state('EM_DESENVOLVIMENTO');
    await f.move(added.id, 'EM_ANDAMENTO');
    await f.state('EM_DESENVOLVIMENTO');
    await f.move(added.id, 'CONCLUIDO');
    await f.state('CONCLUIDO');
    const second = await f.createCase({ title: 'New test' });
    await f.state('AGUARDANDO_VALIDACAO');
    await f.execute(second);
    await f.state('CONCLUIDO');
    const edited = await cases.update(
      second.id,
      { expectedVersion: 1, title: 'New version' },
      f.context
    );
    await f.state('AGUARDANDO_VALIDACAO');
    await f.execute(edited);
    await f.state('CONCLUIDO');
    const failure = await f.execute(tc, 'FAIL');
    await f.state('COM_FALHA');
    await f.execute(tc, 'PASS');
    await f.state('CONCLUIDO');
    await f.createDefect(failure);
    await f.state('COM_FALHA');
    expect((await f.history()).slice(0, original.length)).toEqual(original);
  });
  it('repairs only legacy macro status without fabricating another situation transition', async () => {
    const f = await fixture();
    await f.ready();
    const tc = await f.createCase();
    await f.execute(tc);
    const before = await f.history();
    await prisma.requirement.update({
      where: { id: f.requirement.id },
      data: { status: 'APROVADO' }
    });
    const preview = await reconcileProject(f.project.id);
    expect(preview.statusChanges).toEqual([
      { requirementId: f.requirement.id, fromStatus: 'APROVADO', toStatus: 'CONCLUIDO' }
    ]);
    expect((await prisma.requirement.findUnique({ where: { id: f.requirement.id } })).status).toBe(
      'APROVADO'
    );
    await reconcileProject(f.project.id, { dryRun: false });
    await f.state('CONCLUIDO');
    expect(await f.history()).toEqual(before);
    expect((await reconcileProject(f.project.id, { dryRun: false })).statusChanges).toEqual([]);
  });
  it('serializes concurrent reconciliations using a real project lock, including first initialization', async () => {
    const f = await fixture();
    const scope = { projectId: f.project.id, requirementIds: [f.requirement.id] };
    const locked = Promise.withResolvers(),
      release = Promise.withResolvers(),
      attempted = Promise.withResolvers();
    const first = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM Project WHERE id=${f.project.id} FOR UPDATE`;
        await tx.task.create({
          data: { projectId: f.project.id, requirementId: f.requirement.id, title: 'Concurrent' }
        });
        locked.resolve();
        await release.promise;
        return reconcile(tx, scope);
      },
      { isolationLevel: 'ReadCommitted' }
    );
    await locked.promise;
    const second = prisma.$transaction(
      async (tx) => {
        attempted.resolve();
        return reconcile(tx, scope);
      },
      { isolationLevel: 'ReadCommitted' }
    );
    await attempted.promise;
    release.resolve();
    const results = await Promise.all([first, second]);
    expect(results.map((r) => r.changes.length).sort()).toEqual([0, 1]);
    await f.state('PLANEJADO');
    expect(await f.history()).toHaveLength(1);
    await prisma.task.updateMany({ data: { status: 'CONCLUIDO', pullRequestId: f.pr.id } });
    await Promise.all([
      reconcileProject(f.project.id, { dryRun: false }),
      reconcileProject(f.project.id, { dryRun: false })
    ]);
    await f.state('IMPLEMENTADO');
    expect(await f.history()).toHaveLength(2);
  });
  it('has constant query count for 1 versus 20 requirements with tests, executions and defects', async () => {
    const f = await fixture();
    await f.ready();
    const tc = await f.createCase();
    await f.createDefect(await f.execute(tc, 'FAIL'));
    for (let i = 0; i < 19; i++) {
      const r = await createRequirement(prisma, f.project.id);
      await createTask(prisma, f.project.id, {
        requirementId: r.id,
        status: 'CONCLUIDO',
        pullRequestId: f.pr.id
      });
      const c = await f.createCase({ requirementId: r.id });
      await f.createDefect(await f.execute(c, 'FAIL'), { requirementId: r.id });
    }
    const measured = new PrismaClient({
      datasourceUrl: process.env.DATABASE_URL,
      log: [{ emit: 'event', level: 'query' }]
    });
    let count = 0;
    measured.$on('query', () => count++);
    try {
      await load(measured, f.project.id, [f.requirement.id]);
      const single = count;
      count = 0;
      const all = await load(measured, f.project.id);
      const batch = count;
      expect(all).toHaveLength(20);
      expect(batch).toBe(single);
      expect(batch).toBeLessThanOrEqual(16);
      process.stdout.write(`S109 query count: 1 requirement=${single}; 20 requirements=${batch}\n`);
    } finally {
      await measured.$disconnect();
    }
  });
});

describe('S1-09 expanded graph read model', () => {
  async function graph(f, page = 1, limit = 100) {
    const { readExpandedGraph } =
      await import('../../src/modules/traceability/expanded-graph.repository.js');
    const { formatExpandedGraph } =
      await import('../../src/modules/traceability/expanded-graph.mapper.js');
    return formatExpandedGraph(await readExpandedGraph(f.project.id, f.requirement.id), {
      page,
      limit
    });
  }
  it('deduplicates direct/via-task cases, shared correction, detection and FAIL/PASS retests across cycles', async () => {
    const f = await fixture(),
      origin = await f.ready();
    const tc = await f.createCase({ taskIds: [origin.id] });
    const failure = await f.execute(tc, 'FAIL');
    let d = await f.createDefect(failure, { originTaskIds: [origin.id] });
    const other = await f.createDefect(failure, {
      title: 'Second defect',
      originTaskIds: [origin.id]
    });
    const correction = await createTask(prisma, f.project.id, {
      requirementId: f.requirement.id,
      status: 'CONCLUIDO',
      pullRequestId: f.pr.id
    });
    d = await defects.correction(
      d.id,
      { expectedRevision: d.revision, correctionCycle: 1, taskId: correction.id },
      f.context
    );
    await defects.correction(
      other.id,
      { expectedRevision: other.revision, correctionCycle: 1, taskId: correction.id },
      f.context
    );
    const failedRetest = await f.execute(tc, 'FAIL', d);
    d = await defects.read(d.id, f.context);
    d = await defects.correction(
      d.id,
      { expectedRevision: d.revision, correctionCycle: 2, taskId: correction.id },
      f.context
    );
    const passedRetest = await f.execute(tc, 'PASS', d);
    const before = await prisma.requirementTraceabilityHistoryEntry.count();
    const g = await graph(f);
    const find = (type) => g.nodes.filter((n) => n.type === type);
    expect(new Set(g.nodes.map((n) => n.id)).size).toBe(g.nodes.length);
    expect(find('TEST_CASE')).toHaveLength(1);
    expect(find('TASK')).toHaveLength(2);
    expect(find('DEFECT')).toHaveLength(2);
    expect(find('TASK').find((n) => n.entityId === origin.id).data.correctionDefects).toEqual([]);
    expect(
      find('TASK').find((n) => n.entityId === correction.id).data.correctionDefects
    ).toHaveLength(3);
    expect(find('TEST_EXECUTION').find((n) => n.entityId === failedRetest.id).data).toMatchObject({
      result: 'FAIL',
      retests: [{ defectId: d.id, correctionCycle: 1 }]
    });
    expect(find('TEST_EXECUTION').find((n) => n.entityId === passedRetest.id).data.result).toBe(
      'PASS'
    );
    expect(g.edges.filter((e) => e.relationType === 'DETECTOU')).toHaveLength(2);
    expect(
      g.edges.filter((e) => e.relationType === 'DETECTOU').every((e) => e.failedStep === 1)
    ).toBe(true);
    expect(g.edges.filter((e) => e.relationType === 'RETESTADO_POR')).toHaveLength(2);
    expect(g.edges.filter((e) => e.target === `testCase:${tc.id}`)).toHaveLength(2);
    expect(await prisma.requirementTraceabilityHistoryEntry.count()).toBe(before);
    const page1 = await graph(f, 1, 3),
      page2 = await graph(f, 2, 3);
    expect(page1.nodes).toHaveLength(3);
    expect(page2.nodes.some((n) => page1.nodes.some((p) => p.id === n.id))).toBe(false);
  });
  it('keeps task-only case edges truthful, current-version latest and deleted case history separate', async () => {
    const f = await fixture(),
      task = await f.ready();
    const tc = await f.createCase({ requirementId: null, taskIds: [task.id] });
    const failed = await f.execute(tc, 'FAIL');
    await f.createDefect(failed);
    await prisma.testCase.update({ where: { id: tc.id }, data: { currentVersion: 2 } });
    let g = await graph(f);
    expect(g.nodes.find((n) => n.type === 'TEST_CASE').data.latestExecution).toBeNull();
    expect(
      g.edges.some(
        (e) => e.source === `requirement:${f.requirement.id}` && e.target === `testCase:${tc.id}`
      )
    ).toBe(false);
    await prisma.testCase.update({ where: { id: tc.id }, data: { deletedAt: new Date() } });
    g = await graph(f);
    expect(g.nodes.some((n) => n.type === 'TEST_CASE')).toBe(false);
    expect(g.nodes.some((n) => n.id === `execution:${failed.id}`)).toBe(true);
    expect(
      g.edges.every(
        (e) => g.nodes.some((n) => n.id === e.source) && g.nodes.some((n) => n.id === e.target)
      )
    ).toBe(true);
  });
  it('projects a representative large persisted fixture with bounded query count and paged payload', async () => {
    const f = await fixture();
    const taskRows = [];
    for (let i = 0; i < 12; i++)
      taskRows.push(
        await createTask(prisma, f.project.id, {
          requirementId: f.requirement.id,
          pullRequestId: f.pr.id
        })
      );
    for (let i = 1; i < 5; i++) {
      const pr = await prisma.pullRequest.create({
        data: {
          projectId: f.project.id,
          githubId: `graph-${i}`,
          number: 200 + i,
          title: `QA graph PR ${i}`
        }
      });
      await prisma.task.update({ where: { id: taskRows[i].id }, data: { pullRequestId: pr.id } });
    }
    for (let i = 0; i < 20; i++) {
      const commit = await createCommit(prisma, f.project.id);
      await prisma.taskCommit.create({
        data: { taskId: taskRows[i % 12].id, commitId: commit.id }
      });
    }
    for (let i = 0; i < 4; i++) {
      const issue = await createIssue(prisma, f.project.id);
      await prisma.taskIssue.create({ data: { taskId: taskRows[i].id, issueId: issue.id } });
    }
    for (let i = 0; i < 6; i++) {
      const tc = await f.createCase({ title: `Case ${i}`, taskIds: [taskRows[i].id] });
      for (let j = 0; j < 4; j++) {
        const ex = await f.execute(tc, j === 3 ? 'FAIL' : 'PASS');
        if (j === 3 && i < 5) {
          let defect = await f.createDefect(ex, { originTaskIds: [taskRows[i].id] });
          if (i < 4) {
            const task = taskRows[i + 8];
            await f.move(task.id, 'CONCLUIDO');
            defect = await defects.correction(
              defect.id,
              { expectedRevision: defect.revision, correctionCycle: 1, taskId: task.id },
              f.context
            );
            await f.execute(tc, 'FAIL', defect);
            defect = await defects.read(defect.id, f.context);
            defect = await defects.correction(
              defect.id,
              { expectedRevision: defect.revision, correctionCycle: 2, taskId: task.id },
              f.context
            );
            await f.execute(tc, 'PASS', defect);
          }
        }
      }
    }
    const { loadExpandedGraph } =
      await import('../../src/modules/traceability/expanded-graph.repository.js');
    const { formatExpandedGraph } =
      await import('../../src/modules/traceability/expanded-graph.mapper.js');
    const queryClient = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
    const queries = [];
    queryClient.$on('query', (e) => queries.push(e.query));
    try {
      const model = await loadExpandedGraph(queryClient, f.project.id, f.requirement.id);
      const g = formatExpandedGraph(model, { limit: 100 });
      expect(g.nodes.length).toBeGreaterThan(65);
      expect(queries.length).toBeLessThan(60);
      expect(queries.every((q) => !/INSERT|UPDATE|DELETE/.test(q))).toBe(true);
      expect(JSON.stringify(g)).not.toMatch(
        /actionSnapshot|storageKey|snapshotJson|observedResult/
      );
      const first = formatExpandedGraph(model, { limit: 20 }),
        second = formatExpandedGraph(model, { page: 2, limit: 20 });
      expect(first.nodes.length).toBe(20);
      expect(second.nodes.length).toBe(20);
      if (process.env.GRAPH_QA_OUTPUT)
        writeFileSync(process.env.GRAPH_QA_OUTPUT, JSON.stringify(g));
      process.stdout.write(
        `S109 graph: ${g.nodes.length} nodes, ${g.edges.length} edges, ${queries.length} SQL statements, ${Buffer.byteLength(JSON.stringify(g))} bytes; 20-node page supported.\n`
      );
    } finally {
      await queryClient.$disconnect();
    }
  });
});
