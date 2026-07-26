import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { sanitizedDatabaseTarget, validateTestDatabaseUrl } from './lib/database-safety.js';

dotenv.config({ path: resolve(process.cwd(), '.env.test'), override: false, quiet: true });
dotenv.config({ path: resolve(process.cwd(), '.env'), override: false, quiet: true });
const command = process.argv[2];
if (!['migrate', 'status'].includes(command)) throw new Error('Use migrate ou status.');
const testUrl = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
process.stdout.write(`${JSON.stringify({ target: sanitizedDatabaseTarget(testUrl), command })}\n`);
const prismaArgs = command === 'migrate' ? ['migrate', 'deploy'] : ['migrate', 'status'];
const executable = resolve(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'prisma.cmd' : 'prisma'
);
const result = spawnSync(executable, prismaArgs, {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: testUrl },
  stdio: 'inherit'
});
process.exitCode = result.status ?? 1;
