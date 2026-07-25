import { DomainError as RequirementServiceError } from '../../shared/errors/index.js';
export { RequirementServiceError };

const allowedTypes = new Set(['FUNCIONAL', 'NAO_FUNCIONAL', 'REGRA_NEGOCIO']);
const allowedStatuses = new Set([
  'CADASTRADO',
  'APROVADO',
  'EM_IMPLEMENTACAO',
  'VALIDADO',
  'CONCLUIDO',
  'PENDENTE',
  'EM_ANDAMENTO',
  'CANCELADO'
]);
const editableFields = ['title', 'description', 'type'];

function parsePositiveInteger(value, entityName) {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new RequirementServiceError(`ID ${entityName} inválido.`, 400);
  }

  return parsedValue;
}

export function parseProjectId(projectId) {
  if (projectId === undefined || projectId === null || projectId === '') {
    throw new RequirementServiceError('O projeto do requisito é obrigatório.', 400);
  }

  return parsePositiveInteger(projectId, 'do projeto');
}

export function parseRequirementId(requirementId) {
  return parsePositiveInteger(requirementId, 'do requisito');
}

export function normalizeEnumValue(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return String(value).trim().toUpperCase();
}

export function validateRequirementStatus(status) {
  if (status !== undefined && !allowedStatuses.has(status)) {
    throw new RequirementServiceError(
      'Status inválido. Use CADASTRADO, APROVADO, EM_IMPLEMENTACAO, VALIDADO ou CONCLUIDO.',
      400
    );
  }
}

export function buildRequirementData(data, isCreate = false) {
  const payload = data && typeof data === 'object' ? data : {};

  if (
    (isCreate && (typeof payload.title !== 'string' || !payload.title.trim())) ||
    (payload.title !== undefined &&
      (typeof payload.title !== 'string' || !payload.title.trim()))
  ) {
    throw new RequirementServiceError('O título do requisito é obrigatório.', 400);
  }

  const normalizedType = normalizeEnumValue(payload.type);

  if (normalizedType !== undefined && !allowedTypes.has(normalizedType)) {
    throw new RequirementServiceError(
      'Tipo inválido. Use FUNCIONAL, NAO_FUNCIONAL ou REGRA_NEGOCIO.',
      400
    );
  }

  const requirementData = {};

  for (const field of editableFields) {
    if (payload[field] === undefined) continue;

    if (field === 'title') {
      requirementData.title = payload.title.trim();
    } else if (field === 'description') {
      if (payload.description === null) requirementData.description = null;
      else if (typeof payload.description !== 'string') {
        requirementData.description = String(payload.description);
      } else requirementData.description = payload.description.trim() || null;
    } else if (field === 'type' && normalizedType) {
      requirementData.type = normalizedType;
    }
  }

  if (isCreate) {
    requirementData.type = normalizedType || 'FUNCIONAL';
    requirementData.status = 'CADASTRADO';
  }

  return requirementData;
}

export function calculateRequirementStatus(tasks) {
  if (tasks.length === 0) return 'CADASTRADO';
  if (tasks.every((task) => task.status === 'A_FAZER')) return 'APROVADO';
  if (tasks.every((task) => task.status === 'CONCLUIDO')) return 'VALIDADO';
  return 'EM_IMPLEMENTACAO';
}
