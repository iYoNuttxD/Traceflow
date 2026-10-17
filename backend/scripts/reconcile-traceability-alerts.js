import { pathToFileURL } from 'node:url';
import { env } from '../src/config/env.js';
import { prisma } from '../src/database/prismaClient.js';
import { traceabilityAlertService } from '../src/modules/traceability/traceability-alert.service.js';
import { isProductionDatabase, sanitizedDatabaseTarget } from './lib/database-safety.js';

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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { projectId, dryRun, confirmProduction } = parseAlertReconciliationArguments(
      process.argv.slice(2)
    );
    if (!dryRun && isProductionDatabase(env.databaseUrl) && !confirmProduction)
      throw new Error('Execução em produção exige --confirm-production.');
    const projects = projectId
      ? [
          {
            projectId,
            ...(await traceabilityAlertService.reconcileProject(projectId, {
              dryRun,
              trigger: 'SCRIPT'
            }))
          }
        ]
      : await traceabilityAlertService.reconcileAllProjects({ dryRun, trigger: 'SCRIPT' });
    process.stdout.write(
      `${JSON.stringify(
        { dryRun, projects, database: sanitizedDatabaseTarget(env.databaseUrl) },
        null,
        2
      )}\n`
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error && !error.code ? error.message : 'Reconciliação de alertas falhou.'}\n`
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
