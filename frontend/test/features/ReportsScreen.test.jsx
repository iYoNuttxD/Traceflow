import { MemoryRouter, Route, Routes } from 'react-router';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  projects: vi.fn(),
  members: vi.fn(),
  sprints: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  downloadPdf: vi.fn()
}));
vi.mock('../../src/features/projects/index.js', async (original) => ({
  ...(await original()),
  useProjectsCatalog: mocks.projects
}));
vi.mock('../../src/features/members/index.js', () => ({ membersApi: { list: mocks.members } }));
vi.mock('../../src/features/schedule/api/schedule.api.js', () => ({
  scheduleApi: { listSprints: mocks.sprints }
}));
vi.mock('../../src/features/reports/api/reports.api.js', () => ({
  reportsApi: {
    list: mocks.list,
    create: mocks.create,
    get: mocks.get,
    downloadPdf: mocks.downloadPdf
  }
}));
import { ReportsPage } from '../../src/pages/ReportsPage.jsx';

const requester = { userId: 7, displayName: 'Ana Congelada', username: 'ana' };
const report = (overrides = {}) => ({
  id: 3,
  projectId: 1,
  status: 'SUCCEEDED',
  filters: { startDate: '2026-09-01', endDate: '2026-09-30', timeZone: 'UTC', sprintId: null },
  requestedBy: requester,
  snapshotVersion: 1,
  createdAt: '2026-10-14T12:00:00.000Z',
  startedAt: '2026-10-14T12:00:01.000Z',
  finishedAt: '2026-10-14T12:00:05.000Z',
  durationMs: 4000,
  error: null,
  ...overrides
});
const listed = (items) => ({
  items,
  pagination: { page: 1, limit: 12, total: items.length, totalPages: 1 }
});
const snapshot = {
  schemaVersion: 1,
  generatedAt: '2026-10-14T12:00:01.000Z',
  project: { id: 1, name: 'Projeto Relatado' },
  filters: {
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    timeZone: 'UTC',
    sprintId: null,
    sprint: null
  },
  planning: {
    range: { from: '2026-09-01', to: '2026-09-30' },
    sprints: [
      {
        id: 9,
        name: 'Sprint Um',
        status: 'EM_ANDAMENTO',
        startDate: '2026-09-01T00:00:00.000Z',
        endDate: '2026-09-30T00:00:00.000Z',
        milestone: { id: 2, title: 'Marco A' },
        taskCount: 4,
        progress: {
          current: { numerator: 2, denominator: 4, percentage: 50 },
          burndown: { hasData: false }
        }
      }
    ],
    milestones: [
      {
        id: 2,
        title: 'Marco A',
        dueDate: '2026-09-29T12:00:00.000Z',
        status: 'PENDENTE',
        overdue: false,
        sprintCount: 1
      }
    ],
    unassignedTaskCount: 1
  },
  traceability: {
    scope: 'CURRENT',
    summary: { total: 1, withDefect: 0, bySituation: { EM_DESENVOLVIMENTO: 1 } },
    items: [
      {
        requirement: { id: 5, displayId: 'REQ-5', title: 'Relatórios' },
        situation: 'EM_DESENVOLVIMENTO',
        progress: { numerator: 1, denominator: 2, percentage: 50 },
        validation: { testCasesTotal: 0 },
        defects: { open: 0, inCorrection: 0, waitingRetest: 0 }
      }
    ]
  },
  indicators: {
    views: [
      {
        view: 'GENERAL',
        projectHealth: { score: 58.6, status: 'CRITICAL' },
        sections: [
          {
            id: 'summary',
            indicators: [
              { metricId: 'I01', value: 50, state: 'AVAILABLE', limitations: [] },
              {
                metricId: 'I28',
                value: 1,
                state: 'AVAILABLE',
                limitations: [],
                items: [{ taskId: 1, title: 'Tarefa atrasada', responsible: { userId: 7 } }]
              },
              { metricId: 'I22', value: null, state: 'UNAVAILABLE', points: [{}, {}] },
              {
                metricId: 'I61',
                value: 80,
                state: 'AVAILABLE',
                limitations: [],
                assessment: {
                  status: 'HEALTHY',
                  reasonCode: 'DIRECT_PERCENT',
                  basis: { value: 80 }
                }
              },
              {
                metricId: 'I66',
                value: 20,
                state: 'AVAILABLE',
                limitations: [],
                assessment: {
                  status: 'CRITICAL',
                  reasonCode: 'STAGE_GAP',
                  basis: { current: 20, expected: 50, gapPoints: 30 },
                  reference: { label: 'Progresso do projeto', unit: 'PERCENT', value: 50 },
                  delta: { unit: 'PERCENTAGE_POINTS', value: -30 }
                }
              }
            ]
          }
        ]
      }
    ],
    catalog: [
      { metricId: 'I01', title: 'Progresso atual do projeto', unit: 'PERCENT', rf: 'RF15' },
      { metricId: 'I28', title: 'Tasks atrasadas', unit: 'COUNT' },
      { metricId: 'I22', title: 'Throughput', unit: 'COUNT' },
      { metricId: 'I61', title: 'Cobertura por Tasks', unit: 'PERCENT', rf: 'RF56' },
      { metricId: 'I66', title: 'Implementação', unit: 'PERCENT', rf: null }
    ]
  }
};

