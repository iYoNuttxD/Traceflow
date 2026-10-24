import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { validateTestDatabaseUrl } from './lib/database-safety.js';
import {
  seedStandaloneMigration,
  validateStandaloneMigration
} from './lib/standalone-migration-fixture.js';

// Explicit lab credentials only: never fall back to .env or the application database.
const adminUrl = validateTestDatabaseUrl(
  process.env.MIGRATION_LAB_ADMIN_URL,
  process.env.DATABASE_URL
);
const address = new URL(adminUrl);
assert.ok(
  ['localhost', '127.0.0.1', '[::1]'].includes(address.hostname),
  'Migration laboratory must be local.'
);
const baseline = JSON.parse(
  readFileSync(resolve('scripts/fixtures/pr25-migration-baseline.json'), 'utf8')
);
const source = resolve('prisma/migrations');
const lifecycle = '20261013171000_requirement_lifecycle_basis';
const manual = '20261013170000_manual_test_execution_reference';
const migrations = readdirSync(source, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const previous = Object.keys(baseline.migrations);
assert.equal(previous.length, 84);
for (const name of previous) {
  assert.equal(
    createHash('sha256')
      .update(readFileSync(join(source, name, 'migration.sql')))
      .digest('hex'),
    baseline.migrations[name],
    `Production migration changed: ${name}`
  );
}
const pending = migrations.filter((name) => !previous.includes(name));
assert.ok(pending.includes(manual) && pending.includes(lifecycle));
const grants = ['SELECT', 'INSERT', 'UPDATE', 'CREATE', 'ALTER', 'INDEX', 'REFERENCES'];
const suffix = randomBytes(5).toString('hex');
const username = `tf_pr25_${suffix}`;
const password = randomBytes(24).toString('hex');
const admin = new PrismaClient({ datasourceUrl: adminUrl });
const root = mkdtempSync(join(tmpdir(), 'traceflow-restricted-migrations-'));
const databases = [];
let userCreated = false;
const reports = [];

function urlFor(database, restricted = false) {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  if (restricted) {
    url.username = username;
    url.password = password;
  }
  url.searchParams.set('connection_limit', '1');
  return url.toString();
}
function command(url, args, expected = 0) {
  const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: url };
  delete env.MIGRATION_LAB_ADMIN_URL;
  delete env.TEST_DATABASE_URL;
  const result = spawnSync(
    process.execPath,
    [resolve('node_modules/prisma/build/index.js'), ...args],
    { env, encoding: 'utf8' }
  );
  const output = `${result.stdout || ''}${result.stderr || ''}`
    .replaceAll(url, '[LAB_DATABASE_URL]')
    .replaceAll(adminUrl, '[LAB_ADMIN_URL]')
    .replaceAll(password, '[REDACTED_SECRET]');
  assert.ifError(result.error);
  if (expected === 'failure') assert.notEqual(result.status, 0, output);
  else assert.equal(result.status, expected, output);
  return output;
}
async function snapshot(client) {
  const rows =
    await client.$queryRaw`SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME`;
  const result = {};
  for (const { name } of rows) {
    if (
      [
        '_prisma_migrations',
        'Requirement',
        'RequirementTraceabilityState',
        'RequirementTraceabilityHistoryEntry'
      ].includes(name)
    )
      continue;
    assert.match(name, /^[a-zA-Z0-9_]+$/);
    const data = await client.$queryRawUnsafe(`SELECT * FROM \`${name}\``);
    result[name] = data
      .map((row) =>
        JSON.stringify(row, (_, value) => (typeof value === 'bigint' ? String(value) : value))
      )
      .sort();
  }
  return result;
}
async function verifyGrants(client, database) {
  const rows = await client.$queryRawUnsafe('SHOW GRANTS');
  const statements = rows.flatMap(Object.values);
  assert.equal(statements.length, databases.length + 1);
  assert.ok(statements.some((line) => line.startsWith('GRANT USAGE ON *.*')));
  const actual = statements.find((line) => line.includes(`ON \`${database}\`.*`));
  assert.ok(actual, 'Scoped grants missing');
  assert.deepEqual(actual.slice(6, actual.indexOf(' ON ')).split(', ').sort(), [...grants].sort());
  assert.ok(
    statements.every(
      (line) => !/ALL PRIVILEGES|GRANT OPTION|CREATE TEMPORARY|DELETE|DROP|ROLE/.test(line)
    )
  );
  const [identity] = await client.$queryRaw`SELECT CURRENT_USER() AS name`;
  assert.equal(identity.name, `${username}@%`);
}
async function run(mode) {
  const database = `tf_pr25_${suffix}_${mode}_test`;
  const url = urlFor(database);
  const limited = urlFor(database, true);
  const directory = join(root, mode, 'prisma');
  const migrationDirectory = join(directory, 'migrations');
  const schema = join(directory, 'schema.prisma');
  mkdirSync(migrationDirectory, { recursive: true });
  cpSync(resolve('prisma/schema.prisma'), schema);
  cpSync(join(source, 'migration_lock.toml'), join(migrationDirectory, 'migration_lock.toml'));
  for (const name of previous)
    cpSync(join(source, name), join(migrationDirectory, name), { recursive: true });
  await admin.$executeRawUnsafe(
    `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`
  );
  databases.push(database);
  await admin.$executeRawUnsafe(
    `GRANT ${grants.join(', ')} ON \`${database}\`.* TO '${username}'@'%'`
  );
  // The historical 84 include DROP/DELETE contracts and predate the OCI account.
  // They prepare the exact already-deployed baseline; every pending migration uses limited.
  command(url, ['migrate', 'deploy', '--schema', schema]);
  const client = new PrismaClient({ datasourceUrl: url });
  const restricted = new PrismaClient({ datasourceUrl: limited });
  try {
    await verifyGrants(restricted, database);
    assert.equal(
      await client.$queryRaw`SELECT COUNT(*) AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL`.then(
        (rows) => Number(rows[0].n)
      ),
      84
    );
    const fixtures = mode === 'empty' ? [] : await seedStandaloneMigration(client);
    const oldHistory = await client.requirementTraceabilityHistoryEntry.findMany({
      orderBy: { id: 'asc' }
    });
    const oldExecutions = await client.testExecution.findMany({ orderBy: { id: 'asc' } });
    const oldRequirements = await client.$queryRaw`SELECT * FROM Requirement ORDER BY id`;
    const oldStates = await client.requirementTraceabilityState.findMany({
      orderBy: { id: 'asc' }
    });
    const facts = await snapshot(client);
    for (const name of pending)
      cpSync(join(source, name), join(migrationDirectory, name), { recursive: true });
    if (mode === 'partial') {
      const file = join(migrationDirectory, lifecycle, 'migration.sql');
      cpSync(resolve('scripts/fixtures/pr25-original-lifecycle.sql'), file);
      const failed = command(limited, ['migrate', 'deploy', '--schema', schema], 'failure');
      assert.match(failed, /P3018/);
      assert.match(failed, /1044/);
      const [record] =
        await client.$queryRaw`SELECT * FROM _prisma_migrations WHERE migration_name=${lifecycle} AND finished_at IS NULL AND rolled_back_at IS NULL`;
      assert.ok(record, 'Prisma failed record missing');
      const [first] =
        await client.$queryRaw`SELECT finished_at FROM _prisma_migrations WHERE migration_name=${manual}`;
      assert.ok(first.finished_at);
      assert.ok(
        (await client.$queryRaw`SELECT lifecycleBasis FROM Requirement`).every(
          (row) => row.lifecycleBasis === 'GITHUB'
        ),
        'DML should roll back while ALTER survives'
      );
      assert.deepEqual(await snapshot(client), facts);
      assert.deepEqual(
        await client.requirementTraceabilityHistoryEntry.findMany({ orderBy: { id: 'asc' } }),
        oldHistory
      );
      cpSync(join(source, lifecycle, 'migration.sql'), file);
      const corrected = readFileSync(file, 'utf8');
      const remainder = join(directory, 'recovery.sql');
      const reconciliation = corrected.slice(corrected.indexOf('START TRANSACTION;'));
      // A failure after the history INSERT must roll back history, state and basis together.
      writeFileSync(
        remainder,
        reconciliation.replace(
          'INSERT INTO RequirementTraceabilityState',
          'SELECT missing_atomicity_probe FROM Requirement;\nINSERT INTO RequirementTraceabilityState'
        )
      );
      assert.match(
        command(limited, ['db', 'execute', '--schema', schema, '--file', remainder], 'failure'),
        /Unknown column 'missing_atomicity_probe'/
      );
      assert.deepEqual(
        await client.requirementTraceabilityHistoryEntry.findMany({ orderBy: { id: 'asc' } }),
        oldHistory
      );
      assert.deepEqual(
        await client.requirementTraceabilityState.findMany({ orderBy: { id: 'asc' } }),
        oldStates
      );
      assert.ok(
        (await client.$queryRaw`SELECT lifecycleBasis FROM Requirement`).every(
          (row) => row.lifecycleBasis === 'GITHUB'
        )
      );
      writeFileSync(remainder, reconciliation);
      // Lab-only roll forward: the column is already present, so do not replay DDL.
      command(limited, ['db', 'execute', '--schema', schema, '--file', remainder]);
      await validateStandaloneMigration(
        client,
        fixtures,
        oldHistory,
        oldExecutions,
        oldRequirements,
        oldStates
      );
      command(limited, [
        'migrate',
        'diff',
        '--from-schema-datasource',
        schema,
        '--to-schema-datamodel',
        schema,
        '--exit-code'
      ]);
      command(limited, ['migrate', 'resolve', '--applied', lifecycle, '--schema', schema]);
    }
    command(limited, ['migrate', 'deploy', '--schema', schema]);
    const applied =
      await client.$queryRaw`SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
    assert.deepEqual(applied.map((row) => row.migration_name).sort(), migrations);
    for (const row of applied)
      assert.equal(
        row.checksum,
        createHash('sha256')
          .update(readFileSync(join(source, row.migration_name, 'migration.sql')))
          .digest('hex'),
        row.migration_name
      );
    assert.equal(
      (
        await client.$queryRaw`SELECT id FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL`
      ).length,
      0
    );
    assert.match(command(limited, ['migrate', 'status', '--schema', schema]), /up to date/i);
    command(limited, [
      'migrate',
      'diff',
      '--from-schema-datasource',
      schema,
      '--to-schema-datamodel',
      schema,
      '--exit-code'
    ]);
    await validateStandaloneMigration(
      client,
      fixtures,
      oldHistory,
      oldExecutions,
      oldRequirements,
      oldStates
    );
    assert.deepEqual(
      await snapshot(client),
      facts,
      'Source facts, artifacts, executions and defect/retest history must remain unchanged'
    );
    const history = await client.requirementTraceabilityHistoryEntry.findMany({
      orderBy: { id: 'asc' }
    });
    command(limited, ['migrate', 'deploy', '--schema', schema]);
    assert.deepEqual(
      await client.requirementTraceabilityHistoryEntry.findMany({ orderBy: { id: 'asc' } }),
      history,
      'No duplicate transitions on redeploy'
    );
    const [version] = await client.$queryRaw`SELECT VERSION() AS version`;
    reports.push({
      mode,
      version: version.version,
      baseline: previous.length,
      completed: applied.length,
      grants,
      scenarios: fixtures.length,
      preservedTables: Object.keys(facts).length,
      oldExecutions: oldExecutions.length,
      oldHistory: oldHistory.length,
      appendedHistory: history.length - oldHistory.length,
      status: 'PASS',
      schemaDrift: 'NONE',
      recovery:
        mode === 'partial'
          ? '1044 reproduced; DDL retained; DML rolled back; restricted roll-forward and resolve verified'
          : undefined
    });
  } finally {
    await restricted.$disconnect();
    await client.$disconnect();
  }
}
try {
  await admin.$executeRawUnsafe(`CREATE USER '${username}'@'%' IDENTIFIED BY '${password}'`);
  userCreated = true;
  for (const mode of ['populated', 'empty', 'partial']) await run(mode);
  process.stdout.write(`${JSON.stringify({ baseline: baseline.commit, reports }, null, 2)}\n`);
} finally {
  for (const database of databases) await admin.$executeRawUnsafe(`DROP DATABASE \`${database}\``);
  if (userCreated) await admin.$executeRawUnsafe(`DROP USER '${username}'@'%'`);
  await admin.$disconnect();
  rmSync(root, { recursive: true, force: true });
}
