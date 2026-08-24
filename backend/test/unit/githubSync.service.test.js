import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  forInstallation: vi.fn(),
  githubBranchRepository: { syncObserved: vi.fn(), markSuccessfullySynced: vi.fn() },
  projectRepository: {
    findById: vi.fn(),
    updateGithubRepositoryMetadata: vi.fn(),
    markGithubSyncStarted: vi.fn(),
    markGithubSyncSucceeded: vi.fn(),
    markGithubSyncFailed: vi.fn()
  },
  commitRepository: {
    findHashesByProjectId: vi.fn(),
    findByProjectIdAndHashes: vi.fn(),
    createMany: vi.fn(),
    createBranchLinks: vi.fn(),
    findByBranchId: vi.fn()
  },
  commitSuggestionService: { detectForCommits: vi.fn() },
  pullRequestRepository: { upsertMany: vi.fn() },
  issueRepository: { upsertMany: vi.fn() }
}));

vi.mock('../../src/modules/github/github.client.js', () => ({
  githubInstallationClientFactory: { forInstallation: mocks.forInstallation }
}));
vi.mock('../../src/modules/github/github-branch.repository.js', () => ({
  githubBranchRepository: mocks.githubBranchRepository
}));
vi.mock('../../src/modules/projects/project.repository.js', () => ({
  projectRepository: mocks.projectRepository
}));
vi.mock('../../src/modules/commits/commit.repository.js', () => ({
  commitRepository: mocks.commitRepository
}));
vi.mock('../../src/modules/traceability/commit-suggestion.service.js', () => ({
  commitSuggestionService: mocks.commitSuggestionService
}));
vi.mock('../../src/modules/pullRequests/pullRequest.repository.js', () => ({
  pullRequestRepository: mocks.pullRequestRepository
}));
vi.mock('../../src/modules/issues/issue.repository.js', () => ({
  issueRepository: mocks.issueRepository
}));

import { githubSyncService } from '../../src/modules/github/githubSync.service.js';
import { ExternalServiceError, ERROR_CODES } from '../../src/shared/errors/index.js';

const project = {
  id: 7,
  githubIntegration: {
    githubRepositoryId: '200',
    repositoryName: 'repositorio-artificial',
    repositoryFullName: 'usuario-artificial/repositorio-artificial',
    defaultBranch: 'main',
    lastSyncAt: new Date('2026-01-01T00:00:00.000Z'),
    status: 'ACTIVE',
    installation: { status: 'ACTIVE', githubInstallationId: '991' }
  }
};
const repository = {
  githubRepositoryId: '200',
  name: 'repositorio-artificial',
  owner: 'usuario-artificial',
  fullName: 'usuario-artificial/repositorio-artificial',
  url: 'https://github.com/usuario-artificial/repositorio-artificial',
  defaultBranch: 'main',
  private: false,
  description: null
};

async function* pages(...values) {
  for (const value of values) yield value;
}

function buildGithubDouble({
  branches = [[{ name: 'main', headSha: 'head-main' }]],
  commits = [[]],
  pullRequests = [[]],
  issues = [[]]
} = {}) {
  return {
    getRepository: vi.fn().mockResolvedValue(repository),
    listBranchPages: vi.fn(() => pages(...branches)),
    listCommitPages: vi.fn(() => pages(...commits)),
    listPullRequestPages: vi.fn(() => pages(...pullRequests)),
    listIssuePages: vi.fn(() => pages(...issues))
  };
}

