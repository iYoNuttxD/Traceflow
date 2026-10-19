import { appendFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  ARTIFACT_URL_MAX_LENGTH,
  GITHUB_EVENT_EXCLUSIONS,
  githubEventDedupeKey,
  lifecycleOccurrenceKey,
  linkedOccurrenceKey,
  nextAttemptAfterFailure,
  normalizeIssueState,
  normalizePullRequestState,
  participantExclusion,
  preferenceAllowsEvent,
  safeGithubUrl,
  snapshotArtifactTitle,
  taskParticipants
} from '../../src/modules/notifications/github-event.policy.js';
import {
  parseGithubEventNotificationArguments,
  runGithubEventNotifications
} from '../../src/jobs/cli/dispatch-github-event-notifications.js';
import { createEnvironment } from '../../src/config/env.js';

const DAY = 86_400_000;
const MINUTE = 60_000;
const D1 = new Date('2026-10-20T09:00:00.000Z');
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
  });
});

describe('S2-03 bateria — política: chaves, janela, participantes e exclusões (D5–D8)', () => {
  it('chave da ocorrência e da notificação cabem em 96 caracteres com os maiores ids', () => {
    const key = lifecycleOccurrenceKey('18446744073709551615');
    expect(key).toBe('gh:18446744073709551615');
    expect(key.length).toBeLessThanOrEqual(96);
    const linked = linkedOccurrenceKey(2147483647, 2147483647);
    expect(linked).toBe('linked:2147483647:task:2147483647');
    expect(linked.length).toBeLessThanOrEqual(96);
    const dedupe = githubEventDedupeKey('PULL_REQUEST_EVENT', 2147483647, 2147483647);
    expect(dedupe).toBe('PULL_REQUEST_EVENT:event:2147483647:task:2147483647');
    expect(dedupe.length).toBeLessThanOrEqual(96);
  });

  it('EV-E-07 sem janela: nenhuma exclusão depende da idade do evento (TF-REV-002)', () => {
    expect(GITHUB_EVENT_EXCLUSIONS).not.toContain('OUTSIDE_WINDOW');
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

  it('EV-E-02 exclusões por par: as 16 combinações seguem a ordem documentada; nem janela nem projeto excluído (S203-A02, TF-REV-002)', () => {
    const order = [
      ['accountActive', false, 'INACTIVE_ACCOUNT'],
      ['membershipActive', false, 'INACTIVE_MEMBER'],
      ['preferenceAllowed', false, 'PREFERENCE_OFF'],
      ['projectDeleted', true, null]
    ];
    let combinations = 0;
    for (let mask = 0; mask < 16; mask += 1) {
      combinations += 1;
      const condition = Object.fromEntries(
        order.map(([field, failing, _reason], index) => [
          field,
          mask & (1 << index) ? failing : !failing
        ])
      );
      const expected =
        order.find(([field, failing, reason]) => reason && condition[field] === failing)?.[2] ??
        null;
      const reason = participantExclusion({
        accountActive: condition.accountActive,
        membershipActive: condition.membershipActive,
        preferenceAllowed: condition.preferenceAllowed
      });
      expect(reason, JSON.stringify(condition)).toBe(expected);
    }
    expect(combinations).toBe(16);
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
        writeError: () => {},
        lease: async (_name, work) => ({
          acquired: true,
          result: await work(new AbortController().signal)
        })
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

  it('EV-E-07 configuração: a variável da janela saiu e é ignorada (TF-REV-002)', () => {
    const base = {
      NODE_ENV: 'development',
      PORT: '3001',
      DATABASE_URL: 'mysql://user:password@localhost:3306/traceflow',
      FRONTEND_URL: 'http://localhost:5173'
    };
    for (const value of [undefined, '', '0', '91', 'sete'])
      expect(
        createEnvironment(
          value === undefined ? base : { ...base, GITHUB_EVENT_NOTIFICATIONS_LOOKBACK_DAYS: value }
        ),
        String(value)
      ).not.toHaveProperty('githubEventNotificationsLookbackDays');
  });
});
