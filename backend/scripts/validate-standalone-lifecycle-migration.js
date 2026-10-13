import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { validateTestDatabaseUrl } from './lib/database-safety.js';
import { projectRequirement } from '../src/modules/traceability/requirement-traceability.policy.js';

dotenv.config({ path: resolve('.env.test'), override: false, quiet: true });
dotenv.config({ path: resolve('.env'), override: false, quiet: true });
const migrations = [
  '20261013170000_manual_test_execution_reference',
  '20261013171000_requirement_lifecycle_basis'
];
const source = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
const target = new URL(source);
const database = `${target.pathname.slice(1)}_standalone_upgrade_validation`;
if (!/^[a-zA-Z0-9_]+_test_standalone_upgrade_validation$/.test(database)) {
  throw new Error('Nome do banco descartável standalone recusado.');
}
target.pathname = `/${database}`;
const url = validateTestDatabaseUrl(target.toString(), process.env.DATABASE_URL);
assert.notEqual(url, source);
const admin = new PrismaClient({ datasourceUrl: source });
const client = new PrismaClient({ datasourceUrl: url });
const root = mkdtempSync(join(tmpdir(), 'traceflow-standalone-upgrade-'));
const migrationDirectory = join(root, 'prisma', 'migrations');
const schemaPath = join(root, 'prisma', 'schema.prisma');
const sourcePrisma = resolve('prisma');
let created = false;

function deploy() {
  const result = spawnSync(
    process.execPath,
    [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', schemaPath],
    {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: url },
      encoding: 'utf8'
    }
  );
  const output = `${result.stdout || ''}${result.stderr || ''}`
    .replaceAll(url, '[TEST_DATABASE_URL]')
    .replaceAll(source, '[TEST_DATABASE_URL]');
  assert.equal(result.status, 0, `Deploy standalone falhou: ${output}`);
}

async function seed() {
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
    { name: 'integrated', results: ['PASS'], integrated: true }
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
        currentVersion: spec.currentVersion || 1
      }
    });
    if (spec.taskOnly)
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
      if (spec.defect) {
        const defect = await client.defect.create({
          data: {
            projectId: project.id,
            requirementId: spec.taskOnly ? null : requirement.id,
            title: spec.name,
            description: 'Upgrade fixture',
            severity: 'MEDIA',
            status: spec.defect,
            responsibleUserId: user.id,
            detectedExecutionStepId: step.id
          }
        });
        const taskLinks = [];
        if (spec.taskOnly) {
          await client.defectTask.create({
            data: { defectId: defect.id, taskId: task.id, relationType: 'ORIGIN' }
          });
          taskLinks.push({ relationType: 'ORIGIN', task });
        }
        detectedDefects.push(defect);
        defects.push({ ...defect, taskLinks, retests: [] });
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
      [{ ...tc, taskLinks: spec.taskOnly ? [{ task: taskMetric }] : [], executions }],
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

async function validate(fixtures, oldHistory, oldExecutions, oldRequirements, oldStates) {
  assert.deepEqual(
    await client.testExecution.findMany({ orderBy: { id: 'asc' } }),
    oldExecutions,
    'Snapshots e identidades PR/COMMIT devem sobreviver ao upgrade.'
  );
  for (const f of fixtures) {
    const row = await client.requirement.findUnique({ where: { id: f.requirement.id } });
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

try {
  const existing =
    await admin.$queryRaw`SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=${database}`;
  assert.equal(
    existing.length,
    0,
    'Banco descartável já existe; não será reutilizado ou removido.'
  );
  await admin.$executeRawUnsafe(`CREATE DATABASE \`${database}\``);
  created = true;
  const [connected] = await client.$queryRaw`SELECT DATABASE() AS name`;
  assert.equal(connected.name, database);
  mkdirSync(migrationDirectory, { recursive: true });
  cpSync(join(sourcePrisma, 'schema.prisma'), schemaPath);
  cpSync(
    join(sourcePrisma, 'migrations', 'migration_lock.toml'),
    join(migrationDirectory, 'migration_lock.toml')
  );
  for (const entry of readdirSync(join(sourcePrisma, 'migrations'), { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name < migrations[0])
      cpSync(join(sourcePrisma, 'migrations', entry.name), join(migrationDirectory, entry.name), {
        recursive: true
      });
  }
  deploy();
  const columns =
    await client.$queryRaw`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=${database} AND TABLE_NAME='Requirement' AND COLUMN_NAME='lifecycleBasis'`;
  assert.equal(columns.length, 0, 'Fixture deve nascer antes da nova coluna.');
  const fixtures = await seed();
  const oldHistory = await client.requirementTraceabilityHistoryEntry.findMany({
    orderBy: { id: 'asc' }
  });
  const oldExecutions = await client.testExecution.findMany({ orderBy: { id: 'asc' } });
  const oldRequirements = await client.$queryRaw`SELECT * FROM Requirement ORDER BY id`;
  const oldStates = await client.requirementTraceabilityState.findMany({ orderBy: { id: 'asc' } });
  for (const migration of migrations) {
    cpSync(join(sourcePrisma, 'migrations', migration), join(migrationDirectory, migration), {
      recursive: true
    });
    deploy();
  }
  await validate(fixtures, oldHistory, oldExecutions, oldRequirements, oldStates);
  const sample = fixtures[0];
  await client.requirement.update({
    where: { id: sample.requirement.id },
    data: { status: 'PLANEJADO' }
  });
  await assert.rejects(
    validate(fixtures, oldHistory, oldExecutions, oldRequirements, oldStates),
    /done-pass: macro/
  );
  await client.requirement.update({
    where: { id: sample.requirement.id },
    data: { status: sample.expected.requirement.status }
  });
  await validate(fixtures, oldHistory, oldExecutions, oldRequirements, oldStates);
  process.stdout.write(
    `${JSON.stringify({
      schema: database,
      upgrade: 'ok',
      scenarios: fixtures.length,
      oldExecutionsPreserved: oldExecutions.length,
      negativeControl: 'detected'
    })}\n`
  );
} finally {
  await client.$disconnect();
  if (created) await admin.$executeRawUnsafe(`DROP DATABASE \`${database}\``);
  await admin.$disconnect();
  rmSync(root, { recursive: true, force: true });
}
