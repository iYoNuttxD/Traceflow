import { render, screen, waitFor, within } from '@testing-library/react';
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
  generatedAt: '2026-08-05T12:00:00.000Z',
  sprints: [],
  milestones: [],
  unassignedTasks: []
};

const marco = (overrides = {}) => ({
  id: 5,
  title: 'Fundação do produto',
  description: 'Cadastro e quadro operacionais.',
  dueDate: '2026-09-04T00:00:00.000Z',
  status: 'PENDENTE',
  ...overrides
});

const sprint = (id, name, status, milestoneId = 5) => ({
  id,
  name,
  objective: null,
  startDate: '2026-08-01T00:00:00.000Z',
  endDate: '2026-08-14T00:00:00.000Z',
  status,
  milestoneId
});

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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.projects.get.mockResolvedValue({ data: { project: { id: 1, name: 'TraceFlow' } } });
  mocks.schedule.getSchedule.mockResolvedValue({ data: emptySchedule });
  mocks.schedule.listSprints.mockResolvedValue({ data: { total: 0, sprints: [] } });
  mocks.schedule.listMilestones.mockResolvedValue({ data: { total: 0, milestones: [] } });
  mocks.schedule.getMembership.mockResolvedValue({
    data: { currentMembership: { role: 'OWNER' } }
  });
});

