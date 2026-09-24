import { MemoryRouter, Route, Routes } from 'react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../src/shared/index.js';

const mocks = vi.hoisted(() => ({
  projectGet: vi.fn(),
  taskList: vi.fn(),
  memberList: vi.fn(),
  deleteRequirement: vi.fn(),
  replaceRequirementTasks: vi.fn(),
  requirementsApi: { create: vi.fn(), listByProject: vi.fn(), update: vi.fn() },
  getRequirementTaskCoverage: vi.fn(),
  getRequirementsTraceability: vi.fn(),
  getRequirementTraceability: vi.fn(),
  getRequirementSituationHistory: vi.fn()
}));

vi.mock('../../src/features/requirements/api/requirements.api.js', () => ({
  deleteRequirement: mocks.deleteRequirement,
  replaceRequirementTasks: mocks.replaceRequirementTasks,
  requirementsApi: mocks.requirementsApi
}));
vi.mock('../../src/features/traceability/api/traceability.api.js', () => ({
  getRequirementTaskCoverage: mocks.getRequirementTaskCoverage,
  getRequirementsTraceability: mocks.getRequirementsTraceability,
  getRequirementTraceability: mocks.getRequirementTraceability,
  getRequirementSituationHistory: mocks.getRequirementSituationHistory
}));
vi.mock('../../src/features/projects/api/projects.api.js', () => ({
  projectsApi: { get: mocks.projectGet }
}));
vi.mock('../../src/features/tasks/api/tasks.api.js', () => ({
  tasksApi: { list: mocks.taskList }
}));
vi.mock('../../src/features/members/index.js', () => ({
  membersApi: { list: mocks.memberList }
}));
vi.mock('../../src/features/traceability/components/TraceabilityFlow.jsx', () => ({
  TraceabilityFlow: ({ traceability }) => (
    <div data-testid="traceability-flow">{traceability.nodes.length} entidades</div>
  )
}));
vi.mock('../../src/features/testCases/components/ContextualTestCaseCreate.jsx', () => ({
  ContextualTestCaseCreate: ({ requirement, onCreated }) => (
    <div>
      <span>Criar teste para REQ-{requirement.id}</span>
      <button type="button" onClick={() => onCreated({ displayId: 'TC-99' })}>
        Concluir criação de teste
      </button>
    </div>
  )
}));

import { RequirementsPage } from '../../src/pages/RequirementsPage.jsx';

const task = { id: 20, title: 'Tarefa artificial', status: 'A_FAZER', requirementId: 10 };
const requirements = [
  {
    id: 10,
    projectId: 9,
    title: 'Login seguro',
    description:
      'Uma descrição extensa que deve permanecer resumida visualmente no card e integral nos detalhes.',
    type: 'FUNCIONAL',
    status: 'EM_IMPLEMENTACAO',
    createdAt: '2026-09-10T10:00:00Z',
    updatedAt: '2026-09-11T10:00:00Z',
    tasks: [task]
  },
  {
    id: 11,
    projectId: 9,
    title: 'Tempo de resposta',
    description: 'A aplicação deve responder rapidamente.',
    type: 'NAO_FUNCIONAL',
    status: 'CONCLUIDO',
    createdAt: '2026-09-09T10:00:00Z',
    updatedAt: '2026-09-12T10:00:00Z',
    tasks: []
  }
];

function projection(id, overrides = {}) {
  return {
    requirement: {
      id,
      displayId: `REQ-${id}`,
      title: requirements.find((item) => item.id === id)?.title,
      status: id === 10 ? 'EM_IMPLEMENTACAO' : 'CONCLUIDO'
    },
    situation: id === 10 ? 'EM_DESENVOLVIMENTO' : 'CONCLUIDO',
    progress: {
      percentage: id === 10 ? 50 : 100,
      tasksDone: id === 10 ? 1 : 2,
      tasksTotal: id === 10 ? 2 : 2
    },
    artifacts: { pullRequests: 1, commits: 2, issues: 1 },
    validation: { testCasesTotal: 3, pass: 2, fail: 1, blocked: 0, neverExecuted: 0 },
    defects: { total: 1, open: 1, inCorrection: 0, waitingRetest: 0, validated: 0 },
    evidence: { implementation: true, validation: true, correction: false },
    ...overrides
  };
}