function page(path = '/projects/1/reports') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/projects/:projectId/reports" element={<ReportsPage />} />
        <Route path="/projects/:projectId/reports/:reportId" element={<ReportsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  window.matchMedia.mockImplementation((media) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
  mocks.projects.mockReturnValue({
    projects: [{ id: 1, name: 'Projeto Relatado' }],
    loading: false,
    error: null,
    refreshProjects: vi.fn()
  });
  mocks.members.mockResolvedValue({ members: [], currentMembership: { role: 'MEMBER' } });
  mocks.sprints.mockResolvedValue({ data: { sprints: [{ id: 9, name: 'Sprint Um' }] } });
  mocks.list.mockResolvedValue(listed([report()]));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('S2-06 — lista de relatórios', () => {
  it('mostra o card com período, solicitante congelado e acesso ao relatório pronto', async () => {
    page();
    const card = await screen.findByRole('article', { name: 'Relatório #3' });
    expect(within(card).getByText('Pronto')).toBeInTheDocument();
    expect(within(card).getByText('01/09/2026 a 30/09/2026')).toBeInTheDocument();
    expect(within(card).getByText('Ana Congelada (@ana)')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Abrir relatório' })).toHaveAttribute(
      'href',
      '/projects/1/reports/3'
    );
    expect(screen.getByRole('link', { name: 'Relatórios' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('VIEWER lê a lista mas não vê a ação de gerar', async () => {
    mocks.members.mockResolvedValue({ members: [], currentMembership: { role: 'VIEWER' } });
    page();
    await screen.findByRole('article', { name: 'Relatório #3' });
    await waitFor(() => expect(mocks.members).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Gerar relatório/ })).not.toBeInTheDocument();
  });

  it('falha registrada aparece no card sem botão de abrir', async () => {
    mocks.list.mockResolvedValue(
      listed([
        report({
          status: 'FAILED',
          finishedAt: null,
          error: { code: 'REPORT_TIMEOUT', message: 'A geração excedeu o tempo máximo.' }
        })
      ])
    );
    page();
    const card = await screen.findByRole('article', { name: 'Relatório #3' });
    expect(within(card).getByText('Falhou')).toBeInTheDocument();
    expect(within(card).getByText('A geração excedeu o tempo máximo.')).toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: 'Abrir relatório' })).not.toBeInTheDocument();
  });

  it('acompanha a geração ativa até ficar pronta', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.list
      .mockResolvedValueOnce(listed([report({ status: 'RUNNING', finishedAt: null })]))
      .mockResolvedValue(listed([report()]));
    page();
    const card = await screen.findByRole('article', { name: 'Relatório #3' });
    expect(within(card).getByText('Gerando')).toBeInTheDocument();
    // O intervalo só é agendado depois que a lista ativa é aplicada; avança em passos
    // até a segunda leitura, sem depender do tempo real sob carga.
    await waitFor(
      async () => {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(500);
        });
        expect(mocks.list).toHaveBeenCalledTimes(2);
      },
      { timeout: 10000 }
    );
    expect(await within(card).findByText('Pronto')).toBeInTheDocument();
  });

  it('não continua consultando quando nenhuma geração está ativa', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    page();
    await screen.findByRole('article', { name: 'Relatório #3' });
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });
});

