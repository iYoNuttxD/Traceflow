import { describe, expect, it } from 'vitest';
import { buildSprintBurndown } from '../../src/modules/sprints/sprint.burndown.calculator.js';
import { buildSprintProgress } from '../../src/modules/sprints/sprint.progress.calculator.js';
import { createLogger } from '../../src/shared/logger/logger.js';

describe('teto da serie do burndown (I35)', () => {
  it('trunca em 180 dias uma janela de 200', () => {
    const resultado = buildSprintBurndown({
      sprint: {
        id: 1,
        projectId: 1,
        status: 'EM_ANDAMENTO',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-07-20T00:00:00.000Z'),
        completedAt: null
      },
      participations: [
        {
          taskId: 1,
          points: 8,
          addedAt: new Date('2026-01-01T09:00:00.000Z'),
          removedAt: null,
          closedAt: null,
          exitStatus: null,
          currentStatus: 'A_FAZER',
          completedAt: null
        }
      ],
      cutoff: new Date('2026-02-01T12:00:00.000Z')
    });
    expect(resultado.hasData).toBe(true);
    expect(resultado.days).toHaveLength(180);
    expect(resultado.days[0].date).toBe('2026-01-01');
    expect(resultado.days[179].date).toBe('2026-06-29');
  });

  it('não trunca uma janela de exatamente 180 dias', () => {
    const resultado = buildSprintBurndown({
      sprint: {
        id: 1,
        projectId: 1,
        status: 'EM_ANDAMENTO',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-06-30T00:00:00.000Z'),
        completedAt: null
      },
      participations: [
        {
          taskId: 1,
          points: 3,
          addedAt: new Date('2026-01-01T09:00:00.000Z'),
          removedAt: null,
          closedAt: null,
          exitStatus: null,
          currentStatus: 'A_FAZER',
          completedAt: null
        }
      ],
      cutoff: new Date('2026-02-01T12:00:00.000Z')
    });
    expect(resultado.days).toHaveLength(180);
    expect(resultado.days[179].date).toBe('2026-06-29');
  });
});

describe('equivalencia de offset (I36)', () => {
  const sprintZ = {
    id: 10,
    projectId: 1,
    status: 'EM_ANDAMENTO',
    startedAt: new Date('2026-08-01T12:00:00.000Z'),
    completedAt: null
  };
  const sprintOffset = {
    ...sprintZ,
    startedAt: new Date('2026-08-01T09:00:00.000-03:00')
  };
  const participacaoZ = {
    taskId: 1,
    taskTitleSnapshot: 'T1',
    addedAt: new Date('2026-08-02T01:30:00.000Z'),
    addedAfterStart: true,
    carriedFromSprintId: null,
    removedAt: null,
    removalReason: null,
    exitStatus: null,
    currentStatus: 'CONCLUIDO',
    movedToSprintId: null
  };
  const participacaoOffset = {
    ...participacaoZ,
    addedAt: new Date('2026-08-01T22:30:00.000-03:00')
  };

  it('a evolucao nao muda quando as datas trocam Z por -03:00', () => {
    const emZ = buildSprintProgress({
      sprint: sprintZ,
      participations: [participacaoZ],
      cutoff: new Date('2026-08-09T15:00:00.000Z')
    });
    const emOffset = buildSprintProgress({
      sprint: sprintOffset,
      participations: [participacaoOffset],
      cutoff: new Date('2026-08-09T12:00:00.000-03:00')
    });
    expect(emOffset).toEqual(emZ);
    expect(emZ.baseline.at).toBe('2026-08-01T12:00:00.000Z');
  });

  it('o burndown queima no dia UTC do instante, seja qual for a grafia', () => {
    const base = {
      sprint: {
        id: 1,
        projectId: 1,
        status: 'EM_ANDAMENTO',
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-08-06T00:00:00.000Z'),
        completedAt: null
      },
      cutoff: new Date('2026-08-05T12:00:00.000Z')
    };
    const feitaEmZ = buildSprintBurndown({
      ...base,
      participations: [
        {
          taskId: 1,
          points: 5,
          addedAt: new Date('2026-08-01T09:00:00.000Z'),
          removedAt: null,
          closedAt: null,
          exitStatus: 'CONCLUIDO',
          currentStatus: 'CONCLUIDO',
          completedAt: new Date('2026-08-02T23:00:00.000Z')
        }
      ]
    });
    const feitaEmOffset = buildSprintBurndown({
      ...base,
      participations: [
        {
          taskId: 1,
          points: 5,
          addedAt: new Date('2026-08-01T06:00:00.000-03:00'),
          removedAt: null,
          closedAt: null,
          exitStatus: 'CONCLUIDO',
          currentStatus: 'CONCLUIDO',
          completedAt: new Date('2026-08-02T20:00:00.000-03:00')
        }
      ]
    });
    expect(feitaEmOffset).toEqual(feitaEmZ);
    const dia2 = feitaEmZ.days.find((dia) => dia.date === '2026-08-02');
    expect(dia2.remaining).toBe(0);
  });
});

describe('logger resiste a injecao de linha (ASVS 16.4.1)', () => {
  it('nome com CRLF, ANSI e NUL sai numa unica linha JSON, com os bytes escapados', () => {
    const linhas = [];
    const logger = createLogger({
      environment: 'test',
      write: (_level, line) => linhas.push(line)
    });
    const hostil = 'Sprint legitima\r\n{"level":"error","message":"forjada"}\u001b[31m\u0000';

    logger.info('sprint criada', { sprintName: hostil, projectId: 1 });

    expect(linhas).toHaveLength(1);
    const linha = linhas[0];
    // eslint-disable-next-line no-control-regex
    expect(linha).not.toMatch(/[\u0000-\u001f]/);
    const evento = JSON.parse(linha);
    expect(evento.sprintName).toBe(hostil);
    expect(evento.message).toBe('sprint criada');
  });

  it('mensagem com CRLF tambem nao quebra a linha', () => {
    const linhas = [];
    const logger = createLogger({
      environment: 'test',
      write: (_level, line) => linhas.push(line)
    });
    logger.warn('primeira\r\nsegunda');
    expect(linhas).toHaveLength(1);
    // eslint-disable-next-line no-control-regex
    expect(linhas[0]).not.toMatch(/[\u0000-\u001f]/);
    expect(JSON.parse(linhas[0]).message).toBe('primeira\r\nsegunda');
  });
});

describe('guardas normativas do dominio (sobreviventes M05/M10 da bateria)', () => {
  it('ensureSingleActiveSprint ignora a propria sprint no retrato', async () => {
    const { ensureSingleActiveSprint } = await import('../../src/modules/sprints/sprint.schema.js');
    const retrato = [{ id: 10, name: 'S1', status: 'EM_ANDAMENTO' }];
    expect(() => ensureSingleActiveSprint(retrato, 10)).not.toThrow();
    expect(() => ensureSingleActiveSprint(retrato, 11)).toThrow(/já está em andamento/);
  });

  it('allMilestoneSprintsConcluded exige ao menos uma sprint nao cancelada', async () => {
    const { allMilestoneSprintsConcluded } =
      await import('../../src/modules/sprints/sprint.schema.js');
    expect(allMilestoneSprintsConcluded([])).toBe(false);
    expect(allMilestoneSprintsConcluded([{ status: 'CANCELADA' }])).toBe(false);
    expect(allMilestoneSprintsConcluded([{ status: 'CONCLUIDA' }, { status: 'CANCELADA' }])).toBe(
      true
    );
  });
});
