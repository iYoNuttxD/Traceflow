import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { assertMaintenanceDatabase, sanitizedDatabaseTarget } from './lib/database-safety.js';
import { runAdr011MilestoneSprintAudit } from './lib/adr011-milestone-sprint-audit.js';

dotenv.config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });
if (process.argv.includes('--test'))
  dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: true, quiet: true });

const target = process.argv.includes('--test')
  ? process.env.TEST_DATABASE_URL
  : process.env.DATABASE_URL;
// Somente leitura: nao ha `--apply`, entao a guarda so precisa recusar um alvo
// ausente ou malformado.
assertMaintenanceDatabase({
  databaseUrl: target,
  developmentDatabaseUrl: process.env.DATABASE_URL
});
process.env.DATABASE_URL = target;
const { prisma } = await import('../src/database/prismaClient.js');

try {
  const report = await runAdr011MilestoneSprintAudit({ client: prisma });
  process.stdout.write(
    `${JSON.stringify({ target: sanitizedDatabaseTarget(target), ...report }, null, 2)}\n`
  );
  // Saida 1 quando ha perda de vinculo: quem roda no terminal ve o relatorio, e
  // quem encadeia com `&&` para de aplicar a migration sem ter lido a lista.
  if (report.sprintsComVariosMarcos?.length) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
