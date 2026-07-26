import { env } from '../src/config/env.js';
import { prisma } from '../src/database/prismaClient.js';
import { privacyService } from '../src/modules/privacy/privacy.service.js';
import { isProductionDatabase, sanitizedDatabaseTarget } from './lib/database-safety.js';

const apply = process.argv.includes('--apply');
if (
  apply &&
  isProductionDatabase(env.databaseUrl) &&
  !process.argv.includes('--confirm-production')
) {
  throw new Error('Execução em produção exige --confirm-production.');
}
try {
  const report = await privacyService.processDueDeletions({ dryRun: !apply });
  process.stdout.write(
    `${JSON.stringify({ ...report, database: sanitizedDatabaseTarget(env.databaseUrl) })}\n`
  );
} finally {
  await prisma.$disconnect();
}