const graph = {
  summary: projection(10),
  pagination: { page: 1, totalPages: 1, scope: 'graphNodes' },
  edges: [],
  nodes: [
    {
      id: 'requirement:10',
      type: 'REQUIREMENT',
      entityId: 10,
      data: { id: 10, title: 'Login seguro' }
    },
    { id: 'task:20', type: 'TASK', entityId: 20, data: task },
    {
      id: 'commit:30',
      type: 'COMMIT',
      entityId: 30,
      data: { id: 30, shortHash: 'abc1234', message: 'Implementa login' }
    },
    {
      id: 'testCase:40',
      type: 'TEST_CASE',
      entityId: 40,
      data: { id: 40, title: 'Autenticar usuário', latestExecution: { result: 'PASS' } }
    },
    {
      id: 'defect:50',
      type: 'DEFECT',
      entityId: 50,
      data: { id: 50, title: 'Sessão expira cedo', status: 'ABERTO', severity: 'ALTA' }
    }
  ]
};

function renderPage(entry = '/projects/9/requirements') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/projects/:projectId/requirements"
          element={
            <ConfirmProvider>
              <RequirementsPage />
            </ConfirmProvider>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.projectGet.mockResolvedValue({ data: { project: { id: 9, name: 'Projeto artificial' } } });
  mocks.memberList.mockResolvedValue({ currentMembership: { role: 'MEMBER' } });
  mocks.requirementsApi.listByProject.mockResolvedValue({ data: { requirements } });
  mocks.getRequirementTaskCoverage.mockResolvedValue({
    totalRequirements: 2,
    linkedRequirements: 1,
    coveragePercentage: 50
  });
  mocks.getRequirementsTraceability.mockResolvedValue({
    items: [projection(10), projection(11)],
    pagination: { page: 1, totalPages: 1, total: 2 }
  });
  mocks.getRequirementTraceability.mockResolvedValue(graph);
  mocks.getRequirementSituationHistory.mockResolvedValue({ items: [], nextCursor: null });
  mocks.requirementsApi.update.mockResolvedValue({
    data: { message: 'Requisito atualizado com sucesso.', requirement: requirements[0] }
  });
  mocks.requirementsApi.create.mockResolvedValue({
    data: { message: 'Requisito criado com sucesso.', requirement: requirements[0] }
  });
  mocks.replaceRequirementTasks.mockResolvedValue({
    requirement: requirements[0],
    reassignedTasks: [],
    changes: { linked: 0, unlinked: 0 }
  });
  mocks.deleteRequirement.mockResolvedValue({ message: 'Requisito excluído com sucesso.' });
  mocks.taskList.mockResolvedValue({ data: { tasks: [] } });
});

