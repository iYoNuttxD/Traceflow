// Cliente Prisma compartilhado pelos repositories.
// Client Prisma compartilhado exclusivamente pelas fronteiras de persistência autorizadas.
import { PrismaClient } from '@prisma/client';
import { guardTransactions } from './transaction-guard.js';

export function createPrismaClient(options) {
  return guardTransactions(new PrismaClient(options));
}

export const prisma = createPrismaClient();
