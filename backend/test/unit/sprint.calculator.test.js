import { describe, expect, it } from 'vitest';
import {
  durationInDays,
  intersectsRange,
  isDeadlineOutsideWindow,
  isMilestoneOverdue,
  isWithinRange,
  toDateOnlyString,
  toIsoString,
  toUtcDay
} from '../../src/modules/sprints/sprint.calculator.js';

const start = '2026-08-01T00:00:00.000Z';
const end = '2026-08-14T00:00:00.000Z';

describe('durationInDays', () => {
  it('conta os dias abrangidos pela janela semiaberta', () => {
    expect(durationInDays(start, end)).toBe(13);
  });

  it('arredonda para cima quando sobra hora', () => {
    expect(durationInDays(start, '2026-08-14T09:00:00.000Z')).toBe(14);
  });

  it('conta 1 dia para uma janela de exatamente 24 horas', () => {
    expect(durationInDays('2026-08-01T00:00:00.000Z', '2026-08-02T00:00:00.000Z')).toBe(1);
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

  it('aceita o instante inicial', () => {
    expect(isDeadlineOutsideWindow(start, start, end)).toBe(false);
  });

  it('aceita o ultimo instante antes do fim', () => {
    expect(isDeadlineOutsideWindow('2026-08-13T23:59:59.999Z', start, end)).toBe(false);
  });

  it('marca o instante final como fora', () => {
    expect(isDeadlineOutsideWindow(end, start, end)).toBe(true);
  });

  it('marca um instante anterior ao inicio', () => {
    expect(isDeadlineOutsideWindow('2026-07-31T23:59:59.999Z', start, end)).toBe(true);
  });
});

describe('isMilestoneOverdue', () => {
  const agora = '2026-08-10T12:00:00.000Z';

  it('nao considera atrasado o marco que vence depois de agora', () => {
    expect(isMilestoneOverdue('PENDENTE', '2026-08-10T18:00:00.000Z', agora)).toBe(false);
  });

  it('considera atrasado o marco ja vencido', () => {
    expect(isMilestoneOverdue('PENDENTE', '2026-08-10T09:00:00.000Z', agora)).toBe(true);
  });

  it('nunca considera atrasado um marco concluido', () => {
    expect(isMilestoneOverdue('CONCLUIDO', '2026-01-01T00:00:00.000Z', agora)).toBe(false);
  });
});

describe('preservacao do instante', () => {
  it('serializa em ISO-8601 UTC sem descartar hora, minuto ou segundo', () => {
    expect(toIsoString('2026-08-14T23:59:59-03:00')).toBe('2026-08-15T02:59:59.000Z');
    expect(toIsoString(new Date('2026-08-01T18:45:30.000Z'))).toBe('2026-08-01T18:45:30.000Z');
  });

  it('compara instantes, e nao dias, na janela da sprint', () => {
    expect(isDeadlineOutsideWindow('2026-08-13T23:59:59-03:00', start, end)).toBe(true);
    expect(isDeadlineOutsideWindow('2026-08-13T10:00:00-03:00', start, end)).toBe(false);
  });

  it('toUtcDay continua ancorando a agenda no dia', () => {
    expect(toUtcDay('2026-08-14T18:30:00.000Z')).toBe(Date.UTC(2026, 7, 14));
  });

  it('retorna null para valor invalido', () => {
    expect(toUtcDay('nao-e-data')).toBeNull();
    expect(toIsoString('nao-e-data')).toBeNull();
    expect(toDateOnlyString(null)).toBeNull();
  });
});

describe('intersectsRange', () => {
  const janela = (fromDia, toDiaSeguinte) => [fromDia, toDiaSeguinte];

  it('inclui sprint que cobre toda a janela', () => {
    const [de, ate] = janela('2026-08-05T00:00:00.000Z', '2026-08-07T00:00:00.000Z');
    expect(intersectsRange(start, end, de, ate)).toBe(true);
  });

  it('exclui sprint que termina no inicio da janela', () => {
    const [de, ate] = janela('2026-08-14T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
    expect(intersectsRange(start, end, de, ate)).toBe(false);
  });

  it('inclui sprint que termina um instante depois do inicio da janela', () => {
    const [de, ate] = janela('2026-08-13T23:00:00.000Z', '2026-09-01T00:00:00.000Z');
    expect(intersectsRange(start, end, de, ate)).toBe(true);
  });

  it('exclui sprint totalmente posterior a janela', () => {
    const [de, ate] = janela('2026-07-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
    expect(intersectsRange(start, end, de, ate)).toBe(false);
  });

  it('aceita janela aberta de um lado so', () => {
    expect(intersectsRange(start, end, null, '2026-08-01T00:00:00.000Z')).toBe(false);
    expect(intersectsRange(start, end, '2026-08-10T00:00:00.000Z', null)).toBe(true);
  });
});

describe('isWithinRange', () => {
  const de = '2026-08-01T00:00:00.000Z';
  const ate = '2026-08-15T00:00:00.000Z';

  it('inclui o inicio e todo o ultimo dia pedido', () => {
    expect(isWithinRange('2026-08-01T00:00:00.000Z', de, ate)).toBe(true);
    expect(isWithinRange('2026-08-14T23:59:59.999Z', de, ate)).toBe(true);
  });

  it('exclui instantes fora da janela', () => {
    expect(isWithinRange('2026-07-31T23:59:59.999Z', de, ate)).toBe(false);
    expect(isWithinRange('2026-08-15T00:00:00.000Z', de, ate)).toBe(false);
  });

  it('trata data nula como fora', () => {
    expect(isWithinRange(null, de, ate)).toBe(false);
  });
});
