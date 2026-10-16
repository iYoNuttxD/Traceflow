import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_TITLE_MAX_LENGTH,
  CLAIM_LEASE_MS,
  DISPATCH_BATCH_SIZE,
  GITHUB_EVENT_EXCLUSIONS,
  GITHUB_EVENT_TYPES,
  ISSUE_EVENT,
  JOB_MAX_BATCHES,
  MAX_DISPATCH_ATTEMPTS,
  PULL_REQUEST_EVENT,
  RETRY_DELAYS_MINUTES,
  artifactKindOf,
  githubEventDedupeKey,
  issueTransition,
  nextAttemptAfterFailure,
  normalizeIssueState,
  normalizePullRequestState,
  notificationTypeOf,
  occurrenceKey,
  participantExclusion,
  preferenceAllowsEvent,
  pullRequestStateAnomaly,
  pullRequestTransition,
  safeGithubUrl,
  snapshotArtifactTitle,
  taskParticipants
} from '../../src/modules/notifications/github-event.policy.js';

const at = (iso) => new Date(iso);
const CLOSED_AT = at('2026-10-12T13:00:00.000Z');
const LATER_CLOSED_AT = at('2026-10-12T16:00:00.000Z');
const UPDATED_AT = at('2026-10-12T15:00:00.000Z');
const MERGED_AT = at('2026-10-12T14:00:00.000Z');

const issue = (state, overrides = {}) => ({
  state,
  closedAtGithub: state === 'closed' ? CLOSED_AT : null,
  updatedAtGithub: UPDATED_AT,
  ...overrides
});
const pullRequest = (state, overrides = {}) => ({
  state,
  closedAtGithub: state === 'closed' ? CLOSED_AT : null,
  mergedAtGithub: null,
  updatedAtGithub: UPDATED_AT,
  ...overrides
});
const merged = (overrides = {}) =>
  pullRequest('closed', { mergedAtGithub: MERGED_AT, closedAtGithub: MERGED_AT, ...overrides });

describe('S2-03 P1: normalização de estado (D2)', () => {
  it('issue: open e closed sem diferença de caixa; outro valor ou nulo é desconhecido', () => {
    expect(normalizeIssueState('open')).toBe('OPEN');
    expect(normalizeIssueState('OPEN')).toBe('OPEN');
    expect(normalizeIssueState('closed')).toBe('CLOSED');
    expect(normalizeIssueState('Closed')).toBe('CLOSED');
    for (const value of [null, undefined, '', 'merged', 'reopened', 1, true, { state: 'open' }])
      expect(normalizeIssueState(value)).toBeNull();
  });

  it('PR: closed com merge é MERGED, sem merge é CLOSED; open continua OPEN', () => {
    expect(normalizePullRequestState(pullRequest('open'))).toBe('OPEN');
    expect(normalizePullRequestState(pullRequest('closed'))).toBe('CLOSED');
    expect(normalizePullRequestState(merged())).toBe('MERGED');
    expect(normalizePullRequestState(pullRequest('CLOSED', { mergedAtGithub: MERGED_AT }))).toBe(
      'MERGED'
    );
    expect(normalizePullRequestState(pullRequest('open', { mergedAtGithub: MERGED_AT }))).toBe(
      'OPEN'
    );
    expect(normalizePullRequestState(pullRequest(null))).toBeNull();
    expect(normalizePullRequestState(pullRequest('draft'))).toBeNull();
  });
});

