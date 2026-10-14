import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { validateTestDatabaseUrl } from './lib/database-safety.js';

dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: false, quiet: true });
dotenv.config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });
const url = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
const prisma = new PrismaClient({ datasourceUrl: url });

const statements = {
  burnupEvents: `EXPLAIN SELECT id, taskKey, type, previousPoints, newPoints,
    fromStatus, toStatus, occurredAt FROM SprintBurnupEvent
    WHERE projectId = 1 AND sprintId = 1 ORDER BY occurredAt, id`,
  scopeMemberships: `EXPLAIN SELECT st.id, st.taskId, t.estimatedEffort, t.status
    FROM SprintTask st LEFT JOIN Task t ON t.id = st.taskId
    WHERE st.sprintId = 1 AND st.id IN (1, 2, 3)`,
  activeParticipation: `EXPLAIN SELECT st.id, s.projectId, s.status, s.burnupCoverageStartedAt
    FROM SprintTask st JOIN Sprint s ON s.id = st.sprintId
    WHERE st.sprintId = 1 AND st.taskId = 1 AND st.removedAt IS NULL AND st.closedAt IS NULL`
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
