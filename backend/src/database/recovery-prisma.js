import { PrismaClient } from '@prisma/client';

let client = null;

export function recoveryPrisma() {
  client ??= new PrismaClient();
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
