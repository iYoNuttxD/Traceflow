import { readdir } from 'node:fs/promises';
import { prisma } from './prismaClient.js';

// The release carries its immutable migration chain. Health never applies it.
let expectedMigrations;
export async function checkDatabaseReadiness(client = prisma) {
  expectedMigrations ||= readdir(new URL('../../prisma/migrations/', import.meta.url)).then(
    (names) => names.filter((name) => /^\d/.test(name))
  );
  await client.$queryRaw`SELECT 1`;
  const applied =
    await client.$queryRaw`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations`;
  const finished = new Set(
    applied.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name)
  );
  if (applied.some((row) => !row.finished_at && !row.rolled_back_at)) return false;
  if (!(await expectedMigrations).every((name) => finished.has(name))) return false;
  // Detect an empty/removed operational schema too; not a substitute for migration drift gates.
  await client.$queryRaw`SELECT id FROM Session LIMIT 0`;
  await client.$queryRaw`SELECT id FROM GitHubSyncRun LIMIT 0`;
  return true;
}
