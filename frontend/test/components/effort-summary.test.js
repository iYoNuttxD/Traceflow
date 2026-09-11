import { describe, expect, it } from 'vitest';
import {
  actualEffortFromSummary,
  buildEffortChip,
  computeEffortView,
  dayLabel,
  describeTimeEntry,
  effortProgressAria,
  formatClock,
  formatHoursMinutes,
  resolveEffort
} from '../../src/features/tasks/components/effort-summary.js';
import { updateBoardTask } from '../../src/features/tasks/components/kanban-view.js';
import { applyEffortEvent } from '../../src/features/tasks/hooks/useTaskEffort.js';

const HOUR = 3600;

describe('formatadores de esforço', () => {
  it('formata relógio e horas/minutos em pt-BR compacto', () => {
    expect(formatClock(0)).toBe('00:00:00');
    expect(formatClock(HOUR + 24 * 60 + 10)).toBe('01:24:10');
    expect(formatClock(-5)).toBe('00:00:00');
    expect(formatHoursMinutes(0)).toBe('0min');
    expect(formatHoursMinutes(45 * 60)).toBe('45min');
    expect(formatHoursMinutes(2 * HOUR)).toBe('2h');
    expect(formatHoursMinutes(2 * HOUR + 5 * 60)).toBe('2h05min');
    // Segundos que arredondam para 60 minutos viram uma hora, não "1h60min".
    expect(formatHoursMinutes(2 * HOUR - 1)).toBe('2h');
    expect(formatHoursMinutes(HOUR + 59 * 60 + 45)).toBe('2h');
  });

  it('realizado da tarefa inclui o esforço herdado, mesmo sem sessão encerrada', () => {
    // Sem sessão encerrada — cronômetro recém-iniciado, ou a última sessão excluída
    // — o legado continua sendo o realizado; zerá-lo fazia o cartão discordar do
    // rastreador sobre a mesma tarefa.
    expect(
      actualEffortFromSummary({ completedCount: 0, legacySeconds: 5 * HOUR, actualHours: 5 })
    ).toBe(5);
    expect(actualEffortFromSummary({ completedCount: 2, legacySeconds: 0, actualHours: 1.5 })).toBe(
      1.5
    );
    // Sem sessão e sem legado não há realizado conhecido.
    expect(actualEffortFromSummary({ completedCount: 0, legacySeconds: 0, actualHours: 0 })).toBe(
      null
    );
    expect(actualEffortFromSummary(null)).toBe(null);
  });

  it('progressbar mantém aria-valuenow no intervalo e leva o estouro para o valuetext', () => {
    const estourado = computeEffortView({
      effort: { estimatedHours: 8, completedSeconds: 9 * HOUR, completedCount: 1 }
    });
    expect(effortProgressAria(estourado)).toMatchObject({
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-valuenow': 100,
      'aria-valuetext': '113% da estimativa'
    });
    const dentro = computeEffortView({
      effort: { estimatedHours: 8, completedSeconds: 2 * HOUR, completedCount: 1 }
    });
    expect(effortProgressAria(dentro)).toMatchObject({
      'aria-valuenow': 25,
      'aria-valuetext': '25% da estimativa'
    });
  });

  it('rotula o dia como Hoje/Ontem ou data completa', () => {
    const now = new Date(2026, 8, 6, 15, 0, 0);
    expect(dayLabel(new Date(2026, 8, 6, 9, 0, 0), now)).toBe('Hoje');
    expect(dayLabel(new Date(2026, 8, 5, 23, 59, 0), now)).toBe('Ontem');
    expect(dayLabel(new Date(2026, 8, 1, 10, 0, 0), now)).toBe('01/09/2026');
    expect(dayLabel('inválida', now)).toBe('');
  });

  it('descreve a sessão como no preview e só cita quem parou quando foi outra pessoa', () => {
    const now = new Date(2026, 8, 6, 18, 0, 0);
    const ana = { id: 10, name: 'Ana' };
    const bruno = { id: 20, name: 'Bruno' };
    const startedAt = new Date(2026, 8, 6, 14, 2, 0);
    const endedAt = new Date(2026, 8, 6, 15, 47, 0);
    expect(
      describeTimeEntry({ source: 'TIMER', startedAt, endedAt, startedBy: ana, endedBy: ana }, now)
    ).toBe('Hoje, 14:02 → 15:47 · Ana');
    expect(
      describeTimeEntry(
        { source: 'TIMER', startedAt, endedAt, startedBy: ana, endedBy: bruno },
        now
      )
    ).toBe('Hoje, 14:02 → 15:47 · Ana · parado por Bruno');
    expect(
      describeTimeEntry(
        { source: 'MANUAL', startedAt, endedAt: new Date(2026, 8, 5, 9, 30, 0), startedBy: bruno },
        now
      )
    ).toBe('Ontem, 09:30 · Bruno');
    expect(
      describeTimeEntry({ source: 'TIMER', startedAt, endedAt, startedBy: { id: 7 } }, now)
    ).toBe('Hoje, 14:02 → 15:47 · Usuário #7');
  });
});