describe('S2-03 P2: tabela de transições (D2)', () => {
  it.each([
    ['open → closed', issue('open'), issue('closed'), 'ISSUE_CLOSED'],
    ['closed → open', issue('closed'), issue('open'), 'ISSUE_REOPENED'],
    [
      'closed → closed com outra data',
      issue('closed'),
      issue('closed', { closedAtGithub: LATER_CLOSED_AT }),
      'ISSUE_CLOSED'
    ],
    ['closed → closed com a mesma data', issue('closed'), issue('closed'), null],
    [
      'closed sem data anterior → closed',
      issue('closed', { closedAtGithub: null }),
      issue('closed'),
      null
    ],
    [
      'closed → closed sem data recebida',
      issue('closed'),
      issue('closed', { closedAtGithub: null }),
      null
    ],
    ['open → open', issue('open'), issue('open'), null],
    ['estado anterior desconhecido', issue(null), issue('closed'), null],
    ['estado recebido desconhecido', issue('open'), issue('unknown'), null],
    ['primeira observação', null, issue('closed'), null],
    [
      'mudança só de título, corpo, rótulo ou autor',
      issue('open', { title: 'A' }),
      issue('open', { title: 'B', description: 'novo', labels: ['x'], authorUsername: 'y' }),
      null
    ]
  ])('issue %s', (_name, previous, incoming, expected) => {
    expect(issueTransition(previous, incoming)?.type ?? null).toBe(expected);
  });

  it.each([
    ['open → merged', pullRequest('open'), merged(), 'PULL_REQUEST_MERGED'],
    ['open → closed sem merge', pullRequest('open'), pullRequest('closed'), 'PULL_REQUEST_CLOSED'],
    ['closed → merged', pullRequest('closed'), merged(), 'PULL_REQUEST_MERGED'],
    [
      'closed → closed com outra data',
      pullRequest('closed'),
      pullRequest('closed', { closedAtGithub: LATER_CLOSED_AT }),
      'PULL_REQUEST_CLOSED'
    ],
    ['closed → closed com a mesma data', pullRequest('closed'), pullRequest('closed'), null],
    ['closed → open (reabertura de PR)', pullRequest('closed'), pullRequest('open'), null],
    ['merged → open', merged(), pullRequest('open'), null],
    ['merged → closed', merged(), pullRequest('closed'), null],
    ['merged → merged', merged(), merged(), null],
    ['open → open', pullRequest('open'), pullRequest('open'), null],
    ['estado anterior desconhecido', pullRequest(null), merged(), null],
    ['primeira observação', null, merged(), null],
    [
      'mudança só de título ou branch',
      pullRequest('open', { title: 'A' }),
      pullRequest('open', { title: 'B', sourceBranch: 'feature/x' }),
      null
    ]
  ])('PR %s', (_name, previous, incoming, expected) => {
    expect(pullRequestTransition(previous, incoming)?.type ?? null).toBe(expected);
  });

  it('merge seguido de outro estado é anomalia; as demais combinações não são', () => {
    expect(pullRequestStateAnomaly(merged(), pullRequest('open'))).toBe(true);
    expect(pullRequestStateAnomaly(merged(), pullRequest('closed'))).toBe(true);
    expect(pullRequestStateAnomaly(merged(), merged())).toBe(false);
    expect(pullRequestStateAnomaly(pullRequest('closed'), pullRequest('open'))).toBe(false);
    expect(pullRequestStateAnomaly(null, merged())).toBe(false);
  });

  it('os quatro eventos e os dois tipos de notificação ficam fixos', () => {
    expect(GITHUB_EVENT_TYPES).toEqual([
      'ISSUE_CLOSED',
      'ISSUE_REOPENED',
      'PULL_REQUEST_MERGED',
      'PULL_REQUEST_CLOSED'
    ]);
    expect(notificationTypeOf('ISSUE_CLOSED')).toBe(ISSUE_EVENT);
    expect(notificationTypeOf('ISSUE_REOPENED')).toBe(ISSUE_EVENT);
    expect(notificationTypeOf('PULL_REQUEST_MERGED')).toBe(PULL_REQUEST_EVENT);
    expect(notificationTypeOf('PULL_REQUEST_CLOSED')).toBe(PULL_REQUEST_EVENT);
    expect(notificationTypeOf('ISSUE_OPENED')).toBeNull();
    expect(notificationTypeOf('__proto__')).toBeNull();
    expect(artifactKindOf(ISSUE_EVENT)).toBe('ISSUE');
    expect(artifactKindOf(PULL_REQUEST_EVENT)).toBe('PULL_REQUEST');
    expect(artifactKindOf('TASK_OVERDUE')).toBeNull();
  });
});

