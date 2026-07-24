import { requirementRepository } from '../requirement.repository.js';
import { calculateCoveragePercentage, parseProjectId } from '../requirement.schema.js';
import { ensureRequirementProjectExists } from './requirement-crud.service.js';

export const requirementCoverageService = {
  async getRequirementTaskCoverage(projectId) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureRequirementProjectExists(parsedProjectId);
    const [totalRequirements, linkedRequirements] = await Promise.all([
      requirementRepository.countRequirementsByProject(parsedProjectId),
      requirementRepository.countRequirementsWithTasksByProject(parsedProjectId)
    ]);
    return {
      projectId: parsedProjectId,
      totalRequirements,
      linkedRequirements,
      coveragePercentage: calculateCoveragePercentage(linkedRequirements, totalRequirements)
    };
  }
};
