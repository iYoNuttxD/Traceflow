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
import { presentationSections } from '../../src/features/indicators/dashboard-display.js';

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
  it('separa a contagem de PRs abertas da idade em dias de cada item de I17', async () => {
    mocks.dashboard.mockResolvedValue(
      response('GITHUB', [
        {
          id: 'prs',
          indicators: [
            metric('I17', 1, {
              kind: 'LIST',
              unit: 'DAYS',
              items: [{ pullRequestId: 1, title: 'Revisar entrega', age: 1 }]
            })
          ]
        }
      ])
    );
    renderPanel('/projects/1?view=GITHUB');
    const card = await screen.findByRole('article', { name: 'PRs abertas mais antigas' });
    expect(within(card).getByText('1 PR aberta')).toBeInTheDocument();
    expect(within(card).getByText('1 dia')).toBeInTheDocument();
    expect(within(card).queryByText('1 dias')).not.toBeInTheDocument();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.catalog.mockResolvedValue({
      data: {
        indicators: [
          definition('I23', 'WIP atual'),
          definition('I09', 'Commits no período'),
          definition('I16', 'Média até merge'),
          definition('I17', 'PRs abertas mais antigas'),
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

  it('P8.4 preserva todos os IDs recebidos ao reagrupar Sprint e Tarefas', () => {
    for (const [view, id, start, end] of [
      ['SPRINT', 'planning', 36, 44],
      ['TASK', 'tasks', 26, 35]
    ]) {
      const sections = [
        {
          id,
          indicators: [
            ...Array.from({ length: end - start + 1 }, (_, i) => metric(`I${start + i}`, 0)),
            metric('I99', 0)
          ]
        },
        { id: 'additional', indicators: [metric('I98', 0)] }
      ];
      expect(
        presentationSections(view, sections)
          .flatMap((s) => s.indicators.map((i) => i.metricId))
          .sort()
      ).toEqual(sections.flatMap((s) => s.indicators.map((i) => i.metricId)).sort());
    }
  });

  it('P8.4 mantém I45/I46/I47 visíveis independentemente do papel no Health', async () => {
    const ids = ['I45', 'I46', 'I47'];
    mocks.dashboard.mockResolvedValue(
      response('SPRINT', [
        {
          id: 'history',
          indicators: ids.map((id, i) =>
            metric(id, null, {
              kind: 'SERIES',
              unit: 'HOURS',
              points: [
                {
                  date: '2026-09-20',
                  remaining: 10,
                  ideal: 10,
                  scope: 10,
                  completed: 0,
                  sprintName: 'Sprint A',
                  completedPoints: 8
                },
                {
                  date: '2026-09-21',
                  remaining: null,
                  ideal: 5,
                  scope: null,
                  completed: null,
                  sprintName: 'Sprint B',
                  completedPoints: 9
                },
                {
                  date: '2026-09-22',
                  remaining: 4,
                  ideal: 0,
                  scope: 10,
                  completed: 6,
                  sprintName: 'Sprint C',
                  completedPoints: 7
                }
              ],
              state: 'PARTIAL',
              assessment: {
                healthRole: ['SCORING_SIGNAL', 'REDUNDANT', 'CONTEXT_ONLY'][i],
                status: 'NEUTRAL',
                score: null
              }
            })
          )
        }
      ])
    );
    renderPanel('/projects/1?view=sprint');
    await screen.findByRole('img', { name: /Velocidade das Sprints/ });
    expect(
      [...document.querySelectorAll('[data-metric-id]')].map((el) => el.dataset.metricId)
    ).toEqual(ids);
    expect(screen.getAllByRole('img')).toHaveLength(3);
    expect(
      document.querySelector('[data-metric-id=I46]').querySelectorAll('svg polyline')
    ).toHaveLength(0);
    expect(
      document.querySelector('[data-metric-id=I46]').querySelectorAll('svg circle').length
    ).toBeGreaterThan(0);
  });

  it('P8.4 oferece datas usadas pelo Health mesmo sem widget temporal na Geral', async () => {
    mocks.catalog.mockResolvedValue({
      data: {
        indicators: [
          {
            ...definition('I23', 'WIP atual'),
            views: ['GENERAL'],
            filterCompatibility: {
              period: 'NOT_APPLICABLE',
              sprint: 'UNSAFE',
              responsible: 'UNSAFE'
            }
          }
        ],
        views: [
          {
            view: 'GENERAL',
            periodIncludesProjectHealth: true,
            filterCompatibility: { period: 'SUPPORTED', sprint: 'SUPPORTED', responsible: 'UNSAFE' }
          }
        ]
      }
    });
    renderPanel();
    await screen.findByRole('article', { name: 'WIP atual' });
    fireEvent.click(screen.getByRole('button', { name: /Filtrar indicadores/ }));
    expect(screen.getByLabelText('De')).toBeVisible();
    expect(screen.getByLabelText('Até')).toBeVisible();
    expect(screen.getByLabelText('Responsável')).toBeDisabled();
    expect(screen.getByText(/período define a janela de análise e da saúde/i)).toBeVisible();
    expect(screen.getByRole('option', { name: 'Sprint 3 · Concluída' })).toBeInTheDocument();
  });

  it('P8.4 fecha a ajuda com Escape e devolve o foco ao acionador', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('article', { name: 'WIP atual' });
    const trigger = screen.getByLabelText('Informações sobre WIP atual');
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Informações sobre WIP atual' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('P8.4 não apresenta um traço sem explicação para série disponível vazia', async () => {
    mocks.dashboard.mockResolvedValue(
      response('SPRINT', [
        { id: 'history', indicators: [metric('I45', null, { kind: 'SERIES', points: [] })] }
      ])
    );
    renderPanel('/projects/1?view=sprint');
    const card = await screen.findByRole('article', { name: 'Burndown' });
    expect(card).toHaveTextContent('Ainda não há pontos históricos para exibir.');
    expect(card.querySelector('svg')).toBeNull();
  });

  it.each([
    ['HEALTHY', 86, 'Saudável'],
    ['ATTENTION', 68, 'Atenção'],
    ['CRITICAL', 43, 'Crítico']
  ])(
    'apresenta Project Health %s com cobertura, dimensões e razões da API',
    async (status, score, label) => {
      mocks.catalog.mockResolvedValue({
        data: { indicators: [definition('I28', 'Tasks atrasadas')] }
      });
      mocks.dashboard.mockResolvedValue(
        response(
          'GENERAL',
          [
            {
              id: 'summary',
              indicators: [
                metric('I28', 3, {
                  assessment: {
                    healthModelVersion: 1,
                    healthRole: 'SCORING_SIGNAL',
                    dimension: 'PLANNING',
                    status,
                    score,
                    reasonCode: 'TASK_SHARE',
                    basis: { count: 3, totalTasks: 15 }
                  }
                })
              ]
            }
          ],
          {
            projectHealth: {
              healthModelVersion: 1,
              status,
              score,
              coverage: 84,
              assessedDimensions: 5,
              dimensions: [
                { id: 'PLANNING', weight: 20, applicable: true, coverage: 100, score, status }
              ],
              drivers: {
                negative: [
                  {
                    metricId: 'I28',
                    dimension: 'PLANNING',
                    status,
                    score,
                    impact: 2,
                    reasonCode: 'TASK_SHARE',
                    basis: { count: 3, totalTasks: 15 }
                  }
                ],
                positive: []
              }
            }
          }
        )
      );
      renderPanel();
      const section = await screen.findByRole('region', { name: 'Saúde do projeto' });
      expect(section).toHaveTextContent(`${score} / 100`);
      expect(section).toHaveTextContent(label);
      expect(section).toHaveTextContent('Cobertura da avaliação: 84%');
      expect(section).toHaveTextContent('Planejamento');
      expect(section).toHaveTextContent('3 de 15 Tasks estão atrasadas.');
      expect(screen.getByRole('article', { name: 'Tasks atrasadas' })).toHaveTextContent(label);
    }
  );

  it('mostra ausência de nota sem zero nem badge de saúde em indicador não avaliado', async () => {
    mocks.catalog.mockResolvedValue({
      data: { indicators: [definition('I28', 'Tasks atrasadas')] }
    });
    mocks.dashboard.mockResolvedValue(
      response(
        'GENERAL',
        [
          {
            id: 'summary',
            indicators: [
              metric('I28', null, {
                state: 'NO_DATA',
                assessment: {
                  healthModelVersion: 1,
                  healthRole: 'SCORING_SIGNAL',
                  dimension: 'PLANNING',
                  status: 'UNASSESSED',
                  score: null,
                  reasonCode: 'DATA_NO_DATA',
                  basis: null
                }
              })
            ]
          }
        ],
        {
          projectHealth: {
            healthModelVersion: 1,
            status: 'UNASSESSED',
            score: null,
            coverage: 42,
            assessedDimensions: 2,
            dimensions: [
              { id: 'PLANNING', applicable: true, coverage: 40, score: null, status: 'UNASSESSED' }
            ],
            drivers: { negative: [], positive: [] }
          }
        }
      )
    );
    renderPanel();
    const section = await screen.findByRole('region', { name: 'Saúde do projeto' });
    expect(section).toHaveTextContent('Dados insuficientes para uma avaliação geral confiável.');
    expect(section).toHaveTextContent('Cobertura da avaliação: 42%');
    expect(section).not.toHaveTextContent('0 / 100');
    expect(
      screen
        .getByRole('article', { name: 'Tasks atrasadas' })
        .querySelector('.indicator-card__health')
    ).toBeNull();
  });

  it('explica modelo, peso, cobertura e período na ajuda sem recalcular score no frontend', async () => {
    mocks.catalog.mockResolvedValue({ data: { indicators: [definition('I23', 'WIP atual')] } });
    mocks.dashboard.mockResolvedValue(
      response(
        'GENERAL',
        [
          {
            id: 'summary',
            indicators: [
              metric('I23', 3, {
                assessment: {
                  healthModelVersion: 1,
                  healthRole: 'CONTEXT_ONLY',
                  dimension: null,
                  status: 'NEUTRAL',
                  score: null,
                  reasonCode: 'CONTEXT_ONLY',
                  basis: null
                }
              })
            ]
          }
        ],
        {
          projectHealth: {
            healthModelVersion: 1,
            status: 'ATTENTION',
            score: 68,
            coverage: 80,
            assessedDimensions: 4,
            dimensions: [
              {
                id: 'PLANNING',
                weight: 20,
                applicable: true,
                coverage: 70,
                score: 80,
                status: 'HEALTHY'
              }
            ],
            window: {
              current: { startInclusive: '2026-08-26T12:00:00Z', endExclusive: asOf },
              previous: {
                startInclusive: '2026-07-27T12:00:00Z',
                endExclusive: '2026-08-26T12:00:00Z'
              }
            },
            drivers: { negative: [], positive: [] }
          }
        }
      )
    );
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('region', { name: 'Saúde do projeto' });
    await user.click(screen.getByLabelText('Informações sobre Saúde do projeto'));
    expect(screen.queryByText(/Modelo versão/)).not.toBeInTheDocument();
    expect(screen.getByText(/Planejamento: peso 20%, cobertura 70%/)).toBeInTheDocument();
    expect(screen.getByText(/Janela atual:/)).toBeInTheDocument();
    const card = screen.getByRole('article', { name: 'WIP atual' });
    expect(card.querySelector('.indicator-card__health')).toBeNull();
    await user.click(screen.getByLabelText('Informações sobre WIP atual'));
    expect(
      screen.queryByText('Este indicador é informativo e não compõe a Saúde do Projeto.')
    ).not.toBeInTheDocument();
  });

  it('P8.5 displays backend references and entity tables without technical metadata', async () => {
    mocks.catalog.mockResolvedValue({
      data: { indicators: [definition('I21', 'Cycle Time'), definition('I17', 'PRs abertas')] }
    });
    mocks.dashboard.mockResolvedValue(
      response('FLOW', [
        {
          id: 'flow',
          indicators: [
            metric('I21', 6, {
              unit: 'DAYS',
              assessment: {
                status: 'ATTENTION',
                score: 68,
                reference: { label: 'Referência recente', value: 4, unit: 'DAYS' },
                delta: { value: 50, unit: 'PERCENT' }
              }
            }),
            metric('I17', 1, {
              kind: 'LIST',
              items: [{ pullRequestId: 1, title: 'Revisar entrega', age: 3 }]
            })
          ]
        }
      ])
    );
    renderPanel('/projects/1?view=FLOW');
    const card = await screen.findByRole('article', { name: 'Cycle Time' });
    expect(card).toHaveTextContent('6 dias');
    expect(card).toHaveTextContent('Referência recente: 4 dias');
    expect(card).toHaveTextContent('Variação: +50%');
    expect(screen.getByRole('table', { name: 'Registros relacionados' })).toHaveTextContent(
      'Revisar entrega'
    );
    fireEvent.click(within(card).getByRole('button', { name: /Informações/ }));
    const help = screen.getByRole('dialog');
    expect(help).toHaveTextContent('Valor atual');
    expect(help).toHaveTextContent('Referência recente');
    expect(help).not.toHaveTextContent(
      /I21|definitionVersion|reasonCode|healthModelVersion|TaskMovement|RF15/
    );
  });

  it('P8.5 keeps one filter context and drafts across categories, restores history and clears', async () => {
    const user = userEvent.setup();
    renderPanel(
      '/projects/1?view=FLOW&startDate=2026-09-01&endDate=2026-09-20&sprintId=3&timeZone=UTC',
      {},
      true
    );
    await screen.findByRole('article', { name: 'WIP atual' });
    await user.click(screen.getByRole('button', { name: /Filtrar indicadores/ }));
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-09-05' } });
    await user.click(screen.getByRole('tab', { name: 'Qualidade' }));
    await screen.findByRole('article', { name: 'Execuções por resultado' });
    expect(screen.getByLabelText('De')).toHaveValue('2026-09-05');
    expect(mocks.dashboard.mock.lastCall[1]).toMatchObject({
      view: 'QUALITY',
      startDate: '2026-09-01',
      sprintId: '3',
      includeProjectHealth: true
    });
    await user.click(screen.getByRole('button', { name: 'Voltar no histórico' }));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Fluxo' })).toHaveAttribute('aria-selected', 'true')
    );
    expect(screen.getByLabelText('Até')).toHaveValue('2026-09-20');
    await user.click(screen.getByRole('button', { name: 'Limpar' }));
    await waitFor(() =>
      expect(mocks.dashboard.mock.lastCall[1]).toEqual({ view: 'FLOW', includeProjectHealth: true })
    );
    expect(screen.getByLabelText('De')).toHaveValue('');
  });

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
    renderPanel('/projects/1?responsibleUserId=9');
    await screen.findByRole('article', { name: 'WIP atual' });
    await user.click(screen.getByRole('button', { name: /Filtrar indicadores/ }));
    await user.type(screen.getByLabelText('De'), '2026-09-01');
    await user.type(screen.getByLabelText('Até'), '2026-09-20');
    await user.selectOptions(screen.getByLabelText('Sprint'), '3');
    expect(screen.getByLabelText('Responsável')).toBeDisabled();
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
    expect(
      within(screen.getByRole('dialog')).getByText(/Período: não se aplica/)
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog')).getByText(/Responsável: não aplicado/)
    ).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: /Filtrar indicadores/ }));
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
    expect(within(burnup).getByText('Ver dados')).toBeInTheDocument();
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
    expect(screen.getByRole('tab', { name: 'Planejamento' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Planejamento' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('une views e ações na toolbar, inicia filtros recolhidos e atualiza somente o agregado', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('article', { name: 'WIP atual' });
    const toolbar = document.querySelector('.dashboard-panel__toolbar');
    expect(within(toolbar).getByRole('tablist')).toBeInTheDocument();
    const filterButton = screen.getByRole('button', { name: /Filtrar indicadores/ });
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
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('explica o cálculo em linguagem de uso sem metadata técnica nem fórmula interna', async () => {
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
    const help = screen.getByRole('dialog', { name: 'Informações sobre Commits no período' });
    expect(help).toHaveTextContent(
      'Conta uma vez cada commit observado no projeto durante o período.'
    );
    expect(help.querySelector('.indicator-card__technical')).toBeNull();
    expect(help).toHaveTextContent('Valor atual');
    expect(help).not.toHaveTextContent(
      /I09|definitionVersion|reasonCode|healthModelVersion|TaskMovement|RF15|Commit.id/
    );
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
