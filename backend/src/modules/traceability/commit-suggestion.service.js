import { buildAuditEvent } from '../audit/audit.service.js';
import { AppError, ERROR_CODES } from '../../shared/errors/index.js';
import { extractTaskIdsFromCommitMessage } from './commit-suggestion.parser.js';
import { commitSuggestionRepository } from './commit-suggestion.repository.js';

const pairKey = (taskId, commitId) => `${taskId}:${commitId}`;

function positiveId(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new AppError({
      message: `${label} inválido.`,
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
      exposeTechnicalDetails: true
    });
  }
  return parsed;
}

function publicSuggestion(suggestion) {
  return {
    id: suggestion.id,
    status: suggestion.status,
    detectedAt: suggestion.detectedAt,
    reviewedAt: suggestion.reviewedAt,
    task: suggestion.task,
    commit: {
      id: suggestion.commit.id,
      hash: suggestion.commit.hash,
      shortHash: suggestion.commit.hash?.slice(0, 7) || null,
      message: suggestion.commit.message,
      date: suggestion.commit.date
    }
  };
}

async function ensureProject(projectId) {
  const id = positiveId(projectId, 'ID do projeto');
  if (!(await commitSuggestionRepository.findProjectById(id))) {
    throw new AppError({
      message: 'Projeto não encontrado.',
      statusCode: 404,
      code: ERROR_CODES.PROJECT_NOT_FOUND,
      exposeTechnicalDetails: true
    });
  }
  return id;
}

function reviewError(result) {
  if (['NOT_FOUND', 'PROJECT_MISMATCH'].includes(result.outcome)) {
    return new AppError({
      message: 'Sugestão não encontrada neste projeto.',
      statusCode: 404,
      code: ERROR_CODES.RESOURCE_NOT_FOUND,
      exposeTechnicalDetails: true
    });
  }
  return new AppError({
    message: 'A sugestão já foi revisada com outro resultado.',
    statusCode: 409,
    code: ERROR_CODES.CONFLICT,
    exposeTechnicalDetails: true
  });
}

async function detectForCommits(projectId, commits) {
  const id = positiveId(projectId, 'ID do projeto');
  const projectCommits = (commits || []).filter((commit) => commit.projectId === id);
  const references = projectCommits.flatMap((commit) =>
    extractTaskIdsFromCommitMessage(commit.message).map((taskId) => ({
      taskId,
      commitId: commit.id
    }))
  );
  if (references.length === 0) {
    return {
      scannedCommits: projectCommits.length,
      detectedReferences: 0,
      createdSuggestions: 0,
      skippedSuggestions: 0
    };
  }

  const taskIds = [...new Set(references.map(({ taskId }) => taskId))];
  const commitIds = [...new Set(references.map(({ commitId }) => commitId))];
  const [tasks, existingLinks, existingSuggestions] = await Promise.all([
    commitSuggestionRepository.findTasksByProjectAndIds(id, taskIds),
    commitSuggestionRepository.findExistingTaskCommitPairs(taskIds, commitIds),
    commitSuggestionRepository.findExistingSuggestionPairs(taskIds, commitIds)
  ]);
  const validTaskIds = new Set(tasks.map(({ id: taskId }) => taskId));
  const blockedPairs = new Set([
    ...existingLinks.map(({ taskId, commitId }) => pairKey(taskId, commitId)),
    ...existingSuggestions.map(({ taskId, commitId }) => pairKey(taskId, commitId))
  ]);
  const candidates = references.filter(
    ({ taskId, commitId }) =>
      validTaskIds.has(taskId) && !blockedPairs.has(pairKey(taskId, commitId))
  );
  const result = await commitSuggestionRepository.createMany(
    candidates.map(({ taskId, commitId }) => ({ projectId: id, taskId, commitId }))
  );
  return {
    scannedCommits: projectCommits.length,
    detectedReferences: references.length,
    createdSuggestions: result.count,
    skippedSuggestions: references.length - result.count
  };
}

