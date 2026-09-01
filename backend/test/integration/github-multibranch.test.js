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

beforeAll(async () => {
  const testDatabaseUrl = configureTestDatabaseEnvironment();
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
  it('preserva caixa em criação, busca, filtro, sincronização e rastreabilidade', async () => {
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
      githubClient: client(Object.fromEntries(names.map((name) => [name, ['CASE-SHARED']])))
    });
    expect(summary).toMatchObject({ unique: 1, created: 1, linksCreated: 3 });

    for (const name of names) {
      const filtered = await commitRepository.listByProjectId(project.id, { branch: name });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].branchLinks.map(({ branch }) => branch.name)).toEqual(
        expect.arrayContaining(names)
      );
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
    const branch = await prisma.gitBranch.create({
      data: {
        projectId: project.id,
        name: 'main',
        isDefault: true,
        isActive: true,
        lastSeenAt: new Date()
      }
    });
    await prisma.commitBranch.create({ data: { commitId: commit.id, branchId: branch.id } });

    expect(await counts()).toEqual(before);
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
