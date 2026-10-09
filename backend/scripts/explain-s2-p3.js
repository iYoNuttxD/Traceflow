import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { validateTestDatabaseUrl } from './lib/database-safety.js';

dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: false, quiet: true });
dotenv.config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });
const url = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
const prisma = new PrismaClient({ datasourceUrl: url });

const statements = {
  lifecycleCohort: `
    EXPLAIN SELECT c.pullRequestId FROM (
      SELECT pullRequestId, MIN(occurredAt) AS firstClosed
      FROM PullRequestLifecycleEvent
      WHERE projectId = 1 AND eventType = 'CLOSED'
        AND occurredAt >= '2026-09-01' AND occurredAt < '2026-10-01'
      GROUP BY pullRequestId
    ) c JOIN PullRequest p ON p.id = c.pullRequestId AND p.projectId = 1`,
  reopenLookup: `
    EXPLAIN SELECT id FROM PullRequestLifecycleEvent
    WHERE projectId = 1 AND pullRequestId = 1 AND eventType = 'REOPENED'
      AND occurredAt > '2026-09-01' AND occurredAt < '2026-10-01'`,
  mergedPeriod: `
    EXPLAIN SELECT id, createdAtGithub, mergedAtGithub FROM PullRequest
    WHERE projectId = 1 AND mergedAtGithub >= '2026-09-01'
      AND mergedAtGithub < '2026-10-01'`,
  oldestOpen: `
    EXPLAIN SELECT id, number, title, createdAtGithub FROM PullRequest
    WHERE projectId = 1 AND state = 'open' AND createdAtGithub IS NOT NULL
    ORDER BY createdAtGithub ASC, id ASC LIMIT 10`
};

try {
  for (const [name, sql] of Object.entries(statements)) {
    const plan = await prisma.$queryRawUnsafe(sql);
    process.stdout.write(
      `${JSON.stringify({ name, plan }, (_, value) => (typeof value === 'bigint' ? Number(value) : value))}\n`
    );
  }
} finally {
  await prisma.$disconnect();
}
