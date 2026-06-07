// Service de projetos: concentra as regras de negocio dos fluxos de projeto.
import { getGithubRepository } from '../github/github.client.js';
import { env } from '../../config/env.js';
import { projectRepository } from './project.repository.js';

class ProjectServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ProjectServiceError';
    this.statusCode = statusCode;
  }
}

const requiredGithubFields = [
  'githubRepositoryId',
  'githubOwner',
  'githubRepositoryName',
  'githubRepositoryFullName',
  'githubRepositoryUrl',
  'githubDefaultBranch'
];

const allowedStatuses = new Set(['ATIVO', 'INATIVO', 'ARQUIVADO']);
const editableFields = [
  'name',
  'description',
  'responsibleTeam',
  'status'
];

function generateAccessCode() {
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TRC-${randomPart}`;
}

function buildInviteLink(accessCode) {
  const frontendUrl = env.frontendUrl.replace(/\/+$/, '');
  return `${frontendUrl}/join/${accessCode}`;
}

async function buildProjectInviteData() {
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const accessCode = generateAccessCode();
    const existingProject = await projectRepository.findProjectByAccessCode(accessCode);

    if (!existingProject) {
      return {
        accessCode,
        inviteLink: buildInviteLink(accessCode)
      };
    }
  }

  throw new ProjectServiceError('Não foi possível gerar um código de acesso único.', 500);
}

function validateProjectName(name, required = false) {
  if (required && (typeof name !== 'string' || !name.trim())) {
    throw new ProjectServiceError('O nome do projeto é obrigatório.', 400);
  }

  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    throw new ProjectServiceError('O nome do projeto é obrigatório.', 400);
  }
}

function validateProjectStatus(status) {
  if (status !== undefined && !allowedStatuses.has(status)) {
    throw new ProjectServiceError('Status inválido. Use ATIVO, INATIVO ou ARQUIVADO.', 400);
  }
}

function validateResponsibleTeam(responsibleTeam, required = false) {
  if (
    required &&
    (typeof responsibleTeam !== 'string' || !responsibleTeam.trim())
  ) {
    throw new ProjectServiceError('A equipe responsável é obrigatória.', 400);
  }

  if (
    responsibleTeam !== undefined &&
    (typeof responsibleTeam !== 'string' || !responsibleTeam.trim())
  ) {
    throw new ProjectServiceError('A equipe responsável é obrigatória.', 400);
  }
}

function normalizeGithubRepository(data, required = false) {
  const repositoryFields = ['githubOwner', 'githubRepo', 'githubUrl'];
  const hasRepositoryField = repositoryFields.some((field) => data[field] !== undefined);

  if (!required && !hasRepositoryField) {
    return null;
  }

  const githubOwner = normalizeOptionalText(data.githubOwner);
  const githubRepo = normalizeOptionalText(data.githubRepo);
  const githubUrl = normalizeOptionalText(data.githubUrl);

  if (!githubOwner || !githubRepo || !githubUrl) {
    throw new ProjectServiceError(
      'Selecione um repositório GitHub válido para o projeto.',
      400
    );
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
      throw new Error('Invalid GitHub repository URL');
    }

    return {
      githubOwner,
      githubRepo: normalizedRepo,
      githubUrl: `https://github.com/${githubOwner}/${normalizedRepo}`
    };
  } catch {
    throw new ProjectServiceError(
      'Selecione um repositório GitHub válido para o projeto.',
      400
    );
  }
}

function normalizeOptionalText(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalizedValue = String(value).trim();
  return normalizedValue || null;
}

function normalizeOptionalEmail(value) {
  const email = normalizeOptionalText(value);

  return typeof email === 'string' ? email.toLowerCase() : email;
}

function normalizeAccessCode(value) {
  const accessCode = normalizeOptionalText(value);

  return typeof accessCode === 'string' ? accessCode.toUpperCase() : accessCode;
}

function validateMemberName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new ProjectServiceError('O nome do membro é obrigatório.', 400);
  }
}

