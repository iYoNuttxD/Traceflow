import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  schedule: {
    getSchedule: vi.fn(),
    listSprints: vi.fn(),
    listMilestones: vi.fn(),
    createSprint: vi.fn(),
    updateSprint: vi.fn(),
    updateSprintStatus: vi.fn(),
    listSprintTasks: vi.fn(),
    replaceSprintTasks: vi.fn(),
    listProjectTasks: vi.fn(),
    getMembership: vi.fn(),
    getSprintProgress: vi.fn(),
    refreshMilestones: vi.fn()
  },
  projects: { get: vi.fn() }
}));

vi.mock('../../src/features/schedule/api/schedule.api.js', () => ({ scheduleApi: mocks.schedule }));
vi.mock('../../src/features/projects/index.js', () => ({
  projectsApi: mocks.projects,
  ProjectSectionNav: ({ activeSection }) => (
    <nav aria-label="Navegação do projeto">Seção ativa: {activeSection}</nav>
  )
}));

const { SprintsScreen } = await import('../../src/features/schedule/pages/SprintsScreen.jsx');
const { ConfirmProvider } = await import('../../src/shared/index.js');

const planned = {
  id: 1,
  name: 'Sprint Planejada',
  objective: 'Preparar autenticação',
  startDate: '2026-10-01T09:00:00.000Z',
  endDate: '2026-10-12T18:00:00.000Z',
  status: 'PLANEJADA',
  milestoneId: 10
};
const active = {
  id: 2,
  name: 'Sprint Ativa',
  objective: 'Integração GitHub com todos os fluxos necessários para a entrega',
  startDate: '2026-09-01T09:00:00.000Z',
  endDate: '2026-12-31T18:00:00.000Z',
  status: 'EM_ANDAMENTO',
  milestoneId: 20
};
const completed = {
  id: 3,
  name: 'Sprint Concluída',
  objective: null,
  startDate: '2026-08-01T09:00:00.000Z',
  endDate: '2026-08-12T18:00:00.000Z',
  status: 'CONCLUIDA',
  milestoneId: 10
};
const cancelled = {
  id: 4,
  name: 'Sprint Cancelada',
  objective: null,
  startDate: '2026-07-01T09:00:00.000Z',
  endDate: '2026-07-12T18:00:00.000Z',
  status: 'CANCELADA',
  milestoneId: null
};
const tasks = [
  {
    id: 11,
    title: 'Login do usuário',
    status: 'CONCLUIDO',
    priority: 'ALTA',
    estimatedEffort: 4,
    sprintId: 2,
    addedAfterStart: false
  },
  {
    id: 12,
    title: 'Callback GitHub',
    status: 'A_FAZER',
    priority: 'MEDIA',
    estimatedEffort: 2,
    sprintId: 2,
    addedAfterStart: true
  }
];
const milestones = [
  { id: 10, title: 'Entrega inicial' },
  { id: 20, title: 'Entrega final' }
];
const baseProgress = {
  sprintId: 2,
  frozen: false,
  baseline: { kind: 'STARTED_AT', at: '2026-09-01T09:00:00.000Z' },
  cutoff: '2026-09-03T12:00:00.000Z',
  planned: { numerator: 1, denominator: 1, percentage: 100, hasData: true },
  current: { numerator: 1, denominator: 2, percentage: 50, hasData: true },
  scopeChange: {
    added: [{ taskId: 12, at: '2026-09-02T10:00:00.000Z', fromSprintId: null }],
    removed: [
      {
        taskId: 13,
        at: '2026-09-02T11:00:00.000Z',
        toSprintId: 1,
        reason: 'MOVIDA',
        exitStatus: 'A_FAZER'
      }
    ]
  },
  carryOver: [],
  burndown: { hasData: false }
};

function scheduleSprint(sprint, sprintTasks = []) {
  return { ...sprint, durationInDays: 12, taskCount: sprintTasks.length, tasks: sprintTasks };
}

function setPlanning(sprints = [], scheduleSprints) {
  mocks.schedule.listSprints.mockResolvedValue({ data: { total: sprints.length, sprints } });
  mocks.schedule.getSchedule.mockResolvedValue({
    data: {
      projectId: 1,
      range: { from: null, to: null },
      generatedAt: '2026-09-03T12:00:00.000Z',
      sprints: scheduleSprints ?? sprints.map((sprint) => scheduleSprint(sprint)),
      milestones,
      unassignedTasks: []
    }
  });
}

