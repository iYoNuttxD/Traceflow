import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let prisma;
let githubBranchRepository;
let commitRepository;
let syncProjectCommits;
let migratedTestDatabaseUrl;

beforeAll(async () => {
  const testDatabaseUrl = configureTestDatabaseEnvironment();
  migratedTestDatabaseUrl = testDatabaseUrl;
  deployTestMigrations(testDatabaseUrl);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ githubBranchRepository } =
    await import('../../src/modules/github/github-branch.repository.js'));
  ({ commitRepository } = await import('../../src/modules/commits/commit.repository.js'));
  ({ syncProjectCommits } =
    await import('../../src/modules/github/services/sync-project-commits.service.js'));
  await cleanTestDatabase(prisma);
});

afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  if (prisma) {
    await cleanTestDatabase(prisma);
    await prisma.$disconnect();
  }
});

async function fixture() {
  const user = await prisma.user.create({
    data: {
      name: 'Pessoa multibranch',
      username: 'multibranch_user',
      email: 'multibranch@example.invalid',
      passwordHash: 'artificial',
      emailVerifiedAt: new Date()
    }
  });
  const project = await prisma.project.create({
    data: {
      name: 'Projeto multibranch',
      responsibleTeam: 'Equipe artificial',
      accessCode: 'TEST-GITHUB-MULTIBRANCH',
      memberships: { create: { userId: user.id, role: 'OWNER' } },
      githubIntegration: {
        create: {
          githubRepositoryId: 'multibranch-repository',
          repositoryName: 'repo',
          repositoryFullName: 'owner/repo',
          repositoryUrl: 'https://github.com/owner/repo',
          defaultBranch: 'main',
          status: 'ACTIVE'
        }
      }
    }
  });
  return project;
}

function client(commitsByBranch) {
  return {
    listCommitPages: vi.fn(({ branch }) =>
      (async function* commitPages() {
        yield (commitsByBranch[branch] || []).map((hash) => ({ hash, message: `[${hash}]` }));
      })()
    )
  };
}

