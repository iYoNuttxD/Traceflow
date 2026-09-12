import { requirementRepository } from '../requirement.repository.js';
import { RequirementServiceError, parseRequirementId } from '../requirement.schema.js';
import { ensureRequirementExists } from './requirement-crud.service.js';

async function rejectManualStatus(requirementId) {
  await ensureRequirementExists(parseRequirementId(requirementId));
  throw new RequirementServiceError(
    'O status do requisito é derivado automaticamente da rastreabilidade.',
    409,
    'REQUIREMENT_STATUS_DERIVED'
  );
}
export const requirementStatusService = {
  updateRequirementStatus: rejectManualStatus,
  confirmCompletion: rejectManualStatus,
  async recalculateRequirementStatus(requirementId) {
    if (!requirementId) return null;
    const id = parseRequirementId(requirementId);
    await ensureRequirementExists(id);
    return requirementRepository.updateRequirement(id, {});
  }
};