describe('estados da tela', () => {
  it('exibe carregamento antes dos dados', () => {
    mocks.projects.get.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByText('Carregando marcos...')).toBeInTheDocument();
  });

  it('exibe estado vazio quando nao ha marcos', async () => {
    renderScreen();
    expect(await screen.findByText('Nenhum marco cadastrado.')).toBeInTheDocument();
  });

  it('exibe acesso negado em 403', async () => {
    mocks.projects.get.mockRejectedValue({ response: { status: 403, data: {} } });
    renderScreen();
    expect(await screen.findByRole('heading', { name: 'Acesso restrito' })).toBeInTheDocument();
  });

  it('exibe erro recuperavel em falha generica', async () => {
    mocks.projects.get.mockRejectedValue({ response: { status: 500, data: {} } });
    renderScreen();
    expect(await screen.findByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});

describe('progresso por sprints', () => {
  beforeEach(() => {
    mocks.schedule.listMilestones.mockResolvedValue({ data: { total: 1, milestones: [marco()] } });
  });

  it('conta as sprints concluidas do marco', async () => {
    mocks.schedule.listSprints.mockResolvedValue({
      data: {
        total: 3,
        sprints: [
          sprint(1, 'Sprint 1', 'CONCLUIDA'),
          sprint(2, 'Sprint 2', 'EM_ANDAMENTO'),
          sprint(3, 'Sprint 3', 'PLANEJADA')
        ]
      }
    });
    renderScreen();
    expect(await screen.findByText('1 de 3 sprints concluídas')).toBeInTheDocument();
  });

  it('ignora sprint cancelada na contagem', async () => {
    mocks.schedule.listSprints.mockResolvedValue({
      data: {
        total: 2,
        sprints: [sprint(1, 'Sprint 1', 'CONCLUIDA'), sprint(2, 'Sprint 2', 'CANCELADA')]
      }
    });
    renderScreen();
    expect(await screen.findByText('1 de 1 sprint concluída')).toBeInTheDocument();
  });

  it('lista cada sprint do marco com o proprio status', async () => {
    mocks.schedule.listSprints.mockResolvedValue({
      data: {
        total: 2,
        sprints: [sprint(1, 'Sprint 1', 'CONCLUIDA'), sprint(2, 'Sprint 2', 'PLANEJADA')]
      }
    });
    renderScreen();
    expect(await screen.findByText('Sprint 1 · Concluída')).toBeInTheDocument();
    expect(screen.getByText('Sprint 2 · Planejada')).toBeInTheDocument();
  });

  it('nao atribui ao marco sprints de outro marco', async () => {
    mocks.schedule.listSprints.mockResolvedValue({
      data: { total: 1, sprints: [sprint(1, 'De outro marco', 'CONCLUIDA', 99)] }
    });
    renderScreen();
    expect(await screen.findByText('0 de 0 sprints concluídas')).toBeInTheDocument();
    const lista = screen.getByRole('list', { name: 'Marcos do projeto' });
    expect(within(lista).queryByText(/De outro marco/)).toBeNull();
  });
});

describe('conclusao automatica', () => {
  it('explica a conclusao quando todas as sprints terminaram', async () => {
    mocks.schedule.listMilestones.mockResolvedValue({
      data: { total: 1, milestones: [marco({ status: 'CONCLUIDO' })] }
    });
    mocks.schedule.listSprints.mockResolvedValue({
      data: { total: 1, sprints: [sprint(1, 'Sprint 1', 'CONCLUIDA')] }
    });
    renderScreen();
    expect(
      await screen.findByText(/Concluído automaticamente — todas as sprints/)
    ).toBeInTheDocument();
  });

  it('nao chama de automatica a conclusao manual', async () => {
    mocks.schedule.listMilestones.mockResolvedValue({
      data: { total: 1, milestones: [marco({ status: 'CONCLUIDO' })] }
    });
    mocks.schedule.listSprints.mockResolvedValue({
      data: { total: 1, sprints: [sprint(1, 'Sprint 1', 'EM_ANDAMENTO')] }
    });
    renderScreen();
    await screen.findByText('Fundação do produto');
    expect(screen.queryByText(/Concluído automaticamente/)).toBeNull();
    expect(screen.getByText('Concluído manualmente.')).toBeInTheDocument();
  });

  it('avisa antes de concluir a mao um marco com sprints abertas', async () => {
    const user = userEvent.setup();
    mocks.schedule.listMilestones.mockResolvedValue({ data: { total: 1, milestones: [marco()] } });
    mocks.schedule.listSprints.mockResolvedValue({
      data: { total: 2, sprints: [sprint(1, 'S1', 'CONCLUIDA'), sprint(2, 'S2', 'EM_ANDAMENTO')] }
    });
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /^Concluir o marco/ }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/1 sprint\(s\) deste marco ainda não foram concluídas/)
    ).toBeInTheDocument();
    expect(mocks.schedule.updateMilestoneStatus).not.toHaveBeenCalled();
  });

  it('confirma a conclusao manual mesmo com todas as sprints terminadas', async () => {
    const user = userEvent.setup();
    mocks.schedule.listMilestones.mockResolvedValue({ data: { total: 1, milestones: [marco()] } });
    mocks.schedule.listSprints.mockResolvedValue({
      data: { total: 1, sprints: [sprint(1, 'S1', 'CONCLUIDA')] }
    });
    mocks.schedule.updateMilestoneStatus.mockResolvedValue({
      data: { milestone: marco({ status: 'CONCLUIDO' }) }
    });
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /^Concluir o marco/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText(/ainda não foram concluídas/)).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Concluir marco' }));
    await waitFor(() =>
      expect(mocks.schedule.updateMilestoneStatus).toHaveBeenCalledWith(5, 'CONCLUIDO')
    );
  });
});

describe('exclusao', () => {
  it('desabilita a exclusao e explica quando o marco tem sprints', async () => {
    mocks.schedule.listMilestones.mockResolvedValue({ data: { total: 1, milestones: [marco()] } });
    mocks.schedule.listSprints.mockResolvedValue({
      data: { total: 1, sprints: [sprint(1, 'S1', 'PLANEJADA')] }
    });
    renderScreen();

    const botao = await screen.findByRole('button', { name: /^Excluir o marco/ });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute('title', expect.stringContaining('Mova-as para outro marco'));
  });

  it('permite excluir marco sem sprints', async () => {
    mocks.schedule.listMilestones.mockResolvedValue({ data: { total: 1, milestones: [marco()] } });
    renderScreen();
    expect(await screen.findByRole('button', { name: /^Excluir o marco/ })).toBeEnabled();
  });
});

