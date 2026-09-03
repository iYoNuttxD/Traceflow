import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  schedule: {
    getSchedule: vi.fn(),
    listSprints: vi.fn(),
    listMilestones: vi.fn(),
    createMilestone: vi.fn(),
    updateMilestone: vi.fn(),
    updateMilestoneStatus: vi.fn(),
    removeMilestone: vi.fn(),
    updateSprint: vi.fn(),
    getMembership: vi.fn()
  },
  projects: { get: vi.fn() }
}));

vi.mock('../../src/features/schedule/api/schedule.api.js', () => ({ scheduleApi: mocks.schedule }));
vi.mock('../../src/features/projects/index.js', () => ({
  projectsApi: mocks.projects,
  ProjectSectionNav: () => <nav aria-label="Navegação do projeto" />
}));

const { MilestonesScreen } = await import('../../src/features/schedule/pages/MilestonesScreen.jsx');
const { ConfirmProvider } = await import('../../src/shared/index.js');

const emptySchedule = {
  projectId: 1,
  range: { from: null, to: null },
  generatedAt: '2026-09-03T12:00:00.000Z',
  sprints: [],
  milestones: [],
  unassignedTasks: []
};

const marco = (overrides = {}) => ({
  id: 5,
  title: 'Fundação do produto',
  description: 'Cadastro e quadro operacionais.',
  dueDate: '2099-09-30T18:00:00.000Z',
  status: 'PENDENTE',
  ...overrides
});

const sprint = (id, name, status = 'PLANEJADA', milestoneId = 5, overrides = {}) => ({
  id,
  name,
  objective: null,
  startDate: `2099-09-${String(id).padStart(2, '0')}T12:00:00.000Z`,
  endDate: `2099-09-${String(id + 4).padStart(2, '0')}T12:00:00.000Z`,
  status,
  milestoneId,
  ...overrides
});

function setData({ milestones = [], sprints = [], scheduleSprints = sprints } = {}) {
  mocks.schedule.listMilestones.mockResolvedValue({
    data: { total: milestones.length, milestones }
  });
  mocks.schedule.listSprints.mockResolvedValue({ data: { total: sprints.length, sprints } });
  mocks.schedule.getSchedule.mockResolvedValue({
    data: { ...emptySchedule, milestones, sprints: scheduleSprints }
  });
}

function renderScreen() {
  return render(
    <ConfirmProvider>
      <MemoryRouter initialEntries={['/projects/1/milestones']}>
        <Routes>
          <Route path="/projects/:projectId/milestones" element={<MilestonesScreen />} />
        </Routes>
      </MemoryRouter>
    </ConfirmProvider>
  );
}

async function openMenu(name = 'Fundação do produto') {
  const user = userEvent.setup();
  const trigger = await screen.findByRole('button', { name: `Mais ações do marco ${name}` });
  await user.click(trigger);
  return {
    user,
    trigger,
    menu: await screen.findByRole('menu', { name: `Ações do marco ${name}` })
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.projects.get.mockResolvedValue({ data: { project: { id: 1, name: 'TraceFlow' } } });
  mocks.schedule.getMembership.mockResolvedValue({
    data: { currentMembership: { role: 'OWNER' } }
  });
  mocks.schedule.createMilestone.mockResolvedValue({ data: { milestone: marco() } });
  mocks.schedule.updateMilestone.mockResolvedValue({ data: { milestone: marco() } });
  mocks.schedule.updateMilestoneStatus.mockResolvedValue({
    data: { milestone: marco({ status: 'PENDENTE' }) }
  });
  mocks.schedule.removeMilestone.mockResolvedValue({ data: {} });
  mocks.schedule.updateSprint.mockImplementation(async (id, data) => ({
    data: { sprint: sprint(id, `Sprint ${id}`, 'PLANEJADA', data.milestoneId) }
  }));
  setData();
});

