import { pathToFileURL } from 'node:url';
import { env } from '../src/config/env.js';
import { prisma } from '../src/database/prismaClient.js';
import { githubEventNotificationService } from '../src/modules/notifications/github-event-notification.service.js';
import { isProductionDatabase, sanitizedDatabaseTarget } from './lib/database-safety.js';

const flags = ['--apply', '--dry-run', '--confirm-production', '--retry-failed'];
const usage =
  'Uso: [--project-id=<id>] [--dry-run | --apply] [--retry-failed] [--confirm-production]. Padrão: dry-run.';

export function parseGithubEventNotificationArguments(args) {
  const project = args.find((arg) => arg.startsWith('--project-id='));
  const projectId = project === undefined ? null : Number(project.split('=')[1] || NaN);
  if (
    (project !== undefined &&
      (!Number.isSafeInteger(projectId) || projectId < 1 || projectId > 2147483647)) ||
    args.some((arg) => arg !== project && !flags.includes(arg)) ||
    (args.includes('--apply') && args.includes('--dry-run'))
  )
    throw new Error(usage);
  return {
    projectId,
    dryRun: !args.includes('--apply'),
    confirmProduction: args.includes('--confirm-production'),
    retryFailed: args.includes('--retry-failed')
  };
}

export async function runGithubEventNotifications({
  args,
  service,
  databaseUrl,
  write = (text) => process.stdout.write(text),
  writeError = (text) => process.stderr.write(text)
}) {
  try {
    const { projectId, dryRun, confirmProduction, retryFailed } =
      parseGithubEventNotificationArguments(args);
    if (!dryRun && isProductionDatabase(databaseUrl) && !confirmProduction)
      throw new Error('Execução em produção exige --confirm-production.');
    if (projectId && !(await service.isActiveProject(projectId))) {
      writeError(`Nenhum projeto ativo com --project-id=${projectId}; nada foi despachado.\n`);
      return 2;
    }
    const report = await service.runJob({ projectId, dryRun, retryFailed });
    write(
      `${JSON.stringify({ ...report, database: sanitizedDatabaseTarget(databaseUrl) }, null, 2)}\n`
    );
    return report.failed + report.retryScheduled > 0 ? 1 : 0;
  } catch (error) {
    writeError(
      `${
        error instanceof Error && !error.code
          ? error.message
          : 'Despacho das notificações do GitHub falhou.'
      }\n`
    );
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await runGithubEventNotifications({
      args: process.argv.slice(2),
      service: githubEventNotificationService,
      databaseUrl: env.databaseUrl
    });
  } finally {
    await prisma.$disconnect();
  }
}
