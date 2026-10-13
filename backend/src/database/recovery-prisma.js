import { PrismaClient } from '@prisma/client';

let client = null;

export function recoveryPrisma() {
  client ??= new PrismaClient();
  return client;
}

export async function disconnectRecoveryPrisma() {
  const current = client;
  client = null;
  if (current) await current.$disconnect();
}