describe('githubSyncService com client e persistência substituídos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const storedCommits = new Map([
      [
        'hash-existente',
        { id: 1, projectId: project.id, hash: 'hash-existente', message: '[TASK-1]' }
      ]
    ]);
    mocks.projectRepository.findById.mockResolvedValue(project);
    mocks.projectRepository.updateGithubRepositoryMetadata.mockResolvedValue(project);
    mocks.projectRepository.markGithubSyncStarted.mockResolvedValue(project);
    mocks.projectRepository.markGithubSyncSucceeded.mockResolvedValue({
      ...project,
      githubIntegration: { ...project.githubIntegration, lastSyncStatus: 'SINCRONIZADO' }
    });
    mocks.projectRepository.markGithubSyncFailed.mockResolvedValue(project);
    mocks.githubBranchRepository.syncObserved.mockImplementation(
      async (_projectId, branches, defaultBranch) =>
        branches.map((branch, index) => ({
          id: index + 10,
          ...branch,
          isActive: true,
          isDefault: branch.name === defaultBranch
        }))
    );
    mocks.commitRepository.findHashesByProjectId.mockResolvedValue(['hash-existente']);
    mocks.commitRepository.createMany.mockImplementation(async (items) => {
      items.forEach((item, index) =>
        storedCommits.set(item.hash, {
          id: storedCommits.size + index + 1,
          projectId: item.projectId,
          message: '[TASK-1]',
          hash: item.hash
        })
      );
      return { count: items.length };
    });
    mocks.commitRepository.findByProjectIdAndHashes.mockImplementation(async (_projectId, hashes) =>
      hashes.map((hash) => storedCommits.get(hash)).filter(Boolean)
    );
    mocks.commitRepository.createBranchLinks.mockImplementation(async (items) => ({
      count: items.length
    }));
    mocks.commitRepository.findByBranchId.mockResolvedValue([]);
    mocks.githubBranchRepository.markSuccessfullySynced.mockResolvedValue(null);
    mocks.commitSuggestionService.detectForCommits.mockResolvedValue({ createdSuggestions: 0 });
    mocks.pullRequestRepository.upsertMany.mockImplementation(async (items) => ({
      created: items.length,
      updated: 0
    }));
    mocks.issueRepository.upsertMany.mockImplementation(async (items) => ({
      created: 0,
      updated: items.length
    }));
  });

  it('sincroniza pela Installation sem consultar ou exigir GitHubIdentity', async () => {
    const github = buildGithubDouble({
      commits: [[{ hash: 'hash-existente' }], [{ hash: 'hash-novo' }]],
      pullRequests: [[{ githubId: '301', number: 3 }], []],
      issues: [[{ githubId: '401', number: 4 }], []]
    });
    mocks.forInstallation.mockResolvedValue(github);

    const result = await githubSyncService.syncProjectGithubData(String(project.id));

    expect(project).not.toHaveProperty('githubIdentity');
    expect(github.getRepository).toHaveBeenCalledWith(repository.owner, repository.name);
    expect(github.listBranchPages).toHaveBeenCalledWith(
      expect.objectContaining({ owner: repository.owner, repo: repository.name })
    );
    expect(github.listCommitPages).toHaveBeenCalledWith(
      expect.objectContaining({ branch: 'main' })
    );
    expect(github.listPullRequestPages).toHaveBeenCalledWith({
      owner: repository.owner,
      repo: repository.name
    });
    expect(mocks.commitRepository.createMany).toHaveBeenNthCalledWith(1, []);
    expect(mocks.commitRepository.createMany).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({ hash: 'hash-novo', projectId: project.id })
    ]);
    expect(mocks.commitSuggestionService.detectForCommits).toHaveBeenCalledWith(project.id, [
      expect.objectContaining({ projectId: project.id, message: '[TASK-1]' })
    ]);
    expect(result.summary).toEqual({
      branches: { found: 1, active: 1, defaultBranch: 'main' },
      commits: {
        found: 2,
        foundAcrossBranches: 2,
        unique: 2,
        created: 1,
        skipped: 1,
        linksCreated: 2,
        pages: 2,
        branchesSkipped: 0
      },
      pullRequests: { found: 1, created: 1, updated: 0 },
      issues: { found: 1, created: 0, updated: 1 }
    });
    expect(mocks.projectRepository.markGithubSyncSucceeded).toHaveBeenCalledOnce();
  });

  it('resolve branch ausente pela consulta do repositório e atualiza metadados canônicos', async () => {
    mocks.projectRepository.findById.mockResolvedValue({
      ...project,
      githubIntegration: { ...project.githubIntegration, defaultBranch: null }
    });
    const github = buildGithubDouble();
    mocks.forInstallation.mockResolvedValue(github);
    await githubSyncService.syncProjectGithubData(project.id);
    expect(mocks.projectRepository.updateGithubRepositoryMetadata).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({ defaultBranch: 'main', githubRepositoryId: '200' })
    );
  });

  it('preserva lotes anteriores, mantém lastSyncAt e marca falha sanitizada em paginação interrompida', async () => {
    const failure = new ExternalServiceError(
      'Falha de conexão com o GitHub.',
      500,
      ERROR_CODES.EXTERNAL_SERVICE_ERROR
    );
    const github = buildGithubDouble();
    github.listCommitPages.mockReturnValue(
      (async function* interrupted() {
        yield [{ hash: 'hash-novo' }];
        throw failure;
      })()
    );
    mocks.forInstallation.mockResolvedValue(github);

    await expect(githubSyncService.syncProjectGithubData(project.id)).rejects.toBe(failure);
    expect(mocks.commitRepository.createMany).toHaveBeenCalledWith([
      expect.objectContaining({ hash: 'hash-novo', projectId: project.id })
    ]);
    expect(mocks.projectRepository.markGithubSyncSucceeded).not.toHaveBeenCalled();
    expect(mocks.projectRepository.markGithubSyncFailed).toHaveBeenCalledWith(
      project.id,
      expect.any(Date),
      'Falha de conexão com o GitHub.'
    );
  });

  it('impede sincronizações concorrentes do mesmo projeto na mesma instância', async () => {
    let release;
    const github = buildGithubDouble();
    github.getRepository.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(repository);
        })
    );
    mocks.forInstallation.mockResolvedValue(github);

    const first = githubSyncService.syncProjectGithubData(project.id);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await expect(githubSyncService.syncProjectGithubData(project.id)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Sincronização do GitHub já está em andamento para este projeto.'
    });
    release();
    await expect(first).resolves.toMatchObject({
      summary: { commits: { foundAcrossBranches: 0 } }
    });
  });

  it('deduplica commits encontrados em várias branches e cria todos os vínculos', async () => {
    const stored = new Set();
    const ids = new Map();
    let nextId = 1;
    mocks.commitRepository.findHashesByProjectId.mockImplementation(async (_projectId, hashes) =>
      hashes.filter((hash) => stored.has(hash))
    );
    mocks.commitRepository.createMany.mockImplementation(async (items) => {
      for (const item of items) {
        stored.add(item.hash);
        if (!ids.has(item.hash)) ids.set(item.hash, nextId++);
      }
      return { count: items.length };
    });
    mocks.commitRepository.findByProjectIdAndHashes.mockImplementation(async (projectId, hashes) =>
      hashes
        .filter((hash) => stored.has(hash))
        .map((hash) => ({ id: ids.get(hash), projectId, hash, message: `[${hash}]` }))
    );
    const links = [];
    mocks.commitRepository.createBranchLinks.mockImplementation(async (items) => {
      links.push(...items);
      return { count: items.length };
    });
    const github = buildGithubDouble({
      branches: [
        [
          { name: 'main', headSha: 'C' },
          { name: 'feature', headSha: 'D' }
        ]
      ]
    });
    github.listCommitPages.mockImplementation(({ branch }) =>
      pages(
        branch === 'main'
          ? [{ hash: 'A' }, { hash: 'B' }, { hash: 'C' }]
          : [{ hash: 'B' }, { hash: 'C' }, { hash: 'D' }]
      )
    );
    mocks.forInstallation.mockResolvedValue(github);

    const result = await githubSyncService.syncProjectGithubData(project.id);

    expect(stored).toEqual(new Set(['A', 'B', 'C', 'D']));
    expect(links).toHaveLength(6);
    expect(result.summary.commits).toMatchObject({
      foundAcrossBranches: 6,
      unique: 4,
      created: 4,
      linksCreated: 6
    });
  });
});