describe('resolveEffort — a tarefa em mãos complementa a leitura das sessões', () => {
  it('sem resposta da API deriva o provisório da própria tarefa', () => {
    expect(resolveEffort(null, { estimatedEffort: 8, actualEffort: 3 })).toEqual({
      estimatedHours: 8,
      completedSeconds: 3 * HOUR,
      completedCount: 1
    });
    expect(resolveEffort(null, { estimatedEffort: null, actualEffort: null })).toEqual({
      estimatedHours: null,
      completedSeconds: 0,
      completedCount: 0
    });
  });

  it('com resposta, a estimativa da tarefa prevalece e o restante vem das sessões', () => {
    const effort = { estimatedHours: 8, completedSeconds: 60, completedCount: 1 };
    expect(resolveEffort(effort, { estimatedEffort: 10, actualEffort: 3 })).toEqual({
      estimatedHours: 10,
      completedSeconds: 60,
      completedCount: 1
    });
    expect(resolveEffort(effort, {}).estimatedHours).toBe(8);
    expect(resolveEffort(effort, { estimatedEffort: null }).estimatedHours).toBe(8);
  });
});

describe('computeEffortView — espelha as fórmulas do backend com a sessão ao vivo', () => {
  const effort = { estimatedHours: 2, completedSeconds: HOUR, completedCount: 1 };

  it('soma o tempo da sessão em andamento e reclassifica o estado', () => {
    expect(computeEffortView({ effort, liveSeconds: 0 })).toMatchObject({
      hasEstimate: true,
      totalSeconds: HOUR,
      usagePercent: 50,
      barPercent: 50,
      status: 'DENTRO_DO_PREVISTO'
    });
    expect(computeEffortView({ effort, liveSeconds: 30 * 60 }).status).toBe('PROXIMO_DO_LIMITE');
    expect(computeEffortView({ effort, liveSeconds: 2 * HOUR })).toMatchObject({
      status: 'ESTOURADO',
      overrunSeconds: HOUR,
      remainingSeconds: 0,
      barPercent: 100,
      usagePercent: 150
    });
  });

  it('sem estimativa não há barra nem limite; estimativa zero estoura com qualquer segundo', () => {
    expect(
      computeEffortView({ effort: { estimatedHours: null, completedSeconds: 60 } })
    ).toMatchObject({
      hasEstimate: false,
      usagePercent: null,
      barPercent: 0,
      status: 'SEM_ESTIMATIVA'
    });
    expect(computeEffortView({ effort: { estimatedHours: 0, completedSeconds: 0 } })).toMatchObject(
      { status: 'DENTRO_DO_PREVISTO', barPercent: 0 }
    );
    expect(computeEffortView({ effort: { estimatedHours: 0, completedSeconds: 1 } })).toMatchObject(
      { status: 'ESTOURADO', usagePercent: null, barPercent: 100, overrunSeconds: 1 }
    );
    expect(computeEffortView({ effort: null })).toMatchObject({
      totalSeconds: 0,
      status: 'SEM_ESTIMATIVA'
    });
  });
});