function buildMemberData(data, defaultRole = 'MEMBRO') {
  const payload = data && typeof data === 'object' ? data : {};

  validateMemberName(payload.name);

  return {
    name: payload.name.trim(),
    email: normalizeOptionalEmail(payload.email),
    role: normalizeOptionalText(payload.role) || defaultRole
  };
}

function buildEditableProjectData(data, isCreate = false) {
  const payload = data && typeof data === 'object' ? data : {};

  validateProjectName(payload.name, isCreate);
  validateResponsibleTeam(payload.responsibleTeam, isCreate);
  validateProjectStatus(payload.status);

  const projectData = editableFields.reduce((normalizedData, field) => {
    if (payload[field] === undefined) {
      return normalizedData;
    }

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

  if (githubRepository) {
    Object.assign(projectData, githubRepository);
  }

  return projectData;
}

function validateGithubRepositoryData(data) {
  const missingField = requiredGithubFields.find((field) => !data[field]);

  if (missingField) {
    throw new ProjectServiceError('Dados do repositorio GitHub incompletos.', 400);
  }
}

async function ensureRepositoryIsNotLinked(data) {
  const projectById = await projectRepository.findByGithubRepositoryId(data.githubRepositoryId);

  if (projectById) {
    throw new ProjectServiceError('Ja existe um projeto vinculado a este repositorio GitHub.', 409);
  }

  const projectByFullName = await projectRepository.findByGithubRepositoryFullName(
    data.githubRepositoryFullName
  );

  if (projectByFullName) {
    throw new ProjectServiceError('Ja existe um projeto vinculado a este repositorio GitHub.', 409);
  }
}

async function verifyGithubRepositoryAccess(data) {
  try {
    const repository = await getGithubRepository(data.githubOwner, data.githubRepositoryName);
    const repositoryId = String(repository.id);

    if (
      repositoryId !== String(data.githubRepositoryId) ||
      repository.full_name !== data.githubRepositoryFullName
    ) {
      throw new ProjectServiceError(
        'Dados do repositorio GitHub nao correspondem ao repositorio acessivel.',
        400
      );
    }

    return repository;
  } catch (error) {
    if (error instanceof ProjectServiceError) {
      throw error;
    }

    if (error.status === 404) {
      throw new ProjectServiceError('Repositorio GitHub nao encontrado ou sem permissao de acesso.', 404);
    }

    throw error;
  }
}

function buildProjectData(data, repository) {
  const projectName = data.name || data.nome || data.githubRepositoryName;
  const description = data.description ?? repository.description;
  const githubAutoSyncEnabled = data.githubAutoSyncEnabled === true;

  return {
    name: projectName,
    description,
    responsibleTeam: normalizeOptionalText(data.responsibleTeam) || 'Não informada',
    status: 'ATIVO',
    githubOwner: repository.owner.login,
    githubRepo: repository.name,
    githubUrl: repository.html_url,
    githubRepositoryId: String(repository.id),
    githubRepositoryName: repository.name,
    githubRepositoryFullName: repository.full_name,
    githubRepositoryUrl: repository.html_url,
    githubDefaultBranch: repository.default_branch,
    githubIsPrivate: repository.private,
    githubIntegratedAt: new Date(),
    githubAutoSyncEnabled,
    githubLastSyncAt: null
  };
}

function parseProjectId(projectId) {
  const parsedProjectId = Number(projectId);

  if (!Number.isInteger(parsedProjectId) || parsedProjectId <= 0) {
    throw new ProjectServiceError('ID do projeto inválido.', 400);
  }

  return parsedProjectId;
}

function validateGithubAutoSyncEnabled(value) {
  if (typeof value !== 'boolean') {
    throw new ProjectServiceError('githubAutoSyncEnabled deve ser um valor booleano.', 400);
  }
}

function validateOptionalGithubAutoSyncEnabled(value) {
  if (value !== undefined) {
    validateGithubAutoSyncEnabled(value);
  }
}

function ensureGithubLinkedProject(project) {
  if (!project) {
    throw new ProjectServiceError('Projeto nao encontrado.', 404);
  }

  const repositoryName = project.githubRepositoryName || project.githubRepo;

  if (!project.githubOwner || !repositoryName || !project.githubDefaultBranch) {
    throw new ProjectServiceError('Projeto nao possui repositorio GitHub vinculado.', 400);
  }
}

export const projectService = {
  async createProject(data) {
    const projectData = {
      ...buildEditableProjectData(data, true),
      ...(await buildProjectInviteData())
    };

    return projectRepository.createProject(projectData);
  },

  async findAllProjects() {
    return projectRepository.findAllProjects();
  },

  async getProjectById(projectId) {
    const parsedProjectId = parseProjectId(projectId);
    const project = await projectRepository.findById(parsedProjectId);

    if (!project) {
      throw new ProjectServiceError('Projeto não encontrado.', 404);
    }

    return project;
  },

  async listProjectMembers(projectId) {
    const parsedProjectId = parseProjectId(projectId);
    const project = await projectRepository.findById(parsedProjectId);

    if (!project) {
      throw new ProjectServiceError('Projeto não encontrado.', 404);
    }

    return projectRepository.findActiveMembersByProject(parsedProjectId);
  },

  async addProjectMember(projectId, data, defaultRole = 'MEMBRO') {
    const parsedProjectId = parseProjectId(projectId);
    const project = await projectRepository.findById(parsedProjectId);

    if (!project) {
      throw new ProjectServiceError('Projeto não encontrado.', 404);
    }

    const memberData = buildMemberData(data, defaultRole);

    if (memberData.email) {
      const existingMember = await projectRepository.findMemberByProjectEmail(
        parsedProjectId,
        memberData.email
      );

      if (existingMember) {
        throw new ProjectServiceError('Este membro já está vinculado ao projeto.', 409);
      }
    }

    return projectRepository.createProjectMember(parsedProjectId, memberData);
  },

  async joinProject(data) {
    const payload = data && typeof data === 'object' ? data : {};
    const accessCode = normalizeAccessCode(payload.accessCode);

    if (!accessCode) {
      throw new ProjectServiceError('Informe o código de acesso do projeto.', 400);
    }

    const project = await projectRepository.findProjectByAccessCode(accessCode);

    if (!project) {
      throw new ProjectServiceError('Projeto não encontrado.', 404);
    }

    const member = await projectService.addProjectMember(project.id, payload);

    return {
      project: {
        id: project.id,
        name: project.name
      },
      member
    };
  },

  async updateProject(projectId, data) {
    const parsedProjectId = parseProjectId(projectId);
    const project = await projectRepository.findById(parsedProjectId);

    if (!project) {
      throw new ProjectServiceError('Projeto não encontrado.', 404);
    }

    const projectData = buildEditableProjectData(data);

    if (Object.keys(projectData).length === 0) {
      return project;
    }

    return projectRepository.updateProject(parsedProjectId, projectData);
  },

  async createProjectFromGithubRepository(data) {
    validateGithubRepositoryData(data);
    validateOptionalGithubAutoSyncEnabled(data.githubAutoSyncEnabled);
    const repository = await verifyGithubRepositoryAccess(data);
    const projectData = buildProjectData(data, repository);
    const inviteData = await buildProjectInviteData();

    await ensureRepositoryIsNotLinked(projectData);

    return projectRepository.createFromGithub({
      ...projectData,
      ...inviteData
    });
  },

  async updateGithubSyncSettings(projectId, data) {
    const parsedProjectId = parseProjectId(projectId);
    validateGithubAutoSyncEnabled(data.githubAutoSyncEnabled);

    const project = await projectRepository.findById(parsedProjectId);
    ensureGithubLinkedProject(project);

    return projectRepository.updateGithubSyncSettings(
      parsedProjectId,
      data.githubAutoSyncEnabled
    );
  }
};
