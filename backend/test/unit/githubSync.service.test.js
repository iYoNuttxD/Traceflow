import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getGithubClient: vi.fn(),
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
    createMany: vi.fn()
  },
  commitSuggestionService: { detectForCommits: vi.fn() },
  pullRequestRepository: { upsertMany: vi.fn() },
  issueRepository: { upsertMany: vi.fn() }
}));

vi.mock('../../src/modules/github/github.client.js', () => ({
  getGithubClient: mocks.getGithubClient
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
  githubOwner: 'usuario-artificial',
  githubRepositoryId: '200',
  githubRepositoryName: 'repositorio-artificial',
  githubDefaultBranch: 'main',
  githubLastSyncAt: new Date('2026-01-01T00:00:00.000Z')
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

function buildGithubDouble({ commits = [[]], pullRequests = [[]], issues = [[]] } = {}) {
  return {
    getRepository: vi.fn().mockResolvedValue(repository),
    listCommitPages: vi.fn(() => pages(...commits)),
    listPullRequestPages: vi.fn(() => pages(...pullRequests)),
    listIssuePages: vi.fn(() => pages(...issues))
  };
}

describe('githubSyncService com client e persistência substituídos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectRepository.findById.mockResolvedValue(project);
    mocks.projectRepository.updateGithubRepositoryMetadata.mockResolvedValue(project);
    mocks.projectRepository.markGithubSyncStarted.mockResolvedValue(project);
    mocks.projectRepository.markGithubSyncSucceeded.mockResolvedValue({
      ...project,
      githubSyncStatus: 'SINCRONIZADO'
    });
    mocks.projectRepository.markGithubSyncFailed.mockResolvedValue(project);
    mocks.commitRepository.findHashesByProjectId.mockResolvedValue(['hash-existente']);
    mocks.commitRepository.createMany.mockImplementation(async (items) => ({
      count: items.length
    }));
    mocks.commitRepository.findByProjectIdAndHashes.mockImplementation(async (projectId, hashes) =>
      hashes.map((hash, index) => ({
        id: index + 1,
        projectId,
        message: `[TASK-${index + 1}]`,
        hash
      }))
    );
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

  it('pagina as três coleções, usa a branch validada e preserva o summary', async () => {
    const github = buildGithubDouble({
      commits: [[{ hash: 'hash-existente' }], [{ hash: 'hash-novo' }]],
      pullRequests: [[{ githubId: '301', number: 3 }], []],
      issues: [[{ githubId: '401', number: 4 }], []]
    });
    mocks.getGithubClient.mockReturnValue(github);

    const result = await githubSyncService.syncProjectGithubData(String(project.id));

    expect(github.getRepository).toHaveBeenCalledWith(
      project.githubOwner,
      project.githubRepositoryName
    );
    expect(github.listCommitPages).toHaveBeenCalledWith(
      expect.objectContaining({ branch: 'main' })
    );
    expect(github.listPullRequestPages).toHaveBeenCalledWith(
      expect.objectContaining({ branch: 'main' })
    );
    expect(mocks.commitRepository.createMany).toHaveBeenNthCalledWith(1, []);
    expect(mocks.commitRepository.createMany).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({ hash: 'hash-novo', projectId: project.id })
    ]);
    expect(mocks.commitSuggestionService.detectForCommits).toHaveBeenCalledWith(project.id, [
      expect.objectContaining({ projectId: project.id, message: '[TASK-1]' })
    ]);
    expect(result.summary).toEqual({
      commits: { found: 2, created: 1, skipped: 1 },
      pullRequests: { found: 1, created: 1, updated: 0 },
      issues: { found: 1, created: 0, updated: 1 }
    });
    expect(mocks.projectRepository.markGithubSyncSucceeded).toHaveBeenCalledOnce();
  });

  it('resolve branch ausente pela consulta do repositório e atualiza metadados canônicos', async () => {
    mocks.projectRepository.findById.mockResolvedValue({ ...project, githubDefaultBranch: null });
    const github = buildGithubDouble();
    mocks.getGithubClient.mockReturnValue(github);
    await githubSyncService.syncProjectGithubData(project.id);
    expect(mocks.projectRepository.updateGithubRepositoryMetadata).toHaveBeenCalledWith(
      project.id,
      expect.objectContaining({ githubDefaultBranch: 'main', githubRepositoryId: '200' })
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
    mocks.getGithubClient.mockReturnValue(github);

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
    mocks.getGithubClient.mockReturnValue(github);

    const first = githubSyncService.syncProjectGithubData(project.id);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await expect(githubSyncService.syncProjectGithubData(project.id)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Sincronização do GitHub já está em andamento para este projeto.'
    });
    release();
    await expect(first).resolves.toMatchObject({ summary: { commits: { found: 0 } } });
  });
});
