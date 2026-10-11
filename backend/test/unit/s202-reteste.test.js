import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEnvironment } from '../../src/config/env.js';
import {
  dueDateRange,
  overdueCutoff
} from '../../src/modules/notifications/notification.policy.js';

const DAY = 86_400_000;
const ZONES = [
  'America/Sao_Paulo',
  'UTC',
  'Asia/Tokyo',
  'America/New_York',
  'Europe/Lisbon',
  'Pacific/Kiritimati',
  'Pacific/Pago_Pago',
  'Australia/Lord_Howe',
  'Asia/Kathmandu'
];
const SKIPPED = [
  ['Pacific/Apia', '2011-12-30'],
  ['Pacific/Fakaofo', '2011-12-30'],
  ['Pacific/Kwajalein', '1993-08-21'],
  ['Pacific/Kiritimati', '1994-12-31']
];

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

function datesBetween(first, last) {
  const days = [];
  for (
    let ms = Date.parse(`${first}T00:00:00.000Z`);
    ms <= Date.parse(`${last}T00:00:00.000Z`);
    ms += DAY
  )
    days.push(new Date(ms).toISOString().slice(0, 10));
  return days;
}

describe('S2-02 reteste — corte e faixa de prazos perto de dias saltados (N-P)', () => {
  it.each(SKIPPED)(
    'RT-N-P-01 %s: a cada 15 minutos nos 10 dias em torno de %s, a faixa contém exatamente os prazos vencidos dentro da janela',
    (zone, skipped) => {
      const start = Date.parse(`${skipped}T00:00:00.000Z`) - 5 * DAY;
      const divergent = [];
      for (let now = start; now <= start + 10 * DAY; now += 15 * 60_000) {
        const instant = new Date(now);
        const { minDueDate, maxDueDate } = dueDateRange(instant, zone, 7);
        for (const dueDate of datesBetween(plusDays(skipped, -16), plusDays(skipped, 6))) {
          const cutoff = oracleCutoff(dueDate, zone);
          const expected = cutoff <= now && cutoff >= now - 7 * DAY;
          const inRange = dueDate >= minDueDate && dueDate <= maxDueDate;
          if (expected !== inRange)
            divergent.push([instant.toISOString(), dueDate, expected, inRange]);
        }
      }
      expect(divergent.slice(0, 5)).toEqual([]);
    },
    120000
  );

  it.each(SKIPPED)(
    'RT-N-P-02 %s: prazo no próprio dia saltado (%s) vence no início do dia local seguinte',
    (zone, skipped) => {
      const previous = plusDays(skipped, -1);

      expect(overdueCutoff(skipped, zone).getTime()).toBe(oracleCutoff(skipped, zone));
      expect(overdueCutoff(skipped, zone).getTime()).toBe(overdueCutoff(previous, zone).getTime());
      expect(oracleLocalDate(overdueCutoff(skipped, zone).getTime(), zone)).toBe(
        plusDays(skipped, 1)
      );
    }
  );

  it.each(ZONES)(
    'RT-N-P-03 %s: todos os dias de 2010 a 2030 coincidem com o oráculo',
    (zone) => {
      const divergent = datesBetween('2010-01-01', '2030-12-31')
        .map((dueDate) => [
          dueDate,
          overdueCutoff(dueDate, zone).getTime(),
          oracleCutoff(dueDate, zone)
        ])
        .filter(([, policy, oracle]) => policy !== oracle);
      expect(divergent).toEqual([]);
    },
    300000
  );

  it('RT-N-P-04 10.000 cortes num dia saltado: custo registrado', () => {
    const started = performance.now();
    for (let index = 0; index < 10000; index += 1) overdueCutoff('2011-12-29', 'Pacific/Apia');
    const skippedMs = performance.now() - started;
    const common = performance.now();
    for (let index = 0; index < 10000; index += 1) overdueCutoff('2026-10-10', 'America/Sao_Paulo');
    const commonMs = performance.now() - common;

    process.stdout.write(
      `RT-N-P-04 ${JSON.stringify({ skippedMs: Math.round(skippedMs), commonMs: Math.round(commonMs) })}\n`
    );
    expect(skippedMs).toBeLessThan(30000);
  }, 60000);
});

describe('S2-02 reteste — código morto e APP_TIMEZONE (RT-V-07)', () => {
  const backend = resolve(import.meta.dirname, '..', '..');

  function filesUnder(directory) {
    const found = [];
    for (const name of readdirSync(directory)) {
      if (name === 'node_modules') continue;
      const path = join(directory, name);
      if (statSync(path).isDirectory()) found.push(...filesUnder(path));
      else if (name.endsWith('.js')) found.push(path);
    }
    return found;
  }

  it('isValidTimeZone não existe em src, scripts nem test (fora deste arquivo)', () => {
    const offenders = ['src', 'scripts', 'test']
      .flatMap((folder) => filesUnder(join(backend, folder)))
      .filter((file) => !file.endsWith('s202-reteste.test.js'))
      .filter((file) => readFileSync(file, 'utf8').includes('isValidTimeZone'));

    expect(offenders).toEqual([]);
  });

  it.each(['-03:00', '+14:00', 'GMT-3', 'UTC-3'])(
    'APP_TIMEZONE continua recusando %j',
    (APP_TIMEZONE) => {
      expect(() =>
        createEnvironment({
          NODE_ENV: 'development',
          DATABASE_URL: 'mysql://user:password@localhost:3306/traceflow',
          APP_TIMEZONE
        })
      ).toThrowError(/APP_TIMEZONE/);
    }
  );
});
