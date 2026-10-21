// Relatório pronto no formato de publicReportDetail (S2-06), usado pelos testes do PDF.
// Os nomes de pessoas não estão no snapshot: vêm de `people`, congelados na geração.
export function reportFixture({ requirements = 3, sprints = 1, ...overrides } = {}) {
  const burndown = {
    hasData: true,
    chartMax: 10,
    totalPoints: 10,
    frozen: false,
    cutoffDate: '2026-09-03',
    historicalState: 'COMPLETE',
    historicalLimitations: [],
    days: [
      { date: '2026-09-01', ideal: 10, remaining: 10 },
      { date: '2026-09-02', ideal: 7.5, remaining: 8 },
      { date: '2026-09-03', ideal: 5, remaining: 4 },
      { date: '2026-09-04', ideal: 2.5, remaining: null },
      { date: '2026-09-05', ideal: 0, remaining: null }
    ]
  };
  const situations = ['EM_DESENVOLVIMENTO', 'COM_FALHA', 'VALIDADO'];
  return {
    id: 42,
    projectId: 7,
    status: 'SUCCEEDED',
    filters: {
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      timeZone: 'America/Sao_Paulo',
      sprintId: null
    },
    requestedBy: { userId: 5, displayName: 'Ana Gestão', username: 'ana' },
    snapshotVersion: 1,
    createdAt: '2026-10-01T12:00:00.000Z',
    startedAt: '2026-10-01T12:00:01.000Z',
    finishedAt: '2026-10-01T12:00:03.000Z',
    durationMs: 2000,
    error: null,
    people: [
      { userId: 5, displayName: 'Ana Gestão', username: 'ana' },
      { userId: 6, displayName: 'João Ação', username: 'joao' }
    ],
    snapshot: {
      schemaVersion: 1,
      generatedAt: '2026-10-01T12:00:01.000Z',
      project: { id: 7, name: 'Projeto Ação & Validação' },
      filters: {
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        timeZone: 'America/Sao_Paulo',
        sprintId: null,
        sprint: null
      },
      planning: {
        range: { from: '2026-09-01', to: '2026-09-30' },
        unassignedTaskCount: 2,
        sprints: Array.from({ length: sprints }, (_, index) => ({
          id: index + 1,
          name: `Sprint ${index + 1} — Integração`,
          status: 'EM_ANDAMENTO',
          startDate: '2026-09-01T00:00:00.000Z',
          endDate: '2026-09-05T00:00:00.000Z',
          objective: 'Entregar relatórios com acentuação: ção, ã, é, ü.',
          taskCount: 4,
          milestone: { id: 1, title: 'Marco de validação' },
          progress: {
            current: { numerator: 2, denominator: 4, percentage: 50, hasData: true },
            burndown
          }
        })),
        milestones: [
          {
            id: 1,
            title: 'Marco de validação',
            status: 'PENDENTE',
            dueDate: '2026-09-30T15:00:00.000Z',
            overdue: true,
            sprintCount: sprints
          }
        ]
      },
      traceability: {
        scope: 'CURRENT',
        summary: {
          total: requirements,
          withDefect: 1,
          bySituation: { EM_DESENVOLVIMENTO: 1, COM_FALHA: 1, VALIDADO: 1, PLANEJADO: 0 }
        },
        items: Array.from({ length: requirements }, (_, index) => ({
          requirement: {
            id: index + 1,
            displayId: `REQ-${index + 1}`,
            title: `Requisito número ${index + 1} — emissão`
          },
          situation: situations[index % situations.length],
          progress: { numerator: index % 3, denominator: 2, percentage: (index % 3) * 50 },
          validation: { testCasesTotal: index % 2 ? 4 : 0, pass: 3 },
          defects: { open: 1, inCorrection: index % 2, waitingRetest: 0 }
        }))
      },
      indicators: {
        catalog: [
          { metricId: 'I01', title: 'Progresso atual do projeto', unit: 'PERCENT', rf: 'RF15' },
          { metricId: 'I03', title: 'Tasks concluídas por responsável', unit: 'TASKS', rf: null },
          { metricId: 'I27', title: 'Tasks por status', unit: 'TASKS', rf: 'RF20' },
          { metricId: 'I28', title: 'Tasks atrasadas', unit: 'TASKS', rf: null },
          { metricId: 'I44', title: 'Esforço da Sprint', unit: 'HOURS', rf: null },
          { metricId: 'I45', title: 'Burndown', unit: 'HOURS', rf: null },
          { metricId: 'I61', title: 'Cobertura por Tasks', unit: 'PERCENT', rf: 'RF56' },
          { metricId: 'I66', title: 'Implementação', unit: 'PERCENT', rf: null }
        ],
        views: [
          {
            view: 'GENERAL',
            viewState: 'PARTIAL',
            projectHealth: { score: 61.4, status: 'ATTENTION' },
            sections: [
              {
                id: 'summary',
                indicators: [
                  {
                    metricId: 'I01',
                    state: 'AVAILABLE',
                    value: 55.56,
                    limitations: ['CURRENT_STATE_ONLY', 'SPRINT_FILTER_UNSAFE_NOT_APPLIED']
                  },
                  {
                    metricId: 'I66',
                    state: 'UNAVAILABLE',
                    value: 0,
                    limitations: ['GITHUB_NOT_CONFIGURED']
                  },
                  {
                    metricId: 'I28',
                    kind: 'LIST',
                    state: 'AVAILABLE',
                    value: 1,
                    assessment: {
                      status: 'ATTENTION',
                      reasonCode: 'TASK_SHARE',
                      basis: { count: 1, totalTasks: 10 }
                    },
                    items: [{ taskId: 9, title: 'Ajustar ação', responsible: { userId: 6 } }]
                  }
                ]
              }
            ]
          },
          {
            view: 'TASK',
            viewState: 'AVAILABLE',
            sections: [
              {
                id: 'tasks',
                indicators: [
                  {
                    metricId: 'I27',
                    state: 'AVAILABLE',
                    value: { A_FAZER: 2, CONCLUIDO: 5 },
                    distribution: { A_FAZER: 2, CONCLUIDO: 5, unknownCount: 0 }
                  },
                  {
                    metricId: 'I44',
                    state: 'AVAILABLE',
                    value: { estimatedHours: 28, actualHours: 30.5, differenceHours: 2.5 }
                  },
                  {
                    metricId: 'I03',
                    state: 'AVAILABLE',
                    value: { total: 3 },
                    people: [{ userId: 6, completedTasks: 3 }]
                  }
                ]
              }
            ]
          },
          {
            view: 'TRACEABILITY',
            viewState: 'AVAILABLE',
            sections: [
              {
                id: 'coverage',
                indicators: [
                  {
                    metricId: 'I61',
                    state: 'AVAILABLE',
                    value: 100,
                    limitations: [],
                    assessment: {
                      status: 'HEALTHY',
                      reasonCode: 'DIRECT_PERCENT',
                      basis: { value: 100 }
                    }
                  },
                  {
                    metricId: 'I66',
                    state: 'AVAILABLE',
                    value: 25,
                    limitations: [],
                    assessment: {
                      status: 'CRITICAL',
                      reasonCode: 'STAGE_GAP',
                      basis: { current: 25, expected: 70, gapPoints: 45 },
                      reference: { label: 'Progresso do projeto', unit: 'PERCENT', value: 70 },
                      delta: { unit: 'PERCENTAGE_POINTS', value: -45 }
                    }
                  },
                  {
                    metricId: 'I53',
                    state: 'AVAILABLE',
                    value: { total: 3, ABERTO: 1, active: 2, VALIDADO: 1 }
                  },
                  {
                    metricId: 'I45',
                    kind: 'SERIES',
                    state: 'AVAILABLE',
                    value: null,
                    points: [{}, {}]
                  }
                ]
              }
            ]
          }
        ]
      }
    },
    ...overrides
  };
}