describe('persistência multibranch', () => {
  it('preserva caixa em criação, busca, filtro e sincronização', async () => {
    const project = await fixture();
    const names = ['Feature/Login', 'feature/login', 'FEATURE/LOGIN'];
    const branches = await githubBranchRepository.syncObserved(
      project.id,
      names.map((name, index) => ({ name, headSha: `case-${index}` })),
      'Feature/Login'
    );

    expect(branches).toHaveLength(3);
    expect(new Set(branches.map(({ name }) => name))).toEqual(new Set(names));
    for (const name of names) {
      expect(
        await prisma.gitBranch.findUnique({
          where: { projectId_name: { projectId: project.id, name } }
        })
      ).toMatchObject({ name });
    }

    const summary = await syncProjectCommits({
      project,
      repository: { owner: 'owner', name: 'repo' },
      branches,
      githubClient: client(
        Object.fromEntries(
          names.map((_, index) => [`case-${index}`, ['CASE-SHARED', `CASE-${index}`]])
        )
      )
    });
    expect(summary).toMatchObject({ unique: 4, created: 4, linksCreated: 6 });

    for (const [index, name] of names.entries()) {
      const filtered = await commitRepository.listByProjectId(project.id, { branch: name });
      expect(filtered.map(({ hash }) => hash).sort()).toEqual([`CASE-${index}`, 'CASE-SHARED']);
      expect(
        filtered
          .find(({ hash }) => hash === 'CASE-SHARED')
          .branchLinks.map(({ branch }) => branch.name)
      ).toEqual(expect.arrayContaining(names));
    }
  });

  it('cria vínculo canônico sem reduzir Project, Commit, PullRequest ou Issue', async () => {
    const project = await fixture();
    const commit = await prisma.commit.create({
      data: { projectId: project.id, hash: 'canonical-main' }
    });
    await prisma.pullRequest.create({
      data: { projectId: project.id, githubId: 'legacy-pr', number: 1, title: 'PR legada' }
    });
    await prisma.issue.create({
      data: { projectId: project.id, githubId: 'legacy-issue', number: 1, title: 'Issue legada' }
    });
    const counts = async () => ({
      projects: await prisma.project.count(),
      commits: await prisma.commit.count(),
      pullRequests: await prisma.pullRequest.count(),
      issues: await prisma.issue.count()
    });
    const before = await counts();
    const artifactsBefore = [
      await prisma.commit.findMany(),
      await prisma.pullRequest.findMany(),
      await prisma.issue.findMany()
    ];
    const [branch] = await githubBranchRepository.syncObserved(
      project.id,
      [{ name: 'main', headSha: 'canonical-main' }],
      'main'
    );
    await syncProjectCommits({
      project,
      repository: { owner: 'owner', name: 'repo' },
      branches: [branch],
      githubClient: client({ 'canonical-main': ['canonical-main'] })
    });

    expect(await counts()).toEqual(before);
    expect([
      await prisma.commit.findMany(),
      await prisma.pullRequest.findMany(),
      await prisma.issue.findMany()
    ]).toEqual(artifactsBefore);
    expect(branch).toMatchObject({ isDefault: true, isActive: true });
    expect(
      await prisma.commitBranch.findUnique({
        where: { commitId_branchId: { commitId: commit.id, branchId: branch.id } }
      })
    ).not.toBeNull();
  });

  it('deduplica commits, é idempotente, acrescenta merge e preserva branch removida', async () => {
    const project = await fixture();
    let branches = await githubBranchRepository.syncObserved(
      project.id,
      [
        { name: 'main', headSha: 'C' },
        { name: 'feature', headSha: 'D' }
      ],
      'main'
    );
    const githubClient = client({ C: ['A', 'B', 'C'], D: ['B', 'C', 'D'] });
    const first = await syncProjectCommits({
      project,
      repository: { owner: 'owner', name: 'repo' },
      branches,
      githubClient
    });
    const countsAfterFirst = {
      commits: await prisma.commit.count({ where: { projectId: project.id } }),
      links: await prisma.commitBranch.count()
    };
    branches = await githubBranchRepository.listByProjectId(project.id);
    const second = await syncProjectCommits({
      project,
      repository: { owner: 'owner', name: 'repo' },
      branches,
      githubClient
    });

    expect(first).toMatchObject({ unique: 4, created: 4, linksCreated: 6 });
    expect(second).toMatchObject({ created: 0, branchesSkipped: 2, pages: 0 });
    expect(githubClient.listCommitPages).toHaveBeenCalledTimes(2);
    expect(await prisma.commit.count({ where: { projectId: project.id } })).toBe(
      countsAfterFirst.commits
    );
    expect(await prisma.commitBranch.count()).toBe(countsAfterFirst.links);

    branches = await githubBranchRepository.syncObserved(
      project.id,
      [{ name: 'main', headSha: 'D' }],
      'main'
    );
    await syncProjectCommits({
      project,
      repository: { owner: 'owner', name: 'repo' },
      branches,
      githubClient: client({ D: ['A', 'B', 'C', 'D'] })
    });

    const commitD = await prisma.commit.findUnique({
      where: { projectId_hash: { projectId: project.id, hash: 'D' } },
      include: { branchLinks: { include: { branch: true } } }
    });
    expect(commitD.branchLinks.map(({ branch }) => branch.name).sort()).toEqual([
      'feature',
      'main'
    ]);
    expect(
      await prisma.gitBranch.findUnique({
        where: { projectId_name: { projectId: project.id, name: 'feature' } }
      })
    ).toMatchObject({ isActive: false });
    expect(await prisma.commit.count({ where: { projectId: project.id } })).toBe(4);
  });

  it('registra inativação e reativação sem confundir evolução normal do head', async () => {
    const project = await fixture();
    const firstSeenAt = new Date('2026-08-10T12:00:00.000Z');
    const inactiveAt = new Date('2026-08-10T13:00:00.000Z');
    const reactivatedAt = new Date('2026-08-10T14:00:00.000Z');

    await githubBranchRepository.syncObserved(
      project.id,
      [
        { name: 'main', headSha: 'M1' },
        { name: 'feature-a', headSha: 'A' }
      ],
      'main',
      firstSeenAt
    );
    const original = await prisma.gitBranch.findUnique({
      where: { projectId_name: { projectId: project.id, name: 'feature-a' } }
    });

    await githubBranchRepository.syncObserved(
      project.id,
      [{ name: 'main', headSha: 'M1' }],
      'main',
      inactiveAt
    );
    expect(
      await prisma.gitBranch.findUnique({
        where: { projectId_name: { projectId: project.id, name: 'feature-a' } }
      })
    ).toMatchObject({
      id: original.id,
      isActive: false,
      inactiveAt,
      reactivationCount: 0
    });

    await githubBranchRepository.syncObserved(
      project.id,
      [
        { name: 'main', headSha: 'M1' },
        { name: 'feature-a', headSha: 'B' }
      ],
      'main',
      reactivatedAt
    );
    const reactivated = await prisma.gitBranch.findUnique({
      where: { projectId_name: { projectId: project.id, name: 'feature-a' } }
    });
    expect(reactivated).toMatchObject({
      id: original.id,
      isActive: true,
      firstSeenAt,
      inactiveAt,
      reactivatedAt,
      reactivationCount: 1,
      headSha: 'B'
    });

    await githubBranchRepository.syncObserved(
      project.id,
      [
        { name: 'main', headSha: 'M2' },
        { name: 'feature-a', headSha: 'C' }
      ],
      'main',
      new Date('2026-08-10T15:00:00.000Z')
    );
    expect(
      await prisma.gitBranch.findUnique({
        where: { projectId_name: { projectId: project.id, name: 'feature-a' } }
      })
    ).toMatchObject({ reactivationCount: 1, reactivatedAt, headSha: 'C' });
  });

  it('deduplica 25 branches com histórico compartilhado e mantém todos os vínculos', async () => {
    const project = await fixture();
    const observed = Array.from({ length: 25 }, (_, index) => ({
      name: index === 0 ? 'main' : `feature-${index}`,
      headSha: `head-${index}`
    }));
    const branches = await githubBranchRepository.syncObserved(project.id, observed, 'main');
    const sharedHashes = ['A', 'B', 'C', 'D'];
    const listCommitPages = vi.fn(({ branch }) =>
      (async function* commitPages() {
        yield sharedHashes.map((hash) => ({ hash, message: `[${branch}] ${hash}` }));
      })()
    );
    const progress = [];

    const summary = await syncProjectCommits({
      project,
      repository: { owner: 'owner', name: 'repo' },
      branches,
      githubClient: { listCommitPages },
      onProgress: async (update) => progress.push(update)
    });

    expect(summary).toMatchObject({
      found: 4,
      foundAcrossBranches: 100,
      created: 4,
      linksCreated: 100,
      pages: 25
    });
    expect(listCommitPages).toHaveBeenCalledTimes(25);
    expect(await prisma.commit.count({ where: { projectId: project.id } })).toBe(4);
    expect(await prisma.commitBranch.count()).toBe(100);
    expect(progress).toContainEqual(expect.objectContaining({ processedBranches: 25 }));
  });
});

