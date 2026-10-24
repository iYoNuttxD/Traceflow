import assert from 'node:assert/strict';
import { projectRequirement } from '../../src/modules/traceability/requirement-traceability.policy.js';

export async function seedStandaloneMigration(client) {
  const user = await client.user.create({
    data: {
      name: 'Upgrade fixture',
      username: 'standalone_upgrade',
      email: 'upgrade@example.invalid'
    }
  });
  const local = await client.project.create({
    data: {
      name: 'Local histórico',
      responsibleTeam: 'Fixture',
      accessCode: 'STANDALONE-UPGRADE-LOCAL'
    }
  });
  const integrated = await client.project.create({
    data: {
      name: 'Integrado histórico',
      responsibleTeam: 'Fixture',
      accessCode: 'STANDALONE-UPGRADE-GITHUB'
    }
  });
  await client.projectGitHubIntegration.create({
    data: {
      projectId: integrated.id,
      githubRepositoryId: 'upgrade-repository',
      status: 'RECONNECT_REQUIRED'
    }
  });
  const fixtures = [];
  const specs = [
    { name: 'done-pass', results: ['PASS'] },
    { name: 'baseline', results: ['PASS'], noState: true },
    { name: 'macro-only', results: ['PASS'], oldSituation: 'CONCLUIDO' },
    { name: 'no-tests', results: [], noCase: true },
    { name: 'never-executed', results: [] },
    { name: 'no-tasks', results: [], noTask: true },
    {
      name: 'unchanged',
      taskStatus: 'A_FAZER',
      results: [],
      oldSituation: 'PLANEJADO',
      oldStatus: 'PLANEJADO'
    },
    { name: 'stale-pass', results: ['PASS'], currentVersion: 2 },
    { name: 'latest-pass', results: ['FAIL', 'PASS'] },
    { name: 'latest-fail', results: ['PASS', 'FAIL'] },
    { name: 'blocked', results: ['BLOCKED'] },
    { name: 'open', results: ['FAIL'], defect: 'ABERTO' },
    { name: 'correction', results: ['FAIL'], defect: 'EM_CORRECAO' },
    { name: 'waiting-retest', results: ['FAIL'], defect: 'AGUARDANDO_RETESTE' },
    { name: 'task-linked', results: ['PASS'], taskOnly: true },
    { name: 'origin-linked', results: ['FAIL'], taskOnly: true, defect: 'AGUARDANDO_RETESTE' },
    { name: 'integrated', results: ['PASS'], integrated: true },
    { name: 'in-progress', taskStatus: 'EM_ANDAMENTO', results: [] },
    { name: 'pass-with-task-pending', taskStatus: 'A_FAZER', results: ['PASS'] },
    { name: 'retest-pass', results: ['FAIL', 'PASS'], defect: 'VALIDADO', retest: true },
    { name: 'retest-fail', results: ['FAIL', 'FAIL'], defect: 'EM_CORRECAO', retest: true },
    {
      name: 'retest-blocked',
      results: ['FAIL', 'BLOCKED'],
      defect: 'AGUARDANDO_RETESTE',
      retest: true
    },
    { name: 'deleted-case', results: ['FAIL'], deletedCase: true },
    { name: 'deleted-defect', results: ['FAIL'], defect: 'ABERTO', deletedDefect: true },
    { name: 'origin-and-direct', results: ['PASS'], bothLinks: true },
    {
      name: 'correction-link-only',
      results: ['PASS'],
      taskOnly: true,
      defect: 'ABERTO',
      correctionOnly: true
    }
  ];
  for (const spec of specs) {
    const project = spec.integrated ? integrated : local;
    // Requirement intentionally uses raw SQL: this is the actual old schema, before lifecycleBasis exists.
    await client.$executeRaw`INSERT INTO Requirement (projectId,title,type,status,createdAt,updatedAt)
      VALUES (${project.id},${spec.name},'FUNCIONAL',${spec.oldStatus || 'EM_IMPLEMENTACAO'},NOW(3),NOW(3))`;
    const [requirement] =
      await client.$queryRaw`SELECT id,projectId,title,status FROM Requirement WHERE projectId=${project.id} AND title=${spec.name}`;
    const task = await client.task.create({
      data: {
        projectId: project.id,
        requirementId: spec.noTask ? null : requirement.id,
        title: spec.name,
        status: spec.taskStatus || 'CONCLUIDO'
      }
    });
    const tc = await client.testCase.create({
      data: {
        projectId: project.id,
        requirementId: spec.taskOnly ? null : requirement.id,
        title: spec.name,
        preconditions: 'Ready',
        expectedResult: 'Works',
        responsibleUserId: user.id,
        status: spec.noCase ? 'INATIVO' : 'ATIVO',
        currentVersion: spec.currentVersion || 1,
        deletedAt: spec.deletedCase ? new Date('2026-10-02T00:00:00.000Z') : null
      }
    });
    if (spec.taskOnly || spec.bothLinks)
      await client.testCaseTask.create({ data: { testCaseId: tc.id, taskId: task.id } });
    const version = await client.testCaseVersion.create({
      data: {
        testCaseId: tc.id,
        version: 1,
        snapshotJson: { title: spec.name, steps: [] }
      }
    });
    if (tc.currentVersion === 2)
      await client.testCaseVersion.create({
        data: {
          testCaseId: tc.id,
          version: 2,
          snapshotJson: { title: `${spec.name} v2`, steps: [] }
        }
      });
    const pr = await client.pullRequest.create({
      data: {
        projectId: project.id,
        githubId: `upgrade-${tc.id}`,
        number: tc.id,
        title: `Old ${spec.name}`
      }
    });
    const commit = await client.commit.create({
      data: { projectId: project.id, hash: `${tc.id}`.padStart(40, 'a') }
    });
    const executions = [];
    const defects = [];
    for (const [index, result] of spec.results.entries()) {
      const type = index % 2 ? 'COMMIT' : 'PULL_REQUEST';
      const execution = await client.testExecution.create({
        data: {
          projectId: project.id,
          testCaseId: tc.id,
          testCaseVersionId: version.id,
          testCaseVersion: 1,
          environment: 'LOCAL',
          result,
          testedReferenceType: type,
          testedPullRequestId: type === 'PULL_REQUEST' ? pr.id : null,
          testedCommitId: type === 'COMMIT' ? commit.id : null,
          testedReferenceSnapshot: {
            type,
            id: type === 'PULL_REQUEST' ? pr.id : commit.id,
            title: spec.name
          },
          executedByUserId: user.id,
          executedByDisplayNameSnapshot: user.name,
          executedAt: new Date('2026-10-01T00:00:00.000Z')
        }
      });
      const step = await client.testExecutionStep.create({
        data: {
          executionId: execution.id,
          position: 1,
          actionSnapshot: 'Open',
          expectedResultSnapshot: 'Visible',
          result
        }
      });
      const detectedDefects = [];
      if (spec.defect && (!spec.retest || index === 0)) {
        const defect = await client.defect.create({
          data: {
            projectId: project.id,
            requirementId: spec.taskOnly ? null : requirement.id,
            title: spec.name,
            description: 'Upgrade fixture',
            severity: 'MEDIA',
            status: spec.defect,
            responsibleUserId: user.id,
            detectedExecutionStepId: step.id,
            deletedAt: spec.deletedDefect ? new Date('2026-10-02T00:00:00.000Z') : null
          }
        });
        const taskLinks = [];
        if (spec.taskOnly) {
          await client.defectTask.create({
            data: {
              defectId: defect.id,
              taskId: task.id,
              relationType: spec.correctionOnly ? 'CORRECTION' : 'ORIGIN',
              correctionCycle: spec.correctionOnly ? 1 : 0
            }
          });
          taskLinks.push({ relationType: spec.correctionOnly ? 'CORRECTION' : 'ORIGIN', task });
        }
        await client.defectHistoryEntry.create({
          data: {
            projectId: project.id,
            defectId: defect.id,
            actorUserId: user.id,
            action: 'CREATED',
            metadataJson: { fixture: spec.name }
          }
        });
        detectedDefects.push(defect);
        defects.push({ ...defect, taskLinks, retests: [] });
      }
      if (spec.retest && index > 0) {
        const retest = await client.defectRetest.create({
          data: { defectId: defects[0].id, testExecutionId: execution.id, correctionCycle: 1 }
        });
        defects[0].retests.push({ ...retest, execution });
      }
      executions.push({ ...execution, steps: [{ ...step, detectedDefects }] });
    }
    const oldSituation = spec.oldSituation || 'EM_DESENVOLVIMENTO';
    if (!spec.noState) {
      await client.requirementTraceabilityState.create({
        data: { requirementId: requirement.id, currentSituation: oldSituation }
      });
      await client.requirementTraceabilityHistoryEntry.create({
        data: {
          projectId: project.id,
          requirementId: requirement.id,
          fromSituation: null,
          toSituation: oldSituation,
          reason: 'BASELINE_INITIALIZED',
          metadataJson: { rulesVersion: 3 }
        }
      });
    }
    const taskMetric = { ...task, _count: { commitLinks: 0, issueLinks: 0 } };
    const expected = projectRequirement(
      {
        ...requirement,
        lifecycleBasis: spec.integrated ? 'GITHUB' : 'LOCAL',
        tasks: spec.noTask ? [] : [taskMetric]
      },
      [
        {
          ...tc,
          taskLinks: spec.taskOnly || spec.bothLinks ? [{ task: taskMetric }] : [],
          executions
        }
      ],
      defects
    );
    fixtures.push({
      spec,
      requirement,
      expected,
      oldSituation,
      pr,
      commit,
      executionId: executions[0]?.id
    });
  }
  return fixtures;
}