describe('S2-06 — resumo da página', () => {
  it('mostra os totais do projeto no mesmo painel das outras abas', async () => {
    mocks.list.mockResolvedValue({
      ...listed([report()]),
      summary: {
        total: 5,
        succeeded: 3,
        active: 1,
        failed: 1,
        latestSucceeded: { id: 3, finishedAt: '2026-10-14T12:00:05.000Z' }
      }
    });
    page();
    const summary = await screen.findByRole('region', { name: 'Resumo dos relatórios' });
    expect(
      within(summary).getByRole('heading', { name: 'Visão geral dos relatórios' })
    ).toBeInTheDocument();
    // O painel aparece em carregamento antes da lista chegar; espera os totais.
    await waitFor(() => expect(summary).toHaveTextContent('Total5relatórios gerados'));
    for (const text of [
      'Total5relatórios gerados',
      'Prontos3Disponíveis para baixar em PDF',
      'Em geração1Na fila ou gerando agora',
      'Com falha1Removidos 180 dias após a falha',
      'Relatório #3'
    ])
      expect(summary).toHaveTextContent(text);
  });

  it('sem relatórios, mantém resumo e criação sem mensagem vazia adicional', async () => {
    const user = userEvent.setup();
    mocks.list.mockResolvedValue({
      ...listed([]),
      summary: { total: 0, succeeded: 0, active: 0, failed: 0, latestSucceeded: null }
    });
    page();
    const summary = await screen.findByRole('region', { name: 'Resumo dos relatórios' });
    await waitFor(() => expect(summary).toHaveTextContent('Nenhuma geração ativa'));
    expect(summary).toHaveTextContent('NenhumGere um relatório para começar');
    expect(screen.queryByText('Nenhum relatório gerado neste projeto.')).not.toBeInTheDocument();
    expect(document.querySelector('.report-empty-panel')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Gerar relatório/ }));
    expect(await screen.findByRole('dialog', { name: 'Gerar relatório' })).toBeVisible();
  });
});

