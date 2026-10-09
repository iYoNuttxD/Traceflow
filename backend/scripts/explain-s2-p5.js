import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { validateTestDatabaseUrl } from './lib/database-safety.js';

dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: false, quiet: true });
dotenv.config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });
const url = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
const prisma = new PrismaClient({ datasourceUrl: url });

const statements = {
  projectSprints: `EXPLAIN SELECT id, status, closedAt FROM Sprint
    WHERE projectId = 1 AND deletedAt IS NULL ORDER BY id`,
  velocityParticipations: `EXPLAIN SELECT sprintId, removedAt, pointsAtClose, exitStatus
    FROM SprintTask WHERE projectId = 1 AND sprintId IN (1, 2, 3)`,
  selectedParticipations: `EXPLAIN SELECT id, taskId, plannedAtStart, pointsAtPlanning,
    pointsAtClose, removedAt FROM SprintTask WHERE sprintId = 1 ORDER BY taskId`,
  selectedEffort: `EXPLAIN SELECT taskId, pointsAtClose, closingTaskSnapshot
    FROM SprintTask WHERE sprintId = 1 AND removedAt IS NULL ORDER BY id`
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
