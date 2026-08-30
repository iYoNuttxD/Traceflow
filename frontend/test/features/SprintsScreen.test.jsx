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
    createMilestone: vi.fn(),
    updateMilestone: vi.fn(),
    updateMilestoneStatus: vi.fn(),
    removeMilestone: vi.fn(),
    listProjectTasks: vi.fn(),
    getMembership: vi.fn(),
    getSprintProgress: vi.fn()
  },
  projects: { get: vi.fn() },
  confirm: vi.fn()
}));

vi.mock('../../src/features/schedule/api/schedule.api.js', () => ({ scheduleApi: mocks.schedule }));
vi.mock('../../src/features/projects/index.js', () => ({
  projectsApi: mocks.projects,
  ProjectSectionNav: () => <nav aria-label="Navegação do projeto" />
}));

const { SprintsScreen } = await import('../../src/features/schedule/pages/SprintsScreen.jsx');
const { ConfirmProvider } = await import('../../src/shared/index.js');

const emptySchedule = {
  projectId: 1,
  range: { from: null, to: null },
  generatedAt: '2026-08-05T12:00:00.000Z',
  sprints: [],
  milestones: [],
  unassignedTasks: []
};

function renderScreen() {
  return render(
    <ConfirmProvider>
      <MemoryRouter initialEntries={['/projects/1/sprints']}>
        <Routes>
          <Route path="/projects/:projectId/sprints" element={<SprintsScreen />} />
          <Route path="/projects/:projectId/kanban" element={<p>Quadro do projeto</p>} />
        </Routes>
      </MemoryRouter>
    </ConfirmProvider>
  );
}

async function abrirMenu(user, nome) {
  await user.click(await screen.findByRole('button', { name: `Mais ações da sprint ${nome}` }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.projects.get.mockResolvedValue({ data: { project: { id: 1, name: 'TraceFlow' } } });
  mocks.schedule.getSchedule.mockResolvedValue({ data: emptySchedule });
  mocks.schedule.listSprints.mockResolvedValue({ data: { total: 0, sprints: [] } });
  mocks.schedule.listMilestones.mockResolvedValue({ data: { total: 0, milestones: [] } });
  mocks.schedule.listProjectTasks.mockResolvedValue({ data: { total: 0, tasks: [] } });
  mocks.schedule.getMembership.mockResolvedValue({
    data: { currentMembership: { role: 'OWNER' } }
  });
});

describe('contrato dos modulos consumidos', () => {
  it('nao depende da feature tasks', async () => {
    const { readdirSync, readFileSync } = await vi.importActual('node:fs');
    const { join } = await vi.importActual('node:path');

    const raiz = join(process.cwd(), 'src', 'features', 'schedule');
    const arquivos = readdirSync(raiz, { recursive: true }).filter((nome) =>
      /\.jsx?$/.test(String(nome))
    );

    expect(arquivos.length).toBeGreaterThan(0);
    for (const nome of arquivos) {
      const conteudo = readFileSync(join(raiz, String(nome)), 'utf8');
      expect(conteudo, `${nome} importa features/tasks`).not.toMatch(
        /^\s*import[^\n]*['"][^'"]*\/tasks\/index\.js['"]/m
      );
    }
  });

  it('projectsApi expoe os metodos usados pela tela', async () => {
    const actual = await vi.importActual('../../src/features/projects/index.js');
    expect(typeof actual.projectsApi.get).toBe('function');
  });

  it('scheduleApi expoe os metodos usados pela tela', async () => {
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
      'createMilestone',
      'updateMilestone',
      'updateMilestoneStatus',
      'removeMilestone',
      'getSprintProgress'
    ]) {
      expect(typeof actual.scheduleApi[method], `scheduleApi.${method}`).toBe('function');
    }
  });
});

describe('estados da tela', () => {
  it('exibe carregamento antes dos dados', () => {
    mocks.projects.get.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByText('Carregando sprints...')).toBeInTheDocument();
  });

  it('exibe estado vazio quando nao ha sprints', async () => {
    renderScreen();
    expect(await screen.findByText('Nenhuma sprint cadastrada.')).toBeInTheDocument();
  });

  it('exibe acesso negado em 403', async () => {
    mocks.projects.get.mockRejectedValue({ response: { status: 403, data: {} } });
    renderScreen();
    expect(await screen.findByRole('heading', { name: 'Acesso restrito' })).toBeInTheDocument();
  });

  it('exibe acesso negado em 404', async () => {
    mocks.projects.get.mockRejectedValue({ response: { status: 404, data: {} } });
    renderScreen();
    expect(await screen.findByRole('heading', { name: 'Acesso restrito' })).toBeInTheDocument();
  });

  it('exibe erro recuperavel em falha generica', async () => {
    mocks.projects.get.mockRejectedValue({ response: { status: 500, data: {} } });
    renderScreen();
    expect(await screen.findByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('descreve cada sprint com marco, periodo, tarefas e pontos', async () => {
    mocks.schedule.getSchedule.mockResolvedValue({
      data: {
        ...emptySchedule,
        sprints: [
          {
            id: 3,
            name: 'Sprint 1',
            objective: 'Identidade',
            startDate: '2026-08-01',
            endDate: '2026-08-14',
            status: 'EM_ANDAMENTO',
            durationInDays: 14,
            taskCount: 1,
            tasks: [
              {
                id: 10,
                title: 'Finalizar login',
                status: 'A_FAZER',
                priority: 'ALTA',
                deadline: '2026-08-20',
                estimatedEffort: 5,
                responsibleUserId: 2,
                deadlineOutsideWindow: true
              }
            ]
          }
        ],
        milestones: [
          {
            id: 1,
            title: 'Entrega parcial',
            description: null,
            dueDate: '2026-08-14',
            status: 'PENDENTE',
            overdue: true
          }
        ],
        unassignedTasks: [
          { id: 12, title: 'Ajustar CORS', status: 'A_FAZER', priority: 'MEDIA', deadline: null }
        ]
      }
    });

    mocks.schedule.listSprints.mockResolvedValue({
      data: {
        total: 1,
        sprints: [
          {
            id: 3,
            name: 'Sprint 1',
            objective: 'Identidade',
            startDate: '2026-08-01',
            endDate: '2026-08-14',
            status: 'EM_ANDAMENTO',
            milestoneId: 1
          }
        ]
      }
    });
    mocks.schedule.listMilestones.mockResolvedValue({
      data: { total: 1, milestones: [{ id: 1, title: 'Entrega parcial' }] }
    });

    renderScreen();
    expect(await screen.findAllByText('Sprint 1')).not.toHaveLength(0);
    expect(screen.getByText('Marco: Entrega parcial')).toBeInTheDocument();
    expect(screen.getAllByText(/01\/08\/2026 a 14\/08\/2026/).length).toBeGreaterThan(0);
    expect(screen.getByText('0 de 1 tarefa')).toBeInTheDocument();
    expect(screen.getByText('5 pts')).toBeInTheDocument();
  });

  it('nomeia a ausencia de marco em vez de deixar em branco', async () => {
    mocks.schedule.listSprints.mockResolvedValue({
      data: {
        total: 1,
        sprints: [
          {
            id: 3,
            name: 'Sprint legada',
            objective: null,
            startDate: '2026-08-01',
            endDate: '2026-08-14',
            status: 'PLANEJADA',
            milestoneId: null
          }
        ]
      }
    });
    renderScreen();
    expect(await screen.findByText('Marco: Sem marco')).toBeInTheDocument();
  });
});

describe('economia de requisicoes', () => {
  it('a carga inicial busca as tarefas do projeto uma unica vez, para o formulario', async () => {
    renderScreen();
    await screen.findByText('Nenhuma sprint cadastrada.');

    expect(mocks.projects.get).toHaveBeenCalledTimes(1);
    expect(mocks.schedule.getSchedule).toHaveBeenCalledTimes(1);
    expect(mocks.schedule.listSprints).toHaveBeenCalledTimes(1);
    expect(mocks.schedule.listMilestones).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.schedule.listProjectTasks).toHaveBeenCalledTimes(1));
  });

  it('perfil somente leitura nao busca as tarefas do projeto', async () => {
    mocks.schedule.getMembership.mockResolvedValue({
      data: { currentMembership: { role: 'VIEWER' } }
    });
    renderScreen();
    await screen.findByText('Nenhuma sprint cadastrada.');

    expect(mocks.schedule.listProjectTasks).not.toHaveBeenCalled();
  });

  it('salvar sprint sem tarefas marcadas nao rebusca marcos, projeto nem tarefas', async () => {
    const user = userEvent.setup();
    mocks.schedule.createSprint.mockResolvedValue({ data: {} });
    mocks.schedule.listMilestones.mockResolvedValue({
      data: { total: 1, milestones: [{ id: 7, title: 'Fundação' }] }
    });
    renderScreen();
    await screen.findByText('Nenhuma sprint cadastrada.');
    await waitFor(() => expect(mocks.schedule.listProjectTasks).toHaveBeenCalledTimes(1));
    vi.clearAllMocks();
    mocks.schedule.getSchedule.mockResolvedValue({ data: emptySchedule });
    mocks.schedule.listSprints.mockResolvedValue({ data: { total: 0, sprints: [] } });
    mocks.schedule.createSprint.mockResolvedValue({ data: {} });

    await user.type(screen.getByLabelText(/Nome/), 'Sprint 1');
    await user.selectOptions(screen.getByLabelText('Marco'), '7');
    await user.type(screen.getByLabelText(/^Início/), '2026-08-01T09:00');
    await user.type(screen.getByLabelText(/^Fim/), '2026-08-14T18:00');
    await user.click(screen.getByRole('button', { name: 'Salvar sprint' }));

    await waitFor(() => expect(mocks.schedule.listSprints).toHaveBeenCalledTimes(1));
    expect(mocks.schedule.getSchedule).toHaveBeenCalledTimes(1);
    expect(mocks.schedule.listMilestones).not.toHaveBeenCalled();
    expect(mocks.projects.get).not.toHaveBeenCalled();
    expect(mocks.schedule.listProjectTasks).not.toHaveBeenCalled();
    expect(mocks.schedule.replaceSprintTasks).not.toHaveBeenCalled();
  });
});

