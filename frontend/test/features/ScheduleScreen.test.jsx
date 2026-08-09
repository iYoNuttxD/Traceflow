// RF10: estados da tela de cronograma e comportamento dos formularios.
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
    removeSprint: vi.fn(),
    listSprintTasks: vi.fn(),
    replaceSprintTasks: vi.fn(),
    createMilestone: vi.fn(),
    updateMilestone: vi.fn(),
    updateMilestoneStatus: vi.fn(),
    removeMilestone: vi.fn(),
    listProjectTasks: vi.fn()
  },
  projects: { get: vi.fn() },
  confirm: vi.fn()
}));

vi.mock('../../src/features/schedule/api/schedule.api.js', () => ({ scheduleApi: mocks.schedule }));
vi.mock('../../src/features/projects/index.js', () => ({
  projectsApi: mocks.projects,
  ProjectSectionNav: () => <nav aria-label="Navegação do projeto" />
}));

const { ScheduleScreen } = await import('../../src/features/schedule/pages/ScheduleScreen.jsx');
const { isMilestoneOverdue } =
  await import('../../src/features/schedule/components/schedule-display.js');
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
      <MemoryRouter initialEntries={['/projects/1/schedule']}>
        <Routes>
          <Route path="/projects/:projectId/schedule" element={<ScheduleScreen />} />
        </Routes>
      </MemoryRouter>
    </ConfirmProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.projects.get.mockResolvedValue({ data: { project: { id: 1, name: 'TraceFlow' } } });
  mocks.schedule.getSchedule.mockResolvedValue({ data: emptySchedule });
  mocks.schedule.listSprints.mockResolvedValue({ data: { total: 0, sprints: [] } });
  mocks.schedule.listMilestones.mockResolvedValue({ data: { total: 0, milestones: [] } });
  mocks.schedule.listProjectTasks.mockResolvedValue({ data: { total: 0, tasks: [] } });
});

// Guarda contra mock divergente da API real: os mocks acima substituem modulos
// inteiros, entao um metodo inexistente passaria despercebido no teste e quebraria
// so em producao. Aqui importamos os modulos de verdade e conferimos a superficie
// que a ScheduleScreen consome.
describe('contrato dos modulos consumidos', () => {
  // A feature schedule nao pode importar `features/tasks`: isso fecharia um ciclo
  // tasks/index -> KanbanScreen -> schedule/index -> ScheduleScreen -> tasks/index,
  // que ja causou falha intermitente nesta suite.
  it('nao depende da feature tasks', async () => {
    const { readdirSync, readFileSync } = await vi.importActual('node:fs');
    const { join } = await vi.importActual('node:path');

    // process.cwd() e a pasta frontend quando o vitest roda a suite.
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
      'removeSprint',
      'listSprintTasks',
      'listProjectTasks',
      'replaceSprintTasks',
      'createMilestone',
      'updateMilestone',
      'updateMilestoneStatus',
      'removeMilestone'
    ]) {
      expect(typeof actual.scheduleApi[method], `scheduleApi.${method}`).toBe('function');
    }
  });
});

