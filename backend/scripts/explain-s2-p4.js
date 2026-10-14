import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { validateTestDatabaseUrl } from './lib/database-safety.js';

dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: false, quiet: true });
dotenv.config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });
const url = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
const prisma = new PrismaClient({ datasourceUrl: url });

const statements = {
  currentAggregate: `EXPLAIN SELECT COUNT(*), SUM(status = 'EM_ANDAMENTO'), SUM(estimatedEffort),
    SUM(actualEffort) FROM Task WHERE projectId = 1`,
  movementHistory: `EXPLAIN SELECT id, taskId, fromStatus, toStatus, movedAt FROM TaskMovement
    WHERE projectId = 1 AND movedAt < '2026-09-26' ORDER BY taskId, movedAt, id`,
  overdueTopTen: `EXPLAIN SELECT id, deadline FROM Task WHERE projectId = 1
    AND deadline < '2026-09-26' AND status <> 'CONCLUIDO'
    ORDER BY deadline, id LIMIT 10`,
  effortTopTen: `EXPLAIN SELECT id, estimatedEffort, actualEffort FROM Task WHERE projectId = 1
    AND estimatedEffort IS NOT NULL AND actualEffort IS NOT NULL
    AND actualEffort > estimatedEffort ORDER BY (actualEffort - estimatedEffort) DESC, id LIMIT 10`
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