describe('estrutura e estados da página', () => {
  it('exibe loading, forbidden e erro recuperavel pelos estados canonicos', async () => {
    mocks.projects.get.mockReturnValueOnce(new Promise(() => {}));
    const first = renderScreen();
    expect(screen.getByText('Carregando marcos...')).toBeInTheDocument();
    first.unmount();

    mocks.projects.get.mockRejectedValueOnce({ response: { status: 403, data: {} } });
    const second = renderScreen();
    expect(await screen.findByRole('heading', { name: 'Acesso restrito' })).toBeInTheDocument();
    second.unmount();

    mocks.projects.get.mockRejectedValueOnce({ response: { status: 500, data: {} } });
    renderScreen();
    expect(await screen.findByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('remove o formulario permanente e mantém Novo marco como primeiro item do empty state', async () => {
    renderScreen();
    const grid = await screen.findByRole('list', { name: 'Marcos do projeto' });
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
    expect(within(grid).getAllByRole('listitem')[0]).toContainElement(
      screen.getByRole('button', { name: 'Novo marco' })
    );
    expect(screen.getByRole('heading', { name: 'Visão geral dos marcos' })).toBeInTheDocument();
    expect(screen.getByText('0 marcos')).toBeInTheDocument();
  });

  it('mostra cards com prazo, periodo derivado, progresso e situação textual', async () => {
    const sprints = [
      sprint(1, 'Sprint 01', 'CONCLUIDA'),
      sprint(2, 'Sprint 02', 'PLANEJADA', 5, {
        startDate: '2099-09-10T12:00:00.000Z',
        endDate: '2099-10-02T12:00:00.000Z'
      })
    ];
    setData({ milestones: [marco()], sprints });
    renderScreen();

    const card = (
      await screen.findByRole('heading', { name: 'Fundação do produto', level: 3 })
    ).closest('article');
    expect(within(card).getByText('Em dia')).toBeInTheDocument();
    expect(within(card).getByText(/01\/09 – 02\/10/)).toBeInTheDocument();
    expect(within(card).getByText('50%')).toBeInTheDocument();
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  });

  it('mantém progresso neutro e sem NaN quando não existem Sprints', async () => {
    setData({ milestones: [marco()] });
    renderScreen();
    const progress = await screen.findByRole('progressbar', {
      name: 'Progresso do marco Fundação do produto'
    });
    expect(progress).toHaveAttribute('aria-valuenow', '0');
    expect(progress).toHaveAttribute(
      'aria-valuetext',
      'Sem Sprints vinculadas para calcular o progresso'
    );
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });
});

describe('busca e filtros', () => {
  const other = marco({
    id: 6,
    title: 'Release final',
    description: 'Publicação',
    status: 'CONCLUIDO',
    dueDate: '2099-10-20T18:00:00.000Z'
  });
  const relatedSprints = [
    sprint(1, 'Sprint Login', 'PLANEJADA', 5),
    sprint(2, 'Sprint Release', 'CONCLUIDA', 6)
  ];

  it('filtra por texto e limpa sem esconder o card de criação', async () => {
    const user = userEvent.setup();
    setData({ milestones: [marco(), other], sprints: relatedSprints });
    renderScreen();
    await screen.findByText('Release final');

    await user.type(screen.getByPlaceholderText('Pesquisar marco...'), 'publicacao');
    expect(
      screen.queryByRole('heading', { name: 'Fundação do produto', level: 3 })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Release final')).toBeInTheDocument();
    expect(screen.getByText('1 de 2 marcos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo marco' })).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText('Pesquisar marco...'));
    await user.type(screen.getByPlaceholderText('Pesquisar marco...'), 'inexistente');
    expect(screen.getByText('Nenhum marco corresponde aos filtros.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(
      screen.getByRole('heading', { name: 'Fundação do produto', level: 3 })
    ).toBeInTheDocument();
  });

  it('combina status, prazo e Sprint relacionada via autocomplete', async () => {
    const user = userEvent.setup();
    setData({ milestones: [marco(), other], sprints: relatedSprints });
    renderScreen();
    await screen.findByText('Release final');

    await user.selectOptions(screen.getByLabelText('Status'), 'CONCLUIDO');
    await user.selectOptions(screen.getByLabelText('Situação do prazo'), 'CONCLUIDO');
    fireEvent.change(screen.getByLabelText('Prazo inicial'), { target: { value: '2099-10-01' } });
    fireEvent.change(screen.getByLabelText('Prazo final'), { target: { value: '2099-10-31' } });
    const combobox = screen.getByRole('combobox', { name: 'Sprint relacionada' });
    await user.type(combobox, 'Release');
    await user.click(await screen.findByRole('option', { name: /Sprint Release/ }));

    expect(screen.getByText('Release final')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Fundação do produto', level: 3 })
    ).not.toBeInTheDocument();
    expect(screen.getByText('1 de 2 marcos')).toBeInTheDocument();
  });
});

describe('criação e edição em modal', () => {
  it('abre com foco inicial, fecha no Escape e devolve foco ao card Novo marco', async () => {
    const user = userEvent.setup();
    renderScreen();
    const trigger = await screen.findByRole('button', { name: 'Novo marco' });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Criar marco' });
    await waitFor(() => expect(within(dialog).getByLabelText(/Título/)).toHaveFocus());

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Criar marco' })).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('valida campos obrigatórios, associa várias Sprints e exibe as selecionadas', async () => {
    const user = userEvent.setup();
    const sprints = [
      sprint(1, 'Sprint Login', 'PLANEJADA', null),
      sprint(2, 'Sprint API', 'EM_ANDAMENTO', null)
    ];
    setData({ sprints });
    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Novo marco' }));
    const dialog = screen.getByRole('dialog', { name: 'Criar marco' });

    await user.click(within(dialog).getByRole('button', { name: 'Criar marco' }));
    expect(within(dialog).getByText('Informe o título do marco.')).toBeInTheDocument();
    expect(within(dialog).getByText('Informe a data prevista.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Título/)).toHaveFocus();

    const search = within(dialog).getByRole('combobox', { name: 'Pesquisar Sprints' });
    await user.type(search, 'Sprint');
    await user.click(await within(dialog).findByRole('option', { name: /Sprint Login/ }));
    await user.type(within(dialog).getByRole('combobox', { name: 'Pesquisar Sprints' }), 'Sprint');
    await user.click(await within(dialog).findByRole('option', { name: /Sprint API/ }));
    expect(within(dialog).getByText('Sprints selecionadas (2)')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Remover Sprint Login' })).toBeEnabled();
  });

  it('desabilita Sprint congelada e avisa sobre movimento entre marcos', async () => {
    const user = userEvent.setup();
    const existing = marco({ id: 6, title: 'Marco anterior' });
    const sprints = [
      sprint(1, 'Sprint móvel', 'PLANEJADA', 6),
      sprint(2, 'Sprint congelada', 'CONCLUIDA', 6)
    ];
    setData({ milestones: [existing], sprints });
    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Novo marco' }));
    const dialog = screen.getByRole('dialog', { name: 'Criar marco' });
    const search = within(dialog).getByRole('combobox', { name: 'Pesquisar Sprints' });
    await user.type(search, 'Sprint');

    expect(
      within(dialog).getByText(/Pertence ao Marco Marco anterior — será movida/)
    ).toBeVisible();
    expect(within(dialog).getByRole('option', { name: /Sprint congelada/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('cria, move a Sprint, fecha o modal e atualiza o grid sem reload manual', async () => {
    const user = userEvent.setup();
    const available = sprint(3, 'Sprint disponível', 'PLANEJADA', null);
    const created = marco({ id: 9, title: 'Gestão de Sprints' });
    setData({ sprints: [available] });
    mocks.schedule.createMilestone.mockResolvedValue({ data: { milestone: created } });
    mocks.schedule.listMilestones
      .mockResolvedValueOnce({ data: { total: 0, milestones: [] } })
      .mockResolvedValue({ data: { total: 1, milestones: [created] } });
    mocks.schedule.listSprints
      .mockResolvedValueOnce({ data: { total: 1, sprints: [available] } })
      .mockResolvedValue({
        data: { total: 1, sprints: [{ ...available, milestoneId: 9 }] }
      });
    renderScreen();
    const trigger = await screen.findByRole('button', { name: 'Novo marco' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Criar marco' });
    await user.type(within(dialog).getByLabelText(/Título/), 'Gestão de Sprints');
    fireEvent.change(within(dialog).getByLabelText(/Prazo/), {
      target: { value: '2099-09-30T18:00' }
    });
    await user.type(
      within(dialog).getByRole('combobox', { name: 'Pesquisar Sprints' }),
      'disponível'
    );
    await user.click(await within(dialog).findByRole('option', { name: /Sprint disponível/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Criar marco' }));

    await waitFor(() =>
      expect(mocks.schedule.updateSprint).toHaveBeenCalledWith(3, { milestoneId: 9 })
    );
    expect(await screen.findByText('Marco criado com sucesso.')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Gestão de Sprints', level: 3 })
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Criar marco' })).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('mantém erro da API dentro do modal', async () => {
    const user = userEvent.setup();
    mocks.schedule.createMilestone.mockRejectedValue({
      response: { data: { message: 'Prazo inválido.' } }
    });
    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Novo marco' }));
    const dialog = screen.getByRole('dialog', { name: 'Criar marco' });
    await user.type(within(dialog).getByLabelText(/Título/), 'Entrega');
    fireEvent.change(within(dialog).getByLabelText(/Prazo/), {
      target: { value: '2099-09-30T18:00' }
    });
    await user.click(within(dialog).getByRole('button', { name: 'Criar marco' }));

    expect(await within(dialog).findByText('Prazo inválido.')).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
  });

  it('permite editar marco concluído e preserva Sprint congelada vinculada', async () => {
    const user = userEvent.setup();
    const done = marco({ status: 'CONCLUIDO' });
    const updated = marco({ title: 'Fundação revisada', status: 'CONCLUIDO' });
    const frozen = sprint(1, 'Sprint final', 'CONCLUIDA');
    setData({ milestones: [done], sprints: [frozen] });
    mocks.schedule.updateMilestone.mockResolvedValue({ data: { milestone: updated } });
    renderScreen();
    const { menu } = await openMenu();
    await user.click(
      within(menu).getByRole('menuitem', { name: 'Editar o marco Fundação do produto' })
    );

    const dialog = await screen.findByRole('dialog', { name: 'Editar marco' });
    expect(within(dialog).getByLabelText(/Título/)).toHaveValue('Fundação do produto');
    expect(within(dialog).getByText('Sprints selecionadas (1)')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Remover Sprint final' })).toBeDisabled();

    await user.clear(within(dialog).getByLabelText(/Título/));
    await user.type(within(dialog).getByLabelText(/Título/), 'Fundação revisada');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() =>
      expect(mocks.schedule.updateMilestone).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ title: 'Fundação revisada' })
      )
    );
    expect(await screen.findByText('Marco atualizado com sucesso.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Editar marco' })).not.toBeInTheDocument();
  });
});

describe('modal de Sprints vinculadas', () => {
  it('ordena cronologicamente, mostra status, pontos, progresso e prazo ultrapassado', async () => {
    const user = userEvent.setup();
    const later = sprint(2, 'Sprint posterior', 'PLANEJADA', 5, {
      startDate: '2099-09-20T12:00:00.000Z',
      endDate: '2099-10-05T12:00:00.000Z'
    });
    const first = sprint(1, 'Sprint inicial', 'CONCLUIDA', 5, {
      startDate: '2099-09-01T12:00:00.000Z',
      endDate: '2099-09-10T12:00:00.000Z'
    });
    setData({
      milestones: [marco()],
      sprints: [later, first],
      scheduleSprints: [
        { ...later, tasks: [{ estimatedEffort: 5 }] },
        { ...first, tasks: [{ estimatedEffort: 3 }] }
      ]
    });
    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Sprints' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sprints de Fundação do produto' });
    const list = within(dialog).getByRole('list', { name: 'Sprints de Fundação do produto' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Sprint inicial');
    expect(items[1]).toHaveTextContent('Sprint posterior');
    expect(within(dialog).getByText('50%')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Resumo das Sprints do marco')).toHaveTextContent('8 pts');
    expect(within(dialog).getByText('Termina após o prazo do marco.')).toBeInTheDocument();
  });

  it('apresenta empty state consultivo sem transformar o modal em editor', async () => {
    const user = userEvent.setup();
    setData({ milestones: [marco()] });
    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Sprints' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sprints de Fundação do produto' });
    expect(within(dialog).getByText('Nenhuma Sprint vinculada.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('combobox')).not.toBeInTheDocument();
  });
});

describe('menu, autorização e lifecycle', () => {
  it('não oferece conclusão manual e limita ações do marco aberto ao contrato da UX', async () => {
    setData({ milestones: [marco()] });
    renderScreen();
    const { menu } = await openMenu();
    expect(within(menu).getByRole('menuitem', { name: /Editar/ })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /Excluir/ })).toBeEnabled();
    expect(within(menu).queryByRole('menuitem', { name: /Concluir/ })).not.toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: /Reabrir/ })).not.toBeInTheDocument();
  });

  it('oferece Reabrir apenas quando concluído e executa sem confirmação', async () => {
    const done = marco({ status: 'CONCLUIDO' });
    setData({ milestones: [done] });
    mocks.schedule.updateMilestoneStatus.mockResolvedValue({
      data: { milestone: marco({ status: 'PENDENTE' }) }
    });
    renderScreen();
    const { user, menu } = await openMenu();
    await user.click(within(menu).getByRole('menuitem', { name: /Reabrir o marco/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.schedule.updateMilestoneStatus).toHaveBeenCalledWith(5, 'PENDENTE')
    );
  });

  it('desabilita exclusão no menu quando existem Sprints e explica o motivo', async () => {
    setData({ milestones: [marco()], sprints: [sprint(1, 'Sprint 1')] });
    renderScreen();
    const { menu } = await openMenu();
    const remove = within(menu).getByRole('menuitem', { name: /Excluir o marco/ });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAttribute('title', expect.stringContaining('Mova-as'));
  });

  it('fecha o menu no Escape e devolve foco ao trigger', async () => {
    setData({ milestones: [marco()] });
    renderScreen();
    const { user, trigger } = await openMenu();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('VIEWER consulta Sprints, mas não recebe criação nem mutations', async () => {
    mocks.schedule.getMembership.mockResolvedValue({
      data: { currentMembership: { role: 'VIEWER' } }
    });
    setData({ milestones: [marco()] });
    renderScreen();
    await screen.findByRole('heading', { name: 'Fundação do produto', level: 3 });
    expect(screen.queryByRole('button', { name: 'Novo marco' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mais ações do marco/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sprints' })).toBeInTheDocument();
  });
});

describe('confirmação e reconciliação', () => {
  it('confirma exclusão, remove o card e move foco para a lista estável', async () => {
    const user = userEvent.setup();
    setData({ milestones: [marco()] });
    renderScreen();
    const { menu } = await openMenu();
    await user.click(within(menu).getByRole('menuitem', { name: /Excluir o marco/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Excluir marco?' });
    expect(within(dialog).getByText(/não pode ser desfeita/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Excluir marco' }));

    await waitFor(() => expect(mocks.schedule.removeMilestone).toHaveBeenCalledWith(5));
    expect(screen.queryByText('Fundação do produto')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Marcos do projeto' }).closest('section')
      ).toHaveFocus()
    );
  });

  it('mantém sucesso da criação quando apenas o refresh falha', async () => {
    const user = userEvent.setup();
    const created = marco({ id: 9, title: 'Entrega confirmada' });
    mocks.schedule.createMilestone.mockResolvedValue({ data: { milestone: created } });
    renderScreen();
    const trigger = await screen.findByRole('button', { name: 'Novo marco' });
    mocks.schedule.listMilestones.mockRejectedValue(new Error('rede'));
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Criar marco' });
    await user.type(within(dialog).getByLabelText(/Título/), 'Entrega confirmada');
    fireEvent.change(within(dialog).getByLabelText(/Prazo/), {
      target: { value: '2099-09-30T18:00' }
    });
    await user.click(within(dialog).getByRole('button', { name: 'Criar marco' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/ação foi concluída/i);
    expect(screen.queryByText('Não foi possível salvar o marco.')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Entrega confirmada', level: 3 })
    ).toBeInTheDocument();
  });

  it('declara sucesso parcial quando uma reassociação de Sprint falha', async () => {
    const user = userEvent.setup();
    const available = sprint(3, 'Sprint disponível', 'PLANEJADA', null);
    const created = marco({ id: 9, title: 'Entrega parcial' });
    setData({ sprints: [available] });
    mocks.schedule.createMilestone.mockResolvedValue({ data: { milestone: created } });
    mocks.schedule.updateSprint.mockRejectedValue(new Error('conflito'));
    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Novo marco' }));
    const dialog = screen.getByRole('dialog', { name: 'Criar marco' });
    await user.type(within(dialog).getByLabelText(/Título/), 'Entrega parcial');
    fireEvent.change(within(dialog).getByLabelText(/Prazo/), {
      target: { value: '2099-09-30T18:00' }
    });
    await user.type(
      within(dialog).getByRole('combobox', { name: 'Pesquisar Sprints' }),
      'disponível'
    );
    await user.click(await within(dialog).findByRole('option', { name: /Sprint disponível/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Criar marco' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Marco salvo, mas não foi possível atualizar todas as Sprints/
    );
    expect(screen.queryByText('Não foi possível salvar o marco.')).not.toBeInTheDocument();
  });
});
