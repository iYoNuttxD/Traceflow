import { requirementRepository } from '../requirement.repository.js';
import { resourceNotFoundError } from '../../../shared/errors/index.js';
import { buildRequirementData, parseProjectId, parseRequirementId } from '../requirement.schema.js';

// Mesma fábrica do middleware: "não existe" e "existe em projeto alheio"
// precisam ser indistinguíveis.
export async function ensureRequirementProjectExists(projectId) {
  const project = await requirementRepository.findProjectById(projectId);
  if (!project) throw resourceNotFoundError('Project');
  return project;
}

export async function ensureRequirementExists(requirementId) {
  const requirement = await requirementRepository.findRequirementById(requirementId);
  if (!requirement) throw resourceNotFoundError('Requirement');
  return requirement;
}

export const requirementCrudService = {
  async createRequirement(projectId, data) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureRequirementProjectExists(parsedProjectId);
    return requirementRepository.createRequirement(
      parsedProjectId,
      buildRequirementData(data, true)
    );
  },

  async findRequirementsByProject(projectId, query = {}) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureRequirementProjectExists(parsedProjectId);
    return requirementRepository.findRequirementsByProject(parsedProjectId, {
      search: query.search
    });
  },

  async getRequirementById(requirementId) {
    return ensureRequirementExists(parseRequirementId(requirementId));
  },

  async updateRequirement(requirementId, data) {
    const parsedRequirementId = parseRequirementId(requirementId);
    const currentRequirement = await ensureRequirementExists(parsedRequirementId);
    const requirementData = buildRequirementData(data);
    if (Object.keys(requirementData).length === 0) return currentRequirement;
    return requirementRepository.updateRequirement(parsedRequirementId, requirementData);
  },

  async deleteRequirement(requirementId) {
    const parsedRequirementId = parseRequirementId(requirementId);
    await ensureRequirementExists(parsedRequirementId);
    await requirementRepository.deleteRequirement(parsedRequirementId);
    return { id: parsedRequirementId };
  },

  async findTasksByRequirement(requirementId) {
    const parsedRequirementId = parseRequirementId(requirementId);
    await ensureRequirementExists(parsedRequirementId);
    return requirementRepository.findTasksByRequirement(parsedRequirementId);
  }
};
