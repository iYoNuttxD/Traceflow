import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { validateTestDatabaseUrl } from './lib/database-safety.js';

dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: false, quiet: true });
dotenv.config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });

const migrations = ['20261004090000_project_dashboard_preference'];
const sourceUrl = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
const sourceDatabase = new URL(sourceUrl).pathname.slice(1);
const validationDatabase = `${sourceDatabase}_preference_upgrade_validation`;
if (!/^[a-zA-Z0-9_]+_test_preference_upgrade_validation$/.test(validationDatabase)) {
  throw new Error('Nome do banco descartável de validação Preference recusado.');
}
const validationUrl = new URL(sourceUrl);
validationUrl.pathname = `/${validationDatabase}`;
const databaseUrl = validationUrl.toString();
const admin = new PrismaClient({ datasourceUrl: sourceUrl });
const root = mkdtempSync(join(tmpdir(), 'traceflow-preference-'));
const prismaDirectory = join(root, 'prisma');
const migrationsDirectory = join(prismaDirectory, 'migrations');
const schemaPath = join(prismaDirectory, 'schema.prisma');
const sourcePrisma = resolve(process.cwd(), 'prisma');
const prismaExecutable = resolve(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
let created = false;

function deploy() {
  const result = spawnSync(
    process.execPath,
    [prismaExecutable, 'migrate', 'deploy', '--schema', schemaPath],
    {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl },
      encoding: 'utf8'
    }
  );
  if (result.status !== 0)
    throw new Error(`Deploy Preference falhou: ${result.stderr || result.stdout}`);
}

async function seed(client) {
  await client.$executeRaw`INSERT INTO User (name,email,username,createdAt,updatedAt) VALUES ('Preference fixture','preference@example.invalid','preference_fixture',NOW(3),NOW(3))`;
  await client.$executeRaw`INSERT INTO Project (name,responsibleTeam,accessCode,createdAt,updatedAt) VALUES ('Preference fixture','Equipe','PREF-UPGRADE',NOW(3),NOW(3))`;
  const tables =
    await client.$queryRaw`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ProjectDashboardPreference'`;
  if (tables.length) throw Error('Before schema already contains target table');
}

try {
  const existing = await admin.$queryRawUnsafe(
    'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
    validationDatabase
  );
  if (existing.length)
    throw new Error('Banco descartável Preference já existe; remoção manual necessária.');
  await admin.$executeRawUnsafe(`CREATE DATABASE \`${validationDatabase}\``);
  created = true;
  mkdirSync(migrationsDirectory, { recursive: true });
  cpSync(join(sourcePrisma, 'schema.prisma'), schemaPath);
  cpSync(
    join(sourcePrisma, 'migrations', 'migration_lock.toml'),
    join(migrationsDirectory, 'migration_lock.toml')
  );
  for (const entry of readdirSync(join(sourcePrisma, 'migrations'), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name >= migrations[0]) continue;
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
    const [user] =
      await afterClient.$queryRaw`SELECT id FROM User WHERE username = 'preference_fixture'`;
    const [project] =
      await afterClient.$queryRaw`SELECT id FROM Project WHERE accessCode = 'PREF-UPGRADE'`;
    if (!user || !project || (await afterClient.projectDashboardPreference.count()) !== 0)
      throw Error('Upgrade must preserve accounts/projects without inventing preferences');
    const data = {
      projectId: project.id,
      userId: user.id,
      configurationVersion: 1,
      configuration: { widgets: ['I01'] }
    };
    await afterClient.projectDashboardPreference.create({ data });
    let duplicateRejected = false;
    try {
      await afterClient.projectDashboardPreference.create({ data });
    } catch (error) {
      duplicateRejected = error.code === 'P2002';
    }
    if (!duplicateRejected) throw Error('Unique project/user pair not enforced');
    let foreignKeyRejected = false;
    try {
      await afterClient.projectDashboardPreference.create({
        data: { ...data, userId: user.id + 10000 }
      });
    } catch (error) {
      foreignKeyRejected = error.code === 'P2003';
    }
    if (!foreignKeyRejected) throw Error('User FK not enforced');
    await afterClient.$executeRaw`DELETE FROM User WHERE id = ${user.id}`;
    if (await afterClient.projectDashboardPreference.count()) throw Error('User cascade failed');
    await afterClient.$executeRaw`INSERT INTO User (name,email,username,createdAt,updatedAt) VALUES ('Second fixture','preference2@example.invalid','preference_fixture2',NOW(3),NOW(3))`;
    const [second] =
      await afterClient.$queryRaw`SELECT id FROM User WHERE username = 'preference_fixture2'`;
    await afterClient.projectDashboardPreference.create({ data: { ...data, userId: second.id } });
    await afterClient.$executeRaw`DELETE FROM Project WHERE id = ${project.id}`;
    if (await afterClient.projectDashboardPreference.count()) throw Error('Project cascade failed');
    process.stdout.write(
      `${JSON.stringify({ database: validationDatabase, upgrade: 'ok', uniquePair: true, foreignKey: true, userCascade: true, projectCascade: true })}\n`
    );
  } finally {
    await afterClient.$disconnect();
  }
} finally {
  if (created) await admin.$executeRawUnsafe(`DROP DATABASE \`${validationDatabase}\``);
  await admin.$disconnect();
  rmSync(root, { recursive: true, force: true });
}
