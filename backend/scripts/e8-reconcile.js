import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { assertMaintenanceDatabase, sanitizedDatabaseTarget } from './lib/database-safety.js';
import { runE8Reconciliation } from './lib/e8-reconciliation.js';

dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: false, quiet: true });
dotenv.config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const apply = process.argv.includes('--apply');
const target = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
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
  const report = { target: sanitizedDatabaseTarget(target), ...(await runE8Reconciliation({ client: prisma, apply })) };
  const output = `${JSON.stringify(report, null, 2)}\n`;
  process.stdout.write(output);
  const reportPath = optionValue('--report');
  if (reportPath) await writeFile(reportPath, output, { flag: 'wx' });
} finally {
  await prisma.$disconnect();
}
