import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { assertMaintenanceDatabase, sanitizedDatabaseTarget } from './lib/database-safety.js';
import { runLr2LegacyRecovery } from './lib/lr2-legacy-recovery.js';

dotenv.config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });
if (process.argv.includes('--test'))
  dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: true, quiet: true });

const apply = process.argv.includes('--apply');
const target = process.argv.includes('--test')
  ? process.env.TEST_DATABASE_URL
  : process.env.DATABASE_URL;

assertMaintenanceDatabase({
  databaseUrl: target,
  developmentDatabaseUrl: process.env.DATABASE_URL,
  apply,
  confirmDevelopment: process.argv.includes('--confirm-development'),
  confirmProduction: process.argv.includes('--confirm-production')
});

const client = new PrismaClient({ datasourceUrl: target });
try {
  const report = await runLr2LegacyRecovery({ client, apply });
  process.stdout.write(
    `${JSON.stringify({ target: sanitizedDatabaseTarget(target), ...report }, null, 2)}\n`
  );
  if (apply && report.status === 'BLOCKED') process.exitCode = 2;
} finally {
  await client.$disconnect();
}
