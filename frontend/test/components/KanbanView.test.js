// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  countActiveKanbanFilters,
  EMPTY_KANBAN_FILTERS,
  filterBoardBySprints,
  filterKanbanBoard,
  formatTraceabilityLine,
  getBoardTasks,
  getKanbanSummary,
  isTaskOverdue,
  technicalLinkSummary
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
      withoutTechnicalLink: 1,
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

  it('conta prioridade máxima, atraso e ausência de vínculo técnico (RF58, TF-REV-008)', () => {
    const critical = {
      id: 4,
      title: 'Incidente crítico',
      status: 'EM_ANDAMENTO',
      priority: 'CRITICA',
      deadline: '2026-09-01',
      commits: [],
      issues: []
    };
    const requirementOnly = { ...critical, id: 5, priority: 'BAIXA', requirement: { id: 2 } };
    const summary = getKanbanSummary(
      { columns: { A_FAZER: [requirementOnly], EM_ANDAMENTO: [critical], CONCLUIDO: [] } },
      new Date(2026, 8, 15)
    );

    expect(summary).toMatchObject({
      total: 2,
      criticalPriority: 1,
      overdue: 2,
      withoutTechnicalLink: 2
    });
  });

  it('combina busca, responsável, prioridade e prazo', () => {
    const filters = {
      search: 'autenticação',
      responsibleUserId: '5',
      priority: 'ALTA',
      startDate: '2026-09-01',
      endDate: '2026-09-15'
    };
    // Each distractor fails exactly one predicate; search alone cannot select the answer.
    const candidates = [
      { ...tasks[0], id: 10, deadline: filters.startDate },
      { ...tasks[0], id: 11, deadline: filters.endDate },
      { ...tasks[0], id: 12, description: 'Outra descrição' },
      { ...tasks[0], id: 13, responsibleUser: { id: 6, name: 'Bia' } },
      { ...tasks[0], id: 14, priority: 'MEDIA' },
      { ...tasks[0], id: 15, deadline: '2026-08-31' },
      { ...tasks[0], id: 16, deadline: '2026-09-16' },
      { ...tasks[0], id: 17, deadline: null }
    ];
    const candidateBoard = { columns: { A_FAZER: candidates, EM_ANDAMENTO: [], CONCLUIDO: [] } };
    const ids = (activeFilters) =>
      getBoardTasks(filterKanbanBoard(candidateBoard, activeFilters)).map((task) => task.id);

    expect(ids(filters)).toEqual([10, 11]);
    for (const [predicate, admittedId] of [
      ['search', 12],
      ['responsibleUserId', 13],
      ['priority', 14],
      ['startDate', 15],
      ['endDate', 16]
    ]) {
      expect(ids({ ...filters, [predicate]: '' })).toEqual([10, 11, admittedId]);
    }
    expect(ids({ ...filters, startDate: '', endDate: '' })).toEqual([10, 11, 15, 16, 17]);
    expect(countActiveKanbanFilters(filters)).toBe(5);
    expect(countActiveKanbanFilters({ ...EMPTY_KANBAN_FILTERS, traceability: 'SEM_VINCULO' })).toBe(
      1
    );
  });

  it('trata atraso pelo prazo próprio e ignora tarefa concluída', () => {
    const now = new Date(2026, 8, 15);
    expect(isTaskOverdue(tasks[0], now)).toBe(true);
    expect(isTaskOverdue(tasks[2], now)).toBe(false);
    expect(isTaskOverdue({ ...tasks[0], deadline: null }, now)).toBe(false);
  });

  it('separa o vínculo técnico do requisito na linha de rastreabilidade (RF58, TF-REV-008)', () => {
    expect(formatTraceabilityLine(tasks[0])).toBe('2 commits · 1 req');
    expect(formatTraceabilityLine(tasks[1])).toBe('1 PR · 1 issue · Sem requisito');
    expect(formatTraceabilityLine(tasks[2])).toBe('Sem vínculo técnico · Sem requisito');
    expect(formatTraceabilityLine({ ...tasks[2], requirement: { id: 2 } })).toBe(
      'Sem vínculo técnico · 1 req'
    );
    expect(formatTraceabilityLine({ id: 9, isFrozen: true })).toBe('Rastreabilidade indisponível');
    expect(
      formatTraceabilityLine({
        id: 9,
        isFrozen: true,
        traceabilityCounts: { requirements: 0, pullRequests: 0, commits: 1, issues: 0 }
      })
    ).toBe('1 commit · Sem requisito');
  });

  it('filtra por sem vínculo técnico e por concluída sem commit com alerta aberto (RF58, RF13)', () => {
    const openAlerts = new Map([[3, 70]]);
    const ids = (traceability, alerts = openAlerts) =>
      getBoardTasks(
        filterKanbanBoard(board, { ...EMPTY_KANBAN_FILTERS, traceability }, alerts)
      ).map((task) => task.id);

    expect(ids('')).toEqual([1, 2, 3]);
    expect(ids('SEM_VINCULO')).toEqual([3]);
    expect(ids('SEM_COMMIT')).toEqual([3]);
    expect(ids('SEM_COMMIT', new Map())).toEqual([]);
    const frozen = {
      columns: {
        A_FAZER: [],
        EM_ANDAMENTO: [],
        CONCLUIDO: [{ ...tasks[2], isFrozen: true, traceabilityCounts: undefined }]
      }
    };
    expect(
      getBoardTasks(
        filterKanbanBoard(
          frozen,
          { ...EMPTY_KANBAN_FILTERS, traceability: 'SEM_COMMIT' },
          openAlerts
        )
      )
    ).toEqual([]);
    expect(
      getBoardTasks(
        filterKanbanBoard(frozen, { ...EMPTY_KANBAN_FILTERS, traceability: 'SEM_VINCULO' })
      )
    ).toEqual([]);
  });

  it('resume o RF58 com o denominador e sem arredondar para 0% ou 100%', () => {
    const linked = { ...tasks[0] };
    const unlinked = { ...tasks[2] };
    const many = (count, task) => Array.from({ length: count }, (_, id) => ({ ...task, id }));

    expect(technicalLinkSummary([...many(68, linked), ...many(12, unlinked)])).toEqual({
      total: 80,
      unlinked: 12,
      text: 'Sem vínculo técnico: 12 de 80 tarefas (15%)'
    });
    expect(technicalLinkSummary([...many(299, linked), unlinked]).text).toBe(
      'Sem vínculo técnico: 1 de 300 tarefas (<1%)'
    );
    expect(technicalLinkSummary([linked, ...many(1203, unlinked)]).text).toBe(
      'Sem vínculo técnico: 1.203 de 1.204 tarefas (>99%)'
    );
    expect(technicalLinkSummary([unlinked]).text).toBe('Sem vínculo técnico: 1 de 1 tarefa (100%)');
    expect(technicalLinkSummary([])).toMatchObject({ total: 0, unlinked: 0 });
    expect(technicalLinkSummary([{ id: 1, isFrozen: true }, linked]).total).toBe(1);
  });
});
