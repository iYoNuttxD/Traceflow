import { describe, expect, it } from 'vitest';
import {
  buildSprintProgress,
  effectiveStatus,
  resolveBaseline
} from '../../src/modules/sprints/sprint.progress.calculator.js';

const BASE = '2026-08-01T12:00:00.000Z';
const CORTE = new Date('2026-08-09T15:00:00.000Z');
const FIM = new Date('2026-08-14T18:00:00.000Z');

const emAndamento = {
  id: 10,
  projectId: 1,
  status: 'EM_ANDAMENTO',
  startedAt: new Date(BASE),
  completedAt: null
};
const planejada = {
  id: 10,
  projectId: 1,
  status: 'PLANEJADA',
  startedAt: null,
  completedAt: null
};
const concluida = { ...emAndamento, status: 'CONCLUIDA', completedAt: FIM };

const participacao = (taskId, overrides = {}) => ({
  taskId,
  taskTitleSnapshot: `T${taskId}`,
  addedAt: new Date('2026-08-01T09:00:00.000Z'),
  addedAfterStart: false,
  carriedFromSprintId: null,
  removedAt: null,
  removalReason: null,
  exitStatus: null,
  currentStatus: 'A_FAZER',
  movedToSprintId: null,
  ...overrides
});

const progresso = (participations, sprint = emAndamento) =>
  buildSprintProgress({ sprint, participations, cutoff: CORTE });

describe('linha de base do planejamento', () => {
  it('usa startedAt quando a sprint ja comecou', () => {
    expect(resolveBaseline(emAndamento)).toEqual({ kind: 'STARTED_AT', at: BASE });
  });

  it('fica ABERTA enquanto a sprint nao comecou', () => {
    expect(resolveBaseline(planejada)).toEqual({ kind: 'OPEN', at: null });
  });

  it('com base aberta planejado e atual coincidem e nao ha mudanca de escopo', () => {
    const resultado = progresso(
      [
        participacao(1, { currentStatus: 'CONCLUIDO' }),
        participacao(2, { removedAt: new Date('2026-07-30T10:00:00.000Z') })
      ],
      planejada
    );
    expect(resultado.planned).toEqual(resultado.current);
    expect(resultado.planned.denominator).toBe(1);
    expect(resultado.scopeChange).toEqual({ added: [], removed: [] });
  });
});

describe('status que vale para a sprint', () => {
  it('prefere o status congelado ao status atual da tarefa', () => {
    expect(
      effectiveStatus(participacao(1, { exitStatus: 'EM_ANDAMENTO', currentStatus: 'CONCLUIDO' }))
    ).toBe('EM_ANDAMENTO');
  });

  it('usa o status atual enquanto a participacao segue aberta', () => {
    expect(effectiveStatus(participacao(1, { currentStatus: 'CONCLUIDO' }))).toBe('CONCLUIDO');
  });
});

describe('metricas', () => {
  it('conta concluidas sobre o total de participacoes', () => {
    const resultado = progresso([
      participacao(1, { currentStatus: 'CONCLUIDO' }),
      participacao(2, { currentStatus: 'CONCLUIDO' }),
      participacao(3)
    ]);
    expect(resultado.current).toMatchObject({ numerator: 2, denominator: 3, hasData: true });
    expect(resultado.current.percentage).toBeCloseTo(66.67, 2);
  });

  it('devolve percentual nulo quando nao ha participacao', () => {
    const resultado = progresso([]);
    expect(resultado.current).toMatchObject({
      numerator: 0,
      denominator: 0,
      percentage: null,
      hasData: false
    });
  });

  it('mantem no planejado a tarefa que saiu depois do inicio', () => {
    const resultado = progresso([
      participacao(1, { currentStatus: 'CONCLUIDO' }),
      participacao(2, { removedAt: new Date('2026-08-05T10:00:00.000Z'), exitStatus: 'A_FAZER' })
    ]);
    expect(resultado.planned).toMatchObject({ numerator: 1, denominator: 2 });
    expect(resultado.current).toMatchObject({ numerator: 1, denominator: 1 });
  });
});

