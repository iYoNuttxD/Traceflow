// Cliente Prisma compartilhado pelos repositories.
// Client Prisma compartilhado exclusivamente pelas fronteiras de persistência autorizadas.
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
