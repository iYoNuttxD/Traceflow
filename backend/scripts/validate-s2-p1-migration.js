import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { validateTestDatabaseUrl } from './lib/database-safety.js';

dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: false, quiet: true });
dotenv.config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });

const migrations = [
  '20260924120000_s2_p1_indicator_data_foundation',
  '20260924130000_s2_p1_lifecycle_coverage'
];
const sourceUrl = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
const sourceDatabase = new URL(sourceUrl).pathname.slice(1);
const validationDatabase = `${sourceDatabase}_s2_p1_upgrade_validation`;
if (!/^[a-zA-Z0-9_]+_test_s2_p1_upgrade_validation$/.test(validationDatabase)) {
  throw new Error('Nome do banco descartável de validação P1 recusado.');
}
const validationUrl = new URL(sourceUrl);
validationUrl.pathname = `/${validationDatabase}`;
const databaseUrl = validationUrl.toString();
const admin = new PrismaClient({ datasourceUrl: sourceUrl });
const root = mkdtempSync(join(tmpdir(), 'traceflow-s2-p1-'));
const prismaDirectory = join(root, 'prisma');
const migrationsDirectory = join(prismaDirectory, 'migrations');
const schemaPath = join(prismaDirectory, 'schema.prisma');
const sourcePrisma = resolve(process.cwd(), 'prisma');
const prismaExecutable = resolve(process.cwd(), 'node_modules', '.bin', 'prisma');
let created = false;

function deploy() {
  const result = spawnSync(prismaExecutable, ['migrate', 'deploy', '--schema', schemaPath], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl },
    encoding: 'utf8'
  });
  if (result.status !== 0) throw new Error(`Deploy P1 falhou: ${result.stderr || result.stdout}`);
}

async function seed(client) {
  await client.$executeRawUnsafe(
    "INSERT INTO User (name,email,username,createdAt,updatedAt) VALUES ('P1 artificial','p1-upgrade@example.invalid','p1_upgrade',NOW(3),NOW(3))"
  );
  await client.$executeRawUnsafe(
    "INSERT INTO Project (name,responsibleTeam,accessCode,createdAt,updatedAt) VALUES ('P1 artificial','Equipe','P1-UPGRADE',NOW(3),NOW(3))"
  );
  await client.$executeRawUnsafe(
    'INSERT INTO ProjectGitHubIntegration (projectId,createdAt,updatedAt) VALUES (1,NOW(3),NOW(3))'
  );
  await client.$executeRawUnsafe(
    "INSERT INTO Task (projectId,title,status,createdAt,updatedAt) VALUES (1,'Task antiga','A_FAZER',NOW(3),NOW(3))"
  );
  await client.$executeRawUnsafe(
    "INSERT INTO TaskMovement (projectId,taskId,fromStatus,toStatus,movedBy,movedAt,createdAt) VALUES (1,1,'A_FAZER','EM_ANDAMENTO','P1 artificial',NOW(3),NOW(3))"
  );
  await client.$executeRawUnsafe(
    "INSERT INTO Commit (projectId,hash,createdAt,updatedAt) VALUES (1,'p1-commit',NOW(3),NOW(3))"
  );
  await client.$executeRawUnsafe(
    "INSERT INTO PullRequest (projectId,githubId,number,title,createdAt,updatedAt) VALUES (1,'p1-pr',1,'PR antiga',NOW(3),NOW(3))"
  );
  await client.$executeRawUnsafe(
    "INSERT INTO GitBranch (projectId,name,headSha,isDefault,isActive,firstSeenAt,lastSeenAt,createdAt,updatedAt) VALUES (1,'main','p1-head',true,true,NOW(3),NOW(3),NOW(3),NOW(3))"
  );
  await client.$executeRawUnsafe('INSERT INTO CommitBranch (commitId,branchId) VALUES (1,1)');
}

try {
  const existing = await admin.$queryRawUnsafe(
    'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
    validationDatabase
  );
  if (existing.length)
    throw new Error('Banco descartável P1 já existe; remoção manual necessária.');
  await admin.$executeRawUnsafe(`CREATE DATABASE \`${validationDatabase}\``);
  created = true;
  mkdirSync(migrationsDirectory, { recursive: true });
  cpSync(join(sourcePrisma, 'schema.prisma'), schemaPath);
  cpSync(
    join(sourcePrisma, 'migrations', 'migration_lock.toml'),
    join(migrationsDirectory, 'migration_lock.toml')
  );
  for (const entry of readdirSync(join(sourcePrisma, 'migrations'), { withFileTypes: true })) {
    if (!entry.isDirectory() || migrations.includes(entry.name)) continue;
    cpSync(join(sourcePrisma, 'migrations', entry.name), join(migrationsDirectory, entry.name), {
      recursive: true
    });
  }
  deploy();
  const beforeClient = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    await seed(beforeClient);
  } finally {
    await beforeClient.$disconnect();
  }
  for (const migration of migrations) {
    cpSync(join(sourcePrisma, 'migrations', migration), join(migrationsDirectory, migration), {
      recursive: true
    });
  }
  deploy();
  const afterClient = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const [project, integration, task, movement, commit, pullRequest, branch, link, events] =
      await Promise.all([
        afterClient.project.findFirst(),
        afterClient.projectGitHubIntegration.findFirst(),
        afterClient.task.findFirst(),
        afterClient.taskMovement.findFirst(),
        afterClient.commit.findFirst(),
        afterClient.pullRequest.findFirst(),
        afterClient.gitBranch.findFirst(),
        afterClient.commitBranch.findFirst(),
        afterClient.pullRequestLifecycleEvent.count()
      ]);
    if (
      !project ||
      !integration ||
      !task ||
      !movement ||
      !commit ||
      !pullRequest ||
      !branch ||
      !link ||
      events !== 0 ||
      movement.responsibleUserIdSnapshot !== null ||
      commit.authorGithubUserId !== null ||
      branch.lastSyncedGeneration !== null ||
      link.lastObservedGeneration !== null ||
      integration.pullRequestLifecycleSyncedAt !== null
    ) {
      throw new Error('Upgrade P1 não preservou fixtures ou defaults nullable.');
    }
    process.stdout.write(
      `${JSON.stringify({ database: validationDatabase, upgrade: 'ok', preserved: ['Project', 'Task', 'TaskMovement', 'Commit', 'PullRequest', 'GitBranch', 'CommitBranch'], lifecycleEvents: events })}\n`
    );
  } finally {
    await afterClient.$disconnect();
  }
} finally {
  if (created) await admin.$executeRawUnsafe(`DROP DATABASE \`${validationDatabase}\``);
  await admin.$disconnect();
  rmSync(root, { recursive: true, force: true });
}
