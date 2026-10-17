import { PrismaClient } from '@prisma/client';
import { validateTestDatabaseUrl, withConnectionLimits } from './database-safety.js';

const RECOVERY_LOCK_WAIT_SECONDS = 2;
export const RECOVERY_POOL = Object.freeze({ connectionLimit: 1, poolTimeoutSeconds: 2 });
let client = null;

const recoveryUrl = () =>
  withConnectionLimits(
    process.env.NODE_ENV === 'test'
      ? validateTestDatabaseUrl(process.env.TEST_DATABASE_URL)
      : process.env.DATABASE_URL,
    RECOVERY_POOL
  );

export function recoveryPrisma() {
  client ??= new PrismaClient({ datasourceUrl: recoveryUrl() });
  return client;
}

function validConnectionId(connectionId) {
  if (!Number.isSafeInteger(connectionId) || connectionId <= 0)
    throw new TypeError('Identificador de conexão inválido.');
  return connectionId;
}

export function recoveryTransaction(work) {
  return recoveryPrisma().$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SET SESSION innodb_lock_wait_timeout = ${RECOVERY_LOCK_WAIT_SECONDS}`
    );
    return work(tx);
  });
}

export function killQuery(connectionId) {
  return recoveryPrisma().$executeRawUnsafe(`KILL QUERY ${validConnectionId(connectionId)}`);
}

export function killConnection(connectionId) {
  return recoveryPrisma().$executeRawUnsafe(`KILL ${validConnectionId(connectionId)}`);
}

export async function disconnectRecoveryPrisma() {
  const current = client;
  client = null;
  if (current) await current.$disconnect();
}
