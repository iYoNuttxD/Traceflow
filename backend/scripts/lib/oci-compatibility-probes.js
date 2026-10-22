import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { arch, platform, release } from 'node:os';
import {
  assertServerIdentity,
  assertNativeRuntime,
  requireCondition,
  validateCompatibilityTarget
} from './oci-compatibility-safety.js';

export async function connectOwnedPrisma(environment = process.env) {
  const target = validateCompatibilityTarget({ TEST_DATABASE_URL: environment.TEST_DATABASE_URL });
  requireCondition(
    environment.TF_OCI_OWNER_TOKEN && environment.TF_OCI_SERVER_UUID && environment.TF_OCI_DATADIR,
    'MISSING_OWNERSHIP',
    'O probe só pode ser iniciado pelo runner proprietário.'
  );
  const { PrismaClient, Prisma } = await import('@prisma/client');
  assert.equal(Prisma.prismaVersion.client, '6.12.0');
  const client = new PrismaClient({ datasourceUrl: target.url });
  try {
    const [actual] =
      await client.$queryRaw`SELECT VERSION() AS version, @@server_uuid AS serverUuid, @@datadir AS datadir, @@port AS port, DATABASE() AS \`database\``;
    // Identifier is restricted to the generated hexadecimal run ID above.
    const [owner] = await client.$queryRawUnsafe(
      `SELECT token FROM \`${target.controlSchema}\`.RunOwner WHERE id = 1`
    );
    assertServerIdentity(
      { ...actual, ownerToken: owner?.token },
      {
        ...target,
        version: environment.TF_OCI_MYSQL_VERSION,
        datadir: environment.TF_OCI_DATADIR,
        serverUuid: environment.TF_OCI_SERVER_UUID,
        ownerToken: environment.TF_OCI_OWNER_TOKEN
      }
    );
    return { client, Prisma, target };
  } catch (error) {
    await client.$disconnect();
    throw error;
  }
}

