import { Readable } from 'node:stream';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanTestDatabase,
  configureTestDatabaseEnvironment,
  deployTestMigrations
} from '../helpers/test-database.js';

let prisma;
let deletionRepository;
let deletionService;
let storage;
let membershipRepository;
let projectRepository;
let syncProjectBranches;
let syncProjectCommits;
let syncProjectIssues;
let syncProjectPullRequests;

function deferred() {
  let resolve;
  const promise = new Promise((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

async function createProjectWithOwner(name = 'Projeto concorrente') {
  const user = await prisma.user.create({
    data: { name: 'Owner artificial', username: 'raceowner', email: 'raceowner@example.invalid' }
  });
  const project = await prisma.project.create({
    data: {
      name,
      responsibleTeam: 'Equipe artificial',
      accessCode: 'PROJECTRACE',
      memberships: { create: { userId: user.id, role: 'OWNER' } }
    }
  });
  return { project, user };
}

async function addEvidence(project, user) {
  const testCase = await prisma.testCase.create({
    data: {
      projectId: project.id,
      title: 'Caso artificial',
      preconditions: 'Pronto',
      expectedResult: 'OK',
      responsibleUserId: user.id
    }
  });
  const version = await prisma.testCaseVersion.create({
    data: { testCaseId: testCase.id, version: 1, snapshotJson: { title: 'Caso artificial' } }
  });
  const commit = await prisma.commit.create({
    data: { projectId: project.id, hash: 'a'.repeat(40) }
  });
  const execution = await prisma.testExecution.create({
    data: {
      projectId: project.id,
      testCaseId: testCase.id,
      testCaseVersionId: version.id,
      testCaseVersion: 1,
      environment: 'LOCAL',
      result: 'PASS',
      testedReferenceType: 'COMMIT',
      testedCommitId: commit.id,
      testedReferenceSnapshot: { hash: 'a'.repeat(40) },
      executedByDisplayNameSnapshot: 'Owner artificial'
    }
  });
  const attempt = await storage.begin();
  await storage.receive(attempt, {
    fieldname: 'evidence',
    originalname: 'race.txt',
    stream: Readable.from(['Evidence for concurrent purge'])
  });
  const [file] = await storage.prepare(attempt, []);
  await storage.cleanup(attempt, { committed: true });
  await prisma.testEvidence.create({
    data: {
      projectId: project.id,
      executionId: execution.id,
      scope: file.scope,
      kind: file.kind,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
      storageKey: file.storageKey
    }
  });
  return file;
}

beforeAll(async () => {
  const url = configureTestDatabaseEnvironment();
  deployTestMigrations(url);
  ({ prisma } = await import('../../src/database/prismaClient.js'));
  ({ projectDeletionRepository: deletionRepository } =
    await import('../../src/modules/projects/project-deletion.repository.js'));
  ({ createProjectDeletionService: deletionService } =
    await import('../../src/modules/projects/services/project-deletion.service.js'));
  ({ projectMembershipRepository: membershipRepository } =
    await import('../../src/modules/projects/project-membership.repository.js'));
  ({ projectRepository } = await import('../../src/modules/projects/project.repository.js'));
  ({ syncProjectBranches } =
    await import('../../src/modules/github/services/sync-project-branches.service.js'));
  ({ syncProjectCommits } =
    await import('../../src/modules/github/services/sync-project-commits.service.js'));
  ({ syncProjectIssues } =
    await import('../../src/modules/github/services/sync-project-issues.service.js'));
  ({ syncProjectPullRequests } =
    await import('../../src/modules/github/services/sync-project-pull-requests.service.js'));
  const { LocalTestEvidenceStorage } =
    await import('../../src/modules/testCases/storage/local-test-evidence.storage.js');
  storage = new LocalTestEvidenceStorage({
    directory: process.env.TEST_EVIDENCE_STORAGE_DIR,
    environment: 'test'
  });
  await cleanTestDatabase(prisma);
});

afterEach(async () => cleanTestDatabase(prisma));
afterAll(async () => {
  await cleanTestDatabase(prisma);
  await prisma.$disconnect();
});

describe('Project deletion concorrente com MySQL e storage reais', () => {
  it.each(['branches', 'commits', 'pull requests', 'issues'])(
    'não persiste %s depois do soft delete confirmado durante sync',
    async (kind) => {
      const { project, user } = await createProjectWithOwner();
      const service = deletionService({ storage });
      const coordinates = { owner: 'artificial', name: 'repository', defaultBranch: 'main' };
      const branch =
        kind === 'commits'
          ? await prisma.gitBranch.create({
              data: {
                projectId: project.id,
                name: 'main',
                headSha: 'new-head',
                lastSeenAt: new Date()
              }
            })
          : null;
      let checks = 0;
      const assertActive = async () => {
        expect(await projectRepository.isActive(project.id)).toBe(true);
        checks += 1;
        if (kind !== 'commits' || checks === 2) await service.requestDeletion(project.id, user.id);
      };
      const githubClient = {
        async *listBranchPages() {
          yield [{ name: 'main', headSha: 'new-head' }];
        },
        async *listCommitPages() {
          yield [{ hash: 'b'.repeat(40), message: 'new commit' }];
        },
        async *listPullRequestPages() {
          yield [{ githubId: 'pr-1', number: 1, title: 'new PR' }];
        },
        async *listIssuePages() {
          yield [{ githubId: 'issue-1', number: 1, title: 'new Issue' }];
        }
      };
      const sync =
        kind === 'branches'
          ? syncProjectBranches({ project, repository: coordinates, githubClient, assertActive })
          : kind === 'commits'
            ? syncProjectCommits({
                project,
                repository: coordinates,
                branches: [branch],
                githubClient,
                assertActive
              })
            : kind === 'pull requests'
              ? syncProjectPullRequests({
                  project,
                  repository: coordinates,
                  githubClient,
                  assertActive
                })
              : syncProjectIssues({ project, repository: coordinates, githubClient, assertActive });
      await expect(sync).rejects.toMatchObject({ statusCode: 404 });
      expect(
        (await prisma.project.findUnique({ where: { id: project.id } })).deletedAt
      ).toBeInstanceOf(Date);
      expect(await prisma.gitBranch.count({ where: { projectId: project.id } })).toBe(
        branch ? 1 : 0
      );
      expect(await prisma.commit.count({ where: { projectId: project.id } })).toBe(0);
      expect(await prisma.pullRequest.count({ where: { projectId: project.id } })).toBe(0);
      expect(await prisma.issue.count({ where: { projectId: project.id } })).toBe(0);
    }
  );

  it('não atualiza metadata ou estado terminal de sync depois da exclusão', async () => {
    const { project, user } = await createProjectWithOwner();
    await prisma.projectGitHubIntegration.create({
      data: { projectId: project.id, lastSyncStatus: 'PENDENTE' }
    });
    await deletionService({ storage }).requestDeletion(project.id, user.id);
    const at = new Date();
    expect(await projectRepository.markGithubSyncStarted(project.id, at)).toBeNull();
    expect(await projectRepository.markGithubSyncSucceeded(project.id, at)).toBeNull();
    expect(await projectRepository.markGithubSyncFailed(project.id, at, 'Falha')).toBeNull();
    await expect(
      projectRepository.updateGithubRepositoryMetadata(project.id, { repositoryName: 'new' })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(
      await prisma.projectGitHubIntegration.findUnique({ where: { projectId: project.id } })
    ).toMatchObject({ lastSyncStatus: 'PENDENTE', repositoryName: null });
  });

  it.each([
    ['delete', 'MEMBER', 403],
    ['restore', 'MEMBER', 403],
    ['permanent', 'MEMBER', 403],
    ['delete', 'INACTIVE', 404]
  ])(
    'revalida OWNER depois de %s concorrer com revogação %s',
    async (operation, change, statusCode) => {
      const { project, user } = await createProjectWithOwner();
      const secondOwner = await prisma.user.create({
        data: {
          name: 'Segundo owner',
          username: 'secondowner',
          email: 'secondowner@example.invalid'
        }
      });
      await prisma.projectMembership.create({
        data: { projectId: project.id, userId: secondOwner.id, role: 'OWNER' }
      });
      const service = deletionService({ storage });
      if (operation !== 'delete') await service.requestDeletion(project.id, user.id);
      const entered = deferred();
      const release = deferred();
      const transition = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM Project WHERE id = ${project.id} FOR UPDATE`;
        await tx.$queryRaw`
        SELECT id FROM ProjectMembership
        WHERE projectId = ${project.id} AND userId = ${user.id} FOR UPDATE
      `;
        await tx.projectMembership.update({
          where: { projectId_userId: { projectId: project.id, userId: user.id } },
          data: change === 'INACTIVE' ? { isActive: false } : { role: 'MEMBER' }
        });
        entered.resolve();
        await release.promise;
      });
      await entered.promise;
      const mutation =
        operation === 'delete'
          ? service.requestDeletion(project.id, user.id)
          : operation === 'restore'
            ? service.restore(project.id, user.id)
            : service.purge(project.id, user.id, project.name);
      release.resolve();
      await transition;
      await expect(mutation).rejects.toMatchObject({ statusCode });
      const stored = await prisma.project.findUnique({ where: { id: project.id } });
      expect(Boolean(stored.deletedAt)).toBe(operation !== 'delete');
      expect(stored.purgeClaimId).toBeNull();
      expect(await membershipRepository.findByUser(project.id, secondOwner.id)).toMatchObject({
        role: 'OWNER',
        isActive: true
      });
      if (operation === 'delete') {
        await expect(service.requestDeletion(project.id, secondOwner.id)).resolves.toMatchObject({
          projectId: project.id
        });
      }
    }
  );

  it('não deixa outro worker restaurar bytes ou apagar journal de purge ativo', async () => {
    const { project, user } = await createProjectWithOwner();
    const file = await addEvidence(project, user);
    const workerA = deletionService({ storage });
    const workerB = deletionService({ storage });
    await workerA.requestDeletion(project.id, user.id);

    const staged = deferred();
    const resume = deferred();
    const originalDeleteGraph = deletionRepository.deleteProjectGraph;
    deletionRepository.deleteProjectGraph = async (...args) => {
      staged.resolve();
      await resume.promise;
      return originalDeleteGraph.call(deletionRepository, ...args);
    };
    try {
      const purge = workerA.purge(project.id, user.id, project.name);
      await staged.promise;
      const competingRun = await workerB.processDue({ dryRun: false });
      expect(competingRun.storageRecovered).toBe(0);
      expect(
        await prisma.projectPurgeStorageCleanup.count({ where: { projectId: project.id } })
      ).toBe(1);
      resume.resolve();
      await expect(purge).resolves.toMatchObject({ purged: true, storageFailures: 0 });
      await expect(
        access(join(process.env.TEST_EVIDENCE_STORAGE_DIR, file.storageKey))
      ).rejects.toMatchObject({ code: 'ENOENT' });
      expect(
        await prisma.projectPurgeStorageCleanup.count({ where: { projectId: project.id } })
      ).toBe(0);
    } finally {
      resume.resolve();
      deletionRepository.deleteProjectGraph = originalDeleteGraph;
    }
  });

  it('recupera claim abandonado sem permitir que o worker antigo finalize ou restaure bytes', async () => {
    const { project, user } = await createProjectWithOwner();
    const file = await addEvidence(project, user);
    const workerA = deletionService({ storage });
    const workerB = deletionService({ storage });
    await workerA.requestDeletion(project.id, user.id);

    const staged = deferred();
    const resume = deferred();
    const originalDeleteGraph = deletionRepository.deleteProjectGraph;
    let intercepted = false;
    deletionRepository.deleteProjectGraph = async (...args) => {
      if (!intercepted) {
        intercepted = true;
        staged.resolve();
        await resume.promise;
      }
      return originalDeleteGraph.call(deletionRepository, ...args);
    };
    try {
      const oldPurge = workerA.purge(project.id, user.id, project.name);
      await staged.promise;
      const deadline = (await prisma.project.findUnique({ where: { id: project.id } }))
        .deletionScheduledFor;
      const takeover = await workerB.processDue({ now: deadline, dryRun: false });
      expect(takeover).toMatchObject({ processed: 1, failed: 0 });
      resume.resolve();
      await expect(oldPurge).rejects.toMatchObject({ statusCode: 404 });
      expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeNull();
      expect(
        await prisma.projectPurgeStorageCleanup.count({ where: { projectId: project.id } })
      ).toBe(0);
      await expect(
        access(join(process.env.TEST_EVIDENCE_STORAGE_DIR, file.storageKey))
      ).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      resume.resolve();
      deletionRepository.deleteProjectGraph = originalDeleteGraph;
    }
  });

  it('mantém journal retryable se remoção física falha e limpa no próximo worker', async () => {
    const { project, user } = await createProjectWithOwner();
    const file = await addEvidence(project, user);
    await deletionService({ storage }).requestDeletion(project.id, user.id);
    let fail = true;
    const failingStorage = Object.create(storage);
    failingStorage.deletePurged = async (...args) => {
      if (fail) {
        fail = false;
        throw Object.assign(new Error('Falha artificial de storage'), { code: 'EACCES' });
      }
      return storage.deletePurged(...args);
    };
    const result = await deletionService({ storage: failingStorage }).purge(
      project.id,
      user.id,
      project.name
    );
    expect(result).toEqual({ purged: true, storageFailures: 1 });
    const [journal] = await prisma.projectPurgeStorageCleanup.findMany({
      where: { projectId: project.id }
    });
    expect(journal).toMatchObject({ status: 'READY', claimToken: null, attempts: 1 });
    await access(join(process.env.TEST_EVIDENCE_STORAGE_DIR, '.purge', journal.purgeKey));

    expect(await deletionService({ storage }).processDue({ dryRun: false })).toMatchObject({
      storageRecovered: 1,
      failed: 0
    });
    expect(
      await prisma.projectPurgeStorageCleanup.count({ where: { projectId: project.id } })
    ).toBe(0);
    await expect(
      access(join(process.env.TEST_EVIDENCE_STORAGE_DIR, file.storageKey))
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      access(join(process.env.TEST_EVIDENCE_STORAGE_DIR, '.purge', journal.purgeKey))
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