export async function validateStandaloneMigration(
  client,
  fixtures,
  oldHistory,
  oldExecutions,
  oldRequirements,
  oldStates
) {
  assert.deepEqual(
    await client.testExecution.findMany({ orderBy: { id: 'asc' } }),
    oldExecutions,
    'Snapshots e identidades PR/COMMIT devem sobreviver ao upgrade.'
  );
  for (const f of fixtures) {
    const row = await client.requirement.findUnique({ where: { id: f.requirement.id } });
    const before = oldRequirements.find((item) => item.id === row.id);
    const unchangedFields = ({
      lifecycleBasis: _basis,
      status: _status,
      updatedAt: _updated,
      ...rest
    }) => rest;
    assert.deepEqual(
      unchangedFields(row),
      unchangedFields(before),
      `${f.spec.name}: requirement fields preserved`
    );
    const state = await client.requirementTraceabilityState.findUnique({
      where: { requirementId: row.id }
    });
    const history = await client.requirementTraceabilityHistoryEntry.findMany({
      where: { requirementId: row.id },
      orderBy: { id: 'asc' }
    });
    if (f.spec.integrated) {
      const preserved = { ...row };
      delete preserved.lifecycleBasis;
      assert.deepEqual(
        preserved,
        oldRequirements.find((item) => item.id === row.id),
        'Integrated row untouched'
      );
      assert.deepEqual(
        state,
        oldStates.find((item) => item.requirementId === row.id),
        'Integrated state untouched'
      );
    }
    assert.equal(row.lifecycleBasis, f.spec.integrated ? 'GITHUB' : 'LOCAL', f.spec.name);
    assert.equal(row.status, f.expected.requirement.status, `${f.spec.name}: macro`);
    assert.equal(state.currentSituation, f.expected.situation, `${f.spec.name}: situation`);
    const original = oldHistory.filter((entry) => entry.requirementId === row.id);
    assert.deepEqual(
      history.slice(0, original.length),
      original,
      `${f.spec.name}: immutable history`
    );
    const changed =
      !f.spec.integrated && (f.spec.noState || f.oldSituation !== f.expected.situation);
    assert.equal(
      history.length,
      original.length + Number(changed),
      `${f.spec.name}: no fake transitions`
    );
    if (changed) {
      const entry = history.at(-1);
      assert.equal(entry.fromSituation, f.spec.noState ? null : f.oldSituation);
      assert.equal(entry.toSituation, f.expected.situation);
      assert.equal(
        entry.reason,
        f.spec.noState ? 'BASELINE_INITIALIZED' : 'LIFECYCLE_BASIS_MIGRATION'
      );
      assert.equal(entry.sourceEntityType, 'Migration');
      assert.deepEqual(entry.metadataJson, {
        rulesVersion: 4,
        lifecycleBasis: 'LOCAL',
        migrationReason: 'LIFECYCLE_BASIS_MIGRATION'
      });
    }
  }
}
