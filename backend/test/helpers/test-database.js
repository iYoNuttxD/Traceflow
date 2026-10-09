import { inject } from 'vitest';
import { deployOncePerInvocation } from './test-migration-cache.js';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
export { validateTestDatabaseUrl } from '../../scripts/lib/database-safety.js';
import { validateTestDatabaseUrl } from '../../scripts/lib/database-safety.js';

// Define o ambiente antes de qualquer import dinâmico da aplicação. Isso evita
// que um NODE_ENV de desenvolvimento do arquivo local seja congelado no singleton de configuração.
process.env.NODE_ENV = 'test';
process.env.EMAIL_PROVIDER = 'capture';

export function configureTestDatabaseEnvironment() {
  dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: false, quiet: true });
  dotenv.config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });

  const testDatabaseUrl = validateTestDatabaseUrl(
    process.env.TEST_DATABASE_URL,
    process.env.DATABASE_URL
  );

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = testDatabaseUrl;

  return testDatabaseUrl;
}

export function deployTestMigrations(testDatabaseUrl, { force = false } = {}) {
  // Safety validation still runs even when an earlier suite deployed this target.
  validateTestDatabaseUrl(testDatabaseUrl);
  return deployOncePerInvocation({
    directory: inject('testMigrationCache'),
    databaseUrl: testDatabaseUrl,
    force,
    deploy: () => runTestMigrations(testDatabaseUrl)
  });
}

function runTestMigrations(testDatabaseUrl) {
  // Invoca o entrypoint JS da CLI com o Node atual: o shim .cmd do Windows não pode
  // ser executado por spawnSync sem shell (EINVAL desde a mitigação CVE-2024-27980).
  const prismaEntry = resolve(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
  // Sem shell de propósito: node.exe é executável real (a mitigação da CVE-2024-27980
  // só bloqueia .cmd/.bat), e com shell o caminho "C:\Program Files\nodejs\node.exe"
  // seria concatenado sem aspas e quebraria em qualquer instalação padrão do Windows.
  const result = spawnSync(process.execPath, [prismaEntry, 'migrate', 'deploy'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl
    },
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    throw new Error(
      `Não foi possível aplicar migrations no banco de teste. ${
        result.error?.message || result.stderr || result.stdout
      }`
    );
  }
}

export async function assertConnectedTestDatabase(client) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Limpeza bloqueada: NODE_ENV deve ser test.');
  }
  const target = new URL(validateTestDatabaseUrl(process.env.TEST_DATABASE_URL));
  const expectedSchema = decodeURIComponent(target.pathname.slice(1)).toLowerCase();
  const rows = await client.$queryRaw`SELECT DATABASE() AS databaseName`;
  const actualSchema = String(rows[0]?.databaseName || '').toLowerCase();
  if (actualSchema !== expectedSchema) {
    throw new Error('Limpeza bloqueada: a conexão real não aponta para TEST_DATABASE_URL.');
  }
}

export async function cleanTestDatabase(prisma) {
  await prisma.$transaction(async (tx) => {
    // Check the actual connection in the same transaction as every deletion.
    // Environment variables alone cannot identify an already initialized client.
    await assertConnectedTestDatabase(tx);
    await tx.projectPurgeStorageCleanup.deleteMany();
    await tx.defectHistoryEntry.deleteMany();
    await tx.defectRetest.deleteMany();
    await tx.defectTask.deleteMany();
    await tx.defect.deleteMany();
    await tx.testEvidence.deleteMany();
    await tx.testExecutionStep.deleteMany();
    await tx.testExecution.deleteMany();
    await tx.testCaseHistoryEntry.deleteMany();
    await tx.testCaseVersion.deleteMany();
    await tx.testCaseTask.deleteMany();
    await tx.testCaseStep.deleteMany();
    await tx.testCase.deleteMany();
    await tx.gitHubWebhookDelivery.deleteMany();
    await tx.gitHubOAuthState.deleteMany();
    await tx.gitHubAppConnectionState.deleteMany();
    await tx.gitHubIdentity.deleteMany();
    await tx.gitHubIdentityTombstone.deleteMany();
    await tx.projectGitHubIntegration.deleteMany();
    await tx.gitHubInstallationAuthorization.deleteMany();
    await tx.gitHubInstallation.deleteMany();
    await tx.gitHubSyncRun.deleteMany();
    await tx.auditEvent.deleteMany();
    await tx.personalDataExport.deleteMany();
    await tx.privacyRequest.deleteMany();
    await tx.taskCommitSuggestion.deleteMany();
    await tx.taskTimeEntry.deleteMany();
    await tx.taskComment.deleteMany();
    await tx.taskCommit.deleteMany();
    await tx.taskIssue.deleteMany();
    await tx.taskHistoryEntry.deleteMany();
    await tx.taskMovement.deleteMany();
    await tx.task.deleteMany();
    await tx.milestone.deleteMany();
    await tx.sprint.deleteMany();
    await tx.requirement.deleteMany();
    await tx.projectInvitation.deleteMany();
    await tx.projectMembership.deleteMany();
    await tx.commitBranch.deleteMany();
    await tx.gitBranch.deleteMany();
    await tx.commit.deleteMany();
    await tx.pullRequestLifecycleEvent.deleteMany();
    await tx.pullRequest.deleteMany();
    await tx.issue.deleteMany();
    await tx.project.deleteMany();
    await tx.passwordResetToken.deleteMany();
    await tx.emailVerificationToken.deleteMany();
    await tx.session.deleteMany();
    await tx.user.deleteMany();
  });
}
