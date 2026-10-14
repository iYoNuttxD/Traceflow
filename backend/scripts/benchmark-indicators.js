// Dedicated local HTTP exercise. Never uses the normal development seed/database.
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import { sanitizedDatabaseTarget, validateTestDatabaseUrl } from './lib/database-safety.js';
import { cleanupIndicatorBenchmark } from './lib/benchmark-cleanup.js';

if (!process.argv.includes('--apply')) {
  throw new Error(
    'Creating benchmark fixtures requires --apply and a validated local test database.'
  );
}

dotenv.config({ path: '.env.test', quiet: true });
dotenv.config({ path: '.env', quiet: true });
if (process.env.NODE_ENV === 'production') throw new Error('Production is forbidden.');
const databaseUrl = validateTestDatabaseUrl(
  process.env.TEST_DATABASE_URL,
  process.env.DATABASE_URL
);
const target = sanitizedDatabaseTarget(databaseUrl);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.host))
  throw new Error('This benchmark requires a local test database.');
if (Number(process.versions.node.split('.')[0]) !== 22) throw new Error('Use Node 22.');
process.env.DATABASE_URL = databaseUrl;
process.env.NODE_ENV = 'test';
process.env.EMAIL_PROVIDER = 'capture';
const sourceRoot = process.env.INDICATOR_BENCHMARK_SOURCE_ROOT;
const source = (path) =>
  sourceRoot
    ? new URL(`file://${sourceRoot}/src/${path}`)
    : new URL(`../src/${path}`, import.meta.url);
const { prisma } = await import(source('database/prismaClient.js'));
const [{ databaseName, readOnly }] = await prisma.$queryRaw`
  SELECT DATABASE() AS databaseName, @@global.read_only AS readOnly
`;
if (databaseName !== target.database || Number(readOnly))
  throw new Error('Unsafe database target.');

const originalTransaction = prisma.$transaction.bind(prisma);
let metrics = null;
let active = 0;
function instrument(client) {
  return new Proxy(client, {
    get(object, key) {
      const value = object[key];
      if (typeof value === 'function') {
        if (!String(key).startsWith('$queryRaw')) return value.bind(object);
        return async (...args) => {
          if (metrics) metrics.operations++;
          return value.apply(object, args);
        };
      }
      if (!value || typeof value !== 'object' || typeof value.findMany !== 'function') return value;
      return new Proxy(value, {
        get(delegate, operation) {
          const method = delegate[operation];
          if (typeof method !== 'function') return method;
          return async (...args) => {
            if (metrics) metrics.operations++;
            const rows = await method.apply(delegate, args);
            if (metrics && operation === 'findMany') {
              metrics.rows[key] = (metrics.rows[key] ?? 0) + rows.length;
              metrics.reads[key] = (metrics.reads[key] ?? 0) + 1;
            }
            return rows;
          };
        }
      });
    }
  });
}
prisma.$transaction = (callback, options) => {
  if (typeof callback !== 'function') return originalTransaction(callback, options);
  return originalTransaction(async (tx) => {
    if (metrics) {
      metrics.transactions++;
      active++;
      metrics.peakTransactions = Math.max(metrics.peakTransactions, active);
    }
    try {
      return await callback(instrument(tx));
    } finally {
      if (metrics) active--;
    }
  }, options).catch((error) => {
    if (metrics && Object.hasOwn(metrics.prismaFailures, error.code))
      metrics.prismaFailures[error.code]++;
    throw error;
  });
};
const newMetrics = () => ({
  operations: 0,
  transactions: 0,
  peakTransactions: 0,
  reads: {},
  rows: {},
  prismaFailures: { P2024: 0, P2028: 0, P2034: 0 }
});

