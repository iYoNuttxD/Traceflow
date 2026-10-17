// Cliente compartilhado exclusivamente pelas fronteiras de persistência autorizadas.
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { poolLimitFrom, validateTestDatabaseUrl, withConnectionLimits } from './database-safety.js';
import { disconnectRecoveryPrisma } from './recovery-prisma.js';
import { guardTransactions } from './transaction-guard.js';

let datasourceUrl = null;
if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: '.env.test', override: false, quiet: true });
  dotenv.config({ path: '.env', override: false, quiet: true });
  // Bind the datasource at construction, including imports before suite hooks.
  // Never let a test client inherit Prisma's implicit development DATABASE_URL.
  datasourceUrl = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
}
const connectionLimit = poolLimitFrom(process.env.DATABASE_POOL_LIMIT);
if (connectionLimit)
  datasourceUrl = withConnectionLimits(datasourceUrl ?? process.env.DATABASE_URL, {
    connectionLimit
  });
const baseOptions = datasourceUrl ? { datasourceUrl } : {};

export function createPrismaClient(options = {}) {
  return guardTransactions(new PrismaClient({ ...baseOptions, ...options }));
}

export const prisma = createPrismaClient();

export async function disconnectDatabase() {
  await Promise.all([prisma.$disconnect(), disconnectRecoveryPrisma()]);
}
