// RF10: tela de Marcos depois da inversao (ADR-011). O marco agrupa sprints, tem
// prazo proprio e nao congela junto com nenhuma delas.
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
});

describe('progresso por sprints', () => {
  beforeEach(() => {
    mocks.schedule.listMilestones.mockResolvedValue({ data: { total: 1, milestones: [marco()] } });
  });

  // O numero e a barra dizem a mesma coisa; a barra so acelera a leitura. Sem o
  // texto, "metade preenchida" exigiria medir pixel.
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

  // Cancelada sai das duas pontas: nao foi entregue nem esta pendente
  // (ADR-011 D05).
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
    expect(screen.queryByText(/De outro marco/)).toBeNull();
  });
});

describe('conclusao automatica', () => {
  // O marco aparece concluido sem que ninguem tenha clicado em concluir: sem a
  // nota, a tela parece ter feito algo por conta propria.
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

  // Concluido a mao com sprint aberta nao e automatico: dizer que foi mentiria
  // sobre como o estado chegou ali.
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
    expect(within(dialog).getByText(/ainda tem 1 sprint\(s\)/)).toBeInTheDocument();
    expect(mocks.schedule.updateMilestoneStatus).not.toHaveBeenCalled();
  });

  it('conclui direto quando todas as sprints ja terminaram', async () => {
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
    await waitFor(() =>
      expect(mocks.schedule.updateMilestoneStatus).toHaveBeenCalledWith(5, 'CONCLUIDO')
    );
  });
});

describe('exclusao', () => {
  // A FK e SetNull: a recusa do backend e a unica protecao do agrupamento, e
  // desabilitar aqui evita transformar a regra numa descoberta pelo 409.
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

describe('formulario de marco', () => {
  // O campo de sprint saiu (ADR-011 D01): quem declara o vinculo e a sprint.
  it('nao oferece campo de sprint', async () => {
    renderScreen();
    await screen.findByText('Nenhum marco cadastrado.');
    expect(screen.queryByLabelText(/Sprint/)).toBeNull();
    expect(
      screen.getByText(/Um marco pode ter várias sprints e é concluído automaticamente/)
    ).toBeInTheDocument();
  });

  it('valida titulo e prazo sem chamar a API', async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText('Nenhum marco cadastrado.');

    await user.click(screen.getByRole('button', { name: 'Cadastrar marco' }));
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
    await user.click(screen.getByRole('button', { name: 'Cadastrar marco' }));

    await waitFor(() =>
      expect(mocks.schedule.createMilestone).toHaveBeenCalledWith('1', {
        title: 'Gestão de sprints',
        description: 'Ciclo completo.',
        dueDate: new Date('2026-09-04T18:00').toISOString()
      })
    );
  });

  // O prazo do marco nao depende de janela nenhuma (ADR-011 D03).
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
    await user.click(screen.getByRole('button', { name: 'Cadastrar marco' }));

    await waitFor(() => expect(mocks.schedule.createMilestone).toHaveBeenCalledTimes(1));
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
    expect(screen.queryByRole('button', { name: 'Cadastrar marco' })).toBeNull();
    const lista = screen.getByRole('list', { name: 'Marcos do projeto' });
    expect(within(lista).queryByRole('button')).toBeNull();
  });
});
