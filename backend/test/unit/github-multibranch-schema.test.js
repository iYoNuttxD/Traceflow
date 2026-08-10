import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const schemaPath = new URL('../../prisma/schema.prisma', import.meta.url);
const migrationPath = new URL(
  '../../prisma/migrations/20260810120000_l1_2_github_multibranch/migration.sql',
  import.meta.url
);

describe('schema e migration incremental multibranch L1.2', () => {
  it('modela branch e relação N:N sem remover Commit.branch', async () => {
    const schema = await readFile(schemaPath, 'utf8');
    expect(schema).toMatch(/model GitBranch[\s\S]*@@unique\(\[projectId, name\]\)/);
    expect(schema).toMatch(/model CommitBranch[\s\S]*@@id\(\[commitId, branchId\]\)/);
    expect(schema).toMatch(/model Commit[\s\S]*branch\s+String\?/);
    expect(schema).toMatch(/@@unique\(\[projectId, hash\]\)/);
  });

  it('faz backfill de branches e vínculos sem SQL destrutivo', async () => {
    const migration = await readFile(migrationPath, 'utf8');
    expect(migration).toMatch(/INSERT INTO `GitBranch`[\s\S]*FROM `Commit`/);
    expect(migration).toMatch(/INSERT INTO `CommitBranch`[\s\S]*INNER JOIN `GitBranch`/);
    expect(migration).toMatch(/`Commit`\.`branch` = `Project`\.`githubDefaultBranch`/);
    expect(migration).not.toMatch(/DROP\s+(?:TABLE|COLUMN)|DELETE\s+FROM|TRUNCATE/i);
  });
});
