import { describe, expect, it } from 'vitest';
import {
  countActiveKanbanFilters,
  EMPTY_KANBAN_FILTERS,
  filterBoardBySprints,
  filterKanbanBoard,
  formatTraceabilityCounts,
  getBoardTasks,
  getKanbanSummary,
  isTaskOverdue
} from '../../src/features/tasks/components/kanban-view.js';

const tasks = [
  {
    id: 1,
    title: 'Implementar login',
    description: 'Autenticação segura',
    status: 'A_FAZER',
    priority: 'ALTA',
    sprintId: 10,
    responsibleUser: { id: 5, name: 'Ana' },
    deadline: '2026-09-10',
    requirement: { id: 2 },
    commits: [{ id: 3 }, { id: 4 }],
    issues: []
  },
  {
    id: 2,
    title: 'Documentar API',
    status: 'EM_ANDAMENTO',
    priority: 'MEDIA',
    sprintId: 11,
    responsibleUser: { id: 6, name: 'Bia' },
    deadline: '2026-09-20',
    pullRequest: { id: 8 },
    commits: [],
    issues: [{ id: 9 }]
  },
  {
    id: 3,
    title: 'Publicar entrega',
    status: 'CONCLUIDO',
    priority: 'BAIXA',
    sprintId: 10,
    responsibleUser: { id: 5, name: 'Ana' },
    deadline: '2026-09-01',
    commits: [],
    issues: []
  }
];

const board = {
  columns: {
    A_FAZER: [tasks[0]],
    EM_ANDAMENTO: [tasks[1]],
    CONCLUIDO: [tasks[2]]
  }
};

describe('kanban-view', () => {
  it('calcula métricas transversais sem substituir as contagens das colunas', () => {
    expect(getKanbanSummary(board, new Date(2026, 8, 15))).toEqual({
      total: 3,
      criticalPriority: 0,
      overdue: 1,
      untraced: 1,
      A_FAZER: 1,
      EM_ANDAMENTO: 1,
      CONCLUIDO: 1
    });
  });

  it('recorta por Sprint antes de aplicar filtros secundários', () => {
    const scoped = filterBoardBySprints(board, [10]);
    const filtered = filterKanbanBoard(scoped, {
      ...EMPTY_KANBAN_FILTERS,
      search: 'login'
    });

    expect(getKanbanSummary(scoped).total).toBe(2);
    expect(getBoardTasks(filtered).map((task) => task.id)).toEqual([1]);
  });

  it('conta prioridade máxima, atraso e ausência total de rastreabilidade', () => {
    const critical = {
      id: 4,
      title: 'Incidente crítico',
      status: 'EM_ANDAMENTO',
      priority: 'CRITICA',
      deadline: '2026-09-01',
      commits: [],
      issues: []
    };
    const summary = getKanbanSummary(
      { columns: { A_FAZER: [], EM_ANDAMENTO: [critical], CONCLUIDO: [] } },
      new Date(2026, 8, 15)
    );

    expect(summary).toMatchObject({
      total: 1,
      criticalPriority: 1,
      overdue: 1,
      untraced: 1
    });
  });

  it('combina busca, responsável, prioridade e prazo', () => {
    const filtered = filterKanbanBoard(board, {
      search: 'autenticação',
      responsibleUserId: '5',
      priority: 'ALTA',
      startDate: '2026-09-01',
      endDate: '2026-09-15'
    });

    expect(getBoardTasks(filtered).map((task) => task.id)).toEqual([1]);
    expect(
      countActiveKanbanFilters({
        search: 'autenticação',
        responsibleUserId: '5',
        priority: 'ALTA',
        startDate: '2026-09-01',
        endDate: '2026-09-15'
      })
    ).toBe(5);
  });

  it('trata atraso pelo prazo próprio e ignora tarefa concluída', () => {
    const now = new Date(2026, 8, 15);
    expect(isTaskOverdue(tasks[0], now)).toBe(true);
    expect(isTaskOverdue(tasks[2], now)).toBe(false);
    expect(isTaskOverdue({ ...tasks[0], deadline: null }, now)).toBe(false);
  });

  it('resume rastreabilidade sem expor os artefatos completos', () => {
    expect(formatTraceabilityCounts(tasks[0])).toBe('1 req · 2 commits');
    expect(formatTraceabilityCounts(tasks[1])).toBe('1 PR · 1 issue');
    expect(formatTraceabilityCounts(tasks[2])).toBe('Sem rastreabilidade');
  });
});
