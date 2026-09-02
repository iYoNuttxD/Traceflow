import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';
import { assertMaintenanceDatabase, sanitizedDatabaseTarget } from './lib/database-safety.js';
import {
  auditE11LegacyResponsibilities,
  buildTaskMappingFile
} from './lib/e11-legacy-responsibility.js';

dotenv.config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });
if (process.argv.includes('--test'))
  dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: true, quiet: true });

const target = process.argv.includes('--test')
  ? process.env.TEST_DATABASE_URL
  : process.env.DATABASE_URL;
assertMaintenanceDatabase({
  databaseUrl: target,
  developmentDatabaseUrl: process.env.DATABASE_URL
});
process.env.DATABASE_URL = target;
const mappingPath = resolve(process.cwd(), '.local/e11-task-responsibility-mapping.json');
const { prisma } = await import('../src/database/prismaClient.js');

try {
  const legacyColumns = await prisma.$queryRawUnsafe(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'TaskMovement'
       AND COLUMN_NAME = 'projectMemberId'`
  );
  if (legacyColumns.length === 0) {
    process.stdout.write(
      `${JSON.stringify({
        mode: 'not-applicable',
        target: sanitizedDatabaseTarget(target),
        reason: 'LR2_CONTRACT_APPLIED',
        message: 'projectMemberId não existe no schema atual; a auditoria E11 precede a LR.2.'
      })}\n`
    );
  } else {
    const { state, audit } = await auditE11LegacyResponsibilities({ client: prisma });
    let previousMappings = [];
    try {
      previousMappings = JSON.parse(await readFile(mappingPath, 'utf8')).mappings || [];
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const mapping = buildTaskMappingFile({
      tasks: state.tasks,
      memberships: state.memberships,
      previousMappings
    });
    await mkdir(dirname(mappingPath), { recursive: true, mode: 0o700 });
    await chmod(dirname(mappingPath), 0o700);
    await writeFile(mappingPath, `${JSON.stringify(mapping, null, 2)}\n`, { mode: 0o600 });
    await chmod(mappingPath, 0o600);
    process.stdout.write(
      `${JSON.stringify(
        {
          mode: 'audit',
          target: sanitizedDatabaseTarget(target),
          ...audit,
          localMapping: {
            path: '.local/e11-task-responsibility-mapping.json',
            entries: mapping.mappings.length,
            versioned: false
          }
        },
        null,
        2
      )}\n`
    );
  }
} finally {
  await prisma.$disconnect();
}