describe('estados da tela', () => {
  it('exibe carregamento antes dos dados', () => {
    mocks.projects.get.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByText('Carregando cronograma...')).toBeInTheDocument();
  });

  it('exibe estado vazio quando nao ha sprints nem marcos', async () => {
    renderScreen();
    expect(await screen.findByText('Cronograma vazio.')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma sprint cadastrada.')).toBeInTheDocument();
    expect(screen.getByText('Nenhum marco cadastrado.')).toBeInTheDocument();
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

  it('renderiza sprints, marcos e tarefas sem sprint do agregado', async () => {
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

    renderScreen();
    // A agenda ancora a sprint no dia em que ela comeca.
    expect(await screen.findAllByText('Sprint 1')).not.toHaveLength(0);
    expect(screen.getAllByText(/01\/08\/2026 a 14\/08\/2026/).length).toBeGreaterThan(0);
    // Tarefa sem prazo nao entra no eixo: aparece no rodape nomeado.
    expect(screen.getByText(/não .*entram? na agenda por não ter data/)).toBeInTheDocument();
    expect(screen.getByText(/Ajustar CORS/)).toBeInTheDocument();
    // Atraso comunicado por texto, nao apenas por cor.
    expect(screen.getAllByText(/Atrasado/).length).toBeGreaterThan(0);
  });
});

describe('isMilestoneOverdue (derivacao local para exibicao)', () => {
  const hoje = new Date('2026-08-10T12:00:00.000Z');

  it('nao considera atrasado o marco que vence hoje', () => {
    expect(isMilestoneOverdue({ status: 'PENDENTE', dueDate: '2026-08-10' }, hoje)).toBe(false);
  });

  it('considera atrasado o marco vencido ontem', () => {
    expect(isMilestoneOverdue({ status: 'PENDENTE', dueDate: '2026-08-09' }, hoje)).toBe(true);
  });

  it('nunca considera atrasado um marco concluido', () => {
    expect(isMilestoneOverdue({ status: 'CONCLUIDO', dueDate: '2026-01-01' }, hoje)).toBe(false);
  });

  it('trata data ausente ou invalida como nao atrasado', () => {
    expect(isMilestoneOverdue({ status: 'PENDENTE', dueDate: null }, hoje)).toBe(false);
    expect(isMilestoneOverdue(null, hoje)).toBe(false);
  });
});

// O rate limit da API e por IP e o StrictMode dobra tudo em desenvolvimento.
// Estas asserções travam o custo de rede da tela para nao regredir.
describe('economia de requisicoes', () => {
  it('a carga inicial nao busca as tarefas do projeto', async () => {
    renderScreen();
    await screen.findByText('Cronograma vazio.');

    expect(mocks.projects.get).toHaveBeenCalledTimes(1);
    expect(mocks.schedule.getSchedule).toHaveBeenCalledTimes(1);
    expect(mocks.schedule.listSprints).toHaveBeenCalledTimes(1);
    expect(mocks.schedule.listMilestones).toHaveBeenCalledTimes(1);
    // Tarefas so sao necessarias no painel de associacao.
    expect(mocks.schedule.listProjectTasks).not.toHaveBeenCalled();
  });

  it('salvar sprint nao rebusca marcos, projeto nem tarefas', async () => {
    const user = userEvent.setup();
    mocks.schedule.createSprint.mockResolvedValue({ data: {} });
    renderScreen();
    await screen.findByText('Cronograma vazio.');
    vi.clearAllMocks();
    mocks.schedule.getSchedule.mockResolvedValue({ data: emptySchedule });
    mocks.schedule.listSprints.mockResolvedValue({ data: { total: 0, sprints: [] } });
    mocks.schedule.createSprint.mockResolvedValue({ data: {} });

    await user.type(screen.getByLabelText(/Nome/), 'Sprint 1');
    await user.type(screen.getByLabelText(/Data de início/), '2026-08-01');
    await user.type(screen.getByLabelText(/Data de fim/), '2026-08-14');
    await user.click(screen.getByRole('button', { name: 'Cadastrar sprint' }));

    await waitFor(() => expect(mocks.schedule.listSprints).toHaveBeenCalledTimes(1));
    expect(mocks.schedule.getSchedule).toHaveBeenCalledTimes(1);
    expect(mocks.schedule.listMilestones).not.toHaveBeenCalled();
    expect(mocks.projects.get).not.toHaveBeenCalled();
    expect(mocks.schedule.listProjectTasks).not.toHaveBeenCalled();
  });

  it('filtrar periodo rebusca somente o agregado', async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText('Cronograma vazio.');
    vi.clearAllMocks();
    mocks.schedule.getSchedule.mockResolvedValue({ data: emptySchedule });

    await user.type(screen.getByLabelText('Data inicial'), '2026-08-01');
    await user.click(screen.getByRole('button', { name: 'Filtrar' }));

    await waitFor(() => expect(mocks.schedule.getSchedule).toHaveBeenCalledTimes(1));
    expect(mocks.schedule.listSprints).not.toHaveBeenCalled();
    expect(mocks.schedule.listMilestones).not.toHaveBeenCalled();
    expect(mocks.projects.get).not.toHaveBeenCalled();
  });
});

// O fluxo de exclusao usa o ConfirmProvider real: e o unico jeito de detectar
// contrato errado no options do confirm (title/description/confirmLabel).
describe('exclusao com confirmacao', () => {
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
    mocks.schedule.listMilestones.mockResolvedValue({
      data: {
        total: 1,
        milestones: [
          {
            id: 5,
            title: 'Entrega parcial',
            description: null,
            dueDate: '2026-08-14',
            status: 'PENDENTE'
          }
        ]
      }
    });
  });

  it('exibe titulo e descricao no dialogo de exclusao de sprint', async () => {
    const user = userEvent.setup();
    renderScreen();

    const lista = await screen.findByRole('list', { name: 'Sprints do projeto' });
    await user.click(within(lista).getByRole('button', { name: /^Excluir a sprint/ }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Excluir sprint');
    // O bug original: description ficava vazia porque a chave passada era `message`.
    expect(dialog).toHaveTextContent(/A sprint "Sprint 1" será excluída/);
    expect(dialog).toHaveTextContent('Esta ação não pode ser desfeita.');
    expect(within(dialog).getByRole('button', { name: 'Excluir' })).toBeInTheDocument();
  });

  it('cancelar no dialogo nao chama a API', async () => {
    const user = userEvent.setup();
    renderScreen();

    const lista = await screen.findByRole('list', { name: 'Sprints do projeto' });
    await user.click(within(lista).getByRole('button', { name: /^Excluir a sprint/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(mocks.schedule.removeSprint).not.toHaveBeenCalled();
  });

  it('confirmar exclui a sprint e a remove da lista', async () => {
    const user = userEvent.setup();
    mocks.schedule.removeSprint.mockResolvedValue({ data: {} });
    renderScreen();

    const lista = await screen.findByRole('list', { name: 'Sprints do projeto' });
    await user.click(within(lista).getByRole('button', { name: /^Excluir a sprint/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(mocks.schedule.removeSprint).toHaveBeenCalledWith(3));
    expect(await screen.findByText('Sprint excluída com sucesso.')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma sprint cadastrada.')).toBeInTheDocument();
  });

  it('exibe a mensagem do backend quando a exclusao e bloqueada', async () => {
    const user = userEvent.setup();
    mocks.schedule.removeSprint.mockRejectedValue({
      response: {
        status: 409,
        data: {
          message:
            'Não é possível excluir uma sprint com tarefas associadas. Desassocie as tarefas primeiro.'
        }
      }
    });
    renderScreen();

    const lista = await screen.findByRole('list', { name: 'Sprints do projeto' });
    await user.click(within(lista).getByRole('button', { name: /^Excluir a sprint/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }));

    expect(
      await screen.findByText(/Não é possível excluir uma sprint com tarefas associadas/)
    ).toBeInTheDocument();
  });
});

// Em sprint encerrada a remocao e irreversivel: a API recusa reincluir.
// O usuario precisa ser avisado antes de confirmar.
describe('remocao em sprint encerrada', () => {
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
    mocks.schedule.listSprintTasks.mockResolvedValue({ data: { total: 1, tasks: [{ id: 10 }] } });
  });

  async function abrirPainel(user) {
    await user.click(await screen.findByRole('button', { name: /^Gerenciar tarefas da sprint/ }));
    return screen.findByRole('region', { name: /Tarefas da sprint Sprint 1/ });
  }

  it('desabilita apenas as tarefas de fora e explica o motivo', async () => {
    const user = userEvent.setup();
    renderScreen();
    const painel = await abrirPainel(user);

    const caixas = within(painel).getAllByRole('checkbox');
    expect(caixas[0]).toBeEnabled(); // ja associada: pode remover
    expect(caixas[1]).toBeDisabled(); // fora: nao pode entrar
    expect(
      within(painel).getByText(/Não pode ser adicionada a uma sprint encerrada/)
    ).toBeInTheDocument();
  });

  it('avisa que a remocao e irreversivel antes de confirmar', async () => {
    const user = userEvent.setup();
    renderScreen();
    const painel = await abrirPainel(user);

    await user.click(within(painel).getAllByRole('checkbox')[0]);
    await user.click(within(painel).getByRole('button', { name: 'Confirmar remoção' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Remover tarefa de sprint encerrada');
    expect(dialog).toHaveTextContent(/Não será possível recolocá-la/);
    expect(dialog).toHaveTextContent(/"Ja na sprint"/);
    expect(mocks.schedule.replaceSprintTasks).not.toHaveBeenCalled();
  });

  it('cancelar no aviso preserva a associacao', async () => {
    const user = userEvent.setup();
    renderScreen();
    const painel = await abrirPainel(user);

    await user.click(within(painel).getAllByRole('checkbox')[0]);
    await user.click(within(painel).getByRole('button', { name: 'Confirmar remoção' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(mocks.schedule.replaceSprintTasks).not.toHaveBeenCalled();
  });

  it('confirmar remove a tarefa da sprint', async () => {
    const user = userEvent.setup();
    mocks.schedule.replaceSprintTasks.mockResolvedValue({ data: {} });
    renderScreen();
    const painel = await abrirPainel(user);

    await user.click(within(painel).getAllByRole('checkbox')[0]);
    await user.click(within(painel).getByRole('button', { name: 'Confirmar remoção' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remover' }));

    await waitFor(() => expect(mocks.schedule.replaceSprintTasks).toHaveBeenCalledWith(3, []));
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

// CONCLUIDA e CANCELADA sao terminais: nao ha transicao de volta. Um clique
// sem aviso travaria a sprint para edicao e para novas tarefas.
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
    // "Concluir" (acao) e nao "Concluída" (rotulo de status).
    expect(await screen.findByRole('button', { name: /^Concluir a sprint/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Concluída/ })).not.toBeInTheDocument();
  });

  it('distingue cancelar a sprint de cancelar a operacao', async () => {
    renderScreen();
    const botao = await screen.findByRole('button', { name: /^Cancelar a sprint/ });
    expect(botao).toHaveTextContent('Cancelar sprint');
  });

  it('cada acao explica a consequencia no title', async () => {
    renderScreen();
    const concluir = await screen.findByRole('button', { name: /^Concluir a sprint/ });
    expect(concluir).toHaveAttribute('title', expect.stringContaining('definitiva'));
    expect(screen.getByRole('button', { name: /^Excluir a sprint/ })).toHaveAttribute(
      'title',
      expect.stringContaining('não tenha tarefas associadas')
    );
  });

  it('avisa antes de concluir e nao chama a API se cancelar', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /^Concluir a sprint/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Concluir sprint');
    expect(dialog).toHaveTextContent(/não poderá ser editada, reaberta nem receber novas tarefas/);

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(mocks.schedule.updateSprintStatus).not.toHaveBeenCalled();
  });

  it('confirma e aplica a conclusao', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /^Concluir a sprint/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Concluir' }));

    await waitFor(() =>
      expect(mocks.schedule.updateSprintStatus).toHaveBeenCalledWith(3, 'CONCLUIDA')
    );
  });

  it('avisa antes de cancelar a sprint', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /^Cancelar a sprint/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Cancelar sprint');
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
    await screen.findByText('Cronograma vazio.');

    await user.click(screen.getByRole('button', { name: 'Cadastrar sprint' }));
    expect(await screen.findByText('Informe o nome da sprint.')).toBeInTheDocument();
    expect(mocks.schedule.createSprint).not.toHaveBeenCalled();
  });

  it('rejeita inicio posterior ao fim antes de enviar', async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText('Cronograma vazio.');

    await user.type(screen.getByLabelText(/Nome/), 'Sprint 1');
    await user.type(screen.getByLabelText(/Data de início/), '2026-08-20');
    await user.type(screen.getByLabelText(/Data de fim/), '2026-08-01');
    await user.click(screen.getByRole('button', { name: 'Cadastrar sprint' }));

    expect(
      await screen.findByText('A data de início não pode ser posterior à data de fim.')
    ).toBeInTheDocument();
    expect(mocks.schedule.createSprint).not.toHaveBeenCalled();
  });

  it('envia o payload correto quando valido', async () => {
    const user = userEvent.setup();
    mocks.schedule.createSprint.mockResolvedValue({ data: {} });
    renderScreen();
    await screen.findByText('Cronograma vazio.');

    await user.type(screen.getByLabelText(/Nome/), 'Sprint 1');
    await user.type(screen.getByLabelText(/Data de início/), '2026-08-01');
    await user.type(screen.getByLabelText(/Data de fim/), '2026-08-14');
    await user.click(screen.getByRole('button', { name: 'Cadastrar sprint' }));

    await waitFor(() =>
      expect(mocks.schedule.createSprint).toHaveBeenCalledWith('1', {
        name: 'Sprint 1',
        objective: null,
        startDate: '2026-08-01',
        endDate: '2026-08-14'
      })
    );
  });

  it('exibe a mensagem do backend quando a criacao falha', async () => {
    const user = userEvent.setup();
    mocks.schedule.createSprint.mockRejectedValue({
      response: {
        status: 409,
        data: { message: 'Já existe uma sprint com este nome neste projeto.' }
      }
    });
    renderScreen();
    await screen.findByText('Cronograma vazio.');

    await user.type(screen.getByLabelText(/Nome/), 'Sprint 1');
    await user.type(screen.getByLabelText(/Data de início/), '2026-08-01');
    await user.type(screen.getByLabelText(/Data de fim/), '2026-08-14');
    await user.click(screen.getByRole('button', { name: 'Cadastrar sprint' }));

    expect(
      await screen.findByText('Já existe uma sprint com este nome neste projeto.')
    ).toBeInTheDocument();
  });
});

describe('formulario de marco', () => {
  it('valida titulo e data prevista', async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText('Cronograma vazio.');

    await user.click(screen.getByRole('button', { name: 'Cadastrar marco' }));
    expect(await screen.findByText('Informe o título do marco.')).toBeInTheDocument();
    expect(screen.getByText('Informe a data prevista.')).toBeInTheDocument();
    expect(mocks.schedule.createMilestone).not.toHaveBeenCalled();
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

  // Regressao: a lista traz todas as tarefas do projeto, inclusive as ja alocadas
  // em outra sprint, renderizadas identicas a uma tarefa livre. Marcar uma delas
  // MOVE a tarefa, esvaziando o escopo da sprint de origem sem qualquer aviso —
  // e o titulo de uma tarefa real nao denuncia a que sprint ela pertence.
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

    // Duas sprints na lista: o seletor precisa nomear qual, senao casa as duas.
    await user.click(
      await screen.findByRole('button', { name: 'Gerenciar tarefas da sprint Sprint 1' })
    );
    const painel = await screen.findByRole('region', { name: /Tarefas da sprint/ });

    // A origem precisa estar visivel ANTES de marcar, e nomeada.
    expect(within(painel).getByText(/Atualmente em Sprint 2/)).toBeInTheDocument();
    const livre = within(painel).getByRole('checkbox', { name: /Livre/ });
    expect(within(painel).queryByText(/será movida/)).not.toBeInTheDocument();

    await user.click(within(painel).getByRole('checkbox', { name: /Alocada/ }));
    expect(
      await within(painel).findByText(/"Alocada" será movida de Sprint 2 para Sprint 1\./)
    ).toBeInTheDocument();

    // Marcar uma tarefa livre nao gera aviso de movimentacao.
    await user.click(within(painel).getByRole('checkbox', { name: /Alocada/ }));
    await user.click(livre);
    expect(within(painel).queryByText(/será movida/)).not.toBeInTheDocument();
  });

  it('chama a API de substituicao com os IDs marcados', async () => {
    const user = userEvent.setup();
    mocks.schedule.replaceSprintTasks.mockResolvedValue({ data: {} });
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /^Gerenciar tarefas da sprint/ }));
    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Salvar tarefas da sprint' }));

    await waitFor(() => expect(mocks.schedule.replaceSprintTasks).toHaveBeenCalledWith(3, [10]));
  });

  // Regressao: o painel montava antes da resposta chegar e afirmava que o projeto nao
  // tinha tarefas enquanto ainda carregava — com o botao Salvar habilitado sobre uma
  // selecao vazia, o que esvaziaria a sprint recem-aberta.
  it('mostra carregando em vez de afirmar que o projeto nao tem tarefas', async () => {
    const user = userEvent.setup();
    let liberar;
    mocks.schedule.listProjectTasks.mockReturnValue(
      new Promise((resolve) => {
        liberar = resolve;
      })
    );
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /^Gerenciar tarefas da sprint/ }));
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

  // Regressao: no erro o painel ficava aberto para sempre exibindo a frase falsa, ao
  // lado de uma mensagem de erro que a contradizia.
  it('fecha o painel quando nao consegue carregar as tarefas da sprint', async () => {
    const user = userEvent.setup();
    mocks.schedule.listSprintTasks.mockRejectedValue({ response: { status: 500, data: {} } });
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /^Gerenciar tarefas da sprint/ }));

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

    await user.click(await screen.findByRole('button', { name: /^Gerenciar tarefas da sprint/ }));
    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Salvar tarefas da sprint' }));

    expect(
      await screen.findByText('A tarefa informada não pertence ao mesmo projeto da sprint.')
    ).toBeInTheDocument();
  });
});

// As listas de CRUD nao podem esticar a pagina indefinidamente.
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
    // role="list" preservado: virar region apagaria a contagem de itens no leitor.
    expect(lista).toHaveAttribute('tabindex', '0');
    expect(lista.tagName).toBe('UL');
  });

  it('a lista de marcos recebe o mesmo tratamento', async () => {
    mocks.schedule.listMilestones.mockResolvedValue({
      data: {
        total: 1,
        milestones: [
          {
            id: 5,
            title: 'Entrega',
            description: null,
            dueDate: '2026-08-14',
            status: 'PENDENTE'
          }
        ]
      }
    });
    renderScreen();

    const lista = await screen.findByRole('list', { name: 'Marcos do projeto' });
    expect(lista).toHaveAttribute('tabindex', '0');
  });

  it('o painel de tarefas fica FORA da lista rolável', async () => {
    const user = userEvent.setup();
    mocks.schedule.listSprints.mockResolvedValue({
      data: { total: 1, sprints: [sprintDe(3, 'Alfa')] }
    });
    mocks.schedule.listSprintTasks.mockResolvedValue({ data: { total: 0, tasks: [] } });
    mocks.schedule.listProjectTasks.mockResolvedValue({ data: { total: 0, tasks: [] } });
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /^Gerenciar tarefas da sprint/ }));

    const lista = screen.getByRole('list', { name: 'Sprints do projeto' });
    const painel = await screen.findByRole('region', { name: /Tarefas da sprint Alfa/ });
    // Se o painel rolasse junto com a lista, abrir tarefas empurraria o conteudo
    // para dentro de uma caixa apertada.
    expect(lista.contains(painel)).toBe(false);
  });
});
