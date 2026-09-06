import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../src/shared/index.js';

const apiMocks = vi.hoisted(() => ({
  getTaskTimeEntries: vi.fn(),
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
  pagination: { limit: 20, hasMore: false },
  ...overrides
});

function renderTracker(props = {}) {
  return render(
    <ConfirmProvider>
      <TaskEffortTracker taskId={42} estimatedEffort={8} {...props} />
    </ConfirmProvider>
  );
}

const openHistory = (user) => user.click(screen.getByText('Ver sessões registradas'));

describe('TaskEffortTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getTaskTimeEntries.mockResolvedValue(response());
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
    expect(screen.getByText('Ver sessões registradas')).toBeInTheDocument();

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
    apiMocks.getTaskTimeEntries.mockResolvedValue(
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
    apiMocks.getTaskTimeEntries.mockResolvedValue(
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
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '134');
    expect(screen.getByText('134%')).toBeInTheDocument();
    unmount();

    apiMocks.getTaskTimeEntries.mockResolvedValue(
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
    apiMocks.getTaskTimeEntries.mockResolvedValue(
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
    const history = await screen.findByRole('list', { name: 'Sessões registradas' });
    expect(within(history).getByText('1h30min')).toBeInTheDocument();
    expect(within(history).getByText('manual')).toBeInTheDocument();
    expect(within(history).getByText('Esqueci de iniciar')).toBeInTheDocument();
    expect(within(history).getByText(/, \d{2}:\d{2} · Ana Ribeiro$/)).toBeInTheDocument();
    expect(screen.getByText('Ocultar sessões registradas')).toBeInTheDocument();
    expect(screen.queryByLabelText('Horas')).toBeNull();
    expect(onEffortChange).toHaveBeenCalledWith(
      expect.objectContaining({ actualHours: 1.5 }),
      'Lançamento manual registrado.'
    );
  });

  it('exclui sessão do histórico somente após confirmação e mostra quem iniciou e quem parou', async () => {
    const user = userEvent.setup();
    apiMocks.getTaskTimeEntries.mockResolvedValue(
      response({
        entries: [closedEntry()],
        effort: effort({ completedSeconds: HOUR + 45 * 60, completedCount: 1 })
      })
    );
    apiMocks.deleteTaskTimeEntry.mockResolvedValue({
      entry: closedEntry(),
      effort: effort({ completedSeconds: 0, completedCount: 0 })
    });
    renderTracker();
    await screen.findByText('1 sessão registrada');
    await openHistory(user);
    expect(
      screen.getByText(/\d{2}:\d{2} → \d{2}:\d{2} · Ana Ribeiro · parado por Bruno Lima$/)
    ).toBeInTheDocument();
    expect(screen.getByText('1h45min')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Excluir sessão' }));
    expect(
      await screen.findByRole('heading', { name: 'Excluir sessão de tempo' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(apiMocks.deleteTaskTimeEntry).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Excluir sessão' }));
    await user.click(await screen.findByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(apiMocks.deleteTaskTimeEntry).toHaveBeenCalledWith(42, 1));
    expect(await screen.findByText('Nenhuma sessão registrada.')).toBeInTheDocument();
  });

  it('VIEWER não vê controles de operação, mas consulta o histórico', async () => {
    const user = userEvent.setup();
    apiMocks.getTaskTimeEntries.mockResolvedValue(
      response({
        entries: [closedEntry({ canDelete: false, endedBy: ana })],
        effort: effort({ completedSeconds: HOUR, completedCount: 1 }),
        permissions: { canOperate: false, canModerate: false }
      })
    );
    renderTracker();
    await screen.findByText('1 sessão registrada');
    expect(screen.queryByRole('button', { name: /Iniciar|Retomar|Pausar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lançar manualmente' })).toBeNull();
    await openHistory(user);
    expect(screen.getByText('1h45min')).toBeInTheDocument();
    // Mesma pessoa iniciou e parou: sem o sufixo "parado por".
    expect(screen.getByText(/→ \d{2}:\d{2} · Ana Ribeiro$/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir sessão' })).toBeNull();
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
