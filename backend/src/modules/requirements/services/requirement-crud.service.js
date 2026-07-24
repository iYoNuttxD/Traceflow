import { requirementRepository } from '../requirement.repository.js';
import {
  RequirementServiceError,
  buildRequirementData,
  parseProjectId,
  parseRequirementId
} from '../requirement.schema.js';

export async function ensureRequirementProjectExists(projectId) {
  const project = await requirementRepository.findProjectById(projectId);
  if (!project) throw new RequirementServiceError('Projeto não encontrado.', 404);
  return project;
}

export async function ensureRequirementExists(requirementId) {
  const requirement = await requirementRepository.findRequirementById(requirementId);
  if (!requirement) throw new RequirementServiceError('Requisito não encontrado.', 404);
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
    const search = typeof query.search === 'string' ? query.search.trim() : undefined;
    return requirementRepository.findRequirementsByProject(parsedProjectId, { search });
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
