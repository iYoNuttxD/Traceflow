import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let prisma;
let githubBranchRepository;
let syncProjectCommits;
const migrationPath = new URL(
  '../../prisma/migrations/20260810120000_l1_2_github_multibranch/migration.sql',
  import.meta.url
);

beforeAll(async () => {
  const testDatabaseUrl = configureTestDatabaseEnvironment();
  deployTestMigrations(testDatabaseUrl);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ githubBranchRepository } =
    await import('../../src/modules/github/github-branch.repository.js'));
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
      githubOwner: 'owner',
      githubRepo: 'repo',
      githubDefaultBranch: 'main',
      memberships: { create: { userId: user.id, role: 'OWNER' } }
    }
  });
  return project;
}

function client(commitsByBranch) {
  return {
    listCommitPages: ({ branch }) =>
      (async function* commitPages() {
        yield (commitsByBranch[branch] || []).map((hash) => ({ hash, message: `[${hash}]` }));
      })()
  };
}

describe('persistência multibranch', () => {
  it('faz backfill legado sem reduzir Project, Commit, PullRequest ou Issue', async () => {
    const project = await fixture();
    const commit = await prisma.commit.create({
      data: { projectId: project.id, hash: 'legacy-main', branch: 'main' }
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
    const migration = await readFile(migrationPath, 'utf8');
    const branchBackfill = migration.match(/INSERT INTO `GitBranch`[\s\S]*?;/)?.[0];
    const linkBackfill = migration.match(/INSERT INTO `CommitBranch`[\s\S]*?;/)?.[0];

    expect(branchBackfill).toBeTruthy();
    expect(linkBackfill).toBeTruthy();
    await prisma.$executeRawUnsafe(branchBackfill);
    await prisma.$executeRawUnsafe(linkBackfill);

    expect(await counts()).toEqual(before);
    const branch = await prisma.gitBranch.findUnique({
      where: { projectId_name: { projectId: project.id, name: 'main' } }
    });
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
    const githubClient = client({ main: ['A', 'B', 'C'], feature: ['B', 'C', 'D'] });
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
    const second = await syncProjectCommits({
      project,
      repository: { owner: 'owner', name: 'repo' },
      branches,
      githubClient
    });

    expect(first).toMatchObject({ unique: 4, created: 4, linksCreated: 6 });
    expect(second.created).toBe(0);
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
      githubClient: client({ main: ['A', 'B', 'C', 'D'] })
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
});
