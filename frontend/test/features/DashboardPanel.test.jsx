import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ dashboard: vi.fn(), catalog: vi.fn(), sprints: vi.fn() }));

vi.mock('../../src/features/indicators/api/indicators.api.js', () => ({
  indicatorsApi: { dashboard: mocks.dashboard, catalog: mocks.catalog }
}));
vi.mock('../../src/features/schedule/api/schedule.api.js', () => ({
  scheduleApi: { listSprints: mocks.sprints }
}));

import { DashboardPanel } from '../../src/features/indicators/DashboardPanel.jsx';

const asOf = '2026-09-25T12:00:00.000Z';
const definition = (metricId, title) => ({
  metricId,
  title,
  description: title,
  source: 'Fonte local'
});
const metric = (metricId, value, extras = {}) => ({
  metricId,
  value,
  state: 'AVAILABLE',
  unit: 'TASKS',
  period: null,
  asOf,
  formula: 'Valor retornado pela API',
  sources: ['Task.status'],
  definitionVersion: metricId === 'I45' ? 2 : 1,
  limitations: [],
  appliedFilters: { period: false, sprint: false, responsible: false },
  filterCompatibility: {
    period: 'NOT_APPLICABLE',
    sprint: 'NOT_APPLICABLE',
    responsible: 'NOT_APPLICABLE'
  },
  ...extras
});

