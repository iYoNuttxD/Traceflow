import { requirementRepository } from '../requirement.repository.js';
import {
  RequirementServiceError,
  calculateRequirementStatus,
  normalizeEnumValue,
  parseRequirementId,
  validateRequirementStatus
} from '../requirement.schema.js';
import { ensureRequirementExists } from './requirement-crud.service.js';

export const requirementStatusService = {
  async updateRequirementStatus(requirementId, status) {
    const parsedRequirementId = parseRequirementId(requirementId);
    await ensureRequirementExists(parsedRequirementId);
    const normalizedStatus = normalizeEnumValue(status);
    validateRequirementStatus(normalizedStatus);
    if (!normalizedStatus) {
      throw new RequirementServiceError(
        'Status inválido. Use CADASTRADO, APROVADO, EM_IMPLEMENTACAO, VALIDADO ou CONCLUIDO.',
        400
      );
    }
    return requirementRepository.updateRequirementStatus(parsedRequirementId, normalizedStatus);
  },

  async recalculateRequirementStatus(requirementId) {
    if (!requirementId) return null;
    const parsedRequirementId = parseRequirementId(requirementId);
    const requirement = await ensureRequirementExists(parsedRequirementId);
    if (requirement.status === 'CONCLUIDO' || requirement.status === 'CANCELADO') {
      return requirement;
    }
    const nextStatus = calculateRequirementStatus(requirement.tasks || []);
    if (requirement.status === nextStatus) return requirement;
    return requirementRepository.updateRequirementStatus(parsedRequirementId, nextStatus);
  },

  async confirmCompletion(requirementId) {
    const parsedRequirementId = parseRequirementId(requirementId);
    const requirement = await ensureRequirementExists(parsedRequirementId);
    if (requirement.status !== 'VALIDADO') {
      throw new RequirementServiceError(
        'Apenas requisitos validados podem ser concluídos.',
        400
      );
    }
    return requirementRepository.updateRequirementStatus(parsedRequirementId, 'CONCLUIDO');
  }
};