describe('mudanca de escopo depois do inicio', () => {
  it('lista a inclusao posterior com o instante e a sprint de origem', () => {
    const resultado = progresso([
      participacao(1),
      participacao(2, {
        addedAfterStart: true,
        addedAt: new Date('2026-08-05T10:00:00.000Z'),
        carriedFromSprintId: 42
      })
    ]);
    expect(resultado.scopeChange.added).toEqual([
      { taskId: 2, at: '2026-08-05T10:00:00.000Z', fromSprintId: 42 }
    ]);
  });

  it('lista a saida com motivo, destino e status congelado', () => {
    const resultado = progresso([
      participacao(7, {
        removedAt: new Date('2026-08-06T10:00:00.000Z'),
        removalReason: 'MOVIDA',
        exitStatus: 'EM_ANDAMENTO',
        movedToSprintId: 11
      })
    ]);
    expect(resultado.scopeChange.removed).toEqual([
      {
        taskId: 7,
        at: '2026-08-06T10:00:00.000Z',
        toSprintId: 11,
        reason: 'MOVIDA',
        exitStatus: 'EM_ANDAMENTO'
      }
    ]);
  });

  it('nao conta quem entrou depois do inicio e ja saiu', () => {
    const resultado = progresso([
      participacao(5, {
        addedAfterStart: true,
        removedAt: new Date('2026-08-07T10:00:00.000Z'),
        removalReason: 'REMOVIDA'
      })
    ]);
    expect(resultado.scopeChange).toEqual({ added: [], removed: [] });
  });
});

describe('continuidade entre sprints', () => {
  it('aponta para onde a tarefa seguiu, preservando o status observado aqui', () => {
    const resultado = progresso([
      participacao(3, {
        removedAt: new Date('2026-08-08T10:00:00.000Z'),
        removalReason: 'MOVIDA',
        exitStatus: 'EM_ANDAMENTO',
        movedToSprintId: 11,
        currentStatus: 'CONCLUIDO'
      })
    ]);
    expect(resultado.carryOver).toEqual([
      { taskId: 3, toSprintId: 11, exitStatus: 'EM_ANDAMENTO', at: '2026-08-08T10:00:00.000Z' }
    ]);
  });
});

describe('imutabilidade da sprint encerrada', () => {
  const congelada = [
    participacao(1, { exitStatus: 'CONCLUIDO', currentStatus: 'CONCLUIDO' }),
    participacao(2, { exitStatus: 'EM_ANDAMENTO', currentStatus: 'EM_ANDAMENTO' })
  ];

  it('marca o resultado como congelado e corta no encerramento', () => {
    const resultado = buildSprintProgress({
      sprint: concluida,
      participations: congelada,
      cutoff: CORTE
    });
    expect(resultado.frozen).toBe(true);
    expect(resultado.cutoff).toBe(FIM.toISOString());
  });

  it('concluir a tarefa depois nao altera o resultado da sprint fechada', () => {
    const antes = buildSprintProgress({
      sprint: concluida,
      participations: congelada,
      cutoff: CORTE
    });
    const depois = buildSprintProgress({
      sprint: concluida,
      participations: [
        congelada[0],
        { ...congelada[1], currentStatus: 'CONCLUIDO', movedToSprintId: 11 }
      ],
      cutoff: new Date('2026-09-01T00:00:00.000Z')
    });

    expect(depois.planned).toEqual(antes.planned);
    expect(depois.current).toEqual(antes.current);
    expect(depois.cutoff).toBe(antes.cutoff);
    expect(depois.current).toMatchObject({ numerator: 1, denominator: 2 });
  });

  it('excluir a tarefa depois nao muda o denominador', () => {
    const resultado = buildSprintProgress({
      sprint: concluida,
      participations: [
        congelada[0],
        { ...congelada[1], currentStatus: null, removalReason: 'TAREFA_EXCLUIDA' }
      ],
      cutoff: CORTE
    });
    expect(resultado.planned).toMatchObject({ numerator: 1, denominator: 2 });
  });

  it('sprint aberta corta no instante da consulta', () => {
    expect(progresso([]).frozen).toBe(false);
    expect(progresso([]).cutoff).toBe(CORTE.toISOString());
  });
});

describe('pureza e determinismo', () => {
  it('nao depende do fuso da maquina nem do relogio', () => {
    const participations = [
      participacao(1, { currentStatus: 'CONCLUIDO' }),
      participacao(2, { addedAfterStart: true, addedAt: new Date('2026-08-05T10:00:00.000Z') })
    ];
    const primeiro = progresso(participations);
    const segundo = progresso(participations);
    expect(primeiro).toEqual(segundo);
    expect(primeiro.cutoff).toBe('2026-08-09T15:00:00.000Z');
  });

  it('ordena as listas por tarefa, independentemente da ordem de entrada', () => {
    const resultado = progresso([
      participacao(9, { addedAfterStart: true }),
      participacao(2, { addedAfterStart: true }),
      participacao(5, { addedAfterStart: true })
    ]);
    expect(resultado.scopeChange.added.map((item) => item.taskId)).toEqual([2, 5, 9]);
  });
});