describe('ausencia de exclusao de sprint', () => {
  const umaSprint = {
    id: 3,
    name: 'Sprint 1',
    objective: null,
    startDate: '2026-08-01',
    endDate: '2026-08-14',
    status: 'PLANEJADA'
  };

  beforeEach(() => {
    mocks.schedule.listSprints.mockResolvedValue({ data: { total: 1, sprints: [umaSprint] } });
  });

  it('nao oferece acao de excluir sprint', async () => {
    const user = userEvent.setup();
    renderScreen();
    const lista = await screen.findByRole('list', { name: 'Sprints do projeto' });
    await abrirMenu(user, 'Sprint 1');
    expect(within(lista).queryByRole('button', { name: /Excluir a sprint/ })).toBeNull();
  });

  it('a camada de API nao expoe exclusao de sprint', async () => {
    const actual = await vi.importActual('../../src/features/schedule/api/schedule.api.js');
    expect(actual.scheduleApi.removeSprint).toBeUndefined();
  });
});

describe('escopo de sprint encerrada', () => {
  const sprintEncerrada = {
    id: 3,
    name: 'Sprint 1',
    objective: null,
    startDate: '2026-08-01',
    endDate: '2026-08-14',
    status: 'CONCLUIDA'
  };

  beforeEach(() => {
    mocks.schedule.listSprints.mockResolvedValue({
      data: { total: 1, sprints: [sprintEncerrada] }
    });
    mocks.schedule.listProjectTasks.mockResolvedValue({
      data: {
        total: 2,
        tasks: [
          { id: 10, title: 'Ja na sprint', status: 'A_FAZER', priority: 'ALTA' },
          { id: 11, title: 'Fora da sprint', status: 'A_FAZER', priority: 'BAIXA' }
        ]
      }
    });
    mocks.schedule.listSprintTasks.mockResolvedValue({
      data: {
        total: 1,
        tasks: [
          {
            id: 10,
            title: 'Ja na sprint',
            status: 'A_FAZER',
            priority: 'ALTA',
            addedAfterStart: false,
            carriedFromSprintId: null
          }
        ]
      }
    });
  });

  async function abrirPainel(user) {
    await abrirMenu(user, 'Sprint 1');
    await user.click(await screen.findByRole('button', { name: /^Ver tarefas da sprint/ }));
    return screen.findByRole('region', { name: /Tarefas da sprint Sprint 1/ });
  }

  it('nao oferece caixas de selecao nem botao de salvar', async () => {
    const user = userEvent.setup();
    renderScreen();
    const painel = await abrirPainel(user);

    expect(within(painel).queryAllByRole('checkbox')).toHaveLength(0);
    expect(within(painel).queryByRole('button', { name: /Salvar|Confirmar/ })).toBeNull();
    expect(
      within(painel).getByText(/a composição abaixo é o registro do que aconteceu/)
    ).toBeInTheDocument();
  });

  it('mostra apenas as tarefas que ficaram registradas na sprint', async () => {
    const user = userEvent.setup();
    renderScreen();
    const painel = await abrirPainel(user);

    expect(within(painel).getByText(/Ja na sprint/)).toBeInTheDocument();
    expect(within(painel).queryByText(/Fora da sprint/)).toBeNull();
  });

  it('sprint nao terminal salva sem aviso', async () => {
    const user = userEvent.setup();
    mocks.schedule.listSprints.mockResolvedValue({
      data: { total: 1, sprints: [{ ...sprintEncerrada, status: 'PLANEJADA' }] }
    });
    mocks.schedule.replaceSprintTasks.mockResolvedValue({ data: {} });
    renderScreen();
    const painel = await abrirPainel(user);

    await user.click(within(painel).getAllByRole('checkbox')[1]);
    await user.click(within(painel).getByRole('button', { name: 'Salvar tarefas da sprint' }));

    await waitFor(() =>
      expect(mocks.schedule.replaceSprintTasks).toHaveBeenCalledWith(3, [10, 11])
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('salvamento de uma sprint nao invade o painel de outra', () => {
  const sprintA = {
    id: 3,
    name: 'Sprint A',
    objective: null,
    startDate: '2026-08-01',
    endDate: '2026-08-14',
    status: 'PLANEJADA'
  };
  const sprintB = { ...sprintA, id: 4, name: 'Sprint B' };

  const tarefas = {
    3: [{ id: 10, title: 'Da A', status: 'A_FAZER', priority: 'ALTA', addedAfterStart: false }],
    4: [{ id: 20, title: 'Da B', status: 'A_FAZER', priority: 'ALTA', addedAfterStart: false }]
  };

  let liberarReplace;

  beforeEach(() => {
    mocks.schedule.listSprints.mockResolvedValue({
      data: { total: 2, sprints: [sprintA, sprintB] }
    });
    mocks.schedule.listProjectTasks.mockResolvedValue({
      data: {
        total: 2,
        tasks: [
          { id: 10, title: 'Da A', status: 'A_FAZER', priority: 'ALTA' },
          { id: 20, title: 'Da B', status: 'A_FAZER', priority: 'ALTA' }
        ]
      }
    });
    mocks.schedule.listSprintTasks.mockImplementation(async (sprintId) => ({
      data: { total: tarefas[sprintId].length, tasks: tarefas[sprintId] }
    }));
    mocks.schedule.replaceSprintTasks.mockImplementation(
      () =>
        new Promise((resolve) => {
          liberarReplace = () => resolve({ data: {} });
        })
    );
  });

  const abrir = async (user, nome) => {
    await abrirMenu(user, nome);
    await user.click(
      await screen.findByRole('button', {
        name: new RegExp(`^Ver tarefas da sprint ${nome}`)
      })
    );
    return screen.findByRole('region', { name: new RegExp(`Tarefas da sprint ${nome}`) });
  };

  it('a resposta atrasada de A nao sobrescreve o painel de B', async () => {
    const user = userEvent.setup();
    renderScreen();

    const painelA = await abrir(user, 'Sprint A');
    await user.click(within(painelA).getByRole('button', { name: 'Salvar tarefas da sprint' }));
    await waitFor(() => expect(mocks.schedule.replaceSprintTasks).toHaveBeenCalledWith(3, [10]));

    const painelB = await abrir(user, 'Sprint B');
    liberarReplace();

    const marcadas = () =>
      within(painelB)
        .getAllByRole('checkbox')
        .filter((caixa) => caixa.checked)
        .map((caixa) => caixa.closest('label').textContent);
    await waitFor(() => expect(marcadas()).toHaveLength(1));
    expect(marcadas()[0]).toMatch(/Da B/);

    await user.click(within(painelB).getByRole('button', { name: 'Salvar tarefas da sprint' }));
    await waitFor(() => expect(mocks.schedule.replaceSprintTasks).toHaveBeenCalledWith(4, [20]));
  });

  it('o aviso de sucesso nomeia a sprint salva', async () => {
    const user = userEvent.setup();
    renderScreen();

    const painelA = await abrir(user, 'Sprint A');
    await user.click(within(painelA).getByRole('button', { name: 'Salvar tarefas da sprint' }));
    await waitFor(() => expect(mocks.schedule.replaceSprintTasks).toHaveBeenCalled());
    liberarReplace();

    expect(
      await screen.findByText(/Tarefas da sprint "Sprint A" atualizadas com sucesso\./)
    ).toBeInTheDocument();
  });
});

describe('clareza e confirmacao das transicoes de status', () => {
  const emAndamento = {
    id: 3,
    name: 'Sprint 1',
    objective: null,
    startDate: '2026-08-01',
    endDate: '2026-08-14',
    status: 'EM_ANDAMENTO'
  };

  beforeEach(() => {
    mocks.schedule.listSprints.mockResolvedValue({ data: { total: 1, sprints: [emAndamento] } });
    mocks.schedule.updateSprintStatus.mockResolvedValue({
      data: { sprint: { ...emAndamento, status: 'CONCLUIDA' } }
    });
  });

  it('usa verbo no botao, nao o nome do estado', async () => {
    renderScreen();
    expect(await screen.findByRole('button', { name: /^Concluir a sprint/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Concluída/ })).not.toBeInTheDocument();
  });

  it('distingue cancelar a sprint de cancelar a operacao', async () => {
    const user = userEvent.setup();
    renderScreen();
    await abrirMenu(user, 'Sprint 1');
    const botao = await screen.findByRole('button', { name: /^Cancelar a sprint/ });
    expect(botao).toHaveTextContent('Cancelar sprint');
  });

  it('cada acao explica a consequencia no title', async () => {
    const user = userEvent.setup();
    renderScreen();
    const concluir = await screen.findByRole('button', { name: /^Concluir a sprint/ });
    expect(concluir).toHaveAttribute('title', expect.stringContaining('definitiva'));
    await abrirMenu(user, 'Sprint 1');
    expect(screen.getByRole('button', { name: /^Cancelar a sprint/ })).toHaveAttribute(
      'title',
      expect.stringContaining('definitiva')
    );
  });

  it('avisa antes de concluir e nao chama a API se cancelar', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /^Concluir a sprint/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Concluir sprint');
    expect(dialog).toHaveTextContent(/não poderá ser editada, reaberta nem receber novas tarefas/);

    await user.click(within(dialog).getByRole('button', { name: 'Voltar' }));
    expect(mocks.schedule.updateSprintStatus).not.toHaveBeenCalled();
  });

  it('confirma e aplica a conclusao', async () => {
    const user = userEvent.setup();
    mocks.schedule.updateSprintStatus.mockResolvedValue({
      data: { sprint: {}, message: 'Status da sprint atualizado com sucesso.' }
    });
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /^Concluir a sprint/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Concluir e congelar' }));

    await waitFor(() =>
      expect(mocks.schedule.updateSprintStatus).toHaveBeenCalledWith(3, 'CONCLUIDA')
    );
  });

  it('a confirmacao conta as tarefas que voltarao ao backlog', async () => {
    const user = userEvent.setup();
    mocks.schedule.getSchedule.mockResolvedValue({
      data: {
        ...emptySchedule,
        sprints: [
          {
            id: 3,
            name: 'Sprint 1',
            startDate: '2026-08-01',
            endDate: '2026-08-14',
            status: 'EM_ANDAMENTO',
            tasks: [
              { id: 1, status: 'A_FAZER', estimatedEffort: 2 },
              { id: 2, status: 'CONCLUIDO', estimatedEffort: 3 }
            ]
          }
        ]
      }
    });
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /^Concluir a sprint/ }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/1 tarefa\(s\) não concluída\(s\) voltarão ao backlog/)
    ).toBeInTheDocument();
  });

  it('avisa antes de cancelar a sprint', async () => {
    const user = userEvent.setup();
    renderScreen();

    await abrirMenu(user, 'Sprint 1');
    await user.click(await screen.findByRole('button', { name: /^Cancelar a sprint/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Cancelar sprint');
    expect(dialog).toHaveTextContent(/deixa de ocupar o cronograma/);
    expect(mocks.schedule.updateSprintStatus).not.toHaveBeenCalled();
  });

  it('iniciar nao e terminal e dispensa confirmacao', async () => {
    const user = userEvent.setup();
    mocks.schedule.listSprints.mockResolvedValue({
      data: { total: 1, sprints: [{ ...emAndamento, status: 'PLANEJADA' }] }
    });
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /^Iniciar a sprint/ }));

    await waitFor(() =>
      expect(mocks.schedule.updateSprintStatus).toHaveBeenCalledWith(3, 'EM_ANDAMENTO')
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('formulario de sprint', () => {
  it('valida campos obrigatorios sem chamar a API', async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText('Nenhuma sprint cadastrada.');

    await user.click(screen.getByRole('button', { name: 'Salvar sprint' }));
    expect(await screen.findByText('Informe o nome da sprint.')).toBeInTheDocument();
    expect(mocks.schedule.createSprint).not.toHaveBeenCalled();
  });

  it('rejeita inicio posterior ao fim antes de enviar', async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText('Nenhuma sprint cadastrada.');

    await user.type(screen.getByLabelText(/Nome/), 'Sprint 1');
    await user.type(screen.getByLabelText(/^Início/), '2026-08-20T09:00');
    await user.type(screen.getByLabelText(/^Fim/), '2026-08-01T09:00');
    await user.click(screen.getByRole('button', { name: 'Salvar sprint' }));

    expect(await screen.findByText('O início precisa ser anterior ao fim.')).toBeInTheDocument();
    expect(mocks.schedule.createSprint).not.toHaveBeenCalled();
  });

  it('preserva a hora ao editar e salvar de novo', async () => {
    const user = userEvent.setup();
    const inicio = new Date('2026-08-01T09:30').toISOString();
    const fim = new Date('2026-08-14T18:00').toISOString();
    mocks.schedule.listSprints.mockResolvedValue({
      data: {
        total: 1,
        sprints: [
          {
            id: 3,
            name: 'Sprint 1',
            objective: null,
            startDate: inicio,
            endDate: fim,
            status: 'PLANEJADA'
          }
        ]
      }
    });
    mocks.schedule.updateSprint.mockResolvedValue({ data: {} });
    renderScreen();

    await abrirMenu(user, 'Sprint 1');
    await user.click(await screen.findByRole('button', { name: /^Editar a sprint/ }));
    expect(screen.getByLabelText(/^Início/)).toHaveValue('2026-08-01T09:30');
    expect(screen.getByLabelText(/^Fim/)).toHaveValue('2026-08-14T18:00');

    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() =>
      expect(mocks.schedule.updateSprint).toHaveBeenCalledWith(
        3,
        expect.objectContaining({ startDate: inicio, endDate: fim })
      )
    );
  });

  it('editar leva o foco ao formulario preenchido', async () => {
    const user = userEvent.setup();
    mocks.schedule.listSprints.mockResolvedValue({
      data: {
        total: 1,
        sprints: [
          {
            id: 3,
            name: 'Sprint 1',
            objective: null,
            startDate: new Date('2026-08-01T09:30').toISOString(),
            endDate: new Date('2026-08-14T18:00').toISOString(),
            status: 'PLANEJADA'
          }
        ]
      }
    });
    renderScreen();

    await abrirMenu(user, 'Sprint 1');
    await user.click(await screen.findByRole('button', { name: /^Editar a sprint/ }));

    const nome = screen.getByLabelText(/Nome/);
    expect(nome).toHaveValue('Sprint 1');
    await waitFor(() => expect(nome).toHaveFocus());
  });

  it('cancelar edicao devolve o foco ao formulario', async () => {
    const user = userEvent.setup();
    mocks.schedule.listSprints.mockResolvedValue({
      data: {
        total: 1,
        sprints: [
          {
            id: 3,
            name: 'Sprint 1',
            objective: null,
            startDate: new Date('2026-08-01T09:30').toISOString(),
            endDate: new Date('2026-08-14T18:00').toISOString(),
            status: 'PLANEJADA'
          }
        ]
      }
    });
    renderScreen();

    await abrirMenu(user, 'Sprint 1');
    await user.click(await screen.findByRole('button', { name: /^Editar a sprint/ }));
    await user.click(screen.getByRole('button', { name: 'Cancelar edição' }));

    const nome = screen.getByLabelText(/Nome/);
    expect(nome).toHaveValue('');
    await waitFor(() => expect(nome).toHaveFocus());
  });

  it('envia o payload correto quando valido', async () => {
    const user = userEvent.setup();
    mocks.schedule.createSprint.mockResolvedValue({ data: {} });
    mocks.schedule.listMilestones.mockResolvedValue({
      data: { total: 1, milestones: [{ id: 7, title: 'Fundação' }] }
    });
    renderScreen();
    await screen.findByText('Nenhuma sprint cadastrada.');

    await user.type(screen.getByLabelText(/Nome/), 'Sprint 1');
    await user.selectOptions(screen.getByLabelText('Marco'), '7');
    await user.type(screen.getByLabelText(/^Início/), '2026-08-01T09:00');
    await user.type(screen.getByLabelText(/^Fim/), '2026-08-14T18:00');
    await user.click(screen.getByRole('button', { name: 'Salvar sprint' }));

    await waitFor(() =>
      expect(mocks.schedule.createSprint).toHaveBeenCalledWith('1', {
        name: 'Sprint 1',
        objective: null,
        startDate: new Date('2026-08-01T09:00').toISOString(),
        endDate: new Date('2026-08-14T18:00').toISOString(),
        milestoneId: 7
      })
    );
  });

  it('exige marco antes de enviar', async () => {
    const user = userEvent.setup();
    mocks.schedule.listMilestones.mockResolvedValue({
      data: { total: 1, milestones: [{ id: 7, title: 'Fundação' }] }
    });
    renderScreen();
    await screen.findByText('Nenhuma sprint cadastrada.');

    await user.type(screen.getByLabelText(/Nome/), 'Sprint 1');
    await user.type(screen.getByLabelText(/^Início/), '2026-08-01T09:00');
    await user.type(screen.getByLabelText(/^Fim/), '2026-08-14T18:00');
    await user.click(screen.getByRole('button', { name: 'Salvar sprint' }));

    expect(await screen.findByText('Selecione o marco da sprint.')).toBeInTheDocument();
    expect(mocks.schedule.createSprint).not.toHaveBeenCalled();
  });

  it('avisa quando o projeto ainda nao tem marcos', async () => {
    renderScreen();
    await screen.findByText('Nenhuma sprint cadastrada.');
    expect(screen.getByText(/Nenhum marco cadastrado ainda/)).toBeInTheDocument();
  });

  it('exibe a mensagem do backend quando a criacao falha', async () => {
    mocks.schedule.listMilestones.mockResolvedValue({
      data: { total: 1, milestones: [{ id: 7, title: 'Fundação' }] }
    });
    const user = userEvent.setup();
    mocks.schedule.createSprint.mockRejectedValue({
      response: {
        status: 409,
        data: { message: 'Já existe uma sprint com este nome neste projeto.' }
      }
    });
    renderScreen();
    await screen.findByText('Nenhuma sprint cadastrada.');

    await user.type(screen.getByLabelText(/Nome/), 'Sprint 1');
    await user.selectOptions(screen.getByLabelText('Marco'), '7');
    await user.type(screen.getByLabelText(/^Início/), '2026-08-01T09:00');
    await user.type(screen.getByLabelText(/^Fim/), '2026-08-14T18:00');
    await user.click(screen.getByRole('button', { name: 'Salvar sprint' }));

    expect(
      await screen.findByText('Já existe uma sprint com este nome neste projeto.')
    ).toBeInTheDocument();
  });
});

describe('tarefas no formulario de sprint', () => {
  beforeEach(() => {
    mocks.schedule.listMilestones.mockResolvedValue({
      data: { total: 1, milestones: [{ id: 7, title: 'Fundação' }] }
    });
    mocks.schedule.listSprints.mockResolvedValue({
      data: {
        total: 1,
        sprints: [
          {
            id: 4,
            name: 'Sprint 4',
            objective: null,
            startDate: '2026-09-01T00:00:00.000Z',
            endDate: '2026-09-14T00:00:00.000Z',
            status: 'PLANEJADA'
          }
        ]
      }
    });
    mocks.schedule.listProjectTasks.mockResolvedValue({
      data: {
        total: 2,
        tasks: [
          {
            id: 10,
            title: 'Finalizar login',
            status: 'A_FAZER',
            priority: 'ALTA',
            estimatedEffort: 5,
            sprintId: null
          },
          {
            id: 11,
            title: 'Alocada',
            status: 'A_FAZER',
            priority: 'MEDIA',
            estimatedEffort: 3,
            sprintId: 4
          }
        ]
      }
    });
  });

  const grupoDeTarefas = async () => screen.findByRole('group', { name: 'Tarefas da sprint' });

  it('oferece as tarefas do projeto com pontos e resumo da selecao', async () => {
    const user = userEvent.setup();
    renderScreen();
    const grupo = await grupoDeTarefas();

    expect(
      await within(grupo).findByRole('checkbox', {
        name: /Finalizar login — A fazer · Alta · 5 pts/
      })
    ).toBeInTheDocument();
    expect(within(grupo).getByText('0 tarefas selecionadas · 0 pts')).toBeInTheDocument();
    expect(
      within(grupo).getByText('Atualmente em Sprint 4 — marcar move a tarefa para cá')
    ).toBeInTheDocument();

    await user.click(within(grupo).getByRole('checkbox', { name: /Finalizar login/ }));
    expect(within(grupo).getByText('1 tarefa selecionada · 5 pts')).toBeInTheDocument();

    await user.click(within(grupo).getByRole('checkbox', { name: /Alocada/ }));
    expect(within(grupo).getByText('2 tarefas selecionadas · 8 pts')).toBeInTheDocument();
  });

  it('cria a sprint e entrega as tarefas marcadas a ela', async () => {
    const user = userEvent.setup();
    mocks.schedule.createSprint.mockResolvedValue({ data: { sprint: { id: 9 } } });
    mocks.schedule.replaceSprintTasks.mockResolvedValue({ data: {} });
    renderScreen();
    const grupo = await grupoDeTarefas();

    await user.click(await within(grupo).findByRole('checkbox', { name: /Finalizar login/ }));
    await user.type(screen.getByLabelText(/Nome/), 'Sprint nova');
    await user.selectOptions(screen.getByLabelText('Marco'), '7');
    await user.type(screen.getByLabelText(/^Início/), '2026-10-01T09:00');
    await user.type(screen.getByLabelText(/^Fim/), '2026-10-14T18:00');
    await user.click(screen.getByRole('button', { name: 'Salvar sprint' }));

    await waitFor(() => expect(mocks.schedule.replaceSprintTasks).toHaveBeenCalledWith(9, [10]));
    expect(await screen.findByText('Sprint cadastrada com sucesso.')).toBeInTheDocument();
  });

  it('editar preenche as tarefas atuais e salvar envia so a nova composicao', async () => {
    const user = userEvent.setup();
    mocks.schedule.listSprints.mockResolvedValue({
      data: {
        total: 1,
        sprints: [
          {
            id: 3,
            name: 'Sprint 1',
            objective: null,
            startDate: '2026-08-01T00:00:00.000Z',
            endDate: '2026-08-14T00:00:00.000Z',
            status: 'PLANEJADA'
          }
        ]
      }
    });
    mocks.schedule.listProjectTasks.mockResolvedValue({
      data: {
        total: 2,
        tasks: [
          {
            id: 10,
            title: 'Finalizar login',
            status: 'A_FAZER',
            priority: 'ALTA',
            estimatedEffort: 5,
            sprintId: null
          },
          {
            id: 11,
            title: 'Alocada',
            status: 'A_FAZER',
            priority: 'MEDIA',
            estimatedEffort: 3,
            sprintId: 3
          }
        ]
      }
    });
    mocks.schedule.getSchedule.mockResolvedValue({
      data: {
        ...emptySchedule,
        sprints: [
          {
            id: 3,
            name: 'Sprint 1',
            startDate: '2026-08-01T00:00:00.000Z',
            endDate: '2026-08-14T00:00:00.000Z',
            status: 'PLANEJADA',
            milestoneId: 7,
            taskCount: 1,
            tasks: [{ id: 11, title: 'Alocada', status: 'A_FAZER', priority: 'MEDIA' }]
          }
        ]
      }
    });
    mocks.schedule.updateSprint.mockResolvedValue({ data: {} });
    mocks.schedule.replaceSprintTasks.mockResolvedValue({ data: {} });
    renderScreen();

    await abrirMenu(user, 'Sprint 1');
    await user.click(await screen.findByRole('button', { name: /^Editar a sprint/ }));

    const grupo = await grupoDeTarefas();
    expect(within(grupo).getByRole('checkbox', { name: /Alocada/ })).toBeChecked();
    expect(within(grupo).queryByText(/marcar move a tarefa para cá/)).toBeNull();

    await user.click(within(grupo).getByRole('checkbox', { name: /Alocada/ }));
    await user.click(within(grupo).getByRole('checkbox', { name: /Finalizar login/ }));
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(mocks.schedule.updateSprint).toHaveBeenCalledTimes(1));
    expect(mocks.schedule.replaceSprintTasks).toHaveBeenCalledWith(3, [10]);
  });

  it('editar sem mexer nas tarefas nao chama a substituicao', async () => {
    const user = userEvent.setup();
    mocks.schedule.listSprints.mockResolvedValue({
      data: {
        total: 1,
        sprints: [
          {
            id: 3,
            name: 'Sprint 1',
            objective: null,
            startDate: '2026-08-01T00:00:00.000Z',
            endDate: '2026-08-14T00:00:00.000Z',
            status: 'PLANEJADA'
          }
        ]
      }
    });
    mocks.schedule.getSchedule.mockResolvedValue({
      data: {
        ...emptySchedule,
        sprints: [
          {
            id: 3,
            name: 'Sprint 1',
            startDate: '2026-08-01T00:00:00.000Z',
            endDate: '2026-08-14T00:00:00.000Z',
            status: 'PLANEJADA',
            milestoneId: 7,
            taskCount: 1,
            tasks: [{ id: 11, title: 'Alocada', status: 'A_FAZER', priority: 'MEDIA' }]
          }
        ]
      }
    });
    mocks.schedule.updateSprint.mockResolvedValue({ data: {} });
    renderScreen();

    await abrirMenu(user, 'Sprint 1');
    await user.click(await screen.findByRole('button', { name: /^Editar a sprint/ }));
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(mocks.schedule.updateSprint).toHaveBeenCalledTimes(1));
    expect(mocks.schedule.replaceSprintTasks).not.toHaveBeenCalled();
  });

  it('avisa quando a sprint salva mas as tarefas falham', async () => {
    const user = userEvent.setup();
    mocks.schedule.createSprint.mockResolvedValue({ data: { sprint: { id: 9 } } });
    mocks.schedule.replaceSprintTasks.mockRejectedValue({
      response: { status: 409, data: {} }
    });
    renderScreen();
    const grupo = await grupoDeTarefas();

    await user.click(await within(grupo).findByRole('checkbox', { name: /Finalizar login/ }));
    await user.type(screen.getByLabelText(/Nome/), 'Sprint nova');
    await user.selectOptions(screen.getByLabelText('Marco'), '7');
    await user.type(screen.getByLabelText(/^Início/), '2026-10-01T09:00');
    await user.type(screen.getByLabelText(/^Fim/), '2026-10-14T18:00');
    await user.click(screen.getByRole('button', { name: 'Salvar sprint' }));

    expect(
      await screen.findByText('Sprint salva, mas não foi possível atualizar as tarefas da sprint.')
    ).toBeInTheDocument();
  });
});

describe('evolucao da sprint (RF35)', () => {
  const sprint = {
    id: 3,
    name: 'Sprint 1',
    objective: null,
    startDate: '2026-08-01',
    endDate: '2026-08-14',
    status: 'EM_ANDAMENTO'
  };
  const metrica = (numerator, denominator, percentage) => ({
    numerator,
    denominator,
    percentage,
    hasData: denominator > 0
  });

  beforeEach(() => {
    mocks.schedule.listSprints.mockResolvedValue({ data: { total: 1, sprints: [sprint] } });
  });

  const abrir = async (user) => {
    await abrirMenu(user, 'Sprint 1');
    await user.click(await screen.findByRole('button', { name: /^Ver evolução da sprint/ }));
  };

  it('apresenta escopo planejado, escopo atual e o que mudou', async () => {
    const user = userEvent.setup();
    mocks.schedule.getSprintProgress.mockResolvedValue({
      data: {
        sprintId: 3,
        baseline: { kind: 'STARTED_AT', at: '2026-08-01T12:00:00.000Z' },
        cutoff: '2026-08-09T15:00:00.000Z',
        planned: metrica(1, 2, 50),
        current: metrica(1, 2, 50),
        scopeChange: {
          added: [{ taskId: 12, at: '2026-08-05T10:00:00.000Z', fromSprintId: null }],
          removed: [{ taskId: 7, at: '2026-08-06T10:00:00.000Z', toSprintId: null }]
        }
      }
    });
    renderScreen();
    await abrir(user);

    const painel = await screen.findByRole('region', { name: /Evolução da sprint/ });
    expect(within(painel).getByText('Escopo planejado')).toBeInTheDocument();
    expect(within(painel).getByText('Escopo atual')).toBeInTheDocument();
    expect(within(painel).getAllByText('50%')).toHaveLength(2);
    expect(within(painel).getByText('1 tarefa entrou na sprint: #12')).toBeInTheDocument();
    expect(within(painel).getByText('1 tarefa saiu da sprint: #7')).toBeInTheDocument();
    expect(within(painel).getByText(/Sem tarefas pontuadas nesta sprint/)).toBeInTheDocument();
  });

  it('mostra o burndown apurado junto do escopo', async () => {
    const user = userEvent.setup();
    mocks.schedule.getSprintProgress.mockResolvedValue({
      data: {
        sprintId: 3,
        baseline: { kind: 'STARTED_AT', at: '2026-08-01T12:00:00.000Z' },
        cutoff: '2026-08-09T15:00:00.000Z',
        planned: metrica(1, 2, 50),
        current: metrica(1, 2, 50),
        scopeChange: { added: [], removed: [] },
        burndown: {
          hasData: true,
          totalPoints: 10,
          frozen: false,
          cutoffDate: '2026-08-02',
          days: [
            { date: '2026-08-01', ideal: 10, remaining: 10 },
            { date: '2026-08-02', ideal: 5, remaining: 8 },
            { date: '2026-08-03', ideal: 0, remaining: null }
          ]
        }
      }
    });
    renderScreen();
    await abrir(user);

    const painel = await screen.findByRole('region', { name: /Evolução da sprint/ });
    expect(within(painel).getByText('Burndown')).toBeInTheDocument();
    expect(
      within(painel).getByText('Restam 8 de 10 pontos. A linha ideal previa 5 para este dia.')
    ).toBeInTheDocument();
  });

  it('resume tarefas, pontos, progresso e prazo da sprint em foco', async () => {
    const user = userEvent.setup();
    mocks.schedule.listSprints.mockResolvedValue({
      data: { total: 1, sprints: [{ ...sprint, status: 'PLANEJADA' }] }
    });
    mocks.schedule.getSchedule.mockResolvedValue({
      data: {
        ...emptySchedule,
        sprints: [
          {
            id: 3,
            name: 'Sprint 1',
            startDate: '2026-08-01',
            endDate: '2026-08-14',
            status: 'PLANEJADA',
            taskCount: 2,
            tasks: [
              { id: 8, title: 'Aberta', status: 'A_FAZER', estimatedEffort: 5 },
              { id: 11, title: 'Feita', status: 'CONCLUIDO', estimatedEffort: 3 }
            ]
          }
        ]
      }
    });
    mocks.schedule.getSprintProgress.mockResolvedValue({
      data: {
        sprintId: 3,
        baseline: { kind: 'OPEN', at: null },
        cutoff: '2026-08-09T15:00:00.000Z',
        planned: metrica(1, 2, 50),
        current: metrica(1, 2, 50),
        scopeChange: { added: [], removed: [] }
      }
    });
    renderScreen();
    await abrir(user);

    const painel = await screen.findByRole('region', { name: /Evolução da sprint/ });
    expect(within(painel).getByText('Tarefas')).toBeInTheDocument();
    expect(within(painel).getByText('1 de 2')).toBeInTheDocument();
    expect(within(painel).getByText('3 de 8')).toBeInTheDocument();
    expect(within(painel).getByText('38%')).toBeInTheDocument();
    expect(within(painel).getByText('Início em 01/08')).toBeInTheDocument();
  });

  it('fala no passado quando o resultado esta congelado', async () => {
    const user = userEvent.setup();
    mocks.schedule.listSprints.mockResolvedValue({
      data: { total: 1, sprints: [{ ...sprint, status: 'CONCLUIDA' }] }
    });
    mocks.schedule.getSprintProgress.mockResolvedValue({
      data: {
        sprintId: 3,
        frozen: true,
        baseline: { kind: 'STARTED_AT', at: '2026-08-01T12:00:00.000Z' },
        cutoff: '2026-08-14T18:00:00.000Z',
        planned: metrica(1, 2, 50),
        current: metrica(1, 2, 50),
        scopeChange: { added: [], removed: [] },
        carryOver: [
          { taskId: 9, toSprintId: 4, exitStatus: 'EM_ANDAMENTO', at: '2026-08-14T18:00:00.000Z' }
        ]
      }
    });
    renderScreen();
    await abrir(user);

    const painel = await screen.findByRole('region', { name: /Evolução da sprint/ });
    expect(within(painel).getByText('Escopo no encerramento')).toBeInTheDocument();
    expect(within(painel).queryByText('Escopo atual')).toBeNull();
    expect(within(painel).getByText(/Resultado congelado no encerramento/)).toBeInTheDocument();
    expect(
      within(painel).getByText(/1 tarefa seguiu para a sprint seguinte: #9/)
    ).toBeInTheDocument();
    expect(
      within(painel).getByText(/O status registrado aqui não muda com o que acontecer lá/)
    ).toBeInTheDocument();
  });

  it('sprint sem tarefas mostra sem dados, nunca 0%', async () => {
    const user = userEvent.setup();
    mocks.schedule.getSprintProgress.mockResolvedValue({
      data: {
        sprintId: 3,
        baseline: { kind: 'STARTED_AT', at: '2026-08-01T12:00:00.000Z' },
        cutoff: '2026-08-09T15:00:00.000Z',
        planned: metrica(0, 0, null),
        current: metrica(0, 0, null),
        scopeChange: { added: [], removed: [] }
      }
    });
    renderScreen();
    await abrir(user);

    const painel = await screen.findByRole('region', { name: /Evolução da sprint/ });
    expect(within(painel).getAllByText('Sem tarefas para medir.')).toHaveLength(2);
    expect(within(painel).queryByText('0%')).not.toBeInTheDocument();
    expect(
      within(painel).getByText(/Nenhuma tarefa entrou ou saiu depois do planejamento/)
    ).toBeInTheDocument();
  });

  it('explica a base aberta quando a sprint ainda nao comecou', async () => {
    const user = userEvent.setup();
    mocks.schedule.listSprints.mockResolvedValue({
      data: { total: 1, sprints: [{ ...sprint, status: 'PLANEJADA' }] }
    });
    mocks.schedule.getSprintProgress.mockResolvedValue({
      data: {
        sprintId: 3,
        baseline: { kind: 'OPEN', at: null },
        cutoff: '2026-08-09T15:00:00.000Z',
        planned: metrica(0, 1, 0),
        current: metrica(0, 1, 0),
        scopeChange: { added: [], removed: [] }
      }
    });
    renderScreen();
    await abrir(user);

    const painel = await screen.findByRole('region', { name: /Evolução da sprint/ });
    expect(within(painel).getByText(/o planejamento não está fechado/)).toBeInTheDocument();
    expect(within(painel).queryByText(/Mudanças depois do planejamento/)).not.toBeInTheDocument();
  });

  it('mostra estado de carga em vez de painel vazio', async () => {
    const user = userEvent.setup();
    let liberar;
    mocks.schedule.getSprintProgress.mockReturnValue(
      new Promise((resolve) => {
        liberar = resolve;
      })
    );
    renderScreen();
    await abrir(user);

    const painel = await screen.findByRole('region', { name: /Evolução da sprint/ });
    expect(within(painel).getByText('Calculando a evolução...')).toBeInTheDocument();

    liberar({
      data: {
        sprintId: 3,
        baseline: { kind: 'OPEN', at: null },
        cutoff: '2026-08-09T15:00:00.000Z',
        planned: metrica(1, 1, 100),
        current: metrica(1, 1, 100),
        scopeChange: { added: [], removed: [] }
      }
    });
    expect(await within(painel).findAllByText('100%')).toHaveLength(2);
  });

  it('fecha o painel quando o calculo falha', async () => {
    const user = userEvent.setup();
    mocks.schedule.getSprintProgress.mockRejectedValue({
      response: { status: 500, data: {} }
    });
    renderScreen();
    await abrir(user);

    expect(
      await screen.findByText('Não foi possível calcular a evolução da sprint.')
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /Evolução da sprint/ })).not.toBeInTheDocument()
    );
  });
});