describe('S2-03 P3: instante da ocorrência (D2)', () => {
  it('fechamento usa closedAtGithub, reabertura usa updatedAtGithub e merge usa mergedAtGithub', () => {
    expect(issueTransition(issue('open'), issue('closed')).occurredAt).toEqual(CLOSED_AT);
    expect(issueTransition(issue('closed'), issue('open')).occurredAt).toEqual(UPDATED_AT);
    expect(
      issueTransition(issue('closed'), issue('closed', { closedAtGithub: LATER_CLOSED_AT }))
        .occurredAt
    ).toEqual(LATER_CLOSED_AT);
    expect(pullRequestTransition(pullRequest('open'), merged()).occurredAt).toEqual(MERGED_AT);
    expect(pullRequestTransition(pullRequest('open'), pullRequest('closed')).occurredAt).toEqual(
      CLOSED_AT
    );
  });

  it('sem data do GitHub, a ocorrência fica nula e a chave usa a detecção', () => {
    const transition = issueTransition(issue('open'), issue('closed', { closedAtGithub: null }));
    expect(transition).toEqual({ type: 'ISSUE_CLOSED', occurredAt: null });
    const detectedAt = at('2026-10-20T12:00:00.000Z');
    expect(occurrenceKey({ ...transition, artifactId: 7, detectedAt })).toBe(
      'ISSUE_CLOSED:7:2026-10-20T12:00:00.000Z'
    );
  });
});

describe('S2-03 P4: chave da ocorrência (D5)', () => {
  it('é determinística, separa os eventos e cabe em 96 caracteres', () => {
    const base = {
      type: 'PULL_REQUEST_MERGED',
      artifactId: 2147483647,
      occurredAt: MERGED_AT,
      detectedAt: at('2026-10-20T12:00:00.000Z')
    };
    const key = occurrenceKey(base);
    expect(key).toBe('PULL_REQUEST_MERGED:2147483647:2026-10-12T14:00:00.000Z');
    expect(key.length).toBeLessThanOrEqual(96);
    expect(occurrenceKey({ ...base })).toBe(key);
    expect(occurrenceKey({ ...base, type: 'PULL_REQUEST_CLOSED' })).not.toBe(key);
    expect(occurrenceKey({ ...base, artifactId: 1 })).not.toBe(key);
    expect(occurrenceKey({ ...base, occurredAt: LATER_CLOSED_AT })).not.toBe(key);
  });

  it('a chave da notificação junta tipo, evento e tarefa', () => {
    expect(githubEventDedupeKey(ISSUE_EVENT, 12, 7)).toBe('ISSUE_EVENT:event:12:task:7');
    expect(
      githubEventDedupeKey(PULL_REQUEST_EVENT, 2147483647, 2147483647).length
    ).toBeLessThanOrEqual(96);
  });
});

describe('S2-03 P5: sem janela entre a ocorrência e a detecção (D8, TF-REV-002)', () => {
  it('nenhuma exclusão depende da idade do evento', () => {
    expect(GITHUB_EVENT_EXCLUSIONS).not.toContain('OUTSIDE_WINDOW');
  });
});

describe('S2-03 P6: participantes da tarefa (D6)', () => {
  it('une responsável, autores de comentário e quem registrou esforço, sem repetir', () => {
    expect(
      taskParticipants({
        responsibleUserId: 5,
        commentAuthorIds: [9, 5, 9],
        effortUserIds: [3, 9]
      })
    ).toEqual([3, 5, 9]);
  });

  it('sem responsável e sem participação, a lista é vazia; valores inválidos são ignorados', () => {
    expect(taskParticipants({ responsibleUserId: null })).toEqual([]);
    expect(
      taskParticipants({
        responsibleUserId: undefined,
        commentAuthorIds: [null, '4', 2.5],
        effortUserIds: [undefined, 6]
      })
    ).toEqual([6]);
  });
});

