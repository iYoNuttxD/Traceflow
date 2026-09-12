import 'dotenv/config';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { mkdtempSync, cpSync, rmSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { validateTestDatabaseUrl, canonicalizeLocalDatabaseHost } from './lib/database-safety.js';
dotenv.config({ path: '.env.test', override: false, quiet: true });
const source = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
const target = new URL(source);
assert.equal(canonicalizeLocalDatabaseHost(target.hostname), 'local');
const admin = new PrismaClient({ datasourceUrl: source });
const temporary = mkdtempSync(join(tmpdir(), 'traceflow-s109-migration-'));
const migration = '20260912010000_s109_lifecycle_effort_history';
function migrate(url, schema, action = 'deploy') {
  const result = spawnSync(
    process.execPath,
    [resolve('node_modules/prisma/build/index.js'), 'migrate', action, '--schema', schema],
    { env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' }
  );
  assert.equal(result.status, 0, `Migration ${action} failed (${result.status})`);
}
try {
  cpSync('prisma/schema.prisma', join(temporary, 'schema.prisma'));
  mkdirSync(join(temporary, 'migrations'));
  for (const name of readdirSync('prisma/migrations'))
    if (name !== migration)
      cpSync(join('prisma/migrations', name), join(temporary, 'migrations', name), {
        recursive: true
      });
  for (const populated of [false, true]) {
    const database = `traceflow_test_s109_upgrade_${Date.now()}_${populated ? 'populated' : 'empty'}`;
    target.pathname = `/${database}`;
    let client;
    await admin.$executeRawUnsafe(`CREATE DATABASE \`${database}\``);
    try {
      const url = target.toString();
      migrate(url, populated ? join(temporary, 'schema.prisma') : resolve('prisma/schema.prisma'));
      client = new PrismaClient({ datasourceUrl: url });
      if (populated) {
        const project = await client.project.create({
          data: {
            name: 'Migration QA',
            responsibleTeam: 'QA',
            accessCode: `QA-${Date.now()}`,
            status: 'ATIVO'
          }
        });
        const req = await client.requirement.create({
          data: { projectId: project.id, title: 'Legacy requirement', status: 'APROVADO' }
        });
        const user = await client.user.create({
          data: {
            name: 'QA',
            email: `qa-${Date.now()}@example.invalid`,
            username: `qa${Date.now()}`,
            passwordHash: 'not-a-login-hash'
          }
        });
        const task = await client.task.create({
          data: { projectId: project.id, requirementId: req.id, title: 'Work', actualEffort: 3 }
        });
        await client.taskTimeEntry.create({
          data: {
            projectId: project.id,
            taskId: task.id,
            source: 'MANUAL',
            startedAt: new Date('2026-09-01T09:00:00Z'),
            endedAt: new Date('2026-09-01T12:00:00Z'),
            durationSeconds: 10800,
            startedById: user.id,
            endedById: user.id
          }
        });
        const snapshot = JSON.stringify(
          await Promise.all([
            client.requirement.findMany(),
            client.task.findMany(),
            client.taskTimeEntry.findMany()
          ])
        );
        migrate(url, resolve('prisma/schema.prisma'));
        assert.equal(
          JSON.stringify(
            await Promise.all([
              client.requirement.findMany(),
              client.task.findMany(),
              client.taskTimeEntry.findMany()
            ])
          ),
          snapshot
        );
      }
      assert.equal(await client.taskEffortHistoryEntry.count(), 0);
      migrate(url, resolve('prisma/schema.prisma'), 'status');
      console.log(
        JSON.stringify({
          scenario: populated ? 'representative populated upgrade' : 'empty full chain',
          result: 'PASS',
          preserved: populated,
          history: 0,
          migrationStatus: 'up to date'
        })
      );
    } finally {
      await client?.$disconnect();
      await admin.$executeRawUnsafe(`DROP DATABASE \`${database}\``);
    }
  }
} finally {
  await admin.$disconnect();
  rmSync(temporary, { recursive: true, force: true });
}
