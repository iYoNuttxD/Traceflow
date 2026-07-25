import { DomainError as TraceabilityServiceError } from '../../shared/errors/index.js';
import { buildCoverageMetric, buildMatrixSummary } from './traceability.calculator.js';
import {
  formatArtifactGraph,
  formatMatrixRow,
  formatRequirementGraph,
  formatTaskGraph
} from './traceability.mapper.js';
import { traceabilityRepository } from './traceability.repository.js';

function parsePositiveInteger(value, entityName) {
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new TraceabilityServiceError(`ID ${entityName} inválido.`, 400);
  }
  return parsedValue;
}

function pageFrom(query = {}) {
  const page = Number(query.page) || 1;
  const limit = Math.min(Number(query.limit) || 20, 100);
  return { page, limit, skip: (page - 1) * limit };
}

function pagination(page, limit, total, scope) {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    scope
  };
}

async function ensureProjectExists(projectId) {
  const project = await traceabilityRepository.findProjectById(projectId);
  if (!project) throw new TraceabilityServiceError('Projeto não encontrado.', 404);
  return project;
}

async function coverage(projectId, countTotal, countLinked, legacyTotalKey, legacyLinkedKey) {
  const id = parsePositiveInteger(projectId, 'do projeto');
  await ensureProjectExists(id);
  const [total, linked] = await Promise.all([countTotal(id), countLinked(id)]);
  const metric = buildCoverageMetric(linked, total);
  return {
    projectId: id,
    [legacyTotalKey]: total,
    [legacyLinkedKey]: linked,
    coveragePercentage: metric.percentage ?? 0,
    coverage: metric
  };
}

export const traceabilityService = {
  async getRequirementsMatrix(projectId, query = {}) {
    const id = parsePositiveInteger(projectId, 'do projeto');
    await ensureProjectExists(id);
    const { page, limit, skip } = pageFrom(query);
    const [summaryRequirements, pageResult] = await Promise.all([
      traceabilityRepository.findRequirementsSummaryByProject(id),
      traceabilityRepository.findRequirementsMatrixPage(id, { skip, take: limit })
    ]);
    const summaryRows = summaryRequirements.map(formatMatrixRow);
    return {
      projectId: id,
      summary: buildMatrixSummary(summaryRows),
      requirements: pageResult.requirements.map(formatMatrixRow),
      pagination: pagination(page, limit, pageResult.total, 'requirements')
    };
  },

  async getRequirementTraceability(projectId, requirementId, query = {}) {
    const id = parsePositiveInteger(projectId, 'do projeto');
    const requirement = parsePositiveInteger(requirementId, 'do requisito');
    await ensureProjectExists(id);
    const { page, limit, skip } = pageFrom(query);
    const result = await traceabilityRepository.findRequirementGraphPage(
      id,
      requirement,
      { skip, take: limit }
    );
    if (!result) throw new TraceabilityServiceError('Requisito não encontrado neste projeto.', 404);
    return formatRequirementGraph(result, pagination(page, limit, result.total, 'tasks'));
  },

  async getTaskTraceability(projectId, taskId, query = {}) {
    const id = parsePositiveInteger(projectId, 'do projeto');
    const task = parsePositiveInteger(taskId, 'da tarefa');
    await ensureProjectExists(id);
    const { page, limit, skip } = pageFrom(query);
    const result = await traceabilityRepository.findTaskGraphPage(id, task, { skip, take: limit });
    if (!result) throw new TraceabilityServiceError('Tarefa não encontrada neste projeto.', 404);
    return formatTaskGraph(result, pagination(page, limit, result.total, 'artifacts'));
  },

  async getArtifactTraceability(projectId, artifactType, artifactId, query = {}) {
    const id = parsePositiveInteger(projectId, 'do projeto');
    const artifact = parsePositiveInteger(artifactId, 'do artefato');
    await ensureProjectExists(id);
    const { page, limit, skip } = pageFrom(query);
    const result = await traceabilityRepository.findArtifactGraphPage(
      id,
      artifactType,
      artifact,
      { skip, take: limit }
    );
    if (!result) throw new TraceabilityServiceError('Artefato não encontrado neste projeto.', 404);
    return formatArtifactGraph(
      { ...result, artifactType, projectId: id },
      pagination(page, limit, result.total, 'tasks')
    );
  },

  getRequirementTaskCoverage(projectId) {
    return coverage(
      projectId,
      (id) => traceabilityRepository.countRequirementsByProject(id),
      (id) => traceabilityRepository.countRequirementsWithTasks(id),
      'totalRequirements',
      'linkedRequirements'
    );
  },
  getPullRequestCoverage(projectId) {
    return coverage(projectId, (id) => traceabilityRepository.countTasksByProject(id), (id) => traceabilityRepository.countTasksWithPullRequest(id), 'totalTasks', 'linkedTasks');
  },
  getCommitCoverage(projectId) {
    return coverage(projectId, (id) => traceabilityRepository.countTasksByProject(id), (id) => traceabilityRepository.countTasksWithCommit(id), 'totalTasks', 'linkedTasks');
  },
  getIssueCoverage(projectId) {
    return coverage(projectId, (id) => traceabilityRepository.countTasksByProject(id), (id) => traceabilityRepository.countTasksWithIssue(id), 'totalTasks', 'linkedTasks');
  }
};
