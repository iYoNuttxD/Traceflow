import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject } from '../fixtures/factories.js';

const SIZES = (process.env.ENSAIO_EVENTOS || '10000,50000')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value >= 4);
const PAGE_SIZE = 100;
const BATCH = 2000;
const LINKED_EVERY = 10;
const RECORD_TIMEOUT_MS = 120_000;
const SECOND = 1000;

let prisma;
let syncProjectRepositoryEvents;
let githubRepositoryEventsRepository;
const results = [];

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ syncProjectRepositoryEvents } =
    await import('../../src/modules/github/services/sync-project-repository-events.service.js'));
  ({ githubRepositoryEventsRepository } =
    await import('../../src/modules/github/github-repository-events.repository.js'));
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  process.stdout.write(
    `${JSON.stringify({ ensaio: 'leitura-completa-do-historico', resultados: results }, null, 2)}\n`
  );
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

async function inBatches(rows, write) {
  for (let offset = 0; offset < rows.length; offset += BATCH)
    await write(rows.slice(offset, offset + BATCH));
}

async function syntheticRepository(size) {
  const project = await createProject(prisma);
  const perKind = Math.floor(size / 4);
  const base = new Date(Date.now() - 2 * 86_400_000);
  const at = (offset) => new Date(base.getTime() + offset * SECOND);
  await prisma.gitHubEventCoverage.create({
    data: { projectId: project.id, coverageFrom: new Date(base.getTime() - 86_400_000) }
  });
  const numbers = Array.from({ length: perKind }, (_, index) => index + 1);
  await inBatches(numbers, (part) =>
    prisma.issue.createMany({
      data: part.map((number) => ({
        projectId: project.id,
        githubId: `ensaio-issue-${project.id}-${number}`,
        number,
        title: `Issue ${number}`,
        state: 'open',
        labels: []
      }))
    })
  );
  await inBatches(numbers, (part) =>
    prisma.pullRequest.createMany({
      data: part.map((number) => ({
        projectId: project.id,
        githubId: `ensaio-pr-${project.id}-${number}`,
        number: perKind + number,
        title: `PR ${perKind + number}`,
        state: 'closed',
        sourceBranch: `feature/${number}`,
        targetBranch: 'main',
        mergedAtGithub: at(number),
        closedAtGithub: at(number)
      }))
    })
  );
  const linked = numbers.filter((number) => number % LINKED_EVERY === 0);
  await inBatches(linked, (part) =>
    prisma.task.createMany({
      data: part.map((number) => ({
        projectId: project.id,
        title: `Tarefa ${number}`,
        priority: 'MEDIA',
        status: 'A_FAZER'
      }))
    })
  );
  const tasks = await prisma.task.findMany({
    where: { projectId: project.id },
    select: { id: true },
    orderBy: { id: 'asc' }
  });
  const issueIds = new Map(
    (
      await prisma.issue.findMany({
        where: { projectId: project.id },
        select: { id: true, number: true }
      })
    ).map((row) => [row.number, row.id])
  );
  const pullRequestIds = new Map(
    (
      await prisma.pullRequest.findMany({
        where: { projectId: project.id },
        select: { id: true, number: true }
      })
    ).map((row) => [row.number, row.id])
  );
  const periods = linked.flatMap((number, index) => [
    {
      projectId: project.id,
      taskId: tasks[index].id,
      issueId: issueIds.get(number),
      linkedAt: base
    },
    {
      projectId: project.id,
      taskId: tasks[index].id,
      pullRequestId: pullRequestIds.get(perKind + number),
      linkedAt: base
    }
  ]);
  await inBatches(periods, (part) => prisma.taskArtifactLinkPeriod.createMany({ data: part }));

  let providerEventId = 10_000_000;
  const event = (kind, number, eventType, occurredAt) => ({
    kind,
    providerEventId: String((providerEventId += 1)),
    number,
    eventType,
    occurredAt
  });
  const events = numbers.flatMap((number) => [
    event('ISSUE', number, 'CLOSED', at(number)),
    event('ISSUE', number, 'REOPENED', at(number + 0.5)),
    event('PULL_REQUEST', perKind + number, 'MERGED', at(number)),
    event('PULL_REQUEST', perKind + number, 'CLOSED', at(number))
  ]);
  return { project, events, linked: linked.length };
}

function pagesOf(events) {
  return {
    async *listRepositoryEventPages() {
      for (let offset = 0; offset < events.length; offset += PAGE_SIZE)
        yield events.slice(offset, offset + PAGE_SIZE);
    }
  };
}

async function rowsOf(projectId) {
  const where = { projectId };
  return {
    historicoDePr: await prisma.pullRequestLifecycleEvent.count({ where }),
    historicoDeIssue: await prisma.issueLifecycleEvent.count({ where }),
    eventosDeNotificacao: await prisma.gitHubArtifactEvent.count({ where }),
    alvos: await prisma.gitHubArtifactEventTask.count({ where: { event: { projectId } } })
  };
}

async function read(project, events) {
  const record = githubRepositoryEventsRepository.record.bind(githubRepositoryEventsRepository);
  let lockedMs = 0;
  const spy = vi
    .spyOn(githubRepositoryEventsRepository, 'record')
    .mockImplementation(async (...args) => {
      const started = performance.now();
      try {
        return await record(...args);
      } finally {
        lockedMs = performance.now() - started;
      }
    });
  const started = performance.now();
  try {
    const summary = await syncProjectRepositoryEvents({
      project,
      repository: { owner: 'ensaio', name: 'volume' },
      githubClient: pagesOf(events)
    });
    return {
      etapaMs: Math.round(performance.now() - started),
      sobATravaMs: Math.round(lockedMs),
      resumo: summary
    };
  } finally {
    spy.mockRestore();
  }
}

describe('ADR-023 — ensaio da leitura completa do histórico em volume (fora da suíte)', () => {
  it.each(SIZES)('leitura completa com %i eventos: primeira leitura e releitura', async (size) => {
    const { project, events, linked } = await syntheticRepository(size);

    const first = await read(project, events);
    const afterFirst = await rowsOf(project.id);
    const again = await read(project, events);
    const afterAgain = await rowsOf(project.id);

    results.push({
      eventos: events.length,
      paginas: Math.ceil(events.length / PAGE_SIZE),
      artefatosVinculados: linked * 2,
      primeiraLeitura: { ...first, linhas: afterFirst },
      releitura: { ...again, linhas: afterAgain },
      limiteDaTransacaoMs: RECORD_TIMEOUT_MS
    });

    const perKind = events.length / 4;
    expect(afterFirst).toEqual({
      historicoDePr: perKind * 2,
      historicoDeIssue: perKind * 2,
      eventosDeNotificacao: linked * 3,
      alvos: linked * 3
    });
    expect(afterAgain).toEqual(afterFirst);
    expect(again.resumo).toMatchObject({ lifecycleEventsCreated: 0, issueEventsCreated: 0 });
    expect(first.sobATravaMs).toBeLessThan(RECORD_TIMEOUT_MS);
    expect(again.sobATravaMs).toBeLessThan(RECORD_TIMEOUT_MS);
    await cleanTestDatabase(prisma);
  });
});
