import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../src/shared/index.js';

const apiMocks = vi.hoisted(() => ({
  getTaskTimeEntries: vi.fn(),
  getTaskEffortHistory: vi.fn(),
  updateTaskTimeEntry: vi.fn(),
  startTaskTimer: vi.fn(),
  stopTaskTimer: vi.fn(),
  createTaskTimeEntry: vi.fn(),
  deleteTaskTimeEntry: vi.fn()
}));

vi.mock('../../src/features/tasks/api/tasks.api.js', () => apiMocks);
import { TaskEffortTracker } from '../../src/features/tasks/components/TaskEffortTracker.jsx';

const HOUR = 3600;
const ana = { id: 10, name: 'Ana Ribeiro' };
const bruno = { id: 20, name: 'Bruno Lima' };

const effort = (overrides = {}) => ({
  unit: 'HOURS',
  estimatedHours: 8,
  estimatedSeconds: 8 * HOUR,
  completedSeconds: 0,
  completedCount: 0,
  actualHours: 0,
  status: 'DENTRO_DO_PREVISTO',
  running: null,
  ...overrides
});

const closedEntry = (overrides = {}) => ({
  id: 1,
  taskId: 42,
  source: 'TIMER',
  startedAt: '2026-09-05T14:02:00.000Z',
  endedAt: '2026-09-05T15:47:00.000Z',
  durationSeconds: HOUR + 45 * 60,
  note: null,
  startedBy: ana,
  endedBy: bruno,
  canDelete: true,
  ...overrides
});

const response = (overrides = {}) => ({
  taskId: 42,
  running: null,
  entries: [],
  effort: effort(),
  permissions: { canOperate: true, canModerate: false },
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
  ...overrides
});

// O mesmo endpoint alimenta o rastreador (sem `page`) e o diálogo (com `page`).
function mockEntries(trackerResponse, dialogResponse = trackerResponse) {
  apiMocks.getTaskTimeEntries.mockResolvedValue(trackerResponse);
  apiMocks.getTaskEffortHistory.mockResolvedValue({
    ...dialogResponse,
    items: (dialogResponse.entries || []).map((entry) => ({
      id: entry.id,
      sessionId: entry.id,
      eventType: 'CREATED',
      source: entry.source,
      actor: entry.endedBy || entry.startedBy,
      occurredAt: entry.endedAt,
      snapshotStartedAt: entry.startedAt,
      snapshotEndedAt: entry.endedAt,
      newSeconds: entry.durationSeconds,
      canDelete: entry.canDelete,
      canEdit: entry.canEdit,
      currentEntry: entry
    }))
  });
}

function renderTracker(props = {}) {
  return render(
    <ConfirmProvider>
      <TaskEffortTracker taskId={42} taskTitle="Corrigir frete" estimatedEffort={8} {...props} />
    </ConfirmProvider>
  );
}