// Connection-local shadow tables exercise the historical backfill without
// altering the deployed schema or requiring CREATE DATABASE privileges.
async function legacyMigrationFixture(work) {
  const { PrismaClient } = await import('@prisma/client');
  const url = new URL(migratedTestDatabaseUrl);
  url.searchParams.set('connection_limit', '1');
  const legacy = new PrismaClient({ datasourceUrl: url.toString() });
  const fixture = {
    $queryRawUnsafe: (...args) => legacy.$queryRawUnsafe(...args),
    $executeRawUnsafe: (sql, ...args) => {
      if (/^CREATE TABLE/i.test(sql)) {
        sql = sql.replace(/^CREATE TABLE/i, 'CREATE TEMPORARY TABLE');
        if (!/COLLATE/i.test(sql))
          sql += ' DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci';
      }
      return legacy.$executeRawUnsafe(sql, ...args);
    }
  };
  try {
    await work(fixture);
  } finally {
    for (const name of [
      'CommitBranch',
      'GitBranch',
      'GitHubRepositoryAuthorization',
      'GitHubWebhookDelivery',
      'GitHubInstallation',
      'User',
      'Commit',
      'Project'
    ]) {
      await legacy.$executeRawUnsafe(`DROP TEMPORARY TABLE IF EXISTS \`${name}\``);
    }
    await legacy.$disconnect();
  }
}