describe('S2-06 — filtros da lista', () => {
  const lastParams = () => mocks.list.mock.calls.at(-1)[1];

  async function openFilters(user) {
    await screen.findByRole('article', { name: 'Relatório #3' });
    await user.click(screen.getByRole('button', { name: /Buscar e filtrar/ }));
  }

  it('envia situação, Sprint, solicitante e período para a API', async () => {
    const user = userEvent.setup();
    mocks.members.mockResolvedValue({
      members: [{ user: { id: 7, name: 'Ana Atual', username: 'ana' } }],
      currentMembership: { role: 'MEMBER' }
    });
    page();
    await openFilters(user);
    expect(screen.getByText('1 relatório')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Situação'), 'SUCCEEDED');
    await waitFor(() => expect(lastParams()).toMatchObject({ status: 'SUCCEEDED' }));
    await user.selectOptions(screen.getByLabelText('Sprint'), '9');
    await waitFor(() => expect(lastParams()).toMatchObject({ sprintId: '9' }));
    await screen.findByRole('option', { name: 'Ana Atual (@ana)' });
    await user.selectOptions(screen.getByLabelText('Solicitado por'), '7');
    await waitFor(() => expect(lastParams()).toMatchObject({ requestedByUserId: '7' }));
    await user.type(screen.getByLabelText('Data inicial'), '2026-09-01');
    await user.type(screen.getByLabelText('Data final'), '2026-09-30');
    await waitFor(() =>
      expect(lastParams()).toEqual({
        status: 'SUCCEEDED',
        sprintId: '9',
        requestedByUserId: '7',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        page: 1,
        limit: 12
      })
    );
    expect(screen.getByText('5 filtros ativos')).toBeInTheDocument();
  });

  it('período invertido mostra o erro e não é enviado', async () => {
    const user = userEvent.setup();
    page();
    await openFilters(user);
    await user.type(screen.getByLabelText('Data inicial'), '2026-09-30');
    await user.type(screen.getByLabelText('Data final'), '2026-09-01');
    expect(
      await screen.findByText('A data final deve ser igual ou posterior à inicial.')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Data final')).toHaveAttribute('aria-invalid', 'true');
    expect(lastParams()).not.toHaveProperty('startDate');
    expect(lastParams()).not.toHaveProperty('endDate');
  });

  it('filtro sem resultado explica e Limpar filtros volta à lista completa', async () => {
    const user = userEvent.setup();
    page();
    await openFilters(user);
    mocks.list.mockResolvedValue(listed([]));
    await user.selectOptions(screen.getByLabelText('Sprint'), 'none');
    expect(
      await screen.findByText('Nenhum relatório encontrado com esses filtros.')
    ).toBeInTheDocument();
    expect(lastParams()).toMatchObject({ sprintId: 'none' });
    mocks.list.mockResolvedValue(listed([report()]));
    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(await screen.findByRole('article', { name: 'Relatório #3' })).toBeInTheDocument();
    expect(lastParams()).toEqual({ page: 1, limit: 12 });
  });
});

describe('S2-06 — solicitar relatório', () => {
  it('envia o recorte com o fuso do navegador e a Sprint escolhida', async () => {
    const user = userEvent.setup();
    mocks.create.mockResolvedValue({
      report: report({ id: 4, status: 'QUEUED' }),
      alreadyRunning: false
    });
    page();
    await user.click(await screen.findByRole('button', { name: /Gerar relatório/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Gerar relatório' });
    await user.type(within(dialog).getByLabelText('Data inicial'), '2026-09-01');
    await user.type(within(dialog).getByLabelText('Data final'), '2026-09-30');
    await user.selectOptions(within(dialog).getByLabelText('Sprint'), '9');
    await user.click(within(dialog).getByRole('button', { name: 'Gerar relatório' }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(mocks.create).toHaveBeenCalledWith(1, {
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      timeZone: expect.any(String),
      sprintId: 9
    });
    expect(await screen.findByText(/Relatório #4 solicitado/)).toBeInTheDocument();
  });

  it('informa quando já existe uma geração em andamento', async () => {
    const user = userEvent.setup();
    mocks.create.mockResolvedValue({ report: report({ status: 'RUNNING' }), alreadyRunning: true });
    page();
    await user.click(await screen.findByRole('button', { name: /Gerar relatório/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Gerar relatório' });
    await user.click(within(dialog).getByRole('button', { name: 'Gerar relatório' }));
    expect(await screen.findByText(/Já existe uma geração em andamento/)).toBeInTheDocument();
    expect(mocks.create).toHaveBeenCalledWith(1, {});
  });

  it('valida o período antes de enviar', async () => {
    const user = userEvent.setup();
    page();
    await user.click(await screen.findByRole('button', { name: /Gerar relatório/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Gerar relatório' });
    await user.type(within(dialog).getByLabelText('Data inicial'), '2026-09-01');
    await user.click(within(dialog).getByRole('button', { name: 'Gerar relatório' }));
    expect(
      await within(dialog).findByText('Informe as duas datas ou deixe ambas vazias.')
    ).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('mostra o erro da API no diálogo', async () => {
    const user = userEvent.setup();
    mocks.create.mockRejectedValue({
      response: {
        status: 404,
        data: { code: 'SPRINT_NOT_FOUND', message: 'Sprint não encontrada.' }
      }
    });
    page();
    await user.click(await screen.findByRole('button', { name: /Gerar relatório/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Gerar relatório' });
    await user.click(within(dialog).getByRole('button', { name: 'Gerar relatório' }));
    expect(await within(dialog).findByText('Sprint não encontrada.')).toBeInTheDocument();
  });
});

describe('S2-06 — documento do relatório', () => {
  it('renderiza as três seções com nomes congelados e estados do painel', async () => {
    mocks.get.mockResolvedValue({
      ...report(),
      snapshot,
      people: [{ userId: 7, displayName: 'Ana Congelada', username: 'ana' }]
    });
    page('/projects/1/reports/3');
    expect(await screen.findByRole('heading', { name: 'Projeto Relatado' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Planejamento' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Rastreabilidade' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Indicadores' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Sprint Um' })).toHaveTextContent('2 de 4 (50%)');
    const requirements = screen.getByRole('table', { name: 'Requisitos' });
    expect(within(requirements).getByText('Em desenvolvimento')).toBeInTheDocument();
    const general = screen.getByRole('table', { name: /^Geral/ });
    const progress = within(general).getByRole('row', { name: /Progresso atual do projeto/ });
    expect(progress).toHaveTextContent('50%');
    expect(within(general).getByText('Tarefa atrasada — Ana Congelada')).toBeInTheDocument();
    const throughput = within(general).getByRole('row', { name: /Throughput/ });
    expect(throughput).toHaveTextContent('Indisponível');
    expect(throughput).not.toHaveTextContent('pontos na série');
    expect(screen.getAllByText('Ana Congelada (@ana)').length).toBeGreaterThan(0);
    // Mesmo título do cartão do painel, não o título técnico do catálogo.
    expect(within(general).getByRole('row', { name: /Requisitos com Tasks/ })).toHaveTextContent(
      '80%'
    );
    expect(within(general).queryByText('Cobertura por Tasks')).not.toBeInTheDocument();
  });

  it('mostra o resumo e o status de cada métrica com motivo e referência', async () => {
    mocks.get.mockResolvedValue({
      ...report(),
      snapshot,
      people: [{ userId: 7, displayName: 'Ana Congelada', username: 'ana' }]
    });
    page('/projects/1/reports/3');
    const overview = await screen.findByRole('region', { name: 'Resumo do relatório' });
    expect(overview).toHaveTextContent('Progresso do projeto50%');
    expect(overview).toHaveTextContent('Requisitos concluídos0 de 1');
    expect(overview).toHaveTextContent('Saúde do projeto59 / 100Crítico');
    expect(within(overview).getByRole('list', { name: 'Sprints por situação' })).toHaveTextContent(
      'Atrasada: 1'
    );
    expect(
      within(overview).getByRole('list', { name: 'Indicadores por status' })
    ).toHaveTextContent('Crítico: 1Saudável: 1Informativo: 3');
    const general = screen.getByRole('table', { name: /^Geral/ });
    expect(within(general).getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    const coverage = within(general).getByRole('row', { name: /Cobertura de implementação/ });
    expect(coverage).toHaveTextContent('Crítico');
    expect(coverage).toHaveTextContent(
      'Cobertura observada de 20% frente a 50% no estágio anterior; lacuna de 30 pontos percentuais.'
    );
    expect(coverage).toHaveTextContent('Progresso do projeto: 50% · Variação: -30 p.p.');
    expect(within(general).getByRole('row', { name: /Requisitos com Tasks/ })).toHaveTextContent(
      'Saudável'
    );
    expect(within(general).getByRole('row', { name: /Progresso atual/ })).toHaveTextContent(
      'Informativo'
    );
    expect(screen.getByRole('article', { name: 'Sprint Um' })).toHaveTextContent('Atrasada');
    expect(screen.getByRole('table', { name: 'Marcos' })).toHaveTextContent('Pendente');
  });

  it('relatório que falhou mostra o motivo em vez do documento', async () => {
    mocks.get.mockResolvedValue({
      ...report({
        status: 'FAILED',
        error: { code: 'REPORT_SOURCE_UNAVAILABLE', message: 'Fonte indisponível.' }
      }),
      snapshot: null,
      people: []
    });
    page('/projects/1/reports/3');
    expect(await screen.findByText('Fonte indisponível.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Planejamento' })).not.toBeInTheDocument();
  });
});

describe('S2-07 — baixar PDF', () => {
  let saved;
  beforeEach(() => {
    saved = [];
    URL.createObjectURL = vi.fn(() => 'blob:relatorio');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      saved.push({ href: this.getAttribute('href'), download: this.download });
    });
  });

  it('baixa o PDF pelo card com o nome do arquivo do relatório', async () => {
    const user = userEvent.setup();
    const blob = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
    mocks.downloadPdf.mockResolvedValue(blob);
    page();
    const card = await screen.findByRole('article', { name: 'Relatório #3' });
    await user.click(within(card).getByRole('button', { name: 'Baixar PDF do relatório #3' }));
    await waitFor(() =>
      expect(saved).toEqual([
        { href: 'blob:relatorio', download: 'traceflow-relatorio-3-projeto-relatado.pdf' }
      ])
    );
    expect(mocks.downloadPdf).toHaveBeenCalledWith(1, 3);
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:relatorio');
    expect(within(card).getByRole('button', { name: 'Baixar PDF do relatório #3' })).toBeEnabled();
  });

  it('mostra o motivo quando o PDF não pode ser baixado', async () => {
    const user = userEvent.setup();
    mocks.downloadPdf.mockRejectedValue({
      response: {
        status: 409,
        data: {
          code: 'REPORT_NOT_READY',
          message: 'Só relatórios prontos podem ser exportados em PDF.'
        }
      }
    });
    page();
    const card = await screen.findByRole('article', { name: 'Relatório #3' });
    await user.click(within(card).getByRole('button', { name: 'Baixar PDF do relatório #3' }));
    expect(
      await screen.findByText('Só relatórios prontos podem ser exportados em PDF.')
    ).toBeInTheDocument();
    expect(saved).toEqual([]);
  });

  it('só relatórios prontos oferecem o PDF', async () => {
    mocks.list.mockResolvedValue(
      listed([
        report({ id: 5, status: 'FAILED', error: { code: 'X', message: 'Falhou.' } }),
        report({ id: 6, status: 'RUNNING', finishedAt: null })
      ])
    );
    page();
    await screen.findByRole('article', { name: 'Relatório #5' });
    expect(screen.queryByRole('button', { name: /Baixar PDF/ })).not.toBeInTheDocument();
  });

  it('baixa o PDF a partir do relatório aberto', async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValue({
      ...report(),
      snapshot,
      people: [{ userId: 7, displayName: 'Ana Congelada', username: 'ana' }]
    });
    let finish;
    mocks.downloadPdf.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    page('/projects/1/reports/3');
    await user.click(await screen.findByRole('button', { name: 'Baixar PDF' }));
    expect(screen.getByRole('button', { name: 'Gerando PDF…' })).toBeDisabled();
    await act(async () => finish(new Blob(['%PDF'])));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].download).toBe('traceflow-relatorio-3-projeto-relatado.pdf');
    expect(screen.getByRole('button', { name: 'Baixar PDF' })).toBeEnabled();
  });

  it('relatório em geração não mostra o botão de PDF', async () => {
    mocks.get.mockResolvedValue({
      ...report({ status: 'RUNNING', finishedAt: null }),
      snapshot: null,
      people: []
    });
    page('/projects/1/reports/3');
    expect(await screen.findByText(/A geração está em andamento/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Baixar PDF/ })).not.toBeInTheDocument();
  });
});

// PR27-04: falha ao atualizar um relatório em geração não pode deixar a tela parada
// prometendo atualização automática, sem erro nem forma de retomar.
describe('S2-06 — acompanhamento do relatório com falha de atualização', () => {
  const running = () => ({
    ...report({ status: 'RUNNING', finishedAt: null }),
    snapshot: null,
    people: []
  });
  const ready = () => ({ ...report(), snapshot, people: [requester] });
  const httpError = (status) =>
    Object.assign(new Error('falha'), { response: { status, data: {} } });

  async function advanceUntil(check) {
    await waitFor(
      async () => {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(2500);
        });
        check();
      },
      { timeout: 60000 }
    );
  }

  it('falha transitória tenta de novo sozinha e chega ao relatório pronto sem recarregar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.get
      .mockResolvedValueOnce(running())
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValue(ready());
    page('/projects/1/reports/3');
    expect(await screen.findByText(/atualizada automaticamente/)).toBeInTheDocument();
    await advanceUntil(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tentando atualizar novamente');
    expect(screen.getByText(/atualizada automaticamente/)).toBeInTheDocument();
    await advanceUntil(() => expect(mocks.get).toHaveBeenCalledTimes(3));
    expect(await screen.findByRole('heading', { name: 'Planejamento' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('falhas seguidas param a atualização, avisam e permitem retomar até o resultado', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.get.mockResolvedValueOnce(running()).mockRejectedValue(httpError(503));
    page('/projects/1/reports/3');
    await screen.findByText(/atualizada automaticamente/);
    // Primeira falha e as três novas tentativas automáticas (espera crescente).
    await advanceUntil(() => expect(mocks.get).toHaveBeenCalledTimes(5));
    expect(await screen.findByText(/a atualização automática parou/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível atualizar o relatório.');
    expect(screen.queryByText(/atualizada automaticamente/)).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(mocks.get).toHaveBeenCalledTimes(5);

    mocks.get.mockResolvedValue(ready());
    await act(async () => {
      screen.getByRole('button', { name: 'Tentar novamente' }).click();
    });
    expect(await screen.findByRole('heading', { name: 'Planejamento' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sem permissão para o relatório a atualização para na hora, com o erro visível', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.get.mockResolvedValueOnce(running()).mockRejectedValue(httpError(403));
    page('/projects/1/reports/3');
    await screen.findByText(/atualizada automaticamente/);
    await advanceUntil(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/a atualização automática parou/)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});
