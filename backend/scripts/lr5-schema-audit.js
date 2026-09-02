import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { assertMaintenanceDatabase, sanitizedDatabaseTarget } from './lib/database-safety.js';

dotenv.config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });
if (process.argv.includes('--test'))
  dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: true, quiet: true });

const target = process.argv.includes('--test')
  ? process.env.TEST_DATABASE_URL
  : process.env.DATABASE_URL;
assertMaintenanceDatabase({
  databaseUrl: target,
  developmentDatabaseUrl: process.env.DATABASE_URL
});

const client = new PrismaClient({ datasourceUrl: target });

const number = (value) => Number(value ?? 0);

async function scalar(query, ...values) {
  const [row] = await client.$queryRawUnsafe(query, ...values);
  return number(Object.values(row || {})[0]);
}

try {
  const [server] = await client.$queryRawUnsafe(
    `SELECT VERSION() AS version,
            @@character_set_database AS databaseCharacterSet,
            @@collation_database AS databaseCollation`
  );
  const [branchColumn] = await client.$queryRawUnsafe(
    `SELECT COLUMN_TYPE AS columnType, IS_NULLABLE AS isNullable,
            CHARACTER_SET_NAME AS characterSet, COLLATION_NAME AS collation
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'GitBranch' AND COLUMN_NAME = 'name'`
  );
  const branchIndex = await client.$queryRawUnsafe(
    `SELECT INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS columns
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'GitBranch'
     GROUP BY INDEX_NAME, NON_UNIQUE
     ORDER BY INDEX_NAME`
  );
  const foreignKeys = await client.$queryRawUnsafe(
    `SELECT kcu.TABLE_NAME AS tableName, kcu.COLUMN_NAME AS columnName,
            kcu.REFERENCED_TABLE_NAME AS referencedTable,
            kcu.REFERENCED_COLUMN_NAME AS referencedColumn,
            DELETE_RULE AS deleteRule, UPDATE_RULE AS updateRule
     FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
     INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
       ON kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
      AND kcu.TABLE_NAME = rc.TABLE_NAME
      AND kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
     WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
       AND rc.TABLE_NAME IN (
         'ProjectMembership', 'ProjectInvitation', 'GitHubIdentity',
         'ProjectGitHubIntegration', 'AuditEvent', 'GitBranch', 'CommitBranch'
       )
     ORDER BY kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION`
  );
  const indexes = await client.$queryRawUnsafe(
    `SELECT TABLE_NAME AS tableName, INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique,
            GROUP_CONCAT(
              CONCAT_WS(':', COALESCE(COLUMN_NAME, '<expression>'),
                        COALESCE(SUB_PART, ''), COALESCE(COLLATION, ''))
              ORDER BY SEQ_IN_INDEX SEPARATOR ','
            ) AS columns
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME <> 'PRIMARY'
     GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE
     ORDER BY TABLE_NAME, INDEX_NAME`
  );
  const indexDefinitions = new Map();
  for (const index of indexes) {
    const key = `${index.tableName}:${index.nonUnique}:${index.columns}`;
    const definitions = indexDefinitions.get(key) || [];
    definitions.push({ name: index.indexName, unique: number(index.nonUnique) === 0 });
    indexDefinitions.set(key, definitions);
  }
  const duplicateIndexes = [...indexDefinitions.entries()]
    .filter(([, definitions]) => definitions.length > 1)
    .map(([definition, definitions]) => ({ definition, indexes: definitions }));

  const branchStats = {
    total: await scalar('SELECT COUNT(*) AS total FROM `GitBranch`'),
    exactDistinct: await scalar(
      'SELECT COUNT(DISTINCT CONCAT(`projectId`, 0x1f, BINARY `name`)) AS total FROM `GitBranch`'
    ),
    foldedDistinct: await scalar(
      'SELECT COUNT(DISTINCT CONCAT(`projectId`, 0x1f, LOWER(`name`))) AS total FROM `GitBranch`'
    ),
    exactDuplicateGroups: await scalar(
      `SELECT COUNT(*) AS total FROM (
         SELECT projectId, BINARY name AS exactName
         FROM GitBranch
         GROUP BY projectId, BINARY name
         HAVING COUNT(*) > 1
       ) duplicates`
    ),
    caseVariantGroups: await scalar(
      `SELECT COUNT(*) AS total FROM (
         SELECT projectId, LOWER(name) AS foldedName
         FROM GitBranch
         GROUP BY projectId, LOWER(name)
         HAVING COUNT(DISTINCT BINARY name) > 1
       ) variants`
    )
  };

  const orphanChecks = {
    membershipWithoutUser: await scalar(
      `SELECT COUNT(*) FROM ProjectMembership m
       LEFT JOIN User u ON u.id = m.userId WHERE u.id IS NULL`
    ),
    membershipWithoutProject: await scalar(
      `SELECT COUNT(*) FROM ProjectMembership m
       LEFT JOIN Project p ON p.id = m.projectId WHERE p.id IS NULL`
    ),
    invitationWithoutProject: await scalar(
      `SELECT COUNT(*) FROM ProjectInvitation i
       LEFT JOIN Project p ON p.id = i.projectId WHERE p.id IS NULL`
    ),
    identityWithoutUser: await scalar(
      `SELECT COUNT(*) FROM GitHubIdentity i
       LEFT JOIN User u ON u.id = i.userId WHERE u.id IS NULL`
    ),
    integrationWithoutProject: await scalar(
      `SELECT COUNT(*) FROM ProjectGitHubIntegration i
       LEFT JOIN Project p ON p.id = i.projectId WHERE p.id IS NULL`
    ),
    branchWithoutProject: await scalar(
      `SELECT COUNT(*) FROM GitBranch b
       LEFT JOIN Project p ON p.id = b.projectId WHERE p.id IS NULL`
    ),
    commitBranchWithoutCommit: await scalar(
      `SELECT COUNT(*) FROM CommitBranch cb
       LEFT JOIN Commit c ON c.id = cb.commitId WHERE c.id IS NULL`
    ),
    commitBranchWithoutBranch: await scalar(
      `SELECT COUNT(*) FROM CommitBranch cb
       LEFT JOIN GitBranch b ON b.id = cb.branchId WHERE b.id IS NULL`
    )
  };
  const projectsWithoutActiveOwner = await scalar(
    `SELECT COUNT(*) FROM Project p
     WHERE p.status <> 'EXCLUIDO'
       AND NOT EXISTS (
         SELECT 1 FROM ProjectMembership m
         WHERE m.projectId = p.id AND m.role = 'OWNER' AND m.isActive = true
       )`
  );
  const caseSensitive = /(?:_bin|_cs)$/i.test(branchColumn?.collation || '');
  const orphanTotal = Object.values(orphanChecks).reduce((sum, value) => sum + value, 0);
  const report = {
    mode: 'LR5_SCHEMA_AUDIT',
    target: sanitizedDatabaseTarget(target),
    server,
    gitBranch: {
      column: branchColumn || null,
      caseSensitive,
      preflight: branchStats,
      indexes: branchIndex.map((index) => ({
        ...index,
        nonUnique: number(index.nonUnique)
      }))
    },
    referentialIntegrity: {
      foreignKeyCount: foreignKeys.length,
      orphanChecks,
      orphanTotal,
      projectsWithoutActiveOwner
    },
    indexes: {
      inspected: indexes.length,
      exactDuplicateDefinitions: duplicateIndexes
    },
    decision:
      branchStats.exactDuplicateGroups > 0
        ? 'BLOCKED_EXACT_DUPLICATES'
        : !caseSensitive
          ? 'MIGRATION_REQUIRED'
          : orphanTotal > 0 || projectsWithoutActiveOwner > 0
            ? 'INTEGRITY_BLOCKED'
            : 'SCHEMA_CONSISTENT'
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (
    process.argv.includes('--enforce') &&
    (!caseSensitive ||
      branchStats.exactDuplicateGroups > 0 ||
      orphanTotal > 0 ||
      projectsWithoutActiveOwner > 0)
  ) {
    process.exitCode = 2;
  }
} finally {
  await client.$disconnect();
}
