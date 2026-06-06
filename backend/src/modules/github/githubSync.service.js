// Service de sincronizacao de artefatos GitHub.
// No MVP, a sincronizacao e acionada manualmente. Futuramente, este servico podera
// ser chamado por um job agendado ou webhook.
// TODO: Manter este servico focado na orquestracao dos artefatos GitHub do MVP.
import { getGithubClient } from './github.client.js';
import { projectRepository } from '../projects/project.repository.js';
import { commitRepository } from '../commits/commit.repository.js';
import { pullRequestRepository } from '../pullRequests/pullRequest.repository.js';
import { issueRepository } from '../issues/issue.repository.js';

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

function mapGithubPullRequest(item, project) {
  return {
    githubId: String(item.id),
    number: item.number,
    title: item.title,
    description: item.body,
    state: item.state,
    authorUsername: item.user?.login,
    sourceBranch: item.head?.ref,
    targetBranch: item.base?.ref,
    githubUrl: item.html_url,
    createdAtGithub: item.created_at ? new Date(item.created_at) : null,
    updatedAtGithub: item.updated_at ? new Date(item.updated_at) : null,
    closedAtGithub: item.closed_at ? new Date(item.closed_at) : null,
    mergedAtGithub: item.merged_at ? new Date(item.merged_at) : null,
    projectId: project.id
  };
}

function mapGithubIssueLabel(label) {
  return {
    id: label.id,
    name: label.name,
    color: label.color,
    description: label.description
  };
}

function mapGithubIssue(item, project) {
  return {
    githubId: String(item.id),
    number: item.number,
    title: item.title,
    description: item.body,
    state: item.state,
    authorUsername: item.user?.login,
    assigneeUsername: item.assignee?.login,
    labels: item.labels?.map(mapGithubIssueLabel) || [],
    milestone: item.milestone?.title,
    githubUrl: item.html_url,
    createdAtGithub: item.created_at ? new Date(item.created_at) : null,
    updatedAtGithub: item.updated_at ? new Date(item.updated_at) : null,
    closedAtGithub: item.closed_at ? new Date(item.closed_at) : null,
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

async function syncPullRequests(project) {
  const { owner, repo } = validateGithubLinkedProject(project);
  const github = getGithubClient();

  try {
    const response = await github.rest.pulls.list({
      owner,
      repo,
      state: 'all',
      per_page: 100
    });

    const mappedPullRequests = response.data.map((item) => mapGithubPullRequest(item, project));
    const result = await pullRequestRepository.upsertMany(mappedPullRequests);

    return {
      found: mappedPullRequests.length,
      created: result.created,
      updated: result.updated
    };
  } catch (error) {
    if (error.status === 404) {
      throw new GithubSyncError('Repositorio GitHub nao encontrado ou sem permissao de acesso.', 404);
    }

    throw error;
  }
}

async function syncIssues(project) {
  const { owner, repo } = validateGithubLinkedProject(project);
  const github = getGithubClient();

  try {
    const response = await github.rest.issues.listForRepo({
      owner,
      repo,
      state: 'all',
      per_page: 100
    });

    const issuesOnly = response.data.filter((item) => !item.pull_request);
    const mappedIssues = issuesOnly.map((item) => mapGithubIssue(item, project));
    const result = await issueRepository.upsertMany(mappedIssues);

    return {
      found: mappedIssues.length,
      created: result.created,
      updated: result.updated
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
    const pullRequestSummary = await syncPullRequests(project);
    const issueSummary = await syncIssues(project);

    return {
      commits: commitSummary,
      pullRequests: pullRequestSummary,
      issues: issueSummary
    };
  }
};
