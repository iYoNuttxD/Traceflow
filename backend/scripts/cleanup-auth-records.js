import { prisma } from '../src/database/prismaClient.js';
import { cleanupAuthRecords } from '../src/shared/maintenance/auth-cleanup.js';

const apply = process.argv.includes('--apply');
try {
  const report = await cleanupAuthRecords({ apply });
  process.stdout.write(`${JSON.stringify(report)}\n`);
} finally {
  await prisma.$disconnect();
}
