import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getGithubClient: vi.fn(),
  projectRepository: {
    findById: vi.fn(),
    markGithubSyncStarted: vi.fn(),
    markGithubSyncSucceeded: vi.fn(),
    markGithubSyncFailed: vi.fn()
  },
  commitRepository: {
    findHashesByProjectId: vi.fn(),
    createMany: vi.fn()
  },
  pullRequestRepository: {
    upsertMany: vi.fn()
  },
  issueRepository: {
    upsertMany: vi.fn()
  }
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
vi.mock('../../src/modules/pullRequests/pullRequest.repository.js', () => ({
  pullRequestRepository: mocks.pullRequestRepository
}));
vi.mock('../../src/modules/issues/issue.repository.js', () => ({
  issueRepository: mocks.issueRepository
}));

import { githubSyncService } from '../../src/modules/github/githubSync.service.js';

const project = {
  id: 7,
  githubOwner: 'usuario-artificial',
  githubRepositoryName: 'repositorio-artificial',
  githubDefaultBranch: 'main'
};

function buildGithubDouble() {
  return {
    rest: {
      repos: {
        listCommits: vi.fn().mockResolvedValue({
          data: [
            {
              sha: 'hash-existente',
              commit: {
                message: 'Commit existente',
                author: {
                  name: 'Autor artificial',
                  email: 'autor@example.invalid',
                  date: '2026-01-01T00:00:00.000Z'
                }
              },
              author: { login: 'autor-artificial' },
              html_url: 'https://github.com/artificial/commit/existente'
            },
            {
              sha: 'hash-novo',
              commit: {
                message: 'Commit novo',
                author: {
                  name: 'Autor artificial',
                  email: 'autor@example.invalid',
                  date: '2026-01-02T00:00:00.000Z'
                }
              },
              author: { login: 'autor-artificial' },
              html_url: 'https://github.com/artificial/commit/novo'
            }
          ]
        })
      },
      pulls: {
        list: vi.fn().mockResolvedValue({
          data: [
            {
              id: 301,
              number: 3,
              title: 'PR artificial',
              body: 'Descrição artificial',
              state: 'open',
              user: { login: 'autor-artificial' },
              head: { ref: 'feature/artificial' },
              base: { ref: 'main' },
              html_url: 'https://github.com/artificial/pull/3',
              created_at: '2026-01-03T00:00:00.000Z',
              updated_at: '2026-01-04T00:00:00.000Z',
              closed_at: null,
              merged_at: null
            }
          ]
        })
      },
      issues: {
        listForRepo: vi.fn().mockResolvedValue({
          data: [
            {
              id: 401,
              number: 4,
              title: 'Issue artificial',
              body: 'Descrição artificial',
              state: 'open',
              user: { login: 'autor-artificial' },
              assignee: null,
              labels: [{ id: 1, name: 'teste', color: '000000', description: null }],
              milestone: null,
              html_url: 'https://github.com/artificial/issues/4',
              created_at: '2026-01-05T00:00:00.000Z',
              updated_at: '2026-01-06T00:00:00.000Z',
              closed_at: null
            },
            {
              id: 402,
              number: 5,
              title: 'Item que representa PR',
              pull_request: { url: 'https://api.github.com/artificial/pulls/5' }
            }
          ]
        })
      }
    }
  };
}

describe('githubSyncService com Octokit e persistência substituídos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectRepository.findById.mockResolvedValue(project);
    mocks.projectRepository.markGithubSyncStarted.mockResolvedValue(project);
    mocks.projectRepository.markGithubSyncSucceeded.mockResolvedValue({
      ...project,
      githubSyncStatus: 'SINCRONIZADO'
    });
    mocks.projectRepository.markGithubSyncFailed.mockResolvedValue(project);
    mocks.commitRepository.findHashesByProjectId.mockResolvedValue(['hash-existente']);
    mocks.commitRepository.createMany.mockResolvedValue({ count: 1 });
    mocks.pullRequestRepository.upsertMany.mockResolvedValue({ created: 1, updated: 0 });
    mocks.issueRepository.upsertMany.mockResolvedValue({ created: 0, updated: 1 });
  });

  it('sincroniza os três tipos, evita commit duplicado e usa upsert para PR/issues', async () => {
    const github = buildGithubDouble();
    mocks.getGithubClient.mockReturnValue(github);

    const result = await githubSyncService.syncProjectGithubData(String(project.id));

    expect(github.rest.repos.listCommits).toHaveBeenCalledWith({
      owner: project.githubOwner,
      repo: project.githubRepositoryName,
      per_page: 100,
      sha: 'main'
    });
    expect(github.rest.pulls.list).toHaveBeenCalledWith({
      owner: project.githubOwner,
      repo: project.githubRepositoryName,
      state: 'all',
      per_page: 100
    });
    expect(github.rest.issues.listForRepo).toHaveBeenCalledWith({
      owner: project.githubOwner,
      repo: project.githubRepositoryName,
      state: 'all',
      per_page: 100
    });

    expect(mocks.commitRepository.createMany).toHaveBeenCalledWith([
      expect.objectContaining({ hash: 'hash-novo', projectId: project.id, branch: 'main' })
    ]);
    expect(mocks.pullRequestRepository.upsertMany).toHaveBeenCalledWith([
      expect.objectContaining({ githubId: '301', number: 3, projectId: project.id })
    ]);
    expect(mocks.issueRepository.upsertMany).toHaveBeenCalledWith([
      expect.objectContaining({ githubId: '401', number: 4, projectId: project.id })
    ]);
    expect(result).toMatchObject({
      summary: {
        commits: { found: 2, created: 1, skipped: 1 },
        pullRequests: { found: 1, created: 1, updated: 0 },
        issues: { found: 1, created: 0, updated: 1 }
      },
      project: { githubSyncStatus: 'SINCRONIZADO' }
    });
    expect(mocks.projectRepository.markGithubSyncSucceeded).toHaveBeenCalledOnce();
    expect(mocks.projectRepository.markGithubSyncFailed).not.toHaveBeenCalled();
  });

  it('registra falha sanitizada e preserva o erro HTTP atual', async () => {
    const github = buildGithubDouble();
    github.rest.repos.listCommits.mockRejectedValue({ status: 404 });
    mocks.getGithubClient.mockReturnValue(github);

    await expect(githubSyncService.syncProjectGithubData(project.id)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Repositório GitHub não encontrado ou sem permissão de acesso.'
    });
    expect(mocks.projectRepository.markGithubSyncFailed).toHaveBeenCalledWith(
      project.id,
      expect.any(Date),
      'Repositório GitHub não encontrado ou sem permissão de acesso.'
    );
    expect(mocks.pullRequestRepository.upsertMany).not.toHaveBeenCalled();
  });

  it('impede sincronizações concorrentes do mesmo projeto na mesma instância', async () => {
    const github = buildGithubDouble();
    let releaseRequest;
    github.rest.repos.listCommits.mockImplementation(() => new Promise((resolve) => {
      releaseRequest = () => resolve({ data: [] });
    }));
    mocks.getGithubClient.mockReturnValue(github);
    mocks.commitRepository.createMany.mockResolvedValue({ count: 0 });

    const firstSync = githubSyncService.syncProjectGithubData(project.id);
    await vi.waitFor(() => expect(releaseRequest).toBeTypeOf('function'));
    await expect(githubSyncService.syncProjectGithubData(project.id)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Sincronização do GitHub já está em andamento para este projeto.'
    });

    releaseRequest();
    await expect(firstSync).resolves.toMatchObject({
      summary: { commits: { found: 0, created: 0, skipped: 0 } }
    });
  });
});
