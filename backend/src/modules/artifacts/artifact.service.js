// Service do RF06: consolida commits, pull requests e issues importados.
import { artifactRepository } from './artifact.repository.js';

class ArtifactServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ArtifactServiceError';
    this.statusCode = statusCode;
  }
}

const artifactTypes = new Set(['commit', 'pull_request', 'issue']);

function parseProjectId(projectId) {
  const parsedProjectId = Number(projectId);

  if (!Number.isInteger(parsedProjectId) || parsedProjectId <= 0) {
    throw new ArtifactServiceError('ID do projeto inválido.', 400);
  }

  return parsedProjectId;
}

function validateType(type) {
  if (type === undefined) {
    return undefined;
  }

  if (typeof type !== 'string' || !artifactTypes.has(type)) {
    throw new ArtifactServiceError('Tipo de artefato inválido.', 400);
  }

  return type;
}

function parseArtifactDate(value, fieldLabel) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new ArtifactServiceError(`${fieldLabel} inválida. Use o formato YYYY-MM-DD.`, 400);
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    throw new ArtifactServiceError(`${fieldLabel} inválida. Use o formato YYYY-MM-DD.`, 400);
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    throw new ArtifactServiceError(`${fieldLabel} inválida. Use o formato YYYY-MM-DD.`, 400);
  }

  return parsedDate;
}

function buildDateFilter(startDate, endDate) {
  const parsedStartDate = parseArtifactDate(startDate, 'Data inicial');
  const parsedEndDate = parseArtifactDate(endDate, 'Data final');

  if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
    throw new ArtifactServiceError('A data inicial não pode ser maior que a data final.', 400);
  }

  if (!parsedStartDate && !parsedEndDate) {
    return undefined;
  }

  const dateFilter = {};

  if (parsedStartDate) {
    dateFilter.gte = parsedStartDate;
  }

  if (parsedEndDate) {
    const exclusiveEndDate = new Date(parsedEndDate);
    exclusiveEndDate.setUTCDate(exclusiveEndDate.getUTCDate() + 1);
    dateFilter.lt = exclusiveEndDate;
  }

  return dateFilter;
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : null;
}

function getFirstLine(value) {
  if (!value) {
    return null;
  }

  return String(value).split(/\r?\n/)[0] || null;
}

function normalizeAuthor(value) {
  return value || 'Autor não identificado';
}

function normalizeLabels(labels) {
  if (!Array.isArray(labels)) {
    return [];
  }

  return labels
    .map((label) => {
      if (typeof label === 'string') {
        return label;
      }

      return label?.name;
    })
    .filter(Boolean);
}

function mapCommit(commit, project) {
  const date = toIsoString(commit.date);

  return {
    id: commit.id,
    type: 'commit',
    externalId: commit.hash,
    title: getFirstLine(commit.message),
    author: normalizeAuthor(commit.authorName || commit.authorUsername),
    date,
    projectId: project.id,
    projectName: project.name,
    githubUrl: commit.githubUrl || null,
    metadata: {
      branch: commit.branch || null,
      state: null,
      number: null
    }
  };
}

function mapPullRequest(pullRequest, project) {
  const date = toIsoString(pullRequest.createdAtGithub);

  return {
    id: pullRequest.id,
    type: 'pull_request',
    externalId: pullRequest.githubId || String(pullRequest.number),
    title: pullRequest.title,
    author: normalizeAuthor(pullRequest.authorUsername),
    date,
    projectId: project.id,
    projectName: project.name,
    githubUrl: pullRequest.githubUrl || null,
    metadata: {
      branch: null,
      state: pullRequest.state || null,
      number: pullRequest.number,
      sourceBranch: pullRequest.sourceBranch || null,
      targetBranch: pullRequest.targetBranch || null,
      mergedAtGithub: toIsoString(pullRequest.mergedAtGithub),
      closedAtGithub: toIsoString(pullRequest.closedAtGithub)
    }
  };
}

function mapIssue(issue, project) {
  const date = toIsoString(issue.createdAtGithub);

  return {
    id: issue.id,
    type: 'issue',
    externalId: issue.githubId || String(issue.number),
    title: issue.title,
    author: normalizeAuthor(issue.authorUsername),
    date,
    projectId: project.id,
    projectName: project.name,
    githubUrl: issue.githubUrl || null,
    metadata: {
      branch: null,
      state: issue.state || null,
      number: issue.number,
      closedAtGithub: toIsoString(issue.closedAtGithub),
      labels: normalizeLabels(issue.labels)
    }
  };
}

function isCompleteArtifact(artifact) {
  return Boolean(
    artifact.type &&
      artifact.author &&
      artifact.date &&
      artifact.projectId &&
      artifact.projectName
  );
}

function buildSummary(artifacts) {
  const total = artifacts.length;
  const completeArtifacts = artifacts.filter(isCompleteArtifact).length;

  return {
    total,
    commits: artifacts.filter((artifact) => artifact.type === 'commit').length,
    pullRequests: artifacts.filter((artifact) => artifact.type === 'pull_request').length,
    issues: artifacts.filter((artifact) => artifact.type === 'issue').length,
    completeArtifacts,
    metadataCompletenessPercentage:
      total === 0 ? 0 : Number(((completeArtifacts / total) * 100).toFixed(2))
  };
}

function sortArtifactsByDateDesc(artifacts) {
  return artifacts.sort((first, second) => {
    const firstTime = first.date ? new Date(first.date).getTime() : 0;
    const secondTime = second.date ? new Date(second.date).getTime() : 0;

    if (firstTime !== secondTime) {
      return secondTime - firstTime;
    }

    if (first.type !== second.type) {
      return first.type.localeCompare(second.type);
    }

    return second.id - first.id;
  });
}

export const artifactService = {
  async listProjectArtifacts(projectId, query = {}) {
    const parsedProjectId = parseProjectId(projectId);
    const type = validateType(query.type);
    const dateFilter = buildDateFilter(query.startDate, query.endDate);
    const project = await artifactRepository.findProjectById(parsedProjectId);

    if (!project) {
      throw new ArtifactServiceError('Projeto não encontrado.', 404);
    }

    const [commits, pullRequests, issues] = await Promise.all([
      !type || type === 'commit'
        ? artifactRepository.listCommits(parsedProjectId, dateFilter)
        : Promise.resolve([]),
      !type || type === 'pull_request'
        ? artifactRepository.listPullRequests(parsedProjectId, dateFilter)
        : Promise.resolve([]),
      !type || type === 'issue'
        ? artifactRepository.listIssues(parsedProjectId, dateFilter)
        : Promise.resolve([])
    ]);

    const artifacts = sortArtifactsByDateDesc([
      ...commits.map((commit) => mapCommit(commit, project)),
      ...pullRequests.map((pullRequest) => mapPullRequest(pullRequest, project)),
      ...issues.map((issue) => mapIssue(issue, project))
    ]);

    return {
      project,
      filters: {
        type: type || null,
        startDate: query.startDate || null,
        endDate: query.endDate || null
      },
      summary: buildSummary(artifacts),
      artifacts
    };
  }
};
