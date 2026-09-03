import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  schedule: {
    getSchedule: vi.fn(),
    listSprints: vi.fn(),
    listMilestones: vi.fn(),
    getMembership: vi.fn()
  },
  projects: { get: vi.fn() }
}));

vi.mock('../../src/features/schedule/api/schedule.api.js', () => ({ scheduleApi: mocks.schedule }));
vi.mock('../../src/features/projects/index.js', () => ({
  projectsApi: mocks.projects,
  ProjectSectionNav: ({ activeSection }) => (
    <nav aria-label="Navegação do projeto" data-active={activeSection} />
  )
}));

const { ScheduleScreen } = await import('../../src/features/schedule/pages/ScheduleScreen.jsx');
const { ScheduleCalendar } =
  await import('../../src/features/schedule/components/ScheduleCalendar.jsx');

const TODAY = new Date(2026, 8, 10, 12, 0, 0);

const task = (overrides = {}) => ({
  id: 10,
  title: 'Login do usuário',
  status: 'A_FAZER',
  priority: 'ALTA',
  deadline: '2026-09-10T07:45:00',
  estimatedEffort: 3,
  ...overrides
});

const sprint = (overrides = {}) => ({
  id: 4,
  name: 'Sprint 04',
  objective: 'Integração GitHub',
  startDate: '2026-09-03T07:45:00',
  endDate: '2026-09-16T00:00:00',
  status: 'EM_ANDAMENTO',
  milestoneId: 20,
  durationInDays: 13,
  taskCount: 3,
  tasks: [
    task(),
    task({ id: 11, title: 'Callback GitHub', deadline: '2026-09-12T08:00:00' }),
    task({ id: 12, title: 'Refatorar autenticação', deadline: null, status: 'CONCLUIDO' })
  ],
  ...overrides
});

const milestone = (overrides = {}) => ({
  id: 20,
  title: 'Entrega final',
  description: null,
  dueDate: '2026-09-30T07:44:00',
  status: 'PENDENTE',
  overdue: false,
  ...overrides
});

const emptySchedule = {
  projectId: 1,
  range: { from: null, to: null },
  generatedAt: '2026-09-10T12:00:00.000Z',
  sprints: [],
  milestones: [],
  unassignedTasks: []
};

const populatedSchedule = {
  ...emptySchedule,
  sprints: [sprint()],
  milestones: [milestone()],
  unassignedTasks: [task({ id: 30, title: 'Documentar release', deadline: '2026-09-20T09:00:00' })]
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.projects.get.mockResolvedValue({ data: { project: { id: 1, name: 'TraceFlow' } } });
  mocks.schedule.getSchedule.mockResolvedValue({ data: populatedSchedule });
  mocks.schedule.listSprints.mockResolvedValue({
    data: { total: 1, sprints: populatedSchedule.sprints }
  });
  mocks.schedule.listMilestones.mockResolvedValue({
    data: { total: 1, milestones: populatedSchedule.milestones }
  });
  mocks.schedule.getMembership.mockResolvedValue({
    data: { currentMembership: { role: 'OWNER' } }
  });
});

function renderCalendar(schedule = populatedSchedule) {
  return render(<ScheduleCalendar schedule={schedule} hoje={TODAY} />);
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/projects/1/schedule']}>
      <Routes>
        <Route path="/projects/:projectId/schedule" element={<ScheduleScreen />} />
      </Routes>
    </MemoryRouter>
  );
}

function selectedDayPanel() {
  return screen.getByText('Dia selecionado').closest('section');
}

function monthPanel() {
  return screen.getByText('No mês exibido').closest('section');
}