async function applyHistoricalSql(client, migration) {
  const { readFile } = await import('node:fs/promises');
  const sql = await readFile(
    new URL(`../../prisma/migrations/${migration}/migration.sql`, import.meta.url),
    'utf8'
  );
  for (const statement of sql
    .replace(/^--.*$/gm, '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)) {
    // MySQL forbids FKs on temporary tables. Deployed-schema/FK behavior is
    // covered separately; all historical data and lifecycle SQL runs unchanged.
    if (/ADD CONSTRAINT.*FOREIGN KEY/s.test(statement)) continue;
    await client.$executeRawUnsafe(statement);
  }
}

describe('historical GitHub migrations with real legacy rows', () => {
  it('backfills branches and links while preserving every legacy commit and project', async () => {
    await legacyMigrationFixture(async (db) => {
      await db.$executeRawUnsafe(
        'CREATE TABLE Project (id INT PRIMARY KEY, githubDefaultBranch VARCHAR(191))'
      );
      await db.$executeRawUnsafe(
        'CREATE TABLE `Commit` (id INT PRIMARY KEY, projectId INT NOT NULL, branch VARCHAR(191), message VARCHAR(191))'
      );
      await db.$executeRawUnsafe("INSERT INTO Project VALUES (1, 'main'), (2, 'release')");
      await db.$executeRawUnsafe(
        "INSERT INTO `Commit` VALUES (1,1,'main','first'),(2,1,'main','second'),(3,1,'feature','third'),(4,2,'release','fourth'),(5,1,NULL,'no branch'),(6,1,'','empty branch')"
      );
      const before = await db.$queryRawUnsafe('SELECT * FROM `Commit` ORDER BY id');
      await applyHistoricalSql(db, '20260810120000_l1_2_github_multibranch');
      expect(await db.$queryRawUnsafe('SELECT * FROM `Commit` ORDER BY id')).toEqual(before);
      expect(await db.$queryRawUnsafe('SELECT * FROM Project ORDER BY id')).toEqual([
        { id: 1, githubDefaultBranch: 'main' },
        { id: 2, githubDefaultBranch: 'release' }
      ]);
      expect(
        await db.$queryRawUnsafe(
          'SELECT projectId, name, isDefault FROM GitBranch ORDER BY projectId, name'
        )
      ).toEqual([
        { projectId: 1, name: 'feature', isDefault: 0 },
        { projectId: 1, name: 'main', isDefault: 1 },
        { projectId: 2, name: 'release', isDefault: 1 }
      ]);
      expect(
        await db.$queryRawUnsafe(
          'SELECT cb.commitId, b.projectId, b.name FROM CommitBranch cb JOIN GitBranch b ON b.id=cb.branchId ORDER BY cb.commitId'
        )
      ).toEqual([
        { commitId: 1, projectId: 1, name: 'main' },
        { commitId: 2, projectId: 1, name: 'main' },
        { commitId: 3, projectId: 1, name: 'feature' },
        { commitId: 4, projectId: 2, name: 'release' }
      ]);
    });
  });

  it('converts DELETED installations and incomplete deliveries without losing historical rows', async () => {
    await legacyMigrationFixture(async (db) => {
      await db.$executeRawUnsafe(
        "CREATE TABLE GitHubInstallation (id INT PRIMARY KEY, status ENUM('ACTIVE','SUSPENDED','DELETED') NOT NULL)"
      );
      await db.$executeRawUnsafe('CREATE TABLE User (id INT PRIMARY KEY)');
      await db.$executeRawUnsafe(
        'CREATE TABLE GitHubWebhookDelivery (id INT PRIMARY KEY, receivedAt DATETIME(3) NOT NULL, processedAt DATETIME(3))'
      );
      await db.$executeRawUnsafe(
        "INSERT INTO GitHubInstallation VALUES (1,'DELETED'),(2,'ACTIVE'),(3,'SUSPENDED')"
      );
      await db.$executeRawUnsafe(
        "INSERT INTO GitHubWebhookDelivery VALUES (1,'2026-01-01',NULL),(2,'2026-01-01','2026-01-02')"
      );
      await applyHistoricalSql(db, '20260820180000_lr3_github_hardening');
      expect(await db.$queryRawUnsafe('SELECT * FROM GitHubInstallation ORDER BY id')).toEqual([
        { id: 1, status: 'REMOVED' },
        { id: 2, status: 'ACTIVE' },
        { id: 3, status: 'SUSPENDED' }
      ]);
      expect(
        await db.$queryRawUnsafe(
          'SELECT id, status, attemptCount, failureStep, failureCode, lastAttemptAt FROM GitHubWebhookDelivery ORDER BY id'
        )
      ).toEqual([
        {
          id: 1,
          status: 'FAILED',
          attemptCount: 1,
          failureStep: 'legacy_delivery',
          failureCode: 'GITHUB_WEBHOOK_LEGACY_INCOMPLETE',
          lastAttemptAt: new Date('2026-01-01')
        },
        {
          id: 2,
          status: 'PROCESSED',
          attemptCount: 1,
          failureStep: null,
          failureCode: null,
          lastAttemptAt: new Date('2026-01-02')
        }
      ]);
    });
  });
});

it('skips a secondary branch without SHA while preserving its previous links', async () => {
  const project = await fixture();
  const branches = await githubBranchRepository.syncObserved(
    project.id,
    [
      { name: 'main', headSha: 'main-head' },
      { name: 'feature', headSha: null }
    ],
    'main'
  );
  const githubClient = client({ 'main-head': ['valid-commit'] });
  const summary = await syncProjectCommits({
    project,
    repository: { owner: 'owner', name: 'repo', defaultBranch: 'main' },
    branches,
    githubClient
  });
  expect(summary.branchesSkipped).toBe(1);
  expect(summary.created).toBe(1);
  expect(githubClient.listCommitPages).toHaveBeenCalledTimes(1);
  expect(
    (
      await prisma.gitBranch.findUnique({
        where: { projectId_name: { projectId: project.id, name: 'feature' } }
      })
    ).lastSyncedGeneration
  ).toBeNull();
});

it.each(['main', 'trunk'])(
  'fails explicitly for the critical %s branch without SHA',
  async (name) => {
    const project = await fixture();
    const branches = await githubBranchRepository.syncObserved(
      project.id,
      [{ name, headSha: null }],
      name
    );
    await expect(
      syncProjectCommits({
        project,
        repository: { owner: 'owner', name: 'repo', defaultBranch: name },
        branches,
        githubClient: client({})
      })
    ).rejects.toThrow('sem head SHA');
  }
);
