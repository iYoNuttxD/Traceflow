import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

export function validateTestDatabaseUrl(testDatabaseUrl, developmentDatabaseUrl) {
  if (!testDatabaseUrl) {
    throw new Error(
      'TEST_DATABASE_URL é obrigatória. Configure um banco MySQL exclusivo, como traceflow_test.'
    );
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(testDatabaseUrl);
  } catch {
    throw new Error('TEST_DATABASE_URL não é uma URL válida.');
  }

  if (parsedUrl.protocol !== 'mysql:') {
    throw new Error('TEST_DATABASE_URL deve usar MySQL.');
  }

  const databaseName = parsedUrl.pathname.replace(/^\//, '').toLowerCase();

  if (!databaseName || !/(^|[_-])test([_-]|$)/.test(databaseName)) {
    throw new Error(
      'TEST_DATABASE_URL deve apontar claramente para um banco de teste (nome contendo test).'
    );
  }

  if (/(^|[_-])(prod|production)([_-]|$)/.test(databaseName)) {
    throw new Error('TEST_DATABASE_URL não pode apontar para um banco de produção.');
  }

  if (developmentDatabaseUrl && testDatabaseUrl === developmentDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL deve ser diferente de DATABASE_URL.');
  }

  return testDatabaseUrl;
}

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
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl
    },
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    throw new Error(
      `Não foi possível aplicar migrations no banco de teste. ${result.stderr || result.stdout}`
    );
  }
}

export async function cleanTestDatabase(prisma) {
  await prisma.$transaction([
    prisma.taskCommit.deleteMany(),
    prisma.taskIssue.deleteMany(),
    prisma.taskMovement.deleteMany(),
    prisma.task.deleteMany(),
    prisma.requirement.deleteMany(),
    prisma.projectInvitation.deleteMany(),
    prisma.projectMembership.deleteMany(),
    prisma.projectMember.deleteMany(),
    prisma.traceLink.deleteMany(),
    prisma.githubArtifact.deleteMany(),
    prisma.commit.deleteMany(),
    prisma.pullRequest.deleteMany(),
    prisma.issue.deleteMany(),
    prisma.project.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany()
  ]);
}
