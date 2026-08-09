// RF35: evolucao por sprint. Modulo puro — nenhum acesso a banco, instante de
// corte sempre injetado. Se algum destes testes depender do fuso da maquina, o
// calculo esta errado, nao o teste.
import { describe, expect, it } from 'vitest';
import {
  buildScopeChange,
  buildSprintProgress,
  membersAtBaseline,
  resolveBaseline
} from '../../src/modules/sprints/sprint.progress.calculator.js';

const BASE = '2026-08-01T12:00:00.000Z';
const CORTE = new Date('2026-08-09T15:00:00.000Z');

const sprintEmAndamento = {
  id: 10,
  projectId: 1,
  status: 'EM_ANDAMENTO',
  startedAt: new Date(BASE)
};
const sprintPlanejada = { id: 10, projectId: 1, status: 'PLANEJADA', startedAt: null };

const tarefa = (id, status = 'A_FAZER') => ({ id, status });
const evento = (taskId, fromValue, toValue, dia) => ({
  taskId,
  fromValue,
  toValue,
  occurredAt: new Date(`2026-08-${dia}T10:00:00.000Z`)
});

const progresso = (overrides = {}) =>
  buildSprintProgress({
    sprint: sprintEmAndamento,
    currentTasks: [],
    historyTasks: [],
    history: [],
    cutoff: CORTE,
    ...overrides
  });

describe('linha de base do planejamento', () => {
  it('usa startedAt quando a sprint ja comecou', () => {
    expect(resolveBaseline(sprintEmAndamento)).toEqual({ kind: 'STARTED_AT', at: BASE });
  });

  // Sprint ainda planejada nao fechou o escopo: "depois do planejamento" nao tem
  // referencia, e isso e o comportamento correto, nao um caso degenerado.
  it('fica ABERTA enquanto a sprint nao inicia', () => {
    expect(resolveBaseline(sprintPlanejada)).toEqual({ kind: 'OPEN', at: null });
  });
});

describe('percentual', () => {
  // Zero e nulo sao estados diferentes: "nada concluido" nao e "nao ha o que medir".
  it('sprint sem tarefas devolve null, nunca 0, e nao divide por zero', () => {
    const resultado = progresso();
    expect(resultado.planned).toEqual({
      numerator: 0,
      denominator: 0,
      percentage: null,
      hasData: false
    });
    expect(resultado.current.percentage).toBeNull();
  });

  it('todas concluidas devolve 100', () => {
    const tarefas = [tarefa(1, 'CONCLUIDO'), tarefa(2, 'CONCLUIDO')];
    expect(progresso({ currentTasks: tarefas }).current.percentage).toBe(100);
  });

  it('arredonda 1 de 3 para 33.33', () => {
    const tarefas = [tarefa(1, 'CONCLUIDO'), tarefa(2), tarefa(3)];
    expect(progresso({ currentTasks: tarefas }).current).toMatchObject({
      numerator: 1,
      denominator: 3,
      percentage: 33.33
    });
  });

  // 66.67 e nao 66.66: prova que arredonda em vez de truncar.
  it('arredonda 2 de 3 para 66.67', () => {
    const tarefas = [tarefa(1, 'CONCLUIDO'), tarefa(2, 'CONCLUIDO'), tarefa(3)];
    expect(progresso({ currentTasks: tarefas }).current.percentage).toBe(66.67);
  });
});

describe('sprint ainda planejada', () => {
  it('ignora o historico: planejado e igual ao atual e nao ha mudanca de escopo', () => {
    const resultado = progresso({
      sprint: sprintPlanejada,
      currentTasks: [tarefa(1, 'CONCLUIDO'), tarefa(2)],
      history: [evento(9, null, '10', '05')]
    });

    expect(resultado.baseline).toEqual({ kind: 'OPEN', at: null });
    expect(resultado.scopeChange).toEqual({ added: [], removed: [] });
    expect(resultado.planned).toEqual(resultado.current);
    expect(resultado.planned.denominator).toBe(2);
  });
});