describe('applyEffortEvent — reconciliação local dos eventos de sessão', () => {
  const base = {
    running: null,
    entries: [],
    effort: { completedSeconds: 0 },
    permissions: {},
    hasMore: false
  };
  const entry = (id, endedAt) => ({ id, endedAt, source: 'TIMER' });

  it('inicia, para, lança e exclui mantendo a ordem do mais recente', () => {
    const started = applyEffortEvent(
      base,
      'task.time_entry.started',
      { id: 1, startedAt: 'x' },
      null
    );
    expect(started.running).toEqual({ id: 1, startedAt: 'x' });
    expect(started.effort).toEqual(base.effort);

    const stopped = applyEffortEvent(
      started,
      'task.time_entry.stopped',
      entry(1, '2026-09-06T10:00:00.000Z'),
      { completedSeconds: 60 }
    );
    expect(stopped.running).toBeNull();
    expect(stopped.entries.map((item) => item.id)).toEqual([1]);
    expect(stopped.effort).toEqual({ completedSeconds: 60 });

    const created = applyEffortEvent(
      stopped,
      'task.time_entry.created',
      entry(2, '2026-09-06T11:00:00.000Z'),
      { completedSeconds: 120 }
    );
    expect(created.entries.map((item) => item.id)).toEqual([2, 1]);

    const deleted = applyEffortEvent(
      created,
      'task.time_entry.deleted',
      { id: 2 },
      { completedSeconds: 60 }
    );
    expect(deleted.entries.map((item) => item.id)).toEqual([1]);
  });

  it('excluir a sessão em andamento limpa o cronômetro; parar outra sessão não o afeta', () => {
    const running = applyEffortEvent(base, 'task.time_entry.started', { id: 7 }, null);
    expect(
      applyEffortEvent(running, 'task.time_entry.deleted', { id: 7 }, null).running
    ).toBeNull();
    expect(
      applyEffortEvent(
        running,
        'task.time_entry.stopped',
        entry(3, '2026-09-06T10:00:00.000Z'),
        null
      ).running
    ).toEqual({ id: 7 });
  });
});

describe('buildEffortChip — resumo do cartão do Kanban', () => {
  const now = new Date('2026-09-08T12:00:00.000Z').getTime();

  it('sem dado ou congelada não há indicador', () => {
    expect(buildEffortChip({ id: 1 }, now)).toBeNull();
    expect(buildEffortChip({ id: 1, isFrozen: true, estimatedEffort: 3 }, now)).toBeNull();
    expect(buildEffortChip(null, now)).toBeNull();
  });

  it('parado: total contra a estimativa; sem estimativa só o total', () => {
    expect(buildEffortChip({ estimatedEffort: 8, actualEffort: 2 }, now)).toMatchObject({
      running: false,
      tone: 'accent',
      value: '2h',
      detail: '/ 8h · 25%'
    });
    expect(buildEffortChip({ estimatedEffort: 8 }, now)).toMatchObject({
      value: '0min',
      detail: '/ 8h · 0%'
    });
    expect(buildEffortChip({ actualEffort: 1.5 }, now)).toMatchObject({
      tone: 'neutral',
      value: '1h30min',
      detail: ''
    });
    expect(buildEffortChip({ estimatedEffort: 1, actualEffort: 2 }, now)).toMatchObject({
      tone: 'danger',
      detail: '/ 1h · 200%'
    });
  });

  it('em andamento: relógio da sessão e percentual incluindo o tempo vivo', () => {
    const runningTimer = {
      id: 9,
      startedAt: '2026-09-08T11:30:00.000Z',
      startedBy: { id: 2, name: 'Bruno' }
    };
    expect(
      buildEffortChip({ estimatedEffort: 2, actualEffort: 1, runningTimer }, now)
    ).toMatchObject({
      running: true,
      tone: 'warning',
      value: '00:30:00',
      detail: '75%',
      title: 'Cronômetro em andamento por Bruno · total 1h30min de 2h estimadas (75%)'
    });
    expect(buildEffortChip({ runningTimer }, now)).toMatchObject({
      value: '00:30:00',
      detail: '30min'
    });
  });
});

describe('updateBoardTask — patch pontual de uma tarefa no board', () => {
  const board = {
    columns: { A_FAZER: [{ id: 1, title: 'a' }], EM_ANDAMENTO: [{ id: 2, title: 'b' }] },
    totals: { total: 2 }
  };

  it('aplica o patch só na tarefa alvo e preserva o restante', () => {
    const next = updateBoardTask(board, '2', { runningTimer: { id: 9 } });
    expect(next.columns.EM_ANDAMENTO[0]).toEqual({ id: 2, title: 'b', runningTimer: { id: 9 } });
    expect(next.columns.A_FAZER[0]).toBe(board.columns.A_FAZER[0]);
    expect(next.totals).toBe(board.totals);
    expect(updateBoardTask(null, 1, {})).toBeNull();
  });
});
