import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const schema = read('prisma/schema.prisma');
const basisMigration = read(
  'prisma/migrations/20261013171000_requirement_lifecycle_basis/migration.sql'
);
const manualMigration = read(
  'prisma/migrations/20261013170000_manual_test_execution_reference/migration.sql'
);

describe('standalone provenance persistence contract (structural)', () => {
  it('keeps legacy direct writers on GITHUB and makes lifecycle basis explicit', () => {
    expect(schema).toMatch(/enum RequirementLifecycleBasis\s*\{\s*LOCAL\s*GITHUB\s*\}/);
    expect(schema).toMatch(/lifecycleBasis\s+RequirementLifecycleBasis\s+@default\(GITHUB\)/);
    expect(basisMigration).toContain("ENUM('LOCAL', 'GITHUB') NOT NULL DEFAULT 'GITHUB'");
  });
  it('backfills only integration-absent projects and preserves historical records', () => {
    expect(basisMigration).toMatch(
      /LEFT JOIN `ProjectGitHubIntegration` AS g ON g\.`projectId` = r\.`projectId`/
    );
    expect(basisMigration).toMatch(/SET r\.`lifecycleBasis` = 'LOCAL'\s+WHERE g\.`id` IS NULL;/);
    expect(basisMigration).not.toMatch(
      /UPDATE\s+`?TestExecution|UPDATE\s+`?RequirementTraceabilityHistoryEntry|DELETE\s+FROM\s+`?RequirementTraceabilityHistoryEntry/
    );
    expect(basisMigration).toContain("JSON_OBJECT('rulesVersion', 4, 'lifecycleBasis', 'LOCAL',");
    expect(basisMigration).toContain("'LIFECYCLE_BASIS_MIGRATION'");
    expect(basisMigration.indexOf('START TRANSACTION;')).toBeLessThan(
      basisMigration.indexOf('UPDATE `Requirement`')
    );
    expect(basisMigration.trim().endsWith('COMMIT;')).toBe(true);
  });
  it('declares both projection text columns with the persisted schema collation', () => {
    for (const column of ['situation', 'lifecycleStatus'])
      expect(basisMigration).toContain(
        `\`${column}\` VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL`
      );
    expect(basisMigration).not.toMatch(/CREATE TEMPORARY TABLE `[^`]+` AS/);
    expect(basisMigration).toContain(
      'INSERT INTO `_StandaloneRequirementProjection` (`id`, `projectId`, `situation`, `lifecycleStatus`)'
    );
  });
  it('extends the execution discriminator without manufacturing an imported reference', () => {
    expect(manualMigration).toContain("ENUM('PULL_REQUEST', 'COMMIT', 'MANUAL')");
    expect(manualMigration).toContain(
      "`testedReferenceType` = 'MANUAL' AND `testedPullRequestId` IS NULL AND `testedCommitId` IS NULL"
    );
    expect(manualMigration).toContain(
      "`testedReferenceType` = 'PULL_REQUEST' AND `testedPullRequestId` IS NOT NULL AND `testedCommitId` IS NULL"
    );
    expect(manualMigration).toContain(
      "`testedReferenceType` = 'COMMIT' AND `testedCommitId` IS NOT NULL AND `testedPullRequestId` IS NULL"
    );
  });
});
