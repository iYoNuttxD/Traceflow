import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { validateTestDatabaseUrl } from './lib/database-safety.js';

dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: false, quiet: true });
dotenv.config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });

const sourceUrl = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
const parsed = new URL(sourceUrl);
const sourceDatabase = parsed.pathname.slice(1);
const validationDatabase = `${sourceDatabase}_l2_empty_validation`;
if (!/^[a-zA-Z0-9_]+_test_l2_empty_validation$/.test(validationDatabase)) {
  throw new Error('Nome do banco temporário de validação recusado.');
}

const admin = new PrismaClient({ datasourceUrl: sourceUrl });
let created = false;
try {
  const existing = await admin.$queryRawUnsafe(
    'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
    validationDatabase
  );
  if (existing.length) throw new Error('O banco temporário já existe; remoção manual necessária.');
  await admin.$executeRawUnsafe(`CREATE DATABASE \`${validationDatabase}\``);
  created = true;

  parsed.pathname = `/${validationDatabase}`;
  const prismaExecutable = resolve(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prisma.cmd' : 'prisma'
  );
  const migrated = spawnSync(prismaExecutable, ['migrate', 'deploy'], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: parsed.toString() },
    encoding: 'utf8'
  });
  if (migrated.status !== 0) {
    throw new Error(`Migration vazia falhou. ${migrated.stderr || migrated.stdout}`);
  }

  const validation = new PrismaClient({ datasourceUrl: parsed.toString() });
  try {
    const [users, sessions, emailChanges] = await Promise.all([
      validation.user.count(),
      validation.session.count(),
      validation.emailChangeRequest.count()
    ]);
    process.stdout.write(
      `${JSON.stringify({ database: validationDatabase, migrations: 'ok', users, sessions, emailChanges })}\n`
    );
  } finally {
    await validation.$disconnect();
  }
} finally {
  if (created) await admin.$executeRawUnsafe(`DROP DATABASE \`${validationDatabase}\``);
  await admin.$disconnect();
}
