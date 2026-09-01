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

export function deployTestMigrations(testDatabaseUrl) {
  const prismaExecutable = resolve(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prisma.cmd' : 'prisma'
  );
  const result = spawnSync(prismaExecutable, ['migrate', 'deploy'], {
    cwd: process.cwd(),
    // A partir do Node 18.20.2/20.12.2/22 (mitigacao da CVE-2024-27980), spawn de
    // .cmd/.bat sem shell retorna EINVAL. Sem isto, nenhum teste de integracao ou
    // API roda no Windows.
    shell: process.platform === 'win32',
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

export async function cleanTestDatabase(prisma) {
  await prisma.$transaction([
    prisma.gitHubWebhookDelivery.deleteMany(),
    prisma.gitHubOAuthState.deleteMany(),
    prisma.gitHubAppConnectionState.deleteMany(),
    prisma.gitHubIdentity.deleteMany(),
    prisma.gitHubIdentityTombstone.deleteMany(),
    prisma.projectGitHubIntegration.deleteMany(),
    prisma.gitHubInstallationAuthorization.deleteMany(),
    prisma.gitHubInstallation.deleteMany(),
    prisma.gitHubSyncRun.deleteMany(),
    prisma.auditEvent.deleteMany(),
    prisma.personalDataExport.deleteMany(),
    prisma.privacyRequest.deleteMany(),
    prisma.taskCommitSuggestion.deleteMany(),
    prisma.taskCommit.deleteMany(),
    prisma.taskIssue.deleteMany(),
    prisma.taskHistoryEntry.deleteMany(),
    prisma.taskMovement.deleteMany(),
    prisma.task.deleteMany(),
    prisma.milestone.deleteMany(),
    prisma.sprint.deleteMany(),
    prisma.requirement.deleteMany(),
    prisma.projectInvitation.deleteMany(),
    prisma.projectMembership.deleteMany(),
    prisma.commitBranch.deleteMany(),
    prisma.gitBranch.deleteMany(),
    prisma.commit.deleteMany(),
    prisma.pullRequest.deleteMany(),
    prisma.issue.deleteMany(),
    prisma.project.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.emailVerificationToken.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany()
  ]);
}
