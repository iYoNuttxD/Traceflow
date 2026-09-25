import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let prisma;
let syncProjectPullRequests;
let syncProjectCommits;
let githubBranchRepository;
let taskKanbanService;
let taskCrudService;
let settingsRepository;
let pullRequestRepository;
let commitRepository;

beforeAll(async () => {
  deployTestMigrations(configureTestDatabaseEnvironment());
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ syncProjectPullRequests } =
    await import('../../src/modules/github/services/sync-project-pull-requests.service.js'));
  ({ syncProjectCommits } =
    await import('../../src/modules/github/services/sync-project-commits.service.js'));
  ({ githubBranchRepository } =
    await import('../../src/modules/github/github-branch.repository.js'));
  ({ taskKanbanService } = await import('../../src/modules/tasks/services/task-kanban.service.js'));
  ({ taskCrudService } = await import('../../src/modules/tasks/services/task-crud.service.js'));
  ({ settingsRepository } = await import('../../src/modules/settings/settings.repository.js'));
  ({ pullRequestRepository } =
    await import('../../src/modules/pullRequests/pullRequest.repository.js'));
  ({ commitRepository } = await import('../../src/modules/commits/commit.repository.js'));
  await cleanTestDatabase(prisma);
});
afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  if (prisma) {
    await cleanTestDatabase(prisma);
    await prisma.$disconnect();
  }
});

async function fixture(suffix = 'a') {
  const user = await prisma.user.create({
    data: {
      name: `Daniel ${suffix}`,
      username: `indicator_${suffix}`,
      email: `indicator_${suffix}@example.invalid`,
      passwordHash: 'artificial'
    }
  });
  const project = await prisma.project.create({
    data: {
      name: `Indicator ${suffix}`,
      responsibleTeam: 'Equipe artificial',
      accessCode: `INDICATOR-${suffix}`,
      memberships: { create: { userId: user.id, role: 'OWNER' } },
      githubIntegration: { create: { status: 'ACTIVE' } }
    }
  });
  return { user, project };
}

const repository = { owner: 'owner', name: 'repo' };
const pr = (number) => ({ githubId: String(number + 1000), number, title: `PR ${number}` });
const event = (id, number, eventType) => ({
  providerEventId: String(id),
  number,
  eventType,
  occurredAt: new Date(`2026-09-${String(id).padStart(2, '0')}T10:00:00Z`)
});
function prClient(eventPages) {
  return {
    listPullRequestPages: vi.fn(async function* () {
      yield [pr(1)];
    }),
    listPullRequestLifecycleEventPages: vi.fn(async function* () {
      for (const page of eventPages) yield page;
    })
  };
}

