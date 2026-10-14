import { PrismaClient } from '@prisma/client';
import { validateTestDatabaseUrl } from './database-safety.js';

let client = null;

const recoveryOptions = () =>
  process.env.NODE_ENV === 'test'
    ? { datasourceUrl: validateTestDatabaseUrl(process.env.TEST_DATABASE_URL) }
    : {};

export function recoveryPrisma() {
  client ??= new PrismaClient(recoveryOptions());
  return client;
}

function validConnectionId(connectionId) {
  if (!Number.isSafeInteger(connectionId) || connectionId <= 0)
    throw new TypeError('Identificador de conexão inválido.');
  return connectionId;
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
