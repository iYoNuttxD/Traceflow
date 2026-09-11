import { describe, expect, it } from 'vitest';
import {
  buildEffortSummary,
  canOperateTaskTimer,
  formatTaskTimeEntry
} from '../../src/modules/tasks/services/task-time-entry.presenter.js';

const HOUR = 3600;

describe('buildEffortSummary — fórmulas do S1-06', () => {
  it('sem estimativa: não há limite e as diferenças ficam nulas', () => {
    expect(
      buildEffortSummary({ estimatedHours: null, completedSeconds: 2 * HOUR, completedCount: 1 })
    ).toMatchObject({
      unit: 'HOURS',
      estimatedHours: null,
      estimatedSeconds: null,
      actualHours: 2,
      remainingSeconds: null,
      overrunSeconds: null,
      differenceHours: null,
      differencePercent: null,
      usagePercent: null,
      status: 'SEM_ESTIMATIVA',
      running: null
    });
  });

  it('dentro do previsto, próximo do limite e estourado seguem os limiares documentados', () => {
    expect(
      buildEffortSummary({
        estimatedHours: 8,
        completedSeconds: 3 * HOUR + 34 * 60,
        completedCount: 2
      })
    ).toMatchObject({
      actualHours: 3.57,
      remainingSeconds: 4 * HOUR + 26 * 60,
      overrunSeconds: 0,
      differenceHours: -4.43,
      differencePercent: -55.42,
      usagePercent: 44.58,
      status: 'DENTRO_DO_PREVISTO'
    });
    expect(
      buildEffortSummary({
        estimatedHours: 6,
        completedSeconds: 5 * HOUR + 50 * 60,
        completedCount: 3
      })
    ).toMatchObject({ usagePercent: 97.22, status: 'PROXIMO_DO_LIMITE' });
    expect(
      buildEffortSummary({
        estimatedHours: 5,
        completedSeconds: 6 * HOUR + 42 * 60,
        completedCount: 4
      })
    ).toMatchObject({
      actualHours: 6.7,
      remainingSeconds: 0,
      overrunSeconds: HOUR + 42 * 60,
      differenceHours: 1.7,
      differencePercent: 34,
      usagePercent: 134,
      status: 'ESTOURADO'
    });
  });

  it('exatamente no limite ainda não estourou; a partir de 70% avisa', () => {
    expect(
      buildEffortSummary({ estimatedHours: 2, completedSeconds: 2 * HOUR, completedCount: 1 })
    ).toMatchObject({
      status: 'PROXIMO_DO_LIMITE',
      overrunSeconds: 0,
      usagePercent: 100
    });
    expect(
      buildEffortSummary({ estimatedHours: 10, completedSeconds: 7 * HOUR, completedCount: 1 })
        .status
    ).toBe('PROXIMO_DO_LIMITE');
    expect(
      buildEffortSummary({ estimatedHours: 10, completedSeconds: 7 * HOUR - 1, completedCount: 1 })
        .status
    ).toBe('DENTRO_DO_PREVISTO');
  });

  it('estimativa zero: qualquer segundo registrado é estouro e o percentual não é calculado', () => {
    expect(
      buildEffortSummary({ estimatedHours: 0, completedSeconds: 0, completedCount: 0 })
    ).toMatchObject({
      status: 'DENTRO_DO_PREVISTO',
      usagePercent: null,
      differencePercent: null,
      differenceHours: 0,
      actualHours: 0
    });
    expect(
      buildEffortSummary({ estimatedHours: 0, completedSeconds: 60, completedCount: 1 })
    ).toMatchObject({
      status: 'ESTOURADO',
      overrunSeconds: 60,
      remainingSeconds: 0,
      usagePercent: null,
      differencePercent: null,
      differenceHours: 0.02
    });
  });

  it('expõe apenas o mínimo da sessão em andamento', () => {
    const running = {
      id: 9,
      startedAt: new Date('2026-09-06T14:02:00.000Z'),
      startedBy: { id: 10, name: 'Ana' },
      startedById: 10,
      note: 'não deve vazar'
    };
    expect(buildEffortSummary({ estimatedHours: 1, running }).running).toEqual({
      id: 9,
      startedAt: running.startedAt,
      startedBy: { id: 10, name: 'Ana' }
    });
  });
});

describe('formatTaskTimeEntry — capacidades por sessão', () => {
  const entry = {
    id: 5,
    taskId: 42,
    source: 'TIMER',
    startedAt: new Date('2026-09-06T14:00:00.000Z'),
    endedAt: new Date('2026-09-06T15:00:00.000Z'),
    durationSeconds: 3600,
    note: null,
    startedById: 10,
    endedById: 11,
    createdAt: new Date('2026-09-06T14:00:00.000Z'),
    startedBy: { id: 10, name: 'Ana' },
    endedBy: { id: 11, name: 'Bruno' }
  };

  it('quem iniciou exclui a própria sessão; MANAGER/OWNER moderam; VIEWER nunca', () => {
    expect(formatTaskTimeEntry(entry, { actorUserId: 10, membershipRole: 'MEMBER' })).toMatchObject(
      {
        startedBy: { id: 10, name: 'Ana' },
        endedBy: { id: 11, name: 'Bruno' },
        canDelete: true
      }
    );
    expect(
      formatTaskTimeEntry(entry, { actorUserId: 11, membershipRole: 'MEMBER' }).canDelete
    ).toBe(false);
    expect(
      formatTaskTimeEntry(entry, { actorUserId: 99, membershipRole: 'MANAGER' }).canDelete
    ).toBe(true);
    expect(formatTaskTimeEntry(entry, { actorUserId: 99, membershipRole: 'OWNER' }).canDelete).toBe(
      true
    );
    expect(
      formatTaskTimeEntry(entry, { actorUserId: 10, membershipRole: 'VIEWER' }).canDelete
    ).toBe(false);
    expect(JSON.stringify(formatTaskTimeEntry(entry, {}))).not.toContain('email');
  });

  it('qualquer papel que escreve opera o cronômetro; VIEWER e ausência de papel não', () => {
    expect(canOperateTaskTimer('MEMBER')).toBe(true);
    expect(canOperateTaskTimer('OWNER')).toBe(true);
    expect(canOperateTaskTimer('VIEWER')).toBe(false);
    expect(canOperateTaskTimer(undefined)).toBe(false);
  });
});
