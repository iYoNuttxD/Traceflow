import { pathToFileURL } from 'node:url';
import { env } from '../../config/env.js';
import { enforceConnectionBudget } from '../../database/connection-budget.js';
import { disconnectDatabase } from '../../database/prismaClient.js';
import { traceabilityAlertService } from '../../modules/traceability/traceability-alert.service.js';
import { isProductionDatabase, sanitizedDatabaseTarget } from '../../database/database-safety.js';
import { withJobLease } from '../job-lease.js';
import { JOB_NAMES } from '../job-names.js';

const flags = ['--apply', '--dry-run', '--confirm-production'];

export function parseAlertReconciliationArguments(args) {
  const project = args.find((arg) => arg.startsWith('--project-id='));
  const projectId = project === undefined ? null : Number(project.split('=')[1]);
  if (
    (project !== undefined &&
      (!Number.isSafeInteger(projectId) || projectId < 1 || projectId > 2147483647)) ||
    args.some((arg) => arg !== project && !flags.includes(arg)) ||
    (args.includes('--apply') && args.includes('--dry-run'))
  ) {
    throw new Error(
      'Uso: [--project-id=<id>] [--dry-run | --apply] [--confirm-production]. Padrão: dry-run.'
    );
  }
  return {
    projectId,
    dryRun: !args.includes('--apply'),
    confirmProduction: args.includes('--confirm-production')
  };
}

export async function runAlertReconciliation({
  args,
  service,
  databaseUrl,
  write = (text) => process.stdout.write(text),
  writeError = (text) => process.stderr.write(text),
  lease = withJobLease
}) {
  try {
    const { projectId, dryRun, confirmProduction } = parseAlertReconciliationArguments(args);
    if (!dryRun && isProductionDatabase(databaseUrl) && !confirmProduction)
      throw new Error('Execução em produção exige --confirm-production.');
    const reconcile = async (signal) =>
      projectId
        ? [
            {
              projectId,
              ...(await service.reconcileProject(projectId, { dryRun, trigger: 'SCRIPT' }))
            }
          ]
        : service.reconcileAllProjects({ dryRun, trigger: 'SCRIPT', signal });
    const outcome = dryRun
      ? { acquired: true, result: await reconcile(null) }
      : await lease(JOB_NAMES.TRACEABILITY_ALERTS, reconcile);
    if (!outcome.acquired) {
      writeError(
        `Outra execução do job ${JOB_NAMES.TRACEABILITY_ALERTS} está em andamento; tente de novo depois.\n`
      );
      return 1;
    }
    write(
      `${JSON.stringify(
        { dryRun, projects: outcome.result, database: sanitizedDatabaseTarget(databaseUrl) },
        null,
        2
      )}\n`
    );
    return 0;
  } catch (error) {
    writeError(
      `${error instanceof Error && !error.code ? error.message : 'Reconciliação de alertas falhou.'}\n`
    );
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  enforceConnectionBudget('command');
  try {
    process.exitCode = await runAlertReconciliation({
      args: process.argv.slice(2),
      service: traceabilityAlertService,
      databaseUrl: env.databaseUrl
    });
  } finally {
    await disconnectDatabase();
  }
}
