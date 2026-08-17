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
// `shell: true` e obrigatorio no Windows: desde a correcao da CVE-2024-27980
// (Node 18.20/20.12/22) o spawn recusa .cmd e .bat sem shell, devolvendo EINVAL.
// O executavel vai entre aspas porque o shell reparte o caminho em espacos.
const result = spawnSync(`"${executable}"`, prismaArgs, {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: testUrl },
  stdio: 'inherit',
  shell: true
});
// Sem isto o processo morre calado: `status` vem null quando o spawn nem
// chega a rodar, e "exit 1 sem mensagem" parece migration reprovada.
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
