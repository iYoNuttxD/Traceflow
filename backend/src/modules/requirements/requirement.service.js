// Service do modulo de requisitos. Contem as regras de negocio e validacoes do RF15.
import { requirementRepository } from './requirement.repository.js';

class RequirementServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'RequirementServiceError';
    this.statusCode = statusCode;
  }
}

const allowedTypes = new Set(['FUNCIONAL', 'NAO_FUNCIONAL', 'REGRA_NEGOCIO']);
const allowedStatuses = new Set(['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO']);
const editableFields = ['title', 'description', 'type', 'status'];

function parsePositiveInteger(value, entityName) {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new RequirementServiceError(`ID ${entityName} inválido.`, 400);
  }

  return parsedValue;
}

function parseProjectId(projectId) {
  if (projectId === undefined || projectId === null || projectId === '') {
    throw new RequirementServiceError('O projeto do requisito é obrigatório.', 400);
  }

  return parsePositiveInteger(projectId, 'do projeto');
}

function parseRequirementId(requirementId) {
  return parsePositiveInteger(requirementId, 'do requisito');
}

function normalizeOptionalText(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return String(value);
  }

  return value.trim() || null;
}

function normalizeEnumValue(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return String(value).trim().toUpperCase();
}

function validateTitle(title, required = false) {
  if (
    (required && (typeof title !== 'string' || !title.trim())) ||
    (title !== undefined && (typeof title !== 'string' || !title.trim()))
  ) {
    throw new RequirementServiceError('O título do requisito é obrigatório.', 400);
  }
}

function validateType(type) {
  if (type !== undefined && !allowedTypes.has(type)) {
    throw new RequirementServiceError(
      'Tipo inválido. Use FUNCIONAL, NAO_FUNCIONAL ou REGRA_NEGOCIO.',
      400
    );
  }
}

function validateStatus(status) {
  if (status !== undefined && !allowedStatuses.has(status)) {
    throw new RequirementServiceError(
      'Status inválido. Use PENDENTE, EM_ANDAMENTO, CONCLUIDO ou CANCELADO.',
      400
    );
  }
}

function buildRequirementData(data, isCreate = false) {
  const payload = data && typeof data === 'object' ? data : {};

  validateTitle(payload.title, isCreate);

  const normalizedType = normalizeEnumValue(payload.type);
  const normalizedStatus = normalizeEnumValue(payload.status);

  validateType(normalizedType);
  validateStatus(normalizedStatus);

  const requirementData = {};

  for (const field of editableFields) {
    if (payload[field] === undefined) {
      continue;
    }

    if (field === 'title') {
      requirementData.title = payload.title.trim();
    } else if (field === 'description') {
      requirementData.description = normalizeOptionalText(payload.description);
    } else if (field === 'type' && normalizedType) {
      requirementData.type = normalizedType;
    } else if (field === 'status' && normalizedStatus) {
      requirementData.status = normalizedStatus;
    }
  }

  if (isCreate) {
    requirementData.type = normalizedType || 'FUNCIONAL';
    requirementData.status = normalizedStatus || 'PENDENTE';
  }

  return requirementData;
}

async function ensureProjectExists(projectId) {
  const project = await requirementRepository.findProjectById(projectId);

  if (!project) {
    throw new RequirementServiceError('Projeto não encontrado.', 404);
  }

  return project;
}

async function ensureRequirementExists(requirementId) {
  const requirement = await requirementRepository.findRequirementById(requirementId);

  if (!requirement) {
    throw new RequirementServiceError('Requisito não encontrado.', 404);
  }

  return requirement;
}

export const requirementService = {
  async createRequirement(projectId, data) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);

    const requirementData = buildRequirementData(data, true);

    return requirementRepository.createRequirement(parsedProjectId, requirementData);
  },

  async findRequirementsByProject(projectId) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);

    return requirementRepository.findRequirementsByProject(parsedProjectId);
  },

  async getRequirementById(requirementId) {
    const parsedRequirementId = parseRequirementId(requirementId);

    return ensureRequirementExists(parsedRequirementId);
  },

  async updateRequirement(requirementId, data) {
    const parsedRequirementId = parseRequirementId(requirementId);
    const currentRequirement = await ensureRequirementExists(parsedRequirementId);
    const requirementData = buildRequirementData(data);

    if (Object.keys(requirementData).length === 0) {
      return currentRequirement;
    }

    return requirementRepository.updateRequirement(parsedRequirementId, requirementData);
  },

  async updateRequirementStatus(requirementId, status) {
    const parsedRequirementId = parseRequirementId(requirementId);
    await ensureRequirementExists(parsedRequirementId);

    const normalizedStatus = normalizeEnumValue(status);
    validateStatus(normalizedStatus);

    if (!normalizedStatus) {
      throw new RequirementServiceError(
        'Status inválido. Use PENDENTE, EM_ANDAMENTO, CONCLUIDO ou CANCELADO.',
        400
      );
    }

    return requirementRepository.updateRequirementStatus(parsedRequirementId, normalizedStatus);
  },

  async findTasksByRequirement(requirementId) {
    const parsedRequirementId = parseRequirementId(requirementId);
    await ensureRequirementExists(parsedRequirementId);

    return requirementRepository.findTasksByRequirement(parsedRequirementId);
  }
};