describe('painel de tarefas da sprint', () => {
  beforeEach(() => {
    mocks.schedule.listSprints.mockResolvedValue({
      data: {
        total: 1,
        sprints: [
          {
            id: 3,
            name: 'Sprint 1',
            objective: null,
            startDate: '2026-08-01',
            endDate: '2026-08-14',
            status: 'PLANEJADA'
          }
        ]
      }
    });
    mocks.schedule.listProjectTasks.mockResolvedValue({
      data: {
        total: 1,
        tasks: [{ id: 10, title: 'Finalizar login', status: 'A_FAZER', priority: 'ALTA' }]
      }
    });
    mocks.schedule.listSprintTasks.mockResolvedValue({ data: { total: 0, tasks: [] } });
  });

  it('avisa que marcar tarefa de outra sprint move a tarefa', async () => {
    const user = userEvent.setup();
    mocks.schedule.listSprints.mockResolvedValue({
      data: {
        total: 2,
        sprints: [
          {
            id: 3,
            name: 'Sprint 1',
            objective: null,
            startDate: '2026-08-01',
            endDate: '2026-08-14',
            status: 'PLANEJADA'
          },
          {
            id: 4,
            name: 'Sprint 2',
            objective: null,
            startDate: '2026-08-15',
            endDate: '2026-08-28',
            status: 'PLANEJADA'
          }
        ]
      }
    });
    mocks.schedule.listProjectTasks.mockResolvedValue({
      data: {
        total: 2,
        tasks: [
          { id: 10, title: 'Livre', status: 'A_FAZER', priority: 'ALTA', sprintId: null },
          { id: 11, title: 'Alocada', status: 'A_FAZER', priority: 'ALTA', sprintId: 4 }
        ]
      }
    });
    renderScreen();

    await abrirMenu(user, 'Sprint 1');
    await user.click(await screen.findByRole('button', { name: 'Ver tarefas da sprint Sprint 1' }));
    const painel = await screen.findByRole('region', { name: /Tarefas da sprint/ });

    expect(within(painel).getByText(/Atualmente em Sprint 2/)).toBeInTheDocument();
    const livre = within(painel).getByRole('checkbox', { name: /Livre/ });
    expect(within(painel).queryByText(/será movida/)).not.toBeInTheDocument();

    await user.click(within(painel).getByRole('checkbox', { name: /Alocada/ }));
    expect(
      await within(painel).findByText(/"Alocada" será movida de Sprint 2 para Sprint 1\./)
    ).toBeInTheDocument();

    await user.click(within(painel).getByRole('checkbox', { name: /Alocada/ }));
    await user.click(livre);
    expect(within(painel).queryByText(/será movida/)).not.toBeInTheDocument();
  });

  it('chama a API de substituicao com os IDs marcados', async () => {
    const user = userEvent.setup();
    mocks.schedule.replaceSprintTasks.mockResolvedValue({ data: {} });
    renderScreen();

    await abrirMenu(user, 'Sprint 1');
    await user.click(await screen.findByRole('button', { name: /^Ver tarefas da sprint/ }));
    const painel = await screen.findByRole('region', { name: /Tarefas da sprint/ });
    await user.click(await within(painel).findByRole('checkbox'));
    await user.click(within(painel).getByRole('button', { name: 'Salvar tarefas da sprint' }));

    await waitFor(() => expect(mocks.schedule.replaceSprintTasks).toHaveBeenCalledWith(3, [10]));
  });

  it('mostra carregando em vez de afirmar que o projeto nao tem tarefas', async () => {
    const user = userEvent.setup();
    let liberar;
    mocks.schedule.listProjectTasks.mockReturnValue(
      new Promise((resolve) => {
        liberar = resolve;
      })
    );
    renderScreen();

    await abrirMenu(user, 'Sprint 1');
    await user.click(await screen.findByRole('button', { name: /^Ver tarefas da sprint/ }));
    const painel = await screen.findByRole('region', { name: /Tarefas da sprint/ });

    expect(within(painel).getByText('Carregando tarefas do projeto...')).toBeInTheDocument();
    expect(
      within(painel).queryByText('Nenhuma tarefa cadastrada neste projeto.')
    ).not.toBeInTheDocument();
    expect(within(painel).getByRole('button', { name: 'Salvar tarefas da sprint' })).toBeDisabled();

    liberar({
      data: {
        total: 1,
        tasks: [{ id: 10, title: 'Finalizar login', status: 'A_FAZER', priority: 'ALTA' }]
      }
    });

    expect(await within(painel).findByRole('checkbox')).toBeInTheDocument();
    expect(within(painel).getByRole('button', { name: 'Salvar tarefas da sprint' })).toBeEnabled();
    expect(mocks.schedule.replaceSprintTasks).not.toHaveBeenCalled();
  });

  it('fecha o painel quando nao consegue carregar as tarefas da sprint', async () => {
    const user = userEvent.setup();
    mocks.schedule.listSprintTasks.mockRejectedValue({ response: { status: 500, data: {} } });
    renderScreen();

    await abrirMenu(user, 'Sprint 1');
    await user.click(await screen.findByRole('button', { name: /^Ver tarefas da sprint/ }));

    expect(
      await screen.findByText('Não foi possível carregar as tarefas da sprint.')
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /Tarefas da sprint/ })).not.toBeInTheDocument()
    );
    expect(screen.queryByText('Nenhuma tarefa cadastrada neste projeto.')).not.toBeInTheDocument();
  });

  it('exibe a mensagem de erro do backend quando a substituicao falha', async () => {
    const user = userEvent.setup();
    mocks.schedule.replaceSprintTasks.mockRejectedValue({
      response: {
        status: 400,
        data: { message: 'A tarefa informada não pertence ao mesmo projeto da sprint.' }
      }
    });
    renderScreen();

    await abrirMenu(user, 'Sprint 1');
    await user.click(await screen.findByRole('button', { name: /^Ver tarefas da sprint/ }));
    const painel = await screen.findByRole('region', { name: /Tarefas da sprint/ });
    await user.click(await within(painel).findByRole('checkbox'));
    await user.click(within(painel).getByRole('button', { name: 'Salvar tarefas da sprint' }));

    expect(
      await screen.findByText('A tarefa informada não pertence ao mesmo projeto da sprint.')
    ).toBeInTheDocument();
  });
});

