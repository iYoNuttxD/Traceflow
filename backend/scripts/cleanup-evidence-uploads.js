import { env } from '../src/config/env.js';
import { prisma } from '../src/database/prismaClient.js';
import { evidenceUploadService } from '../src/modules/testCases/services/evidence-upload.service.js';
import { assertMaintenanceDatabase } from './lib/database-safety.js';
const apply = process.argv.includes('--apply');
assertMaintenanceDatabase({
  databaseUrl: env.databaseUrl,
  apply,
  confirmProduction: process.argv.includes('--confirm-production'),
  confirmDevelopment: process.argv.includes('--confirm-development')
});
try {
  const result = await evidenceUploadService.cleanup({ dryRun: !apply });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.failed) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