describe('escopo planejado versus escopo atual', () => {
  it('tarefa adicionada apos a base fica fora do planejado e dentro do atual', () => {
    const resultado = progresso({
      currentTasks: [tarefa(1, 'CONCLUIDO'), tarefa(2, 'CONCLUIDO')],
      history: [evento(2, null, '10', '05')]
    });

    expect(resultado.planned).toMatchObject({ numerator: 1, denominator: 1, percentage: 100 });
    expect(resultado.current).toMatchObject({ numerator: 2, denominator: 2 });
    expect(resultado.scopeChange.added).toEqual([
      { taskId: 2, at: '2026-08-05T10:00:00.000Z', fromSprintId: null }
    ]);
    expect(resultado.scopeChange.removed).toEqual([]);
  });

  // A tarefa removida CONTINUA no denominador do planejado: ela estava planejada.
  it('tarefa removida apos a base permanece no planejado', () => {
    const resultado = progresso({
      currentTasks: [tarefa(1)],
      historyTasks: [tarefa(7, 'CONCLUIDO')],
      history: [evento(7, '10', null, '04')]
    });

    expect(resultado.planned).toMatchObject({ numerator: 1, denominator: 2, percentage: 50 });
    expect(resultado.current).toMatchObject({ numerator: 0, denominator: 1 });
    expect(resultado.scopeChange.removed).toEqual([
      { taskId: 7, at: '2026-08-04T10:00:00.000Z', toSprintId: null }
    ]);
  });

  it('registra a sprint de origem de quem veio de outra sprint', () => {
    const resultado = progresso({
      currentTasks: [tarefa(5)],
      history: [evento(5, '42', '10', '06')]
    });

    expect(resultado.scopeChange.added).toEqual([
      { taskId: 5, at: '2026-08-06T10:00:00.000Z', fromSprintId: 42 }
    ]);
  });

  it('registra o destino de quem foi para outra sprint', () => {
    const resultado = progresso({
      currentTasks: [],
      historyTasks: [tarefa(8)],
      history: [evento(8, '10', '99', '07')]
    });

    expect(resultado.scopeChange.removed).toEqual([
      { taskId: 8, at: '2026-08-07T10:00:00.000Z', toSprintId: 99 }
    ]);
  });

  // O caso que a algebra de conjuntos erraria: saiu e voltou nao e entrada nem
  // saida. So a reconstrucao cronologica acerta o sinal.
  it('tarefa que saiu e voltou continua planejada e nao aparece como mudanca', () => {
    const resultado = progresso({
      currentTasks: [tarefa(5, 'CONCLUIDO')],
      history: [evento(5, '10', null, '02'), evento(5, null, '10', '03')]
    });

    expect(resultado.planned).toMatchObject({ numerator: 1, denominator: 1 });
    expect(resultado.scopeChange).toEqual({ added: [], removed: [] });
  });

  it('tarefa que entrou e saiu nao entra no planejado nem vira mudanca', () => {
    const resultado = progresso({
      currentTasks: [],
      historyTasks: [tarefa(6)],
      history: [evento(6, null, '10', '02'), evento(6, '10', null, '03')]
    });

    expect(resultado.planned.denominator).toBe(0);
    expect(resultado.scopeChange).toEqual({ added: [], removed: [] });
  });
});

describe('reconstrucao da base', () => {
  it('usa o fromValue da PRIMEIRA movimentacao posterior, nao da ultima', () => {
    const history = [evento(5, '10', '20', '03'), evento(5, '20', '30', '05')];
    expect([...membersAtBaseline({ currentTaskIds: [], history, sprintId: 10 })]).toEqual([5]);
  });

  it('tarefa sem movimentacao posterior conserva o estado atual', () => {
    expect([...membersAtBaseline({ currentTaskIds: [1, 2], history: [], sprintId: 10 })]).toEqual([
      1, 2
    ]);
  });

  it('ordena as listas de mudanca por taskId', () => {
    const { added } = buildScopeChange({
      plannedIds: new Set(),
      currentTaskIds: [9, 3, 7],
      history: [],
      sprintId: 10
    });
    expect(added.map((item) => item.taskId)).toEqual([3, 7, 9]);
  });
});

describe('determinismo', () => {
  it('mesmo corte devolve resultado identico em duas execucoes', () => {
    const entrada = {
      currentTasks: [tarefa(1, 'CONCLUIDO'), tarefa(2)],
      history: [evento(2, null, '10', '05')]
    };
    expect(progresso(entrada)).toEqual(progresso(entrada));
  });

  it('serializa o corte em UTC, independente do fuso da maquina', () => {
    expect(progresso().cutoff).toBe('2026-08-09T15:00:00.000Z');
  });
});