describe('listas roláveis', () => {
  const sprintDe = (id, nome) => ({
    id,
    name: nome,
    objective: null,
    startDate: '2026-08-01',
    endDate: '2026-08-14',
    status: 'PLANEJADA'
  });

  it('a lista de sprints é rolável por teclado sem perder a semântica de lista', async () => {
    mocks.schedule.listSprints.mockResolvedValue({
      data: { total: 2, sprints: [sprintDe(1, 'Alfa'), sprintDe(2, 'Beta')] }
    });
    renderScreen();

    const lista = await screen.findByRole('list', { name: 'Sprints do projeto' });
    expect(lista).toHaveAttribute('tabindex', '0');
    expect(lista.tagName).toBe('UL');
  });

  it('o painel de tarefas fica FORA da lista rolável', async () => {
    const user = userEvent.setup();
    mocks.schedule.listSprints.mockResolvedValue({
      data: { total: 1, sprints: [sprintDe(3, 'Alfa')] }
    });
    mocks.schedule.listSprintTasks.mockResolvedValue({ data: { total: 0, tasks: [] } });
    mocks.schedule.listProjectTasks.mockResolvedValue({ data: { total: 0, tasks: [] } });
    renderScreen();

    await abrirMenu(user, 'Alfa');
    await user.click(await screen.findByRole('button', { name: /^Ver tarefas da sprint/ }));

    const lista = screen.getByRole('list', { name: 'Sprints do projeto' });
    const painel = await screen.findByRole('region', { name: /Tarefas da sprint Alfa/ });
    expect(lista.contains(painel)).toBe(false);
  });
});

