import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  deletedAt: null,
  deletionActorType: null,
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
  deletedAt: null,
  deletionActorType: null,
  canEdit: false,
  canDelete: false,
  ...overrides
});

const deletedComment = (overrides = {}) => ({
  id: 3,
  taskId: 42,
  content: null,
  editedAt: null,
  createdAt: '2026-08-29T10:00:00.000Z',
  author: { id: 20, name: 'Outra Pessoa' },
  deletedAt: '2026-08-29T14:00:00.000Z',
  deletionActorType: 'AUTHOR',
  canEdit: false,
  canDelete: false,
  ...overrides
});

const response = (
  comments = [ownComment(), otherComment()],
  permissions = { canComment: true, canModerate: false },
  total = comments.length
) => ({
  taskId: 42,
  total,
  comments,
  permissions,
  pagination: { page: 1, limit: 5, total, totalPages: Math.ceil(total / 5) }
});

function renderComments() {
  return render(
    <ConfirmProvider>
      <TaskComments taskId={42} />
    </ConfirmProvider>
  );
}

async function openOwnMenu(user) {
  const trigger = await screen.findByRole('button', { name: 'Ações do comentário' });
  await user.click(trigger);
  return { trigger, menu: screen.getByRole('menu') };
}

describe('TaskComments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getTaskComments.mockResolvedValue(response());
    apiMocks.createTaskComment.mockResolvedValue({ comment: ownComment({ id: 4 }) });
    apiMocks.updateTaskComment.mockResolvedValue({
      comment: ownComment({ content: 'Texto revisado.', editedAt: '2026-08-29T13:00:00.000Z' })
    });
    apiMocks.deleteTaskComment.mockResolvedValue({
      message: 'ok',
      comment: deletedComment({
        id: 1,
        author: { id: 10, name: 'Autora Teste' },
        createdAt: '2026-08-29T12:00:00.000Z'
      })
    });
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

  it('anuncia falha real da leitura como erro', async () => {
    apiMocks.getTaskComments.mockRejectedValueOnce({
      response: { data: { message: 'Falha ao carregar comentários.' } }
    });
    renderComments();

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao carregar comentários.');
  });

  it('mantém layout cronológico compacto e reúne ações no menu único', async () => {
    const user = userEvent.setup();
    const { container } = renderComments();
    expect(await screen.findByText('Comentário próprio.')).toBeInTheDocument();

    const messages = [...container.querySelectorAll('.task-chat-content')].map(
      (node) => node.textContent
    );
    expect(messages).toEqual(['Comentário de colega.', 'Comentário próprio.']);
    expect(screen.queryByRole('button', { name: 'Editar comentário' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir comentário' })).not.toBeInTheDocument();

    const { trigger, menu } = await openOwnMenu(user);
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const editItem = within(menu).getByRole('menuitem', { name: 'Editar' });
    const deleteItem = within(menu).getByRole('menuitem', { name: 'Excluir' });
    expect(editItem).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(deleteItem).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(editItem).toHaveFocus();
  });

  it('fecha o menu por Escape e click externo, restaurando foco no Escape', async () => {
    const user = userEvent.setup();
    renderComments();
    const { trigger } = await openOwnMenu(user);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('representa AUTHOR, MODERATION e UNKNOWN sem ações', async () => {
    apiMocks.getTaskComments.mockResolvedValue(
      response([
        deletedComment({ id: 3, deletionActorType: 'AUTHOR' }),
        deletedComment({ id: 4, deletionActorType: 'MODERATION' }),
        deletedComment({ id: 5, deletionActorType: 'UNKNOWN' })
      ])
    );
    const { container } = renderComments();

    expect(await screen.findByText('Comentário excluído pelo autor.')).toBeInTheDocument();
    expect(screen.getByText('Comentário excluído por moderação.')).toBeInTheDocument();
    expect(screen.getByText('Comentário excluído.')).toBeInTheDocument();
    expect(container.querySelectorAll('.task-chat-bubble-deleted')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Ações do comentário' })).not.toBeInTheDocument();
  });

  it('edita somente pelo composer e permite cancelar sem request', async () => {
    const user = userEvent.setup();
    const { container } = renderComments();
    let { trigger, menu } = await openOwnMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Editar' }));

    const editField = screen.getByLabelText('Editar comentário');
    expect(editField).toHaveValue('Comentário próprio.');
    await waitFor(() => expect(editField).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
    expect(container.querySelector('.task-chat-bubble textarea')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancelar edição' }));
    expect(apiMocks.updateTaskComment).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Novo comentário')).toHaveValue('');
    await waitFor(() => expect(trigger).toHaveFocus());

    ({ menu } = await openOwnMenu(user));
    await user.click(within(menu).getByRole('menuitem', { name: 'Editar' }));
    await user.clear(screen.getByLabelText('Editar comentário'));
    await user.type(screen.getByLabelText('Editar comentário'), 'Texto revisado.');
    apiMocks.getTaskComments.mockResolvedValueOnce(
      response([
        ownComment({ content: 'Texto revisado.', editedAt: '2026-08-29T13:00:00.000Z' }),
        otherComment()
      ])
    );
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Texto revisado.')).toBeInTheDocument();
    expect(screen.getByText('Editado')).toBeInTheDocument();
    expect(screen.getByLabelText('Novo comentário')).toHaveValue('');
    expect(apiMocks.updateTaskComment).toHaveBeenCalledOnce();
  });

  it('preserva confirmação e converte delete confirmado em tombstone local', async () => {
    const user = userEvent.setup();
    renderComments();
    let { menu } = await openOwnMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Excluir' }));
    expect(await screen.findByRole('heading', { name: 'Excluir comentário' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(apiMocks.deleteTaskComment).not.toHaveBeenCalled();

    ({ menu } = await openOwnMenu(user));
    await user.click(within(menu).getByRole('menuitem', { name: 'Excluir' }));
    apiMocks.getTaskComments.mockResolvedValueOnce(
      response([
        deletedComment({ id: 1, author: { id: 10, name: 'Autora Teste' } }),
        otherComment()
      ])
    );
    await user.click(await screen.findByRole('button', { name: 'Excluir' }));

    expect(await screen.findByText('Comentário excluído pelo autor.')).toBeInTheDocument();
    expect(apiMocks.deleteTaskComment).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Ações do comentário' })).not.toBeInTheDocument();
  });

  it('carrega histórico automaticamente no topo, deduplica e preserva a posição visual', async () => {
    let scrollHeight = 500;
    apiMocks.getTaskComments
      .mockResolvedValueOnce(response([ownComment(), otherComment()], undefined, 3))
      .mockImplementationOnce(async () => {
        scrollHeight = 700;
        return response([otherComment({ id: 3, content: 'Comentário antigo.' })], undefined, 3);
      });
    const { container } = renderComments();
    await screen.findByText('Comentário próprio.');
    expect(screen.queryByText('Ver comentários anteriores')).not.toBeInTheDocument();

    const scroller = container.querySelector('.task-comments-scroll');
    Object.defineProperty(scroller, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight
    });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 200 });
    scroller.scrollTop = 10;
    fireEvent.scroll(scroller);

    expect(await screen.findByText('Comentário antigo.')).toBeInTheDocument();
    await waitFor(() => expect(scroller.scrollTop).toBe(210));
    expect(apiMocks.getTaskComments).toHaveBeenLastCalledWith(
      42,
      { page: 2, limit: 5 },
      { signal: expect.any(AbortSignal) }
    );
  });

  it('mantém leitura do histórico e oferece indicador para comentário remoto', async () => {
    const { container } = renderComments();
    await screen.findByText('Comentário próprio.');
    const scroller = container.querySelector('.task-comments-scroll');
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 200 });
    scroller.scrollTop = 100;
    fireEvent.scroll(scroller);

    apiMocks.getTaskComments.mockResolvedValueOnce(
      response([ownComment({ id: 4, content: 'Comentário remoto.' }), ownComment(), otherComment()])
    );
    await act(async () => window.dispatchEvent(new Event('focus')));

    expect(await screen.findByText('Comentário remoto.')).toBeInTheDocument();
    const indicator = screen.getByRole('button', { name: 'Novos comentários' });
    expect(scroller.scrollTop).toBe(100);
    await userEvent.setup().click(indicator);
    expect(scroller.scrollTop).toBe(1000);
  });

  it('cancela edit mode quando refresh remoto transforma o alvo em tombstone', async () => {
    const user = userEvent.setup();
    renderComments();
    const { menu } = await openOwnMenu(user);
    await user.click(within(menu).getByRole('menuitem', { name: 'Editar' }));
    await user.type(screen.getByLabelText('Editar comentário'), ' rascunho');

    apiMocks.getTaskComments.mockResolvedValueOnce(
      response([
        deletedComment({ id: 1, author: { id: 10, name: 'Autora Teste' } }),
        otherComment()
      ])
    );
    await act(async () => window.dispatchEvent(new Event('focus')));

    expect(
      await screen.findByText('O comentário não está mais disponível para edição.')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Novo comentário')).toHaveValue('');
    expect(apiMocks.updateTaskComment).not.toHaveBeenCalled();
  });

  it('oculta composer e menu para VIEWER', async () => {
    apiMocks.getTaskComments.mockResolvedValue(
      response([otherComment()], { canComment: false, canModerate: false }, 1)
    );
    renderComments();
    expect(await screen.findByText('Comentário de colega.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Novo comentário')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ações do comentário' })).not.toBeInTheDocument();
  });
});
