// Cliente Prisma compartilhado pelos repositories.
// Client Prisma compartilhado exclusivamente pelas fronteiras de persistência autorizadas.
import { PrismaClient } from '@prisma/client';
import { limitLockWaits } from './lock-wait.js';

export const prisma = limitLockWaits(new PrismaClient());