function response(view, sections, extras = {}) {
  return {
    data: {
      projectId: 1,
      view,
      viewState: 'AVAILABLE',
      generatedAt: asOf,
      requestedFilters: { period: null, sprintId: null, responsibleUserId: null },
      context: { project: { id: 1, name: 'Projeto' }, sprint: null },
      freshness: { local: { generatedAt: asOf }, github: null },
      sections,
      warnings: [],
      ...extras
    }
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function PanelHarness({ props, historyControls }) {
  const navigate = useNavigate();
  return (
    <>
      {historyControls && (
        <button type="button" onClick={() => navigate(-1)}>
          Voltar no histórico
        </button>
      )}
      <DashboardPanel
        projectId={1}
        members={[{ id: 8, userId: 9, isActive: false, user: { name: 'Pessoa histórica' } }]}
        {...props}
      />
    </>
  );
}

function renderPanel(url = '/projects/1', props = {}, historyControls = false) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/projects/:id"
          element={<PanelHarness props={props} historyControls={historyControls} />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('P8 Dashboard na Visão Geral', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.catalog.mockResolvedValue({
      data: {
        indicators: [
          definition('I23', 'WIP atual'),
          definition('I09', 'Commits no período'),
          definition('I16', 'Média até merge'),
          definition('I48', 'Execuções por resultado'),
          definition('I25', 'Fluxo cumulativo'),
          definition('I52', 'Saúde dos TestCases'),
          definition('I59', 'Defeitos por Requirement'),
          definition('I45', 'Burndown'),
          definition('I46', 'Burnup'),
          definition('I53', 'Defeitos por estado'),
          definition('I58', 'Sucesso de reteste'),
          definition('I47', 'Velocity'),
          definition('I61', 'Requirements com Tasks'),
          definition('I62', 'Requirements com evidência técnica'),
          definition('I63', 'Requirements com TestCases'),
          definition('I64', 'Requirements com Defects'),
          definition('I65', 'Requirements validados'),
          definition('I66', 'Requirements implementados'),
          definition('I67', 'Progresso médio dos Requirements')
        ]
      }
    });
    mocks.sprints.mockResolvedValue({
      data: { sprints: [{ id: 3, name: 'Sprint 3', status: 'CONCLUIDA' }] }
    });
    mocks.dashboard.mockImplementation(async (_id, filters) => {
      if (filters.view === 'GITHUB')
        return response('GITHUB', [{ id: 'activity', indicators: [metric('I09', 12)] }]);
      if (filters.view === 'QUALITY')
        return response('QUALITY', [
          {
            id: 'tests',
            indicators: [
              metric(
                'I48',
                { PASS: 2, FAIL: 1, BLOCKED: 0, total: 3 },
                { unit: 'EXECUTIONS', distribution: { PASS: 2, FAIL: 1, BLOCKED: 0, total: 3 } }
              )
            ]
          }
        ]);
      return response('GENERAL', [{ id: 'summary', indicators: [metric('I23', 3)] }]);
    });
  });

  afterEach(() => cleanup());

  it('troca Geral → GitHub → Qualidade com uma consulta agregada por visão e sem vazamento', async () => {
    const user = userEvent.setup();
    renderPanel();
    expect(await screen.findByRole('article', { name: 'WIP atual' })).toHaveTextContent('3');
    await user.click(screen.getByRole('tab', { name: 'GitHub' }));
    expect(await screen.findByRole('article', { name: 'Commits no período' })).toHaveTextContent(
      '12'
    );
    expect(screen.queryByRole('article', { name: 'WIP atual' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Qualidade' }));
    expect(
      await screen.findByRole('article', { name: 'Execuções por resultado' })
    ).toHaveTextContent('Aprovado');
    expect(screen.queryByRole('article', { name: 'Commits no período' })).not.toBeInTheDocument();
    expect(mocks.dashboard).toHaveBeenCalledTimes(3);
    expect(mocks.catalog).toHaveBeenCalledOnce();
    expect(mocks.dashboard.mock.calls.map((call) => call[1].view)).toEqual([
      'GENERAL',
      'GITHUB',
      'QUALITY'
    ]);
  });

  it('ignora a resposta antiga de visão após a nova resposta', async () => {
    const general = deferred();
    const github = deferred();
    mocks.dashboard.mockImplementation((_id, filters) =>
      filters.view === 'GENERAL' ? general.promise : github.promise
    );
    renderPanel();
    await waitFor(() => expect(mocks.dashboard).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('tab', { name: 'GitHub' }));
    await waitFor(() => expect(mocks.dashboard).toHaveBeenCalledTimes(2));
    await act(async () =>
      github.resolve(response('GITHUB', [{ id: 'activity', indicators: [metric('I09', 7)] }]))
    );
    expect(await screen.findByRole('article', { name: 'Commits no período' })).toHaveTextContent(
      '7'
    );
    await act(async () =>
      general.resolve(response('GENERAL', [{ id: 'summary', indicators: [metric('I23', 99)] }]))
    );
    expect(screen.getByRole('article', { name: 'Commits no período' })).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'WIP atual' })).not.toBeInTheDocument();
  });

  it('envia período, Sprint e responsável, mas não afirma que WIP os aplicou', async () => {
    const user = userEvent.setup();
    mocks.dashboard.mockImplementation(async (_id, filters) =>
      response(
        'GENERAL',
        [
          {
            id: 'summary',
            indicators: [
              metric('I23', 4, {
                filterCompatibility: {
                  period: 'NOT_APPLICABLE',
                  sprint: 'UNSAFE',
                  responsible: 'UNSAFE'
                },
                limitations: filters.responsibleUserId
                  ? ['RESPONSIBLE_FILTER_UNSAFE_NOT_APPLIED']
                  : []
              })
            ]
          }
        ],
        {
          requestedFilters: {
            period: filters.startDate
              ? {
                  startDate: filters.startDate,
                  endDate: filters.endDate,
                  timeZone: filters.timeZone
                }
              : null,
            sprintId: filters.sprintId ?? null,
            responsibleUserId: filters.responsibleUserId ?? null
          }
        }
      )
    );
    renderPanel();
    await screen.findByRole('article', { name: 'WIP atual' });
    await user.click(screen.getByRole('button', { name: 'Filtros' }));
    await user.type(screen.getByLabelText('De'), '2026-09-01');
    await user.type(screen.getByLabelText('Até'), '2026-09-20');
    await user.selectOptions(screen.getByLabelText('Sprint'), '3');
    await user.selectOptions(screen.getByLabelText('Responsável'), '9');
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() => expect(mocks.dashboard).toHaveBeenCalledTimes(2));
    expect(mocks.dashboard.mock.calls[1][1]).toMatchObject({
      view: 'GENERAL',
      startDate: '2026-09-01',
      endDate: '2026-09-20',
      sprintId: '3',
      responsibleUserId: '9'
    });
    expect(mocks.dashboard.mock.calls[1][1].timeZone).toMatch(/^(UTC|[A-Za-z_]+\/[A-Za-z_/]+)$/);
    const card = await screen.findByRole('article', { name: 'WIP atual' });
    expect(card).toHaveTextContent('4');
    expect(within(card).getByLabelText(/filtro solicitado não aplicado/i)).toBeInTheDocument();
    await user.click(within(card).getByText('?'));
    expect(within(card).getByText(/Período: não se aplica/)).toBeInTheDocument();
    expect(within(card).getByText(/Responsável: não aplicado/)).toBeInTheDocument();
  });

  it('não deixa um filtro anterior sobrescrever o novo filtro', async () => {
    const old = deferred();
    const latest = deferred();
    mocks.dashboard.mockImplementation((_id, filters) => {
      if (filters.startDate === '2026-09-01') return old.promise;
      if (filters.startDate === '2026-09-15') return latest.promise;
      return Promise.resolve(
        response('GENERAL', [{ id: 'summary', indicators: [metric('I23', 1)] }])
      );
    });
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('article', { name: 'WIP atual' });
    await user.click(screen.getByRole('button', { name: 'Filtros' }));
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-09-20' } });
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() => expect(mocks.dashboard).toHaveBeenCalledTimes(2));
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-09-15' } });
    await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() => expect(mocks.dashboard).toHaveBeenCalledTimes(3));
    await act(async () =>
      latest.resolve(response('GENERAL', [{ id: 'summary', indicators: [metric('I23', 7)] }]))
    );
    await act(async () =>
      old.resolve(response('GENERAL', [{ id: 'summary', indicators: [metric('I23', 88)] }]))
    );
    expect(screen.getByRole('article', { name: 'WIP atual' })).toHaveTextContent('7');
  });

  it('mostra valor parcial/stale, ausência de dados e indisponibilidade sem zero falso', async () => {
    mocks.dashboard.mockResolvedValue(
      response(
        'GENERAL',
        [
          {
            id: 'summary',
            indicators: [
              metric('I23', 5, { state: 'PARTIAL', limitations: ['PERIOD_NOT_COMPLETE'] }),
              metric('I09', 3, {
                state: 'STALE',
                sourceUpdatedAt: '2026-09-20T12:00:00Z',
                sourceSyncStatus: 'FAILED'
              }),
              metric('I48', null, { state: 'NO_DATA', unit: 'PERCENT' }),
              metric('I16', null, { state: 'NO_DATA', unit: 'HOURS' }),
              metric('I46', null, {
                state: 'UNAVAILABLE',
                kind: 'SERIES',
                points: [],
                limitations: ['BURNUP_HISTORY_NOT_CAPTURED']
              }),
              metric(
                'I53',
                { ABERTO: 1, active: 1, total: 1 },
                {
                  kind: 'DISTRIBUTION',
                  distribution: { ABERTO: 1, active: 1, total: 1 }
                }
              )
            ]
          }
        ],
        { viewState: 'PARTIAL' }
      )
    );
    renderPanel();
    const partial = await screen.findByRole('article', { name: 'WIP atual' });
    expect(partial).toHaveTextContent('5');
    expect(partial).toHaveTextContent('Dados parciais');
    expect(screen.getByRole('article', { name: 'Commits no período' })).toHaveTextContent(
      'Último valor conhecido'
    );
    expect(screen.getByRole('article', { name: 'Execuções por resultado' })).not.toHaveTextContent(
      '0%'
    );
    expect(screen.getByRole('article', { name: 'Média até merge' })).toHaveTextContent(
      'Nenhuma PR mesclada elegível no período.'
    );
    const burnup = screen.getByRole('article', { name: 'Burnup' });
    expect(burnup.querySelector('svg')).toBeNull();
    expect(burnup).toHaveTextContent('Esta Sprint não possui histórico de Burnup capturado.');
    expect(screen.getByRole('article', { name: 'Defeitos por estado' })).toHaveTextContent(
      'Ativos'
    );
  });

  it('não apresenta valor como disponível quando a API envia um estado desconhecido', async () => {
    mocks.dashboard.mockResolvedValue(
      response(
        'GENERAL',
        [
          {
            id: 'summary',
            indicators: [metric('I61', 75, { state: 'FUTURE_STATE', unit: 'PERCENT' })]
          }
        ],
        { viewState: 'FUTURE_STATE' }
      )
    );
    renderPanel();
    const card = await screen.findByRole('article', { name: 'Requisitos com Tasks' });
    expect(card).toHaveTextContent('Estado desconhecido');
    expect(card).toHaveTextContent('Não foi possível interpretar o estado deste indicador.');
    expect(card).not.toHaveTextContent('75%');
    expect(screen.getByText('Estado da visão desconhecido')).toBeInTheDocument();
  });

  it('mostra Burndown v2 e Burnup com duas séries, respeitando lacunas parciais', async () => {
    mocks.dashboard.mockResolvedValue(
      response(
        'SPRINT',
        [
          {
            id: 'history',
            indicators: [
              metric('I45', null, {
                kind: 'SERIES',
                unit: 'STORY_POINTS',
                definitionVersion: 2,
                points: [
                  { date: '2026-09-01', remaining: 8, ideal: 8 },
                  { date: '2026-09-02', remaining: 5, ideal: 4 }
                ]
              }),
              metric('I46', null, {
                kind: 'SERIES',
                unit: 'STORY_POINTS',
                state: 'PARTIAL',
                points: [
                  { date: '2026-09-01', scope: null, completed: null },
                  { date: '2026-09-02', scope: 8, completed: 3 }
                ],
                limitations: ['BURNUP_COVERAGE_STARTED_MID_SPRINT']
              })
            ]
          }
        ],
        { viewState: 'PARTIAL' }
      )
    );
    renderPanel('/projects/1?view=sprint');
    expect(await screen.findByRole('img', { name: /Burndown: 2 pontos/ })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /Burnup: 2 pontos/ })).toBeInTheDocument();
    const burnup = screen.getByRole('article', { name: 'Burnup' });
    expect(burnup).toHaveTextContent('Escopo total');
    expect(burnup).toHaveTextContent('Trabalho concluído');
    expect(burnup).toHaveTextContent('Histórico disponível apenas');
    expect(within(burnup).getByText('Tabela de dados')).toBeInTheDocument();
    const chart = within(burnup).getByRole('img', { name: /Burnup: 2 pontos/ });
    chart.focus();
    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    expect(within(burnup).getByRole('status')).toHaveTextContent('02 de set.');
    expect(within(burnup).getByRole('status')).toHaveTextContent('Escopo total: 8');
  });

  it('desenha I25 como área empilhada e mantém o aviso de cobertura parcial', async () => {
    mocks.dashboard.mockResolvedValue(
      response('FLOW', [
        {
          id: 'flow',
          indicators: [
            metric('I25', null, {
              state: 'PARTIAL',
              kind: 'SERIES',
              points: [
                { date: '2026-09-01', todo: 2, inProgress: 1, done: 0 },
                { date: '2026-09-02', todo: 1, inProgress: 1, done: 1 }
              ],
              limitations: ['INITIAL_STATE_NOT_GLOBALLY_PROVEN']
            })
          ]
        }
      ])
    );
    renderPanel('/projects/1?view=flow');
    const card = await screen.findByRole('article', { name: 'Fluxo cumulativo' });
    expect(
      await within(card).findByRole('img', { name: /Fluxo cumulativo: 2 pontos/ })
    ).toBeInTheDocument();
    expect(card.querySelectorAll('polygon')).toHaveLength(3);
    expect(card).toHaveTextContent(
      'estado inicial anterior ao histórico disponível é desconhecido'
    );
  });

  it('interrompe áreas de I25 em dias sem histórico, sem preencher a lacuna com zero', async () => {
    mocks.dashboard.mockResolvedValue(
      response('FLOW', [
        {
          id: 'flow',
          indicators: [
            metric('I25', null, {
              kind: 'SERIES',
              points: [
                { date: '2026-09-01', todo: 2, inProgress: 1, done: 0 },
                { date: '2026-09-02', todo: 1, inProgress: 1, done: 1 },
                { date: '2026-09-03', todo: null, inProgress: null, done: null },
                { date: '2026-09-04', todo: 2, inProgress: 2, done: 0 },
                { date: '2026-09-05', todo: 1, inProgress: 2, done: 1 }
              ]
            })
          ]
        }
      ])
    );
    renderPanel('/projects/1?view=flow');
    const card = await screen.findByRole('article', { name: 'Fluxo cumulativo' });
    await within(card).findByRole('img', { name: /Fluxo cumulativo: 5 pontos/ });
    const polygons = [...card.querySelectorAll('polygon')];
    expect(polygons).toHaveLength(6);
    expect(polygons.every((polygon) => !polygon.getAttribute('points').includes('331,'))).toBe(
      true
    );
    expect(card).toHaveTextContent('—');
  });

  it('separa Qualidade por fonte e explica concentração sem somar Defects duplicados', async () => {
    mocks.dashboard.mockResolvedValue(
      response('QUALITY', [
        {
          id: 'tests',
          indicators: [
            metric(
              'I48',
              { PASS: 3, FAIL: 1, BLOCKED: 1, total: 5 },
              {
                distribution: { PASS: 3, FAIL: 1, BLOCKED: 1, total: 5 }
              }
            ),
            metric(
              'I52',
              { PASS: 2, FAIL: 1, BLOCKED: 0, NEVER_EXECUTED: 1, total: 4 },
              {
                distribution: { PASS: 2, FAIL: 1, BLOCKED: 0, NEVER_EXECUTED: 1, total: 4 }
              }
            )
          ]
        },
        {
          id: 'concentration',
          indicators: [
            metric('I59', null, {
              kind: 'LIST',
              items: [{ requirementId: 1, displayId: 'REQ-1', title: 'Login', defectCount: 2 }],
              limitations: ['DEFECT_MAY_APPEAR_IN_MULTIPLE_REQUIREMENTS']
            })
          ]
        }
      ])
    );
    renderPanel('/projects/1?view=quality');
    const executions = await screen.findByRole('article', { name: 'Execuções por resultado' });
    const health = screen.getByRole('article', { name: 'Estado atual dos casos de teste' });
    expect(executions).toHaveTextContent('Aprovado');
    expect(health).toHaveTextContent('Nunca executado');
    expect(screen.getByRole('article', { name: 'Defeitos por requisito' })).toHaveTextContent(
      'Um defeito pode aparecer em mais de um requisito'
    );
  });

  it('mostra as sete dimensões independentes de rastreabilidade sem funil', async () => {
    mocks.dashboard.mockResolvedValue(
      response('TRACEABILITY', [
        {
          id: 'coverage',
          indicators: Array.from({ length: 7 }, (_, index) =>
            metric(`I${61 + index}`, (index + 1) * 10, {
              unit: 'PERCENT',
              numerator: index + 1,
              denominator: 10
            })
          )
        }
      ])
    );
    renderPanel('/projects/1?view=traceability');
    expect(await screen.findByRole('article', { name: 'Requisitos com Tasks' })).toHaveTextContent(
      '10%'
    );
    expect(screen.getAllByRole('progressbar')).toHaveLength(7);
    expect(
      screen.getByRole('article', { name: 'Progresso médio dos requisitos' })
    ).toHaveTextContent('70%');
    expect(screen.queryByText(/funil/i)).not.toBeInTheDocument();
  });

  it('informa no cabeçalho quando um recorte não se aplica a toda a seção', async () => {
    mocks.dashboard.mockResolvedValue(
      response(
        'TRACEABILITY',
        [
          {
            id: 'coverage',
            indicators: [
              metric('I61', 50, { unit: 'PERCENT' }),
              metric('I62', 25, { unit: 'PERCENT' })
            ]
          }
        ],
        {
          requestedFilters: {
            period: {
              startDate: '2026-09-01',
              endDate: '2026-09-20',
              timeZone: 'America/Sao_Paulo'
            },
            sprintId: null,
            responsibleUserId: null
          }
        }
      )
    );
    renderPanel('/projects/1?view=traceability&startDate=2026-09-01&endDate=2026-09-20');
    const section = await screen.findByRole('region', { name: 'Dimensões de rastreabilidade' });
    expect(section).toHaveTextContent('Recorte não aplicado');
    expect(section).toHaveTextContent(
      'O filtro de período não foi aplicado aos indicadores desta seção.'
    );
    expect(within(section).queryByLabelText(/filtro solicitado não aplicado/i)).toBeNull();
  });

  it('permite navegar pelas visões com setas e mantém foco no tab selecionado', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('article', { name: 'WIP atual' });
    const general = screen.getByRole('tab', { name: 'Geral' });
    general.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'GitHub' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'GitHub' })).toHaveAttribute('aria-selected', 'true');
  });

  it('une views e ações na toolbar, inicia filtros recolhidos e atualiza somente o agregado', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('article', { name: 'WIP atual' });
    const toolbar = document.querySelector('.dashboard-panel__toolbar');
    expect(within(toolbar).getByRole('tablist')).toBeInTheDocument();
    const filterButton = within(toolbar).getByRole('button', { name: 'Filtros' });
    expect(filterButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('form', { name: 'Filtros de indicadores' })).not.toBeInTheDocument();
    await user.click(filterButton);
    expect(filterButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('form', { name: 'Filtros de indicadores' })).toBeInTheDocument();
    await user.click(within(toolbar).getByRole('button', { name: 'Atualizar indicadores' }));
    await waitFor(() => expect(mocks.dashboard).toHaveBeenCalledTimes(2));
    expect(mocks.catalog).toHaveBeenCalledOnce();
  });

  it('mostra contagens de reteste sem sufixo percentual e oculta detalhes técnicos por padrão', async () => {
    mocks.dashboard.mockResolvedValue(
      response('QUALITY', [
        {
          id: 'defects',
          indicators: [
            metric('I58', 33.33, {
              unit: 'PERCENT',
              distribution: { PASS: 1, FAIL: 1, BLOCKED: 1, total: 3 },
              formula: 'PASS / total × 100'
            })
          ]
        }
      ])
    );
    renderPanel('/projects/1?view=quality');
    const card = await screen.findByRole('article', { name: 'Sucesso de reteste' });
    expect(card).toHaveTextContent('33,33%');
    expect(within(card).getByText('Aprovado').parentElement).toHaveTextContent('1');
    expect(within(card).getByText('Aprovado').parentElement).not.toHaveTextContent('1%');
    expect(within(card).getByText('Falhou').parentElement).not.toHaveTextContent('1%');
    expect(within(card).getByText('Bloqueado').parentElement).not.toHaveTextContent('1%');
    expect(card.querySelector('.indicator-card__id')).toBeNull();
    expect(card.querySelector('.indicator-card__technical')).not.toHaveAttribute('open');
  });

  it('explica o cálculo em linguagem de uso e deixa a fórmula da API nos detalhes técnicos', async () => {
    mocks.dashboard.mockResolvedValue(
      response('GITHUB', [
        {
          id: 'activity',
          indicators: [metric('I09', 12, { formula: 'COUNT DISTINCT Commit.id no período' })]
        }
      ])
    );
    const user = userEvent.setup();
    renderPanel('/projects/1?view=github');
    const card = await screen.findByRole('article', { name: 'Commits no período' });
    await user.click(within(card).getByLabelText('Informações sobre Commits no período'));
    expect(card).toHaveTextContent(
      'Conta uma vez cada commit observado no projeto durante o período.'
    );
    expect(card.querySelector('.indicator-card__technical')).not.toHaveAttribute('open');
    await user.click(within(card).getByText('Detalhes técnicos'));
    expect(card.querySelector('.indicator-card__technical')).toHaveAttribute('open');
    expect(card).toHaveTextContent('COUNT DISTINCT Commit.id no período');
  });

  it('troca séries de um ponto por resumos compactos sem eixos duplicados', async () => {
    mocks.dashboard.mockResolvedValue(
      response('SPRINT', [
        {
          id: 'history',
          indicators: [
            metric('I45', null, {
              kind: 'SERIES',
              unit: 'HOURS',
              points: [{ date: '2026-09-25', remaining: 18, ideal: 22 }]
            }),
            metric('I47', null, {
              kind: 'SERIES',
              unit: 'HOURS',
              points: [{ sprintId: 3, sprintName: 'Sprint 3', completedPoints: 5 }]
            })
          ]
        }
      ])
    );
    renderPanel('/projects/1?view=sprint');
    const burndown = await screen.findByRole('article', { name: 'Burndown' });
    expect(burndown).toHaveTextContent('Histórico iniciado em 25 de set.');
    expect(burndown).toHaveTextContent('18 h');
    expect(burndown.querySelector('svg')).toBeNull();
    const velocity = screen.getByRole('article', { name: 'Velocidade das Sprints' });
    expect(velocity).toHaveTextContent('Última Sprint concluída');
    expect(velocity).toHaveTextContent('Sprint 3');
    expect(velocity.querySelector('svg')).toBeNull();
  });

  it('restaura a visão ao navegar para trás no histórico da URL', async () => {
    const user = userEvent.setup();
    renderPanel('/projects/1', {}, true);
    await screen.findByRole('article', { name: 'WIP atual' });
    await user.click(screen.getByRole('tab', { name: 'GitHub' }));
    await screen.findByRole('article', { name: 'Commits no período' });
    await user.click(screen.getByRole('button', { name: 'Voltar no histórico' }));
    expect(await screen.findByRole('article', { name: 'WIP atual' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Geral' })).toHaveAttribute('aria-selected', 'true');
  });
});
