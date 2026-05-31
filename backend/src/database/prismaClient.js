// Cliente Prisma compartilhado pelos repositories.
// TODO: Importar este client somente quando os acessos reais ao MySQL forem implementados.
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
