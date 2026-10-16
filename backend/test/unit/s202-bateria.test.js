import { describe, expect, it } from 'vitest';
import { createEnvironment } from '../../src/config/env.js';
import {
  latestOverdueDueDate,
  overdueCutoff,
  overdueDedupeKey,
  overdueExclusion,
  snapshotTitle,
  statusChangeDedupeKey,
  statusChangeExclusion
} from '../../src/modules/notifications/notification.policy.js';
import { notificationCoverages } from '../../src/modules/notifications/notification-metrics.policy.js';
import {
  parseOverdueNotificationArguments,
  runOverdueNotifications
} from '../../scripts/notify-overdue-tasks.js';

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

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

describe('S2-02 bateria de unidade — corte contra um oráculo independente (NT-P-01, NT-P-02)', () => {
  it.each(ZONES)(
    '%s: todos os dias de 2026 vencem no primeiro instante do dia local seguinte',
    (zone) => {
      const divergent = datesOf(2026)
        .map((dueDate) => [
          dueDate,
          overdueCutoff(dueDate, zone).getTime(),
          oracleCutoff(dueDate, zone)
        ])
        .filter(([, policy, oracle]) => policy !== oracle);
      expect(divergent).toEqual([]);
    }
  );

  it('America/Sao_Paulo: todos os dias de 2018 e 2019, com o horário de verão brasileiro', () => {
    const divergent = [...datesOf(2018), ...datesOf(2019)]
      .map((dueDate) => [
        dueDate,
        overdueCutoff(dueDate, 'America/Sao_Paulo').getTime(),
        oracleCutoff(dueDate, 'America/Sao_Paulo')
      ])
      .filter(([, policy, oracle]) => policy !== oracle);
    expect(divergent).toEqual([]);
  });
});

