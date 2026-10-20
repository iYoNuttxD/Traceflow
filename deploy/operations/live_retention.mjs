/** Thin runner over the existing application retention contracts. */
import { pathToFileURL } from 'node:url';
const ROOT = '/opt/traceflow/releases/20261019T011508Z-9bc3dad199566afc6fa43d67abba400665d843ea-a6eda960ef55/backend/';
export function assertScopedTarget(env) {
  const target = new URL(env.DATABASE_URL);
  if (target.protocol !== 'mysql:' || target.hostname !== 'traceflow-db.sub10120424531.traceflowvcn.oraclevcn.com' || target.pathname !== '/traceflow_live' || target.username !== 'tf_live_api' || env.TEST_EVIDENCE_STORAGE_DIR !== '/var/lib/traceflow-live/test-evidence') throw new Error('RETENTION_TARGET_REFUSED');
}
function counts(value) {
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => typeof item === 'number' || typeof item === 'boolean' || (key === 'mode' && ['apply', 'dry-run'].includes(item)) || (item && typeof item === 'object' && !Array.isArray(item))).map(([key, item]) => [key, typeof item === 'object' ? counts(item) : item]));
}
export async function executeRetention(services, apply) {
  const result = {};
  result.auth = counts(await services.auth({ apply }));
  result.privacy = counts(await services.privacy({ apply }));
  result.projects = counts(await services.projects({ dryRun: !apply }));
  result.uploads = counts(await services.uploads({ dryRun: !apply }));
  if (result.projects.failed || result.uploads.failed) throw new Error('RETENTION_INCOMPLETE');
  return result;
}
async function main() {
  let prisma;
  const started = performance.now();
  try {
    if (process.argv.length !== 3 || !['--apply', '--dry-run'].includes(process.argv[2])) throw new Error('RETENTION_ARGUMENTS');
    assertScopedTarget(process.env);
    ({ prisma } = await import(pathToFileURL(ROOT + 'src/database/prismaClient.js')));
    const { cleanupAuthRecords: auth } = await import(pathToFileURL(ROOT + 'src/shared/maintenance/auth-cleanup.js'));
    const { runPrivacyRetention: privacy } = await import(pathToFileURL(ROOT + 'src/shared/maintenance/privacy-retention.js'));
    const { projectDeletionService } = await import(pathToFileURL(ROOT + 'src/modules/projects/services/project-deletion.service.js'));
    const { evidenceUploadService } = await import(pathToFileURL(ROOT + 'src/modules/testCases/services/evidence-upload.service.js'));
    const reports = await executeRetention({ auth, privacy, projects: options => projectDeletionService.processDue(options), uploads: options => evidenceUploadService.cleanup(options) }, process.argv[2] === '--apply');
    console.log(JSON.stringify({ status: 'RETENTION_SUCCESS', at: new Date().toISOString(), seconds: (performance.now() - started) / 1000, reports }));
  } catch (error) {
    const code = /^RETENTION_[A-Z_]+$/.test(error.message) ? error.message : 'RETENTION_FAILED';
    console.log(JSON.stringify({ status: 'FAILED', code, secretsPrinted: false }));
    process.exitCode = 1;
  } finally { if (prisma) await prisma.$disconnect(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