const run = randomUUID();
let project, user, server;
const report = {
  node: process.version,
  target,
  safety: { readOnly: Number(readOnly), nodeEnv: process.env.NODE_ENV },
  dataset: {},
  results: []
};
const asOf = new Date('2026-10-06T20:00:00.000Z');
const RealDate = globalThis.Date;
globalThis.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [asOf.getTime()]));
  }
  static now() {
    return asOf.getTime();
  }
};
report.asOf = asOf.toISOString();
try {
  user = await prisma.user.create({
    data: {
      name: 'Artificial performance fixture',
      username: `perf_${run}`,
      email: `perf-${run}@example.invalid`,
      emailVerifiedAt: new Date()
    }
  });
  project = await prisma.project.create({
    data: {
      name: `Artificial PR23-FIX-04 ${run}`,
      responsibleTeam: 'Isolated performance fixture',
      accessCode: run,
      memberships: { create: { userId: user.id, role: 'OWNER' } }
    }
  });
  const token = randomUUID();
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      csrfTokenHash: createHash('sha256').update(run).digest('hex'),
      sessionVersion: 1,
      expiresAt: new Date(Date.now() + 3600000)
    }
  });
  const date = (days) => new Date(asOf.getTime() - days * 86400000);
  await prisma.projectGitHubIntegration.create({
    data: {
      projectId: project.id,
      status: 'ACTIVE',
      lastSyncAt: asOf,
      lastSyncStatus: 'SINCRONIZADO',
      pullRequestLifecycleCoverageFrom: date(90),
      pullRequestLifecycleSyncedAt: asOf
    }
  });
  await prisma.requirement.createMany({
    data: Array.from({ length: 100 }, (_, i) => ({
      projectId: project.id,
      title: `Artificial requirement ${i}`,
      status: 'CADASTRADO'
    }))
  });
  const requirements = await prisma.requirement.findMany({ where: { projectId: project.id } });
  await prisma.pullRequest.createMany({
    data: Array.from({ length: 200 }, (_, i) => ({
      projectId: project.id,
      githubId: `${run}-${i}`,
      number: i + 1,
      title: `Artificial PR ${i}`,
      state: i % 4 ? 'closed' : 'open',
      createdAtGithub: date(3 + (i % 60)),
      mergedAtGithub: i % 4 ? date(1 + (i % 60)) : null
    }))
  });
  const prs = await prisma.pullRequest.findMany({ where: { projectId: project.id } });
  await prisma.pullRequestLifecycleEvent.createMany({
    data: prs
      .filter((p) => p.mergedAtGithub)
      .map((p) => ({
        projectId: project.id,
        pullRequestId: p.id,
        providerEventId: `${run}-${p.number}`,
        eventType: 'CLOSED',
        occurredAt: p.mergedAtGithub
      }))
  });
  await prisma.commit.createMany({
    data: Array.from({ length: 100 }, (_, i) => ({
      projectId: project.id,
      hash: `${run}-${i}`,
      message: 'Artificial commit',
      authorName: 'Artificial author',
      date: date(i % 60)
    }))
  });
  await prisma.issue.createMany({
    data: Array.from({ length: 100 }, (_, i) => ({
      projectId: project.id,
      githubId: `${run}-${i}`,
      number: i + 1,
      title: 'Artificial issue',
      state: 'open',
      labels: []
    }))
  });
  for (let offset = 0; offset < 5000; offset += 500)
    await prisma.task.createMany({
      data: Array.from({ length: 500 }, (_, n) => {
        const i = offset + n;
        return {
          projectId: project.id,
          title: `Artificial task ${i}`,
          createdAt: date(5 + (i % 60)),
          status: i % 3 ? 'CONCLUIDO' : 'EM_ANDAMENTO',
          estimatedEffort: i % 7 ? 4 : null,
          actualEffort: i % 5 ? 5 : null,
          deadline: date(i % 10),
          requirementId: requirements[i % requirements.length].id,
          pullRequestId: prs[i % prs.length].id,
          responsibleUserId: user.id
        };
      })
    });
  const tasks = await prisma.task.findMany({
    where: { projectId: project.id },
    orderBy: { id: 'asc' }
  });
  for (let offset = 0; offset < tasks.length; offset += 500)
    await prisma.taskMovement.createMany({
      data: tasks.slice(offset, offset + 500).flatMap((t) =>
        [
          ['A_FAZER', 'EM_ANDAMENTO'],
          ['EM_ANDAMENTO', 'CONCLUIDO'],
          ['CONCLUIDO', t.status === 'EM_ANDAMENTO' ? 'A_FAZER' : 'EM_ANDAMENTO'],
          [t.status === 'EM_ANDAMENTO' ? 'A_FAZER' : 'EM_ANDAMENTO', t.status]
        ].map(([fromStatus, toStatus], i) => ({
          projectId: project.id,
          taskId: t.id,
          fromStatus,
          toStatus,
          movedAt: new Date(t.createdAt.getTime() + (i + 1) * 86400000),
          movedBy: 'Artificial performance fixture',
          responsibleUserIdSnapshot: user.id
        }))
      )
    });
  report.dataset = {
    tasks: tasks.length,
    movements: 20000,
    requirements: 100,
    pullRequests: 200,
    commits: 100,
    issues: 100
  };
  // EXPLAIN is a plan inspection, not SQL query-count instrumentation.
  report.movementPlan = await prisma.$queryRaw`
    EXPLAIN SELECT id, taskId, fromStatus, toStatus, movedAt FROM TaskMovement
    WHERE projectId = ${project.id} AND movedAt < ${asOf}
    ORDER BY taskId, movedAt, id
  `;
  const { default: app } = await import(source('app.js'));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/projects/${project.id}/indicators/dashboard`;
  const fetchView = async (query) => {
    const start = performance.now();
    const res = await fetch(`${base}?${query}`, {
      headers: { Cookie: `traceflow_session=${token}` }
    });
    const text = await res.text();
    const body = JSON.parse(text);
    return {
      status: res.status,
      milliseconds: Math.round(performance.now() - start),
      bytes: Buffer.byteLength(text),
      viewState: body.viewState,
      healthScore: body.projectHealth?.score,
      healthCoverage: body.projectHealth?.coverage,
      errorCode: body.error?.code ?? body.code,
      indicators: body.sections
        ?.flatMap((s) => s.indicators)
        .map(({ metricId, value, state, numerator, denominator, points, items }) => ({
          metricId,
          value,
          state,
          numerator,
          denominator,
          points,
          items
        }))
    };
  };
  const widgets = 'I01,I23,I49,I66,I21,I28';
  const period = new URLSearchParams({
    startDate: date(30).toISOString().slice(0, 10),
    endDate: date(1).toISOString().slice(0, 10),
    timeZone: 'UTC'
  });
  for (const [name, query] of [
    ['GENERAL', `view=GENERAL&${period}`],
    ['TASK', `view=TASK&includeProjectHealth=true&${period}`],
    ['TASK_ONLY', `view=TASK&${period}`],
    ['FLOW', `view=FLOW&includeProjectHealth=true&${period}`],
    ['PLANNING', `view=PLANNING&includeProjectHealth=true&${period}`],
    ['CUSTOM', `view=CUSTOM&widgets=${widgets}&${period}`],
    [
      'OVERVIEW',
      process.argv.includes('--health-only') ? 'view=GENERAL&healthOnly=true' : 'view=GENERAL'
    ]
  ]) {
    metrics = newMetrics();
    const result = await fetchView(query);
    report.results.push({ name, ...result, ...metrics });
    metrics = null;
    console.log(
      JSON.stringify({
        name,
        status: result.status,
        milliseconds: result.milliseconds,
        ...report.results.at(-1),
        indicators: undefined
      })
    );
  }
  metrics = newMetrics();
  const concurrent = await Promise.all(
    Array.from({ length: 5 }, () => fetchView(`view=FLOW&includeProjectHealth=true&${period}`))
  );
  report.concurrent = {
    requests: concurrent.map(({ indicators: _indicators, ...r }) => r),
    successCount: concurrent.filter((r) => r.status === 200).length,
    failCount: concurrent.filter((r) => r.status !== 200).length,
    ...metrics
  };
  metrics = null;
  console.log(JSON.stringify({ concurrent: report.concurrent }));
  if (process.argv[2] && !process.argv[2].startsWith('--'))
    await writeFile(
      process.argv[2],
      JSON.stringify(report, (_, value) => (typeof value === 'bigint' ? Number(value) : value), 2)
    );
  if (
    report.results.some((r) => r.status !== 200) ||
    report.concurrent.failCount ||
    [...report.results, report.concurrent].some((r) =>
      Object.values(r.prismaFailures).some(Boolean)
    )
  )
    process.exitCode = 1;
} finally {
  metrics = null;
  if (server) await new Promise((resolve) => server.close(resolve));
  try {
    await cleanupIndicatorBenchmark(prisma, { project, user, run, databaseUrl });
  } finally {
    globalThis.Date = RealDate;
    prisma.$transaction = originalTransaction;
    await prisma.$disconnect();
  }
}
