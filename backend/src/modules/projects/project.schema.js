import { DomainError as ProjectServiceError } from '../../shared/errors/index.js';
export { ProjectServiceError };

const requiredGithubFields = [
  'githubRepositoryId',
  'githubOwner',
  'githubRepositoryName',
  'githubRepositoryFullName',
  'githubRepositoryUrl',
  'githubDefaultBranch'
];
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

export function buildMemberData(data, defaultRole = 'MEMBRO') {
  const payload = data && typeof data === 'object' ? data : {};

  if (typeof payload.name !== 'string' || !payload.name.trim()) {
    throw new ProjectServiceError('O nome do membro é obrigatório.', 400);
  }

  const email = normalizeOptionalText(payload.email);
  return {
    name: payload.name.trim(),
    email: typeof email === 'string' ? email.toLowerCase() : email,
    role: normalizeOptionalText(payload.role) || defaultRole
  };
}

function normalizeGithubRepository(data, required = false) {
  const repositoryFields = ['githubOwner', 'githubRepo', 'githubUrl'];
  const hasRepositoryField = repositoryFields.some((field) => data[field] !== undefined);

  if (!required && !hasRepositoryField) return null;

  const githubOwner = normalizeOptionalText(data.githubOwner);
  const githubRepo = normalizeOptionalText(data.githubRepo);
  const githubUrl = normalizeOptionalText(data.githubUrl);

  if (!githubOwner || !githubRepo || !githubUrl) {
    throw new ProjectServiceError('Selecione um repositório GitHub válido para o projeto.', 400);
  }

  try {
    const parsedUrl = new URL(githubUrl);
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
    const urlOwner = pathParts[0];
    const urlRepo = pathParts[1]?.replace(/\.git$/i, '');
    const normalizedRepo = githubRepo.replace(/\.git$/i, '');

    if (
      !['github.com', 'www.github.com'].includes(hostname) ||
      pathParts.length !== 2 ||
      urlOwner.toLowerCase() !== githubOwner.toLowerCase() ||
      urlRepo.toLowerCase() !== normalizedRepo.toLowerCase()
    ) {
      throw new ProjectServiceError('Selecione um repositório GitHub válido para o projeto.', 400);
    }

    return {
      githubOwner,
      githubRepo: normalizedRepo,
      githubUrl: `https://github.com/${githubOwner}/${normalizedRepo}`
    };
  } catch {
    throw new ProjectServiceError('Selecione um repositório GitHub válido para o projeto.', 400);
  }
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

  const githubRepository = normalizeGithubRepository(payload, isCreate);
  if (githubRepository) Object.assign(projectData, githubRepository);
  return projectData;
}

export function validateGithubRepositoryData(data) {
  const missingField = requiredGithubFields.find((field) => !data[field]);
  if (missingField) {
    throw new ProjectServiceError('Dados do repositório GitHub incompletos.', 400);
  }
}

export function buildGithubProjectData(data, repository) {
  const projectName = data.name || data.nome || data.githubRepositoryName;

  return {
    name: projectName,
    description: data.description ?? repository.description,
    responsibleTeam: normalizeOptionalText(data.responsibleTeam) || 'Não informada',
    status: 'ATIVO',
    githubOwner: repository.owner,
    githubRepo: repository.name,
    githubUrl: repository.url,
    githubRepositoryId: repository.githubRepositoryId,
    githubRepositoryName: repository.name,
    githubRepositoryFullName: repository.fullName,
    githubRepositoryUrl: repository.url,
    githubDefaultBranch: repository.defaultBranch,
    githubIsPrivate: repository.private,
    githubIntegratedAt: new Date(),
    githubAutoSyncEnabled: data.githubAutoSyncEnabled === true,
    githubLastSyncAt: null,
    githubSyncStatus: 'NUNCA_SINCRONIZADO',
    githubLastSyncError: null,
    githubLastSyncAttemptAt: null
  };
}

export function buildGithubRepositoryMetadata(repository) {
  if (!repository?.defaultBranch) {
    throw new ProjectServiceError(
      'Não foi possível determinar a branch principal do repositório.',
      400
    );
  }

  return {
    githubOwner: repository.owner,
    githubRepo: repository.name,
    githubUrl: repository.url,
    githubRepositoryId: repository.githubRepositoryId,
    githubRepositoryName: repository.name,
    githubRepositoryFullName: repository.fullName,
    githubRepositoryUrl: repository.url,
    githubDefaultBranch: repository.defaultBranch,
    githubIsPrivate: repository.private
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
  if (!project) throw new ProjectServiceError('Projeto não encontrado.', 404);

  const repositoryName = project.githubRepositoryName || project.githubRepo;
  if (!project.githubOwner || !repositoryName) {
    throw new ProjectServiceError('Projeto não possui repositório GitHub vinculado.', 400);
  }
}
