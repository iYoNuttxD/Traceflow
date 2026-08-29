import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../src/shared/index.js';

const apiMocks = vi.hoisted(() => ({
  getTaskComments: vi.fn(),
  createTaskComment: vi.fn(),
  updateTaskComment: vi.fn(),
  deleteTaskComment: vi.fn()
}));

vi.mock('../../src/features/tasks/api/tasks.api.js', () => apiMocks);
vi.mock('../../src/features/auth/index.js', () => ({
  useAuth: () => ({ user: { id: 10, name: 'Autora Teste' } })
}));
import { TaskComments } from '../../src/features/tasks/components/TaskComments.jsx';

const ownComment = (overrides = {}) => ({
  id: 1,
  taskId: 42,
  content: 'Comentário próprio.',
  editedAt: null,
  createdAt: '2026-08-29T12:00:00.000Z',
  author: { id: 10, name: 'Autora Teste' },
  canEdit: true,
  canDelete: true,
  ...overrides
});

const otherComment = (overrides = {}) => ({
  id: 2,
  taskId: 42,
  content: 'Comentário de colega.',
  editedAt: null,
  createdAt: '2026-08-29T11:00:00.000Z',
  author: { id: 20, name: 'Outra Pessoa' },
  canEdit: false,
  canDelete: false,
  ...overrides
});

// A API retorna do mais recente para o mais antigo (ordem de página).
const response = (
  comments = [ownComment(), otherComment()],
  permissions = { canComment: true, canModerate: false },
  total = comments.length
) => ({
  taskId: 42,
  total,
  comments,
  permissions,
  pagination: { page: 1, limit: 5, total, totalPages: Math.max(1, Math.ceil(total / 5)) }
});

function renderComments() {
  return render(
    <ConfirmProvider>
      <TaskComments taskId={42} />
    </ConfirmProvider>
  );
}

describe('TaskComments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getTaskComments.mockResolvedValue(response());
    apiMocks.createTaskComment.mockResolvedValue({ comment: ownComment() });
    apiMocks.updateTaskComment.mockResolvedValue({
      comment: ownComment({ content: 'Texto revisado.', editedAt: '2026-08-29T13:00:00.000Z' })
    });
    apiMocks.deleteTaskComment.mockResolvedValue({ message: 'ok' });
  });

  it('apresenta carregamento e estado vazio', async () => {
    let resolveRequest;
    apiMocks.getTaskComments.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );
    renderComments();
    expect(screen.getByText('Carregando comentários...')).toBeInTheDocument();
    resolveRequest(response([], { canComment: true, canModerate: false }, 0));
    expect(await screen.findByText('Nenhum comentário registrado.')).toBeInTheDocument();
    expect(apiMocks.getTaskComments).toHaveBeenCalledWith(
      42,
      { page: 1, limit: 5 },
      { signal: expect.any(AbortSignal) }
    );
  });

  it('alinha mensagens próprias à direita, mostra autor dos demais e ordem cronológica', async () => {
    const { container } = renderComments();
    expect(await screen.findByText('Comentário próprio.')).toBeInTheDocument();

    const ownBubble = container.querySelector('.task-chat-message-own');
    expect(ownBubble).toHaveTextContent('Comentário próprio.');
    expect(within(ownBubble).queryByText('Autora Teste')).not.toBeInTheDocument();
    expect(screen.getByText('Outra Pessoa')).toBeInTheDocument();

    const messages = [...container.querySelectorAll('.task-chat-content')].map(
      (node) => node.textContent
    );
    expect(messages).toEqual(['Comentário de colega.', 'Comentário próprio.']);
  });

  it('envia novo comentário e recarrega a conversa', async () => {
    const user = userEvent.setup();
    renderComments();
    await screen.findByText('Comentário próprio.');

    await user.type(screen.getByLabelText('Novo comentário'), 'Comentário novo');
    await user.click(screen.getByRole('button', { name: 'Comentar' }));
    await waitFor(() =>
      expect(apiMocks.createTaskComment).toHaveBeenCalledWith(42, 'Comentário novo')
    );
    await waitFor(() => expect(apiMocks.getTaskComments).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Novo comentário')).toHaveValue('');
  });

  it('carrega comentários anteriores sem duplicar registros', async () => {
    const user = userEvent.setup();
    apiMocks.getTaskComments
      .mockResolvedValueOnce(response([ownComment(), otherComment()], undefined, 3))
      .mockResolvedValueOnce(
        response([otherComment({ id: 3, content: 'Comentário antigo.' })], undefined, 3)
      );
    const { container } = renderComments();

    await user.click(await screen.findByRole('button', { name: 'Ver comentários anteriores' }));
    await waitFor(() =>
      expect(apiMocks.getTaskComments).toHaveBeenLastCalledWith(42, { page: 2, limit: 5 })
    );
    await screen.findByText('Comentário antigo.');
    const messages = [...container.querySelectorAll('.task-chat-content')].map(
      (node) => node.textContent
    );
    expect(messages).toEqual([
      'Comentário antigo.',
      'Comentário de colega.',
      'Comentário próprio.'
    ]);
  });

  it('oculta formulário e ícones para quem não pode interagir', async () => {
    apiMocks.getTaskComments.mockResolvedValue(
      response([otherComment()], { canComment: false, canModerate: false }, 1)
    );
    renderComments();
    expect(await screen.findByText('Comentário de colega.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Novo comentário')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar comentário' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir comentário' })).not.toBeInTheDocument();
  });

  it('edita pelo ícone de lápis e indica a edição', async () => {
    const user = userEvent.setup();
    renderComments();
    await user.click(await screen.findByRole('button', { name: 'Editar comentário' }));

    const editField = screen.getByLabelText('Editar comentário');
    await user.clear(editField);
    await user.type(editField, 'Texto revisado.');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(apiMocks.updateTaskComment).toHaveBeenCalledWith(42, 1, 'Texto revisado.')
    );
    expect(await screen.findByText('Texto revisado.')).toBeInTheDocument();
    expect(screen.getByText('(editado)')).toBeInTheDocument();
  });

  it('exclui pelo ícone de lixeira somente após confirmação', async () => {
    const user = userEvent.setup();
    renderComments();
    await user.click(await screen.findByRole('button', { name: 'Excluir comentário' }));
    expect(await screen.findByRole('heading', { name: 'Excluir comentário' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(apiMocks.deleteTaskComment).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Excluir comentário' }));
    await user.click(await screen.findByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(apiMocks.deleteTaskComment).toHaveBeenCalledWith(42, 1));
  });

  it('apresenta erro normalizado da API', async () => {
    apiMocks.getTaskComments.mockRejectedValue({
      response: { status: 409, data: { message: 'Falha ao carregar comentários.' } }
    });
    renderComments();
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao carregar comentários.');
  });
});
