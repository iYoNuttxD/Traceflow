import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { assertMaintenanceDatabase, sanitizedDatabaseTarget } from './lib/database-safety.js';
import { runS104LegacyScheduleDates } from './lib/s104-legacy-schedule-dates.js';

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
process.env.DATABASE_URL = target;
const { prisma } = await import('../src/database/prismaClient.js');

try {
  const report = await runS104LegacyScheduleDates({ client: prisma, apply });
  process.stdout.write(
    `${JSON.stringify(
      {
        target: sanitizedDatabaseTarget(target),
        fusoDoProcesso: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...report
      },
      null,
      2
    )}\n`
  );
  if (report.conflitos.length) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