describe('S2-03 P7: exclusões na ordem (D6, D8)', () => {
  it('conta, membership e preferência, nessa ordem', () => {
    const all = { accountActive: true, membershipActive: true, preferenceAllowed: true };
    expect(participantExclusion(all)).toBeNull();
    expect(
      participantExclusion({
        accountActive: false,
        membershipActive: false,
        preferenceAllowed: false
      })
    ).toBe('INACTIVE_ACCOUNT');
    expect(
      participantExclusion({ ...all, membershipActive: false, preferenceAllowed: false })
    ).toBe('INACTIVE_MEMBER');
    expect(participantExclusion({ ...all, preferenceAllowed: false })).toBe('PREFERENCE_OFF');
  });

  it('preferência: sem linha liga; desligada não; religada depois da detecção não', () => {
    const detectedAt = at('2026-10-20T12:00:00.000Z');
    expect(preferenceAllowsEvent(undefined, detectedAt)).toBe(true);
    expect(preferenceAllowsEvent({ enabled: false, enabledAt: null }, detectedAt)).toBe(false);
    expect(preferenceAllowsEvent({ enabled: true, enabledAt: null }, detectedAt)).toBe(true);
    expect(preferenceAllowsEvent({ enabled: true, enabledAt: detectedAt }, detectedAt)).toBe(true);
    expect(
      preferenceAllowsEvent(
        { enabled: true, enabledAt: at('2026-10-20T12:00:00.001Z') },
        detectedAt
      )
    ).toBe(false);
  });

  it('os cinco motivos ficam fixos e na ordem da regra; o evento não tem exclusão própria (S203-A02, TF-REV-002)', () => {
    expect(GITHUB_EVENT_EXCLUSIONS).toEqual([
      'NO_TASK',
      'NO_PARTICIPANT',
      'INACTIVE_ACCOUNT',
      'INACTIVE_MEMBER',
      'PREFERENCE_OFF'
    ]);
  });
});

describe('S2-03 P8: retentativas limitadas (D9)', () => {
  it('espera 1, 5, 30 e 120 minutos e desiste na quinta tentativa', () => {
    const now = at('2026-10-20T12:00:00.000Z');
    expect(RETRY_DELAYS_MINUTES).toEqual([1, 5, 30, 120]);
    expect(MAX_DISPATCH_ATTEMPTS).toBe(5);
    expect(nextAttemptAfterFailure(1, now).toISOString()).toBe('2026-10-20T12:01:00.000Z');
    expect(nextAttemptAfterFailure(2, now).toISOString()).toBe('2026-10-20T12:05:00.000Z');
    expect(nextAttemptAfterFailure(3, now).toISOString()).toBe('2026-10-20T12:30:00.000Z');
    expect(nextAttemptAfterFailure(4, now).toISOString()).toBe('2026-10-20T14:00:00.000Z');
    expect(nextAttemptAfterFailure(5, now)).toBeNull();
    expect(nextAttemptAfterFailure(6, now)).toBeNull();
  });

  it('a reserva dura 2 minutos e o lote é de 100, até 10 lotes por execução do job', () => {
    expect(CLAIM_LEASE_MS).toBe(120_000);
    expect(DISPATCH_BATCH_SIZE).toBe(100);
    expect(JOB_MAX_BATCHES).toBe(10);
  });
});

describe('S2-03 P9: snapshot do artefato (D10, C6)', () => {
  it('título com até 256 pontos de código, sem cortar emoji ao meio', () => {
    expect(ARTIFACT_TITLE_MAX_LENGTH).toBe(256);
    const title = '🚀'.repeat(300);
    const snapshot = snapshotArtifactTitle(title);
    expect(Array.from(snapshot)).toHaveLength(256);
    expect(snapshot).toBe('🚀'.repeat(256));
    expect(snapshotArtifactTitle(null)).toBe('');
    expect(snapshotArtifactTitle('Curto')).toBe('Curto');
  });

  it('URL só com o prefixo https://github.com/ e até 512 caracteres', () => {
    expect(safeGithubUrl('https://github.com/o/r/issues/1')).toBe(
      'https://github.com/o/r/issues/1'
    );
    const longest = `https://github.com/${'a'.repeat(512 - 19)}`;
    expect(safeGithubUrl(longest)).toBe(longest);
    expect(safeGithubUrl(`${longest}a`)).toBeNull();
    for (const value of [
      'javascript:alert(1)',
      'http://github.com/o/r',
      'https://github.com.evil.example/o/r',
      'https://gist.github.com/o/r',
      ' https://github.com/o/r',
      null,
      undefined,
      42
    ])
      expect(safeGithubUrl(value)).toBeNull();
  });
});
