import { describe, expect, it } from 'vitest';
import { buildSprintBurndown } from '../../src/modules/sprints/sprint.burndown.calculator.js';

const sprint = (overrides = {}) => ({
  id: 1,
  projectId: 1,
  status: 'EM_ANDAMENTO',
  startDate: new Date('2026-08-01T00:00:00.000Z'),
  endDate: new Date('2026-08-06T00:00:00.000Z'),
  completedAt: null,
  ...overrides
});

const participacao = (overrides = {}) => ({
  taskId: 1,
  points: 5,
  addedAt: new Date('2026-08-01T09:00:00.000Z'),
  removedAt: null,
  closedAt: null,
  exitStatus: null,
  currentStatus: 'A_FAZER',
  completedAt: null,
  ...overrides
});

const corte = (iso) => new Date(iso);

describe('janela e denominador', () => {
  it('gera um ponto por dia da janela semiaberta', () => {
    const resultado = buildSprintBurndown({
      sprint: sprint(),
      participations: [participacao()],
      cutoff: corte('2026-08-03T12:00:00.000Z')
    });
    expect(resultado.days.map((dia) => dia.date)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05'
    ]);
  });

  it('sem pontos nao ha grafico', () => {
    const resultado = buildSprintBurndown({
      sprint: sprint(),
      participations: [participacao({ points: 0 })],
      cutoff: corte('2026-08-03T12:00:00.000Z')
    });
    expect(resultado).toMatchObject({ hasData: false, totalPoints: 0, days: [] });
  });

  it('sem participacoes nao ha grafico', () => {
    const resultado = buildSprintBurndown({
      sprint: sprint(),
      participations: [],
      cutoff: corte('2026-08-03T12:00:00.000Z')
    });
    expect(resultado.hasData).toBe(false);
  });

  it('janela de um dia nao gera grafico', () => {
    const resultado = buildSprintBurndown({
      sprint: sprint({ endDate: new Date('2026-08-02T00:00:00.000Z') }),
      participations: [participacao()],
      cutoff: corte('2026-08-01T12:00:00.000Z')
    });
    expect(resultado.hasData).toBe(false);
  });

  it('participacao removida sai do denominador', () => {
    const resultado = buildSprintBurndown({
      sprint: sprint(),
      participations: [
        participacao({ taskId: 1, points: 5 }),
        participacao({ taskId: 2, points: 8, removedAt: new Date('2026-08-02T10:00:00.000Z') })
      ],
      cutoff: corte('2026-08-03T12:00:00.000Z')
    });
    expect(resultado.totalPoints).toBe(5);
  });
});

describe('linha ideal', () => {
  it('vai do total a zero em linha reta', () => {
    const resultado = buildSprintBurndown({
      sprint: sprint(),
      participations: [participacao({ points: 8 })],
      cutoff: corte('2026-08-05T12:00:00.000Z')
    });
    expect(resultado.days.map((dia) => dia.ideal)).toEqual([8, 6, 4, 2, 0]);
  });

  it('nao muda com o que foi concluido', () => {
    const comum = { sprint: sprint(), cutoff: corte('2026-08-05T12:00:00.000Z') };
    const parada = buildSprintBurndown({ ...comum, participations: [participacao({ points: 4 })] });
    const adiantada = buildSprintBurndown({
      ...comum,
      participations: [
        participacao({ points: 4, completedAt: new Date('2026-08-01T10:00:00.000Z') })
      ]
    });
    expect(parada.days.map((dia) => dia.ideal)).toEqual(adiantada.days.map((dia) => dia.ideal));
  });
});

