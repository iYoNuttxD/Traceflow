import { describe, expect, it } from 'vitest';
import { overdueCutoff } from '../../src/modules/notifications/notification.policy.js';

const DAY = 86_400_000;

const formatters = new Map();
function oracleLocalDate(ms, timeZone) {
  if (!formatters.has(timeZone))
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
    );
  return formatters.get(timeZone).format(new Date(ms));
}

function plusDays(dateText, days) {
  const [year, month, day] = dateText.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function oracleCutoff(dueDate, timeZone) {
  const target = plusDays(dueDate, 1);
  const base = Date.parse(`${dueDate}T00:00:00.000Z`);
  let low = base - 2 * DAY;
  let high = base + 3 * DAY;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (oracleLocalDate(middle, timeZone) >= target) high = middle;
    else low = middle;
  }
  return high;
}

function datesOf(year) {
  const days = [];
  for (let ms = Date.UTC(year, 0, 1); ms < Date.UTC(year + 1, 0, 1); ms += DAY)
    days.push(new Date(ms).toISOString().slice(0, 10));
  return days;
}

describe('S2-02 correções — corte quando o dia seguinte ao prazo não existe (S202-A14)', () => {
  it.each([
    ['Pacific/Apia', '2011-12-29', '2011-12-30T10:00:00.000Z'],
    ['Pacific/Fakaofo', '2011-12-29', '2011-12-30T11:00:00.000Z'],
    ['Pacific/Kwajalein', '1993-08-20', '1993-08-21T12:00:00.000Z'],
    ['Pacific/Kiritimati', '1994-12-30', '1994-12-31T10:00:00.000Z']
  ])('C1-01 %s, prazo %s: vence quando o dia do prazo termina (%s)', (zone, dueDate, cutoff) => {
    expect(overdueCutoff(dueDate, zone).toISOString()).toBe(cutoff);
  });

  it.each([
    ['Pacific/Apia', [2011, 2012]],
    ['Pacific/Fakaofo', [2011, 2012]],
    ['Pacific/Kwajalein', [1993]],
    ['Pacific/Kiritimati', [1994, 1995]]
  ])('C1-02 %s: todos os dias de %j coincidem com o oráculo', (zone, years) => {
    const divergent = years
      .flatMap(datesOf)
      .map((dueDate) => [
        dueDate,
        overdueCutoff(dueDate, zone).getTime(),
        oracleCutoff(dueDate, zone)
      ])
      .filter(([, policy, oracle]) => policy !== oracle)
      .map(([dueDate, policy, oracle]) => [
        dueDate,
        new Date(policy).toISOString(),
        new Date(oracle).toISOString()
      ]);
    expect(divergent).toEqual([]);
  });
});
