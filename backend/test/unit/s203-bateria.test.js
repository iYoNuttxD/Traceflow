import { appendFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  ARTIFACT_URL_MAX_LENGTH,
  eventExclusion,
  githubEventDedupeKey,
  isWithinWindow,
  issueTransition,
  nextAttemptAfterFailure,
  normalizeIssueState,
  normalizePullRequestState,
  occurrenceKey,
  participantExclusion,
  preferenceAllowsEvent,
  pullRequestStateAnomaly,
  pullRequestTransition,
  safeGithubUrl,
  snapshotArtifactTitle,
  taskParticipants
} from '../../src/modules/notifications/github-event.policy.js';
import {
  parseGithubEventNotificationArguments,
  runGithubEventNotifications
} from '../../scripts/dispatch-github-event-notifications.js';
import { createEnvironment } from '../../src/config/env.js';

const DAY = 86_400_000;
const MINUTE = 60_000;
const D1 = new Date('2026-10-20T09:00:00.000Z');
const D2 = new Date('2026-10-20T10:00:00.000Z');
const U = new Date('2026-10-20T11:00:00.000Z');
const NOW = new Date('2026-10-20T12:00:00.000Z');

function observe(name, value) {
  if (process.env.S203_OBS_OUT)
    appendFileSync(process.env.S203_OBS_OUT, `${JSON.stringify({ name, value })}\n`);
}

