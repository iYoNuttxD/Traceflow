import { DomainError as ProjectServiceError } from '../../shared/errors/index.js';
import { resourceNotFoundError } from '../../shared/errors/index.js';
export { ProjectServiceError };

const allowedStatuses = new Set(['ATIVO', 'INATIVO', 'ARQUIVADO']);
const editableFields = ['name', 'description', 'responsibleTeam', 'status'];

export function normalizeOptionalText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const normalizedValue = String(value).trim();
  return normalizedValue || null;
}

export function normalizeAccessCode(value) {
  const accessCode = normalizeOptionalText(value);
  return typeof accessCode === 'string' ? accessCode.toUpperCase() : accessCode;
}

export function publicProject(project) {
  if (!project) return project;
  const { githubIntegration, ...data } = project;
  delete data.accessCode;
  delete data.accessCodeRole;
  if (githubIntegration) {
    data.githubIntegration = {
      status: githubIntegration.status,
      githubRepositoryId: githubIntegration.githubRepositoryId,
      repositoryName: githubIntegration.repositoryName,
      repositoryFullName: githubIntegration.repositoryFullName,
      repositoryUrl: githubIntegration.repositoryUrl,
      defaultBranch: githubIntegration.defaultBranch,
      repositoryPrivate: githubIntegration.repositoryPrivate,
      integratedAt: githubIntegration.integratedAt,
      autoSyncEnabled: githubIntegration.autoSyncEnabled,
      lastSyncAt: githubIntegration.lastSyncAt,
      lastSyncStatus: githubIntegration.lastSyncStatus,
      lastSyncError: githubIntegration.lastSyncError,
      lastSyncAttemptAt: githubIntegration.lastSyncAttemptAt
    };
  }
  return data;
}

export function buildEditableProjectData(data, isCreate = false) {
  const payload = data && typeof data === 'object' ? data : {};

  if (
    (isCreate || payload.name !== undefined) &&
    (typeof payload.name !== 'string' || !payload.name.trim())
  ) {
    throw new ProjectServiceError('O nome do projeto é obrigatório.', 400);
  }
  if (
    (isCreate || payload.responsibleTeam !== undefined) &&
    (typeof payload.responsibleTeam !== 'string' || !payload.responsibleTeam.trim())
  ) {
    throw new ProjectServiceError('A equipe responsável é obrigatória.', 400);
  }
  if (payload.status !== undefined && !allowedStatuses.has(payload.status)) {
    throw new ProjectServiceError('Status inválido. Use ATIVO, INATIVO ou ARQUIVADO.', 400);
  }

  const projectData = editableFields.reduce((normalizedData, field) => {
    if (payload[field] === undefined) return normalizedData;

    if (field === 'name' || field === 'responsibleTeam') {
      normalizedData[field] = payload[field].trim();
    } else if (field === 'status') {
      normalizedData.status = payload.status;
    } else {
      normalizedData[field] = normalizeOptionalText(payload[field]);
    }
    return normalizedData;
  }, {});

  return projectData;
}

export function buildGithubRepositoryMetadata(repository) {
  if (!repository?.defaultBranch) {
    throw new ProjectServiceError(
      'Não foi possível determinar a branch principal do repositório.',
      400
    );
  }

  return {
    githubRepositoryId: repository.githubRepositoryId,
    repositoryName: repository.name,
    repositoryFullName: repository.fullName,
    repositoryUrl: repository.url,
    defaultBranch: repository.defaultBranch,
    repositoryPrivate: repository.private
  };
}

export function parseProjectId(projectId) {
  const parsedProjectId = Number(projectId);
  if (!Number.isInteger(parsedProjectId) || parsedProjectId <= 0) {
    throw new ProjectServiceError('ID do projeto inválido.', 400);
  }
  return parsedProjectId;
}

export function validateGithubAutoSyncEnabled(value) {
  if (typeof value !== 'boolean') {
    throw new ProjectServiceError('githubAutoSyncEnabled deve ser um valor booleano.', 400);
  }
}

export function validateOptionalGithubAutoSyncEnabled(value) {
  if (value !== undefined) validateGithubAutoSyncEnabled(value);
}

export function ensureGithubLinkedProject(project) {
  if (!project) throw resourceNotFoundError('Project');

  if (!project.githubIntegration?.repositoryFullName) {
    throw new ProjectServiceError('Projeto não possui repositório GitHub vinculado.', 400);
  }
}
