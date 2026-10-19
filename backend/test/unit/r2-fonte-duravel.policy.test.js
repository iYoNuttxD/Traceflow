import { describe, expect, it } from 'vitest';
import {
  completeThroughOf,
  issueEventTypeOf,
  lifecycleOccurrenceKey,
  linkedTasksAt,
  mergeClosingsOf,
  openedOccurrenceKey,
  pullRequestEventTypeOf
} from '../../src/modules/notifications/github-event.policy.js';
import { githubCoverageGaps } from '../../src/modules/notifications/notification-metrics.policy.js';
import {
  mapGithubIssueLifecycleEvent,
  mapGithubRepositoryEvent
} from '../../src/modules/github/github.mapper.js';

const at = (value) => new Date(value);

describe('ADR-023 — regras da fonte durável', () => {
  it('converte os eventos de issue e ignora os demais', () => {
    expect(issueEventTypeOf('CLOSED')).toBe('ISSUE_CLOSED');
    expect(issueEventTypeOf('REOPENED')).toBe('ISSUE_REOPENED');
    expect(issueEventTypeOf('MERGED')).toBeNull();
  });

  it('absorve o closed a até 5 s do merged da mesma PR, e só ele', () => {
    const merged = {
      eventType: 'MERGED',
      occurredAt: at('2026-10-17T12:00:00Z'),
      providerEventId: '1'
    };
    const closed = (iso, providerEventId) => ({
      eventType: 'CLOSED',
      occurredAt: at(iso),
      providerEventId
    });
    const typeOf = (closing, history) =>
      pullRequestEventTypeOf(closing, mergeClosingsOf([...history, closing]));

    expect(pullRequestEventTypeOf(merged)).toBe('PULL_REQUEST_MERGED');
    expect(typeOf(closed('2026-10-17T12:00:05.000Z', '2'), [merged])).toBeNull();
    expect(typeOf(closed('2026-10-17T11:59:55.000Z', '3'), [merged])).toBeNull();
    expect(typeOf(closed('2026-10-17T12:00:05.001Z', '4'), [merged])).toBe('PULL_REQUEST_CLOSED');
    expect(typeOf(closed('2026-10-17T12:00:00.000Z', '5'), [])).toBe('PULL_REQUEST_CLOSED');
    expect(
      pullRequestEventTypeOf({
        eventType: 'REOPENED',
        occurredAt: at('2026-10-17T12:00:00Z'),
        providerEventId: '6'
      })
    ).toBeNull();
  });

  it('vale o período que contém o instante do evento, com a tarefa excluída contando sem alvo', () => {
    const periods = [
      { taskId: 1, linkedAt: at('2026-10-10T00:00:00Z'), unlinkedAt: at('2026-10-12T00:00:00Z') },
      { taskId: 2, linkedAt: at('2026-10-11T00:00:00Z'), unlinkedAt: null },
      { taskId: null, linkedAt: at('2026-10-09T00:00:00Z'), unlinkedAt: at('2026-10-13T00:00:00Z') }
    ];

    expect(linkedTasksAt(periods, at('2026-10-09T12:00:00Z'))).toEqual({ count: 1, taskIds: [] });
    expect(linkedTasksAt(periods, at('2026-10-11T12:00:00Z'))).toEqual({
      count: 3,
      taskIds: [1, 2]
    });
    expect(linkedTasksAt(periods, at('2026-10-12T00:00:00Z'))).toEqual({ count: 2, taskIds: [2] });
    expect(linkedTasksAt(periods, at('2026-10-08T00:00:00Z'))).toEqual({ count: 0, taskIds: [] });
    expect(
      linkedTasksAt(
        [{ taskId: null, linkedAt: at('2026-10-01T00:00:00Z'), unlinkedAt: null }],
        at('2026-10-11T00:00:00Z')
      )
    ).toEqual({ count: 0, taskIds: [] });
  });

  it('chaves estáveis e margem de 5 minutos na cobertura', () => {
    expect(lifecycleOccurrenceKey('123')).toBe('gh:123');
    expect(openedOccurrenceKey(7, 9)).toBe('opened:7:task:9');
    expect(completeThroughOf(at('2026-10-17T12:00:00.000Z'))).toEqual(
      at('2026-10-17T11:55:00.000Z')
    );
  });

  it('lacunas por projeto: comparação de estado antes do corte da integração antiga e aquisição depois da última leitura', () => {
    const period = { start: at('2026-10-10T03:00:00Z'), end: at('2026-10-20T03:00:00Z') };
    const gaps = githubCoverageGaps(
      [
        {
          projectId: 1,
          coverageFrom: at('2026-10-17T12:00:00Z'),
          comparedBefore: true,
          completeThrough: at('2026-10-21T00:00:00Z')
        },
        {
          projectId: 2,
          coverageFrom: at('2026-10-01T00:00:00Z'),
          comparedBefore: false,
          completeThrough: at('2026-10-18T00:00:00Z')
        },
        {
          projectId: 3,
          coverageFrom: at('2026-10-25T00:00:00Z'),
          comparedBefore: false,
          completeThrough: null
        },
        {
          projectId: 4,
          coverageFrom: at('2026-10-01T00:00:00Z'),
          comparedBefore: false,
          completeThrough: at('2026-10-30T00:00:00Z')
        }
      ],
      period
    );

    expect(gaps).toEqual([
      {
        motivo: 'FONTE_POR_COMPARACAO_DE_ESTADO',
        projeto: 1,
        coberturaDesde: '2026-10-17T12:00:00.000Z'
      },
      { motivo: 'LACUNA_DE_AQUISICAO', projeto: 2, completoAte: '2026-10-18T00:00:00.000Z' }
    ]);
  });

  it('o mapper separa issue e PR, e recusa evento sem identidade', () => {
    const base = { id: 55, event: 'closed', created_at: '2026-10-17T12:00:00Z' };
    expect(mapGithubRepositoryEvent({ ...base, issue: { number: 3 } })).toEqual({
      kind: 'ISSUE',
      providerEventId: '55',
      number: 3,
      eventType: 'CLOSED',
      occurredAt: at('2026-10-17T12:00:00Z')
    });
    expect(
      mapGithubRepositoryEvent({ ...base, event: 'merged', issue: { number: 4, pull_request: {} } })
    ).toMatchObject({ kind: 'PULL_REQUEST', eventType: 'MERGED' });
    expect(mapGithubRepositoryEvent({ ...base, event: 'merged', issue: { number: 3 } })).toBeNull();
    expect(
      mapGithubRepositoryEvent({ ...base, event: 'labeled', issue: { number: 3 } })
    ).toBeNull();
    expect(() =>
      mapGithubIssueLifecycleEvent({ ...base, id: null, issue: { number: 3 } })
    ).toThrow();
  });
});