describe('S2-03 bateria — política: estados e transições (D2)', () => {
  it('EV-T-03 estados: caixa ignorada; valor que não é texto ou desconhecido vira nulo', () => {
    for (const [value, expected] of [
      ['open', 'OPEN'],
      ['OPEN', 'OPEN'],
      ['Open', 'OPEN'],
      ['closed', 'CLOSED'],
      ['cLoSeD', 'CLOSED'],
      ['triaged', null],
      ['', null],
      [' open', null],
      [null, null],
      [undefined, null],
      [1, null],
      [true, null],
      [{}, null]
    ])
      expect(normalizeIssueState(value), JSON.stringify(value)).toBe(expected);
    for (const [pullRequest, expected] of [
      [{ state: 'closed', mergedAtGithub: D1 }, 'MERGED'],
      [{ state: 'CLOSED', mergedAtGithub: D1.toISOString() }, 'MERGED'],
      [{ state: 'closed', mergedAtGithub: null }, 'CLOSED'],
      [{ state: 'closed', mergedAtGithub: 'não é data' }, 'CLOSED'],
      [{ state: 'open', mergedAtGithub: null }, 'OPEN'],
      [{ state: 'draft', mergedAtGithub: D1 }, null],
      [null, null]
    ])
      expect(normalizePullRequestState(pullRequest), JSON.stringify(pullRequest)).toBe(expected);
  });

  it('EV-T-10 carga incoerente: merged_at preenchido com state open fica OPEN, como diz a tabela de estados', () => {
    expect(normalizePullRequestState({ state: 'open', mergedAtGithub: D1 })).toBe('OPEN');
    expect(
      pullRequestTransition({ state: 'open' }, { state: 'open', mergedAtGithub: D1 })
    ).toBeNull();
  });

  it('EV-T-01 issue: as 30 combinações de anterior e recebido', () => {
    const previous = {
      semLinha: null,
      aberta: { state: 'open', closedAtGithub: null },
      fechadaComData: { state: 'closed', closedAtGithub: D1 },
      fechadaSemData: { state: 'closed', closedAtGithub: null },
      estranho: { state: 'triaged', closedAtGithub: null },
      nulo: { state: null, closedAtGithub: null }
    };
    const received = {
      aberta: { state: 'open', closedAtGithub: null, updatedAtGithub: U },
      fechadaMesmaData: { state: 'closed', closedAtGithub: D1, updatedAtGithub: U },
      fechadaDataNova: { state: 'closed', closedAtGithub: D2, updatedAtGithub: U },
      fechadaSemData: { state: 'closed', closedAtGithub: null, updatedAtGithub: U },
      estranho: { state: 'triaged', closedAtGithub: null, updatedAtGithub: U }
    };
    const expected = {
      'aberta|fechadaMesmaData': { type: 'ISSUE_CLOSED', occurredAt: D1 },
      'aberta|fechadaDataNova': { type: 'ISSUE_CLOSED', occurredAt: D2 },
      'aberta|fechadaSemData': { type: 'ISSUE_CLOSED', occurredAt: null },
      'fechadaComData|aberta': { type: 'ISSUE_REOPENED', occurredAt: U },
      'fechadaComData|fechadaDataNova': { type: 'ISSUE_CLOSED', occurredAt: D2 },
      'fechadaSemData|aberta': { type: 'ISSUE_REOPENED', occurredAt: U }
    };
    let combinations = 0;
    for (const [before, state] of Object.entries(previous))
      for (const [after, incoming] of Object.entries(received)) {
        combinations += 1;
        const label = `${before}|${after}`;
        expect(issueTransition(state, incoming), label).toEqual(expected[label] ?? null);
      }
    expect(combinations).toBe(30);
  });

  it('EV-T-01 datas como texto ISO e datas inválidas', () => {
    expect(
      issueTransition(
        { state: 'closed', closedAtGithub: D1.toISOString() },
        { state: 'closed', closedAtGithub: D2.toISOString() }
      )
    ).toEqual({ type: 'ISSUE_CLOSED', occurredAt: D2 });
    expect(
      issueTransition(
        { state: 'closed', closedAtGithub: D1.toISOString() },
        { state: 'closed', closedAtGithub: D1.toISOString() }
      )
    ).toBeNull();
    expect(
      issueTransition(
        { state: 'closed', closedAtGithub: D1 },
        { state: 'closed', closedAtGithub: 'não é data' }
      )
    ).toBeNull();
    expect(
      issueTransition({ state: 'open' }, { state: 'closed', closedAtGithub: 'não é data' })
    ).toEqual({ type: 'ISSUE_CLOSED', occurredAt: null });
  });

  it('EV-T-02 PR: as 36 combinações de anterior e recebido, e a anomalia só depois do merge', () => {
    const C1 = new Date('2026-10-20T08:00:00.000Z');
    const C2 = new Date('2026-10-20T09:30:00.000Z');
    const M1 = new Date('2026-10-20T07:00:00.000Z');
    const M2 = new Date('2026-10-20T10:30:00.000Z');
    const previous = {
      semLinha: null,
      aberta: { state: 'open' },
      fechadaComData: { state: 'closed', closedAtGithub: C1 },
      fechadaSemData: { state: 'closed' },
      mesclada: { state: 'closed', closedAtGithub: M1, mergedAtGithub: M1 },
      estranho: { state: 'draft' }
    };
    const received = {
      aberta: { state: 'open' },
      fechadaMesmaData: { state: 'closed', closedAtGithub: C1 },
      fechadaDataNova: { state: 'closed', closedAtGithub: C2 },
      fechadaSemData: { state: 'closed' },
      mesclada: { state: 'closed', closedAtGithub: M2, mergedAtGithub: M2 },
      estranho: { state: 'draft' }
    };
    const expected = {
      'aberta|fechadaMesmaData': { type: 'PULL_REQUEST_CLOSED', occurredAt: C1 },
      'aberta|fechadaDataNova': { type: 'PULL_REQUEST_CLOSED', occurredAt: C2 },
      'aberta|fechadaSemData': { type: 'PULL_REQUEST_CLOSED', occurredAt: null },
      'aberta|mesclada': { type: 'PULL_REQUEST_MERGED', occurredAt: M2 },
      'fechadaComData|fechadaDataNova': { type: 'PULL_REQUEST_CLOSED', occurredAt: C2 },
      'fechadaComData|mesclada': { type: 'PULL_REQUEST_MERGED', occurredAt: M2 },
      'fechadaSemData|mesclada': { type: 'PULL_REQUEST_MERGED', occurredAt: M2 }
    };
    const anomalies = new Set([
      'mesclada|aberta',
      'mesclada|fechadaMesmaData',
      'mesclada|fechadaDataNova',
      'mesclada|fechadaSemData'
    ]);
    let combinations = 0;
    for (const [before, state] of Object.entries(previous))
      for (const [after, incoming] of Object.entries(received)) {
        combinations += 1;
        const label = `${before}|${after}`;
        expect(pullRequestTransition(state, incoming), label).toEqual(expected[label] ?? null);
        expect(pullRequestStateAnomaly(state, incoming), label).toBe(anomalies.has(label));
      }
    expect(combinations).toBe(36);
  });
});