describe('fundação histórica de indicadores', () => {
  it('persiste eventos reais de PR paginados, idempotentes e scoped por projeto', async () => {
    const first = await fixture('pr_a');
    const second = await fixture('pr_b');
    const pages = [
      [event(1, 1, 'CLOSED'), event(2, 1, 'REOPENED')],
      [event(3, 1, 'CLOSED'), event(4, 1, 'MERGED')]
    ];
    const onProgress = vi.fn();
    const sync = (project, client) =>
      syncProjectPullRequests({ project, repository, githubClient: client, onProgress });
    expect((await sync(first.project, prClient(pages))).lifecycleEventsCreated).toBe(4);
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect((await sync(first.project, prClient(pages))).lifecycleEventsCreated).toBe(0);
    expect(
      (await sync(first.project, prClient([pages[0], [...pages[1], event(5, 1, 'REOPENED')]])))
        .lifecycleEventsCreated
    ).toBe(1);
    expect((await sync(second.project, prClient(pages))).lifecycleEventsCreated).toBe(4);
    expect(
      await prisma.pullRequestLifecycleEvent.count({ where: { projectId: first.project.id } })
    ).toBe(5);
    expect(
      await prisma.pullRequestLifecycleEvent.count({ where: { projectId: second.project.id } })
    ).toBe(4);
    const stored = await prisma.pullRequestLifecycleEvent.findMany({
      where: { projectId: first.project.id },
      orderBy: { providerEventId: 'asc' }
    });
    expect(stored.map(({ eventType }) => eventType)).toEqual([
      'CLOSED',
      'REOPENED',
      'CLOSED',
      'MERGED',
      'REOPENED'
    ]);
    expect(stored[0].occurredAt).toEqual(event(1, 1, 'CLOSED').occurredAt);
  });

  it('falha em página posterior sem apagar eventos existentes nem confirmar backfill', async () => {
    const { project } = await fixture('pr_partial');
    await syncProjectPullRequests({
      project,
      repository,
      githubClient: prClient([[event(1, 1, 'CLOSED')]])
    });
    const before = await prisma.projectGitHubIntegration.findUnique({
      where: { projectId: project.id }
    });
    expect(before.pullRequestLifecycleSyncedAt).not.toBeNull();
    const client = prClient([]);
    client.listPullRequestLifecycleEventPages = async function* () {
      yield [event(2, 1, 'REOPENED')];
      throw new Error('page 2 failed');
    };
    await expect(
      syncProjectPullRequests({ project, repository, githubClient: client })
    ).rejects.toThrow('page 2 failed');
    expect(await prisma.pullRequestLifecycleEvent.count({ where: { projectId: project.id } })).toBe(
      1
    );
    expect(
      (await prisma.projectGitHubIntegration.findUnique({ where: { projectId: project.id } }))
        .pullRequestLifecycleSyncedAt
    ).toEqual(before.pullRequestLifecycleSyncedAt);
  });

  it('registra varredura completa mesmo quando não há eventos de PR', async () => {
    const { project } = await fixture('pr_empty');
    expect(
      (await prisma.projectGitHubIntegration.findUnique({ where: { projectId: project.id } }))
        .pullRequestLifecycleSyncedAt
    ).toBeNull();
    const result = await syncProjectPullRequests({
      project,
      repository,
      githubClient: prClient([])
    });
    expect(result.lifecycleEventsObserved).toBe(0);
    expect(
      (await prisma.projectGitHubIntegration.findUnique({ where: { projectId: project.id } }))
        .pullRequestLifecycleSyncedAt
    ).not.toBeNull();
  });

  it('reconcilia membership por SHA completo, preserva outras branches e não remove em falha', async () => {
    const { project } = await fixture('branch');
    const firstBranches = await githubBranchRepository.syncObserved(
      project.id,
      [
        { name: 'main', headSha: 'C' },
        { name: 'develop', headSha: 'DEV' }
      ],
      'main'
    );
    const firstClient = {
      listCommitPages: vi.fn(async function* ({ branch }) {
        yield (branch === 'C' ? ['A', 'B', 'C'] : ['B', 'C']).map((hash) => ({ hash }));
      })
    };
    await syncProjectCommits({
      project,
      repository,
      branches: firstBranches,
      githubClient: firstClient
    });
    const nextBranches = await githubBranchRepository.syncObserved(
      project.id,
      [
        { name: 'main', headSha: 'D' },
        { name: 'develop', headSha: 'DEV' }
      ],
      'main'
    );
    const failedClient = {
      listCommitPages: vi.fn(async function* () {
        yield [{ hash: 'A' }];
        throw new Error('incomplete');
      })
    };
    await expect(
      syncProjectCommits({
        project,
        repository,
        branches: nextBranches.filter(({ name }) => name === 'main'),
        githubClient: failedClient
      })
    ).rejects.toThrow('incomplete');
    const hashes = async (name) =>
      (
        await prisma.commitBranch.findMany({
          where: { branch: { projectId: project.id, name } },
          select: { commit: { select: { hash: true } } }
        })
      )
        .map(({ commit }) => commit.hash)
        .sort();
    expect(await hashes('main')).toEqual(['A', 'B', 'C']);
    const completeClient = {
      listCommitPages: vi.fn(async function* () {
        yield [{ hash: 'A' }, { hash: 'D' }];
      })
    };
    await syncProjectCommits({
      project,
      repository,
      branches: nextBranches.filter(({ name }) => name === 'main'),
      githubClient: completeClient
    });
    expect(await hashes('main')).toEqual(['A', 'D']);
    expect(await hashes('develop')).toEqual(['B', 'C']);
  });

  it('preenche autor GitHub estável em commit antigo sem duplicar e mantém null sem author', async () => {
    const { project } = await fixture('author');
    let [branch] = await githubBranchRepository.syncObserved(
      project.id,
      [{ name: 'main', headSha: 'H1' }],
      'main'
    );
    await syncProjectCommits({
      project,
      repository,
      branches: [branch],
      githubClient: {
        listCommitPages: async function* () {
          yield [
            { hash: 'A', authorGithubUserId: null },
            { hash: 'B', authorGithubUserId: null }
          ];
        }
      }
    });
    [branch] = await githubBranchRepository.syncObserved(
      project.id,
      [{ name: 'main', headSha: 'H2' }],
      'main'
    );
    await syncProjectCommits({
      project,
      repository,
      branches: [branch],
      githubClient: {
        listCommitPages: async function* () {
          yield [
            { hash: 'A', authorGithubUserId: '123' },
            { hash: 'B', authorGithubUserId: null }
          ];
        }
      }
    });
    expect(await prisma.commit.count({ where: { projectId: project.id } })).toBe(2);
    expect(
      (
        await prisma.commit.findUnique({
          where: { projectId_hash: { projectId: project.id, hash: 'A' } }
        })
      ).authorGithubUserId
    ).toBe('123');
    expect(
      (
        await prisma.commit.findUnique({
          where: { projectId_hash: { projectId: project.id, hash: 'B' } }
        })
      ).authorGithubUserId
    ).toBeNull();
  });

  it('remove links legados sem generation após varredura completa e purga eventos PR por cascade', async () => {
    const { project } = await fixture('legacy');
    const branch = await prisma.gitBranch.create({
      data: { projectId: project.id, name: 'main', headSha: 'HEAD', lastSeenAt: new Date() }
    });
    const oldCommit = await prisma.commit.create({ data: { projectId: project.id, hash: 'OLD' } });
    await prisma.commitBranch.create({ data: { commitId: oldCommit.id, branchId: branch.id } });
    await syncProjectCommits({
      project,
      repository,
      branches: [branch],
      githubClient: {
        listCommitPages: async function* () {
          yield [{ hash: 'NEW' }];
        }
      }
    });
    expect(
      await prisma.commitBranch.count({ where: { branchId: branch.id, commitId: oldCommit.id } })
    ).toBe(0);
    await syncProjectPullRequests({
      project,
      repository,
      githubClient: prClient([[event(1, 1, 'CLOSED')]])
    });
    await prisma.project.delete({ where: { id: project.id } });
    expect(await prisma.pullRequestLifecycleEvent.count({ where: { projectId: project.id } })).toBe(
      0
    );
  });

  it('recusa vínculo CommitBranch com Commit de outro projeto', async () => {
    const first = await fixture('scope_main');
    const second = await fixture('scope_other');
    const branch = await prisma.gitBranch.create({
      data: { projectId: first.project.id, name: 'main', headSha: 'HEAD', lastSeenAt: new Date() }
    });
    const alienCommit = await prisma.commit.create({
      data: { projectId: second.project.id, hash: 'alien' }
    });
    await expect(
      githubBranchRepository.reconcileMembership(first.project.id, branch.id, 'HEAD', [
        alienCommit.id
      ])
    ).rejects.toThrow('não pertence ao projeto');
    expect(await prisma.commitBranch.count({ where: { branchId: branch.id } })).toBe(0);
    expect(
      (await prisma.gitBranch.findUnique({ where: { id: branch.id } })).lastSyncedGeneration
    ).toBeNull();
  });

  it('congela o responsável resultante da mutação de status e não reatribui conclusões antigas', async () => {
    const { user: daniel, project } = await fixture('task');
    const joao = await prisma.user.create({
      data: {
        name: 'João',
        username: 'joao_indicator',
        email: 'joao_indicator@example.invalid',
        passwordHash: 'artificial'
      }
    });
    await prisma.projectMembership.create({
      data: { projectId: project.id, userId: joao.id, role: 'MEMBER' }
    });
    const task = await prisma.task.create({
      data: {
        projectId: project.id,
        title: 'Task',
        responsibleUserId: daniel.id,
        status: 'A_FAZER'
      }
    });
    const context = { actor: daniel, actorUserId: daniel.id };
    await taskKanbanService.moveTask(task.id, { toStatus: 'EM_ANDAMENTO' }, context);
    await taskKanbanService.updateTaskStatus(task.id, 'CONCLUIDO', context);
    await taskCrudService.updateTask(task.id, { responsibleUserId: joao.id }, context);
    let movements = await prisma.taskMovement.findMany({
      where: { taskId: task.id },
      orderBy: { id: 'asc' }
    });
    expect(movements.map(({ responsibleUserIdSnapshot }) => responsibleUserIdSnapshot)).toEqual([
      daniel.id,
      daniel.id
    ]);
    await taskKanbanService.updateTaskStatus(task.id, 'EM_ANDAMENTO', context);
    await taskCrudService.updateTask(task.id, { responsibleUserId: daniel.id }, context);
    await taskKanbanService.updateTaskStatus(
      task.id,
      { status: 'CONCLUIDO', responsibleUserId: joao.id },
      context
    );
    movements = await prisma.taskMovement.findMany({
      where: { taskId: task.id },
      orderBy: { id: 'asc' }
    });
    expect(movements.map(({ responsibleUserIdSnapshot }) => responsibleUserIdSnapshot)).toEqual([
      daniel.id,
      daniel.id,
      joao.id,
      joao.id
    ]);
    expect(
      await prisma.taskHistoryEntry.count({ where: { taskId: task.id, field: 'RESPONSIBLE' } })
    ).toBe(3);
  });

  it('exporta somente commits do ID estável e snapshots do titular em projetos ativos', async () => {
    const { user, project } = await fixture('export_a');
    const other = await fixture('export_b');
    await prisma.gitHubIdentity.create({
      data: { userId: user.id, githubUserId: '123', githubLogin: 'new-login' }
    });
    await prisma.commit.createMany({
      data: [
        {
          projectId: project.id,
          hash: 'owned',
          authorGithubUserId: '123',
          authorUsername: 'old-login'
        },
        { projectId: project.id, hash: 'other', authorGithubUserId: '456' },
        { projectId: other.project.id, hash: 'outside', authorGithubUserId: '123' }
      ]
    });
    const task = await prisma.task.create({
      data: { projectId: project.id, title: 'Export', responsibleUserId: user.id }
    });
    await taskKanbanService.moveTask(
      task.id,
      { toStatus: 'EM_ANDAMENTO' },
      { actor: user, actorUserId: user.id }
    );
    const data = await settingsRepository.exportData(user.id);
    expect(data.responsibleMovementSnapshots.map(({ taskId }) => taskId)).toEqual([task.id]);
    const commits = await settingsRepository.exportGithubAuthoredCommits(
      user.id,
      data.githubIdentity.githubUserId
    );
    expect(commits.map(({ hash }) => hash)).toEqual(['owned']);
  });

  it('recusa novos fatos P1 após soft delete do projeto', async () => {
    const { user, project } = await fixture('soft_delete');
    await syncProjectPullRequests({ project, repository, githubClient: prClient([]) });
    const branch = await prisma.gitBranch.create({
      data: { projectId: project.id, name: 'main', headSha: 'H', lastSeenAt: new Date() }
    });
    const task = await prisma.task.create({ data: { projectId: project.id, title: 'Task' } });
    await prisma.project.update({ where: { id: project.id }, data: { deletedAt: new Date() } });
    await expect(
      pullRequestRepository.appendLifecycleEvents(project.id, [event(1, 1, 'CLOSED')])
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      commitRepository.createMany([{ projectId: project.id, hash: 'after-delete' }])
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      githubBranchRepository.reconcileMembership(project.id, branch.id, 'H', [])
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      taskKanbanService.moveTask(
        task.id,
        { toStatus: 'EM_ANDAMENTO' },
        { actor: user, actorUserId: user.id }
      )
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(await prisma.pullRequestLifecycleEvent.count({ where: { projectId: project.id } })).toBe(
      0
    );
    expect(await prisma.commit.count({ where: { projectId: project.id } })).toBe(0);
    expect(await prisma.taskMovement.count({ where: { projectId: project.id } })).toBe(0);
  });
});
