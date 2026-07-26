import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getCommitSuggestions: vi.fn(),
  confirmCommitSuggestion: vi.fn(),
  rejectCommitSuggestion: vi.fn(),
  scanCommitSuggestions: vi.fn()
}));

vi.mock('../../src/features/traceability/api/traceability.api.js', () => apiMocks);
import { CommitSuggestionsCard } from '../../src/features/tasks/index.js';

const suggestion = {
  id: 7,
  status: 'PENDING',
  task: { id: 42, title: 'Task artificial' },
  commit: {
    id: 9,
    hash: 'abcdef123456',
    shortHash: 'abcdef1',
    message: 'feat: implementação [TASK-42]'
  }
};
const response = (suggestions = [suggestion], canReview = true) => ({
  suggestions,
  permissions: { canReview },
  pagination: {
    page: 1,
    limit: 20,
    total: suggestions.length,
    totalPages: suggestions.length ? 1 : 0
  }
});

describe('CommitSuggestionsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getCommitSuggestions.mockResolvedValue(response());
    apiMocks.confirmCommitSuggestion.mockResolvedValue({ changed: true });
    apiMocks.rejectCommitSuggestion.mockResolvedValue({ changed: true });
    apiMocks.scanCommitSuggestions.mockResolvedValue({
      scannedCommits: 4,
      detectedReferences: 2,
      createdSuggestions: 1,
      skippedSuggestions: 1
    });
  });

  it('preserva loading e lista vazia', async () => {
    let resolveRequest;
    apiMocks.getCommitSuggestions.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );
    render(<CommitSuggestionsCard projectId="3" taskId="42" />);
    expect(screen.getByText('Carregando sugestões de commits...')).toBeInTheDocument();
    resolveRequest(response([], false));
    expect(await screen.findByText('Nenhuma sugestão de commit pendente.')).toBeInTheDocument();
  });

  it('exibe sugestão minimizada e restringe VIEWER à leitura', async () => {
    apiMocks.getCommitSuggestions.mockResolvedValue(response([suggestion], false));
    render(<CommitSuggestionsCard projectId="3" taskId="42" />);
    expect(await screen.findByText('feat: implementação [TASK-42]')).toBeInTheDocument();
    expect(apiMocks.getCommitSuggestions).toHaveBeenCalledWith(
      '3',
      {
        status: 'PENDING',
        taskId: '42',
        page: 1,
        limit: 20
      },
      { signal: expect.any(AbortSignal) }
    );
    expect(screen.getByText('Task #42: Task artificial')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument();
  });

  it('confirma e atualiza a lista', async () => {
    const user = userEvent.setup();
    const onConfirmed = vi.fn();
    render(<CommitSuggestionsCard projectId="3" taskId="42" onConfirmed={onConfirmed} />);
    await user.click(await screen.findByRole('button', { name: 'Confirmar' }));
    expect(apiMocks.confirmCommitSuggestion).toHaveBeenCalledWith('3', 7);
    expect(onConfirmed).toHaveBeenCalledWith(suggestion.commit);
    expect(await screen.findByText('Nenhuma sugestão de commit pendente.')).toBeInTheDocument();
  });

  it('rejeita e atualiza a lista', async () => {
    const user = userEvent.setup();
    render(<CommitSuggestionsCard projectId="3" taskId="42" />);
    await user.click(await screen.findByRole('button', { name: 'Rejeitar' }));
    expect(apiMocks.rejectCommitSuggestion).toHaveBeenCalledWith('3', 7);
    expect(await screen.findByText('Nenhuma sugestão de commit pendente.')).toBeInTheDocument();
  });

  it('analisa históricos somente na edição e recarrega as sugestões da tarefa', async () => {
    const user = userEvent.setup();
    apiMocks.getCommitSuggestions
      .mockResolvedValueOnce(response([suggestion], true))
      .mockResolvedValueOnce(response([], true));

    render(<CommitSuggestionsCard projectId="3" taskId="42" />);
    await user.click(await screen.findByRole('button', { name: 'Atualizar sugestões' }));

    expect(apiMocks.scanCommitSuggestions).toHaveBeenCalledWith('3');
    expect(apiMocks.getCommitSuggestions).toHaveBeenCalledTimes(2);
    expect(apiMocks.getCommitSuggestions).toHaveBeenLastCalledWith(
      '3',
      {
        status: 'PENDING',
        taskId: '42',
        page: 1,
        limit: 20
      },
      { signal: expect.any(AbortSignal) }
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Commits analisados: 4');
    expect(screen.getByText('Nenhuma sugestão de commit pendente.')).toBeInTheDocument();
  });

  it('não consulta sugestões antes de a tarefa ser persistida', () => {
    render(<CommitSuggestionsCard projectId="3" />);
    expect(screen.getByText(/Após salvar a tarefa/)).toBeInTheDocument();
    expect(apiMocks.getCommitSuggestions).not.toHaveBeenCalled();
    expect(apiMocks.scanCommitSuggestions).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Atualizar sugestões' })).not.toBeInTheDocument();
  });

  it('exibe erro seguro da API', async () => {
    apiMocks.getCommitSuggestions.mockRejectedValue({
      response: { data: { message: 'Falha artificial.' } }
    });
    render(<CommitSuggestionsCard projectId="3" taskId="42" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha artificial.');
    expect(screen.queryByText('Nenhuma sugestão de commit pendente.')).not.toBeInTheDocument();
  });
});
