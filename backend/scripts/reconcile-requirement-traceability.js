import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { prisma } from '../src/database/prismaClient.js';
import { reconcileProject } from '../src/modules/traceability/requirement-reconciliation.repository.js';

export function parseReconciliationArguments(args) {
  const project = args.find((arg) => arg.startsWith('--project-id='));
  const projectId = Number(project?.split('=')[1]);
  if (
    !Number.isSafeInteger(projectId) ||
    projectId < 1 ||
    projectId > 2147483647 ||
    args.some((arg) => arg !== project && !['--dry-run', '--apply', '--policy'].includes(arg)) ||
    (args.includes('--apply') && args.includes('--dry-run'))
  ) {
    throw new Error('Uso: --project-id=<id> [--dry-run | --apply] [--policy]. Padrão: dry-run.');
  }
  return {
    projectId,
    dryRun: !args.includes('--apply'),
    ...(args.includes('--policy') ? { reason: 'TRACEABILITY_POLICY_RECONCILIATION' } : {})
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { projectId, dryRun, reason } = parseReconciliationArguments(process.argv.slice(2));
    const result = await reconcileProject(projectId, { dryRun, reason });
    process.stdout.write(`${JSON.stringify({ projectId, dryRun, ...result }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error && !error.code ? error.message : 'Reconciliação falhou.'}\n`
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