describe('rodape e sinalizacoes do marco (design de 24/08)', () => {
  it('marco sem sprints diz onde o vinculo e declarado', async () => {
    mocks.schedule.listMilestones.mockResolvedValue({ data: { total: 1, milestones: [marco()] } });
    renderScreen();
    expect(
      await screen.findByText(/Nenhuma sprint associada — cadastre sprints vinculadas/)
    ).toBeInTheDocument();
  });

  it('marco concluido manualmente enche a barra mesmo com sprint aberta', async () => {
    mocks.schedule.listMilestones.mockResolvedValue({
      data: { total: 1, milestones: [marco({ status: 'CONCLUIDO' })] }
    });
    mocks.schedule.listSprints.mockResolvedValue({
      data: { total: 2, sprints: [sprint(1, 'S1', 'CONCLUIDA'), sprint(2, 'S2', 'EM_ANDAMENTO')] }
    });
    const { container } = renderScreen();
    await screen.findByText('Concluído manualmente.');
    const preenchimento = container.querySelector('.traceability-progress-bar span');
    expect(preenchimento).toHaveStyle({ width: '100%' });
  });

  it('reabrir dispensa confirmacao — e reversivel e nao afirma entrega', async () => {
    const user = userEvent.setup();
    mocks.schedule.listMilestones.mockResolvedValue({
      data: { total: 1, milestones: [marco({ status: 'CONCLUIDO' })] }
    });
    mocks.schedule.updateMilestoneStatus.mockResolvedValue({
      data: { milestone: marco({ status: 'PENDENTE' }) }
    });
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /^Reabrir o marco/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.schedule.updateMilestoneStatus).toHaveBeenCalledWith(5, 'PENDENTE')
    );
  });

  it('o dialogo de concluir usa o botao primario — confirmar nao e destrutivo', async () => {
    const user = userEvent.setup();
    mocks.schedule.listMilestones.mockResolvedValue({ data: { total: 1, milestones: [marco()] } });
    mocks.schedule.listSprints.mockResolvedValue({
      data: { total: 1, sprints: [sprint(1, 'S1', 'EM_ANDAMENTO')] }
    });
    renderScreen();

    await user.click(await screen.findByRole('button', { name: /^Concluir o marco/ }));
    const dialog = await screen.findByRole('dialog');
    const confirmar = within(dialog).getByRole('button', { name: 'Concluir marco' });
    expect(confirmar).toHaveClass('button-primary');
    expect(confirmar).not.toHaveClass('button-danger');
    expect(within(dialog).getByRole('button', { name: 'Voltar' })).toBeInTheDocument();
  });
});