export const commitSuggestionService = {
  extractTaskIdsFromCommitMessage,
  detectForCommits,

  async scanHistorical(projectId, context) {
    const id = await ensureProject(projectId);
    const total = {
      scannedCommits: 0,
      detectedReferences: 0,
      createdSuggestions: 0,
      skippedSuggestions: 0
    };
    let cursor;
    do {
      const commits = await commitSuggestionRepository.findCommitPage(id, { cursor, take: 100 });
      if (commits.length === 0) break;
      const pageResult = await detectForCommits(id, commits);
      for (const key of Object.keys(total)) total[key] += pageResult[key];
      cursor = commits.at(-1).id;
      if (commits.length < 100) break;
      // A paginação termina pelo tamanho da página; o cursor apenas avança o lote.
      // eslint-disable-next-line no-constant-condition
    } while (true);

    await context.auditService.recordOperational({
      actorUserId: context.actorUserId,
      projectId: id,
      requestId: context.requestId,
      action: 'TASK_COMMIT_SUGGESTIONS_SCANNED',
      resourceType: 'Project',
      resourceId: id,
      metadata: { count: total.createdSuggestions, scope: 'historical_commits' }
    });
    return total;
  },

  async list(projectId, query = {}) {
    const id = await ensureProject(projectId);
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 100);
    const status = query.status || 'PENDING';
    const taskId = query.taskId ? positiveId(query.taskId, 'ID da tarefa') : undefined;
    if (taskId && !(await commitSuggestionRepository.findTaskByProjectAndId(id, taskId))) {
      throw new AppError({
        message: 'Tarefa não encontrada neste projeto.',
        statusCode: 404,
        code: ERROR_CODES.TASK_NOT_FOUND,
        exposeTechnicalDetails: true
      });
    }
    const result = await commitSuggestionRepository.list(id, {
      status,
      taskId,
      skip: (page - 1) * limit,
      take: limit
    });
    return {
      projectId: id,
      status,
      suggestions: result.suggestions.map(publicSuggestion),
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: result.total ? Math.ceil(result.total / limit) : 0
      }
    };
  },

  async confirm(projectId, suggestionId, context) {
    const id = await ensureProject(projectId);
    const suggestion = positiveId(suggestionId, 'ID da sugestão');
    const existing = await commitSuggestionRepository.findByProjectAndId(id, suggestion);
    if (!existing) throw reviewError({ outcome: 'NOT_FOUND' });
    const auditEvent = buildAuditEvent({
      actorUserId: context.actorUserId,
      projectId: id,
      requestId: context.requestId,
      action: 'TASK_COMMIT_SUGGESTION_CONFIRMED',
      resourceType: 'TaskCommitSuggestion',
      resourceId: suggestion,
      metadata: { suggestionId: suggestion, taskId: existing.taskId, commitId: existing.commitId }
    });
    const result = await commitSuggestionRepository.confirm({
      projectId: id,
      suggestionId: suggestion,
      userId: context.actorUserId,
      reviewedAt: new Date(),
      auditEvent
    });
    if (!['UPDATED', 'UNCHANGED'].includes(result.outcome)) throw reviewError(result);
    return {
      suggestion: publicSuggestion(result.suggestion),
      changed: result.outcome === 'UPDATED'
    };
  },

  async reject(projectId, suggestionId, context) {
    const id = await ensureProject(projectId);
    const suggestion = positiveId(suggestionId, 'ID da sugestão');
    const existing = await commitSuggestionRepository.findByProjectAndId(id, suggestion);
    if (!existing) throw reviewError({ outcome: 'NOT_FOUND' });
    const auditEvent = buildAuditEvent({
      actorUserId: context.actorUserId,
      projectId: id,
      requestId: context.requestId,
      action: 'TASK_COMMIT_SUGGESTION_REJECTED',
      resourceType: 'TaskCommitSuggestion',
      resourceId: suggestion,
      metadata: { suggestionId: suggestion, taskId: existing.taskId, commitId: existing.commitId }
    });
    const result = await commitSuggestionRepository.reject({
      projectId: id,
      suggestionId: suggestion,
      userId: context.actorUserId,
      reviewedAt: new Date(),
      auditEvent
    });
    if (!['UPDATED', 'UNCHANGED'].includes(result.outcome)) throw reviewError(result);
    return {
      suggestion: publicSuggestion(result.suggestion),
      changed: result.outcome === 'UPDATED'
    };
  }
};