function renderScreen(initialEntry = '/projects/1/sprints') {
  return render(
    <ConfirmProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/projects/:projectId/sprints" element={<SprintsScreen />} />
          <Route path="/projects/:projectId/kanban" element={<p>Quadro do projeto</p>} />
        </Routes>
      </MemoryRouter>
    </ConfirmProvider>
  );
}

function card(name) {
  return screen.getByRole('heading', { name, level: 3 }).closest('article');
}

async function openMenu(user, name) {
  await user.click(screen.getByRole('button', { name: `Mais ações da sprint ${name}` }));
  return screen.getByRole('menu', { name: `Ações da sprint ${name}` });
}

async function expandFilters(user) {
  const toggle = await screen.findByRole('button', { name: /Buscar e filtrar/ });
  if (toggle.getAttribute('aria-expanded') === 'false') await user.click(toggle);
  return toggle;
}

async function chooseMilestone(user, name = 'Entrega inicial') {
  const dialog = screen.getByRole('dialog');
  const input = within(dialog).getByRole('combobox', { name: 'Marco' });
  await user.type(input, name.slice(0, 3));
  await user.click(await within(dialog).findByRole('option', { name }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.projects.get.mockResolvedValue({ data: { project: { id: 1, name: 'TRACEFLOW QA' } } });
  mocks.schedule.listMilestones.mockResolvedValue({ data: { total: 2, milestones } });
  mocks.schedule.getMembership.mockResolvedValue({
    data: { currentMembership: { id: 7, role: 'OWNER' } }
  });
  mocks.schedule.listProjectTasks.mockResolvedValue({ data: { total: tasks.length, tasks } });
  mocks.schedule.listSprintTasks.mockResolvedValue({ data: { total: tasks.length, tasks } });
  mocks.schedule.getSprintProgress.mockResolvedValue({ data: baseProgress });
  mocks.schedule.replaceSprintTasks.mockResolvedValue({ data: { tasks } });
  setPlanning([]);
});

describe('estrutura C2 e estados principais', () => {
  it('exibe loading, forbidden e erro recuperável pelos estados canônicos', async () => {
    mocks.projects.get.mockReturnValueOnce(new Promise(() => {}));
    const loadingView = renderScreen();
    expect(screen.getByText('Carregando sprints...')).toBeInTheDocument();
    loadingView.unmount();

    mocks.projects.get.mockRejectedValueOnce({ response: { status: 403, data: {} } });
    const forbiddenView = renderScreen();
    expect(await screen.findByRole('heading', { name: 'Acesso restrito' })).toBeInTheDocument();
    forbiddenView.unmount();

    mocks.projects.get.mockRejectedValueOnce({ response: { status: 500, data: {} } });
    renderScreen();
    expect(await screen.findByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('preserva header e navegação e remove o formulário permanente', async () => {
    renderScreen();
    expect(await screen.findByRole('heading', { name: 'Sprints' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /TRACEFLOW QA/ })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Navegação do projeto' })).toHaveTextContent(
      'sprints'
    );
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova sprint' })).toBeInTheDocument();
  });

  it('mantém Nova sprint como o primeiro item do grid e único empty state acionável', async () => {
    renderScreen();
    const grid = await screen.findByRole('list', { name: 'Sprints do projeto' });
    expect(within(grid).getAllByRole('listitem')).toHaveLength(1);
    expect(within(grid).getAllByRole('listitem')[0]).toContainElement(
      within(grid).getByRole('button', { name: 'Nova sprint' })
    );
    expect(screen.queryByText('Nenhuma sprint cadastrada.')).not.toBeInTheDocument();
    expect(mocks.schedule.listProjectTasks).not.toHaveBeenCalled();
  });

  it('resume statuses reais e destaca a sprint em andamento com tarefas e pontos', async () => {
    setPlanning(
      [planned, active, completed, cancelled],
      [
        scheduleSprint(planned),
        scheduleSprint(active, tasks),
        scheduleSprint(completed),
        scheduleSprint(cancelled)
      ]
    );
    renderScreen();
    const summary = await screen.findByRole('region', { name: 'Visão geral das sprints' });
    expect(summary).toHaveTextContent('Total4sprints');
    expect(summary).toHaveTextContent('Planejadas1');
    expect(summary).toHaveTextContent('Em andamentoSprint Ativa');
    expect(summary).toHaveTextContent('2 tarefas · 6 pts');
    expect(summary).toHaveTextContent('Concluídas1');
    expect(summary).toHaveTextContent('Canceladas1');
  });

  it('mostra no card estado, objetivo, período, marco, tarefas e progresso por pontos', async () => {
    setPlanning([active], [scheduleSprint(active, tasks)]);
    renderScreen();
    await screen.findByRole('heading', { name: 'Sprint Ativa' });
    const activeCard = card('Sprint Ativa');
    expect(activeCard).toHaveTextContent('Em andamento');
    expect(activeCard).toHaveTextContent('Integração GitHub');
    expect(activeCard).toHaveTextContent('01/09 – 31/12 · 12 dias');
    expect(activeCard).toHaveTextContent('Entrega final');
    expect(activeCard).toHaveTextContent('2 tarefas');
    expect(activeCard).toHaveTextContent('1 concluída');
    expect(activeCard).toHaveTextContent('6 pts');
    expect(within(activeCard).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '67');
    expect(within(activeCard).getAllByRole('button')).toHaveLength(3);
  });

  it('não expõe mutações para VIEWER, mas mantém tarefas, evolução e Kanban', async () => {
    mocks.schedule.getMembership.mockResolvedValue({
      data: { currentMembership: { id: 8, role: 'VIEWER' } }
    });
    setPlanning([planned]);
    renderScreen();
    expect(await screen.findByRole('heading', { name: 'Sprint Planejada' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova sprint' })).not.toBeInTheDocument();
    await openMenu(userEvent.setup(), 'Sprint Planejada');
    expect(
      screen.queryByRole('menuitem', { name: /Editar|Iniciar|Cancelar/ })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Kanban/ })).toBeInTheDocument();
  });
});

describe('busca e filtros', () => {
  beforeEach(() => {
    setPlanning(
      [planned, active, completed],
      [scheduleSprint(planned), scheduleSprint(active, tasks), scheduleSprint(completed)]
    );
  });

  it('inicia recolhido, preserva filtros e informa a contagem ativa ao alternar', async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole('heading', { name: 'Sprint Ativa' });
    const toggle = screen.getByRole('button', { name: /Buscar e filtrar/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByPlaceholderText('Pesquisar sprint...')).toBeNull();

    await user.click(toggle);
    await user.type(screen.getByPlaceholderText('Pesquisar sprint...'), 'ativa');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAccessibleName(/1 filtro ativo/);

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
    expect(screen.queryByPlaceholderText('Pesquisar sprint...')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Sprint Ativa' })).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByPlaceholderText('Pesquisar sprint...')).toHaveValue('ativa');
  });

  it('fecha o autocomplete ao recolher e devolve o foco ao toggle', async () => {
    const user = userEvent.setup();
    renderScreen();
    const toggle = await expandFilters(user);
    await user.type(screen.getByRole('combobox', { name: 'Marco' }), 'ent');
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    await user.click(toggle);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(toggle).toHaveFocus();
  });

  it('filtra por nome/objetivo e status, mostra result count e limpa tudo', async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole('heading', { name: 'Sprint Ativa' });
    await expandFilters(user);

    await user.type(screen.getByPlaceholderText('Pesquisar sprint...'), 'autenticação');
    expect(screen.getByRole('heading', { name: 'Sprint Planejada' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sprint Ativa' })).not.toBeInTheDocument();
    expect(screen.getByText('1 de 3 sprints')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Status'), 'EM_ANDAMENTO');
    expect(screen.queryByRole('heading', { name: 'Sprint Planejada' })).not.toBeInTheDocument();
    expect(screen.getByText('Nenhuma sprint corresponde aos filtros.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova sprint' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.getAllByText('3 sprints').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Sprint Ativa' })).toBeInTheDocument();
  });

  it('filtra por marco com combobox sem renderizar catálogo gigante vazio', async () => {
    const user = userEvent.setup();
    renderScreen();
    await expandFilters(user);
    const input = await screen.findByRole('combobox', { name: 'Marco' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.type(input, 'fin');
    await user.click(await screen.findByRole('option', { name: 'Entrega final' }));
    expect(screen.getByRole('heading', { name: 'Sprint Ativa' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sprint Planejada' })).not.toBeInTheDocument();
  });

  it('filtra por período usando a interseção simples das datas', async () => {
    const user = userEvent.setup();
    renderScreen();
    await expandFilters(user);
    await user.type(await screen.findByLabelText('Data inicial'), '2026-09-15');
    await user.type(screen.getByLabelText('Data final'), '2026-09-30');
    expect(screen.getByRole('heading', { name: 'Sprint Ativa' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sprint Planejada' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sprint Concluída' })).not.toBeInTheDocument();
  });

  it('pesquisa tarefa no endpoint existente e filtra pela associação já carregada', async () => {
    const user = userEvent.setup();
    renderScreen();
    await expandFilters(user);
    await user.type(await screen.findByRole('combobox', { name: 'Tarefa relacionada' }), 'login');
    await user.click(await screen.findByRole('option', { name: /#11 Login do usuário/ }));
    expect(mocks.schedule.listProjectTasks).toHaveBeenCalledWith(
      '1',
      { search: 'login' },
      { signal: expect.any(AbortSignal) }
    );
    expect(screen.getByRole('heading', { name: 'Sprint Ativa' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sprint Planejada' })).not.toBeInTheDocument();
  });
});

describe('criação e edição em dialog', () => {
  it('abre modal acessível, foca Nome e devolve foco ao card no Escape', async () => {
    const user = userEvent.setup();
    renderScreen();
    const trigger = await screen.findByRole('button', { name: 'Nova sprint' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Criar sprint' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await waitFor(() => expect(within(dialog).getByLabelText(/^Nome/)).toHaveFocus());

    const closeButton = within(dialog).getByRole('button', { name: 'Fechar criar sprint' });
    closeButton.focus();
    await user.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'Criar sprint' })).toHaveFocus();
    await user.tab();
    expect(closeButton).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Criar sprint' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('valida campos obrigatórios e foca o primeiro inválido', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Nova sprint' }));
    await user.click(screen.getByRole('button', { name: 'Criar sprint' }));
    expect(screen.getByText('Informe o nome da sprint.')).toBeInTheDocument();
    expect(screen.getByText('Selecione o marco da sprint.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nome/)).toHaveFocus();
    expect(mocks.schedule.createSprint).not.toHaveBeenCalled();
  });

  it('pesquisa Marco e tarefas dinamicamente e mantém a seleção explícita', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Nova sprint' }));
    await chooseMilestone(user);
    expect(screen.getByText('Entrega inicial')).toBeInTheDocument();

    await user.type(screen.getByRole('combobox', { name: 'Pesquisar tarefas' }), 'login');
    await user.click(await screen.findByRole('option', { name: /#11 Login do usuário/ }));
    expect(screen.getByText('Tarefas selecionadas (1)')).toBeInTheDocument();
    expect(screen.getByText('#11 Login do usuário')).toBeInTheDocument();
    expect(mocks.schedule.listProjectTasks).toHaveBeenCalledTimes(1);
  });

  it('cria, associa tarefas, fecha o modal, atualiza o grid e retorna o foco', async () => {
    const user = userEvent.setup();
    const created = {
      id: 8,
      name: 'Sprint Nova',
      objective: 'Entregar login',
      startDate: '2027-01-01T12:00:00.000Z',
      endDate: '2027-01-12T21:00:00.000Z',
      status: 'PLANEJADA',
      milestoneId: 10
    };
    mocks.schedule.createSprint.mockResolvedValue({ data: { sprint: created } });
    mocks.schedule.listSprints
      .mockResolvedValueOnce({ data: { total: 0, sprints: [] } })
      .mockResolvedValue({ data: { total: 1, sprints: [created] } });
    renderScreen();
    const trigger = await screen.findByRole('button', { name: 'Nova sprint' });
    await user.click(trigger);
    await user.type(screen.getByLabelText(/^Nome/), 'Sprint Nova');
    await user.type(screen.getByLabelText('Objetivo'), 'Entregar login');
    await chooseMilestone(user);
    await user.type(screen.getByLabelText(/^Início/), '2027-01-01T09:00');
    await user.type(screen.getByLabelText(/^Fim/), '2027-01-12T18:00');
    await user.type(screen.getByRole('combobox', { name: 'Pesquisar tarefas' }), 'login');
    await user.click(await screen.findByRole('option', { name: /#11 Login do usuário/ }));
    await user.click(screen.getByRole('button', { name: 'Criar sprint' }));

    await waitFor(() =>
      expect(mocks.schedule.createSprint).toHaveBeenCalledWith('1', {
        name: 'Sprint Nova',
        objective: 'Entregar login',
        startDate: expect.any(String),
        endDate: expect.any(String),
        milestoneId: 10
      })
    );
    expect(mocks.schedule.replaceSprintTasks).toHaveBeenCalledWith(8, [11]);
    expect(screen.queryByRole('dialog', { name: 'Criar sprint' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sprint Nova' })).toBeInTheDocument();
    expect(await screen.findByText('Sprint criada com sucesso.')).toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('mantém o modal aberto e exibe o erro seguro da API', async () => {
    const user = userEvent.setup();
    mocks.schedule.createSprint.mockRejectedValue({
      response: { status: 409, data: { message: 'O período conflita com outra sprint.' } }
    });
    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Nova sprint' }));
    await user.type(screen.getByLabelText(/^Nome/), 'Sprint conflito');
    await chooseMilestone(user);
    await user.type(screen.getByLabelText(/^Início/), '2027-01-01T09:00');
    await user.type(screen.getByLabelText(/^Fim/), '2027-01-12T18:00');
    await user.click(screen.getByRole('button', { name: 'Criar sprint' }));
    expect(await screen.findByText('O período conflita com outra sprint.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Criar sprint' })).toBeInTheDocument();
  });

  it('não transforma criação confirmada em falha quando o refresh falha', async () => {
    const user = userEvent.setup();
    const created = { ...planned, id: 8, name: 'Sprint salva' };
    mocks.schedule.createSprint.mockResolvedValue({ data: { sprint: created } });
    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Nova sprint' }));
    await user.type(screen.getByLabelText(/^Nome/), 'Sprint salva');
    await chooseMilestone(user);
    await user.type(screen.getByLabelText(/^Início/), '2027-01-01T09:00');
    await user.type(screen.getByLabelText(/^Fim/), '2027-01-12T18:00');
    mocks.schedule.listSprints.mockRejectedValueOnce(new Error('rede'));
    await user.click(screen.getByRole('button', { name: 'Criar sprint' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /ação foi concluída.*dados exibidos/i
    );
    expect(screen.queryByText('Não foi possível salvar a sprint.')).not.toBeInTheDocument();
    expect(mocks.schedule.createSprint).toHaveBeenCalledTimes(1);
  });

  it('declara sucesso parcial quando a sprint salva mas a associação falha', async () => {
    const user = userEvent.setup();
    mocks.schedule.createSprint.mockResolvedValue({ data: { sprint: { ...planned, id: 9 } } });
    mocks.schedule.replaceSprintTasks.mockRejectedValue({ response: { status: 409, data: {} } });
    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Nova sprint' }));
    await user.type(screen.getByLabelText(/^Nome/), 'Sprint Planejada');
    await chooseMilestone(user);
    await user.type(screen.getByLabelText(/^Início/), '2027-02-01T09:00');
    await user.type(screen.getByLabelText(/^Fim/), '2027-02-12T18:00');
    await user.type(screen.getByRole('combobox', { name: 'Pesquisar tarefas' }), 'login');
    await user.click(await screen.findByRole('option', { name: /#11 Login do usuário/ }));
    await user.click(screen.getByRole('button', { name: 'Criar sprint' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Sprint salva.*tarefas/i);
    expect(screen.queryByText('Não foi possível salvar a sprint.')).not.toBeInTheDocument();
  });

  it('edita apenas sprint aberta e preserva tarefas quando a seleção não muda', async () => {
    const user = userEvent.setup();
    setPlanning(
      [planned, completed],
      [scheduleSprint(planned, [tasks[0]]), scheduleSprint(completed)]
    );
    mocks.schedule.updateSprint.mockResolvedValue({
      data: { sprint: { ...planned, name: 'Planejada 2' } }
    });
    renderScreen();
    await screen.findByRole('heading', { name: 'Sprint Planejada' });
    const menu = await openMenu(user, 'Sprint Planejada');
    await user.click(
      within(menu).getByRole('menuitem', { name: 'Editar a sprint Sprint Planejada' })
    );
    expect(screen.getByRole('dialog', { name: 'Editar sprint' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nome/)).toHaveValue('Sprint Planejada');
    expect(screen.getByText('Tarefas selecionadas (1)')).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Nome/));
    await user.type(screen.getByLabelText(/^Nome/), 'Planejada 2');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(mocks.schedule.updateSprint).toHaveBeenCalled());
    expect(mocks.schedule.replaceSprintTasks).not.toHaveBeenCalled();

    await openMenu(user, 'Sprint Concluída');
    expect(screen.queryByRole('menuitem', { name: /Editar a sprint Sprint Concluída/ })).toBeNull();
  });
});

describe('modal de tarefas e escopo histórico', () => {
  beforeEach(() => setPlanning([active], [scheduleSprint(active, tasks)]));

  it('separa escopo planejado, adicionado e removido quando o contrato fornece histórico', async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole('heading', { name: 'Sprint Ativa' });
    await user.click(within(card('Sprint Ativa')).getByRole('button', { name: 'Tarefas' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tarefas da Sprint Ativa' });
    expect(within(dialog).getByText('Escopo planejado')).toBeInTheDocument();
    expect(within(dialog).getAllByText('#11 Login do usuário').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Adicionadas durante a sprint')).toBeInTheDocument();
    expect(within(dialog).getAllByText('#12 Callback GitHub').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Removidas após o planejamento')).toBeInTheDocument();
    expect(within(dialog).getByText('#13')).toBeInTheDocument();
    expect(
      within(dialog).getByText(/contrato histórico atual fornece o identificador/)
    ).toBeInTheDocument();
  });

  it('permite pesquisa múltipla, avisa sobre movimento e salva IDs', async () => {
    const user = userEvent.setup();
    const otherTask = {
      id: 30,
      title: 'Vinda de outra sprint',
      status: 'A_FAZER',
      priority: 'ALTA',
      estimatedEffort: 3,
      sprintId: 1
    };
    mocks.schedule.listProjectTasks.mockResolvedValue({ data: { tasks: [otherTask] } });
    setPlanning([planned, active], [scheduleSprint(planned), scheduleSprint(active, tasks)]);
    renderScreen();
    await screen.findByRole('heading', { name: 'Sprint Ativa' });
    await user.click(within(card('Sprint Ativa')).getByRole('button', { name: 'Tarefas' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tarefas da Sprint Ativa' });
    await user.type(within(dialog).getByRole('combobox', { name: 'Pesquisar tarefas' }), 'outra');
    await user.click(
      await within(dialog).findByRole('option', { name: /#30 Vinda de outra sprint/ })
    );
    expect(within(dialog).getByText(/Será movida de Sprint Planejada/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Salvar tarefas da sprint' }));
    expect(mocks.schedule.replaceSprintTasks).toHaveBeenCalledWith(2, [11, 12, 30]);
    expect(
      await screen.findByText(/Tarefas da sprint "Sprint Ativa" atualizadas/)
    ).toBeInTheDocument();
  });

  it('mostra vazio sem inventar histórico', async () => {
    const user = userEvent.setup();
    mocks.schedule.listSprintTasks.mockResolvedValue({ data: { total: 0, tasks: [] } });
    mocks.schedule.getSprintProgress.mockResolvedValue({
      data: {
        ...baseProgress,
        baseline: { kind: 'OPEN', at: null },
        scopeChange: { added: [], removed: [] }
      }
    });
    renderScreen();
    await screen.findByRole('heading', { name: 'Sprint Ativa' });
    await user.click(within(card('Sprint Ativa')).getByRole('button', { name: 'Tarefas' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tarefas da Sprint Ativa' });
    expect(within(dialog).getByText('Escopo atual')).toBeInTheDocument();
    expect(within(dialog).getByText('Nenhuma tarefa associada.')).toBeInTheDocument();
    expect(within(dialog).queryByText('Adicionadas durante a sprint')).toBeNull();
  });

  it('mantém sprint terminal congelada sem seletor nem ação de salvar', async () => {
    const user = userEvent.setup();
    setPlanning([completed], [scheduleSprint(completed, [tasks[0]])]);
    mocks.schedule.getSprintProgress.mockResolvedValue({ data: { ...baseProgress, frozen: true } });
    renderScreen();
    await screen.findByRole('heading', { name: 'Sprint Concluída' });
    await user.click(within(card('Sprint Concluída')).getByRole('button', { name: 'Tarefas' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tarefas da Sprint Concluída' });
    expect(within(dialog).getByText(/está congelada/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('combobox', { name: 'Pesquisar tarefas' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Salvar tarefas da sprint' })).toBeNull();
  });

  it('mantém dialog e oferece retry quando a carga falha', async () => {
    const user = userEvent.setup();
    mocks.schedule.listSprintTasks.mockRejectedValueOnce({ response: { status: 500, data: {} } });
    renderScreen();
    await screen.findByRole('heading', { name: 'Sprint Ativa' });
    await user.click(within(card('Sprint Ativa')).getByRole('button', { name: 'Tarefas' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tarefas da Sprint Ativa' });
    expect(
      await within(dialog).findByRole('button', { name: 'Tentar novamente' })
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Tentar novamente' }));
    expect(await within(dialog).findByText('Escopo planejado')).toBeInTheDocument();
  });
});

describe('evolução, lifecycle e navegação', () => {
  beforeEach(() =>
    setPlanning([planned, active], [scheduleSprint(planned), scheduleSprint(active, tasks)])
  );

  it('move indicadores e burndown existentes para modal largo', async () => {
    const user = userEvent.setup();
    mocks.schedule.getSprintProgress.mockResolvedValue({
      data: {
        ...baseProgress,
        burndown: {
          hasData: true,
          totalPoints: 6,
          frozen: false,
          cutoffDate: '2026-09-03',
          days: [
            { date: '2026-09-01', ideal: 6, remaining: 6 },
            { date: '2026-09-02', ideal: 3, remaining: 2 },
            { date: '2026-09-03', ideal: 0, remaining: 2 }
          ]
        }
      }
    });
    renderScreen();
    await screen.findByRole('heading', { name: 'Sprint Ativa' });
    await user.click(within(card('Sprint Ativa')).getByRole('button', { name: 'Evolução' }));
    const dialog = await screen.findByRole('dialog', { name: 'Evolução da Sprint Ativa' });
    expect(within(dialog).getByText('Tarefas')).toBeInTheDocument();
    expect(within(dialog).getByText('Pontos')).toBeInTheDocument();
    expect(within(dialog).getByText('Progresso')).toBeInTheDocument();
    expect(within(dialog).getByText('Prazo')).toBeInTheDocument();
    expect(within(dialog).getByText('Escopo planejado')).toBeInTheDocument();
    expect(within(dialog).getByText('Escopo atual')).toBeInTheDocument();
    expect(within(dialog).getByRole('img')).toHaveAccessibleName(/Restam 2 de 6 pontos/);
  });

  it('inicia sprint planejada sem confirmação', async () => {
    const user = userEvent.setup();
    setPlanning([planned], [scheduleSprint(planned)]);
    mocks.schedule.updateSprintStatus.mockResolvedValue({
      data: { sprint: { ...planned, status: 'EM_ANDAMENTO' }, message: 'Status atualizado.' }
    });
    renderScreen();
    await screen.findByRole('heading', { name: 'Sprint Planejada' });
    const menu = await openMenu(user, 'Sprint Planejada');
    await user.click(
      within(menu).getByRole('menuitem', { name: 'Iniciar a sprint Sprint Planejada' })
    );
    expect(screen.queryByRole('dialog', { name: /Iniciar/ })).toBeNull();
    expect(mocks.schedule.updateSprintStatus).toHaveBeenCalledWith(1, 'EM_ANDAMENTO');
  });

  it('confirma conclusão e informa tarefas que voltarão ao backlog', async () => {
    const user = userEvent.setup();
    mocks.schedule.updateSprintStatus.mockResolvedValue({
      data: { sprint: { ...active, status: 'CONCLUIDA' }, message: 'Status atualizado.' }
    });
    renderScreen();
    await screen.findByRole('heading', { name: 'Sprint Ativa' });
    const menu = await openMenu(user, 'Sprint Ativa');
    await user.click(
      within(menu).getByRole('menuitem', { name: 'Concluir a sprint Sprint Ativa' })
    );
    const confirm = screen.getByRole('dialog', { name: 'Concluir sprint?' });
    expect(confirm).toHaveTextContent('1 tarefa(s) não concluída(s) voltarão ao backlog');
    await user.click(within(confirm).getByRole('button', { name: 'Concluir e congelar' }));
    expect(mocks.schedule.updateSprintStatus).toHaveBeenCalledWith(2, 'CONCLUIDA');
  });

  it('confirma cancelamento como destrutivo e não oferece excluir ou reabrir', async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole('heading', { name: 'Sprint Ativa' });
    const menu = await openMenu(user, 'Sprint Ativa');
    expect(within(menu).queryByRole('menuitem', { name: /Excluir|Reabrir/ })).toBeNull();
    await user.click(
      within(menu).getByRole('menuitem', { name: 'Cancelar a sprint Sprint Ativa' })
    );
    const confirm = screen.getByRole('dialog', { name: 'Cancelar sprint?' });
    expect(within(confirm).getByRole('button', { name: 'Cancelar sprint' })).toHaveClass(
      'button-danger'
    );
  });

  it('navega ao Kanban com o filtro de sprint já suportado', async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole('heading', { name: 'Sprint Planejada' });
    const menu = await openMenu(user, 'Sprint Planejada');
    await user.click(within(menu).getByRole('menuitem', { name: /Ver a sprint.*Kanban/ }));
    expect(await screen.findByText('Quadro do projeto')).toBeInTheDocument();
  });

  it('preserva sucesso da mudança de status se a reconciliação falhar', async () => {
    const user = userEvent.setup();
    setPlanning([planned], [scheduleSprint(planned)]);
    mocks.schedule.updateSprintStatus.mockResolvedValue({
      data: { sprint: { ...planned, status: 'EM_ANDAMENTO' }, message: 'Status atualizado.' }
    });
    renderScreen();
    await screen.findByRole('heading', { name: 'Sprint Planejada' });
    const menu = await openMenu(user, 'Sprint Planejada');
    mocks.schedule.getSchedule.mockRejectedValueOnce(new Error('rede'));
    await user.click(
      within(menu).getByRole('menuitem', { name: 'Iniciar a sprint Sprint Planejada' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /ação foi concluída.*dados exibidos/i
    );
    expect(screen.queryByText('Não foi possível atualizar o status da sprint.')).toBeNull();
  });
});

describe('contratos e escopo técnico', () => {
  it('não expõe exclusão de sprint na API nem importa internals de Tasks', async () => {
    const actual = await vi.importActual('../../src/features/schedule/api/schedule.api.js');
    expect(actual.scheduleApi.removeSprint).toBeUndefined();

    const { readdirSync, readFileSync } = await vi.importActual('node:fs');
    const { join } = await vi.importActual('node:path');
    const root = join(process.cwd(), 'src', 'features', 'schedule');
    const files = readdirSync(root, { recursive: true }).filter((name) =>
      /\.jsx?$/.test(String(name))
    );
    for (const name of files) {
      expect(readFileSync(join(root, String(name)), 'utf8')).not.toMatch(
        /^\s*import[^\n]*['"][^'"]*\/tasks\/['"]/m
      );
    }
  });

  it('mantém as APIs existentes de sprint, marco, tarefas, progresso e cronograma', async () => {
    const actual = await vi.importActual('../../src/features/schedule/api/schedule.api.js');
    for (const method of [
      'getSchedule',
      'listSprints',
      'listMilestones',
      'createSprint',
      'updateSprint',
      'updateSprintStatus',
      'listSprintTasks',
      'listProjectTasks',
      'getMembership',
      'replaceSprintTasks',
      'getSprintProgress'
    ]) {
      expect(typeof actual.scheduleApi[method], method).toBe('function');
    }
  });
});