describe('formulario de marco', () => {
  const grupoDeSprints = async () => screen.findByRole('group', { name: 'Sprints do marco' });

  it('oferece as sprints do projeto como caixas de selecao', async () => {
    mocks.schedule.listSprints.mockResolvedValue({
      data: { total: 1, sprints: [sprint(1, 'S1', 'PLANEJADA', null)] }
    });
    renderScreen();
    await screen.findByText('Nenhum marco cadastrado.');

    const grupo = await grupoDeSprints();
    expect(within(grupo).getByRole('checkbox', { name: 'S1 — Planejada' })).toBeInTheDocument();
    expect(within(grupo).getByText('0 sprints selecionadas')).toBeInTheDocument();
    expect(
      screen.getByText(/Um marco pode ter várias sprints e é concluído automaticamente/)
    ).toBeInTheDocument();
  });

  it('sem sprints o bloco explica o vazio', async () => {
    renderScreen();
    await screen.findByText('Nenhum marco cadastrado.');
    const grupo = await grupoDeSprints();
    expect(within(grupo).getByText('Nenhuma sprint cadastrada neste projeto.')).toBeInTheDocument();
  });

  it('sprint congelada aparece marcada no proprio marco, sem poder sair', async () => {
    const user = userEvent.setup();
    mocks.schedule.listMilestones.mockResolvedValue({ data: { total: 1, milestones: [marco()] } });
    mocks.schedule.listSprints.mockResolvedValue({
      data: {
        total: 2,
        sprints: [sprint(1, 'Velha', 'CONCLUIDA', 5), sprint(2, 'Ativa', 'EM_ANDAMENTO', 5)]
      }
    });
    renderScreen();

    await user.click(
      await screen.findByRole('button', { name: 'Editar o marco Fundação do produto' })
    );

    const grupo = await grupoDeSprints();
    const congelada = within(grupo).getByRole('checkbox', { name: /Velha — Concluída/ });
    expect(congelada).toBeChecked();
    expect(congelada).toBeDisabled();
    expect(within(grupo).getByText('Congelada — não pode mudar de marco')).toBeInTheDocument();
    expect(within(grupo).getByRole('checkbox', { name: /Ativa — Em andamento/ })).toBeChecked();
    expect(within(grupo).getByText('1 sprint selecionada')).toBeInTheDocument();
  });

  it('avisa que marcar sprint de outro marco move a sprint', async () => {
    mocks.schedule.listMilestones.mockResolvedValue({ data: { total: 1, milestones: [marco()] } });
    mocks.schedule.listSprints.mockResolvedValue({
      data: { total: 1, sprints: [sprint(2, 'Alheia', 'PLANEJADA', 5)] }
    });
    renderScreen();

    const grupo = await grupoDeSprints();
    expect(
      within(grupo).getByText(
        'Atualmente no marco Fundação do produto — marcar move a sprint para cá'
      )
    ).toBeInTheDocument();
  });

  it('criar marco ja leva as sprints marcadas para ele', async () => {
    const user = userEvent.setup();
    mocks.schedule.createMilestone.mockResolvedValue({ data: { milestone: { id: 9 } } });
    mocks.schedule.updateSprint.mockResolvedValue({ data: {} });
    mocks.schedule.listSprints.mockResolvedValue({
      data: { total: 1, sprints: [sprint(3, 'Livre', 'PLANEJADA', null)] }
    });
    renderScreen();
    await screen.findByText('Nenhum marco cadastrado.');

    const grupo = await grupoDeSprints();
    await user.click(within(grupo).getByRole('checkbox', { name: /Livre/ }));
    await user.type(screen.getByLabelText(/Título/), 'Gestão de sprints');
    await user.type(screen.getByLabelText(/Prazo/), '2026-09-04T18:00');
    await user.click(screen.getByRole('button', { name: 'Salvar marco' }));

    await waitFor(() =>
      expect(mocks.schedule.updateSprint).toHaveBeenCalledWith(3, { milestoneId: 9 })
    );
    expect(await screen.findByText('Marco cadastrado com sucesso.')).toBeInTheDocument();
  });

  it('salvar a edicao move as marcadas e solta as desmarcadas', async () => {
    const user = userEvent.setup();
    mocks.schedule.updateMilestone.mockResolvedValue({ data: {} });
    mocks.schedule.updateSprint.mockResolvedValue({ data: {} });
    mocks.schedule.listMilestones.mockResolvedValue({ data: { total: 1, milestones: [marco()] } });
    mocks.schedule.listSprints.mockResolvedValue({
      data: {
        total: 2,
        sprints: [sprint(2, 'Ativa', 'EM_ANDAMENTO', 5), sprint(3, 'Livre', 'PLANEJADA', null)]
      }
    });
    renderScreen();

    await user.click(
      await screen.findByRole('button', { name: 'Editar o marco Fundação do produto' })
    );
    const grupo = await grupoDeSprints();
    await user.click(within(grupo).getByRole('checkbox', { name: /Ativa/ }));
    await user.click(within(grupo).getByRole('checkbox', { name: /Livre/ }));
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() =>
      expect(mocks.schedule.updateSprint).toHaveBeenCalledWith(3, { milestoneId: 5 })
    );
    expect(mocks.schedule.updateSprint).toHaveBeenCalledWith(2, { milestoneId: null });
    expect(mocks.schedule.updateSprint).toHaveBeenCalledTimes(2);
    expect(mocks.schedule.updateMilestone).toHaveBeenCalledTimes(1);
  });

  it('sprint que nao mudou de marco e sprint congelada nao geram requisicao', async () => {
    const user = userEvent.setup();
    mocks.schedule.updateMilestone.mockResolvedValue({ data: {} });
    mocks.schedule.updateSprint.mockResolvedValue({ data: {} });
    mocks.schedule.listMilestones.mockResolvedValue({ data: { total: 1, milestones: [marco()] } });
    mocks.schedule.listSprints.mockResolvedValue({
      data: {
        total: 2,
        sprints: [sprint(2, 'Permanece', 'PLANEJADA', 5), sprint(3, 'Velha', 'CONCLUIDA', 5)]
      }
    });
    renderScreen();

    await user.click(
      await screen.findByRole('button', { name: 'Editar o marco Fundação do produto' })
    );
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(mocks.schedule.updateMilestone).toHaveBeenCalledTimes(1));
    expect(mocks.schedule.updateSprint).not.toHaveBeenCalled();
  });

  it('valida titulo e prazo sem chamar a API', async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText('Nenhum marco cadastrado.');

    await user.click(screen.getByRole('button', { name: 'Salvar marco' }));
    expect(await screen.findByText('Informe o título do marco.')).toBeInTheDocument();
    expect(screen.getByText('Informe a data prevista.')).toBeInTheDocument();
    expect(mocks.schedule.createMilestone).not.toHaveBeenCalled();
  });

  it('envia titulo, descricao e prazo', async () => {
    const user = userEvent.setup();
    mocks.schedule.createMilestone.mockResolvedValue({ data: {} });
    renderScreen();
    await screen.findByText('Nenhum marco cadastrado.');

    await user.type(screen.getByLabelText(/Título/), 'Gestão de sprints');
    await user.type(screen.getByLabelText(/Descrição/), 'Ciclo completo.');
    await user.type(screen.getByLabelText(/Prazo/), '2026-09-04T18:00');
    await user.click(screen.getByRole('button', { name: 'Salvar marco' }));

    await waitFor(() =>
      expect(mocks.schedule.createMilestone).toHaveBeenCalledWith('1', {
        title: 'Gestão de sprints',
        description: 'Ciclo completo.',
        dueDate: new Date('2026-09-04T18:00').toISOString()
      })
    );
  });

  it('aceita prazo fora do periodo de qualquer sprint', async () => {
    const user = userEvent.setup();
    mocks.schedule.createMilestone.mockResolvedValue({ data: {} });
    mocks.schedule.listSprints.mockResolvedValue({
      data: { total: 1, sprints: [sprint(1, 'S1', 'PLANEJADA')] }
    });
    renderScreen();
    await screen.findByText('Nenhum marco cadastrado.');

    await user.type(screen.getByLabelText(/Título/), 'Muito depois');
    await user.type(screen.getByLabelText(/Prazo/), '2027-06-30T12:00');
    await user.click(screen.getByRole('button', { name: 'Salvar marco' }));

    await waitFor(() => expect(mocks.schedule.createMilestone).toHaveBeenCalledTimes(1));
  });

  it('editar leva o foco ao formulario preenchido', async () => {
    const user = userEvent.setup();
    mocks.schedule.listMilestones.mockResolvedValue({
      data: { total: 1, milestones: [marco()] }
    });
    renderScreen();

    await user.click(
      await screen.findByRole('button', { name: 'Editar o marco Fundação do produto' })
    );

    const titulo = screen.getByLabelText(/Título/);
    expect(titulo).toHaveValue('Fundação do produto');
    await waitFor(() => expect(titulo).toHaveFocus());
  });

  it('cancelar edicao devolve o foco ao formulario', async () => {
    const user = userEvent.setup();
    mocks.schedule.listMilestones.mockResolvedValue({
      data: { total: 1, milestones: [marco()] }
    });
    renderScreen();

    await user.click(
      await screen.findByRole('button', { name: 'Editar o marco Fundação do produto' })
    );
    await user.click(screen.getByRole('button', { name: 'Cancelar edição' }));

    const titulo = screen.getByLabelText(/Título/);
    expect(titulo).toHaveValue('');
    await waitFor(() => expect(titulo).toHaveFocus());
  });
});

describe('perfil somente leitura', () => {
  beforeEach(() => {
    mocks.schedule.getMembership.mockResolvedValue({
      data: { currentMembership: { role: 'VIEWER' } }
    });
    mocks.schedule.listMilestones.mockResolvedValue({ data: { total: 1, milestones: [marco()] } });
  });

  it('nao oferece formulario nem acoes', async () => {
    renderScreen();
    await screen.findByText('Fundação do produto');
    expect(screen.queryByRole('button', { name: 'Salvar marco' })).toBeNull();
    const lista = screen.getByRole('list', { name: 'Marcos do projeto' });
    expect(within(lista).queryByRole('button')).toBeNull();
  });
});
