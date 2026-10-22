// Disposable local/CI schema only. Never erase or reuse an existing test database.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { validateTestDatabaseUrl } from './lib/database-safety.js';
const baseline = process.argv[2];
assert.match(baseline ?? '', /^[a-f0-9]{40}$/);
const url = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
const client = new PrismaClient({ datasourceUrl: url });
const temporary = await mkdtemp(join(tmpdir(), 'traceflow-transition-'));
const cli = resolve('node_modules/prisma/build/index.js');
const started = Date.now();
const digest = (s) => createHash('sha256').update(s).digest('hex');
function git(...args) {
  const r = spawnSync('git', ['-C', resolve('..'), ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'Git source required.');
  return r.stdout;
}
function deploy(schema) {
  const p = spawnSync(process.execPath, [cli, 'migrate', 'deploy', '--schema', schema], {
    env: { ...process.env, DATABASE_URL: url },
    encoding: 'utf8',
    timeout: 180000
  });
  assert.equal(
    p.status,
    0,
    (p.stderr || p.stdout || 'Migration failed.').replaceAll(url, '[TEST_DB]')
  );
}
const quote = (s) => `\`${String(s).replaceAll('`', '``')}\``;
async function snapshot(columns) {
  const result = {};
  for (const [table, names] of Object.entries(columns)) {
    const rows = await client.$queryRawUnsafe(
      `SELECT CAST(JSON_ARRAY(${names.map(quote).join(',')}) AS CHAR) AS rowValue FROM ${quote(table)}`
    );
    result[table] = {
      count: rows.length,
      sha256: digest(
        rows
          .map((r) => r.rowValue)
          .sort()
          .join('\n')
      )
    };
  }
  return result;
}
try {
  const tables =
    await client.$queryRaw`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()`;
  assert.equal(
    tables.length,
    0,
    'Owned test schema must be empty; never erase an existing database.'
  );
  const files = git('ls-tree', '-r', '--name-only', baseline, '--', 'backend/prisma')
    .trim()
    .split('\n');
  for (const file of files) {
    const path = join(temporary, file.replace('backend/prisma/', ''));
    await mkdir(resolve(path, '..'), { recursive: true });
    await writeFile(path, git('show', `${baseline}:${file}`));
  }
  deploy(join(temporary, 'schema.prisma'));
  const beforeHistory =
    await client.$queryRaw`SELECT migration_name, checksum FROM _prisma_migrations`;
  const user = await client.user.create({
    data: {
      name: 'Upgrade sintético',
      username: 'upgrade_synthetic',
      email: 'upgrade@example.invalid'
    },
    select: { id: true }
  });
  const project = await client.project.create({
    data: {
      name: 'Upgrade sintético',
      responsibleTeam: 'QA isolado',
      accessCode: 'INTEGRATION-UPGRADE'
    },
    select: { id: true }
  });
  await client.projectMembership.create({
    data: { userId: user.id, projectId: project.id, role: 'OWNER' },
    select: { id: true }
  });
  const requirement = await client.requirement.create({
    data: { projectId: project.id, title: 'Preservar dados' },
    select: { id: true }
  });
  const pr = await client.pullRequest.create({
    data: {
      projectId: project.id,
      number: 1,
      title: 'PR sintética',
      state: 'open',
      githubId: '9007199254740993123'
    },
    select: { id: true }
  });
  const issue = await client.issue.create({
    data: {
      projectId: project.id,
      number: 2,
      title: 'Issue sintética',
      state: 'open',
      githubId: '9007199254740993124'
    },
    select: { id: true }
  });
  const task = await client.task.create({
    data: {
      projectId: project.id,
      requirementId: requirement.id,
      responsibleUserId: user.id,
      pullRequestId: pr.id,
      title: 'Histórico deve persistir',
      actualEffort: 2.5
    },
    select: { id: true }
  });
  await client.taskIssue.create({
    data: { taskId: task.id, issueId: issue.id },
    select: { taskId: true }
  });
  await client.projectGitHubIntegration.create({
    data: {
      projectId: project.id,
      githubRepositoryId: '9007199254740993999',
      autoSyncEnabled: false
    },
    select: { id: true }
  });
  const cols =
    await client.$queryRaw`SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME!='_prisma_migrations' ORDER BY TABLE_NAME,ORDINAL_POSITION`;
  const columns = {};
  for (const { t, c } of cols) (columns[t] ??= []).push(c);
  const presentTables = new Set(Object.keys(columns));
  // On a starting schema that already has the link/event tables, seed the same valid facts.
  if (presentTables.has('TaskArtifactLinkPeriod')) {
    await client.taskArtifactLinkPeriod.createMany({
      data: [
        { projectId: project.id, taskId: task.id, issueId: issue.id },
        { projectId: project.id, taskId: task.id, pullRequestId: pr.id }
      ]
    });
  }
  if (presentTables.has('GitHubEventCoverage')) {
    await client.gitHubEventCoverage.create({
      data: { projectId: project.id, coverageFrom: new Date(), comparedBefore: true }
    });
  }
  const before = await snapshot(columns);
  deploy(resolve('prisma/schema.prisma'));
  assert.deepEqual(
    await snapshot(columns),
    before,
    'Every pre-existing column and row must remain exact.'
  );
  const history =
    await client.$queryRaw`SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations`;
  const expected = [];
  for (const file of git('ls-files', 'backend/prisma/migrations/*/migration.sql')
    .trim()
    .split('\n'))
    expected.push({
      name: file.split('/').at(-2),
      sha256: digest(await readFile(resolve('..', file)))
    });
  const map = new Map(expected.map((m) => [m.name, m.sha256]));
  assert.equal(history.length, map.size);
  assert.equal(new Set(history.map((m) => m.migration_name)).size, history.length);
  for (const row of history) {
    assert.equal(row.checksum, map.get(row.migration_name));
    assert.ok(row.finished_at && !row.rolled_back_at);
  }
  for (const row of beforeHistory) assert.equal(row.checksum, map.get(row.migration_name));
  assert.equal(await client.taskArtifactLinkPeriod.count(), 2, 'PR/issue backfills.');
  assert.equal(await client.gitHubEventCoverage.count(), 1, 'Durable-event coverage backfill.');
  const keys =
    await client.$queryRaw`SELECT TABLE_NAME AS t,CONSTRAINT_NAME AS n,COLUMN_NAME AS c,REFERENCED_TABLE_NAME AS rt,REFERENCED_COLUMN_NAME AS rc FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION`;
  const groups = new Map();
  for (const row of keys) {
    const k = `${row.t}.${row.n}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(row);
  }
  for (const rows of groups.values()) {
    const on = rows.map((r) => `s.${quote(r.c)}=d.${quote(r.rc)}`).join(' AND '),
      present = rows.map((r) => `s.${quote(r.c)} IS NOT NULL`).join(' AND ');
    const [r] = await client.$queryRawUnsafe(
      `SELECT COUNT(*) AS n FROM ${quote(rows[0].t)} s LEFT JOIN ${quote(rows[0].rt)} d ON ${on} WHERE ${present} AND d.${quote(rows[0].rc)} IS NULL`
    );
    assert.equal(Number(r.n), 0, 'Orphaned FK.');
  }
  console.log(
    JSON.stringify({
      status: 'ISOLATED_UPGRADE_PASS',
      baseline,
      fromSchemaSha256: digest(git('show', `${baseline}:backend/prisma/schema.prisma`)),
      toSchemaSha256: digest(await readFile('prisma/schema.prisma')),
      from: beforeHistory.length,
      to: history.length,
      added: expected.filter((x) => !beforeHistory.some((r) => r.migration_name === x.name)),
      preservedTables: Object.keys(before).length,
      preservedRows: Object.values(before).reduce((s, r) => s + r.count, 0),
      foreignKeys: groups.size,
      backfills: true,
      mysql: (await client.$queryRaw`SELECT VERSION() AS v`)[0].v,
      seconds: (Date.now() - started) / 1000,
      productionUsed: false
    })
  );
} finally {
  await client.$disconnect();
  await rm(temporary, { recursive: true, force: true });
}