describe('S2-03 bateria — política: chaves, janela, participantes e exclusões (D5–D8)', () => {
  it('chave da ocorrência e da notificação cabem em 96 caracteres com os maiores ids', () => {
    const longestType = 'PULL_REQUEST_MERGED';
    const key = occurrenceKey({
      type: longestType,
      artifactId: 2147483647,
      occurredAt: null,
      detectedAt: new Date('9999-12-31T23:59:59.999Z')
    });
    expect(key).toBe(`${longestType}:2147483647:9999-12-31T23:59:59.999Z`);
    expect(key.length).toBeLessThanOrEqual(96);
    const dedupe = githubEventDedupeKey('PULL_REQUEST_EVENT', 2147483647, 2147483647);
    expect(dedupe).toBe('PULL_REQUEST_EVENT:event:2147483647:task:2147483647');
    expect(dedupe.length).toBeLessThanOrEqual(96);
    expect(
      occurrenceKey({ type: 'ISSUE_CLOSED', artifactId: 7, occurredAt: D1, detectedAt: NOW })
    ).toBe(`ISSUE_CLOSED:7:${D1.toISOString()}`);
  });

  it('EV-E-07 janela: limite exato e 1 ms a mais para cada janela de 1 a 90 dias', () => {
    for (let days = 1; days <= 90; days += 1) {
      const edge = new Date(NOW.getTime() - days * DAY);
      expect(isWithinWindow({ occurredAt: edge, detectedAt: NOW }, days), `${days} dentro`).toBe(
        true
      );
      expect(
        isWithinWindow({ occurredAt: new Date(edge.getTime() - 1), detectedAt: NOW }, days),
        `${days} fora`
      ).toBe(false);
    }
    expect(isWithinWindow({ occurredAt: null, detectedAt: NOW }, 7)).toBe(true);
    expect(isWithinWindow({ occurredAt: new Date(NOW.getTime() + DAY), detectedAt: NOW }, 7)).toBe(
      true
    );
  });

  it('participantes: união sem repetição, ordenada, ignorando o que não é id inteiro', () => {
    expect(
      taskParticipants({
        responsibleUserId: 5,
        commentAuthorIds: [3, 5, 3, '7', null, Number.NaN, 1.5],
        effortUserIds: [9, 3, undefined]
      })
    ).toEqual([3, 5, 9]);
    expect(taskParticipants({ responsibleUserId: null })).toEqual([]);
  });

  it('EV-E-02 exclusões por par: as 32 combinações seguem a ordem documentada', () => {
    const order = [
      ['projectDeleted', true, 'PROJECT_DELETED'],
      ['withinWindow', false, 'OUTSIDE_WINDOW'],
      ['accountActive', false, 'INACTIVE_ACCOUNT'],
      ['membershipActive', false, 'INACTIVE_MEMBER'],
      ['preferenceAllowed', false, 'PREFERENCE_OFF']
    ];
    let combinations = 0;
    for (let mask = 0; mask < 32; mask += 1) {
      combinations += 1;
      const condition = Object.fromEntries(
        order.map(([field, failing, _reason], index) => [
          field,
          mask & (1 << index) ? failing : !failing
        ])
      );
      const expected = order.find(([field, failing]) => condition[field] === failing)?.[2] ?? null;
      const reason =
        eventExclusion({
          projectDeleted: condition.projectDeleted,
          withinWindow: condition.withinWindow
        }) ??
        participantExclusion({
          accountActive: condition.accountActive,
          membershipActive: condition.membershipActive,
          preferenceAllowed: condition.preferenceAllowed
        });
      expect(reason, JSON.stringify(condition)).toBe(expected);
    }
    expect(combinations).toBe(32);
  });

  it('EV-E-05 preferência: sem linha liga; desligada não; enabledAt nulo, anterior e igual liga; posterior não', () => {
    for (const [label, preference, allowed] of [
      ['sem linha', undefined, true],
      ['desligada', { enabled: false, enabledAt: null }, false],
      ['desligada com data', { enabled: false, enabledAt: new Date(NOW.getTime() - DAY) }, false],
      ['ligada sem data', { enabled: true, enabledAt: null }, true],
      ['religada antes', { enabled: true, enabledAt: new Date(NOW.getTime() - 1) }, true],
      ['religada no instante', { enabled: true, enabledAt: NOW }, true],
      ['religada depois', { enabled: true, enabledAt: new Date(NOW.getTime() + 1) }, false]
    ])
      expect(preferenceAllowsEvent(preference, NOW), label).toBe(allowed);
  });

  it('EV-J-02 esperas: 1, 5, 30 e 120 minutos; a quinta tentativa desiste', () => {
    const waits = [0, 1, 2, 3, 4, 5, 6].map((attempts) => {
      const next = nextAttemptAfterFailure(attempts, NOW);
      return next ? (next.getTime() - NOW.getTime()) / MINUTE : null;
    });
    expect(waits).toEqual([1, 1, 5, 30, 120, null, null]);
  });

  it('EV-U-04 título: 256 pontos de código; registra o corte no meio de uma sequência com ZWJ', () => {
    const family = '👨‍👩‍👧';
    const title = `${'a'.repeat(254)}${family}`;
    const cut = snapshotArtifactTitle(title);
    expect(Array.from(cut)).toHaveLength(256);
    observe('EV-U-04 corte de ZWJ', {
      final: Array.from(cut)
        .slice(-2)
        .map((char) => char.codePointAt(0).toString(16)),
      sequenciaInteira: Array.from(family).length
    });
    expect(snapshotArtifactTitle(null)).toBe('');
    expect(snapshotArtifactTitle(undefined)).toBe('');
    expect(snapshotArtifactTitle(45)).toBe('45');
    expect(Array.from(snapshotArtifactTitle('😀'.repeat(300)))).toHaveLength(256);
  });

  it('EV-L-02 URL: só o prefixo https://github.com/ e até 512 caracteres', () => {
    const prefix = 'https://github.com/';
    const exact = `${prefix}${'a'.repeat(ARTIFACT_URL_MAX_LENGTH - prefix.length)}`;
    for (const [value, accepted] of [
      [`${prefix}usuario/repositorio/issues/1`, true],
      [exact, true],
      [`${exact}a`, false],
      [prefix, true],
      ['https://github.com', false],
      ['http://github.com/usuario', false],
      ['https://github.com.evil.example/usuario', false],
      ['https://evil.example/https://github.com/', false],
      ['HTTPS://GITHUB.COM/usuario', false],
      [' https://github.com/usuario', false],
      ['javascript:alert(1)', false],
      [null, false],
      [42, false],
      [{ toString: () => `${prefix}x` }, false]
    ])
      expect(safeGithubUrl(value), String(value)).toBe(accepted ? value : null);
  });
});

