import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';
import { createProject } from '../fixtures/factories.js';

const queries = vi.hoisted(() => ({ enabled: false, texts: [] }));
vi.mock('../../src/database/prismaClient.js', async () => {
  const { PrismaClient } = await import('@prisma/client');
  const { guardTransactions } = await import('../../src/database/transaction-guard.js');
  const client = guardTransactions(new PrismaClient({ log: [{ emit: 'event', level: 'query' }] }));
  client.$on('query', (event) => {
    if (queries.enabled) queries.texts.push(event.query);
  });
  return { prisma: client, createPrismaClient: () => client };
});

let prisma;
let pullRequestRepository;
let issueRepository;
let mapGithubPullRequest;
let mapGithubIssue;
let disconnectRecoveryPrisma;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ pullRequestRepository } =
    await import('../../src/modules/pullRequests/pullRequest.repository.js'));
  ({ issueRepository } = await import('../../src/modules/issues/issue.repository.js'));
  ({ mapGithubPullRequest, mapGithubIssue } =
    await import('../../src/modules/github/github.mapper.js'));
  ({ disconnectRecoveryPrisma } = await import('../../src/database/recovery-prisma.js'));
  await cleanTestDatabase(prisma);
}, 60000);

afterEach(async () => {
  queries.enabled = false;
  queries.texts = [];
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
  await disconnectRecoveryPrisma();
});