describe('Requirements facelift', () => {
  it('mantém requisitos e status macro quando a projection falha', async () => {
    const user = userEvent.setup();
    mocks.requirementsApi.listByProject.mockResolvedValue({
      data: { requirements: [{ ...requirements[0], status: 'CADASTRADO' }] }
    });
    mocks.getRequirementsTraceability.mockRejectedValue(new Error('projection indisponível'));
    mocks.getRequirementTraceability.mockResolvedValue({ ...graph, summary: null });
    renderPage();
    const card = await screen.findByRole('article', { name: 'REQ-10 · Login seguro' });
    expect(within(card).getByText('Planejado')).toBeInTheDocument();
    expect(
      screen.getByText(/informações de rastreabilidade não puderam ser carregadas/i)
    ).toBeInTheDocument();
    await user.click(card);
    expect(screen.getByRole('dialog', { name: /REQ-10 · Login seguro/ })).toHaveTextContent(
      'Planejado'
    );
  });

  it('organiza resumo, criação e cards com identidade própria de Requirement', async () => {
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'Visão geral dos requisitos' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '← Voltar para o projeto' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Novo requisito/ })).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    const card = screen.getByRole('article', { name: 'REQ-10 · Login seguro' });
    expect(within(card).getByText('1 tarefa vinculada')).toBeInTheDocument();
    expect(within(card).queryByText('Artefatos')).not.toBeInTheDocument();
    expect(within(card).queryByText('Testes')).not.toBeInTheDocument();
    expect(within(card).queryByText('Defeitos')).not.toBeInTheDocument();
    expect(within(card).queryByRole('progressbar')).not.toBeInTheDocument();
    expect(within(card).queryByText('Criado em')).not.toBeInTheDocument();
    expect(within(card).queryByText('Tarefa artificial')).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /Criar caso/ })).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Ver detalhes' })).not.toBeInTheDocument();
  });

  it('busca por ID/título e combina filtros de status e tipo', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('article', { name: 'REQ-10 · Login seguro' });
    await user.click(screen.getByRole('button', { name: /Buscar e filtrar/ }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar requisito' }), 'REQ-11');
    expect(
      screen.queryByRole('article', { name: 'REQ-10 · Login seguro' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'REQ-11 · Tempo de resposta' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    await user.selectOptions(screen.getByLabelText('Status'), 'EM_IMPLEMENTACAO');
    expect(screen.getByRole('article', { name: 'REQ-10 · Login seguro' })).toBeInTheDocument();
    expect(
      screen.queryByRole('article', { name: 'REQ-11 · Tempo de resposta' })
    ).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Tipo'), 'NAO_FUNCIONAL');
    expect(screen.getByText('Nenhum requisito corresponde aos filtros.')).toBeInTheDocument();
  });

  it('remove o formulário da página e cria/edita somente pelo dialog com vínculo atômico', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole('button', { name: /Novo requisito/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Título do requisito')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Novo requisito/ }));
    expect(screen.getByRole('dialog', { name: 'Novo requisito' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Título do requisito'), 'Novo requisito funcional');
    await user.click(screen.getByRole('button', { name: 'Salvar requisito' }));
    await waitFor(() =>
      expect(mocks.requirementsApi.create).toHaveBeenCalledWith(
        '9',
        expect.objectContaining({ title: 'Novo requisito funcional', type: 'FUNCIONAL' })
      )
    );
    expect(mocks.replaceRequirementTasks).toHaveBeenCalledWith(10, []);
    await user.click(screen.getByRole('button', { name: /Mais ações do requisito REQ-10/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Editar REQ-10' }));
    await user.clear(screen.getByLabelText('Título do requisito'));
    await user.type(screen.getByLabelText('Título do requisito'), 'Login atualizado');
    await user.click(screen.getByRole('button', { name: 'Salvar requisito' }));
    await waitFor(() => expect(mocks.replaceRequirementTasks).toHaveBeenCalledWith(10, [20]));
    expect(mocks.requirementsApi.update).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ title: 'Login atualizado' })
    );
  });

  it('abre Details focado no Requirement e mantém a rastreabilidade como fluxo complementar', async () => {
    const user = userEvent.setup();
    renderPage();
    const card = await screen.findByRole('article', { name: 'REQ-10 · Login seguro' });
    await user.click(card);
    const dialog = screen.getByRole('dialog', { name: /REQ-10 · Login seguro/ });
    expect(dialog).toBeInTheDocument();
    for (const title of ['Descrição', 'Informações', 'Tarefas vinculadas', 'Qualidade']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect([...dialog.querySelectorAll('h3')].slice(0, 2).map((item) => item.textContent)).toEqual([
      'Descrição',
      'Informações'
    ]);
    expect(within(dialog).getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Excluir requisito' })).toHaveClass(
      'button-danger'
    );
    expect(within(dialog).queryByRole('button', { name: /Mais ações/ })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Excluir requisito' }));
    expect(screen.getByRole('dialog', { name: 'Excluir requisito' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Excluir requisito' })).toBeNull()
    );
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Excluir requisito' })).toHaveFocus();
    expect(screen.queryByRole('heading', { name: 'Progresso' })).not.toBeInTheDocument();
    expect(screen.queryByText('Implementa login')).not.toBeInTheDocument();
    const tasks = screen.getByRole('heading', { name: 'Tarefas vinculadas' }).closest('section');
    const taskBox = within(tasks)
      .getByText('Tarefas', { selector: '.task-detail-artifact-heading > span' })
      .closest('article');
    expect(within(taskBox).getByText('1', { selector: 'strong' })).toBeInTheDocument();
    expect(
      within(taskBox).getByRole('link', { name: 'TASK-20 · Tarefa artificial' })
    ).toHaveAttribute('href', '/projects/9/kanban?task=20');
    expect(within(taskBox).getByText('A Fazer')).toBeInTheDocument();
    expect(within(taskBox).queryByText('A_FAZER')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ver rastreabilidade completa' })
    ).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'TC-40 · Autenticar usuário' })).toHaveAttribute(
      'href',
      '/projects/9/test-cases?case=40'
    );
    const quality = screen.getByRole('heading', { name: 'Qualidade' }).closest('section');
    expect(
      within(quality).getByText('Casos de teste', {
        selector: '.task-detail-artifact-heading > span'
      })
    ).toBeInTheDocument();
    const defectBox = within(quality)
      .getByText('Defeitos', { selector: '.task-detail-artifact-heading > span' })
      .closest('article');
    expect(
      within(defectBox).getByRole('link', { name: 'DEF-50 · Sessão expira cedo' })
    ).toHaveAttribute('href', '/projects/9/defects?defect=50');
    expect(within(defectBox).getByText('Alta · Aberto')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Histórico/ })).not.toBeInTheDocument();
    expect(mocks.getRequirementSituationHistory).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '+ Criar caso de teste' }));
    expect(screen.getByText('Criar teste para REQ-10')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Concluir criação de teste' }));
    expect(await screen.findByText('TC-99 · Caso de teste criado.')).toBeInTheDocument();
  });

  it('mantém estados vazios de tarefas, casos de teste e defeitos dentro das relation boxes', async () => {
    const user = userEvent.setup();
    const emptyProjection = projection(11, {
      validation: { testCasesTotal: 0, pass: 0, fail: 0, blocked: 0, neverExecuted: 0 },
      defects: { total: 0, open: 0, inCorrection: 0, waitingRetest: 0, validated: 0 }
    });
    mocks.getRequirementsTraceability.mockResolvedValue({
      items: [projection(10), emptyProjection],
      pagination: { page: 1, totalPages: 1, total: 2 }
    });
    mocks.getRequirementTraceability.mockResolvedValue({
      summary: emptyProjection,
      pagination: { page: 1, totalPages: 1, scope: 'graphNodes' },
      edges: [],
      nodes: [
        {
          id: 'requirement:11',
          type: 'REQUIREMENT',
          entityId: 11,
          data: { id: 11, title: 'Tempo de resposta' }
        }
      ]
    });
    renderPage();
    await user.click(await screen.findByRole('article', { name: 'REQ-11 · Tempo de resposta' }));
    const dialog = screen.getByRole('dialog', { name: /REQ-11 · Tempo de resposta/ });
    expect(within(dialog).getByText('Nenhuma tarefa vinculada.')).toBeInTheDocument();
    expect(within(dialog).getByText('Nenhum caso de teste relacionado.')).toBeInTheDocument();
    expect(within(dialog).getByText('Nenhum defeito relacionado.')).toBeInTheDocument();
    expect(within(dialog).getAllByText('0', { selector: 'strong' })).toHaveLength(3);
  });

  it('agrupa múltiplas tarefas na mesma relation box', async () => {
    const user = userEvent.setup();
    const multipleTasks = [
      task,
      { id: 21, title: 'Revisar autenticação', status: 'EM_ANDAMENTO', requirementId: 10 },
      { id: 22, title: 'Publicar autenticação', status: 'CONCLUIDO', requirementId: 10 }
    ];
    mocks.requirementsApi.listByProject.mockResolvedValue({
      data: { requirements: [{ ...requirements[0], tasks: multipleTasks }, requirements[1]] }
    });
    renderPage();
    await user.click(await screen.findByRole('article', { name: 'REQ-10 · Login seguro' }));
    const tasks = screen.getByRole('heading', { name: 'Tarefas vinculadas' }).closest('section');
    const taskBox = within(tasks)
      .getByText('Tarefas', { selector: '.task-detail-artifact-heading > span' })
      .closest('article');
    expect(within(taskBox).getByText('3', { selector: 'strong' })).toBeInTheDocument();
    expect(within(taskBox).getAllByRole('link')).toHaveLength(3);
    expect(within(taskBox).getByText('Em Andamento')).toBeInTheDocument();
    expect(within(taskBox).getByText('Concluído')).toBeInTheDocument();
  });

  it('abre Details por teclado, devolve foco ao card e permite entrar na edição', async () => {
    const user = userEvent.setup();
    renderPage();
    const card = await screen.findByRole('article', { name: 'REQ-10 · Login seguro' });
    card.focus();
    await user.keyboard(' ');
    const detailsDialog = screen.getByRole('dialog', { name: /REQ-10 · Login seguro/ });
    await user.click(within(detailsDialog).getByRole('button', { name: /Fechar req-10/i }));
    await waitFor(() => expect(card).toHaveFocus());
    await user.keyboard('{Enter}');
    await user.click(
      within(screen.getByRole('dialog', { name: /REQ-10 · Login seguro/ })).getByRole('button', {
        name: 'Editar'
      })
    );
    expect(screen.getByRole('dialog', { name: 'Editar requisito' })).toBeInTheDocument();
  });

  it('abre o Workspace existente diretamente pelo card', async () => {
    const user = userEvent.setup();
    renderPage();
    const card = await screen.findByRole('article', { name: 'REQ-10 · Login seguro' });
    await user.click(within(card).getByRole('button', { name: 'Ver rastreabilidade' }));
    expect(screen.getByRole('dialog', { name: 'Rastreabilidade — REQ-10' })).toBeInTheDocument();
    expect(await screen.findByTestId('traceability-flow')).toHaveTextContent('5 entidades');
    expect(mocks.getRequirementTraceability).toHaveBeenCalledWith(
      '9',
      10,
      { expanded: true, limit: 100 },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('abre Details por deep link e preserva consulta sem ações para VIEWER', async () => {
    mocks.memberList.mockResolvedValue({ currentMembership: { role: 'VIEWER' } });
    renderPage('/projects/9/requirements?requirement=10');
    expect(
      await screen.findByRole('dialog', { name: /REQ-10 · Login seguro/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Novo requisito/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Criar caso de teste' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
  });

  it('mantém confirmação de exclusão no menu de ações', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /Mais ações do requisito REQ-10/ }));
    await user.click(screen.getByRole('menuitem', { name: 'Excluir REQ-10' }));
    const dialog = screen.getByRole('dialog', { name: 'Excluir requisito' });
    await user.click(within(dialog).getByRole('button', { name: 'Excluir requisito' }));
    await waitFor(() => expect(mocks.deleteRequirement).toHaveBeenCalledWith(10));
  });

  it('não exibe detalhes técnicos quando a carga inicial falha', async () => {
    mocks.projectGet.mockRejectedValueOnce({
      response: {
        status: 500,
        data: { message: 'PrismaClientKnownRequestError em /app/requirements.js' }
      }
    });
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'O TRACEFLOW encontrou um problema.' })
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Prisma|\/app\/requirements/);
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});