export async function nativeProbe() {
  const { client, Prisma } = await connectOwnedPrisma();
  try {
    const { default: argon2 } = await import('argon2');
    const secret = randomBytes(32).toString('hex');
    const hash = await argon2.hash(secret, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1
    });
    assert.equal(await argon2.verify(hash, secret), true);
    assert.equal(await argon2.verify(hash, `${secret}-incorrect`), false);
    assert.match(hash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    // Import the real application after npm prune as well: no dev dependency
    // may be required by its runtime graph. No listener or external API call.
    const { default: app } = await import('../../src/app.js');
    assert.equal(typeof app, 'function');
    let osRelease = null;
    if (platform() === 'linux') osRelease = await readFile('/etc/os-release', 'utf8');
    const objects = process.report
      .getReport()
      .sharedObjects.filter((path) => /argon2|query_engine/.test(path));
    assert(
      objects.some((path) => /argon2/.test(path)),
      'Argon2 native addon not loaded'
    );
    assert(
      objects.some((path) => /query_engine/.test(path)),
      'Prisma native engine not loaded'
    );
    if (platform() === 'linux' && arch() === 'arm64')
      assertNativeRuntime(
        { platform: platform(), architecture: arch(), objects },
        {
          platform: 'linux',
          architecture: 'arm64',
          engine: 'linux-arm64-openssl-3.0.x'
        }
      );
    const tls = await client.$queryRawUnsafe("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
    return {
      platform: platform(),
      architecture: arch(),
      kernel: release(),
      osRelease,
      node: process.version,
      openssl: process.versions.openssl,
      prisma: Prisma.prismaVersion,
      loadedNativeObjects: objects.map((path) =>
        path.slice(path.lastIndexOf('/node_modules/') + 14)
      ),
      argon2: {
        hash: 'PASS',
        correctPassword: 'PASS',
        wrongPassword: 'REJECTED',
        productionParameters: 'PASS'
      },
      prismaConnection: 'PASS',
      localTlsCipher: tls[0]?.Value || null,
      managedCertificateIdentity: 'NOT_VALIDATED',
      runtimeImports: 'PASS',
      linuxArm64: platform() === 'linux' && arch() === 'arm64' ? 'EXECUTED' : 'NOT_EXECUTED'
    };
  } finally {
    await client.$disconnect();
    const { prisma } = await import('../../src/database/prismaClient.js');
    await prisma.$disconnect();
  }
}

export async function physicalProbe() {
  const { client } = await connectOwnedPrisma();
  const report = { checksRejected: [], invalidInsertsRejected: [], contracts: [] };
  const rolledBack = new Error('ROLLBACK_OWNED_SYNTHETIC_FIXTURES');
  try {
    const migrationDirectory = new URL('../../prisma/migrations/', import.meta.url);
    const expectedNames = (await readdir(migrationDirectory))
      .filter((name) => /^\d/.test(name))
      .sort();
    const ledger =
      await client.$queryRaw`SELECT migration_name AS name, checksum, finished_at AS finishedAt, rolled_back_at AS rolledBackAt FROM _prisma_migrations ORDER BY migration_name`;
    assert.deepEqual(ledger.map((entry) => entry.name).sort(), expectedNames);
    for (const entry of ledger) {
      assert(entry.finishedAt && !entry.rolledBackAt, `Unfinished migration: ${entry.name}`);
      const sql = await readFile(new URL(`${entry.name}/migration.sql`, migrationDirectory));
      assert.equal(entry.checksum, createHash('sha256').update(sql).digest('hex'));
    }
    report.migrations = {
      expected: expectedNames.length,
      applied: ledger.length,
      pending: 0,
      failed: 0,
      checksumMismatches: 0
    };
    const checks =
      await client.$queryRaw`SELECT CONSTRAINT_NAME AS name, CHECK_CLAUSE AS clause FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() ORDER BY CONSTRAINT_NAME`;
    assert.equal(checks.length, 6);
    const [generated] =
      await client.$queryRaw`SELECT EXTRA AS extra, GENERATION_EXPRESSION AS expression FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Sprint' AND COLUMN_NAME = 'activeNameKey'`;
    assert.match(generated.extra, /STORED GENERATED/);
    assert.match(generated.expression, /deletedAt/i);
    const [branch] =
      await client.$queryRaw`SELECT COLLATION_NAME AS collation FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'GitBranch' AND COLUMN_NAME = 'name'`;
    assert.equal(branch.collation, 'utf8mb4_bin');
    const indexes =
      await client.$queryRaw`SELECT TABLE_NAME AS tableName, INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique, SEQ_IN_INDEX AS position, COLUMN_NAME AS columnName, SUB_PART AS prefixLength FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`;
    const foreignKeys =
      await client.$queryRaw`SELECT TABLE_NAME AS tableName, CONSTRAINT_NAME AS name, REFERENCED_TABLE_NAME AS parentTable, UPDATE_RULE AS updateRule, DELETE_RULE AS deleteRule FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() ORDER BY TABLE_NAME, CONSTRAINT_NAME`;
    report.structure = { checks, generated, branch, indexes, foreignKeys };
    report.structureSha256 = createHash('sha256')
      .update(
        JSON.stringify(report.structure, (_, value) =>
          typeof value === 'bigint' ? String(value) : value
        )
      )
      .digest('hex');
    await client.$transaction(
      async (tx) => {
        const user = await tx.user.create({
          data: {
            name: 'Synthetic compatibility',
            username: 'oci_compatibility',
            email: 'compatibility@example.invalid'
          }
        });
        const project = await tx.project.create({
          data: {
            name: 'Synthetic compatibility',
            responsibleTeam: 'Synthetic',
            accessCode: 'OCI-SYNTHETIC'
          }
        });
        const projectId = project.id;
        const task = await tx.task.create({ data: { projectId, title: 'Synthetic task' } });
        const pull = await tx.pullRequest.create({
          data: { projectId, githubId: '123', number: 1, title: 'Synthetic PR' }
        });
        const testCase = await tx.testCase.create({
          data: {
            projectId,
            title: 'Synthetic case',
            responsibleUserId: user.id,
            preconditions: 'Synthetic',
            expectedResult: 'Synthetic'
          }
        });
        const version = await tx.testCaseVersion.create({
          data: { testCaseId: testCase.id, version: 1, snapshotJson: { synthetic: true } }
        });
        const execution = await tx.testExecution.create({
          data: {
            projectId,
            testCaseId: testCase.id,
            testCaseVersionId: version.id,
            testCaseVersion: 1,
            environment: 'LOCAL',
            result: 'FAIL',
            testedReferenceType: 'PULL_REQUEST',
            testedPullRequestId: pull.id,
            testedReferenceSnapshot: { synthetic: true },
            executedByDisplayNameSnapshot: 'Synthetic'
          }
        });
        const step = await tx.testExecutionStep.create({
          data: {
            executionId: execution.id,
            position: 1,
            actionSnapshot: 'Synthetic',
            expectedResultSnapshot: 'Synthetic',
            result: 'FAIL'
          }
        });
        const evidence = await tx.testEvidence.create({
          data: {
            projectId,
            executionId: execution.id,
            scope: 'EXECUTION',
            kind: 'TEXT',
            originalName: 'synthetic.txt',
            mimeType: 'text/plain',
            sizeBytes: 1,
            sha256: '0'.repeat(64),
            storageKey: 'synthetic-compatibility-only'
          }
        });
        const { DefectSeverity } = await import('@prisma/client');
        const defect = await tx.defect.create({
          data: {
            projectId,
            title: 'Synthetic defect',
            description: 'Synthetic',
            severity: Object.values(DefectSeverity)[0],
            responsibleUserId: user.id,
            detectedExecutionStepId: step.id
          }
        });
        const link = await tx.defectTask.create({
          data: { defectId: defect.id, taskId: task.id, relationType: 'ORIGIN', correctionCycle: 0 }
        });
        const retest = await tx.defectRetest.create({
          data: { defectId: defect.id, testExecutionId: execution.id, correctionCycle: 1 }
        });
        const invalid = [
          [
            'Project_accessCodeRole_allowed',
            () =>
              tx.$executeRaw`UPDATE Project SET accessCodeRole = 'OWNER' WHERE id = ${projectId}`
          ],
          [
            'TestExecution_primary_reference_check',
            () =>
              tx.$executeRaw`UPDATE TestExecution SET testedPullRequestId = NULL WHERE id = ${execution.id}`
          ],
          [
            'TestEvidence_scope_check',
            () => tx.$executeRaw`UPDATE TestEvidence SET scope = 'STEP' WHERE id = ${evidence.id}`
          ],
          [
            'Defect_cycle_positive',
            () =>
              tx.$executeRaw`UPDATE Defect SET currentCorrectionCycle = 0 WHERE id = ${defect.id}`
          ],
          [
            'DefectTask_role_cycle',
            () => tx.$executeRaw`UPDATE DefectTask SET correctionCycle = 1 WHERE id = ${link.id}`
          ],
          [
            'DefectRetest_cycle_positive',
            () =>
              tx.$executeRaw`UPDATE DefectRetest SET correctionCycle = 0 WHERE id = ${retest.id}`
          ]
        ];
        for (const [name, query] of invalid) {
          await assert.rejects(
            query,
            (error) =>
              error.code === 'P2010' &&
              String(error.meta?.code) === '3819' &&
              error.meta.message.includes(name)
          );
          report.checksRejected.push(name);
        }
        const secondExecutionData = { ...execution };
        delete secondExecutionData.id;
        const secondExecution = await tx.testExecution.create({ data: secondExecutionData });
        const invalidInserts = [
          [
            'Project_accessCodeRole_allowed',
            'Project',
            { ...project, accessCode: 'OCI-INVALID', accessCodeRole: 'OWNER' }
          ],
          [
            'TestExecution_primary_reference_check',
            'TestExecution',
            { ...execution, testedPullRequestId: null }
          ],
          [
            'TestEvidence_scope_check',
            'TestEvidence',
            { ...evidence, storageKey: 'synthetic-invalid', scope: 'STEP' }
          ],
          ['Defect_cycle_positive', 'Defect', { ...defect, currentCorrectionCycle: 0 }],
          ['DefectTask_role_cycle', 'DefectTask', { ...link, correctionCycle: 1 }],
          [
            'DefectRetest_cycle_positive',
            'DefectRetest',
            { ...retest, testExecutionId: secondExecution.id, correctionCycle: 0 }
          ]
        ];
        for (const [name, table, candidate] of invalidInserts) {
          const columns = Object.keys(candidate).filter((key) => key !== 'id');
          // Identifiers originate only from the fixed models above; values stay bound.
          assert([table, ...columns].every((key) => /^[A-Za-z][A-Za-z0-9_]*$/.test(key)));
          const sql = `INSERT INTO \`${table}\` (${columns.map((key) => `\`${key}\``).join(',')}) VALUES (${columns.map(() => '?').join(',')})`;
          const values = columns.map((key) => {
            const value = candidate[key];
            return value && typeof value === 'object' && !(value instanceof Date)
              ? JSON.stringify(value)
              : value;
          });
          await assert.rejects(
            () => tx.$executeRawUnsafe(sql, ...values),
            (error) =>
              error.code === 'P2010' &&
              String(error.meta?.code) === '3819' &&
              error.meta.message.includes(name)
          );
          report.invalidInsertsRejected.push(name);
        }
        const sprintData = {
          projectId,
          name: 'Duplicate active name',
          objective: 'Synthetic',
          startDate: new Date('2026-01-01T00:00:00.123Z'),
          endDate: new Date('2026-01-14T00:00:00.123Z')
        };
        const sprint = await tx.sprint.create({ data: sprintData });
        assert.equal(sprint.startDate.toISOString(), '2026-01-01T00:00:00.123Z');
        await assert.rejects(() => tx.sprint.create({ data: sprintData }), { code: 'P2002' });
        await tx.sprint.update({ where: { id: sprint.id }, data: { deletedAt: new Date() } });
        await tx.sprint.create({ data: { ...sprintData, deletedAt: new Date() } });
        await tx.sprint.create({ data: sprintData });
        const nulls =
          await tx.$queryRaw`SELECT COUNT(*) AS total FROM Sprint WHERE projectId = ${projectId} AND activeNameKey IS NULL`;
        assert.equal(Number(nulls[0].total), 2);
        report.contracts.push('generated-STORED-nullable-unique', 'DATETIME(3)-milliseconds');
        for (const name of ['Feature/Compatibility', 'feature/compatibility'])
          await tx.gitBranch.create({ data: { projectId, name, lastSeenAt: new Date() } });
        await assert.rejects(
          () =>
            tx.gitBranch.create({
              data: { projectId, name: 'Feature/Compatibility', lastSeenAt: new Date() }
            }),
          { code: 'P2002' }
        );
        assert.equal(
          await tx.gitBranch.count({ where: { projectId, name: 'Feature/Compatibility' } }),
          1
        );
        report.contracts.push('branch-case-sensitive-comparison-and-unique');
        await assert.rejects(() => tx.project.delete({ where: { id: projectId } }), {
          code: 'P2003'
        });
        const actor = await tx.user.create({
          data: { name: 'Synthetic actor', username: 'oci_actor', email: 'actor@example.invalid' }
        });
        await tx.session.create({
          data: {
            userId: actor.id,
            tokenHash: randomBytes(32).toString('hex'),
            csrfTokenHash: randomBytes(32).toString('hex'),
            sessionVersion: 1,
            expiresAt: new Date('2030-01-01')
          }
        });
        const run = await tx.gitHubSyncRun.create({
          data: { projectId, requestedByUserId: actor.id }
        });
        await tx.user.delete({ where: { id: actor.id } });
        assert.equal(await tx.session.count({ where: { userId: actor.id } }), 0);
        assert.equal(
          (await tx.gitHubSyncRun.findUnique({ where: { id: run.id } })).requestedByUserId,
          null
        );
        report.contracts.push('FK-Restrict', 'FK-Cascade', 'FK-SetNull');
        const other = await tx.project.create({
          data: { name: 'Other synthetic', responsibleTeam: 'Synthetic', accessCode: 'OCI-OTHER' }
        });
        const { SprintBurnupEventType } = await import('@prisma/client');
        await assert.rejects(
          () =>
            tx.sprintBurnupEvent.create({
              data: {
                projectId: other.id,
                sprintId: sprint.id,
                taskKey: task.id,
                type: Object.values(SprintBurnupEventType)[0],
                previousPoints: null,
                newPoints: 2.5
              }
            }),
          { code: 'P2003' }
        );
        const burnup = await tx.sprintBurnupEvent.create({
          data: {
            projectId,
            sprintId: sprint.id,
            taskKey: task.id,
            type: Object.values(SprintBurnupEventType)[0],
            previousPoints: null,
            newPoints: 2.5
          }
        });
        assert.equal(burnup.previousPoints, null);
        assert.equal(burnup.newPoints, 2.5);
        report.contracts.push('cross-project-burnup-FK', 'DOUBLE-and-NULL');
        const [sql] =
          await tx.$queryRaw`WITH values_set AS (SELECT 1 AS value UNION ALL SELECT 2) SELECT SUM(value) AS total, JSON_EXTRACT(JSON_SET('{}', '$.value', 1), '$.value') AS jsonValue, TIMESTAMPDIFF(MICROSECOND, CAST('2026-01-01 00:00:00.000' AS DATETIME(3)), CAST('2026-01-01 00:00:00.123' AS DATETIME(3))) AS micros FROM values_set`;
        assert.equal(Number(sql.total), 3);
        assert.equal(Number(sql.jsonValue), 1);
        assert.equal(Number(sql.micros), 123000);
        report.contracts.push('CTE-UNION-JSON-temporal-aggregation');
        throw rolledBack;
      },
      { timeout: 30000 }
    );
  } catch (error) {
    if (error !== rolledBack) throw error;
    assert.equal(await client.project.count(), 0);
    report.contracts.push('synthetic-transaction-rollback');
    return report;
  } finally {
    await client.$disconnect();
  }
}