async function openSessions(user) {
  await user.click(await screen.findByRole('button', { name: 'Ver sessões registradas' }));
  const dialog = await screen.findByRole('dialog', { name: /Sessões — #42 Corrigir frete/ });
  await waitFor(() =>
    expect(within(dialog).getByRole('button', { name: /Fechar sessões/ })).toHaveFocus()
  );
  return dialog;
}

describe('TaskEffortTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntries(response());
  });

  it('mostra estado inicial, inicia o cronômetro e passa a exibir quem iniciou', async () => {
    const user = userEvent.setup();
    const onEffortChange = vi.fn();
    const startedAt = new Date().toISOString();
    apiMocks.startTaskTimer.mockResolvedValue({
      entry: {
        id: 9,
        taskId: 42,
        source: 'TIMER',
        startedAt,
        endedAt: null,
        startedBy: ana,
        canDelete: true
      },
      effort: effort({ running: { id: 9, startedAt, startedBy: ana } })
    });
    renderTracker({ onEffortChange });

    expect(await screen.findByText('Não iniciado')).toBeInTheDocument();
    expect(screen.getByText('0min de 8h estimadas')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Consumo da estimativa' })).toHaveAttribute(
      'aria-valuenow',
      '0'
    );
    expect(screen.getByRole('button', { name: 'Ver sessões registradas' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Iniciar' }));
    await waitFor(() => expect(apiMocks.startTaskTimer).toHaveBeenCalledWith(42));
    expect(await screen.findByRole('button', { name: 'Pausar' })).toBeInTheDocument();
    expect(screen.getByText('Dentro do previsto')).toBeInTheDocument();
    expect(screen.getByText(/iniciado por Ana Ribeiro às/)).toBeInTheDocument();
    expect(onEffortChange).toHaveBeenCalledWith(
      expect.objectContaining({ running: expect.any(Object) }),
      'Cronômetro iniciado.'
    );
  });

  it('retoma uma sessão em andamento persistida no servidor e pausa registrando o total', async () => {
    const user = userEvent.setup();
    const startedAt = new Date(Date.now() - 90_000).toISOString();
    mockEntries(
      response({
        running: {
          id: 9,
          taskId: 42,
          source: 'TIMER',
          startedAt,
          endedAt: null,
          startedBy: bruno,
          canDelete: false
        },
        effort: effort({
          completedSeconds: 2 * HOUR,
          completedCount: 2,
          running: { id: 9, startedAt, startedBy: bruno }
        })
      })
    );
    apiMocks.stopTaskTimer.mockResolvedValue({
      entry: closedEntry({ id: 9, startedBy: bruno, endedBy: ana, durationSeconds: 95 }),
      effort: effort({ completedSeconds: 2 * HOUR + 95, completedCount: 3, actualHours: 2.03 })
    });
    const { container } = renderTracker();

    const clock = await screen.findByLabelText('Tempo da sessão atual');
    expect(clock.textContent).toMatch(/^00:01:(29|30|31|32)$/);
    expect(container.querySelector('.task-effort')).toHaveAttribute('data-state', 'running');
    expect(screen.getByText(/iniciado por Bruno Lima/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Pausar' }));
    await waitFor(() => expect(apiMocks.stopTaskTimer).toHaveBeenCalledWith(42));
    expect(await screen.findByRole('button', { name: 'Retomar' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tempo total registrado')).toHaveTextContent('02:01:35');
    expect(screen.getByText('3 sessões registradas')).toBeInTheDocument();
  });

  it('sinaliza estouro com texto além da cor e trata ausência de estimativa', async () => {
    mockEntries(
      response({
        effort: effort({
          estimatedHours: 5,
          completedSeconds: 6 * HOUR + 42 * 60,
          completedCount: 4,
          actualHours: 6.7,
          status: 'ESTOURADO'
        })
      })
    );
    const { container, unmount } = renderTracker({ estimatedEffort: 5 });
    expect(await screen.findByText('+1h42min acima da estimativa')).toBeInTheDocument();
    expect(container.querySelector('.task-effort')).toHaveAttribute('data-zone', 'danger');
    // aria-valuenow satura no máximo declarado; o estouro real fica no valuetext.
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '134% da estimativa');
    expect(screen.getByText('134%')).toBeInTheDocument();
    unmount();

    mockEntries(
      response({
        effort: effort({
          estimatedHours: null,
          completedSeconds: HOUR,
          completedCount: 1,
          status: 'SEM_ESTIMATIVA'
        })
      })
    );
    renderTracker({ estimatedEffort: null });
    expect(await screen.findByText('Sem limite definido')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText(/Sem estimativa definida/)).toBeInTheDocument();
  });

  it('a estimativa editada na tarefa prevalece sobre a última leitura das sessões', async () => {
    mockEntries(
      response({
        effort: effort({ estimatedHours: 8, completedSeconds: 2 * HOUR, completedCount: 1 })
      })
    );
    renderTracker({ estimatedEffort: 10 });
    expect(await screen.findByText('2h de 10h estimadas')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
  });

  it('registra lançamento manual com horas decimais e observação', async () => {
    const user = userEvent.setup();
    const onEffortChange = vi.fn();
    apiMocks.createTaskTimeEntry.mockResolvedValue({
      entry: closedEntry({
        id: 3,
        source: 'MANUAL',
        durationSeconds: 5400,
        note: 'Esqueci de iniciar',
        endedBy: ana
      }),
      effort: effort({ completedSeconds: 5400, completedCount: 1, actualHours: 1.5 })
    });
    renderTracker({ onEffortChange });
    await screen.findByText('Não iniciado');

    await user.click(screen.getByRole('button', { name: 'Lançar manualmente' }));
    await user.type(screen.getByLabelText('Horas'), '1.5');
    await user.type(screen.getByLabelText('Observação'), 'Esqueci de iniciar');
    await user.click(screen.getByRole('button', { name: 'Salvar lançamento' }));

    await waitFor(() =>
      expect(apiMocks.createTaskTimeEntry).toHaveBeenCalledWith(42, {
        hours: '1.5',
        note: 'Esqueci de iniciar'
      })
    );
    expect(await screen.findByText('1 sessão registrada')).toBeInTheDocument();
    expect(screen.getByLabelText('Tempo total registrado')).toHaveTextContent('01:30:00');
    expect(screen.queryByLabelText('Horas')).toBeNull();
    expect(onEffortChange).toHaveBeenCalledWith(
      expect.objectContaining({ actualHours: 1.5 }),
      'Lançamento manual registrado.'
    );
  });

  it('abre o diálogo de sessões com quem iniciou e quem parou, e exclui após confirmação', async () => {
    const user = userEvent.setup();
    const onEffortChange = vi.fn();
    const manual = closedEntry({
      id: 3,
      source: 'MANUAL',
      durationSeconds: 5400,
      note: 'Esqueci de iniciar',
      endedBy: ana
    });
    mockEntries(
      response({
        entries: [manual, closedEntry()],
        effort: effort({ completedSeconds: 3 * HOUR + 15 * 60, completedCount: 2 })
      }),
      response({
        entries: [manual, closedEntry()],
        effort: effort({ completedSeconds: 3 * HOUR + 15 * 60, completedCount: 2 }),
        pagination: { page: 1, limit: 10, total: 2, totalPages: 1 }
      })
    );
    apiMocks.deleteTaskTimeEntry.mockResolvedValue({
      entry: closedEntry(),
      effort: effort({ completedSeconds: 5400, completedCount: 1, actualHours: 1.5 })
    });
    renderTracker({ onEffortChange });
    await screen.findByText('2 sessões registradas');

    const dialog = await openSessions(user);
    await waitFor(() =>
      expect(apiMocks.getTaskEffortHistory).toHaveBeenCalledWith(
        42,
        { page: 1, limit: 10 },
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    );
    const list = await within(dialog).findByRole('list', { name: 'Sessões registradas' });
    expect(within(list).getByText(/Bruno Lima/)).toBeInTheDocument();
    expect(within(list).getByText(/Ana Ribeiro/)).toBeInTheDocument();
    expect(within(list).getByText('manual')).toBeInTheDocument();
    expect(within(list).getByText('cronômetro')).toBeInTheDocument();
    expect(within(list).getByText('1h45min')).toBeInTheDocument();
    expect(within(list).getByText('1h30min')).toBeInTheDocument();
    // Duas sessões não passam do tamanho da página: sem paginação.
    expect(within(dialog).queryByRole('navigation')).toBeNull();

    const deleteButtons = within(list).getAllByRole('button', { name: /^Excluir sessão/ });
    await user.click(deleteButtons[1]);
    expect(
      await screen.findByRole('heading', { name: 'Excluir sessão de tempo' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(apiMocks.deleteTaskTimeEntry).not.toHaveBeenCalled();

    await user.click(within(list).getAllByRole('button', { name: /^Excluir sessão/ })[1]);
    await user.click(await screen.findByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(apiMocks.deleteTaskTimeEntry).toHaveBeenCalledWith(42, 1));
    expect(onEffortChange).toHaveBeenCalledWith(
      expect.objectContaining({ actualHours: 1.5 }),
      'Sessão de tempo excluída.'
    );
    // O diálogo recarrega a página aberta depois da exclusão.
    await waitFor(() =>
      expect(
        apiMocks.getTaskEffortHistory.mock.calls.filter(([, params]) => params?.page).length
      ).toBeGreaterThanOrEqual(2)
    );
    expect(screen.getByText('1 sessão registrada')).toBeInTheDocument();
  });

  it('filtra o diálogo por período e origem no servidor', async () => {
    const user = userEvent.setup();
    mockEntries(
      response({ entries: [closedEntry()], effort: effort({ completedCount: 1 }) }),
      response({
        entries: [closedEntry()],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
      })
    );
    renderTracker();
    await screen.findByText('1 sessão registrada');
    const dialog = await openSessions(user);
    await within(dialog).findByRole('list', { name: 'Sessões registradas' });

    await user.type(within(dialog).getByLabelText('Data inicial'), '2026-09-01');
    await user.type(within(dialog).getByLabelText('Data final'), '2026-09-05');
    await user.selectOptions(within(dialog).getByLabelText('Origem'), 'MANUAL');
    await user.click(within(dialog).getByRole('button', { name: 'Filtrar' }));
    await waitFor(() =>
      expect(apiMocks.getTaskEffortHistory).toHaveBeenLastCalledWith(
        42,
        { page: 1, limit: 10, startDate: '2026-09-01', endDate: '2026-09-05', source: 'MANUAL' },
        expect.anything()
      )
    );
    expect(within(dialog).getByRole('button', { name: 'Limpar filtros' })).toBeInTheDocument();
  });

  it('VIEWER não vê controles de operação, mas consulta o histórico sem excluir', async () => {
    const user = userEvent.setup();
    const viewerResponse = response({
      entries: [closedEntry({ canDelete: false, endedBy: ana })],
      effort: effort({ completedSeconds: HOUR, completedCount: 1 }),
      permissions: { canOperate: false, canModerate: false },
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
    });
    mockEntries(viewerResponse, viewerResponse);
    renderTracker();
    await screen.findByText('1 sessão registrada');
    expect(screen.queryByRole('button', { name: /Iniciar|Retomar|Pausar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lançar manualmente' })).toBeNull();

    const dialog = await openSessions(user);
    const list = await within(dialog).findByRole('list', { name: 'Sessões registradas' });
    expect(within(list).getByText('1h45min')).toBeInTheDocument();
    // Mesma pessoa iniciou e parou: sem o sufixo "parado por".
    expect(within(list).getByText(/Ana Ribeiro$/)).toBeInTheDocument();
    expect(within(list).queryByRole('button', { name: /^Excluir sessão/ })).toBeNull();
  });

  it('renders immutable edited/deleted events, filters by event and edits the current session', async () => {
    const user = userEvent.setup();
    const entry = closedEntry({
      source: 'MANUAL',
      durationSeconds: 10800,
      updatedAt: '2026-09-12T10:00:00.000Z',
      canEdit: true
    });
    mockEntries(
      response({ entries: [entry], effort: effort({ completedCount: 1, completedSeconds: 10800 }) })
    );
    apiMocks.getTaskEffortHistory.mockResolvedValue({
      items: [
        {
          id: 3,
          sessionId: 8,
          eventType: 'DELETED',
          source: 'MANUAL',
          previousSeconds: 14400,
          newSeconds: null,
          occurredAt: '2026-09-12T12:00:00Z',
          actor: ana,
          canDelete: false,
          canEdit: false
        },
        {
          id: 2,
          sessionId: 8,
          eventType: 'UPDATED',
          source: 'MANUAL',
          previousSeconds: 10800,
          newSeconds: 14400,
          occurredAt: '2026-09-12T11:00:00Z',
          actor: ana,
          canDelete: false,
          canEdit: false
        },
        {
          id: 1,
          sessionId: entry.id,
          eventType: 'CREATED',
          source: 'MANUAL',
          newSeconds: 10800,
          occurredAt: '2026-09-12T10:00:00Z',
          actor: ana,
          canEdit: true,
          canDelete: true,
          currentEntry: entry
        }
      ],
      pagination: { page: 1, total: 3, totalPages: 1 }
    });
    apiMocks.updateTaskTimeEntry.mockResolvedValue({
      entry: { ...entry, durationSeconds: 14400, updatedAt: '2026-09-12T12:01:00.000Z' },
      effort: effort({ completedCount: 1, completedSeconds: 14400, actualHours: 4 })
    });
    renderTracker();
    const dialog = await openSessions(user);
    expect(await within(dialog).findByText('3h → 4h')).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: 'Histórico de eventos' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Sessões atuais' })).toBeNull();
    expect(within(dialog).getByText('Entrada de 4h')).toBeVisible();
    expect(within(dialog).getAllByRole('button', { name: /^Excluir sessão/ })).toHaveLength(1);
    await user.selectOptions(within(dialog).getByLabelText('Evento'), 'DELETED');
    await user.click(within(dialog).getByRole('button', { name: 'Filtrar' }));
    await waitFor(() =>
      expect(apiMocks.getTaskEffortHistory).toHaveBeenLastCalledWith(
        42,
        { page: 1, limit: 10, eventType: 'DELETED' },
        expect.anything()
      )
    );
    const pencil = within(dialog).getByRole('button', { name: 'Editar sessão de 3h' });
    expect(pencil).toHaveTextContent('');
    pencil.focus();
    await user.keyboard('{Enter}');
    await user.clear(within(dialog).getByLabelText('Duração atual (horas)'));
    await user.type(within(dialog).getByLabelText('Duração atual (horas)'), '4');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar edição' }));
    await waitFor(() =>
      expect(apiMocks.updateTaskTimeEntry).toHaveBeenCalledWith(42, entry.id, {
        hours: '4',
        expectedUpdatedAt: entry.updatedAt
      })
    );
    expect(screen.getByLabelText('Tempo total registrado')).toHaveTextContent('04:00:00');
  });

  it('shows an identified pre-history snapshot in the same list without treating it as CREATED', async () => {
    const user = userEvent.setup();
    mockEntries(response());
    apiMocks.getTaskEffortHistory.mockResolvedValue({
      items: [
        {
          id: 'session:12',
          sessionId: 12,
          kind: 'LEGACY_SNAPSHOT',
          eventType: null,
          source: 'MANUAL',
          occurredAt: '2026-09-01T13:00:00Z',
          actor: ana,
          newSeconds: 14400,
          canEdit: false,
          canDelete: false
        }
      ],
      pagination: { page: 1, total: 1, totalPages: 1 }
    });
    renderTracker();
    const dialog = await openSessions(user);
    expect(await within(dialog).findByText(/Registro anterior ao histórico/)).toBeVisible();
    expect(within(dialog).getByText('Snapshot')).toBeVisible();
    expect(within(dialog).getByText('4h')).toBeVisible();
    expect(within(dialog).queryByText('Registrado', { selector: 'span' })).toBeNull();
    await user.selectOptions(within(dialog).getByLabelText('Origem'), 'MANUAL');
    await user.selectOptions(within(dialog).getByLabelText('Evento'), 'UPDATED');
    await user.click(within(dialog).getByRole('button', { name: 'Filtrar' }));
    await waitFor(() =>
      expect(apiMocks.getTaskEffortHistory).toHaveBeenLastCalledWith(
        42,
        { page: 1, limit: 10, source: 'MANUAL', eventType: 'UPDATED' },
        expect.anything()
      )
    );
  });

  it('em erro mantém a estimativa da tarefa visível e permite tentar novamente', async () => {
    const user = userEvent.setup();
    apiMocks.getTaskTimeEntries
      .mockRejectedValueOnce({
        response: { status: 409, data: { message: 'Falha ao carregar esforço.' } }
      })
      .mockResolvedValueOnce(
        response({ effort: effort({ completedSeconds: HOUR, completedCount: 1 }) })
      );
    renderTracker({ estimatedEffort: 8, actualEffort: 3 });

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao carregar esforço.');
    // A tarefa em mãos alimenta o widget enquanto a API falha.
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '38');
    expect(screen.getByText('3h de 8h estimadas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(apiMocks.getTaskTimeEntries).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: 'Retomar' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('1h de 8h estimadas')).toBeInTheDocument();
  });
});