describe('linha real', () => {
  it('queima os pontos no dia da conclusao', () => {
    const resultado = buildSprintBurndown({
      sprint: sprint(),
      participations: [
        participacao({ taskId: 1, points: 3, completedAt: new Date('2026-08-02T14:00:00.000Z') }),
        participacao({ taskId: 2, points: 5, completedAt: new Date('2026-08-04T09:00:00.000Z') })
      ],
      cutoff: corte('2026-08-05T12:00:00.000Z')
    });
    expect(resultado.days.map((dia) => dia.remaining)).toEqual([8, 5, 5, 0, 0]);
  });

  it('conta a conclusao das 23h no proprio dia', () => {
    const resultado = buildSprintBurndown({
      sprint: sprint(),
      participations: [
        participacao({ points: 5, completedAt: new Date('2026-08-02T23:59:00.000Z') })
      ],
      cutoff: corte('2026-08-03T12:00:00.000Z')
    });
    expect(resultado.days[1].remaining).toBe(0);
  });

  it('deixa os dias posteriores ao corte em null', () => {
    const resultado = buildSprintBurndown({
      sprint: sprint(),
      participations: [participacao({ points: 5 })],
      cutoff: corte('2026-08-02T12:00:00.000Z')
    });
    expect(resultado.days.map((dia) => dia.remaining)).toEqual([5, 5, null, null, null]);
    expect(resultado.cutoffDate).toBe('2026-08-02');
  });

  it('sem corte dentro da janela, nenhum dia e medido', () => {
    const resultado = buildSprintBurndown({
      sprint: sprint(),
      participations: [participacao({ points: 5 })],
      cutoff: corte('2026-07-20T12:00:00.000Z')
    });
    expect(resultado.days.every((dia) => dia.remaining === null)).toBe(true);
    expect(resultado.cutoffDate).toBeNull();
  });

  it('corte depois do fim mede a janela inteira', () => {
    const resultado = buildSprintBurndown({
      sprint: sprint(),
      participations: [participacao({ points: 5 })],
      cutoff: corte('2026-09-01T12:00:00.000Z')
    });
    expect(resultado.days.every((dia) => dia.remaining === 5)).toBe(true);
    expect(resultado.cutoffDate).toBe('2026-08-05');
  });

  it('tarefa que entra ja concluida queima na entrada, e nao no inicio', () => {
    const resultado = buildSprintBurndown({
      sprint: sprint(),
      participations: [
        participacao({ points: 4, completedAt: null }),
        participacao({
          taskId: 2,
          points: 6,
          addedAt: new Date('2026-08-03T10:00:00.000Z'),
          completedAt: null,
          currentStatus: 'CONCLUIDO'
        })
      ],
      cutoff: corte('2026-08-05T12:00:00.000Z')
    });
    expect(resultado.days.map((dia) => dia.remaining)).toEqual([10, 10, 4, 4, 4]);
  });

  it('usa exitStatus em vez do status atual da tarefa', () => {
    const resultado = buildSprintBurndown({
      sprint: sprint(),
      participations: [
        participacao({ points: 5, exitStatus: 'A_FAZER', currentStatus: 'CONCLUIDO' })
      ],
      cutoff: corte('2026-08-05T12:00:00.000Z')
    });
    expect(resultado.days.every((dia) => dia.remaining === 5)).toBe(true);
  });
});

describe('sprint encerrada', () => {
  it('congela o corte no encerramento', () => {
    const encerrada = sprint({
      status: 'CONCLUIDA',
      completedAt: new Date('2026-08-03T18:00:00.000Z')
    });
    const hoje = buildSprintBurndown({
      sprint: encerrada,
      participations: [participacao({ points: 5 })],
      cutoff: corte('2026-08-04T12:00:00.000Z')
    });
    const daquiUmMes = buildSprintBurndown({
      sprint: encerrada,
      participations: [participacao({ points: 5 })],
      cutoff: corte('2026-09-04T12:00:00.000Z')
    });
    expect(hoje.cutoffDate).toBe('2026-08-03');
    expect(hoje.days).toEqual(daquiUmMes.days);
    expect(hoje.frozen).toBe(true);
  });

  it('sprint cancelada tambem congela', () => {
    const resultado = buildSprintBurndown({
      sprint: sprint({ status: 'CANCELADA', completedAt: null }),
      participations: [participacao({ points: 5 })],
      cutoff: corte('2026-08-02T12:00:00.000Z')
    });
    expect(resultado.frozen).toBe(true);
  });
});
