import { pathToFileURL } from 'node:url';
import { env } from '../src/config/env.js';
import { disconnectDatabase } from '../src/database/prismaClient.js';
import { createNotificationMetricsService } from '../src/modules/notifications/notification-metrics.service.js';
import { addDays } from '../src/modules/notifications/notification.policy.js';
import { createLogger } from '../src/shared/logger/index.js';
import { sanitizedDatabaseTarget } from './lib/database-safety.js';

const USAGE = 'Uso: --from=YYYY-MM-DD --to=YYYY-MM-DD [--project-id=<id>]. Só leitura.';
const OPTIONS = ['--from=', '--to=', '--project-id='];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function single(args, prefix) {
  const values = args.filter((arg) => arg.startsWith(prefix));
  if (values.length > 1) throw new Error(USAGE);
  return values[0]?.slice(prefix.length);
}

const calendarDate = (value) =>
  value !== undefined && DATE.test(value) && addDays(value, 0) === value;

export function parseNotificationMetricsArguments(args) {
  if (args.some((arg) => !OPTIONS.some((prefix) => arg.startsWith(prefix)))) throw new Error(USAGE);
  const from = single(args, '--from=');
  const to = single(args, '--to=');
  const project = single(args, '--project-id=');
  const projectId = project === undefined ? null : Number(project);
  if (
    !calendarDate(from) ||
    !calendarDate(to) ||
    from > to ||
    (project !== undefined &&
      (!Number.isSafeInteger(projectId) || projectId < 1 || projectId > 2147483647))
  )
    throw new Error(USAGE);
  return { from, to, projectId };
}

export async function runNotificationMetrics({
  args,
  service,
  databaseUrl,
  write = (text) => process.stdout.write(text),
  writeError = (text) => process.stderr.write(text)
}) {
  try {
    const { from, to, projectId } = parseNotificationMetricsArguments(args);
    const report = await service.compute({ from, to, projectId });
    write(
      `${JSON.stringify({ ...report, database: sanitizedDatabaseTarget(databaseUrl) }, null, 2)}\n`
    );
    if (projectId && report.projetos === 0) {
      writeError(`Nenhum projeto ativo com --project-id=${projectId}; nada foi medido.\n`);
      return 2;
    }
    return 0;
  } catch (error) {
    writeError(
      `${error instanceof Error && !error.code ? error.message : 'Cálculo da métrica das notificações falhou.'}\n`
    );
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await runNotificationMetrics({
      args: process.argv.slice(2),
      service: createNotificationMetricsService({
        log: createLogger({
          write: (_level, line) => process.stderr.write(`${line}\n`)
        })
      }),
      databaseUrl: env.databaseUrl
    });
  } finally {
    await disconnectDatabase();
  }
}
