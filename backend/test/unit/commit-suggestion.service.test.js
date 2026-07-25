import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  repository: {
    findProjectById: vi.fn(),
    findTasksByProjectAndIds: vi.fn(),
    findExistingTaskCommitPairs: vi.fn(),
    findExistingSuggestionPairs: vi.fn(),
    createMany: vi.fn(),
    findCommitPage: vi.fn(),
    list: vi.fn(),
    findByProjectAndId: vi.fn(),
    confirm: vi.fn(),
    reject: vi.fn()
  }
}));

vi.mock('../../src/modules/traceability/commit-suggestion.repository.js', () => ({
  commitSuggestionRepository: mocks.repository
}));

import { extractTaskIdsFromCommitMessage } from '../../src/modules/traceability/commit-suggestion.parser.js';
import { commitSuggestionService } from '../../src/modules/traceability/commit-suggestion.service.js';

describe('parser canônico do RF41', () => {
  it('aceita referência única, múltipla e case-insensitive', () => {
    expect(extractTaskIdsFromCommitMessage('feat [TASK-42]')).toEqual([42]);
    expect(extractTaskIdsFromCommitMessage('[task-42] texto [Task-57]')).toEqual([42, 57]);
  });

  it('deduplica referências repetidas', () => {
    expect(extractTaskIdsFromCommitMessage('[TASK-42] [task-42] [TASK-42]')).toEqual([42]);
  });

  it.each([
    'TASK-42', '#42', 'ID 42', 'tarefa 42', '[ISSUE-42]', '[TASK-ABC]', '[TASK--42]', '[TASK-0]'
  ])('rejeita formato alternativo %s', (message) => {
    expect(extractTaskIdsFromCommitMessage(message)).toEqual([]);
  });
});

describe('detecção de sugestões do RF41', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.repository.findTasksByProjectAndIds.mockResolvedValue([{ id: 42 }]);
    mocks.repository.findExistingTaskCommitPairs.mockResolvedValue([]);
    mocks.repository.findExistingSuggestionPairs.mockResolvedValue([]);
    mocks.repository.createMany.mockImplementation(async (items) => ({ count: items.length }));
  });

  it('ignora Task inexistente ou de outro projeto', async () => {
    const result = await commitSuggestionService.detectForCommits(7, [
      { id: 10, projectId: 7, message: '[TASK-42] [TASK-57]' },
      { id: 11, projectId: 8, message: '[TASK-42]' }
    ]);
    expect(mocks.repository.createMany).toHaveBeenCalledWith([
      { projectId: 7, taskId: 42, commitId: 10 }
    ]);
    expect(result).toEqual({ scannedCommits: 1, detectedReferences: 2, createdSuggestions: 1, skippedSuggestions: 1 });
  });

  it('ignora vínculo e sugestão existentes, inclusive rejeitada', async () => {
    mocks.repository.findTasksByProjectAndIds.mockResolvedValue([{ id: 42 }, { id: 57 }]);
    mocks.repository.findExistingTaskCommitPairs.mockResolvedValue([{ taskId: 42, commitId: 10 }]);
    mocks.repository.findExistingSuggestionPairs.mockResolvedValue([{ taskId: 57, commitId: 10, status: 'REJECTED' }]);
    const result = await commitSuggestionService.detectForCommits(7, [
      { id: 10, projectId: 7, message: '[TASK-42] [TASK-57]' }
    ]);
    expect(mocks.repository.createMany).toHaveBeenCalledWith([]);
    expect(result.createdSuggestions).toBe(0);
    expect(result.skippedSuggestions).toBe(2);
  });

  it('é idempotente quando a sugestão já foi persistida', async () => {
    mocks.repository.findExistingSuggestionPairs.mockResolvedValue([{ taskId: 42, commitId: 10, status: 'PENDING' }]);
    await expect(commitSuggestionService.detectForCommits(7, [
      { id: 10, projectId: 7, message: '[TASK-42]' }
    ])).resolves.toMatchObject({ createdSuggestions: 0, skippedSuggestions: 1 });
  });
});
