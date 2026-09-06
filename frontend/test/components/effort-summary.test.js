import { describe, expect, it } from 'vitest';
import {
  computeEffortView,
  dayLabel,
  describeTimeEntry,
  formatClock,
  formatHoursMinutes,
  resolveEffort
} from '../../src/features/tasks/components/effort-summary.js';
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
