import { performance } from 'node:perf_hooks';

const { tag, seconds } = JSON.parse(process.argv[2]);
const { prisma, disconnectDatabase } = await import('../../src/database/prismaClient.js');
const { recoveryPrisma } = await import('../../src/database/recovery-prisma.js');

const limit = Number(new URL(process.env.TEST_DATABASE_URL).searchParams.get('connection_limit'));
const sleep = (client, label, pause) =>
  client.$queryRawUnsafe(`SELECT /* ${label} */ SLEEP(${pause}) AS pause`);

try {
  const app = Array.from({ length: limit * 2 }, () => sleep(prisma, `${tag}-app`, seconds));
  await new Promise((resolve) => setTimeout(resolve, 400));
  const started = performance.now();
  await recoveryPrisma().$queryRawUnsafe(`SELECT /* ${tag}-recovery-ping */ 1 AS ok`);
  const recoveryMs = Math.round(performance.now() - started);
  const recovery = [0, 1].map(() => sleep(recoveryPrisma(), `${tag}-recovery`, 0.6));
  await Promise.all([...app, ...recovery]);
  process.stdout.write(`${JSON.stringify({ tag, limit, recoveryMs })}\n`);
} finally {
  await disconnectDatabase();
}