describe('ScheduleCalendar — composição Hybrid C2', () => {
  it('renderiza resumo Agora, calendário, painéis laterais e próximos prazos', () => {
    renderCalendar();
    expect(screen.getByRole('heading', { name: 'Agora' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'setembro de 2026' })).toHaveLength(2);
    expect(screen.getByText('Dia selecionado')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Próximos prazos' })).toBeInTheDocument();
    expect(document.querySelector('.schedule-layout')).toBeInTheDocument();
    expect(document.querySelector('.schedule-side')).toBeInTheDocument();
  });

  it('resume Sprint atual com período, tarefas e pontos reais', () => {
    renderCalendar();
    const metric = screen.getByText('Sprint atual').closest('article');
    expect(within(metric).getByText('Sprint 04')).toBeInTheDocument();
    expect(within(metric).getByText('03/09 – 15/09')).toBeInTheDocument();
    expect(within(metric).getByText(/1 tarefa concluída de 3 · 3\/9 pts/)).toBeInTheDocument();
  });

  it('resume o próximo Marco sem derivar início temporal', () => {
    renderCalendar();
    const metric = screen.getByText('Próximo marco').closest('article');
    expect(within(metric).getByText('Entrega final')).toBeInTheDocument();
    expect(within(metric).getByText('Prazo 30/09/2026')).toBeInTheDocument();
    expect(within(metric).getByText('0 de 1 Sprint concluída')).toBeInTheDocument();
    expect(within(metric).queryByText(/início/i)).toBeNull();
  });

  it('usa Atenção apenas para itens já atrasados', () => {
    renderCalendar();
    const metric = screen.getByText('Atenção').closest('article');
    expect(within(metric).getByText('Em dia')).toBeInTheDocument();
    expect(
      within(metric).getByText('Próximo prazo: 10/09 · #10 Login do usuário')
    ).toBeInTheDocument();
  });

  it('mostra a ausência de Sprint atual e de próximos itens explicitamente', () => {
    renderCalendar(emptySchedule);
    const current = screen.getByText('Sprint atual').closest('article');
    expect(within(current).getByText('Nenhuma em andamento')).toBeInTheDocument();
    expect(screen.getByText('Nenhum prazo futuro.')).toBeInTheDocument();
  });

  it('mostra contagens e exemplo quando há itens atrasados', () => {
    renderCalendar({
      ...emptySchedule,
      milestones: [
        milestone({ dueDate: '2026-09-09T08:00:00', overdue: true, title: 'Release atrasada' })
      ],
      unassignedTasks: [task({ deadline: '2026-09-08T08:00:00' })]
    });
    const metric = screen.getByText('Atenção').closest('article');
    expect(within(metric).getByText('2 itens atrasados')).toBeInTheDocument();
    expect(within(metric).getByText('1 Marco · 1 tarefa')).toBeInTheDocument();
    expect(within(metric).getByText('Marco: Release atrasada')).toBeInTheDocument();
  });

  it('fornece legenda por forma e texto sem depender somente de cor', () => {
    renderCalendar();
    const legend = screen.getByRole('list', { name: 'Legenda do cronograma' });
    expect(within(legend).getByText('Sprint')).toBeInTheDocument();
    expect(within(legend).getByText('Prazo de Marco')).toBeInTheDocument();
    expect(within(legend).getByText('Prazo de tarefa')).toBeInTheDocument();
    expect(within(legend).getByText('Hoje')).toBeInTheDocument();
  });

  it.each([
    ['PLANEJADA', 'planejada'],
    ['EM_ANDAMENTO', 'em_andamento'],
    ['CONCLUIDA', 'concluida'],
    ['CANCELADA', 'cancelada']
  ])('representa a Sprint %s como faixa com estado textual correspondente', (status, classKey) => {
    renderCalendar({
      ...emptySchedule,
      sprints: [sprint({ status })],
      milestones: [milestone()]
    });
    expect(
      document.querySelector(`.schedule-day__sprint-range.schedule-status--${classKey}`)
    ).toBeInTheDocument();
    expect(
      within(monthPanel()).getByText(
        {
          PLANEJADA: 'Planejada',
          EM_ANDAMENTO: 'Em andamento',
          CONCLUIDA: 'Concluída',
          CANCELADA: 'Cancelada'
        }[status]
      )
    ).toBeInTheDocument();
  });
});

describe('ScheduleCalendar — calendário e seleção', () => {
  it('renderiza 42 dias selecionáveis sem role grid incompleto', () => {
    renderCalendar();
    expect(document.querySelectorAll('.schedule-day')).toHaveLength(42);
    expect(screen.queryByRole('grid')).toBeNull();
  });

  it('nomeia o dia com data, evento de tarefa e contexto ativo', () => {
    renderCalendar();
    expect(
      screen.getByRole('button', {
        name: /quinta-feira, 10 de setembro — 1 prazo de tarefa, 1 sprint ativa no dia/
      })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('distingue visualmente hoje e seleção', () => {
    renderCalendar();
    const today = screen.getByRole('button', { name: /quinta-feira, 10 de setembro/ });
    expect(today).toHaveClass('schedule-day--today', 'schedule-day--selected');
  });

  it('atualiza eventos e contexto ao selecionar outro dia', async () => {
    const user = userEvent.setup();
    renderCalendar();
    await user.click(screen.getByRole('button', { name: /sábado, 12 de setembro/ }));
    expect(screen.getByRole('button', { name: /sábado, 12 de setembro/ })).toHaveFocus();
    const panel = selectedDayPanel();
    expect(
      within(panel).getByRole('heading', { name: 'sábado, 12 de setembro' })
    ).toBeInTheDocument();
    expect(within(panel).getByText('#11 Callback GitHub')).toBeInTheDocument();
    expect(within(panel).getByText('Sprint 04')).toBeInTheDocument();
  });

  it('separa início de Sprint dos contextos do dia', async () => {
    const user = userEvent.setup();
    renderCalendar();
    await user.click(screen.getByRole('button', { name: /quinta-feira, 3 de setembro/ }));
    const panel = selectedDayPanel();
    expect(within(panel).getByText('Sprint 04 começa')).toBeInTheDocument();
    expect(within(panel).getByText('Sprint ativa neste dia')).toBeInTheDocument();
  });

  it('mostra o encerramento da Sprint como evento distinto', async () => {
    const user = userEvent.setup();
    renderCalendar();
    await user.click(screen.getByRole('button', { name: /terça-feira, 15 de setembro/ }));
    expect(within(selectedDayPanel()).getByText('Sprint 04 termina')).toBeInTheDocument();
  });

  it('mostra Marco somente no dia de seu prazo', async () => {
    const user = userEvent.setup();
    renderCalendar();
    expect(within(selectedDayPanel()).queryByText('Prazo de Entrega final')).toBeNull();
    await user.click(screen.getByRole('button', { name: /quarta-feira, 30 de setembro/ }));
    expect(within(selectedDayPanel()).getByText('Prazo de Entrega final')).toBeInTheDocument();
  });

  it('não lista uma tarefa arbitrária só porque pertence à Sprint ativa', async () => {
    const user = userEvent.setup();
    renderCalendar();
    await user.click(screen.getByRole('button', { name: /sexta-feira, 11 de setembro/ }));
    const panel = selectedDayPanel();
    expect(within(panel).getByText('Nenhum evento com data neste dia.')).toBeInTheDocument();
    expect(within(panel).getByText('Sprint 04')).toBeInTheDocument();
    expect(within(panel).queryByText('#12 Refatorar autenticação')).toBeNull();
  });

  it('diz que não há Sprint ativa sem negar a ausência de eventos', async () => {
    const user = userEvent.setup();
    renderCalendar();
    await user.click(screen.getByRole('button', { name: /domingo, 20 de setembro/ }));
    const panel = selectedDayPanel();
    expect(within(panel).getByText('#30 Documentar release')).toBeInTheDocument();
    expect(within(panel).getByText('Nenhuma Sprint ativa neste dia.')).toBeInTheDocument();
  });

  it('agrupa visualmente várias tarefas do mesmo dia em um contador', () => {
    renderCalendar({
      ...populatedSchedule,
      unassignedTasks: [task({ id: 30, title: 'Release A' }), task({ id: 31, title: 'Release B' })]
    });
    const day = screen.getByRole('button', {
      name: /quinta-feira, 10 de setembro — 3 prazos de tarefas/
    });
    expect(day.querySelector('.schedule-day__task-marker b')).toHaveTextContent('3');
  });

  it('navega para o mês anterior e seguinte sem limites artificiais', async () => {
    const user = userEvent.setup();
    renderCalendar();
    await user.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(screen.getAllByRole('heading', { name: 'agosto de 2026' })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }));
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(screen.getAllByRole('heading', { name: 'outubro de 2026' })).toHaveLength(2);
  });

  it('Hoje retorna ao mês e ao dia atuais', async () => {
    const user = userEvent.setup();
    renderCalendar();
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }));
    await user.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(screen.getAllByRole('heading', { name: 'setembro de 2026' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: /quinta-feira, 10 de setembro/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});

describe('ScheduleCalendar — painel do mês', () => {
  it('resume Marcos, Sprints e tarefas como entidades', () => {
    renderCalendar();
    const panel = monthPanel();
    expect(within(panel).getByText('1 Marco · 1 Sprint · 3 tarefas')).toBeInTheDocument();
    expect(within(panel).getByText('Entrega final')).toBeInTheDocument();
    expect(within(panel).getByText('Sprint 04')).toBeInTheDocument();
    expect(within(panel).getByText('#10 Login do usuário')).toBeInTheDocument();
  });

  it('usa buttons com aria-pressed e não tabs para os filtros', () => {
    renderCalendar();
    const panel = monthPanel();
    expect(within(panel).queryByRole('tab')).toBeNull();
    expect(within(panel).getByRole('button', { name: 'Todos 5' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it.each([
    ['Marcos 1', 'Entrega final', 'Sprint 04'],
    ['Sprints 1', 'Sprint 04', 'Entrega final'],
    ['Tarefas 3', '#10 Login do usuário', 'Sprint 04']
  ])('filtra por %s e mantém somente o tipo escolhido', async (filter, present, absent) => {
    const user = userEvent.setup();
    renderCalendar();
    const panel = monthPanel();
    await user.click(within(panel).getByRole('button', { name: filter }));
    expect(within(panel).getByText(present)).toBeInTheDocument();
    expect(within(panel).queryByText(absent)).toBeNull();
  });

  it('restaura a lista completa pelo filtro Todos', async () => {
    const user = userEvent.setup();
    renderCalendar();
    const panel = monthPanel();
    await user.click(within(panel).getByRole('button', { name: 'Marcos 1' }));
    await user.click(within(panel).getByRole('button', { name: 'Todos 5' }));
    expect(within(panel).getByText('Sprint 04')).toBeInTheDocument();
    expect(within(panel).getByText('#30 Documentar release')).toBeInTheDocument();
  });

  it('mostra empty específico para o tipo filtrado', async () => {
    const user = userEvent.setup();
    renderCalendar({ ...emptySchedule, sprints: [sprint({ milestoneId: null })] });
    const panel = monthPanel();
    await user.click(within(panel).getByRole('button', { name: 'Marcos 0' }));
    expect(within(panel).getByText('Nenhum Marco com prazo neste mês.')).toBeInTheDocument();
  });

  it('mantém o filtro escolhido ao navegar entre meses', async () => {
    const user = userEvent.setup();
    renderCalendar();
    const panel = monthPanel();
    await user.click(within(panel).getByRole('button', { name: 'Tarefas 3' }));
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(within(panel).getByRole('button', { name: 'Tarefas 0' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(within(panel).getByText('Nenhuma Tarefa com prazo neste mês.')).toBeInTheDocument();
  });

  it('seleciona a data de um item mensal pelo próprio item', async () => {
    const user = userEvent.setup();
    renderCalendar();
    await user.click(within(monthPanel()).getByRole('button', { name: /^Entrega final/ }));
    expect(
      within(selectedDayPanel()).getByRole('heading', { name: 'quarta-feira, 30 de setembro' })
    ).toBeInTheDocument();
  });
});

describe('ScheduleCalendar — próximos prazos', () => {
  it('lista tarefa, fim de Sprint e Marco em ordem cronológica', () => {
    renderCalendar();
    const section = screen.getByRole('heading', { name: 'Próximos prazos' }).closest('section');
    const items = within(section).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('#10 Login do usuário'),
      expect.stringContaining('#11 Callback GitHub'),
      expect.stringContaining('Sprint 04'),
      expect.stringContaining('#30 Documentar release'),
      expect.stringContaining('Entrega final')
    ]);
  });

  it('não inclui início de Sprint ou início artificial de Marco', () => {
    renderCalendar();
    const section = screen.getByRole('heading', { name: 'Próximos prazos' }).closest('section');
    expect(within(section).queryByText(/começa|início/i)).toBeNull();
  });

  it('limita a lista a cinco prazos', () => {
    renderCalendar({
      ...emptySchedule,
      unassignedTasks: Array.from({ length: 8 }, (_, index) =>
        task({
          id: index + 1,
          title: `Tarefa ${index + 1}`,
          deadline: `2026-09-${String(index + 10).padStart(2, '0')}T08:00:00`
        })
      )
    });
    const section = screen.getByRole('heading', { name: 'Próximos prazos' }).closest('section');
    expect(within(section).getAllByRole('listitem')).toHaveLength(5);
  });

  it('não produz warning de chave duplicada com eventos no mesmo dia', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderCalendar({
      ...emptySchedule,
      sprints: [sprint({ endDate: '2026-09-03T18:00:00' })],
      milestones: [milestone({ dueDate: '2026-09-03T18:00:00' })],
      unassignedTasks: [task({ deadline: '2026-09-03T18:00:00' })]
    });
    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/same key|unique "key"/i);
    expect(consoleWarn.mock.calls.flat().join(' ')).not.toMatch(/same key|unique "key"/i);
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });
});

describe('ScheduleScreen — estados e integração', () => {
  it('exibe loading canônico durante a carga inicial', () => {
    mocks.projects.get.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByText('Carregando cronograma...')).toBeInTheDocument();
  });

  it('exibe forbidden canônico para acesso negado', async () => {
    mocks.projects.get.mockRejectedValue({ response: { status: 403, data: {} } });
    renderScreen();
    expect(await screen.findByRole('heading', { name: 'Acesso restrito' })).toBeInTheDocument();
  });

  it('exibe erro fatal com retry', async () => {
    mocks.projects.get.mockRejectedValue({ response: { status: 500, data: {} } });
    renderScreen();
    expect(await screen.findByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('usa header de Planejamento e mantém Cronograma ativo', async () => {
    renderScreen();
    expect(
      await screen.findByRole('heading', { name: 'Cronograma — TraceFlow' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Visualize períodos de Sprints, prazos de Marcos e deadlines de tarefas em uma única linha temporal operacional.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navegação do projeto' })).toHaveAttribute(
      'data-active',
      'schedule'
    );
  });

  it('carrega o dataset canônico uma única vez e filtra meses no cliente', async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole('heading', { name: 'Agora' });
    expect(mocks.schedule.getSchedule).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }));
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(mocks.schedule.getSchedule).toHaveBeenCalledTimes(1);
  });

  it('não envia recorte de mês nem cria request por célula ou hover', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Agora' });
    expect(mocks.schedule.getSchedule).toHaveBeenCalledWith(
      '1',
      {},
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(mocks.schedule.getSchedule).toHaveBeenCalledTimes(1);
  });
});