describe('S2-03 bateria — script e configuração (D15)', () => {
  it('EV-J-04 argumentos: combinações válidas e inválidas', () => {
    for (const [args, expected] of [
      [[], { projectId: null, dryRun: true, confirmProduction: false, retryFailed: false }],
      [
        ['--apply'],
        { projectId: null, dryRun: false, confirmProduction: false, retryFailed: false }
      ],
      [
        ['--dry-run'],
        { projectId: null, dryRun: true, confirmProduction: false, retryFailed: false }
      ],
      [
        ['--retry-failed'],
        { projectId: null, dryRun: true, confirmProduction: false, retryFailed: true }
      ],
      [
        ['--apply', '--retry-failed', '--confirm-production', '--project-id=2147483647'],
        { projectId: 2147483647, dryRun: false, confirmProduction: true, retryFailed: true }
      ]
    ])
      expect(parseGithubEventNotificationArguments(args), args.join(' ')).toEqual(expected);
    for (const args of [
      ['--apply', '--dry-run'],
      ['--project-id=0'],
      ['--project-id=-1'],
      ['--project-id=abc'],
      ['--project-id='],
      ['--project-id=2147483648'],
      ['--project-id=1.5'],
      ['--project-id=1', '--project-id=2'],
      ['--projeto=1'],
      ['--APPLY'],
      ['apply']
    ])
      expect(() => parseGithubEventNotificationArguments(args), args.join(' ')).toThrowError(
        /Uso:/
      );
  });

  it('EV-J-06 códigos de saída e precedência', async () => {
    const LOCAL = 'mysql://user:password@localhost:3306/traceflow';
    const PRODUCTION = 'mysql://user:password@db.traceflow.example:3306/traceflow_prod';
    const fake = (report = {}, activeProject = true) => ({
      isActiveProject: vi.fn(async () => activeProject),
      runJob: vi.fn(async () => ({ failed: 0, retryScheduled: 0, ...report }))
    });
    const run = (args, service, databaseUrl = LOCAL) =>
      runGithubEventNotifications({
        args,
        service,
        databaseUrl,
        write: () => {},
        writeError: () => {}
      });

    expect(await run([], fake())).toBe(0);
    expect(await run(['--apply'], fake({ failed: 1 }))).toBe(1);
    expect(await run(['--apply'], fake({ retryScheduled: 1 }))).toBe(1);
    expect(await run(['--apply', '--project-id=5'], fake({}, false))).toBe(2);
    expect(await run(['--apply', '--project-id=5'], fake({}, false), PRODUCTION)).toBe(1);
    expect(await run(['--project-id=5'], fake({}, false), PRODUCTION)).toBe(2);
    expect(await run(['--apply', '--confirm-production'], fake(), PRODUCTION)).toBe(0);
    expect(await run(['--nada'], fake())).toBe(1);
    const failing = fake();
    failing.runJob.mockRejectedValueOnce(
      Object.assign(new Error('detalhe interno'), { code: 'P1001' })
    );
    expect(await run(['--apply'], failing)).toBe(1);
  });

  it('EV-E-07 configuração da janela: 1 a 90, padrão 7; registra vazio e espaços', () => {
    const base = {
      NODE_ENV: 'development',
      PORT: '3001',
      DATABASE_URL: 'mysql://user:password@localhost:3306/traceflow',
      FRONTEND_URL: 'http://localhost:5173'
    };
    const days = (value) =>
      createEnvironment(
        value === undefined ? base : { ...base, GITHUB_EVENT_NOTIFICATIONS_LOOKBACK_DAYS: value }
      ).githubEventNotificationsLookbackDays;
    expect(days(undefined)).toBe(7);
    expect(days('1')).toBe(1);
    expect(days('90')).toBe(90);
    for (const value of ['0', '91', '7d', '-7', '7.5', 'sete'])
      expect(() => days(value), value).toThrowError(/GITHUB_EVENT_NOTIFICATIONS_LOOKBACK_DAYS/);
    const lenient = {};
    for (const value of ['', ' 7 ', '07', '+7'])
      try {
        lenient[JSON.stringify(value)] = days(value);
      } catch (error) {
        lenient[JSON.stringify(value)] = `erro: ${String(error.message).slice(0, 80)}`;
      }
    observe('EV-E-07 configuração tolerante', lenient);
  });
});
