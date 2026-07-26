import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { assertMaintenanceDatabase, sanitizedDatabaseTarget } from './lib/database-safety.js';
import { runE11LegacyReconciliation } from './lib/e11-legacy-responsibility.js';

dotenv.config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });
if (process.argv.includes('--test')) dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: true, quiet: true });

const apply = process.argv.includes('--apply');
const target = process.argv.includes('--test') ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
assertMaintenanceDatabase({
  databaseUrl: target,
  developmentDatabaseUrl: process.env.DATABASE_URL,
  apply,
  confirmDevelopment: process.argv.includes('--confirm-development'),
  confirmProduction: process.argv.includes('--confirm-production')
});
process.env.DATABASE_URL = target;
const mappingPath = resolve(process.cwd(), '.local/e11-task-responsibility-mapping.json');
const { prisma } = await import('../src/database/prismaClient.js');

try {
  let mappings = [];
  try { mappings = JSON.parse(await readFile(mappingPath, 'utf8')).mappings || []; } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const report = await runE11LegacyReconciliation({ client: prisma, mappings, apply });
  process.stdout.write(`${JSON.stringify({ target: sanitizedDatabaseTarget(target), ...report }, null, 2)}\n`);
} finally {
  await prisma.$disconnect();
}