async function counted(run) {
  queries.texts = [];
  queries.enabled = true;
  try {
    const result = await run();
    return { result, statements: queries.texts.length };
  } finally {
    queries.enabled = false;
  }
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pullRequestItem = (projectId, number, overrides = {}) => ({
  projectId,
  githubId: `pr-${projectId}-${number}`,
  number,
  title: `PR ${number}`,
  description: `Descrição ${number}`,
  state: 'open',
  authorUsername: 'autora',
  sourceBranch: `feature/${number}`,
  targetBranch: 'main',
  githubUrl: `https://github.com/usuario-s203/repositorio-s203/pull/${number}`,
  createdAtGithub: new Date('2026-09-01T10:00:00Z'),
  updatedAtGithub: new Date('2026-09-02T10:00:07Z'),
  closedAtGithub: null,
  mergedAtGithub: null,
  ...overrides
});

const issueItem = (projectId, number, overrides = {}) => ({
  projectId,
  githubId: `issue-${projectId}-${number}`,
  number,
  title: `Issue ${number}`,
  description: number % 3 ? `Descrição ${number}` : null,
  state: 'open',
  authorUsername: 'autora',
  assigneeUsername: null,
  labels: [{ id: 7, name: 'bug', color: 'd73a4a', description: null }],
  milestone: null,
  githubUrl: `https://github.com/usuario-s203/repositorio-s203/issues/${number}`,
  createdAtGithub: new Date('2026-09-01T10:00:00Z'),
  updatedAtGithub: new Date('2026-09-02T10:00:07Z'),
  closedAtGithub: null,
  ...overrides
});

const KINDS = [
  {
    label: 'PRs',
    repository: () => pullRequestRepository,
    model: () => prisma.pullRequest,
    item: pullRequestItem,
    changes: [
      ['number', () => 901],
      ['title', () => 'Título revisado'],
      ['description', () => null],
      ['state', () => 'closed'],
      ['authorUsername', () => 'outra-pessoa'],
      ['sourceBranch', () => 'feature/outra'],
      ['targetBranch', () => null],
      ['githubUrl', () => 'https://github.com/usuario-s203/repositorio-s203/pull/901'],
      ['createdAtGithub', () => new Date('2026-08-30T10:00:00Z')],
      ['updatedAtGithub', () => new Date('2026-09-05T10:00:00Z')],
      ['closedAtGithub', () => new Date('2026-09-05T09:00:00Z')],
      ['mergedAtGithub', () => new Date('2026-09-05T09:00:00Z')]
    ]
  },
  {
    label: 'issues',
    repository: () => issueRepository,
    model: () => prisma.issue,
    item: issueItem,
    changes: [
      ['number', () => 902],
      ['title', () => 'Título revisado'],
      ['description', () => 'Descrição nova'],
      ['state', () => 'closed'],
      ['authorUsername', () => 'outra-pessoa'],
      ['assigneeUsername', () => 'responsavel'],
      ['labels', () => [{ id: 8, name: 'documentação', color: '0075ca', description: 'Docs' }]],
      ['milestone', () => 'Sprint 3'],
      ['githubUrl', () => 'https://github.com/usuario-s203/repositorio-s203/issues/902'],
      ['createdAtGithub', () => new Date('2026-08-30T10:00:00Z')],
      ['updatedAtGithub', () => new Date('2026-09-05T10:00:00Z')],
      ['closedAtGithub', () => new Date('2026-09-05T09:00:00Z')]
    ]
  }
];

const comparable = (value) => (value instanceof Date ? value.toISOString() : value);

describe('S203-F22 — Fase 1: página de PRs e issues por diferença', () => {
  it.each(KINDS)(
    'F1-01 F1-04 $label: a página grava só o que mudou e conta só o que mudou',
    async ({ repository, item }) => {
      const project = await createProject(prisma);
      const numbers = Array.from({ length: 100 }, (_, index) => index + 1);
      const page = (change = () => ({})) => numbers.map((n) => item(project.id, n, change(n)));

      const created = await counted(() => repository().upsertMany(page()));
      const unchanged = await counted(() => repository().upsertMany(page()));
      const fiveChanged = await counted(() =>
        repository().upsertMany(page((n) => (n <= 5 ? { title: `Item ${n} revisado` } : {})))
      );

      expect(created.result).toMatchObject({ created: 100, updated: 0 });
      expect(created.statements).toBeLessThanOrEqual(8);
      expect(unchanged.result).toMatchObject({ created: 0, updated: 0 });
      expect(unchanged.statements).toBeLessThanOrEqual(8);
      expect(fiveChanged.result).toMatchObject({ created: 0, updated: 5 });
      expect(fiveChanged.statements).toBeLessThanOrEqual(13);

      const mixed = await counted(() =>
        repository().upsertMany([
          ...numbers
            .slice(0, 50)
            .map((n) => item(project.id, n, n <= 10 ? { title: `Item ${n} de novo` } : {})),
          ...numbers.slice(0, 50).map((n) => item(project.id, n + 500))
        ])
      );
      expect(mixed.result).toMatchObject({ created: 50, updated: 10 });
    },
    60000
  );

  it.each(KINDS)(
    'F1-02 F1-03 $label: cada campo que muda chega ao banco, e os itens sem mudança não são regravados',
    async ({ repository, model, item, changes }) => {
      const project = await createProject(prisma);
      let current = [1, 2, 3].map((n) => item(project.id, n));
      await repository().upsertMany(current);

      for (const [field, value] of changes) {
        const untouched = await model().findMany({
          where: {
            projectId: project.id,
            githubId: { in: [current[1].githubId, current[2].githubId] }
          },
          select: { githubId: true, updatedAt: true },
          orderBy: { githubId: 'asc' }
        });
        current = [{ ...current[0], [field]: value() }, current[1], current[2]];
        await pause(15);

        const result = await repository().upsertMany(current);

        const stored = await model().findUnique({
          where: { projectId_githubId: { projectId: project.id, githubId: current[0].githubId } }
        });
        expect([field, comparable(stored[field])]).toEqual([field, comparable(value())]);
        expect([field, result.updated]).toEqual([field, 1]);
        expect(
          await model().findMany({
            where: {
              projectId: project.id,
              githubId: { in: [current[1].githubId, current[2].githubId] }
            },
            select: { githubId: true, updatedAt: true },
            orderBy: { githubId: 'asc' }
          }),
          field
        ).toEqual(untouched);
      }
    },
    60000
  );

  it('F1-02 texto cortado pelo mapper e rótulos em JSON voltam iguais do banco', async () => {
    const project = await createProject(prisma);
    const longTitle = `${'Título 🚀 '.repeat(40)}fim`;
    const rawPullRequest = {
      id: 7001,
      number: 1,
      title: longTitle,
      body: null,
      state: 'open',
      user: { login: 'autora' },
      head: { ref: 'feature/x' },
      base: { ref: 'main' },
      html_url: 'https://github.com/usuario-s203/repositorio-s203/pull/1',
      created_at: '2026-09-01T10:00:00Z',
      updated_at: '2026-09-02T10:00:00Z',
      closed_at: null,
      merged_at: null
    };
    const rawIssue = {
      id: 8001,
      number: 2,
      title: longTitle,
      body: 'Corpo',
      state: 'open',
      user: { login: 'autora' },
      assignee: null,
      labels: [
        { id: 9, name: 'bug', color: 'd73a4a', description: 'Algo quebrou', extra: 'x' },
        'texto'
      ],
      milestone: { title: 'Sprint 1' },
      html_url: 'https://github.com/usuario-s203/repositorio-s203/issues/2',
      created_at: '2026-09-01T10:00:00Z',
      updated_at: '2026-09-02T10:00:00Z',
      closed_at: null
    };
    const pullRequests = [{ ...mapGithubPullRequest(rawPullRequest), projectId: project.id }];
    const issues = [{ ...mapGithubIssue(rawIssue), projectId: project.id }];

    await pullRequestRepository.upsertMany(pullRequests);
    await issueRepository.upsertMany(issues);
    const again = {
      pullRequests: await counted(() => pullRequestRepository.upsertMany(pullRequests)),
      issues: await counted(() => issueRepository.upsertMany(issues))
    };

    expect(again.pullRequests.result.updated).toBe(0);
    expect(again.issues.result.updated).toBe(0);
    expect(again.pullRequests.statements).toBeLessThanOrEqual(8);
    expect(again.issues.statements).toBeLessThanOrEqual(8);
  }, 60000);

  it.each(KINDS)(
    'F1-05 $label: item repetido na mesma página fica com a última ocorrência, sem erro',
    async ({ repository, model, item }) => {
      const project = await createProject(prisma);
      await repository().upsertMany([item(project.id, 1)]);

      const result = await repository().upsertMany([
        item(project.id, 1, { title: 'Primeira ocorrência' }),
        item(project.id, 2, { title: 'Nova, primeira' }),
        item(project.id, 1, { title: 'Última ocorrência' }),
        item(project.id, 2, { title: 'Nova, última' })
      ]);

      expect(result).toMatchObject({ created: 1, updated: 1 });
      const stored = await model().findMany({
        where: { projectId: project.id },
        select: { number: true, title: true },
        orderBy: { number: 'asc' }
      });
      expect(stored).toEqual([
        { number: 1, title: 'Última ocorrência' },
        { number: 2, title: 'Nova, última' }
      ]);
    },
    60000
  );
});
