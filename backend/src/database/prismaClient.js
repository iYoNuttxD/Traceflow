// Cliente compartilhado exclusivamente pelas fronteiras de persistência autorizadas.
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { validateTestDatabaseUrl } from './database-safety.js';

let options = {};
if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: '.env.test', override: false, quiet: true });
  dotenv.config({ path: '.env', override: false, quiet: true });
  // Bind the datasource at construction, including imports before suite hooks.
  // Never let a test client inherit Prisma's implicit development DATABASE_URL.
  options = { datasourceUrl: validateTestDatabaseUrl(process.env.TEST_DATABASE_URL) };
}

export const prisma = new PrismaClient(options);
