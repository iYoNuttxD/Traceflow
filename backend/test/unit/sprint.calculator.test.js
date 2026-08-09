// RF10: funcoes puras de data e derivacao do cronograma.
// O "hoje" e sempre injetado; nenhum teste depende do relogio do ambiente.
import { describe, expect, it } from 'vitest';
import {
  durationInDays,
  intersectsRange,
  isDeadlineOutsideWindow,
  isMilestoneOverdue,
  isWithinRange,
  toDateOnlyString,
  toUtcDay
} from '../../src/modules/sprints/sprint.calculator.js';

const start = '2026-08-01';
const end = '2026-08-14';

describe('durationInDays', () => {
  it('conta a duracao de forma inclusiva', () => {
    expect(durationInDays(start, end)).toBe(14);
  });

  it('conta 1 dia para sprint que comeca e termina no mesmo dia', () => {
    expect(durationInDays('2026-08-01', '2026-08-01')).toBe(1);
  });

  it('conta a borda de virada de mes', () => {
    expect(durationInDays('2026-08-31', '2026-09-01')).toBe(2);
  });

  it('retorna null quando falta uma das datas', () => {
    expect(durationInDays(null, end)).toBeNull();
    expect(durationInDays(start, null)).toBeNull();
  });
});

describe('isDeadlineOutsideWindow', () => {
  it('trata prazo nulo como dentro da janela', () => {
    expect(isDeadlineOutsideWindow(null, start, end)).toBe(false);
  });

  it('aceita o primeiro dia da sprint', () => {
    expect(isDeadlineOutsideWindow('2026-08-01', start, end)).toBe(false);
  });

  it('aceita o ultimo dia da sprint', () => {
    expect(isDeadlineOutsideWindow('2026-08-14', start, end)).toBe(false);
  });

  it('marca um dia antes do inicio', () => {
    expect(isDeadlineOutsideWindow('2026-07-31', start, end)).toBe(true);
  });

  it('marca um dia depois do fim', () => {
    expect(isDeadlineOutsideWindow('2026-08-15', start, end)).toBe(true);
  });
});

describe('isMilestoneOverdue', () => {
  const today = '2026-08-10';

  it('nao considera atrasado o marco que vence hoje', () => {
    expect(isMilestoneOverdue('PENDENTE', today, today)).toBe(false);
  });

  it('considera atrasado o marco vencido ontem', () => {
    expect(isMilestoneOverdue('PENDENTE', '2026-08-09', today)).toBe(true);
  });

  it('nunca considera atrasado um marco concluido', () => {
    expect(isMilestoneOverdue('CONCLUIDO', '2026-01-01', today)).toBe(false);
  });
});

describe('normalizacao de fuso', () => {
  it('resolve um instante com offset para o dia UTC correto', () => {
    // 2026-08-14T23:59:59-03:00 e 2026-08-15T02:59:59Z: pertence ao dia 15 em UTC.
    expect(toDateOnlyString('2026-08-14T23:59:59-03:00')).toBe('2026-08-15');
    expect(isDeadlineOutsideWindow('2026-08-14T23:59:59-03:00', start, end)).toBe(true);
  });

  it('mantem o dia quando o offset nao cruza a meia-noite UTC', () => {
    expect(toDateOnlyString('2026-08-14T10:00:00-03:00')).toBe('2026-08-14');
    expect(isDeadlineOutsideWindow('2026-08-14T10:00:00-03:00', start, end)).toBe(false);
  });

  it('trunca a hora de um instante UTC', () => {
    expect(toUtcDay('2026-08-14T18:30:00.000Z')).toBe(Date.UTC(2026, 7, 14));
  });

  it('retorna null para valor invalido', () => {
    expect(toUtcDay('nao-e-data')).toBeNull();
    expect(toDateOnlyString(null)).toBeNull();
  });
});

describe('intersectsRange', () => {
  it('inclui sprint que cobre toda a janela', () => {
    expect(intersectsRange(start, end, '2026-08-05', '2026-08-06')).toBe(true);
  });

  it('inclui sprint que encosta no inicio da janela', () => {
    expect(intersectsRange(start, end, '2026-08-14', '2026-08-31')).toBe(true);
  });

  it('exclui sprint totalmente anterior a janela', () => {
    expect(intersectsRange(start, end, '2026-08-15', '2026-08-31')).toBe(false);
  });

  it('exclui sprint totalmente posterior a janela', () => {
    expect(intersectsRange(start, end, '2026-07-01', '2026-07-31')).toBe(false);
  });

  it('aceita janela aberta de um lado so', () => {
    expect(intersectsRange(start, end, null, '2026-07-31')).toBe(false);
    expect(intersectsRange(start, end, '2026-08-10', null)).toBe(true);
  });
});

describe('isWithinRange', () => {
  it('inclui as bordas da janela', () => {
    expect(isWithinRange('2026-08-01', start, end)).toBe(true);
    expect(isWithinRange('2026-08-14', start, end)).toBe(true);
  });

  it('exclui datas fora da janela', () => {
    expect(isWithinRange('2026-07-31', start, end)).toBe(false);
    expect(isWithinRange('2026-08-15', start, end)).toBe(false);
  });

  it('trata data nula como fora', () => {
    expect(isWithinRange(null, start, end)).toBe(false);
  });
});
