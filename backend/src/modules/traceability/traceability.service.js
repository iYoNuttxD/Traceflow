// Service de rastreabilidade: coordena persistência, cálculos e mapeamento de saída.
import { formatMatrixRow, formatRequirementDetail } from './traceability.mapper.js';
import { traceabilityRepository } from './traceability.repository.js';

class TraceabilityServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'TraceabilityServiceError';
    this.statusCode = statusCode;
  }
}

function parsePositiveInteger(value, entityName) {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new TraceabilityServiceError(`ID ${entityName} inválido.`, 400);
  }

  return parsedValue;
}

function parseProjectId(projectId) {
  return parsePositiveInteger(projectId, 'do projeto');
}

function parseRequirementId(requirementId) {
  return parsePositiveInteger(requirementId, 'do requisito');
}

async function ensureProjectExists(projectId) {
  const project = await traceabilityRepository.findProjectById(projectId);

  if (!project) {
    throw new TraceabilityServiceError('Projeto não encontrado.', 404);
  }

  return project;
}

export const traceabilityService = {
  async getRequirementsMatrix(projectId) {
    const parsedProjectId = parseProjectId(projectId);
    await ensureProjectExists(parsedProjectId);

    const requirements =
      await traceabilityRepository.findRequirementsTraceabilityByProject(parsedProjectId);
    const rows = requirements.map(formatMatrixRow);
    const totalRequirements = rows.length;
    const requirementsWithTasks = rows.filter((row) => row.tasksCount > 0).length;
    const requirementsWithTechnicalEvidence = rows.filter(
      (row) => row.hasTechnicalEvidence
    ).length;
    const implementedRequirements = rows.filter((row) =>
      ['IMPLEMENTADO', 'CONCLUIDO'].includes(row.implementationStatus)
    ).length;
    const averageProgressPercentage =
      totalRequirements === 0
        ? 0
        : Number(
            (
              rows.reduce((sum, row) => sum + row.progressPercentage, 0) /
              totalRequirements
            ).toFixed(2)
          );

    return {
      projectId: parsedProjectId,
      summary: {
        totalRequirements,
        requirementsWithTasks,
        requirementsWithTechnicalEvidence,
        implementedRequirements,
        averageProgressPercentage
      },
      requirements: rows
    };
  },

  async getRequirementTraceability(projectId, requirementId) {
    const parsedProjectId = parseProjectId(projectId);
    const parsedRequirementId = parseRequirementId(requirementId);
    await ensureProjectExists(parsedProjectId);

    const requirement =
      await traceabilityRepository.findRequirementTraceabilityByProject(
        parsedProjectId,
        parsedRequirementId
      );

    if (!requirement) {
      throw new TraceabilityServiceError('Requisito não encontrado neste projeto.', 404);
    }

    return formatRequirementDetail({
      ...requirement,
      projectId: parsedProjectId
    });
  }
};
