import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getCommitSuggestions: vi.fn(),
  scanCommitSuggestions: vi.fn(),
  confirmCommitSuggestion: vi.fn(),
  rejectCommitSuggestion: vi.fn()
}));

vi.mock('../../src/api/api.js', () => apiMocks);
import { CommitSuggestionsCard } from '../../src/components/CommitSuggestionsCard.jsx';

const suggestion = {
  id: 7,
  status: 'PENDING',
  task: { id: 42, title: 'Task artificial' },
  commit: { id: 9, hash: 'abcdef123456', shortHash: 'abcdef1', message: 'feat: implementação [TASK-42]' }
};
const response = (suggestions = [suggestion], canReview = true) => ({
  suggestions,
  permissions: { canReview },
  pagination: { page: 1, limit: 20, total: suggestions.length, totalPages: suggestions.length ? 1 : 0 }
});

describe('CommitSuggestionsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getCommitSuggestions.mockResolvedValue(response());
    apiMocks.scanCommitSuggestions.mockResolvedValue({ createdSuggestions: 0 });
    apiMocks.confirmCommitSuggestion.mockResolvedValue({ changed: true });
    apiMocks.rejectCommitSuggestion.mockResolvedValue({ changed: true });
  });

  it('preserva loading e lista vazia', async () => {
    let resolveRequest;
    apiMocks.getCommitSuggestions.mockReturnValueOnce(new Promise((resolve) => { resolveRequest = resolve; }));
    render(<CommitSuggestionsCard projectId="3" />);
    expect(screen.getByText('Carregando sugestões de commits...')).toBeInTheDocument();
    resolveRequest(response([], false));
    expect(await screen.findByText('Nenhuma sugestão de commit pendente.')).toBeInTheDocument();
  });

  it('exibe sugestão minimizada e restringe VIEWER à leitura', async () => {
    apiMocks.getCommitSuggestions.mockResolvedValue(response([suggestion], false));
    render(<CommitSuggestionsCard projectId="3" />);
    expect(await screen.findByText('feat: implementação [TASK-42]')).toBeInTheDocument();
    expect(screen.getByText('Task #42: Task artificial')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Analisar commits/ })).not.toBeInTheDocument();
  });

  it('confirma e atualiza a lista', async () => {
    const user = userEvent.setup();
    apiMocks.getCommitSuggestions
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response([]));
    render(<CommitSuggestionsCard projectId="3" />);
    await user.click(await screen.findByRole('button', { name: 'Confirmar' }));
    expect(apiMocks.confirmCommitSuggestion).toHaveBeenCalledWith('3', 7);
    expect(await screen.findByText('Nenhuma sugestão de commit pendente.')).toBeInTheDocument();
  });

  it('rejeita e atualiza a lista', async () => {
    const user = userEvent.setup();
    apiMocks.getCommitSuggestions
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response([]));
    render(<CommitSuggestionsCard projectId="3" />);
    await user.click(await screen.findByRole('button', { name: 'Rejeitar' }));
    expect(apiMocks.rejectCommitSuggestion).toHaveBeenCalledWith('3', 7);
    expect(await screen.findByText('Nenhuma sugestão de commit pendente.')).toBeInTheDocument();
  });

  it('analisa commits históricos e recarrega sugestões', async () => {
    const user = userEvent.setup();
    apiMocks.getCommitSuggestions
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response());
    render(<CommitSuggestionsCard projectId="3" />);
    await user.click(await screen.findByRole('button', { name: 'Analisar commits existentes' }));
    expect(apiMocks.scanCommitSuggestions).toHaveBeenCalledWith('3');
    expect(await screen.findByText('Task #42: Task artificial')).toBeInTheDocument();
  });

  it('exibe erro seguro da API', async () => {
    apiMocks.getCommitSuggestions.mockRejectedValue({ response: { data: { message: 'Falha artificial.' } } });
    render(<CommitSuggestionsCard projectId="3" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha artificial.');
  });
});