describe('respostas fora de ordem', () => {
  const sprintA = {
    id: 3,
    name: 'Sprint A',
    objective: null,
    startDate: '2026-08-01T00:00:00.000Z',
    endDate: '2026-08-14T00:00:00.000Z',
    status: 'PLANEJADA'
  };
  const sprintB = { ...sprintA, id: 4, name: 'Sprint B' };

  const tarefa = (id, title) => ({
    id,
    title,
    status: 'A_FAZER',
    priority: 'MEDIA',
    addedAfterStart: false,
    carriedFromSprintId: null
  });

  beforeEach(() => {
    mocks.schedule.listSprints.mockResolvedValue({
      data: { total: 2, sprints: [sprintA, sprintB] }
    });
    mocks.schedule.listProjectTasks.mockResolvedValue({
      data: { total: 2, tasks: [tarefa(10, 'Da A'), tarefa(20, 'Da B')] }
    });
  });

  const respostaLentaDeA = () => {
    let liberarA;
    mocks.schedule.listSprintTasks.mockImplementation((sprintId) => {
      if (sprintId === sprintA.id) {
        return new Promise((resolve) => {
          liberarA = () => resolve({ data: { total: 1, tasks: [tarefa(10, 'Da A')] } });
        });
      }
      return Promise.resolve({ data: { total: 1, tasks: [tarefa(20, 'Da B')] } });
    });
    return () => liberarA?.();
  };

  it('a resposta atrasada da sprint anterior nao sobrescreve a selecionada', async () => {
    const user = userEvent.setup();
    const liberarA = respostaLentaDeA();
    renderScreen();

    await abrirMenu(user, 'Sprint A');
    await user.click(await screen.findByRole('button', { name: /Ver tarefas da sprint Sprint A/ }));
    await abrirMenu(user, 'Sprint B');
    await user.click(screen.getByRole('button', { name: /Ver tarefas da sprint Sprint B/ }));

    const painel = await screen.findByRole('region', { name: /Tarefas da sprint Sprint B/ });
    liberarA();

    await waitFor(() => {
      const marcadas = within(painel)
        .getAllByRole('checkbox')
        .filter((caixa) => caixa.checked);
      expect(marcadas).toHaveLength(1);
    });
    const marcada = within(painel)
      .getAllByRole('checkbox')
      .find((caixa) => caixa.checked);
    expect(marcada.closest('label')).toHaveTextContent('Da B');
  });

  it('salvar envia os IDs da sprint aberta, e nao os da anterior', async () => {
    const user = userEvent.setup();
    const liberarA = respostaLentaDeA();
    mocks.schedule.replaceSprintTasks.mockResolvedValue({ data: {} });
    renderScreen();

    await abrirMenu(user, 'Sprint A');
    await user.click(await screen.findByRole('button', { name: /Ver tarefas da sprint Sprint A/ }));
    await abrirMenu(user, 'Sprint B');
    await user.click(screen.getByRole('button', { name: /Ver tarefas da sprint Sprint B/ }));
    const painel = await screen.findByRole('region', { name: /Tarefas da sprint Sprint B/ });
    liberarA();

    await user.click(within(painel).getByRole('button', { name: 'Salvar tarefas da sprint' }));
    await waitFor(() => expect(mocks.schedule.replaceSprintTasks).toHaveBeenCalled());
    expect(mocks.schedule.replaceSprintTasks).toHaveBeenCalledWith(sprintB.id, [20]);
  });

  it('fechar o painel durante a carga descarta a resposta que chega depois', async () => {
    const user = userEvent.setup();
    const liberarA = respostaLentaDeA();
    renderScreen();

    await abrirMenu(user, 'Sprint A');
    await user.click(await screen.findByRole('button', { name: /Ver tarefas da sprint Sprint A/ }));
    await abrirMenu(user, 'Sprint A');
    await user.click(screen.getByRole('button', { name: /Ocultar tarefas da sprint Sprint A/ }));
    liberarA();

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /Tarefas da sprint/ })).toBeNull()
    );
  });

  it('a evolucao atrasada de uma sprint nao aparece sob a outra', async () => {
    const user = userEvent.setup();
    let liberarA;
    const cheia = { numerator: 9, denominator: 9, percentage: 100, hasData: true };
    const vazia = { numerator: 0, denominator: 0, percentage: null, hasData: false };
    mocks.schedule.getSprintProgress.mockImplementation((sprintId) => {
      const corpo = (metrica) => ({
        data: {
          sprintId,
          frozen: false,
          baseline: { kind: 'OPEN', at: null },
          cutoff: '2026-08-09T15:00:00.000Z',
          planned: metrica,
          current: metrica,
          scopeChange: { added: [], removed: [] },
          carryOver: []
        }
      });
      if (sprintId === sprintA.id) {
        return new Promise((resolve) => {
          liberarA = () => resolve(corpo(cheia));
        });
      }
      return Promise.resolve(corpo(vazia));
    });
    renderScreen();

    await abrirMenu(user, 'Sprint A');
    await user.click(
      await screen.findByRole('button', { name: /Ver evolução da sprint Sprint A/ })
    );
    await abrirMenu(user, 'Sprint B');
    await user.click(screen.getByRole('button', { name: /Ver evolução da sprint Sprint B/ }));
    const painel = await screen.findByRole('region', { name: /Evolução da sprint Sprint B/ });
    liberarA?.();

    await waitFor(() =>
      expect(within(painel).getAllByText('Sem tarefas para medir.')).toHaveLength(2)
    );
    expect(within(painel).queryByText('100%')).toBeNull();
  });
});

