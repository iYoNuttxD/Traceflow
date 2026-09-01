import { Prisma } from '@prisma/client';
import { prisma } from './prismaClient.js';

const DEFAULT_MAX_ATTEMPTS = 3;

export async function serializableTransaction(operation, { client = prisma } = {}) {
  for (let attempt = 1; attempt <= DEFAULT_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await client.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      if (error?.code !== 'P2034' || attempt === DEFAULT_MAX_ATTEMPTS) throw error;
    }
  }

  throw new Error('Serializable transaction exhausted without a result.');
}
