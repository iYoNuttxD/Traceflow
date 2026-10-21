// Fixture visual isolada: renderiza a tela real com respostas sintéticas, sem rede ou banco.
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ThemeProvider } from '../../src/app/theme/ThemeProvider.jsx';
import { httpClient } from '../../src/api/http-client.js';
import { ProjectDetailsScreen } from '../../src/features/projects/pages/ProjectDetailsScreen.jsx';
import { ProjectsCatalogProvider } from '../../src/features/projects/hooks/ProjectsCatalogContext.jsx';
import { AppShell } from '../../src/app/layout/AppShell.jsx';
import { UnreadNotificationsProvider } from '../../src/features/notifications/index.js';
import { IndicatorsScreen } from '../../src/features/indicators/IndicatorsScreen.jsx';
import { SettingsLayout } from '../../src/features/settings/SettingsLayout.jsx';
import { ConfirmProvider } from '../../src/shared/components/ConfirmDialog.jsx';
import '../../src/styles/tokens.css';
import '../../src/styles/base.css';
import '../../src/styles/global.css';

const query = new URLSearchParams(window.location.search);
const burnupState = query.get('burnup') ?? 'AVAILABLE';
const savedTheme = query.get('theme') ?? 'light';
const healthState = (query.get('health') ?? '').toUpperCase();
const healthScores = { HEALTHY: 86, ATTENTION: 68, CRITICAL: 43, UNASSESSED: null };
const healthScore = Object.hasOwn(healthScores, healthState)
  ? healthScores[healthState]
  : undefined;
window.localStorage.setItem('traceflow.theme', savedTheme);
const sidebar = query.get('sidebar');
if (sidebar === 'expanded' || sidebar === 'collapsed') {
  window.localStorage.setItem('traceflow.sidebar.collapsed', String(sidebar === 'collapsed'));
} else {
  window.localStorage.removeItem('traceflow.sidebar.collapsed');
}
const screen = query.get('screen') ?? 'overview';
const route =
  screen === 'settings'
    ? '/settings/account'
    : `/projects/1${screen === 'indicators' ? '/indicators' : ''}`;