describe('S2-02 bateria de unidade — limite de prazos da varredura, sem janela (NT-P-04, TF-REV-002)', () => {
  it('500 instantes e 9 fusos: o limite separa exatamente os prazos vencidos dos que ainda não venceram', () => {
    const random = seeded(2026);
    const failures = [];
    for (let index = 0; index < 500; index += 1) {
      const zone = ZONES[Math.floor(random() * ZONES.length)];
      const now = new Date(Date.UTC(2026, 0, 1) + Math.floor(random() * 365 * DAY));
      const latest = latestOverdueDueDate(now, zone);
      for (let offset = -400; offset <= 3; offset += 1) {
        const dueDate = plusDays(latest, offset);
        const expected = oracleCutoff(dueDate, zone) <= now.getTime();
        const actual = dueDate <= latest;
        if (expected !== actual) failures.push({ zone, now: now.toISOString(), dueDate });
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('S2-02 bateria de unidade — tabelas de exclusão (NT-S-01, NT-P-09)', () => {
  const booleans = [true, false];

  it('RF30: as 32 combinações seguem a ordem documentada; o próprio ator não é excluído (TF-REV-002)', () => {
    const rows = [];
    for (const responsible of [5, null])
      for (const self of booleans)
        for (const accountActive of booleans)
          for (const membershipActive of booleans)
            for (const preferenceEnabled of booleans) {
              const candidate = {
                responsibleUserId: responsible,
                actorUserId: self ? 5 : 9,
                accountActive,
                membershipActive,
                preferenceEnabled
              };
              let expected = null;
              if (!responsible) expected = 'NO_RESPONSIBLE';
              else if (!accountActive) expected = 'INACTIVE_ACCOUNT';
              else if (!membershipActive) expected = 'INACTIVE_MEMBER';
              else if (!preferenceEnabled) expected = 'PREFERENCE_OFF';
              rows.push([JSON.stringify(candidate), statusChangeExclusion(candidate), expected]);
            }
    expect(rows.map(([label, actual]) => [label, actual])).toEqual(
      rows.map(([label, , expected]) => [label, expected])
    );
  });

  it('RF59: as 16 combinações seguem a ordem documentada, sem janela, e o ator não importa (TF-REV-002)', () => {
    const rows = [];
    for (const responsible of [5, null])
      for (const accountActive of booleans)
        for (const membershipActive of booleans)
          for (const preferenceEnabled of booleans) {
            const candidate = {
              responsibleUserId: responsible,
              actorUserId: 5,
              accountActive,
              membershipActive,
              preferenceEnabled
            };
            let expected = null;
            if (!responsible) expected = 'NO_RESPONSIBLE';
            else if (!accountActive) expected = 'INACTIVE_ACCOUNT';
            else if (!membershipActive) expected = 'INACTIVE_MEMBER';
            else if (!preferenceEnabled) expected = 'PREFERENCE_OFF';
            rows.push([JSON.stringify(candidate), overdueExclusion(candidate), expected]);
          }
    expect(rows.map(([label, actual]) => [label, actual])).toEqual(
      rows.map(([label, , expected]) => [label, expected])
    );
  });
});

describe('S2-02 bateria de unidade — título, chaves e cobertura', () => {
  it('NT-S-08 o título é cortado em 191 code points, sem partir um emoji', () => {
    const cases = [
      ['a'.repeat(190) + '😀😀', 191],
      ['😀'.repeat(191), 191],
      ['é'.normalize('NFD').repeat(100), 191],
      ['', 0]
    ];
    for (const [title, length] of cases) {
      const copy = snapshotTitle(title);
      expect(Array.from(copy)).toHaveLength(length);
      expect(copy).toBe(Array.from(title).slice(0, 191).join(''));
      expect(/[\uD800-\uDBFF]$/.test(copy)).toBe(false);
    }
    expect(snapshotTitle(null)).toBe('');
    expect(snapshotTitle(undefined)).toBe('');
  });

  it('as chaves cabem na coluna de 96 caracteres com os maiores ids e datas', () => {
    expect(statusChangeDedupeKey(2147483647).length).toBeLessThanOrEqual(96);
    expect(overdueDedupeKey(2147483647, '9999-12-31').length).toBeLessThanOrEqual(96);
  });

  it('a cobertura arredonda em duas casas e fica indisponível sem evento (TF-REV-002)', () => {
    const total = (occurred, sent) =>
      notificationCoverages({ occurred, sent, notSent: 0, noRecipient: 0, unobserved: 0 })
        .coberturaTotal;

    expect(total(3, 2).valor).toBe(66.67);
    expect(total(3, 1).valor).toBe(33.33);
    expect(total(3, 3).valor).toBe(100);
    expect(total(0, 0)).toMatchObject({ valor: null, situacao: 'INDISPONIVEL' });
  });
});

describe('S2-02 bateria de unidade — argumentos do script (NT-J-02)', () => {
  it.each([
    [[], { projectId: null, dryRun: true, confirmProduction: false }],
    [['--dry-run'], { projectId: null, dryRun: true, confirmProduction: false }],
    [['--apply'], { projectId: null, dryRun: false, confirmProduction: false }],
    [['--project-id=1'], { projectId: 1, dryRun: true, confirmProduction: false }],
    [
      ['--project-id=2147483647', '--apply'],
      { projectId: 2147483647, dryRun: false, confirmProduction: false }
    ],
    [
      ['--confirm-production', '--apply'],
      { projectId: null, dryRun: false, confirmProduction: true }
    ]
  ])('aceita %j', (args, expected) => {
    expect(parseOverdueNotificationArguments(args)).toEqual(expected);
  });

  it.each([
    [['--apply', '--dry-run']],
    [['--project-id=0']],
    [['--project-id=-1']],
    [['--project-id=1.5']],
    [['--project-id=2147483648']],
    [['--project-id=']],
    [['--project-id']],
    [['--projeto=1']],
    [['apply']],
    [['--APPLY']]
  ])('recusa %j com a mensagem de uso', (args) => {
    expect(() => parseOverdueNotificationArguments(args)).toThrowError(/Uso/);
  });

  it.each([
    [
      'erro do banco com código',
      Object.assign(new Error('senha=segredo em db:3306'), { code: 'P1001' })
    ],
    ['valor lançado que não é Error', 'texto cru com segredo']
  ])('%s vira a mensagem genérica, sem o texto original, e código 1', async (_, failure) => {
    const errors = [];
    const code = await runOverdueNotifications({
      args: ['--apply'],
      service: {
        notifyOverdueTasks: async () => {
          throw failure;
        }
      },
      databaseUrl: 'mysql://u:p@localhost:3306/traceflow_test',
      write: () => {},
      writeError: (text) => errors.push(text)
    });

    expect(code).toBe(1);
    expect(errors).toEqual(['Varredura de vencimentos falhou.\n']);
  });
});

describe('S2-02 bateria de unidade — APP_TIMEZONE (NT-P-04, bloco A §13.8)', () => {
  const base = {
    NODE_ENV: 'development',
    DATABASE_URL: 'mysql://user:password@localhost:3306/traceflow'
  };

  it.each([
    'UTC',
    'America/Sao_Paulo',
    'America/Argentina/Buenos_Aires',
    'Etc/GMT+3',
    'Brazil/East'
  ])('aceita o nome IANA %s', (APP_TIMEZONE) => {
    expect(createEnvironment({ ...base, APP_TIMEZONE }).appTimeZone).toBe(APP_TIMEZONE);
  });

  it.each([
    '-03:00',
    '+0300',
    'GMT-3',
    'UTC-3',
    ' America/Sao_Paulo',
    'America/Sao_Paulo ',
    'Sao_Paulo',
    'America//Sao_Paulo'
  ])('recusa %j, que não é nome IANA', (APP_TIMEZONE) => {
    expect(() => createEnvironment({ ...base, APP_TIMEZONE })).toThrowError(/APP_TIMEZONE/);
  });
});
