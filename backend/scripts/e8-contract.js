import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { assertMaintenanceDatabase, sanitizedDatabaseTarget } from './lib/database-safety.js';
import { auditE8Contract, runE8Contract } from './lib/e8-contract.js';

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

let report;
try {
  report = { target: sanitizedDatabaseTarget(target), ...(await runE8Contract({ client: prisma, apply })) };
  if (apply) {
    await prisma.$disconnect();
    const executable = resolve(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');
    const migration = spawnSync(executable, ['migrate', 'deploy'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: target },
      encoding: 'utf8'
    });
    if (migration.status !== 0) throw new Error('Falha ao aplicar migrations contract após o gate seguro.');
    const { PrismaClient } = await import('@prisma/client');
    const verificationClient = new PrismaClient();
    try {
      report.migrationsApplied = true;
      report.after = await auditE8Contract({ client: verificationClient });
    } finally {
      await verificationClient.$disconnect();
    }
  }
  const output = `${JSON.stringify(report, null, 2)}\n`;
  process.stdout.write(output);
  const reportPath = optionValue('--report');
  if (reportPath) await writeFile(reportPath, output, { flag: 'wx' });
} catch (error) {
  if (error.report) process.stderr.write(`${JSON.stringify({ target: sanitizedDatabaseTarget(target), blocked: error.report }, null, 2)}\n`);
  throw error;
} finally {
  await prisma.$disconnect();
}
