// Service de sincronizacao de artefatos GitHub.
// No MVP, a sincronizacao e acionada manualmente. Futuramente, este servico podera
// ser chamado por um job agendado ou webhook.
// TODO: Evoluir este servico para pull requests e issues sem misturar a persistencia.
import { getGithubClient } from './github.client.js';
import { projectRepository } from '../projects/project.repository.js';
import { commitRepository } from '../commits/commit.repository.js';

class GithubSyncError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'GithubSyncError';
    this.statusCode = statusCode;
  }
}

function parseProjectId(projectId) {
  const parsedProjectId = Number(projectId);

  if (!Number.isInteger(parsedProjectId) || parsedProjectId <= 0) {
    throw new GithubSyncError('ProjectId invalido.', 400);
  }

  return parsedProjectId;
}

function validateGithubLinkedProject(project) {
  if (!project) {
    throw new GithubSyncError('Projeto nao encontrado.', 404);
  }

  const repositoryName = project.githubRepositoryName || project.githubRepo;

  if (!project.githubOwner || !repositoryName || !project.githubDefaultBranch) {
    throw new GithubSyncError('Projeto nao possui repositorio GitHub vinculado.', 400);
  }

  return {
    owner: project.githubOwner,
    repo: repositoryName,
    defaultBranch: project.githubDefaultBranch
  };
}

function mapGithubCommit(item, project, branch) {
  return {
    hash: item.sha,
    message: item.commit?.message,
    authorName: item.commit?.author?.name,
    authorEmail: item.commit?.author?.email,
    authorUsername: item.author?.login,
    date: item.commit?.author?.date ? new Date(item.commit.author.date) : null,
    branch,
    githubUrl: item.html_url,
    projectId: project.id
  };
}

async function syncCommits(project) {
  const { owner, repo, defaultBranch } = validateGithubLinkedProject(project);
  const github = getGithubClient();

  try {
    const response = await github.rest.repos.listCommits({
      owner,
      repo,
      sha: defaultBranch,
      per_page: 100
    });

    const mappedCommits = response.data.map((item) => mapGithubCommit(item, project, defaultBranch));
    const existingHashes = new Set(await commitRepository.findHashesByProjectId(project.id));
    const newCommits = mappedCommits.filter((commit) => !existingHashes.has(commit.hash));

    const result = await commitRepository.createMany(newCommits);

    return {
      found: mappedCommits.length,
      created: result.count,
      skipped: mappedCommits.length - result.count
    };
  } catch (error) {
    if (error.status === 404) {
      throw new GithubSyncError('Repositorio GitHub nao encontrado ou sem permissao de acesso.', 404);
    }

    throw error;
  }
}

export const githubSyncService = {
  async syncGithubArtifacts(projectId) {
    const parsedProjectId = parseProjectId(projectId);
    const project = await projectRepository.findById(parsedProjectId);

    validateGithubLinkedProject(project);

    const commitSummary = await syncCommits(project);

    return {
      commits: commitSummary
    };
  }
};