describe('perfil somente leitura', () => {
  const sprint = {
    id: 3,
    name: 'Sprint 1',
    objective: null,
    startDate: '2026-08-01T00:00:00.000Z',
    endDate: '2026-08-14T00:00:00.000Z',
    status: 'PLANEJADA'
  };

  beforeEach(() => {
    mocks.schedule.getMembership.mockResolvedValue({
      data: { currentMembership: { role: 'VIEWER' } }
    });
    mocks.schedule.listSprints.mockResolvedValue({ data: { total: 1, sprints: [sprint] } });
    mocks.schedule.listMilestones.mockResolvedValue({
      data: {
        total: 1,
        milestones: [
          {
            id: 5,
            sprintId: 3,
            title: 'Entrega parcial',
            description: null,
            dueDate: '2026-08-10T00:00:00.000Z',
            status: 'PENDENTE'
          }
        ]
      }
    });
  });

  it('nao oferece formularios de cadastro', async () => {
    renderScreen();
    await screen.findByRole('list', { name: 'Sprints do projeto' });

    expect(screen.queryByRole('button', { name: 'Salvar sprint' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Salvar marco' })).toBeNull();
  });

  it('nao oferece acoes de mutacao nas listas', async () => {
    const user = userEvent.setup();
    renderScreen();
    const sprints = await screen.findByRole('list', { name: 'Sprints do projeto' });

    expect(within(sprints).queryByRole('button', { name: /^Iniciar a sprint/ })).toBeNull();
    expect(within(sprints).queryByRole('button', { name: /^Concluir a sprint/ })).toBeNull();
    await abrirMenu(user, 'Sprint 1');
    expect(within(sprints).queryByRole('button', { name: /^Editar a sprint/ })).toBeNull();
    expect(within(sprints).queryByRole('button', { name: /^Cancelar a sprint/ })).toBeNull();
    expect(
      within(sprints).getByRole('button', { name: /^Ver a sprint .* no Kanban/ })
    ).toBeInTheDocument();
  });

  it('mantem a consulta de tarefas, sem permitir salvar', async () => {
    const user = userEvent.setup();
    mocks.schedule.listSprintTasks.mockResolvedValue({
      data: {
        total: 1,
        tasks: [
          {
            id: 10,
            title: 'Tarefa da sprint',
            status: 'A_FAZER',
            priority: 'ALTA',
            addedAfterStart: false,
            carriedFromSprintId: null
          }
        ]
      }
    });
    renderScreen();

    await abrirMenu(user, 'Sprint 1');
    await user.click(await screen.findByRole('button', { name: /Ver tarefas da sprint Sprint 1/ }));
    const painel = await screen.findByRole('region', { name: /Tarefas da sprint Sprint 1/ });
    expect(within(painel).getByText(/Tarefa da sprint/)).toBeInTheDocument();
    expect(within(painel).queryAllByRole('checkbox')).toHaveLength(0);
    expect(within(painel).queryByRole('button', { name: /Salvar/ })).toBeNull();
  });
});

describe('sinalizacao de inclusao posterior ao inicio', () => {
  const emAndamento = {
    id: 3,
    name: 'Sprint 1',
    objective: null,
    startDate: '2026-08-01T00:00:00.000Z',
    endDate: '2026-08-14T00:00:00.000Z',
    status: 'EM_ANDAMENTO'
  };

  it('marca no painel a tarefa incluida depois do inicio', async () => {
    const user = userEvent.setup();
    mocks.schedule.listSprints.mockResolvedValue({ data: { total: 1, sprints: [emAndamento] } });
    mocks.schedule.listProjectTasks.mockResolvedValue({
      data: {
        total: 2,
        tasks: [
          { id: 10, title: 'Planejada', status: 'A_FAZER', priority: 'ALTA' },
          { id: 11, title: 'Entrou depois', status: 'A_FAZER', priority: 'BAIXA' }
        ]
      }
    });
    mocks.schedule.listSprintTasks.mockResolvedValue({
      data: {
        total: 2,
        tasks: [
          {
            id: 10,
            title: 'Planejada',
            status: 'A_FAZER',
            priority: 'ALTA',
            addedAfterStart: false
          },
          {
            id: 11,
            title: 'Entrou depois',
            status: 'A_FAZER',
            priority: 'BAIXA',
            addedAfterStart: true,
            carriedFromSprintId: null
          }
        ]
      }
    });
    renderScreen();

    await abrirMenu(user, 'Sprint 1');
    await user.click(await screen.findByRole('button', { name: /^Ver tarefas da sprint/ }));
    const painel = await screen.findByRole('region', { name: /Tarefas da sprint Sprint 1/ });

    const avisos = within(painel).getAllByText('Incluída após o início da sprint');
    expect(avisos).toHaveLength(1);
    expect(avisos[0].closest('label')).toHaveTextContent('Entrou depois');
  });
});
