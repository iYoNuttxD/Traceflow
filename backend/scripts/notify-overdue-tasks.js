import { pathToFileURL } from 'node:url';
import { env } from '../src/config/env.js';
import { prisma } from '../src/database/prismaClient.js';
import { createNotificationService } from '../src/modules/notifications/notification.service.js';
import { createLogger } from '../src/shared/logger/index.js';
import { isProductionDatabase, sanitizedDatabaseTarget } from './lib/database-safety.js';

const flags = ['--apply', '--dry-run', '--confirm-production'];

export function parseOverdueNotificationArguments(args) {
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

export async function runOverdueNotifications({
  args,
  service,
  databaseUrl,
  write = (text) => process.stdout.write(text),
  writeError = (text) => process.stderr.write(text)
}) {
  try {
    const { projectId, dryRun, confirmProduction } = parseOverdueNotificationArguments(args);
    if (!dryRun && isProductionDatabase(databaseUrl) && !confirmProduction)
      throw new Error('Execução em produção exige --confirm-production.');
    const report = await service.notifyOverdueTasks({ projectId, dryRun });
    write(
      `${JSON.stringify({ ...report, database: sanitizedDatabaseTarget(databaseUrl) }, null, 2)}\n`
    );
    if (projectId && report.projects === 0) {
      writeError(`Nenhum projeto ativo com --project-id=${projectId}; nada foi avaliado.\n`);
      return 2;
    }
    return report.failed > 0 ? 1 : 0;
  } catch (error) {
    writeError(
      `${error instanceof Error && !error.code ? error.message : 'Varredura de vencimentos falhou.'}\n`
    );
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await runOverdueNotifications({
      args: process.argv.slice(2),
      service: createNotificationService({
        log: createLogger({
          write: (_level, line) =>
            process.stderr.write(`${line}
`)
        })
      }),
      databaseUrl: env.databaseUrl
    });
  } finally {
    await prisma.$disconnect();
  }
}
