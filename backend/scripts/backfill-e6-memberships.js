import { writeFile } from 'node:fs/promises';
import { prisma } from '../src/database/prismaClient.js';
import { isProductionDatabase, sanitizedDatabaseTarget } from './lib/database-safety.js';
import { runMembershipBackfill } from './lib/membership-backfill.js';

function optionValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const apply = process.argv.includes('--apply');
const projectIdText = optionValue('--project-id');
const projectId = projectIdText === undefined ? undefined : Number(projectIdText);
const reportPath = optionValue('--report');
if (projectIdText !== undefined && (!Number.isInteger(projectId) || projectId <= 0))
  throw new Error('--project-id deve ser um inteiro positivo.');
if (
  apply &&
  isProductionDatabase(process.env.DATABASE_URL) &&
  !process.argv.includes('--confirm-production')
) {
  throw new Error('Backfill em banco de produção exige --confirm-production.');
}

try {
  const legacyTables = await prisma.$queryRawUnsafe(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ProjectMember'`
  );
  const report = legacyTables.length
    ? await runMembershipBackfill({ client: prisma, apply, projectId })
    : {
        mode: 'not-applicable',
        reason: 'LR2_CONTRACT_APPLIED',
        message: 'ProjectMember não existe no schema atual; o backfill E6 precede a LR.2.'
      };
  const output = { target: sanitizedDatabaseTarget(process.env.DATABASE_URL), ...report };
  process.stdout.write(`${JSON.stringify(output)}\n`);
  if (reportPath)
    await writeFile(reportPath, `${JSON.stringify(output, null, 2)}\n`, { flag: 'wx' });
} finally {
  await prisma.$disconnect();
}