const panelState = query.get('panelState') ?? 'available';
const date = '2026-09-25T15:00:00Z';
const titles = {
  I01: 'Progresso das Tasks',
  I02: 'Commits na main',
  I04: 'Retrabalho de PRs',
  I06: 'Qualidade das PRs',
  I09: 'Commits',
  I17: 'PRs abertas mais antigas',
  I20: 'Lead time',
  I21: 'Cycle time',
  I22: 'Throughput',
  I23: 'WIP atual',
  I25: 'Fluxo cumulativo',
  I26: 'Tasks',
  I27: 'Status das Tasks',
  I28: 'Tasks atrasadas',
  I36: 'Progresso da Sprint',
  I45: 'Burndown',
  I46: 'Burnup',
  I47: 'Velocidade',
  I48: 'Execuções por resultado',
  I49: 'Taxa de sucesso',
  I52: 'Saúde dos TestCases',
  I53: 'Defeitos por estado',
  I59: 'Defeitos por Requirement',
  I61: 'Requirements com Tasks',
  I62: 'Requirements com evidência técnica',
  I63: 'Requirements com TestCases',
  I64: 'Requirements com Defects',
  I65: 'Requirements validados',
  I66: 'Requirements implementados',
  I67: 'Progresso médio dos Requirements'
};
const base = (id, value, extra = {}) => ({
  metricId: id,
  value,
  state: 'AVAILABLE',
  unit: 'TASKS',
  kind: 'KPI',
  asOf: date,
  period: null,
  formula: 'Fórmula canônica recebida da API.',
  sources: ['Fonte canônica'],
  definitionVersion: id === 'I45' || id === 'I46' ? 2 : 1,
  limitations: [],
  appliedFilters: { period: false, sprint: false, responsible: false },
  filterCompatibility: {
    period: 'NOT_APPLICABLE',
    sprint: 'NOT_APPLICABLE',
    responsible: 'NOT_APPLICABLE'
  },
  ...extra
});
const linePoints = [
  { date: '2026-09-20', remaining: 13, ideal: 13, scope: 13, completed: 0 },
  { date: '2026-09-21', remaining: 11, ideal: 10, scope: 13, completed: 2 },
  { date: '2026-09-22', remaining: 9, ideal: 8, scope: 15, completed: 6 },
  { date: '2026-09-23', remaining: 8, ideal: 5, scope: 15, completed: 7 },
  { date: '2026-09-24', remaining: 5, ideal: 3, scope: 16, completed: 11 },
  { date: '2026-09-25', remaining: 4, ideal: 0, scope: 16, completed: 12 }
];
const burnup = base('I46', null, {
  kind: 'SERIES',
  unit: 'HOURS',
  state: burnupState,
  points:
    burnupState === 'UNAVAILABLE'
      ? []
      : burnupState === 'PARTIAL'
        ? linePoints.map((point, index) =>
            index < 2 ? { ...point, scope: null, completed: null } : point
          )
        : linePoints,
  limitations:
    burnupState === 'PARTIAL'
      ? ['BURNUP_COVERAGE_STARTED_MID_SPRINT']
      : burnupState === 'UNAVAILABLE'
        ? ['BURNUP_ESTIMATE_UNKNOWN']
        : []
});
const sections = {
  GENERAL: [
    {
      id: 'summary',
      indicators: [
        base('I01', 68, { unit: 'PERCENT' }),
        base('I23', 5),
        base('I28', 2, {
          kind: 'LIST',
          items: [{ taskId: 1, displayId: 'TASK-1', title: 'Revisar autenticação', deadline: date }]
        }),
        base('I61', 75, { unit: 'PERCENT' }),
        base('I66', 42, { unit: 'PERCENT', state: 'STALE', sourceUpdatedAt: date }),
        base(
          'I53',
          { ABERTO: 2, EM_CORRECAO: 1, VALIDADO: 3 },
          { kind: 'DISTRIBUTION', distribution: { ABERTO: 2, EM_CORRECAO: 1, VALIDADO: 3 } }
        )
      ]
    },
    {
      id: 'sprint',
      indicators: [base('I45', null, { kind: 'SERIES', unit: 'HOURS', points: linePoints }), burnup]
    }
  ],
  GITHUB: [
    { id: 'activity', indicators: [base('I02', 14), base('I09', 21)] },
    {
      id: 'pullRequests',
      indicators: [
        base('I04', 12, { unit: 'PERCENT', state: 'PARTIAL', limitations: ['GITHUB_SYNC_STALE'] }),
        base('I06', 80, { unit: 'PERCENT' }),
        base('I17', 1, {
          unit: 'DAYS',
          kind: 'LIST',
          items: [{ pullRequestId: 1, title: 'Revisão aguardando decisão', age: 1 }]
        })
      ]
    }
  ],
  FLOW: [
    {
      id: 'flow',
      indicators: [
        base('I20', 3.5, { unit: 'DAYS' }),
        base('I21', 2.1, { unit: 'DAYS' }),
        base('I22', null, {
          kind: 'SERIES',
          points: linePoints.map((point, index) => ({ date: point.date, value: index + 1 }))
        }),
        base('I23', 5),
        base('I25', null, {
          kind: 'SERIES',
          state: 'PARTIAL',
          limitations: ['INITIAL_STATE_NOT_GLOBALLY_PROVEN'],
          points: linePoints.map((point, index) => ({
            date: point.date,
            todo: 6 - index,
            inProgress: index + 1,
            done: index
          }))
        })
      ]
    }
  ],
  SPRINT: [
    { id: 'planning', indicators: [base('I36', 60, { unit: 'PERCENT' })] },
    {
      id: 'history',
      indicators: [
        base('I45', null, { kind: 'SERIES', unit: 'HOURS', points: linePoints }),
        burnup,
        base('I47', null, {
          kind: 'SERIES',
          unit: 'HOURS',
          points: [
            { sprintId: 1, sprintName: 'Sprint 1', completedPoints: 8 },
            { sprintId: 2, sprintName: 'Sprint 2', completedPoints: 12 }
          ]
        })
      ]
    }
  ],
  TASK: [
    {
      id: 'tasks',
      indicators: [
        base('I26', 18),
        base(
          'I27',
          { A_FAZER: 5, EM_ANDAMENTO: 5, CONCLUIDO: 8 },
          { kind: 'DISTRIBUTION', distribution: { A_FAZER: 5, EM_ANDAMENTO: 5, CONCLUIDO: 8 } }
        ),
        base('I28', 2, {
          kind: 'LIST',
          items: [{ taskId: 1, displayId: 'TASK-1', title: 'Revisar autenticação', deadline: date }]
        })
      ]
    }
  ],
  QUALITY: [
    {
      id: 'tests',
      indicators: [
        base(
          'I48',
          { PASS: 12, FAIL: 2, BLOCKED: 1, total: 15 },
          { kind: 'DISTRIBUTION', distribution: { PASS: 12, FAIL: 2, BLOCKED: 1, total: 15 } }
        ),
        base('I49', 80, { unit: 'PERCENT' }),
        base(
          'I52',
          { PASS: 7, FAIL: 1, BLOCKED: 0, NEVER_EXECUTED: 2, total: 10 },
          {
            kind: 'DISTRIBUTION',
            distribution: { PASS: 7, FAIL: 1, BLOCKED: 0, NEVER_EXECUTED: 2, total: 10 }
          }
        )
      ]
    },
    {
      id: 'defects',
      indicators: [
        base(
          'I53',
          { ABERTO: 2, VALIDADO: 3 },
          { kind: 'DISTRIBUTION', distribution: { ABERTO: 2, VALIDADO: 3 } }
        )
      ]
    },
    {
      id: 'concentration',
      indicators: [
        base('I59', null, {
          kind: 'LIST',
          items: [{ requirementId: 1, displayId: 'REQ-1', title: 'Autenticação', defectCount: 2 }],
          limitations: ['DEFECT_MAY_APPEAR_IN_MULTIPLE_REQUIREMENTS']
        })
      ]
    }
  ],
  TRACEABILITY: [
    {
      id: 'coverage',
      indicators: Array.from({ length: 7 }, (_, index) =>
        base(`I${61 + index}`, index === 3 ? null : 10 * (index + 1), {
          unit: 'PERCENT',
          ...(index === 3 ? { state: 'NO_DATA' } : {})
        })
      )
    }
  ]
};
if (healthScore !== undefined) {
  sections.GENERAL[0].indicators = sections.GENERAL[0].indicators.map((indicator) =>
    indicator.metricId === 'I28'
      ? {
          ...indicator,
          assessment: {
            healthModelVersion: 1,
            healthRole: 'SCORING_SIGNAL',
            dimension: 'PLANNING',
            status: healthState,
            score: healthScore,
            reasonCode: healthScore == null ? 'DATA_NO_DATA' : 'TASK_SHARE',
            basis: healthScore == null ? null : { count: 2, totalTasks: 18 }
          }
        }
      : indicator
  );
}
const healthDimensions = [
  ['PLANNING', 20],
  ['FLOW', 20],
  ['SPRINT', 15],
  ['QUALITY', 25],
  ['TRACEABILITY', 15],
  ['TECHNICAL_INTEGRATION', 5]
].map(([id, weight], index) => ({
  id,
  weight,
  applicable: true,
  coverage: healthScore == null ? 40 : 80,
  score: healthScore == null ? (index < 2 ? 80 : null) : healthScore,
  status: healthScore == null ? (index < 2 ? 'HEALTHY' : 'UNASSESSED') : healthState,
  assessedSignals: [],
  unassessedSignals: []
}));
const projectHealth =
  healthScore === undefined
    ? undefined
    : {
        healthModelVersion: 1,
        status: healthState,
        score: healthScore,
        coverage: healthScore == null ? 42 : 84,
        assessedDimensions: healthScore == null ? 2 : 6,
        assessedSignals: healthScore == null ? 8 : 17,
        applicableSignals: 20,
        dimensions: healthDimensions,
        drivers:
          healthScore == null
            ? { negative: [], positive: [] }
            : {
                negative: [
                  {
                    metricId: 'I28',
                    dimension: 'PLANNING',
                    status: healthState,
                    score: healthScore,
                    impact: 2,
                    reasonCode: 'TASK_SHARE',
                    basis: { count: 2, totalTasks: 18 }
                  }
                ],
                positive: [
                  {
                    metricId: 'I61',
                    dimension: 'TRACEABILITY',
                    status: 'HEALTHY',
                    score: 100,
                    impact: 0,
                    reasonCode: 'DIRECT_PERCENT',
                    basis: { value: 100 }
                  }
                ]
              }
      };
const catalog = Object.entries(titles).map(([metricId, title]) => ({
  metricId,
  title,
  description: `${title}: descrição do catálogo de teste.`,
  source: 'Fonte canônica',
  category: ['I45', 'I46', 'I47'].includes(metricId) ? 'SPRINT' : 'TASK',
  customization: {
    customizable: true,
    description: `${title}: descrição do catálogo de teste.`,
    sizeClass: ['I45', 'I46', 'I47'].includes(metricId) ? 'wide' : 'compact'
  },
  temporalType: ['I45', 'I46', 'I47'].includes(metricId)
    ? 'HISTORICAL_SERIES'
    : ['I02', 'I04', 'I06', 'I09', 'I20', 'I21', 'I22', 'I25', 'I48', 'I49'].includes(metricId)
      ? 'EVENT'
      : 'CURRENT_STATE'
}));
const project = {
  id: 1,
  name: 'Projeto exemplo P8',
  description: 'Plataforma de acompanhamento de projetos.',
  responsibleTeam: 'Equipe TraceFlow',
  status: 'ATIVO',
  createdAt: date,
  updatedAt: date,
  githubIntegration: {
    repositoryFullName: 'traceflow/demo',
    repositoryUrl: 'https://github.com/traceflow/demo',
    lastSyncStatus: 'SINCRONIZADO',
    lastSyncAt: date
  }
};
const defaultPreference = {
  configurationVersion: 1,
  widgets: ['I01', 'I23', 'I61', 'I66', 'I45', 'I46'],
  pinnedToOverview: false,
  isDefault: true,
  updatedAt: null
};
let preference = { ...defaultPreference, pinnedToOverview: query.get('pin') === '1' };
const metricsById = new Map(
  Object.values(sections)
    .flatMap((view) => view.flatMap((section) => section.indicators))
    .map((indicator) => [indicator.metricId, indicator])
);
// Real shell/panel with disposable synthetic data for visual and keyboard checks.
const notifications = Array.from({ length: 24 }, (_, index) => ({
  id: index + 1,
  type: 'TASK_STATUS_CHANGED',
  createdAt: date,
  readAt: index % 6 === 0 ? date : null,
  project: { id: 1, name: project.name },
  task: {
    id: index + 1,
    code: `TASK-${index + 1}`,
    title: 'Revisar a jornada completa',
    available: true
  },
  context: {
    fromStatus: 'EM_ANDAMENTO',
    toStatus: 'CONCLUIDO',
    actor: { id: 9, name: 'Pessoa de teste' },
    selfAction: true
  },
  link: '/projects/1'
}));
const notificationPreferences = {
  TASK_STATUS_CHANGED: true,
  TASK_OVERDUE: true,
  ISSUE_EVENT: true,
  PULL_REQUEST_EVENT: true,
  TRACEABILITY_INCONSISTENCY: true
};
httpClient.defaults.adapter = async (config) => {
  const path = new URL(config.url, 'http://local.test').pathname;
  const view = String(config.params?.view ?? 'GENERAL').toUpperCase();
  let data;
  if (path === '/notifications/unread-count')
    data = { unreadCount: notifications.filter((item) => !item.readAt).length };
  else if (path === '/notifications') {
    const items = notifications.filter((item) => config.params?.status === 'ALL' || !item.readAt);
    const offset = Number(config.params?.cursor ?? 0);
    const limit = Number(config.params?.limit ?? 20);
    data = {
      notifications: items.slice(offset, offset + limit),
      pagination: {
        page: 1,
        limit,
        total: items.length,
        totalPages: Math.ceil(items.length / limit)
      },
      unreadCount: notifications.filter((item) => !item.readAt).length,
      nextCursor: offset + limit < items.length ? String(offset + limit) : null
    };
  } else if (path === '/settings/notifications') data = { preferences: notificationPreferences };
  else if (path === '/projects') data = { projects: [project], deletedProjects: [] };
  else if (path === '/projects/1') data = { project };
  else if (path === '/projects/1/indicator-preference') {
    if (config.method === 'put' || config.method === 'patch') {
      const changes = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      preference = { ...preference, ...changes, isDefault: false, updatedAt: date };
    } else if (config.method === 'delete') {
      preference = { ...defaultPreference };
    }
    data = preference;
  } else if (path === '/projects/1/members')
    data = {
      currentMembership: { id: 1, role: 'OWNER' },
      members: [
        {
          id: 1,
          userId: 9,
          isActive: true,
          role: 'OWNER',
          user: { id: 9, name: 'Equipe de demonstração' }
        }
      ]
    };
  else if (path === '/projects/1/github/sync/status') data = { run: null };
  else if (path === '/projects/1/sprints')
    data = { sprints: [{ id: 1, name: 'Sprint 2', status: 'EM_ANDAMENTO' }] };
  else if (path === '/projects/1/indicators/catalog')
    data = {
      indicators: catalog,
      personalization: { minWidgets: 1, maxWidgets: 12, defaultPreference },
      views: Object.keys(sections).map((view) => ({
        view,
        periodIncludesProjectHealth: view === 'GENERAL',
        filterCompatibility: {
          period: ['GENERAL', 'GITHUB', 'FLOW', 'QUALITY'].includes(view)
            ? 'SUPPORTED'
            : 'NOT_APPLICABLE',
          sprint: ['GENERAL', 'SPRINT'].includes(view) ? 'SUPPORTED' : 'NOT_APPLICABLE',
          responsible: 'UNSAFE'
        }
      }))
    };
  else if (path === '/projects/1/indicators/dashboard') {
    if (view === 'CUSTOM' && panelState === 'loading') await new Promise(() => {});
    if (view === 'CUSTOM' && panelState === 'error') throw new Error('Falha sintética do painel.');
    data = {
      dashboardContractVersion: 1,
      projectId: 1,
      view,
      viewState: 'PARTIAL',
      generatedAt: date,
      requestedFilters: {
        period: config.params?.startDate
          ? {
              startDate: config.params.startDate,
              endDate: config.params.endDate,
              timeZone: config.params.timeZone
            }
          : null,
        sprintId: config.params?.sprintId ?? null,
        responsibleUserId: config.params?.responsibleUserId ?? null
      },
      context: {
        project: { id: 1, name: project.name },
        sprint: view === 'SPRINT' ? { id: 1, name: 'Sprint 2' } : null
      },
      freshness: { local: { generatedAt: date }, github: { sourceUpdatedAt: date } },
      sections:
        view === 'CUSTOM'
          ? [
              {
                id: 'custom',
                indicators: String(config.params?.widgets ?? preference.widgets.join(','))
                  .split(',')
                  .flatMap((metricId) =>
                    metricsById.has(metricId) ? [metricsById.get(metricId)] : []
                  )
              }
            ]
          : (sections[view] ?? sections.GENERAL),
      ...(view === 'GENERAL' && projectHealth ? { projectHealth } : {}),
      warnings: []
    };
  } else throw new Error(`Fixture sem resposta para ${path}`);
  return { data, status: 200, statusText: 'OK', headers: {}, config };
};

createRoot(document.getElementById('root')).render(
  <ThemeProvider>
    <ConfirmProvider>
      <MemoryRouter initialEntries={[`${route}?${query.toString()}`]}>
        <UnreadNotificationsProvider>
          <ProjectsCatalogProvider>
            <AppShell
              user={{ id: 9, name: 'Pessoa de teste', email: 'fixture@example.test' }}
              onLogout={() => {}}
            >
              <Routes>
                <Route path="/projects/:id" element={<ProjectDetailsScreen />} />
                <Route path="/projects/:projectId/indicators" element={<IndicatorsScreen />} />
                <Route path="/settings" element={<SettingsLayout />}>
                  <Route
                    path="account"
                    element={
                      <section className="settings-surface">
                        <h2>Conta de teste</h2>
                        <p>
                          Fixture de largura: os campos e textos de configuração mantêm uma área de
                          leitura limitada, mesmo em um monitor grande.
                        </p>
                        <label className="field">
                          <span>Nome</span>
                          <input value="Pessoa de teste" readOnly />
                        </label>
                      </section>
                    }
                  />
                </Route>
              </Routes>
            </AppShell>
          </ProjectsCatalogProvider>
        </UnreadNotificationsProvider>
      </MemoryRouter>
    </ConfirmProvider>
  </ThemeProvider>
);
